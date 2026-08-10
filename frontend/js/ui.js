// ============================================================
// ui.js — extracted from CBSE_Centre_Manager.html (Phase A modular split)
// ============================================================
import { renderAnswerBookSection } from './answerbook.js';
import { showInvStep } from './invigilator.js';
import { dayName, formatSubjectsForDate, getPrimarySubject, sortDates } from './parser.js';
import { buildPrintFrame, printSummary, renderQPLogTable } from './reports.js';
import { customSubjectOrder, generateSeating, isXCell, physRow, physRows } from './seating.js';
import { getConfig, getDateState, state } from './state.js';

// ── SEATING GRID VIEW ──────────────────────────────────────────
export let currentDate = null;
export let currentSubjectFilter = 'all';
export function topSubjectCodesByClass(seated, ds, cls) {
  const subCount = {};
  seated.forEach(s => {
    if (s.class !== cls) return;
    const sub = getPrimarySubject(s, ds);
    if (!sub || !sub.code) return;
    subCount[sub.code] = (subCount[sub.code] || 0) + 1;
  });
  const entries = Object.entries(subCount);
  if (!entries.length) return '';
  return entries
    .sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([code, cnt]) => `${code}(${cnt})`)
    .join(', ');
}
export function buildDateTabInfoLines(ds, seated) {
  const xCount = seated.filter(s => s.class === 'X').length;
  const xiiCount = seated.filter(s => s.class === 'XII').length;
  const xCodes = topSubjectCodesByClass(seated, ds, 'X');
  const xiiCodes = topSubjectCodesByClass(seated, ds, 'XII');
  const classBits = [];
  if (xCount > 0) classBits.push(`X ${xCount}`);
  if (xiiCount > 0) classBits.push(`XII ${xiiCount}`);

  const infoLines = [];
  if (seated.length) infoLines.push(`<span class="dt-cnt">${seated.length} cands</span>`);
  if (classBits.length) infoLines.push(`<span class="dt-cnt">${classBits.join(' · ')}</span>`);
  if (xCodes) infoLines.push(`<span class="dt-cnt" title="Class X top subject codes: ${xCodes}">X: ${xCodes}</span>`);
  if (xiiCodes) infoLines.push(`<span class="dt-cnt" title="Class XII top subject codes: ${xiiCodes}">XII: ${xiiCodes}</span>`);
  if (!seated.length) infoLines.push(`<span class="dt-cnt">not generated</span>`);
  return infoLines;
}
export function buildDateTabs() {
  const container = document.getElementById('date-tabs');
  container.innerHTML = '';
  state.allDates.forEach((ds, i) => {
    const ds_state = getDateState(ds);
    const seated   = ds_state.seating || [];
    const statusDot = ds_state.status === 'locked' ? '🔒' : ds_state.status === 'draft' ? '●' : '○';
    const infoLines = buildDateTabInfoLines(ds, seated);
    const tab = document.createElement('div');
    tab.className = 'date-tab date-tab-rich' + (i === 0 ? ' active' : '');
    tab.onclick = () => selectDate(ds);
    tab.dataset.date = ds;
    tab.innerHTML = `
      <span class="dt-date">${ds.slice(0,-5)}</span>
      ${infoLines.join('')}
      <span class="dt-status" title="${ds_state.status}">${statusDot}</span>`;
    container.appendChild(tab);
  });
  if (state.allDates.length) selectDate(state.allDates[0]);
}
export function selectDate(ds) {
  currentDate = ds;
  currentSubjectFilter = 'all';
  document.querySelectorAll('#date-tabs .date-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.date === ds);
  });
  document.getElementById('seating-sub').textContent =
    `${ds} (${dayName(ds)}) — ${(state.seating[ds]||[]).length} candidates`;

  // Update per-date action bar
  const ds_state  = getDateState(ds);
  const seated    = ds_state.seating || [];
  const actionBar = document.getElementById('date-action-bar');
  actionBar.style.display = 'block';

  // Date label
  document.getElementById('dab-date').textContent = `${ds} (${dayName(ds)})`;

  // Status badge
  const badge = document.getElementById('dab-status-badge');
  if (ds_state.status === 'locked') {
    badge.textContent = '🔒 LOCKED'; badge.style.background='#fef3c7'; badge.style.color='#92400e';
  } else if (ds_state.status === 'draft') {
    badge.textContent = '● DRAFT'; badge.style.background='#dbeafe'; badge.style.color='#1e40af';
  } else {
    badge.textContent = '○ NOT GENERATED'; badge.style.background='#f3f4f6'; badge.style.color='#6b7280';
  }

  // Info line
  const attended = Object.values(ds_state.attendance||{}).filter(v=>v==='P').length;
  const absent   = Object.values(ds_state.attendance||{}).filter(v=>v==='A').length;
  const attTotal = attended + absent;
  document.getElementById('dab-info').textContent = seated.length
    ? `${seated.length} candidates · ${Math.ceil(seated.length / getConfig().perRoom)} rooms`
      + (attTotal ? ` · Att: ${attended}P / ${absent}A` : '')
    : 'Not yet generated for this date';

  // Sync per-date dropdowns
  const dabSplit = document.getElementById('dab-split');
  const dabOrder = document.getElementById('dab-classorder');
  if (dabSplit) dabSplit.value = ds_state.split || getConfig().split;
  if (dabOrder) dabOrder.value = ds_state.classOrder || getConfig().classOrder;

  // Subject order button
  const combosOnDate = new Set();
  seated.forEach(s => { const sub=(s.dateSubjects[ds]||[])[0]; if(sub) combosOnDate.add(s.class+'|'+sub.code); });
  const orderBtn = document.getElementById('dab-order');
  if (orderBtn) {
    orderBtn.style.display = (seated.length && combosOnDate.size >= 2) ? 'inline-flex' : 'none';
    orderBtn.textContent = customSubjectOrder[ds] ? '⇅ Order ✓' : '⇅ Order';
    orderBtn.style.borderColor = customSubjectOrder[ds] ? '#1a50d4' : '';
    orderBtn.style.color       = customSubjectOrder[ds] ? '#1a50d4' : '';
  }

  // Attendance button — show only after seating generated
  const attBtn = document.getElementById('dab-attendance');
  if (attBtn) attBtn.style.display = seated.length ? 'inline-flex' : 'none';

  // Lock button
  const lockBtn = document.getElementById('dab-lock');
  if (lockBtn && seated.length) {
    lockBtn.style.display = 'inline-flex';
    if (ds_state.status === 'locked') {
      lockBtn.textContent = '✏️ Edit'; lockBtn.style.background=''; lockBtn.style.color='';
    } else {
      lockBtn.textContent = '🔒 Lock'; lockBtn.style.background=''; lockBtn.style.color='';
    }
  } else if (lockBtn) { lockBtn.style.display = 'none'; }

  // Disable generate for locked dates
  const genBtn = document.getElementById('dab-generate');
  if (genBtn) {
    genBtn.disabled = false;  // always enabled — confirm prompt handles locked case
    genBtn.textContent = ds_state.status === 'empty' ? '⚡ Generate' : '⚡ Regenerate';
  }

  // Build subject filter tabs if separate plan enabled
  const cfg = getConfig();
  const subWrap = document.getElementById('subject-tabs-wrap');
  const subTabs = document.getElementById('subject-tabs');
  subTabs.innerHTML = '';

  if (cfg.sepPlan) {
    const seated = state.seating[ds] || [];
    // Collect unique subjects on this date
    const subMap = {};
    seated.forEach(s => {
      (s.dateSubjects[ds] || []).forEach(sub => {
        subMap[sub.code] = sub.name;
      });
    });
    const subCodes = Object.keys(subMap);
    if (subCodes.length > 1) {
      subWrap.style.display = 'block';
      // "All" tab
      const allTab = document.createElement('div');
      allTab.className = 'date-tab active';
      allTab.dataset.sub = 'all';
      allTab.onclick = () => selectSubject('all');
      allTab.innerHTML = `<span class="dt-date">All</span><span class="dt-cnt">${seated.length}</span>`;
      subTabs.appendChild(allTab);

      subCodes.forEach(code => {
        const cnt = seated.filter(s => (s.dateSubjects[ds]||[]).some(x => x.code === code)).length;
        const tab = document.createElement('div');
        tab.className = 'date-tab';
        tab.dataset.sub = code;
        tab.onclick = () => selectSubject(code);
        tab.innerHTML = `<span class="dt-date">${code}</span><span class="dt-cnt">${subMap[code].slice(0,14)}</span><span class="dt-cnt">${cnt}</span>`;
        subTabs.appendChild(tab);
      });
    } else { subWrap.style.display = 'none'; }
  } else { subWrap.style.display = 'none'; }

  renderRooms(ds, 'all');
  renderAnswerBookSection(ds);
  renderQPLogTable(ds); // [folded from legacy selectDate monkeypatch]
}
export function selectSubject(subCode) {
  currentSubjectFilter = subCode;
  document.querySelectorAll('#subject-tabs .date-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.sub === subCode);
  });
  renderRooms(currentDate, subCode);
}
export function renderRooms(ds, subFilter) {
  const cfg = getConfig();
  const seated = state.seating[ds] || [];
  const container = document.getElementById('rooms-output');
  container.innerHTML = '';
  if (!seated.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">No candidates on this date</div></div>';
    return;
  }

  const totalRooms = Math.ceil(seated.length / cfg.perRoom);

  for (let room = 1; room <= totalRooms; room++) {
    const roomCands = seated.filter(s => s.roomNo === room);
    if (!roomCands.length) continue;

    // When filtering by subject, check if any candidate in this room has this subject
    const roomHasSub = subFilter === 'all' ||
      roomCands.some(s => (s.dateSubjects[ds]||[]).some(x => x.code === subFilter));
    if (!roomHasSub) continue;

    const xCount   = roomCands.filter(s => s.class === 'X').length;
    const xiiCount = roomCands.filter(s => s.class === 'XII').length;
    const firstRoll = roomCands[0].roll;
    const lastRoll  = roomCands[roomCands.length-1].roll;

    const block = document.createElement('div');
    block.className = 'room-block';
    block.style.marginBottom = '28px';

    // Room header
    const hdr = document.createElement('div');
    hdr.className = 'room-header';
    hdr.innerHTML = `
      <span>ROOM ${String(room).padStart(2,'0')} &nbsp;—&nbsp; ${ds} (${dayName(ds)})</span>
      <span class="room-header-meta">
        ${roomCands.length} candidates &nbsp;|&nbsp;
        ${xCount ? `X: ${xCount}` : ''}${xCount && xiiCount ? ' · ' : ''}${xiiCount ? `XII: ${xiiCount}` : ''}
        &nbsp;|&nbsp; Rolls: ${firstRoll} – ${lastRoll}
        ${subFilter !== 'all' ? ` &nbsp;|&nbsp; Subject: ${subFilter}` : ''}
      </span>
    `;
    block.appendChild(hdr);

    // Blackboard
    const board = document.createElement('div');
    board.className = 'room-board';
    board.textContent = '▬ BLACKBOARD  /  FRONT OF ROOM ▬';
    block.appendChild(board);

    // Seat grid
    const gridWrap = document.createElement('div');
    gridWrap.className = 'seat-grid';

    // Column headers
    const colHdrRow = document.createElement('div');
    colHdrRow.className = 'seat-col-headers';
    colHdrRow.style.gridTemplateColumns = `36px repeat(${cfg.cols}, 1fr)`;
    const emptyHdr = document.createElement('div');
    emptyHdr.className = 'seat-col-label';
    colHdrRow.appendChild(emptyHdr);
    for (let c = 1; c <= cfg.cols; c++) {
      const ch = document.createElement('div');
      ch.className = 'seat-col-label';
      ch.textContent = `Col ${c}`;
      colHdrRow.appendChild(ch);
    }
    gridWrap.appendChild(colHdrRow);

    // Seat rows — stagger-aware physical grid
    const totalPhysR = physRows(cfg);
    const physMapScreen = {};
    roomCands.forEach(s => {
      const pr = physRow(s.row, s.col, cfg.stagger);
      physMapScreen[pr + ',' + s.col] = s;
    });
    for (let r = 1; r <= totalPhysR; r++) {
      const seatRow = document.createElement('div');
      seatRow.className = 'seat-row';
      seatRow.style.gridTemplateColumns = `36px repeat(${cfg.cols}, 1fr)`;

      // Row label
      const rowLbl = document.createElement('div');
      rowLbl.className = 'seat-row-label';
      rowLbl.textContent = `R${r}`;
      seatRow.appendChild(rowLbl);

      for (let col = 1; col <= cfg.cols; col++) {
        // Stagger X cell
        if (isXCell(r, col, cfg)) {
          const xDiv = document.createElement('div');
          xDiv.className = 'seat vacant';
          xDiv.style.cssText = 'background-image:linear-gradient(to bottom right,transparent calc(50% - 0.7px),#888 calc(50% - 0.7px),#888 calc(50% + 0.7px),transparent calc(50% + 0.7px)),linear-gradient(to bottom left,transparent calc(50% - 0.7px),#888 calc(50% - 0.7px),#888 calc(50% + 0.7px),transparent calc(50% + 0.7px));opacity:0.5;';
          xDiv.innerHTML = '<div class="seat-num">×</div>';
          seatRow.appendChild(xDiv);
          continue;
        }
        const cand = physMapScreen[r + ',' + col];
        const seatNo = cand ? cand.seatInRoom : '—';
        const seatDiv = document.createElement('div');
        seatDiv.className = 'seat';

        const candHasSub = !cand ? false :
          subFilter === 'all' ||
          (cand.dateSubjects[ds]||[]).some(x => x.code === subFilter);

        if (!cand) {
          seatDiv.classList.add('vacant');
          seatDiv.innerHTML = `<div class="seat-num">${seatNo}</div><div class="seat-vacant-lbl">—</div>`;
        } else if (subFilter !== 'all' && !candHasSub && cfg.showVacant) {
          seatDiv.classList.add('vacant');
          seatDiv.innerHTML = `<div class="seat-num">${seatNo}</div><div class="seat-vacant-lbl">—</div>`;
        } else if (cand) {
          seatDiv.classList.add(cand.class === 'X' ? 'occupied-x' : 'occupied-xii');
          const schDisplay = cand.schoolCode === '99999' ? 'Pvt' : cand.schoolCode;
          seatDiv.innerHTML = `
            <div class="seat-num">${seatNo} · <span class="${cand.class === 'X' ? 'cls-x' : 'cls-xii'}">${cand.class}</span></div>
            <div class="seat-roll">${cand.roll}</div>
            <div class="seat-name">${cand.name.split(' ').slice(0,2).join(' ')}</div>
            <div class="seat-sch">${schDisplay}</div>
          `;
          seatDiv.title = `${cand.roll} — ${cand.name}\n${cand.father}\nSchool: ${cand.schoolCode}\nSeat: R${r}-C${col}`;
        }
        seatRow.appendChild(seatDiv);
      }
      gridWrap.appendChild(seatRow);
    }
    block.appendChild(gridWrap);
    container.appendChild(block);
  }
}
// ── SUMMARY STATE ──────────────────────────────────────────────
export let summaryView = 'compact';
export let summaryDate = 'all';   // 'all' or specific date string
export function setSummaryDate(v) { summaryDate = v; } // [added: cross-module writer, see generateSeating() in seating.js]
export function setSummaryView(v) {
  summaryView = v;
  ['compact','both','consolidated','subject'].forEach(x => {
    const btn = document.getElementById('view-btn-' + x);
    if (btn) btn.className = 'btn btn-sm ' + (x === v ? 'btn-primary' : 'btn-outline');
  });
  buildScheduleTable();
}
export function buildSummaryDateTabs() {
  const container = document.getElementById('summary-date-tabs');
  if (!container || !state.allDates.length) return;
  container.innerHTML = '';

  // "All Dates" tab
  const allTab = document.createElement('div');
  allTab.className = 'date-tab' + (summaryDate === 'all' ? ' active' : '');
  allTab.dataset.sdate = 'all';
  allTab.onclick = () => selectSummaryDate('all');
  const totalCands = Object.values(state.seating).reduce((s,a)=>s+a.length,0);
  allTab.innerHTML = `<span class="dt-date">All Dates</span><span class="dt-cnt">${state.allDates.length} days</span>`;
  container.appendChild(allTab);

  // One tab per date
  state.allDates.forEach(ds => {
    const seated = state.seating[ds] || [];
    if (!seated.length) return;
    const tab = document.createElement('div');
    tab.className = 'date-tab' + (summaryDate === ds ? ' active' : '');
    tab.dataset.sdate = ds;
    tab.onclick = () => selectSummaryDate(ds);
    // Short date: "17-Feb"
    const shortDate = ds.slice(0, 6);
    const nX   = seated.filter(s => s.class === 'X').length;
    const nXII = seated.filter(s => s.class === 'XII').length;
    const tag  = nX && nXII ? 'X+XII' : nX ? 'X' : 'XII';
    tab.innerHTML = `<span class="dt-date">${shortDate}</span><span class="dt-cnt">${seated.length} · ${tag}</span>`;
    container.appendChild(tab);
  });
}
export function selectSummaryDate(ds) {
  summaryDate = ds;
  // Update active tab
  document.querySelectorAll('#summary-date-tabs .date-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.sdate === ds);
  });
  buildScheduleTable();
}
// ── SCHEDULE / SUMMARY TABLE ────────────────────────────────────
export function buildScheduleTable() {
  const cfg  = getConfig();
  const out  = document.getElementById('summary-output');
  if (!out) return;
  out.innerHTML = '';
  if (!state.allDates.length) {
    out.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No data generated yet</div></div>';
    return;
  }

  // Build / refresh date tabs
  buildSummaryDateTabs();

  // Filter dates based on selection
  const datesToShow = summaryDate === 'all' ? state.allDates : [summaryDate];

  const centreName = document.getElementById('cfg-centre-name').value || 'Centre';
  const centreCode = document.getElementById('cfg-centre-code').value || '';

  // ── Header block ──
  const hdrDiv = document.createElement('div');
  hdrDiv.style.cssText = 'background:var(--navy);color:#fff;padding:14px 20px;margin-bottom:0;';
  hdrDiv.innerHTML = `
    <div style="font-family:"Syne",sans-serif;font-size:15px;font-weight:700;">
      CBSE BOARD EXAM 2026 — CENTRE SEATING PLAN SUMMARY
    </div>
    <div style="font-family:"DM Mono",monospace;font-size:11px;color:rgba(255,255,255,0.55);margin-top:4px;">
      Centre: ${centreCode}  |  ${centreName}  |  Layout: ${cfg.rows}R × ${cfg.cols}C = ${cfg.perRoom}/room
    </div>`;
  out.appendChild(hdrDiv);

  datesToShow.forEach(ds => {
    const allSeated = state.seating[ds] || [];
    if (!allSeated.length) return;
    const nX   = allSeated.filter(s => s.class === 'X').length;
    const nXII = allSeated.filter(s => s.class === 'XII').length;
    const totalRooms = Math.ceil(allSeated.length / cfg.perRoom);

    // Collect subjects on this date
    const subMap = {}; // code → {name, class, cands[]}
    allSeated.forEach(s => {
      (s.dateSubjects[ds] || []).forEach(sub => {
        const key = s.class + '|' + sub.code;
        if (!subMap[key]) subMap[key] = { code: sub.code, name: sub.name, cls: s.class, cands: [] };
        subMap[key].cands.push(s);
      });
    });
    const subEntries = Object.values(subMap).sort((a,b) =>
      a.cls.localeCompare(b.cls) || a.code.localeCompare(b.code));

    // ── Date section wrapper ──
    const dateSection = document.createElement('div');
    dateSection.style.cssText = 'margin-bottom:32px;border:1px solid var(--border);';

    // Date header
    const dateHdr = document.createElement('div');
    dateHdr.style.cssText = 'background:#1a3a6a;color:#fff;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;';
    dateHdr.innerHTML = `
      <span style="font-family:"Syne",sans-serif;font-size:14px;font-weight:700;">
        ${ds} &nbsp;—&nbsp; ${dayName(ds)}
      </span>
      <span style="font-family:"DM Mono",monospace;font-size:11px;color:rgba(255,255,255,0.6);">
        ${nX ? 'X: ' + nX : ''}${nX && nXII ? '  |  ' : ''}${nXII ? 'XII: ' + nXII : ''}
        &nbsp;&nbsp;Total: ${allSeated.length}  &nbsp;|&nbsp;  Rooms: ${totalRooms}
      </span>`;
    dateSection.appendChild(dateHdr);

    // ══════════════════════════════════════════════════════════════
    // PART 0 — COMPACT SUMMARY (image format: Room | Subject | From | To | Total)
    // ══════════════════════════════════════════════════════════════
    if (summaryView === 'compact') {
      const compactDiv = document.createElement('div');

      // Helper: labelled section header
      const mkHdr = (text, bg, border, color) => {
        const d = document.createElement('div');
        d.style.cssText = `background:${bg};border-left:4px solid ${border};padding:7px 14px;font-family:"DM Mono",monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${color};margin-bottom:8px;font-weight:600;`;
        d.textContent = text;
        return d;
      };
      const mkSpacer = () => { const d=document.createElement('div'); d.style.cssText='height:24px;border-top:2px dashed var(--border);margin:20px 0 16px;'; return d; };

      // ── SECTION 1: CBSE Format — Room | Subject | From | To | Total (one row per subject per room) ──
      compactDiv.appendChild(mkHdr('PLAN SUMMARY — CBSE FORMAT (Room / Subject / Roll Range)', '#e8f0fe', '#1a50d4', '#1a50d4'));
      compactDiv.appendChild(buildConsolidatedCompactTable(allSeated, ds, cfg));

      // ── SECTION 2: Detailed Format — Room | Roll From | Roll To | Class X | Class XII | Total | Subjects ──
      compactDiv.appendChild(mkSpacer());
      compactDiv.appendChild(mkHdr('DETAILED SUMMARY — CLASS-WISE BREAKDOWN (Room / Class X / Class XII / Total)', '#f0fdf4', '#059669', '#065f46'));
      compactDiv.appendChild(buildRoomTable(allSeated, ds, cfg, null, null));

      // ── SECTION 3: Per-subject individual plans ──
      const subjectsOnDate = {};
      allSeated.forEach(s => {
        (s.dateSubjects[ds]||[]).forEach(sub => {
          const key = s.class + '|' + sub.code;
          if (!subjectsOnDate[key]) subjectsOnDate[key] = {code:sub.code, name:sub.name, cls:s.class};
        });
      });
      if (Object.keys(subjectsOnDate).length > 0) {
        compactDiv.appendChild(mkSpacer());
        compactDiv.appendChild(mkHdr('INDIVIDUAL CLASS / SUBJECT PLANS', '#fef3c7', '#f59e0b', '#92680a'));
        compactDiv.appendChild(buildCompactTable(allSeated, ds, cfg));
      }

      dateSection.appendChild(compactDiv);
    }

    // ══════════════════════════════════════════════════════════════
    // PART 1 — CONSOLIDATED SUMMARY (all classes/subjects combined)
    // ══════════════════════════════════════════════════════════════
    if (summaryView === 'both' || summaryView === 'consolidated') {
      const consoWrap = document.createElement('div');
      consoWrap.style.cssText = 'border-bottom:1px solid var(--border);';

      const consoHdr = document.createElement('div');
      consoHdr.style.cssText = 'background:var(--bg);padding:7px 16px;font-family:"DM Mono",monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border);';
      consoHdr.textContent = 'CONSOLIDATED — ALL CLASSES / SUBJECTS COMBINED';
      consoWrap.appendChild(consoHdr);

      const consoTable = buildRoomTable(allSeated, ds, cfg, null, null);
      consoWrap.appendChild(consoTable);
      dateSection.appendChild(consoWrap);
    }

    // ══════════════════════════════════════════════════════════════
    // PART 2 — INDIVIDUAL SUBJECT SUMMARIES
    // ══════════════════════════════════════════════════════════════
    if (summaryView === 'both' || summaryView === 'subject') {
      if (subEntries.length > 0) {
        const subSection = document.createElement('div');

        const subHdrDiv = document.createElement('div');
        subHdrDiv.style.cssText = 'background:var(--bg);padding:7px 16px;font-family:"DM Mono",monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border);border-top:2px solid var(--accent);';
        subHdrDiv.textContent = 'INDIVIDUAL CLASS / SUBJECT PLANS';
        subSection.appendChild(subHdrDiv);

        subEntries.forEach((sub, si) => {
          // For this subject: find which seats on this date belong to this subject
          // In the consolidated seating, each seat keeps their original room/seat
          // For subject plan: show same rooms but mark non-subject candidates as vacant
          const subDiv = document.createElement('div');
          subDiv.style.cssText = (si < subEntries.length - 1) ? 'border-bottom:1px solid var(--border);' : '';

          const subLabel = document.createElement('div');
          const clsTag = sub.cls === 'X'
            ? '<span style="background:rgba(5,150,105,0.15);color:var(--green);font-size:10px;padding:1px 7px;border-radius:2px;">Class X</span>'
            : '<span style="background:rgba(26,80,212,0.12);color:var(--blue);font-size:10px;padding:1px 7px;border-radius:2px;">Class XII</span>';
          subLabel.style.cssText = 'padding:6px 16px;background:#fafaf8;display:flex;align-items:center;gap:10px;font-family:"DM Mono",monospace;font-size:12px;color:var(--text);border-bottom:1px solid var(--border);';
          subLabel.innerHTML = `${clsTag} <strong>${sub.code}</strong> — ${sub.name} &nbsp;<span style="color:var(--muted)">(${sub.cands.length} candidates)</span>`;
          subDiv.appendChild(subLabel);

          // Build subject-specific table: same room numbers as consolidated
          // but only show candidates with this subject; others shown as vacant in count
          const subTable = buildRoomTable(allSeated, ds, cfg, sub.code, sub.cls);
          subDiv.appendChild(subTable);
          subSection.appendChild(subDiv);
        });
        dateSection.appendChild(subSection);
      }
    }

    out.appendChild(dateSection);
  });
}
// ── BUILD CONSOLIDATED COMPACT TABLE (all classes/subjects in one table) ─
// Same CBSE format: Room No | Subject(s) | Roll From | Roll To | Total
// One row per room — Roll From/To covers ALL candidates in that room
export function buildConsolidatedCompactTable(allSeated, ds, cfg) {
  // When a room has multiple subjects: one row per subject with that subject's roll range
  // Same room number repeated for each subject row (like the sample image)
  const totalRooms = Math.ceil(allSeated.length / cfg.perRoom);

  const tbl = document.createElement('table');
  tbl.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;margin-bottom:0;';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th rowspan="2" style="border:2px solid #333;padding:8px 12px;text-align:center;vertical-align:middle;background:#fff;font-size:13px;font-weight:700;width:80px;">Room No.</th>
      <th rowspan="2" style="border:2px solid #333;padding:8px 12px;text-align:center;vertical-align:middle;background:#fff;font-size:13px;font-weight:700;">Subject</th>
      <th colspan="3" style="border:2px solid #333;padding:6px 12px;text-align:center;background:#fff;font-size:13px;font-weight:700;">Roll No.</th>
    </tr>
    <tr>
      <th style="border:2px solid #333;padding:6px 12px;text-align:center;background:#fff;font-size:12px;font-weight:700;width:130px;">From</th>
      <th style="border:2px solid #333;padding:6px 12px;text-align:center;background:#fff;font-size:12px;font-weight:700;width:130px;">To</th>
      <th style="border:2px solid #333;padding:6px 12px;text-align:center;background:#fff;font-size:12px;font-weight:700;width:70px;">Total</th>
    </tr>`;
  tbl.appendChild(thead);

  const tbody = document.createElement('tbody');
  let grandTotal = 0;
  // Track per-subject totals across rooms for the grand total row
  const subTotals = {};   // key → {label, total}

  for (let room = 1; room <= totalRooms; room++) {
    const rc = allSeated.filter(s => s.roomNo === room)
                        .sort((a,b) => a.roll.localeCompare(b.roll));
    if (!rc.length) continue;

    // Collect ordered unique subjects using PRIMARY subject of each candidate
    const subOrder = [];
    const subSeen  = new Set();
    rc.forEach(s => {
      const first = (s.dateSubjects[ds]||[])[0];
      if (first && !subSeen.has(first.code)) {
        subSeen.add(first.code);
        subOrder.push({code: first.code, name: first.name});
      }
    });

    const numSubs = subOrder.length;
    grandTotal += rc.length;

    subOrder.forEach((sub, si) => {
      // Candidates in this room with this subject
      const subCands = rc.filter(s => {
        const first = (s.dateSubjects[ds]||[])[0];
        return first && first.code === sub.code;
      }).sort((a,b) => a.roll.localeCompare(b.roll));

      if (!subCands.length) return;

      const rollFrom = subCands[0].roll;
      const rollTo   = subCands[subCands.length - 1].roll;
      const total    = subCands.length;
      const label    = sub.code + '-' + sub.name.toUpperCase().slice(0,16);

      // Track grand totals per subject
      if (!subTotals[sub.code]) subTotals[sub.code] = { label, total: 0 };
      subTotals[sub.code].total += total;

      const hasX   = subCands.some(s => s.class === 'X');
      const hasXII = subCands.some(s => s.class === 'XII');
      const bg = hasX && hasXII ? '#fff' : hasX ? '#f0fff4' : '#eff6ff';

      // Room number cell: only show on first subject row for this room, span the rest
      const tr = document.createElement('tr');
      tr.style.background = bg;

      // Border style: top border heavier on first sub-row of each room
      const topBorder = si === 0 ? '2px solid #666' : '1px dashed #ccc';
      const botBorder = si === numSubs - 1 ? '2px solid #666' : '1px dashed #ccc';

      tr.innerHTML = `
        <td style="border-left:2px solid #999;border-right:1px solid #999;border-top:${topBorder};border-bottom:${botBorder};padding:7px 10px;text-align:center;font-weight:700;font-size:15px;vertical-align:middle;">${si === 0 ? room : ''}</td>
        <td style="border:1px solid #999;border-top:${topBorder};border-bottom:${botBorder};padding:7px 10px;text-align:center;font-size:11px;font-weight:600;color:#333;">${label}</td>
        <td style="border:1px solid #999;border-top:${topBorder};border-bottom:${botBorder};padding:7px 10px;text-align:center;font-family:monospace;font-size:13px;">${rollFrom}</td>
        <td style="border:1px solid #999;border-top:${topBorder};border-bottom:${botBorder};padding:7px 10px;text-align:center;font-family:monospace;font-size:13px;">${rollTo}</td>
        <td style="border:1px solid #999;border-top:${topBorder};border-bottom:${botBorder};padding:7px 10px;text-align:center;font-weight:700;font-size:15px;">${total}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Totals row
  const subSummary = Object.values(subTotals).map(s => s.label + ': ' + s.total).join(' | ');
  const totTr = document.createElement('tr');
  totTr.style.cssText = 'background:#1a3a6a;font-weight:800;';
  totTr.innerHTML = `
    <td style="border:2px solid #333;padding:8px 10px;text-align:center;font-size:13px;font-weight:800;color:#f59e0b;">TOTAL</td>
    <td style="border:2px solid #333;padding:8px 10px;text-align:center;font-size:10px;color:rgba(255,255,255,0.6);">${totalRooms} rooms &nbsp;|&nbsp; ${subSummary}</td>
    <td style="border:2px solid #333;" colspan="2"></td>
    <td style="border:2px solid #333;padding:8px 10px;text-align:center;font-size:18px;font-weight:800;color:#fff;">${grandTotal}</td>
  `;
  tbody.appendChild(totTr);
  tbl.appendChild(tbody);
  return tbl;
}
// ── BUILD COMPACT SUMMARY TABLE (matches official CBSE format) ─
// One row per room per subject: Room No | Subject | Roll From | Roll To | Total
export function buildCompactTable(allSeated, ds, cfg) {
  const totalRooms = Math.ceil(allSeated.length / cfg.perRoom);

  // Collect all subject+class combinations present on this date
  const subMap = {};
  allSeated.forEach(s => {
    const first = (s.dateSubjects[ds] || [])[0];
    if (first) {
      const key = s.class + '|' + first.code;
      if (!subMap[key]) subMap[key] = { code: first.code, name: first.name, cls: s.class };
    }
  });
  const subjects = Object.values(subMap).sort((a,b) =>
    a.cls.localeCompare(b.cls) || a.code.localeCompare(b.code));

  const wrap = document.createElement('div');
  wrap.style.cssText = 'overflow-x:auto;padding:0;';

  // If only one subject (or consolidated) — show simple Room|Subject|From|To|Total
  // If multiple subjects — show one block per subject (like the sample image)
  const blocks = subjects.length === 0
    ? [{ code: 'ALL', name: 'All Subjects', cls: '', cands: allSeated }]
    : subjects.map(sub => ({
        ...sub,
        cands: allSeated.filter(s => {
          if (s.class !== sub.cls) return false;
          const first = (s.dateSubjects[ds] || [])[0];
          return first && first.code === sub.code;
        })
      }));

  blocks.forEach((sub, bi) => {
    // Build per-room rows for this subject
    // Use the original room assignments (from consolidated seating)
    // Find which rooms contain candidates of this subject
    const roomsWithSub = new Set(sub.cands.map(s => s.roomNo));
    const roomList = [...roomsWithSub].sort((a,b) => a-b);

    if (!roomList.length) return;

    // Table wrapper
    const tbl = document.createElement('table');
    tbl.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;margin-bottom:' + (bi < blocks.length-1 ? '20px' : '0') + ';';

    // ── Header matching the sample image exactly ──
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th rowspan="2" style="border:2px solid #333;padding:8px 12px;text-align:center;vertical-align:middle;background:#fff;font-size:13px;font-weight:700;width:80px;">Room No.</th>
        <th rowspan="2" style="border:2px solid #333;padding:8px 12px;text-align:center;vertical-align:middle;background:#fff;font-size:13px;font-weight:700;width:120px;">Subject</th>
        <th colspan="3" style="border:2px solid #333;padding:6px 12px;text-align:center;background:#fff;font-size:13px;font-weight:700;">Roll No.</th>
      </tr>
      <tr>
        <th style="border:2px solid #333;padding:6px 12px;text-align:center;background:#fff;font-size:12px;font-weight:700;">From</th>
        <th style="border:2px solid #333;padding:6px 12px;text-align:center;background:#fff;font-size:12px;font-weight:700;">To</th>
        <th style="border:2px solid #333;padding:6px 12px;text-align:center;background:#fff;font-size:12px;font-weight:700;">Total</th>
      </tr>`;
    tbl.appendChild(thead);

    const tbody = document.createElement('tbody');
    let grandFrom = '', grandTo = '', grandTotal = 0;

    roomList.forEach((roomNo, ri) => {
      const roomSubCands = sub.cands.filter(s => s.roomNo === roomNo)
        .sort((a,b) => a.roll.localeCompare(b.roll));
      if (!roomSubCands.length) return;

      const rollFrom = roomSubCands[0].roll;
      const rollTo   = roomSubCands[roomSubCands.length - 1].roll;
      const total    = roomSubCands.length;
      grandTotal += total;
      if (!grandFrom || rollFrom < grandFrom) grandFrom = rollFrom;
      if (rollTo > grandTo) grandTo = rollTo;

      const subLabel = sub.cls
        ? `${sub.code}-${sub.name.toUpperCase().slice(0,14)}`
        : sub.code;
      const clsBg = sub.cls === 'X' ? '#f0fff4' : sub.cls === 'XII' ? '#eff6ff' : '#fff';

      const tr = document.createElement('tr');
      tr.style.background = clsBg;
      tr.innerHTML = `
        <td style="border:1px solid #999;padding:7px 10px;text-align:center;font-weight:700;font-size:14px;">${roomNo}</td>
        <td style="border:1px solid #999;padding:7px 10px;text-align:center;font-size:11px;font-weight:600;color:#333;">${subLabel}</td>
        <td style="border:1px solid #999;padding:7px 10px;text-align:center;font-family:monospace;font-size:13px;">${rollFrom}</td>
        <td style="border:1px solid #999;padding:7px 10px;text-align:center;font-family:monospace;font-size:13px;">${rollTo}</td>
        <td style="border:1px solid #999;padding:7px 10px;text-align:center;font-weight:700;font-size:14px;">${total}</td>
      `;
      tbody.appendChild(tr);
    });

    // Totals row
    const totTr = document.createElement('tr');
    totTr.style.cssText = 'background:#f5f5f0;font-weight:700;';
    totTr.innerHTML = `
      <td style="border:2px solid #333;padding:7px 10px;text-align:center;font-size:13px;font-weight:800;">TOTAL</td>
      <td style="border:2px solid #333;padding:7px 10px;text-align:center;font-size:11px;color:#666;">${sub.cls ? sub.cls + ' · ' + sub.code : ''}</td>
      <td style="border:2px solid #333;padding:7px 10px;text-align:center;font-family:monospace;font-size:11px;color:#666;">${grandFrom}</td>
      <td style="border:2px solid #333;padding:7px 10px;text-align:center;font-family:monospace;font-size:11px;color:#666;">${grandTo}</td>
      <td style="border:2px solid #333;padding:7px 10px;text-align:center;font-size:16px;color:#0c1c35;">${grandTotal}</td>
    `;
    tbody.appendChild(totTr);
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
  });

  return wrap;
}
// ── BUILD ROOM SUMMARY TABLE ────────────────────────────────────
// allSeated: all candidates on this date (with consolidated room assignments)
// subCode + subCls: if set, filter to only this subject — others shown as vacant
export function buildRoomTable(allSeated, ds, cfg, subCode, subCls) {
  const totalRooms = Math.ceil(allSeated.length / cfg.perRoom);

  const tableWrap = document.createElement('div');
  tableWrap.style.cssText = 'overflow-x:auto;';

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12.5px;';

  // Header
  const thead = document.createElement('thead');
  const isFiltered = !!subCode;
  thead.innerHTML = `<tr>
    <th style="background:#2a3a5a;color:rgba(255,255,255,0.75);font-family:"DM Mono",monospace;font-size:10px;letter-spacing:1px;padding:9px 14px;text-align:left;white-space:nowrap;">Room No</th>
    <th style="background:#2a3a5a;color:rgba(255,255,255,0.75);font-family:"DM Mono",monospace;font-size:10px;letter-spacing:1px;padding:9px 14px;text-align:left;">Roll No From</th>
    <th style="background:#2a3a5a;color:rgba(255,255,255,0.75);font-family:"DM Mono",monospace;font-size:10px;letter-spacing:1px;padding:9px 14px;text-align:left;">Roll No To</th>
    <th style="background:#2a3a5a;color:rgba(255,255,255,0.75);font-family:"DM Mono",monospace;font-size:10px;letter-spacing:1px;padding:9px 14px;text-align:center;">${isFiltered ? 'This Subject' : 'Class X'}</th>
    <th style="background:#2a3a5a;color:rgba(255,255,255,0.75);font-family:"DM Mono",monospace;font-size:10px;letter-spacing:1px;padding:9px 14px;text-align:center;">${isFiltered ? 'Vacant (Other)' : 'Class XII'}</th>
    <th style="background:#2a3a5a;color:rgba(255,255,255,0.75);font-family:"DM Mono",monospace;font-size:10px;letter-spacing:1px;padding:9px 14px;text-align:center;">Total in Room</th>
    <th style="background:#2a3a5a;color:rgba(255,255,255,0.75);font-family:"DM Mono",monospace;font-size:10px;letter-spacing:1px;padding:9px 14px;text-align:left;">Subjects in Room</th>
  </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  let grandA = 0, grandB = 0, grandTotal = 0;
  let grandRollFrom = '', grandRollTo = '';

  for (let room = 1; room <= totalRooms; room++) {
    const roomCands = allSeated.filter(s => s.roomNo === room);
    if (!roomCands.length) continue;

    let colA, colB, total, rollFrom, rollTo;
    const subjectsInRoom = new Set();

    if (!isFiltered) {
      // Consolidated view
      colA  = roomCands.filter(s => s.class === 'X').length;
      colB  = roomCands.filter(s => s.class === 'XII').length;
      total = roomCands.length;
      roomCands.forEach(s => (s.dateSubjects[ds]||[]).forEach(x => subjectsInRoom.add(`${x.code}`)));
      rollFrom = roomCands[0].roll;
      rollTo   = roomCands[roomCands.length - 1].roll;
    } else {
      // Subject-specific view: only count candidates with this subject
      const subCands = roomCands.filter(s =>
        s.class === subCls &&
        (s.dateSubjects[ds] || []).some(x => x.code === subCode)
      );
      colA  = subCands.length;             // this subject count
      colB  = roomCands.length - subCands.length; // vacant / other subject count
      total = roomCands.length;            // full room size (for capacity reference)
      subjectsInRoom.add(subCode);
      if (subCands.length) {
        rollFrom = subCands[0].roll;
        rollTo   = subCands[subCands.length - 1].roll;
      } else {
        rollFrom = '—'; rollTo = '—';
      }
    }

    grandA     += colA;
    grandB     += colB;
    grandTotal += isFiltered ? colA : total;
    if (!grandRollFrom || rollFrom < grandRollFrom) grandRollFrom = rollFrom;
    if (rollTo > grandRollTo) grandRollTo = rollTo;

    const alt = room % 2 === 0;
    const tr = document.createElement('tr');
    tr.style.background = alt ? '#fafaf8' : '#ffffff';

    const roomLabel = `Room ${String(room).padStart(2,'0')}`;
    const subsStr = [...subjectsInRoom].join(', ');

    tr.innerHTML = `
      <td style="padding:8px 14px;border-bottom:1px solid var(--border);">
        <span style="background:var(--navy);color:var(--accent);font-family:"DM Mono",monospace;font-size:11px;padding:2px 8px;border-radius:2px;font-weight:500;">${roomLabel}</span>
      </td>
      <td style="padding:8px 14px;border-bottom:1px solid var(--border);font-family:"DM Mono",monospace;font-size:12px;">${rollFrom}</td>
      <td style="padding:8px 14px;border-bottom:1px solid var(--border);font-family:"DM Mono",monospace;font-size:12px;">${rollTo}</td>
      <td style="padding:8px 14px;border-bottom:1px solid var(--border);text-align:center;font-weight:600;color:${isFiltered ? 'var(--green)' : 'var(--green)'};">${colA || '—'}</td>
      <td style="padding:8px 14px;border-bottom:1px solid var(--border);text-align:center;color:${isFiltered ? 'var(--muted)' : 'var(--blue)'};font-weight:${isFiltered ? '400' : '600'};">${colB || '—'}</td>
      <td style="padding:8px 14px;border-bottom:1px solid var(--border);text-align:center;font-weight:700;color:var(--navy);">${isFiltered ? colA : total}</td>
      <td style="padding:8px 14px;border-bottom:1px solid var(--border);font-family:"DM Mono",monospace;font-size:11px;color:var(--muted);">${subsStr}</td>
    `;
    tbody.appendChild(tr);
  }

  // Totals row
  const totTr = document.createElement('tr');
  totTr.style.cssText = 'background:var(--navy);font-weight:700;';
  totTr.innerHTML = `
    <td style="padding:9px 14px;font-family:"Syne",sans-serif;font-size:12px;color:var(--accent);">TOTAL</td>
    <td style="padding:9px 14px;font-family:"DM Mono",monospace;font-size:11px;color:rgba(255,255,255,0.5);">${grandRollFrom || '—'}</td>
    <td style="padding:9px 14px;font-family:"DM Mono",monospace;font-size:11px;color:rgba(255,255,255,0.5);">${grandRollTo || '—'}</td>
    <td style="padding:9px 14px;text-align:center;color:${isFiltered ? '#6ee7b7' : '#6ee7b7'};font-size:14px;">${grandA}</td>
    <td style="padding:9px 14px;text-align:center;color:${isFiltered ? 'rgba(255,255,255,0.4)' : '#93c5fd'};font-size:14px;">${grandB}</td>
    <td style="padding:9px 14px;text-align:center;color:#fff;font-size:16px;">${grandTotal}</td>
    <td style="padding:9px 14px;"></td>
  `;
  tbody.appendChild(totTr);

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  return tableWrap;
}
// printSummary defined in buildPrintFrame block above

// ── CANDIDATES TABLE ───────────────────────────────────────────
export let candidateRows = []; // cache for filtering
export function buildCandidatesTable() {
  candidateRows = [];

  state.allDates.forEach(ds => {
    const seated = state.seating[ds] || [];
    seated.forEach(s => {
      const derivedSubjects = formatSubjectsForDate(s, ds);
      const subjectsToday = (s.subjectsToday && String(s.subjectsToday).trim()) || derivedSubjects || '—';
      candidateRows.push({ ...s, date: ds, subjectsToday });
    });
  });

  document.getElementById('cand-sub').textContent =
    `${candidateRows.length} total rows (${state.candidates.length} candidates × exam dates)`;
  document.getElementById('badge-cands').textContent = state.candidates.length;
  filterCandidates();
  populateAttFilters();
}
// ── ATT VIEW STATE ─────────────────────────────────────────────
export let currentAttTab = 'list';
export function switchAttTab(tab) {
  currentAttTab = tab;
  ['list','pivoted','summary'].forEach(t => {
    const btn = document.getElementById('att-tab-' + t);
    const view = document.getElementById('att-view-' + t);
    const active = t === tab;
    if(btn) { btn.style.background = active ? '#1a50d4' : 'var(--card)';
               btn.style.color = active ? '#fff' : 'var(--text-muted)';
               btn.style.fontWeight = active ? '600' : '400'; }
    if(view) view.style.display = active ? '' : 'none';
  });
  refreshAttView();
}
export function populateAttFilters() {
  if (!state.candidates || !state.candidates.length) return;

  // Dates
  const dateSel = document.getElementById('filter-att-date');
  if (dateSel && dateSel.options.length <= 1) {
    const dates = sortDates([...new Set(state.candidates.flatMap(c => Object.keys(c.dateSubjects)))]);
    dates.forEach(ds => { const o = document.createElement('option'); o.value=ds; o.textContent=ds; dateSel.appendChild(o); });
  }

  // Subjects
  const subSel = document.getElementById('filter-att-subject');
  if (subSel && subSel.options.length <= 1) {
    const subMap = {};
    state.candidates.forEach(c => Object.values(c.dateSubjects).forEach(subs => subs.forEach(s => subMap[s.code]=s.name)));
    Object.keys(subMap).sort((a,b)=>Number(a)-Number(b)).forEach(code => {
      const o = document.createElement('option'); o.value=code;
      o.textContent = code + ' – ' + subMap[code]; subSel.appendChild(o);
    });
  }

  // Schools
  const schSel = document.getElementById('filter-att-school');
  if (schSel && schSel.options.length <= 1) {
    const schools = [...new Map(state.candidates.map(c=>[c.schoolCode, c.schoolName])).entries()]
      .sort((a,b)=>a[0].localeCompare(b[0]));
    schools.forEach(([code,name]) => {
      const o = document.createElement('option'); o.value=code;
      o.textContent = code + (name ? ' – ' + name.slice(0,25) : ''); schSel.appendChild(o);
    });
  }
}
export function getAttFilters() {
  return {
    cls:      (document.getElementById('filter-class')||{}).value || '',
    ds:       (document.getElementById('filter-att-date')||{}).value || '',
    subCode:  (document.getElementById('filter-att-subject')||{}).value || '',
    school:   (document.getElementById('filter-att-school')||{}).value || '',
    absentOnly: (document.getElementById('filter-att-absent')||{}).checked || false,
    search:   ((document.getElementById('filter-search')||{}).value||'').toLowerCase(),
  };
}
export function getAttForRollDate(roll, ds) {
  const a = (state.dateStates[ds] && state.dateStates[ds].attendance) || {};
  return a[roll] === 'A' ? 'A' : 'P';
}
export function refreshAttView() {
  if (currentAttTab === 'list')     renderAttList();
  else if (currentAttTab === 'pivoted') renderAttPivoted();
  else if (currentAttTab === 'summary') renderAttSummary();
}
export function filterCandidateRows(rows, f) {
  let filtered = rows.filter(r =>
    (!f.cls    || r.class === f.cls) &&
    (!f.search || r.roll.includes(f.search) || r.name.toLowerCase().includes(f.search)) &&
    (!f.ds     || r.date === f.ds) &&
    (!f.school || r.schoolCode === f.school)
  );
  if (f.subCode) filtered = filtered.filter(r => (r.subjectsToday || '').includes(f.subCode));
  if (f.absentOnly) filtered = filtered.filter(r => getAttForRollDate(r.roll, r.date) === 'A');
  return filtered;
}
export function candidateRowHTML(s, att, isA) {
  return `
      <td><span class="${s.class === 'X' ? 'cls-x' : 'cls-xii'}">${s.class}</span></td>
      <td style="font-family:'DM Mono',monospace;${isA?'color:#c00;font-weight:bold;':''}">${s.roll}</td>
      <td>${s.name}</td>
      <td style="color:var(--muted);font-size:12px">${s.mother}</td>
      <td style="color:var(--muted);font-size:12px">${s.father}</td>
      <td style="text-align:center">${s.sex}</td>
      <td style="text-align:center">${s.cat}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${s.schoolCode==='99999'?'Pvt':s.schoolCode}</td>
      <td style="font-size:12px">${s.date}</td>
      <td><span class="room-badge">R${s.roomNo}</span></td>
      <td><span class="seat-badge">${s.seatLabel}</span></td>
      <td style="font-size:11px;font-family:'DM Mono',monospace;max-width:200px">${s.subjectsToday || '—'}</td>
      <td style="text-align:center;font-weight:bold;${isA?'color:#c00;':'color:#166534;'}">${att}</td>
    `;
}
// ── TAB 1: Candidate List (existing behaviour, filter-aware) ──
export function filterCandidates() { renderAttList(); }
export function renderAttList() {
  const f = getAttFilters();
  const tbody = document.getElementById('candidates-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = filterCandidateRows(candidateRows, f);

  const count = document.getElementById('att-count');
  if(count) count.textContent = filtered.length + ' rows';

  filtered.slice(0, 500).forEach(s => {
    const att = getAttForRollDate(s.roll, s.date);
    const isA = att === 'A';
    const tr = document.createElement('tr');
    if (isA) tr.style.cssText = 'background:#fff5f5;';
    tr.innerHTML = candidateRowHTML(s, att, isA);
    tbody.appendChild(tr);
  });
  if (filtered.length > 500) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="13" style="text-align:center;color:var(--muted);font-size:11px;padding:12px">
      Showing 500 of ${filtered.length} rows. Use filters to narrow down.</td>`;
    tbody.appendChild(tr);
  }
}
// ── TAB 2: CBSE Pivoted Sheet View ──
export function renderAttPivoted() {
  const f = getAttFilters();
  const table = document.getElementById('att-pivoted-table');
  if (!table) return;
  table.innerHTML = '';

  // Determine candidates
  let cands = [...(state.candidates||[])].filter(cand =>
    (!f.cls    || cand.class === f.cls) &&
    (!f.school || cand.schoolCode === f.school) &&
    (!f.search || cand.roll.includes(f.search) || cand.name.toLowerCase().includes(f.search))
  ).sort((a,b)=>a.roll.localeCompare(b.roll));

  // Collect subject codes (filtered by date/subject if set)
  const codeToDate = {};
  const codeToName = {};
  cands.forEach(cand => Object.entries(cand.dateSubjects).forEach(([ds, subs]) =>
    subs.forEach(s => { codeToDate[s.code]=ds; codeToName[s.code]=s.name; })
  ));
  let allCodes = Object.keys(codeToDate).sort((a,b)=>Number(a)-Number(b));
  if (f.ds)      allCodes = allCodes.filter(code => codeToDate[code]===f.ds);
  if (f.subCode) allCodes = allCodes.filter(code => code===f.subCode);

  // Absent-only filter: keep candidates who have at least one absent in visible codes
  if (f.absentOnly) {
    cands = cands.filter(cand => allCodes.some(code => {
      const ds = codeToDate[code];
      const registered = Object.values(cand.dateSubjects).flat().some(s=>s.code===code);
      return registered && ds && getAttForRollDate(cand.roll, ds)==='A';
    }));
  }

  const count = document.getElementById('att-count');
  if(count) count.textContent = cands.length + ' candidates';

  const thS = 'border:1px solid #ccc;padding:5px 4px;font-size:10px;text-align:center;background:#1c3557;color:#fff;white-space:nowrap;position:sticky;top:0;z-index:2;';
  const tdS = 'border:1px solid #ddd;padding:3px 4px;font-size:11px;text-align:center;';

  // Header
  const thead = document.createElement('thead');
  const hdrTr = document.createElement('tr');
  ['ROLL NO.','NAME','CAT',...allCodes.map(code => {
    const ds = codeToDate[code]||'';
    const parts = ds.split('-');
    const shortDate = parts.length>=2 ? parts[0]+'-'+parts[1] : ds;
    return `<span style="font-size:11px;font-weight:bold;">${code}</span><br><span style="font-size:9px;font-weight:normal;">(${shortDate})</span>`;
  })].forEach((h,i) => {
    const th = document.createElement('th');
    th.innerHTML = h;
    th.style.cssText = thS + (i<3?'min-width:'+(i===1?'100':'55')+'px;':'min-width:38px;');
    hdrTr.appendChild(th);
  });
  thead.appendChild(hdrTr);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  cands.slice(0,300).forEach(cand => {
    const registeredCodes = new Set(Object.values(cand.dateSubjects).flat().map(s=>s.code));
    const registeredInSheet = [...registeredCodes].filter(code => allCodes.includes(code));
    const absentAll = registeredInSheet.length > 0 && registeredInSheet.every(code => {
      const ds = codeToDate[code]; return ds && getAttForRollDate(cand.roll, ds) === 'A';
    });

    const tr = document.createElement('tr');
    // Roll
    const rollTd = document.createElement('td');
    rollTd.textContent = cand.roll;
    rollTd.style.cssText = tdS + 'font-family:monospace;font-weight:bold;' + (absentAll?'color:#c00;outline:2px solid #c00;outline-offset:-2px;border-radius:3px;':'');
    tr.appendChild(rollTd);
    // Name
    const nameTd = document.createElement('td');
    nameTd.textContent = cand.name.split(' ').slice(0,2).join(' ');
    nameTd.title = cand.name;
    nameTd.style.cssText = tdS + 'text-align:left;font-size:10px;max-width:100px;overflow:hidden;white-space:nowrap;';
    tr.appendChild(nameTd);
    // Cat
    const catTd = document.createElement('td');
    catTd.textContent = cand.cat||'';
    catTd.style.cssText = tdS + 'font-size:10px;';
    tr.appendChild(catTd);
    // Subject cells
    allCodes.forEach(code => {
      const td = document.createElement('td');
      if (!registeredCodes.has(code)) {
        td.textContent = '...';
        td.style.cssText = tdS + 'color:#ccc;font-size:10px;';
      } else {
        const ds = codeToDate[code];
        const att = ds ? getAttForRollDate(cand.roll, ds) : 'P';
        td.textContent = code;
        td.style.cssText = tdS + 'font-size:10px;font-weight:bold;' +
          (att==='A' ? 'color:#c00;border:2px solid #c00;border-radius:4px;' : 'color:#166534;');
        td.title = codeToName[code]||code;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  if (cands.length > 300) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="${allCodes.length+3}" style="text-align:center;color:var(--muted);font-size:11px;padding:10px;">
      Showing 300 of ${cands.length}. Use filters to narrow down.</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
}
// ── TAB 3: Summary View ──
export function renderAttSummary() {
  const f = getAttFilters();
  const table = document.getElementById('att-summary-table');
  if (!table) return;
  table.innerHTML = '';

  let cands = [...(state.candidates||[])].filter(cand =>
    (!f.cls    || cand.class === f.cls) &&
    (!f.school || cand.schoolCode === f.school) &&
    (!f.search || cand.roll.includes(f.search) || cand.name.toLowerCase().includes(f.search))
  ).sort((a,b) => { if(a.class!==b.class) return a.class==='X'?-1:1; return a.roll.localeCompare(b.roll); });

  // Compute per-candidate stats
  const rows = cands.map(cand => {
    let total=0, absent=0;
    Object.entries(cand.dateSubjects).forEach(([ds, subs]) => {
      if (f.ds && ds!==f.ds) return;
      subs.forEach(s => {
        if (f.subCode && s.code!==f.subCode) return;
        total++;
        if (getAttForRollDate(cand.roll, ds)==='A') absent++;
      });
    });
    return { cand, total, absent, present: total-absent };
  });

  // Absent-only filter
  const filtered = f.absentOnly ? rows.filter(r=>r.absent>0) : rows;
  const count = document.getElementById('att-count');
  if(count) count.textContent = filtered.length + ' candidates';

  const thS = 'border:1px solid #ccc;padding:6px 8px;font-size:11px;background:#1c3557;color:#fff;text-align:center;position:sticky;top:0;z-index:2;white-space:nowrap;';
  const tdS = 'border:1px solid #eee;padding:5px 8px;font-size:12px;';

  const thead = document.createElement('thead');
  const hdrTr = document.createElement('tr');
  ['Class','Roll No','Name','Father','Sex','Cat','School','Total Exams','Present','Absent','% Att'].forEach(h => {
    const th = document.createElement('th'); th.textContent=h; th.style.cssText=thS; hdrTr.appendChild(th);
  });
  thead.appendChild(hdrTr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  filtered.slice(0,500).forEach(({cand, total, present, absent}) => {
    const pct = total>0 ? Math.round(present/total*100) : 100;
    const pctColor = pct<75?'#c00':pct<100?'#b86000':'#166534';
    const tr = document.createElement('tr');
    if(absent>0) tr.style.background='#fff8f8';
    tr.innerHTML = `
      <td style="${tdS}text-align:center;"><span class="${cand.class==='X'?'cls-x':'cls-xii'}">${cand.class}</span></td>
      <td style="${tdS}font-family:monospace;font-weight:bold;">${cand.roll}</td>
      <td style="${tdS}">${cand.name}</td>
      <td style="${tdS}color:var(--muted);font-size:11px;">${cand.father}</td>
      <td style="${tdS}text-align:center;">${cand.sex}</td>
      <td style="${tdS}text-align:center;">${cand.cat||''}</td>
      <td style="${tdS}font-size:11px;">${cand.schoolCode==='99999'?'Private':cand.schoolCode}</td>
      <td style="${tdS}text-align:center;">${total}</td>
      <td style="${tdS}text-align:center;color:#166534;font-weight:bold;">${present}</td>
      <td style="${tdS}text-align:center;color:${absent?'#c00':'#166534'};font-weight:bold;">${absent||'—'}</td>
      <td style="${tdS}text-align:center;font-weight:bold;color:${pctColor};">${pct}%</td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
}
// ── UI HELPERS ─────────────────────────────────────────────────
export const PANEL_META = {
  upload:     { title:'Upload Files',        sub:'Upload CBSE E-Preeksha HTML files to begin' },
  config:     { title:'Configuration',       sub:'Customise seating arrangement parameters' },
  seating:    { title:'Seating Plan',        sub:'Visual room-wise seating grid' },
  candidates: { title:'Candidate List',      sub:'All candidates with seat assignments' },
  schedule:   { title:'Centre Seating Plan Summary', sub:'Consolidated + subject-wise room summaries with roll ranges' },
  export:     { title:'Export Documents',    sub:'Download Excel and PDF reports' },
  datesheet:  { title:'Datesheet Reference', sub:'CBSE Official Revised Datesheet 2026' },
  invigilator: { title:'Invigilator Demand', sub:'School-wise report, requirement input & letter generation' },
};
export function switchPanel(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
  document.getElementById(`panel-${id}`).classList.add('active');
  document.querySelector(`[data-panel="${id}"]`)?.classList.add('active');
  const meta = PANEL_META[id] || {};
  document.getElementById('topbar-title').textContent = meta.title || '';
  document.getElementById('topbar-sub').textContent   = meta.sub   || '';
  if (id === 'invigilator') showInvStep(1); // [folded from legacy switchPanel monkeypatch]
}
export function showModal(title, body) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = body;
  document.getElementById('modal').classList.add('open');
}
export function closeModal() {
  document.getElementById('modal').classList.remove('open');
}
