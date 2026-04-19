/* ═══════════════════════════════════════════════════════════════════════
   app.js  ·  DayLog  ·  UI logic, state, charts
   All data access goes through api.js — this file never calls fetch().
   ═══════════════════════════════════════════════════════════════════════ */
 
'use strict';
 
// ═══════════════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════════════
const STATE = {
  user:          null,          // { id, username } or null
  view:          'community',   // 'community' | 'personal'
  communityData: [],
  myData:        [],
  // entry form selections
  formMood:      null,
  formBreakfast: null,
  // mood chart line toggles
  checks: { you: true, sleep: false, others: false },
};
 
// ═══════════════════════════════════════════════════════════════════════
//  CONSTANTS & DATE HELPERS
// ═══════════════════════════════════════════════════════════════════════
const getISODate = (date) => date.toISOString().split('T')[0];

// Generate exact YYYY-MM-DD strings for the last 7 days
const LAST_7_DATES = [...Array(7)].map((_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (6 - i));
  return getISODate(d);
});

// Create friendly chart labels (e.g., "Mon", "Tue") for those exact dates
const DAY_LABELS = LAST_7_DATES.map(dateStr => {
  const d = new Date(dateStr + 'T12:00:00'); // Forces midday to avoid timezone shifting
  return d.toLocaleDateString('en-US', { weekday: 'short' });
});
 
const BREAKFAST_BUCKETS = ['Full meal','Light bite','Just a drink','Skipped'];
 
const BUCKET_COLORS = {
  'Full meal':    '#4a7c59',   // deep green      — high contrast
  'Light bite':   '#e8a11a',   // amber/gold       — warm, distinct
  'Just a drink': '#5b8db8',   // slate blue       — cool, clear
  'Skipped':      '#c0392b',   // brick red        — immediately distinct
};
 
// CSS class to apply when a breakfast tile is selected
const BREAKFAST_SEL_CLASS = {
  'Full meal':    'sel-full',
  'Light bite':   'sel-light',
  'Just a drink': 'sel-drink',
  'Skipped':      'sel-skip',
};
 
// ═══════════════════════════════════════════════════════════════════════
//  CHART INSTANCES  (destroyed + recreated on each render)
// ═══════════════════════════════════════════════════════════════════════
let _moodChart    = null;
let _nourishChart = null;
let _sleepChart   = null;
 
// ═══════════════════════════════════════════════════════════════════════
//  MATH HELPERS
// ═══════════════════════════════════════════════════════════════════════
const avg = arr =>
  arr.length ? +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1) : 0;
 
const pct = (arr, fn) =>
  arr.length ? Math.round(arr.filter(fn).length / arr.length * 100) : 0;
 
// ═══════════════════════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════════════════════
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 2800);
}
 
// ═══════════════════════════════════════════════════════════════════════
//  BOOT — called automatically on DOMContentLoaded
// ═══════════════════════════════════════════════════════════════════════
async function _boot() {
  // Restore session if one exists (e.g. returning user with cookie)
  const { user } = await apiGetCurrentUser();
  if (user) await _applyLogin(user, /* toast */ false);
 
  // Load community data
  const { entries } = await apiGetCommunityEntries();
  STATE.communityData = entries;
 
  _renderAll();
}
 
// ═══════════════════════════════════════════════════════════════════════
//  VIEW TOGGLE
// ═══════════════════════════════════════════════════════════════════════
function setView(mode) {
  STATE.view = mode;
  document.getElementById('btn-view-community').classList.toggle('active', mode === 'community');
  document.getElementById('btn-view-personal' ).classList.toggle('active', mode === 'personal');
  _renderAll();
}
 
// ═══════════════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════════════
 
async function handleLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl    = document.getElementById('login-error');
 
  errEl.classList.add('hidden');
 
  if (!username || !password) {
    errEl.textContent = 'Please enter your username and password.';
    errEl.classList.remove('hidden');
    return;
  }
 
  const result = await apiLogin(username, password);
 
  if (!result.ok) {
    errEl.textContent = result.error;
    errEl.classList.remove('hidden');
    return;
  }
 
  UI.closeAuth();
  await _applyLogin(result.user, /* toast */ true);
}
 
