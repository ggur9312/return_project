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
`state.rows` is the paste-tab-separated-text feature:

1. Fill `#pasteArea` with **tab-separated rows, header row required as the
   first line**, exact Korean labels (must match `COLUMNS` in `js/pick/core.js`):
   `그룹번호  마감일시  생성일시  매입유형  업체명  상태  운송타입  존  수량`
   (zone = 존, quantity = 수량, 생성일시 is used for the date-tab / assign
   date filter — format like `2026-07-11 09:00`).
2. Click `#pasteApplyBtn`.

Omitting the header row silently fails validation (`assignMsg`/`statusMsg`
will say a column/header is missing or no dates found) — always prepend it.

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
