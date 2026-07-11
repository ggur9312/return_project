import { flattenWorkerGroup, renderAssignTabs, splitBalanced } from "./assign-panel.js";
import { ROW_PICKER_COLUMNS, compareValues, createFilterBarController, createSortBarController, els, escapeHtml, filterRowsExceptKey, getCandidateValues, getCreatedDate, insertRowsSortedByZone, nextCustomAssignSeq, saveAssignState, state, switchView, uniqueValuesFrom } from "./core.js";
import { formatDateDisplay } from "./gt-print.js";

  // --- 커스텀 할당 화면: 커스텀 할당 생성 / 기존 작업자에 행 추가 (전용 페이지) ---
  export var rowPickerMode = null; // "create" | "append"
  export var rowPickerTargetCfgId = null;
  export var rowPickerTargetWorkerIdx = null;
  export var rowPickerReturnView = "home"; // 취소/닫기 시 돌아갈 화면 — "home" | "assign"
  export var rowPickerSelectedRows = []; // 확정 전까지 state에 반영되지 않는 임시 선택 목록
  // "사용 가능한 행"에서 드래그로 범위 선택된(하지만 아직 옮기지 않은) 행 id 집합
  export var rowPickerMarkedIds = new Set();
  export var rowPickerDragAnchorId = null; // 드래그 셀렉트 시작 행 id(mousedown 시점)
  export var rowPickerDragSelecting = false;
  export var rowPickerDragAdditive = false; // true = Ctrl/Cmd+드래그 (기존 선택에 합침/뺌)
  export var rowPickerDragAdditiveMode = "add"; // "add" | "remove" — 드래그 시작 행이 이미 선택돼 있었는지로 결정
  export var rowPickerDragBaseIds = null; // 드래그 시작 전 선택 스냅샷(추가모드 기준값)
  export var rowPickerAutoScrollRAF = null;
  export var rowPickerLastMouseY = 0;
  // 홈 화면의 state.filters/state.sortRules와는 독립적인, 이 화면 전용 필터/정렬 상태
  export var rowPickerFilters = {};
  export var rowPickerSortRules = [];
  // 홈의 state.zoneOPriority와 별개인 이 화면 전용 O존 우선 플래그 — 홈처럼 저장하지
  // 않고 기존대로 1회성(적용 직후 되돌림)으로 유지한다.
  export var rowPickerZoneOPriority = false;

  // 이미 어떤 assignConfig에도 배정된 행의 id 집합 — 중복 배정 방지용
  export function getAssignedRowIdSet() {
    var ids = new Set();
    state.assignConfigs.forEach(function (cfg) {
      // cfg.workerGroups가 아직 없는(한 번도 결과 화면을 렌더링하지 않은) config도
      // 놓치지 않도록 renderAssignPanel과 동일한 폴백을 사용
      var groups = cfg.workerGroups || splitBalanced(cfg.items || [], cfg.count);
      groups.forEach(function (group) {
        flattenWorkerGroup(group).forEach(function (r) { if (r && r.id) ids.add(r.id); });
      });
    });
    return ids;
  }

  // 이미 배정/선택된 행 제외까지만 적용한, 컬럼 필터 이전 범위 —
  // 필터 드롭다운의 후보값(getRowPickerCandidateValues)도 이 범위를 기준으로 계산
  export function getRowPickerScopedRows() {
    // 이미 다른 assignConfig에 배정된 행은 목록에서 완전히 숨기지 않고 남겨둔 뒤
    // buildRowPickerTable에서 "이미 할당됨" 표시로 구분한다(선택된 행 후보에서만 제외).
    var selectedIds = new Set(rowPickerSelectedRows.map(function (r) { return r.id; }));
    return state.rows.filter(function (r) { return !selectedIds.has(r.id); });
  }

  // key 자신의 필터를 뺀 나머지 필터를 반영해 후보값을 계산 — 엑셀 자동필터처럼
  // 다른 컬럼에 필터가 걸려 있으면 이 컬럼 드롭다운도 그만큼 좁혀진다.
  export function getRowPickerCandidateValues(key) {
    var rows = filterRowsExceptKey(getRowPickerScopedRows(), ROW_PICKER_COLUMNS, rowPickerFilters, key);
    var values = uniqueValuesFrom(rows, function (r) { return r[key]; });
    var col = ROW_PICKER_COLUMNS.find(function (c) { return c.key === key; });
    if (col && col.type === "number") {
      values.sort(function (a, b) { return parseFloat(a) - parseFloat(b); });
    }
    return values;
  }

  export function computeRowPickerFilteredRows(baseRows) {
    return filterRowsExceptKey(baseRows, ROW_PICKER_COLUMNS, rowPickerFilters);
  }

  export function getRowPickerSortedRows(rows) {
    var activeRules = rowPickerSortRules
      .map(function (rule) { return { col: ROW_PICKER_COLUMNS.find(function (c) { return c.key === rule.key; }), dir: rule.dir }; })
      .filter(function (r) { return r.col; });
    if (!activeRules.length) return rows;
    var copy = rows.slice();
    copy.sort(function (a, b) {
      for (var i = 0; i < activeRules.length; i++) {
        var diff = compareValues(a, b, activeRules[i].col, rowPickerZoneOPriority) * activeRules[i].dir;
        if (diff !== 0) return diff;
      }
      return 0;
    });
    return copy;
  }

  export function getRowPickerAvailableRows() {
    return getRowPickerSortedRows(computeRowPickerFilteredRows(getRowPickerScopedRows()));
  }

  // els/state는 core.js가 소유하는데, ES 모듈 순환참조(core.js <-> custom-assign.js)
  // 때문에 이 파일의 최상위 코드가 core.js의 최상위 코드보다 먼저 실행될 수 있어
  // (그 시점엔 core.js의 els가 아직 초기화 전) 컨트롤러 생성을 함수로 미뤄 main.js의
  // 초기화 단계(모든 모듈이 로드된 뒤)에서 명시적으로 호출하도록 한다.
  export var rowPickerFilterBarController;
  export var rowPickerSortBarController;

  export function initRowPickerControllers() {
    rowPickerFilterBarController = createFilterBarController({
      columns: ROW_PICKER_COLUMNS,
      containerEl: els.rowPickerFilterButtonsContainer,
      resetBtn: els.rowPickerFilterResetAllBtn,
      getFilters: function () { return rowPickerFilters; },
      setFilter: function (key, value) { rowPickerFilters[key] = value; },
      getCandidateValues: getRowPickerCandidateValues,
      onApply: function () { renderRowPickerAvailableList(); }
    });

    rowPickerSortBarController = createSortBarController({
      columns: ROW_PICKER_COLUMNS,
      containerEl: els.rowPickerSortRulesContainer,
      addBtn: els.rowPickerSortAddBtn,
      resetBtn: els.rowPickerSortResetBtn,
      getSortRules: function () { return rowPickerSortRules; },
      setSortRules: function (rules) { rowPickerSortRules = rules; },
      // 홈의 "정렬 초기화"가 O존 우선 정렬도 함께 끄는 것과 동일한 동작.
      onResetExtra: function () { rowPickerZoneOPriority = false; },
      onApply: function () { renderRowPickerAvailableList(); }
    });
  }

  export function buildRowPickerTable(rows, btnClass, btnLabel, btnClickAttr, draggableSelect, assignedIds) {
    if (!rows.length) {
      return '<div class="px-4 py-6 text-center text-xs text-slate-400">해당하는 행이 없습니다.</div>';
    }
    var bodyHtml = rows.map(function (r, i) {
      var marked = draggableSelect && rowPickerMarkedIds.has(r.id);
      var alreadyAssigned = !!(assignedIds && assignedIds.has(r.id));
      // 이미 다른 곳에 할당된 행이라도 여기서 다시 선택/드래그할 수 있어야 하므로
      // (확정 시 홈처럼 확인모달로 중복 여부를 다시 물어봄) 상호작용을 막지 않고
      // "이미 할당됨" 배지 + 색상 표시로만 구분한다.
      var rowClasses = "row-picker-row border-b border-slate-100 last:border-b-0 transition-colors" +
        (alreadyAssigned ? " bg-amber-50/70" : "") +
        (draggableSelect ? " cursor-move select-none hover:bg-slate-50/80" : " hover:bg-slate-50/80") +
        (marked ? " bg-indigo-50" : "");
      var badge = alreadyAssigned ? ' <span class="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100 align-middle">이미 할당됨</span>' : "";
      return (
        '<tr class="' + rowClasses + '"' +
        ' data-row-id="' + escapeHtml(r.id) + '">' +
        '<td class="px-3 py-1.5 text-center text-slate-400">' + (i + 1) + "</td>" +
        '<td class="px-3 py-1.5 font-semibold text-slate-900 whitespace-nowrap">' + escapeHtml(r.groupNo) + badge + "</td>" +
        '<td class="px-3 py-1.5 text-slate-700 whitespace-nowrap">' + escapeHtml(formatDateDisplay(r.deadline)) + "</td>" +
        '<td class="px-3 py-1.5 text-slate-700 whitespace-nowrap">' + escapeHtml(getCreatedDate(r)) + "</td>" +
        '<td class="px-3 py-1.5 text-slate-700 whitespace-nowrap">' + escapeHtml(r.company) + "</td>" +
        '<td class="px-3 py-1.5 text-slate-700 whitespace-nowrap">' + escapeHtml(r.transportType) + "</td>" +
        '<td class="px-3 py-1.5 text-slate-700 whitespace-nowrap">' + escapeHtml(r.zone) + "</td>" +
        '<td class="px-3 py-1.5 text-right tabular-nums text-slate-700">' + Number(r.quantity || 0).toLocaleString("ko-KR") + "</td>" +
        '<td class="px-3 py-1.5 text-right"><button type="button" class="' + btnClass + ' ' + btnClickAttr + ' text-xs font-medium px-2.5 py-1 rounded-md transition-colors" data-row-id="' + escapeHtml(r.id) + '">' + btnLabel + "</button></td>" +
        "</tr>"
      );
    }).join("");
    return (
      '<table class="w-full text-xs border-collapse">' +
      '<thead><tr class="bg-slate-50 text-slate-500 font-bold text-left sticky top-0">' +
      '<th class="px-3 py-1.5 text-center w-10">번호</th><th class="px-3 py-1.5">그룹번호</th><th class="px-3 py-1.5">마감일시</th><th class="px-3 py-1.5">생성일자</th><th class="px-3 py-1.5">업체명</th><th class="px-3 py-1.5">운송타입</th><th class="px-3 py-1.5">존</th><th class="px-3 py-1.5 text-right">수량</th><th class="px-3 py-1.5"></th>' +
      "</tr></thead><tbody>" + bodyHtml + "</tbody></table>"
    );
  }

  export function renderRowPickerAvailableList() {
    rowPickerFilterBarController.updateButtonStates();
    rowPickerSortBarController.render();
    els.rowPickerAvailableList.innerHTML = buildRowPickerTable(getRowPickerAvailableRows(), "row-picker-add-btn bg-indigo-600 hover:bg-indigo-700 text-white", "추가", "", true, getAssignedRowIdSet());
    Array.prototype.forEach.call(els.rowPickerAvailableList.querySelectorAll(".row-picker-add-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var row = state.rows.find(function (r) { return r.id === btn.dataset.rowId; });
        if (!row) return;
        rowPickerMarkedIds.delete(row.id);
        rowPickerSelectedRows.push(row);
        renderRowPickerAvailableList();
        renderRowPickerSelectedList();
      });
    });
  }

  export function renderRowPickerSelectedList() {
    els.rowPickerSelectedCount.textContent = rowPickerSelectedRows.length;
    var selectedQty = rowPickerSelectedRows.reduce(function (sum, r) { return sum + (r.quantity || 0); }, 0);
    els.rowPickerSelectedQty.textContent = selectedQty.toLocaleString("ko-KR");
    els.rowPickerSelectedList.innerHTML = buildRowPickerTable(rowPickerSelectedRows, "row-picker-remove-btn bg-rose-50 hover:bg-rose-100 text-rose-600", "삭제", "");
    Array.prototype.forEach.call(els.rowPickerSelectedList.querySelectorAll(".row-picker-remove-btn"), function (btn) {
      btn.addEventListener("click", function () {
        rowPickerSelectedRows = rowPickerSelectedRows.filter(function (r) { return r.id !== btn.dataset.rowId; });
        renderRowPickerAvailableList();
        renderRowPickerSelectedList();
      });
    });
  }

  // "사용 가능한 행" 목록에서 드래그로 여러 행을 한 번에 마킹(범위 선택)하고,
  // 그중 하나를 "선택된 행" 영역으로 드래그앤드롭하면 마킹된 행 전부가 옮겨감.
  // 컨테이너 자체(<div id="rowPickerAvailableList">)는 재렌더링 때마다 내용만
  // 바뀌므로, 이벤트 위임(delegation)으로 한 번만 등록하면 매번 다시 걸 필요가 없다.
  export function getRowIndexInRows(rows, id) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === id) return i;
    }
    return -1;
  }

  export function applyRowPickerMarkRange(anchorId, currentId) {
    var rows = getRowPickerAvailableRows();
    var anchorIdx = getRowIndexInRows(rows, anchorId);
    var currentIdx = getRowIndexInRows(rows, currentId);
    if (anchorIdx === -1 || currentIdx === -1) return;
    var lo = Math.min(anchorIdx, currentIdx);
    var hi = Math.max(anchorIdx, currentIdx);
    var rangeIds = [];
    for (var i = lo; i <= hi; i++) rangeIds.push(rows[i].id);

    if (rowPickerDragAdditive && rowPickerDragBaseIds) {
      rowPickerMarkedIds = new Set(rowPickerDragBaseIds);
      rangeIds.forEach(function (id) {
        if (rowPickerDragAdditiveMode === "remove") rowPickerMarkedIds.delete(id);
        else rowPickerMarkedIds.add(id);
      });
    } else {
      rowPickerMarkedIds = new Set(rangeIds);
    }

    Array.prototype.forEach.call(els.rowPickerAvailableList.querySelectorAll(".row-picker-row"), function (tr) {
      var marked = rowPickerMarkedIds.has(tr.dataset.rowId);
      tr.classList.toggle("bg-indigo-50", marked);
      tr.classList.toggle("opacity-70", marked && rowPickerDragSelecting);
    });
    updateRowPickerDragGhost();
    updateRowPickerSelectionSummary();
  }

  // 홈 화면의 선택바(#homeSelectionBar)와 동일한 패턴 — 드래그가 끝난 뒤에도
  // 마킹이 남아있는 동안(마우스를 뗀 뒤) 몇 행 · 몇 개를 선택했는지 계속 보여주고,
  // 여기서 바로 "선택된 행" 목록으로 옮길 수 있게 한다.
  export function updateRowPickerSelectionSummary() {
    if (!rowPickerMarkedIds.size) {
      els.rowPickerSelectionBar.classList.add("hidden");
      return;
    }
    var qty = 0;
    rowPickerMarkedIds.forEach(function (id) {
      var row = state.rows.find(function (r) { return r.id === id; });
      if (row) qty += row.quantity || 0;
    });
    els.rowPickerSelectionSummary.textContent = "선택 " + rowPickerMarkedIds.size.toLocaleString("ko-KR") + "행 · " + qty.toLocaleString("ko-KR") + "개";
    els.rowPickerSelectionBar.classList.remove("hidden");
  }

  export function clearRowPickerMarks() {
    rowPickerMarkedIds = new Set();
    Array.prototype.forEach.call(els.rowPickerAvailableList.querySelectorAll(".row-picker-row"), function (tr) {
      tr.classList.remove("bg-indigo-50", "opacity-70");
    });
    updateRowPickerSelectionSummary();
  }

  // 커스텀 할당 화면(row-picker)의 마킹/선택/필터/정렬/O존우선 상태를 전부 초기값으로
  // 되돌린다. switchView()가 "custom" 화면을 벗어날 때(선택이 다른 화면까지 유지되면
  // 안 되므로), 그리고 openCustomAssignView()가 화면에 새로 진입할 때 공통으로 쓴다.
  // #rowPickerSelectionBar는 customAssignView 안이 아니라 DOM상 별도의 fixed
  // 엘리먼트라 화면 전환만으로는 가려지지 않으므로 여기서 직접 숨긴다.
  export function clearRowPickerState() {
    rowPickerMarkedIds = new Set();
    rowPickerSelectedRows = [];
    rowPickerFilters = {};
    rowPickerSortRules = [{ key: "zone", dir: 1 }];
    rowPickerZoneOPriority = false;
    els.rowPickerSelectionBar.classList.add("hidden");
  }

  // 드래그 중임을 알기 쉽게 커서를 따라다니며 이동 건수 + 수량 합계를 보여주는 배지
  export function updateRowPickerDragGhost() {
    if (!rowPickerDragSelecting || !rowPickerMarkedIds.size) {
      els.rowPickerDragGhost.classList.add("hidden");
      return;
    }
    var qty = 0;
    rowPickerMarkedIds.forEach(function (id) {
      var row = state.rows.find(function (r) { return r.id === id; });
      if (row) qty += row.quantity || 0;
    });
    els.rowPickerDragGhost.textContent = rowPickerMarkedIds.size + "행 이동 중 · " + qty.toLocaleString("ko-KR") + "개";
    els.rowPickerDragGhost.classList.remove("hidden");
  }

  export function positionRowPickerDragGhost(clientX, clientY) {
    els.rowPickerDragGhost.style.left = (clientX + 14) + "px";
    els.rowPickerDragGhost.style.top = (clientY + 14) + "px";
  }

  export function clearRowPickerDragVisuals() {
    els.rowPickerDragGhost.classList.add("hidden");
    Array.prototype.forEach.call(els.rowPickerAvailableList.querySelectorAll(".row-picker-row"), function (tr) {
      tr.classList.remove("opacity-70");
    });
  }

  // 네이티브 HTML5 드래그(draggable/dragstart 등)는 커스텀 mousedown 범위선택과
  // 이벤트가 충돌해(mousedown에서 preventDefault하면 브라우저가 드래그 자체를
  // 시작하지 못함) 순수 mouse 이벤트만으로 "범위 선택 + 드롭까지" 한 번의
  // 제스처로 처리한다: mousedown(시작) → mousemove(같은 목록 안이면 범위 갱신,
  // "선택된 행" 위로 올라가면 드롭 표시) → mouseup("선택된 행" 위에서 떼면 이동).
  // 드래그 중 마킹된 행이 화면 밖에 있어도 마우스를 뷰포트 위/아래 가장자리
  // 근처로 가져가면 페이지 자체가 자동으로 스크롤되도록 함(전용 페이지로 바뀌면서
  // 스크롤 영역이 하나뿐이라 윈도우 스크롤만 다루면 됨).
  export var ROW_PICKER_AUTOSCROLL_EDGE = 30;
  export var ROW_PICKER_AUTOSCROLL_SPEED = 12;

  export function rowPickerAutoScrollTick() {
    if (!rowPickerDragSelecting) {
      rowPickerAutoScrollRAF = null;
      return;
    }
    if (rowPickerLastMouseY < ROW_PICKER_AUTOSCROLL_EDGE) {
      window.scrollBy(0, -ROW_PICKER_AUTOSCROLL_SPEED);
    } else if (rowPickerLastMouseY > window.innerHeight - ROW_PICKER_AUTOSCROLL_EDGE) {
      window.scrollBy(0, ROW_PICKER_AUTOSCROLL_SPEED);
    }
    rowPickerAutoScrollRAF = requestAnimationFrame(rowPickerAutoScrollTick);
  }

  export function startRowPickerAutoScroll() {
    if (rowPickerAutoScrollRAF === null) {
      rowPickerAutoScrollRAF = requestAnimationFrame(rowPickerAutoScrollTick);
    }
  }

  export function setupRowPickerDragAndDrop() {
    els.rowPickerAvailableList.addEventListener("mousedown", function (e) {
      if (e.target.closest("button")) return;
      var tr = e.target.closest(".row-picker-row");
      if (!tr) return;
      e.preventDefault();
      var id = tr.dataset.rowId;

      // Ctrl/Cmd+클릭(드래그 없이 뗌): 이 행 하나만 마킹 토글.
      // Ctrl/Cmd+드래그: 시작 행이 이미 선택돼 있었으면 드래그로 스치는 범위를
      // 기존 선택에서 빼고, 아니었으면 더한다(합집합/차집합) — 비연속 다중선택 유지.
      if (e.ctrlKey || e.metaKey) {
        rowPickerDragSelecting = true;
        rowPickerDragAdditive = true;
        rowPickerDragAdditiveMode = rowPickerMarkedIds.has(id) ? "remove" : "add";
        rowPickerDragBaseIds = new Set(rowPickerMarkedIds);
        rowPickerDragAnchorId = id;
        applyRowPickerMarkRange(id, id);
        updateRowPickerDragGhost();
        positionRowPickerDragGhost(e.clientX, e.clientY);
        rowPickerLastMouseY = e.clientY;
        startRowPickerAutoScroll();
        return;
      }

      rowPickerDragSelecting = true;
      rowPickerDragAdditive = false;
      rowPickerDragBaseIds = null;
      // 이미 여러 행이 마킹된 상태에서 그중 한 행을 다시 누르면(이동 준비) 기존
      // 마킹을 그대로 두지만, 마킹돼 있지 않은 새 행을 누르면 그건 새로운 드래그
      // 선택을 시작하려는 의도이므로 기존 마킹을 지우고 새로 앵커를 잡는다 —
      // 이전엔 rowPickerMarkedIds.size > 1이기만 하면 무조건 앵커를 비워, O존 우선
      // 정렬로 여러 행을 마킹한 뒤 다른 존에서 새로 드래그해도 마킹이 그대로 굳어버렸다.
      if (rowPickerMarkedIds.size > 1 && rowPickerMarkedIds.has(id)) {
        rowPickerDragAnchorId = null;
        Array.prototype.forEach.call(els.rowPickerAvailableList.querySelectorAll(".row-picker-row"), function (rowEl) {
          rowEl.classList.toggle("opacity-70", rowPickerMarkedIds.has(rowEl.dataset.rowId));
        });
      } else {
        rowPickerDragAnchorId = id;
        applyRowPickerMarkRange(id, id);
      }
      updateRowPickerDragGhost();
      positionRowPickerDragGhost(e.clientX, e.clientY);
      rowPickerLastMouseY = e.clientY;
      startRowPickerAutoScroll();
    });

    document.addEventListener("mousemove", function (e) {
      if (!rowPickerDragSelecting) return;
      positionRowPickerDragGhost(e.clientX, e.clientY);
      rowPickerLastMouseY = e.clientY;
      var el = document.elementFromPoint(e.clientX, e.clientY);
      var overSelectedList = !!(el && els.rowPickerSelectedList.contains(el));
      els.rowPickerSelectedList.classList.toggle("ring-2", overSelectedList);
      els.rowPickerSelectedList.classList.toggle("ring-indigo-400", overSelectedList);
      if (overSelectedList || rowPickerDragAnchorId === null) return;
      var tr = el && el.closest(".row-picker-row");
      if (!tr || !els.rowPickerAvailableList.contains(tr)) return;
      applyRowPickerMarkRange(rowPickerDragAnchorId, tr.dataset.rowId);
    });

    document.addEventListener("mouseup", function (e) {
      if (!rowPickerDragSelecting) return;
      rowPickerDragSelecting = false;
      rowPickerDragAnchorId = null;
      rowPickerDragAdditive = false;
      rowPickerDragBaseIds = null;
      els.rowPickerSelectedList.classList.remove("ring-2", "ring-indigo-400");
      clearRowPickerDragVisuals();
      var el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && els.rowPickerSelectedList.contains(el) && rowPickerMarkedIds.size) {
        var idsToMove = Array.from(rowPickerMarkedIds);
        // 위 rowPickerSelectionAssignBtn과 동일한 이유로 state.rows가 아니라
        // getRowPickerAvailableRows()(화면에 보이는 정렬/필터 순서) 기준으로 뽑는다.
        var movedRows = getRowPickerAvailableRows().filter(function (r) { return idsToMove.indexOf(r.id) !== -1; });
        rowPickerSelectedRows = rowPickerSelectedRows.concat(movedRows);
        rowPickerMarkedIds = new Set();
        updateRowPickerSelectionSummary();
        renderRowPickerAvailableList();
        renderRowPickerSelectedList();
      }
    });
  }

  export function openCustomAssignView(mode, cfgId, workerIdx) {
    rowPickerMode = mode;
    rowPickerTargetCfgId = cfgId || null;
    rowPickerTargetWorkerIdx = (typeof workerIdx === "number") ? workerIdx : null;
    // 취소/닫기 시 어느 화면으로 돌아갈지 — 홈에서 진입("create")했으면 홈으로,
    // 할당 결과 화면의 "행 추가"("append")로 진입했으면 할당 화면으로.
    rowPickerReturnView = mode === "append" ? "assign" : "home";
    clearRowPickerState();
    els.rowPickerTitle.textContent = mode === "append" ? "작업자 " + (workerIdx + 1) + "에게 할당 추가" : "커스텀 할당 만들기";
    els.rowPickerConfirmBtn.textContent = mode === "append" ? "추가" : "확정";
    updateRowPickerSelectionSummary();
    switchView("custom");
  }

  export function closeCustomAssignView() {
    switchView(rowPickerReturnView);
  }

  // 선택한 행들을 단일 작업자짜리 커스텀 할당 config로 바로 생성 — 커스텀 할당
  // 화면의 "확정"(create 모드)과 홈 선택바의 "할당" 버튼이 공유하는 로직.
  export function createCustomAssignment(rows) {
    var dates = Array.from(new Set(rows.map(function (r) { return getCreatedDate(r); })));
    var id = Date.now();
    state.assignConfigs.push({
      id: id,
      floorInput: null,
      custom: true,
      customSeq: nextCustomAssignSeq(),
      count: 1,
      workerGroups: [rows.slice()],
      createdDates: dates
    });
    state.assignActiveId = id;
    state.assignActiveWorkerIdx = null;
    saveAssignState();
    switchView("assign");
    renderAssignTabs();
    if (window.showToast) window.showToast("커스텀 할당이 생성되었습니다.");
  }

  export async function confirmRowPicker() {
    if (!rowPickerSelectedRows.length) return;
    // 홈 선택바의 "할당"과 동일하게, 선택된 행 중 이미 할당된 게 있으면 확정 전에
    // 재확인한다 — 여기서는 마킹 단계(추가/할당 버튼)에서 막지 않고 확정 시점에
    // 한 번에 확인해서, 확인모달이 반복해서 뜨지 않게 한다.
    var assignedIds = getAssignedRowIdSet();
    var alreadyAssignedCount = rowPickerSelectedRows.filter(function (r) { return assignedIds.has(r.id); }).length;
    if (alreadyAssignedCount > 0) {
      var msg = alreadyAssignedCount === rowPickerSelectedRows.length
        ? "선택한 행이 이미 할당되어 있습니다. 그래도 할당하시겠습니까?"
        : "선택한 " + rowPickerSelectedRows.length + "행 중 " + alreadyAssignedCount + "건이 이미 할당되어 있습니다. 그래도 할당하시겠습니까?";
      if (!(await window.confirmModal(msg))) return;
    }
    if (rowPickerMode === "create") {
      createCustomAssignment(rowPickerSelectedRows);
      rowPickerSelectedRows = [];
    } else if (rowPickerMode === "append") {
      var cfg = state.assignConfigs.find(function (c) { return c.id === rowPickerTargetCfgId; });
      if (cfg) {
        if (!cfg.workerGroups) {
          cfg.workerGroups = splitBalanced(cfg.items || [], cfg.count).map(flattenWorkerGroup);
        }
        var targetGroup = cfg.workerGroups[rowPickerTargetWorkerIdx];
        insertRowsSortedByZone(targetGroup, rowPickerSelectedRows);
        saveAssignState();
      }
      rowPickerSelectedRows = [];
      switchView("assign");
      if (window.showToast) window.showToast("선택한 행이 추가되었습니다.");
    }
  }


  // 아래 세 함수는 main.js의 이벤트 와이어링에서 호출된다 — 이 화면(row-picker)의
  // 내부 상태(rowPickerSelectedRows/rowPickerMarkedIds/rowPickerZoneOPriority)를
  // 직접 재할당하므로, ES 모듈에서는 이 상태를 소유한 파일(custom-assign.js) 안에서만
  // 재할당할 수 있어(다른 파일이 import한 var 바인딩은 읽기 전용) 함수로 감쌌다.

  export async function deleteAllRowPickerSelected() {
    if (!rowPickerSelectedRows.length) return;
    if (!(await window.confirmModal("선택된 행을 모두 삭제할까요?"))) return;
    rowPickerSelectedRows = [];
    renderRowPickerAvailableList();
    renderRowPickerSelectedList();
    if (window.showToast) window.showToast("선택된 행이 모두 삭제되었습니다.", "info");
  }

  export function moveMarkedRowsToSelected() {
    if (!rowPickerMarkedIds.size) return;
    var idsToMove = Array.from(rowPickerMarkedIds);
    // state.rows(원본 업로드 순서)가 아니라 이 화면에 실제로 보이는 정렬/필터 순서에서
    // 골라야, 이 화면에서 정렬한 순서 그대로 "선택된 행"에 반영된다.
    var movedRows = getRowPickerAvailableRows().filter(function (r) { return idsToMove.indexOf(r.id) !== -1; });
    rowPickerSelectedRows = rowPickerSelectedRows.concat(movedRows);
    rowPickerMarkedIds = new Set();
    updateRowPickerSelectionSummary();
    renderRowPickerAvailableList();
    renderRowPickerSelectedList();
  }

  // 홈의 sortZoneOPriorityBtn(core.js 쪽 이벤트 와이어링)과 동일한 패턴 — 누르면 항상
  // 켜지고, "정렬 초기화"(rowPickerSortBarController의 onResetExtra)로만 꺼진다.
  export function enableRowPickerZoneOPriority() {
    rowPickerZoneOPriority = true;
    renderRowPickerAvailableList();
    if (window.showToast) window.showToast("72·73층 O존 우선 정렬이 적용되었습니다.");
  }
