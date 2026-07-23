# AGENTS.md — CBSE Centre Management System (Single-File App)

This document is a working handover for future coding sessions on this project.

## 1) Project Snapshot
- Project: **CBSE Centre Management System**
- Legacy main file (kept for reference, no longer the active app): `CBSE_Centre_Manager.html`
- **Active frontend as of the Phase A modular refactor: `frontend/`** — see §1a.
- Runtime: browser frontend + a SQLite/Flask backend under `backend/` (Phase B/C of the multi-phase plan — see §1b). `frontend/js/storage.js` keeps localStorage as the authoritative local store (the app works fully offline / with no backend at all) and additionally syncs to the API in the background when reachable and signed in.
- External dependency: XLSX via CDN (`xlsx.full.min.js`) for Excel exports.

## 1a) Modular Frontend (Phase A refactor)
The original single-file monolith was mechanically split into ES modules. **No logic was changed** — this was verified with an automated splitter (parses every top-level function/const via `acorn`, buckets by concern, auto-generates cross-module `import`/`export` statements, then verifies every one of the 281 top-level entities survives verbatim) plus an extensive live-browser regression pass.

- `frontend/index.html` — same markup as the original body, just with the inline `<style>`/`<script>` replaced by `<link rel="stylesheet" href="css/styles.css">` and `<script type="module" src="js/main.js"></script>`.
- `frontend/css/styles.css` — extracted inline styles, unchanged.
- `frontend/js/` — one file per concern: `constants.js`, `state.js`, `parser.js`, `seating.js`, `attendance.js`, `datesheet.js`, `answerbook.js`, `invigilator.js`, `reports.js`, `ui.js`, `storage.js`, plus `main.js` (boot sequence).
- Run it: `.claude/launch.json` has a `frontend-static` config (`python -m http.server 8765 --directory frontend`), or run that command yourself and open `http://localhost:8765`.

**Critical gotcha for anyone editing these modules — mutable module-level state:**
The original file was a classic (non-module) script, so every top-level `function`/`var` was implicitly a `window` property, and the ~150 inline `onclick="..."` (and `onchange`/etc.) attributes in the markup could read/call any of them directly. ES modules don't work that way — `main.js` does `Object.assign(window, someMod)` so functions still resolve correctly (function references never change), but a handful of mutable `let` variables (`currentDate`, `summaryDate`, `_currentDsTab`, etc. — see `LIVE_BINDINGS` in `main.js`) get **reassigned** by their owning module after boot. A plain `Object.assign` copy goes stale the instant that happens, and inline HTML attributes have no way to see a module's live `import` binding (they only ever see `window.*`). `main.js` fixes this with `Object.defineProperty(window, name, { get: () => mod[name] })` for each one, proxying through the module's namespace object (which the ES module spec guarantees always reflects the exporter's *current* value). **If you add a new mutable module-level variable that's read from inline markup (any `on*="..."` attribute, static or template-string-generated), add it to `LIVE_BINDINGS` in `main.js` — otherwise it will silently read stale data.**

Two historical monkeypatches from the original file (`selectDate` being wrapped to also call `renderQPLogTable`, `switchPanel` being wrapped to call `showInvStep(1)` for the invigilator panel) were folded directly into their functions' bodies in `ui.js` rather than replicated as a `window.foo = wrapped` reassignment after the fact — this was necessary because several *other* modules call these functions as bare identifiers via their own `import`, and reassigning `window.foo` doesn't affect an already-bound `import` reference in another module.

## 1b) Backend API + offline-first sync (Phase B/C)

`backend/` is a Flask + SQLAlchemy + Flask-Migrate app implementing the single-centre, single-login backend from the migration plan. Flask serves the frontend directly (`static_folder=frontend/`, `/` returns `index.html`) — same-origin, so session cookies just work with default settings; this is also exactly the PythonAnywhere deployment topology (Phase D). `flask-cors` is configured too, only needed if you choose to run the frontend via a separate dev server on another port (`CORS_ORIGINS` env var, defaults to `http://localhost:8765`).

