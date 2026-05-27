// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CONFIG = {
  GAS_URL:       '__GAS_URL__',
  API_KEY:       '__API_KEY__',
  SHEET_NAME:    'Daily Log',
  DATA_START_ROW: 3,
};

// Column indices (0-based) in the values array returned from the API
const COL = {
  DATE:         0, // A
  DAY:          1, // B
  CHERIE_PUSH:  2, // C
  CHERIE_PULL:  3, // D
  CHERIE_TOTAL: 4, // E
  ANGEL_PUSH:   5, // F
  ANGEL_PULL:   6, // G
  ANGEL_TOTAL:  7, // H
  WEEK_START:   8, // I
};

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentUser = null; // 'angel' | 'cherie'
let rows = [];
let todayCounters = { push: 0, pull: 0 };

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('current_user');
  if (saved === 'angel' || saved === 'cherie') {
    setUser(saved);
  } else {
    document.getElementById('user-picker').classList.remove('hidden');
    document.getElementById('empty-state').classList.remove('hidden');
  }
});

function pickUser(name) {
  localStorage.setItem('current_user', name);
  document.getElementById('user-picker').classList.add('hidden');
  setUser(name);
}

function setUser(name) {
  currentUser = name;
  const label = document.getElementById('user-label');
  label.textContent = name === 'angel' ? 'Angel' : 'Cherie';
  label.classList.remove('hidden');
  document.getElementById('auth-btn').classList.remove('hidden');
  loadData();
}

function switchUser() {
  localStorage.removeItem('current_user');
  currentUser = null;
  document.getElementById('user-label').classList.add('hidden');
  document.getElementById('auth-btn').classList.add('hidden');
  document.getElementById('summary-section').classList.add('hidden');
  document.getElementById('weeks-section').classList.add('hidden');
  document.getElementById('log-today-section').classList.add('hidden');
  document.getElementById('empty-state').classList.remove('hidden');
  document.getElementById('user-picker').classList.remove('hidden');
}

