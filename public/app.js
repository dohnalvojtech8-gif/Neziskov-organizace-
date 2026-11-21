const view = document.querySelector('#view');
const notice = document.querySelector('#notice');
const config = await fetch('/config').then(response => response.json()).catch(() => null);
const demo = config && !config.url;
const storageKey = 'dotacnik:demo:v1';
const sessionKey = 'dotacnik:session:' + config?.url;
let session = readSession();
let data = {projects: [], sources: [], documents: [], allocations: []};
let screen = 'projects';
let projectId;
let sourceId;

const currency = new Intl.NumberFormat('cs-CZ', {style: 'currency', currency: 'CZK'});
const money = value => currency.format(value / 100);
const amounts = values => values.reduce((sum, item) => sum + Number(item.amount), 0);
const date = value => value ? new Intl.DateTimeFormat('cs-CZ', {dateStyle: 'medium', timeZone: 'UTC'}).format(new Date(value)) : '—';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);

function readSession() {
  try { return JSON.parse(sessionStorage.getItem(sessionKey)); } catch { return null; }
}

function notify(message = '', error = false) {
  notice.textContent = message;
  notice.hidden = !message;
  notice.classList.toggle('error', error);
}

async function request(path, options = {}, token = session?.access_token) {
  const headers = {apikey: config.key, 'Content-Type': 'application/json', ...options.headers};
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(config.url.replace(/\/$/, '') + path, {...options, headers});
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (body.code === '23505') throw new Error('Doklad s tímto číslem už v projektu existuje.');
    throw new Error(body.message || body.msg || body.error_description || 'Spojení se Supabase selhalo.');
  }
  const content = await response.text();
  return content ? JSON.parse(content) : null;
}

function setSession(value) {
  session = value;
  if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
  else sessionStorage.removeItem(sessionKey);
}

async function connect() {
  if (session?.expires_at && session.expires_at <= Date.now() / 1000 + 45) {
    try {
      await signIn('refresh_token', {refresh_token: session.refresh_token});
    } catch (error) {
      setSession(null);
      render();
      throw error;
    }
  }
}

async function signIn(grant, credentials) {
  const result = await request('/auth/v1/token?grant_type=' + grant, {
    method: 'POST', body: JSON.stringify(credentials)
  }, null);
  setSession({...result, expires_at: result.expires_at || Math.floor(Date.now() / 1000) + result.expires_in});
}

function sample() {
  return {
    projects: [{id: 'skate', name: 'Skatepark Liberec'}, {id: 'race', name: 'Závod na tříkolce'}],
    sources: [
      {id: 'city', project_id: 'skate', name: 'Město Liberec', kind: 'Dotace', budget: 20000000},
      {id: 'eu', project_id: 'skate', name: 'Evropská unie', kind: 'Dotace', budget: 80000000},
      {id: 'collection', project_id: 'skate', name: 'Veřejná sbírka', kind: 'Veřejná sbírka', budget: 18000000},
      {id: 'region', project_id: 'race', name: 'Kraj', kind: 'Dotace', budget: 1000000},
      {id: 'town', project_id: 'race', name: 'Město', kind: 'Dotace', budget: 500000}
    ],
    documents: [{id: 'invoice', project_id: 'skate', reference: 'FA-001', purpose: 'Přípravné stavební práce', issue_date: '2026-11-10', paid_on: null, total: 8000000}],
    allocations: [
      {project_id: 'skate', document_id: 'invoice', source_id: 'eu', category: 'Stavební práce', amount: 6000000},
      {project_id: 'skate', document_id: 'invoice', source_id: 'collection', category: 'Stavební práce', amount: 2000000}
    ]
  };
}

async function load() {
  if (demo) {
    data = JSON.parse(localStorage.getItem(storageKey)) || sample();
    return;
  }
  await connect();
  const tables = Object.keys(data);
  const rows = await Promise.all(tables.map(async table => {
    const result = [];
    const order = table === 'allocations' ? 'project_id,document_id,source_id' : 'id';
    for (let offset = 0; ; offset += 100) {
      const page = await request('/rest/v1/' + table + '?select=*&order=' + order + '&limit=100&offset=' + offset);
      result.push(...page);
      if (page.length < 100) return result;
    }
  }));
  data = Object.fromEntries(tables.map((table, index) => [table, rows[index]]));
}

