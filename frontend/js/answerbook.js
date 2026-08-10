// ============================================================
// answerbook.js — extracted from CBSE_Centre_Manager.html (Phase A modular split)
// ============================================================
import { getPrimarySubject } from './parser.js';
import { ensureAnswerBookState, getDateState, state } from './state.js';
import { saveToBrowser } from './storage.js';
import { currentDate, showModal } from './ui.js';

export function getAnswerBookForPersistence() {
  const ab = ensureAnswerBookState();
  return {
    ...ab,
    // Derived cache; rebuilt from receipts + ledger on load/render.
    serialRegistry: {},
  };
}
// ════════════════════════════════════════════════════════════════
// ANSWER BOOK INVENTORY + SERIAL TRACKING
// ════════════════════════════════════════════════════════════════

export function getABDateLedger(ds) {
  const ab = ensureAnswerBookState();
  if (!ab.dateLedger[ds]) {
    ab.dateLedger[ds] = {
      assignments: {},
      damagedSerials: [],
      suppAssignments: {},
      suppDamagedSerials: [],
      suppEntryErrors: {},
      remarks: '',
    };
  }
  if (!ab.dateLedger[ds].assignments) ab.dateLedger[ds].assignments = {};
  if (!ab.dateLedger[ds].damagedSerials) ab.dateLedger[ds].damagedSerials = [];
  if (!ab.dateLedger[ds].suppAssignments) ab.dateLedger[ds].suppAssignments = {};
  if (!ab.dateLedger[ds].suppDamagedSerials) ab.dateLedger[ds].suppDamagedSerials = [];
  if (!ab.dateLedger[ds].suppEntryErrors) ab.dateLedger[ds].suppEntryErrors = {};
  if (ab.dateLedger[ds].remarks === undefined) ab.dateLedger[ds].remarks = '';
  return ab.dateLedger[ds];
}
export function parseABSerial(raw) {
  const src = String(raw || '').trim().toUpperCase();
  if (!src) return null;
  const m = src.match(/^(.*?)(\d+)$/);
  if (!m) return null;
  const prefix = m[1];
  const numStr = m[2];
  const num = parseInt(numStr, 10);
  if (!Number.isFinite(num)) return null;
  const width = numStr.length;
  const normalized = `${prefix}#${num}`;
  return { raw: src, prefix, num, width, normalized };
}
export function abSerialText(prefix, num, width) {
  return String(prefix || '') + String(num).padStart(width || 1, '0');
}
export function getABType(typeId) {
  const ab = ensureAnswerBookState();
  return (ab.types || []).find(t => String(t.id) === String(typeId)) || null;
}
export function getABSuppTypeForClass(cls) {
  const ab = ensureAnswerBookState();
  return ab.suppClassTypeMap?.[cls] || null;
}
export function getABSubjectCombos() {
  const combos = {};
  (state.candidates || []).forEach(c => {
    Object.values(c.dateSubjects || {}).forEach(subs => {
      (subs || []).forEach(s => {
        const k = c.class + '|' + s.code;
        if (!combos[k]) combos[k] = { key: k, cls: c.class, code: s.code, name: s.name };
      });
    });
  });
  return Object.values(combos).sort((a, b) =>
    (a.cls === b.cls ? 0 : (a.cls === 'X' ? -1 : 1)) ||
    a.code.localeCompare(b.code, undefined, { numeric: true })
  );
}
export function abAssignmentTypeForSeat(seat, ds) {
  const ab = ensureAnswerBookState();
  const sub = getPrimarySubject(seat, ds);
  if (!sub) return null;
  return ab.subjectTypeMap[seat.class + '|' + sub.code] || null;
}
export function abAddAudit(action, detail, reason) {
  const ab = ensureAnswerBookState();
  const id = ab.nextAuditId++;
  ab.auditLog.push({
    id,
    at: Date.now(),
    action,
    detail: detail || '',
    reason: reason || '',
  });
}
export function rebuildAnswerBookRegistry() {
  const ab = ensureAnswerBookState();
  const reg = {};
  (ab.receipts || []).forEach(r => {
    const p1 = parseABSerial(r.startSerial);
    const p2 = parseABSerial(r.endSerial);
    if (!p1 || !p2 || p1.prefix !== p2.prefix || p1.num > p2.num) return;
    const width = Math.max(p1.width, p2.width);
    for (let n = p1.num; n <= p2.num; n++) {
      const serialRaw = abSerialText(p1.prefix, n, width);
      const parsed = parseABSerial(serialRaw);
      if (!parsed) continue;
      reg[parsed.normalized] = {
        serialRaw,
        prefix: parsed.prefix,
        num: parsed.num,
        width,
        typeId: r.typeId,
        receiptId: r.id,
        status: 'AVAILABLE',
        assignedDate: null,
        assignedRoll: null,
      };
    }
  });

  (ab.receiptExceptions || []).forEach(ex => {
    const parsed = parseABSerial(ex.serialRaw);
    if (!parsed || !reg[parsed.normalized]) return;
    reg[parsed.normalized].status = ex.kind === 'MISSING_ON_RECEIPT' ? 'MISSING' : 'DAMAGED';
  });

  Object.entries(ab.dateLedger || {}).forEach(([ds, ledger]) => {
    if (!ledger.suppAssignments) ledger.suppAssignments = {};
    if (!ledger.suppDamagedSerials) ledger.suppDamagedSerials = [];
    const att = (state.dateStates[ds] && state.dateStates[ds].attendance) || {};
    Object.entries(ledger.assignments || {}).forEach(([roll, asg]) => {
      const parsed = parseABSerial(asg.serialRaw);
      if (!parsed || !reg[parsed.normalized]) return;
      if (att[roll] === 'A') return;
      reg[parsed.normalized].assignedDate = ds;
      reg[parsed.normalized].assignedRoll = roll;
      reg[parsed.normalized].status = state.dateStates[ds]?.status === 'locked' || att[roll] === 'P'
        ? 'USED'
        : 'ASSIGNED';
    });
    (ledger.damagedSerials || []).forEach(d => {
      const parsed = parseABSerial(d.serialRaw);
      if (!parsed || !reg[parsed.normalized]) return;
      reg[parsed.normalized].status = 'DAMAGED';
      reg[parsed.normalized].assignedDate = ds;
      reg[parsed.normalized].assignedRoll = d.roll || null;
    });
    Object.entries(ledger.suppAssignments || {}).forEach(([roll, arr]) => {
      (arr || []).forEach(asg => {
        const parsed = parseABSerial(asg.serialRaw);
        if (!parsed || !reg[parsed.normalized]) return;
        reg[parsed.normalized].assignedDate = ds;
        reg[parsed.normalized].assignedRoll = roll;
        reg[parsed.normalized].status = 'USED'; // supplementary is consumed immediately
      });
    });
    (ledger.suppDamagedSerials || []).forEach(d => {
      const parsed = parseABSerial(d.serialRaw);
      if (!parsed || !reg[parsed.normalized]) return;
      reg[parsed.normalized].status = 'DAMAGED';
      reg[parsed.normalized].assignedDate = ds;
      reg[parsed.normalized].assignedRoll = d.roll || null;
    });
  });

  ab.serialRegistry = reg;
  return reg;
}
export function abFindSerialConflict(normalized, ds, roll) {
  const ab = ensureAnswerBookState();
  for (const [d, ledger] of Object.entries(ab.dateLedger || {})) {
    for (const [r, asg] of Object.entries(ledger.assignments || {})) {
      const p = parseABSerial(asg.serialRaw);
      if (!p || p.normalized !== normalized) continue;
      if (String(d) === String(ds) && String(r) === String(roll)) continue;
      const att = state.dateStates[d]?.attendance?.[r];
      if (att === 'A') continue;
      return { ds: d, roll: r, kind: 'MAIN' };
    }
    for (const [r, arr] of Object.entries(ledger.suppAssignments || {})) {
      for (const asg of (arr || [])) {
        const p = parseABSerial(asg.serialRaw);
        if (!p || p.normalized !== normalized) continue;
        if (String(d) === String(ds) && String(r) === String(roll)) continue;
        return { ds: d, roll: r, kind: 'SUPP' };
      }
    }
  }
  return null;
}
export function abGetAvailableSerialsByType(typeId) {
  const ab = ensureAnswerBookState();
  rebuildAnswerBookRegistry();
  const list = Object.values(ab.serialRegistry || {})
    .filter(s => String(s.typeId) === String(typeId) && s.status === 'AVAILABLE')
    .sort((a, b) =>
      a.prefix.localeCompare(b.prefix) ||
      (a.num - b.num)
    );
  return list.map(s => s.serialRaw);
}
export function abSetAssignment(ds, roll, cls, serialRaw) {
  ensureAnswerBookState();
  rebuildAnswerBookRegistry();
  const dsState = getDateState(ds);
  if (dsState.status === 'locked') return { ok: false, msg: 'Date is locked. Unlock first.' };
  const seat = (dsState.seating || []).find(s => s.roll === roll && s.class === cls);
  if (!seat) return { ok: false, msg: 'Candidate seat not found on selected date.' };
  const sub = getPrimarySubject(seat, ds);
  if (!sub) return { ok: false, msg: 'Subject not found for candidate on this date.' };

  const ab = ensureAnswerBookState();
  const typeId = ab.subjectTypeMap[cls + '|' + sub.code];
  if (!typeId) return { ok: false, msg: `No answer-book type mapped for ${cls} ${sub.code}.` };

  const parsed = parseABSerial(serialRaw);
  if (!parsed) return { ok: false, msg: 'Invalid serial format. Use alphanumeric prefix + number.' };
  const reg = ab.serialRegistry[parsed.normalized];
  if (!reg) return { ok: false, msg: 'Serial not found in received stock.' };
  if (String(reg.typeId) !== String(typeId)) return { ok: false, msg: 'Serial belongs to a different answer-book type.' };
  if (reg.status === 'MISSING' || reg.status === 'DAMAGED') return { ok: false, msg: `Serial is ${reg.status.toLowerCase()} and cannot be assigned.` };

  const conflict = abFindSerialConflict(parsed.normalized, ds, roll);
  if (conflict) return { ok: false, msg: `Serial already assigned (${conflict.ds}, roll ${conflict.roll}).` };

  const ledger = getABDateLedger(ds);
  const prev = ledger.assignments[roll];
  if (prev && prev.serialRaw) {
    abAddAudit('AB_ASSIGN_REPLACE', `Date ${ds} roll ${roll}: ${prev.serialRaw} -> ${parsed.raw}`);
  } else {
    abAddAudit('AB_ASSIGN', `Date ${ds} roll ${roll}: ${parsed.raw}`);
  }

  ledger.assignments[roll] = {
    roll,
    class: cls,
    subjectCode: sub.code,
    subjectName: sub.name,
    typeId,
    serialRaw: parsed.raw,
    assignedAt: Date.now(),
  };
  rebuildAnswerBookRegistry();
  return { ok: true };
}
export function abBulkAutoAssign(ds) {
  ensureAnswerBookState();
  rebuildAnswerBookRegistry();
  const dsState = getDateState(ds);
  if (dsState.status === 'locked') {
    showModal('Date Locked', 'Unlock the date first to run Bulk Auto-Assign.');
    return;
  }
  const ab = ensureAnswerBookState();
  const seated = (dsState.seating || []).slice().sort((a, b) => a.roomNo - b.roomNo || a.seatInRoom - b.seatInRoom);
  if (!seated.length) {
    showModal('No Seating', 'No seating found for selected date.');
    return;
  }

  const pendingByType = {};
  let unmapped = 0;
  seated.forEach(s => {
    const ledger = getABDateLedger(ds);
    if (ledger.assignments[s.roll]) return; // keep existing assignment (editable by user)
    const sub = getPrimarySubject(s, ds);
    if (!sub) return;
    const typeId = ab.subjectTypeMap[s.class + '|' + sub.code];
    if (!typeId) { unmapped += 1; return; }
    if (!pendingByType[typeId]) pendingByType[typeId] = [];
    pendingByType[typeId].push(s);
  });

  let assigned = 0;
  let skippedInsufficient = 0;
  Object.keys(pendingByType).forEach(typeId => {
    const queue = pendingByType[typeId];
    const available = abGetAvailableSerialsByType(typeId);
    for (let i = 0; i < queue.length; i++) {
      const seat = queue[i];
      const serialRaw = available[i];
      if (!serialRaw) { skippedInsufficient += (queue.length - i); break; }
      const out = abSetAssignment(ds, seat.roll, seat.class, serialRaw);
      if (out.ok) assigned += 1;
    }
  });

  saveToBrowser();
  renderAnswerBookSection(ds);
  const msg = [
    `Bulk Auto-Assign completed for ${ds}.`,
    `Assigned: ${assigned}`,
    `Unmapped skipped: ${unmapped}`,
    `Insufficient stock skipped: ${skippedInsufficient}`,
    '',
    'Existing manual assignments were kept as-is and remain editable.',
  ].join('\n');
  showModal('Bulk Auto-Assign', msg);
}
export function abClearAssignment(ds, roll) {
  const ledger = getABDateLedger(ds);
  const prev = ledger.assignments[roll];
  if (!prev) return;
  delete ledger.assignments[roll];
  abAddAudit('AB_ASSIGN_CLEAR', `Date ${ds} roll ${roll}: ${prev.serialRaw}`);
  rebuildAnswerBookRegistry();
}
export function abReleaseOnAbsent(ds, roll) {
  const ledger = getABDateLedger(ds);
  const asg = ledger.assignments[roll];
  if (!asg) return;
  delete ledger.assignments[roll];
  abAddAudit('AB_AUTO_RELEASE_ABSENT', `Date ${ds} roll ${roll}: ${asg.serialRaw}`);
  rebuildAnswerBookRegistry();
}
export function abMarkDamagedFromAssignment(ds, roll) {
  const dsState = getDateState(ds);
  if (dsState.status === 'locked') {
    showModal('Date Locked', 'Unlock the date first to edit assignment/damage.');
    return;
  }
  const ledger = getABDateLedger(ds);
  const asg = ledger.assignments[roll];
  if (!asg) { showModal('No Assignment', 'No serial assigned for this candidate.'); return; }
  if (!confirm(`Mark serial ${asg.serialRaw} as DAMAGED and remove assignment?`)) return;
  ledger.damagedSerials.push({
    serialRaw: asg.serialRaw,
    typeId: asg.typeId,
    roll: asg.roll,
    class: asg.class,
    subjectCode: asg.subjectCode,
    damagedAt: Date.now(),
    source: 'POST_ASSIGN',
  });
  delete ledger.assignments[roll];
  abAddAudit('AB_MARK_DAMAGED', `Date ${ds} roll ${roll}: ${asg.serialRaw}`);
  rebuildAnswerBookRegistry();
  saveToBrowser();
  renderAnswerBookSection(ds);
}
export function abUnmarkDamaged(serialRaw) {
  const reason = prompt('Admin override reason (required):');
  if (!reason || !reason.trim()) { showModal('Reason Required', 'Override reason is required.'); return; }
  const ab = ensureAnswerBookState();
  let removed = false;
  Object.values(ab.dateLedger || {}).forEach(ledger => {
    const before = (ledger.damagedSerials || []).length;
    ledger.damagedSerials = (ledger.damagedSerials || []).filter(d => d.serialRaw !== serialRaw);
    if (ledger.damagedSerials.length !== before) removed = true;
    const beforeSupp = (ledger.suppDamagedSerials || []).length;
    ledger.suppDamagedSerials = (ledger.suppDamagedSerials || []).filter(d => d.serialRaw !== serialRaw);
    if (ledger.suppDamagedSerials.length !== beforeSupp) removed = true;
  });
  if (!removed) {
    const idx = (ab.receiptExceptions || []).findIndex(ex => ex.serialRaw === serialRaw && ex.kind === 'DAMAGED_ON_RECEIPT');
    if (idx >= 0) {
      ab.receiptExceptions.splice(idx, 1);
      removed = true;
    }
  }
  if (!removed) { showModal('Not Found', 'Could not find damaged serial entry to override.'); return; }
  abAddAudit('AB_UNMARK_DAMAGED_OVERRIDE', `Serial ${serialRaw}`, reason.trim());
  rebuildAnswerBookRegistry();
  saveToBrowser();
  renderAnswerBookSection(currentDate || null);
}
export function addABType() {
  const ab = ensureAnswerBookState();
  const nameEl = document.getElementById('ab-type-name');
  const codeEl = document.getElementById('ab-type-code');
  const name = (nameEl?.value || '').trim();
  const shortCode = (codeEl?.value || '').trim().toUpperCase();
  if (!name || !shortCode) { showModal('Missing Fields', 'Enter type name and short code.'); return; }
  if ((ab.types || []).some(t => t.shortCode === shortCode)) {
    showModal('Duplicate', 'Short code already exists.');
    return;
  }
  ab.types.push({ id: ab.nextTypeId++, name, shortCode, active: true });
  abAddAudit('AB_TYPE_ADD', `${shortCode} ${name}`);
  if (nameEl) nameEl.value = '';
  if (codeEl) codeEl.value = '';
  rebuildAnswerBookRegistry();
  saveToBrowser();
  renderAnswerBookSection(currentDate || null);
}
export function removeABType(typeId) {
  const ab = ensureAnswerBookState();
  if ((ab.receipts || []).some(r => String(r.typeId) === String(typeId))) {
    showModal('Cannot Remove', 'Type is used in receipts. Keep it active or map subjects to another type.');
    return;
  }
  const t = getABType(typeId);
  ab.types = (ab.types || []).filter(x => String(x.id) !== String(typeId));
  Object.keys(ab.subjectTypeMap || {}).forEach(k => {
    if (String(ab.subjectTypeMap[k]) === String(typeId)) delete ab.subjectTypeMap[k];
  });
  if (String(ab.suppClassTypeMap?.X || '') === String(typeId)) ab.suppClassTypeMap.X = '';
  if (String(ab.suppClassTypeMap?.XII || '') === String(typeId)) ab.suppClassTypeMap.XII = '';
  abAddAudit('AB_TYPE_REMOVE', t ? `${t.shortCode} ${t.name}` : String(typeId));
  saveToBrowser();
  renderAnswerBookSection(currentDate || null);
}
export function setABSubjectType(mapKey, typeId) {
  const ab = ensureAnswerBookState();
  if (!typeId) delete ab.subjectTypeMap[mapKey];
  else ab.subjectTypeMap[mapKey] = Number(typeId);
  saveToBrowser();
  renderAnswerBookSection(currentDate || null);
}
export function setABSuppTypeClass(cls, typeId) {
  const ab = ensureAnswerBookState();
  if (!ab.suppClassTypeMap) ab.suppClassTypeMap = { X: '', XII: '' };
  ab.suppClassTypeMap[cls] = typeId ? Number(typeId) : '';
  saveToBrowser();
  renderAnswerBookSection(currentDate || null);
}
export function abSetSuppError(ds, roll, code) {
  const ledger = getABDateLedger(ds);
  if (!ledger.suppEntryErrors) ledger.suppEntryErrors = {};
  if (!code) delete ledger.suppEntryErrors[roll];
  else ledger.suppEntryErrors[roll] = code;
}
export function abAddSupplementary(ds, roll, cls, serialRaw, note) {
  ensureAnswerBookState();
  rebuildAnswerBookRegistry();
  const dsState = getDateState(ds);
  if (dsState.status === 'locked') return { ok: false, code: 'LOCKED', msg: 'Date is locked. Unlock first.' };
  const seat = (dsState.seating || []).find(s => s.roll === roll && s.class === cls);
  if (!seat) return { ok: false, code: 'SEAT', msg: 'Candidate seat not found on selected date.' };
  const att = dsState.attendance?.[roll];
  if (att === 'A') return { ok: false, code: 'ABSENT', msg: 'Supplementary entry blocked for absent candidate.' };
  const typeId = getABSuppTypeForClass(cls);
  if (!typeId) return { ok: false, code: 'UNMAPPED', msg: `Supplementary type not mapped for class ${cls}.` };

  const parsed = parseABSerial(serialRaw);
  if (!parsed) return { ok: false, code: 'INVALID', msg: 'Invalid serial format. Use alphanumeric prefix + number.' };
  const ab = ensureAnswerBookState();
  const reg = ab.serialRegistry[parsed.normalized];
  if (!reg) return { ok: false, code: 'INVALID', msg: 'Serial not found in received stock.' };
  if (String(reg.typeId) !== String(typeId)) return { ok: false, code: 'INVALID', msg: 'Serial belongs to different supplementary type.' };
  if (reg.status !== 'AVAILABLE') return { ok: false, code: 'CONFLICT', msg: `Serial is ${reg.status.toLowerCase()} and not available.` };

  const conflict = abFindSerialConflict(parsed.normalized, ds, roll);
  if (conflict) return { ok: false, code: 'CONFLICT', msg: `Serial already used in ${conflict.kind} (${conflict.ds}, roll ${conflict.roll}).` };

  const ledger = getABDateLedger(ds);
  if (!ledger.suppAssignments[roll]) ledger.suppAssignments[roll] = [];
  if (ledger.suppAssignments[roll].some(s => s.serialRaw === parsed.raw)) {
    return { ok: false, code: 'CONFLICT', msg: 'This supplementary serial is already added for this candidate.' };
  }
  ledger.suppAssignments[roll].push({
    serialRaw: parsed.raw,
    typeId,
    class: cls,
    issuedAt: Date.now(),
    note: String(note || ''),
  });
  abSetSuppError(ds, roll, null);
  abAddAudit('AB_SUPP_ADD', `Date ${ds} roll ${roll}: ${parsed.raw}`, note || '');
  rebuildAnswerBookRegistry();
  return { ok: true };
}
export function abRemoveSupplementary(ds, roll, serialRaw) {
  const dsState = getDateState(ds);
  if (dsState.status === 'locked') { showModal('Date Locked', 'Unlock the date first.'); return; }
  const ledger = getABDateLedger(ds);
  const arr = ledger.suppAssignments?.[roll] || [];
  const idx = arr.findIndex(x => x.serialRaw === serialRaw);
  if (idx < 0) return;
  const removed = arr[idx];
  arr.splice(idx, 1);
  if (!arr.length) delete ledger.suppAssignments[roll];
  abAddAudit('AB_SUPP_REMOVE', `Date ${ds} roll ${roll}: ${removed.serialRaw}`);
  rebuildAnswerBookRegistry();
  saveToBrowser();
  renderAnswerBookSection(ds);
}
export function abMarkSuppDamaged(ds, roll, serialRaw) {
  const dsState = getDateState(ds);
  if (dsState.status === 'locked') { showModal('Date Locked', 'Unlock the date first.'); return; }
  const ledger = getABDateLedger(ds);
  const arr = ledger.suppAssignments?.[roll] || [];
  const idx = arr.findIndex(x => x.serialRaw === serialRaw);
  if (idx < 0) { showModal('Not Found', 'Supplementary serial not found for this candidate.'); return; }
  const item = arr[idx];
  arr.splice(idx, 1);
  if (!arr.length) delete ledger.suppAssignments[roll];
  ledger.suppDamagedSerials.push({
    serialRaw: item.serialRaw,
    typeId: item.typeId,
    class: item.class,
    roll,
    damagedAt: Date.now(),
    source: 'SUPP_POST_ISSUE',
  });
  abAddAudit('AB_SUPP_DAMAGED', `Date ${ds} roll ${roll}: ${item.serialRaw}`);
  rebuildAnswerBookRegistry();
  saveToBrowser();
  renderAnswerBookSection(ds);
}
export function abUndoSuppDamaged(ds, roll, serialRaw) {
  const reason = prompt('Admin override reason (required):');
  if (!reason || !reason.trim()) { showModal('Reason Required', 'Override reason is required.'); return; }
  const ledger = getABDateLedger(ds);
  const idx = (ledger.suppDamagedSerials || []).findIndex(d => d.serialRaw === serialRaw && String(d.roll||'') === String(roll||''));
  if (idx < 0) return;
  const item = ledger.suppDamagedSerials[idx];
  ledger.suppDamagedSerials.splice(idx, 1);
  abAddAudit('AB_SUPP_DAMAGED_UNDO_OVERRIDE', `Date ${ds} roll ${roll}: ${item.serialRaw}`, reason.trim());
  rebuildAnswerBookRegistry();
  saveToBrowser();
  renderAnswerBookSection(ds);
}
export function addABSuppForRoll(ds, roll, cls) {
  const inputId = `ab-supp-serial-${cls}-${roll}`;
  const raw = document.getElementById(inputId)?.value || '';
  const out = abAddSupplementary(ds, roll, cls, raw, '');
  if (!out.ok) {
    abSetSuppError(ds, roll, out.code || 'INVALID');
    saveToBrowser();
    renderAnswerBookSection(ds);
    showModal('Supplementary Add Failed', out.msg);
    return;
  }
  const el = document.getElementById(inputId);
  if (el) el.value = '';
  saveToBrowser();
  renderAnswerBookSection(ds);
}
export function addABReceipt() {
  const ab = ensureAnswerBookState();
  const typeId = Number(document.getElementById('ab-rec-type')?.value || 0);
  const date = document.getElementById('ab-rec-date')?.value || '';
  const startSerial = (document.getElementById('ab-rec-start')?.value || '').trim().toUpperCase();
  const endSerial = (document.getElementById('ab-rec-end')?.value || '').trim().toUpperCase();
  const challanNo = (document.getElementById('ab-rec-challan')?.value || '').trim();
  if (!typeId || !date || !startSerial || !endSerial) {
    showModal('Missing Fields', 'Type, date, start serial and end serial are required.');
    return;
  }
  const p1 = parseABSerial(startSerial);
  const p2 = parseABSerial(endSerial);
  if (!p1 || !p2 || p1.prefix !== p2.prefix || p1.num > p2.num) {
    showModal('Invalid Range', 'Start/end serial must share prefix and ascending number.');
    return;
  }
  const tmpReg = rebuildAnswerBookRegistry();
  const width = Math.max(p1.width, p2.width);
  for (let n = p1.num; n <= p2.num; n++) {
    const sr = abSerialText(p1.prefix, n, width);
    const pr = parseABSerial(sr);
    if (pr && tmpReg[pr.normalized]) {
      showModal('Overlap', `Serial already exists in stock: ${sr}`);
      return;
    }
  }
  const challanQty = p2.num - p1.num + 1;
  ab.receipts.push({
    id: ab.nextReceiptId++,
    date,
    typeId,
    startSerial: startSerial.toUpperCase(),
    endSerial: endSerial.toUpperCase(),
    challanNo,
    challanQty,
    createdAt: Date.now(),
  });
  abAddAudit('AB_RECEIPT_ADD', `${date} type ${typeId} ${startSerial}-${endSerial}`);
  ['ab-rec-start','ab-rec-end','ab-rec-challan'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  rebuildAnswerBookRegistry();
  saveToBrowser();
  renderAnswerBookSection(currentDate || null);
}
export function addABReceiptException() {
  const ab = ensureAnswerBookState();
  const receiptId = Number(document.getElementById('ab-ex-receipt')?.value || 0);
  const kind = document.getElementById('ab-ex-kind')?.value || '';
  const serialRaw = (document.getElementById('ab-ex-serial')?.value || '').trim().toUpperCase();
  if (!receiptId || !kind || !serialRaw) {
    showModal('Missing Fields', 'Receipt, exception type and serial are required.');
    return;
  }
  const receipt = (ab.receipts || []).find(r => Number(r.id) === receiptId);
  if (!receipt) { showModal('Invalid Receipt', 'Receipt not found.'); return; }
  const p = parseABSerial(serialRaw);
  if (!p) { showModal('Invalid Serial', 'Serial format is invalid.'); return; }
  rebuildAnswerBookRegistry();
  const reg = ab.serialRegistry[p.normalized];
  if (!reg || Number(reg.receiptId) !== receiptId) {
    showModal('Out of Range', 'Serial is not part of selected receipt range.');
    return;
  }
  if (reg.status === 'USED' || reg.status === 'ASSIGNED') {
    showModal('Not Allowed', 'Cannot mark exception after serial is assigned/used.');
    return;
  }
  if ((ab.receiptExceptions || []).some(ex => ex.serialRaw === serialRaw)) {
    showModal('Duplicate', 'Exception already recorded for this serial.');
    return;
  }
  ab.receiptExceptions.push({
    id: ab.nextExceptionId++,
    receiptId,
    typeId: receipt.typeId,
    serialRaw,
    kind,
    createdAt: Date.now(),
  });
  abAddAudit('AB_RECEIPT_EXCEPTION_ADD', `${kind} ${serialRaw}`);
  const el = document.getElementById('ab-ex-serial');
  if (el) el.value = '';
  rebuildAnswerBookRegistry();
  saveToBrowser();
  renderAnswerBookSection(currentDate || null);
}
export function removeABReceiptException(id) {
  const reason = prompt('Admin override reason (required):');
  if (!reason || !reason.trim()) { showModal('Reason Required', 'Override reason is required.'); return; }
  const ab = ensureAnswerBookState();
  const idx = (ab.receiptExceptions || []).findIndex(ex => Number(ex.id) === Number(id));
  if (idx < 0) return;
  const ex = ab.receiptExceptions[idx];
  ab.receiptExceptions.splice(idx, 1);
  abAddAudit('AB_RECEIPT_EXCEPTION_REMOVE_OVERRIDE', `${ex.kind} ${ex.serialRaw}`, reason.trim());
  rebuildAnswerBookRegistry();
  saveToBrowser();
  renderAnswerBookSection(currentDate || null);
}
export function saveABRemark(ds) {
  const ledger = getABDateLedger(ds);
  ledger.remarks = document.getElementById('ab-ledger-remarks')?.value || '';
  saveToBrowser();
}
export function assignABSerialForRoll(ds, roll, cls) {
  const inputId = `ab-serial-${cls}-${roll}`;
  const raw = document.getElementById(inputId)?.value || '';
  const out = abSetAssignment(ds, roll, cls, raw);
  if (!out.ok) { showModal('Assignment Failed', out.msg); return; }
  saveToBrowser();
  renderAnswerBookSection(ds);
}
export function clearABSerialForRoll(ds, roll, cls) {
  const dsState = getDateState(ds);
  if (dsState.status === 'locked') { showModal('Date Locked', 'Unlock the date first.'); return; }
  abClearAssignment(ds, roll);
  saveToBrowser();
  renderAnswerBookSection(ds);
}
export function removeABDamagedForRoll(ds, roll) {
  const reason = prompt('Admin override reason (required):');
  if (!reason || !reason.trim()) { showModal('Reason Required', 'Override reason is required.'); return; }
  const ledger = getABDateLedger(ds);
  const idx = (ledger.damagedSerials || []).findIndex(d => d.roll === roll);
  if (idx < 0) return;
  const item = ledger.damagedSerials[idx];
  ledger.damagedSerials.splice(idx, 1);
  abAddAudit('AB_DAMAGED_REMOVE_OVERRIDE', `${item.serialRaw} (${ds}/${roll})`, reason.trim());
  rebuildAnswerBookRegistry();
  saveToBrowser();
  renderAnswerBookSection(ds);
}
export function abSummaryByType() {
  const ab = ensureAnswerBookState();
  rebuildAnswerBookRegistry();
  const out = {};
  (ab.types || []).forEach(t => {
    out[t.id] = {
      typeId: t.id,
      typeCode: t.shortCode,
      typeName: t.name,
      challanQty: 0,
      missingReceipt: 0,
      damagedReceipt: 0,
      mainUsed: 0,
      suppUsed: 0,
      used: 0,
      damagedPost: 0,
      available: 0,
      returnedSerials: [],
    };
  });

  (ab.receipts || []).forEach(r => {
    if (!out[r.typeId]) return;
    out[r.typeId].challanQty += Number(r.challanQty || 0);
  });
  (ab.receiptExceptions || []).forEach(ex => {
    if (!out[ex.typeId]) return;
    if (ex.kind === 'MISSING_ON_RECEIPT') out[ex.typeId].missingReceipt += 1;
    if (ex.kind === 'DAMAGED_ON_RECEIPT') out[ex.typeId].damagedReceipt += 1;
  });
  Object.values(ab.dateLedger || {}).forEach(ledger => {
    (ledger.damagedSerials || []).forEach(d => {
      if (!out[d.typeId]) return;
      out[d.typeId].damagedPost += 1;
    });
    (ledger.suppDamagedSerials || []).forEach(d => {
      if (!out[d.typeId]) return;
      out[d.typeId].damagedPost += 1;
    });
  });
  Object.entries(ab.dateLedger || {}).forEach(([ds, ledger]) => {
    const att = state.dateStates[ds]?.attendance || {};
    Object.entries(ledger.assignments || {}).forEach(([roll, a]) => {
      if (!out[a.typeId]) return;
      if (att[roll] === 'A') return;
      out[a.typeId].mainUsed += 1;
    });
    Object.values(ledger.suppAssignments || {}).forEach(arr => {
      (arr || []).forEach(a => {
        if (!out[a.typeId]) return;
        out[a.typeId].suppUsed += 1;
      });
    });
  });
  Object.values(ab.serialRegistry || {}).forEach(s => {
    if (!out[s.typeId]) return;
    if (s.status === 'AVAILABLE') {
      out[s.typeId].available += 1;
      out[s.typeId].returnedSerials.push(s.serialRaw);
    }
  });
  Object.values(out).forEach(row => { row.used = row.mainUsed + row.suppUsed; });
  return Object.values(out);
}
export function compressABSerialRanges(serials) {
  const parsed = (serials || []).map(parseABSerial).filter(Boolean);
  const groups = {};
  parsed.forEach(p => {
    const key = `${p.prefix}||${p.width}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(p.num);
  });
  const chunks = [];
  Object.keys(groups).forEach(key => {
    const [prefix, widthStr] = key.split('||');
    const width = Number(widthStr || 1);
    const nums = [...new Set(groups[key])].sort((a, b) => a - b);
    if (!nums.length) return;
    let st = nums[0], prev = nums[0];
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] === prev + 1) {
        prev = nums[i];
        continue;
      }
      chunks.push(st === prev
        ? abSerialText(prefix, st, width)
        : `${abSerialText(prefix, st, width)} - ${abSerialText(prefix, prev, width)}`);
      st = nums[i];
      prev = nums[i];
    }
    chunks.push(st === prev
      ? abSerialText(prefix, st, width)
      : `${abSerialText(prefix, st, width)} - ${abSerialText(prefix, prev, width)}`);
  });
  return chunks;
}
export function renderAnswerBookSection(ds) {
  const section = document.getElementById('ab-section');
  const container = document.getElementById('ab-content');
  if (!section || !container) return;
  ensureAnswerBookState();
  rebuildAnswerBookRegistry();
  if (!ds || !state.dateStates[ds]?.seating?.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  const ab = ensureAnswerBookState();
  const dsState = getDateState(ds);
  const ledger = getABDateLedger(ds);
  const types = ab.types || [];
  const suppTypeX = ab.suppClassTypeMap?.X || '';
  const suppTypeXII = ab.suppClassTypeMap?.XII || '';
  const typeOptions = `<option value="">Select type</option>` + types.map(t => `<option value="${t.id}">${t.shortCode} - ${t.name}</option>`).join('');
  const combos = getABSubjectCombos();
  const receipts = ab.receipts || [];
  const receiptOptions = `<option value="">Select receipt</option>` + receipts.map(r => {
    const t = getABType(r.typeId);
    return `<option value="${r.id}">#${r.id} ${r.date} · ${t ? t.shortCode : r.typeId} · ${r.startSerial}-${r.endSerial}</option>`;
  }).join('');

  const mappingRows = combos.map(c => {
    const selected = ab.subjectTypeMap[c.key] || '';
    return `<tr>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">${c.cls}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">${c.code}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">${c.name}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">
        <select style="font-size:12px;padding:4px 6px;width:100%;" onchange="setABSubjectType('${c.key}',this.value)">
          <option value="">Unmapped</option>
          ${types.map(t => `<option value="${t.id}" ${String(selected)===String(t.id)?'selected':''}>${t.shortCode}</option>`).join('')}
        </select>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="4" style="padding:8px;color:#64748b;">No subjects loaded yet.</td></tr>`;

  const receiptRows = receipts.map(r => {
    const t = getABType(r.typeId);
    const ex = (ab.receiptExceptions || []).filter(x => Number(x.receiptId) === Number(r.id));
    const miss = ex.filter(x => x.kind === 'MISSING_ON_RECEIPT').length;
    const dmg = ex.filter(x => x.kind === 'DAMAGED_ON_RECEIPT').length;
    const usable = Math.max(0, Number(r.challanQty || 0) - miss - dmg);
    return `<tr>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">#${r.id}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">${r.date}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">${t ? t.shortCode : r.typeId}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${r.startSerial} - ${r.endSerial}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;">${r.challanQty}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;color:#dc2626;">${miss}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;color:#b45309;">${dmg}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:#0c1c35;">${usable}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="8" style="padding:8px;color:#64748b;">No receipts yet.</td></tr>`;

  const exRows = (ab.receiptExceptions || []).slice().sort((a, b) => b.createdAt - a.createdAt).map(ex => {
    const t = getABType(ex.typeId);
    return `<tr>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">#${ex.id}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">${ex.kind === 'MISSING_ON_RECEIPT' ? 'Missing' : 'Damaged'}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${ex.serialRaw}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">${t ? t.shortCode : ex.typeId}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">
        <button class="btn btn-outline btn-sm" onclick="removeABReceiptException(${ex.id})">Override</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="5" style="padding:8px;color:#64748b;">No receipt exceptions.</td></tr>`;

  const seated = (dsState.seating || []).slice().sort((a,b) => a.roomNo - b.roomNo || a.seatInRoom - b.seatInRoom);
  const escSq = v => String(v || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const assignRows = seated.map(s => {
    const sub = getPrimarySubject(s, ds);
    const mapKey = s.class + '|' + (sub ? sub.code : '');
    const typeId = sub ? (ab.subjectTypeMap[mapKey] || '') : '';
    const type = typeId ? getABType(typeId) : null;
    const suppTypeId = getABSuppTypeForClass(s.class) || '';
    const suppType = suppTypeId ? getABType(suppTypeId) : null;
    const asg = ledger.assignments[s.roll] || null;
    const damaged = (ledger.damagedSerials || []).find(d => d.roll === s.roll);
    const suppItems = ledger.suppAssignments?.[s.roll] || [];
    const suppDamagedItems = (ledger.suppDamagedSerials || []).filter(d => String(d.roll || '') === String(s.roll));
    const att = dsState.attendance[s.roll] || '';
    const suppErr = ledger.suppEntryErrors?.[s.roll] || '';
    const serialValue = asg ? asg.serialRaw : '';
    const inputId = `ab-serial-${s.class}-${s.roll}`;
    const suppInputId = `ab-supp-serial-${s.class}-${s.roll}`;
    const badge = damaged
      ? `<span style="color:#b45309;font-weight:700;">DAMAGED (${damaged.serialRaw})</span>`
      : asg
        ? `<span style="color:#059669;font-weight:700;">ASSIGNED</span>`
        : `<span style="color:#6b7280;">Pending</span>`;
    const warns = [];
    if (att === 'A') warns.push('ABSENT (supp blocked)');
    if (!suppTypeId) warns.push('SUPP TYPE UNMAPPED');
    if (suppErr === 'CONFLICT') warns.push('SUPP CONFLICT');
    if (suppErr === 'INVALID') warns.push('SUPP INVALID');
    const warnHTML = warns.length
      ? `<div style="margin-top:4px;font-size:10px;color:#92400e;">${warns.map(w => `<span style="border:1px solid #facc15;background:#fffbeb;border-radius:10px;padding:1px 6px;margin-right:4px;display:inline-block;">${w}</span>`).join('')}</div>`
      : '';
    const suppListHTML = suppItems.map(item => `
      <div style="display:flex;align-items:center;gap:4px;margin-top:3px;flex-wrap:wrap;">
        <span style="font-family:monospace;font-size:11px;padding:1px 6px;border-radius:10px;background:#ecfeff;border:1px solid #a5f3fc;">${item.serialRaw}</span>
        <button class="btn btn-outline btn-sm" onclick="abRemoveSupplementary('${ds}','${s.roll}','${escSq(item.serialRaw)}')">Remove</button>
        <button class="btn btn-outline btn-sm" onclick="abMarkSuppDamaged('${ds}','${s.roll}','${escSq(item.serialRaw)}')">Damaged</button>
      </div>
    `).join('');
    const suppDmgHTML = suppDamagedItems.map(item => `
      <div style="display:flex;align-items:center;gap:4px;margin-top:3px;flex-wrap:wrap;">
        <span style="font-family:monospace;font-size:11px;padding:1px 6px;border-radius:10px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;">DMG ${item.serialRaw}</span>
        <button class="btn btn-outline btn-sm" onclick="abUndoSuppDamaged('${ds}','${s.roll}','${escSq(item.serialRaw)}')">Undo</button>
      </div>
    `).join('');
    return `<tr>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">${s.roomNo}-${s.seatInRoom}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${s.roll}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">${s.class}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">${sub ? sub.code : '—'}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">${type ? type.shortCode : '<span style="color:#dc2626;">Unmapped</span>'}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">${att || '—'}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">
        <input id="${inputId}" value="${serialValue}" placeholder="Serial"
          style="width:145px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;text-transform:uppercase;">
      </td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">${badge}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">
        <button class="btn btn-outline btn-sm" onclick="assignABSerialForRoll('${ds}','${s.roll}','${s.class}')">Save</button>
        <button class="btn btn-outline btn-sm" onclick="clearABSerialForRoll('${ds}','${s.roll}','${s.class}')">Clear</button>
        <button class="btn btn-outline btn-sm" onclick="abMarkDamagedFromAssignment('${ds}','${s.roll}')">Damaged</button>
        ${damaged ? `<button class="btn btn-outline btn-sm" onclick="removeABDamagedForRoll('${ds}','${s.roll}')">Undo</button>` : ''}
      </td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;min-width:320px;">
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
          <span style="font-size:11px;color:#64748b;">Type: ${suppType ? suppType.shortCode : '—'}</span>
          <input id="${suppInputId}" placeholder="Supp serial" style="width:130px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:3px 6px;text-transform:uppercase;">
          <button class="btn btn-outline btn-sm" onclick="addABSuppForRoll('${ds}','${s.roll}','${s.class}')">Add</button>
        </div>
        ${warnHTML}
        ${suppListHTML}
        ${suppDmgHTML}
      </td>
    </tr>`;
  }).join('');

  const summary = abSummaryByType();
  const summaryRows = summary.map(s => {
    const returnedRanges = compressABSerialRanges(s.returnedSerials);
    return `<tr>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">${s.typeCode}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;">${s.typeName}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;">${s.challanQty}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;color:#dc2626;">${s.missingReceipt}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;color:#b45309;">${s.damagedReceipt + s.damagedPost}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;">${s.mainUsed}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;">${s.suppUsed}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;">${s.used}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;">${s.available}</td>
      <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0;font-size:11px;">${returnedRanges.slice(0, 4).join('<br>') || '—'}${returnedRanges.length > 4 ? '<br>…' : ''}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="10" style="padding:8px;color:#64748b;">No type master entries.</td></tr>`;

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px;">
        <div style="font-weight:700;font-size:12px;color:#0c1c35;margin-bottom:8px;">Type Master</div>
        <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
          <input id="ab-type-name" placeholder="Type name" style="flex:1;min-width:130px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;">
          <input id="ab-type-code" placeholder="Code" style="width:90px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;text-transform:uppercase;">
          <button class="btn btn-outline btn-sm" onclick="addABType()">Add</button>
        </div>
        <div style="max-height:120px;overflow:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            ${(types || []).map(t => `<tr>
              <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;">${t.shortCode}</td>
              <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;">${t.name}</td>
              <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;text-align:right;"><button class="btn btn-outline btn-sm" onclick="removeABType(${t.id})">Remove</button></td>
            </tr>`).join('') || '<tr><td colspan="3" style="padding:6px;color:#64748b;">No types added.</td></tr>'}
          </table>
        </div>
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px;">
        <div style="font-weight:700;font-size:12px;color:#0c1c35;margin-bottom:8px;">Receipt Entry</div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(120px,1fr));gap:6px;">
          <select id="ab-rec-type" style="font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;">${typeOptions}</select>
          <input id="ab-rec-date" type="date" value="${ds}" style="font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;">
          <input id="ab-rec-start" placeholder="Start serial" style="font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;text-transform:uppercase;">
          <input id="ab-rec-end" placeholder="End serial" style="font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;text-transform:uppercase;">
          <input id="ab-rec-challan" placeholder="Challan no." style="grid-column:1/3;font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;">
        </div>
        <div style="margin-top:8px;">
          <button class="btn btn-outline btn-sm" onclick="addABReceipt()">Add Receipt</button>
        </div>
      </div>
    </div>

    <div style="margin-top:12px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px;">
      <div style="font-weight:700;font-size:12px;color:#0c1c35;margin-bottom:6px;">Supplementary Configuration</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <label style="min-width:56px;font-size:12px;color:#334155;">Class X</label>
          <select style="width:100%;font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;" onchange="setABSuppTypeClass('X',this.value)">
            <option value="">Unmapped</option>
            ${types.map(t => `<option value="${t.id}" ${String(suppTypeX)===String(t.id)?'selected':''}>${t.shortCode} - ${t.name}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <label style="min-width:56px;font-size:12px;color:#334155;">Class XII</label>
          <select style="width:100%;font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;" onchange="setABSuppTypeClass('XII',this.value)">
            <option value="">Unmapped</option>
            ${types.map(t => `<option value="${t.id}" ${String(suppTypeXII)===String(t.id)?'selected':''}>${t.shortCode} - ${t.name}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <div style="margin-top:12px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px;">
      <div style="display:grid;grid-template-columns:1.1fr 1fr;gap:12px;">
        <div>
          <div style="font-weight:700;font-size:12px;color:#0c1c35;margin-bottom:6px;">Subject-Type Mapping</div>
          <div style="max-height:180px;overflow:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <thead><tr style="background:#f8fafc;"><th style="padding:5px 6px;text-align:left;">Class</th><th style="padding:5px 6px;text-align:left;">Code</th><th style="padding:5px 6px;text-align:left;">Subject</th><th style="padding:5px 6px;text-align:left;">Type</th></tr></thead>
              <tbody>${mappingRows}</tbody>
            </table>
          </div>
        </div>
        <div>
          <div style="font-weight:700;font-size:12px;color:#0c1c35;margin-bottom:6px;">Receipt Exceptions</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
            <select id="ab-ex-receipt" style="grid-column:1/3;font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;">${receiptOptions}</select>
            <select id="ab-ex-kind" style="font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;">
              <option value="MISSING_ON_RECEIPT">Missing on receipt</option>
              <option value="DAMAGED_ON_RECEIPT">Damaged on receipt</option>
            </select>
            <input id="ab-ex-serial" placeholder="Serial" style="font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;text-transform:uppercase;">
          </div>
          <div style="margin-bottom:6px;"><button class="btn btn-outline btn-sm" onclick="addABReceiptException()">Add Exception</button></div>
          <div style="max-height:130px;overflow:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <thead><tr style="background:#f8fafc;"><th style="padding:5px 6px;text-align:left;">ID</th><th style="padding:5px 6px;text-align:left;">Type</th><th style="padding:5px 6px;text-align:left;">Serial</th><th style="padding:5px 6px;text-align:left;">Book</th><th></th></tr></thead>
              <tbody>${exRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div style="margin-top:12px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px;">
      <div style="font-weight:700;font-size:12px;color:#0c1c35;margin-bottom:6px;">Receipt Register</div>
      <div style="max-height:170px;overflow:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f8fafc;"><th style="padding:5px 6px;text-align:left;">Receipt</th><th style="padding:5px 6px;text-align:left;">Date</th><th style="padding:5px 6px;text-align:left;">Type</th><th style="padding:5px 6px;text-align:left;">Range</th><th style="padding:5px 6px;text-align:center;">Challan</th><th style="padding:5px 6px;text-align:center;">Missing</th><th style="padding:5px 6px;text-align:center;">Damaged</th><th style="padding:5px 6px;text-align:center;">Usable</th></tr></thead>
          <tbody>${receiptRows}</tbody>
        </table>
      </div>
    </div>

    <div style="margin-top:12px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:10px;flex-wrap:wrap;">
        <div style="font-weight:700;font-size:12px;color:#0c1c35;">Date-wise Candidate Serial Assignment — ${ds}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" onclick="abBulkAutoAssign('${ds}')">⚡ Bulk Auto-Assign</button>
          <div style="font-size:11px;color:${dsState.status==='locked'?'#b45309':'#64748b'};">
            ${dsState.status==='locked'?'Date locked (unlock to edit)':'Editable (before lock)'}
          </div>
        </div>
      </div>
      <div style="max-height:260px;overflow:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f8fafc;">
            <th style="padding:5px 6px;text-align:left;">Seat</th><th style="padding:5px 6px;text-align:left;">Roll</th><th style="padding:5px 6px;text-align:left;">Class</th>
            <th style="padding:5px 6px;text-align:left;">Sub</th><th style="padding:5px 6px;text-align:left;">Type</th><th style="padding:5px 6px;text-align:left;">Att</th>
            <th style="padding:5px 6px;text-align:left;">Serial</th><th style="padding:5px 6px;text-align:left;">Status</th><th style="padding:5px 6px;text-align:left;">Actions</th><th style="padding:5px 6px;text-align:left;">Supplementary (Manual)</th>
          </tr></thead>
          <tbody>${assignRows || '<tr><td colspan="10" style="padding:8px;color:#64748b;">No seating rows on this date.</td></tr>'}</tbody>
        </table>
      </div>
      <div style="margin-top:8px;">
        <textarea id="ab-ledger-remarks" onblur="saveABRemark('${ds}')" placeholder="Remarks for this date"
          style="width:100%;min-height:46px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:6px;">${ledger.remarks || ''}</textarea>
      </div>
    </div>

    <div style="margin-top:12px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px;">
      <div style="font-weight:700;font-size:12px;color:#0c1c35;margin-bottom:6px;">Final Reconciliation Snapshot (Type-wise)</div>
      <div style="max-height:200px;overflow:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f8fafc;">
            <th style="padding:5px 6px;text-align:left;">Type</th><th style="padding:5px 6px;text-align:left;">Name</th>
            <th style="padding:5px 6px;text-align:center;">Challan</th><th style="padding:5px 6px;text-align:center;">Missing</th>
            <th style="padding:5px 6px;text-align:center;">Damaged</th><th style="padding:5px 6px;text-align:center;">Main Used</th><th style="padding:5px 6px;text-align:center;">Supp Used</th><th style="padding:5px 6px;text-align:center;">Total Used</th>
            <th style="padding:5px 6px;text-align:center;">Balance</th><th style="padding:5px 6px;text-align:left;">Returned serial ranges</th>
          </tr></thead>
          <tbody>${summaryRows}</tbody>
        </table>
      </div>
    </div>
  `;
}
export function exportAnswerBookReceiptExcel() {
  ensureAnswerBookState();
  rebuildAnswerBookRegistry();
  const ab = ensureAnswerBookState();
  const wb = XLSX.utils.book_new();

  const typeRows = [['Type ID','Short Code','Type Name','Active'], ...(ab.types || []).map(t => [t.id, t.shortCode, t.name, t.active ? 'Y' : 'N'])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(typeRows), 'Type Master');

  const recRows = [['Receipt ID','Date','Type','Start Serial','End Serial','Challan Qty','Challan No','Missing','Damaged','Usable']];
  (ab.receipts || []).forEach(r => {
    const ex = (ab.receiptExceptions || []).filter(x => Number(x.receiptId) === Number(r.id));
    const miss = ex.filter(x => x.kind === 'MISSING_ON_RECEIPT').length;
    const dmg = ex.filter(x => x.kind === 'DAMAGED_ON_RECEIPT').length;
    recRows.push([r.id, r.date, getABType(r.typeId)?.shortCode || r.typeId, r.startSerial, r.endSerial, r.challanQty, r.challanNo || '', miss, dmg, Math.max(0, Number(r.challanQty || 0) - miss - dmg)]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(recRows), 'Receipts');

  const exRows = [['Exception ID','Receipt ID','Type','Kind','Serial','Created At']];
  (ab.receiptExceptions || []).forEach(ex => {
    exRows.push([ex.id, ex.receiptId, getABType(ex.typeId)?.shortCode || ex.typeId, ex.kind, ex.serialRaw, ex.createdAt ? new Date(ex.createdAt).toLocaleString('en-IN') : '']);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(exRows), 'Receipt Exceptions');

  const suppMapRows = [['Class','Supplementary Type']];
  suppMapRows.push(['X', getABType(ab.suppClassTypeMap?.X)?.shortCode || 'Unmapped']);
  suppMapRows.push(['XII', getABType(ab.suppClassTypeMap?.XII)?.shortCode || 'Unmapped']);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(suppMapRows), 'Supplementary Mapping');

  const sumRows = [['Type','Challan Qty','Missing on Receipt','Damaged','Main Used','Supp Used','Total Used','Balance']];
  abSummaryByType().forEach(s => sumRows.push([s.typeCode, s.challanQty, s.missingReceipt, s.damagedReceipt + s.damagedPost, s.mainUsed, s.suppUsed, s.used, s.available]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumRows), 'Reconciliation');

  XLSX.writeFile(wb, 'AnswerBook_Receipt_Register.xlsx');
}
export function exportAnswerBookDaywiseExcel() {
  ensureAnswerBookState();
  rebuildAnswerBookRegistry();
  const ab = ensureAnswerBookState();
  const wb = XLSX.utils.book_new();

  const row1 = [['Date','Roll','Class','Subject','Type','Serial','Attendance','Serial Status']];
  Object.entries(ab.dateLedger || {}).forEach(([ds, ledger]) => {
    const att = state.dateStates[ds]?.attendance || {};
    Object.values(ledger.assignments || {}).forEach(a => {
      const p = parseABSerial(a.serialRaw);
      const st = p && ab.serialRegistry[p.normalized] ? ab.serialRegistry[p.normalized].status : '';
      row1.push([ds, a.roll, a.class, `${a.subjectCode || ''} ${a.subjectName || ''}`.trim(), getABType(a.typeId)?.shortCode || a.typeId, a.serialRaw, att[a.roll] || '', st]);
    });
    (ledger.damagedSerials || []).forEach(d => {
      row1.push([ds, d.roll || '', d.class || '', d.subjectCode || '', getABType(d.typeId)?.shortCode || d.typeId, d.serialRaw, '', 'DAMAGED']);
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(row1), 'Date-wise Use');

  const row2 = [['Date','Type','Assigned','Damaged','Remarks']];
  Object.entries(ab.dateLedger || {}).forEach(([ds, ledger]) => {
    const byType = {};
    Object.values(ledger.assignments || {}).forEach(a => { byType[a.typeId] = byType[a.typeId] || { assigned:0, damaged:0 }; byType[a.typeId].assigned += 1; });
    Object.values(ledger.suppAssignments || {}).forEach(arr => (arr || []).forEach(a => { byType[a.typeId] = byType[a.typeId] || { assigned:0, damaged:0 }; byType[a.typeId].assigned += 1; }));
    (ledger.damagedSerials || []).forEach(d => { byType[d.typeId] = byType[d.typeId] || { assigned:0, damaged:0 }; byType[d.typeId].damaged += 1; });
    (ledger.suppDamagedSerials || []).forEach(d => { byType[d.typeId] = byType[d.typeId] || { assigned:0, damaged:0 }; byType[d.typeId].damaged += 1; });
    Object.keys(byType).forEach(tid => {
      row2.push([ds, getABType(tid)?.shortCode || tid, byType[tid].assigned, byType[tid].damaged, ledger.remarks || '']);
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(row2), 'Daily Ledger');

  const suppRows = [['Date','Roll','Class','Main Subject','Supplementary Serial','Type','Issued At','Status','Note']];
  Object.entries(ab.dateLedger || {}).forEach(([ds, ledger]) => {
    const seatMap = {};
    (state.dateStates[ds]?.seating || []).forEach(s => { seatMap[s.roll] = s; });
    Object.entries(ledger.suppAssignments || {}).forEach(([roll, arr]) => {
      const seat = seatMap[roll];
      const sub = seat ? getPrimarySubject(seat, ds) : null;
      (arr || []).forEach(item => {
        const p = parseABSerial(item.serialRaw);
        const st = p && ab.serialRegistry[p.normalized] ? ab.serialRegistry[p.normalized].status : '';
        suppRows.push([ds, roll, item.class || seat?.class || '', sub ? `${sub.code} ${sub.name}` : '', item.serialRaw, getABType(item.typeId)?.shortCode || item.typeId, item.issuedAt ? new Date(item.issuedAt).toLocaleString('en-IN') : '', st || 'USED', item.note || '']);
      });
    });
    (ledger.suppDamagedSerials || []).forEach(item => {
      suppRows.push([ds, item.roll || '', item.class || '', '', item.serialRaw, getABType(item.typeId)?.shortCode || item.typeId, item.damagedAt ? new Date(item.damagedAt).toLocaleString('en-IN') : '', 'DAMAGED', '']);
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(suppRows), 'Supplementary Use');

  const suppExRows = [['Date','Roll','Class','Issue','Serial(s)']];
  Object.entries(ab.dateLedger || {}).forEach(([ds, ledger]) => {
    const att = state.dateStates[ds]?.attendance || {};
    Object.entries(ledger.suppAssignments || {}).forEach(([roll, arr]) => {
      if (att[roll] !== 'A') return;
      const cls = (arr && arr[0] && arr[0].class) || '';
      suppExRows.push([ds, roll, cls, 'ABSENT_WITH_SUPP', (arr || []).map(x => x.serialRaw).join(', ')]);
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(suppExRows), 'Supplementary Exceptions');

  XLSX.writeFile(wb, 'AnswerBook_Daywise_Use.xlsx');
}
export function exportAnswerBookFinalExcel() {
  ensureAnswerBookState();
  rebuildAnswerBookRegistry();
  const wb = XLSX.utils.book_new();
  const summary = abSummaryByType();

  const r1 = [['Type','Type Name','Challan Qty','Missing on Receipt','Damaged','Main Used','Supplementary Used','Total Used','Final Balance Returned']];
  summary.forEach(s => r1.push([s.typeCode, s.typeName, s.challanQty, s.missingReceipt, s.damagedReceipt + s.damagedPost, s.mainUsed, s.suppUsed, s.used, s.available]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r1), 'Final Summary');

  const r2 = [['Type','Returned Serial Ranges']];
  summary.forEach(s => {
    const ranges = compressABSerialRanges(s.returnedSerials);
    if (!ranges.length) r2.push([s.typeCode, '—']);
    else ranges.forEach((rr, i) => r2.push([i === 0 ? s.typeCode : '', rr]));
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r2), 'Returned Serials');

  const ab = ensureAnswerBookState();
  const r3 = [['Audit ID','Timestamp','Action','Detail','Reason']];
  (ab.auditLog || []).forEach(a => r3.push([a.id, a.at ? new Date(a.at).toLocaleString('en-IN') : '', a.action, a.detail, a.reason || '']));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r3), 'Audit Log');

  XLSX.writeFile(wb, 'AnswerBook_Final_Return_to_CBSE.xlsx');
}
