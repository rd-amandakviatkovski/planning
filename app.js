/* ==========================================================================
 * PLANNING SEMANAL — frontend + acesso ao banco (Supabase)
 *
 * Este arquivo substitui o antigo par Code.gs + JavaScript.html do Apps
 * Script. A estrutura de dados em memória (DATA) continua com o mesmo
 * formato de antes (Links, Semana, Entregas, etc. com os mesmos nomes de
 * campo em PascalCase), então quase toda a lógica de renderização da tela
 * é igual — só troca quem fala com o banco.
 * ========================================================================== */

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

// Nome da tabela no Supabase para cada "aba" de antes
const TABLES = {
  Links: 'links', Semana: 'semana', Entregas: 'entregas', Grupos: 'grupos',
  Subtarefas: 'subtarefas', JiraLinks: 'jira_links', ParaPensar: 'para_pensar',
  Planning: 'planning', Reunioes: 'reunioes'
};

// De-para entre o nome do campo usado no front (PascalCase, igual antes)
// e o nome da coluna no Postgres (snake_case).
const FIELD_MAP = {
  Links:      { Icone: 'icone', Texto: 'texto', URL: 'url' },
  Semana:     { Dia: 'dia', Texto: 'texto', Concluido: 'concluido', SemanaID: 'semana_id' },
  Entregas:   { Prioridade: 'prioridade', Entrega: 'entrega', Status: 'status' },
  Grupos:     { ID: 'id', Nome: 'nome' },
  Subtarefas: { GrupoID: 'grupo_id', Texto: 'texto', Concluido: 'concluido' },
  JiraLinks:  { GrupoID: 'grupo_id', Texto: 'texto', URL: 'url' },
  ParaPensar: { Tarefa: 'tarefa', Documento: 'documento', DocumentoURL: 'documento_url', Prioridade: 'prioridade' },
  Planning:   { Outcomes: 'outcomes', Bloqueios: 'bloqueios' },
  Reunioes:   { Reuniao: 'reuniao', Documentos: 'documentos', DocumentosURL: 'documentos_url', ToDos: 'todos' }
};

const TABLE_CONFIG = {
  Entregas:   { tbody: 'entregasTable',  cols: [
    { key: 'Prioridade', type: 'select', options: ['Alta', 'Média', 'Baixa'] },
    { key: 'Entrega', type: 'text', placeholder: 'Descreva a entrega' },
    { key: 'Status', type: 'select', options: ['standby', 'andamento', 'concluído'] }
  ]},
  ParaPensar: { tbody: 'pensarTable', cols: [
    { key: 'Tarefa', type: 'text', placeholder: 'Nome da tarefa central' },
    { key: 'Documento', type: 'linkname', urlKey: 'DocumentoURL', placeholder: 'Nome do documento' },
    { key: 'Prioridade', type: 'select', options: ['Alta', 'Média', 'Baixa'] }
  ]},
  Reunioes:   { tbody: 'reunioesTable', cols: [
    { key: 'Reuniao', type: 'text', placeholder: 'Nome da reunião' },
    { key: 'Documentos', type: 'linkname', urlKey: 'DocumentosURL', placeholder: 'Nome do documento' },
    { key: 'ToDos', type: 'text', placeholder: 'O que ficou de ação' }
  ]}
};

let DATA = { Links: [], Semana: [], Entregas: [], Grupos: [], Subtarefas: [], JiraLinks: [], ParaPensar: [], Planning: [], Reunioes: [] };
let currentWeekId = null;
let viewWeekId = null;
let weeksList = [];
let plannedWeeks = [];

document.addEventListener('DOMContentLoaded', loadAll);

/* ---------------- Tradução de campos front <-> banco ---------------- */
function toDb(sheetName, jsData) {
  const map = FIELD_MAP[sheetName];
  const payload = {};
  Object.keys(jsData).forEach(function (jsKey) {
    if (map[jsKey]) payload[map[jsKey]] = jsData[jsKey];
  });
  return payload;
}
function fromDb(sheetName, row) {
  const map = FIELD_MAP[sheetName];
  const obj = { _id: row.id };
  Object.keys(map).forEach(function (jsKey) { obj[jsKey] = row[map[jsKey]]; });
  return obj;
}