const projectSources = id => data.sources.filter(item => item.project_id === id);
const sourceAllocations = id => data.allocations.filter(item => item.source_id === id);
const remaining = source => Number(source.budget) - amounts(sourceAllocations(source.id));
const nearest = sources => sources.map(source => source.deadline).filter(Boolean).sort()[0];
const field = (label, name, type = 'text', extra = 'required') => `<label>${label}<input name="${name}" type="${type}" ${extra}></label>`;
const cashField = (label, name) => field(label, name, 'text', 'inputmode="decimal" required placeholder="0,00"');
const button = (text, action, id = '') => `<button type="button" data-action="${action}" data-id="${esc(id)}">${text}</button>`;

function metrics(budget, assigned) {
  return `<div class="metrics"><div><small>Rozpočet</small><strong>${money(budget)}</strong></div>
    <div><small>Přiřazeno</small><strong>${money(assigned)}</strong></div>
    <div><small>Zbývá přiřadit</small><strong>${money(budget - assigned)}</strong></div></div>`;
}

function projectList() {
  return `<h1>Projekty</h1><p class="muted">${demo ? 'Ukázka s vašimi příklady. Změny se ukládají v tomto prohlížeči.' : 'Přehled rozpočtů, výdajů a termínů.'}</p>
    <div class="grid">${data.projects.map(project => {
      const sources = projectSources(project.id);
      const budget = sources.reduce((sum, source) => sum + Number(source.budget), 0);
      const assigned = amounts(data.allocations.filter(line => line.project_id === project.id));
      return `<article class="card"><h2>${esc(project.name)}</h2>${metrics(budget, assigned)}
        <progress aria-label="Přiřazená část rozpočtu" value="${assigned}" max="${budget || 1}"></progress>
        <p class="muted">Nejbližší vyúčtování: ${date(nearest(sources))}</p>${button('Otevřít projekt', 'project', project.id)}</article>`;
    }).join('')}</div>
    <section class="panel"><h2>Nový projekt</h2><form data-form="project">${field('Název projektu', 'name', 'text', 'required maxlength="160"')}<button class="primary">Přidat projekt</button></form></section>`;
}

function projectDetail(project) {
  const sources = projectSources(project.id);
  const docs = data.documents.filter(doc => doc.project_id === project.id);
  return `<div class="toolbar">${button('Všechny projekty', 'projects')}</div><h1>${esc(project.name)}</h1>
    <section class="panel"><h2>Zdroje financování</h2>${sourceTable(sources, false)}</section>
    <section class="panel"><h2>Doklady</h2>${documentTable(docs, null)}</section>
    <div class="grid">
      <section class="panel"><h2>Přidat zdroj</h2><form data-form="source">
        ${field('Poskytovatel nebo název zdroje', 'name', 'text', 'required maxlength="160"')}
        <label>Typ<select name="kind"><option>Dotace</option><option>Veřejná sbírka</option><option>Vlastní prostředky</option><option>Dar</option></select></label>
        ${cashField('Rozpočet v Kč', 'budget')}${field('Termín vyúčtování', 'deadline', 'date', '')}
        <button class="primary">Uložit zdroj</button></form></section>
      <section class="panel"><h2>Přidat doklad</h2>${sources.length ? documentForm() : '<p>Nejprve přidejte zdroj financování.</p>'}</section>
    </div>`;
}

function sourceTable(sources, showProject) {
  if (!sources.length) return '<p class="muted">Zatím tu nejsou žádné zdroje.</p>';
  return `<div class="table"><table><thead><tr>${showProject ? '<th>Projekt</th>' : ''}<th>Zdroj</th><th>Rozpočet</th><th>Přiřazeno</th><th>Zbývá</th><th>Termín</th></tr></thead>
  <tbody>${sources.map(source => `<tr>${showProject ? '<td>' + esc(data.projects.find(item => item.id === source.project_id)?.name) + '</td>' : ''}
    <td>${button(esc(source.name), 'source-detail', source.id)}<br><small>${esc(source.kind)}</small></td><td class="money">${money(source.budget)}</td>
    <td class="money">${money(Number(source.budget) - remaining(source))}</td><td class="money">${money(remaining(source))}</td><td>${date(source.deadline)}</td></tr>`).join('')}</tbody></table></div>`;
}

