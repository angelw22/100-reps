// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CONFIG = {
  GAS_URL:       'https://script.google.com/macros/s/AKfycbw3NNJWt4QOFo-92X_lcWiEOTVuqZEhpjABwDtPDEANCWGliBNHVr4Yo7yRLboJRzLQGw/exec',
  API_KEY:       'nhgjhkyi68432h293ufdfslkdsdsl23189342k*$@md72',
  SHEET_NAME:    'Daily Log',
  DATA_START_ROW: 3,
};

// Fixed structural column indices — these never change
const COL = {
  DATE:       0, // A
  DAY:        1, // B
  WEEK_START: 2, // C
};

// Color palette for user cards — cycles for additional users
const USER_COLORS = [
  { border: '#9ACBFF', text: '#1558A8' },
  { border: '#FFEC9A', text: '#8A5E00' },
  { border: '#86efac', text: '#166534' },
  { border: '#fdba74', text: '#9a3412' },
  { border: '#c4b5fd', text: '#5b21b6' },
];

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentUser = null; // display name e.g. 'Angel'
let rows    = [];
let headers = [];
let users   = []; // [{ name, pushCol, pullCol }, ...]
let todayCounters = { push: 0, pull: 0 };

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();

  const saved   = localStorage.getItem('current_user');
  const matched = saved && users.find(u => u.name.toLowerCase() === saved.toLowerCase());
  if (matched) {
    activateUser(matched.name);
  } else {
    document.getElementById('user-picker').classList.remove('hidden');
  }
});

// ─── USER MANAGEMENT ──────────────────────────────────────────────────────────
function pickUser(name) {
  localStorage.setItem('current_user', name);
  document.getElementById('user-picker').classList.add('hidden');
  activateUser(name);
}

function activateUser(name) {
  currentUser = name;
  document.getElementById('user-label').textContent = name;
  document.getElementById('user-label').classList.remove('hidden');
  document.getElementById('auth-btn').classList.remove('hidden');
  renderLogToday();
}

function switchUser() {
  localStorage.removeItem('current_user');
  currentUser = null;
  document.getElementById('user-label').classList.add('hidden');
  document.getElementById('auth-btn').classList.add('hidden');
  document.getElementById('log-today-section').classList.add('hidden');
  document.getElementById('user-picker').classList.remove('hidden');
}

// ─── ADD USER ─────────────────────────────────────────────────────────────────
function showAddUserForm() {
  document.getElementById('add-user-form').classList.remove('hidden');
  document.getElementById('new-user-name').focus();
}

function hideAddUserForm() {
  document.getElementById('add-user-form').classList.add('hidden');
  document.getElementById('new-user-name').value = '';
}

