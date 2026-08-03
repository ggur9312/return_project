(function (Pick) {
  "use strict";

  // --- imported from other js/pick/*.js files via window.Pick ---
  var closeAssignCreateModal = Pick.closeAssignCreateModal;
  var confirmAssignConfig = Pick.confirmAssignConfig;
  var generateAssignPreview = Pick.generateAssignPreview;
  var initAssignPanelControllers = Pick.initAssignPanelControllers;
  var openAssignCreateModal = Pick.openAssignCreateModal;
  var renderAssignPanel = Pick.renderAssignPanel;
  var renderAssignTabs = Pick.renderAssignTabs;
  var setAssignPreviewMode = Pick.setAssignPreviewMode;
  var FLOOR_PANEL_COLLAPSED_KEY = Pick.FLOOR_PANEL_COLLAPSED_KEY;
  var LABEL_MARGIN_BOTTOM_KEY = Pick.LABEL_MARGIN_BOTTOM_KEY;
  var LABEL_MARGIN_DEFAULT = Pick.LABEL_MARGIN_DEFAULT;
  var LABEL_MARGIN_LEFT_KEY = Pick.LABEL_MARGIN_LEFT_KEY;
  var LABEL_MARGIN_LEFT_TOP_DEFAULT = Pick.LABEL_MARGIN_LEFT_TOP_DEFAULT;
  var LABEL_MARGIN_RIGHT_KEY = Pick.LABEL_MARGIN_RIGHT_KEY;
  var LABEL_MARGIN_TOP_KEY = Pick.LABEL_MARGIN_TOP_KEY;
  var LABOR_STORAGE_KEY = Pick.LABOR_STORAGE_KEY;
  var LABOR_STORAGE_KEY_FILTERED = Pick.LABOR_STORAGE_KEY_FILTERED;
  var STORAGE_KEY = Pick.STORAGE_KEY;
  var applyCardCollapsed = Pick.applyCardCollapsed;
  var closeModalWithTransition = Pick.closeModalWithTransition;
  var debounce = Pick.debounce;
  var els = Pick.els;
  var getDateScopedRows = Pick.getDateScopedRows;
  var getFilteredRows = Pick.getFilteredRows;
  var getSortedRows = Pick.getSortedRows;
  var handleFile = Pick.handleFile;
  var handleParsedMatrix = Pick.handleParsedMatrix;
  var hasActiveFilter = Pick.hasActiveFilter;
  var homeFilterBarController = Pick.homeFilterBarController;
  var homeSortBarController = Pick.homeSortBarController;
  var loadAssignState = Pick.loadAssignState;
  var loadDateTabState = Pick.loadDateTabState;
  var loadFloorPanelCollapsed = Pick.loadFloorPanelCollapsed;
  var loadFromStorage = Pick.loadFromStorage;
  var loadSortRules = Pick.loadSortRules;
  var openModalWithTransition = Pick.openModalWithTransition;
  var renderDateTabs = Pick.renderDateTabs;
  var renderFilterQtySummary = Pick.renderFilterQtySummary;
  var renderFloorPanel = Pick.renderFloorPanel;
  var saveAssignState = Pick.saveAssignState;
  var saveDateTabState = Pick.saveDateTabState;
  var saveSortRules = Pick.saveSortRules;
  var setStatusMsg = Pick.setStatusMsg;
  var state = Pick.state;
  var switchView = Pick.switchView;
  var textToMatrix = Pick.textToMatrix;
  var trim = Pick.trim;
  var updateSortHeaderClasses = Pick.updateSortHeaderClasses;
  var updateStatusBadgeMap = Pick.updateStatusBadgeMap;
  var getCreatedDate = Pick.getCreatedDate;
  var nextCustomAssignSeq = Pick.nextCustomAssignSeq;
  var resetCustomAssignSeq = Pick.resetCustomAssignSeq;
  var getAssignedRowIdSet = Pick.getAssignedRowIdSet;
  var splitBalanced = Pick.splitBalanced;
  var renderWorkerGroupCards = Pick.renderWorkerGroupCards;
  var createRowDragMoveController = Pick.createRowDragMoveController;
  var moveRowsBetweenGroups = Pick.moveRowsBetweenGroups;
  var assignRowDragController = Pick.assignRowDragController;
  var assignPreviewRowDragController = Pick.assignPreviewRowDragController;
  var handleExtractFile = Pick.handleExtractFile;
  var mergeExtractedIntoHome = Pick.mergeExtractedIntoHome;
  var resetExtractPreview = Pick.resetExtractPreview;
  var loadDashboardState = Pick.loadDashboardState;
  var renderDashboard = Pick.renderDashboard;
  var handleDashboardFile = Pick.handleDashboardFile;
  var resetDashboardData = Pick.resetDashboardData;
  var handleDashboardPaste = Pick.handleDashboardPaste;
  var openDashboardUploadModal = Pick.openDashboardUploadModal;
  var closeDashboardUploadModal = Pick.closeDashboardUploadModal;
  var applyGtLabelPageStyle = Pick.applyGtLabelPageStyle;
  var cancelSparePrintModal = Pick.cancelSparePrintModal;
  var closeCustomLabelCompanyDropdown = Pick.closeCustomLabelCompanyDropdown;
  var confirmSparePrintModal = Pick.confirmSparePrintModal;
  var fillCustomLabelFieldsFromCompany = Pick.fillCustomLabelFieldsFromCompany;
  var getAvailableGtCodes = Pick.getAvailableGtCodes;
  var loadGtState = Pick.loadGtState;
  var loadLabelMargin = Pick.loadLabelMargin;
  var openCustomLabelCompanyDropdown = Pick.openCustomLabelCompanyDropdown;
  var parseGtTokens = Pick.parseGtTokens;
  var printCustomLabels = Pick.printCustomLabels;
  var printGtLabels = Pick.printGtLabels;
  var renderCustomLabelCompanyDropdown = Pick.renderCustomLabelCompanyDropdown;
  var renderGtAvailableList = Pick.renderGtAvailableList;
  var renderSparePrintGroupList = Pick.renderSparePrintGroupList;
  var resetCustomLabelModal = Pick.resetCustomLabelModal;
  var saveGtState = Pick.saveGtState;
  var updateSparePrintPreview = Pick.updateSparePrintPreview;
  var clearHomeSelection = Pick.clearHomeSelection;
  var renderTable = Pick.renderTable;
  var resetHomeMarkedIds = Pick.resetHomeMarkedIds;
  var setupHomeRowSelection = Pick.setupHomeRowSelection;
  var updateHomeSelectionSummary = Pick.updateHomeSelectionSummary;

  function refreshAll() {
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
      saveSortRules();
    }
    if (!els.assignView.classList.contains("hidden")) {
      renderAssignPanel();
    }
    if (!els.dashboardApp.classList.contains("hidden")) {
      renderDashboard();
    }
  }

  var customAssignRows = [];
  var customAssignGroups = null; // splitBalanced 결과 — 작업자별 행 배열
  var customAssignActiveWorkerIdx = null; // 커스텀 할당 미리보기 탭(전체/작업자 N) 상태

  // 홈 드래그선택 "할당" 버튼에서 여는 작은 모달 — 선택한 행들을 투입 인원수만큼
  // splitBalanced로 나눠 커스텀(floorInput 없는) assignConfig를 만든다. 정식
  // 층수+인원 생성 모달(#assignCreateModal)과 달리 층/날짜 필터가 없을 뿐, 미리보기
  // 자체는 assign-panel.js의 renderWorkerGroupCards를 그대로 재사용해 정식 모달과
  // 동일한 작업자별 카드+행 단위 상세 테이블(재배정 select 포함)로 보여준다.
  function openCustomAssignModal(rows) {
    customAssignRows = rows.slice();
    els.customAssignRowCountNotice.innerHTML = '선택한 <span class="font-bold text-slate-900">' + customAssignRows.length + '</span>행을 할당합니다.';
    els.customAssignCountInput.value = "1";
    updateCustomAssignPreview();
    openModalWithTransition(els.customAssignModal, els.customAssignModalBox);
  }

  function closeCustomAssignModal() {
    closeModalWithTransition(els.customAssignModal, els.customAssignModalBox);
    customAssignRowDragController.clearSelection();
  }

  function updateCustomAssignPreview() {
    var count = parseInt(els.customAssignCountInput.value, 10);
    if (!count || count < 1) count = 1;
    var items = customAssignRows.map(function (r) { return { zone: r.zone || "(미지정)", qty: r.quantity || 0, rows: [r] }; });
    var groups = splitBalanced(items, count);
    customAssignGroups = groups.map(function (g) { return g.reduce(function (acc, it) { return acc.concat(it.rows); }, []); });
    // 인원수를 바꿀 때마다 그룹 배열이 통째로 새로 만들어지므로, 이전 activeIdx가
    // 새 그룹 수 범위를 벗어나 카드가 통째로 빈 채로 렌더링되는 것을 막기 위해 매번 리셋.
    customAssignActiveWorkerIdx = null;
    renderCustomAssignPreview();
  }

  // #customAssignModal 미리보기 안에서 드래그선택 시 나오는 요약 바 — assign-panel.js의
  // assignPreviewRowDragController/updateAssignPreviewSelectionBar와 같은 패턴, 모달 안
  // 미리보기 영역과 확정/취소 버튼 사이에 고정 표시된다.
  function updateCustomAssignPreviewSelectionBar(count) {
    if (!count) {
      els.customAssignPreviewSelectionBar.classList.add("hidden");
      return;
    }
    els.customAssignPreviewSelectionSummary.textContent = "선택 " + count.toLocaleString("ko-KR") + "행";
    els.customAssignPreviewSelectionBar.classList.remove("hidden");
  }

  var customAssignRowDragController = createRowDragMoveController({
    containerEl: els.customAssignPreviewContainer,
    rowSelector: ".assign-drag-row",
    dropZoneSelector: ".assign-drop-zone",
    onDrop: function (fromKey, toKey, rowIds) {
      moveRowsBetweenGroups(customAssignGroups, fromKey, toKey, rowIds);
      renderCustomAssignPreview();
    },
    onSelectionChange: updateCustomAssignPreviewSelectionBar
  });

  function renderCustomAssignPreview() {
    renderWorkerGroupCards(els.customAssignPreviewContainer, customAssignGroups, customAssignActiveWorkerIdx, function (newIdx) {
      customAssignActiveWorkerIdx = newIdx;
      renderCustomAssignPreview();
    }, customAssignRowDragController);
  }

  function confirmCustomAssignment() {
    if (!customAssignGroups) return;
    var dates = Array.from(new Set(customAssignRows.map(function (r) { return getCreatedDate(r); })));
    var id = Date.now();
    state.assignConfigs.push({
      id: id,
      floorInput: null,
      custom: true,
      customSeq: nextCustomAssignSeq(),
      count: customAssignGroups.length,
      workerGroups: customAssignGroups,
      createdDates: dates
    });
    state.assignActiveId = id;
    state.assignActiveWorkerIdx = null;
    saveAssignState();
    closeCustomAssignModal();
    switchView("assign");
    renderAssignTabs();
    if (window.showToast) window.showToast("커스텀 할당이 생성되었습니다.");
  }

  // --- Event wiring ---

  els.dashboardResetBtn.addEventListener("click", resetDashboardData);
  els.dashboardUploadBtn.addEventListener("click", openDashboardUploadModal);
  els.dashboardUploadCloseBtn.addEventListener("click", closeDashboardUploadModal);
  els.dashboardFileSelectBtn.addEventListener("click", function () { els.dashboardFileInput.click(); });
  els.dashboardFileInput.addEventListener("change", function (e) {
    handleDashboardFile(e.target.files[0]);
  });
  els.dashboardPasteApplyBtn.addEventListener("click", handleDashboardPaste);

  els.homeUploadBtn.addEventListener("click", function () {
    els.fileName.textContent = "";
    setStatusMsg("", null);
    openModalWithTransition(els.homeUploadModal, els.homeUploadModalBox);
  });
  els.homeUploadCloseBtn.addEventListener("click", function () {
    closeModalWithTransition(els.homeUploadModal, els.homeUploadModalBox);
  });

  els.fileSelectBtn.addEventListener("click", function () { els.fileInput.click(); });
  els.fileInput.addEventListener("change", function (e) {
    handleFile(e.target.files[0]);
  });

  els.extractFileSelectBtn.addEventListener("click", function () { els.extractFileInput.click(); });
  els.extractFileInput.addEventListener("change", function (e) {
    handleExtractFile(e.target.files[0]);
  });
  els.extractMergeBtn.addEventListener("click", mergeExtractedIntoHome);
  els.extractResetBtn.addEventListener("click", resetExtractPreview);

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
    state.activeDateTabs = [];
    state.homeViewStateByDate = {};
    Object.keys(state.filters).forEach(function (key) { state.filters[key] = null; });
    state.sortRules = Pick.makeInitialSortRules();
    state.zoneOPriority = false;
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

  var debouncedRenderFloorPanel = debounce(function () {
    renderFloorPanel(getFilteredRows(), getDateScopedRows());
  }, 200);

  els.laborInputUnfiltered.addEventListener("input", function () {
    localStorage.setItem(LABOR_STORAGE_KEY, els.laborInputUnfiltered.value);
    debouncedRenderFloorPanel();
  });

  els.laborInputFiltered.addEventListener("input", function () {
    localStorage.setItem(LABOR_STORAGE_KEY_FILTERED, els.laborInputFiltered.value);
    debouncedRenderFloorPanel();
  });

  els.navHomeBtn.addEventListener("click", function () { switchView("home"); });
  els.navAssignBtn.addEventListener("click", function () { switchView("assign"); });
  els.navExtractBtn.addEventListener("click", function () { switchView("extract"); });
  els.assignOpenModalBtn.addEventListener("click", function () {
    clearHomeSelection();
    openAssignCreateModal();
  });
  els.assignModeCompanyBtn.addEventListener("click", function () {
    setAssignPreviewMode("company");
  });
  els.assignModeBalancedBtn.addEventListener("click", function () {
    setAssignPreviewMode("balanced");
  });
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
    var deletedPrefixes = state.assignConfigs.map(function (c) { return c.id + ":"; });
    Object.keys(state.gtAssignments).forEach(function (key) {
      if (deletedPrefixes.some(function (prefix) { return key.indexOf(prefix) === 0; })) {
        delete state.gtAssignments[key];
      }
    });
    Pick.saveGtState();
    state.assignConfigs = [];
    state.assignActiveId = null;
    state.assignActiveWorkerIdx = null;
    resetCustomAssignSeq();
    saveAssignState();
    renderAssignTabs();
    if (window.showToast) window.showToast("집품 할당이 모두 삭제되었습니다.");
  });

  els.homeSelectionAssignBtn.addEventListener("click", async function () {
    if (!Pick.homeMarkedIds.size) return;
    // state.rows(원본 업로드 순서)가 아니라 화면에 실제로 보이는 정렬/필터 순서에서
    // 골라야, 홈에서 정렬한 순서 그대로 커스텀 할당에 반영된다.
    var selectedRows = getSortedRows(getFilteredRows()).filter(function (r) { return Pick.homeMarkedIds.has(r.id); });
    var assignedIds = getAssignedRowIdSet();
    var alreadyAssignedCount = selectedRows.filter(function (r) { return assignedIds.has(r.id); }).length;
    if (alreadyAssignedCount > 0) {
      var msg = alreadyAssignedCount === selectedRows.length
        ? "선택한 행이 이미 할당되어 있습니다. 그래도 할당하시겠습니까?"
        : "선택한 " + selectedRows.length + "행 중 " + alreadyAssignedCount + "건이 이미 할당되어 있습니다. 그래도 할당하시겠습니까?";
      if (!(await window.confirmModal(msg))) return;
    }
    clearHomeSelection();
    openCustomAssignModal(selectedRows);
  });

  els.customAssignCountInput.addEventListener("input", updateCustomAssignPreview);
  els.customAssignConfirmBtn.addEventListener("click", confirmCustomAssignment);
  els.customAssignCancelBtn.addEventListener("click", closeCustomAssignModal);
  els.customAssignCloseBtn.addEventListener("click", closeCustomAssignModal);

  els.homeSelectionClearBtn.addEventListener("click", clearHomeSelection);

  els.assignSelectionClearBtn.addEventListener("click", function () { assignRowDragController.clearSelection(); });
  els.assignPreviewSelectionClearBtn.addEventListener("click", function () { assignPreviewRowDragController.clearSelection(); });
  els.customAssignPreviewSelectionClearBtn.addEventListener("click", function () { customAssignRowDragController.clearSelection(); });

  // 체크박스가 아니라 1회성 버튼 — 누른 순간에만 O존 우선 정렬을 적용하고,
  // 이후 다른 조작으로 인한 재렌더링에는 영향을 주지 않도록 곧바로 플래그를 되돌린다.
  // 홈에서는 다른 페이지를 갔다 와도 유지돼야 하므로(정렬과 동일하게) 되돌리지 않는다 —
  // refreshAll()의 홈 분기가 끝에서 saveSortRules()를 호출해 자동으로 저장된다.
  els.sortZoneOPriorityBtn.addEventListener("click", function () {
    state.zoneOPriority = true;
    refreshAll();
    if (window.showToast) window.showToast("72·73층 O존 우선 정렬이 적용되었습니다.");
  });

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
  // assign 필터·정렬 컨트롤러는 각 파일의 최상위에서 바로 만들지 않고 함수로
  // 미뤄뒀다 — 초기화 순서를 한곳(main.js)에 모아두기 위해 여기(모든 파일이
  // 로드된 뒤)서 먼저 만든다.
  initAssignPanelControllers();
  homeFilterBarController.setup();
  Pick.assignFilterBarController.setup();
  setupHomeRowSelection();
  loadFromStorage();
  loadSortRules();
  loadDateTabState();
  loadDashboardState();
  loadAssignState();
  loadGtState();
  (function () { var margin = loadLabelMargin(); applyGtLabelPageStyle(margin.right, margin.bottom, margin.left, margin.top); })();
  applyCardCollapsed(loadFloorPanelCollapsed(), els.floorPanelToggleLabel, els.floorPanelToggleIcon, els.floorPanelBody, els.floorPanelSummary);
  els.laborInputUnfiltered.value = localStorage.getItem(LABOR_STORAGE_KEY) || "";
  els.laborInputFiltered.value = localStorage.getItem(LABOR_STORAGE_KEY_FILTERED) || "";
  // switchView()는 내부에서 Pick.refreshAll()을 호출하는데, 그 export(아래)는
  // 초기화 시퀀스보다 뒤에 실행되므로 init 중에는 switchView를 호출하지 않고
  // (기존 관례) 로컬 refreshAll()을 직접 호출한다 — 기본 진입 화면은
  // index.html의 정적 hidden 클래스(dashboardApp 노출·pickApp 숨김, 집품현황
  // 진입 시엔 그 안의 homeView가 기본 노출)로 결정.
  refreshAll();
  renderAssignTabs();
  renderGtAvailableList();

  // --- exposed to other js/pick/*.js files via window.Pick ---
  Pick.refreshAll = refreshAll;
  Pick.debouncedRenderFloorPanel = debouncedRenderFloorPanel;
})(window.Pick = window.Pick || {});
