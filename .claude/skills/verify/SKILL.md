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
  home's `#sortZoneOPriorityBtn` and row-picker's `#rowPickerSortZoneOPriorityBtn`
  — three independent flags, one per screen, all non-persisted).
- Worker cards: `#assignTableContainer > div.space-y-8 > div` (bg-white,
  rounded-2xl, shadow-md — the extra gap/shadow and the `bg-indigo-50/70`
  card-header tint exist specifically so 2+ cards in "전체" view read as
  separate blocks instead of blending together). Filter/sort candidate
  values are scoped to whichever workers currently pass the "작업자" virtual
  filter — see `getAssignPanelCandidateValues` in `js/pick/assign-panel.js`
  if a test needs exact candidate-list behavior.

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
