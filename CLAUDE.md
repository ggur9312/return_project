# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, no-build, no-framework warehouse operations dashboard ("집품·트럭 현황 대시보드") for a single site (`index.html`) with two independent screens sharing one page: **집품 현황** (picking allocation) and **트럭 현황** (truck/CT cycle management). There is no server, no bundler, no package manager (no `package.json`), no test suite. Data lives entirely in the browser via `localStorage`; there is no backend API.

## Running it

There is no build/lint/test command — open `index.html` directly, or serve it locally to avoid `file://` quirks:

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
js/pick/main.js     -- 집품 현황 screen entry point, loaded as <script type="module">
```

- **`js/pick/*.js`** — the 집품 현황 screen, split into 6 ES modules (originally one ~3800-line `js/app.js`; split for editing/reading ergonomics, see next section). Loaded via `<script type="module" src="js/pick/main.js">`, which pulls in the other 5 files via `import`. Being a module, it's deferred (runs after HTML parsing) and placed *after* `js/truck.js`/`js/shell.js` in `index.html` specifically so `window.confirmModal`/`window.showToast` are guaranteed to exist first.
- **`js/truck.js`** is *not* wrapped — its top-level `let`/`const`/`function` declarations are real globals. It is a separate, older subsystem for truck loading cycles; it does not share state with `js/pick/*` except through `window.confirmModal`/`window.showToast` from `shell.js`.
- **`js/shell.js`** only provides tiny cross-cutting UI helpers (loading overlay, a shared confirm-modal promise wrapper, toast notifications). It has no domain logic.
- `js/vendor/*` are unmodified third-party libraries (Tailwind JIT ~270KB, JsBarcode ~60KB, xlsx ~880KB). **Never grep or read these** — they are not part of this app's logic and reading them wastes a large amount of context for no benefit.

## `js/pick/*.js` structure (the files you'll touch most)

Real ES modules (`import`/`export`), one file per domain. Grep the symbol name to find which file owns it rather than guessing from this table — it's a map, not gospel:

| File | ~Lines | Owns |
|---|---|---|
| `core.js` | 1250 | `COLUMNS`/`ALL_COLUMNS`, `state`, `els` (every `document.getElementById`, grabbed once), all localStorage keys + load/save helpers, generic utils (`escapeHtml`, `debounce`, `parseFlexibleDate`, `filterRowsExceptKey`...), zone-sort comparators (`compareZoneAscending`, `compareZoneWithOPriority`), `createSortBarController`/`createFilterBarController` factories + home's own instantiation (`homeSortBarController`/`homeFilterBarController`), home's filtering/sorting engine, floor panel, date tabs, `switchView`, `assignConfigs` save/load |
| `gt-print.js` | 630 | GT 바코드 관리/매칭, 라벨 출력 (barcode HTML, print modals), 스페어(여분) 출력 |
| `assign-panel.js` | 900 | 집품 할당 전체: `splitBalanced`/`rebalanceContiguousGroups` (the zone-balancing algorithm), `ASSIGN_DETAIL_COLUMNS`, `renderAssignPanel`/`renderAssignDetailTable`, the assign screen's own filter/sort controllers (`assignFilterBarController`/`assignSortBarController`, built lazily — see gotcha below), create/confirm/delete-config flow |
| `custom-assign.js` | 510 | 커스텀 할당 (row-picker) screen: drag-select, its own filter/sort controllers, `createCustomAssignment`, `confirmRowPicker` |
| `home-table.js` | 195 | Home table rendering + home's own drag-select/Ctrl-click multi-select |
| `main.js` | 390 | `refreshAll()` (re-renders whichever screen is visible) + **every** `addEventListener` call + the init sequence at the bottom (`loadFromStorage()`, `loadSortRules()`, `loadAssignState()`, `loadGtState()`, first render). This is the `<script type="module">` entry point. |

**Both `createSortBarController`/`createFilterBarController` factories (in `core.js`) are reused verbatim by home, row-picker, and the assign panel** — before writing new filter/sort UI, check whether you can just instantiate these instead of hand-rolling HTML.

### Gotcha: circular imports and `els`/`state`

`core.js` and several other files import from each other in both directions (e.g. `core.js` imports `refreshAll` from `main.js`; `custom-assign.js` and `assign-panel.js` both import `els`/`state` from `core.js`, while `core.js` imports helpers back from them). This is fine for `function` declarations (hoisted — always safe to call later, even mid-cycle) but **not** for reading a `var`-initialized object like `els`/`state` at a file's own top level, because the exporting module (`core.js`) may not have reached that assignment yet when the importing module's top-level code runs.

Two consequences to keep in mind:
- **Never reassign an imported binding directly.** ES module imports are read-only live views. If file A needs to mutate a piece of state that file B owns, add a setter/action function in B and call that from A — see `resetHomeMarkedIds()` (`home-table.js`), `nextCustomAssignSeq()` (`core.js`), `deleteAllRowPickerSelected()`/`moveMarkedRowsToSelected()`/`enableRowPickerZoneOPriority()` (`custom-assign.js`), `cancelSparePrintModal()`/`confirmSparePrintModal()` (`gt-print.js`) for the existing pattern.
- **Don't read `els`/`state` (or call anything that touches them) at a *non-entry* module's top level.** `assignFilterBarController`/`assignSortBarController` (`assign-panel.js`) and `rowPickerFilterBarController`/`rowPickerSortBarController` (`custom-assign.js`) are declared as bare `export var X;` and only actually constructed inside an exported `initAssignPanelControllers()` / `initRowPickerControllers()` function, called explicitly from `main.js`'s init sequence — because `main.js` is the `<script type="module">` entry point, its own top-level code (including the init sequence) is guaranteed to run only after every other module has finished evaluating, so `els`/`state` are safe to use there. `main.js`'s huge top-level block of `els.foo.addEventListener(...)` calls relies on this same guarantee — don't move that logic into a non-entry file without applying the same deferred-init pattern.

Because function declarations are hoisted, code order *within* a single file mostly doesn't matter for correctness — but keep new code near its thematic section (and in the file that owns the state it touches) rather than appending to the end.

## Core state shapes

- `state.rows`: flat array of all uploaded picking rows (`{id, groupNo, deadline, createdAt, purchaseType, company, status, transportType, zone, quantity}`), persisted under `pickListData`.
- `state.assignConfigs`: array of picking-assignment configs, each `{id, floorInput, count, custom, customSeq, workerGroups, createdDates, printedWorkerIdx}`. `workerGroups[i]` is the array of raw rows assigned to worker `i`. `custom: true` configs (created via the row-picker) always have exactly one worker group; regular ones come from the floor+headcount flow (`splitBalanced`).
- Zone strings encode floor + sub-zone with no separator (e.g. `"72A"`, `"72O"` = floor 72, zone O) — `getFloor()`/`isOZone()` parse this. 72/73-floor zones whose name is `"O"` are physically first on the walking route, hence the "O존 우선 정렬" feature threaded through every sort comparator via a `zoneOPriority` boolean argument.
- Filter/sort UI state for a given screen is **not** persisted on the domain objects themselves (deliberately, to avoid saving throwaway UI state into `localStorage` alongside real data) — each screen keeps its own module-level map (e.g. `assignWorkerFilterState`/`assignWorkerSortState` keyed by config id) read through small getter helpers (`getAssignWorkerFilters(cfgId)`, etc.).

## Working with `js/pick/*.js`

Grep for the symbol name across `js/pick/` to find which file owns it (the table above tells you roughly what's where, but confirm with grep before editing — files grow). Each file is small enough (200–1250 lines) to `Read` in full once you know which one you need.
