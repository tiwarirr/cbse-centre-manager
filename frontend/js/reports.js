// ============================================================
// reports.js — extracted from CBSE_Centre_Manager.html (Phase A modular split)
// ============================================================
import { getExamSessionLabel } from './invigilator.js';
import { dayName, formatSubjectsForDate, parseDate, sortDates } from './parser.js';
import { isXCell, physRow, physRows } from './seating.js';
import { getConfig, getDateState, getExamFull, getExamFullUpper, getExamLabel, getExamShort, getExamYear, state } from './state.js';
import { saveToBrowser } from './storage.js';
import { currentDate, currentSubjectFilter, showModal } from './ui.js';

// ── EXCEL EXPORTS ──────────────────────────────────────────────
export function makeWB(sheetName, headers, rows) {
  const wb = XLSX.utils.book_new();
  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  // Column widths
  ws['!cols'] = headers.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}
// ── ATTENDANCE REGISTER EXCEL ──────────────────────────────────
export function exportAttendanceExcel() {
  if (!state.candidates || !state.candidates.length) {
    showModal('No Data', 'Load candidate data first.'); return;
  }

  const centreCode = document.getElementById('cfg-centre-code').value || 'Centre';
  const centreName = document.getElementById('cfg-centre-name').value || '';

  // ── Helpers ──
  function getAtt(roll, ds) {
    const a = (state.dateStates[ds] && state.dateStates[ds].attention) || {};
    const att = (state.dateStates[ds] && state.dateStates[ds].attendance) || {};
    return att[roll] === 'A' ? 'A' : 'P';
  }

  // Build a lookup: roll+ds → seated record (for roomNo, seatLabel)
  const seatLookup = {}; // roll+'|'+ds → {roomNo, seatLabel}
  state.allDates.forEach(ds => {
    (state.seating[ds] || []).forEach(s => {
      seatLookup[s.roll + '|' + ds] = { roomNo: s.roomNo, seatLabel: s.seatLabel };
    });
  });

  const wb = XLSX.utils.book_new();

  // ══════════════════════════════════════════════
  // SHEET 1 & 2: Unpivoted detail (X and XII)
  // ══════════════════════════════════════════════
  ['X','XII'].forEach(cls => {
    const classCands = [...state.candidates.filter(c => c.class === cls)]
      .sort((a,b) => a.roll.localeCompare(b.roll));
    if (!classCands.length) return;

    const headers = [
      'Roll No', 'Name', 'Father', 'Mother', 'Sex', 'Category',
      'Class', 'School Code', 'School Name',
      'Exam Date', 'Day', 'Subject Code', 'Subject Name',
      'Room No', 'Seat Label', 'Attendance'
    ];

    const rows = [];
    classCands.forEach(cand => {
      // Sort dates
      const dates = sortDates(Object.keys(cand.dateSubjects));
      dates.forEach(ds => {
        const subs = cand.dateSubjects[ds] || [];
        subs.forEach(sub => {
          const att    = getAtt(cand.roll, ds);
          const seat   = seatLookup[cand.roll + '|' + ds] || {};
          rows.push([
            cand.roll,
            cand.name,
            cand.father,
            cand.mother,
            cand.sex,
            cand.cat || '',
            cand.class,
            cand.schoolCode,
            cand.schoolName,
            ds,
            dayName(ds),
            sub.code,
            sub.name,
            seat.roomNo || '',
            seat.seatLabel || '',
            att
          ]);
        });
      });
    });

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // ── Column widths ──
    ws['!cols'] = [
      {wch:12}, // Roll No
      {wch:22}, // Name
      {wch:20}, // Father
      {wch:20}, // Mother
      {wch:5},  // Sex
      {wch:8},  // Cat
      {wch:6},  // Class
      {wch:10}, // School Code
      {wch:35}, // School Name
      {wch:14}, // Exam Date
      {wch:10}, // Day
      {wch:10}, // Sub Code
      {wch:28}, // Sub Name
      {wch:8},  // Room No
      {wch:10}, // Seat
      {wch:10}, // Att
    ];

    // ── Style header row ──
    const hdrFill  = { patternType:'solid', fgColor:{rgb:'1C3557'} };
    const hdrFont  = { bold:true, color:{rgb:'FFFFFF'}, name:'Arial', sz:10 };
    const hdrAlign = { horizontal:'center', vertical:'center', wrapText:true };
    headers.forEach((h, ci) => {
      const cellRef = XLSX.utils.encode_cell({r:0, c:ci});
      if (!ws[cellRef]) ws[cellRef] = {t:'s', v:h};
      ws[cellRef].s = { fill:hdrFill, font:hdrFont, alignment:hdrAlign,
        border:{bottom:{style:'medium',color:{rgb:'000000'}}} };
    });

    // ── Style data rows: colour Attendance column + absent rows ──
    rows.forEach((row, ri) => {
      const att = row[15]; // Attendance column
      const isAbsent = att === 'A';
      row.forEach((val, ci) => {
        const cellRef = XLSX.utils.encode_cell({r:ri+1, c:ci});
        if (!ws[cellRef]) return;
        const baseFont = { name:'Arial', sz:9 };
        if (ci === 15) { // Attendance col
          ws[cellRef].s = {
            font: { ...baseFont, bold:true, color:{rgb: isAbsent ? 'CC0000' : '006400'} },
            fill: { patternType:'solid', fgColor:{rgb: isAbsent ? 'FFE8E8' : 'E8FFE8'} },
            alignment: { horizontal:'center' }
          };
        } else if (isAbsent) {
          ws[cellRef].s = {
            font: { ...baseFont, color:{rgb:'660000'} },
            fill: { patternType:'solid', fgColor:{rgb:'FFF5F5'} },
            alignment: { horizontal: ci===0||ci>=9 ? 'center' : 'left' }
          };
        } else {
          ws[cellRef].s = {
            font: baseFont,
            alignment: { horizontal: ci===0||ci>=9 ? 'center' : 'left' }
          };
        }
      });
    });

    // Freeze header row
    ws['!freeze'] = {xSplit:0, ySplit:1};

    XLSX.utils.book_append_sheet(wb, ws, 'Detail - Class ' + cls);
  });

  // ══════════════════════════════════════════════
  // SHEET 3: Summary — one row per candidate
  // ══════════════════════════════════════════════
  const summaryHeaders = [
    'Class', 'Roll No', 'Name', 'Father', 'Sex', 'Category',
    'School Code', 'School Name',
    'Total Exams', 'Total Present', 'Total Absent', '% Attendance'
  ];

  const allCands = [...state.candidates].sort((a,b) => {
    if (a.class !== b.class) return a.class === 'X' ? -1 : 1;
    return a.roll.localeCompare(b.roll);
  });

  const summaryRows = allCands.map(cand => {
    const dates = Object.keys(cand.dateSubjects);
    let totalExams = 0, totalPresent = 0, totalAbsent = 0;
    dates.forEach(ds => {
      const subs = cand.dateSubjects[ds] || [];
      subs.forEach(() => {
        totalExams++;
        if (getAtt(cand.roll, ds) === 'A') totalAbsent++;
        else totalPresent++;
      });
    });
    const pct = totalExams > 0 ? (totalPresent/totalExams*100).toFixed(1)+'%' : '—';
    return [
      cand.class, cand.roll, cand.name, cand.father, cand.sex, cand.cat||'',
      cand.schoolCode, cand.schoolName,
      totalExams, totalPresent, totalAbsent, pct
    ];
  });

  const summaryData = [summaryHeaders, ...summaryRows];
  const ws3 = XLSX.utils.aoa_to_sheet(summaryData);

  ws3['!cols'] = [
    {wch:6},{wch:12},{wch:22},{wch:20},{wch:5},{wch:8},
    {wch:10},{wch:35},{wch:10},{wch:12},{wch:12},{wch:12}
  ];

  // Style summary header
  const sHdrFill = { patternType:'solid', fgColor:{rgb:'1C3557'} };
  const sHdrFont = { bold:true, color:{rgb:'FFFFFF'}, name:'Arial', sz:10 };
  summaryHeaders.forEach((h, ci) => {
    const cellRef = XLSX.utils.encode_cell({r:0, c:ci});
    if (!ws3[cellRef]) ws3[cellRef] = {t:'s', v:h};
    ws3[cellRef].s = { fill:sHdrFill, font:sHdrFont,
      alignment:{horizontal:'center', vertical:'center', wrapText:true},
      border:{bottom:{style:'medium', color:{rgb:'000000'}}} };
  });

  // Style summary data — highlight absent-heavy candidates
  summaryRows.forEach((row, ri) => {
    const absent = row[10];
    const total  = row[8];
    const isRisk = absent > 0;
    row.forEach((val, ci) => {
      const cellRef = XLSX.utils.encode_cell({r:ri+1, c:ci});
      if (!ws3[cellRef]) return;
      const baseFont = { name:'Arial', sz:9 };
      if (ci === 10 && absent > 0) { // Absent count col
        ws3[cellRef].s = {
          font:{...baseFont, bold:true, color:{rgb:'CC0000'}},
          fill:{patternType:'solid', fgColor:{rgb:'FFE8E8'}},
          alignment:{horizontal:'center'}
        };
      } else if (ci === 11) { // % col
        const pctVal = parseFloat(val);
        const color  = pctVal < 75 ? 'CC0000' : pctVal < 100 ? 'B86000' : '006400';
        ws3[cellRef].s = {
          font:{...baseFont, bold:true, color:{rgb:color}},
          alignment:{horizontal:'center'}
        };
      } else {
        ws3[cellRef].s = {
          font: baseFont,
          alignment:{horizontal: ci<=1||ci===4||ci===5||ci>=8 ? 'center' : 'left'}
        };
      }
    });
  });

  ws3['!freeze'] = {xSplit:0, ySplit:1};
  XLSX.utils.book_append_sheet(wb, ws3, 'Summary');

  // ── Write file ──
  const fname = `Attendance_Register_${centreCode}_${getExamYear()}.xlsx`;
  XLSX.writeFile(wb, fname);
}
export function getCentreMeta() {
  return {
    centreName: document.getElementById('cfg-centre-name').value || 'Centre',
    centreCode: document.getElementById('cfg-centre-code').value || '',
  };
}
export function getDateSeating(ds) {
  return (getDateState(ds).seating) || [];
}
export function getSortedRoomNos(seated) {
  return [...new Set((seated || []).map(s => s.roomNo))].sort((a,b) => a-b);
}
export function requireGeneratedForReports() {
  if (!state.generated) {
    showModal('Not Generated', 'Generate seating plan first.');
    return false;
  }
  return true;
}
export function requireCurrentDateSeatingForPrint() {
  if (!state.generated || !currentDate) {
    showModal('Nothing to print', 'Generate the seating plan and select a date first.');
    return null;
  }
  const ds = currentDate;
  const seated = getDateSeating(ds);
  if (!seated.length) {
    showModal('No Data', 'No seating data for ' + ds + '.');
    return null;
  }
  return { ds, seated };
}
// ── Helper: get subjects string for a seated record on a given date ──
// Falls back to dateSubjects map when subjectsToday is not populated
// (e.g. after session restore, slim dateState doesn't carry subjectsToday)
export function getSubjectsLabel(s, ds) {
  const today = s.subjectsToday && String(s.subjectsToday).trim();
  if (today && today !== '—') return today;
  return formatSubjectsForDate(s, ds) || '—';
}
export function exportSeatingExcel() {
  if (!requireGeneratedForReports()) return;
  const cfg = getConfig();
  const headers = ['Exam Date','Day','Room No','Seat No','Row-Col','Class','Roll No','Name','Sex','Cat','School','Subject(s)'];
  const rows = [];
  state.allDates.forEach(ds => {
    (state.seating[ds]||[]).forEach(s => {
      rows.push([ds, dayName(ds), `Room ${s.roomNo}`, s.seatInRoom, s.seatLabel,
        s.class, s.roll, s.name, s.sex, s.cat,
        s.schoolCode === '99999' ? 'Private' : s.schoolCode, getSubjectsLabel(s, ds)]);
    });
  });
  const wb = makeWB('Seating Plan', headers, rows);
  XLSX.writeFile(wb, 'Seating_Plan_' + (document.getElementById('cfg-centre-code').value || 'Centre') + '_2026.xlsx');
}
export function exportCandidatesExcel() {
  if (!requireGeneratedForReports()) return;
  const headers = ['Class','Roll No','Name','Mother','Father','Sex','Cat','School Code','School Name','Exam Date','Room','Seat','Subject(s)'];
  const rows = [];
  state.allDates.forEach(ds => {
    (state.seating[ds]||[]).forEach(s => {
      rows.push([s.class, s.roll, s.name, s.mother, s.father, s.sex, s.cat,
        s.schoolCode, s.schoolName, ds, `Room ${s.roomNo}`, s.seatLabel, getSubjectsLabel(s, ds)]);
    });
  });
  const wb = makeWB('Candidates', headers, rows);
  XLSX.writeFile(wb, 'Candidates_Master_' + (document.getElementById('cfg-centre-code').value || 'Centre') + '_2026.xlsx');
}
export function exportSummaryExcel() {
  if (!requireGeneratedForReports()) return;
  const cfg = getConfig();
  const { centreCode } = getCentreMeta();
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Consolidated (all classes/subjects per date) ──────
  const h1 = ['Exam Date','Day','Room No','Roll No From','Roll No To','Class X Count','Class XII Count','Total in Room','Subjects in Room'];
  const r1 = [];
  state.allDates.forEach(ds => {
    const allSeated = state.seating[ds] || [];
    if (!allSeated.length) return;
    const totalRooms = Math.ceil(allSeated.length / cfg.perRoom);
    let grandX=0, grandXII=0, grandTotal=0;
    for (let room=1; room<=totalRooms; room++) {
      const rc = allSeated.filter(s => s.roomNo === room);
      if (!rc.length) continue;
      const nX   = rc.filter(s => s.class==='X').length;
      const nXII = rc.filter(s => s.class==='XII').length;
      const subs = new Set();
      rc.forEach(s => (s.dateSubjects[ds]||[]).forEach(x => subs.add(x.code)));
      grandX += nX; grandXII += nXII; grandTotal += rc.length;
      r1.push([ds, dayName(ds), `Room ${String(room).padStart(2,'0')}`,
        rc[0].roll, rc[rc.length-1].roll,
        nX||'', nXII||'', rc.length, [...subs].join(', ')]);
    }
    r1.push([ds, dayName(ds), 'TOTAL', '', '', grandX, grandXII, grandTotal, '']);
    r1.push([]); // blank separator
  });
  const ws1 = XLSX.utils.aoa_to_sheet([h1, ...r1]);
  ws1['!cols'] = [14,12,10,14,14,11,11,12,28].map(w => ({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws1, 'Consolidated Summary');

  // ── Sheet 2: Subject-wise (one block per subject per date) ─────
  const h2 = ['Exam Date','Day','Class','Subject Code','Subject Name','Room No','Roll No From','Roll No To','This Subject','Vacant/Other','Total in Room'];
  const r2 = [];
  state.allDates.forEach(ds => {
    const allSeated = state.seating[ds] || [];
    if (!allSeated.length) return;
    const totalRooms = Math.ceil(allSeated.length / cfg.perRoom);

    // Collect subjects
    const subMap = {};
    allSeated.forEach(s => {
      (s.dateSubjects[ds]||[]).forEach(sub => {
        const key = s.class + '|' + sub.code;
        if (!subMap[key]) subMap[key] = {code:sub.code, name:sub.name, cls:s.class};
      });
    });

    Object.values(subMap).sort((a,b) => a.cls.localeCompare(b.cls) || a.code.localeCompare(b.code)).forEach(sub => {
      let grandThis=0, grandVacant=0, grandTotal=0;
      for (let room=1; room<=totalRooms; room++) {
        const rc = allSeated.filter(s => s.roomNo === room);
        if (!rc.length) continue;
        const thisSub = rc.filter(s => s.class===sub.cls && (s.dateSubjects[ds]||[]).some(x=>x.code===sub.code));
        const vacant  = rc.length - thisSub.length;
        const rollFrom = thisSub.length ? thisSub[0].roll : '—';
        const rollTo   = thisSub.length ? thisSub[thisSub.length-1].roll : '—';
        grandThis += thisSub.length; grandVacant += vacant; grandTotal += rc.length;
        r2.push([ds, dayName(ds), sub.cls, sub.code, sub.name,
          `Room ${String(room).padStart(2,'0')}`,
          rollFrom, rollTo, thisSub.length||'', vacant||'', rc.length]);
      }
      r2.push([ds, '', sub.cls, sub.code, sub.name, 'TOTAL', '', '', grandThis, grandVacant, grandTotal]);
      r2.push([]);
    });
    r2.push(['═══ END OF ' + ds + ' ═══']);
    r2.push([]);
  });
  const ws2 = XLSX.utils.aoa_to_sheet([h2, ...r2]);
  ws2['!cols'] = [14,12,7,11,22,10,14,14,11,11,12].map(w => ({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws2, 'Subject-wise Summary');

  // ── Sheet 3: Quick overview ────────────────────────────────────
  const h3 = ['Exam Date','Day','Class X','Class XII','Total Candidates','Rooms Needed','Room 1: Roll From','Room 1: Roll To','Subjects'];
  const r3 = state.allDates.map(ds => {
    const seated = state.seating[ds] || [];
    const nX   = seated.filter(s=>s.class==='X').length;
    const nXII = seated.filter(s=>s.class==='XII').length;
    const rooms = Math.ceil(seated.length/cfg.perRoom);
    const r1c = seated.filter(s=>s.roomNo===1);
    const subs = new Set();
    seated.forEach(s=>(s.dateSubjects[ds]||[]).forEach(x=>subs.add(x.code+' '+x.name)));
    return [ds, dayName(ds), nX||'', nXII||'', seated.length, rooms,
      r1c.length ? r1c[0].roll : '', r1c.length ? r1c[r1c.length-1].roll : '',
      [...subs].join(', ')];
  });
  const ws3 = XLSX.utils.aoa_to_sheet([h3, ...r3]);
  ws3['!cols'] = [14,12,10,10,14,12,14,14,50].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws3, 'Date Overview');

  XLSX.writeFile(wb, `Seating_Summary_${centreCode}_2026.xlsx`);
}
export function exportSchoolWiseExcel() {
  if (!requireGeneratedForReports()) return;
  const headers = ['School Code','School Name','Class','Roll No','Name','Mother','Father','Sex','Cat','Exam Date','Room','Seat','Subject(s)'];
  const rows = [];
  Object.keys(state.schools).sort().forEach(sc => {
    state.allDates.forEach(ds => {
      (state.seating[ds]||[]).filter(s => s.schoolCode === sc).forEach(s => {
        rows.push([s.schoolCode, s.schoolName, s.class, s.roll, s.name, s.mother, s.father,
          s.sex, s.cat, ds, `Room ${s.roomNo}`, s.seatLabel, getSubjectsLabel(s, ds)]);
      });
    });
  });
  const wb = makeWB('School-wise', headers, rows);
  XLSX.writeFile(wb, 'Schoolwise_Report_2026.xlsx');
}
export function exportScheduleExcel() {
  if (!requireGeneratedForReports()) return;
  const headers = ['Class','Roll No','Name','Mother','Father','Sex','Cat','School','Exam Date','Day','Room','Seat','Subject(s)'];
  const rows = [];
  // Group by candidate
  const candMap = {};
  state.allDates.forEach(ds => {
    (state.seating[ds]||[]).forEach(s => {
      if (!candMap[s.roll]) candMap[s.roll] = [];
      candMap[s.roll].push({ ...s, ds });
    });
  });
  Object.keys(candMap).sort().forEach(roll => {
    candMap[roll].sort((a,b) => parseDate(a.ds) - parseDate(b.ds)).forEach(s => {
      rows.push([s.class, s.roll, s.name, s.mother, s.father, s.sex, s.cat,
        s.schoolCode === '99999' ? 'Private' : s.schoolCode,
        s.ds, dayName(s.ds), `Room ${s.roomNo}`, s.seatLabel, getSubjectsLabel(s, s.ds)]);
    });
  });
  const wb = makeWB('Candidate Schedule', headers, rows);
  XLSX.writeFile(wb, 'Candidate_Schedules_2026.xlsx');
}
// ── PRINT ──────────────────────────────────────────────────────
export const PRINT_REPORT_REGISTRY = {
  appendixX:      { overlayId: 'appendixe-overlay-X',   styleId: 'appendixe-style-X',   pageSize: 'A4', orientation: 'portrait',  margins: '14mm 16mm 14mm 16mm' },
  appendixXII:    { overlayId: 'appendixe-overlay-XII', styleId: 'appendixe-style-XII', pageSize: 'A4', orientation: 'portrait',  margins: '14mm 16mm 14mm 16mm' },
  slips:          { overlayId: 'slips-overlay',         styleId: 'slips-print-style',   pageSize: 'A4', orientation: 'landscape', margins: '7mm 8mm 7mm 8mm' },
  roomSummary:    { overlayId: 'summary-overlay',       styleId: 'summary-print-style', pageSize: 'A4', orientation: 'landscape',  margins: '10mm 12mm 10mm 12mm' },
  centreMemo:     { overlayId: 'memo-overlay',          styleId: 'memo-print-style',    pageSize: 'A4', orientation: 'portrait',  margins: '10mm 12mm 10mm 12mm' },
  form66:         { overlayId: 'form66-overlay',        styleId: 'form66-print-style',  pageSize: 'A4', orientation: 'portrait',  margins: '8mm 10mm 8mm 10mm' },
  attendanceX:    { overlayId: 'attsheet-overlay-X',    styleId: 'attsheet-style-X',    pageSize: 'A4', orientation: 'portrait',  margins: '10mm 12mm 10mm 12mm' },
  attendanceXII:  { overlayId: 'attsheet-overlay-XII',  styleId: 'attsheet-style-XII',  pageSize: 'A4', orientation: 'portrait',  margins: '10mm 12mm 10mm 12mm' },
  century:        { overlayId: 'century-overlay',       styleId: 'century-print-style', pageSize: 'A4', orientation: 'portrait',  margins: '10mm 12mm 10mm 12mm' },
  displayPlan:    { overlayId: 'display-plan-overlay',  styleId: 'display-plan-style',  pageSize: 'A4', orientation: 'portrait',  margins: '8mm 10mm 8mm 10mm' },
  invLetters:     { overlayId: 'inv-letters-overlay',   styleId: 'inv-letters-style',   pageSize: 'A4', orientation: 'portrait',  margins: '20mm 18mm 20mm 25mm' },
  triplicate:     { overlayId: 'triplicate-overlay',    styleId: 'triplicate-print-style', pageSize: 'A4', orientation: 'portrait', margins: '8mm 12mm 8mm 12mm' },
  qpStatement:    { overlayId: 'qp-stmt-overlay',       styleId: 'qp-stmt-style',       pageSize: 'A4', orientation: 'portrait',  margins: '20mm' },
  qpRegister:     { overlayId: 'qp-reg-overlay',        styleId: 'qp-reg-style',        pageSize: 'A4', orientation: 'portrait', margins: '10mm 12mm' },
  absenteeDetail: { overlayId: 'absentee-detail-overlay', styleId: 'absentee-detail-style', pageSize: 'A4', orientation: 'portrait', margins: '10mm' },
  daySummary:     { overlayId: 'day-summary-overlay',    styleId: 'day-summary-style',    pageSize: 'A4', orientation: 'portrait', margins: '10mm' },
};
export const PRINT_RUNTIME = {
  active: null,
  hooks: {},
  debug: false,
};
export function _printDebug(msg, payload) {
  if (!(PRINT_RUNTIME.debug || window.__PRINT_DEBUG__)) return;
  console.log('[print-runtime]', msg, payload || '');
}
export function buildPrintShellCSS({ overlayId, pageSize, orientation, margins }) {
  return `
    @media print {
      body { background: #fff !important; }
      body > *:not(#${overlayId}) { display:none!important; }
      #${overlayId} .no-print { display:none!important; }
      #${overlayId} {
        position:static!important;
        background:#fff!important;
        overflow:visible!important;
        -webkit-print-color-adjust:exact;
        print-color-adjust:exact;
      }
      #${overlayId} > div:not(.no-print) {
        background:#fff!important;
        padding:0!important;
      }
      @page { size:${pageSize || 'A4'} ${orientation || 'portrait'}; margin:${margins || '10mm'}; }
      thead { display:table-header-group; }
      tfoot { display:table-row-group; }
      tr, td, th { page-break-inside:avoid; }
    }`;
}
export function registerPrintHooks(reportKey, before, after) {
  const key = String(reportKey || '');
  const prev = PRINT_RUNTIME.hooks[key];
  if (prev?.before) window.removeEventListener('beforeprint', prev.before);
  if (prev?.after) window.removeEventListener('afterprint', prev.after);
  if (typeof before === 'function') window.addEventListener('beforeprint', before);
  if (typeof after === 'function') window.addEventListener('afterprint', after);
  PRINT_RUNTIME.hooks[key] = {
    before: typeof before === 'function' ? before : null,
    after: typeof after === 'function' ? after : null,
  };
  _printDebug('register-hooks', { reportKey: key, hasBefore: !!before, hasAfter: !!after });
}
export function clearPrintHooks(reportKey) {
  if (reportKey) {
    const key = String(reportKey);
    const h = PRINT_RUNTIME.hooks[key];
    if (h?.before) window.removeEventListener('beforeprint', h.before);
    if (h?.after) window.removeEventListener('afterprint', h.after);
    delete PRINT_RUNTIME.hooks[key];
    return;
  }
  Object.keys(PRINT_RUNTIME.hooks).forEach(key => clearPrintHooks(key));
}
export function beginPrintSession({ reportKey, overlayId, styleId, pageSize, orientation, margins, beforePrint, afterPrint } = {}) {
  const meta = PRINT_REPORT_REGISTRY[reportKey] || {};
  const resolved = {
    reportKey: reportKey || 'custom',
    overlayId: overlayId || meta.overlayId,
    styleId: styleId || meta.styleId,
    pageSize: pageSize || meta.pageSize || 'A4',
    orientation: orientation || meta.orientation || 'portrait',
    margins: margins || meta.margins || '10mm',
  };
  if (!resolved.overlayId || !resolved.styleId) return resolved;
  clearPrintArtifacts();
  document.getElementById(resolved.overlayId)?.remove();
  document.getElementById(resolved.styleId)?.remove();

  // Auto-wire global beforeprint/afterprint to strip overlay background/padding/scrollbar
  // that causes the grey bar on every print. Callers can pass their own hooks too.
  const oid = resolved.overlayId;
  const _globalBefore = () => {
    const el = document.getElementById(oid);
    if (!el) return;
    el._savedStyle = el.style.cssText;
    el.style.cssText = 'position:static;background:#fff;overflow:visible;';
    // Also strip padding from immediate non-toolbar child wrapper divs
    Array.from(el.children).forEach(child => {
      if (child.classList.contains('no-print')) return;
      child._savedStyle = child.style.cssText;
      child.style.cssText = (child.style.cssText || '').replace(/padding:[^;]+;?/gi,'') + ';padding:0;background:#fff;';
    });
    if (beforePrint) beforePrint();
  };
  const _globalAfter = () => {
    const el = document.getElementById(oid);
    if (!el) return;
    if (el._savedStyle !== undefined) el.style.cssText = el._savedStyle;
    Array.from(el.children).forEach(child => {
      if (child.classList.contains('no-print')) return;
      if (child._savedStyle !== undefined) child.style.cssText = child._savedStyle;
    });
    if (afterPrint) afterPrint();
  };
  window.addEventListener('beforeprint', _globalBefore);
  window.addEventListener('afterprint',  _globalAfter);
  // Store on resolved so endPrintSession can remove them
  resolved._globalBefore = _globalBefore;
  resolved._globalAfter  = _globalAfter;

  PRINT_RUNTIME.active = resolved;
  _printDebug('begin-session', resolved);
  return resolved;
}
export function endPrintSession({ reportKey, overlayId, styleId } = {}) {
  const active = PRINT_RUNTIME.active || {};
  const meta = PRINT_REPORT_REGISTRY[reportKey] || {};
  const oid = overlayId || active.overlayId || meta.overlayId;
  const sid = styleId || active.styleId || meta.styleId;
  const key = reportKey || active.reportKey;
  // Remove global beforeprint/afterprint hooks registered by beginPrintSession
  if (active._globalBefore) window.removeEventListener('beforeprint', active._globalBefore);
  if (active._globalAfter)  window.removeEventListener('afterprint',  active._globalAfter);
  // Also remove any element-level hooks (displayPlan registers these directly)
  if (oid) {
    const el = document.getElementById(oid);
    if (el) {
      if (el._dpBefore) window.removeEventListener('beforeprint', el._dpBefore);
      if (el._dpAfter)  window.removeEventListener('afterprint',  el._dpAfter);
    }
    el?.remove();
  }
  if (sid) document.getElementById(sid)?.remove();
  if (key) clearPrintHooks(key);
  if (PRINT_RUNTIME.active && ((!oid || PRINT_RUNTIME.active.overlayId === oid) || (!sid || PRINT_RUNTIME.active.styleId === sid))) {
    PRINT_RUNTIME.active = null;
  }
  _printDebug('end-session', { reportKey: key, overlayId: oid, styleId: sid });
}
export function closePrintSession(reportKey, overlayId, styleId) {
  endPrintSession({ reportKey, overlayId, styleId });
}
export function clearPrintArtifacts() {
  const overlayIds = [...new Set(Object.values(PRINT_REPORT_REGISTRY).map(x => x.overlayId).filter(Boolean))];
  const styleIds = [...new Set(Object.values(PRINT_REPORT_REGISTRY).map(x => x.styleId).filter(Boolean))];
  overlayIds.forEach(id => document.getElementById(id)?.remove());
  styleIds.forEach(id => document.getElementById(id)?.remove());
  clearPrintHooks();
  PRINT_RUNTIME.active = null;
  _printDebug('clear-artifacts', { overlayCount: overlayIds.length, styleCount: styleIds.length });
}
// ── APPENDIX-E: CONSOLIDATED ABSENTEE STATEMENT ───────────────
export function printAppendixE(cls) {
  // cls = 'X' or 'XII'
  if (!state.candidates || !state.candidates.length) {
    showModal('No Data', 'Please load candidate data first.');
    return;
  }

  const centreName = document.getElementById('cfg-centre-name').value || 'Centre';
  const centreCode = document.getElementById('cfg-centre-code').value || '';

  // ── Filter candidates by class ──
  const classCands = state.candidates.filter(c => c.class === cls);
  if (!classCands.length) {
    showModal('No Data', 'No ' + cls + ' candidates found.');
    return;
  }

  const examLabel = getExamFull(cls);

  // ── For each candidate, determine all dates they are registered for ──
  // and whether they were absent (A) or not (P / unmarked = treat as P)
  // dateState attendance: state.dateStates[ds].attendance[roll] = 'P'|'A'

  // Build per-candidate absence map: { roll → { ds → true/false(absent) } }
  const candAbsMap = {}; // roll → Set of absent dates (subjects)

  classCands.forEach(c => {
    const datesForCand = Object.keys(c.dateSubjects);
    candAbsMap[c.roll] = { allDates: datesForCand, absentDates: [] };
    datesForCand.forEach(ds => {
      const att = (state.dateStates[ds] && state.dateStates[ds].attendance) || {};
      // treat unmarked as Present
      const isAbsent = att[c.roll] === 'A';
      if (isAbsent) candAbsMap[c.roll].absentDates.push(ds);
    });
  });

  // ── Section 1: Absent in ALL papers ──
  // candidate absent on every date they are registered
  const absentAll = classCands.filter(c => {
    const info = candAbsMap[c.roll];
    return info.allDates.length > 0 && info.absentDates.length === info.allDates.length;
  }).sort((a,b) => a.roll.localeCompare(b.roll));

  // ── Section 2: Casual Absentees (absent in some but not all) ──
  // list each as roll - subject name for each absent date
  const casual = []; // { roll, subjectName }
  classCands
    .filter(c => {
      const info = candAbsMap[c.roll];
      return info.absentDates.length > 0 && info.absentDates.length < info.allDates.length;
    })
    .sort((a,b) => a.roll.localeCompare(b.roll))
    .forEach(c => {
      const info = candAbsMap[c.roll];
      info.absentDates.sort().forEach(ds => {
        const subs = (c.dateSubjects[ds] || []);
        subs.forEach(sub => {
          casual.push({ roll: c.roll, subject: sub.name.toUpperCase() });
        });
      });
    });

  // ── Helper: render roll list in 4-column grid ──
  function rollGrid(rolls) {
    if (!rolls.length) return '<p style="margin:4pt 0 4pt 20pt;font-size:9pt;">Nil</p>';
    const COLS = 4;
    let rows = '';
    for (let i=0; i<rolls.length; i+=COLS) {
      const cells = rolls.slice(i, i+COLS).map(r =>
        `<td style="padding:2px 10px;font-size:9pt;font-family:'Courier New',monospace;">${r}</td>`
      ).join('');
      rows += `<tr>${cells}</tr>`;
    }
    return `<table style="border-collapse:collapse;margin-left:20pt;">${rows}</table>`;
  }

  // ── Helper: render casual absentee list (grouped by roll) ──
  function casualList(entries) {
    if (!entries.length) return '<p style="margin:4pt 0 4pt 20pt;font-size:9pt;">Nil</p>';
    // Group by roll
    const grouped = {};
    entries.forEach(e => {
      if (!grouped[e.roll]) grouped[e.roll] = [];
      grouped[e.roll].push(e.subject);
    });
    let html = '<table style="border-collapse:collapse;margin-left:20pt;width:calc(100% - 20pt);">';
    Object.entries(grouped).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([roll, subs]) => {
      html += `<tr>
        <td style="padding:2px 10px 2px 0;font-size:9pt;font-family:'Courier New',monospace;
          white-space:nowrap;vertical-align:top;min-width:90px;">${roll}</td>
        <td style="padding:2px 0;font-size:9pt;vertical-align:top;">
          ${subs.join('<br>')}
        </td>
      </tr>`;
    });
    html += '</table>';
    return html;
  }

  // ── Editable section (UFM, Transfer, Subject Change) ──
  function editableSection(label) {
    return `
      <div style="margin:6pt 0 4pt 0;font-size:9pt;">
        <table style="width:100%;border-collapse:collapse;margin-left:20pt;width:calc(100% - 20pt);">
          <thead>
            <tr>
              <th style="border:1px solid #000;padding:4px 8px;font-size:8.5pt;text-align:left;
                background:#fff;color:#000;width:25%;">Roll No.</th>
              ${label === 'Transfer Cases Appeared at the Centre'
                ? `<th style="border:1px solid #000;padding:4px 8px;font-size:8.5pt;text-align:left;background:#fff;color:#000;width:25%;">Subject(s)</th>
                   <th style="border:1px solid #000;padding:4px 8px;font-size:8.5pt;text-align:left;background:#fff;color:#000;">No. &amp; Name of Centre from where Transferred</th>`
                : `<th style="border:1px solid #000;padding:4px 8px;font-size:8.5pt;text-align:left;background:#fff;color:#000;">Subject(s)</th>`
              }
            </tr>
          </thead>
          <tbody>
            ${[1,2,3].map(() => `<tr>
              <td style="border:1px solid #000;padding:8px;">&nbsp;</td>
              ${label === 'Transfer Cases Appeared at the Centre'
                ? `<td style="border:1px solid #000;padding:8px;">&nbsp;</td>
                   <td style="border:1px solid #000;padding:8px;">&nbsp;</td>`
                : `<td style="border:1px solid #000;padding:8px;">&nbsp;</td>`
              }
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ── Divider line ──
  const divider = `<div style="border-top:1px dashed #999;margin:10pt 0;"></div>`;

  const html = `
  <div class="appendix-page" style="width:170mm;margin:0 auto;font-family:Arial,sans-serif;">

    <!-- ── HEADER ── -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4pt;">
      <div></div>
      <div style="font-size:9pt;font-weight:bold;">APPENDIX – E</div>
    </div>
    <div style="margin-bottom:6pt;">
      <div style="font-size:9pt;"><b>Centre No. :</b> ${centreCode}</div>
      <div style="font-size:9pt;"><b>Centre Name:</b> ${centreName}</div>
    </div>
    <div style="text-align:center;margin-bottom:4pt;">
      <div style="font-size:10pt;font-weight:bold;">${examLabel}, ${getExamYear()}</div>
      <div style="font-size:10pt;font-weight:bold;">Consolidated Absentee Statement (Theory Papers only)</div>
    </div>

    <div style="border-top:2px solid #000;margin-bottom:8pt;"></div>

    <!-- ── SECTION 1 ── -->
    <div style="font-size:9.5pt;font-weight:bold;margin-bottom:4pt;">
      Absentees in all Papers &nbsp;&nbsp; Roll No.(s)
    </div>
    ${rollGrid(absentAll.map(c => c.roll))}

    ${divider}

    <!-- ── SECTION 2 ── -->
    <div style="font-size:9.5pt;font-weight:bold;margin-bottom:4pt;">
      Casual Absentees (Not absent in all paper(s))
    </div>
    <div style="font-size:9pt;margin-left:20pt;margin-bottom:4pt;">
      <span style="display:inline-block;min-width:90px;font-weight:bold;">Roll No.</span>
      <span style="font-weight:bold;">Subject(s)</span>
    </div>
    ${casualList(casual)}

    ${divider}

    <!-- ── SECTION 3 ── -->
    <div style="font-size:9.5pt;font-weight:bold;margin-bottom:4pt;">Unfair Means Cases</div>
    ${editableSection('UFM')}

    ${divider}

    <!-- ── SECTION 4 ── -->
    <div style="font-size:9.5pt;font-weight:bold;margin-bottom:4pt;">Transfer Cases Appeared at the Centre</div>
    ${editableSection('Transfer Cases Appeared at the Centre')}

    ${divider}

    <!-- ── SECTION 5 ── -->
    <div style="font-size:9.5pt;font-weight:bold;margin-bottom:4pt;">Subject(s) Changed by the Candidate</div>
    ${editableSection('Subject Changed')}

    <div style="border-top:2px solid #000;margin:12pt 0 8pt;"></div>

    <!-- ── FOOTER ── -->
    <div style="display:flex;justify-content:flex-end;margin-bottom:6pt;">
      <div style="text-align:center;font-size:9pt;">
        <div>Signature of Centre Supdt.</div>
        <div style="font-size:8pt;">(with Rubber Stamp)</div>
      </div>
    </div>
    <div style="font-size:7.5pt;margin-top:8pt;border-top:1px solid #ccc;padding-top:6pt;">
      <b>Note:</b> THIS MAY PLEASE BE RETURNED TO THE REGIONAL OFFICER SOON AFTER THE EXAMINATION
      IS OVER ALONGWITH ALL THE ATTENDANCE SHEETS DULY ATTESTED BY THE CENTRE SUPDT.
    </div>

  </div>`;

  const session = beginPrintSession({ reportKey: cls === 'XII' ? 'appendixXII' : 'appendixX' });
  // ── Render overlay ──
  const overlayId = session.overlayId;
  let overlay = document.getElementById(overlayId);
  if (overlay) overlay.remove();
  const styleId = session.styleId;
  let pStyle = document.getElementById(styleId);
  if (pStyle) pStyle.remove();

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `${buildPrintShellCSS({
    overlayId,
    pageSize: session.pageSize,
    orientation: session.orientation,
    margins: session.margins
  })}
    .appendix-page table thead th {
      background:#fff!important; color:#000!important;
      -webkit-print-color-adjust:exact; print-color-adjust:exact;
    }`;
  document.head.appendChild(style);

  overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow-y:auto;background:#fff;';
  overlay.innerHTML = `
    <div class="no-print" style="position:sticky;top:0;background:#0c1c35;color:#fff;
      z-index:10001;padding:10px 20px;display:flex;align-items:center;
      justify-content:space-between;font-family:Arial,sans-serif;font-size:13px;">
      <span>📋 Appendix-E (${cls}) — ${absentAll.length} absent all · ${Object.keys(Object.fromEntries(casual.map(e=>[e.roll,1]))).length} casual</span>
      <div style="display:flex;gap:10px;">
        <button onclick="window.print()" style="background:#1a50d4;color:#fff;border:none;
          border-radius:5px;padding:7px 18px;font-size:13px;cursor:pointer;">
          🖨️ Print / Save PDF
        </button>
        <button onclick="closePrintSession('${session.reportKey}','${overlayId}','${styleId}')"
          style="background:#6b7280;color:#fff;border:none;border-radius:5px;
          padding:7px 14px;font-size:13px;cursor:pointer;">✕ Close</button>
      </div>
    </div>
    <div style="padding:10mm 0 0 0;background:#fff;">${html}</div>`;

  document.body.appendChild(overlay);
}
// ── SEAT SLIPS (ROOM-WISE GRID) ────────────────────────────────
export function printSeatSlips() {
  const ctx = requireCurrentDateSeatingForPrint();
  if (!ctx) return;
  const ds = ctx.ds;
  const seated = ctx.seated;
  const { centreName, centreCode } = getCentreMeta();
  const dateObj    = parseDate(ds);
  const dateStr    = dateObj.toLocaleDateString('en-IN',{weekday:'long',day:'2-digit',month:'short',year:'numeric'});
  const cfg        = getConfig();
  const ROWS = cfg.rows;
  const COLS = cfg.cols;

  const target = (currentSubjectFilter && currentSubjectFilter !== 'all')
    ? seated.filter(s => { const sub=(s.dateSubjects[ds]||[])[0]; return sub&&(s.class+'|'+sub.code)===currentSubjectFilter; })
    : seated;

  const rooms = [...new Set(target.map(s => s.roomNo))].sort((a,b)=>a-b);

  // ── Slip content options (read from checkboxes in toolbar) ──
  function getOpts() {
    const get = id => document.getElementById(id)?.checked ?? true;
    return {
      name:       get('slip-opt-name'),
      school:     get('slip-opt-school'),
      father:     get('slip-opt-father'),
      mother:     get('slip-opt-mother'),
      subject:    get('slip-opt-subject'),
      classLabel: get('slip-opt-class'),
      seatLabel:  get('slip-opt-seat'),
    };
  }

  // ── Build all pages HTML ──
  function buildPages(opts) {
    let pages = '';
    rooms.forEach(roomNo => {
      const roomSeated = target.filter(s => s.roomNo === roomNo);
      if (!roomSeated.length) return;

      const stagger   = cfg.stagger;
      const PHYS_ROWS = physRows(cfg);
      const grid = {};
      for (let r=1; r<=PHYS_ROWS; r++) { grid[r]={}; for(let cc=1;cc<=COLS;cc++) grid[r][cc]=null; }
      roomSeated.forEach(s => { const pr=physRow(s.row,s.col,stagger); if(grid[pr]) grid[pr][s.col]=s; });

      const subjects = [...new Set(roomSeated.map(s => {
        const sub=(s.dateSubjects[ds]||[])[0]; return sub?sub.code+'-'+sub.name:'';
      }).filter(Boolean))].join(' | ');

      const rowH = Math.floor(165/PHYS_ROWS);

      function slip(s) {
        if (!s) return `<td style="border:1px solid #ccc;padding:0;width:${100/COLS}%;vertical-align:middle;text-align:center;background:#f8f8f8;">
            <div style="height:100%;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:9pt;letter-spacing:1px;">VACANT</div>
          </td>`;

        const sub      = (s.dateSubjects[ds]||[])[0];
        const subLabel = sub ? sub.code+'-'+sub.name.toUpperCase() : '';
        const cls      = s.class==='XII' ? 'SR.SEC' : 'SEC';

        // Count how many info lines will show — determines roll font size
        let infoLines = '';
        if (opts.name)       infoLines += `<div style="font-size:8pt;font-weight:bold;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#111;margin-bottom:1px;">${s.name}</div>`;
        if (opts.school)     infoLines += `<div style="font-size:7pt;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:1px;">${s.schoolName||''}</div>`;
        if (opts.father)     infoLines += `<div style="font-size:7pt;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:1px;">F: ${s.father||'—'}</div>`;
        if (opts.mother)     infoLines += `<div style="font-size:7pt;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:1px;">M: ${s.mother||'—'}</div>`;

        let subLine = '';
        if (opts.classLabel && opts.subject) subLine = `<div style="font-size:7pt;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${cls}(${s.class}) · ${subLabel}</div>`;
        else if (opts.classLabel)            subLine = `<div style="font-size:7pt;color:#333;">${cls}(${s.class})</div>`;
        else if (opts.subject)               subLine = `<div style="font-size:7pt;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${subLabel}</div>`;

        const seatLbl = opts.seatLabel ? `<div style="font-size:6.5pt;color:#aaa;text-align:center;margin-top:3px;">R${s.row}-C${s.col}</div>` : '';

        // Roll font size — bounded to avoid overflow in dense grids / minimal-info mode.
        const infoCount = (opts.name?1:0) + (opts.school?1:0) + (opts.father?1:0) + (opts.mother?1:0)
                        + (opts.subject||opts.classLabel?1:0) + (opts.seatLabel?1:0);
        const digits = String(s.roll || '').length;
        const byInfo = infoCount <= 0 ? 34 : infoCount === 1 ? 31 : infoCount === 2 ? 27 : infoCount === 3 ? 24 : 21;
        const byDigitsPenalty = Math.max(0, digits - 6) * 1.8;
        const colFactor = Math.max(0.82, Math.min(1.05, 4 / COLS)); // narrower cells => smaller rolls
        const rollSizeNum = Math.max(18, Math.min(34, Math.round((byInfo - byDigitsPenalty) * colFactor)));
        const rollFont = `${rollSizeNum}pt`;

        const rollOnly = infoCount === 0;
        if (rollOnly) {
          return `<td style="border:1.5px solid #555;padding:0;width:${100/COLS}%;vertical-align:middle;">
            <div style="height:${rowH}mm;display:flex;align-items:center;justify-content:center;text-align:center;box-sizing:border-box;padding:0 6px;">
              <div style="width:100%;font-size:${rollFont};font-weight:900;font-family:'Arial Black',Arial,sans-serif;letter-spacing:0.2px;line-height:0.95;white-space:nowrap;overflow:hidden;text-overflow:clip;color:#000;">${s.roll}</div>
            </div>
          </td>`;
        }
        return `<td style="border:1.5px solid #555;padding:0;width:${100/COLS}%;vertical-align:middle;">
          <div style="padding:6px 8px 5px;height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;">
            <div style="font-size:${rollFont};font-weight:900;font-family:'Arial Black',Arial,sans-serif;letter-spacing:0.2px;line-height:0.95;white-space:nowrap;overflow:hidden;text-overflow:clip;margin-bottom:${infoCount?'4px':'0'};color:#000;">${s.roll}</div>
            ${infoLines}${subLine}${seatLbl}
          </div>
        </td>`;
      }

      let tableRows = '';
      for (let r=1; r<=PHYS_ROWS; r++) {
        let cells = '';
        for (let col=1; col<=COLS; col++) {
          if (isXCell(r,col,cfg)) {
            cells += `<td style="border:1.5px solid #ccc;padding:0;width:${100/COLS}%;vertical-align:middle;text-align:center;background-image:linear-gradient(to bottom right,transparent calc(50% - 0.7px),#aaa calc(50% - 0.7px),#aaa calc(50% + 0.7px),transparent calc(50% + 0.7px)),linear-gradient(to bottom left,transparent calc(50% - 0.7px),#aaa calc(50% - 0.7px),#aaa calc(50% + 0.7px),transparent calc(50% + 0.7px));"></td>`;
          } else { cells += slip(grid[r][col]); }
        }
        tableRows += `<tr style="height:${rowH}mm;">${cells}</tr>`;
      }

      pages += `
      <div class="slip-page" style="width:267mm;height:188mm;box-sizing:border-box;page-break-after:always;display:flex;flex-direction:column;font-family:Arial,sans-serif;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding:3px 6px;margin-bottom:3px;flex-shrink:0;">
          <div><span style="font-size:9pt;font-weight:bold;">${centreName}</span><span style="font-size:8pt;color:#555;"> &nbsp;|&nbsp; Code: ${centreCode}</span></div>
          <div style="text-align:center;"><span style="font-size:10pt;font-weight:bold;">ROOM ${String(roomNo).padStart(2,'0')}</span><span style="font-size:8pt;color:#555;"> &nbsp;|&nbsp; ${dateStr}</span></div>
          <div style="text-align:right;font-size:8pt;color:#555;">${subjects}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;flex:1;">
          <colgroup>${Array.from({length:COLS},()=>`<col style="width:${100/COLS}%">`).join('')}</colgroup>
          <tbody>${tableRows}</tbody>
        </table>
      </div>`;
    });
    return pages;
  }

  // ── Overlay ──
  const session = beginPrintSession({ reportKey: 'slips' });
  const overlayId = session.overlayId;
  const styleId = session.styleId;
  let overlay = document.getElementById(overlayId);
  if (overlay) overlay.remove();

  const style = document.createElement('style');
  style.id = styleId;
  document.getElementById(styleId)?.remove();
  style.textContent = `${buildPrintShellCSS({
    overlayId,
    pageSize: session.pageSize,
    orientation: session.orientation,
    margins: session.margins
  })}
    .slip-page { page-break-after:always;height:auto!important;width:auto!important; }
    .slip-page:last-child { page-break-after:avoid; }
    .slip-page table td { -webkit-print-color-adjust:exact;print-color-adjust:exact; }`;
  document.head.appendChild(style);

  overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow-y:auto;background:#fff;';

  // Checkbox helper
  const chk = (id, label, checked=true) =>
    `<label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;white-space:nowrap;">
      <input type="checkbox" id="${id}" ${checked?'checked':''} onchange="
        document.getElementById('slips-pages').innerHTML = window._buildSlipPages(window._getSlipOpts());
      "> ${label}</label>`;

  overlay.innerHTML = `
    <div class="no-print" style="position:sticky;top:0;background:#0c1c35;color:#fff;z-index:10001;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;font-family:Arial,sans-serif;font-size:13px;flex-wrap:wrap;gap:8px;">
      <span>🪑 Seat Slips — ${ds} &nbsp;·&nbsp; ${rooms.length} room(s) · ${target.length} candidates</span>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.1);padding:6px 12px;border-radius:6px;flex-wrap:wrap;">
          <span style="font-size:11px;font-weight:600;color:#f59e0b;">⚙ Slip Content:</span>
          ${chk('slip-opt-name',    'Name',    true)}
          ${chk('slip-opt-school',  'School',  false)}
          ${chk('slip-opt-father',  "Father's",false)}
          ${chk('slip-opt-mother',  "Mother's",false)}
          ${chk('slip-opt-subject', 'Subject', true)}
          ${chk('slip-opt-class',   'Class',   true)}
          ${chk('slip-opt-seat',    'Seat Lbl',true)}
        </div>
        <button onclick="window.print()" style="background:#1a50d4;color:#fff;border:none;border-radius:5px;padding:7px 18px;font-size:13px;cursor:pointer;">🖨️ Print / Save PDF</button>
        <button onclick="closePrintSession('${session.reportKey}','${overlayId}','${styleId}')" style="background:#6b7280;color:#fff;border:none;border-radius:5px;padding:7px 14px;font-size:13px;cursor:pointer;">✕ Close</button>
      </div>
    </div>
    <div style="padding:10mm 0 0 0;background:#fff;display:flex;flex-direction:column;gap:20px;" id="slips-pages">${buildPages(getOpts())}</div>`;

  // Expose helpers for live re-render on checkbox change
  window._getSlipOpts  = getOpts;
  window._buildSlipPages = buildPages;

  document.body.appendChild(overlay);
}
export function printRoomSummary() {
  beginPrintSession({ reportKey: 'roomSummary' });
  const ctx = requireCurrentDateSeatingForPrint();
  if (!ctx) return;
  const ds = ctx.ds;
  const seated = ctx.seated;
  const { centreName, centreCode } = getCentreMeta();

  const dateObj = parseDate(ds);
  const dateStr = dateObj.toLocaleDateString('en-IN', {weekday:'long', day:'2-digit', month:'2-digit', year:'numeric'});

  // ── Collect all subjects on this date (concat across classes) ──
  const subjectSet = new Map(); // code+class → label
  seated.forEach(s => {
    (s.dateSubjects[ds] || []).forEach(sub => {
      const key = s.class + '|' + sub.code;
      if (!subjectSet.has(key))
        subjectSet.set(key, `${sub.name} (${s.class === 'XII' ? 'AISSCE' : 'SSE'})`);
    });
  });
  const subjectLabel = [...subjectSet.values()].join('  |  ');

  // ── Collect rooms (sorted), schools (sorted by code) ──
  const roomSet    = new Set(seated.map(s => s.roomNo));
  const rooms      = [...roomSet].sort((a,b) => a-b);

  const schoolMap  = new Map(); // code → name
  seated.forEach(s => {
    if (!schoolMap.has(s.schoolCode)) schoolMap.set(s.schoolCode, s.schoolName);
  });
  const schools = [...schoolMap.entries()].sort((a,b) => a[0].localeCompare(b[0]));
  // schools = [ [code, name], ... ]

  // ── Build count matrix: matrix[roomNo][schoolCode] = count ──
  const matrix = {};
  rooms.forEach(r => { matrix[r] = {}; schools.forEach(([code]) => { matrix[r][code] = 0; }); });
  seated.forEach(s => { matrix[s.roomNo][s.schoolCode] = (matrix[s.roomNo][s.schoolCode] || 0) + 1; });

  // Room totals
  const roomTotals = {};
  rooms.forEach(r => { roomTotals[r] = schools.reduce((sum,[code]) => sum + (matrix[r][code]||0), 0); });

  // School totals
  const schoolTotals = {};
  schools.forEach(([code]) => { schoolTotals[code] = rooms.reduce((sum,r) => sum + (matrix[r][code]||0), 0); });
  const grandTotal = rooms.reduce((sum,r) => sum + roomTotals[r], 0);

  // ── Build school header columns (code on top, name wrapped below) ──
  // Each school col: fixed width via CSS

  const schoolCols = schools.map(([code, name]) =>
    `<th style="border:1px solid #000;padding:6px 2px;font-size:6.5pt;text-align:center;
      min-width:40px;max-width:55px;width:50px;font-weight:bold;
      vertical-align:bottom;line-height:1.5;background:#fff;color:#000;">
      <div style="font-size:8pt;font-weight:bold;margin-bottom:2px;">${code}</div>
      <div style="font-weight:normal;font-size:7pt;">${name.substring(0, 6)}....</div>
    </th>`
  ).join('');

  // ── Build data rows ──
  let dataRows = '';
  rooms.forEach(r => {
    const cells = schools.map(([code]) => {
      const v = matrix[r][code] || 0;
      return `<td style="border:1px solid #000;padding:10px 4px;font-size:10pt;text-align:center;">${v > 0 ? v : ''}</td>`;
    }).join('');

    dataRows += `
      <tr>
        <td style="border:1px solid #000;padding:10px 6px;font-size:10pt;text-align:center;font-weight:bold;">${r}</td>
        ${cells}
        <td style="border:1px solid #000;padding:10px 4px;font-size:10pt;text-align:center;font-weight:bold;">${roomTotals[r]}</td>
        <td style="border:1px solid #000;padding:10px 4px;font-size:10pt;"></td>
        <td style="border:1px solid #000;padding:10px 4px;font-size:10pt;"></td>
      </tr>
`;
  });

  // ── Total row ──
  const totalCells = schools.map(([code]) =>
    `<td style="border:1px solid #000;padding:10px 4px;font-size:10pt;text-align:center;font-weight:bold;">${schoolTotals[code] || ''}</td>`
  ).join('');

  const totalRow = `
    <tr style="background:#fff;">
      <td style="border:1px solid #000;padding:10px 6px;font-size:10pt;font-weight:bold;text-align:center;">TOTAL</td>
      ${totalCells}
      <td style="border:1px solid #000;padding:10px 4px;font-size:10pt;font-weight:bold;text-align:center;">${grandTotal}</td>
      <td style="border:1px solid #000;padding:10px 4px;font-size:10pt;"></td>
      <td style="border:1px solid #000;padding:10px 4px;font-size:10pt;"></td>
    </tr>`;

  const html = `
  <div class="summary-page" style="width:270mm;margin:0 auto;font-family:Arial,sans-serif;">

    <!-- ── HEADER ── -->
    <div style="text-align:center;margin-bottom:8pt;border-bottom:2px solid #000;padding-bottom:6pt;">
      <div style="font-size:11pt;font-weight:bold;">${centreName.toUpperCase()}</div>
      <div style="font-size:9pt;">Centre Code: ${centreCode}</div>
      <div style="font-size:9pt;margin-top:3pt;font-weight:bold;">ROOM WISE INVIGILATOR DUTY CHART</div>
      <div style="font-size:9pt;margin-top:2pt;">Date: ${dateStr}</div>
      <div style="font-size:8.5pt;margin-top:2pt;font-style:italic;">${subjectLabel}</div>
    </div>

    <!-- ── TABLE ── -->
    <table class="summary-table" style="width:100%;border-collapse:collapse;table-layout:fixed;">
      <thead>
        <tr>
          <th style="border:1px solid #000;padding:10px 6px;font-size:10pt;text-align:center;
            width:50px;background:#fff;color:#000;">ROOM</th>
          ${schoolCols}
          <th style="border:1px solid #000;padding:10px 4px;font-size:9pt;text-align:center;
            width:60px;background:#fff;color:#000;">TOTAL<br><span style="font-weight:normal;font-size:8pt;">Cands.</span></th>
          <th style="border:1px solid #000;padding:10px 4px;font-size:9pt;text-align:center;
            width:120px;background:#fff;color:#000;">INV-1<br><span style="font-weight:normal;font-size:8pt;">Name</span></th>
          <th style="border:1px solid #000;padding:10px 4px;font-size:9pt;text-align:center;
            width:120px;background:#fff;color:#000;">INV-2<br><span style="font-weight:normal;font-size:8pt;">Name</span></th>
        </tr>
      </thead>
      <tbody>
        ${dataRows}
        ${totalRow}
      </tbody>
    </table>

    <!-- ── FOOTER ── -->
    <div style="margin-top:16pt;font-size:9pt;">
      <div style="margin-bottom:10pt;">
        CCTV Duty:......................................................................................................................................................................................................................................
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:40pt;">
        <div>Signature of Centre Superintendent</div>
      </div>
    </div>
  </div>`;

  // ── Render overlay ──
  let overlay = document.getElementById('summary-overlay');
  if (overlay) overlay.remove();
  const style = document.createElement('style');
  style.id = 'summary-print-style';
  style.textContent = `${buildPrintShellCSS({
      overlayId: 'summary-overlay',
      pageSize: 'A4',
      orientation: 'portrait',
      margins: '12mm 14mm 12mm 14mm'
    })}
    .summary-table thead { display:table-header-group; }
    .summary-table thead th {
      background:#fff!important; color:#000!important;
      -webkit-print-color-adjust:exact; print-color-adjust:exact;
    }
    .summary-table tbody tr { page-break-inside:avoid; }`;
  document.head.appendChild(style);

  overlay = document.createElement('div');
  overlay.id = 'summary-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow-y:auto;background:#fff;';
  overlay.innerHTML = `
    <div class="no-print" style="position:sticky;top:0;background:#0c1c35;color:#fff;
      z-index:10001;padding:10px 20px;display:flex;align-items:center;
      justify-content:space-between;font-family:Arial,sans-serif;font-size:13px;">
      <span>🏫 Room Summary — ${ds} · ${rooms.length} rooms · ${schools.length} schools</span>
      <div style="display:flex;gap:10px;">
        <button onclick="window.print()" style="background:#1a50d4;color:#fff;border:none;
          border-radius:5px;padding:7px 18px;font-size:13px;cursor:pointer;">
          🖨️ Print / Save PDF
        </button>
        <button onclick="closePrintSession('roomSummary','summary-overlay','summary-print-style')"
          style="background:#6b7280;color:#fff;border:none;border-radius:5px;
          padding:7px 14px;font-size:13px;cursor:pointer;">✕ Close</button>
      </div>
    </div>
    <div style="padding:10mm 0 0 0;background:#fff;">${html}</div>`;

  document.body.appendChild(overlay);
}
// ── CBSE-66 CENTRE MEMO ────────────────────────────────────────
export function printCentreMemo() {
  beginPrintSession({ reportKey: 'centreMemo' });
  const ctx = requireCurrentDateSeatingForPrint();
  if (!ctx) return;
  const ds = ctx.ds;
  const ds_state = getDateState(ds);
  const seated = ctx.seated;
  const att      = ds_state.attendance || {};

  const anyMarked = Object.values(att).some(v => v === 'P' || v === 'A');
  if (!anyMarked) {
    showModal('Attendance Required', 'Attendance has not been marked for ' + ds + '. Please mark attendance before generating Centre Memo.');
    return;
  }

  const { centreName, centreCode } = getCentreMeta();

  const dateObj = parseDate(ds);
  const yyyy    = dateObj.getFullYear();
  const mm      = String(dateObj.getMonth()+1).padStart(2,'0');
  const dd      = String(dateObj.getDate()).padStart(2,'0');
  const dateYMD = `${yyyy}-${mm}-${dd}`;

  const allCombos = [...new Map(
    seated.map(s => {
      const sub = (s.dateSubjects[ds]||[])[0];
      return sub ? [s.class+'|'+sub.code, {cls:s.class, sub}] : null;
    }).filter(Boolean)
  ).values()];

  const targetCombos = (currentSubjectFilter && currentSubjectFilter !== 'all')
    ? allCombos.filter(({cls,sub}) => (cls+'|'+sub.code)===currentSubjectFilter || sub.code===currentSubjectFilter)
    : allCombos;

  if (!targetCombos.length) {
    showModal('No subjects found','No subject data found for the selected date/filter.');
    return;
  }

  function consecutiveBatches(candList) {
    if (!candList.length) return [];
    const sorted = [...candList].sort((a,b)=>a.roll.localeCompare(b.roll));
    const batches = [];
    let start = sorted[0], end = sorted[0], members = [sorted[0]];
    for (let i=1; i<sorted.length; i++) {
      const prevRoll = parseInt(sorted[i-1].roll);
      const currRoll = parseInt(sorted[i].roll);
      // Split if gap in consecutive rolls OR if crossing a century boundary
      const consecutive = currRoll === prevRoll + 1;
      const sameCentury = Math.ceil(currRoll/100)*100 === Math.ceil(prevRoll/100)*100;
      if (consecutive && sameCentury) {
        end = sorted[i]; members.push(sorted[i]);
      } else {
        batches.push({from:start.roll, to:end.roll, members:[...members]});
        start = sorted[i]; end = sorted[i]; members = [sorted[i]];
      }
    }
    batches.push({from:start.roll, to:end.roll, members:[...members]});
    return batches;
  }

  // ── Layout constants (character positions) matching sample exactly ──
  // Total line width = 141 chars (between outer pipes)
  // |DATE OF EXAM  SUBJECT DESCRIPTION  ROLL NOS REGISTERED |ROLL NOS OF CANDIDATES |ROLL NOS OF UNFAIR  |TOTAL NO OF ANSWER BOOKS|
  // Col widths (inner content, excluding pipes):
  //   col1 = 49 chars  (roll range right-aligned + count)
  //   col2 = 23 chars  (absent rolls)
  //   col3 = 19 chars  (UFM)
  //   col4 = 24 chars  (answer books)
  // Total = 49+1+23+1+19+1+24 + 2 outer pipes = 120 chars
  // Match sample: use 77|23|19|24 = 141 with outer pipes

  const W1=72, W2=23, W3=19, W4=24;
  const TOTAL = 1 + W1 + 1 + W2 + 1 + W3 + 1 + W4 + 1; // 143
  const BORDER     = '-'.repeat(TOTAL-2);
  const borderLine = `|${BORDER}|`;

  // All rows follow same pipe positions: col widths W1,W2,W3,W4
  function padR(s,n){ s=String(s); return s.length>=n ? s.slice(0,n) : s+' '.repeat(n-s.length); }
  function padL(s,n){ s=String(s); return s.length>=n ? s.slice(0,n) : ' '.repeat(n-s.length)+s; }
  // data row: col1 right-aligns roll in W1 (leading space + right-aligned in W1-1)
  function row(c1,c2,c3,c4){
    return `|${' '+padL(c1,W1-1)}|${padR(c2,W2)}|${padR(c3,W3)}|${padR(c4,W4)}|`;
  }
  function blankRow(){
    return `|${' '.repeat(W1)}|${' '.repeat(W2)}|${' '.repeat(W3)}|${' '.repeat(W4)}|`;
  }
  // header row: col1 left-aligns label; "ROLL NOS REGISTERED" right-aligned to match data
  function hdrRow(h1,h2,h3,h4){
    return `|${padR(h1,W1)}|${padR(h2,W2)}|${padR(h3,W3)}|${padR(h4,W4)}|`;
  }

  const ROWS_PER_PAGE = 18;
  let allPages = '';
  let pageNum  = 0;

  targetCombos.forEach(({cls, sub}) => {
    const subCands = seated.filter(s => {
      const cs = (s.dateSubjects[ds]||[])[0];
      return s.class === cls && cs && cs.code === sub.code;
    });

    const classTitle  = cls === 'XII'
      ? getExamFullUpper('XII')
      : getExamFullUpper('X');
    const subjectDesc = `${sub.code}-${sub.name.toUpperCase()}`;
    const batches     = consecutiveBatches(subCands);

    let grandReg=0, grandAbsent=0;
    batches.forEach(b => {
      grandReg    += b.members.length;
      grandAbsent += b.members.filter(c=>att[c.roll]==='A').length;
    });
    const grandBooks = grandReg - grandAbsent;

    const totalPages = Math.max(1, Math.ceil(batches.length / ROWS_PER_PAGE));

    for (let p=0; p<totalPages; p++) {
      pageNum++;
      const isLastPage   = (p === totalPages - 1);
      const pageBatches  = batches.slice(p*ROWS_PER_PAGE, (p+1)*ROWS_PER_PAGE);

      // Build pre-formatted text lines
      const lines = [];

      // ── Header ──
      // Title line centred in TOTAL width
      const titleFull  = `${classTitle} ${yyyy}`;
      const memoLine   = 'CBSE-66/ CENTRE MEMO';
      const centreLine = `CENTRE- ${centreCode} ::${centreName.toUpperCase()}`;

      lines.push(` ${titleFull.padStart(Math.floor((TOTAL+titleFull.length)/2)).padEnd(TOTAL-1)}`);
      lines.push(` ${memoLine.padStart(Math.floor((TOTAL+memoLine.length)/2)).padEnd(TOTAL-1)}`);
      lines.push(` ${centreLine.padStart(Math.floor((TOTAL+centreLine.length)/2)).padEnd(TOTAL-1)}`);
      lines.push('');

      // ── Table top border ──
      lines.push(borderLine);

      // ── Column header row (all cols W1/W2/W3/W4 chars, pipes aligned with border) ──
      // Col1 header: left label + right-aligned "ROLL NOS REGISTERED" to match data alignment
      const hdrC1r1 = (()=>{ const L='DATE OF EXAM  SUBJECT DESCRIPTION', R='ROLL NOS REGISTERED'; return L+' '.repeat(W1-L.length-R.length)+R; })();
      const hdrC1r2 = 'EXAM.'.padEnd(W1);
      lines.push(hdrRow(hdrC1r1,'ROLL NOS OF CANDIDATES','ROLL NOS OF UNFAIR','TOTAL NO OF ANSWER BOOKS'));
      lines.push(hdrRow(hdrC1r2,'ABSENT, IF ANY','MEANS CASES,IF ANY','SENT TO REGIONAL OFFICE'));
      lines.push(borderLine);

      // ── Date + subject header ──
      lines.push(`|${dateYMD} ${subjectDesc}${' '.repeat(TOTAL-2-dateYMD.length-1-subjectDesc.length)}|`);

      // ── Data rows (absent list wraps across multiple lines if long) ──
      pageBatches.forEach(b => {
        const regCount  = b.members.length;
        const absentMs  = b.members.filter(c=>att[c.roll]==='A');
        const books     = regCount - absentMs.length;
        const col1      = `${b.from}-${b.to} ${regCount}`;

        // Chunk absent roll numbers into lines that fit within W2
        let chunks = [];
        if (absentMs.length === 0) {
          chunks = ['---'];
        } else {
          let cur = '';
          absentMs.forEach(c => {
            const candidate = cur ? cur + ',' + c.roll : c.roll;
            if (candidate.length <= W2) {
              cur = candidate;
            } else {
              chunks.push(cur);
              cur = c.roll;
            }
          });
          if (cur) chunks.push(cur);
        }

        // First line: all 4 columns
        lines.push(row(col1, chunks[0], '', String(books)));
        // Continuation lines: col1 blank, col2 continues, col3/4 blank
        for (let ci=1; ci<chunks.length; ci++) {
          lines.push(`|${' '.repeat(W1)}|${padR(chunks[ci],W2)}|${' '.repeat(W3)}|${' '.repeat(W4)}|`);
        }
        lines.push(blankRow());
      });

      // Pad empty rows
      const empty = ROWS_PER_PAGE - pageBatches.length;
      for (let e=0; e<empty; e++) {
        lines.push(blankRow());
        lines.push(blankRow());
      }

      // ── Subject total (last page only) ──
      if (isLastPage) {
        lines.push(borderLine);
        const totLabel = `** SUBJECT-TOTAL ** ${grandReg}`;
        const totAbsent = grandAbsent ? String(grandAbsent) : '';
        lines.push(row(totLabel, totAbsent, '', String(grandBooks)));
        lines.push(`| ${'-'.repeat(W1-1)}|${'-'.repeat(W2)}|${'-'.repeat(W3)}|${'-'.repeat(W4)}|`);
        lines.push(blankRow());
        lines.push(blankRow());
        lines.push(blankRow());
      }

      // ── Bottom border + NOTE footer ──
      lines.push(borderLine);
      // Footer lines — content padded to exactly TOTAL-2 chars between outer pipes
      function fline(txt){
        const inner = TOTAL-2;
        return '|' + txt.padEnd(inner) + '|';
      }
      lines.push(fline(' NOTE :-ONE COPY TO BE PLACED IN THE ANSWER BOOK BAG'));
      lines.push(fline('        ONE TO BE DELIVERED AT THE RECEIVING CENTER AND'));
      lines.push(fline('        ONE TO BE RETAINED BY THE CENTRE FOR RECORD'));
      lines.push('|' + ' '.repeat(TOTAL-1-'SIGNATURE OF THE CENTRE SUPDT. |'.length) + 'SIGNATURE OF THE CENTRE SUPDT. |');
      lines.push('|' + ' '.repeat(TOTAL-1-'RUBBER STAMP AND DATE |'.length) + 'RUBBER STAMP AND DATE |');
      lines.push(borderLine);

      // ── Render as <pre> page ──
      const preText = lines.join('\n');
      const pageLabel = `PAGE : ${pageNum}`;

      allPages += `
      <div class="memo-page" style="page-break-after:always;">
        <div style="display:flex;justify-content:space-between;margin-bottom:2pt;">
          <div></div>
          <div style="font-size:8pt;font-family:'Courier New',monospace;">${pageLabel}</div>
        </div>
        <pre style="font-family:'Courier New',Courier,monospace;font-size:7.8pt;
          line-height:1.18;margin:0;padding:0;white-space:pre;
          overflow:hidden;">${preText}</pre>
      </div>`;
    }
  });

  // ── Render overlay ──
  let overlay = document.getElementById('memo-overlay');
  if (overlay) overlay.remove();
  const style = document.createElement('style');
  style.id = 'memo-print-style';
  style.textContent = `${buildPrintShellCSS({
      overlayId: 'memo-overlay',
      pageSize: 'A4',
      orientation: 'landscape',
      margins: '6mm 8mm 6mm 8mm'
    })}
    .memo-page { page-break-after:always; }
    .memo-page:last-child { page-break-after:avoid; }`;
  document.head.appendChild(style);

  overlay = document.createElement('div');
  overlay.id = 'memo-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow-y:auto;background:#fff;';
  overlay.innerHTML = `
    <div class="no-print" style="position:sticky;top:0;background:#0c1c35;color:#fff;
      z-index:10001;padding:10px 20px;display:flex;align-items:center;
      justify-content:space-between;font-family:Arial,sans-serif;font-size:13px;">
      <span>📋 Centre Memo — ${ds} &nbsp;·&nbsp; ${pageNum} page(s)</span>
      <div style="display:flex;gap:10px;">
        <button onclick="window.print()" style="background:#1a50d4;color:#fff;border:none;
          border-radius:5px;padding:7px 18px;font-size:13px;cursor:pointer;">
          🖨️ Print / Save PDF
        </button>
        <button onclick="closePrintSession('centreMemo','memo-overlay','memo-print-style')"
          style="background:#6b7280;color:#fff;border:none;border-radius:5px;
          padding:7px 14px;font-size:13px;cursor:pointer;">✕ Close</button>
      </div>
    </div>
    <div style="padding:10mm 0 0 0;background:#fff;">${allPages}</div>`;

  document.body.appendChild(overlay);
}
// ── FORM-66: STATEMENT OF CANDIDATES APPEARED ─────────────────
export function printForm66() {
  beginPrintSession({ reportKey: 'form66' });
  const ctx = requireCurrentDateSeatingForPrint();
  if (!ctx) return;
  const ds = ctx.ds;
  const ds_state = getDateState(ds);
  const seated = ctx.seated;
  const att      = ds_state.attendance || {};

  // ── 1. Check attendance is marked ──
  const anyMarked = Object.values(att).some(v => v === 'P' || v === 'A');
  if (!anyMarked) {
    showModal('Attendance Required', 'Attendance has not been marked for ' + ds + '. Please mark attendance before generating Form-66.');
    return;
  }

  // ── 2. Determine which subjects to generate ──
  // If a subject filter is active use only that subject, else generate all subjects
  const allSubsInDate = [...new Map(
    seated.map(s => {
      const sub = (s.dateSubjects[ds]||[])[0];
      return sub ? [s.class+'|'+sub.code, {cls: s.class, sub}] : null;
    }).filter(Boolean)
  ).values()];

  const targetCombos = (currentSubjectFilter && currentSubjectFilter !== 'all')
    ? allSubsInDate.filter(({cls, sub}) => (cls+'|'+sub.code) === currentSubjectFilter || sub.code === currentSubjectFilter)
    : allSubsInDate;

  if (!targetCombos.length) {
    showModal('No subjects found', 'No subject data found for the selected date/filter.');
    return;
  }

  const { centreName, centreCode } = getCentreMeta();

  // Format: Saturday, 21 February, 2026
  const dateObj  = parseDate(ds);
  const dateStr  = dateObj.toLocaleDateString('en-IN', {weekday:'long', day:'numeric', month:'long', year:'numeric'});

  // ── Helper: compute centurial series rows ──
  // A centurial series = block of 100 consecutive roll numbers
  // e.g. 32188029-32188100 = century 321880xx starting at 29
  function buildCenturialRows(candList) {
    if (!candList.length) return [];

    // Sort by roll number
    const sorted = [...candList].sort((a,b) => a.roll.localeCompare(b.roll));

    // Group into century buckets: ceil(roll / 100) * 100
    // e.g. rolls 001-100 → bucket 100, 101-200 → bucket 200
    const buckets = {};
    sorted.forEach(c => {
      const rollNum = parseInt(c.roll);
      const bucketKey = Math.ceil(rollNum / 100) * 100;
      if (!buckets[bucketKey]) buckets[bucketKey] = [];
      buckets[bucketKey].push(c);
    });

    return Object.keys(buckets).sort((a,b)=>Number(a)-Number(b)).map(key => {
      const group    = buckets[key];
      const rolls    = group.map(c => c.roll).sort();
      const fromRoll = rolls[0];
      const toRoll   = rolls[rolls.length - 1];
      const total    = group.length;
      const absentList = group.filter(c => att[c.roll] === 'A').map(c => c.roll);
      const absentCount = absentList.length;
      const answerBooks = total - absentCount;
      return { fromRoll, toRoll, total, absentList, absentCount, answerBooks };
    });
  }

  let pages = '';

  targetCombos.forEach(({cls, sub}) => {
    // Get candidates for this class+subject on this date
    const subCands = seated.filter(s => {
      const cs = (s.dateSubjects[ds]||[])[0];
      return s.class === cls && cs && cs.code === sub.code;
    });

    const rows       = buildCenturialRows(subCands);
    const grandTotal = rows.reduce((s,r) => s+r.total, 0);
    const grandAbsent= rows.reduce((s,r) => s+r.absentCount, 0);
    const grandBooks = rows.reduce((s,r) => s+r.answerBooks, 0);
    const classLabel = cls === 'XII' ? 'AISSCE' : 'SSE';
    const examTitle  = getExamFullUpper(cls);
    const subjectStr = sub.code + '  ' + sub.name.toUpperCase();

    // Build table rows
    let tableRows = rows.map(r => `
      <tr>
        <td style="border:1px solid #000;padding:5px 8px;text-align:center;font-size:9.5pt;">
          ${r.fromRoll} &ndash; ${r.toRoll}
        </td>
        <td style="border:1px solid #000;padding:5px 8px;text-align:center;font-size:9.5pt;">
          ${r.total}
        </td>
        <td style="border:1px solid #000;padding:5px 8px;text-align:left;font-size:9pt;line-height:1.5;word-break:break-word;font-family:'Courier New',monospace;">
          ${r.absentList.length ? r.absentList.join(', ') : 'NIL'}
        </td>
        <td style="border:1px solid #000;padding:5px 8px;text-align:center;font-size:9.5pt;">
          ${r.absentCount}
        </td>
        <td style="border:1px solid #000;padding:5px 8px;text-align:center;font-size:9.5pt;">
          &ndash;
        </td>
        <td style="border:1px solid #000;padding:5px 8px;text-align:center;font-size:9.5pt;">
          ${r.answerBooks}
        </td>
      </tr>`).join('');

    // Pad with empty rows so table is consistent (min 8 rows)
    const emptyRowsNeeded = Math.max(0, 8 - rows.length);
    for (let i=0; i<emptyRowsNeeded; i++) {
      tableRows += `<tr>
        <td style="border:1px solid #000;padding:5px 8px;height:22pt;">&nbsp;</td>
        <td style="border:1px solid #000;"></td>
        <td style="border:1px solid #000;"></td>
        <td style="border:1px solid #000;"></td>
        <td style="border:1px solid #000;"></td>
        <td style="border:1px solid #000;"></td>
      </tr>`;
    }

    pages += `
    <div class="form66-page" style="width:190mm;min-height:270mm;margin:0 auto;
      font-family:Calibri,Arial,sans-serif;font-size:10pt;
      display:flex;flex-direction:column;page-break-after:always;">

      <!-- ── LETTERHEAD ── -->
      <div style="position:relative;border-bottom:2px solid #000;padding-bottom:6pt;margin-bottom:8pt;">
        <div style="font-size:8.5pt;font-style:italic;position:absolute;top:0;right:0;">
          CBSE-66/Theory Exam
        </div>
        <div style="text-align:center;">
          <div style="font-size:13pt;font-weight:bold;letter-spacing:0.5px;">
            CENTRAL BOARD OF SECONDARY EDUCATION, DELHI
          </div>
          <div style="font-size:10.5pt;font-weight:bold;margin-top:2pt;">${examTitle}</div>
          <div style="font-size:11pt;font-weight:bold;margin-top:2pt;">
            STATEMENT OF CANDIDATES APPEARED
          </div>
          <div style="font-size:10pt;margin-top:2pt;">${examTitle} (${getExamSessionLabel()})</div>
        </div>
      </div>

      <!-- ── HEADER FIELDS ── -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:6pt;">
        <tr>
          <td style="font-size:10pt;padding:2pt 0;width:65%;">
            <b>Name of the Exam. Centre :</b> ${centreName}
          </td>
          <td style="font-size:10pt;padding:2pt 0;text-align:right;">
            <b>Date:</b> ${dateStr}
          </td>
        </tr>
        <tr>
          <td style="font-size:10pt;padding:2pt 0;">
            <b>Centre Number:</b> ${centreCode}
          </td>
        </tr>
        <tr>
          <td colspan="2" style="font-size:10pt;padding:2pt 0;">
            <b>Subject:</b> ${subjectStr}
          </td>
        </tr>
      </table>

      <!-- ── MAIN TABLE ── -->
      <table style="width:100%;border-collapse:collapse;flex:1;">
        <thead>
          <tr>
            <th style="border:1px solid #000;padding:6px 5px;font-size:9pt;text-align:center;width:22%;background:#fff;color:#000;">
              Roll No. of candidates<br>registered as per<br>List of Candidates
            </th>
            <th style="border:1px solid #000;padding:6px 5px;font-size:9pt;text-align:center;width:13%;background:#fff;color:#000;">
              Total No. of<br>registered<br>candidates in<br>each centurial<br>series
            </th>
            <th style="border:1px solid #000;padding:6px 5px;font-size:9pt;text-align:center;width:30%;background:#fff;color:#000;">
              Roll No. of candidates absent
            </th>
            <th style="border:1px solid #000;padding:6px 5px;font-size:9pt;text-align:center;width:10%;background:#fff;color:#000;">
              Total No.<br>of<br>absentees<br>in<br>centurial<br>series
            </th>
            <th style="border:1px solid #000;padding:6px 5px;font-size:9pt;text-align:center;width:10%;background:#fff;color:#000;">
              Roll Nos.<br>of UFM<br>cases,<br>if any**
            </th>
            <th style="border:1px solid #000;padding:6px 5px;font-size:9pt;text-align:center;width:15%;background:#fff;color:#000;">
              No. of<br>Answer<br>books<br>sent to<br>Board&#39;s<br>Office
            </th>
          </tr>
          <tr>
            <th style="border:1px solid #000;padding:3px;font-size:8.5pt;text-align:center;background:#fff;color:#000;">1</th>
            <th style="border:1px solid #000;padding:3px;font-size:8.5pt;text-align:center;background:#fff;color:#000;">2</th>
            <th style="border:1px solid #000;padding:3px;font-size:8.5pt;text-align:center;background:#fff;color:#000;">3</th>
            <th style="border:1px solid #000;padding:3px;font-size:8.5pt;text-align:center;background:#fff;color:#000;">4</th>
            <th style="border:1px solid #000;padding:3px;font-size:8.5pt;text-align:center;background:#fff;color:#000;">5</th>
            <th style="border:1px solid #000;padding:3px;font-size:8.5pt;text-align:center;background:#fff;color:#000;">6</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
          <!-- Total row -->
          <tr style="font-weight:bold;border-top:1.5px solid #000;">
            <td style="border:1px solid #000;padding:5px 8px;text-align:right;font-size:9.5pt;">Total</td>
            <td style="border:1px solid #000;padding:5px 8px;text-align:center;font-size:9.5pt;">${grandTotal}</td>
            <td style="border:1px solid #000;padding:5px 8px;font-size:9.5pt;"></td>
            <td style="border:1px solid #000;padding:5px 8px;text-align:center;font-size:9.5pt;">${grandAbsent}</td>
            <td style="border:1px solid #000;padding:5px 8px;text-align:center;font-size:9.5pt;">&ndash;</td>
            <td style="border:1px solid #000;padding:5px 8px;text-align:center;font-size:9.5pt;">${grandBooks}</td>
          </tr>
        </tbody>
      </table>

      <!-- ── FOOTER ── -->
      <div style="margin-top:10pt;font-size:9pt;">
        <div style="font-weight:bold;margin-bottom:8pt;">
          Witness of two Assistant Superintendents.
        </div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:4pt;">
          <tr>
            <td style="width:50%;font-size:9pt;padding-bottom:14pt;">
              1. Signature .........................................
            </td>
            <td style="font-size:9pt;padding-bottom:14pt;">
              2. Signature .........................................
            </td>
          </tr>
          <tr>
            <td style="font-size:9pt;padding-bottom:14pt;">
              Name .................................................
            </td>
            <td style="font-size:9pt;padding-bottom:14pt;">
              Name .................................................
            </td>
          </tr>
          <tr>
            <td style="font-size:9pt;padding-bottom:14pt;">
              Design. .............................................&nbsp;TEACHER
            </td>
            <td style="font-size:9pt;padding-bottom:14pt;">
              Design. .............................................&nbsp;TEACHER
            </td>
          </tr>
          <tr>
            <td style="font-size:9pt;padding-bottom:18pt;">
              Address..............................................
            </td>
            <td style="font-size:9pt;padding-bottom:18pt;">
              Address..............................................
            </td>
          </tr>
        </table>

        <table style="width:100%;border-collapse:collapse;border-top:1.5px solid #000;">
          <tr>
            <td style="width:33%;font-size:9pt;padding-top:16pt;">Date</td>
            <td style="width:34%;font-size:9pt;padding-top:16pt;text-align:center;">Stamp of the Centre</td>
            <td style="width:33%;font-size:9pt;padding-top:16pt;text-align:right;">Sign. of Centre Superintendent</td>
          </tr>
        </table>

        <div style="margin-top:8pt;border-top:1px solid #999;padding-top:6pt;">
          <p style="font-size:8pt;margin:0 0 4pt 0;">
            <b>NOTE :</b> ROLL NOS. OF CANDIDATES REGISTERED SHALL BE WRITTEN BEFORE THE COMMENCEMENT OF EXAMINATION
            SEPARATELY FOR EACH CENTURIAL SERIES.
          </p>
          <p style="font-size:8pt;margin:0 0 4pt 0;">
            Certified that No. of answer books indicated in Col. No. 6 have been packed for despatch (witness of two Assistant
            Superintendents one should be from other than the Examination Centre.
          </p>
          <p style="font-size:8pt;margin:0;">
            ** Both the answer books of the candidates should be tagged together and sealed in a cover superscribed as
            &ldquo;Cover containing answer book(s) of UFM cases.&rdquo; This sealed cover should be placed within the packet of
            Answer Books being sent to the Regional Office.
          </p>
        </div>
      </div>

    </div>`;
  }); // end targetCombos.forEach

  // ── Render overlay ──
  let overlay = document.getElementById('form66-overlay');
  if (overlay) overlay.remove();
  const style = document.createElement('style');
  style.id = 'form66-print-style';
  style.textContent = `${buildPrintShellCSS({
      overlayId: 'form66-overlay',
      pageSize: 'A4',
      orientation: 'portrait',
      margins: '12mm 14mm 12mm 14mm'
    })}
    .form66-page { page-break-after:always; min-height:auto; background:#fff!important; color:#000!important; }
    .form66-page:last-child { page-break-after:avoid; }
    .form66-page, .form66-page * { color:#000!important; }
    .form66-page table { background:#fff!important; }
    .form66-page table th,
    .form66-page table td {
      background:#fff!important;
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
      color:#000!important;
    }`;
  document.head.appendChild(style);

  overlay = document.createElement('div');
  overlay.id = 'form66-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow-y:auto;background:#fff;';
  overlay.innerHTML = `
    <div class="no-print" style="position:sticky;top:0;background:#0c1c35;color:#fff;
      z-index:10001;padding:10px 20px;display:flex;align-items:center;
      justify-content:space-between;font-family:Arial,sans-serif;font-size:13px;">
      <span>📄 Form-66 — ${ds} &nbsp;·&nbsp; ${targetCombos.length} subject(s)</span>
      <div style="display:flex;gap:10px;">
        <button onclick="window.print()" style="background:#1a50d4;color:#fff;border:none;
          border-radius:5px;padding:7px 18px;font-size:13px;cursor:pointer;">
          🖨️ Print / Save PDF
        </button>
        <button onclick="closePrintSession('form66','form66-overlay','form66-print-style')"
          style="background:#6b7280;color:#fff;border:none;border-radius:5px;
          padding:7px 14px;font-size:13px;cursor:pointer;">✕ Close</button>
      </div>
    </div>
    <div style="padding:10mm 0 0 0;background:#fff;">${pages}</div>`;

  document.body.appendChild(overlay);
}
// ── CONSOLIDATED ATTENDANCE SHEET ─────────────────────────────
export function printAttendanceSheet(cls) {
  beginPrintSession({ reportKey: cls === 'XII' ? 'attendanceXII' : 'attendanceX' });
  if (!state.candidates || !state.candidates.length) {
    showModal('No Data', 'Please load candidate data first.'); return;
  }

  const centreName = document.getElementById('cfg-centre-name').value || 'Centre';
  const centreCode = document.getElementById('cfg-centre-code').value || '';

  // ── Filter candidates by class, sort by roll ──
  const classCands = [...state.candidates.filter(c => c.class === cls)]
    .sort((a,b) => a.roll.localeCompare(b.roll));
  if (!classCands.length) {
    showModal('No Data', 'No ' + cls + ' candidates found.'); return;
  }

  // ── Collect ALL subject codes used by this class and map to exact dates ──
  const codeSet = new Set();
  const codeToDate = {};
  classCands.forEach(c => {
    Object.entries(c.dateSubjects).forEach(([ds, subs]) => {
      subs.forEach(s => {
        codeSet.add(s.code);
        codeToDate[s.code] = ds;
      });
    });
  });
  const allCodes = [...codeSet].sort((a,b) => Number(a)-Number(b));

  // ── Collect all attendance across all dates ──
  // att[roll] = 'A' if absent on that date, else 'P'
  function getAtt(roll, ds) {
    const a = (state.dateStates[ds] && state.dateStates[ds].attendance) || {};
    return a[roll] === 'A' ? 'A' : 'P'; // unmarked = P
  }

  // ── For each candidate, which codes are they registered for ──
  function candCodes(cand) {
    const s = new Set();
    Object.values(cand.dateSubjects).forEach(subs => subs.forEach(sub => s.add(sub.code)));
    return s;
  }

  // ── Pagination: 20 rows per page ──
  const ROWS_PER_PAGE = 20;
  const examTitle = getExamShort(cls).toUpperCase() + ' SCH CERT EXAM.';

  // ── Build column headers: code + date in bracket ──
  // Format: 041 (17-Feb)
  const colHeaders = allCodes.map(code => {
    const ds = codeToDate[code] || '';
    // Short date: DD-Mon
    let shortDate = '';
    if (ds) {
      const parts = ds.split('-'); // ['17', 'Feb', '2026']
      shortDate = parts[0] + '-' + parts[1];
    }
    return { code, shortDate };
  });

  // ── Styles ──
  const tdBase   = 'border:1px solid #999;font-size:7.5pt;text-align:center;padding:2px 1px;white-space:nowrap;';
  const thBase   = 'border:1px solid #000;font-size:7pt;text-align:center;padding:3px 2px;background:#f0f0f0;color:#000;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact;';
  const rollBase = 'border:1px solid #999;font-size:8pt;text-align:center;padding:2px 3px;font-family:"Courier New",monospace;font-weight:bold;white-space:nowrap;';
  const nameBase = 'border:1px solid #999;font-size:7.5pt;padding:2px 4px;text-align:left;white-space:nowrap;overflow:hidden;max-width:80px;';

  // ── Build pages ──
  let pages = '';
  const totalPages = Math.ceil(classCands.length / ROWS_PER_PAGE);

  for (let p = 0; p < totalPages; p++) {
    const pageCands = classCands.slice(p * ROWS_PER_PAGE, (p+1) * ROWS_PER_PAGE);

    // ── Header row (repeated each page) ──
    const theadCols = colHeaders.map(h =>
      `<th style="${thBase}min-width:26px;max-width:32px;"><b>${h.code}</b><br>
       <span style="font-weight:normal;font-size:6.5pt;">(${h.shortDate})</span></th>`
    ).join('');

    // ── Data rows ──
    const dataRows = pageCands.map(cand => {
      const registered = candCodes(cand);

      // Is candidate absent in ALL registered subjects that appear in the sheet?
      // Only consider codes present in allCodes (this class's subjects)
      const registeredInSheet = [...registered].filter(code => allCodes.includes(code));
      const absentAll = registeredInSheet.length > 0 && registeredInSheet.every(code => {
        const ds = codeToDate[code];
        return ds && getAtt(cand.roll, ds) === 'A';
      });

      // For absentAll: wrap roll in a circled span instead of trying to circle the td
      const rollStyle = rollBase;
      const rollDisplay = absentAll
        ? `<span style="display:inline-block;color:#c00;border:2px solid #c00;
            border-radius:50%;padding:1px 4px;font-size:7.5pt;font-weight:bold;
            -webkit-print-color-adjust:exact;print-color-adjust:exact;">${cand.roll}</span>`
        : cand.roll;

      const cells = allCodes.map(code => {
        if (!registered.has(code)) {
          // Not registered
          return `<td style="${tdBase}color:#bbb;">...</td>`;
        }
        const ds = codeToDate[code];
        const att = ds ? getAtt(cand.roll, ds) : 'P';
        if (att === 'A') {
          // Absent — circle effect: red border + red bold text
          return `<td style="${tdBase}font-weight:bold;color:#c00;
            border:2px solid #c00;border-radius:4px;
            -webkit-print-color-adjust:exact;print-color-adjust:exact;">${code}</td>`;
        } else {
          // Present
          return `<td style="${tdBase}">${code}</td>`;
        }
      }).join('');

      // Truncate name to ~15 chars
      const shortName = cand.name.split(' ').slice(0,2).join(' ');

      return `<tr style="height:22px;">
        <td style="${rollStyle}">${rollDisplay}</td>
        <td style="${nameBase}" title="${cand.name}">${shortName}</td>
        <td style="${tdBase}font-size:7pt;">${cand.cat||''}</td>
        ${cells}
      </tr>`;
    }).join('');

    pages += `
    <div class="att-page" style="width:267mm;margin:0 auto;font-family:Arial,sans-serif;
      page-break-after:always;padding:4mm 0;">

      <!-- Header -->
      <div style="text-align:center;font-size:8.5pt;font-weight:bold;margin-bottom:3pt;line-height:1.4;">
        ${examTitle} ${getExamYear()} — CENTRE/ROLL NO WISE CONSOLIDATED ATTENDANCE SHEET<br>
        <span style="font-weight:normal;">CENTRE : ${centreCode} — ${centreName.toUpperCase()}</span>
        &nbsp;&nbsp;|&nbsp;&nbsp; CLASS : ${cls}
        &nbsp;&nbsp;|&nbsp;&nbsp; Page ${p+1} of ${totalPages}
      </div>
      <div style="font-size:7.5pt;margin-bottom:4pt;color:#555;text-align:center;">
        ⬤ = Absent in ALL subjects &nbsp;&nbsp;
        <span style="color:#c00;border:1.5px solid #c00;border-radius:3px;padding:0 3px;">Code</span> = Absent in that subject
      </div>

      <!-- Table -->
      <table style="width:100%;border-collapse:collapse;table-layout:auto;">
        <thead>
          <tr>
            <th style="${thBase}min-width:64px;">ROLL NO.</th>
            <th style="${thBase}min-width:70px;text-align:left;">NAME</th>
            <th style="${thBase}min-width:22px;">CAT</th>
            ${theadCols}
          </tr>
        </thead>
        <tbody>${dataRows}</tbody>
      </table>
    </div>`;
  }

  // ── Overlay + print ──
  const overlayId = 'attsheet-overlay-' + cls;
  const styleId   = 'attsheet-style-' + cls;
  let overlay = document.getElementById(overlayId);
  if (overlay) overlay.remove();
  let pStyle = document.getElementById(styleId);
  if (pStyle) pStyle.remove();

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `${buildPrintShellCSS({
      overlayId,
      pageSize: 'A4',
      orientation: 'landscape',
      margins: '6mm 8mm 6mm 8mm'
    })}
    .att-page { page-break-after:always; padding:0!important; }
    .att-page:last-child { page-break-after:avoid; }
    .att-page table thead { display:table-header-group; }
    .att-page table thead th {
      background:#f0f0f0!important;color:#000!important;
      -webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;
    }
    .att-page table td, .att-page table th {
      -webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;
    }`;
  document.head.appendChild(style);

  overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow-y:auto;background:#fff;';
  overlay.innerHTML = `
    <div class="no-print" style="position:sticky;top:0;background:#0c1c35;color:#fff;
      z-index:10001;padding:10px 20px;display:flex;align-items:center;
      justify-content:space-between;font-family:Arial,sans-serif;font-size:13px;">
      <span>📋 Attendance Sheet (${cls}) — ${classCands.length} candidates · ${allCodes.length} subjects · ${totalPages} pages</span>
      <div style="display:flex;gap:10px;">
        <button onclick="window.print()" style="background:#1a50d4;color:#fff;border:none;
          border-radius:5px;padding:7px 18px;font-size:13px;cursor:pointer;">
          🖨️ Print / Save PDF
        </button>
        <button onclick="closePrintSession('${cls==='XII'?'attendanceXII':'attendanceX'}','${overlayId}','${styleId}')"
          style="background:#6b7280;color:#fff;border:none;border-radius:5px;
          padding:7px 14px;font-size:13px;cursor:pointer;">✕ Close</button>
      </div>
    </div>
    <div style="padding:10mm 0 0 0;background:#fff;">${pages}</div>`;

  document.body.appendChild(overlay);
}
// ── CENTURY SERIES REPORT ──────────────────────────────────────
export function printCenturySeries() {
  beginPrintSession({ reportKey: 'century' });
  const ctx = requireCurrentDateSeatingForPrint();
  if (!ctx) return;
  const ds = ctx.ds;
  const ds_state = getDateState(ds);
  const seated = ctx.seated;
  const att      = ds_state.attendance || {};
  const { centreName, centreCode } = getCentreMeta();

  const dateObj = parseDate(ds);
  const yyyy    = dateObj.getFullYear();
  const dateStr = dateObj.toLocaleDateString('en-IN', {weekday:'long', day:'2-digit', month:'short', year:'numeric'});

  // ── Build combos (same as Form-66) ──
  const allCombos = [...new Map(
    seated.map(s => {
      const sub = (s.dateSubjects[ds]||[])[0];
      return sub ? [s.class+'|'+sub.code, {cls:s.class, sub}] : null;
    }).filter(Boolean)
  ).values()];

  const targetCombos = (currentSubjectFilter && currentSubjectFilter !== 'all')
    ? allCombos.filter(({cls,sub}) => (cls+'|'+sub.code)===currentSubjectFilter)
    : allCombos;

  if (!targetCombos.length) {
    showModal('No subjects found','No subject data found for the selected date.');
    return;
  }

  // ── Centurial series builder (same bucket logic as Form-66) ──
  function buildCenturialRows(candList) {
    if (!candList.length) return [];
    const sorted = [...candList].sort((a,b) => a.roll.localeCompare(b.roll));
    const buckets = {};
    sorted.forEach(c => {
      const key = Math.ceil(parseInt(c.roll) / 100) * 100;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(c);
    });
    return Object.keys(buckets).sort((a,b)=>Number(a)-Number(b)).map(key => {
      const group     = buckets[key];
      const rolls     = group.map(c => c.roll).sort();
      const fromRoll  = rolls[0];
      const toRoll    = rolls[rolls.length-1];
      const total     = group.length;
      // absent: marked A; unmarked = present
      const absentList = group.filter(c => att[c.roll] === 'A');
      const absentCount = absentList.length;
      const presentList = group.filter(c => att[c.roll] !== 'A'); // unmarked = present

      // ── Room breakdown of PRESENT candidates only ──
      // group present candidates by room
      const roomMap = {};
      presentList.forEach(c => {
        // find their seated record to get roomNo
        const seat = seated.find(s => s.roll === c.roll);
        if (!seat) return;
        const rn = seat.roomNo;
        if (!roomMap[rn]) roomMap[rn] = { present: 0, absent: 0 };
        roomMap[rn].present++;
      });
      // also count absents per room for context
      absentList.forEach(c => {
        const seat = seated.find(s => s.roll === c.roll);
        if (!seat) return;
        const rn = seat.roomNo;
        if (!roomMap[rn]) roomMap[rn] = { present: 0, absent: 0 };
        roomMap[rn].absent++;
      });

      const roomBreakdown = Object.keys(roomMap)
        .sort((a,b) => Number(a)-Number(b))
        .map(rn => ({ room: Number(rn), present: roomMap[rn].present, absent: roomMap[rn].absent }));

      return { fromRoll, toRoll, total, absentCount, presentCount: total-absentCount, roomBreakdown };
    });
  }

  let pages = '';

  targetCombos.forEach(({cls, sub}) => {
    const subCands  = seated.filter(s => {
      const cs = (s.dateSubjects[ds]||[])[0];
      return s.class === cls && cs && cs.code === sub.code;
    });

    const rows       = buildCenturialRows(subCands);
    const grandTotal = rows.reduce((s,r) => s+r.total, 0);
    const grandPresent = rows.reduce((s,r) => s+r.presentCount, 0);
    const grandAbsent  = rows.reduce((s,r) => s+r.absentCount, 0);
    const classLabel   = cls === 'XII' ? 'AISSCE' : 'SSE';
    const subjectStr   = sub.code + '  ' + sub.name.toUpperCase();

    // ── Table rows: one century per row, room breakdown as sub-rows in col3 ──
    let tableRows = rows.map(r => {
      const roomLines = r.roomBreakdown.length
        ? r.roomBreakdown.map(rb =>
            `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-bottom:1px solid #e5e7eb;min-height:34px;">
              <span style="font-weight:700;font-size:14pt;">Room ${String(rb.room).padStart(2,'0')}</span>
              <span style="font-size:14pt;">${rb.present} present${rb.absent ? ` <span style="color:#888;font-size:11pt;">(${rb.absent} absent)</span>` : ''}</span>
            </div>`
          ).join('')
        : '<div style="padding:8px 10px;color:#999;font-size:14pt;">—</div>';

      return `
      <tr style="page-break-inside:avoid;border-bottom:2px solid #999;">
        <td style="border:1px solid #000;padding:8px 10px;text-align:center;font-size:14pt;font-family:'Courier New',monospace;font-weight:700;vertical-align:middle;line-height:1.6;">
          ${r.fromRoll}<br>&ndash;<br>${r.toRoll}
        </td>
        <td style="border:1px solid #000;padding:8px 10px;text-align:center;font-size:14pt;font-weight:700;vertical-align:middle;">
          ${r.total}
        </td>
        <td style="border:1px solid #000;padding:0;font-size:10pt;vertical-align:top;">
          ${roomLines}
        </td>
        <td style="border:1px solid #000;padding:8px 10px;text-align:center;font-size:14pt;font-weight:bold;vertical-align:middle;">
          ${r.presentCount}
        </td>
        <td style="border:1px solid #000;padding:8px 10px;text-align:center;font-size:14pt;font-weight:700;vertical-align:middle;">
          ${r.absentCount || '&mdash;'}
        </td>
      </tr>`;
    }).join('');

    // Grand total row
    const grandRow = `
    <tr style="background:#1c3557;color:#fff;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
      <td style="border:1px solid #000;padding:9px 10px;text-align:center;font-size:14pt;">TOTAL</td>
      <td style="border:1px solid #000;padding:9px 10px;text-align:center;font-size:14pt;">${grandTotal}</td>
      <td style="border:1px solid #000;padding:9px 10px;text-align:center;font-size:14pt;"></td>
      <td style="border:1px solid #000;padding:9px 10px;text-align:center;font-size:14pt;">${grandPresent}</td>
      <td style="border:1px solid #000;padding:9px 10px;text-align:center;font-size:14pt;">${grandAbsent || '&mdash;'}</td>
    </tr>`;

    pages += `
    <div class="century-page" style="width:190mm;margin:0 auto;
      font-family:Calibri,Arial,sans-serif;font-size:10pt;
      page-break-after:always;">

      <!-- ── LETTERHEAD ── -->
      <div style="position:relative;border-bottom:2px solid #000;padding-bottom:6pt;margin-bottom:8pt;">
        <div style="font-size:8.5pt;font-style:italic;position:absolute;top:0;right:0;">
          CBSE-66/Theory Exam/${yyyy}
        </div>
        <div style="text-align:center;">
          <div style="font-size:13pt;font-weight:bold;letter-spacing:0.5px;">
            CENTRAL BOARD OF SECONDARY EDUCATION, DELHI
          </div>
          <div style="font-size:10.5pt;font-weight:bold;margin-top:2pt;">THEORY EXAMINATION</div>
          <div style="font-size:11pt;font-weight:bold;margin-top:2pt;">
            CENTURY SERIES — ROOM WISE ANSWER BOOK DISTRIBUTION
          </div>
          <div style="font-size:10pt;margin-top:2pt;">${classLabel} (${yyyy-1}-${String(yyyy).slice(2)})</div>
        </div>
      </div>

      <!-- ── HEADER FIELDS ── -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:6pt;">
        <tr>
          <td style="font-size:10pt;padding:2pt 0;width:65%;"><b>Name of the Exam. Centre :</b> ${centreName}</td>
          <td style="font-size:10pt;padding:2pt 0;text-align:right;"><b>Date:</b> ${dateStr}</td>
        </tr>
        <tr>
          <td style="font-size:10pt;padding:2pt 0;"><b>Centre Number:</b> ${centreCode}</td>
        </tr>
        <tr>
          <td colspan="2" style="font-size:10pt;padding:2pt 0;"><b>Subject:</b> ${subjectStr}</td>
        </tr>
      </table>

      <!-- ── MAIN TABLE ── -->
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="border:1px solid #000;padding:6px 5px;font-size:9pt;text-align:center;width:22%;background:#fff;color:#000;">
              Roll No. Range<br>(Centurial Series)
            </th>
            <th style="border:1px solid #000;padding:6px 5px;font-size:9pt;text-align:center;width:10%;background:#fff;color:#000;">
              Total<br>Registered
            </th>
            <th style="border:1px solid #000;padding:6px 5px;font-size:9pt;text-align:center;width:40%;background:#fff;color:#000;">
              Room-wise Distribution of Present Candidates<br>
              <span style="font-size:8pt;font-weight:normal;">(Room No. → Present count, absent in brackets)</span>
            </th>
            <th style="border:1px solid #000;padding:6px 5px;font-size:9pt;text-align:center;width:14%;background:#fff;color:#000;">
              Total<br>Present<br>(Answer Books)
            </th>
            <th style="border:1px solid #000;padding:6px 5px;font-size:9pt;text-align:center;width:14%;background:#fff;color:#000;">
              Total<br>Absent
            </th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
          ${grandRow}
        </tbody>
      </table>

      <!-- ── FOOTER ── -->
      <div style="margin-top:20pt;display:flex;justify-content:space-between;font-size:9pt;">
        <div>
          <b>Asst. Superintendent-1:</b><br><br>
          Signature: _______________________
        </div>
        <div style="text-align:center;">
          <b>Asst. Superintendent-2:</b><br><br>
          Signature: _______________________
        </div>
        <div style="text-align:right;">
          <b>Signature of Centre Supdt.</b><br><br>
          (with Rubber Stamp)
        </div>
      </div>

    </div>`;
  }); // end targetCombos

  // ── Overlay ──
  let overlay = document.getElementById('century-overlay');
  if (overlay) overlay.remove();
  const style = document.createElement('style');
  style.id = 'century-print-style';
  style.textContent = `${buildPrintShellCSS({
      overlayId: 'century-overlay',
      pageSize: 'A4',
      orientation: 'portrait',
      margins: '12mm 14mm 12mm 14mm'
    })}
    .century-page { page-break-after:always; }
    .century-page:last-child { page-break-after:avoid; }
    .century-page table thead th {
      background:#fff!important; color:#000!important;
      -webkit-print-color-adjust:exact; print-color-adjust:exact;
    }
    .century-page tr { page-break-inside:avoid; }`;
  document.head.appendChild(style);

  overlay = document.createElement('div');
  overlay.id = 'century-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow-y:auto;background:#fff;';
  overlay.innerHTML = `
    <div class="no-print" style="position:sticky;top:0;background:#0c1c35;color:#fff;
      z-index:10001;padding:10px 20px;display:flex;align-items:center;
      justify-content:space-between;font-family:Arial,sans-serif;font-size:13px;">
      <span>📊 Century Series — ${ds} · ${targetCombos.length} subject(s)</span>
      <div style="display:flex;gap:10px;">
        <button onclick="window.print()" style="background:#1a50d4;color:#fff;border:none;
          border-radius:5px;padding:7px 18px;font-size:13px;cursor:pointer;">
          🖨️ Print / Save PDF
        </button>
        <button onclick="closePrintSession('century','century-overlay','century-print-style')"
          style="background:#6b7280;color:#fff;border:none;border-radius:5px;
          padding:7px 14px;font-size:13px;cursor:pointer;">✕ Close</button>
      </div>
    </div>
    <div style="padding:10mm 0 0 0;background:#fff;">${pages}</div>`;

  document.body.appendChild(overlay);
}
// ── DISPLAY SEATING PLAN (Room Notice) ────────────────────────
export function printDisplayPlan() {
  beginPrintSession({ reportKey: 'displayPlan' });
  const ctx = requireCurrentDateSeatingForPrint();
  if (!ctx) return;
  const cfg        = getConfig();
  const ds         = ctx.ds;
  const seated     = ctx.seated;
  const { centreName, centreCode } = getCentreMeta();
  const dayStr     = `${dayName(ds)}, ${ds}`;
  const rows       = cfg.rows;
  const cols       = cfg.cols;
  const stagger    = cfg.stagger;
  const tPhysRows  = physRows(cfg);
  const rowH       = Math.min(32, Math.floor(178 / tPhysRows));
  const roomNos    = getSortedRoomNos(seated);

  // ── Inject CSS classes once ──
  const styleId = 'display-plan-style';
  document.getElementById(styleId)?.remove();
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `${buildPrintShellCSS({
      overlayId: 'display-plan-overlay',
      pageSize: 'A4',
      orientation: 'portrait',
      margins: '15mm'
    })}
      .dp { page-break-after:always; }
      .dp:last-child { page-break-after:avoid; }
      .dp-xcell, .dp-roll, .dp-vacant, .dp-colh {
        -webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;
      }
      @media print {
        #display-plan-overlay {
          overflow:hidden!important;
          scrollbar-width:none!important;
        }
        #display-plan-overlay::-webkit-scrollbar { display:none!important; width:0!important; }
        #display-plan-overlay > div:not(.no-print) {
          padding:0!important;
          background:transparent!important;
        }
      }
    .dp { width:180mm;margin:0 auto;font-family:Arial,sans-serif;box-sizing:border-box; }
    .dp-grid  { width:100%;border-collapse:collapse;table-layout:fixed; }
    .dp-colh  { border:1.5px solid #000;padding:6px 4px;text-align:center;
                font-size:14pt;font-weight:bold;color:#000;background:#fff; }
    .dp-roll  { border:1.5px solid #000;height:${rowH}mm;text-align:center;
                vertical-align:middle;padding:0; }
    .dp-vacant{ border:1px solid #000;height:${rowH}mm; }
    .dp-xcell { border:1px solid #000;height:${rowH}mm;padding:0;
                background:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27100%25%27 height=%27100%25%27%3E%3Cline x1=%270%27 y1=%270%27 x2=%27100%25%27 y2=%27100%25%27 stroke=%27%23bbb%27 stroke-width=%271.2%27/%3E%3Cline x1=%27100%25%27 y1=%270%27 x2=%270%27 y2=%27100%25%27 stroke=%27%23bbb%27 stroke-width=%271.2%27/%3E%3C/svg%3E") no-repeat center/100% 100%;
                -webkit-print-color-adjust:exact;print-color-adjust:exact; }
    .dp-cell-inner { display:flex;flex-direction:column;align-items:center;justify-content:center;
                    height:100%;line-height:1; }
    .dp-num { font-size:21pt;font-weight:bold;font-family:'Courier New',monospace;
                    color:#000;letter-spacing:0.5px;line-height:1; }
    .dp-sub { font-size:8pt;font-weight:bold;color:#000;margin-top:2px;letter-spacing:0.3px;
                    max-width:100%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  `;
  document.head.appendChild(style);

  // ── Full seat lookup ──
  const fullSeatMap = {};
  seated.forEach(s => {
    if (!fullSeatMap[s.roomNo]) fullSeatMap[s.roomNo] = {};
    fullSeatMap[s.roomNo][s.seatInRoom] = s;
  });

  // ── Cell content options (read from toolbar checkbox) ──
  function getOpts() {
    return { showSubject: document.getElementById('dp-opt-subject')?.checked ?? false };
  }

  // ── Build overlay ──
  const overlayId = 'display-plan-overlay';
  document.getElementById(overlayId)?.remove();
  const overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow-y:auto;background:#fff;';

  // Use JS beforeprint/afterprint to strip ALL background/padding that causes the grey bar.
  // CSS @media print is unreliable for inline styles in Chrome.
  const _dpBefore = () => {
    overlay.style.cssText = 'position:static;background:#fff;overflow:visible;';
    wrap.style.cssText = 'padding:0;background:#fff;';
  };
  const _dpAfter = () => {
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow-y:auto;background:#fff;';
    wrap.style.cssText = 'padding:10mm 0 0 0;background:#fff;';
  };
  window.addEventListener('beforeprint', _dpBefore);
  window.addEventListener('afterprint',  _dpAfter);
  // Store cleanup refs so closePrintSession can remove them
  overlay._dpBefore = _dpBefore;
  overlay._dpAfter  = _dpAfter;

  const toolbar = document.createElement('div');
  toolbar.className = 'no-print';
  toolbar.style.cssText = 'position:sticky;top:0;background:#0c1c35;color:#fff;z-index:10001;' +
    'padding:10px 20px;display:flex;align-items:center;justify-content:space-between;' +
    'font-family:Arial,sans-serif;font-size:13px;';
  toolbar.innerHTML = `<span>🪑 Display Seating Plan — ${ds} · ${roomNos.length} rooms</span>
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;white-space:nowrap;">
        <input type="checkbox" id="dp-opt-subject" onchange="
          document.getElementById('display-plan-pages').innerHTML = window._buildDisplayPlanPages(window._getDisplayPlanOpts());
        "> Show subject in cell
      </label>
      <div style="display:flex;gap:10px;">
        <button onclick="window.print()" style="background:#1a50d4;color:#fff;border:none;
          border-radius:5px;padding:7px 18px;font-size:13px;cursor:pointer;">🖨️ Print / Save PDF</button>
        <button onclick="closePrintSession('displayPlan','display-plan-overlay','display-plan-style')"
          style="background:#6b7280;color:#fff;border:none;border-radius:5px;
          padding:7px 14px;font-size:13px;cursor:pointer;">✕ Close</button>
      </div>
    </div>`;
  overlay.appendChild(toolbar);

  const wrap = document.createElement('div');
  wrap.id = 'display-plan-pages';
  wrap.style.cssText = 'padding:10mm 0 0 0;background:#fff;';

  function buildRoomsHTML(opts) {
  let html = '';
  roomNos.forEach(roomNo => {
    const roomSeated   = seated.filter(s => s.roomNo === roomNo);
    const roomAllSeats = fullSeatMap[roomNo] || {};

    // Subject combos for header
    const combos = [];
    const seenKey = new Set();
    roomSeated.forEach(s => {
      const sub = (s.dateSubjects[ds]||[])[0];
      if (!sub) return;
      const key = s.class+'|'+sub.code;
      if (!seenKey.has(key)) { seenKey.add(key); combos.push({ cls: s.class, sub }); }
    });
    // Group same-class rows together so the exam name only needs to print once per class
    combos.sort((a,b) => a.cls===b.cls ? a.sub.code.localeCompare(b.sub.code) : (a.cls==='X'?-1:1));

    // One row per class: exam name once, subjects comma-joined on one line
    // ("Sub:" prefix only on the first subject) so multi-subject rooms stay on one A4 page.
    const byClass = new Map();
    combos.forEach(({cls, sub}) => {
      if (!byClass.has(cls)) byClass.set(cls, []);
      byClass.get(cls).push(sub);
    });
    const subFont = combos.length > 1 ? '11pt' : '16pt';
    const examFont = combos.length > 1 ? '13pt' : '16pt';
    const subHeaderRows = [...byClass.entries()].map(([cls, subs]) => {
      const cl = getExamLabel(cls);
      const subsLabel = subs
        .map((sub, i) => `${i===0 ? 'Sub: ' : ''}${sub.code}-${sub.name.toUpperCase()}`)
        .join(', ');
      return `<tr>
        <td style="border:none;padding:2pt 0;font-size:${examFont};font-weight:bold;color:#000;width:38%;vertical-align:top;">${cl}</td>
        <td style="border:none;padding:2pt 0;font-size:${subFont};font-weight:bold;color:#000;text-align:right;width:62%;vertical-align:top;">${subsLabel}</td>
      </tr>`;
    }).join('');

    // physMap
    const physMap = {};
    for (let logR = 1; logR <= rows; logR++) {
      for (let col = 1; col <= cols; col++) {
        const seat = (col-1)*rows + logR;
        physMap[physRow(logR,col,stagger)+','+col] = roomAllSeats[seat];
      }
    }

    // col headers
    let colH = '';
    for (let col = 1; col <= cols; col++) colH += `<th class="dp-colh">COL ${col}</th>`;

    // data rows
    let dataRows = '';
    for (let pr = 1; pr <= tPhysRows; pr++) {
      let cells = '';
      for (let col = 1; col <= cols; col++) {
        if (isXCell(pr, col, cfg)) {
          cells += `<td class="dp-xcell"></td>`;
        } else {
          const s = physMap[pr+','+col];
          if (!s) {
            cells += `<td class="dp-vacant"></td>`;
          } else if (opts.showSubject) {
            const sub = (s.dateSubjects[ds]||[])[0];
            cells += `<td class="dp-roll"><div class="dp-cell-inner"><span class="dp-num">${s.roll}</span>${sub ? `<span class="dp-sub">${sub.code}-${sub.name.toUpperCase()}</span>` : ''}</div></td>`;
          } else {
            cells += `<td class="dp-roll"><span class="dp-num">${s.roll}</span></td>`;
          }
        }
      }
      dataRows += `<tr>${cells}</tr>`;
    }

    const div = document.createElement('div');
    div.innerHTML = `
    <div class="dp">
      <div style="margin-bottom:8pt;">
        <div style="text-align:center;margin-bottom:6pt;">
          <span style="font-size:22pt;font-weight:bold;text-decoration:underline;letter-spacing:1px;color:#000;">SEATING PLAN</span>
        </div>
        <div style="font-size:16pt;font-weight:bold;color:#000;margin-bottom:2pt;"><b>Name of Centre :</b> ${centreName}</div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:2pt;">${subHeaderRows}</table>
        <table style="width:100%;border-collapse:collapse;margin-bottom:2pt;"><tr>
          <td style="font-size:16pt;font-weight:bold;color:#000;padding:0;"><b>Day &amp; Date:</b> ${dayStr}</td>
          <td style="font-size:20pt;font-weight:bold;text-align:right;color:#000;padding:0;">Room No. ${roomNo}</td>
        </tr></table>
        <div style="font-size:16pt;font-weight:bold;color:#000;margin-bottom:8pt;"><b>Centre No:</b> ${centreCode}</div>
      </div>
      <table class="dp-grid">
        <tbody><tr>${colH}</tr>${dataRows}</tbody>
        <tfoot><tr>
          <td colspan="${cols}" style="border-top:1.5px solid #000;padding:16pt 0 0 0;text-align:center;border-left:none;border-right:none;border-bottom:none;">
            <br><br>
            <div style="display:inline-block;text-align:center;min-width:200pt;">
              <div style="border-top:1.5px solid #000;padding-top:5pt;font-size:9.5pt;font-weight:bold;color:#000;">
                Signature of Centre Superintendent
              </div>
              <div style="font-size:8pt;color:#000;">(with Rubber Stamp)</div>
            </div>
          </td>
        </tr></tfoot>
      </table>
    </div>`;
    html += div.firstElementChild.outerHTML;
  });
  return html;
  }

  wrap.innerHTML = buildRoomsHTML(getOpts());

  // Expose helpers for live re-render on checkbox change
  window._getDisplayPlanOpts    = getOpts;
  window._buildDisplayPlanPages = buildRoomsHTML;

  overlay.appendChild(wrap);
  document.body.appendChild(overlay);
}
// ── SEATING PLAN SUMMARY ─────────────────────────────────────
// Format 1: printSeatingSummary()       — combined all subjects, one page
// Format 2: printSeatingSubjectSummary()— one page per class+subject combo

export function _summaryHeaderHTML(centreName, centreCode, dayStr, classLabel, subjectLine, examLine, totalCols) {
  // Wall/board display header — centred, bold, large for distant reading
  const CS  = `colspan="${totalCols}"`;
  const BASE = 'border:1.5px solid #000;background:#fff;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact;';
  const C   = `${BASE}text-align:center;`;

  const examDisplay = examLine || (classLabel
    ? (classLabel.includes('SENIOR') ? getExamLabel('XII') : getExamLabel('X'))
    : '');

  const subjectRow = subjectLine
    ? `<tr><td ${CS} style="${C}font-size:12pt;font-weight:bold;padding:3pt 6pt;letter-spacing:0.5px;">${subjectLine}</td></tr>`
    : '';

  return `
    <tr><td ${CS} style="${C}font-size:15pt;font-weight:bold;padding:4pt 8pt;letter-spacing:0.5px;">${centreName}</td></tr>
    <tr><td ${CS} style="${C}font-size:13pt;font-weight:bold;padding:3pt 8pt;letter-spacing:2px;text-decoration:underline;">SEATING ARRANGEMENT</td></tr>
    ${examDisplay ? `<tr><td ${CS} style="${C}font-size:11pt;font-weight:bold;padding:2pt 8pt;">${examDisplay}</td></tr>` : ''}
    ${subjectRow}
    <tr><td ${CS} style="${C}font-size:13pt;font-weight:bold;padding:4pt 8pt;border-top:2px solid #000;">${dayStr}</td></tr>
    <tr><td ${CS} style="${C}font-size:11pt;font-weight:bold;padding:2pt 8pt;border-bottom:2px solid #000;">Centre No. : ${centreCode}</td></tr>`;
}
export function _summaryTableHTML(headerRows, rows, grandTotal, showSubjectCol) {
  // Wall/board display table — large bold fonts, alternating shading, clear structure
  const totalCols = showSubjectCol ? 5 : 4;
  const PA  = 'print-color-adjust:exact;-webkit-print-color-adjust:exact;';
  const TH  = `border:1.5px solid #000;padding:8px 8px;text-align:center;font-size:13pt;font-weight:bold;background:#fff;color:#000;${PA}`;
  const TH2 = `border:1.5px solid #000;padding:8px 8px;text-align:center;font-size:12pt;font-weight:bold;background:#fff;color:#000;${PA}`;

  // Column widths: Room | [Subject] | From | To | Total
  const colgroupHtml = showSubjectCol
    ? `<colgroup><col style="width:52pt"><col><col style="width:110pt"><col style="width:110pt"><col style="width:44pt"></colgroup>`
    : `<colgroup><col style="width:56pt"><col style="width:120pt"><col style="width:120pt"><col style="width:48pt"></colgroup>`;

  const subColH = showSubjectCol
    ? `<td rowspan="2" style="${TH}vertical-align:middle;font-size:10pt;letter-spacing:0.3px;">SUBJECT</td>` : '';
  const sumSubCell = showSubjectCol
    ? `<td style="border:1.5px solid #000;padding:8px 8px;background:#fff;${PA}"></td>` : '';

  const colHdrRows = `
    <tr>
      <td rowspan="2" style="${TH}vertical-align:middle;font-size:11pt;">ROOM<br>NO.</td>
      ${subColH}
      <td colspan="3" style="${TH}font-size:11pt;letter-spacing:1px;">ROLL NUMBER</td>
    </tr>
    <tr>
      <td style="${TH2}">FROM</td>
      <td style="${TH2}">TO</td>
      <td style="${TH2}">TOTAL</td>
    </tr>`;

  const totalRow = `
  <table style="width:100%;border-collapse:collapse;${PA}">
    <tr style="background:#fff;${PA}">
      <td style="border:1.5px solid #000;padding:10px 8px;text-align:center;font-size:14pt;font-weight:bold;color:#000;${PA}"></td>
      ${sumSubCell ? `<td style="border:1.5px solid #000;padding:10px 8px;background:#fff;${PA}"></td>` : ''}
      <td colspan="2" style="border:1.5px solid #000;padding:10px 8px;text-align:center;font-size:16pt;font-weight:bold;color:#000;letter-spacing:1px;${PA}">GRAND TOTAL</td>
      <td style="border:1.5px solid #000;padding:10px 8px;text-align:center;font-size:20pt;font-weight:bold;color:#000;${PA}">${grandTotal}</td>
    </tr>
  </table>`;

  return `
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;border:2px solid #000;">
      ${colgroupHtml}
      <thead>${headerRows}${colHdrRows}</thead>
      <tbody>${rows}</tbody>
    </table>
    ${totalRow}`;
}
export function printSeatingSummary() {
  const ctx = requireCurrentDateSeatingForPrint();
  if (!ctx) return;
  const cfg        = getConfig();
  const ds         = ctx.ds;
  const seated     = ctx.seated;
  const { centreName, centreCode } = getCentreMeta();
  const dayStr     = `${dayName(ds)}, ${ds}`;
  const roomNos    = getSortedRoomNos(seated);

  // Build rows: for each room, for each class+subject combo — sorted room ASC, then X before XII
  let rows = '';
  let grandTotal = 0;
  let grandRooms = 0;
  const seenRooms = new Set();

  roomNos.forEach(roomNo => {
    const roomSeated = seated.filter(s => s.roomNo === roomNo);
    // collect combos in this room
    const combos = [];
    const seenK = new Set();
    roomSeated.forEach(s => {
      const sub = (s.dateSubjects[ds]||[])[0]; if (!sub) return;
      const k = s.class+'|'+sub.code;
      if (!seenK.has(k)) { seenK.add(k); combos.push({cls:s.class, sub}); }
    });
    combos.sort((a,b) => a.cls===b.cls ? a.sub.code.localeCompare(b.sub.code) : a.cls==='X'?-1:1);

    combos.forEach(({cls, sub}, ci) => {
      const cands = roomSeated.filter(s => {
        const ss=(s.dateSubjects[ds]||[])[0]; return s.class===cls && ss && ss.code===sub.code;
      });
      const rolls = cands.map(s=>parseInt(s.roll)).sort((a,b)=>a-b);
      const from  = rolls[0], to = rolls[rolls.length-1], total = rolls.length;
      grandTotal += total;
      if (!seenRooms.has(roomNo)) { seenRooms.add(roomNo); grandRooms++; }

      const subLabel = `${sub.code} ${sub.name.toUpperCase()}`;
      const PA5 = 'print-color-adjust:exact;-webkit-print-color-adjust:exact;';
      const rowBg = '#ffffff'; // always white
      const rowBgActual = '#ffffff'; // always white
      rows += `<tr style="background:${rowBgActual};${PA5}">
        <td style="border:1.5px solid #000;padding:10px 10px;text-align:center;font-size:18pt;font-weight:bold;${PA5}">${ci===0?roomNo:''}</td>
        <td style="border:1.5px solid #000;padding:10px 10px;text-align:center;font-size:12pt;font-weight:bold;word-break:break-word;line-height:1.25;${PA5}">${subLabel}</td>
        <td style="border:1.5px solid #000;padding:10px 10px;text-align:center;font-size:18pt;font-weight:bold;font-family:'Courier New',monospace;letter-spacing:0.5px;${PA5}">${from}</td>
        <td style="border:1.5px solid #000;padding:10px 10px;text-align:center;font-size:18pt;font-weight:bold;font-family:'Courier New',monospace;letter-spacing:0.5px;${PA5}">${to}</td>
        <td style="border:1.5px solid #000;padding:10px 10px;text-align:center;font-size:18pt;font-weight:bold;${PA5}">${total}</td>
      </tr>`;
    });
  });

  // Build exam line from classes present this date
  const classesPresent = [...new Set(seated.map(s=>s.class))].sort();
  const examParts = [];
  if (classesPresent.includes('X'))   examParts.push(getExamLabel('X'));
  if (classesPresent.includes('XII')) examParts.push(getExamLabel('XII'));
  const examLine = examParts.join(' / ');
  const headerRows = _summaryHeaderHTML(centreName, centreCode, dayStr, '', '', examLine, 5);
  const tableHTML  = _summaryTableHTML(headerRows, rows, grandTotal, true);

  _showSummaryOverlay('summary-overlay', 'summary-print-style',
    `📋 Seating Summary — ${ds} · ${roomNos.length} rooms`,
    `<div class="sp-sum">${tableHTML}${_summaryFooter()}</div>`);
}
// ── FORMAT 2: Per class+subject, one page each ──
export function printSeatingSubjectSummary() {
  const ctx = requireCurrentDateSeatingForPrint();
  if (!ctx) return;
  const cfg        = getConfig();
  const ds         = ctx.ds;
  const seated     = ctx.seated;
  const { centreName, centreCode } = getCentreMeta();
  const dayStr     = `${dayName(ds)}, ${ds}`;

  // Collect all unique class+subject combos across all rooms
  const allCombos = [];
  const seenC = new Set();
  seated.forEach(s => {
    const sub=(s.dateSubjects[ds]||[])[0]; if(!sub) return;
    const k=s.class+'|'+sub.code;
    if(!seenC.has(k)){seenC.add(k); allCombos.push({cls:s.class, sub});}
  });
  allCombos.sort((a,b)=>a.cls===b.cls?a.sub.code.localeCompare(b.sub.code):a.cls==='X'?-1:1);

  const roomNos = [...new Set(seated.map(s=>s.roomNo))].sort((a,b)=>a-b);

  let pages = '';
  allCombos.forEach(({cls, sub}) => {
    const classLabel = cls==='XII' ? 'SENIOR SECONDARY' : 'X';
    const classFullLabel = getExamLabel(cls);
    const subjectLine = `Subject : ${sub.code}-${sub.name.toUpperCase()}`;

    let rows = '';
    let grandTotal = 0, grandRooms = 0;

    roomNos.forEach(roomNo => {
      const cands = seated.filter(s => {
        const ss=(s.dateSubjects[ds]||[])[0];
        return s.roomNo===roomNo && s.class===cls && ss && ss.code===sub.code;
      });
      if (!cands.length) return;
      grandRooms++;
      const rolls = cands.map(s=>parseInt(s.roll)).sort((a,b)=>a-b);
      const from=rolls[0], to=rolls[rolls.length-1], total=rolls.length;
      grandTotal += total;
      const PA4 = 'print-color-adjust:exact;-webkit-print-color-adjust:exact;';
      const rowBg4 = '#ffffff';
      rows += `<tr style="background:${rowBg4};${PA4}">
        <td style="border:1.5px solid #000;padding:10px 10px;text-align:center;font-size:20pt;font-weight:bold;${PA4}">${roomNo}</td>
        <td style="border:1.5px solid #000;padding:10px 10px;text-align:center;font-size:20pt;font-weight:bold;font-family:'Courier New',monospace;letter-spacing:0.5px;${PA4}">${from}</td>
        <td style="border:1.5px solid #000;padding:10px 10px;text-align:center;font-size:20pt;font-weight:bold;font-family:'Courier New',monospace;letter-spacing:0.5px;${PA4}">${to}</td>
        <td style="border:1.5px solid #000;padding:10px 10px;text-align:center;font-size:20pt;font-weight:bold;${PA4}">${total}</td>
      </tr>`;
    });

    const headerRows = _summaryHeaderHTML(centreName, centreCode, dayStr, classLabel, subjectLine, '', 4);
    const tableHTML  = _summaryTableHTML(headerRows, rows, grandTotal, false);
    pages += `<div class="sp-sum">${tableHTML}${_summaryFooter()}</div>`;
  });

  _showSummaryOverlay('summary-overlay', 'summary-print-style',
    `📋 Subject Summary — ${ds} · ${allCombos.length} subject(s)`, pages);
}
export function _summaryFooter() {
  return `<table style="width:100%;border-collapse:collapse;margin-top:40pt;"><tr>
    <td style="width:55%;padding-top:8pt;font-size:8pt;color:#333;">
    </td>
    <td style="text-align:center;border-top:1.5px solid #000;padding-top:4pt;font-size:11pt;font-weight:bold;">
      Signature of Centre Superintendent<br>
      <span style="font-size:9pt;font-weight:normal;">(with Rubber Stamp)</span>
    </td>
  </tr></table>`;
}
export function _showSummaryOverlay(overlayId, styleId, title, pagesHTML) {
  const session = beginPrintSession({
    reportKey: 'roomSummary',
    overlayId,
    styleId,
    pageSize: 'A4',
    orientation: 'portrait',
    margins: '8mm 10mm'
  });
  document.getElementById(styleId)?.remove();
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `${buildPrintShellCSS({
      overlayId,
      pageSize: session.pageSize,
      orientation: session.orientation,
      margins: session.margins
    })}
    .sp-sum { page-break-after:always; }
    .sp-sum:last-child { page-break-after:avoid; }
    .sp-sum table { -webkit-print-color-adjust:exact!important;print-color-adjust:exact!important; }
    .sp-sum table thead tr th, .sp-sum table thead tr td {
      -webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;
    }
    .sp-sum { width:185mm;margin:0 auto;font-family:Arial,sans-serif;box-sizing:border-box; }
    @media print { .sp-sum { width:100%; margin:0; } }
  `;
  document.head.appendChild(style);

  document.getElementById(overlayId)?.remove();
  const overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow-y:auto;background:#fff;';

  const toolbar = document.createElement('div');
  toolbar.className = 'no-print';
  toolbar.style.cssText = 'position:sticky;top:0;background:#0c1c35;color:#fff;z-index:10001;' +
    'padding:10px 20px;display:flex;align-items:center;justify-content:space-between;' +
    'font-family:Arial,sans-serif;font-size:13px;';
  toolbar.innerHTML = `<span>${title}</span>
    <div style="display:flex;gap:10px;">
      <button onclick="window.print()" style="background:#1a50d4;color:#fff;border:none;
        border-radius:5px;padding:7px 18px;font-size:13px;cursor:pointer;">🖨️ Print / Save PDF</button>
      <button onclick="closePrintSession('${session.reportKey}','${overlayId}','${styleId}')"
        style="background:#6b7280;color:#fff;border:none;border-radius:5px;
        padding:7px 14px;font-size:13px;cursor:pointer;">✕ Close</button>
    </div>`;
  overlay.appendChild(toolbar);

  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:10mm 0 0 0;background:#fff;';
  wrap.innerHTML = pagesHTML;
  overlay.appendChild(wrap);
  document.body.appendChild(overlay);
}
// ── TRIPLICATE SEATING PLAN (Official CBSE Format) ────────────
export function printTriplicate() {
  beginPrintSession({ reportKey: 'triplicate' });
  const ctx = requireCurrentDateSeatingForPrint();
  if (!ctx) return;
  const cfg        = getConfig();
  const ds         = ctx.ds;
  const seated     = ctx.seated;
  const { centreName, centreCode } = getCentreMeta();
  const dayStr     = `${dayName(ds)}, ${ds}`;
  const rows       = cfg.rows;
  const cols       = cfg.cols;
  const stagger    = cfg.stagger;
  const tPhysRows  = physRows(cfg);
  const rowH       = Math.min(22, Math.floor(170 / tPhysRows));
  const roomNos    = getSortedRoomNos(seated);

  // ── Inject CSS classes once ──
  const styleId = 'triplicate-print-style';
  document.getElementById(styleId)?.remove();
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `${buildPrintShellCSS({
      overlayId: 'triplicate-overlay',
      pageSize: 'A4',
      orientation: 'portrait',
      margins: '8mm 12mm 8mm 12mm'
    })}
    .tp { page-break-after:always; }
    .tp:last-child { page-break-after:avoid; }
    .tp { width:190mm;height:281mm;margin:0 auto;font-family:Arial,sans-serif;
          display:flex;flex-direction:column;justify-content:space-between;padding:3mm 0; }
    .tp table { border-collapse:collapse; }
    .tp-grid  { width:100%;table-layout:fixed; }
    .tp-th    { border:1.5px solid #000;padding:5px 6px;text-align:center;font-weight:bold;
                font-size:11pt;color:#000;background:#fff; }
    .tp-th2   { border:1.5px solid #000;padding:4px;text-align:center;font-size:9pt;
                font-weight:bold;color:#000;background:#fff; }
    .tp-hdr   { width:100%;margin-bottom:5pt; }
    .tp-foot  { width:100%;margin-bottom:5pt;margin-top:8pt; }
    .tp-cell-inner { display:flex;flex-direction:column;align-items:center;justify-content:center;
                    height:100%;line-height:1; }
    .tp-sub   { font-size:6.5pt;font-weight:bold;color:#000;margin-top:1px;letter-spacing:0.2px;
                    max-width:100%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  `;
  document.head.appendChild(style);

  // ── Full seat lookup ──
  const fullSeatMap = {};
  seated.forEach(s => {
    if (!fullSeatMap[s.roomNo]) fullSeatMap[s.roomNo] = {};
    fullSeatMap[s.roomNo][s.seatInRoom] = s;
  });

  // ── Build overlay ──
  const overlayId = 'triplicate-overlay';
  document.getElementById(overlayId)?.remove();
  const overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow-y:auto;background:#fff;';

  const toolbar = document.createElement('div');
  toolbar.className = 'no-print';
  toolbar.style.cssText = 'position:sticky;top:0;background:#0c1c35;color:#fff;z-index:10001;' +
    'padding:10px 20px;display:flex;align-items:center;justify-content:space-between;' +
    'font-family:Arial,sans-serif;font-size:13px;';
  toolbar.innerHTML = `<span>📋 Triplicate — ${ds} &nbsp;·&nbsp; ${roomNos.length} room(s)</span>
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;white-space:nowrap;">
        <input type="checkbox" id="tp-opt-combine" onchange="
          document.getElementById('triplicate-pages').innerHTML = window._buildTriplicatePages(window._getTriplicateOpts());
        "> Combine subjects on one sheet
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;white-space:nowrap;">
        <input type="checkbox" id="tp-opt-subject" onchange="
          document.getElementById('triplicate-pages').innerHTML = window._buildTriplicatePages(window._getTriplicateOpts());
        "> Show subject in cell
      </label>
      <div style="display:flex;gap:10px;">
        <button onclick="window.print()" style="background:#1a50d4;color:#fff;border:none;
          border-radius:5px;padding:7px 18px;font-size:13px;cursor:pointer;">🖨️ Print / Save PDF</button>
        <button onclick="closePrintSession('triplicate','triplicate-overlay','triplicate-print-style')"
          style="background:#6b7280;color:#fff;border:none;border-radius:5px;
          padding:7px 14px;font-size:13px;cursor:pointer;">✕ Close</button>
      </div>
    </div>`;
  overlay.appendChild(toolbar);

  const wrap = document.createElement('div');
  wrap.id = 'triplicate-pages';
  wrap.style.cssText = 'padding:10mm 0 0 0;background:#fff;';

  const SVG_X = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27100%25%27 height=%27100%25%27%3E%3Cline x1=%270%27 y1=%270%27 x2=%27100%25%27 y2=%27100%25%27 stroke=%27%23bbb%27 stroke-width=%271.2%27/%3E%3Cline x1=%27100%25%27 y1=%270%27 x2=%270%27 y2=%27100%25%27 stroke=%27%23bbb%27 stroke-width=%271.2%27/%3E%3C/svg%3E";

  // X cell: inner div forces height (td height ignored on empty colspan cells)
  const xcInner = `<div style='width:100%;height:${rowH}mm;background:url("${SVG_X}") no-repeat center/100% 100%;-webkit-print-color-adjust:exact;print-color-adjust:exact;'></div>`;
  const xcStyle = `border:1.5px solid #000;padding:0;`;
  const rollStyle = `border:1.5px solid #000;text-align:center;font-size:13pt;font-weight:bold;vertical-align:middle;height:${rowH}mm;white-space:nowrap;padding:0 2px;`;
  const qpStyle = `border:1.5px solid #000;height:${rowH}mm;`;

  let cg = '<colgroup>';
  for (let col = 1; col <= cols; col++) cg += '<col style="width:auto;"><col style="width:20mm;">';
  cg += '</colgroup>';

  let colH = '', subH = '';
  for (let col = 1; col <= cols; col++) {
    colH += `<th colspan="2" class="tp-th">ROW ${col}</th>`;
    subH += `<th class="tp-th2">ROLL NO.</th><th class="tp-th2">QP<br>CODE</th>`;
  }

  function buildDataRows(physMap, matches, showSubject) {
    let dataRows = '';
    for (let pr = 1; pr <= tPhysRows; pr++) {
      let cells = '';
      for (let col = 1; col <= cols; col++) {
        if (isXCell(pr, col, cfg)) {
          cells += `<td colspan="2" style="${xcStyle}">${xcInner}</td>`;
        } else {
          const cand = physMap[pr+','+col];
          if (cand && matches(cand)) {
            const sub = showSubject ? (cand.dateSubjects[ds]||[])[0] : null;
            const rollCell = sub
              ? `<td style="${rollStyle}"><div class="tp-cell-inner"><span>${cand.roll}</span><span class="tp-sub">${sub.code}-${sub.name.toUpperCase()}</span></div></td>`
              : `<td style="${rollStyle}">${cand.roll}</td>`;
            cells += `${rollCell}<td style="${qpStyle}"></td>`;
          } else {
            cells += `<td colspan="2" style="${xcStyle}">${xcInner}</td>`;
          }
        }
      }
      dataRows += `<tr style="height:${rowH}mm;">${cells}</tr>`;
    }
    return dataRows;
  }

  function pageHTML(classLabelHTML, subLineHTML, roomNo, total, dataRows) {
    return `
      <div class="tp">
        <div>
          <div style="text-align:center;margin-bottom:8pt;">
            <span style="font-size:16pt;font-weight:bold;text-decoration:underline;letter-spacing:1px;">SEATING PLAN</span>
          </div>
          <table class="tp-hdr"><tr>
            <td style="font-size:10pt;"><b>Name of Centre :</b> ${centreName}</td>
            <td style="font-size:10pt;text-align:right;"><b>Centre No.: ${centreCode}</b></td>
          </tr></table>
          ${classLabelHTML}
          <table style="width:100%;margin-bottom:8pt;"><tr>
            <td style="font-size:10pt;"><b>Day &amp; Date:</b>&nbsp;&nbsp;${dayStr}</td>
            <td style="font-size:14pt;font-weight:bold;text-align:right;">Room No. ${roomNo}</td>
          </tr></table>
          <table class="tp-grid">${cg}<tbody>
            <tr>${colH}</tr><tr>${subH}</tr>${dataRows}
          </tbody></table>
        </div>
        <div>
          <table class="tp-foot"><tr>
            <td style="font-size:9.5pt;"><b>Name &amp; Signature of Asstt. Suptd.</b></td>
            <td style="font-size:9.5pt;text-align:right;"><b>Total No. Registered : ${total}</b></td>
          </tr></table>
          <table style="width:100%;font-size:9.5pt;">
            <tr><td style="width:50%;padding-bottom:6pt;"><b>1. Name</b></td><td style="padding-bottom:6pt;">Present : ............</td></tr>
            <tr><td style="padding-bottom:8pt;">Signature</td><td></td></tr>
            <tr><td style="padding-bottom:6pt;"><b>2. Name</b></td><td style="padding-bottom:6pt;">Absent : ............</td></tr>
            <tr><td style="padding-bottom:8pt;">Signature</td><td></td></tr>
          </table>
          <table style="width:100%;margin-top:4pt;"><tr>
            <td style="width:60%;"></td>
            <td style="text-align:center;border-top:1.5px solid #000;padding-top:4pt;font-size:9.5pt;font-weight:bold;">
              Signature of Centre Superintendent<br>
              <span style="font-size:8pt;font-weight:normal;">(with Rubber Stamp)</span>
            </td>
          </tr></table>
        </div>
      </div>`;
  }

  function getOpts() {
    return {
      combine: document.getElementById('tp-opt-combine')?.checked ?? false,
      showSubject: document.getElementById('tp-opt-subject')?.checked ?? false
    };
  }

  function buildTriplicatePages(opts) {
    const { combine, showSubject } = opts || {};
    let html = '';
    roomNos.forEach(roomNo => {
      const roomSeated   = seated.filter(s => s.roomNo === roomNo);
      const roomAllSeats = fullSeatMap[roomNo] || {};

      const physMap = {};
      for (let logR = 1; logR <= rows; logR++) {
        for (let col = 1; col <= cols; col++) {
          const seat = (col-1)*rows + logR;
          physMap[physRow(logR,col,stagger)+','+col] = roomAllSeats[seat];
        }
      }

      const combos = [];
      const seenCombo = new Set();
      roomSeated.forEach(s => {
        const sub = (s.dateSubjects[ds]||[])[0];
        if (!sub) return;
        const key = s.class + '|' + sub.code;
        if (!seenCombo.has(key)) { seenCombo.add(key); combos.push({ cls: s.class, sub }); }
      });

      if (combine) {
        // One sheet per room with every subject's roll numbers together.
        const byClass = new Map();
        combos.forEach(({cls, sub}) => {
          if (!byClass.has(cls)) byClass.set(cls, []);
          byClass.get(cls).push(sub);
        });
        const classRows = [...byClass.entries()].map(([cls, subs]) => {
          const subsLabel = subs
            .map((sub, i) => `${i===0 ? 'Sub: ' : ''}${sub.code}-${sub.name.toUpperCase()}`)
            .join(', ');
          return `<tr>
            <td style="font-size:10pt;font-weight:bold;">${getExamLabel(cls)}</td>
            <td style="font-size:10pt;font-weight:bold;text-align:right;">${subsLabel}</td>
          </tr>`;
        }).join('');
        const classLabelHTML = `<table class="tp-hdr">${classRows}</table>`;

        const dataRows = buildDataRows(physMap, () => true, showSubject);
        html += pageHTML(classLabelHTML, '', roomNo, roomSeated.length, dataRows);
      } else {
        combos.forEach(({ cls, sub }) => {
          const comboSeated = roomSeated.filter(s => {
            const cs = (s.dateSubjects[ds]||[])[0];
            return s.class === cls && cs && cs.code === sub.code;
          });
          const total      = comboSeated.length;
          const classLabelHTML = `<table class="tp-hdr"><tr>
            <td style="font-size:10pt;font-weight:bold;">${getExamLabel(cls)}</td>
            <td style="font-size:10pt;font-weight:bold;text-align:right;">Sub: ${sub.code}-${sub.name.toUpperCase()}</td>
          </tr></table>`;

          const dataRows = buildDataRows(physMap, cand => {
            const candSub = (cand.dateSubjects[ds]||[])[0];
            return cand.class === cls && candSub && candSub.code === sub.code;
          }, showSubject);
          html += pageHTML(classLabelHTML, '', roomNo, total, dataRows);
        });
      }
    });
    return html;
  }

  wrap.innerHTML = buildTriplicatePages(getOpts());

  // Expose helpers for live re-render on checkbox change
  window._getTriplicateOpts    = getOpts;
  window._buildTriplicatePages = buildTriplicatePages;

  overlay.appendChild(wrap);
  document.body.appendChild(overlay);
}
export function printSeating() {
  const ctx = requireCurrentDateSeatingForPrint();
  if (!ctx) return;
  buildPrintFrame('seating', ctx.ds, currentSubjectFilter);
}
export function printSummary() {
  if (!requireGeneratedForReports()) return;
  buildPrintFrame('summary', null, null);
}
export function buildPrintFrame(mode, ds, subFilter) {
  const cfg = getConfig();
  const centreName = document.getElementById('cfg-centre-name').value || 'Centre';
  const centreCode = document.getElementById('cfg-centre-code').value || '';

  let html = `
    <div style="font-family:'IBM Plex Sans',sans-serif;font-size:12px;color:#000;">
      <!-- Print Header -->
      <div style="background:#0c1c35;color:#fff;padding:10px 16px;margin-bottom:12px;">
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:15px;">
          CBSE BOARD EXAM 2026 — CENTRE ${mode === 'seating' ? 'SEATING PLAN' : 'SEATING SUMMARY'}
        </div>
        <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:3px;">
          Centre: ${centreCode} &nbsp;|&nbsp; ${centreName}
          &nbsp;|&nbsp; Layout: ${cfg.rows}R × ${cfg.cols}C = ${cfg.perRoom}/room
          &nbsp;|&nbsp; Printed: ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
        </div>
      </div>`;

  if (mode === 'seating') {
    // Print seating grid for selected date
    const seated = state.seating[ds] || [];
    const totalRooms = Math.ceil(seated.length / cfg.perRoom);
    const nX   = seated.filter(s => s.class==='X').length;
    const nXII = seated.filter(s => s.class==='XII').length;

    html += `<div style="background:#1a3a6a;color:#fff;padding:8px 12px;margin-bottom:10px;font-size:13px;font-weight:700;">
      ${ds} (${dayName(ds)}) &nbsp;—&nbsp;
      ${nX ? 'X: '+nX : ''}${nX&&nXII?' | ':''}${nXII ? 'XII: '+nXII : ''}
      &nbsp;|&nbsp; Total: ${seated.length} &nbsp;|&nbsp; ${totalRooms} Rooms
      ${subFilter && subFilter !== 'all' ? ' &nbsp;|&nbsp; Subject: '+subFilter : ''}
    </div>`;

    for (let room = 1; room <= totalRooms; room++) {
      const roomCands = seated.filter(s => s.roomNo === room);
      if (!roomCands.length) continue;

      // Subject filter check
      const roomHasSub = subFilter === 'all' || !subFilter ||
        roomCands.some(s => (s.dateSubjects[ds]||[]).some(x => x.code === subFilter));
      if (!roomHasSub) continue;

      const xC   = roomCands.filter(s=>s.class==='X').length;
      const xiiC = roomCands.filter(s=>s.class==='XII').length;
      const rollFrom = roomCands[0].roll;
      const rollTo   = roomCands[roomCands.length-1].roll;

      html += `<div style="margin-bottom:14px;page-break-inside:avoid;border:1px solid #ccc;">
        <div style="background:#0c1c35;color:#fff;padding:7px 12px;display:flex;justify-content:space-between;font-size:12px;font-weight:700;">
          <span>ROOM ${String(room).padStart(2,'0')} &nbsp;—&nbsp; ${ds}</span>
          <span style="font-weight:400;font-size:11px;color:rgba(255,255,255,0.6);">
            ${roomCands.length} candidates
            ${xC ? ' | X:'+xC : ''}${xiiC ? ' | XII:'+xiiC : ''}
            | Rolls: ${rollFrom}–${rollTo}
          </span>
        </div>
        <div style="background:#111;color:rgba(255,255,255,0.5);text-align:center;padding:4px;font-size:10px;letter-spacing:3px;">
          ▬ BLACKBOARD / FRONT OF ROOM ▬
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#2a3a5a;">
            <th style="width:30px;padding:4px;color:rgba(255,255,255,0.4);font-size:9px;text-align:center;border:1px solid #445;"></th>
            ${Array.from({length:cfg.cols},(_,ci)=>`<th style="padding:4px;color:rgba(255,255,255,0.5);font-size:9px;text-align:center;border:1px solid #445;">Col ${ci+1}</th>`).join('')}
          </tr>`;

      for (let r = 1; r <= cfg.rows; r++) {
        html += `<tr><td style="background:#2a3a5a;color:rgba(255,255,255,0.4);font-size:9px;text-align:center;padding:4px;border:1px solid #ddd;font-weight:700;">R${r}</td>`;
        for (let col = 1; col <= cfg.cols; col++) {
          const seatNo = cfg.seatDir === 'rowwise'
            ? (r-1)*cfg.cols + col
            : (col-1)*cfg.rows + r;
          const cand = roomCands.find(s => s.seatInRoom === seatNo);
          const candHasSub = !cand ? false :
            (!subFilter || subFilter==='all' ||
             (cand.dateSubjects[ds]||[]).some(x => x.code === subFilter));

          if (!cand || (subFilter && subFilter!=='all' && !candHasSub && cfg.showVacant)) {
            html += `<td style="border:1px solid #ddd;padding:4px 3px;background:#fafafa;min-width:60px;">
              <div style="font-size:8px;color:#ccc;text-align:center;">—</div>
            </td>`;
          } else if (cand) {
            const bg = cand.class==='X' ? '#e8f5e9' : '#e3f2fd';
            const clr = cand.class==='X' ? '#1b5e20' : '#0d47a1';
            const sch = cand.schoolCode==='99999' ? 'Pvt' : cand.schoolCode;
            html += `<td style="border:1px solid #ddd;padding:4px 3px;background:${bg};min-width:60px;vertical-align:top;">
              <div style="font-size:8px;color:#999;">${seatNo} <span style="background:${clr};color:#fff;padding:0 3px;border-radius:1px;font-size:7px;">${cand.class}</span></div>
              <div style="font-size:9px;font-weight:700;color:#000;font-family:monospace;">${cand.roll}</div>
              <div style="font-size:8px;color:#333;overflow:hidden;white-space:nowrap;max-width:65px;">${cand.name.split(' ')[0]}</div>
              <div style="font-size:7px;color:#999;">${sch}</div>
            </td>`;
          }
        }
        html += `</tr>`;
      }
      html += `</table></div>`;
    }

  } else {
    // Print summary — compact format matching official CBSE table
    state.allDates.forEach(dateStr => {
      const allSeated = state.seating[dateStr] || [];
      if (!allSeated.length) return;
      const nX   = allSeated.filter(s=>s.class==='X').length;
      const nXII = allSeated.filter(s=>s.class==='XII').length;

      // Collect subjects on this date
      const subMap = {};
      allSeated.forEach(s => {
        (s.dateSubjects[dateStr]||[]).forEach(sub => {
          const key = s.class + '|' + sub.code;
          if (!subMap[key]) subMap[key] = { code:sub.code, name:sub.name, cls:s.class };
        });
      });
      const subjects = Object.values(subMap)
        .sort((a,b) => a.cls.localeCompare(b.cls) || a.code.localeCompare(b.code));

      const totalRooms = Math.ceil(allSeated.length / cfg.perRoom);

      html += `<div style="margin-bottom:24px;page-break-inside:avoid;">
        <div style="background:#1a3a6a;color:#fff;padding:8px 14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:700;font-size:14px;">${dateStr} &nbsp;(${dayName(dateStr)})</span>
          <span style="font-size:11px;opacity:0.7;">${nX?'X: '+nX+' | ':''}${nXII?'XII: '+nXII+' | ':''}Total: ${allSeated.length} | Rooms: ${totalRooms}</span>
        </div>`;

      // One table per subject (like sample image)
      const blocks = subjects.length === 0
        ? [{ code:'ALL', name:'All Subjects', cls:'', cands: allSeated }]
        : subjects.map(sub => ({
            ...sub,
            cands: allSeated.filter(s => {
              if (s.class !== sub.cls) return false;
              const f = (s.dateSubjects[dateStr]||[])[0];
              return f && f.code === sub.code;
            })
          }));

      // ══════════════════════════════════════════════════
      // SECTION 1 — CBSE Format (Room | Subject | From | To | Total)
      // ══════════════════════════════════════════════════
      html += `<div style="background:#e8f0fe;border-left:4px solid #1a50d4;padding:6px 12px;font-size:11px;font-weight:600;letter-spacing:1px;color:#1a50d4;margin-bottom:8px;">PLAN SUMMARY — CBSE FORMAT (Room / Subject / Roll Range)</div>`;
      html += `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:0;">
        <thead>
          <tr>
            <th rowspan="2" style="border:2px solid #333;padding:7px 10px;text-align:center;vertical-align:middle;width:70px;">Room No.</th>
            <th rowspan="2" style="border:2px solid #333;padding:7px 10px;text-align:center;vertical-align:middle;">Subject</th>
            <th colspan="3" style="border:2px solid #333;padding:6px 10px;text-align:center;">Roll No.</th>
          </tr>
          <tr>
            <th style="border:2px solid #333;padding:6px 10px;text-align:center;width:120px;">From</th>
            <th style="border:2px solid #333;padding:6px 10px;text-align:center;width:120px;">To</th>
            <th style="border:2px solid #333;padding:6px 10px;text-align:center;width:60px;">Total</th>
          </tr>
        </thead><tbody>`;
      let cgTotal=0; const cgSubTotals={};
      for (let room=1; room<=totalRooms; room++) {
        const rc=allSeated.filter(s=>s.roomNo===room).sort((a,b)=>a.roll.localeCompare(b.roll));
        if (!rc.length) continue; cgTotal+=rc.length;
        const subOrder=[]; const subSeen=new Set();
        rc.forEach(s=>{const f=(s.dateSubjects[dateStr]||[])[0];if(f&&!subSeen.has(f.code)){subSeen.add(f.code);subOrder.push({code:f.code,name:f.name});}});
        subOrder.forEach((sub,si)=>{
          const sc=rc.filter(s=>{const f=(s.dateSubjects[dateStr]||[])[0];return f&&f.code===sub.code;}).sort((a,b)=>a.roll.localeCompare(b.roll));
          if(!sc.length) return;
          const rf=sc[0].roll,rt=sc[sc.length-1].roll,lbl=sub.code+'-'+sub.name.toUpperCase().slice(0,16);
          if(!cgSubTotals[sub.code])cgSubTotals[sub.code]={lbl,total:0};
          cgSubTotals[sub.code].total+=sc.length;
          const hasX=sc.some(s=>s.class==='X'),hasXII=sc.some(s=>s.class==='XII');
          const bg=hasX&&hasXII?'#fff':hasX?'#f0fff4':'#eff6ff';
          const tb=si===0?'2px solid #666':'1px dashed #ccc', bb=si===subOrder.length-1?'2px solid #666':'1px dashed #ccc';
          html+=`<tr style="background:${bg}">
            <td style="border-left:2px solid #999;border-right:1px solid #999;border-top:${tb};border-bottom:${bb};padding:6px 10px;text-align:center;font-weight:700;font-size:14px;">${si===0?room:''}</td>
            <td style="border:1px solid #999;border-top:${tb};border-bottom:${bb};padding:6px 10px;text-align:center;font-size:11px;font-weight:600;">${lbl}</td>
            <td style="border:1px solid #999;border-top:${tb};border-bottom:${bb};padding:6px 10px;text-align:center;font-family:monospace;">${rf}</td>
            <td style="border:1px solid #999;border-top:${tb};border-bottom:${bb};padding:6px 10px;text-align:center;font-family:monospace;">${rt}</td>
            <td style="border:1px solid #999;border-top:${tb};border-bottom:${bb};padding:6px 10px;text-align:center;font-weight:700;font-size:14px;">${sc.length}</td>
          </tr>`;
        });
      }
      const cgSum=Object.values(cgSubTotals).map(s=>s.lbl+': '+s.total).join(' | ');
      html+=`<tr style="background:#1a3a6a;font-weight:800;">
        <td style="border:2px solid #333;padding:6px 10px;text-align:center;color:#f59e0b;">TOTAL</td>
        <td style="border:2px solid #333;padding:5px 10px;font-size:10px;color:rgba(255,255,255,0.6);">${totalRooms} rooms | ${cgSum}</td>
        <td colspan="2" style="border:2px solid #333;"></td>
        <td style="border:2px solid #333;padding:6px 10px;text-align:center;font-size:16px;color:#fff;">${cgTotal}</td>
      </tr></tbody></table>`;

      // ══════════════════════════════════════════════════
      // SECTION 2 — Detailed Format (Room | Class X | Class XII | Total | Subjects)
      // ══════════════════════════════════════════════════
      html += `<div style="background:#f0fdf4;border-left:4px solid #059669;padding:6px 12px;font-size:11px;font-weight:600;letter-spacing:1px;color:#065f46;margin-top:20px;margin-bottom:8px;">DETAILED SUMMARY — CLASS-WISE BREAKDOWN (Room / Class X / Class XII / Total)</div>`;
      html += `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:0;">
        <thead><tr>
          <th style="background:#2a3a5a;color:rgba(255,255,255,0.8);padding:8px 10px;text-align:left;font-size:11px;letter-spacing:1px;">Room No</th>
          <th style="background:#2a3a5a;color:rgba(255,255,255,0.8);padding:8px 10px;text-align:left;font-size:11px;letter-spacing:1px;">Roll No From</th>
          <th style="background:#2a3a5a;color:rgba(255,255,255,0.8);padding:8px 10px;text-align:left;font-size:11px;letter-spacing:1px;">Roll No To</th>
          <th style="background:#2a3a5a;color:rgba(255,255,255,0.8);padding:8px 10px;text-align:center;font-size:11px;letter-spacing:1px;">Class X</th>
          <th style="background:#2a3a5a;color:rgba(255,255,255,0.8);padding:8px 10px;text-align:center;font-size:11px;letter-spacing:1px;">Class XII</th>
          <th style="background:#2a3a5a;color:rgba(255,255,255,0.8);padding:8px 10px;text-align:center;font-size:11px;letter-spacing:1px;">Total</th>
          <th style="background:#2a3a5a;color:rgba(255,255,255,0.8);padding:8px 10px;text-align:left;font-size:11px;letter-spacing:1px;">Subjects</th>
        </tr></thead><tbody>`;
      let dtX=0,dtXII=0,dtTotal=0;
      for (let room=1; room<=totalRooms; room++) {
        const rc=allSeated.filter(s=>s.roomNo===room).sort((a,b)=>a.roll.localeCompare(b.roll));
        if (!rc.length) continue;
        const nx=rc.filter(s=>s.class==='X').length, nxii=rc.filter(s=>s.class==='XII').length;
        const subs=new Set(); rc.forEach(s=>(s.dateSubjects[dateStr]||[]).forEach(x=>subs.add(x.code)));
        dtX+=nx; dtXII+=nxii; dtTotal+=rc.length;
        const alt=room%2===0;
        html+=`<tr style="background:${alt?'#f9f9f7':'#fff'}">
          <td style="padding:6px 10px;border-bottom:1px solid #eee;"><span style="background:#0c1c35;color:#f59e0b;font-family:monospace;font-size:11px;padding:1px 7px;">Room ${String(room).padStart(2,'0')}</span></td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">${rc[0].roll}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">${rc[rc.length-1].roll}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;font-weight:600;color:#1b5e20;">${nx||'—'}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;font-weight:600;color:#0d47a1;">${nxii||'—'}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;font-weight:700;">${rc.length}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:11px;color:#555;">${[...subs].join(', ')}</td>
        </tr>`;
      }
      html+=`<tr style="background:#0c1c35;font-weight:800;">
        <td style="padding:7px 10px;color:#f59e0b;font-size:12px;">TOTAL</td>
        <td colspan="2" style="padding:7px 10px;font-family:monospace;font-size:10px;color:rgba(255,255,255,0.4);">${allSeated[0].roll} → ${allSeated[allSeated.length-1].roll}</td>
        <td style="padding:7px 10px;text-align:center;color:#6ee7b7;font-size:14px;">${dtX}</td>
        <td style="padding:7px 10px;text-align:center;color:#93c5fd;font-size:14px;">${dtXII}</td>
        <td style="padding:7px 10px;text-align:center;color:#fff;font-size:15px;">${dtTotal}</td>
        <td></td>
      </tr></tbody></table>`;

      // ══════════════════════════════════════════════════
      // SECTION 3 — Individual subject plans (per subject per room)
      // ══════════════════════════════════════════════════
      if (blocks.length > 0) {
        html += `<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:6px 12px;font-size:11px;font-weight:600;letter-spacing:1px;color:#92680a;margin-top:20px;margin-bottom:8px;">INDIVIDUAL CLASS / SUBJECT PLANS</div>`;
      }

      blocks.forEach((sub, bi) => {
        const roomsWithSub = [...new Set(sub.cands.map(s => s.roomNo))].sort((a,b)=>a-b);
        if (!roomsWithSub.length) return;
        const subLabel = sub.cls ? sub.code + '-' + sub.name.toUpperCase().slice(0,16) : sub.code;
        const clsBg = sub.cls==='X' ? '#f0fff4' : sub.cls==='XII' ? '#eff6ff' : '#fff';
        html += `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
          <thead>
            <tr>
              <th rowspan="2" style="border:2px solid #333;padding:7px 10px;text-align:center;vertical-align:middle;width:70px;">Room No.</th>
              <th rowspan="2" style="border:2px solid #333;padding:7px 10px;text-align:center;vertical-align:middle;width:130px;">Subject</th>
              <th colspan="3" style="border:2px solid #333;padding:6px 10px;text-align:center;">Roll No.</th>
            </tr>
            <tr>
              <th style="border:2px solid #333;padding:6px 10px;text-align:center;">From</th>
              <th style="border:2px solid #333;padding:6px 10px;text-align:center;">To</th>
              <th style="border:2px solid #333;padding:6px 10px;text-align:center;">Total</th>
            </tr>
          </thead><tbody>`;
        let gFrom='',gTo='',gTotal=0;
        roomsWithSub.forEach(roomNo=>{
          const rc=sub.cands.filter(s=>s.roomNo===roomNo).sort((a,b)=>a.roll.localeCompare(b.roll));
          if(!rc.length) return;
          const rf=rc[0].roll,rt=rc[rc.length-1].roll;
          gTotal+=rc.length;
          if(!gFrom||rf<gFrom)gFrom=rf; if(rt>gTo)gTo=rt;
          html+=`<tr style="background:${clsBg}">
            <td style="border:1px solid #999;padding:6px 10px;text-align:center;font-weight:700;font-size:14px;">${roomNo}</td>
            <td style="border:1px solid #999;padding:6px 10px;text-align:center;font-size:11px;font-weight:600;">${subLabel}</td>
            <td style="border:1px solid #999;padding:6px 10px;text-align:center;font-family:monospace;">${rf}</td>
            <td style="border:1px solid #999;padding:6px 10px;text-align:center;font-family:monospace;">${rt}</td>
            <td style="border:1px solid #999;padding:6px 10px;text-align:center;font-weight:700;font-size:14px;">${rc.length}</td>
          </tr>`;
        });
        html+=`<tr style="background:#f0f0ea;font-weight:800;">
          <td style="border:2px solid #333;padding:6px 10px;text-align:center;">TOTAL</td>
          <td style="border:2px solid #333;padding:6px 10px;text-align:center;font-size:11px;color:#555;">${sub.cls?sub.cls+' · '+sub.code:''}</td>
          <td style="border:2px solid #333;padding:6px 10px;text-align:center;font-family:monospace;font-size:11px;color:#777;">${gFrom}</td>
          <td style="border:2px solid #333;padding:6px 10px;text-align:center;font-family:monospace;font-size:11px;color:#777;">${gTo}</td>
          <td style="border:2px solid #333;padding:6px 10px;text-align:center;font-size:16px;">${gTotal}</td>
        </tr></tbody></table>`;
      });

      html += `</div>`;
    });
  }

  html += `</div>`;

  // Build print popup
  // Write content into a hidden iframe and print — no popup needed
  const printCSS = `
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:sans-serif; font-size:12px; color:#000; background:#fff; padding:12px; }
      @page { margin:8mm; size:A4 portrait; }
      table { border-collapse:collapse; }
    </style>`;

  const fullDoc = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Print</title>'
    + printCSS + '</head><body>' + html + '</body></html>';

  // Remove old iframe if exists
  const oldFrame = document.getElementById('print-iframe');
  if (oldFrame) oldFrame.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'print-iframe';
  iframe.style.cssText = 'position:fixed;bottom:0;right:0;width:1px;height:1px;border:none;opacity:0;';
  document.body.appendChild(iframe);

  const iDoc = iframe.contentDocument || iframe.contentWindow.document;
  iDoc.open();
  iDoc.write(fullDoc);
  iDoc.close();

  // Print after a short delay to let content render
  setTimeout(function() {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch(e) {
      alert('Print failed: ' + e.message);
    }
  }, 500);
}
// ══════════════════════════════════════════════════════════════
// QP LOG — State, UI, Print
// ══════════════════════════════════════════════════════════════

// ── QP Log key: 'subjectCode|class' ─────────────────────────
export function qpKey(subjectCode, cls) { return subjectCode + '|' + cls; }
export function getQPEntry(ds, subjectCode, cls) {
  if (!state.qpLog[ds]) state.qpLog[ds] = {};
  const key = qpKey(subjectCode, cls);
  if (!state.qpLog[ds][key]) {
    state.qpLog[ds][key] = { totalReceived: '', packets: '', timeReceived: '', forCS: 3 };
  }
  return state.qpLog[ds][key];
}
export function saveQPField(ds, subjectCode, cls, field, value) {
  const entry = getQPEntry(ds, subjectCode, cls);
  entry[field] = field === 'forCS' || field === 'totalReceived' || field === 'packets'
    ? (parseInt(value) || 0) : value;
  saveToBrowser();
}
// ── Get all subjects for a date (sorted X first then XII) ────
export function getSubjectsForDate(ds) {
  const subjects = [];
  const seen = new Set();
  const seated = state.dateStates[ds]?.seating || [];
  seated.forEach(s => {
    const codes = (s.dateSubjects?.[ds] || []);
    codes.forEach(sub => {
      const k = qpKey(sub.code, s.class);
      if (!seen.has(k)) {
        seen.add(k);
        subjects.push({ code: sub.code, name: sub.name, cls: s.class });
      }
    });
  });
  // Sort: X first, then XII; within each by code numerically
  subjects.sort((a, b) => {
    if (a.cls !== b.cls) return a.cls === 'X' ? -1 : 1;
    return a.code.localeCompare(b.code, undefined, { numeric: true });
  });
  return subjects;
}
// ── Allotted count = registered candidates for this subject/date ──
export function getAllotted(ds, subjectCode, cls) {
  return state.candidates.filter(cand =>
    cand.class === cls &&
    Object.values(cand.dateSubjects || {}).some(subs =>
      subs.some(s => s.code === subjectCode)
    ) &&
    Object.keys(cand.dateSubjects || {}).includes(ds)
  ).length;
}
// ── Present count from attendance ───────────────────────────
export function getPresentCount(ds, subjectCode, cls) {
  const dsState = state.dateStates[ds];
  if (!dsState) return 0;
  const seated = (dsState.seating || []).filter(s =>
    s.class === cls &&
    (s.dateSubjects?.[ds] || []).some(sub => sub.code === subjectCode)
  );
  return seated.filter(s => {
    const att = dsState.attendance?.[s.roll];
    return att !== 'A'; // unmarked = present
  }).length;
}
// ── Render QP Log entry table for current date ───────────────
export function renderQPLogTable(ds) {
  const container = document.getElementById('qp-log-table');
  const section   = document.getElementById('qp-log-section');
  if (!container || !section) return;

  if (!ds || !state.dateStates[ds]?.seating?.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  const subjects = getSubjectsForDate(ds);
  if (!subjects.length) { container.innerHTML = '<div style="color:#64748b;font-size:12px;">No subjects found for this date.</div>'; return; }

  let rows = '';
  subjects.forEach(({ code, name, cls }) => {
    const entry    = getQPEntry(ds, code, cls);
    const allotted = getAllotted(ds, code, cls);
    const present  = getPresentCount(ds, code, cls);
    const forCS    = entry.forCS ?? 3;
    const received = entry.totalReceived || 0;
    const returned = received ? Math.max(0, received - present - forCS) : '—';

    rows += `<tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:6px 8px;font-size:12px;font-weight:600;">${cls}</td>
      <td style="padding:6px 8px;font-size:12px;">${code} — ${name}</td>
      <td style="padding:6px 8px;font-size:12px;text-align:center;">${allotted}</td>
      <td style="padding:6px 8px;">
        <input type="number" min="0" value="${entry.totalReceived || ''}"
          placeholder="0"
          style="width:70px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:3px 6px;text-align:center;"
          onchange="saveQPField('${ds}','${code}','${cls}','totalReceived',this.value);renderQPLogTable('${ds}')">
      </td>
      <td style="padding:6px 8px;">
        <input type="number" min="0" value="${entry.packets || ''}"
          placeholder="0"
          style="width:60px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:3px 6px;text-align:center;"
          onchange="saveQPField('${ds}','${code}','${cls}','packets',this.value)">
      </td>
      <td style="padding:6px 8px;">
        <input type="time" value="${entry.timeReceived || ''}"
          style="width:90px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:3px 6px;"
          onchange="saveQPField('${ds}','${code}','${cls}','timeReceived',this.value)">
      </td>
      <td style="padding:6px 8px;">
        <input type="number" min="0" value="${forCS}"
          style="width:50px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:3px 6px;text-align:center;"
          onchange="saveQPField('${ds}','${code}','${cls}','forCS',this.value);renderQPLogTable('${ds}')">
      </td>
      <td style="padding:6px 8px;font-size:12px;text-align:center;">${present}</td>
      <td style="padding:6px 8px;font-size:12px;text-align:center;font-weight:600;color:${typeof returned==='number'&&returned<0?'#ef4444':'#0c1c35'}">${returned}</td>
    </tr>`;
  });

  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:#0c1c35;color:#fff;">
          <th style="padding:7px 8px;text-align:left;font-size:11px;">Class</th>
          <th style="padding:7px 8px;text-align:left;font-size:11px;">Subject</th>
          <th style="padding:7px 8px;text-align:center;font-size:11px;">Allotted</th>
          <th style="padding:7px 8px;text-align:center;font-size:11px;">Total Recd.</th>
          <th style="padding:7px 8px;text-align:center;font-size:11px;">Packets</th>
          <th style="padding:7px 8px;text-align:center;font-size:11px;">Time Recd.</th>
          <th style="padding:7px 8px;text-align:center;font-size:11px;">For CS</th>
          <th style="padding:7px 8px;text-align:center;font-size:11px;">Used (Present)</th>
          <th style="padding:7px 8px;text-align:center;font-size:11px;">Return</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}
// ════════════════════════════════════════════════════════════════
// PRINT: QP Statement (Image 1) — one page per class per date
// ════════════════════════════════════════════════════════════════
export function printQPStatement() {
  if (!currentDate) { showModal('QP Statement', 'Please select an exam date first.'); return; }
  const ds       = currentDate;
  const dsState  = state.dateStates[ds];
  if (!dsState?.seating?.length) { showModal('QP Statement', 'No seating data for this date.'); return; }

  const centreName = document.getElementById('cfg-centre-name').value || 'Centre';
  const centreCode = document.getElementById('cfg-centre-code').value || '';
  const d          = parseDate(ds);
  const dayStr     = d.toLocaleDateString('en-IN', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });

  const subjects = getSubjectsForDate(ds);
  // Group by class
  const byClass = {};
  subjects.forEach(s => {
    if (!byClass[s.cls]) byClass[s.cls] = [];
    byClass[s.cls].push(s);
  });

  let pages = '';
  ['X','XII'].forEach(cls => {
    if (!byClass[cls]) return;
    const examLabel = getExamLabel(cls);
    const classLabel = cls === 'X' ? 'CLASS-X' : 'CLASS-XII';

    byClass[cls].forEach(({ code, name }) => {
      const entry    = getQPEntry(ds, code, cls);
      const present  = getPresentCount(ds, code, cls);
      const forCS    = entry.forCS ?? 3;
      const received = entry.totalReceived || 0;
      const returned = Math.max(0, received - present - forCS);
      const subLabel = `${code} — ${name}`;

      pages += `
      <div class="qp-page">
        <div class="qp-title">QUESTION PAPER STATEMENT</div>
        <table class="qp-header-table">
          <tr>
            <td><b>Name of Centre :</b> ${centreName}</td>
            <td style="text-align:right;"><b>Centre No.: ${centreCode}</b></td>
          </tr>
          <tr>
            <td><b>${examLabel}</b></td>
            <td style="text-align:right;"><b>Sub: ${name} (${code})</b></td>
          </tr>
          <tr>
            <td><b>Day &amp; Date :</b> &nbsp;${dayStr}</td>
            <td></td>
          </tr>
        </table>
        <div class="qp-class-label">${classLabel}</div>
        <table class="qp-data-table">
          <tr><td class="qp-label">Total Received</td><td class="qp-value">${received || ''}</td></tr>
          <tr><td class="qp-label">Centre Used</td><td class="qp-value">${present}</td></tr>
          <tr><td class="qp-label">FOR CS</td><td class="qp-value">${forCS}</td></tr>
          <tr><td class="qp-label">Total Return</td><td class="qp-value">${received ? returned : ''}</td></tr>
        </table>
        <div class="qp-sig">Signature of Centre Superintendent</div>
      </div>`;
    });
  });

  const session = beginPrintSession({
    reportKey: 'qpStatement',
    beforePrint: () => {
      const o = document.getElementById('qp-stmt-overlay');
      if (o) { o.style.position='static'; o.style.overflow='visible'; o.style.background='#fff'; }
    },
    afterPrint: () => {
      const o = document.getElementById('qp-stmt-overlay');
      if (o) { o.style.position='fixed'; o.style.overflow='auto'; o.style.background='#e5e7eb'; }
    },
  });
  const style = document.createElement('style');
  style.id = session.styleId;
  document.getElementById(session.styleId)?.remove();
  style.textContent = `${buildPrintShellCSS({
      overlayId: session.overlayId,
      pageSize: session.pageSize,
      orientation: session.orientation,
      margins: session.margins
    })}
      @media print { #qp-stmt-overlay > div:first-child { display:none!important; } }
    .qp-page { width:170mm;margin:0 auto 0 auto;padding:10mm 0;page-break-after:always;font-family:Arial,sans-serif; }
    .qp-page:last-child { page-break-after:avoid; }
    .qp-title { text-align:center;font-size:16pt;font-weight:700;text-decoration:underline;margin-bottom:12mm; }
    .qp-header-table { width:100%;border-collapse:collapse;margin-bottom:8mm;font-size:11pt; }
    .qp-header-table td { padding:3mm 0; }
    .qp-class-label { text-align:center;font-size:13pt;font-weight:700;margin:6mm 0; }
    .qp-data-table { width:100%;border-collapse:collapse;margin:0 auto;font-size:12pt; }
    .qp-data-table tr { border:1.5px solid #000; }
    .qp-label { padding:6mm 8mm;font-weight:700;border-right:1.5px solid #000;width:60%; }
    .qp-value { padding:6mm 8mm;text-align:center;font-weight:700;font-size:14pt; }
    .qp-sig { text-align:center;margin-top:20mm;font-size:11pt;font-weight:600; }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = session.overlayId;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow-y:auto;background:#fff;';
  overlay.innerHTML = `
    <div style="background:#0c1c35;color:#fff;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;">
      <span style="font-weight:700;">📄 QP Statement — ${ds}</span>
      <div style="display:flex;gap:8px;">
        <button onclick="window.print()" style="background:#f59e0b;color:#000;border:none;border-radius:5px;padding:6px 16px;font-weight:700;cursor:pointer;">🖨️ Print / Save PDF</button>
        <button onclick="closePrintSession('qpStatement','qp-stmt-overlay','qp-stmt-style')" style="background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:5px;padding:6px 14px;cursor:pointer;">✕ Close</button>
      </div>
    </div>
    <div style="padding:10mm 0 0 0;background:#fff;">${pages}</div>`;
  document.body.appendChild(overlay);
}
// ════════════════════════════════════════════════════════════════
// PRINT: Bank QP Register (Image 2) — all dates all subjects
// ════════════════════════════════════════════════════════════════
export function printBankQPRegister() {
  if (!state.allDates.length) { showModal('Bank QP Register', 'No dates found. Please generate seating first.'); return; }

  const { centreName, centreCode } = getCentreMeta();

  let classesPresent = new Set();
  state.allDates.forEach(ds => getSubjectsForDate(ds).forEach(s => classesPresent.add(s.cls)));
  let examParts = [];
  if (classesPresent.has('XII')) examParts.push(document.getElementById('cfg-exam-name-xii')?.value?.trim() || 'AISSCE');
  if (classesPresent.has('X')) examParts.push(document.getElementById('cfg-exam-name-x')?.value?.trim() || 'SSE');
  const examName = examParts.length ? examParts.join('/') : 'AISSCE/SSE';
  const yyyy = getExamYear();
  const sessionStr = `${yyyy-1}-${String(yyyy).slice(2)}`;
  const examTitle = `BANK QUESTION PAPER PACKETS OF ${examName.toUpperCase()} ${sessionStr}`;

  let sn = 0;
  let rows = '';
  const CS = 'border:1px solid #000;padding:3px 5px;';
  const IS = 'width:100%;font-size:9pt;border:none;outline:none;text-align:center;background:transparent;box-sizing:border-box;';

  state.allDates.forEach(ds => {
    const subjects = getSubjectsForDate(ds);
    if (!subjects.length) return;
    sn++;
    const d      = parseDate(ds);
    const dayStr = d.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'short', year:'numeric' });
    const rowspan = subjects.length;

    subjects.forEach(({ code, name, cls }, i) => {
      const entry    = getQPEntry(ds, code, cls);
      const allotted = getAllotted(ds, code, cls);
      const subLabel = `${code}-${name}`;

      rows += `<tr style="border:1px solid #000;">
        ${i===0 ? `<td rowspan="${rowspan}" style="${CS}text-align:center;vertical-align:middle;font-weight:700;">${sn}</td>
        <td rowspan="${rowspan}" style="${CS}vertical-align:middle;font-size:9pt;">${dayStr}</td>` : ''}
        <td style="${CS}font-size:9pt;">${subLabel}</td>
        <td style="${CS}text-align:center;">${cls}</td>
        <td style="${CS}text-align:center;">${allotted}</td>
        <td style="${CS}"><input type="number" min="0" value="${entry.packets||''}" style="${IS}" onchange="saveQPField('${ds}','${code}','${cls}','packets',this.value)"></td>
        <td style="${CS}"><input type="number" min="0" value="${entry.totalReceived||''}" style="${IS}" onchange="saveQPField('${ds}','${code}','${cls}','totalReceived',this.value);renderQPLogTable(currentDate)"></td>
        <td style="${CS}text-align:center;">${entry.timeReceived||''}</td>
        <td style="${CS}"></td>
        <td style="${CS}"></td>
      </tr>`;
    });
  });

  const session = beginPrintSession({
    reportKey: 'qpRegister',
    beforePrint: () => {
      const o = document.getElementById('qp-reg-overlay');
      if (o) { o.style.position='static'; o.style.overflow='visible'; o.style.background='#fff'; }
    },
    afterPrint: () => {
      const o = document.getElementById('qp-reg-overlay');
      if (o) { o.style.position='fixed'; o.style.overflow='auto'; o.style.background='#e5e7eb'; }
    },
  });

  const styleEl = document.createElement('style');
  styleEl.id = session.styleId;
  document.getElementById(session.styleId)?.remove();
  styleEl.textContent = `${buildPrintShellCSS({
      overlayId: session.overlayId,
      pageSize: session.pageSize,
      orientation: session.orientation,
      margins: session.margins
    })}
      @media print { #qp-reg-overlay > div:first-child { display:none!important; } }
      input { border:none!important;background:transparent!important; }
    #qp-reg-overlay table { font-family:Arial,sans-serif;font-size:9pt; }
    #qp-reg-overlay input:focus { background:#fffbeb!important; }
  `;
  document.head.appendChild(styleEl);

  const overlay = document.createElement('div');
  overlay.id = session.overlayId;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow-y:auto;background:#fff;';
  overlay.innerHTML = `
    <div style="background:#0c1c35;color:#fff;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;">
      <span style="font-weight:700;">📋 Bank QP Register</span>
      <div style="display:flex;gap:8px;">
        <button onclick="window.print()" style="background:#f59e0b;color:#000;border:none;border-radius:5px;padding:6px 16px;font-weight:700;cursor:pointer;">🖨️ Print / Save PDF</button>
        <button onclick="closePrintSession('qpRegister','qp-reg-overlay','qp-reg-style')" style="background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:5px;padding:6px 14px;cursor:pointer;">✕ Close</button>
      </div>
    </div>
    <div style="padding:10mm 0 0 0;background:#fff;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr><td colspan="10" style="text-align:center;padding:5px;font-weight:700;font-size:12pt;border:1px solid #000;">${centreName.toUpperCase()} (CENTRE NO. ${centreCode})</td></tr>
          <tr><td colspan="10" style="text-align:center;padding:4px;font-weight:700;font-size:10pt;border:1px solid #000;">${examTitle}</td></tr>
          <tr style="background:#1c3557;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
            <th style="border:1px solid #000;padding:5px 4px;width:4%;">SN</th>
            <th style="border:1px solid #000;padding:5px 4px;width:15%;">DATE</th>
            <th style="border:1px solid #000;padding:5px 4px;width:18%;">SUBJECT</th>
            <th style="border:1px solid #000;padding:5px 4px;width:6%;">CLASS</th>
            <th style="border:1px solid #000;padding:5px 4px;width:8%;">ALLOTTED</th>
            <th style="border:1px solid #000;padding:5px 4px;width:9%;">RECEIVED PKT</th>
            <th style="border:1px solid #000;padding:5px 4px;width:9%;">TOTAL QP</th>
            <th style="border:1px solid #000;padding:5px 4px;width:11%;">TIME OF RECEIVING</th>
            <th style="border:1px solid #000;padding:5px 4px;width:10%;">SIGN OF CS</th>
            <th style="border:1px solid #000;padding:5px 4px;width:10%;">SIGN OF BANK MGR</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  document.body.appendChild(overlay);
}
export function printAbsenteeDetail(targetDate) {
  const ds = targetDate || currentDate;
  if (!ds) {
    showModal('Select Date', 'Please select an exam date first.');
    return;
  }
  if (!state.generated) {
    showModal('Not Generated', 'Please generate seating plan first.');
    return;
  }

  const session = beginPrintSession({ reportKey: 'absenteeDetail' });
  const { overlayId, styleId } = session;

  const centreName = document.getElementById('cfg-centre-name').value || 'Centre';
  const centreCode = document.getElementById('cfg-centre-code').value || '';

  // Get all candidates for this date
  const dateCands = (state.seating[ds] || []).filter(c => c.roll);
  if (!dateCands.length) {
    showModal('No Data', 'No candidates found for ' + ds);
    return;
  }

  // Group by subject (Class-Code)
  const groups = {};
  dateCands.forEach(c => {
    const subjects = c.dateSubjects[ds] || [];
    subjects.forEach(sub => {
      const key = `${c.class}-${sub.code}`;
      if (!groups[key]) {
        groups[key] = {
          cls: c.class,
          code: sub.code,
          name: sub.name,
          cands: []
        };
      }
      groups[key].cands.push(c);
    });
  });

  const sortedKeys = Object.keys(groups).sort();
  let pages = '';

  sortedKeys.forEach(key => {
    const group = groups[key];
    const cands = group.cands.sort((a,b) => a.roll.localeCompare(b.roll));
    
    const att = (state.dateStates[ds] && state.dateStates[ds].attendance) || {};
    const absents = cands.filter(c => att[c.roll] === 'A');
    const presents = cands.filter(c => att[c.roll] !== 'A');

    const totalReg = cands.length;
    const totalAbsent = absents.length;
    const totalPresent = presents.length;
    const totalABSent = totalPresent; // Per user request: present candidate = answer book sent

    const absentRolls = absents.map(c => c.roll).join(', ');
    const presentRolls = presents.map(c => c.roll).join(', ');

    pages += `
    <div class="absentee-page" style="width:190mm; margin:0 auto; font-family:Arial, sans-serif; padding:10mm 5mm; page-break-after:always;">
      <div style="text-align:center; text-decoration:underline; font-weight:bold; font-size:14pt; margin-bottom:20px;">ABSENTEE DETAIL</div>
      
      <table style="width:100%; border-collapse:collapse; font-size:11pt; margin-bottom:10px;">
        <tr>
          <td style="width:150px; font-weight:bold; padding:4px 0;">Center No.:</td>
          <td style="font-weight:bold; padding:4px 0;">${centreCode}</td>
        </tr>
        <tr>
          <td style="font-weight:bold; padding:4px 0;">Name of Centre:</td>
          <td style="padding:4px 0;">${centreName.toUpperCase()}</td>
        </tr>
        <tr>
          <td style="font-weight:bold; padding:4px 0;">Name of Examination:</td>
          <td style="padding:4px 0;">${getExamFullUpper(group.cls)} ${getExamYear()}</td>
        </tr>
        <tr>
          <td style="font-weight:bold; padding:4px 0;">Subject:</td>
          <td style="padding:4px 0;">${group.cls}-${group.code}-${group.name.toUpperCase()}</td>
          <td style="width:100px; font-weight:bold; padding:4px 0;">TOTAL REG.</td>
          <td style="width:50px; font-weight:bold; padding:4px 0; text-align:right;">${totalReg}</td>
        </tr>
        <tr>
          <td style="font-weight:bold; padding:4px 0;">Day & Date:</td>
          <td style="padding:4px 0;">${dayName(ds)}, ${ds}</td>
        </tr>
      </table>

      <div style="text-align:center; font-weight:bold; font-size:12pt; margin:15px 0 5px 0;">ABSENT ROLL NO(s).</div>
      <div style="border:1.5px solid #000; min-height:80px; padding:10px; font-family:'Courier New', monospace; font-size:11pt; line-height:1.6; margin-bottom:20px;">
        ${absentRolls || '&nbsp;'}
      </div>

      <div style="text-align:center; font-weight:bold; font-size:12pt; border-bottom:1.5px solid #000; margin:15px 0 10px 0; padding-bottom:5px;">PRESENT ROLL NO(s).</div>
      <div style="font-family:'Courier New', monospace; font-size:10pt; line-height:1.5; margin-bottom:40px; text-align:justify;">
        ${presentRolls || '&nbsp;'}
      </div>

      <table style="width:100%; border-collapse:collapse; font-size:11pt; margin-top:auto;">
        <tr>
          <td style="width:33%; font-weight:bold; padding:5px 0;">TOTAL ABSENTEE</td>
          <td style="width:10%; font-weight:bold; padding:5px 0;">${totalAbsent}</td>
          <td style="width:33%; font-weight:bold; padding:5px 0;">TOTAL PRESENT</td>
          <td style="width:10%; font-weight:bold; padding:5px 0; text-align:right;">${totalPresent}</td>
        </tr>
        <tr>
          <td></td>
          <td></td>
          <td style="font-weight:bold; padding:5px 0;">TOTAL ANSWER BOOK SENT</td>
          <td style="font-weight:bold; padding:5px 0; text-align:right;">${totalABSent}</td>
        </tr>
      </table>

      <div style="font-weight:bold; font-size:10pt; margin-top:20px;">* NO UNFAIR MEANS CASES</div>

      <div style="display:flex; justify-content:space-between; margin-top:40px; font-weight:bold; font-size:11pt;">
        <div>DATE:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${ds}</div>
        <div style="text-align:right;">Signature of Centre Superintendent</div>
      </div>
    </div>
    `;
  });

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `${buildPrintShellCSS(session)}
  .absentee-page { page-break-after:always; }
  .absentee-page:last-child { page-break-after:avoid; }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow-y:auto;background:#fff;';
  overlay.innerHTML = `
    <div class="no-print" style="position:sticky;top:0;background:#0c1c35;color:#fff;
      z-index:10001;padding:10px 20px;display:flex;align-items:center;
      justify-content:space-between;font-family:Arial,sans-serif;font-size:13px;">
      <span>📋 Absentee Detail Report — ${ds}</span>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-primary btn-sm" onclick="window.print()">🖨️ Print</button>
        <button class="btn btn-outline btn-sm" style="color:#fff;border-color:rgba(255,255,255,0.3)" 
          onclick="closePrintSession('${session.reportKey}','${overlayId}','${styleId}')">✕ Close</button>
      </div>
    </div>
    <div class="print-content" style="background:#fff;">${pages}</div>
  `;
  document.body.appendChild(overlay);
  registerPrintHooks(session.reportKey, session.beforePrint, session.afterPrint);
}
export function printDaySummary(targetDate) {
  const ds = targetDate || currentDate;
  if (!ds) {
    showModal('Select Date', 'Please select an exam date first.');
    return;
  }
  if (!state.generated) {
    showModal('Not Generated', 'Please generate seating plan first.');
    return;
  }

  const session = beginPrintSession({ reportKey: 'daySummary' });
  const { overlayId, styleId } = session;

  const centreName = document.getElementById('cfg-centre-name').value || 'Centre';
  const centreCode = document.getElementById('cfg-centre-code').value || '';

  // Get all candidates for this date
  const dateCands = (state.seating[ds] || []).filter(c => c.roll);
  if (!dateCands.length) {
    showModal('No Data', 'No candidates found for ' + ds);
    return;
  }

  const att = (state.dateStates[ds] && state.dateStates[ds].attendance) || {};

  // Group by class -> subject code
  const classGroups = {};
  dateCands.forEach(c => {
    const subjects = c.dateSubjects[ds] || [];
    subjects.forEach(sub => {
      if (!classGroups[c.class]) classGroups[c.class] = {};
      const subGroup = classGroups[c.class];
      if (!subGroup[sub.code]) subGroup[sub.code] = { code: sub.code, name: sub.name, cands: [] };
      subGroup[sub.code].cands.push(c);
    });
  });

  const classes = Object.keys(classGroups).sort((a,b) => a==='X' ? -1 : (b==='X' ? 1 : a.localeCompare(b)));

  let pages = '';
  classes.forEach(cls => {
    const subGroup = classGroups[cls];
    const subCodes = Object.keys(subGroup).sort();

    let rows = '';
    let totReg = 0, totAbsent = 0, totPresent = 0, totSent = 0;

    subCodes.forEach(code => {
      const { name, cands } = subGroup[code];
      const reg     = cands.length;
      const absent  = cands.filter(c => att[c.roll] === 'A').length;
      const present = reg - absent;
      const sent    = present; // Per convention: present candidate = answer book sent

      totReg += reg; totAbsent += absent; totPresent += present; totSent += sent;

      rows += `
        <tr>
          <td style="border:1px solid #000;padding:4px 6px;">${cls}-${code}-${name.toUpperCase()}</td>
          <td style="border:1px solid #000;padding:4px 6px;text-align:center;">${reg}</td>
          <td style="border:1px solid #000;padding:4px 6px;text-align:center;">${absent}</td>
          <td style="border:1px solid #000;padding:4px 6px;text-align:center;">${present}</td>
          <td style="border:1px solid #000;padding:4px 6px;text-align:center;">${sent}</td>
        </tr>`;
    });

    rows += `
      <tr>
        <td style="border:1px solid #000;padding:4px 6px;font-weight:bold;">TOTAL</td>
        <td style="border:1px solid #000;padding:4px 6px;text-align:center;font-weight:bold;">${totReg}</td>
        <td style="border:1px solid #000;padding:4px 6px;text-align:center;font-weight:bold;">${totAbsent}</td>
        <td style="border:1px solid #000;padding:4px 6px;text-align:center;font-weight:bold;">${totPresent}</td>
        <td style="border:1px solid #000;padding:4px 6px;text-align:center;font-weight:bold;">${totSent}</td>
      </tr>`;

    pages += `
    <div class="day-summary-page" style="width:190mm; margin:0 auto; font-family:Arial, sans-serif; padding:10mm 5mm; page-break-after:always;">
      <div style="text-align:center; text-decoration:underline; font-weight:bold; font-size:14pt; margin-bottom:20px;">SUMMARY</div>

      <table style="width:100%; border-collapse:collapse; font-size:11pt; margin-bottom:10px;">
        <tr>
          <td style="width:150px; font-weight:bold; padding:4px 0;">Center No.:</td>
          <td style="font-weight:bold; padding:4px 0;">${centreCode}</td>
        </tr>
        <tr>
          <td style="font-weight:bold; padding:4px 0;">Name of Centre:</td>
          <td style="padding:4px 0;">${centreName.toUpperCase()}</td>
        </tr>
        <tr>
          <td style="font-weight:bold; padding:4px 0;">Name of Examination:</td>
          <td style="padding:4px 0;">${getExamFullUpper(cls)} ${getExamYear()}</td>
        </tr>
        <tr>
          <td style="font-weight:bold; padding:4px 0;">Day & Date:</td>
          <td style="padding:4px 0;">${dayName(ds)}, ${ds}</td>
        </tr>
      </table>

      <div style="text-align:center; text-decoration:underline; font-weight:bold; font-size:12pt; margin:15px 0 10px 0;">CLASS-${cls}</div>

      <table style="width:100%; border-collapse:collapse; font-size:10.5pt;">
        <thead>
          <tr>
            <th style="border:1px solid #000;padding:5px 6px;background:#fff;">SUBJECT</th>
            <th style="border:1px solid #000;padding:5px 6px;background:#fff;width:60px;">TOTAL<br>REG.</th>
            <th style="border:1px solid #000;padding:5px 6px;background:#fff;width:60px;">ABSENT</th>
            <th style="border:1px solid #000;padding:5px 6px;background:#fff;width:60px;">PRESENT</th>
            <th style="border:1px solid #000;padding:5px 6px;background:#fff;width:100px;">ANSWER<br>BOOK SENT</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div style="display:flex; justify-content:space-between; margin-top:60px; font-weight:bold; font-size:11pt;">
        <div>DATE:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${ds}</div>
        <div style="text-align:right;">Signature of Centre Superintendent</div>
      </div>
    </div>
    `;
  });

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `${buildPrintShellCSS(session)}
  .day-summary-page { page-break-after:always; }
  .day-summary-page:last-child { page-break-after:avoid; }
  .day-summary-page table thead th {
    background:#fff!important; color:#000!important;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow-y:auto;background:#fff;';
  overlay.innerHTML = `
    <div class="no-print" style="position:sticky;top:0;background:#0c1c35;color:#fff;
      z-index:10001;padding:10px 20px;display:flex;align-items:center;
      justify-content:space-between;font-family:Arial,sans-serif;font-size:13px;">
      <span>📋 Day Summary Report — ${ds}</span>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-primary btn-sm" onclick="window.print()">🖨️ Print</button>
        <button class="btn btn-outline btn-sm" style="color:#fff;border-color:rgba(255,255,255,0.3)"
          onclick="closePrintSession('${session.reportKey}','${overlayId}','${styleId}')">✕ Close</button>
      </div>
    </div>
    <div class="print-content" style="background:#fff;">${pages}</div>
  `;
  document.body.appendChild(overlay);
  registerPrintHooks(session.reportKey, session.beforePrint, session.afterPrint);
}
