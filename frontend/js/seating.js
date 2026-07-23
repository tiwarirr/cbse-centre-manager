// ============================================================
// seating.js — extracted from CBSE_Centre_Manager.html (Phase A modular split)
// ============================================================
import { rebuildAnswerBookRegistry } from './answerbook.js';
import { formatSubjectsForDate, sortDates } from './parser.js';
import { getConfig, getDateState, state } from './state.js';
import { saveToBrowser } from './storage.js';
import { buildCandidatesTable, buildDateTabs, buildScheduleTable, currentDate, currentSubjectFilter, renderRooms, selectDate, setSummaryDate, showModal, summaryDate, switchPanel } from './ui.js';

export function seatPosFromIndex(cfg, seatInRoom) {
  const col = cfg.seatDir === 'rowwise'
    ? ((seatInRoom - 1) % cfg.cols) + 1
    : Math.floor((seatInRoom - 1) / cfg.rows) + 1;
  const row = cfg.seatDir === 'rowwise'
    ? Math.floor((seatInRoom - 1) / cfg.cols) + 1
    : ((seatInRoom - 1) % cfg.rows) + 1;
  return { row, col };
}
export function makeSeatedEntry(cand, ds, cfg, seatIndex, roomOffset) {
  const offset = roomOffset || 0;
  const seatInRoom = (seatIndex % cfg.perRoom) + 1;
  const roomNo     = offset + Math.floor(seatIndex / cfg.perRoom) + 1;
  const pos        = seatPosFromIndex(cfg, seatInRoom);
  return {
    roll:         cand.roll,
    class:        cand.class,
    name:         cand.name,
    mother:       cand.mother,
    father:       cand.father,
    sex:          cand.sex,
    cat:          cand.cat,
    schoolCode:   cand.schoolCode,
    schoolName:   cand.schoolName,
    dateSubjects: cand.dateSubjects,
    roomNo,
    seatInRoom,
    row: pos.row,
    col: pos.col,
    seatLabel: `R${pos.row}-C${pos.col}`,
    subjectsToday: formatSubjectsForDate(cand, ds),
  };
}
// ── STAGGER HELPER ─────────────────────────────────────────────
// Maps logical row (1..rows) + col to physical row in a (rows+1)-row grid
// Odd cols: candidates in physical rows 1..rows, physical row rows+1 = X
// Even cols: candidates in physical rows 2..rows+1, physical row 1 = X
export function physRow(logicalRow, col, stagger) {
  if (!stagger) return logicalRow;
  return col % 2 === 0 ? logicalRow + 1 : logicalRow;
}
export function physRows(cfg) { return cfg.stagger ? cfg.rows + 1 : cfg.rows; }
export function isXCell(physR, col, cfg) {
  if (!cfg.stagger) return false;
  if (col % 2 === 1) return physR === cfg.rows + 1; // odd col: last row is X
  return physR === 1;                                 // even col: first row is X
}
export function buildSeating(candidates, cfg, targetDate) {
  // Get all dates (or just one if targetDate specified)
  const allDatesSet = new Set();
  candidates.forEach(c => Object.keys(c.dateSubjects).forEach(d => allDatesSet.add(d)));
  const allDates = sortDates([...allDatesSet]);

  const seating = {};
  const datesToProcess = (targetDate && typeof targetDate === 'string') ? [targetDate] : allDates;
  datesToProcess.forEach(ds => {
    if (!ds || typeof ds !== 'string') return;  // safety guard
    // IMPORTANT: check dateSubjects[ds] exists AND has at least one subject (length > 0)
    // A missing or empty array means this candidate has no exam on this date
    const hasExam = c => c.dateSubjects[ds] && c.dateSubjects[ds].length > 0;

    let dayX   = candidates.filter(c => c.class === 'X'   && hasExam(c));
    let dayXII = candidates.filter(c => c.class === 'XII' && hasExam(c));

    if (!cfg.inclPrivate) {
      dayX   = dayX.filter(c => c.schoolCode !== '99999');
      dayXII = dayXII.filter(c => c.schoolCode !== '99999');
    }

    // Sort each class by roll number
    dayX.sort((a,b) => a.roll.localeCompare(b.roll));
    dayXII.sort((a,b) => a.roll.localeCompare(b.roll));

    // If splitting by class: assign room numbers within each class separately
    // so Class X gets Rooms 1..n and Class XII gets Rooms n+1..m
    let ordered = [];
    // groupBySubject: group candidates by subject, each subject sorted by own roll numbers.
    // Must be defined before any split path since all paths use it.
    const groupBySubject = (group) => {
      const subCount = {};
      group.forEach(c => {
        const sub = (c.dateSubjects[ds]||[])[0];
        if (sub) subCount[sub.code] = (subCount[sub.code]||0) + 1;
      });
      const codesInGroup = Object.keys(subCount);
      if (codesInGroup.length <= 1) return group.sort((a,b) => a.roll.localeCompare(b.roll));

      let subCodes;
      const dsOrder = customSubjectOrder[ds];
      if (dsOrder) {
        const groupCls = group[0]?.class;
        subCodes = dsOrder
          .filter(key => { const [cls,code]=key.split('|'); return cls===groupCls && codesInGroup.includes(code); })
          .map(key => key.split('|')[1]);
        codesInGroup.filter(c => !subCodes.includes(c)).forEach(c => subCodes.push(c));
      } else {
        subCodes = codesInGroup.sort((a,b) => subCount[b] - subCount[a] || a.localeCompare(b));
      }

      const result = [];
      subCodes.forEach(code => {
        result.push(...group
          .filter(c => (c.dateSubjects[ds]||[])[0]?.code === code)
          .sort((a,b) => a.roll.localeCompare(b.roll)));
      });
      return result;
    };

    if (cfg.split === 'class') {
      // Assign rooms independently per class, then merge
      // Respect classOrder: whichever class is "first" gets rooms 1..n
      // Group each class by subject first (serial fill within each subject)
      const rawFirst  = cfg.classOrder === 'xii-first' ? dayXII : dayX;
      const rawSecond = cfg.classOrder === 'xii-first' ? dayX   : dayXII;
      const firstGroup  = groupBySubject(rawFirst);
      const secondGroup = groupBySubject(rawSecond);
      const firstRooms  = firstGroup.length ? Math.ceil(firstGroup.length / cfg.perRoom) : 0;
      const seatedFirst  = firstGroup.map( (cand, si) => makeSeatedEntry(cand, ds, cfg, si, 0));
      const seatedSecond = secondGroup.map((cand, si) => makeSeatedEntry(cand, ds, cfg, si, firstRooms));
      seating[ds] = [...seatedFirst, ...seatedSecond];
      return; // skip the rest of this date's processing
    }

    // Collect ALL candidates for this date
    const dayAll = [...dayX, ...dayXII];

    if (cfg.split === 'subject') {
      // Each class+subject gets its own contiguous block of rooms.
      // CRITICAL: each group must be seated independently with seatIndex
      // resetting to 0 and its own roomOffset — otherwise seatInRoom wraps
      // incorrectly and subjects bleed into each other's rooms.
      const classOrderedAll = cfg.classOrder === 'xii-first' ? [...dayXII,...dayX] : [...dayX,...dayXII];
      const seenSubKeys = new Set();
      const splitCount = {};
      classOrderedAll.forEach(cand => {
        const sub = (cand.dateSubjects[ds]||[])[0];
        if (sub) { const key=cand.class+'|'+sub.code; splitCount[key]=(splitCount[key]||0)+1; }
      });
      const dsSplitOrder = customSubjectOrder[ds];
      const splitKeys = dsSplitOrder
        ? [...dsSplitOrder.filter(k => splitCount[k]),
           ...Object.keys(splitCount).filter(k => !dsSplitOrder.includes(k))]
        : Object.keys(splitCount).sort((a,b) => splitCount[b]-splitCount[a] || a.localeCompare(b));
      const subjectGroups = [];
      splitKeys.forEach(key => {
        const [cls,code] = key.split('|');
        if (!seenSubKeys.has(key)) { seenSubKeys.add(key); subjectGroups.push({cls,code}); }
      });

      // Seat each group independently, accumulating roomOffset across groups
      let roomOffset = 0;
      const allSeated = [];
      subjectGroups.forEach(sg => {
        const group = dayAll
          .filter(c => c.class===sg.cls && (c.dateSubjects[ds]||[])[0]?.code===sg.code)
          .sort((a,b) => a.roll.localeCompare(b.roll));
        if (!group.length) return;
        const seatedGroup = group.map((cand, si) => makeSeatedEntry(cand, ds, cfg, si, roomOffset));
        allSeated.push(...seatedGroup);
        roomOffset += Math.ceil(group.length / cfg.perRoom);
      });
      seating[ds] = allSeated;
      return; // done for this date
    } else if (cfg.classOrder === 'x-first') {
      ordered = [...groupBySubject(dayX), ...groupBySubject(dayXII)];
    } else if (cfg.classOrder === 'xii-first') {
      ordered = [...groupBySubject(dayXII), ...groupBySubject(dayX)];
    } else {
      // 'roll' interleaved: still group by subject (each subject sorted by its own rolls)
      ordered = groupBySubject(dayAll);
    }

    const seated = ordered.map((cand, seatIdx) => makeSeatedEntry(cand, ds, cfg, seatIdx, 0));
    seating[ds] = seated;
  });
  return { seating, allDates };
}
// ── SUBJECT ORDER MODAL (per-date) ─────────────────────────────