- `backend/models.py` — 17-table relational schema: `users` (one shared login), `sessions` (one row per centre code, mirrors `getConfig()` + centre identity fields — including `centre_head`/`centre_city`/`paper_size`/`colour_theme`/`include_citation`, which the original frontend read back on load but **never actually saved**; this schema, plus the frontend fix below, close that gap), `candidates` + `candidate_subjects`, `date_states` + `seating_assignments` + `attendance`, and the answer-book cluster (`ab_types`, `ab_subject_type_map`, `ab_supp_class_type_map`, `ab_receipts`, `ab_receipt_exceptions`, `ab_assignments`, `ab_damaged_serials`, `ab_supp_assignments`, `ab_supp_damaged_serials`, `ab_audit_log`). `serialRegistry` is deliberately **not** a table — it's a derived cache client-side (`rebuildAnswerBookRegistry()`) and the API reconstructs it the same way (always returns `{}`, matching `getAnswerBookForPersistence()`).
- `backend/api/sessions.py` — `GET /api/sessions` (list), `GET/PUT/DELETE /api/sessions/<centre_code>`. **Design principle: decompose into relational tables on write, reconstruct the exact JSON shape the frontend already builds/consumes on read** (`session_to_payload()` / the `_insert_*` helpers), so `storage.js` swaps `localStorage` calls for `fetch()` with minimal reshaping. Verified via a full round-trip test (complex payload covering candidates/seating/attendance/answer-book → PUT → GET → diffed field-by-field against the original — matched exactly except one intentionally-dropped empty-string mapping).
- `backend/auth.py` — `POST /api/auth/login {password}` / `logout` / `GET status`, single shared user (Werkzeug password hash), Flask signed-cookie session. All `/api/sessions/*` routes are gated via a `before_request` hook.
- Run locally:
  ```
  cd backend
  python -m venv .venv && ./.venv/Scripts/python -m pip install -r requirements.txt   # (or .venv/bin/python on macOS/Linux)
  export FLASK_APP=app.py
  ./.venv/Scripts/python -m flask db upgrade      # creates instance/cbse.sqlite3 from migrations/
  ./.venv/Scripts/python -m flask create-admin    # interactive; or seed a User row directly for scripting/tests
  ./.venv/Scripts/python wsgi.py                  # serves the whole app (API + frontend) at http://127.0.0.1:5000
  ```
- `backend/instance/` (the SQLite file) and `backend/.venv/` are gitignored — never commit them.

**Frontend sync layer (`frontend/js/storage.js`):** localStorage remains authoritative — every existing call site (`saveToBrowser()`, etc.) behaves exactly as in Phase A, and the app works fully offline / with no backend running. Layered on top:
- `buildSessionPayload()` is now the **single** payload builder shared by `saveToBrowser()` (localStorage), `downloadBackup()` (JSON file), and the sync layer — previously those first two built two subtly different payloads (the backup file silently dropped `invReq`), and neither included `centreHead`/`centreCity`/`paperSize`/`colourTheme`/`includeCitation`. Both gaps are fixed by this refactor.
- `saveToBrowser()` calls `scheduleSync()` after every local save, which debounces (5s after the last change, forced through after 30s of continuous edits) into `syncNow()` — a `PUT /api/sessions/<centre_code>`. All failure modes (offline, backend down, not signed in, HTTP error) degrade to updating the `#save-time` indicator text and retrying later; nothing throws or blocks the caller.
- Auth is a simple `prompt()` for the shared password the first time a sync is attempted per page load (`ensureLoggedIn()` in storage.js) — skip it and the app just stays localStorage-only.
- `checkServerForNewerSession()` runs after `doRestoreSession()` (the "Continue Session" banner): if the server's `savedAt` is newer than what was just loaded from localStorage (e.g. edited from another device/browser), it prompts to pull the server copy in via `confirm()` rather than silently overwriting it on the next sync.
- `initSyncListeners()` (called once from `main.js`'s boot sequence, **not** at storage.js's top level — every module here is side-effect-free just from being imported, by the same convention established in Phase A) wires a best-effort `keepalive: true` flush on tab-hide and a retry-on-reconnect via the `online` event.
- Verified live end-to-end in a real browser against a real running backend: login, debounced auto-sync (including a real race-condition catch — a sync attempt firing before an in-flight login resolves), manual `syncNow()`, the conflict-prompt firing/not-firing correctly based on `savedAt`, and full offline resilience (backend killed mid-session — app kept working, indicator degraded gracefully, no console errors, resumed syncing once the backend came back).
- Also fixed two real Phase-A splitter bugs surfaced while touching this code: the auto-import scanner's "skip identifiers preceded by `.`" rule (meant to avoid `obj.foo` property access) also accidentally skipped identifiers right after a spread operator (`...parseHTML(...)` — the `.` looks the same). Both `storage.js` and `datesheet.js` were missing a `parseHTML` import as a result; `datesheet.js`'s was a live bug in `importDsPaste()`, not just a latent/unreachable one.

