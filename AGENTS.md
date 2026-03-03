# AGENTS.md — CBSE Centre Management System (Single-File App)

This document is a working handover for future coding sessions on this project.

## 1) Project Snapshot
- Project: **CBSE Centre Management System**
- Main file: `/Users/aparnatiwari/Downloads/cbse/CBSE_Centre_Manager.html`
- Architecture: **single HTML file** containing:
  - UI markup
  - CSS styles
  - all JavaScript logic (parser, seating engine, attendance, reports, exports, persistence)
- Runtime: browser-only (no backend).
- External dependency: XLSX via CDN (`xlsx.full.min.js`) for Excel exports.

## 2) How To Run
- Start local server from project folder:
  - `cd /Users/aparnatiwari/Downloads/cbse`
  - `python3 -m http.server 8765`
- Open:
  - `http://localhost:8765/CBSE_Centre_Manager.html`

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
- Print overlays/styles are dynamic; each print flow should remove its own style on close and rely on global cleanup to avoid cross-report conflicts.

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
