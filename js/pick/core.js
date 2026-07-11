(function (Pick) {
  "use strict";

  // --- imported from other js/pick/*.js files via window.Pick ---

  var COLUMNS = [
    { key: "groupNo", label: "그룹번호", type: "string" },
    { key: "deadline", label: "마감일시", type: "date" },
    { key: "createdAt", label: "생성일시", type: "date" },
    { key: "purchaseType", label: "매입유형", type: "string" },
    { key: "company", label: "업체명", type: "string" },
    { key: "status", label: "상태", type: "string" },
    { key: "transportType", label: "운송타입", type: "string" },
    { key: "zone", label: "존", type: "string" },
    { key: "quantity", label: "수량", type: "number" }
  ];

  var AGG_COLUMN = { key: "groupCompanyTotal", label: "업체 총수량", type: "number" };
  var ALL_COLUMNS = COLUMNS.concat([AGG_COLUMN]);

  // 커스텀 할당 화면의 "사용 가능한 행" 테이블에 실제로 보이는 컬럼만 대상 —
  // 생성일자는 이 화면에서 별도로 필터링할 수 있는 컬럼이 아니라서 제외
  var ROW_PICKER_COLUMNS = ["groupNo", "deadline", "company", "transportType", "zone", "quantity"]
    .map(function (key) { return COLUMNS.find(function (c) { return c.key === key; }); });

  var LABEL_BARCODE_OPTS = { fontSize: 25, height: 42, width: 1.3 };

  // 행 고유 id 발급 — 배정(assignConfig)/GT 매칭 키가 배열 위치가 아니라 행 자체를
  // 안정적으로 가리킬 수 있도록 함. loadFromStorage()에서 구버전 데이터에 백필하며
  // 기존 최대 id보다 큰 값에서 시작하도록 rowIdSeq를 보정한다.
  var rowIdSeq = 0;
  function nextRowId() {
    rowIdSeq += 1;
    return "r" + rowIdSeq;
  }

  // customAssignSeq를 다른 파일(custom-assign.js)에서 안전하게 증가시키기 위한 헬퍼 —
  // 소유 파일(core.js) 밖에서 로컬 var를 직접 건드리면 Pick.customAssignSeq
  // 동기화가 누락되기 쉬워 함수로 감쌌다.
  function nextCustomAssignSeq() {
    customAssignSeq += 1;
    return customAssignSeq;
  }

  // 커스텀 할당 구분 번호("커스텀 1", "커스텀 2" ...) 발급 — rowIdSeq와 동일한 패턴으로,
  // loadAssignState()에서 구버전 데이터(customSeq 없음)에 생성 순서대로 백필하며
  // 기존 최대값보다 큰 값에서 시작하도록 보정한다. 삭제로 인해 번호가 밀려 재배정되지
  // 않도록, 렌더링 시점이 아니라 생성 시점에 한 번만 값을 고정해서 저장한다.
  var customAssignSeq = 0;

  var STORAGE_KEY = "pickListData";
  var SORT_RULES_KEY = "pickListSortRules";
  var ZONE_O_PRIORITY_KEY = "pickListZoneOPriority";
  var LABOR_STORAGE_KEY = "pickListLaborInput";
  var ASSIGN_CONFIGS_KEY = "pickListAssignConfigs";
  var ASSIGN_ACTIVE_KEY = "pickListAssignActiveId";
  var DATE_TAB_KEY = "pickListActiveDateTab";
  var GT_CODES_KEY = "pickListGtCodes";
  var GT_ASSIGNMENTS_KEY = "pickListGtAssignments";
  var GT_PRINTED_KEY = "pickListGtPrinted";
  var LABEL_MARGIN_RIGHT_KEY = "pickListLabelMarginRight";
  var LABEL_MARGIN_BOTTOM_KEY = "pickListLabelMarginBottom";
  var LABEL_MARGIN_LEFT_KEY = "pickListLabelMarginLeft";
  var LABEL_MARGIN_TOP_KEY = "pickListLabelMarginTop";
  var FLOOR_PANEL_COLLAPSED_KEY = "pickListFloorPanelCollapsed";
  var UPLOAD_COLLAPSED_KEY = "pickListUploadCollapsed";
  var FILTER_SORT_COLLAPSED_KEY = "pickListFilterSortCollapsed";
  var LABEL_MARGIN_DEFAULT = 3;
  var LABEL_MARGIN_LEFT_TOP_DEFAULT = 0;
  var BADGE_CLASSES = [
    "bg-emerald-50 text-emerald-700 border border-emerald-100",
    "bg-blue-50 text-blue-700 border border-blue-100",
    "bg-amber-50 text-amber-700 border border-amber-100",
    "bg-rose-50 text-rose-700 border border-rose-100"
  ];
  var FILTER_BTN_INACTIVE = "filter-bar-btn inline-flex items-center gap-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium text-xs px-3 py-1.5 rounded-lg transition-colors";
  var FILTER_BTN_ACTIVE = "filter-bar-btn inline-flex items-center gap-1 bg-indigo-600 text-white shadow-md shadow-indigo-100 font-medium text-xs px-3 py-1.5 rounded-lg transition-all";

  var NAV_BTN_ACTIVE = "w-full text-left px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors bg-indigo-600 text-white shadow-md shadow-indigo-100";
  var NAV_BTN_INACTIVE = "w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors bg-white text-slate-600 border border-slate-200 hover:bg-slate-50";
  var ASSIGN_TAB_ACTIVE = "px-4 py-2.5 text-sm font-semibold rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-100 flex items-center gap-2 transition-all duration-200";
  var ASSIGN_TAB_INACTIVE = "px-4 py-2.5 text-sm font-medium rounded-lg bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 flex items-center gap-2 transition-all duration-200";

  var initialFilters = {};
  COLUMNS.forEach(function (c) { initialFilters[c.key] = null; }); // null = 전체 허용(필터 없음)
  initialFilters[AGG_COLUMN.key] = null;

  var state = {
    rows: [],
    // 정렬 기준 목록(우선순위 순서대로 적용). 기본값: 존 오름차순 -> 수량 내림차순,
    // 새로 업로드/붙여넣기한 데이터도 존별로 묶이고 수량이 많은 순으로 보이게 함.
    sortRules: [{ key: "zone", dir: 1 }, { key: "quantity", dir: -1 }],
    // 72/73층 O존 우선 정렬 체크박스 상태 — 체크 시 zone 비교에서 O존을 72/73층보다 앞으로 보냄
    zoneOPriority: false,
    filters: initialFilters,
    statusBadgeMap: {},
    assignConfigs: [],
    assignActiveId: null,
    assignActiveWorkerIdx: null,
    gtCodes: [],
    gtAssignments: {},
    gtPrinted: [],
    activeDateTab: null
  };

  var els = {
    dropZone: document.getElementById("dropZone"),
    fileInput: document.getElementById("fileInput"),
    fileSelectBtn: document.getElementById("fileSelectBtn"),
    fileName: document.getElementById("fileName"),
    pasteArea: document.getElementById("pasteArea"),
    pasteApplyBtn: document.getElementById("pasteApplyBtn"),
    statusMsg: document.getElementById("statusMsg"),
    resetBtn: document.getElementById("resetBtn"),
    pickActiveFileInfo: document.getElementById("pickActiveFileInfo"),
    laborInput: document.getElementById("laborInput"),
    floorTotalQty: document.getElementById("floorTotalQty"),
    floorUnfilteredQty: document.getElementById("floorUnfilteredQty"),
    floorPerPersonQty: document.getElementById("floorPerPersonQty"),
    filterQtySummary: document.getElementById("filterQtySummary"),
    homeSelectionBar: document.getElementById("homeSelectionBar"),
    homeSelectionSummary: document.getElementById("homeSelectionSummary"),
    homeSelectionAssignBtn: document.getElementById("homeSelectionAssignBtn"),
    homeSelectionClearBtn: document.getElementById("homeSelectionClearBtn"),
    rowPickerSelectionBar: document.getElementById("rowPickerSelectionBar"),
    rowPickerSelectionSummary: document.getElementById("rowPickerSelectionSummary"),
    rowPickerSelectionAssignBtn: document.getElementById("rowPickerSelectionAssignBtn"),
    rowPickerSelectionClearBtn: document.getElementById("rowPickerSelectionClearBtn"),
    floorBars: document.getElementById("floorBars"),
    floorPanelToggleBtn: document.getElementById("floorPanelToggleBtn"),
    floorPanelToggleLabel: document.getElementById("floorPanelToggleLabel"),
    floorPanelToggleIcon: document.getElementById("floorPanelToggleIcon"),
    floorPanelSummary: document.getElementById("floorPanelSummary"),
    floorPanelBody: document.getElementById("floorPanelBody"),
    uploadCard: document.getElementById("uploadCard"),
    uploadToggleBtn: document.getElementById("uploadToggleBtn"),
    uploadToggleLabel: document.getElementById("uploadToggleLabel"),
    uploadToggleIcon: document.getElementById("uploadToggleIcon"),
    uploadCardBody: document.getElementById("uploadCardBody"),
    dateTabsContainer: document.getElementById("dateTabsContainer"),
    filterBar: document.getElementById("filterBar"),
    filterButtonsContainer: document.getElementById("filterButtonsContainer"),
    filterResetAllBtn: document.getElementById("filterResetAllBtn"),
    filterSortToggleBtn: document.getElementById("filterSortToggleBtn"),
    filterSortToggleLabel: document.getElementById("filterSortToggleLabel"),
    filterSortToggleIcon: document.getElementById("filterSortToggleIcon"),
    filterSortSummary: document.getElementById("filterSortSummary"),
    filterSortBody: document.getElementById("filterSortBody"),
    table: document.getElementById("dataTable"),
    emptyState: document.getElementById("emptyState"),
    tableBody: document.getElementById("tableBody"),
    theadRow: document.querySelector("#dataTable thead tr"),
    sortRulesContainer: document.getElementById("sortRulesContainer"),
    sortAddBtn: document.getElementById("sortAddBtn"),
    sortResetBtn: document.getElementById("sortResetBtn"),
    sortZoneOPriorityBtn: document.getElementById("sortZoneOPriorityBtn"),
    navHomeBtn: document.getElementById("navHomeBtn"),
    navAssignBtn: document.getElementById("navAssignBtn"),
    navCustomBtn: document.getElementById("navCustomBtn"),
    mainNavAside: document.getElementById("mainNavAside"),
    homeView: document.getElementById("homeView"),
    assignView: document.getElementById("assignView"),
    customAssignView: document.getElementById("customAssignView"),
    assignOpenModalBtn: document.getElementById("assignOpenModalBtn"),
    assignCreateModal: document.getElementById("assignCreateModal"),
    assignCreateModalBox: document.getElementById("assignCreateModalBox"),
    assignFloorInput: document.getElementById("assignFloorInput"),
    assignCountInput: document.getElementById("assignCountInput"),
    assignPreviewBtn: document.getElementById("assignPreviewBtn"),
    assignMsg: document.getElementById("assignMsg"),
    assignDateCheckboxes: document.getElementById("assignDateCheckboxes"),
    assignPreviewContainer: document.getElementById("assignPreviewContainer"),
    assignConfirmBtn: document.getElementById("assignConfirmBtn"),
    assignCancelBtn: document.getElementById("assignCancelBtn"),
    assignCreateCloseBtn: document.getElementById("assignCreateCloseBtn"),
    assignTabsContainer: document.getElementById("assignTabsContainer"),
    assignFilterSortBar: document.getElementById("assignFilterSortBar"),
    assignFilterButtonsContainer: document.getElementById("assignFilterButtonsContainer"),
    assignFilterResetAllBtn: document.getElementById("assignFilterResetAllBtn"),
    assignSortRulesContainer: document.getElementById("assignSortRulesContainer"),
    assignSortAddBtn: document.getElementById("assignSortAddBtn"),
    assignSortResetBtn: document.getElementById("assignSortResetBtn"),
    assignSortZoneOPriorityBtn: document.getElementById("assignSortZoneOPriorityBtn"),
    assignTableContainer: document.getElementById("assignTableContainer"),
    assignDeleteAllBtn: document.getElementById("assignDeleteAllBtn"),
    assignCustomBtn: document.getElementById("assignCustomBtn"),
    rowPickerTitle: document.getElementById("rowPickerTitle"),
    rowPickerFilterButtonsContainer: document.getElementById("rowPickerFilterButtonsContainer"),
    rowPickerFilterResetAllBtn: document.getElementById("rowPickerFilterResetAllBtn"),
    rowPickerSortRulesContainer: document.getElementById("rowPickerSortRulesContainer"),
    rowPickerSortAddBtn: document.getElementById("rowPickerSortAddBtn"),
    rowPickerSortResetBtn: document.getElementById("rowPickerSortResetBtn"),
    rowPickerSortZoneOPriorityBtn: document.getElementById("rowPickerSortZoneOPriorityBtn"),
    rowPickerAvailableList: document.getElementById("rowPickerAvailableList"),
    rowPickerSelectedList: document.getElementById("rowPickerSelectedList"),
    rowPickerSelectedCount: document.getElementById("rowPickerSelectedCount"),
    rowPickerSelectedQty: document.getElementById("rowPickerSelectedQty"),
    rowPickerDeleteAllBtn: document.getElementById("rowPickerDeleteAllBtn"),
    rowPickerDragGhost: document.getElementById("rowPickerDragGhost"),
    rowPickerConfirmBtn: document.getElementById("rowPickerConfirmBtn"),
    rowPickerCancelBtn: document.getElementById("rowPickerCancelBtn"),
    gtPasteArea: document.getElementById("gtPasteArea"),
    gtSaveBtn: document.getElementById("gtSaveBtn"),
    gtClearBtn: document.getElementById("gtClearBtn"),
    gtPrintBtn: document.getElementById("gtPrintBtn"),
    gtAvailableCount: document.getElementById("gtAvailableCount"),
    gtAvailableList: document.getElementById("gtAvailableList"),
    customLabelBtn: document.getElementById("customLabelBtn"),
    customLabelModal: document.getElementById("customLabelModal"),
    customLabelModalBox: document.getElementById("customLabelModalBox"),
    customLabelCompanySearch: document.getElementById("customLabelCompanySearch"),
    customLabelCompanyDropdown: document.getElementById("customLabelCompanyDropdown"),
    customLabelGroupNo: document.getElementById("customLabelGroupNo"),
    customLabelDeadline: document.getElementById("customLabelDeadline"),
    customLabelPurchaseType: document.getElementById("customLabelPurchaseType"),
    customLabelCompany: document.getElementById("customLabelCompany"),
    customLabelTransportType: document.getElementById("customLabelTransportType"),
    customLabelAutoMatch: document.getElementById("customLabelAutoMatch"),
    customLabelGtCode: document.getElementById("customLabelGtCode"),
    customLabelQty: document.getElementById("customLabelQty"),
    customLabelPrintBtn: document.getElementById("customLabelPrintBtn"),
    customLabelCancelBtn: document.getElementById("customLabelCancelBtn"),
    labelMarginSettingsBtn: document.getElementById("labelMarginSettingsBtn"),
    labelMarginModal: document.getElementById("labelMarginModal"),
    labelMarginModalBox: document.getElementById("labelMarginModalBox"),
    labelMarginRightInput: document.getElementById("labelMarginRightInput"),
    labelMarginBottomInput: document.getElementById("labelMarginBottomInput"),
    labelMarginLeftInput: document.getElementById("labelMarginLeftInput"),
    labelMarginTopInput: document.getElementById("labelMarginTopInput"),
    labelMarginSaveBtn: document.getElementById("labelMarginSaveBtn"),
    labelMarginCancelBtn: document.getElementById("labelMarginCancelBtn"),
    gtPrintModal: document.getElementById("gtPrintModal"),
    gtPrintModalBox: document.getElementById("gtPrintModalBox"),
    gtPrintAvailableCount: document.getElementById("gtPrintAvailableCount"),
    gtPrintQty: document.getElementById("gtPrintQty"),
    gtPrintModalMsg: document.getElementById("gtPrintModalMsg"),
    gtPrintModalPrintBtn: document.getElementById("gtPrintModalPrintBtn"),
    gtPrintModalCancelBtn: document.getElementById("gtPrintModalCancelBtn"),
    sparePrintModal: document.getElementById("sparePrintModal"),
    sparePrintModalBox: document.getElementById("sparePrintModalBox"),
    sparePrintThreshold: document.getElementById("sparePrintThreshold"),
    sparePrintSplitSize: document.getElementById("sparePrintSplitSize"),
    sparePrintLeadingBlank: document.getElementById("sparePrintLeadingBlank"),
    sparePrintGroupList: document.getElementById("sparePrintGroupList"),
    sparePrintPreview: document.getElementById("sparePrintPreview"),
    sparePrintModalMsg: document.getElementById("sparePrintModalMsg"),
    sparePrintModalPrintBtn: document.getElementById("sparePrintModalPrintBtn"),
    sparePrintModalCancelBtn: document.getElementById("sparePrintModalCancelBtn"),
    printArea: document.getElementById("printArea")
  };

  function trim(v) {
    return (v === null || v === undefined ? "" : String(v)).trim();
  }

  function splitLine(line) {
    var delimiter = line.indexOf("\t") !== -1 ? "\t" : ",";
    return line.split(delimiter).map(trim);
  }

  function textToMatrix(text) {
    return text
      .split(/\r\n|\r|\n/)
      .filter(function (line) { return line.trim().length > 0; })
      .map(splitLine);
  }

  // 존 원본 값에서 "숫자+글자"(글자 뒤 숫자는 버림, 예: 53L106 → 53L) 또는
  // "글자+숫자"(숫자까지 포함, 예: AGV1-1 → AGV1) 패턴 중 첫 매치만 추출.
  // 매치가 없으면(이미 깨끗하거나 패턴이 없는 값) 원본 그대로 사용.
  function normalizeZone(raw) {
    var s = String(raw || "").trim();
    var m = s.match(/\d+[A-Za-z]+|[A-Za-z]+\d+/);
    return m ? m[0] : s;
  }

  function matrixToRows(matrix) {
    if (!matrix.length) {
      return { rows: [], error: "데이터가 비어 있습니다." };
    }
    var header = matrix[0];
    var colIndex = {};
    COLUMNS.forEach(function (col) {
      var idx = header.findIndex(function (h) { return h === col.label; });
      if (idx !== -1) colIndex[col.key] = idx;
    });

    var missing = COLUMNS.filter(function (col) {
      return colIndex[col.key] === undefined;
    });
    if (missing.length) {
      return {
        rows: [],
        error: "머리글에서 다음 컬럼을 찾을 수 없습니다: " + missing.map(function (c) { return c.label; }).join(", ")
      };
    }

    var rows = [];
    for (var i = 1; i < matrix.length; i++) {
      var line = matrix[i];
      if (line.every(function (c) { return c === ""; })) continue;
      var obj = { id: nextRowId() };
      COLUMNS.forEach(function (col) {
        var raw = trim(line[colIndex[col.key]]);
        if (col.type === "number") {
          var n = parseFloat(raw.replace(/,/g, ""));
          obj[col.key] = isNaN(n) ? 0 : n;
        } else if (col.key === "zone") {
          obj[col.key] = normalizeZone(raw);
        } else {
          obj[col.key] = raw;
        }
      });
      rows.push(obj);
    }
    return { rows: rows, error: null };
  }

  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      state.rows = raw ? JSON.parse(raw) : [];
    } catch (e) {
      state.rows = [];
    }
    // 구버전 데이터(id 없음) 백필 + rowIdSeq를 기존 최대 id보다 크게 보정해
    // 새로 추가되는 행의 id가 기존 것과 겹치지 않게 한다.
    var maxSeq = 0;
    state.rows.forEach(function (r) {
      if (typeof r.id === "string") {
        var n = parseInt(r.id.replace(/^r/, ""), 10);
        if (!isNaN(n) && n > maxSeq) maxSeq = n;
      }
    });
    rowIdSeq = maxSeq;
    state.rows.forEach(function (r) {
      if (!r.id) r.id = nextRowId();
    });
  }

  function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.rows));
  }

  // 정렬 상태(state.sortRules)는 기존엔 저장되지 않아 브라우저가 새로고침되면
  // (모바일에서 다른 앱 갔다 오는 사이 탭이 새로고침되는 경우 포함) 기본 정렬로
  // 되돌아갔다 — 집품 데이터(state.rows)와 마찬가지로 localStorage에 저장/복원한다.
  // 커스텀 할당 화면 전용 정렬(rowPickerSortRules)은 이 화면(홈)과 무관한 별도
  // 상태라 대상이 아니다.
  function saveSortRules() {
    localStorage.setItem(SORT_RULES_KEY, JSON.stringify(state.sortRules));
    localStorage.setItem(ZONE_O_PRIORITY_KEY, state.zoneOPriority ? "1" : "");
  }

  function loadSortRules() {
    try {
      var raw = localStorage.getItem(SORT_RULES_KEY);
      if (raw) state.sortRules = JSON.parse(raw);
    } catch (e) {
      // 저장된 값이 손상됐으면 state의 기본 정렬을 그대로 사용
    }
    state.zoneOPriority = localStorage.getItem(ZONE_O_PRIORITY_KEY) === "1";
  }

  function setStatusMsg(msg, kind) {
    var color = kind === "error" ? "text-rose-600" : kind === "ok" ? "text-emerald-600" : "text-slate-500";
    els.statusMsg.textContent = msg || "";
    els.statusMsg.className = "text-xs " + color;
  }

  function applyParsedRows(rows) {
    var existingKeys = {};
    state.rows.forEach(function (r) { existingKeys[dedupKey(r)] = true; });
    var added = [];
    var skipped = 0;
    rows.forEach(function (r) {
      var key = dedupKey(r);
      if (existingKeys[key]) { skipped++; return; }
      existingKeys[key] = true;
      added.push(r);
    });
    state.rows = state.rows.concat(added);
    saveToStorage();
    Pick.refreshAll();
    return { added: added.length, skipped: skipped };
  }

  function handleParsedMatrix(matrix, sourceLabel) {
    var result = matrixToRows(matrix);
    if (result.error) {
      setStatusMsg(result.error, "error");
      return;
    }
    if (!result.rows.length) {
      setStatusMsg("적용할 데이터가 없습니다.", "error");
      return;
    }
    var applyResult = applyParsedRows(result.rows);
    setStatusMsg(sourceLabel + "에서 " + applyResult.added + "건을 추가했습니다." +
      (applyResult.skipped ? " (중복 " + applyResult.skipped + "건 제외)" : ""), "ok");
  }

  function handleFile(file) {
    if (!file) return;
    els.fileName.textContent = file.name;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = new Uint8Array(e.target.result);
        var wb = XLSX.read(data, { type: "array" });
        var wsName = wb.SheetNames[0];
        var ws = wb.Sheets[wsName];
        var matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
        handleParsedMatrix(matrix, "엑셀 파일");
      } catch (err) {
        setStatusMsg("엑셀 파일을 읽는 중 오류가 발생했습니다: " + err.message, "error");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function uniqueValuesFrom(rows, getter) {
    var set = {};
    rows.forEach(function (r) {
      var v = getter(r);
      if (v !== "" && v !== null && v !== undefined) set[v] = true;
    });
    return Object.keys(set).sort();
  }

  // 여러 형식(연-월-일 시:분, 또는 Date가 파싱 가능한 그 외 형식)의 날짜 문자열을
  // Date 객체로 변환. Pick.formatMonthDay/getCreatedDate가 공통으로 사용.
  function parseFlexibleDate(str) {
    var raw = String(str || "").trim();
    var m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    var parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  // 생성일시(createdAt)에서 시간을 뺀 날짜 부분만 "YYYY-MM-DD"로 반환 — 중복제거,
  // 날짜별 탭, 집품 할당의 생성일자 선택에서 공통으로 쓰는 그룹핑 키.
  function getCreatedDate(row) {
    var d = parseFlexibleDate(row && row.createdAt);
    if (!d) return String((row && row.createdAt) || "");
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // 현재 활성 날짜 탭(state.activeDateTab)으로 좁혀진 행 — null이면 전체
  function getDateScopedRows() {
    if (state.activeDateTab === null) return state.rows;
    return state.rows.filter(function (r) { return getCreatedDate(r) === state.activeDateTab; });
  }

  // 업로드 중복 판정 키: 그룹번호 + 생성일자 + 업체명 + 존
  function dedupKey(r) {
    return r.groupNo + "|" + getCreatedDate(r) + "|" + r.company + "|" + r.zone;
  }

  function uniqueValues(key) {
    var values = uniqueValuesFrom(getDateScopedRows(), function (r) { return r[key]; });
    var col = COLUMNS.find(function (c) { return c.key === key; });
    if (col && col.type === "number") {
      values.sort(function (a, b) { return parseFloat(a) - parseFloat(b); });
    }
    return values;
  }

  // rows를 필터링하되 exceptKey 컬럼의 필터는 건너뛴다 — 그 컬럼 자신의 드롭다운
  // 후보값을 "다른 필터가 전부 적용된 상태" 기준으로 계산하기 위함(엑셀 자동필터처럼
  // 캐스케이딩: 다른 필터를 걸면 이 필터에는 이제 나올 수 없는 값이 안 보인다).
  function filterRowsExceptKey(rows, columns, filters, exceptKey) {
    return rows.filter(function (r) {
      for (var i = 0; i < columns.length; i++) {
        var col = columns[i];
        if (col.key === exceptKey) continue;
        var filterSet = filters[col.key];
        if (filterSet === null || filterSet === undefined) continue;
        if (!filterSet.has(String(r[col.key]))) return false;
      }
      return true;
    });
  }

  function getPreFilteredRowsFrom(baseRows) {
    return filterRowsExceptKey(baseRows, COLUMNS, state.filters);
  }

  function computeGroupCompanyTotals(rows) {
    var map = {};
    rows.forEach(function (r) {
      var k = r.groupNo + "" + r.company;
      map[k] = (map[k] || 0) + (r.quantity || 0);
    });
    return map;
  }

  // 헤더 필터 드롭다운의 후보값 목록 — 엑셀 자동필터처럼, key 자신의 필터를 뺀
  // 나머지 모든 활성 필터(원본 9개 컬럼 + 파생 groupCompanyTotal 컬럼)를 반영해서
  // 계산한다. 그래야 존 필터를 걸면 수량 필터 후보값이 그 존에 실제 존재하는
  // 수량으로만 좁혀지는 식의 캐스케이딩이 된다.
  function getCandidateValues(key) {
    var exceptRegular = filterRowsExceptKey(getDateScopedRows(), COLUMNS, state.filters, key);
    var gcMap = computeGroupCompanyTotals(exceptRegular);
    var withAgg = exceptRegular.map(function (r) {
      var clone = Object.assign({}, r);
      clone.groupCompanyTotal = gcMap[r.groupNo + "" + r.company];
      return clone;
    });
    if (key === AGG_COLUMN.key) {
      return uniqueValuesFrom(withAgg, function (r) { return r.groupCompanyTotal; })
        .sort(function (a, b) { return parseFloat(a) - parseFloat(b); });
    }
    var aggFilterSet = state.filters[AGG_COLUMN.key];
    var rowsForKey = (aggFilterSet === null || aggFilterSet === undefined)
      ? withAgg
      : withAgg.filter(function (r) { return aggFilterSet.has(String(r.groupCompanyTotal)); });
    var values = uniqueValuesFrom(rowsForKey, function (r) { return r[key]; });
    var col = COLUMNS.find(function (c) { return c.key === key; });
    if (col && col.type === "number") {
      values.sort(function (a, b) { return parseFloat(a) - parseFloat(b); });
    }
    return values;
  }

  // 컬럼 필터 + 집계(groupCompanyTotal) 필터를 baseRows 위에 적용 — 홈 화면
  // (날짜 탭으로 스코프된 행)과 집품 할당(날짜 탭과 무관, 자체 생성일자 선택)이
  // 서로 다른 baseRows로 재사용
  function computeFilteredRows(baseRows) {
    var preFiltered = getPreFilteredRowsFrom(baseRows);
    var gcMap = computeGroupCompanyTotals(preFiltered);
    var withAgg = preFiltered.map(function (r) {
      var clone = Object.assign({}, r);
      clone.groupCompanyTotal = gcMap[r.groupNo + "" + r.company];
      return clone;
    });
    var aggFilterSet = state.filters[AGG_COLUMN.key];
    if (aggFilterSet === null || aggFilterSet === undefined) return withAgg;
    return withAgg.filter(function (r) { return aggFilterSet.has(String(r.groupCompanyTotal)); });
  }

  function getFilteredRows() {
    return computeFilteredRows(getDateScopedRows());
  }

  // 집품 할당 전용 — 컬럼/집계 필터는 반영하되 홈 화면의 활성 날짜 탭 스코프는
  // 배제(집품 할당은 자체 생성일자 다중 선택으로 별도 범위를 지정하므로)
  function getAssignBaseRows() {
    return computeFilteredRows(state.rows);
  }

  // --- 정렬 (테이블 헤더 라벨 클릭 + 별도 다중 정렬 영역) ---

  // 헤더를 클릭하면 그 열 하나만으로 정렬(이미 그 열 단독 정렬 중이면 방향 토글) —
  // 정렬 영역(#sortRulesContainer)에서 여러 기준을 관리하는 것과 같은 state.sortRules를
  // 공유하므로 항상 서로 동기화된다.
  function setupSortLabels() {
    Array.prototype.forEach.call(els.theadRow.querySelectorAll("th[data-key]"), function (th) {
      var key = th.dataset.key;
      th.addEventListener("click", function () {
        if (state.sortRules.length === 1 && state.sortRules[0].key === key) {
          state.sortRules[0].dir *= -1;
        } else {
          state.sortRules = [{ key: key, dir: 1 }];
        }
        Pick.refreshAll();
      });
    });
  }

  function updateSortHeaderClasses() {
    Array.prototype.forEach.call(els.theadRow.querySelectorAll("th[data-key]"), function (th) {
      var key = th.dataset.key;
      var label = th.querySelector(".th-label");
      var arrow = label.querySelector(".sort-arrow");
      var ruleIdx = state.sortRules.findIndex(function (r) { return r.key === key; });
      if (ruleIdx !== -1) {
        if (!arrow) {
          arrow = document.createElement("span");
          arrow.className = "sort-arrow ml-1 text-indigo-600";
          label.appendChild(arrow);
        }
        var dirArrow = state.sortRules[ruleIdx].dir === 1 ? "▲" : "▼";
        arrow.textContent = state.sortRules.length > 1 ? (ruleIdx + 1) + dirArrow : dirArrow;
      } else if (arrow) {
        arrow.remove();
      }
    });
  }

  // 필터바처럼 별도 영역에서 여러 정렬 기준을 명시적으로 추가/삭제/방향 전환하는
  // 컨트롤러 팩토리 — 홈과 커스텀 할당 모달이 각자의 정렬 규칙 배열/컨테이너로
  // 독립적으로 인스턴스화한다. 홈은 테이블 헤더 클릭(setupSortLabels)과도 같은
  // state.sortRules를 공유해 항상 동기화된다.
  function createSortBarController(options) {
    // options: { columns, containerEl, addBtn, resetBtn, getSortRules(), setSortRules(rules), onApply() }
    function render() {
      var rules = options.getSortRules();
      if (!rules.length) {
        options.containerEl.innerHTML = '<span class="text-xs text-slate-400">정렬 기준 없음</span>';
        return;
      }
      options.containerEl.innerHTML = rules.map(function (rule, idx) {
        var colOptions = options.columns.map(function (c) {
          return '<option value="' + c.key + '"' + (c.key === rule.key ? " selected" : "") + '>' + c.label + "</option>";
        }).join("");
        var dirLabel = rule.dir === 1 ? "오름차순 ▲" : "내림차순 ▼";
        return (
          '<span class="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-lg pl-2 pr-1 py-1">' +
          '<span class="text-xs font-bold text-indigo-600">' + (idx + 1) + "</span>" +
          '<select class="sort-rule-key bg-white border border-slate-200 rounded-md px-1.5 py-1 text-xs" data-idx="' + idx + '">' + colOptions + "</select>" +
          '<button type="button" class="sort-rule-dir-btn text-xs font-medium text-indigo-700 px-1.5 py-1 hover:bg-indigo-100 rounded-md" data-idx="' + idx + '">' + dirLabel + "</button>" +
          '<button type="button" class="sort-rule-remove-btn text-slate-400 hover:text-rose-500 px-1" data-idx="' + idx + '">✕</button>' +
          "</span>"
        );
      }).join("");

      Array.prototype.forEach.call(options.containerEl.querySelectorAll(".sort-rule-key"), function (sel) {
        sel.addEventListener("change", function () {
          options.getSortRules()[parseInt(sel.dataset.idx, 10)].key = sel.value;
          options.onApply();
        });
      });
      Array.prototype.forEach.call(options.containerEl.querySelectorAll(".sort-rule-dir-btn"), function (btn) {
        btn.addEventListener("click", function () {
          options.getSortRules()[parseInt(btn.dataset.idx, 10)].dir *= -1;
          options.onApply();
        });
      });
      Array.prototype.forEach.call(options.containerEl.querySelectorAll(".sort-rule-remove-btn"), function (btn) {
        btn.addEventListener("click", function () {
          options.getSortRules().splice(parseInt(btn.dataset.idx, 10), 1);
          options.onApply();
        });
      });
    }

    if (options.addBtn) {
      options.addBtn.addEventListener("click", function () {
        var rules = options.getSortRules();
        var usedKeys = rules.map(function (r) { return r.key; });
        var nextCol = options.columns.find(function (c) { return usedKeys.indexOf(c.key) === -1; }) || options.columns[0];
        rules.push({ key: nextCol.key, dir: 1 });
        options.onApply();
      });
    }
    if (options.resetBtn) {
      options.resetBtn.addEventListener("click", function () {
        options.setSortRules([]);
        if (options.onResetExtra) options.onResetExtra();
        options.onApply();
      });
    }

    return { render: render };
  }

  var homeSortBarController = createSortBarController({
    columns: ALL_COLUMNS,
    containerEl: els.sortRulesContainer,
    addBtn: els.sortAddBtn,
    resetBtn: els.sortResetBtn,
    getSortRules: function () { return state.sortRules; },
    setSortRules: function (rules) { state.sortRules = rules; },
    // "정렬 초기화"는 O존 우선 정렬도 함께 끄는 게 자연스러움 — 커스텀 할당 쪽
    // 컨트롤러는 이 옵션을 넘기지 않아 rowPickerZoneOPriority에는 영향 없음.
    onResetExtra: function () { state.zoneOPriority = false; },
    onApply: function () { Pick.refreshAll(); }
  });

  // --- 필터 바 컨트롤러 팩토리 (검색 + 다중 선택, "적용" 버튼을 눌러야 실제 반영) ---
  // 홈 화면과 커스텀 할당 모달이 서로 다른 컬럼/상태/컨테이너로 각각 인스턴스화해서
  // 쓸 수 있도록 일반화됨 — 두 화면의 필터가 서로 독립적으로 동작한다.
  function createFilterBarController(options) {
    // options: { columns, containerEl, resetBtn, getFilters(), setFilter(key, valueOrNull), getCandidateValues(key), onApply() }
    var filterEls = {};
    var pendingDrafts = {}; // key -> Set, 드롭다운이 열려있는 동안의 임시 선택 상태(미적용)

    function getEffectiveSet(key) {
      if (pendingDrafts[key]) return new Set(pendingDrafts[key]);
      var s = options.getFilters()[key];
      if (s === null || s === undefined) return new Set(options.getCandidateValues(key));
      return new Set(s);
    }

    function getSearchedValues(key, term) {
      var values = options.getCandidateValues(key);
      if (!term) return values;
      var lower = term.toLowerCase();
      return values.filter(function (v) { return String(v).toLowerCase().indexOf(lower) !== -1; });
    }

    function commitFilterSet(key, set) {
      var allValues = options.getCandidateValues(key);
      options.setFilter(key, set.size === allValues.length ? null : set);
    }

    function buildDropdown(key) {
      var div = document.createElement("div");
      div.className = "th-filter-dropdown hidden absolute top-full left-0 mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-56 font-normal whitespace-normal text-left";
      div.innerHTML =
        '<input type="text" class="th-filter-search w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs mb-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="검색...">' +
        '<label class="flex items-center gap-1.5 text-xs pb-1.5 mb-1.5 border-b border-slate-200 text-slate-500"><input type="checkbox" class="th-filter-selectall-cb accent-indigo-600"> 전체 선택</label>' +
        '<div class="th-filter-list max-h-44 overflow-y-auto flex flex-col gap-1"></div>' +
        '<div class="flex gap-2 mt-2 pt-2 border-t border-slate-200">' +
        '<button type="button" class="th-filter-apply flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg py-1.5 transition-colors">적용</button>' +
        '<button type="button" class="th-filter-reset flex-1 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-xs font-semibold rounded-lg py-1.5 transition-colors">초기화</button>' +
        "</div>";
      div.addEventListener("click", function (e) { e.stopPropagation(); });

      var searchInput = div.querySelector(".th-filter-search");
      var selectAllCb = div.querySelector(".th-filter-selectall-cb");

      searchInput.addEventListener("input", debounce(function () {
        var term = searchInput.value;
        var visible = getSearchedValues(key, term);
        pendingDrafts[key] = new Set(visible);
        renderDropdownItems(key);
      }, 150));

      selectAllCb.addEventListener("change", function () {
        var term = searchInput.value;
        var visible = getSearchedValues(key, term);
        var set = getEffectiveSet(key);
        visible.forEach(function (v) {
          if (selectAllCb.checked) set.add(v); else set.delete(v);
        });
        pendingDrafts[key] = set;
        renderDropdownItems(key);
      });

      div.querySelector(".th-filter-apply").addEventListener("click", function () {
        if (pendingDrafts[key]) {
          commitFilterSet(key, pendingDrafts[key]);
          delete pendingDrafts[key];
          options.onApply();
        }
        closeDropdown(key);
      });

      div.querySelector(".th-filter-reset").addEventListener("click", function () {
        options.setFilter(key, null);
        delete pendingDrafts[key];
        renderDropdownItems(key);
        options.onApply();
      });

      return div;
    }

    function renderDropdownItems(key) {
      var entry = filterEls[key];
      var dropdown = entry.dropdown;
      var searchInput = dropdown.querySelector(".th-filter-search");
      var selectAllCb = dropdown.querySelector(".th-filter-selectall-cb");
      var listEl = dropdown.querySelector(".th-filter-list");
      var term = searchInput.value;
      var visible = getSearchedValues(key, term);
      var effectiveSet = getEffectiveSet(key);
      var col = options.columns.find(function (c) { return c.key === key; });

      listEl.innerHTML = visible.map(function (v) {
        var checked = effectiveSet.has(v) ? " checked" : "";
        var displayText = (col && col.type === "date") ? Pick.formatDateOnly(v) : v;
        return (
          '<label class="th-filter-item flex items-center gap-1.5 text-xs text-slate-700"><input type="checkbox" class="th-filter-item-cb accent-indigo-600" value="' + escapeHtml(v) + '"' + checked + "> " + escapeHtml(displayText) + "</label>"
        );
      }).join("");

      var visibleCheckedCount = visible.filter(function (v) { return effectiveSet.has(v); }).length;
      selectAllCb.checked = visible.length > 0 && visibleCheckedCount === visible.length;
      selectAllCb.indeterminate = visibleCheckedCount > 0 && visibleCheckedCount < visible.length;

      Array.prototype.forEach.call(listEl.querySelectorAll(".th-filter-item-cb"), function (cb) {
        cb.addEventListener("change", function () {
          var set = getEffectiveSet(key);
          if (cb.checked) set.add(cb.value); else set.delete(cb.value);
          pendingDrafts[key] = set;
          renderDropdownItems(key);
        });
      });
    }

    function openDropdown(key) {
      Object.keys(filterEls).forEach(function (k) {
        if (k !== key && filterEls[k].dropdown && !filterEls[k].dropdown.classList.contains("hidden")) {
          closeDropdown(k);
        }
      });
      var entry = filterEls[key];
      if (!entry.dropdown) {
        entry.dropdown = buildDropdown(key);
        entry.wrapper.appendChild(entry.dropdown);
      }
      delete pendingDrafts[key]; // 매번 열 때 커밋된 상태에서 새로 시작
      renderDropdownItems(key);
      entry.dropdown.classList.remove("hidden");
    }

    function closeDropdown(key) {
      var entry = filterEls[key];
      if (!entry.dropdown || entry.dropdown.classList.contains("hidden")) return;
      entry.dropdown.classList.add("hidden");
      delete pendingDrafts[key]; // 적용 없이 닫으면 임시 선택은 버림
      var searchInput = entry.dropdown.querySelector(".th-filter-search");
      if (searchInput) searchInput.value = ""; // 검색창에 직접 입력한 검색어도 닫으면 초기화
    }

    function toggleDropdown(key) {
      var entry = filterEls[key];
      var isHidden = !entry.dropdown || entry.dropdown.classList.contains("hidden");
      if (isHidden) {
        openDropdown(key);
      } else {
        closeDropdown(key);
      }
    }

    function updateButtonStates() {
      Object.keys(filterEls).forEach(function (key) {
        var btn = filterEls[key].btn;
        var filters = options.getFilters();
        var active = filters[key] !== null && filters[key] !== undefined;
        var col = options.columns.find(function (c) { return c.key === key; });
        btn.className = active ? FILTER_BTN_ACTIVE : FILTER_BTN_INACTIVE;
        btn.innerHTML = escapeHtml(col.label) + ' <span class="text-[9px]">▾</span>';
      });
    }

    function setup() {
      options.columns.forEach(function (col) {
        var wrapper = document.createElement("div");
        wrapper.className = "relative inline-block";
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = FILTER_BTN_INACTIVE;
        btn.dataset.key = col.key;
        btn.innerHTML = escapeHtml(col.label) + ' <span class="text-[9px]">▾</span>';
        wrapper.appendChild(btn);
        options.containerEl.appendChild(wrapper);
        filterEls[col.key] = { wrapper: wrapper, btn: btn, dropdown: null };

        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          toggleDropdown(col.key);
        });
      });

      document.addEventListener("click", function (e) {
        Object.keys(filterEls).forEach(function (key) {
          var entry = filterEls[key];
          if (entry.dropdown && !entry.dropdown.classList.contains("hidden") && !entry.dropdown.contains(e.target) && e.target !== entry.btn) {
            closeDropdown(key);
          }
        });
      });

      if (options.resetBtn) {
        options.resetBtn.addEventListener("click", function () {
          Object.keys(filterEls).forEach(function (key) { closeDropdown(key); });
          options.columns.forEach(function (c) { options.setFilter(c.key, null); });
          pendingDrafts = {};
          options.onApply();
        });
      }
    }

    function hasActiveFilterFn() {
      var filters = options.getFilters();
      return options.columns.some(function (c) { return filters[c.key] !== null && filters[c.key] !== undefined; });
    }

    return { setup: setup, updateButtonStates: updateButtonStates, hasActiveFilter: hasActiveFilterFn };
  }

  var homeFilterBarController = createFilterBarController({
    columns: ALL_COLUMNS,
    containerEl: els.filterButtonsContainer,
    resetBtn: els.filterResetAllBtn,
    getFilters: function () { return state.filters; },
    setFilter: function (key, value) { state.filters[key] = value; },
    getCandidateValues: getCandidateValues,
    onApply: function () { Pick.refreshAll(); }
  });

  // 정식 집품 할당(층수 입력 방식)은 getAssignBaseRows()가 computeFilteredRows()를
  // 거치므로, 홈 목록에 필터가 걸려 있으면 필터링된 일부 데이터만 할당 대상이 됨 —
  // 이를 모르고 진행하는 실수를 막기 위해 필터 활성 여부를 확인하는 데 사용.
  function hasActiveFilter() {
    return homeFilterBarController.hasActiveFilter();
  }

  function updateStatusBadgeMap() {
    var statuses = uniqueValues("status");
    var map = {};
    statuses.forEach(function (s, i) {
      map[s] = BADGE_CLASSES[i % BADGE_CLASSES.length];
    });
    state.statusBadgeMap = map;
  }

  // 존 코드에서 숫자(층코드)를 제거한 알파벳 부분이 정확히 "O"인지 판별 —
  // 존은 "72K", "72A"처럼 층코드+알파벳 형태이고 O존도 "72O", "73O"처럼 층코드가 붙어 있음.
  function isOZone(zone) {
    return String(zone || "").replace(/[0-9]/g, "").trim().toUpperCase() === "O";
  }

  // 존 문자열에서 층 번호를 우선 숫자로 비교하고(9 -> 10 -> 72), 층이 같을 때만
  // 문자열로 비교 — 순수 문자열(사전식) 비교로는 "10A"가 "9A"보다 앞서는 등
  // 자릿수가 다른 층 번호에서 사람이 기대하는 순서와 어긋나는 문제를 해결한다.
  function compareZoneAscending(za, zb) {
    var sa = String(za || "").trim();
    var sb = String(zb || "").trim();
    var floorA = getFloor(sa);
    var floorB = getFloor(sb);
    var numA = floorSortKey(floorA);
    var numB = floorSortKey(floorB);
    if (numA !== numB) return numA - numB;
    if (floorA !== floorB) return floorA.localeCompare(floorB, "ko");
    return sa.localeCompare(sb, "ko");
  }

  // 이미 배정된 작업자/할당에 행을 추가·이동할 때 단순히 배열 끝에 push하면 존
  // 순서가 흐트러지므로, 합친 뒤 배열 전체를 존 오름차순으로 다시 정렬한다.
  // Array.prototype.sort는 안정 정렬이라 같은 존을 가진 기존 행들의 상대 순서는 유지된다.
  // targetArray에 이미 같은 id의 행이 있으면 건너뛴다 — 같은 행이 다른 작업자로
  // "이동"되거나 "할당 추가"될 때, 도착 쪽에 이미 그 행이 있으면(예: 두 작업자에게
  // 같은 행이 각각 배정돼 있던 상태) 중복으로 두 번 표시되는 것을 막는다.
  function insertRowsSortedByZone(targetArray, rowsToInsert) {
    var existingIds = new Set(targetArray.map(function (r) { return r.id; }));
    var toInsert = rowsToInsert.filter(function (r) { return !existingIds.has(r.id); });
    targetArray.push.apply(targetArray, toInsert);
    targetArray.sort(function (a, b) { return compareZoneAscending(a.zone, b.zone); });
    return toInsert.length;
  }

  // 72/73층(알파벳 제거한 층코드가 "7"로 시작)에서는 실제 동선상 O존을 가장 먼저
  // 지나가므로, zoneOPriority 버튼을 누르면 같은 층 안에서 O존(예: 72O, 73O)을
  // 그 층의 다른 존(72K, 72A 등)보다 앞으로 보낸다. 층이 다르면(72층 vs 73층 등)
  // 층끼리의 상대적 순서는 건드리지 않고 숫자 기준 오름차순을 그대로 유지.
  function compareZoneWithOPriority(za, zb) {
    var sa = String(za || "").trim();
    var sb = String(zb || "").trim();
    var floorA = getFloor(sa);
    var floorB = getFloor(sb);
    if (floorA === floorB && /^7/.test(floorA)) {
      var aIsO = isOZone(sa);
      var bIsO = isOZone(sb);
      if (aIsO && !bIsO) return -1;
      if (bIsO && !aIsO) return 1;
    }
    return compareZoneAscending(sa, sb);
  }

  function compareValues(a, b, col, zoneOPriority) {
    if (col.type === "number") {
      return (a[col.key] || 0) - (b[col.key] || 0);
    }
    if (col.type === "date") {
      var ta = Date.parse(a[col.key]);
      var tb = Date.parse(b[col.key]);
      if (!isNaN(ta) && !isNaN(tb)) return ta - tb;
    }
    if (col.key === "zone") {
      return zoneOPriority
        ? compareZoneWithOPriority(a[col.key], b[col.key])
        : compareZoneAscending(a[col.key], b[col.key]);
    }
    return String(a[col.key]).localeCompare(String(b[col.key]), "ko");
  }

  function getSortedRows(rows) {
    var activeRules = state.sortRules
      .map(function (rule) { return { col: ALL_COLUMNS.find(function (c) { return c.key === rule.key; }), dir: rule.dir }; })
      .filter(function (r) { return r.col; });
    if (!activeRules.length) return rows;
    var copy = rows.slice();
    copy.sort(function (a, b) {
      for (var i = 0; i < activeRules.length; i++) {
        var diff = compareValues(a, b, activeRules[i].col, state.zoneOPriority) * activeRules[i].dir;
        if (diff !== 0) return diff;
      }
      return 0;
    });
    return copy;
  }

  function getFloor(zone) {
    var s = String(zone || "").trim();
    if (!s) return "(미지정)";
    if (/^[A-Za-z]/.test(s)) return s;
    var f = s.replace(/[A-Za-z]/g, "").trim();
    return f || "(미지정)";
  }

  function floorSortKey(label) {
    var n = parseFloat(label);
    return isNaN(n) ? Infinity : n;
  }

  function sumQty(rows) {
    return rows.reduce(function (sum, r) { return sum + (r.quantity || 0); }, 0);
  }

  function renderFilterQtySummary(filteredRows, unfilteredRows) {
    els.filterQtySummary.textContent =
      "필터 적용: " + filteredRows.length.toLocaleString("ko-KR") + "행 · " + sumQty(filteredRows).toLocaleString("ko-KR") + "개 · " +
      "전체: " + unfilteredRows.length.toLocaleString("ko-KR") + "행 · " + sumQty(unfilteredRows).toLocaleString("ko-KR") + "개";
  }

  // 층 코드의 첫 글자가 숫자면 그 숫자를 "층대" 키로 추출(72→"7", 73→"7", 9→"9",
  // 10→"1") — 72층/73층처럼 첫자리가 같은 여러 층을 묶어 보여주기 위함. 문자로
  // 시작하는 층 코드나 "(미지정)"은 묶을 대상이 아니므로 null을 반환한다.
  function getFloorFamily(floor) {
    var m = String(floor || "").match(/^\d/);
    return m ? m[0] : null;
  }

  function renderFloorPanel(rows, unfilteredRows) {
    var byFloor = {};
    rows.forEach(function (r) {
      var floor = getFloor(r.zone);
      byFloor[floor] = (byFloor[floor] || 0) + (r.quantity || 0);
    });
    var floors = Object.keys(byFloor).sort(function (a, b) { return floorSortKey(a) - floorSortKey(b); });

    // 실제로 같은 첫자리를 공유하는 층이 2개 이상일 때만 "층대" 합계를 보여준다 —
    // 층이 하나뿐이면 "N층대"가 "N층"과 완전히 같은 값이라 중복 표시가 된다.
    var familyQty = {};
    var familyMembers = {};
    floors.forEach(function (f) {
      var family = getFloorFamily(f);
      if (!family) return;
      familyQty[family] = (familyQty[family] || 0) + byFloor[f];
      familyMembers[family] = familyMembers[family] || [];
      familyMembers[family].push(f);
    });
    var multiFamilies = Object.keys(familyQty).filter(function (fam) { return familyMembers[fam].length > 1; });

    var totalQty = floors.reduce(function (sum, f) { return sum + byFloor[f]; }, 0);
    els.floorTotalQty.textContent = totalQty.toLocaleString("ko-KR") + "개";
    els.floorUnfilteredQty.textContent = sumQty(unfilteredRows).toLocaleString("ko-KR") + "개";

    var labor = parseFloat(els.laborInput.value);
    var hasLabor = !isNaN(labor) && labor > 0 && totalQty > 0;
    var perPersonText = hasLabor ? Math.round(totalQty / labor).toLocaleString("ko-KR") + "개" : "-";
    els.floorPerPersonQty.textContent = perPersonText;
    var maxQty = floors.reduce(function (m, f) { return Math.max(m, byFloor[f]); }, 0) || 1;

    var familySummaryText = multiFamilies
      .sort(function (a, b) { return floorSortKey(a) - floorSortKey(b); })
      .map(function (fam) { return fam + "층대 " + familyQty[fam].toLocaleString("ko-KR") + "개"; })
      .join(" · ");
    var floorSummaryText = floors.map(function (f) { return f + "층 " + byFloor[f].toLocaleString("ko-KR") + "개"; }).join(" · ");
    els.floorPanelSummary.textContent = floors.length
      ? (familySummaryText ? familySummaryText + " · " : "") + floorSummaryText
      : "데이터 없음";

    var renderedFamilies = {};
    els.floorBars.innerHTML = floors.map(function (f) {
      var qty = byFloor[f];
      var widthPct = (qty / maxQty) * 100;
      var laborHtml;
      var perPersonHtml;
      if (hasLabor) {
        var laborForFloorRaw = labor * (qty / totalQty);
        laborHtml = '<span class="inline-block bg-indigo-50 text-indigo-700 border border-indigo-100 text-sm font-bold px-3 py-1 rounded-full">' + laborForFloorRaw.toFixed(1) + "명</span>";
        var roundedLabor = Math.round(laborForFloorRaw);
        perPersonHtml = roundedLabor > 0
          ? Math.round(qty / roundedLabor).toLocaleString("ko-KR") + "개/인"
          : '<span class="text-slate-400">-</span>';
      } else {
        laborHtml = '<span class="text-slate-400">-</span>';
        perPersonHtml = '<span class="text-slate-400">-</span>';
      }
      var floorRowHtml = (
        '<div class="grid grid-cols-[60px_1fr_90px_110px_100px] items-center gap-2.5 text-xs">' +
        '<div class="text-slate-500 whitespace-nowrap">' + escapeHtml(f) + "층</div>" +
        '<div class="bg-slate-100 rounded-full overflow-hidden h-[10px]"><div class="bg-indigo-500 h-full rounded-full" style="width:' + widthPct + '%"></div></div>' +
        '<div class="text-right tabular-nums text-slate-700">' + qty.toLocaleString("ko-KR") + "개</div>" +
        '<div class="text-right tabular-nums">' + laborHtml + "</div>" +
        '<div class="text-right tabular-nums text-slate-500">' + perPersonHtml + "</div>" +
        "</div>"
      );

      // 이 층이 속한 "층대"를 처음 만나는 시점에, 개별 층 막대들보다 먼저 굵게
      // 강조된 요약 줄(예: "7층대 500개")을 끼워 넣는다. 가운데 칸(막대 자리)에는
      // 진행바 대신 어느 층들이 합쳐졌는지("72층+73층") 보여준다.
      var family = getFloorFamily(f);
      var familyHeaderHtml = "";
      if (family && multiFamilies.indexOf(family) !== -1 && !renderedFamilies[family]) {
        renderedFamilies[family] = true;
        var famQty = familyQty[family];
        var famLaborHtml, famPerPersonHtml;
        if (hasLabor) {
          var famLaborRaw = labor * (famQty / totalQty);
          famLaborHtml = '<span class="inline-block bg-indigo-100 text-indigo-800 border border-indigo-200 text-sm font-bold px-3 py-1 rounded-full">' + famLaborRaw.toFixed(1) + "명</span>";
          var famRoundedLabor = Math.round(famLaborRaw);
          famPerPersonHtml = famRoundedLabor > 0
            ? Math.round(famQty / famRoundedLabor).toLocaleString("ko-KR") + "개/인"
            : '<span class="text-slate-400">-</span>';
        } else {
          famLaborHtml = '<span class="text-slate-400">-</span>';
          famPerPersonHtml = '<span class="text-slate-400">-</span>';
        }
        familyHeaderHtml =
          '<div class="grid grid-cols-[60px_1fr_90px_110px_100px] items-center gap-2.5 text-xs bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1.5">' +
          '<div class="text-indigo-700 font-bold whitespace-nowrap">' + escapeHtml(family) + "층대</div>" +
          '<div class="text-[11px] text-indigo-400 font-medium truncate">' + familyMembers[family].map(function (m) { return escapeHtml(m) + "층"; }).join(" + ") + "</div>" +
          '<div class="text-right tabular-nums font-bold text-indigo-700">' + famQty.toLocaleString("ko-KR") + "개</div>" +
          '<div class="text-right tabular-nums">' + famLaborHtml + "</div>" +
          '<div class="text-right tabular-nums text-indigo-500">' + famPerPersonHtml + "</div>" +
          "</div>";
      }
      return familyHeaderHtml + floorRowHtml;
    }).join("");
  }

  // 접기/펼치기 카드 공용 헬퍼(층별 카드, 업로드 카드) — 라벨/아이콘/본문(+선택적 요약줄)을
  // collapsed 상태에 맞게 갱신. summaryEl이 있으면 접혔을 때만 보이고, 없으면 본문만 토글.
  function applyCardCollapsed(collapsed, toggleLabel, toggleIcon, body, summaryEl) {
    toggleLabel.textContent = collapsed ? "펼치기" : "접기";
    toggleIcon.classList.toggle("-rotate-90", collapsed);
    body.classList.toggle("hidden", collapsed);
    if (summaryEl) summaryEl.classList.toggle("hidden", !collapsed);
  }

  function loadFloorPanelCollapsed() {
    return localStorage.getItem(FLOOR_PANEL_COLLAPSED_KEY) === "1";
  }

  function loadFilterSortCollapsed() {
    var raw = localStorage.getItem(FILTER_SORT_COLLAPSED_KEY);
    return raw === null ? true : raw === "1";
  }

  function updateFilterSortBadge() {
    var filterCount = ALL_COLUMNS.filter(function (c) {
      return state.filters[c.key] !== null && state.filters[c.key] !== undefined;
    }).length;
    var sortCount = state.sortRules.length;
    var parts = [];
    if (filterCount > 0) parts.push("필터 " + filterCount + "개");
    if (sortCount > 0) parts.push("정렬 " + sortCount + "개");
    els.filterSortSummary.textContent = parts.length ? parts.join(" · ") : "필터·정렬 없음";
  }

  function loadUploadCollapsed() {
    return localStorage.getItem(UPLOAD_COLLAPSED_KEY) === "1";
  }

  // --- 생성일자별 탭 (홈) ---

  function saveDateTabState() {
    localStorage.setItem(DATE_TAB_KEY, state.activeDateTab === null ? "" : state.activeDateTab);
  }

  function loadDateTabState() {
    var raw = localStorage.getItem(DATE_TAB_KEY);
    state.activeDateTab = raw ? raw : null;
  }

  function getAllCreatedDates() {
    return uniqueValuesFrom(state.rows, getCreatedDate).sort();
  }

  function renderDateTabs() {
    var dates = getAllCreatedDates();
    els.dateTabsContainer.innerHTML = "";

    var allBtn = document.createElement("button");
    allBtn.className = state.activeDateTab === null ? ASSIGN_TAB_ACTIVE : ASSIGN_TAB_INACTIVE;
    allBtn.innerHTML = "<span>전체</span>";
    allBtn.addEventListener("click", function () {
      state.activeDateTab = null;
      saveDateTabState();
      Pick.refreshAll();
    });
    els.dateTabsContainer.appendChild(allBtn);

    dates.forEach(function (date) {
      var isActive = state.activeDateTab === date;
      var tabBtn = document.createElement("button");
      tabBtn.className = isActive ? ASSIGN_TAB_ACTIVE : ASSIGN_TAB_INACTIVE;
      tabBtn.innerHTML =
        "<span>" + escapeHtml(date) + "</span>" +
        '<span class="date-tab-close text-xs opacity-70 hover:opacity-100 ml-1">✕</span>';
      tabBtn.addEventListener("click", function (e) {
        if (e.target.closest(".date-tab-close")) {
          removeRowsByDate(date);
        } else {
          state.activeDateTab = date;
          saveDateTabState();
          Pick.refreshAll();
        }
      });
      els.dateTabsContainer.appendChild(tabBtn);
    });
  }

  async function removeRowsByDate(date) {
    var count = state.rows.filter(function (r) { return getCreatedDate(r) === date; }).length;
    if (!(await window.confirmModal("생성일자 '" + date + "' 데이터 " + count + "건을 모두 삭제할까요?"))) return;
    state.rows = state.rows.filter(function (r) { return getCreatedDate(r) !== date; });
    if (state.activeDateTab === date) state.activeDateTab = null;
    saveToStorage();
    saveDateTabState();
    Pick.refreshAll();
    if (window.showToast) window.showToast("생성일자 '" + date + "' 데이터 " + count + "건이 삭제되었습니다.", "info");
  }

  // --- 뷰 전환 (홈 / 집품 할당) ---

  function switchView(view) {
    if (window.flashPageLoading) window.flashPageLoading();
    // 홈 화면의 드래그/Ctrl 선택 상태는 홈 화면에서만 유효해야 하므로, 다른
    // 화면으로 이동할 때는 항상 명시적으로 해제한다(Pick.refreshAll()의 암묵적
    // 초기화는 홈이 보일 때만 실행되어 이 경우를 놓친다).
    if (view !== "home") Pick.clearHomeSelection();
    // 커스텀 할당 화면(row-picker)의 마킹/선택 상태도 홈과 마찬가지로 그 화면에서만
    // 유효해야 한다 — 좌측 네비 버튼은 Pick.closeCustomAssignView()를 거치지 않고 이
    // 함수를 직접 호출하므로, 여기서 처리하지 않으면 선택이 다른 화면까지 남는다.
    if (view !== "custom") Pick.clearRowPickerState();
    els.homeView.classList.toggle("hidden", view !== "home");
    els.assignView.classList.toggle("hidden", view !== "assign");
    els.customAssignView.classList.toggle("hidden", view !== "custom");
    if (view === "home") els.homeView.classList.add("animate-fadeIn");
    if (view === "assign") els.assignView.classList.add("animate-fadeIn");
    if (view === "custom") els.customAssignView.classList.add("animate-fadeIn");
    els.navHomeBtn.className = view === "home" ? NAV_BTN_ACTIVE : NAV_BTN_INACTIVE;
    els.navAssignBtn.className = view === "assign" ? NAV_BTN_ACTIVE : NAV_BTN_INACTIVE;
    els.navCustomBtn.className = view === "custom" ? NAV_BTN_ACTIVE : NAV_BTN_INACTIVE;
    // Pick.refreshAll()은 숨겨진 화면의 렌더링을 건너뛰므로, 방금 보이게 된 화면이
    // 숨겨져 있는 동안 놓쳤을 수 있는 갱신을 따라잡도록 전환 직후 한 번 그려준다.
    Pick.refreshAll();
  }

  // --- 집품 할당 ---

  function saveAssignState() {
    localStorage.setItem(ASSIGN_CONFIGS_KEY, JSON.stringify(state.assignConfigs));
    localStorage.setItem(ASSIGN_ACTIVE_KEY, state.assignActiveId === null ? "" : String(state.assignActiveId));
  }

  function loadAssignState() {
    try {
      var raw = localStorage.getItem(ASSIGN_CONFIGS_KEY);
      state.assignConfigs = raw ? JSON.parse(raw) : [];
    } catch (e) {
      state.assignConfigs = [];
    }
    var activeRaw = localStorage.getItem(ASSIGN_ACTIVE_KEY);
    state.assignActiveId = activeRaw ? parseInt(activeRaw, 10) : null;
    if (!state.assignConfigs.some(function (c) { return c.id === state.assignActiveId; })) {
      state.assignActiveId = state.assignConfigs.length ? state.assignConfigs[0].id : null;
    }
    // 구버전 데이터(customSeq 없음) 백필 + customAssignSeq를 기존 최대값보다 크게 보정
    state.assignConfigs.forEach(function (cfg) {
      if (!cfg.custom) return;
      if (cfg.customSeq) {
        customAssignSeq = Math.max(customAssignSeq, cfg.customSeq);
      } else {
        customAssignSeq += 1;
        cfg.customSeq = customAssignSeq;
      }
    });
  }

  // --- 공용 모달 트랜지션 헬퍼 (열기/닫기 시 페이드+스케일) ---
  function openModalWithTransition(modalEl, boxEl) {
    modalEl.classList.remove("hidden");
    modalEl.classList.add("flex");
    requestAnimationFrame(function () {
      modalEl.classList.remove("opacity-0");
      if (boxEl) boxEl.classList.remove("scale-95");
    });
  }

  function closeModalWithTransition(modalEl, boxEl) {
    modalEl.classList.add("opacity-0");
    if (boxEl) boxEl.classList.add("scale-95");
    setTimeout(function () {
      modalEl.classList.add("hidden");
      modalEl.classList.remove("flex");
    }, 200);
  }

  // --- exposed to other js/pick/*.js files via window.Pick ---
  Pick.COLUMNS = COLUMNS;
  Pick.AGG_COLUMN = AGG_COLUMN;
  Pick.ALL_COLUMNS = ALL_COLUMNS;
  Pick.ROW_PICKER_COLUMNS = ROW_PICKER_COLUMNS;
  Pick.LABEL_BARCODE_OPTS = LABEL_BARCODE_OPTS;
  Pick.rowIdSeq = rowIdSeq;
  Pick.nextRowId = nextRowId;
  Pick.nextCustomAssignSeq = nextCustomAssignSeq;
  Pick.customAssignSeq = customAssignSeq;
  Pick.STORAGE_KEY = STORAGE_KEY;
  Pick.SORT_RULES_KEY = SORT_RULES_KEY;
  Pick.ZONE_O_PRIORITY_KEY = ZONE_O_PRIORITY_KEY;
  Pick.LABOR_STORAGE_KEY = LABOR_STORAGE_KEY;
  Pick.ASSIGN_CONFIGS_KEY = ASSIGN_CONFIGS_KEY;
  Pick.ASSIGN_ACTIVE_KEY = ASSIGN_ACTIVE_KEY;
  Pick.DATE_TAB_KEY = DATE_TAB_KEY;
  Pick.GT_CODES_KEY = GT_CODES_KEY;
  Pick.GT_ASSIGNMENTS_KEY = GT_ASSIGNMENTS_KEY;
  Pick.GT_PRINTED_KEY = GT_PRINTED_KEY;
  Pick.LABEL_MARGIN_RIGHT_KEY = LABEL_MARGIN_RIGHT_KEY;
  Pick.LABEL_MARGIN_BOTTOM_KEY = LABEL_MARGIN_BOTTOM_KEY;
  Pick.LABEL_MARGIN_LEFT_KEY = LABEL_MARGIN_LEFT_KEY;
  Pick.LABEL_MARGIN_TOP_KEY = LABEL_MARGIN_TOP_KEY;
  Pick.FLOOR_PANEL_COLLAPSED_KEY = FLOOR_PANEL_COLLAPSED_KEY;
  Pick.UPLOAD_COLLAPSED_KEY = UPLOAD_COLLAPSED_KEY;
  Pick.FILTER_SORT_COLLAPSED_KEY = FILTER_SORT_COLLAPSED_KEY;
  Pick.LABEL_MARGIN_DEFAULT = LABEL_MARGIN_DEFAULT;
  Pick.LABEL_MARGIN_LEFT_TOP_DEFAULT = LABEL_MARGIN_LEFT_TOP_DEFAULT;
  Pick.BADGE_CLASSES = BADGE_CLASSES;
  Pick.FILTER_BTN_INACTIVE = FILTER_BTN_INACTIVE;
  Pick.FILTER_BTN_ACTIVE = FILTER_BTN_ACTIVE;
  Pick.NAV_BTN_ACTIVE = NAV_BTN_ACTIVE;
  Pick.NAV_BTN_INACTIVE = NAV_BTN_INACTIVE;
  Pick.ASSIGN_TAB_ACTIVE = ASSIGN_TAB_ACTIVE;
  Pick.ASSIGN_TAB_INACTIVE = ASSIGN_TAB_INACTIVE;
  Pick.initialFilters = initialFilters;
  Pick.state = state;
  Pick.els = els;
  Pick.trim = trim;
  Pick.splitLine = splitLine;
  Pick.textToMatrix = textToMatrix;
  Pick.normalizeZone = normalizeZone;
  Pick.matrixToRows = matrixToRows;
  Pick.loadFromStorage = loadFromStorage;
  Pick.saveToStorage = saveToStorage;
  Pick.saveSortRules = saveSortRules;
  Pick.loadSortRules = loadSortRules;
  Pick.setStatusMsg = setStatusMsg;
  Pick.applyParsedRows = applyParsedRows;
  Pick.handleParsedMatrix = handleParsedMatrix;
  Pick.handleFile = handleFile;
  Pick.debounce = debounce;
  Pick.escapeHtml = escapeHtml;
  Pick.uniqueValuesFrom = uniqueValuesFrom;
  Pick.parseFlexibleDate = parseFlexibleDate;
  Pick.getCreatedDate = getCreatedDate;
  Pick.getDateScopedRows = getDateScopedRows;
  Pick.dedupKey = dedupKey;
  Pick.uniqueValues = uniqueValues;
  Pick.filterRowsExceptKey = filterRowsExceptKey;
  Pick.getPreFilteredRowsFrom = getPreFilteredRowsFrom;
  Pick.computeGroupCompanyTotals = computeGroupCompanyTotals;
  Pick.getCandidateValues = getCandidateValues;
  Pick.computeFilteredRows = computeFilteredRows;
  Pick.getFilteredRows = getFilteredRows;
  Pick.getAssignBaseRows = getAssignBaseRows;
  Pick.setupSortLabels = setupSortLabels;
  Pick.updateSortHeaderClasses = updateSortHeaderClasses;
  Pick.createSortBarController = createSortBarController;
  Pick.homeSortBarController = homeSortBarController;
  Pick.createFilterBarController = createFilterBarController;
  Pick.homeFilterBarController = homeFilterBarController;
  Pick.hasActiveFilter = hasActiveFilter;
  Pick.updateStatusBadgeMap = updateStatusBadgeMap;
  Pick.isOZone = isOZone;
  Pick.compareZoneAscending = compareZoneAscending;
  Pick.insertRowsSortedByZone = insertRowsSortedByZone;
  Pick.compareZoneWithOPriority = compareZoneWithOPriority;
  Pick.compareValues = compareValues;
  Pick.getSortedRows = getSortedRows;
  Pick.getFloor = getFloor;
  Pick.floorSortKey = floorSortKey;
  Pick.sumQty = sumQty;
  Pick.renderFilterQtySummary = renderFilterQtySummary;
  Pick.renderFloorPanel = renderFloorPanel;
  Pick.applyCardCollapsed = applyCardCollapsed;
  Pick.loadFloorPanelCollapsed = loadFloorPanelCollapsed;
  Pick.loadFilterSortCollapsed = loadFilterSortCollapsed;
  Pick.updateFilterSortBadge = updateFilterSortBadge;
  Pick.loadUploadCollapsed = loadUploadCollapsed;
  Pick.saveDateTabState = saveDateTabState;
  Pick.loadDateTabState = loadDateTabState;
  Pick.getAllCreatedDates = getAllCreatedDates;
  Pick.renderDateTabs = renderDateTabs;
  Pick.switchView = switchView;
  Pick.saveAssignState = saveAssignState;
  Pick.loadAssignState = loadAssignState;
  Pick.openModalWithTransition = openModalWithTransition;
  Pick.closeModalWithTransition = closeModalWithTransition;
  Pick.removeRowsByDate = removeRowsByDate;
})(window.Pick = window.Pick || {});