## 2) How To Run
- **Modular frontend (current):** `python -m http.server 8765 --directory frontend`, open `http://localhost:8765`. (Or use the `frontend-static` launch config.)
- **Legacy single-file monolith (reference only):**
  - `python3 -m http.server 8765`
  - Open `http://localhost:8765/CBSE_Centre_Manager.html`

## 3) Core Workflow (User Journey)
1. Upload class HTML files (X / XII)
2. Parse and merge candidate data
3. Configure seating rules (split/order/layout/private/stagger)
4. Generate seating (all dates or per date)
5. Per-date operations:
   - custom order
   - attendance marking
   - lock/unlock date
6. Export/print documents
7. Auto-save to localStorage, optional backup/restore JSON

## 4) Data Model (Important)
Global `state` object drives everything.

Key fields:
- `state.candidates`: parsed canonical candidates
- `state.allDates`: all exam dates
- `state.answerBook`:
  - `types[]`
  - `subjectTypeMap{ class|subject -> typeId }`
  - `suppClassTypeMap{ X|XII -> typeId }`
  - `receipts[]` (challan range + qty)
  - `receiptExceptions[]` (missing/damaged serial on receipt)
  - `dateLedger[date]` (`assignments`, `damagedSerials`, `suppAssignments`, `suppDamagedSerials`, `remarks`)
  - `serialRegistry{ normalizedSerial -> serial state }`
  - `auditLog[]`
- `state.dateStates[date]`:
  - `status`: empty/draft/locked
  - `split`, `classOrder`, `subjectOrder`
  - `seating[]`
  - `attendance{ roll -> P/A/null }`
- `state.seating`: legacy map synced from `dateStates` for summary/print compatibility

## 5) Critical Functions
- Parsing and mapping:
  - `parseHTML(htmlString, cls)`
  - `buildCodeToDate(cls)`
- Seating:
  - `buildSeating(candidates, cfg, targetDate)`
  - `generateSeating(ds, silent)`
- Date actions:
  - `selectDate(ds)`, `generateDateSeating()`, `toggleLock()`
- Attendance:
  - `openAttendancePanel()`
  - `renderAttendanceBody(ds)`
  - `markAtt(roll, val, ds, cls)`
- Answer book:
  - `renderAnswerBookSection(ds)`
  - `addABReceipt()`, `addABReceiptException()`
  - `assignABSerialForRoll(ds, roll, cls)`
  - `abMarkDamagedFromAssignment(ds, roll)`
  - `rebuildAnswerBookRegistry()`
- Persistence:
  - `saveToBrowser()`
  - `loadFromBrowser()`
  - `downloadBackup()` / `restoreFromBackup()`

## 6) Attendance UX (Current Behavior)
- Attendance modal includes:
  - room-wise table
  - bulk actions (All Present / All Absent / Clear)
  - "Show absentees only on this date" checkbox
- Right sidebar in attendance modal:
  - shows hovered candidate attendance across all registered dates
  - highlights currently selected date (glow + badge)