/* ---------------- Carga inicial ---------------- */
async function loadAll() {
  try {
    const names = Object.keys(TABLES);
    const results = await Promise.all(names.map(fetchTable));
    names.forEach(function (name, i) { DATA[name] = results[i]; });

    if (!DATA.Planning.length) {
      const p = await sbInsertOne('Planning', { Outcomes: '', Bloqueios: '' });
      DATA.Planning = [p];
    }

    currentWeekId = await getCurrentWeekId();
    plannedWeeks = await getPlannedWeeks();
    weeksList = await listWeeks();
    viewWeekId = currentWeekId;
    renderAll();
  } catch (err) {
    onError(err);
  }
}
async function fetchTable(sheetName) {
  const table = TABLES[sheetName];
  const { data, error } = await sb.from(table).select('*').order('id', { ascending: true });
  if (error) throw error;
  return data.map(function (row) { return fromDb(sheetName, row); });
}
function onError(err) {
  console.error(err);
  const tag = document.getElementById('tagline');
  if (tag) tag.textContent = 'Erro ao carregar. Veja o console (F12).';
}
function renderAll() {
  renderLinks();
  renderWeekSelector();
  renderWeek();
  renderPulse();
  renderTableFor('Entregas');
  renderGrupos();
  renderTableFor('ParaPensar');
  renderPlanning();
  renderTableFor('Reunioes');
}

function weekLabel(id) {
  if (!id) return '';
  const parts = id.split('-'); // yyyy-mm-dd(-sufixo)
  return 'Semana de ' + parts[2] + '/' + parts[1] + '/' + parts[0];
}
function genId() { return 'g' + Date.now() + Math.floor(Math.random() * 1000); }
function shortId() { return Math.random().toString(36).slice(2, 6); }

function flash() {
  const el = document.getElementById('saveFlash');
  el.classList.add('show');
  clearTimeout(flash._t);
  flash._t = setTimeout(function () { el.classList.remove('show'); }, 1100);
}

/* ---------------- CRUD genérico contra o Supabase ---------------- */
async function sbInsertOne(sheetName, jsData) {
  const table = TABLES[sheetName];
  const payload = toDb(sheetName, jsData);
  const { data, error } = await sb.from(table).insert(payload).select().single();
  if (error) throw error;
  return fromDb(sheetName, data);
}

// obj é o objeto que já está (otimisticamente) em DATA[sheetName]; assim que
// o insert confirma, guardamos o id real nele (_id). Se uma edição ou
// exclusão for tentada antes do insert terminar, ela fica "pendurada" em
// obj._pending / obj._pendingDelete e é aplicada logo em seguida — mesma
// ideia de segurança que já usávamos no Apps Script.
async function apiAdd(sheetName, jsData, obj) {
  try {
    const table = TABLES[sheetName];
    const payload = toDb(sheetName, jsData);
    const { data, error } = await sb.from(table).insert(payload).select().single();
    if (error) throw error;
    flash();
    if (obj) {
      obj._id = data.id;
      if (obj._pendingDelete) { apiDelete(sheetName, obj); return; }
      if (obj._pending) {
        const pending = obj._pending;
        delete obj._pending;
        apiUpdate(sheetName, obj, pending);
      }
    }
  } catch (err) { onError(err); }
}
async function apiUpdate(sheetName, obj, jsData) {
  if (obj._id === null || obj._id === undefined) {
    obj._pending = Object.assign(obj._pending || {}, jsData);
    return;
  }
  try {
    const table = TABLES[sheetName];
    const payload = toDb(sheetName, jsData);
    const { error } = await sb.from(table).update(payload).eq('id', obj._id);
    if (error) throw error;
    flash();
  } catch (err) { onError(err); }
}
async function apiDelete(sheetName, obj) {
  if (obj._id === null || obj._id === undefined) {
    obj._pendingDelete = true;
    return;
  }
  try {
    const table = TABLES[sheetName];
    const { error } = await sb.from(table).delete().eq('id', obj._id);
    if (error) throw error;
    flash();
  } catch (err) { onError(err); }
}

/* ---------------- Modal personalizado (substitui prompt() do navegador) ---------------- */
let modalCallback = null;
function customPrompt(title, placeholder, onConfirm) {
  modalCallback = onConfirm;
  document.getElementById('modalTitle').textContent = title;
  const inp = document.getElementById('modalInput');
  inp.value = '';
  inp.placeholder = placeholder || '';
  document.getElementById('modalOverlay').classList.add('show');
  setTimeout(function () { inp.focus(); }, 50);
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
  modalCallback = null;
}
function confirmModal() {
  const inp = document.getElementById('modalInput');
  const val = inp.value.trim();
  const cb = modalCallback;
  closeModal();
  if (val && cb) cb(val);
}
document.addEventListener('keydown', function (e) {
  const overlay = document.getElementById('modalOverlay');
  if (overlay && overlay.classList.contains('show')) {
    if (e.key === 'Enter') { e.preventDefault(); confirmModal(); }
    if (e.key === 'Escape') closeModal();
  }
});
function onModalOverlayClick(e) {
  if (e.target.id === 'modalOverlay') closeModal();
}

