// ============================================================
// storage.js — extracted from CBSE_Centre_Manager.html (Phase A modular split)
// Phase C: offline-first sync layer added on top — localStorage stays the
// authoritative local store (every existing call site keeps working exactly
// as before, including with no backend running at all); a debounced
// background layer additionally pushes to the Flask/SQLite API when reachable.
// ============================================================
import { getAnswerBookForPersistence, rebuildAnswerBookRegistry } from './answerbook.js';
import { clearDsConfig, fillDatesheetPanel, renderDsTables } from './datesheet.js';
import { parseHTML, sortDates } from './parser.js';
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

// ── Shared payload builder ──────────────────────────────────────
// Used by saveToBrowser() (localStorage), downloadBackup() (JSON file), and
// syncNow() (API) so all three stay in lockstep. Previously saveToBrowser and
// downloadBackup built two subtly-different payloads (downloadBackup dropped
// invReq entirely) and neither included centreHead/centreCity/paperSize/
// colourTheme/includeCitation — those fields were read back on load but never
// actually saved anywhere. Fixed here, once, for all three consumers.
function buildSessionPayload() {
  let centreCode = document.getElementById('cfg-centre-code')?.value || '';
  let centreName = document.getElementById('cfg-centre-name')?.value || '';
  if ((!centreCode || !centreName) && state.rawHTML) {
    const htmlSrc = state.rawHTML['12'] || state.rawHTML['10'];
    const info = extractCentreInfoFromHTML(htmlSrc);
    if (info) {
      centreCode = centreCode || info.code;
      centreName = centreName || info.name;
      applyCentreInfoToUI(info, { onlyIfEmpty: true, updateSidebar: false });
    }
  }
  return {
    globalCfg:      getConfig(),
    invReq:         state.invReq || {},
    centreName,
    centreCode,
    centreHead:     document.getElementById('cfg-centre-head')?.value || '',
    centreCity:     document.getElementById('cfg-centre-city')?.value || '',
    paperSize:      document.getElementById('cfg-paper')?.value || 'A4',
    colourTheme:    document.getElementById('cfg-colour')?.value || 'colour',
    includeCitation: document.getElementById('cfg-citation')?.checked ?? true,
    candidates:     state.candidates,
    dateStates:     buildSlimDateStates(state.dateStates),
    qpLog:          state.qpLog,
    answerBook:     getAnswerBookForPersistence(),
    savedAt:        Date.now(),
    payloadVer:     3,
  };
}

