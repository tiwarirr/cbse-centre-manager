// ============================================================
// parser.js — extracted from CBSE_Centre_Manager.html (Phase A modular split)
// ============================================================
import { XII_CODES, XII_DATESHEET, X_CODES, X_DATESHEET } from './constants.js';
import { fillDatesheetPanel } from './datesheet.js';
import { generateSeating, resetCustomOrder } from './seating.js';
import { getConfig, state } from './state.js';
import { applyCentreInfoToUI, extractCentreInfoFromHTML, saveToBrowser } from './storage.js';

export function parseDate(ds) {
  const [d,m,y] = ds.split('-');
  const months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  return new Date(y, months[m], parseInt(d));
}
export function dayName(ds) {
  return parseDate(ds).toLocaleDateString('en-US', {weekday:'long'});
}
export function sortDates(arr) {
  return [...arr].sort((a,b) => parseDate(a) - parseDate(b));
}
export function getDateSubjects(entity, ds) {
  return (entity?.dateSubjects?.[ds] || []).filter(Boolean);
}
export function getPrimarySubject(entity, ds) {
  return getDateSubjects(entity, ds)[0] || null;
}
export function formatSubjectsForDate(entity, ds, sep) {
  const joiner = sep || ' | ';
  const parts = getDateSubjects(entity, ds).map(sub => {
    if (!sub || !sub.code) return '';
    return sub.name ? `${sub.code} ${sub.name}` : `${sub.code}`;
  }).filter(Boolean);
  return parts.join(joiner);
}
// ── HTML PARSER ────────────────────────────────────────────────
// ── DATESHEET & SUBJECT CODE HELPERS ───────────────────────────
// Returns active datesheet — stored config overrides hardcoded constants.
// An explicitly-cleared datesheet (stored === {}) stays empty; only a truly
// unset field (stored === null) falls back to the built-in constants.
export function getActiveDatesheet(cls) {
  const cfg = getConfig();
  const stored = cls === 'X' ? cfg.xDatesheet : cfg.xiiDatesheet;
  return stored !== null ? stored : (cls === 'X' ? X_DATESHEET : XII_DATESHEET);
}
export function getActiveCodes(cls) {
  const cfg = getConfig();
  const stored = cls === 'X' ? cfg.xCodes : cfg.xiiCodes;
  return stored !== null ? stored : (cls === 'X' ? X_CODES : XII_CODES);
}
// Build reverse map: code → date
export function buildCodeToDate(cls) {
  const ds = getActiveDatesheet(cls);
  const map = {};
  Object.entries(ds).forEach(([d, codes]) => codes.forEach(code => map[code] = d));
  return map;
}
export function parseSchoolHeader(text) {
  if (!text || !text.includes('SCHOOL')) return null;
  const m = text.match(/SCHOOL\s*-(\d+)\s+(.*?)(?:\s+CENTRE|$)/)
        || text.match(/SCHOOL\s*-(\d+)\s+(.*)/);
  if (!m) return null;
  const schoolCode = m[1].trim();
  const schoolName = schoolCode === '99999' ? 'PRIVATE CANDIDATE' : m[2].trim();
  return { schoolCode, schoolName };
}
export function splitTdByBreak(td) {
  return Array.from(td.childNodes)
    .filter(n => n.nodeType === 3 || n.nodeName === 'BR')
    .reduce((acc, n) => {
      if (n.nodeName === 'BR') acc.push('');
      else {
        if (!acc.length) acc.push('');
        acc[acc.length-1] += n.textContent.trim();
      }
      return acc;
    }, [])
    .filter(s => s.trim());
}
export function parseSubjectsRawFromRow(tds) {
  const out = [];
  const maxSubCol = Math.min(tds.length - 1, 10);
  for (let i = 4; i <= maxSubCol; i++) {
    const parts = Array.from(tds[i].childNodes).map(n => n.textContent.trim()).filter(Boolean);
    const code = parts[0] || '';
    const med  = parts[1] || '';
    if (code && /^\d+$/.test(code)) out.push({ code, med });
  }
  return out;
}
export function buildDateSubjectsMap(subjectsRaw, codeToDate, subjectCodes) {
  const dateSubjects = {};
  subjectsRaw.forEach(({ code }) => {
    const ds = codeToDate[code];
    if (!ds || dateSubjects[ds]) return;
    dateSubjects[ds] = [{ code, name: subjectCodes[code] || code }];
  });
  return dateSubjects;
}
export function parseHTML(htmlString, cls) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  const codeToDate   = buildCodeToDate(cls);
  const subjectCodes = getActiveCodes(cls);

  let currentSchoolCode = '';
  let currentSchoolName = '';
  const candidates = [];
  const seenRolls = new Set();

  const rows = doc.querySelectorAll('tr[valign="top"]');
  rows.forEach(row => {
    // Check for school header
    const fullTd = row.querySelector('td[colspan="13"]');
    if (fullTd) {
      const txt = fullTd.textContent.replace(/\s+/g,' ').trim();
      const school = parseSchoolHeader(txt);
      if (school) {
        currentSchoolCode = school.schoolCode;
        currentSchoolName = school.schoolName;
      }
      return;
    }

    const tds = row.querySelectorAll(':scope > td');
    if (tds.length < 5) return;  // minimum: roll, blank, name, sex/cat, 1 subject
    const roll = tds[0].textContent.trim();
    if (!/^\d+$/.test(roll) || seenRolls.has(roll)) return;
    seenRolls.add(roll);

    // td[2]: Name / Mother / Father (BR-separated)
    const nArr  = splitTdByBreak(tds[2]);
    const name   = nArr[0] || '';
    const mother = nArr[1] || '';
    const father = nArr[2] || '';

    // td[3]: Sex / Category / NA (BR-separated — ignore 3rd part)
    const infoArr = splitTdByBreak(tds[3]);
    const sex = infoArr[0] || '';
    const cat = infoArr[1] || '';

    const subjectsRaw = parseSubjectsRawFromRow(tds);
    const dateSubjects = buildDateSubjectsMap(subjectsRaw, codeToDate, subjectCodes);

    candidates.push({
      roll, class: cls, name, mother, father, sex, cat,
      schoolCode: currentSchoolCode,
      schoolName: currentSchoolName,
      dateSubjects,
    });
  });

  return candidates;
}
// ── FILE HANDLING ──────────────────────────────────────────────
export function handleDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('dragover'); }
export function handleDragLeave(e) { e.currentTarget.classList.remove('dragover'); }
export function handleDrop(e, cls) {
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) readFile(file, cls);
}
export function handleFileSelect(e, cls) {
  const file = e.target.files[0];
  if (file) readFile(file, cls);
}
export function readFile(file, cls) {
  const reader = new FileReader();
  reader.onload = e => { state.rawHTML[cls] = e.target.result; onFileLoaded(cls); };
  reader.readAsText(file);
}
export function onFileLoaded(cls) {
  document.getElementById(`zone-${cls}`).classList.add('loaded');
  document.getElementById(`loaded-${cls}`).style.display = 'block';
  parseAndMerge();
}
export function parseAndMerge() {
  document.getElementById('parse-progress').style.display = 'block';
  document.getElementById('parse-results').style.display = 'none';

  setTimeout(() => {
    state.candidates = [];

    if (state.rawHTML['12']) {
      const xii = parseHTML(state.rawHTML['12'], 'XII');
      state.candidates.push(...xii);
    }
    if (state.rawHTML['10']) {
      const x = parseHTML(state.rawHTML['10'], 'X');
      state.candidates.push(...x);
    }

    // Build school index
    state.schools = {};
    state.candidates.forEach(c => {
      if (!state.schools[c.schoolCode]) {
        state.schools[c.schoolCode] = { name: c.schoolName, x: new Set(), xii: new Set() };
      }
      state.schools[c.schoolCode][c.class === 'X' ? 'x' : 'xii'].add(c.roll);
    });

    // Get all dates
    const datesSet = new Set();
    state.candidates.forEach(c => Object.keys(c.dateSubjects).forEach(d => datesSet.add(d)));
    state.allDates = sortDates([...datesSet]);

    const xiiCount = state.candidates.filter(c => c.class === 'XII').length;
    const xCount   = state.candidates.filter(c => c.class === 'X').length;

    document.getElementById('parse-progress').style.display = 'none';
    document.getElementById('parse-results').style.display = 'block';
    document.getElementById('stat-xii').textContent = xiiCount;
    document.getElementById('stat-x').textContent   = xCount;
    document.getElementById('stat-schools').textContent = Object.keys(state.schools).length;
    document.getElementById('stat-dates').textContent = state.allDates.length;

    // Sidebar
    document.getElementById('sb-x-count').textContent   = xCount;
    document.getElementById('sb-xii-count').textContent  = xiiCount;
    document.getElementById('sb-dates-count').textContent = state.allDates.length;
    document.getElementById('badge-cands').textContent  = state.candidates.length;
    document.getElementById('badge-cands').style.display = 'inline-block';
    document.getElementById('badge-upload').style.display = 'none';
    document.getElementById('btn-generate').disabled = false;

    const htmlSrc = state.rawHTML['12'] || state.rawHTML['10'];
    if (htmlSrc) applyCentreInfoToUI(extractCentreInfoFromHTML(htmlSrc), { onlyIfEmpty: false, updateSidebar: true });
    // Persist immediately so it survives next session
    saveToBrowser();

    // Schools table
    const tbody = document.getElementById('schools-tbody');
    tbody.innerHTML = '';
    Object.entries(state.schools).sort((a,b) => a[0].localeCompare(b[0])).forEach(([code, sch]) => {
      const tr = document.createElement('tr');
      const isPrivate = code === '99999';
      tr.innerHTML = `
        <td><code style="font-size:12px">${code}</code></td>
        <td>${sch.name}</td>
        <td>${sch.x.size || '—'}</td>
        <td>${sch.xii.size || '—'}</td>
        <td><strong>${sch.x.size + sch.xii.size}</strong></td>
      `;
      tbody.appendChild(tr);
    });

    // Fill datesheet panel
    fillDatesheetPanel();

    // Reset custom order on fresh upload, then auto-generate
    resetCustomOrder();
    generateSeating(null, false);
  }, 300);
}
