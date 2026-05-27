'use strict';

const CIRCUMFERENCE = 2 * Math.PI * 110; // SVG ring r=110

// ── Storage ──────────────────────────────────────────────────────────────────

const Storage = {
  K: { active: 'fast_active', history: 'fast_history', settings: 'fast_settings', notes: 'fast_notes', weight: 'fast_weight' },

  getSettings() {
    try { return { goalHours: 16, ...JSON.parse(localStorage.getItem(this.K.settings) || '{}') }; }
    catch { return { goalHours: 16 }; }
  },

  saveSettings(s) { localStorage.setItem(this.K.settings, JSON.stringify(s)); },

  getActive() {
    try { return JSON.parse(localStorage.getItem(this.K.active)); }
    catch { return null; }
  },

  saveActive(f) { localStorage.setItem(this.K.active, JSON.stringify(f)); },
  clearActive() { localStorage.removeItem(this.K.active); },
  updateActive(changes) {
    const a = this.getActive();
    if (a) this.saveActive({ ...a, ...changes });
  },

  getHistory() {
    try { return JSON.parse(localStorage.getItem(this.K.history) || '[]'); }
    catch { return []; }
  },

  addToHistory(entry) {
    const h = this.getHistory();
    h.unshift(entry);
    localStorage.setItem(this.K.history, JSON.stringify(h));
  },

  deleteFromHistory(id) {
    const h = this.getHistory().filter(e => e.id !== id);
    localStorage.setItem(this.K.history, JSON.stringify(h));
  },

  getNotes() {
    try { return JSON.parse(localStorage.getItem(this.K.notes) || '[]'); }
    catch { return []; }
  },
  addNote(text) {
    const notes = this.getNotes();
    notes.unshift({ id: uid(), text, createdAt: new Date().toISOString() });
    localStorage.setItem(this.K.notes, JSON.stringify(notes));
  },
  deleteNote(id) {
    const notes = this.getNotes().filter(n => n.id !== id);
    localStorage.setItem(this.K.notes, JSON.stringify(notes));
  },

  getWeight() {
    try { return { unit: 'lbs', log: [], ...JSON.parse(localStorage.getItem(this.K.weight) || '{}') }; }
    catch { return { unit: 'lbs', log: [] }; }
  },

  saveWeight(data) { localStorage.setItem(this.K.weight, JSON.stringify(data)); },

  addWeightEntry(weight, date) {
    const data = this.getWeight();
    data.log.push({ id: uid(), weight, date, loggedAt: new Date().toISOString() });
    data.log.sort((a, b) => a.date.localeCompare(b.date));
    this.saveWeight(data);
  },

  deleteWeightEntry(id) {
    const data = this.getWeight();
    data.log = data.log.filter(e => e.id !== id);
    this.saveWeight(data);
  },

  setWeightUnit(unit) {
    const data = this.getWeight();
    data.unit = unit;
    this.saveWeight(data);
  },

  clearAll() { Object.values(this.K).forEach(k => localStorage.removeItem(k)); },

  export() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: this.getSettings(),
      active: this.getActive(),
      history: this.getHistory(),
      notes: this.getNotes(),
      weight: this.getWeight(),
    };
  },

  import(data) {
    if (!data.version || !Array.isArray(data.history)) throw new Error('Unrecognized format.');
    if (data.settings) this.saveSettings(data.settings);
    if (data.active) this.saveActive(data.active);
    localStorage.setItem(this.K.history, JSON.stringify(data.history));
    if (Array.isArray(data.notes)) localStorage.setItem(this.K.notes, JSON.stringify(data.notes));
    if (data.weight && Array.isArray(data.weight.log)) this.saveWeight(data.weight);
  },
};

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtDuration(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  return `${pad(h)}:${pad(m)}:${pad(sc)}`;
}

