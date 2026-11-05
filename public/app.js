import { SELLERS, sellerInsights } from './sellers.js';

const $ = (s) => document.querySelector(s),
  app = $('#app'),
  modal = $('#modal');
let orders = [],
  products = [],
  energySettings = { watts: 100, tariff: null },
  user,
  view = 'dashboard',
  query = '',
  status = '',
  sellerFilter = '',
  photo = '';
const money = (n) => (+n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
const date = (s) => (s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—');
const today = () => new Date().toLocaleDateString('en-CA');
const cost = (o) =>
  ['filament', 'energy', 'packaging', 'shipping'].reduce((a, k) => a + (+o[k] || 0), 0);
const states = ['Novo', 'Em produção', 'Pronto', 'Entregue', 'Cancelado'];
async function api(url, method = 'GET', data) {
  const r = await fetch('/api/' + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error);
  return b;
}
function toast(s) {
  $('#toast').textContent = s;
  $('#toast').classList.add('show');
  setTimeout(() => $('#toast').classList.remove('show'), 3500);
}
async function init() {
  try {
    const s = await api('session');
    user = s.user;
    if (!user) return login(s.setup);
    [orders, products, energySettings] = await Promise.all([
      api('orders'), api('products'), api('energy-settings'),
    ]);
    render();
  } catch (e) {
    toast(e.message);
  }
}
function login(setup) {
  app.innerHTML = `<div class="login"><div class="login-story"><div class="brand"><img class="brand-logo" src="/images/logo.jpeg" alt="CASCO 3D" /></div><div><p class="eyebrow">DA IDEIA À ENTREGA</p><h1>Mais organização.<br>Mais espaço<br>para criar.</h1><p>Seus pedidos, produtos e custos,<br>em um só lugar.</p><div class="sculpture" aria-hidden="true"><img src="/images/logo.jpeg" alt="" /></div></div><small>Feito para quem transforma ideias em peças.</small></div><div class="login-form"><form id="auth"><span class="eyebrow">ÁREA ADMINISTRATIVA</span><h2>${setup ? 'Vamos começar?' : 'Bem-vindo de volta'}</h2><p class="muted">${setup ? 'Cadastre o primeiro administrador da sua loja.' : 'Entre para acompanhar sua produção.'}</p>${setup ? field('name', 'Seu nome', 'text', '', true) : ''}${field('email', 'E-mail', 'email', '', true)}${field('password', 'Senha', 'password', '', true)}${setup ? '<small>Use pelo menos 10 caracteres na senha.</small>' : ''}<p id="error" role="alert"></p><button class="primary full">${setup ? 'Criar administrador' : 'Entrar na CASCO 3D'} <span>→</span></button><p class="secure">◈ Acesso exclusivo para administradores</p></form></div></div>`;
  if (!setup) {
    $('#auth').insertAdjacentHTML(
      'beforeend',
      '<button type="button" class="password-link" id="forgot-password">Esqueci minha senha</button>',
    );
    $('#forgot-password').onclick = recoverPassword;
  }
  $('#auth').onsubmit = async (e) => {
    e.preventDefault();
    const button = e.target.querySelector('button');
    button.disabled = true;
    try {
      await api(setup ? 'setup' : 'login', 'POST', Object.fromEntries(new FormData(e.target)));
      await init();
    } catch (err) {
      $('#error').textContent = err.message;
    } finally {
      button.disabled = false;
    }
  };
}
function field(name, label, type = 'text', value = '', required = false, extra = '') {
  return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} ${extra}></label>`;
}
function badge(s) {
  return `<span class="badge s${states.indexOf(s)}">${esc(s)}</span>`;
}
function render() {
  app.innerHTML = `<aside><div class="brand"><img class="brand-logo" src="/images/logo.jpeg" alt="CASCO 3D" /></div><p class="nav-label">SEU ESPAÇO DE TRABALHO</p><nav>${[
    ['dashboard', '◫', 'Visão geral'],
    ['orders', '▤', 'Pedidos'],
    ['products', '⬡', 'Catálogo'],
  ]
    .map(
      ([v, i, t]) =>
        `<button data-view="${v}" class="${view === v ? 'active' : ''}"><span>${i}</span>${t}${v === 'orders' ? `<small>${orders.length}</small>` : ''}</button>`,
    )
    .join(
      '',
    )}</nav><div class="sidebar-note"><span>✧</span><strong>Ideias ganham forma.</strong><p>A organização cuida do resto.</p></div><div class="profile"><div class="avatar">${esc(user.name[0].toUpperCase())}</div><div><strong>${esc(user.name)}</strong><small>${user.role === 'superadmin' ? 'Superadministrador' : 'Administrador'}</small></div><button id="logout" title="Sair">↪</button></div></aside><main><header><div><span class="muted">CASCO 3D</span><span class="slash">/</span>${view === 'dashboard' ? 'Visão geral' : view === 'orders' ? 'Pedidos' : 'Catálogo'}</div><span class="header-date">${new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</span></header><div class="content"><div class="page-heading"><div><p class="eyebrow">${view === 'dashboard' ? 'TUDO SOB CONTROLE' : view === 'orders' ? 'DA PRIMEIRA CAMADA À ENTREGA' : 'SUA COLEÇÃO DE POSSIBILIDADES'}</p><h1>${view === 'dashboard' ? 'Visão geral' : view === 'orders' ? 'Seus pedidos' : 'Catálogo de produtos'}</h1><p class="muted">${view === 'dashboard' ? 'Acompanhe o que está tomando forma na CASCO 3D.' : view === 'orders' ? 'Organize cada detalhe e acompanhe suas entregas.' : 'Cadastre suas peças e agilize os próximos pedidos.'}</p></div><button class="primary" id="new">＋ ${view === 'products' ? 'Novo produto' : 'Novo pedido'}</button></div><div id="workspace"></div></div></main>`;
  document.querySelectorAll('[data-view]').forEach(
    (b) =>
      (b.onclick = () => {
        view = b.dataset.view;
        query = '';
        status = '';
        sellerFilter = '';
        render();
      }),
  );
  $('#logout').onclick = async () => {
    await api('logout', 'POST');
    init();
  };
  $('#new').onclick = () => editor(view === 'products' ? 'products' : 'orders');
  document.querySelector('nav').insertAdjacentHTML(
    'beforeend',
    `<button type="button" id="recovery-settings"><span>◈</span>${user.recoveryEnabled ? 'Recuperação de senha' : 'Ativar recuperação'}</button>`,
  );
  $('#recovery-settings').onclick = recoverySettings;
  document.querySelector('nav').insertAdjacentHTML(
    'beforeend',
    '<button type="button" id="my-profile"><span>◉</span>Meu perfil</button>',
  );
  $('#my-profile').onclick = () => openProfile();
  $('.profile .avatar').onclick = () => openProfile();
  $('.profile .avatar').title = 'Meu perfil';
  $('.profile .avatar').tabIndex = 0;
  $('.profile .avatar').setAttribute('role', 'button');
  $('.profile .avatar').setAttribute('aria-label', 'Meu perfil');
  $('.profile .avatar').onkeydown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openProfile();
    }
  };
  workspace();
}

function recoverPassword() {
  modal.innerHTML = `
    <form id="recover-form">
      <div class="modal-head">
        <h2>Recuperar senha</h2>
        <button type="button" class="close" id="close" aria-label="Fechar">×</button>
      </div>
      <div class="form-body">
        <p class="muted">Use o código de segurança que você guardou na sua conta.</p>
        ${field('email', 'E-mail do administrador', 'email', $('#auth [name="email"]').value, true)}
        ${field('code', 'Código de recuperação', 'text', '', true, 'autocomplete="off" spellcheck="false"')}
        ${field('password', 'Nova senha', 'password', '', true, 'minlength="10" maxlength="256" autocomplete="new-password"')}
        ${field('confirmPassword', 'Confirmar nova senha', 'password', '', true, 'minlength="10" maxlength="256" autocomplete="new-password"')}
        <p id="recovery-error" class="recovery-error" role="alert"></p>
        <p class="muted">Sem o código? Se você ainda tem uma sessão aberta, gere um código em Recuperação de senha. A versão local não envia e-mails.</p>
        <button class="primary full" id="recover-submit">Salvar nova senha</button>
      </div>
    </form>`;
  modal.showModal();
  $('#close').onclick = () => modal.close();
  $('#recover-form').onsubmit = async (event) => {
    event.preventDefault();
    const submit = $('#recover-submit');
    submit.disabled = true;
    try {
      await api('recover', 'POST', Object.fromEntries(new FormData(event.target)));
      modal.close();
      modal.replaceChildren();
      await init();
      toast('Senha alterada. Entre e gere um novo código de recuperação.');
    } catch (error) {
      $('#recovery-error').textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  };
}

function recoverySettings() {
  modal.innerHTML = `
    <form id="recovery-settings-form">
      <div class="modal-head">
        <h2>Recuperação de senha</h2>
        <button type="button" class="close" id="close" aria-label="Fechar">×</button>
      </div>
      <div class="form-body">
        <p class="muted">Gere um código para recuperar o acesso à sua conta caso esqueça a senha. Guarde-o em um lugar seguro, fora deste sistema.</p>
        <p>${user.recoveryEnabled ? 'Você já possui um código ativo. Gerar outro invalida o anterior.' : 'Sua conta ainda não tem um código de recuperação.'}</p>
        ${field('password', 'Confirme sua senha atual', 'password', '', true, 'autocomplete="current-password"')}
        <p id="recovery-error" class="recovery-error" role="alert"></p>
        <button class="primary full" id="generate-code">Gerar código de segurança</button>
      </div>
    </form>`;
  modal.showModal();
  $('#close').onclick = () => modal.close();
  $('#recovery-settings-form').onsubmit = async (event) => {
    event.preventDefault();
    const submit = $('#generate-code');
    submit.disabled = true;
    try {
      const result = await api('recovery-code', 'POST', Object.fromEntries(new FormData(event.target)));
      user.recoveryEnabled = true;
      modal.innerHTML = `
        <div class="modal-head"><h2>Guarde seu código</h2></div>
        <div class="form-body">
          <p>Este código será exibido apenas agora e só pode ser usado uma vez.</p>
          <label>Código de recuperação
            <textarea class="one-time-code" readonly rows="3" spellcheck="false">${esc(result.code)}</textarea>
          </label>
          <p class="muted">Quem tiver este código poderá redefinir sua senha. Salve-o em seu gerenciador de senhas ou anote em um local seguro.</p>
          <button type="button" class="secondary" id="copy-code">Copiar código</button>
          <p id="copy-result" role="status"></p>
          <button type="button" class="primary full" id="saved-code">Já guardei meu código</button>
        </div>`;
      $('#copy-code').onclick = async () => {
        try {
          await navigator.clipboard.writeText(result.code);
          $('#copy-result').textContent = 'Código copiado.';
        } catch {
          $('.one-time-code').select();
          $('#copy-result').textContent = 'Use Ctrl + C para copiar o código selecionado.';
        }
      };
      $('#saved-code').onclick = () => {
        modal.close();
        render();
      };
    } catch (error) {
      $('#recovery-error').textContent = error.message;
      submit.disabled = false;
    }
  };
}

modal.addEventListener('close', () => {
  if (modal.querySelector('.one-time-code')) modal.replaceChildren();
});
function workspace() {
  const active = orders.filter((o) => o.status !== 'Cancelado'),
    revenue = active.reduce((a, o) => a + (+o.price || 0), 0),
    profit = active.reduce((a, o) => a + (+o.price || 0) - cost(o), 0);
  let html = '';
  if (view === 'dashboard')
    html = `<div class="stats"><article><span>Pedidos em aberto <i>▤</i></span><strong>${active.filter((o) => o.status !== 'Entregue').length}</strong><small>Ideias em movimento</small></article><article><span>Em produção <i>⬡</i></span><strong>${orders.filter((o) => o.status === 'Em produção').length}</strong><small>Camada por camada</small></article><article><span>Valor dos pedidos <i>↗</i></span><strong>${money(revenue)}</strong><small>Exclui pedidos cancelados</small></article><article class="highlight"><span>Lucro estimado <i>✧</i></span><strong>${money(profit)}</strong><small>Valor de venda menos custos</small></article></div><div class="overview-banner"><div><span class="eyebrow">SEU FLUXO CRIATIVO, ORGANIZADO</span><h2>Cada pedido é uma nova possibilidade.</h2><p>Do primeiro contato à última camada, cuide de cada detalhe.</p></div><div class="cube-art" aria-hidden="true"><img src="/images/logo.jpeg" alt="" /></div></div><div class="section-title"><h2>Pedidos recentes <span>${orders.length}</span></h2><button class="link" id="all">Ver todos os pedidos →</button></div>`;
  if (view === 'products') {
    html += `<div class="toolbar"><input id="search" placeholder="Buscar produto no catálogo…" value="${esc(query)}"><span>${products.length} produtos cadastrados</span></div><div class="product-grid">${
      products
        .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
        .map(
          (p) =>
            `<button class="product" data-edit="${p.id}"><div class="product-image">${p.photo ? `<img src="${p.photo}" alt="${esc(p.name)}">` : '<span>⬡</span>'}</div><div class="product-info"><small>${esc(p.category || 'Impressão 3D')}</small><h3>${esc(p.name)}</h3><p>${esc(p.color || 'Cor a definir')} · ${esc(p.material || 'PLA')}</p><strong>${money(p.price)}</strong></div></button>`,
        )
        .join('') ||
      '<div class="empty"><span>⬡</span><h3>Seu catálogo começa aqui</h3><p>Adicione suas peças para reutilizar nos pedidos.</p></div>'
    }</div>`;
  } else {
    if (view === 'orders')
      html += `<div class="toolbar"><input id="search" placeholder="Buscar por produto, cliente ou contato…" value="${esc(query)}"><select id="filter"><option value="">Todos os status</option>${states.map((s) => `<option ${s === status ? 'selected' : ''}>${s}</option>`).join('')}</select><button class="secondary" id="export">↓ Exportar CSV</button></div>`;
    const list = [...orders]
      .reverse()
      .filter(
        (o) =>
          (!status || o.status === status) &&
          (!sellerFilter || (sellerFilter === 'unassigned' ? !o.seller : o.seller === sellerFilter)) &&
          [o.name, o.customer, o.contact].join(' ').toLowerCase().includes(query.toLowerCase()),
      )
      .slice(0, view === 'dashboard' ? 6 : undefined);
    html += `<div class="table-wrap"><table><thead><tr><th>PRODUTO / PEDIDO</th><th>CLIENTE</th><th>VENDEDOR</th><th>ENTREGA</th><th>STATUS</th><th>VALOR</th><th></th></tr></thead><tbody>${list.map((o) => `<tr><td><div class="item"><div class="thumb">${o.photo ? `<img src="${o.photo}" alt="">` : '⬡'}</div><div><strong>${esc(o.name)}</strong><small>${o.quantity} un. · ${esc(o.color || 'Sem cor definida')}</small></div></div></td><td>${esc(o.customer)}<small>${esc(o.channel || 'Não informado')}</small></td><td>${esc(o.seller || 'Sem vendedor')}</td><td><span class="${o.dueDate < today() && !['Entregue', 'Cancelado'].includes(o.status) ? 'late' : ''}">${date(o.dueDate)}</span></td><td>${badge(o.status)}</td><td><strong>${money(o.price)}</strong></td><td><button class="edit" data-edit="${o.id}" aria-label="Editar pedido">↗</button></td></tr>`).join('') || '<tr><td colspan="7"><div class="empty"><span>▤</span><h3>Nenhum pedido por aqui</h3><p>Cadastre um pedido para começar a acompanhar sua produção.</p></div></td></tr>'}</tbody></table></div>`;
  }
  $('#workspace').innerHTML = html;
  if (view === 'dashboard') {
    const insights = sellerInsights(orders);
    document.querySelector('.overview-banner').insertAdjacentHTML('afterend', `
      <section class="seller-insights" aria-labelledby="seller-insights-title">
        <div class="section-title"><h2 id="seller-insights-title">Resultados por vendedor</h2></div>
        <p class="muted">Todo o período · Valores e ticket médio excluem cancelados. Lucro estimado considera os custos informados.</p>
        <div class="seller-grid">
          ${insights.filter((row) => row.seller || row.total).map((row) => `
            <article class="seller-card">
              <h3>${esc(row.seller || 'Sem vendedor')}</h3>
              <p class="seller-revenue">${money(row.revenue)}<small>Valor dos pedidos</small></p>
              <dl>
                <div><dt>Pedidos</dt><dd>${row.total}</dd></div>
                <div><dt>Em aberto</dt><dd>${row.open}</dd></div>
                <div><dt>Entregues</dt><dd>${row.delivered}</dd></div>
                <div><dt>Cancelados</dt><dd>${row.canceled}</dd></div>
                <div><dt>Custos</dt><dd>${money(row.costs)}</dd></div>
                <div><dt>Lucro estimado</dt><dd>${money(row.profit)}</dd></div>
                <div><dt>Ticket médio</dt><dd>${money(row.average)}</dd></div>
              </dl>
            </article>`).join('')}
        </div>
      </section>`);
  }
  if (view === 'orders') {
    $('#filter').insertAdjacentHTML('afterend', `
      <select id="seller-filter" aria-label="Filtrar por vendedor">
        <option value="">Todos os vendedores</option>
        ${SELLERS.map((seller) => `<option value="${esc(seller)}" ${sellerFilter === seller ? 'selected' : ''}>${esc(seller)}</option>`).join('')}
        <option value="unassigned" ${sellerFilter === 'unassigned' ? 'selected' : ''}>Sem vendedor</option>
      </select>`);
    $('#seller-filter').onchange = (event) => {
      sellerFilter = event.target.value;
      workspace();
    };
  }
  $('#all')?.addEventListener('click', () => {
    view = 'orders';
    render();
  });
  document
    .querySelectorAll('[data-edit]')
    .forEach(
      (b) =>
        (b.onclick = () => editor(view === 'products' ? 'products' : 'orders', b.dataset.edit)),
    );
  $('#search')?.addEventListener('input', (e) => {
    const pos = e.target.selectionStart;
    query = e.target.value;
    workspace();
    $('#search').focus();
    $('#search').setSelectionRange(pos, pos);
  });
  $('#filter')?.addEventListener('change', (e) => {
    status = e.target.value;
    workspace();
  });
  $('#export')?.addEventListener('click', exportCSV);
}
function editor(kind, id) {
  const product = kind === 'products',
    item = (product ? products : orders).find((x) => x.id === id) || {};
  photo = item.photo || '';
  modal.innerHTML = `<form id="editform"><div class="modal-head"><div><p class="eyebrow">${product ? 'CATÁLOGO' : 'PEDIDOS'}</p><h2>${id ? 'Editar' : 'Novo'} ${product ? 'produto' : 'pedido'}</h2></div><button type="button" id="close" class="close" aria-label="Fechar">×</button></div><div class="form-body">${!product ? `<label>Usar produto do catálogo<select id="catalog"><option value="">Pedido personalizado</option>${products.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>` : ''}<div class="fields">${field('name', 'Nome do produto', 'text', item.name, true)}${product ? field('category', 'Categoria', 'text', item.category) : field('quantity', 'Quantidade', 'number', item.quantity || 1, true, 'min="1" step="1"')}${field('color', 'Cor', 'text', item.color)}${field('material', 'Material / filamento', 'text', item.material || 'PLA')}</div><label class="upload">＋ Adicionar foto da peça<input id="photo" type="file" accept="image/png,image/jpeg,image/webp"><small>PNG, JPG ou WebP · até 5 MB</small></label><div id="photo-preview">${photo ? `<img src="${photo}" alt="Foto da peça"><button type="button" id="remove-photo">Remover foto</button>` : ''}</div>${
    !product
      ? `<h3>Cliente e entrega</h3><div class="fields">${field('customer', 'Nome do cliente', 'text', item.customer, true)}${field('contact', 'Contato (telefone ou e-mail)', 'text', item.contact, true)}<label>Canal de contato<select name="channel">${['WhatsApp', 'Instagram', 'Presencial', 'E-mail', 'Site', 'Outro'].map((s) => `<option ${item.channel === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label>Status<select name="status">${states.map((s) => `<option ${item.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>${field('orderDate', 'Data do pedido', 'date', item.orderDate || today(), true)}${field('dueDate', 'Data de entrega', 'date', item.dueDate, true)}</div><h3>Custos do pedido</h3><p class="muted">Informe os custos totais para todas as unidades.</p><details><summary>Calcular filamento e energia</summary><div class="fields">${field('grams', 'Filamento total (g)', 'number', item.grams || 0, false, 'min="0" step="any"')}${field('kgPrice', 'Preço do filamento (R$/kg)', 'number', item.kgPrice || 0, false, 'min="0" step="any"')}${field('hours', 'Tempo total de impressão (h)', 'number', item.hours || 0, false, 'min="0" step="any"')}${field('watts', 'Potência média (W)', 'number', item.watts || 0, false, 'min="0" step="any"')}${field('kwh', 'Tarifa de energia (R$/kWh)', 'number', item.kwh || 0, false, 'min="0" step="any"')}</div><button type="button" class="secondary" id="calculate">Aplicar cálculo</button></details><div class="fields">${[
          ['filament', 'Filamento (R$)'],
          ['energy', 'Energia (R$)'],
          ['packaging', 'Embalagem (R$)'],
          ['shipping', 'Frete (R$)'],
        ]
          .map(([k, l]) => field(k, l, 'number', item[k] || 0, false, 'min="0" step="0.01"'))
          .join('')}</div>`
      : ''
  }<h3>${product ? 'Preço sugerido' : 'Valor de venda'}</h3>${field('price', product ? 'Preço por unidade (R$)' : 'Valor total do pedido (R$)', 'number', item.price || 0, true, 'min="0" step="0.01"')}${!product ? '<div class="cost-summary" id="totals"></div>' : ''}<label>Observações<textarea name="notes" rows="3" placeholder="Detalhes, personalização e informações importantes…">${esc(item.notes)}</textarea></label>${id && !product ? `<small>Registrado por ${esc(item.createdBy)} em ${new Date(item.createdAt).toLocaleDateString('pt-BR')}</small>` : ''}<p id="formerror" role="alert"></p></div><div class="modal-footer">${id ? '<button type="button" class="danger" id="delete">Excluir</button>' : ''}<button type="button" class="secondary" id="cancel">Cancelar</button><button class="primary" id="save">Salvar ${product ? 'produto' : 'pedido'}</button></div></form>`;
  modal.showModal();
  $('#close').onclick = $('#cancel').onclick = () => modal.close();
  const form = $('#editform');
  let printFile = item.printFile || null;
  let selectedFile = null;
  form.querySelector('#photo-preview').insertAdjacentHTML('afterend', `
    <label class="upload">Arquivo de impressão
      <input id="print-file" type="file" accept=".stl,.3mf,.gcode,.bgcode,.obj,.step,.stp,.zip">
      <small>STL, 3MF, GCODE, BGCODE, OBJ, STEP, STP ou ZIP · até 50 MB</small>
    </label>
    <div id="print-file-preview" class="file-preview"></div>`);
  const filePreview = () => {
    const file = selectedFile || printFile;
    $('#print-file-preview').innerHTML = file ? `
      <span>${esc(file.name)} <small>(${(file.size / 1024 / 1024).toFixed(2)} MB)</small></span>
      ${!selectedFile ? `<a href="/api/files/${esc(file.id)}" download>Baixar</a>` : '<small>Será enviado ao salvar.</small>'}
      <button type="button" class="danger" id="remove-print-file">Remover</button>` : '';
    $('#remove-print-file')?.addEventListener('click', () => {
      selectedFile = null;
      printFile = null;
      $('#print-file').value = '';
      filePreview();
    });
  };
  filePreview();
  $('#print-file').onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!/\.(stl|3mf|gcode|bgcode|obj|step|stp|zip)$/i.test(file.name) ||
        !file.size || file.size > 50 * 1024 * 1024) {
      event.target.value = '';
      return toast('Selecione um arquivo de impressão de até 50 MB.');
    }
    selectedFile = file;
    filePreview();
  };
  const energyConfig = item.energyAutomatic && item.energyConfig
    ? item.energyConfig : energySettings;
  if (!product) {
    for (const name of ['hours', 'watts', 'kwh']) form.elements[name].closest('label').remove();
    form.elements.energy.readOnly = true;
    form.querySelector('details summary').textContent = 'Calcular custo do filamento';
    form.querySelector('details').insertAdjacentHTML('beforebegin', `
      <div class="energy-panel">
        <h3>Energia · Bambu Lab A1</h3>
        ${field('hours', 'Tempo total de impressão de todas as unidades (horas)', 'number', item.hours ?? '', true, 'min="0" step="any"')}
        <p class="muted">Potência média estimada: ${energyConfig.watts} W · ${(energyConfig.watts / 1000).toLocaleString('pt-BR')} kWh por hora de impressão.</p>
        <p class="muted">${energyConfig.tariff ? `Tarifa fixa: ${Number(energyConfig.tariff).toLocaleString('pt-BR', { minimumFractionDigits: 4 })} R$/kWh. ${esc(energyConfig.utility || '')}` : 'Tarifa pendente: o superadministrador precisa informar o valor do kWh em Meu perfil → Energia.'}</p>
        <p id="energy-estimate" role="status"></p>
        ${item.energyConfig ? '<small>Este pedido mantém os valores fixos de quando foi criado.</small>' : ''}
      </div>`);
  }
  if (!product) {
    form.querySelector('.form-body > .fields').insertAdjacentHTML('beforeend', `
      <label>Vendedor
        <select name="seller" required>
          <option value="">Selecione o vendedor</option>
          ${SELLERS.map((seller) => `<option value="${esc(seller)}" ${item.seller === seller ? 'selected' : ''}>${esc(seller)}</option>`).join('')}
        </select>
      </label>`);
  }
  const totals = () => {
    if (product) return;
    if (energyConfig.tariff && form.elements.hours.value !== '') {
      const kwh = (+form.elements.hours.value * energyConfig.watts) / 1000;
      form.elements.energy.value = (kwh * energyConfig.tariff).toFixed(2);
      $('#energy-estimate').textContent = `Consumo estimado: ${kwh.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} kWh · Custo: ${money(kwh * energyConfig.tariff)}`;
    }
    const o = Object.fromEntries(new FormData(form));
    $('#totals').innerHTML =
      `<span>Custo total <strong>${money(cost(o))}</strong></span><span>Lucro estimado <strong>${money(+o.price - cost(o))}</strong></span>`;
  };
  form.oninput = totals;
  totals();
  function preview() {
    $('#photo-preview').innerHTML = photo
      ? `<img src="${photo}" alt="Foto da peça"><button type="button" id="remove-photo">Remover foto</button>`
      : '';
    $('#remove-photo')?.addEventListener('click', () => {
      photo = '';
      preview();
    });
  }
  preview();
  $('#photo').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) {
      toast('Selecione uma imagem PNG, JPG ou WebP de até 5 MB.');
      return;
    }
    photo = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(f);
    });
    preview();
  };
  $('#catalog')?.addEventListener('change', (e) => {
    const p = products.find((p) => p.id === e.target.value);
    if (!p) return;
    for (const k of ['name', 'color', 'material']) form.elements[k].value = p[k] || '';
    form.elements.price.value = (+p.price || 0) * (+form.elements.quantity.value || 1);
    photo = p.photo || '';
    printFile = p.printFile || null;
    selectedFile = null;
    $('#print-file').value = '';
    filePreview();
    preview();
    totals();
  });
  $('#calculate')?.addEventListener('click', () => {
    const v = (k) => +form.elements[k].value || 0;
    form.elements.filament.value = ((v('grams') / 1000) * v('kgPrice')).toFixed(2);
    totals();
  });
  $('#delete')?.addEventListener('click', async () => {
    if (!confirm('Excluir este registro permanentemente?')) return;
    try {
      await api(kind, 'DELETE', { id });
      modal.close();
      await init();
      toast('Registro excluído');
    } catch (e) {
      $('#formerror').textContent = e.message;
    }
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    $('#save').disabled = true;
    try {
      if (!product && !energyConfig.tariff) {
        throw Error('Configure primeiro a tarifa de energia em Meu perfil → Energia.');
      }
      if (selectedFile) {
        const response = await fetch('/api/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(selectedFile.name) },
          body: selectedFile,
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error);
        printFile = result;
        selectedFile = null;
      }
      await api(kind, 'POST', {
        ...item, ...Object.fromEntries(new FormData(form)), photo, printFile,
        ...(!product ? { energyAutomatic: true } : {}),
      });
      modal.close();
      await init();
      toast('Salvo com sucesso');
    } catch (err) {
      $('#formerror').textContent = err.message;
    } finally {
      if ($('#save')) $('#save').disabled = false;
    }
  };
}
function exportCSV() {
  const keys = [
    'name',
    'customer',
    'contact',
    'channel',
    'quantity',
    'color',
    'orderDate',
    'dueDate',
    'status',
    'price',
    'filament',
    'energy',
    'packaging',
    'shipping',
    'createdBy',
    'seller',
  ];
  const labels = [
    'Produto',
    'Cliente',
    'Contato',
    'Canal',
    'Quantidade',
    'Cor',
    'Data do pedido',
    'Data de entrega',
    'Status',
    'Valor total',
    'Filamento',
    'Energia',
    'Embalagem',
    'Frete',
    'Registrado por',
    'Vendedor',
  ];
  const cell = (s) =>
    '"' +
    String(s ?? '')
      .replace(/^[=+@-]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  const csv =
    '\uFEFF' +
    [labels, ...orders.map((o) => keys.map((k) => o[k]))]
      .map((r) => r.map(cell).join(';'))
      .join('\r\n');
  const u = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = u;
  a.download = 'pedidos.csv';
  a.click();
  URL.revokeObjectURL(u);
}
async function openProfile(tab = 'profile') {
  const master = user.role === 'superadmin';
  if (tab === 'energy') return master ? openEnergySettings() : undefined;
  if (tab === 'admins' && !master) return;
  try {
    const admins = tab === 'admins' ? await api('admins') : [];
    modal.innerHTML = `
      <div class="modal-head">
        <h2>Meu perfil</h2>
        <button type="button" class="close" id="close" aria-label="Fechar">×</button>
      </div>
      <div class="profile-tabs" role="tablist" aria-label="Perfil">
        <button type="button" role="tab" data-profile-tab="profile" aria-selected="${tab === 'profile'}">Minha conta</button>
        ${master ? '<button type="button" role="tab" data-profile-tab="admins" aria-selected="' + (tab === 'admins') + '">Administradores</button>' : ''}
      </div>
      <div class="form-body" role="tabpanel">
        ${tab === 'profile' ? `
          <h3>${esc(user.name)}</h3>
          <p class="muted">${esc(user.email)}</p>
          <span class="badge">${master ? 'Superadministrador' : 'Administrador'}</span>
          <p class="muted profile-description">${master ? 'Você gerencia os pedidos, o catálogo e os acessos da equipe.' : 'Você tem acesso aos pedidos, ao catálogo e aos resultados dos vendedores.'}</p>
          <button type="button" class="secondary" id="profile-recovery">Recuperação de senha</button>
        ` : `
          <p class="muted">Somente você pode cadastrar ou remover os acessos da equipe. Ingrid e Raissa entram como administradoras.</p>
          <div class="access-list">${admins.map((account) => `
            <div class="access-row">
              <div><strong>${esc(account.name)}</strong><small>${esc(account.email)} · ${account.role === 'superadmin' ? 'Superadministrador' : 'Administrador'}</small></div>
              ${account.role !== 'superadmin' ? '<button type="button" class="danger" data-admin="' + account.id + '">Remover</button>' : ''}
            </div>`).join('')}</div>
          <h3>Cadastrar administradora</h3>
          <form id="adminform">
            <label>Nome<select name="name" required><option value="">Selecione</option>${['Ingrid', 'Raissa'].map((name) => '<option' + (admins.some((account) => account.name === name) ? ' disabled' : '') + '>' + name + '</option>').join('')}</select></label>
            ${field('email', 'E-mail de acesso', 'email', '', true)}
            ${field('password', 'Senha inicial (mínimo 10 caracteres)', 'password', '', true, 'minlength="10" maxlength="256" autocomplete="new-password"')}
            <p id="adminerror" class="recovery-error" role="alert"></p>
            <button class="primary">Cadastrar acesso</button>
          </form>
        `}
      </div>`;
    if (master) {
      document.querySelector('.profile-tabs').insertAdjacentHTML('beforeend',
        '<button type="button" role="tab" data-profile-tab="energy" aria-selected="false">Energia</button>');
    }
    if (!modal.open) modal.showModal();
    $('#close').onclick = () => modal.close();
    document.querySelectorAll('[data-profile-tab]').forEach((button) => {
      button.onclick = () => openProfile(button.dataset.profileTab);
    });
    $('#profile-recovery')?.addEventListener('click', recoverySettings);
    const form = $('#adminform');
    if (form) form.onsubmit = async (event) => {
      event.preventDefault();
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        await api('admins', 'POST', Object.fromEntries(new FormData(form)));
        await openProfile('admins');
        toast('Acesso cadastrado. A administradora já pode entrar com o e-mail e a senha definidos.');
      } catch (error) {
        $('#adminerror').textContent = error.message;
        button.disabled = false;
      }
    };
    document.querySelectorAll('[data-admin]').forEach((button) => {
      button.onclick = async () => {
        if (!confirm('Remover o acesso desta administradora?')) return;
        try {
          await api('admins', 'DELETE', { id: button.dataset.admin });
          await openProfile('admins');
          toast('Acesso removido');
        } catch (error) { toast(error.message); }
      };
    });
  } catch (error) { toast(error.message); }
}

async function openEnergySettings() {
  if (user.role !== 'superadmin') return;
  try {
    const settings = await api('energy-settings');
    modal.innerHTML = `
      <div class="modal-head"><h2>Energia da impressora</h2><button type="button" class="close" id="close" aria-label="Fechar">×</button></div>
      <div class="profile-tabs" role="tablist" aria-label="Perfil">
        <button type="button" role="tab" data-profile-tab="profile" aria-selected="false">Minha conta</button>
        <button type="button" role="tab" data-profile-tab="admins" aria-selected="false">Administradores</button>
        <button type="button" role="tab" aria-selected="true">Energia</button>
      </div>
      <form id="energy-settings-form" class="form-body">
        <h3>Bambu Lab A1</h3>
        <p class="muted">Os valores ficam fixos para a equipe. Ao informar as horas, o pedido calcula automaticamente o consumo e o custo.</p>
        <p class="muted">100 W é uma estimativa inicial de trabalho, não uma medição da sua máquina. Ajuste com a média medida durante suas impressões. A potência máxima da etiqueta não representa o consumo médio.</p>
        ${field('watts', 'Potência média estimada (W)', 'number', settings.watts, true, 'min="1" max="1300" step="any"')}
        ${field('tariff', 'Valor final da energia (R$/kWh)', 'number', settings.tariff ?? '', true, 'min="0.0001" max="100" step="any"')}
        ${field('utility', 'Distribuidora', 'text', settings.utility)}
        ${field('city', 'Cidade', 'text', settings.city)}
        <p class="muted">Use a tarifa final por kWh da sua conta, somando TE, TUSD, impostos e bandeira quando cobrados separadamente. Não inclua iluminação pública ou outras cobranças fixas.</p>
        <p class="muted">Cálculo: horas × potência em W ÷ 1000 × tarifa por kWh. Alterações valem para novos pedidos; os anteriores mantêm sua base de cálculo.</p>
        <p id="energy-settings-error" class="recovery-error" role="alert"></p>
        <button class="primary">Salvar valores fixos</button>
      </form>`;
    if (!modal.open) modal.showModal();
    $('#close').onclick = () => modal.close();
    document.querySelectorAll('[data-profile-tab]').forEach((button) => {
      button.onclick = () => openProfile(button.dataset.profileTab);
    });
    $('#energy-settings-form').onsubmit = async (event) => {
      event.preventDefault();
      const button = event.target.querySelector('button');
      button.disabled = true;
      try {
        energySettings = await api('energy-settings', 'POST', Object.fromEntries(new FormData(event.target)));
        modal.close();
        toast('Valores fixos de energia salvos.');
      } catch (error) {
        $('#energy-settings-error').textContent = error.message;
        button.disabled = false;
      }
    };
  } catch (error) { toast(error.message); }
}

init();
