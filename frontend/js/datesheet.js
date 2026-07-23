// ============================================================
// datesheet.js — extracted from CBSE_Centre_Manager.html (Phase A modular split)
// ============================================================
import { dayName, getActiveCodes, getActiveDatesheet, parseDate, sortDates } from './parser.js';
import { generateSeating, resetCustomOrder } from './seating.js';
import { state } from './state.js';
import { restoreUIAfterLoad, saveToBrowser } from './storage.js';
import { showModal } from './ui.js';

// ── DATESHEET PANEL ────────────────────────────────────────────

export function fillDatesheetPanel() {
  const xBody   = document.getElementById('ds-x-tbody');
  const xiiBody = document.getElementById('ds-xii-tbody');
  xBody.innerHTML   = '';
  xiiBody.innerHTML = '';

  // Always use active (imported) datesheet + codes, not hardcoded constants
  const xDS    = getActiveDatesheet('X');
  const xiiDS  = getActiveDatesheet('XII');
  const xCodes = getActiveCodes('X');
  const xiiCodes = getActiveCodes('XII');

  sortDates(Object.keys(xDS)).forEach(ds => {
    const codes = xDS[ds];
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${ds}</strong><br><small style="color:var(--muted);font-family:'DM Mono',monospace;font-size:10px">${dayName(ds)}</small></td>
      <td>${codes.map(c => `<span class="tag tag-green" style="margin:1px 2px">${c} ${xCodes[c]||c}</span>`).join('')}</td>`;
    xBody.appendChild(tr);
  });

  sortDates(Object.keys(xiiDS)).forEach(ds => {
    const codes = xiiDS[ds];
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${ds}</strong><br><small style="color:var(--muted);font-family:'DM Mono',monospace;font-size:10px">${dayName(ds)}</small></td>
      <td>${codes.map(c => `<span class="tag tag-blue" style="margin:1px 2px">${c} ${xiiCodes[c]||c}</span>`).join('')}</td>`;
    xiiBody.appendChild(tr);
  });
}
// ── DATESHEET CONFIG UI ────────────────────────────────────────
export let _currentDsTab = 'x';
export function toggleDsConfig() {
  const body  = document.getElementById('ds-config-body');
  const arrow = document.getElementById('ds-config-toggle');
  const open  = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  arrow.textContent  = open ? '▼ Collapse' : '▶ Expand to edit';
  if (open) renderDsTables();
}
export function switchDsTab(tab) {
  _currentDsTab = tab;
  ['x','xii'].forEach(t => {
    document.getElementById(`ds-pane-${t}`).style.display     = t === tab ? 'block' : 'none';
    document.getElementById(`ds-tab-${t}`).style.fontWeight   = t === tab ? '700' : '400';
    document.getElementById(`ds-tab-${t}`).style.color        = t === tab ? '#0c1c35' : '#64748b';
    document.getElementById(`ds-tab-${t}`).style.borderBottom = t === tab ? '2px solid #0c1c35' : '2px solid transparent';
  });
}
// ── Render datesheet table for a class ──
export function renderDsTables() {
  renderDsTable('x');
  renderDsTable('xii');
  renderCodesTable('x');
  renderCodesTable('xii');
}
export function getDsData(cls) {
  const id   = `cfg-${cls}-datesheet`;
  const raw  = document.getElementById(id)?.value;
  if (raw) try { return JSON.parse(raw); } catch(e) {}
  return cls === 'x' ? {...X_DATESHEET} : {...XII_DATESHEET};
}
export function saveDsData(cls, data) {
  const id = `cfg-${cls}-datesheet`;
  const el = document.getElementById(id);
  if (el) el.value = JSON.stringify(data);
  saveToBrowser();
}
export function getCodesData(cls) {
  const id  = `cfg-${cls}-codes`;
  const raw = document.getElementById(id)?.value;
  if (raw) try { return JSON.parse(raw); } catch(e) {}
  return cls === 'x' ? {...X_CODES} : {...XII_CODES};
}
export function saveCodesData(cls, data) {
  const id = `cfg-${cls}-codes`;
  const el = document.getElementById(id);
  if (el) el.value = JSON.stringify(data);
  saveToBrowser();
}
export function renderDsTable(cls) {
  const data = getDsData(cls);
  const container = document.getElementById(`ds-table-${cls}`);
  if (!container) return;

  const rows = Object.entries(data).sort(([a],[b]) => parseDate(a) - parseDate(b));

  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:left;width:30%;">Date</th>
          <th style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:left;">Subject Codes</th>
          <th style="padding:4px 8px;border-bottom:1px solid #e2e8f0;width:28px;"></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(([date, codes]) => `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:2px 4px;">
              <input type="text" value="${date}"
                style="width:100%;font-size:11px;border:1px solid #d1d5db;border-radius:3px;padding:2px 4px;font-family:monospace;"
                onchange="updateDsRow('${cls}','${date}',this.value,null)">
            </td>
            <td style="padding:2px 4px;">
              <input type="text" value="${codes.join(',')}"
                style="width:100%;font-size:11px;border:1px solid #d1d5db;border-radius:3px;padding:2px 4px;font-family:monospace;"
                onchange="updateDsRow('${cls}','${date}',null,this.value)">
            </td>
            <td style="padding:2px 4px;text-align:center;">
              <button onclick="deleteDsRow('${cls}','${date}')"
                style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px;padding:0;">✕</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}
export function renderCodesTable(cls) {
  const data = getCodesData(cls);
  const container = document.getElementById(`codes-table-${cls}`);
  if (!container) return;

  const rows = Object.entries(data).sort(([a],[b]) => a.localeCompare(b, undefined, {numeric:true}));

  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:left;width:25%;">Code</th>
          <th style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:left;">Subject Name</th>
          <th style="padding:4px 8px;border-bottom:1px solid #e2e8f0;width:28px;"></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(([code, name]) => `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:2px 4px;">
              <input type="text" value="${code}"
                style="width:100%;font-size:11px;border:1px solid #d1d5db;border-radius:3px;padding:2px 4px;font-family:monospace;"
                onchange="updateCodesRow('${cls}','${code}',this.value,null)">
            </td>
            <td style="padding:2px 4px;">
              <input type="text" value="${name.replace(/"/g,'&quot;')}"
                style="width:100%;font-size:11px;border:1px solid #d1d5db;border-radius:3px;padding:2px 4px;"
                onchange="updateCodesRow('${cls}','${code}',null,this.value)">
            </td>
            <td style="padding:2px 4px;text-align:center;">
              <button onclick="deleteCodesRow('${cls}','${code}')"
                style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px;padding:0;">✕</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}