async function handleSignup() {
  const username = document.getElementById('signup-user').value.trim();
  const email    = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-pass').value;
  const confirm  = document.getElementById('signup-confirm').value;
  const errEl    = document.getElementById('signup-error');
  const okEl     = document.getElementById('signup-success');
 
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');
 
  if (!username || !password) {
    errEl.textContent = 'Username and password are required.';
    errEl.classList.remove('hidden');
    return;
  }
  if (password.length < 6) {
    errEl.textContent = 'Password must be at least 6 characters.';
    errEl.classList.remove('hidden');
    return;
  }
  if (password !== confirm) {
    errEl.textContent = "Passwords don't match.";
    errEl.classList.remove('hidden');
    return;
  }
 
  const result = await apiSignup(username, email, password);
 
  if (!result.ok) {
    errEl.textContent = result.error;
    errEl.classList.remove('hidden');
    return;
  }
 
  okEl.textContent = 'Account created! You can now sign in.';
  okEl.classList.remove('hidden');
  // Auto-switch to login tab after a short pause
  setTimeout(() => UI.switchAuthTab('login'), 1300);
}
 
async function handleLogout() {
  await apiLogout();
  STATE.user          = null;
  STATE.myData        = [];
  STATE.view          = 'community';
  STATE.checks        = { you: true, sleep: false, others: false };
  _renderAll();
}
 
// Internal — apply a successful login to state and re-render
async function _applyLogin(user, toast) {
  STATE.user = user;
  STATE.view = 'personal';
 
  const { entries } = await apiGetMyEntries(user.id);
  STATE.myData = entries;
 
  if (toast) showToast(`Welcome back, ${user.username}! 🌿`);
  _renderAll();
}
 
// ═══════════════════════════════════════════════════════════════════════
//  CHECKBOXES
// ═══════════════════════════════════════════════════════════════════════
function toggleCheck(key) {
  const wrap = document.getElementById(`cbwrap-${key}`);
  if (wrap.classList.contains('locked')) return;
  STATE.checks[key] = !STATE.checks[key];
  _applyCheckbox(key);
  _renderMoodChart();   // only redraw the line chart
}
 
function _applyCheckbox(key) {
  const box     = document.getElementById(`cb-${key}`);
  const wrap    = document.getElementById(`cbwrap-${key}`);
  const label   = document.getElementById(`cblabel-${key}`);
  const locked  = wrap.classList.contains('locked');
  const on      = STATE.checks[key] && !locked;
  const color   = box.dataset.color;
  const names   = { you: 'My mood', sleep: 'Sleep (h)', others: 'Others' };
 
  box.textContent = on ? '✓' : '';
  box.classList.toggle('checked', on);
  if (on) box.style.setProperty('--cb-color', color);
  label.textContent = names[key] + (locked ? ' 🔒' : '');
}
 
function _unlockCheckboxes() {
  ['you','sleep','others'].forEach(k => {
    document.getElementById(`cbwrap-${k}`).classList.remove('locked');
    _applyCheckbox(k);
  });
}
 
function _lockCheckboxes() {
  ['you','sleep','others'].forEach(k => {
    document.getElementById(`cbwrap-${k}`).classList.add('locked');
    STATE.checks[k] = k === 'you';   // reset to default
    _applyCheckbox(k);
  });
}
 
// ═══════════════════════════════════════════════════════════════════════
//  ENTRY FORM
// ═══════════════════════════════════════════════════════════════════════
function pickMood(val) {
  STATE.formMood = val;
  document.querySelectorAll('.mood-btn').forEach(b => {
    b.classList.toggle('selected', +b.dataset.val === val);
  });
  _updateSaveBtn();
}
 
function pickBreakfast(val) {
  STATE.formBreakfast = val;
  document.querySelectorAll('.bf-btn').forEach(b => {
    b.className = 'bf-btn';
    if (b.dataset.val === val) b.classList.add(BREAKFAST_SEL_CLASS[val]);
  });
  _updateSaveBtn();
}
 
function _updateSaveBtn() {
  const ready = STATE.formMood !== null && STATE.formBreakfast !== null;
  const btn   = document.getElementById('save-btn');
  btn.classList.toggle('disabled', !ready);
  btn.textContent = ready ? 'Save today ✓' : 'Pick mood & breakfast to save';
}
 
async function handleSave() {
  if (!STATE.formMood || !STATE.formBreakfast) return;
 
  const entry = {
    mood:      STATE.formMood,
    sleep:     parseFloat(document.getElementById('sleep-slider').value),
    breakfast: STATE.formBreakfast,
    date:      getISODate(new Date()),
  };
 
  const userId = STATE.user ? STATE.user.id : null;
  const result = await apiSaveEntry(entry, userId);
 
  if (!result.ok) {
    showToast('Could not save — please try again.');
    return;
  }
 
  // Push to local state so chart updates immediately without a reload
  if (userId) {
    STATE.myData.push(result.entry);
  } else {
    STATE.communityData.push(result.entry);
  }
 
  UI.closeForm();
  _renderAll();
  showToast(userId ? 'Day logged! 🌿' : 'Added to community — thank you 🙏');
}
 