export let _dragSrcEl  = null;
export let _orderingDs = null;   // which date is currently being ordered
export function buildOrderListForDate(ds) {
  // Collect class+subject combos present on this date, with student counts
  const subCount = {};
  (state.seating[ds] || []).forEach(s => {
    const sub = (s.dateSubjects[ds]||[])[0];
    if (!sub) return;
    const key = s.class + '|' + sub.code;
    if (!subCount[key]) subCount[key] = { cls: s.class, code: sub.code, name: sub.name, count: 0 };
    subCount[key].count++;
  });

  const saved = customSubjectOrder[ds];
  if (saved) {
    // Show in saved order, append any new keys
    const items = saved.filter(k => subCount[k]).map(k => subCount[k]);
    Object.keys(subCount).filter(k => !saved.includes(k)).forEach(k => items.push(subCount[k]));
    return items;
  }
  // Auto: sort by count desc
  return Object.values(subCount).sort((a,b) => b.count - a.count || a.cls.localeCompare(b.cls) || a.code.localeCompare(b.code));
}
export function openOrderModal() {
  if (!currentDate) return;
  _orderingDs = currentDate;

  // Update modal title with date
  const titleEl = document.querySelector('#order-modal [data-modal-date]');
  if (titleEl) titleEl.textContent = _orderingDs;

  renderOrderList();
  document.getElementById('order-modal').style.display = 'flex';
}
export function closeOrderModal() {
  document.getElementById('order-modal').style.display = 'none';
}
export function renderOrderList() {
  const items = buildOrderListForDate(_orderingDs);
  const list  = document.getElementById('order-list');
  list.innerHTML = '';

  items.forEach((item, idx) => {
    const clsBadgeBg  = item.cls === 'X' ? '#dcfce7' : '#dbeafe';
    const clsBadgeCol = item.cls === 'X' ? '#166534' : '#1e40af';
    const isCustom    = !!customSubjectOrder[_orderingDs];

    const div = document.createElement('div');
    div.dataset.key = item.cls + '|' + item.code;
    div.draggable   = true;
    div.style.cssText = 'display:flex;align-items:center;gap:10px;background:#fff;border:1.5px solid #e5e7eb;border-radius:8px;padding:10px 14px;cursor:grab;user-select:none;transition:box-shadow 0.15s,border-color 0.15s;';

    div.innerHTML = `
      <span style="color:#aaa;font-size:18px;line-height:1;flex-shrink:0;">⠿</span>
      <span style="background:${clsBadgeBg};color:${clsBadgeCol};font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;flex-shrink:0;">Class ${item.cls}</span>
      <span style="font-family:'DM Mono',monospace;font-size:12px;font-weight:600;color:#1a50d4;flex-shrink:0;">${item.code}</span>
      <span style="font-size:12px;color:#374151;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.name}</span>
      <span style="font-size:11px;color:#9ca3af;flex-shrink:0;">${item.count} students</span>
      <span style="font-size:11px;color:#d1d5db;flex-shrink:0;">#${idx + 1}</span>
    `;

    div.addEventListener('dragstart', e => {
      _dragSrcEl = div;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => div.style.opacity = '0.4', 0);
    });
    div.addEventListener('dragend', () => {
      div.style.opacity = '1';
      list.querySelectorAll(':scope > div').forEach(el => { el.style.borderColor='#e5e7eb'; el.style.background='#fff'; });
      refreshOrderNumbers();
    });
    div.addEventListener('dragover', e => {
      e.preventDefault();
      if (div !== _dragSrcEl) { div.style.borderColor='#1a50d4'; div.style.background='#eff6ff'; }
    });
    div.addEventListener('dragleave', () => { div.style.borderColor='#e5e7eb'; div.style.background='#fff'; });
    div.addEventListener('drop', e => {
      e.preventDefault();
      if (_dragSrcEl && _dragSrcEl !== div) {
        const all = [...list.querySelectorAll(':scope > div')];
        if (all.indexOf(_dragSrcEl) < all.indexOf(div)) list.insertBefore(_dragSrcEl, div.nextSibling);
        else list.insertBefore(_dragSrcEl, div);
      }
      div.style.borderColor='#e5e7eb'; div.style.background='#fff';
    });

    list.appendChild(div);
  });
}
export function refreshOrderNumbers() {
  document.querySelectorAll('#order-list > div').forEach((el, i) => {
    const numEl = el.querySelector('span:last-child');
    if (numEl) numEl.textContent = '#' + (i + 1);
  });
}
export function resetOrderAuto() {
  delete customSubjectOrder[_orderingDs];
  renderOrderList();
}
export function resetOrderClassFirst() {
  const items = buildOrderListForDate(_orderingDs);
  const cfg   = getConfig();
  items.sort((a, b) => {
    const rank = cls => cls === 'XII' ? (cfg.classOrder === 'xii-first' ? 0 : 1) : (cfg.classOrder === 'xii-first' ? 1 : 0);
    return rank(a.cls) - rank(b.cls) || b.count - a.count || a.code.localeCompare(b.code);
  });
  customSubjectOrder[_orderingDs] = items.map(i => i.cls + '|' + i.code);
  renderOrderList();
}
export function reverseOrder() {
  const list  = document.getElementById('order-list');
  [...list.querySelectorAll(':scope > div')].reverse().forEach(el => list.appendChild(el));
  refreshOrderNumbers();
}
export function applyOrder() {
  // Save the new order for this date
  const newOrder = [...document.querySelectorAll('#order-list > div')].map(el => el.dataset.key);
  customSubjectOrder[_orderingDs] = newOrder;
  
  // Sync to persistent state so generateSeating doesn't overwrite it
  const ds_state = getDateState(_orderingDs);
  ds_state.subjectOrder = newOrder;

  closeOrderModal();

  // Rebuild seating for THIS date (order change is date-specific)
  generateSeating(_orderingDs, true);
}
// Reset all per-date orders on fresh upload
export function resetCustomOrder() {
  customSubjectOrder = {};
}
// ── GENERATE SEATING ───────────────────────────────────────────
// Generate seating for a specific date (or all dates if ds=null)
export function generateSeating(ds, silent) {
  if (!state.candidates.length) {
    if (!silent) showModal('No Data', 'Please upload candidate HTML files first.');
    return;
  }

  const datesToBuild = ds ? [ds] : state.allDates;
  const globalCfg = getConfig();

  datesToBuild.forEach(d => {
    const ds_state = getDateState(d);

    // If locked, require confirmation (only for explicit single-date regeneration)
    if (ds_state.status === 'locked' && ds && !silent) {
      if (!confirm(`${d} is locked. Regenerate seating anyway?`)) return;
      ds_state.status = 'draft';
    }

    // Each date uses its OWN stored split/classOrder, falling back to global config
    const dateCfg = {
      ...globalCfg,
      split:      ds_state.split      || globalCfg.split,
      classOrder: ds_state.classOrder || globalCfg.classOrder,
    };

    // Apply this date's custom subject order
    if (ds_state.subjectOrder) {
      customSubjectOrder[d] = ds_state.subjectOrder;
    } else {
      delete customSubjectOrder[d];   // clear any stale order
    }

    // Build seating for THIS date only (targetDate=d ensures isolation)
    const { seating } = buildSeating(state.candidates, dateCfg, d);
    ds_state.seating     = seating[d] || [];
    ds_state.status      = ds_state.status === 'empty' ? 'draft' : ds_state.status;
    ds_state.generatedAt = Date.now();
    state.seating[d]     = ds_state.seating;
  });

  state.generated = true;
  document.getElementById('badge-seating').textContent = state.allDates.length;
  document.getElementById('badge-seating').style.display = 'inline-block';

  setSummaryDate('all'); // [was: bare `summaryDate = 'all'` before module split]
  buildScheduleTable();
  buildCandidatesTable();

  if (ds && silent) {
    // Single-date silent refresh — stay in place
    renderRooms(ds, currentSubjectFilter);
    selectDate(ds);
  } else if (ds) {
    // Single date, go to seating panel for that date
    buildDateTabs();
    document.getElementById('seating-empty').style.display = 'none';
    document.getElementById('seating-content').style.display = 'block';
    switchPanel('seating');
    selectDate(ds);
  } else {
    // All dates fresh build
    buildDateTabs();
    document.getElementById('seating-empty').style.display = 'none';
    document.getElementById('seating-content').style.display = 'block';
    if (!silent) switchPanel('seating');
  }

  saveToBrowser();
}
// ── PER-DATE ACTIONS ───────────────────────────────────────────