async function confirmAddUser() {
  const input = document.getElementById('new-user-name');
  const name  = input.value.trim();
  if (!name) { showToast('Enter a name', 'error'); return; }
  if (users.find(u => u.name.toLowerCase() === name.toLowerCase())) {
    showToast('That name already exists', 'error');
    return;
  }

  showLoading(true);
  try {
    const res  = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify({ key: CONFIG.API_KEY, action: 'addUser', userName: name }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    hideAddUserForm();
    await loadData();
    showToast(`${name} added!`, 'success');
  } catch (e) {
    showToast('Failed: ' + e.message, 'error');
    console.error(e);
  } finally {
    showLoading(false);
  }
}

// ─── DATA LOADING ─────────────────────────────────────────────────────────────
async function loadData() {
  showLoading(true);
  try {
    const res  = await fetch(`${CONFIG.GAS_URL}?key=${encodeURIComponent(CONFIG.API_KEY)}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    headers = data.headers || [];
    rows    = data.values  || [];
    users   = parseUsers(headers);

    renderSummaryGrid();
    renderUserPicker();
    renderAll();

    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('summary-section').classList.remove('hidden');
    document.getElementById('weeks-section').classList.remove('hidden');
  } catch (e) {
    showToast('Failed to load sheet: ' + e.message, 'error');
    console.error(e);
  } finally {
    showLoading(false);
  }
}

function parseUsers(hdrs) {
  return hdrs
    .filter(h => h.endsWith(' Push'))
    .map(h => {
      const name = h.slice(0, -5); // strip ' Push'
      return {
        name,
        pushCol: hdrs.indexOf(h),
        pullCol: hdrs.indexOf(name + ' Pull'),
      };
    });
}

// ─── RENDERING ────────────────────────────────────────────────────────────────
function renderAll() {
  updateSummary();
  renderLogToday();
  renderWeeks();
}

function renderSummaryGrid() {
  const grid = document.getElementById('summary-grid');
  grid.innerHTML = users.map((u, i) => {
    const color = USER_COLORS[i % USER_COLORS.length];
    const id    = sanitizeId(u.name);
    return `
      <div class="summary-card" style="border-top:3px solid ${color.border}">
        <p class="summary-name" style="color:${color.text}">${u.name} total</p>
        <div class="summary-stats">
          <div>
            <span class="stat-value" id="${id}-push-total">0</span>
            <span class="stat-label">Push</span>
            <span class="pace-chip" id="${id}-push-pace"></span>
          </div>
          <div>
            <span class="stat-value" id="${id}-pull-total">0</span>
            <span class="stat-label">Pull</span>
            <span class="pace-chip" id="${id}-pull-pace"></span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderUserPicker() {
  const container = document.getElementById('user-picker-buttons');
  container.innerHTML = users.map(u =>
    `<button class="btn btn-primary" onclick="pickUser('${u.name}')">${u.name}</button>`
  ).join('') + `<button class="btn btn-ghost" onclick="showAddUserForm()">+ Add user</button>`;
}

function updateSummary() {
  for (const u of users) {
    let push = 0, pull = 0;
    for (const row of rows) {
      if (!isThisWeek(row[COL.WEEK_START])) continue;
      push += num(row[u.pushCol]);
      pull += num(row[u.pullCol]);
    }
    const id     = sanitizeId(u.name);
    const pushEl = document.getElementById(`${id}-push-total`);
    const pullEl = document.getElementById(`${id}-pull-total`);
    if (pushEl) pushEl.textContent = push;
    if (pullEl) pullEl.textContent = pull;
    const projected = weekDayProjected(100);
    setPaceChip(`${id}-push-pace`, push, projected);
    setPaceChip(`${id}-pull-pace`, pull, projected);
  }
}

function weekDayProjected(target) {
  const dow = new Date().getDay();
  const dayOfWeek = dow === 0 ? 7 : dow;
  return (dayOfWeek / 7) * target;
}

function setPaceChip(id, actual, projected) {
  const el = document.getElementById(id);
  if (!el) return;
  const diff = Math.round(actual - projected);
  const abs  = Math.abs(diff);
  if (diff >= 0) {
    el.textContent = `▲ ${abs}`;
    el.className   = 'pace-chip pace-up';
  } else {
    el.textContent = `▼ ${abs}`;
    el.className   = 'pace-chip pace-down';
  }
}

function renderWeeks() {
  const weeks = new Map();
  rows.forEach((row, i) => {
    const ws = row[COL.WEEK_START] || 'Unknown';
    if (!weeks.has(ws)) weeks.set(ws, []);
    weeks.get(ws).push(i);
  });

  const container = document.getElementById('weeks-container');
  container.innerHTML = '';

  for (const [weekStart, indices] of weeks) {
    if (!isThisWeek(weekStart)) continue;
    container.appendChild(buildWeekCard(weekStart, indices));
  }
}

function buildWeekCard(weekStart, indices) {
  const card = document.createElement('div');
  card.className = 'week-card';
  card.dataset.week = weekStart;
  if (isThisWeek(weekStart)) card.classList.add('open');

  const groupHeaders = users.map(u =>
    `<th colspan="2" class="col-header">${u.name}</th>`
  ).join('');

  const subHeaders = users.map(() =>
    `<th class="col-group-user">Push</th><th class="col-group-user">Pull</th>`
  ).join('');

  card.innerHTML = `
    <div class="week-header" onclick="toggleWeek(this)">
      <div class="week-header-left">
        <span class="week-chevron">▶</span>
        <div>
          <div class="week-title">Week of ${formatDate(weekStart)}</div>
        </div>
      </div>
    </div>
    <div class="week-body">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th class="th-date" rowspan="2">Date</th>
              <th rowspan="2">Day</th>
              ${groupHeaders}
            </tr>
            <tr>${subHeaders}</tr>
          </thead>
          <tbody id="tbody-${sanitizeId(weekStart)}"></tbody>
        </table>
      </div>
      <div class="week-footer"></div>
    </div>
  `;

  const tbody = card.querySelector(`#tbody-${sanitizeId(weekStart)}`);
  for (const i of indices) tbody.appendChild(buildRow(i));

  return card;
}

function buildRow(rowIndex) {
  const row      = rows[rowIndex];
  const tr       = document.createElement('tr');
  const userCells = users.map(u =>
    `<td>${num(row[u.pushCol])}</td><td>${num(row[u.pullCol])}</td>`
  ).join('');
  tr.innerHTML = `
    <td class="td-date">${row[COL.DATE] || '—'}</td>
    <td class="td-day">${row[COL.DAY] || ''}</td>
    ${userCells}
  `;
  return tr;
}

// ─── INTERACTIONS ─────────────────────────────────────────────────────────────
function toggleWeek(headerEl) {
  headerEl.closest('.week-card').classList.toggle('open');
}

// ─── LOG TODAY ────────────────────────────────────────────────────────────────
function renderLogToday() {
  const section = document.getElementById('log-today-section');
  const card    = document.getElementById('log-today-card');

  const user = currentUser && users.find(u => u.name === currentUser);
  if (!user) {
    section.classList.add('hidden');
    return;
  }

  const todayStr   = getTodaySheetDate();
  const todayIndex = rows.findIndex(r => r[COL.DATE] === todayStr);

  if (todayIndex === -1) {
    card.innerHTML = `<p class="log-today-missing">No entry for today (${todayStr}) in the sheet.</p>`;
    section.classList.remove('hidden');
    return;
  }

  todayCounters.push = num(rows[todayIndex][user.pushCol]);
  todayCounters.pull = num(rows[todayIndex][user.pullCol]);

  const userIndex = users.indexOf(user);
  const color     = USER_COLORS[userIndex % USER_COLORS.length];

  card.innerHTML = `
    <div class="log-today-header">
      <div class="log-today-date">${formatDate(todayStr)}</div>
      <span class="log-today-name" style="color:${color.text}">${currentUser}</span>
    </div>
    <div class="counters-grid">
      <div class="counter-item">
        <img id="mascot-push" class="counter-mascot push" src="images/push-off.png" alt="" />
        <div class="counter-label">Push-ups</div>
        <div class="counter-controls">
          <button class="counter-btn" onclick="adjustCounter('push', -1)">−</button>
          <span class="counter-value" id="counter-push">${todayCounters.push}</span>
          <button class="counter-btn" onclick="adjustCounter('push', 1)">+</button>
        </div>
      </div>
      <div class="counter-item">
        <img id="mascot-pull" class="counter-mascot pull" src="images/pull-off.png" alt="" />
        <div class="counter-label">Pull-ups</div>
        <div class="counter-controls">
          <button class="counter-btn" onclick="adjustCounter('pull', -1)">−</button>
          <span class="counter-value" id="counter-pull">${todayCounters.pull}</span>
          <button class="counter-btn" onclick="adjustCounter('pull', 1)">+</button>
        </div>
      </div>
    </div>
    <div class="log-today-footer">
      <button class="btn btn-save" onclick="saveToday(${todayIndex})">Save</button>
    </div>
  `;

  section.classList.remove('hidden');
}

function adjustCounter(type, delta) {
  todayCounters[type] = Math.max(0, todayCounters[type] + delta);
  document.getElementById(`counter-${type}`).textContent = todayCounters[type];

  if (delta > 0) {
    const mascot = document.getElementById(`mascot-${type}`);
    if (mascot) {
      clearTimeout(mascot._timerOn);
      clearTimeout(mascot._timerOff);
      mascot.src = `images/${type}-off.png`;
      mascot._timerOn  = setTimeout(() => {
        mascot.src = `images/${type}-on.png`;
        mascot._timerOff = setTimeout(() => { mascot.src = `images/${type}-off.png`; }, 300);
      }, 50);
    }
  }
}

// ─── SAVING ───────────────────────────────────────────────────────────────────
async function saveToday(todayIndex) {
  if (!currentUser) { showToast('Select a user first.', 'error'); return; }

  const user     = users.find(u => u.name === currentUser);
  const push     = todayCounters.push;
  const pull     = todayCounters.pull;
  const sheetRow = todayIndex + CONFIG.DATA_START_ROW;

  showLoading(true);
  try {
    const res = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify({ key: CONFIG.API_KEY, user: currentUser, sheetRow, push, pull }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    rows[todayIndex][user.pushCol] = push;
    rows[todayIndex][user.pullCol] = pull;

    updateSummary();
    renderWeeks();
    showToast('Saved!', 'success');
  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
    console.error(e);
  } finally {
    showLoading(false);
  }
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function num(v) {
  const n = parseInt(v);
  return isNaN(n) ? 0 : Math.max(0, n);
}

function sanitizeId(str) {
  return str.replace(/[^a-zA-Z0-9]/g, '_');
}

function getTodaySheetDate() {
  const now    = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(now.getDate()).padStart(2,'0')}-${months[now.getMonth()]}-${now.getFullYear()}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr.includes('-') && dateStr.length === 11
    ? dateStr.replace(/(\d{2})-([A-Za-z]{3})-(\d{4})/, '$2 $1, $3')
    : dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function isThisWeek(weekStartStr) {
  const ws = new Date(weekStartStr.replace(/(\d{2})-([A-Za-z]{3})-(\d{4})/, '$2 $1, $3'));
  const now = new Date();
  const dayOfWeek  = now.getDay();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  return ws >= startOfWeek && ws <= endOfWeek;
}

function showLoading(visible) {
  document.getElementById('loading').classList.toggle('hidden', !visible);
}

function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 3000);
}