// ═══════════════════════════════════════════════════════════════════════
//  WEEK SUMMARY TEXT
// ═══════════════════════════════════════════════════════════════════════
function _buildSummary(data) {
  if (!data || data.length < 2) return null;
 
  const sleepAvg   = avg(data.map(d => d.sleep));
  const moodAvg    = avg(data.map(d => d.mood));
  const fullPct    = pct(data, d => d.breakfast === 'Full meal');
  const skippedPct = pct(data, d => d.breakfast === 'Skipped');
  const bestDay    = [...data].sort((a, b) => b.mood - a.mood)[0]?.date;
  const toughDay   = [...data].sort((a, b) => a.mood - b.mood)[0]?.date;
 
  const moodWord  = moodAvg >= 4 ? 'positive' : moodAvg >= 3 ? 'steady' : 'mixed';
  const sleepWord = sleepAvg >= 8 ? 'well-rested'
    : sleepAvg >= 7 ? 'fairly well rested'
    : sleepAvg >= 6 ? 'getting by'
    : 'on the lower side';
  const foodNote  = fullPct >= 60
    ? `Most mornings started with a full meal (${fullPct}%).`
    : skippedPct >= 40
      ? `Breakfast was skipped on ${skippedPct}% of days.`
      : 'Breakfast was a mixed bag this week.';
 
  return `Overall a ${moodWord} week — mood averaged ${moodAvg}/5 and sleep was ${sleepWord} at ${sleepAvg}h. `
       + `${foodNote} Your best day was ${bestDay}`
       + `${toughDay !== bestDay ? `, and ${toughDay} was tougher` : ''}. `
       + `${data.length} days logged.`;
}
 
// ═══════════════════════════════════════════════════════════════════════
//  MASTER RENDER
// ═══════════════════════════════════════════════════════════════════════
function _renderAll() {
  const u      = STATE.user;
  const isMe   = !!u && STATE.view === 'personal';
  const display = isMe ? STATE.myData : STATE.communityData;
 
  /* ── Header ── */
  const authBtn = document.getElementById('btn-auth');
  if (u) {
    authBtn.textContent = 'Sign out';
    authBtn.onclick     = handleLogout;
    document.getElementById('view-toggle').classList.remove('hidden');
    _unlockCheckboxes();
  } else {
    authBtn.textContent = 'Sign in';
    authBtn.onclick     = () => UI.openAuth('login');
    document.getElementById('view-toggle').classList.add('hidden');
    _lockCheckboxes();
  }
 
  /* ── Page title ── */
  document.getElementById('page-title').textContent =
    isMe ? `Your week, ${u.username} 🌱` : 'How is everyone doing? 🌍';
 
  document.getElementById('page-sub').textContent = isMe
    ? `${STATE.myData.length} days logged`
    : `${STATE.communityData.length} anonymous entries · no sign-in needed to contribute`;
 
  /* ── Guest elements ── */
  document.getElementById('signin-banner').classList.toggle('hidden', !!u);
 
  /* ── Week summary ── */
  const summaryBox  = document.getElementById('week-summary');
  const summaryText = document.getElementById('summary-text');
  if (isMe) {
    const text = _buildSummary(STATE.myData);
    if (text) {
      summaryText.textContent = text;
      summaryBox.classList.remove('hidden');
    } else {
      summaryBox.classList.add('hidden');
    }
  } else {
    summaryBox.classList.add('hidden');
  }
 
  /* ── Charts ── */
  _renderMoodChart();
  _renderNourishChart(display);
  _renderSleepChart(display);
}
 
