// ============================================================
// state.js — extracted from CBSE_Centre_Manager.html (Phase A modular split)
// ============================================================
import { customSubjectOrder } from './seating.js';

/* ══════════════════════════════════════════════════════════════
   CBSE CENTRE MANAGEMENT SYSTEM — Path A (Browser-only)
   Core data engine ported from validated Python scripts
   ══════════════════════════════════════════════════════════════ */

// ── STATE ─────────────────────────────────────────────────────
export const state = {
  rawHTML:     { '10': null, '12': null },
  candidates:  [],
  qpLog:       {},   // ds → 'subjectCode|class' → { totalReceived, packets, timeReceived, forCS }
  answerBook:  null, // answer-book inventory + serial registry
  allDates:    [],
  schools:     {},
  generated:   false,
  // Legacy flat seating (used by summary/print) — kept in sync from dateStates
  seating:     {},
  // Per-date records
  dateStates:  {},   // ds → { status, split, classOrder, subjectOrder, seating, attendance, lockedAt, generatedAt }
  invReq:      {},   // schoolCode → { required: N, notes: '' }
};
export function defaultAnswerBookState() {
  return {
    types: [],
    subjectTypeMap: {},
    suppClassTypeMap: { X: '', XII: '' },
    receipts: [],
    receiptExceptions: [],
    dateLedger: {},
    serialRegistry: {},
    auditLog: [],
    nextTypeId: 1,
    nextReceiptId: 1,
    nextExceptionId: 1,
    nextAuditId: 1,
  };
}
export function ensureAnswerBookState() {
  if (!state.answerBook || typeof state.answerBook !== 'object') {
    state.answerBook = defaultAnswerBookState();
  }
  const d = defaultAnswerBookState();
  Object.keys(d).forEach(k => {
    if (state.answerBook[k] === undefined || state.answerBook[k] === null) {
      state.answerBook[k] = d[k];
    }
  });
  return state.answerBook;
}
// ── PER-DATE STATE HELPERS ──────────────────────────────────────
export function getDateState(ds) {
  if (!state.dateStates[ds]) {
    const cfg = getConfig();
    state.dateStates[ds] = {
      status:       'empty',      // 'empty' | 'draft' | 'locked'
      split:        cfg.split,
      classOrder:   cfg.classOrder,
      subjectOrder: customSubjectOrder[ds] || null,
      seating:      [],
      attendance:   {},           // roll → 'P' | 'A' | null
      lockedAt:     null,
      generatedAt:  null,
    };
  }
  return state.dateStates[ds];
}
export function syncLegacySeating() {
  // Keep state.seating in sync for summary/print functions
  state.seating = {};
  Object.keys(state.dateStates).forEach(ds => {
    state.seating[ds] = state.dateStates[ds].seating || [];
  });
}
export function buildSlimDateStates(dateStates) {
  const source = dateStates || {};
  const slim = {};
  Object.entries(source).forEach(([ds, st]) => {
    slim[ds] = {
      status:       st.status,
      split:        st.split,
      classOrder:   st.classOrder,
      subjectOrder: st.subjectOrder,
      lockedAt:     st.lockedAt,
      generatedAt:  st.generatedAt,
      attendance:   st.attendance,
      seating: (st.seating || []).map(s => ({
        roll:       s.roll,
        class:      s.class,
        name:       s.name,
        schoolCode: s.schoolCode,
        schoolName: s.schoolName,
        roomNo:     s.roomNo,
        seatInRoom: s.seatInRoom,
        row:        s.row,
        col:        s.col,
        seatLabel:  s.seatLabel,
      })),
    };
  });
  return slim;
}
// ── SEATING ENGINE ─────────────────────────────────────────────
export function getConfig() {
  const perRoomSel = document.getElementById('cfg-per-room').value;
  let perRoom = perRoomSel === 'custom'
    ? parseInt(document.getElementById('cfg-custom-count').value) || 24
    : parseInt(perRoomSel);
  const rows     = parseInt(document.getElementById('cfg-rows').value);
  const cols     = parseInt(document.getElementById('cfg-cols').value);
  const classOrder = document.getElementById('cfg-class-order').value;
  const split    = document.getElementById('cfg-split').value;
  const sepPlan  = document.getElementById('cfg-separate-plan').checked;
  const showVacant = document.getElementById('cfg-show-vacant').checked;
  const inclPrivate = document.getElementById('cfg-private').checked;
  const seatDir     = document.getElementById('cfg-seat-dir')?.value || 'colwise';
  const stagger     = document.getElementById('cfg-stagger')?.checked || false;
  perRoom = rows * cols; // enforce rows*cols = room size
  // Datesheet & subject codes — stored in hidden JSON fields, overrides hardcoded constants
  const readJSON = id => { try { const v = document.getElementById(id)?.value; return v ? JSON.parse(v) : null; } catch(e) { return null; } };
  const xDatesheet   = readJSON('cfg-x-datesheet');
  const xiiDatesheet = readJSON('cfg-xii-datesheet');
  const xCodes       = readJSON('cfg-x-codes');
  const xiiCodes     = readJSON('cfg-xii-codes');
  const examYear       = parseInt(document.getElementById('cfg-exam-year')?.value)      || new Date().getFullYear();
  const examNameX      = document.getElementById('cfg-exam-name-x')?.value?.trim()      || 'Secondary';
  const examNameXII    = document.getElementById('cfg-exam-name-xii')?.value?.trim()    || 'Senior Secondary';
  const examFullNameX  = document.getElementById('cfg-exam-fullname-x')?.value?.trim()  || 'Secondary School Certificate Examination';
  const examFullNameXII= document.getElementById('cfg-exam-fullname-xii')?.value?.trim()|| 'Senior School Certificate Examination';
  return { perRoom, rows, cols, classOrder, split, sepPlan, showVacant, inclPrivate, seatDir, stagger,
           xDatesheet, xiiDatesheet, xCodes, xiiCodes,
           examYear, examNameX, examNameXII, examFullNameX, examFullNameXII };
}
// ── Exam identity helpers ──────────────────────────────────────────
export function getExamYear() {
  return parseInt(document.getElementById('cfg-exam-year')?.value) || new Date().getFullYear();
}
export function getExamShort(cls) {
  const id = cls === 'XII' ? 'cfg-exam-name-xii' : 'cfg-exam-name-x';
  return document.getElementById(id)?.value?.trim() || (cls === 'XII' ? 'Senior Secondary' : 'Secondary');
}
export function getExamLabel(cls) {
  return `${getExamShort(cls).toUpperCase()}-${getExamYear()}`;
}
export function getExamFull(cls) {
  const id = cls === 'XII' ? 'cfg-exam-fullname-xii' : 'cfg-exam-fullname-x';
  return document.getElementById(id)?.value?.trim()
    || (cls === 'XII' ? 'Senior School Certificate Examination' : 'Secondary School Certificate Examination');
}
export function getExamFullUpper(cls) {
  const full = getExamFull(cls).toUpperCase();
  return full.includes('MAIN') ? full : full.replace('CERTIFICATE EXAMINATION', 'CERTIFICATE MAIN EXAMINATION');
}
