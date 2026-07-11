# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, no-build, no-framework warehouse operations dashboard ("집품·트럭 현황 대시보드") for a single site (`index.html`) with two independent screens sharing one page: **집품 현황** (picking allocation) and **트럭 현황** (truck/CT cycle management). There is no server, no bundler, no package manager (no `package.json`), no test suite. Data lives entirely in the browser via `localStorage`; there is no backend API.

## Running it

There is no build/lint/test command — open `index.html` directly by double-clicking it (`file://`). This is the primary/expected way users run the app, so any change must keep working under `file://` — do not reintroduce `<script type="module">` for `js/pick/*.js` (browsers block ES module `import` under `file://`, which is exactly the regression this namespace-object setup fixes). You can also serve it locally if you want, for parity with a real deployment:

```bash
python3 -m http.server 8934
# then open http://localhost:8934/index.html
```

To verify a change actually works, drive the app in a real browser (Playwright works well here — the project has no test framework, so this is the only way to check behavior). A project-specific Playwright recipe (how to seed data via the paste box, screen navigation, gotchas like the O-zone-priority button being inside a collapsed panel) is documented in `.claude/skills/verify/SKILL.md` — read that before writing a fresh verification script.

## Script loading and scope model — read this before editing any JS

`index.html` loads scripts in this exact order, and it matters:

```
js/vendor/tailwindcss.browser.js   (Tailwind, browser JIT build)
js/vendor/JsBarcode.all.min.js
js/vendor/xlsx.full.min.js
js/truck.js         -- 트럭 현황 screen, NOT wrapped — declares directly in global scope
js/shell.js         -- shared cross-screen UI utils, IIFE, exposes window.confirmModal / window.showToast / window.flashPageLoading
js/pick/core.js         -- 집품 현황: shared state/utils, must load first
js/pick/gt-print.js     -- 집품 현황: GT barcode/label printing
js/pick/assign-panel.js -- 집품 현황: picking-assignment screen
js/pick/custom-assign.js-- 집품 현황: row-picker (custom assignment) screen
js/pick/home-table.js   -- 집품 현황: home table rendering/selection
js/pick/main.js         -- 집품 현황: event wiring + init, must load last
```