export function generateDateSeating() {
  if (!currentDate) return;
  const ds_state = getDateState(currentDate);
  if (ds_state.status === 'locked') {
    if (!confirm(`${currentDate} is LOCKED. Regenerate and keep as draft?`)) return;
    ds_state.status = 'draft';
  }
  // Save current UI dropdowns to dateState
  updateDateConfig();
  generateSeating(currentDate, false);
}
export function updateDateConfig() {
  if (!currentDate) return;
  const ds_state = getDateState(currentDate);
  const split = document.getElementById('dab-split')?.value;
  const classOrder = document.getElementById('dab-classorder')?.value;
  if (split)      ds_state.split      = split;
  if (classOrder) ds_state.classOrder = classOrder;
}
export function toggleLock() {
  if (!currentDate) return;
  const ds_state = getDateState(currentDate);
  if (ds_state.status === 'locked') {
    if (!confirm(`Unlock ${currentDate} for editing?`)) return;
    ds_state.status = 'draft';
  } else {
    ds_state.status   = 'locked';
    ds_state.lockedAt = Date.now();
  }
  rebuildAnswerBookRegistry();
  // Refresh tab badge and action bar
  buildDateTabs();
  selectDate(currentDate);
  renderRooms(currentDate, currentSubjectFilter);
  saveToBrowser();
}
export let customSubjectOrder = {};     // per-date map: { 'dd-Mon-yyyy': ['CLASS|CODE',...] }
