// ============================================================
// invigilator.js — extracted from CBSE_Centre_Manager.html (Phase A modular split)
// ============================================================
import { dayName, getActiveCodes, parseDate, sortDates } from './parser.js';
import { beginPrintSession, buildPrintShellCSS, closePrintSession } from './reports.js';
import { getExamShort, getExamYear, state } from './state.js';
import { saveToBrowser } from './storage.js';
import { showModal } from './ui.js';

// ══════════════════════════════════════════════════════════════
// INVIGILATOR DEMAND — Step 1: Report, Step 2: Requirements, Step 3: Letters
// ══════════════════════════════════════════════════════════════

export const DEFAULT_INV_TEMPLATE = `To,
THE PRINCIPAL
{SCHOOL_CODE}  {SCHOOL_NAME}

SUBJECT: DETAILMENT OF TEACHER AS ASSISTANT SUPERINTENDENT FOR {BOARD_EXAM_LABEL}

Dear Sir/Madam,
1. Please refer to CBSE letter regarding conduction of {BOARD_EXAM_LABEL}.
2. As per the orders received from C.B.S.E. regional office Lucknow (UP) our school, {CENTRE_NAME} has been selected as centre to conduct {BOARD_EXAM_LABEL}. Your School is going to be appear in this examination at our centre.
3. The examination is scheduled to be conducted with effect from {FIRST_DUTY_DATE}. Therefore, you are requested to detail teacher to perform the duties of as Assistant Superintendent in the {BOARD_EXAM_LABEL}. The teacher so detailed will report to this school at 09:00 AM on following dates for smooth conduction of the examination:-

{DUTY_DATES_TABLE}

4. Please note that teacher detailed should not be concerned of particular subject.
5. Please mention Bank details of Invigilator (Name, A/C No, Bank IFSC, Bank Name, Mobile Number) and OASIS-ID in the letter.
   Your co-operation in this regard will be highly appreciated.

   Thanking you,

   With Regards,


   {CS_NAME}
   (Principal)`;
