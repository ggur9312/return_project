---
name: verify
description: Run and drive this app (static HTML/JS picking-allocation dashboard) end-to-end.
---

This is a static vanilla-JS app (`index.html` + `js/pick/*.js` [classic scripts
sharing a `window.Pick` namespace object, entry `js/pick/main.js`], `js/truck.js`,
`js/shell.js`). No build step, no server-side code, no package.json. See
`CLAUDE.md` for the `js/pick/` file map and the `window.Pick` pattern.

## Launch — test BOTH of these, `file://` is the primary one

Real users open `index.html` by double-clicking it (`file://`), so that is the
must-pass case — **always include a `file://` run**, not just `http://`. A
past regression (`<script type="module">` for `js/pick/*.js`) passed every
`http://`-only Playwright check with 0 JS errors while being completely broken
under `file://` (ES module `import` is blocked by CORS under `file://`), and
shipped anyway because nothing tested the real workflow. Don't repeat that.

```bash
# file:// — open directly, no server needed:
# file:///path/to/return_project/index.html

# http:// — optional extra check, for parity with a real deployment:
cd /path/to/return_project
python3 -m http.server 8934 >/tmp/pickserver.log 2>&1 &
# then open http://localhost:8934/index.html
```

## Driving it with Playwright

Playwright (Python) + Chromium are already installed in this environment
(`pip show playwright` succeeds, `p.chromium.launch()` works headless — no
extra `playwright install` needed). No Node/npm available on this machine.

### Seeding data through the real UI

There is no debug hook / global `state` export. The only way to get rows into
`state.rows` is the paste-tab-separated-text feature — **now inside a modal**,
not directly on the page:

1. Navigate to 집품리스트 현황 (`#navHomeBtn`) — 홈 is now the dashboard, not
   this screen.
2. Click `#homeUploadBtn` to open `#homeUploadModal` (`#pasteArea` is not
   visible/fillable until this modal is open — a bare `page.fill("#pasteArea", ...)`
   without clicking the button first will time out waiting for visibility).
3. Fill `#pasteArea` with **tab-separated rows, header row required as the
   first line**, exact Korean labels (must match `COLUMNS` in `js/pick/core.js`):
   `그룹번호  마감일시  생성일시  매입유형  업체명  상태  운송타입  존  수량`
   (zone = 존, quantity = 수량, 생성일시 is used for the date-tab / assign
   date filter — format like `2026-07-11 09:00`).
4. Click `#pasteApplyBtn` — on success the modal **auto-closes** (`handleParsedMatrix`
   in core.js calls `closeModalWithTransition` at the end of its success path).

Omitting the header row silently fails validation (`statusMsg`, inside the
modal, visible before it auto-closes on error since only the success path
closes it) — always prepend the header row. File upload works the same way:
click `#homeUploadBtn`, then `#fileSelectBtn`/drag onto `#dropZone`/set
`#fileInput.files` — same ids as before, just relocated into the modal.

### 대시보드 (`#dashboardView`, now "홈" / default landing view)

