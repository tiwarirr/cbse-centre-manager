// ============================================================
// main.js — boot sequence for the modularized frontend (Phase A)
// Imports every module and assigns its exports onto `window` so the
// existing (unmodified) HTML markup's 150 onclick="..." attributes keep
// resolving exactly as they did in the original single-file monolith.
// ============================================================
import * as constantsMod from './constants.js';
import * as stateMod from './state.js';
import * as parserMod from './parser.js';
import * as seatingMod from './seating.js';
import * as attendanceMod from './attendance.js';
import * as datesheetMod from './datesheet.js';
import * as answerbookMod from './answerbook.js';
import * as invigilatorMod from './invigilator.js';
import * as reportsMod from './reports.js';
import * as uiMod from './ui.js';
import * as storageMod from './storage.js';
// Named (live-binding) import — needed because this file's own wiring code below
// reads `currentDate` directly; the `Object.assign(window, uiMod)` below only
// snapshots its value once at boot and would not track later updates.
import { currentDate } from './ui.js';
import { initSyncListeners } from './storage.js';

Object.assign(window, constantsMod);
Object.assign(window, stateMod);
Object.assign(window, parserMod);
Object.assign(window, seatingMod);
Object.assign(window, attendanceMod);
Object.assign(window, datesheetMod);
Object.assign(window, answerbookMod);
Object.assign(window, invigilatorMod);
Object.assign(window, reportsMod);
Object.assign(window, uiMod);
Object.assign(window, storageMod);

// ---- live-binding overrides for mutable module-level variables ----
// `Object.assign(window, mod)` above copies each export's VALUE once, at boot.
// That's correct for functions (never reassigned) but wrong for these plain
// `let` variables: their owning module reassigns them later (e.g. selectDate()
// sets ui.js's internal `currentDate`), and several inline HTML attributes
// (onchange="renderAttendanceBody(currentDate)", the QP-log onchange, etc.)
// read the bare name directly. Inline attribute handlers run in global scope
// and can only ever see `window.*` — never a module's `import` bindings — so
// a stale one-time copy would silently break those handlers. A module's
// namespace object (e.g. `uiMod`), by spec, always reflects the exporter's
// CURRENT value, so proxying through a getter keeps `window.x` live forever.
const LIVE_BINDINGS = [
  ['currentDate', uiMod], ['currentSubjectFilter', uiMod], ['summaryView', uiMod],
  ['summaryDate', uiMod], ['candidateRows', uiMod], ['currentAttTab', uiMod],
  ['_currentDsTab', datesheetMod],
  ['attendancePanelOpen', attendanceMod], ['_attSidebarKey', attendanceMod],
  ['_dragSrcEl', seatingMod], ['_orderingDs', seatingMod], ['customSubjectOrder', seatingMod],
  ['_forceLoadStorageKey', storageMod],
];
for (const [name, mod] of LIVE_BINDINGS) {
  Object.defineProperty(window, name, { get: () => mod[name], configurable: true });
}

// ---- original top-level wiring statements (event listeners, boot init) ----
// ── DYNAMIC CONFIG ─────────────────────────────────────────────
document.getElementById('cfg-per-room').addEventListener('change', function() {
  document.getElementById('custom-per-room-row').style.display =
    this.value === 'custom' ? 'block' : 'none';
});

// Auto-sync rows×cols → per-room count, and re-generate if data loaded
// Live-update sidebar badge when exam year changes
document.getElementById('cfg-exam-year')?.addEventListener('input', function() {
  const badge = document.getElementById('sb-logo-badge');
  if (badge) badge.textContent = `CBSE ${this.value || new Date().getFullYear()}`;
});

// Live-update sidebar badge when exam year changes
document.getElementById('cfg-exam-year')?.addEventListener('input', function() {
  const badge = document.getElementById('sb-logo-badge');
  if (badge) badge.textContent = 'CBSE ' + (this.value || new Date().getFullYear());
});

['cfg-rows','cfg-cols','cfg-class-order','cfg-split','cfg-per-room'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    // Sync rows*cols → perRoom display
    const r = parseInt(document.getElementById('cfg-rows').value);
    const col = parseInt(document.getElementById('cfg-cols').value);
    const total = r * col;
    const sel = document.getElementById('cfg-per-room');
    const opt = [...sel.options].find(o => parseInt(o.value) === total);
    if (opt) sel.value = total;
    else { sel.value = 'custom'; document.getElementById('cfg-custom-count').value = total; document.getElementById('custom-per-room-row').style.display='block'; }
    // Auto re-generate if we already have candidates loaded
    if (state.candidates.length > 0) generateSeating(currentDate || null, true); // silent
  });
});

// ── INIT ────────────────────────────────────────────────────────
// Scan localStorage for saved session and show restore banner
setTimeout(() => {
  let savedPayload = null;
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('cbse_centre_'));
    if (keys.length) {
      let best = null, bestTime = 0;
      keys.forEach(k => {
        try {
          const p = JSON.parse(localStorage.getItem(k));
          const isEmpty = !p.centreName && !(p.candidates && p.candidates.length) && !(p.rawHTML);
          if (p && p.savedAt > bestTime && !isEmpty) { best = p; bestTime = p.savedAt; }
        } catch(e) {}
      });
      savedPayload = best;
      // Clean up stale default key if a real centre key exists
      if (best && best.centreCode && best.centreCode !== 'default') {
        try { localStorage.removeItem('cbse_centre_default'); } catch(e) {}
      }
    }
  } catch(e) {}

  window._savedPayload = savedPayload;

  if (savedPayload) {
    const savedAt  = savedPayload.savedAt ? new Date(savedPayload.savedAt).toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
    const centre   = savedPayload.centreName || savedPayload.centreCode || 'Unknown Centre';
    const xCount   = savedPayload.candidates ? savedPayload.candidates.filter(c=>c.class==='X').length : 0;
    const xiiCount = savedPayload.candidates ? savedPayload.candidates.filter(c=>c.class==='XII').length : 0;
    const candCount = (xCount>0?1:0) + (xiiCount>0?1:0);

    // Show restore banner
    const banner = document.createElement('div');
    banner.id = 'restore-banner';
    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:8888;background:#0c1c35;color:#fff;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 -4px 20px rgba(0,0,0,0.3);';
    banner.innerHTML = `
      <div>
        <div style="font-weight:700;font-size:13px;">💾 Saved session found — ${centre}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:2px;">
          ${candCount} file(s) uploaded · ${xCount} Class X · ${xiiCount} Class XII · Saved ${savedAt}
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="doRestoreSession()" style="background:#22c55e;color:#fff;border:none;border-radius:6px;padding:8px 18px;font-weight:700;cursor:pointer;font-size:13px;">▶ Continue Session</button>
        <button onclick="document.getElementById('restore-banner').remove()" style="background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:6px;padding:8px 14px;cursor:pointer;font-size:12px;">Start Fresh</button>
      </div>`;
    document.body.appendChild(banner);
  }
  refreshSessionSelector();
}, 300);

// Best-effort persistence when tab/app is closed or backgrounded.
window.addEventListener('pagehide', () => {
  try { saveToBrowser(); } catch (e) {}
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    try { saveToBrowser(); } catch (e) {}
  }
});

// Phase C: wire up the offline-first background sync listeners (best-effort
// flush on tab-hide, retry-on-reconnect). See storage.js's initSyncListeners().
initSyncListeners();
