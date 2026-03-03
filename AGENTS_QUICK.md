# AGENTS_QUICK.md — CBSE Centre Manager

## Project
- Main file: `/Users/aparnatiwari/Downloads/cbse/CBSE_Centre_Manager.html`
- Type: single-file browser app (HTML+CSS+JS)
- Run:
  - `cd /Users/aparnatiwari/Downloads/cbse`
  - `python3 -m http.server 8765`
  - open `http://localhost:8765/CBSE_Centre_Manager.html`

## Core Flow
1. Upload Class X/XII HTML
2. Parse + merge candidates
3. Configure seating rules
4. Generate seating (all dates / per date)
5. Mark attendance (per date)
6. Export / print
7. Auto-save (localStorage) + backup/restore JSON

## Key State
- `state.candidates`
- `state.allDates`
- `state.dateStates[ds]` (seating, attendance, status)
- `state.seating` (legacy sync for print/summary)

## High-Impact Functions
- Parse: `parseHTML()`, `buildCodeToDate()`
- Seating: `buildSeating()`, `generateSeating()`
- Attendance: `openAttendancePanel()`, `renderAttendanceBody()`, `markAtt()`
- Persistence: `saveToBrowser()`, `loadFromBrowser()`

## Current UX Enhancements
- Attendance modal has `Show absentees only`
- Attendance right sidebar on row hover shows candidate history across all dates
- Current date highlighted in sidebar (glow + badge)
- Sidebar anti-flicker + immediate refresh after P/A toggle
- Seating date cards show:
  - total candidates
  - non-zero class split only
  - top subject codes (with counts) per class (non-zero only)

## Known Fixes
- Candidate list `Subject(s)` no longer shows `undefined` (safe fallback from `dateSubjects`, then `—`)
- School-wise export now maps Mother/Father columns correctly
- Shared report/print guards prevent invalid export/print attempts consistently

## Refactor Status
- Phase 1 to Phase 7 complete (utilities, persistence, parser/seating, attendance, UI helpers, report/print guards, hardening)

## Quick Regression Checks
- Upload+parse both classes
- Generate seating
- Open attendance and mark P/A
- Check absentees-only toggle
- Hover sidebar updates instantly after P/A change
- Candidate list subject column has no `undefined`
- One export works (e.g., attendance Excel)
- Reload session once and verify data restored