// ═══════════════════════════════════════════════════════════════════════
//  CHART 1 — Mood line
// ═══════════════════════════════════════════════════════════════════════
function _renderMoodChart() {
  const u    = STATE.user;
  const isMe = !!u && STATE.view === 'personal';
  const chk  = STATE.checks;
 
  // Community avg mood per day
  const commMood = LAST_7_DATES.map(d => {
    const rows = STATE.communityData.filter(e => e.date === d);
    return rows.length ? avg(rows.map(e => e.mood)) : null;
  });
 
  // My mood + sleep per day
  const myMood  = LAST_7_DATES.map(d => { const e = STATE.myData.find(x => x.date === d); return e ? e.mood  : null; });
  const mySleep = LAST_7_DATES.map(d => { const e = STATE.myData.find(x => x.date === d); return e ? e.sleep : null; });
 
  const datasets = [];
 
  if (!isMe) {
    // Logged-out view: just community line, no toggles
    datasets.push({
      label:               'Community mood',
      data:                commMood,
      yAxisID:             'yMood',
      borderColor:         '#f0b429',
      backgroundColor:     'rgba(240,180,41,.1)',
      borderWidth:         2.5,
      pointRadius:         4,
      pointBackgroundColor:'#f0b429',
      tension:             0.35,
      spanGaps:            true,
    });
  } else {
    if (chk.you) {
      datasets.push({
        label:               'My mood',
        data:                myMood,
        yAxisID:             'yMood',
        borderColor:         '#f0b429',
        backgroundColor:     'rgba(240,180,41,.1)',
        borderWidth:         2.5,
        pointRadius:         5,
        pointBackgroundColor:'#f0b429',
        tension:             0.35,
        spanGaps:            true,
      });
    }
    if (chk.others) {
      datasets.push({
        label:           'Community avg',
        data:            commMood,
        yAxisID:         'yMood',
        borderColor:     '#b39ddb',
        borderDash:      [5,4],
        borderWidth:     2,
        pointRadius:     0,
        tension:         0.35,
        spanGaps:        true,
      });
    }
    if (chk.sleep) {
      datasets.push({
        label:               'My sleep (h)',
        data:                mySleep,
        yAxisID:             'ySleep',
        borderColor:         '#7ab8d4',
        borderDash:          [3,3],
        borderWidth:         2,
        pointRadius:         3,
        pointBackgroundColor:'#7ab8d4',
        tension:             0.35,
        spanGaps:            true,
      });
    }
  }
 
  const scales = {
    x: {
      grid:  { color: '#f0e6d3', drawBorder: false },
      ticks: { color: '#b89880', font: { family: "'Nunito', sans-serif", size: 11 } },
    },
    yMood: {
      position: 'left',
      min: 1, max: 5,
      grid:  { color: '#f0e6d3', drawBorder: false },
      ticks: { color: '#b89880', font: { family: "'Nunito', sans-serif", size: 11 }, stepSize: 1 },
    },
  };
 
  if (isMe && chk.sleep) {
    scales.ySleep = {
      position: 'right',
      min: 0, max: 12,
      grid:  { drawOnChartArea: false },
      ticks: { color: '#cce8f4', font: { family: "'Nunito', sans-serif", size: 11 } },
    };
  }
 
  const tooltipDefaults = {
    backgroundColor: '#fffaf4',
    borderColor:     '#f0e6d3',
    borderWidth:     1,
    titleColor:      '#3d2b1f',
    bodyColor:       '#7a5c46',
    titleFont: { family: "'Nunito', sans-serif" },
    bodyFont:  { family: "'Nunito', sans-serif" },
  };
 
  if (_moodChart) _moodChart.destroy();
  _moodChart = new Chart(document.getElementById('chart-mood'), {
    type: 'line',
    data: { labels: DAY_LABELS, datasets },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      interaction:         { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: {
            color:    '#7a5c46',
            font:     { family: "'Nunito', sans-serif", size: 11 },
            boxWidth: 12,
            padding:  12,
          },
        },
        tooltip: tooltipDefaults,
      },
      scales,
    },
  });
}
 
// ═══════════════════════════════════════════════════════════════════════
//  CHART 2 — Nourishment donut
// ═══════════════════════════════════════════════════════════════════════
function _renderNourishChart(data) {
  const total  = data.length || 1;
  const counts = BREAKFAST_BUCKETS.reduce((acc, b) => {
    acc[b] = data.filter(d => d.breakfast === b).length;
    return acc;
  }, {});
  const active = BREAKFAST_BUCKETS.filter(b => counts[b] > 0);
 
  // Build legend HTML
  document.getElementById('nourish-legend').innerHTML = active.map(b => `
    <div class="legend-row">
      <div class="legend-dot" style="background:${BUCKET_COLORS[b]}"></div>
      <span class="legend-name">${b}</span>
      <span class="legend-pct">${Math.round(counts[b] / total * 100)}%</span>
    </div>
  `).join('');
 
  if (_nourishChart) _nourishChart.destroy();
  _nourishChart = new Chart(document.getElementById('chart-nourish'), {
    type: 'doughnut',
    data: {
      labels:   active,
      datasets: [{
        data:            active.map(b => counts[b]),
        backgroundColor: active.map(b => BUCKET_COLORS[b]),
        borderWidth:     0,
        hoverOffset:     4,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      cutout:              '62%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#fffaf4',
          borderColor:     '#f0e6d3',
          borderWidth:     1,
          titleColor:      '#3d2b1f',
          bodyColor:       '#7a5c46',
          titleFont: { family: "'Nunito', sans-serif" },
          bodyFont:  { family: "'Nunito', sans-serif" },
        },
      },
    },
  });
}
 