function fmtDurationShort(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function fmtGoal(hours) {
  if (hours % 24 === 0) return `${hours / 24}d`;
  return `${hours}h`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── Timer ─────────────────────────────────────────────────────────────────────

let ticker = null;
let activeView = 'timer';

function startFast(startTime = new Date()) {
  const { goalHours } = Storage.getSettings();
  Storage.saveActive({ id: uid(), startTime: new Date(startTime).toISOString(), goalHours });
  renderTimer();
  tick();
}

function endFast() {
  const active = Storage.getActive();
  if (!active) return;

  const endTime = new Date();
  const startTime = new Date(active.startTime);
  const duration = endTime - startTime;
  const goalMs = active.goalHours * 3_600_000;

  Storage.addToHistory({
    id: active.id,
    startTime: active.startTime,
    endTime: endTime.toISOString(),
    duration,
    goalHours: active.goalHours,
    goalMet: duration >= goalMs,
  });

  Storage.clearActive();
  stopTicker();
  renderTimer();
}

function tick() {
  stopTicker();
  updateTimerDisplay();
  ticker = setInterval(() => {
    if (activeView === 'timer') updateTimerDisplay();
  }, 1000);
}

function stopTicker() {
  if (ticker) { clearInterval(ticker); ticker = null; }
}

function updateTimerDisplay() {
  const active = Storage.getActive();
  if (!active) return;

  const elapsed = Date.now() - new Date(active.startTime).getTime();
  const goalMs = active.goalHours * 3_600_000;
  const progress = Math.min(elapsed / goalMs, 1);
  const goalMet = elapsed >= goalMs;

  document.getElementById('elapsed-time').textContent = fmtDuration(elapsed);

  const ring = document.getElementById('ring-progress');
  ring.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  ring.setAttribute('class', 'ring-progress ' + (goalMet ? 'goal-met' : 'fasting'));

  const badge = document.getElementById('fast-status');
  if (goalMet) {
    badge.textContent = 'Goal met';
    badge.className = 'status-badge goal-met';
  } else {
    badge.textContent = 'Fasting';
    badge.className = 'status-badge fasting';
  }

  const remaining = goalMs - elapsed;
  const trEl = document.getElementById('time-remaining');
  trEl.textContent = goalMet
    ? `+${fmtDurationShort(Math.abs(remaining))} past goal`
    : `${fmtDurationShort(remaining)} left`;
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderTimer() {
  const active = Storage.getActive();
  const settings = Storage.getSettings();

  const btn = document.getElementById('fast-toggle');
  const backdateBtn = document.getElementById('backdate-btn');
  const goalInfo = document.getElementById('goal-info');
  const since = document.getElementById('fast-since');
  const ring = document.getElementById('ring-progress');
  const badge = document.getElementById('fast-status');

  if (active) {
    btn.textContent = 'End Fast';
    btn.classList.add('ending');
    backdateBtn.classList.add('hidden');
    goalInfo.classList.remove('hidden');
    since.classList.remove('hidden');
    since.textContent = `Started ${fmtDateTime(active.startTime)}`;
    document.getElementById('goal-label').textContent = `Goal: ${fmtGoal(active.goalHours)} ✎`;
    tick();
  } else {
    btn.textContent = 'Start Fast';
    btn.classList.remove('ending');
    backdateBtn.classList.remove('hidden');
    goalInfo.classList.add('hidden');
    since.classList.add('hidden');
    document.getElementById('elapsed-time').textContent = '00:00:00';
    badge.textContent = 'Not fasting';
    badge.className = 'status-badge';
    ring.style.strokeDashoffset = CIRCUMFERENCE;
    ring.setAttribute('class', 'ring-progress');
    stopTicker();
  }
}

function renderHistory() {
  const history = Storage.getHistory();
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');

  if (history.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = history.map(e => `
    <div class="history-item" data-id="${e.id}">
      <div class="goal-dot ${e.goalMet ? 'met' : ''}"></div>
      <div class="item-info">
        <div class="item-duration">${fmtDurationShort(e.duration)}</div>
        <div class="item-meta">${fmtDate(e.startTime)} &middot; ${e.goalMet ? 'Goal met' : 'Goal: ' + fmtGoal(e.goalHours)}</div>
        <div class="item-meta">${fmtDateTime(e.startTime)} &rarr; ${fmtDateTime(e.endTime)}</div>
      </div>
      <button class="delete-btn" aria-label="Delete fast">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/>
          <path d="M9 6V4h6v2"/>
        </svg>
      </button>
    </div>
  `).join('');

  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const item = e.currentTarget.closest('.history-item');
      if (confirm('Delete this fast?')) {
        Storage.deleteFromHistory(item.dataset.id);
        renderHistory();
      }
    });
  });
}

