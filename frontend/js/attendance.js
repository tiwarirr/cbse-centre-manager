// ============================================================
// attendance.js — extracted from CBSE_Centre_Manager.html (Phase A modular split)
// ============================================================
import { abReleaseOnAbsent, rebuildAnswerBookRegistry, renderAnswerBookSection } from './answerbook.js';
import { dayName, getPrimarySubject, sortDates } from './parser.js';
import { getDateState, state } from './state.js';
import { saveToBrowser } from './storage.js';
import { currentDate, selectDate } from './ui.js';

// ── ATTENDANCE ──────────────────────────────────────────────────
export let attendancePanelOpen = false;
export let _attSidebarKey = null;
export function getAttendanceCounts(dsState, seated) {
  const total = (seated || []).length;
  const values = Object.values(dsState?.attendance || {});
  const attended = values.filter(v => v === 'P').length;
  const absent   = values.filter(v => v === 'A').length;
  const unmarked = total - attended - absent;
  return { total, attended, absent, unmarked };
}
export function attendanceSummaryHTML(counts) {
  return `${counts.total} candidates · <span style="color:#6ee7b7;">${counts.attended} Present</span> · <span style="color:#fca5a5;">${counts.absent} Absent</span> · <span style="color:#d1d5db;">${counts.unmarked} Unmarked</span>`;
}
export function refreshAttendanceModalHeader(ds) {
  const subtitle = document.getElementById('attendance-modal-sub');
  if (!subtitle) return;
  const ds_state = getDateState(ds);
  const seated = ds_state.seating || [];
  subtitle.innerHTML = attendanceSummaryHTML(getAttendanceCounts(ds_state, seated));
}
export function openAttendancePanel() {
  if (!currentDate) return;
  const ds_state = getDateState(currentDate);
  const seated   = ds_state.seating || [];
  if (!seated.length) return;

  // Build modal
  const existing = document.getElementById('attendance-modal');
  if (existing) existing.remove();

  const counts = getAttendanceCounts(ds_state, seated);

  const modal = document.createElement('div');
  modal.id = 'attendance-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.55);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;';

  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;width:980px;max-width:96vw;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.4);overflow:hidden;">
      <div style="background:#0c1c35;color:#fff;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
        <div>
          <div style="font-weight:700;font-size:15px;">📋 Attendance — ${currentDate}</div>
          <div id="attendance-modal-sub" style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:2px;">${attendanceSummaryHTML(counts)}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button onclick="markAllAttendance('P')" style="background:#059669;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer;">✓ All Present</button>
          <button onclick="markAllAttendance('A')" style="background:#dc2626;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer;">✗ All Absent</button>
          <button onclick="markAllAttendance(null)" style="background:#6b7280;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer;">⊘ Clear</button>
          <button onclick="closeAttendancePanel()" style="background:none;border:none;color:rgba(255,255,255,0.7);font-size:20px;cursor:pointer;">✕</button>
        </div>
      </div>

      <!-- Room-wise attendance table + hover sidebar -->
      <div style="display:flex;flex:1;min-height:0;">
        <div style="overflow-y:auto;flex:1;padding:0;" id="att-body"></div>
        <div id="att-sidebar" style="width:290px;border-left:1px solid #e5e7eb;background:#fcfcfd;overflow-y:auto;padding:12px;">
          <div style="font-weight:700;color:#0c1c35;font-size:12px;margin-bottom:6px;">Candidate Attendance History</div>
          <div style="font-size:11px;color:#64748b;line-height:1.5;">Hover a candidate row to view attendance across all registered dates.</div>
        </div>
      </div>

      <div style="padding:10px 16px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;background:#f9fafb;">
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#4b5563;cursor:pointer;">
          <input type="checkbox" id="att-only-abs" onchange="renderAttendanceBody(currentDate)">
          Show absentees only on this date
        </label>
        <div style="display:flex;gap:8px;">
          <button onclick="exportAbsentList()" class="btn btn-outline btn-sm">📄 Export Absent List</button>
          <button onclick="closeAttendancePanel()" class="btn btn-primary btn-sm">✓ Done</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(modal);
  clearAttendanceSidebar();
  renderAttendanceBody(currentDate);
}
export function renderAttendanceBody(ds) {
  const ds_state = getDateState(ds);
  const seated   = ds_state.seating || [];
  const body     = document.getElementById('att-body');
  if (!body) return;

  const showAbsOnly = !!document.getElementById('att-only-abs')?.checked;
  const absentees = seated.filter(s => ds_state.attendance[s.roll] === 'A');

  if (showAbsOnly && !absentees.length) {
    body.innerHTML = `<div style="padding:28px 20px;text-align:center;color:#64748b;">No absentees marked for ${ds}.</div>`;
    return;
  }

  const totalRooms = seated.length ? Math.max(...seated.map(s => s.roomNo)) : 0;
  let html = '';

  for (let room = 1; room <= totalRooms; room++) {
    const roomAll = seated.filter(s => s.roomNo === room).sort((a,b) => a.seatInRoom - b.seatInRoom);
    const roomCands = showAbsOnly
      ? roomAll.filter(s => ds_state.attendance[s.roll] === 'A')
      : roomAll;
    if (!roomCands.length) continue;

    const rPresent = roomAll.filter(s => ds_state.attendance[s.roll] === 'P').length;
    const rAbsent  = roomAll.filter(s => ds_state.attendance[s.roll] === 'A').length;
    const roomInfo = showAbsOnly
      ? `${roomCands.length} absentees shown · ${roomAll.length} total · <span style="color:#059669;">${rPresent}P</span> · <span style="color:#dc2626;">${rAbsent}A</span>`
      : `${roomAll.length} candidates · <span style="color:#059669;">${rPresent}P</span> · <span style="color:#dc2626;">${rAbsent}A</span>`;

    html += `<div style="border-bottom:2px solid #e5e7eb;">
      <div style="background:#f1f5f9;padding:8px 16px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-weight:700;font-size:13px;">Room ${room}</span>
        <span style="font-size:11px;color:#64748b;">${roomInfo}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#f8fafc;">
          <th style="padding:6px 12px;text-align:left;color:#64748b;font-weight:600;">Seat</th>
          <th style="padding:6px 12px;text-align:left;color:#64748b;font-weight:600;">Roll No</th>
          <th style="padding:6px 12px;text-align:left;color:#64748b;font-weight:600;">Name</th>
          <th style="padding:6px 12px;text-align:left;color:#64748b;font-weight:600;">Subject</th>
          <th style="padding:6px 12px;text-align:center;color:#64748b;font-weight:600;">Attendance</th>
        </tr></thead><tbody>`;

    roomCands.forEach((s, i) => {
      const att    = ds_state.attendance[s.roll] || null;
      const subj   = getPrimarySubject(s, ds);
      const bgAlt  = i%2===0 ? '#fff' : '#f9fafb';
      const attBg  = att==='P' ? '#f0fdf4' : att==='A' ? '#fef2f2' : bgAlt;
      html += `<tr style="background:${attBg};" onmouseenter="showAttendanceSidebar('${s.roll}','${s.class}')">
        <td style="padding:6px 12px;color:#94a3b8;">${s.seatInRoom}</td>
        <td style="padding:6px 12px;font-family:monospace;font-weight:600;">${s.roll}</td>
        <td style="padding:6px 12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.name}</td>
        <td style="padding:6px 12px;color:#64748b;">${subj ? subj.code : '—'}</td>
        <td style="padding:6px 12px;text-align:center;">
          <div style="display:inline-flex;gap:4px;">
            <button onclick="markAtt('${s.roll}','P','${ds}','${s.class}')" style="padding:3px 10px;border-radius:5px;border:1.5px solid ${att==='P'?'#059669':'#d1d5db'};background:${att==='P'?'#059669':'#fff'};color:${att==='P'?'#fff':'#374151'};font-weight:700;cursor:pointer;font-size:12px;">P</button>
            <button onclick="markAtt('${s.roll}','A','${ds}','${s.class}')" style="padding:3px 10px;border-radius:5px;border:1.5px solid ${att==='A'?'#dc2626':'#d1d5db'};background:${att==='A'?'#dc2626':'#fff'};color:${att==='A'?'#fff':'#374151'};font-weight:700;cursor:pointer;font-size:12px;">A</button>
          </div>
        </td>
      </tr>`;
    });
    html += '</tbody></table></div>';
  }

  if (!html) {
    body.innerHTML = `<div style="padding:28px 20px;text-align:center;color:#64748b;">No rows to display for ${ds}.</div>`;
    return;
  }

  body.innerHTML = html;
}
export function markAtt(roll, val, ds, cls) {
  const ds_state = getDateState(ds);
  // Toggle: clicking same value clears it
  ds_state.attendance[roll] = ds_state.attendance[roll] === val ? null : val;
  if (ds_state.attendance[roll] === 'A') abReleaseOnAbsent(ds, roll);
  rebuildAnswerBookRegistry();
  renderAttendanceBody(ds);
  renderAnswerBookSection(ds);
  if (cls) showAttendanceSidebar(roll, cls, true);
  refreshAttendanceModalHeader(ds);
  // Update action bar info
  selectDate(ds);
  saveToBrowser();
}
export function markAllAttendance(val) {
  if (!currentDate) return;
  const ds_state = getDateState(currentDate);
  (ds_state.seating || []).forEach(s => { ds_state.attendance[s.roll] = val; });
  if (val === 'A') {
    (ds_state.seating || []).forEach(s => abReleaseOnAbsent(currentDate, s.roll));
  }
  rebuildAnswerBookRegistry();
  renderAttendanceBody(currentDate);
  renderAnswerBookSection(currentDate);
  refreshAttendanceModalHeader(currentDate);
  if (_attSidebarKey && _attSidebarKey.includes('|')) {
    const [roll, cls] = _attSidebarKey.split('|');
    if (roll && cls) showAttendanceSidebar(roll, cls, true);
  }
  selectDate(currentDate);
  saveToBrowser();
}
export function closeAttendancePanel() {
  const modal = document.getElementById('attendance-modal');
  if (modal) modal.remove();
}
export function clearAttendanceSidebar() {
  const panel = document.getElementById('att-sidebar');
  if (!panel) return;
  _attSidebarKey = null;
  panel.innerHTML = `
    <div style="font-weight:700;color:#0c1c35;font-size:12px;margin-bottom:6px;">Candidate Attendance History</div>
    <div style="font-size:11px;color:#64748b;line-height:1.5;">Hover a candidate row to view attendance across all registered dates.</div>`;
}
export function showAttendanceSidebar(roll, cls, forceRefresh) {
  const panel = document.getElementById('att-sidebar');
  if (!panel) return;

  forceRefresh = !!forceRefresh;
  const key = roll + '|' + cls;
  if (!forceRefresh && _attSidebarKey === key) return;
  _attSidebarKey = key;

  const cand = state.candidates.find(c => c.roll === roll && c.class === cls)
    || (state.candidates.find(c => c.roll === roll) || null);

  if (!cand) {
    panel.innerHTML = `<div style="font-size:11px;color:#dc2626;">Candidate not found.</div>`;
    return;
  }

  const dates = sortDates(Object.keys(cand.dateSubjects || {}));
  const statusMeta = {
    'P': { label: 'Present', bg: '#ecfdf5', border: '#a7f3d0', color: '#065f46' },
    'A': { label: 'Absent',  bg: '#fef2f2', border: '#fecaca', color: '#991b1b' },
    'U': { label: 'Unmarked', bg: '#f8fafc', border: '#e5e7eb', color: '#475569' },
  };

  let rows = '';
  dates.forEach(ds => {
    const entry = (cand.dateSubjects[ds] || [])[0];
    const dsState = state.dateStates[ds] || null;
    const att = dsState && dsState.attendance ? dsState.attendance[roll] : null;
    const meta = statusMeta[att || 'U'];
    const seat = dsState && dsState.seating
      ? dsState.seating.find(s => s.roll === roll && s.class === cand.class)
      : null;

    const roomSeat = seat ? `Room ${seat.roomNo}, Seat ${seat.seatInRoom}` : 'Seat not generated';
    const subjTxt = entry ? `${entry.code} ${entry.name}` : 'Subject not mapped';
    const isCurrent = ds === currentDate;
    const cardBorder = isCurrent ? '#1a50d4' : '#e5e7eb';
    const cardBg = isCurrent ? '#eff6ff' : '#fff';
    const cardGlow = isCurrent ? '0 0 0 2px rgba(26,80,212,0.22), 0 8px 18px rgba(26,80,212,0.15)' : 'none';

    rows += `
      <div style="border:1.5px solid ${cardBorder};border-radius:8px;padding:8px;margin-bottom:8px;background:${cardBg};box-shadow:${cardGlow};">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <div style="font-size:11px;font-weight:700;color:#0f172a;">${ds} (${dayName(ds).slice(0,3)}) ${isCurrent ? '<span style="font-size:9px;padding:1px 6px;border-radius:999px;background:#1a50d4;color:#fff;margin-left:4px;">Current Date</span>' : ''}</div>
          <span style="font-size:10px;padding:2px 7px;border-radius:999px;border:1px solid ${meta.border};background:${meta.bg};color:${meta.color};font-weight:700;">${meta.label}</span>
        </div>
        <div style="font-size:10px;color:#475569;margin-top:5px;line-height:1.4;">${subjTxt}</div>
        <div style="font-size:10px;color:#64748b;margin-top:3px;">${roomSeat}</div>
      </div>`;
  });

  panel.innerHTML = `
    <div style="font-weight:700;color:#0c1c35;font-size:12px;margin-bottom:8px;">Candidate Attendance History</div>
    <div style="font-size:11px;color:#111827;margin-bottom:4px;font-weight:700;">${cand.name}</div>
    <div style="font-size:10px;color:#64748b;margin-bottom:10px;">Roll ${cand.roll} · Class ${cand.class}</div>
    ${rows || '<div style="font-size:11px;color:#64748b;">No registered exam dates found.</div>'}`;
}
export function exportAbsentList() {
  if (!currentDate) return;
  const ds_state = getDateState(currentDate);
  const absentees = (ds_state.seating||[]).filter(s => ds_state.attendance[s.roll] === 'A');
  if (!absentees.length) { alert('No absent candidates recorded.'); return; }
  let csv = 'Roll No,Name,Subject,Room,Seat\n';
  absentees.forEach(s => {
    const subj = getPrimarySubject(s, currentDate);
    csv += `${s.roll},"${s.name}","${subj ? subj.name || subj.code || '' : ''}",${s.roomNo},${s.seatInRoom}
`;
  });
  const blob = new Blob([csv], { type:'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Absentees_${currentDate.replace(/-/g,'')}.csv`;
  a.click();
}