// ── Step tab switcher ──────────────────────────────────────────
export function showInvStep(n) {
  [1,2,3].forEach(i => {
    document.getElementById(`inv-step-${i}`).style.display = i === n ? '' : 'none';
    const tab = document.getElementById(`inv-tab-${i}`);
    tab.style.fontWeight = i === n ? '700' : '400';
    tab.style.color = i === n ? '#0c1c35' : '#64748b';
    tab.style.borderBottomColor = i === n ? '#0c1c35' : 'transparent';
  });
  if (n === 1) renderInvReport();
  if (n === 2) renderInvReq();
  if (n === 3) renderInvLetterStep();
}
// ── Build the core data structure ─────────────────────────────
// Returns: { date → { class → { subjectCode → { schoolCode → { name, count } } } } }
export function buildInvData() {
  const data = {};
  state.candidates.forEach(cand => {
    Object.entries(cand.dateSubjects).forEach(([ds, subjects]) => {
      if (!data[ds]) data[ds] = {};
      const cls = cand.class;
      if (!data[ds][cls]) data[ds][cls] = {};
      subjects.forEach(sub => {
        const code = sub.code;
        if (!data[ds][cls][code]) data[ds][cls][code] = {};
        if (!data[ds][cls][code][cand.schoolCode])
          data[ds][cls][code][cand.schoolCode] = { name: cand.schoolName, count: 0 };
        data[ds][cls][code][cand.schoolCode].count++;
      });
    });
  });
  return data;
}
// Build school totals: { schoolCode → { name, totalCands, dates: Set } }
export function buildSchoolTotals() {
  const totals = {};
  state.candidates.forEach(cand => {
    if (!totals[cand.schoolCode])
      totals[cand.schoolCode] = { name: cand.schoolName, totalCands: 0, dates: new Set() };
    totals[cand.schoolCode].totalCands++;
    Object.keys(cand.dateSubjects).forEach(ds => totals[cand.schoolCode].dates.add(ds));
  });
  return totals;
}
// Build school-wise exam-date counts for invigilator demand.
// A candidate is counted once for a date even if multiple subject codes exist on that date.
export function buildInvSchoolDateCounts() {
  const totals = {};
  state.candidates.forEach(cand => {
    if (cand.schoolCode === '99999') return;
    if (!totals[cand.schoolCode]) {
      totals[cand.schoolCode] = { name: cand.schoolName, dates: {}, totalCands: 0 };
    }
    Object.keys(cand.dateSubjects || {}).forEach(ds => {
      totals[cand.schoolCode].dates[ds] = (totals[cand.schoolCode].dates[ds] || 0) + 1;
    });
  });
  Object.values(totals).forEach(sch => {
    sch.totalCands = Object.values(sch.dates).reduce((sum, count) => sum + count, 0);
  });
  return totals;
}
// ── Step 1: Render Report ──────────────────────────────────────
export function renderInvReport() {
  const out = document.getElementById('inv-report-output');
  if (!state.candidates.length) {
    out.innerHTML = '<div class="empty-state" style="padding:40px;text-align:center;color:#64748b;">⚠️ No candidates loaded. Please upload files first.</div>';
    return;
  }

  // Populate date filter
  const dateFilter = document.getElementById('inv-filter-date');
  const clsFilter  = document.getElementById('inv-filter-class');
  const prevDate   = dateFilter.value;
  dateFilter.innerHTML = '<option value="all">All Dates</option>';
  state.allDates.forEach(ds => {
    const opt = document.createElement('option');
    opt.value = ds; opt.textContent = ds;
    if (ds === prevDate) opt.selected = true;
    dateFilter.appendChild(opt);
  });

  const filterDate = dateFilter.value;
  const filterCls  = clsFilter.value;

  const data = buildInvData();
  const dates = filterDate === 'all' ? state.allDates : [filterDate];
  const classes = filterCls === 'all' ? ['X','XII'] : [filterCls];

  // Collect all school codes that appear in this filter
  const schoolSet = new Set();
  dates.forEach(ds => {
    classes.forEach(cls => {
      if (data[ds]?.[cls]) {
        Object.values(data[ds][cls]).forEach(bySchool =>
          Object.keys(bySchool).forEach(sc => schoolSet.add(sc))
        );
      }
    });
  });
  const schools = [...schoolSet].sort();

  if (!schools.length) {
    out.innerHTML = '<div style="color:#64748b;padding:20px;">No data for selected filter.</div>';
    return;
  }

  // Build HTML table
  let html = `<div class="table-wrap" style="overflow-x:auto;">
    <table style="font-size:11px;border-collapse:collapse;min-width:100%;">
      <thead>
        <tr style="background:#0c1c35;color:#fff;">
          <th style="padding:6px 10px;text-align:left;white-space:nowrap;">School Code</th>
          <th style="padding:6px 10px;text-align:left;min-width:200px;">School Name</th>`;

  // One column per date+class+subject combination
  const cols = []; // { ds, cls, code, name }
  dates.forEach(ds => {
    classes.forEach(cls => {
      if (!data[ds]?.[cls]) return;
      const codes = getActiveCodes(cls);
      Object.keys(data[ds][cls]).sort().forEach(code => {
        cols.push({ ds, cls, code, name: codes[code] || code });
        html += `<th style="padding:6px 8px;text-align:center;white-space:nowrap;font-size:10px;">
          ${ds}<br>${cls === 'XII' ? 'XII' : 'X'}<br>${code}
        </th>`;
      });
    });
  });

  html += `<th style="padding:6px 10px;text-align:center;background:#1e3a5f;white-space:nowrap;">Total</th>
        </tr>
      </thead><tbody>`;

  // One row per school
  schools.forEach((sc, idx) => {
    const schName = [...Object.values(data)].flatMap(byDate =>
      Object.values(byDate).flatMap(byCls =>
        Object.values(byCls).map(bySchool => bySchool[sc]?.name)
      )
    ).find(Boolean) || sc;

    let rowTotal = 0;
    let rowHtml = `<tr style="background:${idx%2===0?'#f8fafc':'#fff'};">
      <td style="padding:5px 10px;font-family:monospace;font-size:11px;font-weight:600;">${sc}</td>
      <td style="padding:5px 10px;">${schName}</td>`;

    cols.forEach(({ ds, cls, code }) => {
      const cnt = data[ds]?.[cls]?.[code]?.[sc]?.count || 0;
      rowTotal += cnt;
      rowHtml += `<td style="padding:5px 8px;text-align:center;${cnt>0?'font-weight:600;color:#0c1c35;':'color:#cbd5e1;'}">${cnt > 0 ? cnt : '—'}</td>`;
    });

    rowHtml += `<td style="padding:5px 10px;text-align:center;font-weight:700;background:#e0e7ff;">${rowTotal}</td></tr>`;
    html += rowHtml;
  });

  // Totals row
  html += `<tr style="background:#0c1c35;color:#fff;font-weight:700;">
    <td colspan="2" style="padding:6px 10px;">TOTAL</td>`;
  cols.forEach(({ ds, cls, code }) => {
    const total = schools.reduce((s, sc) => s + (data[ds]?.[cls]?.[code]?.[sc]?.count || 0), 0);
    html += `<td style="padding:6px 8px;text-align:center;">${total}</td>`;
  });
  const grandTotal = schools.reduce((s, sc) => {
    return s + cols.reduce((ss, { ds, cls, code }) => ss + (data[ds]?.[cls]?.[code]?.[sc]?.count || 0), 0);
  }, 0);
  html += `<td style="padding:6px 10px;text-align:center;">${grandTotal}</td></tr>`;

  html += '</tbody></table></div>';
  html += `<div style="font-size:11px;color:#64748b;margin-top:8px;">Showing ${schools.length} school(s) · ${cols.length} exam slot(s) · ${grandTotal} total appearances (private candidates excluded)</div>`;
  out.innerHTML = html;
}
// ── Step 2: Render Requirements Input (per-date per-school) ──
export function renderInvReq() {
  const out = document.getElementById('inv-req-output');

  const totals = buildInvSchoolDateCounts();

  if (!Object.keys(totals).length) {
    out.innerHTML = '<div style="color:#64748b;padding:20px;">No candidates loaded.</div>';
    return;
  }

  // Only dates where this school has at least one candidate (built per school below)
  // Header: School | Name | TotalCands | [date1 inv] [date2 inv] ... | Notes

  let html = `<div style="font-size:11px;color:#64748b;margin-bottom:8px;">
    Enter the number of invigilators required from each school <strong>for each exam date</strong>.
    Leave blank or 0 if not required on that date.
  </div>
  <div class="table-wrap" style="overflow-x:auto;"><table style="font-size:11px;border-collapse:collapse;min-width:100%;">
    <thead>
      <tr style="background:#0c1c35;color:#fff;">
        <th style="padding:8px 10px;text-align:left;white-space:nowrap;">School Code</th>
        <th style="padding:8px 10px;text-align:left;min-width:180px;">School Name</th>
        <th style="padding:8px 10px;text-align:center;white-space:nowrap;">Total Cands</th>`;

  state.allDates.forEach(ds => {
    html += `<th style="padding:8px 8px;text-align:center;white-space:nowrap;font-size:10px;min-width:80px;">
      ${ds}<br><span style="font-weight:400;">(Inv. Req.)</span>
    </th>`;
  });

  html += `<th style="padding:8px 10px;text-align:left;min-width:150px;">Notes</th>
      </tr>
    </thead><tbody>`;

  Object.entries(totals).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([code, sch], idx) => {
    const saved = state.invReq[code] || {};
    const savedDates = saved.dates || {};

    html += `<tr style="background:${idx%2===0?'#f8fafc':'#fff'};">
      <td style="padding:5px 10px;font-family:monospace;font-weight:600;font-size:11px;">${code}</td>
      <td style="padding:5px 10px;">${sch.name}</td>
      <td style="padding:5px 10px;text-align:center;font-weight:700;">${sch.totalCands}</td>`;

    state.allDates.forEach(ds => {
      const cands = sch.dates[ds] || 0;
      const savedVal = savedDates[ds] ?? '';

      html += `<td style="padding:5px 8px;text-align:center;${cands === 0?'background:#f8fafc;':''}" title="${cands} candidate(s) from this school on this date">
        <input type="number" min="0" max="99" value="${savedVal}"
          data-school="${code}" data-date="${ds}" class="inv-req-date-input"
          style="width:56px;padding:3px 6px;border:1px solid #d1d5db;border-radius:4px;text-align:center;font-size:12px;font-weight:600;"
          placeholder="0">
        <div style="font-size:9px;color:${cands > 0 ? '#64748b' : '#94a3b8'};margin-top:1px;">${cands} cands</div>
      </td>`;
    });

    html += `<td style="padding:5px 10px;">
        <input type="text" value="${saved.notes || ''}"
          data-school="${code}" class="inv-notes-input"
          placeholder="e.g. Morning shift only"
          style="width:100%;padding:3px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:11px;">
      </td>
    </tr>`;
  });

  // Totals row
  html += `<tr style="background:#0c1c35;color:#fff;font-weight:700;">
    <td colspan="3" style="padding:6px 10px;">TOTAL Invigilators per Date</td>`;
  state.allDates.forEach(ds => {
    // sum of all inv inputs for this date (from DOM — can't sum yet so put placeholder)
    html += `<td id="inv-total-${ds.replace(/[^a-z0-9]/gi,'_')}" style="padding:6px 8px;text-align:center;">—</td>`;
  });
  html += `<td></td></tr>`;

  html += '</tbody></table></div>';
  out.innerHTML = html;

  // Live-update totals row as user types
  out.querySelectorAll('.inv-req-date-input').forEach(inp => {
    inp.addEventListener('input', updateInvDateTotals);
  });
  updateInvDateTotals();
}
export function updateInvDateTotals() {
  state.allDates.forEach(ds => {
    const id = 'inv-total-' + ds.replace(/[^a-z0-9]/gi,'_');
    const el = document.getElementById(id);
    if (!el) return;
    let total = 0;
    document.querySelectorAll(`.inv-req-date-input[data-date="${ds}"]`).forEach(inp => {
      total += parseInt(inp.value) || 0;
    });
    el.textContent = total > 0 ? total : '—';
  });
}
export function syncInvReqFromForm() {
  const reqInputs = document.querySelectorAll('.inv-req-date-input');
  const noteInputs = document.querySelectorAll('.inv-notes-input');
  if (!reqInputs.length && !noteInputs.length) return false;

  const nextReq = {};
  // Per-date inputs
  reqInputs.forEach(inp => {
    const code = inp.dataset.school;
    const ds   = inp.dataset.date;
    const val  = parseInt(inp.value) || 0;
    if (!nextReq[code]) nextReq[code] = { dates: {}, notes: '' };
    if (val > 0) nextReq[code].dates[ds] = val;
  });
  // Notes
  noteInputs.forEach(inp => {
    const code = inp.dataset.school;
    if (!nextReq[code]) nextReq[code] = { dates: {}, notes: '' };
    nextReq[code].notes = inp.value.trim();
  });
  // Remove schools with no requirements
  Object.keys(nextReq).forEach(code => {
    const r = nextReq[code];
    if (!Object.values(r.dates || {}).some(v => v > 0) && !r.notes)
      delete nextReq[code];
  });
  state.invReq = nextReq;
  return true;
}
export function saveInvReq() {
  syncInvReqFromForm();
  saveToBrowser();
  const count = Object.keys(state.invReq).length;
  showModal('Saved', `✅ Requirements saved for ${count} school(s).\n\nProceed to Step 3 to generate letters.`);
}
// ── Step 3: Letter template render ────────────────────────────
export function renderInvLetterStep() {
  const ta = document.getElementById('inv-letter-template');
  if (!ta.value.trim() || isLegacyInvTemplate(ta.value)) ta.value = DEFAULT_INV_TEMPLATE;
}
export function resetInvTemplate() {
  document.getElementById('inv-letter-template').value = DEFAULT_INV_TEMPLATE;
}
export function isLegacyInvTemplate(text) {
  return text.includes('निरीक्षक') || text.includes('CBSE {EXAM_NAME} परीक्षा') || text.includes('Centre Superintendent');
}
export function getExamSessionLabel() {
  const year = getExamYear();
  return `${year - 1}-${String(year).slice(-2)}`;
}
export function formatInvStartDate(ds) {
  const dt = parseDate(ds);
  return dt.toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' }).replace(' ', ', ');
}
export function formatInvLetterDate(ds) {
  const dt = parseDate(ds);
  const date = dt.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }).replace(/ /g, '-');
  return `${date} ${dayName(ds)}`;
}
export function getBoardExamCodeForSchool(schoolCode, invData) {
  const classes = new Set();
  state.allDates.forEach(ds => {
    ['X','XII'].forEach(cls => {
      if (!invData[ds]?.[cls]) return;
      Object.values(invData[ds][cls]).forEach(bySchool => {
        if (bySchool[schoolCode]) classes.add(cls);
      });
    });
  });
  if (classes.has('X') && classes.has('XII')) return 'SSE/SSCE';
  if (classes.has('XII')) return 'SSCE';
  return 'SSE';
}
export function getBoardExamLabelForSchool(schoolCode, invData) {
  return `${getBoardExamCodeForSchool(schoolCode, invData)}-${getExamSessionLabel()} (2nd Board)`;
}
export function formatInvDutySubjects(items) {
  if (!items.length) return 'As per centre requirement';
  const grouped = {};
  items.forEach(item => {
    const key = `${item.cls}|${item.name}`;
    if (!grouped[key]) grouped[key] = { cls: item.cls, name: item.name, codes: [] };
    grouped[key].codes.push(item.code);
  });
  return Object.values(grouped).map(item => {
    const clsLabel = item.cls === 'XII' ? 'Class XII' : 'Class X';
    return `${clsLabel} - ${item.codes.join('/')} ${item.name}`;
  }).join(', ');
}
export function printInvLetters() {
  const overlay = document.getElementById('inv-letters-overlay');
  if (!overlay) {
    showModal('No Letters', 'Please generate the letters first.');
    return;
  }
  setTimeout(() => window.print(), 50);
}
// ── Step 3: Generate Letters ───────────────────────────────────
export function generateInvLetters() {
  if (syncInvReqFromForm()) saveToBrowser();
  showInvStep(3);

  const schools = Object.entries(state.invReq).filter(([,v]) => Object.values(v.dates || {}).some(n => n > 0));
  if (!schools.length) {
    showModal('No Requirements Set', 'Please go to Step 2 and enter the number of invigilators required for at least one school.');
    return;
  }

  const template    = document.getElementById('inv-letter-template').value || DEFAULT_INV_TEMPLATE;
  const centreName  = document.getElementById('cfg-centre-name')?.value?.trim() || '—';
  const centreCode  = document.getElementById('cfg-centre-code')?.value?.trim() || '—';
  const csName      = document.getElementById('cfg-centre-head')?.value?.trim() || 'Centre Superintendent';
  const city        = document.getElementById('cfg-centre-city')?.value?.trim() || '—';
  const examYear    = getExamYear();
  const examSession = getExamSessionLabel();
  const today       = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' });

  const totals  = buildSchoolTotals();
  const invData = buildInvData();

  // Build duty dates table per school — includes per-date invigilator demand
  function getDutyDateRows(schoolCode) {
    const codes = { X: getActiveCodes('X'), XII: getActiveCodes('XII') };
    const savedDates = (state.invReq[schoolCode] || {}).dates || {};
    const rows = [];

    state.allDates.forEach(ds => {
      const daySubjects = [];
      ['X','XII'].forEach(c => {
        if (!invData[ds]?.[c]) return;
        Object.entries(invData[ds][c]).forEach(([code, bySchool]) => {
          if (bySchool[schoolCode]) {
            daySubjects.push({ cls: c, code, name: codes[c][code] || code });
          }
        });
      });
      const inv = savedDates[ds] || 0;
      if (inv <= 0) return;
      rows.push({
        sno: rows.length + 1,
        ds,
        day: dayName(ds),
        subjects: formatInvDutySubjects(daySubjects),
        inv,
      });
    });

    return rows;
  }

  function renderInvDutyTable(rows) {
    if (!rows.length) {
      return '<div class="inv-empty-duty">No duty dates found for this school.</div>';
    }
    const body = rows.map(r => `
      <tr>
        <td class="inv-date-cell">${escapeHtmlLetterContent(formatInvLetterDate(r.ds))}</td>
        <td>${escapeHtmlLetterContent(r.subjects)}</td>
        <td class="inv-count-cell">${r.inv}</td>
      </tr>
    `).join('');
    return `<table class="inv-duty-table">
      <thead>
        <tr>
          <th>DATE</th>
          <th>CLASS / SUBJECT NAME</th>
          <th>No. of Teachers<br>Required</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
  }

  function renderInvLetterBody(text, dutyTableHtml) {
    const parts = String(text).split('{DUTY_DATES_TABLE}');
    const renderText = part => escapeHtmlLetterContent(part.trim()).replace(/\n/g, '<br>');
    if (parts.length === 1) {
      return `<div class="inv-letter-body">${renderText(text)}</div>`;
    }
    return `<div class="inv-letter-body">
      ${renderText(parts[0])}
      ${dutyTableHtml}
      ${renderText(parts.slice(1).join('{DUTY_DATES_TABLE}'))}
    </div>`;
  }

  function getTotalInvigilators(schoolCode) {
    const savedDates = (state.invReq[schoolCode] || {}).dates || {};
    return Object.values(savedDates).reduce((s, v) => s + (v || 0), 0);
  }

  // Build per-school letter
  const session = beginPrintSession({ reportKey: 'invLetters' });
  const overlayId = session?.overlayId || 'inv-letters-overlay';
  const styleId   = session?.styleId   || 'inv-letters-style';

  // Create overlay
  let overlay = document.getElementById('inv-letters-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'inv-letters-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:1000;overflow-y:auto;padding:10mm 0 0 0;';
    document.body.appendChild(overlay);
  }

  let style = document.getElementById('inv-letters-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'inv-letters-style';
    document.head.appendChild(style);
  }
  style.textContent = buildPrintShellCSS(session) + `
    @media print {
      #inv-letters-overlay .no-print { display:none!important; }
      .inv-letter-page {
        page-break-after: always;
        box-shadow:none!important;
        margin:0!important;
        width:auto!important;
        min-height:auto!important;
        padding:0!important;
      }
      .inv-letter-page:last-child { page-break-after: avoid; }
      .inv-duty-table thead { display:table-header-group!important; }
      .inv-duty-table th {
        color:#111!important;
        background:#fff!important;
        border:1px solid #111!important;
        -webkit-print-color-adjust:exact;
        print-color-adjust:exact;
      }
      .inv-duty-table tr,
      .inv-duty-table td,
      .inv-duty-table th { break-inside:avoid; page-break-inside:avoid; }
    }
    .inv-letter-page {
      background:#fff;
      width:190mm;
      min-height:270mm;
      margin:0 auto 20px;
      padding:20mm 18mm 20mm 25mm;
      box-shadow:0 2px 16px rgba(0,0,0,0.12);
      font-family:'Times New Roman',Times,serif;
      font-size:13pt;
      line-height:1.55;
      color:#111;
      box-sizing:border-box;
      word-wrap:break-word;
    }
    .inv-letter-body {
      white-space:normal;
    }
    .inv-duty-table {
      width:100%;
      border-collapse:collapse;
      margin:12pt 0 14pt;
      table-layout:fixed;
      font-size:11.5pt;
      line-height:1.25;
    }
    .inv-duty-table th,
    .inv-duty-table td {
      border:1px solid #111;
      padding:5pt 6pt;
      vertical-align:top;
    }
    .inv-duty-table th {
      text-align:center;
      font-weight:bold;
      color:#111;
      background:#fff;
    }
    .inv-duty-table th:nth-child(1),
    .inv-duty-table td:nth-child(1) {
      width:32%;
    }
    .inv-duty-table th:nth-child(2),
    .inv-duty-table td:nth-child(2) {
      width:44%;
    }
    .inv-duty-table th:nth-child(3),
    .inv-duty-table td:nth-child(3) {
      width:24%;
      text-align:center;
    }
    .inv-duty-table th span {
      font-weight:bold;
    }
    .inv-date-cell {
      white-space:nowrap;
    }
    .inv-count-cell {
      font-weight:bold;
      font-size:13pt;
    }
    .inv-empty-duty {
      border:1px solid #111;
      padding:8pt;
      margin:12pt 0;
      text-align:center;
      font-style:italic;
    }
    .inv-letter-header {
      text-align:center;
      border-bottom:2px solid #0c1c35;
      padding-bottom:10px;
      margin-bottom:16px;
    }
  `;

  let lettersHtml = `<div class="no-print" style="background:#0c1c35;color:#fff;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:10;">
    <div style="font-weight:700;">Invigilator Demand Letters - ${schools.length} school(s)</div>
    <div style="display:flex;gap:8px;">
      <button onclick="printInvLetters()" style="background:#f59e0b;color:#000;border:none;border-radius:5px;padding:7px 16px;font-size:13px;cursor:pointer;font-weight:700;">Print All</button>
      <button onclick="closePrintSession('${session.reportKey}','${overlayId}','${styleId}')"
        style="background:#6b7280;color:#fff;border:none;border-radius:5px;padding:7px 14px;font-size:13px;cursor:pointer;">Close</button>
    </div>
  </div>`;

  schools.forEach(([schoolCode, req]) => {
    const schInfo   = totals[schoolCode] || { name: schoolCode, totalCands: 0, dates: new Set() };
    const boardExamLabel = getBoardExamLabelForSchool(schoolCode, invData);
    const dutyRows = getDutyDateRows(schoolCode);
    const dutyTableHtml = renderInvDutyTable(dutyRows);
    const totalInv   = getTotalInvigilators(schoolCode);
    const savedDates = (state.invReq[schoolCode] || {}).dates || {};
    const firstDs = sortDates(Object.keys(savedDates).filter(ds => (savedDates[ds] || 0) > 0))[0] || state.allDates[0] || '';
    const firstDutyDate = firstDs ? formatInvStartDate(firstDs) : 'the scheduled date';
    const letter = template
      .replace(/{SCHOOL_NAME}/g,              schInfo.name)
      .replace(/{SCHOOL_CODE}/g,              schoolCode)
      .replace(/{CENTRE_NAME}/g,              centreName)
      .replace(/{CENTRE_CODE}/g,              centreCode)
      .replace(/{EXAM_NAME}/g,               boardExamLabel)
      .replace(/{EXAM_YEAR}/g,               examYear)
      .replace(/{EXAM_SESSION}/g,            examSession)
      .replace(/{BOARD_EXAM_LABEL}/g,        boardExamLabel)
      .replace(/{FIRST_DUTY_DATE}/g,         firstDutyDate)
      .replace(/{TOTAL_INVIGILATORS_SUM}/g,  totalInv)
      .replace(/{INVIGILATORS_REQUIRED}/g,   totalInv)
      .replace(/{CS_NAME}/g,                 csName)
      .replace(/{CITY}/g,                    city)
      .replace(/{DATE_TODAY}/g,              today);

    lettersHtml += `<div class="inv-letter-page">
      <div class="inv-letter-header no-print" style="font-family:sans-serif;font-size:11px;color:#64748b;">
        School: ${schInfo.name} (${schoolCode}) · Invigilators required: ${totalInv}
      </div>
      ${renderInvLetterBody(letter, dutyTableHtml)}
    </div>`;
  });

  overlay.innerHTML = lettersHtml;
  overlay.style.display = 'block';
}
export function escapeHtmlLetterContent(text) {
  return text
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}
// ── Print just the report ──────────────────────────────────────
export function printInvReport() {
  const isStep2 = document.getElementById('inv-step-2').style.display !== 'none';
  let content = '';
  let title = "Invigilator Demand Report";

  if (isStep2) {
    title = "Invigilator Demand — Requirements Table";
    const out = document.getElementById('inv-req-output');
    if (!out) return;
    
    // Capture current input values as innerHTML won't reflect user changes
    const clone = out.cloneNode(true);
    const originalInputs = out.querySelectorAll('input');
    const clonedInputs   = clone.querySelectorAll('input');
    
    clonedInputs.forEach((clonedInp, i) => {
      const val = originalInputs[i].value || (clonedInp.type === 'number' ? '0' : '');
      const span = document.createElement('span');
      span.textContent = val;
      if (clonedInp.classList.contains('inv-req-date-input')) {
        span.style.display = 'block';
        span.style.fontSize = '12px';
        span.style.fontWeight = '700';
        span.style.padding = '2px 0';
      }
      clonedInp.parentNode.replaceChild(span, clonedInp);
    });
    content = clone.innerHTML;
  } else {
    // Original behavior for Step 1
    showInvStep(1);
    title = "Invigilator Demand — School-wise Strength Report";
    content = document.getElementById('inv-report-output')?.innerHTML;
  }

  if (!content) { showModal('No Data','Generate the report first.'); return; }
  
  const centreName = document.getElementById('cfg-centre-name')?.value || '';
  const w = window.open('','_blank','width=1200,height=800');
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; font-size: 10.5px; color: #111; }
      h2 { color: #0c1c35; margin-bottom: 4px; }
      .centre-info { margin-bottom: 15px; color: #4b5563; font-size: 11px; }
      table { border-collapse: collapse; width: 100%; table-layout: auto; }
      th, td { border: 1px solid #999; padding: 5px 8px; }
      th { background: #0c1c35; color: #fff; font-size: 9px; }
      tr:nth-child(even) { background: #f9fafb; }
      .table-wrap { overflow: visible; }
      @media print { 
        button { display:none; } 
        body { padding: 0; }
        @page { size: landscape; margin: 10mm; }
      }
    </style></head><body>
    <h2>${title}</h2>
    <div class="centre-info">
      Centre: <strong>${centreName}</strong> · Exam: <strong>${getExamShort('X')} & ${getExamShort('XII')} ${getExamYear()}</strong>
    </div>
    <div class="table-wrap">${content}</div>
    <div style="margin-top:20px;text-align:right;color:#64748b;font-size:10px;">Generated: ${new Date().toLocaleString('en-IN')}</div>
    <br><button onclick="window.print()" style="padding:8px 16px; cursor:pointer;">🖨️ Print Report</button>
    </body></html>`);
  w.document.close();
}
