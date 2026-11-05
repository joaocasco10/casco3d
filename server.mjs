import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { SELLERS } from './public/sellers.js';
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const data = process.env.DATA_DIR || path.join(root, 'data');
await mkdir(data, { recursive: true });
let db;
try {
  db = JSON.parse(await readFile(path.join(data, 'db.json'), 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  db = { admins: [], orders: [], products: [] };
}
const sessions = new Map();
db.files ||= {};
db.energySettings ||= { watts: 100, tariff: 0.768, utility: 'Copel', city: 'Curitiba' };
if (db.energySettings.tariff == null) {
  db.energySettings = { ...db.energySettings, tariff: 0.768, utility: 'Copel', city: 'Curitiba' };
}
const uploads = path.join(data, 'uploads');
await mkdir(uploads, { recursive: true });
let queue = Promise.resolve();
function persist() {
  const snapshot = JSON.stringify(db);
  queue = queue.then(async () => {
    await writeFile(path.join(data, 'db.tmp'), snapshot);
    await rename(path.join(data, 'db.tmp'), path.join(data, 'db.json'));
  });
  return queue;
}
// Upgrade existing accounts once; the original owner retains master access.
if (db.admins.length && db.admins.every((admin) => !admin.role)) {
  db.admins.forEach((admin, index) => {
    admin.role = index === 0 ? 'superadmin' : 'admin';
  });
  await persist();
}
const hash = (p, s) => scryptSync(p, s, 64).toString('hex');
function reply(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}
async function body(req) {
  let s = '';
  for await (const c of req) {
    s += c;
    if (Buffer.byteLength(s) > 9 * 1024 * 1024) throw Error('Limite de 9 MB excedido');
  }
  return JSON.parse(s || '{}');
}
const attempts = new Map();
http
  .createServer(async (req, res) => {
    try {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'same-origin');
      const url = new URL(req.url, 'http://localhost');
      const token = (req.headers.cookie || '')
        .split('; ')
        .find((x) => x.startsWith('session='))
        ?.slice(8);
      const session = sessions.get(token);
      const user =
        session && session.until > Date.now() ? db.admins.find((x) => x.id === session.id) : null;
      if (url.pathname.startsWith('/api/')) {
        if (
          req.method !== 'GET' &&
          req.headers.origin &&
          req.headers.origin !== `http://${req.headers.host}` &&
          req.headers.origin !== `https://${req.headers.host}`
        )
          return reply(res, 403, { error: 'Origem não permitida' });
        if (url.pathname === '/api/session')
          return reply(res, 200, {
            user: user
              ? { name: user.name, email: user.email, role: user.role, recoveryEnabled: !!user.recoveryHash }
              : null,
            setup: !db.admins.length,
          });
        if (
          ['/api/setup', '/api/login', '/api/recover', '/api/recovery-code'].includes(url.pathname) &&
          req.method === 'POST'
        ) {
          const b = await body(req);
          const key = `${req.socket.remoteAddress}:${url.pathname}`;
          const a = attempts.get(key) || { count: 0, until: Date.now() + 900000 };
          if (a.until < Date.now()) {
            a.count = 0;
            a.until = Date.now() + 900000;
          }
          if (++a.count > 15)
            return reply(res, 429, { error: 'Muitas tentativas. Aguarde 15 minutos.' });
          attempts.set(key, a);
          if (url.pathname === '/api/recovery-code') {
            if (!user) return reply(res, 401, { error: 'Faça login para continuar' });
            if (
              typeof b.password !== 'string' ||
              !timingSafeEqual(
                Buffer.from(user.password, 'hex'),
                Buffer.from(hash(b.password, user.salt), 'hex'),
              )
            ) {
              return reply(res, 401, { error: 'Senha atual incorreta' });
            }
            const code = randomBytes(24).toString('hex');
            user.recoverySalt = randomBytes(16).toString('hex');
            user.recoveryHash = hash(code, user.recoverySalt);
            await persist();
            return reply(res, 200, { code: code.match(/.{1,8}/g).join('-') });
          }
          if (url.pathname === '/api/recover') {
            const account = db.admins.find(
              (x) => x.email === String(b.email).trim().toLowerCase(),
            );
            const code = String(b.code || '').replace(/[\s-]/g, '').toLowerCase();
            const candidate = hash(code, account?.recoverySalt || 'invalid-recovery');
            const expected = account?.recoveryHash || hash('invalid', 'invalid-recovery');
            if (
              !timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(expected, 'hex')) ||
              !account?.recoveryHash
            ) {
              return reply(res, 400, { error: 'E-mail ou código de recuperação inválido.' });
            }
            if (typeof b.password !== 'string' || b.password.length < 10 || b.password.length > 256)
              throw Error('A nova senha deve ter entre 10 e 256 caracteres.');
            if (b.password !== b.confirmPassword) throw Error('As senhas não coincidem.');
            account.salt = randomBytes(16).toString('hex');
            account.password = hash(b.password, account.salt);
            delete account.recoveryHash;
            delete account.recoverySalt;
            for (const [sessionToken, active] of sessions) {
              if (active.id === account.id) sessions.delete(sessionToken);
            }
            await persist();
            return reply(res, 200, { ok: true });
          }
          let admin;
          if (url.pathname === '/api/setup') {
            if (db.admins.length) return reply(res, 403, { error: 'Administrador já cadastrado' });
            if (!b.name?.trim() || !/^\S+@\S+\.\S+$/.test(b.email) || b.password?.length < 10)
              throw Error('Informe nome, e-mail válido e senha com 10 caracteres.');
            const salt = randomBytes(16).toString('hex');
            admin = {
              id: randomBytes(16).toString('hex'),
              name: b.name.trim(),
              role: 'superadmin',
              email: b.email.toLowerCase().trim(),
              salt,
              password: hash(b.password, salt),
            };
            db.admins.push(admin);
            await persist();
          } else {
            admin = db.admins.find((x) => x.email === String(b.email).toLowerCase().trim());
            if (
              !admin ||
              !timingSafeEqual(
                Buffer.from(admin.password, 'hex'),
                Buffer.from(hash(String(b.password), admin.salt), 'hex'),
              )
            )
              return reply(res, 401, { error: 'E-mail ou senha incorretos' });
          }
          const t = randomBytes(32).toString('hex');
          sessions.set(t, { id: admin.id, until: Date.now() + 28800000 });
          res.setHeader(
            'Set-Cookie',
            `session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`,
          );
          return reply(res, 200, { ok: true });
        }
        if (!user) return reply(res, 401, { error: 'Faça login para continuar' });
        if (url.pathname === '/api/energy-settings') {
          if (req.method === 'GET') return reply(res, 200, db.energySettings);
          if (req.method !== 'POST') return reply(res, 405, { error: 'Método não permitido' });
          if (user.role !== 'superadmin') return reply(res, 403, { error: 'Somente o superadministrador pode alterar os valores fixos.' });
          const b = await body(req);
          if (!Number.isFinite(+b.watts) || +b.watts <= 0 || +b.watts > 1300 ||
              !Number.isFinite(+b.tariff) || +b.tariff <= 0 || +b.tariff > 100) {
            throw Error('Informe potência média e tarifa maiores que zero.');
          }
          db.energySettings = {
            watts: +b.watts, tariff: +b.tariff,
            utility: String(b.utility || '').slice(0, 100),
            city: String(b.city || '').slice(0, 100),
          };
          await persist();
          return reply(res, 200, db.energySettings);
        }
        if (url.pathname === '/api/files' && req.method === 'POST') {
          const name = decodeURIComponent(String(req.headers['x-file-name'] || ''));
          if (!name || name.length > 180 || /[\x00-\x1f\x7f/\\]/.test(name) ||
              !/\.(stl|3mf|gcode|bgcode|obj|step|stp|zip)$/i.test(name)) {
            throw Error('Use um arquivo STL, 3MF, GCODE, BGCODE, OBJ, STEP, STP ou ZIP.');
          }
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 50 * 1024 * 1024) throw Error('O arquivo deve ter no máximo 50 MB.');
            chunks.push(chunk);
          }
          if (!size) throw Error('O arquivo está vazio.');
          const id = randomBytes(16).toString('hex');
          await writeFile(path.join(uploads, id), Buffer.concat(chunks));
          const file = { id, name, size };
          db.files[id] = file;
          await persist();
          return reply(res, 200, file);
        }
        if (url.pathname.startsWith('/api/files/') && req.method === 'GET') {
          const id = url.pathname.slice('/api/files/'.length);
          const file = /^[a-f0-9]{32}$/.test(id) ? db.files[id] : null;
          if (!file) return reply(res, 404, { error: 'Arquivo não encontrado' });
          const content = await readFile(path.join(uploads, file.id));
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="impressao${path.extname(file.name)}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            'Cache-Control': 'no-store',
          });
          return res.end(content);
        }
        if (url.pathname === '/api/admins') {
          if (user.role !== 'superadmin') {
            return reply(res, 403, { error: 'Somente o superadministrador pode gerenciar acessos.' });
          }
          if (req.method === 'GET')
            return reply(
              res,
              200,
              db.admins.map(({ id, name, email, role }) => ({ id, name, email, role })),
            );
          if (req.method === 'POST') {
            const b = await body(req);
            if (!['Ingrid', 'Raissa'].includes(b.name)) {
              throw Error('Selecione Ingrid ou Raissa para cadastrar o acesso.');
            }
            if (db.admins.some((admin) => admin.name === b.name)) {
              throw Error('Esta administradora já possui acesso cadastrado.');
            }
            if (!b.name?.trim() || !/^\S+@\S+\.\S+$/.test(b.email) || b.password?.length < 10)
              throw Error('Informe nome, e-mail válido e senha com 10 caracteres.');
            const email = b.email.trim().toLowerCase();
            if (db.admins.some((x) => x.email === email)) throw Error('E-mail já cadastrado');
            const salt = randomBytes(16).toString('hex');
            db.admins.push({
              id: randomBytes(16).toString('hex'),
              name: b.name.trim(),
              role: 'admin',
              email,
              salt,
              password: hash(b.password, salt),
            });
            await persist();
            return reply(res, 200, { ok: true });
          }
          if (req.method === 'DELETE') {
            const b = await body(req);
            if (b.id === user.id) throw Error('Não é possível excluir seu próprio acesso');
            if (db.admins.find((admin) => admin.id === b.id)?.role === 'superadmin') {
              throw Error('O acesso do superadministrador não pode ser removido.');
            }
            db.admins = db.admins.filter((x) => x.id !== b.id);
            for (const [sessionToken, active] of sessions) {
              if (active.id === b.id) sessions.delete(sessionToken);
            }
            await persist();
            return reply(res, 200, { ok: true });
          }
        }
        if (url.pathname === '/api/logout') {
          sessions.delete(token);
          res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
          return reply(res, 200, { ok: true });
        }
        const kind = url.pathname.split('/')[2];
        if (!['orders', 'products'].includes(kind))
          return reply(res, 404, { error: 'Não encontrado' });
        if (req.method === 'GET') return reply(res, 200, db[kind]);
        const b = await body(req);
        if (req.method === 'DELETE') {
          db[kind] = db[kind].filter((x) => x.id !== b.id);
          await persist();
          return reply(res, 200, { ok: true });
        }
        if (req.method === 'POST') {
          if (!b.name?.trim()) throw Error('Informe o nome do produto');
          if (
            kind === 'orders' &&
            (!b.customer?.trim() ||
              !b.contact?.trim() ||
              !b.orderDate ||
              !b.dueDate ||
              b.dueDate < b.orderDate)
          )
            throw Error('Preencha cliente, contato e datas válidas.');
          for (const k of [
            'quantity',
            'price',
            'filament',
            'energy',
            'packaging',
            'shipping',
            'grams',
            'kgPrice',
            'hours',
            'watts',
            'kwh',
          ]) {
            if (b[k] !== undefined && (!Number.isFinite(Number(b[k])) || Number(b[k]) < 0))
              throw Error('Valores devem ser números positivos.');
          }
          if (kind === 'orders' && (!Number.isInteger(+b.quantity) || +b.quantity < 1))
            throw Error('Quantidade deve ser um inteiro maior que zero.');
          if (b.photo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.photo))
            throw Error('Formato de foto inválido');
          const old = db[kind].find((x) => x.id === b.id);
          if (b.printFile) {
            const file = /^[a-f0-9]{32}$/.test(b.printFile.id) ? db.files[b.printFile.id] : null;
            if (!file) throw Error('Arquivo de impressão inválido. Envie o arquivo novamente.');
            b.printFile = file;
          }
          if (kind === 'orders' && b.energyAutomatic === true) {
            const config = old?.energyAutomatic && old.energyConfig
              ? old.energyConfig : db.energySettings;
            if (!config.tariff) throw Error('O superadministrador precisa configurar a tarifa de energia em Meu perfil.');
            if (b.hours === '' || b.hours == null || !Number.isFinite(+b.hours) || +b.hours < 0) {
              throw Error('Informe o tempo total de impressão em horas.');
            }
            b.energyConfig = { ...config };
            b.watts = config.watts;
            b.kwh = config.tariff;
            b.energyKwh = +((+b.hours * config.watts) / 1000).toFixed(6);
            b.energy = +((+b.hours * config.watts * config.tariff) / 1000).toFixed(2);
          }
          if (kind === 'orders' && !SELLERS.includes(b.seller)) {
            // Keep legacy records editable without silently assigning a seller.
            if (!old || old.seller || b.seller) {
              throw Error('Selecione um vendedor: João, Ingrid ou Raissa.');
            }
          }
          const item = {
            ...b,
            id: old?.id || randomBytes(8).toString('hex'),
            createdBy: old?.createdBy || user.name,
            createdAt: old?.createdAt || new Date().toISOString(),
          };
          if (old) db[kind] = db[kind].map((x) => (x.id === old.id ? item : x));
          else db[kind].push(item);
          await persist();
          return reply(res, 200, item);
        }
        return reply(res, 405, { error: 'Método não permitido' });
      }
      const files = {
        '/': 'index.html',
        '/app.js': 'app.js',
        '/sellers.js': 'sellers.js',
        '/style.css': 'style.css',
        '/casco-symbol.svg': 'casco-symbol.svg',
        '/images/logo.jpeg': '../images/logo.jpeg',
      };
      if (!files[url.pathname]) {
        res.writeHead(404);
        return res.end();
      }
      res.setHeader(
        'Content-Type',
        url.pathname.endsWith('.js')
          ? 'text/javascript'
          : url.pathname.endsWith('.jpeg')
            ? 'image/jpeg'
            : url.pathname.endsWith('.svg')
              ? 'image/svg+xml'
              : url.pathname.endsWith('.css')
                ? 'text/css'
                : 'text/html; charset=utf-8',
      );
      res.end(await readFile(path.join(root, 'public', files[url.pathname])));
    } catch (e) {
      reply(res, 400, { error: e.message || 'Não foi possível concluir' });
    }
  })
  .listen(Number(process.env.PORT) || 3000, process.env.HOST || '127.0.0.1', () =>
    console.log('CASCO 3D disponível em http://localhost:3000'),
  );