Independent dataset from 집품리스트 현황 — upload via `#dashboardUploadBtn` →
`#dashboardUploadModal` (file `#dashboardFileInput`/`#dashboardFileSelectBtn`,
or paste `#dashboardPasteArea`/`#dashboardPasteApplyBtn`). Upload **merges**,
it does not replace — dedup key is the C column (내부반출번호/`exportNo`);
re-uploading a row with the same C value is skipped and reflected in
`#dashboardUploadStatusMsg` ("N건 추가 (중복 M건 제외)"). Modal auto-closes on
success only. Date tabs (`#dashboardDateTabsContainer`) support the same
Ctrl/Cmd+click multi-select as home's date tabs, plus a `.date-tab-close` "✕"
per date tab that calls `removeDashboardRowsByDate` (same `window.confirmModal`
gate as core.js's `removeRowsByDate`). For a positional (non-header-matching)
test fixture, columns are 0-indexed: C=2 (내부반출번호), D=3 (생성일시),
J=9/K=10/L=11 (수량 3단계), N=13 (상태값) — row 0 is treated as a header and
skipped regardless of its content.

### 트럭현황 홈 upload (`js/truck.js`, no `window.Pick`)

Same button→modal pattern: click `#truckUploadBtn` → `#truckUploadModal` opens
(hand-rolled open/close via `openTruckUploadModal`/`closeTruckUploadModal` in
truck.js — no core.js helpers available here). File: `#excelFile` (still
requires header-label match on 그룹번호/생성일시/업체명/운송타입, only rows
with 운송타입==="트럭" survive). Paste: `#truckPasteArea`/`#truckPasteApplyBtn`
(new — previously truck had no paste option), parsed via a local
`truckTextToMatrix()` in truck.js (duplicates core.js's `textToMatrix` logic
since truck.js can't import it). Merges into `globalProcessedData` per-date,
deduped by `groupNo_company` — unchanged behavior, only the surrounding UI
moved into a modal. Modal auto-closes only on `processData`'s success path.

### Home "층별 인원 배치 계산" floor panel

Collapsible section (`#floorPanelCard`, toggle `#floorPanelToggleBtn`,
default state read from localStorage — expand explicitly if a test needs to
read `#floorBars` and it might start collapsed). `renderFloorPanel()` in
`js/pick/core.js` buckets rows by exact floor code (`getFloor(zone)`, e.g.
"72", "73", "9") into per-floor rows. **In addition**, whenever 2+ distinct
floor codes share the same leading digit (e.g. "72"/"73" both start with
"7"), a bold "N층대" summary row (`bg-indigo-50 border-indigo-100`, no
progress bar — the middle column instead lists which floors it combines,
e.g. "72층 + 73층") is inserted directly before those floors' individual
rows. A floor with no same-leading-digit sibling (e.g. a lone "9") gets no
family row — only shown when it actually combines something. The same
family totals are prefixed onto `#floorPanelSummary`'s collapsed-state text.
`#laborInput` changes trigger `debouncedRenderFloorPanel()` (200ms debounce,
`js/pick/main.js`) which computes labor-per-floor and labor-per-family the
same way.

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

### Picking-allocation confirmed-result screen (작업자 카드)

- The filter/sort bar is **one shared bar** above all worker cards (static
  markup `#assignFilterSortBar` in index.html, not rebuilt per card) — same
  `createFilterBarController`/`createSortBarController` factories as home, so
  it has a real search box + "적용" button (`.th-filter-search`/`.th-filter-apply`
  inside `#assignFilterButtonsContainer .th-filter-dropdown`), not the ad-hoc
  instant-apply checkboxes older versions of this screen used.
- O-zone-priority button here is `#assignSortZoneOPriorityBtn` (separate from
  home's `#sortZoneOPriorityBtn` — two independent flags, one per screen, both
  non-persisted).
- Worker cards: `#assignTableContainer > div.space-y-8 > div` (bg-white,
  rounded-2xl, shadow-md, `border-l-4` left accent). Each card's header tint
  and left accent rail cycle through `WORKER_CARD_ACCENTS` in
  `js/pick/assign-panel.js` (indigo/amber/teal/rose/sky, chosen so adjacent
  cards never look alike) so 2+ cards in "전체" view read as separate blocks
  instead of blending together — don't assume a fixed header color when
  asserting on card styling, check `WORKER_CARD_ACCENTS[idx % 5]` instead.
  The "✓ 출력됨" badge is a solid `bg-emerald-500 text-white` pill (not a pale
  `emerald-50` tint) specifically so it stays visible after printing. The
  header's secondary buttons (미사용 GT 자동매칭/GT 바코드 초기화/여분 출력)
  use the same bordered white `outlineBtn` style as 출력/삭제 (a borderless
  "ghost" variant was tried and reverted — users couldn't tell they were
  clickable). The detail table inside each card uses `table-fixed` +
  `<colgroup>` percentage widths again (`ASSIGN_DETAIL_COLUMN_WIDTHS` in
  `js/pick/assign-panel.js`, roomier than the original: 10/10/10/12/8/8/8 for
  the 7 data columns, 18/11/5 for GT바코드/작업자/삭제) — a `table-layout:auto`
  version was tried and reverted because flexible `<input>`/`<select>` cells
  soaked up leftover width unevenly, squeezing the first/last columns and
  making the table look mismatched with the card. `truncate`+`title` tooltip
  still applies to every column (colgroup width is a hard cap, not a hint).
  Filter/sort candidate values are scoped to whichever workers currently pass
  the "작업자" virtual filter — see `getAssignPanelCandidateValues` in
  `js/pick/assign-panel.js` if a test needs exact candidate-list behavior.

### 집품리스트 추출 screen (`#extractView`, `js/pick/extract.js`)

Only takes a real `.xlsx` file upload (`#extractFileInput`, no paste-text
alternative) — a 2-sheet workbook: sheet1 in the exact home-upload format
(headers must match `COLUMNS`), sheet2 a positional A-N layout with no
header matching (H=index7 company, N=index13 status). To seed a test file
with Playwright/Node, build it with SheetJS (`xlsx` npm package or the
vendor build): `XLSX.utils.aoa_to_sheet([[...header], [...row], ...])` per
sheet, `XLSX.utils.book_append_sheet(wb, ws, name)` for both sheets, then
`XLSX.write(wb, {type:"buffer", bookType:"xlsx"})` written to a temp file
and uploaded via `page.setInputFiles("#extractFileInput", path)`. Extracted
rows only land in `#extractTableBody` (a simple read-only preview, no
filter/sort) until `#extractMergeBtn` is clicked, which calls the same
`applyParsedRows` home upload uses (dedupes against `state.rows` by
groupNo+생성일자+company+zone) and then switches to the home view.
`#extractResetBtn` clears the in-memory preview only (`extractedRows`,
file name, status message) — it does not touch `state.rows`/localStorage,
so it fires instantly with no `confirmModal` gate (unlike home's `#resetBtn`).

### 홈 대시보드 (`#dashboardView`, `js/pick/dashboard.js`) — now the default landing view

Sidebar order is now 홈(dashboard, default)/집품리스트 현황(old home,
`#homeView`, same id/logic, just relabeled)/집품 할당/집품리스트 추출.
The dashboard has its **own independent dataset** (`dashboardRows`,
localStorage key `pickListDashboardData`) uploaded via `#dashboardUploadBtn`
→ opens `#dashboardUploadModal` → `#dashboardFileSelectBtn` triggers
`#dashboardFileInput` (single-sheet `.xlsx`, no paste alternative). The
sheet is read **positionally** (no header-label matching, unlike home's
`matrixToRows`): column D (index 3) = 생성일시, N (index 13) = 상태값,
J/K/L (index 9/10/11) = quantity at each of 3 stages (total/picked/loaded).
Row 1 is assumed to be a header row and skipped. To seed a test file with
Playwright, build a 14-column-wide `aoa_to_sheet` matrix the same way as
extract.js's test fixtures above, filling only indices 3/9/10/11/13 per row
(other columns can stay empty strings).

Once uploaded, `#dashboardContent` shows 4 KPI cards
(`#dashboardCardPendingValue`/`PickingValue`/`RemainingValue`/`ShippedValue`)
and two Chart.js `doughnut` canvases (`#dashboardPickChart`/`#dashboardLoadChart`,
center-overlay labels `#dashboardPickRemainingLabel`/`#dashboardLoadRemainingLabel`).
For assertions on exact chart data (not just the DOM label text), Chart.js
exposes `Chart.getChart(canvasElement)` — e.g.
`page.evaluate(() => Chart.getChart(document.getElementById('dashboardPickChart')).data.datasets[0].data)`
returns `[remaining, completed]` directly, far more reliable than reading
pixels. A date-tab bar above the cards (`#dashboardDateTabsContainer`,
same single/Ctrl-click multi-select pattern as home's date tabs but a
fully separate implementation scoped to `dashboardRows`) filters the cards
+ donuts only.

**The bottom zone bar-chart card (`#dashboardZoneChart`) is the one place
on this screen that reads the *other*, unrelated dataset** —
it aggregates `state.rows` (집품리스트 현황 data, which already has a 존
column) by exact zone string, not `dashboardRows`, and is unaffected by
the dashboard's own date-tab selection. It renders (and its empty state
`#dashboardZoneEmptyState` toggles) purely based on whether 집품리스트
현황 has any rows at all, independent of whether a dashboard excel has
ever been uploaded.

## Gotchas learned

- If Node is available, `node --input-type=commonjs --check < js/pick/core.js`
  (repeat per file) is a cheap syntax check that matches how a browser parses
  a classic (non-module) `<script>` — plain `node --check file.js` is
  **not** reliable for this: recent Node auto-detects ES module syntax and
  will silently accept a stray `export`/`import` keyword by treating the file
  as a module, which is exactly wrong for how the browser actually loads it.
  Either way, a Playwright load with a `page.on("pageerror", ...)` listener is
  still the real end-to-end check — the syntax check only catches typos, not
  wiring/ordering bugs.
- `state`/`els`/most functions live inside `js/pick/*.js`, attached to
  `window.Pick` (e.g. `window.Pick.state`, `window.Pick.els`) rather than
  each file's own module scope — unlike the old ES-module version, you *can*
  now `page.evaluate(() => window.Pick.state.rows.length)` etc. for quick
  assertions instead of always driving the UI.
- `js/pick/*.js` files reference each other through `window.Pick` and some of
  that is populated lazily (e.g. `Pick.assignFilterBarController`,
  `Pick.homeMarkedIds`) — see the "Gotcha" section in `CLAUDE.md` before
  adding new cross-file bindings that get reassigned after their initial load.
- Always kill the background `http.server` when done (`pkill -f
  "http.server 8934"`) to avoid leaking a stale listener across sessions.