/* ---------------- Links / badges ---------------- */
function renderLinks() {
  const box = document.getElementById('badges');
  box.innerHTML = '';
  DATA.Links.forEach(function (r) {
    const span = document.createElement('span');
    span.className = 'badge';
    const a = document.createElement('a');
    a.href = r.URL || '#'; a.target = '_blank'; a.title = r.URL || '';
    a.textContent = (r.Icone || '🔗') + ' ' + r.Texto;
    const x = document.createElement('span');
    x.className = 'x'; x.textContent = '✕';
    x.onclick = function () { DATA.Links = DATA.Links.filter(function (l) { return l !== r; }); renderLinks(); apiDelete('Links', r); };
    span.appendChild(a); span.appendChild(x);
    box.appendChild(span);
  });
}
function addLink() {
  const icone = document.getElementById('newLinkIcon').value || '🔗';
  const texto = document.getElementById('newLinkText').value.trim();
  const url = document.getElementById('newLinkUrl').value.trim();
  if (!texto) return;
  const obj = { Icone: icone, Texto: texto, URL: url, _id: null };
  DATA.Links.push(obj); renderLinks();
  document.getElementById('newLinkIcon').value = '';
  document.getElementById('newLinkText').value = '';
  document.getElementById('newLinkUrl').value = '';
  apiAdd('Links', { Icone: icone, Texto: texto, URL: url }, obj);
}

/* ---------------- Semanas (settings: currentWeekId / plannedWeeks) ---------------- */
function formatWeekId(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}
async function getSetting(key) {
  const { data, error } = await sb.from('settings').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data ? data.value : null;
}
async function setSetting(key, value) {
  const { error } = await sb.from('settings').upsert({ key: key, value: value });
  if (error) throw error;
}
async function getCurrentWeekId() {
  let id = await getSetting('currentWeekId');
  if (!id) {
    id = formatWeekId(new Date());
    await setSetting('currentWeekId', id);
  }
  return id;
}
async function getPlannedWeeks() {
  const raw = await getSetting('plannedWeeks');
  return raw ? JSON.parse(raw) : [];
}
async function savePlannedWeeks(list) {
  await setSetting('plannedWeeks', JSON.stringify(list));
}
async function listWeeks() {
  const ids = {};
  DATA.Semana.forEach(function (r) { if (r.SemanaID) ids[r.SemanaID] = true; });
  ids[currentWeekId] = true;
  plannedWeeks.forEach(function (id) { ids[id] = true; });
  return Object.keys(ids).sort().reverse();
}