- Anti-flicker + live refresh behavior:
  - sidebar does not clear on row mouseleave
  - cached same-row hover to avoid unnecessary repaint
  - **forced refresh on P/A click** so sidebar status updates immediately

## 6.1) Session Switching (Current Behavior)
- Topbar includes a **Session Selector** dropdown + **Load** button.
- Dropdown lists non-empty saved sessions from localStorage keys:
  - `cbse_centre_<centreCode>`
- `Load` restores the selected key directly (not only the latest autosave).
- Selector refreshes after:
  - save
  - restore backup
  - New Year reset
  - Full reset
  - app init/restore flow

## 7) Seating Date Cards (Current Behavior)
Date cards in Seating Plan now show:
- total candidates
- class split (only non-zero entries)
- top subject codes with counts per class
  - `X: 041(120), ...` (shown only if non-empty)
  - `XII: 301(90), ...` (shown only if non-empty)
- improved left-aligned rich layout for readability

## 8) Known Fixes Already Applied
1. Candidate list `Subject(s)` showing `undefined`:
   - fixed by deriving safe fallback from `dateSubjects[date]`
   - final fallback is `—`
2. Attendance sidebar flicker:
   - removed clear-on-mouseleave behavior
   - added cache guard + force refresh on status toggle
3. Current date highlight in attendance history sidebar.
4. Date cards enhanced with class/subject counts and non-zero conditional rendering.
5. School-wise export column mapping fixed (`Mother` and `Father` now exported in correct columns).
6. Report/print guard helpers added:
   - shared generated-check for report exports
   - shared current-date+seating check for print flows
7. Session Selector added for switching saved years/centre-code sessions from UI.
8. New-Year reset bug fix: `restoreDsFromConfig(cfg)` is now called correctly.
9. Full Answer Book module implemented:
   - receipt stock with serial ranges and challan qty
   - receipt-time missing/damaged serial exceptions
   - subject-to-type mapping
   - date-wise candidate serial assignment
   - absentee auto-release of assigned serials
   - post-assignment damaged marking with override
   - final reconciliation snapshot and 3 Excel exports
10. Persistence upgraded:
   - payload now stores `answerBook`
   - payload version moved to v3 (backward-compatible load defaults)
11. Supplementary answer-book flow added:
   - class-based mapping (`X` and `XII` supplementary type)
   - manual post-exam entry per candidate (0..N supplementary serials)
   - blocked for absentees
   - supplementary serials are consumed immediately on add
   - supplementary damaged/override flow added
   - exports include supplementary mapping/use/exceptions and split used totals
12. Print blank-page hardening:
   - added global print cleanup (`clearPrintArtifacts()`) before print flows
   - stale overlay/style leftovers now removed before opening a new print report
13. Seat-slip overflow fix:
   - roll font sizing now bounded and width-aware
   - long roll numbers no longer overflow into adjacent cells when fewer info fields are shown
14. Print runtime centralization:
   - added `PRINT_REPORT_REGISTRY` (overlay/style/page metadata)
   - added shared helpers: `beginPrintSession()`, `endPrintSession()`, `buildPrintShellCSS()`, `registerPrintHooks()`
   - close buttons now call `closePrintSession(...)` instead of direct DOM removal
15. QP print hook lifecycle unified:
   - QP Statement and Bank QP Register now use centralized hook registration/teardown
   - stale `beforeprint/afterprint` listeners are removed by shared runtime cleanup
16. Invigilator Demand requirements total fixed:
   - Step 2 now counts one candidate once per exam date for each school
   - `Total Cands` now sums those per-date candidate counts instead of showing only unique enrolled candidates
   - per-date subtotals no longer double-count candidates with multiple subject codes on the same date
   - every school/date cell keeps an editable invigilator input, even when that school has 0 candidates on that date
   - letter generation synchronizes the visible requirement form before printing, so updated values are used immediately
   - letters include demand dates even when the school has no candidates on that date
   - default letter template now follows the English assistant-superintendent demand format
   - letter placeholders include `{BOARD_EXAM_LABEL}`, `{EXAM_SESSION}`, and `{FIRST_DUTY_DATE}`
   - duty table rows now render as `DATE / CLASS SUB-NAME / No. of Teacher required`
   - generated letters include only dates where teacher demand is greater than 0
   - generated letter preview/print now renders `{DUTY_DATES_TABLE}` as a real bordered HTML table instead of monospaced plain text
   - Invigilator Letters print view now uses shared print shell CSS and `closePrintSession(...)`
   - duty table headers print as black text on white background and repeat via table header group