// ─── DATA LOADING ─────────────────────────────────────────────────────────────
async function loadData() {
  showLoading(true);
  try {
    const res  = await fetch(`${CONFIG.GAS_URL}?key=${encodeURIComponent(CONFIG.API_KEY)}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    rows = data.values || [];
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

// ─── RENDERING ────────────────────────────────────────────────────────────────
function renderAll() {
  updateSummary();
  renderLogToday();
  renderWeeks();
}

function updateSummary() {
  let cp = 0, cpl = 0, ap = 0, apl = 0;
  for (const row of rows) {
    if (!isThisWeek(row[COL.WEEK_START])) continue;
    cp  += num(row[COL.CHERIE_PUSH]);
    cpl += num(row[COL.CHERIE_PULL]);
    ap  += num(row[COL.ANGEL_PUSH]);
    apl += num(row[COL.ANGEL_PULL]);
  }
  document.getElementById('cherie-push-total').textContent  = cp;
  document.getElementById('cherie-pull-total').textContent  = cpl;
  document.getElementById('angel-push-total').textContent   = ap;
  document.getElementById('angel-pull-total').textContent   = apl;

  const projected = weekDayProjected(100);
  setPaceChip('cherie-push-pace', cp,  projected);
  setPaceChip('cherie-pull-pace', cpl, projected);
  setPaceChip('angel-push-pace',  ap,  projected);
  setPaceChip('angel-pull-pace',  apl, projected);
}

function weekDayProjected(target) {
  const dow = new Date().getDay(); // 0=Sun
  const dayOfWeek = dow === 0 ? 7 : dow; // 1=Mon … 7=Sun
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
  // Group rows by Week Start (column I)
  const weeks = new Map(); // weekStart → [rowIndex, ...]
  rows.forEach((row, i) => {
    const ws = row[COL.WEEK_START] || 'Unknown';
    if (!weeks.has(ws)) weeks.set(ws, []);
    weeks.get(ws).push(i);
  });

  const container = document.getElementById('weeks-container');
  container.innerHTML = '';

  for (const [weekStart, indices] of weeks) {
    if (!isThisWeek(weekStart)) continue;
    const card = buildWeekCard(weekStart, indices);
    container.appendChild(card);
  }
}

function buildWeekCard(weekStart, indices) {
  const card = document.createElement('div');
  card.className = 'week-card';
  card.dataset.week = weekStart;

  // Determine if this is the current week to auto-open it
  const isCurrentWeek = isThisWeek(weekStart);
  if (isCurrentWeek) card.classList.add('open');

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
              <th colspan="2" class="col-header">Cherie</th>
              <th colspan="2" class="col-header">Angel</th>
            </tr>
            <tr>
              <th class="col-group-cherie">Push</th>
              <th class="col-group-cherie">Pull</th>
              <th class="col-group-angel">Push</th>
              <th class="col-group-angel">Pull</th>
            </tr>
          </thead>
          <tbody id="tbody-${sanitizeId(weekStart)}">
          </tbody>
        </table>
      </div>
      <div class="week-footer"></div>
    </div>
  `;

  // Populate tbody
  const tbody = card.querySelector(`#tbody-${sanitizeId(weekStart)}`);
  for (const i of indices) {
    tbody.appendChild(buildRow(i));
  }

  return card;
}

function buildRow(rowIndex) {
  const row = rows[rowIndex];
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="td-date">${row[COL.DATE] || '—'}</td>
    <td class="td-day">${row[COL.DAY] || ''}</td>
    <td>${num(row[COL.CHERIE_PUSH])}</td>
    <td>${num(row[COL.CHERIE_PULL])}</td>
    <td>${num(row[COL.ANGEL_PUSH])}</td>
    <td>${num(row[COL.ANGEL_PULL])}</td>
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

  if (!currentUser) {
    section.classList.add('hidden');
    return;
  }

  const todayStr    = getTodaySheetDate();
  const todayIndex  = rows.findIndex(r => r[COL.DATE] === todayStr);
  const pushCol     = currentUser === 'angel' ? COL.ANGEL_PUSH  : COL.CHERIE_PUSH;
  const pullCol     = currentUser === 'angel' ? COL.ANGEL_PULL  : COL.CHERIE_PULL;
  const colorClass  = currentUser === 'angel' ? 'angel' : 'cherie';
  const displayName = currentUser === 'angel' ? 'Angel' : 'Cherie';

  if (todayIndex === -1) {
    card.innerHTML = `<p class="log-today-missing">No entry for today (${todayStr}) in the sheet.</p>`;
    section.classList.remove('hidden');
    return;
  }

  todayCounters.push = num(rows[todayIndex][pushCol]);
  todayCounters.pull = num(rows[todayIndex][pullCol]);

  card.innerHTML = `
    <div class="log-today-header">
      <div class="log-today-date">${formatDate(todayStr)}</div>
      <span class="log-today-name ${colorClass}">${displayName}</span>
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
      // Immediately snap to off so each rapid press produces a fresh visible blink
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

    const pushCol = currentUser === 'angel' ? COL.ANGEL_PUSH : COL.CHERIE_PUSH;
    const pullCol = currentUser === 'angel' ? COL.ANGEL_PULL : COL.CHERIE_PULL;
    rows[todayIndex][pushCol] = push;
    rows[todayIndex][pullCol] = pull;

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
  const now = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(now.getDate()).padStart(2,'0')}-${months[now.getMonth()]}-${now.getFullYear()}`;
}

function formatDate(dateStr) {
  // Accepts "25-May-2026" or "YYYY-MM-DD"
  const d = new Date(dateStr.includes('-') && dateStr.length === 11
    ? dateStr.replace(/(\d{2})-([A-Za-z]{3})-(\d{4})/, '$2 $1, $3')
    : dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function isThisWeek(weekStartStr) {
  const ws = new Date(weekStartStr.replace(/(\d{2})-([A-Za-z]{3})-(\d{4})/, '$2 $1, $3'));
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - ((dayOfWeek + 6) % 7)); // Monday
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