/* ---------------- Semana (kanban) ---------------- */
function weekKind(id) {
  if (id === currentWeekId) return 'current';
  if (plannedWeeks.indexOf(id) !== -1) return 'planned';
  return 'past';
}
function renderWeekSelector() {
  const sel = document.getElementById('weekSelect');
  sel.innerHTML = '';
  weeksList.forEach(function (id) {
    const opt = document.createElement('option');
    opt.value = id;
    const kind = weekKind(id);
    const tag = kind === 'current' ? ' (atual)' : (kind === 'planned' ? ' (planejada)' : '');
    opt.textContent = weekLabel(id) + tag;
    if (id === viewWeekId) opt.selected = true;
    sel.appendChild(opt);
  });
}
function onWeekSelectChange() {
  viewWeekId = document.getElementById('weekSelect').value;
  renderWeek(); renderPulse();
}
async function planFutureWeek() {
  try {
    const today = new Date();
    const day = today.getDay();
    const diffToMonday = (8 - day) % 7 || 7;
    const next = new Date(today);
    next.setDate(today.getDate() + diffToMonday);
    let id = formatWeekId(next);
    if (id === currentWeekId || plannedWeeks.indexOf(id) !== -1) id = id + '-' + shortId();
    plannedWeeks.push(id);
    await savePlannedWeeks(plannedWeeks);
    flash();
    if (weeksList.indexOf(id) === -1) weeksList.push(id);
    weeksList.sort().reverse();
    viewWeekId = id;
    renderWeekSelector(); renderWeek(); renderPulse();
  } catch (err) { onError(err); }
}
async function promoteCurrentView() {
  if (!confirm('Tornar "' + weekLabel(viewWeekId) + '" a semana atual? A semana atual de hoje passa a ficar no histórico.')) return;
  try {
    await setSetting('currentWeekId', viewWeekId);
    plannedWeeks = plannedWeeks.filter(function (x) { return x !== viewWeekId; });
    await savePlannedWeeks(plannedWeeks);
    flash();
    await loadAll();
  } catch (err) { onError(err); }
}
// Igual à correção que fizemos no Apps Script: copia as tarefas da semana
// anterior em UMA escrita só (array inteiro no insert), não uma por uma.
async function endWeek(copyPrevious) {
  const msg = copyPrevious
    ? 'Isso inicia uma semana nova copiando as tarefas da semana atual (desmarcadas). A semana atual continua salva e acessível pelo filtro. Continuar?'
    : 'Isso inicia uma semana nova em branco. As tarefas desta semana continuam salvas e acessíveis pelo filtro. Continuar?';
  if (!confirm(msg)) return;
  try {
    const previousId = currentWeekId;
    let newId = formatWeekId(new Date());
    if (newId === previousId) newId = newId + '-' + shortId();
    await setSetting('currentWeekId', newId);
    if (copyPrevious) {
      const rowsToCopy = DATA.Semana.filter(function (r) { return r.SemanaID === previousId; });
      if (rowsToCopy.length) {
        const payload = rowsToCopy.map(function (r) {
          return toDb('Semana', { Dia: r.Dia, Texto: r.Texto, Concluido: false, SemanaID: newId });
        });
        const { error } = await sb.from('semana').insert(payload);
        if (error) throw error;
      }
    }
    flash();
    await loadAll();
  } catch (err) { onError(err); }
}
function renderWeek() {
  const board = document.getElementById('weekBoard');
  const kind = weekKind(viewWeekId);
  board.classList.toggle('readonly', kind === 'past');
  const promoteBtn = document.getElementById('promoteBtn');
  if (promoteBtn) promoteBtn.style.display = kind === 'planned' ? 'inline-block' : 'none';
  board.innerHTML = '';
  DIAS.forEach(function (dia) {
    const col = document.createElement('div');
    col.className = 'day-col';
    const h3 = document.createElement('h3'); h3.textContent = dia;
    col.appendChild(h3);
    DATA.Semana.filter(function (t) { return t.Dia === dia && t.SemanaID === viewWeekId; }).forEach(function (t) {
      col.appendChild(buildTaskItem(t));
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'add-task'; addBtn.textContent = '+ adicionar tarefa';
    addBtn.onclick = function () { addTask(dia); };
    col.appendChild(addBtn);
    board.appendChild(col);
  });
}
function buildTaskItem(t) {
  const item = document.createElement('div');
  item.className = 'task-item' + (t.Concluido ? ' done' : '');
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = !!t.Concluido;
  cb.onchange = function () { toggleTask(t); };
  const txt = document.createElement('div');
  txt.className = 'txt'; txt.contentEditable = 'true'; txt.textContent = t.Texto;
  txt.onblur = function () { editTaskText(t, txt.textContent.trim()); };
  txt.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); txt.blur(); } };
  const del = document.createElement('span');
  del.className = 'del'; del.textContent = '✕';
  del.onclick = function () { deleteTask(t); };
  item.appendChild(cb); item.appendChild(txt); item.appendChild(del);
  return item;
}
function addTask(dia) {
  customPrompt('Nova tarefa — ' + dia, 'Descreva a tarefa...', function (txt) {
    const obj = { Dia: dia, Texto: txt, Concluido: false, SemanaID: viewWeekId, _id: null };
    DATA.Semana.push(obj); renderWeek(); renderPulse();
    apiAdd('Semana', { Dia: dia, Texto: txt, Concluido: false, SemanaID: viewWeekId }, obj);
  });
}
function toggleTask(t) {
  t.Concluido = !t.Concluido;
  apiUpdate('Semana', t, { Concluido: t.Concluido });
  renderWeek(); renderPulse();
}
function editTaskText(t, newText) {
  t.Texto = newText;
  apiUpdate('Semana', t, { Texto: newText });
}
function deleteTask(t) {
  DATA.Semana = DATA.Semana.filter(function (r) { return r !== t; });
  renderWeek(); renderPulse();
  apiDelete('Semana', t);
}

