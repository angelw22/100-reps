// ─── CONFIG ───────────────────────────────────────────────────────────────────
// 1. Go to console.cloud.google.com and create a project.
// 2. Enable "Google Sheets API".
// 3. Create OAuth 2.0 credentials (type: Web application).
//    Add your local dev URL (e.g. http://localhost:5500) as an Authorized
//    JavaScript origin, and the same for production when you deploy.
// 4. Paste the values below.
const CONFIG = {
  CLIENT_ID: '__CLIENT_ID__',
  SHEET_ID:  '__SHEET_ID__',
  SHEET_NAME: 'Daily Log',                   // tab name inside the spreadsheet
  DATA_START_ROW: 3,                      // row where data begins (1-indexed); row 1=title, 2=headers
  SCOPE: 'https://www.googleapis.com/auth/spreadsheets openid profile email',
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
let tokenClient = null;
let accessToken = null;
let currentUser = null; // 'angel' | 'cherie' | null
let rows = [];          // raw 2D array from the sheet
let todayCounters = { push: 0, pull: 0 };

// ─── GIS INIT ─────────────────────────────────────────────────────────────────
function onGISLoaded() {
  if (!CONFIG.CLIENT_ID || CONFIG.CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
    document.getElementById('config-banner').classList.remove('hidden');
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPE,
    callback: onTokenReceived,
  });
}

async function onTokenReceived(resp) {
  if (resp.error) { showToast('Auth error: ' + resp.error, 'error'); return; }
  accessToken = resp.access_token;
  document.getElementById('auth-btn').textContent = 'Refresh';
  await identifyUser();
  loadData();
}

async function identifyUser() {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const info = await res.json();
    const firstName = (info.given_name || info.name || '').toLowerCase();
    currentUser = firstName.includes('angel') ? 'angel'
                : firstName.includes('cherie') ? 'cherie'
                : null;
    const label = document.getElementById('user-label');
    label.textContent = `Hi, ${info.given_name || info.name}${currentUser ? '' : ' (unknown)'}`;
    label.classList.remove('hidden');
  } catch (e) {
    console.warn('Could not fetch user info', e);
  }
}

function handleAuth() {
  if (!tokenClient) { showToast('GIS not loaded yet — try again in a moment.', 'error'); return; }
  tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'select_account' });
}

// ─── DATA LOADING ─────────────────────────────────────────────────────────────
async function loadData() {
  showLoading(true);
  try {
    const range = `'${CONFIG.SHEET_NAME}'!A${CONFIG.DATA_START_ROW}:I`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent(range)}`;
    const res = await apiFetch(url);
    rows = res.values || [];
    dirtyRows = {};
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
  if (!accessToken) { showToast('Sign in first.', 'error'); return; }

  const push     = todayCounters.push;
  const pull     = todayCounters.pull;
  const sheetRow = todayIndex + CONFIG.DATA_START_ROW;

  // Write only push and pull — leave the total column alone so sheet formulas stay intact
  const pushRange = currentUser === 'angel'
    ? `'${CONFIG.SHEET_NAME}'!F${sheetRow}`
    : `'${CONFIG.SHEET_NAME}'!C${sheetRow}`;
  const pullRange = currentUser === 'angel'
    ? `'${CONFIG.SHEET_NAME}'!G${sheetRow}`
    : `'${CONFIG.SHEET_NAME}'!D${sheetRow}`;

  showLoading(true);
  try {
    await apiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: pushRange, values: [[push]] },
          { range: pullRange, values: [[pull]] },
        ],
      }),
    });

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

// ─── API HELPER ───────────────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
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