## 9) Safe Editing Guidance
Because this is a large monolith file, prefer small targeted edits.

Recommended process:
1. `rg` for function and call sites.
2. Edit minimal block.
3. Validate JS syntax quickly:
   - extract `<script>` and run `node --check`
4. Refresh browser and verify impacted panel only.

## 10) Quick Regression Checklist
After any change, test:
- Upload + parse both classes
- Generate seating all dates
- Select date, open attendance, mark P/A
- On attendance A mark, verify assigned answer-book serial auto-releases
- Supplementary serial entry should block for absentees
- Add 2 supplementary serials for one candidate and verify both persist
- Remove one supplementary serial and verify it returns to available stock
- Mark one supplementary serial damaged and verify blocked from reuse
- Toggle absentees-only view
- Hover sidebar updates correctly
- Candidate list subject column has no `undefined`
- Run one answer-book export (`Receipt`, `Daywise`, or `Final Return`)
- Test print actions (`Display Plan`, `Triplicate`, `Seat Slips`) after visiting another print report first
- Run print previews sequentially without refresh:
  - `Display Plan` -> `Triplicate` -> `Seat Slips` -> `Room Summary` -> `Centre Memo` -> `Form-66`
  - `Att. Sheet (X/XII)` -> `Appendix-E (X/XII)` -> `Century Series` -> `QP Statement` -> `Bank QP Register`
  - expected: no blank preview, no stale toolbar/style contamination, close button always cleans overlay/style
- Save/reload session once

Answer-book focused checks:
- Add at least one type and map class+subject to type
- Add receipt range (e.g., `AB/26/0001` to `AB/26/0100`)
- Mark one serial missing and one damaged on receipt
- Assign serial to a candidate, then mark candidate absent and confirm serial is reusable
- Configure supplementary type mapping for X and XII
- Enter supplementary serials manually (post-exam) and verify immediate used count
- Mark assigned serial damaged and confirm it is blocked from reuse
- In Seat Slips, toggle off most content fields and verify roll text stays within each slip cell
- Confirm final return report compresses remaining serials into ranges

## 11) Limitations / Technical Debt
- Single-file architecture makes maintenance risky.
- Many render templates are inline strings.
- State mutations are distributed across functions.
- No automated test suite.
- Answer-book registry is rebuilt from receipts/ledger on render/save; large serial ranges may impact UI speed.
- Serial parsing assumes `prefix + numeric suffix` format (alphanumeric prefix + trailing digits).
- Print overlays/styles are dynamic and now routed through shared runtime metadata; new print flows should:
  - register overlay/style IDs in `PRINT_REPORT_REGISTRY`
  - use `buildPrintShellCSS()` for common print-shell behavior
  - close through `closePrintSession(...)` to avoid hook/style leaks

## 12) Suggested Future Refactor Path
Completed refactor phases:
1. Phase 1: shared date/subject utilities extracted.
2. Phase 2: persistence/state helper centralization.
3. Phase 3: parser and seating helper extraction.
4. Phase 4: attendance count/header helper centralization.
5. Phase 5: date-card and candidate-list rendering helper extraction.
6. Phase 6: report/export/print guard and context helper extraction.
7. Phase 7: hardening pass (smoke checks + docs update + export field fix).

Recommended next steps:
1. Split into modules (`parser`, `seating`, `attendance`, `reports`, `storage`).
2. Centralize state updates through reducer-style actions.
3. Add unit tests for parser/seating edge cases.
4. Add migration-safe payload version handling for localStorage/backup.

---
If a future assistant edits this app, update this AGENTS.md with: what changed, why, and any new gotchas.