function renderStats() {
  const history = Storage.getHistory();
  const grid = document.getElementById('stats-grid');
  const empty = document.getElementById('stats-empty');

  if (history.length === 0) {
    grid.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  grid.classList.remove('hidden');
  empty.classList.add('hidden');

  const total = history.length;
  const metCount = history.filter(e => e.goalMet).length;
  const goalRate = Math.round((metCount / total) * 100);
  const longest = history.reduce((max, e) => Math.max(max, e.duration), 0);
  const avg = history.reduce((sum, e) => sum + e.duration, 0) / total;
  const streak = computeStreak(history);

  grid.innerHTML = `
    <div class="stat-card accent">
      <div class="stat-value">${total}</div>
      <div class="stat-label">Total Fasts</div>
    </div>
    <div class="stat-card success">
      <div class="stat-value">${streak}</div>
      <div class="stat-label">Day Streak</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${fmtDurationShort(longest)}</div>
      <div class="stat-label">Longest Fast</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${fmtDurationShort(Math.round(avg))}</div>
      <div class="stat-label">Average Fast</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${goalRate}%</div>
      <div class="stat-label">Goal Rate</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${metCount}</div>
      <div class="stat-label">Goals Met</div>
    </div>
  `;
}

function computeStreak(history) {
  const fastDates = new Set(history.map(e => dateKey(new Date(e.startTime))));
  const today = new Date();
  const todayKey = dateKey(today);

  // Start from today if fasted today, else from yesterday
  const startOffset = fastDates.has(todayKey) ? 0 : 1;
  let streak = 0;

  for (let i = startOffset; i < 366; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (fastDates.has(dateKey(d))) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

function renderSettings() {
  const { goalHours } = Storage.getSettings();
  const container = document.getElementById('goal-presets');
  const presets = [12, 14, 16, 18, 20, 24, 36, 48];

  container.innerHTML = presets.map(h => `
    <button class="preset-btn ${goalHours === h ? 'active' : ''}" data-hours="${h}">
      ${fmtGoal(h)}
    </button>
  `).join('');

  container.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = Storage.getSettings();
      s.goalHours = parseInt(btn.dataset.hours);
      Storage.saveSettings(s);
      renderSettings();
    });
  });
}

// ── Weight ────────────────────────────────────────────────────────────────────

