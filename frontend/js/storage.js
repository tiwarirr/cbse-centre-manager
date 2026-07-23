// ============================================================
// storage.js — extracted from CBSE_Centre_Manager.html (Phase A modular split)
// ============================================================
import { getAnswerBookForPersistence, rebuildAnswerBookRegistry } from './answerbook.js';
import { clearDsConfig, fillDatesheetPanel, renderDsTables } from './datesheet.js';
import { sortDates } from './parser.js';
import { buildSlimDateStates, defaultAnswerBookState, ensureAnswerBookState, getConfig, state, syncLegacySeating } from './state.js';
import { buildCandidatesTable, buildDateTabs, buildScheduleTable, buildSummaryDateTabs, showModal, switchPanel } from './ui.js';

export const CENTRE_INFO_RE = /CENTRE\s*-\s*(\d{5,7})\s+(.*?)\s+SCHOOL/i;
export function getCentreStorageKey(centreCode) {
  return 'cbse_centre_' + (centreCode || 'default');
}
export function extractCentreInfoFromHTML(html) {
  if (!html) return null;
  const plain = html.replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();
  const m = plain.match(CENTRE_INFO_RE);
  if (!m) return null;
  const code = m[1]?.trim();
  const name = m[2]?.trim();
  if (!code || !name) return null;
  return { code, name };
}
export function applyCentreInfoToUI(info, opts) {
  if (!info) return false;
  const options = opts || {};
  const codeEl = document.getElementById('cfg-centre-code');
  const nameEl = document.getElementById('cfg-centre-name');
  const sbEl   = document.getElementById('sb-centre-info');

  if (codeEl && (!options.onlyIfEmpty || !codeEl.value)) codeEl.value = info.code;
  if (nameEl && (!options.onlyIfEmpty || !nameEl.value)) nameEl.value = info.name;
  if (sbEl && options.updateSidebar) syncSidebarCentreInfo();
  return true;
}
export function syncSidebarCentreInfo() {
  const sbEl = document.getElementById('sb-centre-info');
  if (!sbEl) return;
  const code = (document.getElementById('cfg-centre-code')?.value || '').trim();
  const name = (document.getElementById('cfg-centre-name')?.value || '').trim();
  sbEl.textContent = code || name || 'No centre loaded';
}
export let _forceLoadStorageKey = null;
export function getSavedSessionsList() {
  const sessions = [];
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('cbse_centre_'));
    keys.forEach(key => {
      try {
        const p = JSON.parse(localStorage.getItem(key));
        if (!p) return;
        const isEmpty = !p.centreName && !(p.candidates && p.candidates.length) && !(p.rawHTML);
        if (isEmpty) return;
        sessions.push({
          key,
          centreCode: p.centreCode || '',
          centreName: p.centreName || '',
          savedAt: p.savedAt || 0,
          candidates: p.candidates ? p.candidates.length : 0,
        });
      } catch(e) {}
    });
  } catch(e) {}
  sessions.sort((a,b) => (b.savedAt || 0) - (a.savedAt || 0));
  return sessions;
}
export function refreshSessionSelector(selectedKey) {
  const sel = document.getElementById('session-select');
  if (!sel) return;
  const sessions = getSavedSessionsList();
  const keep = selectedKey || sel.value;
  sel.innerHTML = '';

  const head = document.createElement('option');
  head.value = '';
  head.textContent = sessions.length ? `Saved Sessions (${sessions.length})` : 'No Saved Sessions';
  sel.appendChild(head);

  sessions.forEach(s => {
    const o = document.createElement('option');
    o.value = s.key;
    const when = s.savedAt ? new Date(s.savedAt).toLocaleString('en-IN', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'}) : 'unknown';
    const label = `${s.centreCode || 'default'} · ${s.centreName || 'Unnamed'} · ${s.candidates} cands · ${when}`;
    o.textContent = label;
    o.title = label;
    sel.appendChild(o);
  });

  if (keep && sessions.some(s => s.key === keep)) sel.value = keep;
  else sel.value = '';
}
export function loadSelectedSession() {
  const sel = document.getElementById('session-select');
  if (!sel || !sel.value) {
    showModal('Select Session', 'Please choose a saved session from the dropdown first.');
    return;
  }
  const key = sel.value;
  const raw = localStorage.getItem(key);
  if (!raw) {
    showModal('Not Found', 'Selected session was not found in browser storage.');
    refreshSessionSelector();
    return;
  }
  let payload = null;
  try { payload = JSON.parse(raw); } catch(e) {}
  const centre = payload ? (payload.centreName || payload.centreCode || 'Unknown Centre') : key;
  const savedAt = payload && payload.savedAt ? new Date(payload.savedAt).toLocaleString('en-IN') : 'unknown';
  if (!confirm(`Load selected session?\n\nCentre: ${centre}\nSaved: ${savedAt}\n\nCurrent unsaved context may be replaced.`)) return;

  _forceLoadStorageKey = key;
  if (loadFromBrowser()) {
    restoreUIAfterLoad();
    const ind = document.getElementById('save-indicator');
    const tim = document.getElementById('save-time');
    if (ind && tim) { tim.textContent = `Loaded session · ${savedAt}`; ind.style.display = 'flex'; }
    refreshSessionSelector(key);
    showModal('Session Loaded', `Loaded: ${centre}\nSaved: ${savedAt}`);
  } else {
    showModal('Load Failed', 'Could not load the selected session.');
  }
}
export function saveToBrowser() {
  try {
    let centreCode = document.getElementById('cfg-centre-code')?.value || '';
    let centreName = document.getElementById('cfg-centre-name')?.value || '';
    // If fields empty but rawHTML in memory, extract now
    if ((!centreCode || !centreName) && state.rawHTML) {
      const htmlSrc = state.rawHTML['12'] || state.rawHTML['10'];
      const info = extractCentreInfoFromHTML(htmlSrc);
      if (info) {
        centreCode = centreCode || info.code;
        centreName = centreName || info.name;
        applyCentreInfoToUI(info, { onlyIfEmpty: true, updateSidebar: false });
      }
    }
    // Don't save a blank session — would overwrite real saved data with empty key
    if (!centreCode && !state.candidates.length) return;
    const key = getCentreStorageKey(centreCode);
    const now = Date.now();
    const slimDateStates = buildSlimDateStates(state.dateStates);

    const payload = {
      globalCfg:    getConfig(),
      invReq:       state.invReq || {},
      centreName,
      centreCode,
      candidates:   state.candidates,
      dateStates:   slimDateStates,
      qpLog:        state.qpLog,
      answerBook:   getAnswerBookForPersistence(),
      savedAt:      now,
      payloadVer:   3,
    };

    localStorage.setItem(key, JSON.stringify(payload));

    // Update save indicator
    const ind = document.getElementById('save-indicator');
    const tim = document.getElementById('save-time');
    if (ind && tim) {
      const t = new Date(now);
      const hh = String(t.getHours()).padStart(2,'0');
      const mm = String(t.getMinutes()).padStart(2,'0');
      tim.textContent = `Saved ${hh}:${mm}`;
      ind.style.display = 'flex';
    }
    refreshSessionSelector(key);
  } catch(e) {
    console.warn('Save failed:', e);
    // Show visible error — do NOT silently swallow QuotaExceededError
    const tim = document.getElementById('save-time');
    const ind = document.getElementById('save-indicator');
    if (tim && ind) {
      tim.textContent = '⚠️ Save failed!';
      tim.style.color = '#ef4444';
      ind.style.display = 'flex';
    }
    showModal('Save Failed', '⚠️ Browser storage is full. Your attendance data could not be saved.\n\nPlease use Download Backup to save your data manually.');
  }
}
// ── BACKUP: Download JSON file ──
export function downloadBackup() {
  try {
    const centreCode = document.getElementById('cfg-centre-code')?.value || 'default';
    const centreName = document.getElementById('cfg-centre-name')?.value || '';
    const now = Date.now();
    const slimDS = buildSlimDateStates(state.dateStates);
    const payload = {
      globalCfg:    getConfig(),
      centreName,
      centreCode,
      candidates:   state.candidates,
      dateStates:   slimDS,
      qpLog:        state.qpLog,
      answerBook:   getAnswerBookForPersistence(),
      savedAt:      now,
      backupVersion: 3,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const d    = new Date(now);
    const ds   = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    a.href     = url;
    a.download = `CBSE_Backup_${centreCode}_${ds}.json`;
    a.click();
    URL.revokeObjectURL(url);
    saveToBrowser(); // also update localStorage
  } catch(e) { showModal('Backup Failed', 'Could not create backup: ' + e.message); }
}
// ── RESTORE: Trigger file picker ──
export function triggerRestoreBackup() {
  document.getElementById('restore-file-input').value = '';
  document.getElementById('restore-file-input').click();
}
// ── RESTORE: Load from backup JSON file ──
export function restoreFromBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const payload = JSON.parse(e.target.result);
      if (!payload.globalCfg && !payload.rawHTML && !payload.candidates) {
        showModal('Invalid File', 'This does not appear to be a valid CBSE Centre Manager backup file.'); return;
      }
      const savedAt  = payload.savedAt ? new Date(payload.savedAt).toLocaleString('en-IN') : 'unknown';
      const centre   = payload.centreName || payload.centreCode || 'unknown';
      if (!confirm(`Restore backup?

Centre: ${centre}
Saved: ${savedAt}

This will replace all current data.`)) return;

      if (payload.answerBook && typeof payload.answerBook === 'object') {
        // Keep backup restore quota-safe; registry is rebuilt after load.
        payload.answerBook.serialRegistry = {};
      }

      // Save to localStorage under the backup's centre code key
      const key = getCentreStorageKey(payload.centreCode);
      localStorage.setItem(key, JSON.stringify(payload));

      // Restore config fields first so loadFromBrowser reads correct key
      if (payload.centreCode) {
        const el = document.getElementById('cfg-centre-code');
        if (el) el.value = payload.centreCode;
      }

      if (loadFromBrowser()) {
        restoreUIAfterLoad();
        const ind = document.getElementById('save-indicator');
        const tim = document.getElementById('save-time');
        if (ind && tim) { tim.textContent = `Restored from backup · ${savedAt}`; ind.style.display = 'flex'; }
        refreshSessionSelector(key);
        showModal('Restored', `Session restored from backup.
Centre: ${centre}
Original save: ${savedAt}`);
      }
    } catch(err) { showModal('Restore Failed', 'Could not read backup file: ' + err.message); }
  };
  reader.readAsText(file);
}
// ── NEW YEAR RESET: Keep config, clear data ──
export function newYearReset() {
  if (!confirm('New Year Reset: Clears candidates, seating & attendance. KEEPS centre name/code & room config. Cannot be undone.')) return;

  // Save config values before clearing
  const cfg = getConfig();
  const centreName = document.getElementById('cfg-centre-name')?.value || '';
  const centreCode = document.getElementById('cfg-centre-code')?.value || '';

  // Clear state
  state.rawHTML    = { '10': null, '12': null };
  state.candidates = [];
  state.seating    = {};
  state.qpLog      = {};
  state.answerBook = defaultAnswerBookState();
  state.dateStates = {};
  state.allDates   = [];
  state.schools    = {};
  state.generated  = false;

  // Clear localStorage session
  try {
    const key = getCentreStorageKey(centreCode);
    localStorage.removeItem(key);
  } catch(e) {}

  // Restore config back into UI
  const setVal = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
  const setChk = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.checked = v; };
  setVal('cfg-centre-name',  centreName);
  setVal('cfg-centre-code',  centreCode);
  setVal('cfg-rows',         cfg.rows);
  setVal('cfg-cols',         cfg.cols);
  setVal('cfg-class-order',  cfg.classOrder);
  setVal('cfg-split',        cfg.split);
  setVal('cfg-seat-dir',     cfg.seatDir || 'colwise');
  setChk('cfg-separate-plan', cfg.sepPlan);
  setChk('cfg-show-vacant',   cfg.showVacant);
  setChk('cfg-private',       cfg.inclPrivate);
  setChk('cfg-stagger',       cfg.stagger);
  clearDsConfig();

  // Reset UI
  resetUIElements();
  const ind = document.getElementById('save-indicator');
  if (ind) ind.style.display = 'none';
  refreshSessionSelector();
  showModal('New Year Ready', `Centre configuration kept:
• ${centreName} (${centreCode})
• ${cfg.rows} rows × ${cfg.cols} cols

Datesheet & subject codes cleared — enter the new exam's datesheet before uploading candidate files.`);
}
// ── FULL RESET: Clear absolutely everything ──
export function fullReset() {
  if (!confirm('FULL RESET: Clears ALL data including candidates, seating, attendance, config and saved session. Cannot be undone.')) return;

  // Clear localStorage
  try {
    const centreCode = document.getElementById('cfg-centre-code')?.value || 'default';
    localStorage.removeItem(getCentreStorageKey(centreCode));
    localStorage.removeItem(getCentreStorageKey('default'));
  } catch(e) {}

  state.rawHTML    = { '10': null, '12': null };
  state.candidates = [];
  state.seating    = {};
  state.dateStates = {};
  state.qpLog      = {};
  state.answerBook = defaultAnswerBookState();
  state.allDates   = [];
  state.schools    = {};
  state.generated  = false;

  // Clear config fields
  ['cfg-centre-name','cfg-centre-code'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  clearDsConfig();

  resetUIElements();
  const ind = document.getElementById('save-indicator');
  if (ind) ind.style.display = 'none';
  refreshSessionSelector();
  switchPanel('upload');
}
// ── Shared UI reset helper ──
export function resetUIElements() {
  ['10','12'].forEach(cls => {
    const zone = document.getElementById(`zone-${cls}`);
    const loaded = document.getElementById(`loaded-${cls}`);
    if (zone) zone.classList.remove('loaded');
    if (loaded) loaded.style.display = 'none';
  });
  const els = {
    'parse-results':    { display: 'none' },
    'parse-progress':   { display: 'none' },
    'seating-empty':    { display: 'block' },
    'seating-content':  { display: 'none' },
  };
  Object.entries(els).forEach(([id, style]) => {
    const el = document.getElementById(id);
    if (el) Object.assign(el.style, style);
  });
  const btnGen = document.getElementById('btn-generate');
  if (btnGen) btnGen.disabled = true;
  const badgeUpload = document.getElementById('badge-upload');
  if (badgeUpload) badgeUpload.style.display = 'inline-block';
  ['badge-cands','badge-seating'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  ['sb-x-count','sb-xii-count','sb-dates-count'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '—';
  });
  const sbInfo = document.getElementById('sb-centre-info');
  if (sbInfo) sbInfo.textContent = 'No centre loaded';
  switchPanel('upload');
}
export function loadFromBrowser() {
  try {
    // Scan all cbse_centre_* keys, pick most recently saved
    // (don't rely on UI field being populated yet — it's empty on first load)
    let raw = null;
    if (_forceLoadStorageKey) {
      raw = localStorage.getItem(_forceLoadStorageKey);
      _forceLoadStorageKey = null;
    }
    try {
      if (!raw) {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('cbse_centre_'));
        let bestTime = 0;
        keys.forEach(k => {
          try {
            const p = JSON.parse(localStorage.getItem(k));
            if (p && p.savedAt > bestTime) { bestTime = p.savedAt; raw = localStorage.getItem(k); }
          } catch(e) {}
        });
      }
    } catch(e) {}
    if (!raw) return false;
    const payload = JSON.parse(raw);

    // ── Restore global config into UI ──
    if (payload.globalCfg) {
      const g = payload.globalCfg;
      const setVal = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
      const setChk = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.checked = v; };
      // Restore centre name/code
      const savedCode = payload.centreCode && payload.centreCode !== 'default' ? payload.centreCode : '';
      const savedName = payload.centreName || '';
      if (savedCode && savedName) {
        // v2: explicitly stored
        setVal('cfg-centre-name', savedName);
        setVal('cfg-centre-code', savedCode);
      } else {
        // Try v1 rawHTML extraction first
        let extracted = false;
        const htmlSrc = payload.rawHTML && (payload.rawHTML['12'] || payload.rawHTML['10']);
        const info = extractCentreInfoFromHTML(htmlSrc);
        if (info) {
          setVal('cfg-centre-code', info.code);
          setVal('cfg-centre-name', info.name);
          extracted = true;
        }
        // v2 fallback: try CENTRE pattern from first candidate's raw context
        // or just set whatever was saved (may be empty — user can type it in)
        if (!extracted) {
          setVal('cfg-centre-name', savedName);
          setVal('cfg-centre-code', savedCode);
        }
      }
      setVal('cfg-rows',           g.rows);
      setVal('cfg-cols',           g.cols);
      setVal('cfg-class-order',    g.classOrder);
      setVal('cfg-split',          g.split);
      setVal('cfg-seat-dir',       g.seatDir || 'colwise');
      setChk('cfg-separate-plan',  g.sepPlan);
      setChk('cfg-show-vacant',    g.showVacant);
      // Restore datesheet & subject codes exactly as saved (including an
      // intentionally-cleared {} — only skip a field that was never set).
      const writeDsJSON = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== null) el.value = JSON.stringify(v); };
      writeDsJSON('cfg-x-datesheet',   g.xDatesheet);
      writeDsJSON('cfg-xii-datesheet', g.xiiDatesheet);
      writeDsJSON('cfg-x-codes',       g.xCodes);
      writeDsJSON('cfg-xii-codes',     g.xiiCodes);
      setChk('cfg-private',        g.inclPrivate);
      setChk('cfg-stagger',         g.stagger);
      // Invigilator requirements
      if (payload.invReq) state.invReq = payload.invReq;
      // Centre head / city
      if (payload.centreHead) document.getElementById('cfg-centre-head') && (document.getElementById('cfg-centre-head').value = payload.centreHead);
      if (payload.centreCity) document.getElementById('cfg-centre-city') && (document.getElementById('cfg-centre-city').value = payload.centreCity);
      // Exam identity fields
      if (g.examYear)       setVal('cfg-exam-year',         g.examYear);
      if (g.examNameX)      setVal('cfg-exam-name-x',       g.examNameX);
      if (g.examNameXII)    setVal('cfg-exam-name-xii',     g.examNameXII);
      if (g.examFullNameX)  setVal('cfg-exam-fullname-x',   g.examFullNameX);
      if (g.examFullNameXII)setVal('cfg-exam-fullname-xii', g.examFullNameXII);
      // Update sidebar badge to match restored exam year
      const badge = document.getElementById('sb-logo-badge');
      if (badge && g.examYear) badge.textContent = `CBSE ${g.examYear}`;
      // per-room handled below
    }

    // ── Restore candidates (v2: stored directly; v1: re-parse from rawHTML) ──
    if (payload.candidates && payload.candidates.length) {
      // v2 payload — candidates stored directly, fast restore
      state.candidates = payload.candidates;
    } else if (payload.rawHTML) {
      // v1 legacy payload — re-parse from raw HTML
      state.rawHTML = payload.rawHTML;
      const candidates = [];
      if (payload.rawHTML['12']) candidates.push(...parseHTML(payload.rawHTML['12'], 'XII'));
      if (payload.rawHTML['10']) candidates.push(...parseHTML(payload.rawHTML['10'], 'X'));
      state.candidates = candidates;
    }

    if (state.candidates.length) {
      // Rebuild schools index
      state.schools = {};
      state.candidates.forEach(cand => {
        if (!state.schools[cand.schoolCode])
          state.schools[cand.schoolCode] = { name: cand.schoolName, x: new Set(), xii: new Set() };
        state.schools[cand.schoolCode][cand.class === 'X' ? 'x' : 'xii'].add(cand.roll);
      });
      // Rebuild allDates
      const datesSet = new Set();
      state.candidates.forEach(cand => Object.keys(cand.dateSubjects).forEach(d => datesSet.add(d)));
      state.allDates = sortDates([...datesSet]);
    }

    // ── Restore dateStates (seating + attendance + lock status) ──
    if (payload.qpLog) state.qpLog = payload.qpLog;
    state.answerBook = payload.answerBook || defaultAnswerBookState();
    ensureAnswerBookState();
    if (payload.dateStates) {
      state.dateStates = payload.dateStates;
      // Re-attach full candidate fields to slim seated objects
      const candLookup = {};
      state.candidates.forEach(cand => { candLookup[cand.roll] = cand; });
      Object.values(state.dateStates).forEach(st => {
        (st.seating || []).forEach(s => {
          const full = candLookup[s.roll];
          if (full) {
            s.dateSubjects = full.dateSubjects;
            s.mother       = full.mother;
            s.father       = full.father;
            s.sex          = full.sex;
            s.cat          = full.cat;
          }
        });
      });
    }
    rebuildAnswerBookRegistry();
    syncLegacySeating();
    state.generated = Object.keys(state.dateStates).some(d => state.dateStates[d].status !== 'empty');

    // Reflect restored datesheet/codes in the Config editor + Datesheet reference panel
    renderDsTables();
    fillDatesheetPanel();

    return true;
  } catch(e) { console.warn('Restore failed:', e); return false; }
}
export function restoreUIAfterLoad() {
  if (!state.candidates.length) return;

  // Update stats panel
  const xiiCount = state.candidates.filter(c => c.class === 'XII').length;
  const xCount   = state.candidates.filter(c => c.class === 'X').length;
  const el = (id) => document.getElementById(id);
  if (el('stat-xii'))    el('stat-xii').textContent   = xiiCount;
  if (el('stat-x'))      el('stat-x').textContent     = xCount;
  if (el('stat-schools')) el('stat-schools').textContent = Object.keys(state.schools).length;
  if (el('stat-dates'))  el('stat-dates').textContent  = state.allDates.length;
  if (el('sb-x-count'))  el('sb-x-count').textContent  = xCount;
  if (el('sb-xii-count')) el('sb-xii-count').textContent = xiiCount;
  if (el('sb-dates-count')) el('sb-dates-count').textContent = state.allDates.length;

  // Show parse results panel
  if (el('parse-results')) el('parse-results').style.display = 'block';
  if (el('btn-generate'))  el('btn-generate').disabled = false;

  // Restore schools table
  const tbody = el('schools-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    Object.entries(state.schools).sort((a,b) => a[0].localeCompare(b[0])).forEach(([code, sch]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code style="font-size:12px">${code}</code></td>
        <td>${sch.name}</td>
        <td>${sch.x.size || '—'}</td>
        <td>${sch.xii.size || '—'}</td>
        <td><strong>${sch.x.size + sch.xii.size}</strong></td>`;
      tbody.appendChild(tr);
    });
  }

  // Rebuild seating UI if any dates have been generated
  if (state.generated) {
    buildScheduleTable();
    buildCandidatesTable();
    buildDateTabs();
    if (el('seating-empty'))   el('seating-empty').style.display   = 'none';
    if (el('seating-content')) el('seating-content').style.display = 'block';
    if (el('badge-seating')) {
      el('badge-seating').textContent = state.allDates.length;
      el('badge-seating').style.display = 'inline-block';
    }
    buildSummaryDateTabs();
  }
  syncSidebarCentreInfo();
}
export function resetAll() { fullReset(); }
export function debugStorage() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('cbse_centre_'));
    if (!keys.length) { showModal('Storage Debug', 'No cbse_centre_* keys found in localStorage.'); return; }
    let msg = `Found ${keys.length} key(s):

`;
    keys.forEach(k => {
      try {
        const p = JSON.parse(localStorage.getItem(k));
        const size = Math.round(localStorage.getItem(k).length / 1024);
        const isEmpty = !p.centreName && !(p.candidates && p.candidates.length);
        msg += `KEY: ${k}
`;
        msg += `  centreName:  "${p.centreName || '(empty)'}"
`;
        msg += `  centreCode:  "${p.centreCode || '(empty)'}"
`;
        msg += `  candidates:  ${p.candidates ? p.candidates.length : 0}
`;
        msg += `  rawHTML:     ${p.rawHTML ? 'yes' : 'no'}
`;
        msg += `  savedAt:     ${p.savedAt ? new Date(p.savedAt).toLocaleString('en-IN') : '?'}
`;
        msg += `  size:        ~${size} KB
`;
        msg += `  isEmpty:     ${isEmpty}

`;
      } catch(e) { msg += `KEY: ${k} — parse error: ${e.message}

`; }
    });
    msg += `Current fields:
`;
    msg += `  cfg-centre-name: "${document.getElementById('cfg-centre-name')?.value}"
`;
    msg += `  cfg-centre-code: "${document.getElementById('cfg-centre-code')?.value}"
`;
    msg += `  state.candidates: ${state.candidates.length}
`;
    showModal('Storage Debug', msg);
  } catch(e) { showModal('Storage Debug Error', e.message); }
}
export function doRestoreSession() {
  const banner = document.getElementById('restore-banner');
  if (banner) banner.remove();
  if (loadFromBrowser()) {
    restoreUIAfterLoad();
    syncSidebarCentreInfo();
    const sel = document.getElementById('session-select');
    if (sel && sel.value) refreshSessionSelector(sel.value);
    else refreshSessionSelector();
    // If centre fields still empty after restore, prompt user to fill them
    const cnEl = document.getElementById('cfg-centre-name');
    const ccEl = document.getElementById('cfg-centre-code');
    if (cnEl && ccEl && !cnEl.value && !ccEl.value && state.candidates.length) {
      setTimeout(() => {
        const code = prompt('Centre Code is missing from saved session.\nEnter Centre Code (e.g. 849205):');
        if (code) {
          ccEl.value = code.trim();
          const name = prompt('Enter Centre Name (e.g. SUDITI GLOBAL ACADEMY NAGARIYA MAINPURI):');
          if (name) cnEl.value = name.trim();
          syncSidebarCentreInfo();
          saveToBrowser(); // resave with centre info
        }
      }, 800);
    }
    const payload = window._savedPayload;
    const savedAt = payload && payload.savedAt
      ? new Date(payload.savedAt).toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
      : '';
    // Update save indicator
    const ind = document.getElementById('save-indicator');
    const tim = document.getElementById('save-time');
    if (ind && tim) {
      tim.textContent = savedAt ? `Last saved ${savedAt}` : 'Session restored';
      ind.style.display = 'flex';
    }
    const sub = document.getElementById('topbar-sub');
    if (sub && payload) {
      sub.textContent = `${payload.centreName || payload.centreCode || ''} · Session restored · ${savedAt}`;
    }
  }
}