// ═══════════════════════════════════════════════════════════════════════
//  CHART 3 — Sleep bar chart
// ═══════════════════════════════════════════════════════════════════════
function _renderSleepChart(data) {
  const byDay    = LAST_7_DATES.map(d => {
    const rows = data.filter(e => e.date === d);
    return rows.length ? avg(rows.map(e => e.sleep)) : 0;
  });
  const sleepAvg = avg(data.map(d => d.sleep));
 
  document.getElementById('sleep-avg-val').textContent =
    sleepAvg > 0 ? sleepAvg + 'h' : '—';
 
  if (_sleepChart) _sleepChart.destroy();
  _sleepChart = new Chart(document.getElementById('chart-sleep'), {
    type: 'bar',
    data: {
      labels:   DAY_LABELS,
      datasets: [{
        label:           'Sleep (h)',
        data:            byDay,
        backgroundColor: '#7ab8d4',
        borderRadius:    5,
        borderSkipped:   false,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#fffaf4',
          borderColor:     '#f0e6d3',
          borderWidth:     1,
          titleColor:      '#3d2b1f',
          bodyColor:       '#7a5c46',
          titleFont: { family: "'Nunito', sans-serif" },
          bodyFont:  { family: "'Nunito', sans-serif" },
          callbacks: { label: ctx => ` ${ctx.raw}h` },
        },
      },
      scales: {
        x: {
          grid:  { display: false },
          ticks: { color: '#b89880', font: { family: "'Nunito', sans-serif", size: 11 } },
        },
        y: {
          min: 0, max: 12,
          grid:  { color: '#f0e6d3', drawBorder: false },
          ticks: { color: '#b89880', font: { family: "'Nunito', sans-serif", size: 11 } },
        },
      },
    },
  });
}
 
// ═══════════════════════════════════════════════════════════════════════
//  UI HELPERS  (modal open/close — exposed on the UI object)
// ═══════════════════════════════════════════════════════════════════════
const UI = {
 
  openForm() {
    // Reset form state
    STATE.formMood      = null;
    STATE.formBreakfast = null;
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.bf-btn').forEach(b => b.className = 'bf-btn');
    document.getElementById('sleep-slider').value        = 7;
    document.getElementById('sleep-val-display').textContent = '7h';
    document.getElementById('form-save-note').textContent =
      STATE.user ? 'Saving to your account' : 'Saving anonymously 🔒';
    _updateSaveBtn();
    document.getElementById('form-overlay').classList.remove('hidden');
  },
 
  closeForm() {
    document.getElementById('form-overlay').classList.add('hidden');
  },
 
  openAuth(tab = 'login') {
    // Clear all fields and messages
    ['login-user','login-pass','signup-user','signup-email','signup-pass','signup-confirm']
      .forEach(id => { document.getElementById(id).value = ''; });
    ['login-error','signup-error','signup-success']
      .forEach(id => { const el = document.getElementById(id); el.textContent = ''; el.classList.add('hidden'); });
    this.switchAuthTab(tab);
    document.getElementById('auth-overlay').classList.remove('hidden');
  },
 
  closeAuth() {
    document.getElementById('auth-overlay').classList.add('hidden');
  },
 
  switchAuthTab(tab) {
    document.getElementById('auth-login-form' ).classList.toggle('hidden', tab !== 'login');
    document.getElementById('auth-signup-form').classList.toggle('hidden', tab !== 'signup');
    document.getElementById('tab-login' ).classList.toggle('active', tab === 'login');
    document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  },
};
 
// ═══════════════════════════════════════════════════════════════════════
//  PUBLIC API SURFACE  (called from HTML onclick attributes)
// ═══════════════════════════════════════════════════════════════════════
const App = {
  setView,
  toggleCheck,
  pickMood,
  pickBreakfast,
  handleLogin,
  handleSignup,
  handleSave,
};
 
// ═══════════════════════════════════════════════════════════════════════
//  KEYBOARD shortcuts
// ═══════════════════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { UI.closeForm(); UI.closeAuth(); }
});
 
// ═══════════════════════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', _boot);