export function saveToBrowser() {
  try {
    const payload = buildSessionPayload();
    const { centreCode } = payload;
    // Don't save a blank session — would overwrite real saved data with empty key
    if (!centreCode && !state.candidates.length) return;
    const key = getCentreStorageKey(centreCode);

    localStorage.setItem(key, JSON.stringify(payload));
    _lastKnownSavedAt = payload.savedAt;

    // Update save indicator
    const ind = document.getElementById('save-indicator');
    const tim = document.getElementById('save-time');
    if (ind && tim) {
      const t = new Date(payload.savedAt);
      const hh = String(t.getHours()).padStart(2,'0');
      const mm = String(t.getMinutes()).padStart(2,'0');
      tim.textContent = `Saved ${hh}:${mm}`;
      ind.style.display = 'flex';
    }
    refreshSessionSelector(key);
    scheduleSync();
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
    const payload = buildSessionPayload();
    const { centreCode } = payload;
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const d    = new Date(payload.savedAt);
    const ds   = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    a.href     = url;
    a.download = `CBSE_Backup_${centreCode || 'default'}_${ds}.json`;
    a.click();
    URL.revokeObjectURL(url);
    saveToBrowser(); // also update localStorage (+ schedules a sync)
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
        scheduleSync();
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
  deleteServerSession(centreCode);
}
// ── FULL RESET: Clear absolutely everything ──
export function fullReset() {
  if (!confirm('FULL RESET: Clears ALL data including candidates, seating, attendance, config and saved session. Cannot be undone.')) return;

  // Clear localStorage
  const centreCode = document.getElementById('cfg-centre-code')?.value || 'default';
  try {
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
  deleteServerSession(centreCode);
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

// ── Apply a parsed session payload (from localStorage OR the server) to
// state + UI. Factored out of loadFromBrowser() so the server-conflict-load
// path (loadFromServer, below) doesn't duplicate ~100 lines of restore logic. ──
function applySessionPayload(payload) {
  if (payload.globalCfg) {
    const g = payload.globalCfg;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
    const setChk = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.checked = v; };
    const savedCode = payload.centreCode && payload.centreCode !== 'default' ? payload.centreCode : '';
    const savedName = payload.centreName || '';
    if (savedCode && savedName) {
      setVal('cfg-centre-name', savedName);
      setVal('cfg-centre-code', savedCode);
    } else {
      let extracted = false;
      const htmlSrc = payload.rawHTML && (payload.rawHTML['12'] || payload.rawHTML['10']);
      const info = extractCentreInfoFromHTML(htmlSrc);
      if (info) {
        setVal('cfg-centre-code', info.code);
        setVal('cfg-centre-name', info.name);
        extracted = true;
      }
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
    const writeDsJSON = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== null) el.value = JSON.stringify(v); };
    writeDsJSON('cfg-x-datesheet',   g.xDatesheet);
    writeDsJSON('cfg-xii-datesheet', g.xiiDatesheet);
    writeDsJSON('cfg-x-codes',       g.xCodes);
    writeDsJSON('cfg-xii-codes',     g.xiiCodes);
    setChk('cfg-private',        g.inclPrivate);
    setChk('cfg-stagger',         g.stagger);
    if (payload.invReq) state.invReq = payload.invReq;
    if (payload.centreHead) document.getElementById('cfg-centre-head') && (document.getElementById('cfg-centre-head').value = payload.centreHead);
    if (payload.centreCity) document.getElementById('cfg-centre-city') && (document.getElementById('cfg-centre-city').value = payload.centreCity);
    if (payload.paperSize) document.getElementById('cfg-paper') && (document.getElementById('cfg-paper').value = payload.paperSize);
    if (payload.colourTheme) document.getElementById('cfg-colour') && (document.getElementById('cfg-colour').value = payload.colourTheme);
    if (payload.includeCitation !== undefined) document.getElementById('cfg-citation') && (document.getElementById('cfg-citation').checked = payload.includeCitation);
    if (g.examYear)       setVal('cfg-exam-year',         g.examYear);
    if (g.examNameX)      setVal('cfg-exam-name-x',       g.examNameX);
    if (g.examNameXII)    setVal('cfg-exam-name-xii',     g.examNameXII);
    if (g.examFullNameX)  setVal('cfg-exam-fullname-x',   g.examFullNameX);
    if (g.examFullNameXII)setVal('cfg-exam-fullname-xii', g.examFullNameXII);
    const badge = document.getElementById('sb-logo-badge');
    if (badge && g.examYear) badge.textContent = `CBSE ${g.examYear}`;
  }

  if (payload.candidates && payload.candidates.length) {
    state.candidates = payload.candidates;
  } else if (payload.rawHTML) {
    state.rawHTML = payload.rawHTML;
    const candidates = [];
    if (payload.rawHTML['12']) candidates.push(...parseHTML(payload.rawHTML['12'], 'XII'));
    if (payload.rawHTML['10']) candidates.push(...parseHTML(payload.rawHTML['10'], 'X'));
    state.candidates = candidates;
  }

  if (state.candidates.length) {
    state.schools = {};
    state.candidates.forEach(cand => {
      if (!state.schools[cand.schoolCode])
        state.schools[cand.schoolCode] = { name: cand.schoolName, x: new Set(), xii: new Set() };
      state.schools[cand.schoolCode][cand.class === 'X' ? 'x' : 'xii'].add(cand.roll);
    });
    const datesSet = new Set();
    state.candidates.forEach(cand => Object.keys(cand.dateSubjects).forEach(d => datesSet.add(d)));
    state.allDates = sortDates([...datesSet]);
  }

  if (payload.qpLog) state.qpLog = payload.qpLog;
  state.answerBook = payload.answerBook || defaultAnswerBookState();
  ensureAnswerBookState();
  if (payload.dateStates) {
    state.dateStates = payload.dateStates;
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
  _lastKnownSavedAt = payload.savedAt || 0;

  renderDsTables();
  fillDatesheetPanel();
}

export function loadFromBrowser() {
  try {
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
    applySessionPayload(JSON.parse(raw));
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
    checkServerForNewerSession();
  }
}

// ================================================================
// ── OFFLINE-FIRST SYNC LAYER (Phase C) ──────────────────────────
// localStorage (above) remains authoritative and is never made to depend on
// network reachability. Everything below is best-effort: on any failure
// (offline, backend not running, not logged in) it degrades to "keep using
// localStorage" without throwing or blocking the caller.
// ================================================================
const API_BASE = window.__API_BASE__ || '/api';
const SYNC_DEBOUNCE_MS = 5000;
const SYNC_MAX_WAIT_MS = 30000;

let _dirty = false;
let _dirtySince = 0;
let _syncTimer = null;
let _syncInFlight = false;
let _loggedIn = null;       // null = unknown/not yet checked, true/false once known
let _lastKnownSavedAt = 0;  // savedAt of whatever we last loaded/saved locally

async function apiFetch(path, opts) {
  try {
    const res = await fetch(API_BASE + path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    let data = null;
    try { data = await res.json(); } catch(e) {}
    return { ok: res.ok, status: res.status, data };
  } catch(e) {
    return { ok: false, status: 0, data: null, networkError: true };
  }
}

function setSyncStatusText(text) {
  const tim = document.getElementById('save-time');
  if (!tim) return;
  const base = tim.textContent.split(' · ')[0];
  tim.textContent = `${base} · ${text}`;
}

export async function checkAuthStatus() {
  const res = await apiFetch('/auth/status', { method: 'GET' });
  _loggedIn = res.ok ? !!res.data?.loggedIn : false;
  return _loggedIn;
}

export async function loginWithPassword(password) {
  const res = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ password }) });
  _loggedIn = res.ok;
  return res.ok;
}