// ── CRUD operations ──
export function updateDsRow(cls, oldDate, newDate, newCodes) {
  const data = getDsData(cls);
  const existing = data[oldDate] || [];
  const codes = newCodes !== null
    ? newCodes.split(',').map(s=>s.trim()).filter(Boolean)
    : existing;
  const date  = newDate !== null ? newDate.trim() : oldDate;
  if (date !== oldDate) delete data[oldDate];
  data[date] = codes;
  saveDsData(cls, data);
}
export function deleteDsRow(cls, date) {
  const data = getDsData(cls);
  delete data[date];
  saveDsData(cls, data);
  renderDsTable(cls);
}
export function addDsRow(cls) {
  const data = getDsData(cls);
  data['DD-Mon-YYYY'] = [];
  saveDsData(cls, data);
  renderDsTable(cls);
}
export function updateCodesRow(cls, oldCode, newCode, newName) {
  const data = getCodesData(cls);
  const existing = data[oldCode] || '';
  const name = newName !== null ? newName.trim() : existing;
  const code = newCode !== null ? newCode.trim() : oldCode;
  if (code !== oldCode) delete data[oldCode];
  data[code] = name;
  saveCodesData(cls, data);
}
export function deleteCodesRow(cls, code) {
  const data = getCodesData(cls);
  delete data[code];
  saveCodesData(cls, data);
  renderCodesTable(cls);
}
export function addCodesRow(cls) {
  const data = getCodesData(cls);
  data['000'] = 'Subject Name';
  saveCodesData(cls, data);
  renderCodesTable(cls);
}
// ── Paste import ──
export function importDsPaste(cls) {
  const ta = document.getElementById(`ds-paste-${cls}`);
  if (!ta) return;
  const lines = ta.value.trim().split('\n').filter(l => l.trim());
  const data = {};
  const errors = [];
  lines.forEach((line, i) => {
    // Format: DD-Mon-YYYY  code1,code2,code3
    const m = line.trim().match(/^(\d{1,2}-[A-Za-z]{3}-\d{4})\s+(.+)$/);
    if (!m) { errors.push(`Line ${i+1}: "${line.trim()}" — expected format: DD-Mon-YYYY code1,code2`); return; }
    const date  = m[1];
    const codes = m[2].split(',').map(s => s.trim()).filter(Boolean);
    data[date]  = codes;
  });
  if (errors.length) {
    showModal('Import Errors', errors.join('\n'));
    return;
  }
  saveDsData(cls, data);
  renderDsTable(cls);
  ta.value = '';

  // Re-map existing candidates to new dates without requiring re-upload
  const uCls = cls.toUpperCase(); // 'X' or 'XII'
  const newCodeToDate = {};
  Object.entries(data).forEach(([d, codes]) => codes.forEach(c => newCodeToDate[c] = d));
  const subjectCodes = getActiveCodes(uCls);
  let remapped = 0;

  if (state.rawHTML && (state.rawHTML['10'] || state.rawHTML['12'])) {
    // Best path: full re-parse from raw HTML so subject codes + dates are both fresh
    const newCands = [];
    if (state.rawHTML['12']) newCands.push(...parseHTML(state.rawHTML['12'], 'XII'));
    if (state.rawHTML['10']) newCands.push(...parseHTML(state.rawHTML['10'], 'X'));
    // Replace only the class we just updated; keep the other class as-is
    const otherCands = state.candidates.filter(c => c.class !== uCls);
    const thisCands  = newCands.filter(c => c.class === uCls);
    state.candidates = [...otherCands, ...thisCands];
    remapped = thisCands.length;
  } else {
    // Fallback: remap dateSubjects in-place using current subject codes extracted from existing dates
    state.candidates.forEach(cand => {
      if (cand.class !== uCls) return;
      // Collect all subject codes this candidate had across any date
      const allCodes = [];
      Object.values(cand.dateSubjects).forEach(subs => subs.forEach(s => allCodes.push(s.code)));
      // Rebuild dateSubjects using the new codeToDate map
      const newDS = {};
      allCodes.forEach(code => {
        const d = newCodeToDate[code];
        if (!d || newDS[d]) return;
        newDS[d] = [{ code, name: subjectCodes[code] || code }];
      });
      cand.dateSubjects = newDS;
      remapped++;
    });
  }

  // Rebuild allDates from updated candidates
  const datesSet = new Set();
  state.candidates.forEach(c => Object.keys(c.dateSubjects).forEach(d => datesSet.add(d)));
  state.allDates = sortDates([...datesSet]);

  // Reset any previously generated seating so stale dates don't linger
  state.generated  = false;
  state.dateStates = {};
  state.seating    = {};

  saveToBrowser();

  // Refresh the Datesheet reference panel so it shows new dates immediately
  fillDatesheetPanel();

  // Refresh UI counts + re-enable the Generate button
  restoreUIAfterLoad();

  // Auto-generate seating with new dates and switch to seating panel
  if (state.allDates.length && state.candidates.length) {
    resetCustomOrder();
    generateSeating(null, false);
  } else {
    // Something went wrong with remapping — show generate button so user can try manually
    const btnGen = document.getElementById('btn-generate');
    if (btnGen) btnGen.disabled = false;
  }

  showModal('Imported', `✅ ${Object.keys(data).length} dates imported for Class ${uCls}\n${remapped} candidate(s) remapped to new dates.\n\nSeating regenerated automatically.`);
}
// ── Paste import — Subject Codes (adds/updates codes, keeps existing ones untouched) ──
export function importCodesPaste(cls) {
  const ta = document.getElementById(`codes-paste-${cls}`);
  if (!ta) return;
  const lines = ta.value.trim().split('\n').filter(l => l.trim());
  if (!lines.length) return;
  const data = getCodesData(cls);
  const errors = [];
  let added = 0, updated = 0;
  lines.forEach((line, i) => {
    // Format: CODE  Subject Name   (also accepts CODE,Subject Name)
    const m = line.trim().match(/^([A-Za-z0-9]+)[\s,]+(.+)$/);
    if (!m) { errors.push(`Line ${i+1}: "${line.trim()}" — expected format: CODE Subject Name`); return; }
    const code = m[1].trim();
    const name = m[2].trim();
    if (data[code] !== undefined) updated++; else added++;
    data[code] = name;
  });
  if (errors.length) {
    showModal('Import Errors', errors.join('\n'));
    return;
  }
  saveCodesData(cls, data);
  renderCodesTable(cls);
  ta.value = '';
  showModal('Imported', `✅ ${added} subject code(s) added, ${updated} updated for Class ${cls.toUpperCase()}.`);
}
// ── Reset to hardcoded defaults ──
export function resetDsToDefault(cls) {
  if (!confirm(`Reset Class ${cls.toUpperCase()} datesheet to 2026 defaults? This will overwrite your edits.`)) return;
  const el = document.getElementById(`cfg-${cls}-datesheet`);
  if (el) el.value = '';  // empty = use hardcoded constants
  saveToBrowser();
  renderDsTable(cls);
  fillDatesheetPanel();
  showModal('Reset', `Class ${cls.toUpperCase()} datesheet reset to built-in 2026 values.`);
}
// ── Restore datesheet/codes from saved config ──
export function restoreDsFromConfig(cfg) {
  const write = (id, val) => {
    const el = document.getElementById(id);
    if (el && val && Object.keys(val).length) el.value = JSON.stringify(val);
  };
  write('cfg-x-datesheet',   cfg.xDatesheet);
  write('cfg-xii-datesheet', cfg.xiiDatesheet);
  write('cfg-x-codes',       cfg.xCodes);
  write('cfg-xii-codes',     cfg.xiiCodes);
}
// ── Wipe datesheet/codes back to a genuinely empty state (used on reset for a new exam) ──
export function clearDsConfig() {
  ['cfg-x-datesheet','cfg-xii-datesheet','cfg-x-codes','cfg-xii-codes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '{}';
  });
  renderDsTables();
  fillDatesheetPanel();
}