/* ---------------- Pulse (resumo da semana) ---------------- */
function renderPulse() {
  const weekTasks = DATA.Semana.filter(function (t) { return t.SemanaID === viewWeekId; });
  const total = weekTasks.length;
  const done = weekTasks.filter(function (t) { return t.Concluido; }).length;
  document.getElementById('tagline').textContent = total
    ? done + ' de ' + total + ' tarefas concluídas — ' + weekLabel(viewWeekId)
    : weekLabel(viewWeekId) + ' — Consistência no que importa.';
  const box = document.getElementById('pulseDays');
  box.innerHTML = '';
  DIAS.forEach(function (dia) {
    const tasks = weekTasks.filter(function (t) { return t.Dia === dia; });
    const d = tasks.filter(function (t) { return t.Concluido; }).length;
    const t = tasks.length;
    const wrap = document.createElement('div');
    wrap.className = 'pulse-day' + (t > 0 && d === t ? ' full' : (d > 0 ? ' partial' : ''));
    wrap.innerHTML = '<div class="ring">' + (t ? d + '/' + t : '–') + '</div><div class="lbl">' + dia.slice(0, 3) + '</div>';
    box.appendChild(wrap);
  });
}

/* ---------------- Entregas: filtros e ordenação ---------------- */
let entregasFilters = { status: 'Todos', prioridade: 'Todos', sortAsc: null };
function getFilteredEntregas() {
  let rows = DATA.Entregas.slice();
  if (entregasFilters.status !== 'Todos') rows = rows.filter(function (r) { return r.Status === entregasFilters.status; });
  if (entregasFilters.prioridade !== 'Todos') rows = rows.filter(function (r) { return r.Prioridade === entregasFilters.prioridade; });
  if (entregasFilters.sortAsc !== null) {
    rows.sort(function (a, b) {
      const cmp = (a.Entrega || '').localeCompare(b.Entrega || '', 'pt-BR', { sensitivity: 'base' });
      return entregasFilters.sortAsc ? cmp : -cmp;
    });
  }
  return rows;
}
function onEntregasFilterChange() {
  entregasFilters.status = document.getElementById('filterStatus').value;
  entregasFilters.prioridade = document.getElementById('filterPrioridade').value;
  renderTableFor('Entregas');
}
function toggleEntregasSort() {
  entregasFilters.sortAsc = !(entregasFilters.sortAsc === true);
  const btn = document.getElementById('sortBtn');
  btn.textContent = entregasFilters.sortAsc ? 'Entrega A → Z' : 'Entrega Z → A';
  btn.classList.add('active');
  renderTableFor('Entregas');
}

