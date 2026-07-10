---
name: verify
description: Run and drive this app (static HTML/JS picking-allocation dashboard) end-to-end.
---

This is a static vanilla-JS app (`index.html` + `js/app.js`, `js/truck.js`, `js/shell.js`).
No build step, no server-side code, no package.json.

## Launch

```bash
cd /Users/chimac/return_project
python3 -m http.server 8934 >/tmp/pickserver.log 2>&1 &
```

Then open `http://localhost:8934/index.html`. Serve over http (not `file://`) —
some paths (fonts, vendor scripts) behave better and it matches real usage.

## Driving it with Playwright

Playwright (Python) + Chromium are already installed in this environment
(`pip show playwright` succeeds, `p.chromium.launch()` works headless — no
extra `playwright install` needed). No Node/npm available on this machine.

### Seeding data through the real UI

There is no debug hook / global `state` export. The only way to get rows into
`state.rows` is the paste-tab-separated-text feature:

1. Fill `#pasteArea` with **tab-separated rows, header row required as the
   first line**, exact Korean labels (must match `COLUMNS` in `js/app.js`):
   `그룹번호  마감일시  생성일시  매입유형  업체명  상태  운송타입  존  수량`
   (zone = 존, quantity = 수량, 생성일시 is used for the date-tab / assign
   date filter — format like `2026-07-11 09:00`).
2. Click `#pasteApplyBtn`.

Omitting the header row silently fails validation (`assignMsg`/`statusMsg`
will say a column/header is missing or no dates found) — always prepend it.

### Picking-allocation ("집품 할당") flow

- Open modal: `#assignOpenModalBtn`.
- Date checkboxes render lazily under `#assignDateCheckboxes` as
  `input.assign-date-cb` inside `<label>` — check them explicitly, they are
  not pre-selected.
- Floor prefix: `#assignFloorInput` (e.g. `"72"`). Worker count:
  `#assignCountInput`. Generate preview: `#assignPreviewBtn`.
- Preview cards render as **direct children** of `#assignPreviewContainer`
  with class `.rounded-xl` — select via
  `#assignPreviewContainer > div.rounded-xl` (a broader `.bg-white.border`
  selector also matches nested table wrapper divs and overcounts).
- `ASSIGN_DETAIL_COLUMNS` order (for reading the per-row table) is:
  그룹번호, 마감일시, 생성일시, 업체명, 운송타입, 존, 수량 — zone is
  `td:nth-child(6)`.
- Each card header (`.bg-slate-50` inside the card) shows
  `작업자 N | 합계 <qty>개 · <rows>장`.

### O-zone-priority toggle (72/73층 O존 우선 정렬)

Lives inside the collapsed "필터/정렬" panel on the home screen — it is
`display:none` until you expand it:

```
page.click("#filterSortToggleBtn")   # expand panel first
page.click("#sortZoneOPriorityBtn")  # then toggle O-zone priority
```

Clicking the button directly while the panel is collapsed times out
("element is not visible").

## Gotchas learned

- No node/npx on this machine — use Python's `playwright` package, not a JS
  test runner.
- `state`/functions are inside an IIFE in `js/app.js`, not exposed on
  `window` — you cannot `page.evaluate` into internal functions; drive the
  UI instead.
- Always kill the background `http.server` when done (`pkill -f
  "http.server 8934"`) to avoid leaking a stale listener across sessions.
