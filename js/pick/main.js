import { assignFilterBarController, closeAssignCreateModal, confirmAssignConfig, generateAssignPreview, initAssignPanelControllers, openAssignCreateModal, renderAssignPanel, renderAssignTabs } from "./assign-panel.js";
import { FILTER_SORT_COLLAPSED_KEY, FLOOR_PANEL_COLLAPSED_KEY, LABEL_MARGIN_BOTTOM_KEY, LABEL_MARGIN_DEFAULT, LABEL_MARGIN_LEFT_KEY, LABEL_MARGIN_LEFT_TOP_DEFAULT, LABEL_MARGIN_RIGHT_KEY, LABEL_MARGIN_TOP_KEY, LABOR_STORAGE_KEY, STORAGE_KEY, UPLOAD_COLLAPSED_KEY, applyCardCollapsed, closeModalWithTransition, debounce, els, getDateScopedRows, getFilteredRows, getSortedRows, handleFile, handleParsedMatrix, hasActiveFilter, homeFilterBarController, homeSortBarController, loadAssignState, loadDateTabState, loadFilterSortCollapsed, loadFloorPanelCollapsed, loadFromStorage, loadSortRules, loadUploadCollapsed, openModalWithTransition, renderDateTabs, renderFilterQtySummary, renderFloorPanel, saveAssignState, saveDateTabState, saveSortRules, setStatusMsg, setupSortLabels, state, switchView, textToMatrix, trim, updateFilterSortBadge, updateSortHeaderClasses, updateStatusBadgeMap } from "./core.js";
import { clearRowPickerMarks, clearRowPickerState, closeCustomAssignView, confirmRowPicker, createCustomAssignment, deleteAllRowPickerSelected, enableRowPickerZoneOPriority, getAssignedRowIdSet, initRowPickerControllers, moveMarkedRowsToSelected, openCustomAssignView, renderRowPickerAvailableList, renderRowPickerSelectedList, rowPickerFilterBarController, setupRowPickerDragAndDrop } from "./custom-assign.js";
import { applyGtLabelPageStyle, cancelSparePrintModal, closeCustomLabelCompanyDropdown, confirmSparePrintModal, fillCustomLabelFieldsFromCompany, getAvailableGtCodes, loadGtState, loadLabelMargin, openCustomLabelCompanyDropdown, parseGtTokens, printCustomLabels, printGtLabels, renderCustomLabelCompanyDropdown, renderGtAvailableList, renderSparePrintGroupList, resetCustomLabelModal, saveGtState, updateSparePrintPreview } from "./gt-print.js";
import { clearHomeSelection, homeMarkedIds, renderTable, resetHomeMarkedIds, setupHomeRowSelection, updateHomeSelectionSummary } from "./home-table.js";

  export function refreshAll() {
    // 트럭현황의 #activeFileInfo와 동일하게, 데이터가 있으면 상단바에 "데이터
    // 로드됨" 배지를 표시 — 화면 전환과 무관하게 항상 최신 상태를 반영해야 하므로
    // 아래 화면별 분기와 달리 무조건 실행한다.
    els.pickActiveFileInfo.classList.toggle("hidden", state.rows.length === 0);
    // 보이지 않는 화면까지 매번 통째로 다시 그리는 낭비를 막기 위해, 현재
    // 화면(hidden 클래스 여부)에 맞는 렌더링만 실행 — switchView()가 두
    // 화면의 hidden 클래스만 토글하므로 그 상태를 그대로 기준으로 삼는다.
    if (!els.homeView.classList.contains("hidden")) {
      var unfiltered = getDateScopedRows();
      var filtered = getFilteredRows();
      var sorted = getSortedRows(filtered);
      updateStatusBadgeMap();
      renderDateTabs();
      renderFloorPanel(filtered, unfiltered);
      renderFilterQtySummary(filtered, unfiltered);
      resetHomeMarkedIds();
      renderTable(sorted);
      updateHomeSelectionSummary();
      updateSortHeaderClasses();
      homeFilterBarController.updateButtonStates();
      homeSortBarController.render();
      updateFilterSortBadge();
      saveSortRules();
    }
    if (!els.assignView.classList.contains("hidden")) {
      renderAssignPanel();
    }
    if (!els.customAssignView.classList.contains("hidden")) {
      renderRowPickerAvailableList();
      renderRowPickerSelectedList();
    }
  }

  // --- Event wiring ---

  els.fileSelectBtn.addEventListener("click", function () { els.fileInput.click(); });
  els.fileInput.addEventListener("change", function (e) {
    handleFile(e.target.files[0]);
  });

  ["dragenter", "dragover"].forEach(function (evt) {
    els.dropZone.addEventListener(evt, function (e) {
      e.preventDefault();
      els.dropZone.classList.remove("border-slate-300");
      els.dropZone.classList.add("border-indigo-500", "bg-indigo-50/30");
    });
  });
  ["dragleave", "drop"].forEach(function (evt) {
    els.dropZone.addEventListener(evt, function (e) {
      e.preventDefault();
      els.dropZone.classList.remove("border-indigo-500", "bg-indigo-50/30");
      els.dropZone.classList.add("border-slate-300");
    });
  });
  els.dropZone.addEventListener("drop", function (e) {
    var file = e.dataTransfer.files && e.dataTransfer.files[0];
    handleFile(file);
  });

  els.pasteApplyBtn.addEventListener("click", function () {
    var text = els.pasteArea.value;
    if (!text.trim()) {
      setStatusMsg("붙여넣을 데이터를 입력해주세요.", "error");
      return;
    }
    var matrix = textToMatrix(text);
    handleParsedMatrix(matrix, "붙여넣기");
  });

  els.resetBtn.addEventListener("click", async function () {
    if (!(await window.confirmModal("저장된 집품 데이터를 모두 삭제할까요?"))) return;
    state.rows = [];
    localStorage.removeItem(STORAGE_KEY);
    // 활성 날짜 탭/필터가 남아있으면, 초기화 후 다른 날짜의 데이터를 다시
    // 업로드했을 때 예전 날짜/필터 조건에 걸려 화면에 아무 것도 안 보이는
    // 문제가 있었다 — 전체 데이터가 곧바로 보이도록 "전체" 탭+필터 없음으로 되돌린다.
    state.activeDateTab = null;
    Object.keys(state.filters).forEach(function (key) { state.filters[key] = null; });
    saveDateTabState();
    els.pasteArea.value = "";
    els.fileName.textContent = "";
    setStatusMsg("데이터를 초기화했습니다.", "ok");
    refreshAll();
    if (window.showToast) window.showToast("집품 데이터가 초기화되었습니다.", "info");
  });

  els.floorPanelToggleBtn.addEventListener("click", function () {
    var collapsed = !loadFloorPanelCollapsed();
    localStorage.setItem(FLOOR_PANEL_COLLAPSED_KEY, collapsed ? "1" : "0");
    applyCardCollapsed(collapsed, els.floorPanelToggleLabel, els.floorPanelToggleIcon, els.floorPanelBody, els.floorPanelSummary);
  });

  els.uploadToggleBtn.addEventListener("click", function () {
    var collapsed = !loadUploadCollapsed();
    localStorage.setItem(UPLOAD_COLLAPSED_KEY, collapsed ? "1" : "0");
    applyCardCollapsed(collapsed, els.uploadToggleLabel, els.uploadToggleIcon, els.uploadCardBody, null);
  });

  els.filterSortToggleBtn.addEventListener("click", function () {
    var collapsed = !loadFilterSortCollapsed();
    localStorage.setItem(FILTER_SORT_COLLAPSED_KEY, collapsed ? "1" : "0");
    applyCardCollapsed(collapsed, els.filterSortToggleLabel, els.filterSortToggleIcon, els.filterSortBody, null);
  });

  export var debouncedRenderFloorPanel = debounce(function () {
    renderFloorPanel(getFilteredRows());
  }, 200);

  els.laborInput.addEventListener("input", function () {
    localStorage.setItem(LABOR_STORAGE_KEY, els.laborInput.value);
    debouncedRenderFloorPanel();
  });

  els.navHomeBtn.addEventListener("click", function () { switchView("home"); });
  els.navAssignBtn.addEventListener("click", function () { switchView("assign"); });
  els.navCustomBtn.addEventListener("click", function () { openCustomAssignView("create"); });
  els.assignOpenModalBtn.addEventListener("click", openAssignCreateModal);
  els.assignPreviewBtn.addEventListener("click", async function () {
    if (hasActiveFilter()) {
      if (!(await window.confirmModal("현재 목록에 필터가 적용되어 있어 필터링된 데이터만 할당됩니다. 계속하시겠습니까?"))) return;
    }
    generateAssignPreview();
  });
  els.assignConfirmBtn.addEventListener("click", confirmAssignConfig);
  els.assignCancelBtn.addEventListener("click", closeAssignCreateModal);
  els.assignCreateCloseBtn.addEventListener("click", closeAssignCreateModal);

  els.assignDeleteAllBtn.addEventListener("click", async function () {
    if (!state.assignConfigs.length) return;
    if (!(await window.confirmModal("생성된 집품 할당을 모두 삭제할까요?"))) return;
    state.assignConfigs = [];
    state.assignActiveId = null;
    state.assignActiveWorkerIdx = null;
    saveAssignState();
    renderAssignTabs();
    if (window.showToast) window.showToast("집품 할당이 모두 삭제되었습니다.");
  });

  els.assignCustomBtn.addEventListener("click", function () { openCustomAssignView("create"); });
  els.rowPickerConfirmBtn.addEventListener("click", confirmRowPicker);
  els.rowPickerCancelBtn.addEventListener("click", closeCustomAssignView);
  els.rowPickerDeleteAllBtn.addEventListener("click", deleteAllRowPickerSelected);

  els.homeSelectionAssignBtn.addEventListener("click", async function () {
    if (!homeMarkedIds.size) return;
    // state.rows(원본 업로드 순서)가 아니라 화면에 실제로 보이는 정렬/필터 순서에서
    // 골라야, 홈에서 정렬한 순서 그대로 커스텀 할당에 반영된다.
    var selectedRows = getSortedRows(getFilteredRows()).filter(function (r) { return homeMarkedIds.has(r.id); });
    var assignedIds = getAssignedRowIdSet();
    var alreadyAssignedCount = selectedRows.filter(function (r) { return assignedIds.has(r.id); }).length;
    if (alreadyAssignedCount > 0) {
      var msg = alreadyAssignedCount === selectedRows.length
        ? "선택한 행이 이미 할당되어 있습니다. 그래도 할당하시겠습니까?"
        : "선택한 " + selectedRows.length + "행 중 " + alreadyAssignedCount + "건이 이미 할당되어 있습니다. 그래도 할당하시겠습니까?";
      if (!(await window.confirmModal(msg))) return;
    }
    clearHomeSelection();
    createCustomAssignment(selectedRows);
  });

  els.homeSelectionClearBtn.addEventListener("click", clearHomeSelection);

  // 커스텀 할당 화면에서는 홈과 달리 "할당"을 눌러도 바로 할당이 생성되지 않고,
  // 드래그로 선택 영역에 끌어놓은 것과 동일하게 "선택된 행" 목록으로만 옮긴다 —
  // 중복 할당 여부는 실제로 확정할 때(rowPickerConfirmBtn) 한 번에 확인한다.
  els.rowPickerSelectionAssignBtn.addEventListener("click", moveMarkedRowsToSelected);

  els.rowPickerSelectionClearBtn.addEventListener("click", clearRowPickerMarks);

  // 체크박스가 아니라 1회성 버튼 — 누른 순간에만 O존 우선 정렬을 적용하고,
  // 이후 다른 조작으로 인한 재렌더링에는 영향을 주지 않도록 곧바로 플래그를 되돌린다.
  // 홈에서는 다른 페이지를 갔다 와도 유지돼야 하므로(정렬과 동일하게) 되돌리지 않는다 —
  // refreshAll()의 홈 분기가 끝에서 saveSortRules()를 호출해 자동으로 저장된다.
  els.sortZoneOPriorityBtn.addEventListener("click", function () {
    state.zoneOPriority = true;
    refreshAll();
    if (window.showToast) window.showToast("72·73층 O존 우선 정렬이 적용되었습니다.");
  });

  // 홈의 state.zoneOPriority와 마찬가지로, 화면을 나가기 전까지는 계속 켜진 상태를
  // 유지한다(clearRowPickerState()가 화면 진입/이탈 시, onResetExtra가 "정렬 초기화"
  // 클릭 시 끈다) — 이전엔 렌더링 직후 바로 꺼버려서, 드래그 중 다시 계산되는 정렬
  // 순서(꺼진 상태)가 화면에 이미 그려진 순서(켜진 상태)와 어긋나 드래그 범위선택이
  // 엉뚱한 인덱스로 계산되는 버그(다른 존으로 넘어가는 순간 전체선택됨)가 있었다.
  els.rowPickerSortZoneOPriorityBtn.addEventListener("click", enableRowPickerZoneOPriority);

  els.gtSaveBtn.addEventListener("click", function () {
    var tokens = parseGtTokens(els.gtPasteArea.value);
    if (!tokens.length) return;
    var seen = {};
    state.gtCodes.forEach(function (c) { seen[c] = true; });
    var addedCount = 0;
    tokens.forEach(function (t) {
      if (!seen[t]) {
        seen[t] = true;
        state.gtCodes.push(t);
        addedCount++;
      }
    });
    saveGtState();
    els.gtPasteArea.value = "";
    renderGtAvailableList();
    renderAssignPanel();
    if (window.showToast) {
      window.showToast(addedCount > 0 ? "GT 코드 " + addedCount + "건이 저장되었습니다." : "새로 추가된 GT 코드가 없습니다(중복).", addedCount > 0 ? "success" : "info");
    }
  });

  els.gtClearBtn.addEventListener("click", async function () {
    if (!(await window.confirmModal("저장된 GT 바코드 데이터를 모두 삭제할까요?"))) return;
    state.gtCodes = [];
    state.gtAssignments = {};
    state.gtPrinted = [];
    saveGtState();
    renderGtAvailableList();
    renderAssignPanel();
    if (window.showToast) window.showToast("GT 데이터가 초기화되었습니다.", "info");
  });

  els.gtPrintBtn.addEventListener("click", async function () {
    var available = getAvailableGtCodes();
    if (!available.length) {
      await window.alertModal("인쇄할 수 있는 사용 가능 GT 데이터가 없습니다.");
      return;
    }
    els.gtPrintAvailableCount.textContent = available.length;
    els.gtPrintQty.value = "";
    els.gtPrintModalMsg.textContent = "";
    openModalWithTransition(els.gtPrintModal, els.gtPrintModalBox);
  });

  els.gtPrintModalCancelBtn.addEventListener("click", function () {
    closeModalWithTransition(els.gtPrintModal, els.gtPrintModalBox);
    els.gtPrintQty.value = "";
    els.gtPrintModalMsg.textContent = "";
  });

  els.gtPrintModalPrintBtn.addEventListener("click", function () {
    var available = getAvailableGtCodes();
    var qty = parseInt(els.gtPrintQty.value, 10);
    if (!qty || qty < 1) {
      els.gtPrintModalMsg.textContent = "1 이상의 숫자를 입력해주세요.";
      return;
    }
    qty = Math.min(qty, available.length);
    var codes = available.slice().reverse().slice(0, qty);
    closeModalWithTransition(els.gtPrintModal, els.gtPrintModalBox);
    els.gtPrintQty.value = "";
    els.gtPrintModalMsg.textContent = "";
    // GT 소모는 출력을 실제로 확인받은 뒤에만 반영(취소 시 소모하지 않음).
    printGtLabels(codes, function () {
      codes.forEach(function (c) { state.gtPrinted.push(c); });
      saveGtState();
      renderGtAvailableList();
    });
  });

  els.sparePrintThreshold.addEventListener("input", function () {
    renderSparePrintGroupList();
    updateSparePrintPreview();
  });
  els.sparePrintSplitSize.addEventListener("input", function () {
    renderSparePrintGroupList();
    updateSparePrintPreview();
  });
  els.sparePrintLeadingBlank.addEventListener("change", updateSparePrintPreview);

  els.sparePrintModalCancelBtn.addEventListener("click", cancelSparePrintModal);

  els.sparePrintModalPrintBtn.addEventListener("click", confirmSparePrintModal);

  els.customLabelBtn.addEventListener("click", function () {
    openModalWithTransition(els.customLabelModal, els.customLabelModalBox);
  });

  els.customLabelCompanySearch.addEventListener("focus", openCustomLabelCompanyDropdown);
  els.customLabelCompanySearch.addEventListener("input", function () {
    // 검색창은 기존 업체를 찾기 위한 용도지만, 목록에 없는 이름을 타이핑만 하고
    // 드롭다운에서 아무것도 선택하지 않아도 실제 출력에 쓰이는 업체명 칸에
    // 그대로 반영되게 한다. 이후 목록에서 클릭하면 fillCustomLabelFieldsFromCompany가
    // 값을 덮어써 정상적으로 자동완성된다.
    els.customLabelCompany.value = els.customLabelCompanySearch.value;
    renderCustomLabelCompanyDropdown(els.customLabelCompanySearch.value);
    els.customLabelCompanyDropdown.classList.remove("hidden");
  });

  els.customLabelCompanyDropdown.addEventListener("click", function (e) {
    var btn = e.target.closest(".custom-label-company-item");
    if (!btn) return;
    var name = btn.dataset.company;
    els.customLabelCompanySearch.value = name;
    fillCustomLabelFieldsFromCompany(name);
    closeCustomLabelCompanyDropdown();
  });

  document.addEventListener("click", function (e) {
    if (!els.customLabelCompanyDropdown.classList.contains("hidden") &&
        !els.customLabelCompanyDropdown.contains(e.target) &&
        e.target !== els.customLabelCompanySearch) {
      closeCustomLabelCompanyDropdown();
    }
  });

  els.customLabelCancelBtn.addEventListener("click", function () {
    closeModalWithTransition(els.customLabelModal, els.customLabelModalBox);
    resetCustomLabelModal();
  });

  els.customLabelPrintBtn.addEventListener("click", function () {
    var qty = parseInt(els.customLabelQty.value, 10);
    if (!qty || qty < 1) qty = 1;
    var fields = {
      groupNo: trim(els.customLabelGroupNo.value),
      deadline: trim(els.customLabelDeadline.value),
      purchaseType: trim(els.customLabelPurchaseType.value),
      company: trim(els.customLabelCompany.value),
      transportType: trim(els.customLabelTransportType.value)
    };
    var useAutoMatch = els.customLabelAutoMatch.checked;
    var manualCode = trim(els.customLabelGtCode.value);
    closeModalWithTransition(els.customLabelModal, els.customLabelModalBox);
    printCustomLabels(fields, qty, useAutoMatch, manualCode);
    resetCustomLabelModal();
  });

  els.labelMarginSettingsBtn.addEventListener("click", function () {
    var margin = loadLabelMargin();
    els.labelMarginRightInput.value = margin.right;
    els.labelMarginBottomInput.value = margin.bottom;
    els.labelMarginLeftInput.value = margin.left;
    els.labelMarginTopInput.value = margin.top;
    openModalWithTransition(els.labelMarginModal, els.labelMarginModalBox);
  });

  els.labelMarginCancelBtn.addEventListener("click", function () {
    closeModalWithTransition(els.labelMarginModal, els.labelMarginModalBox);
  });

  els.labelMarginSaveBtn.addEventListener("click", function () {
    var right = parseFloat(els.labelMarginRightInput.value);
    var bottom = parseFloat(els.labelMarginBottomInput.value);
    var left = parseFloat(els.labelMarginLeftInput.value);
    var top = parseFloat(els.labelMarginTopInput.value);
    if (isNaN(right) || right < 0) right = LABEL_MARGIN_DEFAULT;
    if (isNaN(bottom) || bottom < 0) bottom = LABEL_MARGIN_DEFAULT;
    if (isNaN(left) || left < 0) left = LABEL_MARGIN_LEFT_TOP_DEFAULT;
    if (isNaN(top) || top < 0) top = LABEL_MARGIN_LEFT_TOP_DEFAULT;
    localStorage.setItem(LABEL_MARGIN_RIGHT_KEY, String(right));
    localStorage.setItem(LABEL_MARGIN_BOTTOM_KEY, String(bottom));
    localStorage.setItem(LABEL_MARGIN_LEFT_KEY, String(left));
    localStorage.setItem(LABEL_MARGIN_TOP_KEY, String(top));
    applyGtLabelPageStyle(right, bottom, left, top);
    closeModalWithTransition(els.labelMarginModal, els.labelMarginModalBox);
    if (window.showToast) window.showToast("라벨 여백이 저장되었습니다.");
  });

  // --- Init ---
  // rowPicker/assign 필터·정렬 컨트롤러는 core.js<->custom-assign.js/assign-panel.js
  // 순환참조 때문에 모듈 최상위에서 바로 만들 수 없어(그 시점엔 core.js의 els가 아직
  // 초기화 전일 수 있음) 함수로 미뤄뒀다 — 여기(모든 모듈이 로드된 뒤)서 먼저 만든다.
  initRowPickerControllers();
  initAssignPanelControllers();
  setupSortLabels();
  homeFilterBarController.setup();
  rowPickerFilterBarController.setup();
  assignFilterBarController.setup();
  setupRowPickerDragAndDrop();
  setupHomeRowSelection();
  loadFromStorage();
  loadSortRules();
  loadDateTabState();
  loadAssignState();
  loadGtState();
  (function () { var margin = loadLabelMargin(); applyGtLabelPageStyle(margin.right, margin.bottom, margin.left, margin.top); })();
  applyCardCollapsed(loadFloorPanelCollapsed(), els.floorPanelToggleLabel, els.floorPanelToggleIcon, els.floorPanelBody, els.floorPanelSummary);
  applyCardCollapsed(loadUploadCollapsed(), els.uploadToggleLabel, els.uploadToggleIcon, els.uploadCardBody, null);
  applyCardCollapsed(loadFilterSortCollapsed(), els.filterSortToggleLabel, els.filterSortToggleIcon, els.filterSortBody, null);
  els.laborInput.value = localStorage.getItem(LABOR_STORAGE_KEY) || "";
  refreshAll();
  renderAssignTabs();
  renderGtAvailableList();
