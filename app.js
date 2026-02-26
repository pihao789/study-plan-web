(function () {
  'use strict';

  const STORAGE_KEY = 'studyplan_data';
  const PIN_STORAGE_KEY = 'studyplan_pin_hash';
  const SAMPLE_PLAN_URL = 'plans/bible-in-a-year-365.json';

  function pinHash(pin) {
    return String(pin).split('').reduce(function (h, c) { return ((h << 5) - h) + c.charCodeAt(0) | 0; }, 0).toString(36);
  }
  function getStoredPinHash() { return localStorage.getItem(PIN_STORAGE_KEY); }
  function setStoredPinHash(h) { localStorage.setItem(PIN_STORAGE_KEY, h); }
  function clearStoredPinHash() { localStorage.removeItem(PIN_STORAGE_KEY); }

  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function todaysDayNumber(plan) {
    if (!plan || !plan.days || plan.days.length === 0) return null;
    const start = new Date(plan.startDate + 'T00:00:00');
    const today = new Date();
    start.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diff = Math.floor((today - start) / 86400000);
    if (diff < 0) return null;
    return Math.min(diff + 1, plan.days.length);
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        var plans = Array.isArray(data.plans) ? data.plans : [];
        plans.forEach(ensurePlanId);
        var progress = Array.isArray(data.progress) ? data.progress : [];
        progress.forEach(function (p) {
          p.planId = String(p.planId);
          p.dayId = String(p.dayId).indexOf('day-') === 0 ? p.dayId : 'day-' + p.dayId;
          if (p.completed === undefined) p.completed = false;
          if (p.completedDate === undefined) p.completedDate = p.completed ? todayISO() : null;
        });
        return { plans: plans, progress: progress };
      }
    } catch (_) {}
    return { plans: [], progress: [] };
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      plans: state.plans,
      progress: state.progress
    }));
  }

  function getProgress(state, planId, dayId) {
    var dayKey = typeof dayId === 'number' ? 'day-' + dayId : dayId;
    if (String(dayKey).indexOf('day-') !== 0) dayKey = 'day-' + dayKey;
    return state.progress.find(function (p) {
      return String(p.planId) === String(planId) && String(p.dayId) === String(dayKey);
    });
  }

  function completedCount(state, planId) {
    return state.progress.filter(function (p) { return String(p.planId) === String(planId) && p.completed; }).length;
  }

  function ensurePlanId(plan) {
    if (!plan.id) plan.id = uid();
    return plan;
  }

  function setStartDateToToday(plan) {
    plan.startDate = todayISO();
    return plan;
  }

  let state = loadState();
  let view = { screen: 'home', planId: null, dayNumber: null, pinScreen: null };
  let unlockedSession = false;
  const appEl = document.getElementById('app');

  // Delegated handler for day-list nav icon actions
  appEl.addEventListener('click', function dayListMenuDelegate(ev) {
    var target = ev.target.closest && ev.target.closest('[data-action="export-plan-only"], [data-action="export-plan-data"], [data-action="reset-progress"], [data-action="remove-plan-nav"]');
    if (!target || view.screen !== 'days' || !view.planId) return;
    var plan = state.plans.find(function (p) { return String(p.id) === String(view.planId); });
    if (!plan) return;
    var action = target.getAttribute('data-action');
    ev.preventDefault();
    ev.stopPropagation();
    if (action === 'export-plan-only') {
      exportPlanOnly(plan);
    } else if (action === 'export-plan-data') {
      exportPlanWithData(plan);
    } else if (action === 'reset-progress') {
      if (!confirm('Reset progress for this plan? All completed days and notes will be cleared.')) return;
      clearProgress(plan.id);
    } else if (action === 'remove-plan-nav') {
      if (!confirm('Remove this plan and all its progress?')) return;
      removePlan(plan.id);
      view = { screen: 'home', planId: null };
    }
    render();
  }, true);

  // Delegated handler for data-goto (nav Settings, footer About)
  document.body.addEventListener('click', function (ev) {
    var link = ev.target.closest && ev.target.closest('[data-goto]');
    if (!link) return;
    ev.preventDefault();
    var screen = link.getAttribute('data-goto');
    if (screen === 'data' || screen === 'about') {
      view = { screen: screen };
      render();
    }
  });

  // Delegated handler for lock app (visible on all views when PIN is set)
  document.body.addEventListener('click', function (ev) {
    var btn = ev.target.closest && ev.target.closest('[data-action="lock-app"]');
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    unlockedSession = false;
    view.pinScreen = 'enter';
    render();
  });

  function emit() {
    saveState(state);
    render();
  }

  function addPlan(plan) {
    ensurePlanId(plan);
    setStartDateToToday(plan);
    state.plans.push(plan);
    emit();
  }

  function removePlan(id) {
    var idStr = String(id);
    state.plans = state.plans.filter(function (p) { return String(p.id) !== idStr; });
    state.progress = state.progress.filter(function (p) { return String(p.planId) !== idStr; });
    emit();
  }

  function clearProgress(planId) {
    var idStr = String(planId);
    state.progress = state.progress.filter(function (p) { return String(p.planId) !== idStr; });
    emit();
  }

  function updatePlanTitle(id, title, planFromView) {
    if (!title) return;
    var p = id ? state.plans.find(function (x) { return String(x.id) === String(id); }) : null;
    if (!p && planFromView) p = planFromView;
    if (p) {
      p.title = title;
      emit();
    }
  }

  function setProgress(planId, dayId, updates) {
    var dayKey = typeof dayId === 'number' ? 'day-' + dayId : dayId;
    if (String(dayKey).indexOf('day-') !== 0) dayKey = 'day-' + dayKey;
    var entry = state.progress.find(function (p) { return String(p.planId) === String(planId) && String(p.dayId) === String(dayKey); });
    if (!entry) {
      entry = { planId: String(planId), dayId: String(dayKey), completed: false, note: '', completedDate: null };
      state.progress.push(entry);
    }
    Object.assign(entry, updates);
    if (updates.completed !== undefined) entry.completedDate = updates.completed ? todayISO() : null;
    emit();
  }

  function getPlan(id) {
    return state.plans.find(function (p) { return String(p.id) === String(id); });
  }

  function exportAll() {
    return JSON.stringify({
      plans: state.plans,
      progress: state.progress,
      exportedAt: new Date().toISOString().slice(0, 10)
    }, null, 2);
  }

  function importFromFile(json) {
    try {
      const data = JSON.parse(json);
      if (Array.isArray(data.plans)) {
        state.plans = data.plans.map(ensurePlanId);
        if (Array.isArray(data.progress)) state.progress = data.progress;
        emit();
        return true;
      }
      if (data.plan && (data.plan.title || data.plan.days)) {
        const plan = ensurePlanId(data.plan);
        const existing = state.plans.find(function (p) { return String(p.id) === String(plan.id); });
        if (existing) {
          var idx = state.plans.indexOf(existing);
          state.plans[idx] = plan;
        } else {
          state.plans.push(plan);
        }
        if (Array.isArray(data.progress)) {
          state.progress = state.progress.filter(function (p) { return String(p.planId) !== String(plan.id); });
          data.progress.forEach(function (p) {
            p.planId = String(p.planId || plan.id);
            p.dayId = String(p.dayId).indexOf('day-') === 0 ? p.dayId : 'day-' + p.dayId;
            if (p.completed === undefined) p.completed = false;
            if (p.completedDate === undefined) p.completedDate = p.completed ? todayISO() : null;
            state.progress.push(p);
          });
        }
        emit();
        return true;
      }
      if (data.title && Array.isArray(data.days)) {
        const plan = {
          id: data.id || '',
          title: data.title,
          startDate: data.startDate || todayISO(),
          days: data.days
        };
        addPlan(plan);
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  function render() {
    if (view.pinScreen) {
      renderPinGate();
      return;
    }
    if (getStoredPinHash() && !unlockedSession) {
      view.pinScreen = 'enter';
      renderPinGate();
      return;
    }
    document.body.classList.remove('pin-gate-active');
    if (state.plans.length === 0 && view.screen !== 'data' && view.screen !== 'about') {
      renderNoPlan();
      return;
    }

    switch (view.screen) {
      case 'home':
        renderPlanList();
        break;
      case 'days':
        renderDayList();
        break;
      case 'day':
        renderDayDetail();
        break;
      case 'data':
        renderData();
        break;
      case 'about':
        renderAbout();
        break;
      default:
        renderPlanList();
    }
  }

  function lockNavButton() {
    if (!getStoredPinHash() || !unlockedSession) return '';
    return '<button type="button" class="nav-link-icon" data-action="lock-app" title="Lock app" aria-label="Lock app"><span class="nav-icon-char" aria-hidden="true">🔒</span><span class="nav-link-text">Lock</span></button>';
  }

  function nav(title, extraRight, titleHtml) {
    const back = view.screen !== 'home'
      ? '<button type="button" class="nav-back-btn" data-action="back" title="Back" aria-label="Back"><span class="nav-back-arrow" aria-hidden="true">⬅</span><span class="nav-back-text">Back</span></button>'
      : '';
    const gear = view.screen === 'home'
      ? '<a href="#" class="nav-link-icon" data-goto="data" title="Settings" aria-label="Settings"><span class="nav-icon-char" aria-hidden="true">⚙</span><span class="nav-link-text">Settings</span></a>'
      : '';
    const lockBtn = lockNavButton();
    const titleContent = titleHtml !== undefined ? titleHtml : escapeHtml(title);
    const right = view.screen === 'home'
      ? [lockBtn, extraRight, gear].filter(Boolean).join(' ').trim()
      : [lockBtn, back, gear, extraRight].filter(Boolean).join(' ').trim();
    return `<nav><span class="nav-title-wrap"><span class="nav-app-icon" aria-hidden="true">📖</span><span class="title">${titleContent}</span></span><div class="nav-right">${right}</div></nav>`;
  }

  function renderPinGate() {
    var mode = view.pinScreen;
    var titles = { enter: 'Enter PIN', create: 'Set PIN', change: 'Change PIN', remove: 'Remove PIN' };
    var title = titles[mode] || 'PIN';
    var backHtml = mode === 'create' ? '<button type="button" class="pin-back-btn" data-pin-action="cancel-create">Cancel</button>' : '';
    var fields = '';
    if (mode === 'enter') {
      fields = '<label class="pin-label">PIN</label><input type="password" id="pin-input" class="pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="••••" autocomplete="off" />';
    } else if (mode === 'create') {
      fields = '<label class="pin-label">New PIN (4–8 digits)</label><input type="password" id="pin-new" class="pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="••••" autocomplete="off" />' +
        '<label class="pin-label">Confirm PIN</label><input type="password" id="pin-confirm" class="pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="••••" autocomplete="off" />';
    } else if (mode === 'change') {
      fields = '<label class="pin-label">Current PIN</label><input type="password" id="pin-current" class="pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="••••" autocomplete="off" />' +
        '<label class="pin-label">New PIN (4–8 digits)</label><input type="password" id="pin-new" class="pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="••••" autocomplete="off" />' +
        '<label class="pin-label">Confirm PIN</label><input type="password" id="pin-confirm" class="pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="••••" autocomplete="off" />';
    } else if (mode === 'remove') {
      fields = '<label class="pin-label">Current PIN</label><input type="password" id="pin-input" class="pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="••••" autocomplete="off" />';
    }
    var submitLabel = (mode === 'enter' ? 'Unlock' : mode === 'remove' ? 'Remove PIN' : 'Save');
    appEl.innerHTML = '<div class="pin-gate">' +
      '<div class="pin-gate-card">' +
      '<span class="pin-gate-icon" aria-hidden="true">🔒</span>' +
      '<h2 class="pin-gate-title">' + escapeHtml(title) + '</h2>' +
      '<p id="pin-error" class="pin-error" style="display:none"></p>' +
      '<form class="pin-form" id="pin-form">' + fields + '</form>' +
      '<div class="pin-actions">' + backHtml + '<button type="button" class="btn btn-primary pin-submit-btn" id="pin-submit">' + escapeHtml(submitLabel) + '</button></div>' +
      '</div></div>';
    document.body.classList.add('pin-gate-active');
    var form = appEl.querySelector('#pin-form');
    var errEl = appEl.querySelector('#pin-error');
    function showError(msg) {
      errEl.textContent = msg || '';
      errEl.style.display = msg ? 'block' : 'none';
    }
    function getPinInput() { return appEl.querySelector('#pin-input'); }
    function getPinNew() { return appEl.querySelector('#pin-new'); }
    function getPinConfirm() { return appEl.querySelector('#pin-confirm'); }
    function getPinCurrent() { return appEl.querySelector('#pin-current'); }
    appEl.querySelector('#pin-submit').onclick = function () {
      showError('');
      if (mode === 'enter') {
        var pin = (getPinInput().value || '').trim();
        if (pin.length < 4) { showError('Enter at least 4 digits.'); return; }
        if (pinHash(pin) !== getStoredPinHash()) { showError('Wrong PIN.'); return; }
        unlockedSession = true;
        view.pinScreen = null;
        render();
      } else if (mode === 'create') {
        var newPin = (getPinNew().value || '').trim();
        var conf = (getPinConfirm().value || '').trim();
        if (newPin.length < 4) { showError('PIN must be 4–8 digits.'); return; }
        if (newPin !== conf) { showError('PINs do not match.'); return; }
        setStoredPinHash(pinHash(newPin));
        unlockedSession = true;
        view.pinScreen = null;
        render();
      } else if (mode === 'change') {
        var cur = (getPinCurrent().value || '').trim();
        if (pinHash(cur) !== getStoredPinHash()) { showError('Wrong current PIN.'); return; }
        var newPin = (getPinNew().value || '').trim();
        var conf = (getPinConfirm().value || '').trim();
        if (newPin.length < 4) { showError('New PIN must be 4–8 digits.'); return; }
        if (newPin !== conf) { showError('New PINs do not match.'); return; }
        setStoredPinHash(pinHash(newPin));
        view.pinScreen = null;
        render();
      } else if (mode === 'remove') {
        var pin = (getPinInput().value || '').trim();
        if (pinHash(pin) !== getStoredPinHash()) { showError('Wrong PIN.'); return; }
        clearStoredPinHash();
        view.pinScreen = null;
        render();
      }
    };
    var cancelBtn = appEl.querySelector('[data-pin-action="cancel-create"]');
    if (cancelBtn) {
      cancelBtn.onclick = function () {
        view.pinScreen = null;
        document.body.classList.remove('pin-gate-active');
        render();
      };
    }
    if (form) {
      form.onsubmit = function (e) { e.preventDefault(); appEl.querySelector('#pin-submit').click(); };
      var firstInput = form.querySelector('input');
      if (firstInput) firstInput.focus();
    }
  }

  function startTitleEdit(titleEl, onSave) {
    if (!titleEl || titleEl.querySelector('input')) return;
    var current = titleEl.textContent.trim();
    var input = document.createElement('input');
    input.type = 'text';
    input.value = current;
    input.className = 'title-edit-input';
    titleEl.textContent = '';
    titleEl.appendChild(input);
    input.focus();
    input.select();
    function save() {
      var v = input.value.trim();
      if (input.parentNode) {
        titleEl.removeChild(input);
        titleEl.textContent = v || current;
      }
      if (v) {
        var planId = titleEl.getAttribute('data-plan-id');
        onSave(v, planId);
      }
    }
    input.addEventListener('blur', save);
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); save(); } });
  }

  function escapeHtml(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function renderNoPlan() {
    appEl.innerHTML = `
      ${nav('Study Plan', '')}
      <div class="screen no-plan">
        <div class="icon">📖</div>
        <h2>No Study Plan</h2>
        <p>Import a plan or try the sample to get started.</p>
        <button type="button" class="btn btn-primary" data-action="sample">Use sample plan (Bible in a Year)</button>
        <br>
        <button type="button" class="btn btn-secondary" data-action="import-plan">Import from file…</button>
        <input type="file" id="f-import-plan" accept=".json,application/json" />
        <p class="local-data-hint">All data is stored in your browser. Use Settings to export a backup.</p>
        <p id="no-plan-error" class="error" style="display:none"></p>
      </div>
    `;
    const sampleBtn = appEl.querySelector('[data-action="sample"]');
    const errEl = appEl.querySelector('#no-plan-error');
    sampleBtn.onclick = () => {
      errEl.style.display = 'none';
      sampleBtn.disabled = true;
      sampleBtn.textContent = 'Loading…';
      fetch(SAMPLE_PLAN_URL)
        .then(res => { if (!res.ok) throw new Error(res.statusText); return res.json(); })
        .then(data => {
          const plan = data.title && data.days ? { title: data.title, startDate: data.startDate || todayISO(), days: data.days } : null;
          if (!plan) throw new Error('Invalid plan format');
          addPlan(plan);
          view = { screen: 'home' };
          render();
        })
        .catch(() => {
          errEl.textContent = 'Could not load sample plan. Use a local server (e.g. npx serve) or import a plan file.';
          errEl.style.display = 'block';
          sampleBtn.disabled = false;
          sampleBtn.textContent = 'Use sample plan (Bible in a Year)';
        });
    };
    appEl.querySelector('[data-action="import-plan"]').onclick = () => appEl.querySelector('#f-import-plan').click();
    appEl.querySelector('#f-import-plan').onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        if (importFromFile(r.result)) {
          view = { screen: 'home' };
          render();
        } else {
          appEl.querySelector('#no-plan-error').textContent = 'Invalid file.';
          appEl.querySelector('#no-plan-error').style.display = 'block';
        }
      };
      r.readAsText(f);
      e.target.value = '';
    };
  }

  function renderPlanList() {
    appEl.innerHTML = `
      ${nav('Study Plans', '<button type="button" class="nav-btn nav-import-btn" data-action="import-plan-home" title="Import plan or progress from file" aria-label="Import"><span class="nav-icon-char" aria-hidden="true">📥</span><span class="nav-import-text">Import</span></button>')}
      <div class="screen">
        <ul class="list">
          ${state.plans.map(p => {
            const done = completedCount(state, p.id);
            const total = p.days ? p.days.length : 0;
            const pct = total ? (done / total) * 100 : 0;
            return `<li class="plan-list-row" data-plan-id="${escapeHtml(p.id)}">
              <a href="#" class="plan-list-link" data-goto-days="${escapeHtml(p.id)}">
                <div class="row">
                  <span class="check ${done > 0 ? 'done' : ''}">${done === total && total ? '✓' : '○'}</span>
                  <div class="main">
                    <div class="title-row">
                      <span class="plan-title" data-plan-id="${escapeHtml(p.id)}">${escapeHtml(p.title)}</span>
                    </div>
                    <div class="sub">${done} of ${total} days completed</div>
                    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
                  </div>
                </div>
              </a>
              <div class="plan-row-actions plan-icon-actions">
                <button type="button" class="plan-icon-btn edit-title-btn" data-plan-id="${escapeHtml(p.id)}" title="Rename plan" aria-label="Rename plan"><span class="plan-icon-char" aria-hidden="true">✎</span><span class="plan-icon-hint">Rename</span></button>
                <button type="button" class="plan-icon-btn" data-action="clear-progress" data-plan-id="${escapeHtml(p.id)}" title="Clear progress" aria-label="Clear progress"><span class="plan-icon-char" aria-hidden="true">🔄</span><span class="plan-icon-hint">Reset</span></button>
                <button type="button" class="plan-icon-btn danger-btn" data-action="remove-plan-row" data-plan-id="${escapeHtml(p.id)}" title="Remove plan" aria-label="Remove plan"><span class="plan-icon-char" aria-hidden="true">🗑</span><span class="plan-icon-hint">Remove</span></button>
              </div>
            </li>`;
          }).join('')}
        </ul>
        <p class="import-hint">
          <button type="button" class="btn btn-secondary btn-sm btn-with-icon" data-action="sample-home"><span class="btn-icon btn-icon-add" aria-hidden="true">➕</span><span class="btn-label">Add sample plan (Bible in a Year)</span></button>
          <button type="button" class="btn btn-secondary btn-sm btn-with-icon" data-action="import-plan-home"><span class="btn-icon btn-icon-add" aria-hidden="true">➕</span><span class="btn-label">Add plan from file…</span></button>
        </p>
        <p class="local-data-hint">All data is stored in your browser. Use Settings to export a backup.</p>
        <p id="home-sample-error" class="error" style="display:none; margin-top:8px; font-size:0.9rem;"></p>
        <input type="file" id="f-import-plan-home" accept=".json,application/json" style="display:none" />
      </div>
    `;
    appEl.querySelectorAll('[data-goto-days]').forEach(function (el) {
      el.onclick = function (e) {
        e.preventDefault();
        view = { screen: 'days', planId: el.getAttribute('data-goto-days') };
        render();
      };
    });
    appEl.querySelectorAll('[data-action="clear-progress"]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        var id = btn.getAttribute('data-plan-id');
        if (id && confirm('Clear progress for this plan? All completed days and notes will be reset.')) {
          clearProgress(id);
          render();
        }
      };
    });
    appEl.querySelectorAll('[data-action="remove-plan-row"]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        var id = btn.getAttribute('data-plan-id');
        if (id && confirm('Remove this plan and all its progress?')) {
          removePlan(id);
          render();
        }
      };
    });
    const clearEl = appEl.querySelector('[data-action="clear"]');
    if (clearEl) {
      clearEl.onclick = (e) => {
        e.preventDefault();
        if (confirm('Clear all plans and progress? This cannot be undone.')) {
          state = { plans: [], progress: [] };
          emit();
          view = { screen: 'home' };
          render();
        }
      };
    }
    appEl.querySelectorAll('.edit-title-btn').forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        var row = btn.closest('.plan-list-row');
        var titleEl = row ? row.querySelector('.plan-title') : null;
        if (titleEl) startTitleEdit(titleEl, function (v, planId) { updatePlanTitle(planId, v); });
      };
    });
    var importPlanInput = appEl.querySelector('#f-import-plan-home');
    var homeSampleError = appEl.querySelector('#home-sample-error');
    function triggerImportPlan() {
      if (importPlanInput) importPlanInput.click();
    }
    appEl.querySelectorAll('[data-action="import-plan-home"]').forEach(function (btn) {
      btn.onclick = function (e) { e.preventDefault(); triggerImportPlan(); };
    });
    appEl.querySelectorAll('[data-action="sample-home"]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        if (homeSampleError) homeSampleError.style.display = 'none';
        btn.disabled = true;
        btn.textContent = 'Loading…';
        fetch(SAMPLE_PLAN_URL)
          .then(function (res) { if (!res.ok) throw new Error(res.statusText); return res.json(); })
          .then(function (data) {
            var plan = data.title && data.days ? { title: data.title, startDate: data.startDate || todayISO(), days: data.days } : null;
            if (!plan) throw new Error('Invalid plan format');
            addPlan(plan);
            view = { screen: 'home' };
            render();
          })
          .catch(function () {
            if (homeSampleError) {
              homeSampleError.textContent = 'Could not load sample plan. Use a local server (e.g. npx serve) or add from file.';
              homeSampleError.style.display = 'block';
            }
            btn.disabled = false;
            btn.innerHTML = '<span class="btn-icon btn-icon-add" aria-hidden="true">➕</span><span class="btn-label">Add sample plan (Bible in a Year)</span>';
          });
      };
    });
    if (importPlanInput) {
      importPlanInput.onchange = function (e) {
        var f = e.target.files[0];
        if (!f) return;
        var r = new FileReader();
        r.onload = function () {
          if (importFromFile(r.result)) render();
          else alert('Invalid file.');
        };
        r.readAsText(f);
        e.target.value = '';
      };
    }
  }

  function exportPlanOnly(plan) {
    var blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (plan.title.replace(/[^\w]/g, '') || 'plan') + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportPlanWithData(plan) {
    var planProgress = state.progress.filter(function (p) { return String(p.planId) === String(plan.id); });
    var blob = new Blob([JSON.stringify({ plan: plan, progress: planProgress, exportedAt: new Date().toISOString().slice(0, 10) }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (plan.title.replace(/[^\w]/g, '') || 'plan') + '-with-data.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function renderDayList() {
    const plan = getPlan(view.planId);
    if (!plan) {
      view = { screen: 'home' };
      return render();
    }
    const todayNum = todaysDayNumber(plan);
    const days = plan.days || [];
    var pendingDays = [];
    var completedDays = [];
    days.forEach(function (d) {
      var dayId = 'day-' + d.dayNumber;
      var prog = getProgress(state, plan.id, dayId);
      if (prog && prog.completed) completedDays.push({ d: d, prog: prog }); else pendingDays.push({ d: d, prog: null });
    });
    var completedExpanded = view.completedExpanded === true;
    var completedCount = completedDays.length;

    function dayRowHtml(d, prog, isCompleted) {
      var dayId = 'day-' + d.dayNumber;
      var done = isCompleted;
      var completedDate = prog && prog.completedDate ? prog.completedDate : '';
      var isToday = todayNum === d.dayNumber;
      var readings = (d.readings || []).join(' · ');
      var completedLabel = done && completedDate
        ? ' <span class="completed-date">You completed at ' + escapeHtml(completedDate) + '</span>'
        : '';
      var rowClass = 'day-list-row' + (done ? ' day-completed' : '');
      return '<li class="' + rowClass + '">' +
        '<button type="button" class="check check-btn ' + (done ? 'done' : '') + '" data-toggle-day="' + d.dayNumber + '" aria-label="Mark day ' + d.dayNumber + (done ? ' incomplete' : ' complete') + '">' + (done ? '✓' : '○') + '</button>' +
        '<a href="#" class="day-list-link" data-goto-day="' + d.dayNumber + '">' +
        '<div class="row"><div class="main">' +
        '<div class="title day-row">' + escapeHtml(d.title) + (isToday ? '<span class="day-badge">Today</span>' : '') + completedLabel + '</div>' +
        (readings ? '<div class="sub">' + escapeHtml(readings) + '</div>' : '') +
        '</div></div></a></li>';
    }

    var pendingHtml = pendingDays.map(function (item) { return dayRowHtml(item.d, item.prog, false); }).join('');
    var completedHtml = completedDays.map(function (item) { return dayRowHtml(item.d, item.prog, true); }).join('');
    var completedSectionHtml = completedCount === 0 ? '' :
      '<div class="completed-section" id="completed-section">' +
        '<button type="button" class="completed-section-header" data-action="toggle-completed" aria-expanded="' + completedExpanded + '">' +
          '<span class="completed-section-title">Completed (' + completedCount + ')</span>' +
          '<span class="completed-section-icon">' + (completedExpanded ? '▼' : '▶') + '</span>' +
        '</button>' +
        (completedExpanded
          ? (pendingDays.length ? '<p class="jump-back-hint"><a href="#day-list-top" class="jump-to-uncompleted" data-action="jump-to-uncompleted">↑ Jump to uncompleted</a></p>' : '') +
            '<ul class="list completed-days-list">' + completedHtml + '</ul>'
          : '') +
      '</div>';

    var jumpToCompletedLink = completedCount > 0
      ? ' <a href="#completed-section" class="jump-to-completed" data-action="jump-to-completed">Jump to completed (' + completedCount + ')</a>'
      : '';
    var dayListMenuHtml = '<div class="nav-icon-actions">' +
      '<button type="button" class="nav-icon-btn" data-action="export-plan-only" title="Export plan (no data)" aria-label="Export plan (no data)"><span class="nav-icon-char" aria-hidden="true">📤</span><span class="nav-icon-hint">Export</span></button>' +
      '<button type="button" class="nav-icon-btn" data-action="export-plan-data" title="Export plan and data" aria-label="Export plan and data"><span class="nav-icon-char" aria-hidden="true">📋</span><span class="nav-icon-hint">Data</span></button>' +
      '<button type="button" class="nav-icon-btn" data-action="reset-progress" title="Reset progress" aria-label="Reset progress"><span class="nav-icon-char" aria-hidden="true">🔄</span><span class="nav-icon-hint">Reset</span></button>' +
      '<button type="button" class="nav-icon-btn danger-btn" data-action="remove-plan-nav" title="Remove plan" aria-label="Remove plan"><span class="nav-icon-char" aria-hidden="true">🗑</span><span class="nav-icon-hint">Remove</span></button>' +
      '</div>';
    const navTitleHtml = '<span class="plan-title-text">' + escapeHtml(plan.title) + '</span><button type="button" class="edit-title-btn nav-edit-btn" aria-label="Rename plan">✎</button>';
    const backBtn = '<button type="button" class="nav-back-btn" data-action="back" title="Back" aria-label="Back"><span class="nav-back-arrow" aria-hidden="true">⬅</span><span class="nav-back-text">Back</span></button>';
    const gearLink = '<a href="#" class="nav-link-icon" data-goto="data" title="Settings" aria-label="Settings"><span class="nav-icon-char" aria-hidden="true">⚙</span><span class="nav-link-text">Settings</span></a>';
    const lockBtnDays = lockNavButton();
    const daysNavHtml = '<nav class="nav-two-row">' +
      '<div class="nav-row-1"><span class="nav-title-wrap"><span class="nav-app-icon" aria-hidden="true">📖</span><span class="title">' + navTitleHtml + '</span></span></div>' +
      '<div class="nav-row-2"><div class="nav-right">' + lockBtnDays + backBtn + gearLink + dayListMenuHtml + '</div></div>' +
      '</nav>';
    appEl.innerHTML = `
      ${daysNavHtml}
      <div class="screen" id="day-list-top">
        <p class="days-list-hint">${pendingDays.length ? 'Days not yet completed are listed first.' : 'All days completed! Expand below to review.'}${jumpToCompletedLink}</p>
        <ul class="list">
          ${pendingHtml}
        </ul>
        ${completedSectionHtml}
      </div>
    `;
    appEl.querySelectorAll('[data-toggle-day]').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dayNum = parseInt(btn.getAttribute('data-toggle-day'), 10);
        const dayId = 'day-' + dayNum;
        const prog = getProgress(state, plan.id, dayId);
        setProgress(plan.id, dayId, { completed: !(prog && prog.completed) });
        render();
      };
    });
    appEl.querySelectorAll('[data-goto-day]').forEach(function (el) {
      el.onclick = function (e) {
        e.preventDefault();
        view.screen = 'day';
        view.dayNumber = parseInt(el.getAttribute('data-goto-day'), 10);
        render();
      };
    });
    var toggleCompletedBtn = appEl.querySelector('[data-action="toggle-completed"]');
    if (toggleCompletedBtn) {
      toggleCompletedBtn.onclick = function () {
        view.completedExpanded = !view.completedExpanded;
        render();
      };
    }
    var jumpBtn = appEl.querySelector('[data-action="jump-to-completed"]');
    if (jumpBtn) {
      jumpBtn.onclick = function (e) {
        e.preventDefault();
        view.completedExpanded = true;
        render();
        setTimeout(function () {
          var el = document.getElementById('completed-section');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      };
    }
    var jumpBackBtn = appEl.querySelector('[data-action="jump-to-uncompleted"]');
    if (jumpBackBtn) {
      jumpBackBtn.onclick = function (e) {
        e.preventDefault();
        var el = document.getElementById('day-list-top');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    }
    appEl.querySelector('button[data-action="back"]').onclick = function () {
      view = { screen: 'home' };
      render();
    };
    appEl.querySelectorAll('[data-action="export-plan-only"]').forEach(function (btn) {
      btn.onclick = function (e) { e.preventDefault(); e.stopPropagation(); exportPlanOnly(plan); render(); };
    });
    appEl.querySelectorAll('[data-action="export-plan-data"]').forEach(function (btn) {
      btn.onclick = function (e) { e.preventDefault(); e.stopPropagation(); exportPlanWithData(plan); render(); };
    });
    appEl.querySelectorAll('[data-action="reset-progress"]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm('Reset progress for this plan? All completed days and notes will be cleared.')) return;
        clearProgress(plan.id);
        render();
      };
    });
    appEl.querySelectorAll('[data-action="remove-plan-nav"]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm('Remove this plan and all its progress?')) return;
        removePlan(plan.id);
        view = { screen: 'home', planId: null };
        render();
      };
    });
    var navEditBtn = appEl.querySelector('.nav-edit-btn');
    var navTitleText = appEl.querySelector('.plan-title-text');
    if (navEditBtn && navTitleText && plan.id) {
      navEditBtn.onclick = function (e) {
        e.preventDefault();
        navTitleText.setAttribute('data-plan-id', plan.id);
        startTitleEdit(navTitleText, function (v, _planId) {
          updatePlanTitle(plan.id, v, plan);
          navTitleText.textContent = v;
        });
      };
    }
  }

  function renderDayDetail() {
    const plan = getPlan(view.planId);
    if (!plan) {
      view = { screen: 'home' };
      return render();
    }
    const day = (plan.days || []).find(d => d.dayNumber === view.dayNumber);
    if (!day) {
      view.screen = 'days';
      return render();
    }
    const dayId = 'day-' + day.dayNumber;
    const prog = getProgress(state, plan.id, dayId);
    var completedLabel = (prog && prog.completed && prog.completedDate) ? ' <span class="completed-date">(' + escapeHtml(prog.completedDate) + ')</span>' : '';
    appEl.innerHTML = `
      ${nav(day.title)}
      <div class="screen detail">
        <div class="section">
          <div class="toggle-row">
            <span>Completed${completedLabel}</span>
            <input type="checkbox" id="day-complete" ${prog && prog.completed ? 'checked' : ''} />
          </div>
        </div>
        <div class="section">
          <div class="section-title">Readings</div>
          <div class="readings">${(day.readings || []).map(r => `<div>${escapeHtml(r)}</div>`).join('')}</div>
        </div>
        <div class="section">
          <div class="section-title">Notes</div>
          <textarea id="day-notes" placeholder="Add a note…">${prog && prog.note ? escapeHtml(prog.note) : ''}</textarea>
        </div>
      </div>
    `;
    const cb = appEl.querySelector('#day-complete');
    const ta = appEl.querySelector('#day-notes');
    cb.onchange = () => setProgress(plan.id, dayId, { completed: cb.checked });
    ta.onchange = () => setProgress(plan.id, dayId, { note: ta.value });
    ta.onblur = () => setProgress(plan.id, dayId, { note: ta.value });
    appEl.querySelector('button[data-action="back"]').onclick = () => {
      view.screen = 'days';
      view.dayNumber = null;
      render();
    };
  }

  function renderData() {
    var hasPin = !!getStoredPinHash();
    var pinItems = '';
    if (!hasPin) {
      pinItems = '<li><button type="button" data-action="set-pin">Set PIN</button></li>';
    } else {
      pinItems = '<li><button type="button" data-action="change-pin">Change PIN</button></li>' +
        '<li><button type="button" data-action="remove-pin">Remove PIN</button></li>';
      if (unlockedSession) {
        pinItems += '<li><button type="button" data-action="lock-app">Lock app</button></li>';
      }
    }
    appEl.innerHTML = `
      ${nav('Settings')}
      <div class="screen">
        <ul class="data-list">
          <li><button type="button" data-action="export">Export data (plans + progress)</button></li>
          <li><button type="button" data-action="import">Import (plan and/or progress from file)</button></li>
          <li class="footer">Data is stored in your browser. Export to back up; import to restore.</li>
          ${pinItems}
          <li><button type="button" class="danger" data-action="clear">Clear all plans and progress</button></li>
        </ul>
        <input type="file" id="f-import" accept=".json" />
      </div>
    `;
    appEl.querySelector('[data-action="export"]').onclick = () => {
      const a = document.createElement('a');
      a.href = 'data:application/json,' + encodeURIComponent(exportAll());
      a.download = 'study-plan-backup-' + todayISO() + '.json';
      a.click();
    };
    appEl.querySelector('[data-action="import"]').onclick = () => appEl.querySelector('#f-import').click();
    appEl.querySelector('#f-import').onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        if (importFromFile(r.result)) {
          alert('Import successful.');
          view = { screen: 'home' };
          render();
        } else alert('Invalid file.');
      };
      r.readAsText(f);
      e.target.value = '';
    };
    appEl.querySelector('[data-action="clear"]').onclick = () => {
      if (confirm('Clear all plans and progress?')) {
        state = { plans: [], progress: [] };
        emit();
        view = { screen: 'home' };
        render();
      }
    };
    var setPinBtn = appEl.querySelector('[data-action="set-pin"]');
    if (setPinBtn) setPinBtn.onclick = function () { view.pinScreen = 'create'; render(); };
    var changePinBtn = appEl.querySelector('[data-action="change-pin"]');
    if (changePinBtn) changePinBtn.onclick = function () { view.pinScreen = 'change'; render(); };
    var removePinBtn = appEl.querySelector('[data-action="remove-pin"]');
    if (removePinBtn) removePinBtn.onclick = function () { view.pinScreen = 'remove'; render(); };
    var lockBtn = appEl.querySelector('[data-action="lock-app"]');
    if (lockBtn) lockBtn.onclick = function () { unlockedSession = false; view.pinScreen = 'enter'; render(); };
    appEl.querySelector('button[data-action="back"]').onclick = () => {
      view = { screen: 'home' };
      render();
    };
  }


  var aboutData = null;
  function renderAboutFromData(data) {
    if (!data) {
      appEl.innerHTML = nav('About') +
        '<div class="screen"><p class="about-text">About information could not be loaded.</p></div>';
      appEl.querySelector('button[data-action="back"]').onclick = function () {
        view = { screen: 'data' };
        render();
      };
      return;
    }
    var d = data;
    var changelogHtml = Array.isArray(d.changelog) ? d.changelog.map(function (line) { return '• ' + escapeHtml(line); }).join('\n') : '';
    var communityHtml = d.community && d.community.url
      ? '<a href="' + escapeHtml(d.community.url) + '" target="_blank" rel="noopener">' + escapeHtml(d.community.label || d.community.url) + '</a>'
      : '';
    appEl.innerHTML = `
      ${nav('About')}
      <div class="screen">
        <div class="about-header">
          <span class="icon">📖</span>
          <div>
            <strong>${escapeHtml(d.name)}</strong>
            <div class="version">Version ${escapeHtml(String(d.version))}</div>
          </div>
        </div>
        <p class="about-text">${escapeHtml(d.description)}</p>
        <div class="section">
          <div class="section-title">Changelog</div>
          <p class="changelog">${changelogHtml}</p>
        </div>
        <div class="section">
          <div class="section-title">Community</div>
          <p>${communityHtml}</p>
        </div>
      </div>
    `;
    appEl.querySelector('button[data-action="back"]').onclick = function () {
      view = { screen: 'data' };
      render();
    };
  }
  function renderAbout() {
    if (aboutData) {
      renderAboutFromData(aboutData);
      return;
    }
    renderAboutFromData(null);
    fetch('about.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && view.screen === 'about') {
          aboutData = data;
          renderAboutFromData(data);
        }
      })
      .catch(function () {});
  }

  render();
})();
