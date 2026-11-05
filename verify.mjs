import { spawn } from 'node:child_process';
import { mkdtemp, readFile, unlink, rmdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { SELLERS, sellerInsights } from './public/sellers.js';
const dir = await mkdtemp(path.join(tmpdir(), 'casco3d-test-'));
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('.', import.meta.url),
  env: { ...process.env, PORT: '3098', DATA_DIR: dir },
  stdio: ['ignore', 'pipe', 'inherit'],
});
try {
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve);
    child.once('error', reject);
    child.once('exit', () => reject(Error('Servidor encerrou antes de iniciar')));
  });
  let cookie = '';
  async function call(route, method = 'GET', b) {
    const r = await fetch('http://127.0.0.1:3098/api/' + route, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: b ? JSON.stringify(b) : undefined,
    });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return [r.status, await r.json()];
  }
  assert.equal((await call('orders'))[0], 401);
  assert.equal((await call('session'))[1].setup, true);
  assert.equal(
    (
      await call('setup', 'POST', {
        name: 'Teste',
        email: 'teste@example.com',
        password: 'test-password-123',
      })
    )[0],
    200,
  );
  assert.equal((await call('setup', 'POST', {}))[0], 403);
  let [s, p] = await call('products', 'POST', { name: 'Vaso', price: 60, color: 'Verde' });
  assert.equal(s, 200);
  let [, o] = await call('orders', 'POST', {
    name: 'Vaso',
    customer: 'Cliente',
    seller: 'João',
    contact: '11999999999',
    quantity: 2,
    orderDate: '2026-11-05',
    dueDate: '2026-11-10',
    status: 'Novo',
    price: 120,
    filament: 20,
    energy: 5,
    packaging: 3,
    shipping: 12,
  });
  assert.ok(o.id);
  assert.equal(o.createdBy, 'Teste');
  assert.equal(o.seller, 'João');
  assert.deepEqual((await call('energy-settings'))[1], {
    watts: 100, tariff: 0.768, utility: 'Copel', city: 'Curitiba',
  });
  const automaticOrder = await call('orders', 'POST', {
    ...o, hours: 10, energyAutomatic: true, energy: 999, watts: 1300, kwh: 99,
  });
  assert.equal(automaticOrder[0], 200);
  assert.equal(automaticOrder[1].energy, 0.77);
  assert.equal(automaticOrder[1].energyKwh, 1);
  assert.equal(automaticOrder[1].watts, 100);
  assert.equal((await call('energy-settings', 'POST', {
    watts: 200, tariff: 1.2, utility: 'Copel', city: 'Curitiba',
  }))[0], 200);
  const historicalOrder = await call('orders', 'POST', {
    ...automaticOrder[1], hours: 20, energyAutomatic: true,
  });
  assert.equal(historicalOrder[1].energy, 1.54);
  assert.equal(historicalOrder[1].energyConfig.tariff, 0.768);
  assert.equal((await call('energy-settings', 'POST', { watts: 0, tariff: -1 }))[0], 400);
  const fileContent = 'solid test\nendsolid test';
  const uploadResponse = await fetch('http://127.0.0.1:3098/api/files', {
    method: 'POST', headers: { Cookie: cookie, 'X-File-Name': 'peca.stl' }, body: fileContent,
  });
  assert.equal(uploadResponse.status, 200);
  const uploaded = await uploadResponse.json();
  const withFile = await call('orders', 'POST', { ...o, printFile: uploaded });
  assert.equal(withFile[1].printFile.name, 'peca.stl');
  const download = await fetch(`http://127.0.0.1:3098/api/files/${uploaded.id}`, { headers: { Cookie: cookie } });
  assert.equal(download.status, 200);
  assert.ok(download.headers.get('content-disposition').startsWith('attachment;'));
  assert.equal(await download.text(), fileContent);
  assert.equal((await fetch(`http://127.0.0.1:3098/api/files/${uploaded.id}`)).status, 401);
  assert.equal((await fetch('http://127.0.0.1:3098/api/files', {
    method: 'POST', headers: { Cookie: cookie, 'X-File-Name': 'bad.exe' }, body: 'invalid',
  })).status, 400);
  assert.equal((await call('orders', 'POST', { ...o, printFile: { id: 'not-found' } }))[0], 400);
  assert.equal((await call('orders', 'POST', { ...o, seller: 'Outro' }))[0], 400);
  assert.equal((await call('orders', 'POST', { ...o, seller: '' }))[0], 400);
  assert.equal((await call('orders', 'POST', { ...o, id: undefined, seller: undefined }))[0], 400);
  for (const seller of SELLERS) {
    const updated = await call('orders', 'POST', { ...o, seller });
    assert.equal(updated[0], 200);
    assert.equal(updated[1].seller, seller);
  }
  const summary = sellerInsights([
    { seller: 'João', status: 'Entregue', price: 120, filament: 20, energy: 5, packaging: 3, shipping: 12 },
    { seller: 'João', status: 'Novo', price: 80, filament: 10 },
    { seller: 'João', status: 'Cancelado', price: 900, filament: 100 },
    { seller: 'Ingrid', status: 'Novo', price: 60 },
    { status: 'Novo', price: 40 },
  ]);
  assert.deepEqual(summary[0], {
    seller: 'João', total: 3, active: 2, delivered: 1, open: 1,
    canceled: 1, revenue: 200, costs: 50, profit: 150, average: 100,
  });
  assert.equal(summary[1].revenue, 60);
  assert.equal(summary[2].average, 0);
  assert.equal(summary[3].revenue, 40);
  assert.equal((await call('orders'))[1].length, 1);
  assert.equal((await call('orders', 'POST', { ...o, quantity: 0 }))[0], 400);
  assert.equal(
    (await call('orders', 'POST', { ...o, status: 'Em produção' }))[1].status,
    'Em produção',
  );
  assert.equal(
    (
      await call('admins', 'POST', {
        name: 'Ingrid',
        email: 'outro@example.com',
        password: 'test-password-456',
      })
    )[0],
    200,
  );
  assert.equal((await call('admins'))[1].length, 2);
  assert.equal((await call('session'))[1].user.role, 'superadmin');
  const masterCookie = cookie;
  const accounts = (await call('admins'))[1];
  const masterAccount = accounts.find((account) => account.role === 'superadmin');
  assert.equal((await call('admins', 'DELETE', { id: masterAccount.id }))[0], 400);
  assert.equal((await call('admins', 'POST', {
    name: 'Raissa', email: 'raissa@example.com', password: 'raissa-password-123', role: 'superadmin',
  }))[0], 200);
  assert.equal((await call('login', 'POST', {
    email: 'raissa@example.com', password: 'raissa-password-123',
  }))[0], 200);
  assert.equal((await call('session'))[1].user.role, 'admin');
  assert.equal((await call('energy-settings'))[0], 200);
  assert.equal((await call('energy-settings', 'POST', { watts: 200, tariff: 2 }))[0], 403);
  assert.equal((await call('admins'))[0], 403);
  assert.equal((await call('admins', 'POST', {
    name: 'Raissa', email: 'attack@example.com', password: 'attack-password-123', role: 'superadmin',
  }))[0], 403);
  assert.equal((await call('admins', 'DELETE', { id: masterAccount.id }))[0], 403);
  assert.equal((await call('products'))[0], 200);
  assert.equal((await call('orders'))[0], 200);
  cookie = masterCookie;
  assert.equal((await call('admins', 'POST', {
    name: 'Raissa', email: 'duplicate@example.com', password: 'duplicate-password-123',
  }))[0], 400);
  assert.equal((await call('logout', 'POST', {}))[0], 200);
  assert.equal((await call('orders'))[0], 401);
  assert.equal(
    (await call('login', 'POST', { email: 'teste@example.com', password: 'incorrect' }))[0],
    401,
  );
  assert.equal(
    (await call('login', 'POST', { email: 'teste@example.com', password: 'test-password-123' }))[0],
    200,
  );
  await call('orders', 'DELETE', { id: o.id });
  assert.equal((await call('orders'))[1].length, 0);
  const stored = JSON.parse(await readFile(path.join(dir, 'db.json'), 'utf8'));
  assert.equal(stored.products[0].id, p.id);
  assert.notEqual(stored.admins[0].password, 'test-password-123');
  assert.equal((await fetch('http://127.0.0.1:3098/')).status, 200);
  assert.equal((await call('session'))[1].user.recoveryEnabled, false);
  assert.equal((await call('recovery-code', 'POST', { password: 'wrong' }))[0], 401);
  const recovery = await call('recovery-code', 'POST', { password: 'test-password-123' });
  assert.equal(recovery[0], 200);
  assert.match(recovery[1].code, /^[a-f0-9]{8}(-[a-f0-9]{8}){5}$/);
  const replacement = await call('recovery-code', 'POST', { password: 'test-password-123' });
  assert.equal(replacement[0], 200);
  assert.equal((await call('session'))[1].user.recoveryEnabled, true);
  const recoveryStored = JSON.parse(await readFile(path.join(dir, 'db.json'), 'utf8'));
  assert.ok(recoveryStored.admins[0].recoveryHash);
  assert.ok(!JSON.stringify(recoveryStored).includes(replacement[1].code.replaceAll('-', '')));
  const request = {
    email: 'teste@example.com',
    code: replacement[1].code,
    password: 'new-password-789',
    confirmPassword: 'new-password-789',
  };
  assert.equal((await call('recover', 'POST', { ...request, code: recovery[1].code }))[0], 400);
  const unknown = await call('recover', 'POST', { ...request, email: 'unknown@example.com' });
  const invalid = await call('recover', 'POST', { ...request, code: 'invalid' });
  assert.deepEqual(unknown, invalid);
  assert.equal((await call('recover', 'POST', { ...request, confirmPassword: 'different' }))[0], 400);
  assert.equal((await call('recover', 'POST', { ...request, password: 'short' }))[0], 400);
  assert.equal((await call('recover', 'POST', request))[0], 200);
  assert.equal((await call('orders'))[0], 401);
  assert.equal((await call('recovery-code', 'POST', { password: request.password }))[0], 401);
  assert.equal((await call('recover', 'POST', request))[0], 400);
  assert.equal(
    (await call('login', 'POST', { email: request.email, password: 'test-password-123' }))[0],
    401,
  );
  assert.equal(
    (await call('login', 'POST', { email: request.email, password: request.password }))[0],
    200,
  );
  assert.equal((await call('session'))[1].user.recoveryEnabled, false);
  assert.equal((await call('products'))[1][0].id, p.id);
  let limited;
  for (let i = 0; i < 16; i++) limited = await call('recover', 'POST', request);
  assert.equal(limited[0], 429);
  console.log('Recuperação verificada: código único, rotação, hash, validação, sessões e limite de tentativas.');
  console.log(
    'Verificado: proteção de acesso, cadastro, login, pedidos, validação, catálogo, administradores, persistência e logout.',
  );
} finally {
  child.kill();
  await new Promise((r) => child.once('exit', r));
  for (const f of ['db.json', 'db.tmp'])
    try {
      await unlink(path.join(dir, f));
    } catch {}
  for (const file of await readdir(path.join(dir, 'uploads'))) {
    await unlink(path.join(dir, 'uploads', file));
  }
  await rmdir(path.join(dir, 'uploads'));
  await rmdir(dir);
}