- **`js/pick/*.js`** — the 집품 현황 screen, split into 6 files (originally one ~3800-line `js/app.js`; split for editing/reading ergonomics, see next section). **Not ES modules** — each file is a plain classic `<script>`, wrapped in its own IIFE `(function (Pick) { ... })(window.Pick = window.Pick || {})`, and files talk to each other only through the shared `window.Pick` namespace object (`Pick.foo = foo;` to expose, `var foo = Pick.foo;` to consume). This used to be `<script type="module">` with real `import`/`export`, but browsers block ES module `import` under `file://` (CORS), which broke the app for anyone who just double-clicks `index.html` instead of serving it over `http://`. Classic scripts have no such restriction, so the namespace-object pattern was adopted instead — it keeps the same 6-file split (and its token-savings benefit for editing) without requiring a server.
- Load order in `index.html` matters and mirrors the table above: `core.js` first (everyone depends on it), `main.js` last (it wires up events and runs init, which needs every other file's exports already on `Pick`) — placed *after* `js/truck.js`/`js/shell.js` so `window.confirmModal`/`window.showToast` are guaranteed to exist first.
- **`js/truck.js`** is *not* wrapped — its top-level `let`/`const`/`function` declarations are real globals. It is a separate, older subsystem for truck loading cycles; it does not share state with `js/pick/*` except through `window.confirmModal`/`window.showToast` from `shell.js`. Because `js/pick/*.js` are each IIFE-wrapped, their internals never leak into `truck.js`'s global scope — only `window.Pick` itself is shared, so double-check any new top-level name in `js/pick/*.js` doesn't collide with something `truck.js` already declares globally (there is no automated check for this — grep `js/truck.js` for the name).
- **`js/shell.js`** only provides tiny cross-cutting UI helpers (loading overlay, a shared confirm-modal promise wrapper, toast notifications). It has no domain logic.
- `js/vendor/*` are unmodified third-party libraries (Tailwind JIT ~270KB, JsBarcode ~60KB, xlsx ~880KB). **Never grep or read these** — they are not part of this app's logic and reading them wastes a large amount of context for no benefit.

## `js/pick/*.js` structure (the files you'll touch most)

One file per domain, connected via `window.Pick` (see previous section). Grep the symbol name to find which file owns it rather than guessing from this table — it's a map, not gospel:

| File | ~Lines | Owns |
|---|---|---|
| `core.js` | 1250 | `COLUMNS`/`ALL_COLUMNS`, `state`, `els` (every `document.getElementById`, grabbed once), all localStorage keys + load/save helpers, generic utils (`escapeHtml`, `debounce`, `parseFlexibleDate`, `filterRowsExceptKey`...), zone-sort comparators (`compareZoneAscending`, `compareZoneWithOPriority`), `createSortBarController`/`createFilterBarController` factories + home's own instantiation (`homeSortBarController`/`homeFilterBarController`), home's filtering/sorting engine, floor panel, date tabs, `switchView`, `assignConfigs` save/load |
| `gt-print.js` | 630 | GT 바코드 관리/매칭, 라벨 출력 (barcode HTML, print modals), 스페어(여분) 출력 |
| `assign-panel.js` | 900 | 집품 할당 전체: `splitBalanced`/`rebalanceContiguousGroups` (the zone-balancing algorithm), `ASSIGN_DETAIL_COLUMNS`, `renderAssignPanel`/`renderAssignDetailTable`, the assign screen's own filter/sort controllers (`assignFilterBarController`/`assignSortBarController`, built lazily — see gotcha below), create/confirm/delete-config flow |
| `custom-assign.js` | 510 | 커스텀 할당 (row-picker) screen: drag-select, its own filter/sort controllers, `createCustomAssignment`, `confirmRowPicker` |
| `home-table.js` | 195 | Home table rendering + home's own drag-select/Ctrl-click multi-select |
| `main.js` | 390 | `refreshAll()` (re-renders whichever screen is visible) + **every** `addEventListener` call + the init sequence at the bottom (`loadFromStorage()`, `loadSortRules()`, `loadAssignState()`, `loadGtState()`, first render). This is the last `<script>` loaded, once every other `js/pick/*.js` file has already populated `Pick`. |

**Both `createSortBarController`/`createFilterBarController` factories (in `core.js`) are reused verbatim by home, row-picker, and the assign panel** — before writing new filter/sort UI, check whether you can just instantiate these instead of hand-rolling HTML.

### Gotcha: `window.Pick` and reassigned bindings

Each file is `(function (Pick) { ... })(window.Pick = window.Pick || {})`. Anything meant to be used by another file must be assigned onto `Pick` (`Pick.foo = foo;`, usually grouped in an "exports" block at the bottom of the file); anything consumed from another file is read once via `var foo = Pick.foo;` near the top. `function` declarations and simple one-time `var` initializations (`state`, `els`, most constants/helpers) are safe with this "read once" pattern, because the underlying object/function reference never changes even if its *contents* are mutated later (e.g. `state.rows = ...`).

**The one thing this breaks: a binding that gets reassigned (`x = newValue`, not `x.prop = newValue`) after another file already read it.** A plain `var foo = Pick.foo;` only copies the value at that moment — it does **not** stay in sync with later reassignments the way an ES module's live `import` binding would. The current reassigned cross-file bindings, and how each is kept in sync:
- `assignFilterBarController` (`assign-panel.js`, read by `main.js`) and `rowPickerFilterBarController` (`custom-assign.js`, read by `main.js`): built lazily inside `initAssignPanelControllers()`/`initRowPickerControllers()`, called from `main.js`'s init sequence. The assignment site does `Pick.assignFilterBarController = assignFilterBarController = createFilterBarController(...)` (writes both the local var and `Pick` in one line), and `main.js` always reads `Pick.assignFilterBarController`/`Pick.rowPickerFilterBarController` directly rather than destructuring it at the top of the file.
- `homeMarkedIds` (`home-table.js`, read by `main.js`): reassigned in several places (`resetHomeMarkedIds()`, drag-select range application, `clearHomeSelection()`) — every reassignment site syncs `Pick.homeMarkedIds` in the same statement, and `main.js` reads `Pick.homeMarkedIds` directly instead of destructuring it.

If you add a new cross-file binding that gets reassigned (not just mutated), follow the same pattern: sync `Pick.name` at every reassignment site in the owning file, and never destructure that name in a consuming file — always read `Pick.name` fresh.

Because function declarations are hoisted, code order *within* a single file mostly doesn't matter for correctness — but keep new code near its thematic section (and in the file that owns the state it touches) rather than appending to the end.

## Core state shapes

- `state.rows`: flat array of all uploaded picking rows (`{id, groupNo, deadline, createdAt, purchaseType, company, status, transportType, zone, quantity}`), persisted under `pickListData`.
- `state.assignConfigs`: array of picking-assignment configs, each `{id, floorInput, count, custom, customSeq, workerGroups, createdDates, printedWorkerIdx}`. `workerGroups[i]` is the array of raw rows assigned to worker `i`. `custom: true` configs (created via the row-picker) always have exactly one worker group; regular ones come from the floor+headcount flow (`splitBalanced`).
- Zone strings encode floor + sub-zone with no separator (e.g. `"72A"`, `"72O"` = floor 72, zone O) — `getFloor()`/`isOZone()` parse this. 72/73-floor zones whose name is `"O"` are physically first on the walking route, hence the "O존 우선 정렬" feature threaded through every sort comparator via a `zoneOPriority` boolean argument.
- Filter/sort UI state for a given screen is **not** persisted on the domain objects themselves (deliberately, to avoid saving throwaway UI state into `localStorage` alongside real data) — each screen keeps its own module-level map (e.g. `assignWorkerFilterState`/`assignWorkerSortState` keyed by config id) read through small getter helpers (`getAssignWorkerFilters(cfgId)`, etc.).

## Working with `js/pick/*.js`

Grep for the symbol name across `js/pick/` to find which file owns it (the table above tells you roughly what's where, but confirm with grep before editing — files grow). Each file is small enough (200–1250 lines) to `Read` in full once you know which one you need.
