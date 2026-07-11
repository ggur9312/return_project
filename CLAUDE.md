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
js/app.js     -- 집품 현황 screen, wrapped in its own IIFE
js/truck.js   -- 트럭 현황 screen, NOT wrapped — declares directly in global scope
js/shell.js   -- shared cross-screen UI utils, IIFE, exposes window.confirmModal / window.showToast / window.flashPageLoading
```

- **`js/app.js`** (~3800 lines) is a single `(function () { "use strict"; ... })()`. Every function/variable inside is private to that closure — there is no module system, so "where is X defined" always means "grep inside this one IIFE."
- **`js/truck.js`** is *not* wrapped — its top-level `let`/`const`/`function` declarations are real globals. It is a separate, older subsystem for truck loading cycles; it does not share state with `js/app.js` except through `window.confirmModal`/`window.showToast` from `shell.js`.
- **`js/shell.js`** only provides tiny cross-cutting UI helpers (loading overlay, a shared confirm-modal promise wrapper, toast notifications). It has no domain logic.
- `js/vendor/*` are unmodified third-party libraries (Tailwind JIT ~270KB, JsBarcode ~60KB, xlsx ~880KB). **Never grep or read these** — they are not part of this app's logic and reading them wastes a large amount of context for no benefit.

## `js/app.js` structure (the file you'll touch most)

No ES modules — everything is one IIFE, organized top-to-bottom by section comments (`// --- X ---`). Approximate landmarks (grep the exact heading text since the file grows):

| Lines | Section |
|---|---|
| 1–~430 | Column defs (`COLUMNS`, `ASSIGN_DETAIL_COLUMNS`, `ROW_PICKER_COLUMNS`), `state` object, `els` (all `document.getElementById` lookups, grabbed once), localStorage keys/load/save helpers |
| ~430–678 | Home-screen row filtering/dedup/date helpers, zone-sort comparators (`compareZoneAscending`, `compareZoneWithOPriority`) |
| ~559 | `// --- 정렬 ---` — `createSortBarController` factory + home's instantiation |
| ~678 | `// --- 필터 바 컨트롤러 팩토리 ---` — `createFilterBarController` factory + home's instantiation. **Both factories are reused verbatim by the row-picker and the assign-panel screens** — before writing new filter/sort UI, check whether you can just instantiate these instead of hand-rolling HTML |
| ~1101 | 홈 화면 생성일자 탭 |
| ~1161 | 뷰 전환 (홈 / 집품 할당 / 커스텀 할당 / 트럭) |
| ~1187 | 집품 할당(assignConfigs) persistence |
| ~1218–2106 | GT 바코드 매칭/출력, 라벨 인쇄, 스페어 인쇄 |
| ~2125–~3400 | 커스텀 할당 화면 (row-picker: drag-select, filter/sort via the same controller factories) *and* the 집품 할당 결과 화면 (`renderAssignPanel`, `renderAssignDetailTable`, `buildAssignMoveOptionsHtml`, `splitBalanced` — the zone-balancing algorithm) |
| ~3399 | `// --- Event wiring ---` — nearly all `addEventListener` calls live here, at the bottom, after every function is already defined |
| ~3767 | `// --- Init ---` — `*BarController.setup()` calls (must run exactly once), `loadFromStorage()`, `loadSortRules()`, `loadAssignState()`, initial render |

Because function declarations are hoisted, code order inside the IIFE mostly doesn't matter for correctness — but keep new code near its thematic section rather than appending to the end.

## Core state shapes

- `state.rows`: flat array of all uploaded picking rows (`{id, groupNo, deadline, createdAt, purchaseType, company, status, transportType, zone, quantity}`), persisted under `pickListData`.
- `state.assignConfigs`: array of picking-assignment configs, each `{id, floorInput, count, custom, customSeq, workerGroups, createdDates, printedWorkerIdx}`. `workerGroups[i]` is the array of raw rows assigned to worker `i`. `custom: true` configs (created via the row-picker) always have exactly one worker group; regular ones come from the floor+headcount flow (`splitBalanced`).
- Zone strings encode floor + sub-zone with no separator (e.g. `"72A"`, `"72O"` = floor 72, zone O) — `getFloor()`/`isOZone()` parse this. 72/73-floor zones whose name is `"O"` are physically first on the walking route, hence the "O존 우선 정렬" feature threaded through every sort comparator via a `zoneOPriority` boolean argument.
- Filter/sort UI state for a given screen is **not** persisted on the domain objects themselves (deliberately, to avoid saving throwaway UI state into `localStorage` alongside real data) — each screen keeps its own module-level map (e.g. `assignWorkerFilterState`/`assignWorkerSortState` keyed by config id) read through small getter helpers (`getAssignWorkerFilters(cfgId)`, etc.).

## Working with the large `js/app.js` file

The file is large (~3800 lines). Prefer targeted `Grep` for a function/class name to get its line number, then `Read` with `offset`/`limit` around that line, rather than reading the whole file. The section table above should get you within a few hundred lines of anything relevant.