/* ---------------- Tabelas genéricas (Entregas, ParaPensar, Reunioes) ---------------- */
function renderTableFor(sheetName) {
  const cfg = TABLE_CONFIG[sheetName];
  const tbody = document.querySelector('#' + cfg.tbody + ' tbody');
  tbody.innerHTML = '';
  const rows = sheetName === 'Entregas' ? getFilteredEntregas() : DATA[sheetName];
  if (!rows.length) {
    const tr = document.createElement('tr');
    const totalCols = cfg.cols.length + 1;
    const msg = (sheetName === 'Entregas' && DATA.Entregas.length)
      ? 'Nenhum item bate com esse filtro.'
      : 'Nenhum item ainda.';
    tr.innerHTML = '<td colspan="' + totalCols + '" class="empty-row">' + msg + '</td>';
    tbody.appendChild(tr);
    return;
  }
  rows.forEach(function (r) {
    const tr = document.createElement('tr');
    cfg.cols.forEach(function (c) {
      const td = document.createElement('td');
      if (c.type === 'select') {
        const sel = document.createElement('select');
        sel.className = 'pill-select pill ' + String(r[c.key] || '').replace(/\s/g, '');
        c.options.forEach(function (o) {
          const opt = document.createElement('option');
          opt.value = o; opt.textContent = o;
          if (r[c.key] === o) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.onchange = function () {
          sel.className = 'pill-select pill ' + this.value.replace(/\s/g, '');
          const upd = {}; upd[c.key] = this.value;
          apiUpdate(sheetName, r, upd);
          r[c.key] = this.value;
        };
        td.appendChild(sel);
      } else if (c.type === 'linkname') {
        const wrap = document.createElement('div'); wrap.className = 'linkname-cell';
        const nameInp = document.createElement('input');
        nameInp.type = 'text'; nameInp.className = 'name-input';
        nameInp.value = r[c.key] || ''; nameInp.placeholder = c.placeholder || 'Nome';
        nameInp.onblur = function () {
          const upd = {}; upd[c.key] = this.value;
          apiUpdate(sheetName, r, upd);
          r[c.key] = this.value;
        };
        const urlRow = document.createElement('div'); urlRow.className = 'url-row';
        const urlInp = document.createElement('input');
        urlInp.type = 'text'; urlInp.className = 'url-input';
        urlInp.value = r[c.urlKey] || ''; urlInp.placeholder = 'https://...';
        const openBtn = document.createElement('a');
        openBtn.className = 'link-open-btn'; openBtn.textContent = '↗';
        openBtn.target = '_blank'; openBtn.title = 'Abrir link';
        const refreshOpenBtn = function () {
          const v = (urlInp.value || '').trim();
          if (/^https?:\/\//i.test(v)) { openBtn.href = v; openBtn.style.display = 'inline-flex'; }
          else { openBtn.style.display = 'none'; }
        };
        refreshOpenBtn();
        urlInp.oninput = refreshOpenBtn;
        urlInp.onblur = function () {
          const upd = {}; upd[c.urlKey] = this.value;
          apiUpdate(sheetName, r, upd);
          r[c.urlKey] = this.value;
        };
        urlRow.appendChild(urlInp); urlRow.appendChild(openBtn);
        wrap.appendChild(nameInp); wrap.appendChild(urlRow);
        td.appendChild(wrap);
      } else {
        const inp = document.createElement('input');
        inp.type = 'text'; inp.value = r[c.key] || ''; inp.placeholder = c.placeholder || '';
        inp.style.border = 'none'; inp.style.background = 'transparent'; inp.style.padding = '4px';
        inp.onblur = function () {
          const upd = {}; upd[c.key] = this.value;
          apiUpdate(sheetName, r, upd);
          r[c.key] = this.value;
        };
        td.appendChild(inp);
      }
      tr.appendChild(td);
    });
    const delTd = document.createElement('td'); delTd.className = 'del-col';
    const delBtn = document.createElement('button'); delBtn.className = 'icon-btn'; delBtn.textContent = '✕';
    delBtn.onclick = function () {
      DATA[sheetName] = DATA[sheetName].filter(function (x) { return x !== r; });
      renderTableFor(sheetName);
      apiDelete(sheetName, r);
    };
    delTd.appendChild(delBtn);
    tr.appendChild(delTd);
    tbody.appendChild(tr);
  });
}
function addRowOptimistic(sheetName, data) {
  const obj = Object.assign({ _id: null }, data);
  DATA[sheetName].push(obj);
  renderTableFor(sheetName);
  apiAdd(sheetName, data, obj);
}
function addEntrega() { addRowOptimistic('Entregas', { Prioridade: 'Baixa', Entrega: '', Status: 'standby' }); }
function addPensar()  { addRowOptimistic('ParaPensar', { Tarefa: '', Documento: '', DocumentoURL: '', Prioridade: 'Baixa' }); }
function addReuniao() { addRowOptimistic('Reunioes', { Reuniao: '', Documentos: '', DocumentosURL: '', ToDos: '' }); }

/* ---------------- Tarefas da semana (grupos) ---------------- */
const collapsedGroups = new Set();

function renderGrupos() {
  const list = document.getElementById('gruposList');
  list.innerHTML = '';
  if (!DATA.Grupos.length) {
    list.innerHTML = '<p class="empty-row">Nenhum grupo de tarefas ainda.</p>';
    return;
  }
  DATA.Grupos.forEach(function (g, idx) {
    const wrap = document.createElement('div');
    wrap.className = 'grupo' + (collapsedGroups.has(g.ID) ? ' collapsed' : '');

    const head = document.createElement('div');
    head.className = 'grupo-head';
    head.innerHTML = '<div class="idx">' + (idx + 1) + '</div>';
    const nome = document.createElement('input');
    nome.className = 'nome'; nome.value = g.Nome; nome.type = 'text';
    nome.onclick = function (e) { e.stopPropagation(); };
    nome.onblur = function () { apiUpdate('Grupos', g, { Nome: nome.value }); g.Nome = nome.value; };
    head.appendChild(nome);
    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn'; delBtn.textContent = '✕';
    delBtn.onclick = function (e) { e.stopPropagation(); deleteGrupo(g); };
    head.appendChild(delBtn);
    const chev = document.createElement('span'); chev.className = 'chev'; chev.textContent = '▾';
    head.appendChild(chev);
    head.onclick = function () {
      if (collapsedGroups.has(g.ID)) collapsedGroups.delete(g.ID);
      else collapsedGroups.add(g.ID);
      renderGrupos();
    };
    wrap.appendChild(head);

    const body = document.createElement('div'); body.className = 'grupo-body';

    const subCol = document.createElement('div'); subCol.className = 'grupo-sub';
    subCol.innerHTML = '<h4>Subtarefas</h4>';
    DATA.Subtarefas.filter(function (s) { return s.GrupoID === g.ID; }).forEach(function (s) { subCol.appendChild(buildSubtaskItem(s)); });
    const addSub = document.createElement('button');
    addSub.className = 'add-task'; addSub.textContent = '+ adicionar subtarefa';
    addSub.onclick = function () { addSubtask(g.ID); };
    subCol.appendChild(addSub);
    body.appendChild(subCol);

    const linkCol = document.createElement('div'); linkCol.className = 'grupo-links';
    linkCol.innerHTML = '<h4>Links (Jira / docs)</h4>';
    DATA.JiraLinks.filter(function (l) { return l.GrupoID === g.ID; }).forEach(function (l) {
      const row = document.createElement('div'); row.className = 'link-row';
      row.innerHTML = '<a href="' + l.URL + '" target="_blank" title="' + l.URL + '">📄 ' + l.Texto + '</a>';
      const del = document.createElement('span'); del.className = 'del'; del.style.opacity = '.6'; del.textContent = '✕';
      del.style.cursor = 'pointer';
      del.onclick = function () { deleteGLink(l); };
      row.appendChild(del);
      linkCol.appendChild(row);
    });
    if (openLinkForms.has(g.ID)) {
      linkCol.appendChild(buildLinkForm(g.ID));
    } else {
      const addL = document.createElement('button');
      addL.className = 'add-task'; addL.textContent = '+ adicionar link';
      addL.onclick = function () { toggleLinkForm(g.ID); };
      linkCol.appendChild(addL);
    }
    body.appendChild(linkCol);

    wrap.appendChild(body);
    list.appendChild(wrap);
  });
}
let scheduleOpenFor = null;
function buildSubtaskItem(s) {
  const item = document.createElement('div');
  item.className = 'task-item' + (s.Concluido ? ' done' : '');
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = !!s.Concluido;
  cb.onchange = function () { toggleSubtask(s); };
  const txt = document.createElement('div');
  txt.className = 'txt'; txt.contentEditable = 'true'; txt.textContent = s.Texto;
  txt.onblur = function () { apiUpdate('Subtarefas', s, { Texto: txt.textContent.trim() }); s.Texto = txt.textContent.trim(); };
  txt.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); txt.blur(); } };
  const cal = document.createElement('span');
  cal.className = 'cal-btn'; cal.textContent = '📅'; cal.title = 'Agendar em um dia da semana';
  cal.onclick = function () { scheduleOpenFor = (scheduleOpenFor === s) ? null : s; renderGrupos(); };
  const del = document.createElement('span'); del.className = 'del'; del.textContent = '✕';
  del.onclick = function () { deleteSubtask(s); };
  item.appendChild(cb); item.appendChild(txt); item.appendChild(cal); item.appendChild(del);

  if (scheduleOpenFor === s) {
    const picker = document.createElement('div');
    picker.className = 'day-picker';
    DIAS.forEach(function (dia) {
      const chip = document.createElement('button');
      chip.type = 'button'; chip.className = 'day-chip'; chip.textContent = dia.slice(0, 3);
      chip.onclick = function () { scheduleSubtaskToDay(s, dia); };
      picker.appendChild(chip);
    });
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'day-chip cancel'; cancel.textContent = 'Cancelar';
    cancel.onclick = function () { scheduleOpenFor = null; renderGrupos(); };
    picker.appendChild(cancel);
    const wrap = document.createElement('div');
    wrap.appendChild(item); wrap.appendChild(picker);
    return wrap;
  }
  return item;
}
function scheduleSubtaskToDay(s, dia) {
  const obj = { Dia: dia, Texto: s.Texto, Concluido: false, SemanaID: viewWeekId, _id: null };
  DATA.Semana.push(obj);
  scheduleOpenFor = null;
  renderGrupos(); renderWeek(); renderPulse();
  apiAdd('Semana', { Dia: dia, Texto: s.Texto, Concluido: false, SemanaID: viewWeekId }, obj);
}
function addGrupo() {
  // O ID é gerado aqui mesmo, no navegador, e usado como chave primária no
  // banco — por isso já sabemos o _id na hora, sem precisar esperar o
  // insert confirmar (diferente das outras tabelas, que usam id automático).
  const id = genId();
  const obj = { ID: id, Nome: 'Novo grupo de tarefas', _id: id };
  DATA.Grupos.push(obj); renderGrupos();
  apiAdd('Grupos', { ID: id, Nome: 'Novo grupo de tarefas' }, obj);
}
async function deleteGrupo(g) {
  if (!confirm('Excluir este grupo e todas as suas subtarefas e links?')) return;
  const grupoId = g.ID;
  DATA.Grupos = DATA.Grupos.filter(function (x) { return x !== g; });
  DATA.Subtarefas = DATA.Subtarefas.filter(function (s) { return s.GrupoID !== grupoId; });
  DATA.JiraLinks = DATA.JiraLinks.filter(function (l) { return l.GrupoID !== grupoId; });
  collapsedGroups.delete(grupoId);
  renderGrupos();
  // O banco tem "on delete cascade" nas tabelas subtarefas e jira_links,
  // então apagar o grupo já limpa tudo relacionado automaticamente.
  apiDelete('Grupos', g);
}
function addSubtask(grupoId) {
  customPrompt('Nova subtarefa', 'Descreva a subtarefa...', function (txt) {
    const obj = { GrupoID: grupoId, Texto: txt, Concluido: false, _id: null };
    DATA.Subtarefas.push(obj); renderGrupos();
    apiAdd('Subtarefas', { GrupoID: grupoId, Texto: txt, Concluido: false }, obj);
  });
}
function toggleSubtask(s) {
  s.Concluido = !s.Concluido;
  apiUpdate('Subtarefas', s, { Concluido: s.Concluido });
  renderGrupos();
}
function deleteSubtask(s) {
  DATA.Subtarefas = DATA.Subtarefas.filter(function (x) { return x !== s; });
  renderGrupos();
  apiDelete('Subtarefas', s);
}
const openLinkForms = new Set();
function toggleLinkForm(grupoId) {
  if (openLinkForms.has(grupoId)) openLinkForms.delete(grupoId); else openLinkForms.add(grupoId);
  renderGrupos();
}
function buildLinkForm(grupoId) {
  const form = document.createElement('div'); form.className = 'link-form';
  const nomeInp = document.createElement('input');
  nomeInp.type = 'text'; nomeInp.placeholder = 'Nome do link (ex: tarefa Jira)';
  const urlInp = document.createElement('input');
  urlInp.type = 'text'; urlInp.placeholder = 'Cole a URL aqui';
  const row = document.createElement('div'); row.className = 'link-form-actions';
  const saveBtn = document.createElement('button'); saveBtn.textContent = 'Salvar';
  const cancelBtn = document.createElement('button'); cancelBtn.className = 'ghost'; cancelBtn.textContent = 'Cancelar';
  const warn = document.createElement('div'); warn.className = 'link-form-warn';
  saveBtn.onclick = function () {
    const texto = nomeInp.value.trim();
    const url = urlInp.value.trim();
    if (!texto || !url) {
      warn.textContent = 'Preencha o nome e a URL antes de salvar.';
      return;
    }
    openLinkForms.delete(grupoId);
    const obj = { GrupoID: grupoId, Texto: texto, URL: url, _id: null };
    DATA.JiraLinks.push(obj); renderGrupos();
    apiAdd('JiraLinks', { GrupoID: grupoId, Texto: texto, URL: url }, obj);
  };
  cancelBtn.onclick = function () { toggleLinkForm(grupoId); };
  urlInp.onkeydown = function (e) { if (e.key === 'Enter') saveBtn.click(); };
  row.appendChild(saveBtn); row.appendChild(cancelBtn);
  form.appendChild(nomeInp); form.appendChild(urlInp); form.appendChild(warn); form.appendChild(row);
  setTimeout(function () { nomeInp.focus(); }, 0);
  return form;
}
function deleteGLink(l) {
  DATA.JiraLinks = DATA.JiraLinks.filter(function (x) { return x !== l; });
  renderGrupos();
  apiDelete('JiraLinks', l);
}

/* ---------------- Planning semanal ---------------- */
function renderPlanning() {
  if (DATA.Planning.length) {
    document.getElementById('outcomes').value = DATA.Planning[0].Outcomes || '';
    document.getElementById('bloqueios').value = DATA.Planning[0].Bloqueios || '';
  }
}
function savePlanning() {
  if (!DATA.Planning.length) return;
  const data = { Outcomes: document.getElementById('outcomes').value, Bloqueios: document.getElementById('bloqueios').value };
  apiUpdate('Planning', DATA.Planning[0], data);
  DATA.Planning[0] = Object.assign(DATA.Planning[0], data);
}
