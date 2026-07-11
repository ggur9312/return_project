(function (Pick) {
  "use strict";

  // --- imported from other js/pick/*.js files via window.Pick ---
  var COLUMNS = Pick.COLUMNS;
  var els = Pick.els;
  var escapeHtml = Pick.escapeHtml;
  var saveToStorage = Pick.saveToStorage;
  var state = Pick.state;
  var getAssignedRowIdSet = Pick.getAssignedRowIdSet;
  var formatDateDisplay = Pick.formatDateDisplay;

  // 홈 테이블 드래그 범위선택 + Ctrl/Cmd+클릭 비연속선택 — 이동/드롭 대상은 없고
  // "몇 행 · 몇 개 선택했는지" 실시간 요약 표시 용도. 커스텀 할당 모달의
  // rowPickerMarkedIds/setupRowPickerDragAndDrop과 동일한 패턴을 이식.
  var homeMarkedIds = new Set();
  var homeDragAnchorId = null;
  var homeDragSelecting = false;
  var homeDragAdditive = false; // true = Ctrl/Cmd+드래그 (기존 선택에 합침/뺌)
  var homeDragAdditiveMode = "add"; // "add" | "remove" — 드래그 시작 행이 이미 선택돼 있었는지로 결정
  var homeDragBaseIds = null; // 드래그 시작 전 선택 스냅샷(추가모드 기준값)
  var homeDragRowOrder = null; // 드래그 시작 시점에 실제 렌더링된 행 id 순서 스냅샷

  // main.js의 Pick.refreshAll()이 매 렌더링마다 선택을 초기화할 때 쓰는 헬퍼 — 다른 파일이
  // homeMarkedIds를 직접 재할당하면 Pick.homeMarkedIds 동기화가 누락되기 쉬워 함수로 감쌌다.
  function resetHomeMarkedIds() {
    Pick.homeMarkedIds = homeMarkedIds = new Set();
  }

  function renderTable(rows) {
    if (!rows.length) {
      els.table.classList.add("hidden");
      els.emptyState.classList.remove("hidden");
      els.tableBody.innerHTML = "";
      return;
    }
    els.table.classList.remove("hidden");
    els.emptyState.classList.add("hidden");

    var tdBase = "px-4 py-2.5 whitespace-nowrap";
    // 커스텀 할당(홈 선택바의 "할당" 버튼 포함)으로 이미 배정된 행은 상태 옆에
    // "할당됨" 배지를 붙여준다 — 중복 할당을 막지는 않고 표시만 한다.
    var assignedRowIds = getAssignedRowIdSet();

    els.tableBody.innerHTML = rows.map(function (r) {
      var marked = homeMarkedIds.has(r.id);
      return (
        '<tr class="home-table-row select-none hover:bg-slate-50/80 transition-colors' + (marked ? " bg-indigo-50" : "") + '" data-row-id="' + escapeHtml(r.id) + '">' +
        COLUMNS.map(function (col) {
          if (col.key === "status") {
            var cls = state.statusBadgeMap[r.status] || "";
            var assignedBadge = assignedRowIds.has(r.id)
              ? ' <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100">할당됨</span>'
              : "";
            return '<td class="' + tdBase + '"><span class="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ' + cls + '">' + escapeHtml(r.status) + "</span>" + assignedBadge + "</td>";
          }
          if (col.key === "groupNo") {
            return '<td class="' + tdBase + ' font-semibold text-slate-900">' + escapeHtml(r.groupNo) + "</td>";
          }
          if (col.key === "company") {
            return '<td class="' + tdBase + ' font-medium text-slate-700">' + escapeHtml(r.company) + "</td>";
          }
          if (col.key === "quantity") {
            return '<td class="' + tdBase + ' text-right tabular-nums text-slate-700">' + Number(r.quantity || 0).toLocaleString("ko-KR") + "</td>";
          }
          if (col.key === "deadline" || col.key === "createdAt") {
            return '<td class="' + tdBase + ' text-slate-700">' + escapeHtml(formatDateDisplay(r[col.key])) + "</td>";
          }
          return '<td class="' + tdBase + ' text-slate-700">' + escapeHtml(r[col.key]) + "</td>";
        }).join("") +
        '<td class="' + tdBase + ' text-right tabular-nums font-bold text-indigo-600 bg-indigo-50/30">' + Number(r.groupCompanyTotal || 0).toLocaleString("ko-KR") + "</td>" +
        '<td class="px-3 py-2.5 text-center"><button type="button" class="home-row-delete-btn text-slate-300 hover:text-rose-500" title="삭제" data-row-id="' + escapeHtml(r.id) + '"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></td>' +
        "</tr>"
      );
    }).join("");
  }

  function deleteHomeRow(id) {
    state.rows = state.rows.filter(function (r) { return r.id !== id; });
    homeMarkedIds.delete(id);
    saveToStorage();
    Pick.refreshAll();
    if (window.showToast) window.showToast("행이 삭제되었습니다.");
  }

  // 드래그 도중 필터/정렬을 다시 계산하면 화면에 실제로 그려진 행 순서와
  // 어긋날 수 있어(그러면 anchor~current 범위가 의도보다 훨씬 넓어져 "전체
  // 선택"처럼 보이는 버그로 이어짐) DOM에 그려진 순서를 그대로 스냅샷으로 쓴다.
  function snapshotHomeRowOrder() {
    return Array.prototype.map.call(els.tableBody.querySelectorAll(".home-table-row"), function (tr) {
      return tr.dataset.rowId;
    });
  }

  function applyHomeMarkRange(anchorId, currentId) {
    var rows = homeDragRowOrder || snapshotHomeRowOrder();
    var anchorIdx = rows.indexOf(anchorId);
    var currentIdx = rows.indexOf(currentId);
    if (anchorIdx === -1 || currentIdx === -1) return;
    var lo = Math.min(anchorIdx, currentIdx);
    var hi = Math.max(anchorIdx, currentIdx);
    var rangeIds = rows.slice(lo, hi + 1);

    if (homeDragAdditive && homeDragBaseIds) {
      Pick.homeMarkedIds = homeMarkedIds = new Set(homeDragBaseIds);
      rangeIds.forEach(function (id) {
        if (homeDragAdditiveMode === "remove") homeMarkedIds.delete(id);
        else homeMarkedIds.add(id);
      });
    } else {
      Pick.homeMarkedIds = homeMarkedIds = new Set(rangeIds);
    }

    Array.prototype.forEach.call(els.tableBody.querySelectorAll(".home-table-row"), function (tr) {
      tr.classList.toggle("bg-indigo-50", homeMarkedIds.has(tr.dataset.rowId));
    });
    updateHomeSelectionSummary();
  }

  function updateHomeSelectionSummary() {
    if (!homeMarkedIds.size) {
      els.homeSelectionBar.classList.add("hidden");
      return;
    }
    var qty = 0;
    homeMarkedIds.forEach(function (id) {
      var row = state.rows.find(function (r) { return r.id === id; });
      if (row) qty += row.quantity || 0;
    });
    els.homeSelectionSummary.textContent = "선택 " + homeMarkedIds.size.toLocaleString("ko-KR") + "행 · " + qty.toLocaleString("ko-KR") + "개";
    els.homeSelectionBar.classList.remove("hidden");
  }

  function clearHomeSelection() {
    Pick.homeMarkedIds = homeMarkedIds = new Set();
    Array.prototype.forEach.call(els.tableBody.querySelectorAll(".home-table-row"), function (tr) {
      tr.classList.remove("bg-indigo-50");
    });
    updateHomeSelectionSummary();
  }

  // 커스텀 할당 모달의 setupRowPickerDragAndDrop과 동일한 패턴 — 다만 옮길 대상이
  // 없으므로 mousedown/mousemove로 마킹만 갱신하고 mouseup은 드래그 종료만 처리.
  function setupHomeRowSelection() {
    els.tableBody.addEventListener("click", function (e) {
      var btn = e.target.closest(".home-row-delete-btn");
      if (!btn) return;
      deleteHomeRow(btn.dataset.rowId);
    });

    els.tableBody.addEventListener("mousedown", function (e) {
      if (e.target.closest("button")) return;
      var tr = e.target.closest(".home-table-row");
      if (!tr) return;
      e.preventDefault();
      var id = tr.dataset.rowId;
      homeDragRowOrder = snapshotHomeRowOrder();
      homeDragSelecting = true;

      if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd+드래그: 시작 행이 이미 선택돼 있었으면 드래그 범위를
        // 기존 선택에서 빼고, 아니었으면 더한다(합집합/차집합).
        homeDragAdditive = true;
        homeDragAdditiveMode = homeMarkedIds.has(id) ? "remove" : "add";
        homeDragBaseIds = new Set(homeMarkedIds);
        homeDragAnchorId = id;
        applyHomeMarkRange(id, id);
        return;
      }

      homeDragAdditive = false;
      homeDragBaseIds = null;
      // 이미 여러 행이 선택된 상태에서 그중 한 행을 누르면(향후 이동 등 확장 대비)
      // 기존 선택을 그대로 두지만, 선택돼 있지 않은 새 행을 누르면 그건 새로운
      // 드래그 선택을 시작하려는 의도이므로 기존 선택을 지우고 새로 앵커를 잡는다 —
      // 이전엔 homeMarkedIds.size > 1이기만 하면 무조건 앵커를 비워, O존 우선 정렬로
      // 여러 행을 선택한 뒤 다른 존에서 새로 드래그해도 선택이 그대로 굳어버렸다.
      if (homeMarkedIds.size > 1 && homeMarkedIds.has(id)) {
        homeDragAnchorId = null;
      } else {
        homeDragAnchorId = id;
        applyHomeMarkRange(id, id);
      }
    });

    document.addEventListener("mousemove", function (e) {
      if (!homeDragSelecting || homeDragAnchorId === null) return;
      var el = document.elementFromPoint(e.clientX, e.clientY);
      var tr = el && el.closest(".home-table-row");
      if (!tr || !els.tableBody.contains(tr)) return;
      applyHomeMarkRange(homeDragAnchorId, tr.dataset.rowId);
    });

    document.addEventListener("mouseup", function () {
      if (!homeDragSelecting) return;
      homeDragSelecting = false;
      homeDragAnchorId = null;
      homeDragAdditive = false;
      homeDragBaseIds = null;
      homeDragRowOrder = null;
    });
  }

  // --- exposed to other js/pick/*.js files via window.Pick ---
  Pick.homeMarkedIds = homeMarkedIds;
  Pick.homeDragAnchorId = homeDragAnchorId;
  Pick.homeDragSelecting = homeDragSelecting;
  Pick.homeDragAdditive = homeDragAdditive;
  Pick.homeDragAdditiveMode = homeDragAdditiveMode;
  Pick.homeDragBaseIds = homeDragBaseIds;
  Pick.homeDragRowOrder = homeDragRowOrder;
  Pick.resetHomeMarkedIds = resetHomeMarkedIds;
  Pick.renderTable = renderTable;
  Pick.deleteHomeRow = deleteHomeRow;
  Pick.snapshotHomeRowOrder = snapshotHomeRowOrder;
  Pick.applyHomeMarkRange = applyHomeMarkRange;
  Pick.updateHomeSelectionSummary = updateHomeSelectionSummary;
  Pick.clearHomeSelection = clearHomeSelection;
  Pick.setupHomeRowSelection = setupHomeRowSelection;
})(window.Pick = window.Pick || {});