function renderWeight() {
  const { unit, log } = Storage.getWeight();

  document.querySelectorAll('.unit-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.unit === unit);
  });

  const dateInput = document.getElementById('weight-date');
  if (!dateInput.value) dateInput.value = dateKey(new Date());

  const summaryEl = document.getElementById('weight-summary');
  const listEl    = document.getElementById('weight-list');
  const emptyEl   = document.getElementById('weight-empty');

  if (log.length === 0) {
    summaryEl.innerHTML = '';
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');

  const first = log[0];
  const last  = log[log.length - 1];
  const delta = parseFloat((last.weight - first.weight).toFixed(1));
  const deltaDisplay = Math.abs(delta);
  const deltaClass   = delta < 0 ? 'weight-lost' : (delta > 0 ? 'weight-gained' : '');
  const deltaLabel   = delta < 0 ? 'Total Lost' : (delta > 0 ? 'Total Gained' : 'No Change');

  summaryEl.innerHTML = `
    <div class="weight-summary-grid">
      <div class="stat-card">
        <div class="stat-value">${first.weight}</div>
        <div class="stat-label">Starting (${unit})</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${last.weight}</div>
        <div class="stat-label">Current (${unit})</div>
      </div>
      <div class="stat-card ${deltaClass}">
        <div class="stat-value">${deltaDisplay}</div>
        <div class="stat-label">${deltaLabel} (${unit})</div>
      </div>
    </div>
  `;

  const reversed = [...log].reverse();
  listEl.innerHTML = reversed.map(entry => {
    const chronIdx = log.findIndex(e => e.id === entry.id);
    let deltaEl = '';
    if (chronIdx > 0) {
      const d = parseFloat((entry.weight - log[chronIdx - 1].weight).toFixed(1));
      if (d !== 0) {
        const arrow = d > 0 ? '↑' : '↓';
        const color = d > 0 ? 'var(--danger)' : 'var(--success)';
        deltaEl = `<span class="weight-delta" style="color:${color}">${arrow} ${Math.abs(d)}</span>`;
      }
    }
    return `
      <div class="weight-item" data-id="${entry.id}">
        <div class="weight-item-info">
          <span class="weight-item-date">${fmtDate(entry.date + 'T12:00:00')}</span>
          ${deltaEl}
        </div>
        <span class="weight-item-value">${entry.weight} ${unit}</span>
        <button class="delete-btn" aria-label="Delete entry">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const item = e.currentTarget.closest('.weight-item');
      if (confirm('Delete this entry?')) {
        Storage.deleteWeightEntry(item.dataset.id);
        renderWeight();
      }
    });
  });
}

// ── Journal ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderNotes() {
  const notes = Storage.getNotes();
  const list = document.getElementById('notes-list');
  const empty = document.getElementById('notes-empty');

  if (notes.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = notes.map(n => `
    <div class="note-item" data-id="${n.id}">
      <div class="note-header">
        <span class="note-date">${fmtDateTime(n.createdAt)}</span>
        <button class="delete-btn" aria-label="Delete note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
      <div class="note-text">${escapeHtml(n.text)}</div>
    </div>
  `).join('');

  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const item = e.currentTarget.closest('.note-item');
      if (confirm('Delete this note?')) {
        Storage.deleteNote(item.dataset.id);
        renderNotes();
      }
    });
  });
}

// ── Navigation ────────────────────────────────────────────────────────────────

function showView(name) {
  activeView = name;

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById(`view-${name}`).classList.add('active');
  document.querySelector(`[data-view="${name}"]`).classList.add('active');

  switch (name) {
    case 'timer':    renderTimer();    break;
    case 'journal':  renderNotes();    break;
    case 'history':  renderHistory();  break;
    case 'stats':    renderStats(); renderWeight(); break;
    case 'settings': renderSettings(); break;
  }
}

// ── Change goal modal ─────────────────────────────────────────────────────────

function openGoalModal() {
  const active = Storage.getActive();
  if (!active) return;

  const presets = [12, 14, 16, 18, 20, 24, 36, 48];
  const container = document.getElementById('goal-modal-presets');
  container.innerHTML = presets.map(h => `
    <button class="preset-btn ${active.goalHours === h ? 'active' : ''}" data-hours="${h}">
      ${fmtGoal(h)}
    </button>
  `).join('');

  container.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => applyGoalChange(parseInt(btn.dataset.hours)));
  });

  document.getElementById('goal-modal-custom').value = '';
  document.getElementById('modal-goal').classList.remove('hidden');
}

function closeGoalModal() {
  document.getElementById('modal-goal').classList.add('hidden');
}

function applyGoalChange(hours) {
  Storage.updateActive({ goalHours: hours });
  document.getElementById('goal-label').textContent = `Goal: ${fmtGoal(hours)} ✎`;
  updateTimerDisplay();
  closeGoalModal();
}

// ── Backdate modal ────────────────────────────────────────────────────────────

function openBackdateModal() {
  const now = new Date();
  // datetime-local input requires local time in YYYY-MM-DDThh:mm format
  const local = new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const input = document.getElementById('backdate-input');
  input.value = local;
  document.getElementById('modal-backdate').classList.remove('hidden');
}

function closeBackdateModal() {
  document.getElementById('modal-backdate').classList.add('hidden');
}

// ── End fast modal ────────────────────────────────────────────────────────────

function openModal() {
  const active = Storage.getActive();
  if (!active) return;
  const elapsed = Date.now() - new Date(active.startTime).getTime();
  document.getElementById('modal-body').textContent =
    `You've fasted for ${fmtDurationShort(elapsed)}. Save and end this fast?`;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ── Wire events ───────────────────────────────────────────────────────────────

function wireEvents() {
  // Nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // Timer toggle
  document.getElementById('fast-toggle').addEventListener('click', () => {
    if (Storage.getActive()) openModal();
    else startFast();
  });

  // Journal
  document.getElementById('note-add-btn').addEventListener('click', () => {
    const input = document.getElementById('note-input');
    const text = input.value.trim();
    if (!text) return;
    Storage.addNote(text);
    input.value = '';
    renderNotes();
  });
  document.getElementById('note-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      document.getElementById('note-add-btn').click();
    }
  });

  // Change goal
  document.getElementById('goal-label').addEventListener('click', openGoalModal);
  document.getElementById('goal-modal-cancel').addEventListener('click', closeGoalModal);
  document.getElementById('modal-goal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeGoalModal();
  });
  document.getElementById('goal-modal-set').addEventListener('click', () => {
    const h = parseInt(document.getElementById('goal-modal-custom').value);
    if (!h || h < 1 || h > 168) { alert('Enter a number between 1 and 168.'); return; }
    applyGoalChange(h);
  });
  document.getElementById('goal-modal-custom').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('goal-modal-set').click();
  });

  // Backdate
  document.getElementById('backdate-btn').addEventListener('click', openBackdateModal);
  document.getElementById('backdate-cancel').addEventListener('click', closeBackdateModal);
  document.getElementById('modal-backdate').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeBackdateModal();
  });
  document.getElementById('backdate-confirm').addEventListener('click', () => {
    const val = document.getElementById('backdate-input').value;
    if (!val) { alert('Please pick a time.'); return; }
    const chosen = new Date(val);
    if (chosen >= new Date()) { alert('Start time must be in the past.'); return; }
    closeBackdateModal();
    startFast(chosen);
  });

  // Modal
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-confirm').addEventListener('click', () => {
    closeModal();
    endFast();
  });
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Custom goal
  document.getElementById('custom-goal-btn').addEventListener('click', () => {
    const input = document.getElementById('custom-hours');
    const h = parseInt(input.value);
    if (!h || h < 1 || h > 168) { alert('Enter a number between 1 and 168.'); return; }
    const s = Storage.getSettings();
    s.goalHours = h;
    Storage.saveSettings(s);
    input.value = '';
    renderSettings();
  });

  document.getElementById('custom-hours').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('custom-goal-btn').click();
  });

  // Export
  document.getElementById('export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(Storage.export(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fast-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import
  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        Storage.import(JSON.parse(ev.target.result));
        alert('Import successful.');
        showView('timer');
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Weight
  document.getElementById('weight-log-btn').addEventListener('click', () => {
    const weightInput = document.getElementById('weight-input');
    const dateInput   = document.getElementById('weight-date');
    const w = parseFloat(weightInput.value);
    const d = dateInput.value;
    if (!w || w <= 0 || w > 999) { alert('Enter a valid weight.'); return; }
    if (!d) { alert('Please pick a date.'); return; }
    Storage.addWeightEntry(w, d);
    weightInput.value = '';
    renderWeight();
  });

  document.getElementById('weight-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('weight-log-btn').click();
  });

  document.querySelectorAll('.unit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      Storage.setWeightUnit(btn.dataset.unit);
      renderWeight();
    });
  });

  // Clear all
  document.getElementById('clear-btn').addEventListener('click', () => {
    if (!confirm('Delete ALL data permanently? This cannot be undone.')) return;
    Storage.clearAll();
    stopTicker();
    showView('timer');
  });
}

// ── Service worker ────────────────────────────────────────────────────────────

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  registerSW();
  wireEvents();
  showView('timer');
});