function documentTable(docs, source) {
  if (!docs.length) return '<p class="muted">Zatím tu nejsou žádné doklady.</p>';
  return `<div class="table"><table><thead><tr><th>Doklad a účel</th><th>Vystaveno</th><th>Úhrada</th><th>${source ? 'Z tohoto zdroje' : 'Celkem'}</th><th>Rozdělení dokladu</th></tr></thead>
    <tbody>${docs.map(doc => {
      const lines = data.allocations.filter(line => line.document_id === doc.id);
      return `<tr><td><strong>${esc(doc.reference)}</strong><br>${esc(doc.purpose)}</td><td>${date(doc.issue_date)}</td><td>${doc.paid_on ? date(doc.paid_on) : 'Neuhrazeno'}${source ? '' : `<details><summary>Upravit úhradu</summary>
        <form data-form="payment" data-id="${esc(doc.id)}"><label>Datum úhrady<input name="paid_on" type="date" value="${esc(doc.paid_on)}"></label>
        <button>Uložit úhradu</button></form></details>`}</td>
        <td class="money">${money(source ? lines.find(line => line.source_id === source.id)?.amount : doc.total)}</td>
        <td>${lines.map(line => esc(data.sources.find(item => item.id === line.source_id)?.name) + ' · ' + esc(line.category) + ' · ' + money(line.amount)).join('<br>')}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function documentForm() {
  return `<form data-form="document"><div class="form-grid">
    ${field('Číslo dokladu', 'reference', 'text', 'required maxlength="100"')}
    ${cashField('Částka dokladu v Kč', 'total')}
    ${field('Datum vystavení', 'issue_date', 'date')}
    ${field('Datum úhrady', 'paid_on', 'date', '')}</div>
    ${field('Účel výdaje', 'purpose', 'text', 'required maxlength="300"')}
    <div id="allocations">${allocationRow()}</div>
    <output id="difference" class="muted"></output>
    ${button('Přidat další zdroj', 'allocation')}
    <button class="primary">Uložit doklad</button></form>`;
}

function allocationRow() {
  return `<div class="allocation"><label>Zdroj<select name="source_id" required>
    <option value="">Vyberte zdroj</option>${projectSources(projectId).map(source => `<option value="${esc(source.id)}">${esc(source.name)} · zbývá ${money(remaining(source))}</option>`).join('')}</select></label>
    ${field('Rozpočtová položka', 'category', 'text', 'required maxlength="160"')}
    ${cashField('Přiřadit v Kč', 'amount')}${button('Odebrat', 'remove-row')}</div>`;
}

function render() {
  document.querySelector('#nav').hidden = !demo && !session;
  document.querySelector('#logout').hidden = Boolean(demo);
  for (const name of ['projects', 'reports']) {
    const active = name === 'projects' ? ['projects', 'project'].includes(screen) : ['reports', 'source'].includes(screen);
    const tab = document.querySelector('#' + name);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  if (!config) {
    view.innerHTML = '<h1>Aplikaci se nepodařilo načíst</h1><p>Zkuste obnovit stránku.</p>';
  } else if (!demo && !session) {
    view.innerHTML = `<section class="panel"><h1>Přihlášení</h1><form data-form="login">
      ${field('E-mail', 'email', 'email', 'required autocomplete="username"')}
      ${field('Heslo', 'password', 'password', 'required autocomplete="current-password"')}<button class="primary">Přihlásit se</button></form></section>`;
  } else if (screen === 'project') {
    view.innerHTML = projectDetail(data.projects.find(project => project.id === projectId));
  } else if (screen === 'reports') {
    const sources = [...data.sources].sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
    view.innerHTML = `<h1>Vyúčtování</h1><section class="panel">${sourceTable(sources, true)}</section>`;
  } else if (screen === 'source') {
    const source = data.sources.find(item => item.id === sourceId);
    const ids = new Set(sourceAllocations(sourceId).map(line => line.document_id));
    const docs = data.documents.filter(doc => ids.has(doc.id));
    const paid = amounts(sourceAllocations(sourceId).filter(line => docs.some(doc => doc.id === line.document_id && doc.paid_on)));
    view.innerHTML = `<div class="toolbar">${button('Přehled vyúčtování', 'reports')}${button('Otevřít projekt', 'project', source.project_id)}</div>
      <h1>${esc(source.name)}</h1><p class="muted">${esc(data.projects.find(item => item.id === source.project_id)?.name)} · Termín: ${date(source.deadline)}</p>
      <section class="panel">${metrics(Number(source.budget), Number(source.budget) - remaining(source))}
      <p>Uhrazeno z tohoto zdroje: <strong>${money(paid)}</strong></p></section>
      <section class="panel"><div class="toolbar"><h2>Doklady k vyúčtování</h2>${button('Stáhnout CSV pro Excel', 'export')}</div>${documentTable(docs, source)}</section>`;
  } else {
    view.innerHTML = projectList();
  }
}

function cents(raw) {
  const value = String(raw ?? '').replace(/\s/g, '').replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) return 0;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

function updateDifference() {
  const total = view.querySelector('[name="total"]');
  if (!total) return;
  const fields = [...view.querySelectorAll('[name="amount"]')];
  if (fields.length === 1 && fields[0].dataset.manual !== 'true') fields[0].value = total.value;
  const difference = cents(total.value) - fields.reduce((sum, input) => sum + cents(input.value), 0);
  view.querySelector('#difference').textContent = difference < 0
    ? 'Přiřazeno navíc: ' + money(-difference)
    : 'Zbývá rozdělit: ' + money(difference);
}

function csvValue(value) {
  let cell = String(value ?? '');
  if (/^[\s]*[=+\-@]|^[\t\r\n]/.test(cell)) cell = "'" + cell;
  return '"' + cell.replaceAll('"', '""') + '"';
}

function exportReport() {
  const rows = [['Číslo dokladu', 'Účel výdaje', 'Vystaveno', 'Uhrazeno', 'Rozpočtová položka', 'Z tohoto zdroje (Kč)', 'Celkem na dokladu (Kč)']];
  for (const line of sourceAllocations(sourceId)) {
    const doc = data.documents.find(item => item.id === line.document_id);
    if (!doc) continue;
    const decimal = amount => (amount / 100).toFixed(2).replace('.', ',');
    rows.push([doc.reference, doc.purpose, doc.issue_date, doc.paid_on, line.category, decimal(line.amount), decimal(doc.total)]);
  }
  const url = URL.createObjectURL(new Blob(['\ufeff' + rows.map(row => row.map(csvValue).join(';')).join('\r\n')], {type: 'text/csv;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = (data.sources.find(item => item.id === sourceId)?.name || 'vyuctovani').replace(/[^\p{L}\p{N} -]/gu, '_') + '.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function insert(table, row) {
  if (demo) {
    data[table].push({id: crypto.randomUUID(), ...row});
    localStorage.setItem(storageKey, JSON.stringify(data));
  } else {
    await request('/rest/v1/' + table, {method: 'POST', headers: {Prefer: 'return=minimal'}, body: JSON.stringify(row)});
  }
}

async function saveDocument(form, values) {
  const total = cents(values.total);
  const allocations = [...form.querySelectorAll('.allocation')].map(row => ({
    source_id: row.querySelector('[name="source_id"]').value,
    category: row.querySelector('[name="category"]').value.trim(),
    amount: cents(row.querySelector('[name="amount"]').value)
  }));
  if (!total || !allocations.length || allocations.some(row => !row.category || !row.amount)) throw new Error('Vyplňte platné kladné částky a názvy položek.');
  if (amounts(allocations) !== total) throw new Error('Rozdělení musí odpovídat částce dokladu.');
  if (new Set(allocations.map(row => row.source_id)).size !== allocations.length) throw new Error('Každý zdroj vyberte jen jednou.');
  if (allocations.some(line => !projectSources(projectId).some(source => source.id === line.source_id && remaining(source) >= line.amount))) {
    throw new Error('Částka překračuje dostupný rozpočet zdroje.');
  }
  const doc = {
    project_id: projectId, reference: values.reference.trim(), purpose: values.purpose.trim(),
    issue_date: values.issue_date, paid_on: values.paid_on || null, total
  };
  if (!doc.reference || !doc.purpose) throw new Error('Vyplňte číslo dokladu a účel výdaje.');
  if (demo) {
    if (data.documents.some(item => item.project_id === projectId && item.reference === doc.reference)) throw new Error('Doklad s tímto číslem už v projektu existuje.');
    const id = crypto.randomUUID();
    data.documents.push({id, ...doc});
    data.allocations.push(...allocations.map(line => ({...line, project_id: projectId, document_id: id})));
    localStorage.setItem(storageKey, JSON.stringify(data));
  } else {
    await request('/rest/v1/rpc/save_document', {method: 'POST', body: JSON.stringify({
      p_project: projectId, p_reference: doc.reference, p_purpose: doc.purpose, p_issue_date: doc.issue_date,
      p_paid_on: doc.paid_on, p_total: total, p_allocations: allocations
    })});
  }
}

view.addEventListener('input', event => {
  if (event.target.name === 'amount') event.target.dataset.manual = 'true';
  updateDifference();
});

view.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const {action, id} = target.dataset;
  if (action === 'allocation') {
    view.querySelector('#allocations').insertAdjacentHTML('beforeend', allocationRow());
    updateDifference();
  } else if (action === 'remove-row') {
    if (view.querySelectorAll('.allocation').length > 1) target.closest('.allocation').remove();
    updateDifference();
  } else if (action === 'export') {
    exportReport();
  } else {
    if (action === 'project') projectId = id;
    if (action === 'source-detail') sourceId = id;
    navigate(action === 'source-detail' ? 'source' : action);
  }
});

function navigate(next) {
  screen = next;
  notify();
  render();
}

document.querySelector('#projects').onclick = () => navigate('projects');
document.querySelector('#reports').onclick = () => navigate('reports');
document.querySelector('#logout').onclick = async () => {
  const token = session?.access_token;
  setSession(null);
  data = {projects: [], sources: [], documents: [], allocations: []};
  navigate('projects');
  if (token) await request('/auth/v1/logout?scope=local', {method: 'POST'}, token).catch(() => {});
};

view.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const submit = form.querySelector('button:not([type="button"])');
  submit.disabled = true;
  const values = Object.fromEntries(new FormData(form));
  const kind = form.dataset.form;
  let saved = false;
  try {
    if (kind === 'login') {
      await signIn('password', values);
    } else {
      if (!demo) await connect();
      if (kind === 'project' || kind === 'source') {
        const name = values.name.trim();
        if (!name) throw new Error('Vyplňte název.');
        if (kind === 'project') await insert('projects', {name});
        else {
          const budget = cents(values.budget);
          if (!budget) throw new Error('Zadejte kladný rozpočet v Kč.');
          await insert('sources', {project_id: projectId, name, budget, kind: values.kind, deadline: values.deadline || null});
        }
      } else if (kind === 'document') {
        await saveDocument(form, values);
      } else if (kind === 'payment') {
        const id = form.dataset.id;
        const paid_on = values.paid_on || null;
        if (demo) {
          data.documents.find(item => item.id === id).paid_on = paid_on;
          localStorage.setItem(storageKey, JSON.stringify(data));
        } else {
          await request('/rest/v1/documents?id=eq.' + encodeURIComponent(id), {
            method: 'PATCH', headers: {Prefer: 'return=minimal'}, body: JSON.stringify({paid_on})
          });
        }
      }
      saved = true;
    }
    await load();
    render();
    notify(kind === 'login' ? '' : 'Uloženo.');
  } catch (error) {
    if (saved) render();
    notify(saved ? 'Změna byla uložena. Přehled obnovte načtením stránky.' : error.message, true);
  } finally {
    submit.disabled = false;
  }
});

try {
  if (demo || session) await load();
  render();
} catch (error) {
  render();
  notify(error.message, true);
}