export async function logoutOfServer() {
  await apiFetch('/auth/logout', { method: 'POST' });
  _loggedIn = false;
}

// Prompts for the shared password at most once per page load; a wrong
// password or a "not now" cancel just leaves syncing disabled until refresh.
let _loginPromptShown = false;
async function ensureLoggedIn() {
  if (_loggedIn === true) return true;
  if (_loggedIn === null) await checkAuthStatus();
  if (_loggedIn === true) return true;
  if (_loginPromptShown) return false;
  _loginPromptShown = true;
  const password = prompt('Sign in to sync this session to the server (leave blank to stay offline-only):');
  if (!password) return false;
  const ok = await loginWithPassword(password);
  if (!ok) showModal('Sign-in Failed', 'Incorrect password — continuing in offline (localStorage-only) mode.');
  return ok;
}

function currentCentreCode() {
  return document.getElementById('cfg-centre-code')?.value || '';
}

function scheduleSync() {
  _dirty = true;
  if (!_dirtySince) _dirtySince = Date.now();
  if (_syncTimer) clearTimeout(_syncTimer);
  const elapsed = Date.now() - _dirtySince;
  const wait = Math.max(0, Math.min(SYNC_DEBOUNCE_MS, SYNC_MAX_WAIT_MS - elapsed));
  _syncTimer = setTimeout(syncNow, wait);
}

export async function syncNow() {
  if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }
  if (_syncInFlight || !_dirty) return;
  const centreCode = currentCentreCode();
  if (!centreCode) return;

  _syncInFlight = true;
  try {
    const loggedIn = await ensureLoggedIn();
    if (!loggedIn) { setSyncStatusText('offline (not signed in)'); return; }

    const payload = buildSessionPayload();
    const res = await apiFetch(`/sessions/${encodeURIComponent(centreCode)}`, {
      method: 'PUT', body: JSON.stringify(payload),
    });
    if (res.ok) {
      _dirty = false; _dirtySince = 0;
      setSyncStatusText('synced ✓');
    } else if (res.status === 401) {
      _loggedIn = false;
      setSyncStatusText('offline (not signed in)');
    } else if (res.networkError) {
      setSyncStatusText('offline — will retry');
      scheduleSync();
    } else {
      setSyncStatusText('sync pending…');
      scheduleSync();
    }
  } finally {
    _syncInFlight = false;
  }
}

function deleteServerSession(centreCode) {
  if (!centreCode || _loggedIn !== true) return;
  apiFetch(`/sessions/${encodeURIComponent(centreCode)}`, { method: 'DELETE' });
}

// Called after a local session is restored (Continue Session banner, or
// selecting a session from the dropdown): if the server has a newer copy of
// this same centre's session (e.g. saved from another device/browser), offer
// to pull it in rather than silently overwriting it on the next sync.
export async function checkServerForNewerSession() {
  const centreCode = currentCentreCode();
  if (!centreCode) return;
  const loggedIn = await ensureLoggedIn();
  if (!loggedIn) return;

  const res = await apiFetch(`/sessions/${encodeURIComponent(centreCode)}`, { method: 'GET' });
  if (!res.ok || !res.data) return;
  const serverPayload = res.data;
  if (!serverPayload.savedAt || serverPayload.savedAt <= _lastKnownSavedAt) return;

  const when = new Date(serverPayload.savedAt).toLocaleString('en-IN');
  if (!confirm(`A newer version of this session was saved on the server at ${when} (e.g. from another device). Load it now? Any local changes made since your last sync will be replaced.`)) {
    return;
  }
  applySessionPayload(serverPayload);
  restoreUIAfterLoad();
  refreshSessionSelector();
  showModal('Loaded from Server', `Session restored from the server copy saved ${when}.`);
}

// Registers the sync layer's own event listeners. Called once from main.js's
// boot sequence (kept out of this module's top level — like every other
// module here, storage.js should have no side effects just from being
// imported; all wiring happens in main.js).
export function initSyncListeners() {
  // Best-effort flush when the tab is hidden/closed. `keepalive` lets the
  // request outlive page teardown (similar to sendBeacon, but PUT-capable);
  // it has a small body-size ceiling, so for very large sessions this may
  // silently fail — acceptable since localStorage already has the full data
  // and the next successful sync will catch it up.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || !_dirty) return;
    const centreCode = currentCentreCode();
    if (!centreCode || _loggedIn !== true) return;
    const payload = buildSessionPayload();
    fetch(`${API_BASE}/sessions/${encodeURIComponent(centreCode)}`, {
      method: 'PUT', credentials: 'include', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }).catch(() => {});
  });
  window.addEventListener('online', () => { if (_dirty) syncNow(); });
}
