(function () {
  "use strict";

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

  var LABEL_BARCODE_OPTS = { fontSize: 25, height: 42, width: 1.3 };

  // 행 고유 id 발급 — 배정(assignConfig)/GT 매칭 키가 배열 위치가 아니라 행 자체를
  // 안정적으로 가리킬 수 있도록 함. loadFromStorage()에서 구버전 데이터에 백필하며
  // 기존 최대 id보다 큰 값에서 시작하도록 rowIdSeq를 보정한다.
  var rowIdSeq = 0;
  function nextRowId() {
    rowIdSeq += 1;
    return "r" + rowIdSeq;
  }

  var STORAGE_KEY = "pickListData";
  var LABOR_STORAGE_KEY = "pickListLaborInput";
  var ASSIGN_CONFIGS_KEY = "pickListAssignConfigs";
  var ASSIGN_ACTIVE_KEY = "pickListAssignActiveId";
  var DATE_TAB_KEY = "pickListActiveDateTab";
  var GT_CODES_KEY = "pickListGtCodes";
  var GT_ASSIGNMENTS_KEY = "pickListGtAssignments";
  var GT_PRINTED_KEY = "pickListGtPrinted";
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
    filters: initialFilters,
    floorExcluded: new Set(),
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
    laborInput: document.getElementById("laborInput"),
    floorTotalQty: document.getElementById("floorTotalQty"),
    floorUnfilteredQty: document.getElementById("floorUnfilteredQty"),
    floorPerPersonQty: document.getElementById("floorPerPersonQty"),
    filterQtySummary: document.getElementById("filterQtySummary"),
    floorBars: document.getElementById("floorBars"),
    dateTabsContainer: document.getElementById("dateTabsContainer"),
    filterBar: document.getElementById("filterBar"),
    filterResetAllBtn: document.getElementById("filterResetAllBtn"),
    table: document.getElementById("dataTable"),
    emptyState: document.getElementById("emptyState"),
    tableBody: document.getElementById("tableBody"),
    theadRow: document.querySelector("#dataTable thead tr"),
    sortRulesContainer: document.getElementById("sortRulesContainer"),
    sortAddBtn: document.getElementById("sortAddBtn"),
    sortResetBtn: document.getElementById("sortResetBtn"),
    navHomeBtn: document.getElementById("navHomeBtn"),
    navAssignBtn: document.getElementById("navAssignBtn"),
    homeView: document.getElementById("homeView"),
    assignView: document.getElementById("assignView"),
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
    assignTableContainer: document.getElementById("assignTableContainer"),
    assignCustomBtn: document.getElementById("assignCustomBtn"),
    rowPickerModal: document.getElementById("rowPickerModal"),
    rowPickerModalBox: document.getElementById("rowPickerModalBox"),
    rowPickerTitle: document.getElementById("rowPickerTitle"),
    rowPickerDateSelect: document.getElementById("rowPickerDateSelect"),
    rowPickerSearchInput: document.getElementById("rowPickerSearchInput"),
    rowPickerAvailableList: document.getElementById("rowPickerAvailableList"),
    rowPickerSelectedList: document.getElementById("rowPickerSelectedList"),
    rowPickerSelectedCount: document.getElementById("rowPickerSelectedCount"),
    rowPickerConfirmBtn: document.getElementById("rowPickerConfirmBtn"),
    rowPickerCancelBtn: document.getElementById("rowPickerCancelBtn"),
    rowPickerCloseBtn: document.getElementById("rowPickerCloseBtn"),
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

  var filterEls = {}; // key -> { wrapper, btn, dropdown }

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
    refreshAll();
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
  // Date 객체로 변환. formatMonthDay/getCreatedDate가 공통으로 사용.
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

  function getPreFilteredRowsFrom(baseRows) {
    return baseRows.filter(function (r) {
      for (var i = 0; i < COLUMNS.length; i++) {
        var col = COLUMNS[i];
        var filterSet = state.filters[col.key];
        if (filterSet === null || filterSet === undefined) continue;
        if (!filterSet.has(String(r[col.key]))) return false;
      }
      return true;
    });
  }

  function computeGroupCompanyTotals(rows) {
    var map = {};
    rows.forEach(function (r) {
      var k = r.groupNo + "" + r.company;
      map[k] = (map[k] || 0) + (r.quantity || 0);
    });
    return map;
  }

  // 헤더 필터 드롭다운의 후보값 목록: 원본 컬럼은 활성 날짜 탭 범위 전체 기준,
  // 파생 컬럼(groupCompanyTotal)은 다른 9개 컬럼 필터만 적용한 중간 결과 기준
  // (자기 자신의 필터와는 순환 참조되지 않도록)
  function getCandidateValues(key) {
    if (key === AGG_COLUMN.key) {
      var preFiltered = getPreFilteredRowsFrom(getDateScopedRows());
      var gcMap = computeGroupCompanyTotals(preFiltered);
      return uniqueValuesFrom(preFiltered, function (r) { return gcMap[r.groupNo + "" + r.company]; })
        .sort(function (a, b) { return parseFloat(a) - parseFloat(b); });
    }
    return uniqueValues(key);
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
        refreshAll();
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

  // 필터바처럼 별도 영역에서 여러 정렬 기준을 명시적으로 추가/삭제/방향 전환.
  // 테이블 헤더 클릭과 같은 state.sortRules를 공유해 항상 동기화된다.
  function renderSortRules() {
    if (!state.sortRules.length) {
      els.sortRulesContainer.innerHTML = '<span class="text-xs text-slate-400">정렬 기준 없음</span>';
      return;
    }
    els.sortRulesContainer.innerHTML = state.sortRules.map(function (rule, idx) {
      var colOptions = ALL_COLUMNS.map(function (c) {
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

    Array.prototype.forEach.call(els.sortRulesContainer.querySelectorAll(".sort-rule-key"), function (sel) {
      sel.addEventListener("change", function () {
        state.sortRules[parseInt(sel.dataset.idx, 10)].key = sel.value;
        refreshAll();
      });
    });
    Array.prototype.forEach.call(els.sortRulesContainer.querySelectorAll(".sort-rule-dir-btn"), function (btn) {
      btn.addEventListener("click", function () {
        state.sortRules[parseInt(btn.dataset.idx, 10)].dir *= -1;
        refreshAll();
      });
    });
    Array.prototype.forEach.call(els.sortRulesContainer.querySelectorAll(".sort-rule-remove-btn"), function (btn) {
      btn.addEventListener("click", function () {
        state.sortRules.splice(parseInt(btn.dataset.idx, 10), 1);
        refreshAll();
      });
    });
  }

  // --- 별도 필터 바 (검색 + 다중 선택, "적용" 버튼을 눌러야 실제 반영) ---

  var pendingFilterDrafts = {}; // key -> Set, 드롭다운이 열려있는 동안의 임시 선택 상태(미적용)

  function getEffectiveSet(key) {
    if (pendingFilterDrafts[key]) return new Set(pendingFilterDrafts[key]);
    var s = state.filters[key];
    if (s === null || s === undefined) return new Set(getCandidateValues(key));
    return new Set(s);
  }

  function getSearchedValues(key, term) {
    var values = getCandidateValues(key);
    if (!term) return values;
    var lower = term.toLowerCase();
    return values.filter(function (v) { return String(v).toLowerCase().indexOf(lower) !== -1; });
  }

  function commitFilterSet(key, set) {
    var allValues = getCandidateValues(key);
    state.filters[key] = set.size === allValues.length ? null : set;
  }

  function setupFilterBar() {
    Array.prototype.forEach.call(els.filterBar.querySelectorAll(".filter-bar-btn"), function (btn) {
      var key = btn.dataset.key;
      var wrapper = btn.parentElement;
      filterEls[key] = { wrapper: wrapper, btn: btn, dropdown: null };

      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleDropdown(key);
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

    els.filterResetAllBtn.addEventListener("click", function () {
      Object.keys(filterEls).forEach(function (key) { closeDropdown(key); });
      ALL_COLUMNS.forEach(function (c) { state.filters[c.key] = null; });
      pendingFilterDrafts = {};
      refreshAll();
    });
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
      pendingFilterDrafts[key] = new Set(visible);
      renderDropdownItems(key);
    }, 150));

    selectAllCb.addEventListener("change", function () {
      var term = searchInput.value;
      var visible = getSearchedValues(key, term);
      var set = getEffectiveSet(key);
      visible.forEach(function (v) {
        if (selectAllCb.checked) set.add(v); else set.delete(v);
      });
      pendingFilterDrafts[key] = set;
      renderDropdownItems(key);
    });

    div.querySelector(".th-filter-apply").addEventListener("click", function () {
      if (pendingFilterDrafts[key]) {
        commitFilterSet(key, pendingFilterDrafts[key]);
        delete pendingFilterDrafts[key];
        refreshAll();
      }
      closeDropdown(key);
    });

    div.querySelector(".th-filter-reset").addEventListener("click", function () {
      state.filters[key] = null;
      delete pendingFilterDrafts[key];
      renderDropdownItems(key);
      refreshAll();
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

    listEl.innerHTML = visible.map(function (v) {
      var checked = effectiveSet.has(v) ? " checked" : "";
      var displayText = (key === "deadline" || key === "createdAt") ? formatDateOnly(v) : v;
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
        pendingFilterDrafts[key] = set;
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
    delete pendingFilterDrafts[key]; // 매번 열 때 커밋된 상태에서 새로 시작
    renderDropdownItems(key);
    entry.dropdown.classList.remove("hidden");
  }

  function closeDropdown(key) {
    var entry = filterEls[key];
    if (!entry.dropdown || entry.dropdown.classList.contains("hidden")) return;
    entry.dropdown.classList.add("hidden");
    delete pendingFilterDrafts[key]; // 적용 없이 닫으면 임시 선택은 버림
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

  function updateFilterButtonStates() {
    Object.keys(filterEls).forEach(function (key) {
      var btn = filterEls[key].btn;
      var active = state.filters[key] !== null && state.filters[key] !== undefined;
      var label = ALL_COLUMNS.find(function (c) { return c.key === key; }).label;
      btn.className = active ? FILTER_BTN_ACTIVE : FILTER_BTN_INACTIVE;
      btn.innerHTML = escapeHtml(label) + ' <span class="text-[9px]">▾</span>';
    });
  }

  function updateStatusBadgeMap() {
    var statuses = uniqueValues("status");
    var map = {};
    statuses.forEach(function (s, i) {
      map[s] = BADGE_CLASSES[i % BADGE_CLASSES.length];
    });
    state.statusBadgeMap = map;
  }

  function compareValues(a, b, col) {
    if (col.type === "number") {
      return (a[col.key] || 0) - (b[col.key] || 0);
    }
    if (col.type === "date") {
      var ta = Date.parse(a[col.key]);
      var tb = Date.parse(b[col.key]);
      if (!isNaN(ta) && !isNaN(tb)) return ta - tb;
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
        var diff = compareValues(a, b, activeRules[i].col) * activeRules[i].dir;
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
      "필터 적용 수량: " + sumQty(filteredRows).toLocaleString("ko-KR") + "개 · " +
      "전체 수량: " + sumQty(unfilteredRows).toLocaleString("ko-KR") + "개";
  }

  function renderFloorPanel(rows, unfilteredRows) {
    var byFloor = {};
    rows.forEach(function (r) {
      var floor = getFloor(r.zone);
      byFloor[floor] = (byFloor[floor] || 0) + (r.quantity || 0);
    });
    var floors = Object.keys(byFloor).sort(function (a, b) { return floorSortKey(a) - floorSortKey(b); });

    var includedFloors = floors.filter(function (f) { return !state.floorExcluded.has(f); });
    var totalQty = includedFloors.reduce(function (sum, f) { return sum + byFloor[f]; }, 0);
    els.floorTotalQty.textContent = totalQty.toLocaleString("ko-KR") + "개";
    els.floorUnfilteredQty.textContent = sumQty(unfilteredRows).toLocaleString("ko-KR") + "개";

    var labor = parseFloat(els.laborInput.value);
    var hasLabor = !isNaN(labor) && labor > 0 && totalQty > 0;
    els.floorPerPersonQty.textContent = hasLabor ? Math.round(totalQty / labor).toLocaleString("ko-KR") + "개" : "-";
    var maxQty = floors.reduce(function (m, f) { return Math.max(m, byFloor[f]); }, 0) || 1;

    els.floorBars.innerHTML = floors.map(function (f) {
      var qty = byFloor[f];
      var widthPct = (qty / maxQty) * 100;
      var excluded = state.floorExcluded.has(f);
      var laborHtml;
      var perPersonHtml;
      if (excluded) {
        laborHtml = '<span class="text-slate-400">제외됨</span>';
        perPersonHtml = '<span class="text-slate-400">-</span>';
      } else if (hasLabor) {
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
      return (
        '<div class="grid grid-cols-[24px_60px_1fr_90px_110px_100px] items-center gap-2.5 text-xs' + (excluded ? " opacity-40" : "") + '">' +
        '<input type="checkbox" class="floor-checkbox accent-indigo-600 cursor-pointer" data-floor="' + escapeHtml(f) + '"' + (excluded ? "" : " checked") + ">" +
        '<div class="text-slate-500 whitespace-nowrap">' + escapeHtml(f) + "층</div>" +
        '<div class="bg-slate-100 rounded-full overflow-hidden h-[10px]"><div class="bg-indigo-500 h-full rounded-full" style="width:' + widthPct + '%"></div></div>' +
        '<div class="text-right tabular-nums text-slate-700">' + qty.toLocaleString("ko-KR") + "개</div>" +
        '<div class="text-right tabular-nums">' + laborHtml + "</div>" +
        '<div class="text-right tabular-nums text-slate-500">' + perPersonHtml + "</div>" +
        "</div>"
      );
    }).join("");

    Array.prototype.forEach.call(els.floorBars.querySelectorAll(".floor-checkbox"), function (cb) {
      cb.addEventListener("change", function () {
        var floor = cb.dataset.floor;
        if (cb.checked) state.floorExcluded.delete(floor); else state.floorExcluded.add(floor);
        renderFloorPanel(getFilteredRows());
      });
    });
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
      refreshAll();
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
          refreshAll();
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
    refreshAll();
  }

  // --- 뷰 전환 (홈 / 집품 할당) ---

  function switchView(view) {
    if (window.flashPageLoading) window.flashPageLoading();
    if (view === "assign") {
      els.homeView.classList.add("hidden");
      els.assignView.classList.remove("hidden");
      els.assignView.classList.add("animate-fadeIn");
      els.navHomeBtn.className = NAV_BTN_INACTIVE;
      els.navAssignBtn.className = NAV_BTN_ACTIVE;
    } else {
      els.assignView.classList.add("hidden");
      els.homeView.classList.remove("hidden");
      els.homeView.classList.add("animate-fadeIn");
      els.navAssignBtn.className = NAV_BTN_INACTIVE;
      els.navHomeBtn.className = NAV_BTN_ACTIVE;
    }
    // refreshAll()은 숨겨진 화면의 렌더링을 건너뛰므로, 방금 보이게 된 화면이
    // 숨겨져 있는 동안 놓쳤을 수 있는 갱신을 따라잡도록 전환 직후 한 번 그려준다.
    refreshAll();
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
  }

  // --- GT 바코드 ---

  function saveGtState() {
    localStorage.setItem(GT_CODES_KEY, JSON.stringify(state.gtCodes));
    localStorage.setItem(GT_ASSIGNMENTS_KEY, JSON.stringify(state.gtAssignments));
    localStorage.setItem(GT_PRINTED_KEY, JSON.stringify(state.gtPrinted));
  }

  function loadGtState() {
    try {
      var codesRaw = localStorage.getItem(GT_CODES_KEY);
      state.gtCodes = codesRaw ? JSON.parse(codesRaw) : [];
    } catch (e) {
      state.gtCodes = [];
    }
    try {
      var assignRaw = localStorage.getItem(GT_ASSIGNMENTS_KEY);
      state.gtAssignments = assignRaw ? JSON.parse(assignRaw) : {};
    } catch (e) {
      state.gtAssignments = {};
    }
    try {
      var printedRaw = localStorage.getItem(GT_PRINTED_KEY);
      state.gtPrinted = printedRaw ? JSON.parse(printedRaw) : [];
    } catch (e) {
      state.gtPrinted = [];
    }
  }

  function parseGtTokens(text) {
    return text
      .split(/[\t,\s]+/)
      .map(function (t) { return t.trim(); })
      .filter(function (t) { return t.length > 0; });
  }

  function getGtUsedSet() {
    var used = {};
    Object.keys(state.gtAssignments).forEach(function (k) { used[state.gtAssignments[k]] = true; });
    state.gtPrinted.forEach(function (c) { used[c] = true; });
    return used;
  }

  function getAvailableGtCodes() {
    var used = getGtUsedSet();
    return state.gtCodes.filter(function (code) { return !used[code]; });
  }

  function renderGtAvailableList() {
    var used = getGtUsedSet();
    var availableCount = state.gtCodes.filter(function (code) { return !used[code]; }).length;
    els.gtAvailableCount.textContent = availableCount;
    if (!state.gtCodes.length) {
      els.gtAvailableList.innerHTML = '<span class="text-xs text-slate-400">저장된 GT 데이터가 없습니다.</span>';
      return;
    }
    // 자동매칭/GT출력과 동일한 역순(나중에 붙여넣은 것부터)으로 보여줘서
    // 1행이 곧 다음 매칭에 쓰일 코드임을 그대로 확인할 수 있게 함
    var matchOrder = state.gtCodes.slice().reverse();
    var rowsHtml = matchOrder.map(function (code, idx) {
      var isUsed = !!used[code];
      var statusHtml = isUsed
        ? '<span class="px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 text-[10px] font-semibold">사용중</span>'
        : '<span class="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">사용가능</span>';
      return (
        '<tr class="border-b border-slate-100 last:border-b-0">' +
        '<td class="px-2 py-1 text-slate-400 text-right w-10">' + (idx + 1) + "</td>" +
        '<td class="px-2 py-1 font-mono font-medium ' + (isUsed ? "text-slate-400" : "text-indigo-700") + '">' + escapeHtml(code) + "</td>" +
        '<td class="px-2 py-1 text-right">' + statusHtml + "</td>" +
        "</tr>"
      );
    }).join("");
    els.gtAvailableList.innerHTML =
      '<table class="w-full text-xs border-collapse">' +
      '<thead><tr class="text-slate-400 border-b border-slate-200"><th class="px-2 py-1 text-right font-medium w-10">순번</th><th class="px-2 py-1 text-left font-medium">GT 코드</th><th class="px-2 py-1 text-right font-medium">상태</th></tr></thead>' +
      "<tbody>" + rowsHtml + "</tbody>" +
      "</table>";
  }

  function setAssignGt(key, code) {
    if (code) {
      state.gtAssignments[key] = code;
    } else {
      delete state.gtAssignments[key];
    }
    saveGtState();
    renderGtAvailableList();
    // change 이벤트가 이 input의 blur 처리 중일 수 있으므로, 그 처리가 끝난 뒤
    // 다음 틱에 컨테이너를 다시 그려서 "노드가 더 이상 자식이 아님" 오류를 피함.
    setTimeout(renderAssignPanel, 0);
  }

  function autoMatchGtForWorker(cfg, detailRows) {
    // 입력된 순서 그대로 저장된 GT 목록을 뒤에서부터(역순으로) 소진
    var available = getAvailableGtCodes().slice().reverse();
    var ai = 0;
    detailRows.forEach(function (r) {
      var key = cfg.id + ":" + r.id;
      if (state.gtAssignments[key]) return;
      if (ai >= available.length) return;
      state.gtAssignments[key] = available[ai];
      ai++;
    });
    saveGtState();
    renderGtAvailableList();
    renderAssignPanel();
  }

  function resetGtForWorker(cfg, detailRows) {
    detailRows.forEach(function (r) {
      delete state.gtAssignments[cfg.id + ":" + r.id];
    });
    saveGtState();
    renderGtAvailableList();
    renderAssignPanel();
  }

  function formatMonthDay(dateStr) {
    var d = parseFlexibleDate(dateStr);
    if (!d) return dateStr || "";
    return String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0");
  }

  // 테이블 표시용 — 원본 형식과 무관하게 날짜 부분을 YYYY-MM-DD로 통일하고,
  // 원본에 시:분이 있었다면 그대로 이어붙임
  function formatDateDisplay(dateStr) {
    var d = parseFlexibleDate(dateStr);
    if (!d) return dateStr || "";
    var time = String(dateStr).match(/(\d{1,2}:\d{2})/);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0") + (time ? " " + time[1] : "");
  }

  // 업체 선택 시 마감일시 입력칸에 시간 없이 날짜만 YYYY-MM-DD로 채우는 용도
  function formatDateOnly(dateStr) {
    var d = parseFlexibleDate(dateStr);
    if (!d) return dateStr || "";
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  // 값이 없으면 완전히 빈칸(괄호도 표시 안 함)
  function bracketPart(val) {
    return val ? "[" + escapeHtml(val) + "]" : "";
  }

  // 출력물 전용 매입유형 표시 매핑(홈/할당 화면 테이블 표시는 원본 값 그대로 유지)
  function formatPurchaseTypeLabel(val) {
    if (val === "업체보관상품") return "업체상품";
    if (val === "쿠팡상품") return "일반상품";
    return val;
  }

  function buildBarcodeHtml(gtCode) {
    return gtCode ? '<svg class="gt-label-barcode-svg" data-code="' + escapeHtml(gtCode) + '"></svg>' : "";
  }

  // 라벨 4종이 공유하는 바코드 셀 마크업 — sizingClass로 박스 전체를 채울지
  // (flex-1, buildLabelHtml) 내용 크기만큼만 차지할지(shrink-0, printGtLabels) 결정
  function buildBarcodeCellHtml(barcodeHtml, sizingClass) {
    return '<div class="' + sizingClass + ' flex flex-col items-center justify-center pt-1 px-1 overflow-hidden">' + barcodeHtml + "</div>";
  }

  // 집품 할당/커스텀/여분 라벨이 공유하는 4칸 라벨 마크업 — 값이 없는 필드는
  // bracketPart/빈 문자열을 그대로 넘기면 완전히 빈칸으로 표시됨
  function buildLabelHtml(line1, companyText, line3, barcodeHtml) {
    // line1/line3이 빈 문자열이면 브라우저가 그 줄의 줄박스를 통째로 생략해버려
    // 아래 구분선(divide-y)이 위로 밀려 붙는다. 일반 스페이스(" ")는 인라인
    // 요소 경계에서 공백 축소(whitespace collapsing) 대상이라 여전히 줄이
    // 찌그러지므로, 축소되지 않는 줄바꿈 없는 공백( )으로 채워 줄 높이를
    // 항상 유지한다.
    var safeLine1 = line1 || " ";
    var safeLine3 = line3 || " ";
    return (
      '<div class="gt-label break-after-page w-[5cm] h-[4cm] flex flex-col divide-y divide-black text-center text-black box-border overflow-hidden">' +
      '<div class="shrink-0 flex items-center justify-center py-0.5 overflow-hidden"><span class="text-xs font-bold leading-none text-black">' + safeLine1 + "</span></div>" +
      '<div class="flex-1 flex items-center justify-center px-1 overflow-hidden"><span class="text-base font-bold leading-tight text-black break-words line-clamp-2">' + escapeHtml(companyText || "") + "</span></div>" +
      '<div class="shrink-0 flex items-center justify-center py-0.5 overflow-hidden"><span class="text-sm font-bold leading-none text-black">' + safeLine3 + "</span></div>" +
      buildBarcodeCellHtml(barcodeHtml, "flex-1") +
      "</div>"
    );
  }

  function renderLabelBarcodes(container, barcodeOpts) {
    Array.prototype.forEach.call(container.querySelectorAll(".gt-label-barcode-svg"), function (svg) {
      try {
        JsBarcode(svg, svg.dataset.code, Object.assign({ format: "CODE128", displayValue: true, margin: 0, lineColor: "#000000", fontOptions: "bold", font: "'Noto Sans KR', sans-serif" }, barcodeOpts));
        // 코드 길이가 늘어나면 JsBarcode가 SVG 너비만 늘리고 높이(=barcodeOpts.height/fontSize
        // 기반, 코드 내용과 무관하게 항상 동일)는 그대로 두는데, CSS에서 이 SVG를 max-w-full
        // h-auto로 비율 유지 축소해버리면 너비가 넘치는 라벨만 높이까지 같이 줄어들어 라벨마다
        // 바코드/글씨 크기가 들쭉날쭉해 보였다. 높이는 방금 계산된 고정값 그대로 CSS에 얼리고,
        // 너비만 라벨 폭에 맞춰 채우되 preserveAspectRatio=none으로 세로 왜곡 없이 가로만
        // 늘어나거나 압축되게 해서, 코드 길이와 무관하게 항상 같은 절대 크기로 보이게 한다.
        svg.style.height = svg.getAttribute("height");
        svg.style.width = "100%";
        svg.setAttribute("preserveAspectRatio", "none");
        // JsBarcode가 <text>에 style="font:bold ..." 인라인 스타일을 직접 박아넣어서
        // font-weight를 attribute로 지정해봐야 인라인 style에 밀려 무시된다.
        // 같은 인라인 style 안의 font-weight 롱핸드를 직접 덮어써야 실제로 적용됨.
        // 다만 Noto Sans KR은 700 굵기까지만 로드되어 있어 font-weight만으로는
        // 브라우저가 700으로 클램프할 수 있으므로, stroke로 페이크 볼드를 덧입혀
        // 폰트의 실제 굵기 지원 여부와 무관하게 항상 두껍게 보이도록 함
        Array.prototype.forEach.call(svg.querySelectorAll("text"), function (t) {
          t.style.fontWeight = "900";
          t.setAttribute("stroke", "#000000");
          t.setAttribute("stroke-width", "0.5");
          t.style.paintOrder = "stroke";
        });
      } catch (e) {
        // 바코드 라이브러리를 못 불러온 경우(오프라인 등) 코드 텍스트만 표시
        svg.outerHTML = '<div class="text-lg font-bold font-mono text-black" style="font-weight:900">' + escapeHtml(svg.dataset.code) + "</div>";
      }
    });
  }

  // innerHTML 갱신 직후 곧바로 print()를 호출하면 브라우저가 레이아웃을 아직
  // 반영하지 않아 이전 인쇄 내용이 나올 수 있음 — 두 번의 rAF로 페인트를 기다린 뒤 인쇄
  function triggerPrint() {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        window.print();
        if (window.showToast) window.showToast("출력이 완료되었습니다.");
      });
    });
  }

  function printWorkerLabels(cfg, detailRows) {
    if (!detailRows.length) return;
    var labelsHtml = detailRows.map(function (r) {
      var gtKey = cfg.id + ":" + r.id;
      var gtCode = state.gtAssignments[gtKey] || "";
      var line1 = bracketPart(formatPurchaseTypeLabel(r.purchaseType)) + bracketPart(r.transportType) + bracketPart(r.groupNo);
      var line3 = bracketPart(formatMonthDay(r.deadline)) + (r.zone ? "[" + escapeHtml(r.zone) + "/" + Number(r.quantity || 0) + "EA]" : "");
      return buildLabelHtml(line1, r.company, line3, buildBarcodeHtml(gtCode));
    }).join("");

    els.printArea.innerHTML = labelsHtml;
    renderLabelBarcodes(els.printArea, LABEL_BARCODE_OPTS);
    triggerPrint();
  }

  // 집품 할당과 무관하게 GT 바코드 자체만 담긴 라벨을 인쇄. 최근 붙여넣은
  // 순서부터(역순) 요청한 수량만큼 뽑아 인쇄하며, 인쇄된 코드는 gtPrintBtn
  // 핸들러에서 state.gtPrinted로 소진 처리되어 재사용/중복 인쇄가 불가능해짐.
  function printGtLabels(codes) {
    if (!codes.length) return;
    // 빈 문자열을 그대로 넘기면 브라우저가 그 줄의 줄박스를 아예 생략해버려
    // (내용이 있는 다른 라벨보다) 위 3줄이 낮아지고 바코드 행이 더 커져버린다.
    // 화면엔 안 보이지만 줄 높이는 그대로 확보하는 스페이스 한 칸으로 채워
    // 다른 라벨과 정확히 같은 크기/위치가 되도록 한다.
    var blank = " ";
    var labelsHtml = codes.map(function (code) {
      return buildLabelHtml(blank, blank, blank, buildBarcodeHtml(code));
    }).join("");

    els.printArea.innerHTML = labelsHtml;
    renderLabelBarcodes(els.printArea, LABEL_BARCODE_OPTS);
    triggerPrint();
  }

  // 데이터와 무관하게 사용자가 직접 값을 입력해 라벨을 발행. 자동매칭이면 장마다
  // 다른 GT 코드를 순서대로 소진(gtPrinted에 반영), 수동 입력이면 모든 장에 같은
  // 코드를 사용(가용 목록과 무관한 임의 문자열일 수 있어 소진하지 않음).
  function printCustomLabels(fields, qty, useAutoMatch, manualCode) {
    if (qty < 1) return;
    var autoCodes = useAutoMatch ? getAvailableGtCodes().slice().reverse().slice(0, qty) : [];
    var labelsHtml = "";
    for (var i = 0; i < qty; i++) {
      var gtCode = useAutoMatch ? (autoCodes[i] || "") : (manualCode || "");
      var line1 = bracketPart(formatPurchaseTypeLabel(fields.purchaseType)) + bracketPart(fields.transportType) + bracketPart(fields.groupNo);
      var line3 = bracketPart(formatMonthDay(fields.deadline));
      labelsHtml += buildLabelHtml(line1, fields.company, line3, buildBarcodeHtml(gtCode));
    }
    els.printArea.innerHTML = labelsHtml;
    renderLabelBarcodes(els.printArea, LABEL_BARCODE_OPTS);

    if (useAutoMatch && autoCodes.length) {
      autoCodes.forEach(function (c) { state.gtPrinted.push(c); });
      saveGtState();
      renderGtAvailableList();
    }

    triggerPrint();
  }

  // 업로드된 전체 데이터(날짜탭과 무관)에서 업체명 목록을 뽑아 검색어로 필터링 —
  // 홈 화면 필터 드롭다운의 getSearchedValues와 같은 부분일치(대소문자 무시) 방식
  function getCustomLabelCompanyMatches(term) {
    var companies = uniqueValuesFrom(state.rows, function (r) { return r.company; });
    if (!term) return companies;
    var lower = term.toLowerCase();
    return companies.filter(function (c) { return c.toLowerCase().indexOf(lower) !== -1; });
  }

  function fillCustomLabelFieldsFromCompany(name) {
    var rep = state.rows.find(function (r) { return r.company === name; });
    if (!rep) return;
    els.customLabelGroupNo.value = rep.groupNo || "";
    els.customLabelDeadline.value = formatDateOnly(rep.deadline);
    els.customLabelPurchaseType.value = rep.purchaseType || "";
    els.customLabelCompany.value = rep.company || "";
    els.customLabelTransportType.value = rep.transportType || "";
  }

  function renderCustomLabelCompanyDropdown(term) {
    var matches = getCustomLabelCompanyMatches(term);
    els.customLabelCompanyDropdown.innerHTML = matches.length
      ? matches.map(function (c) {
          return '<button type="button" class="custom-label-company-item text-left text-xs text-slate-700 hover:bg-indigo-50 rounded-lg px-2 py-1.5 transition-colors" data-company="' + escapeHtml(c) + '">' + escapeHtml(c) + "</button>";
        }).join("")
      : '<div class="text-xs text-slate-400 px-2 py-1.5">일치하는 업체 없음</div>';
  }

  function openCustomLabelCompanyDropdown() {
    renderCustomLabelCompanyDropdown(els.customLabelCompanySearch.value);
    els.customLabelCompanyDropdown.classList.remove("hidden");
  }

  function closeCustomLabelCompanyDropdown() {
    els.customLabelCompanyDropdown.classList.add("hidden");
  }

  // 기본값이 있는 칸은 기본값으로, 없는 칸은 빈 값으로 되돌려 모달을 닫을 때마다
  // 이전 입력이 남아있지 않게 함
  function resetCustomLabelModal() {
    els.customLabelCompanySearch.value = "";
    closeCustomLabelCompanyDropdown();
    els.customLabelCompanyDropdown.innerHTML = "";
    els.customLabelGroupNo.value = "";
    els.customLabelDeadline.value = "";
    els.customLabelPurchaseType.value = "";
    els.customLabelCompany.value = "";
    els.customLabelTransportType.value = "";
    els.customLabelAutoMatch.checked = false;
    els.customLabelGtCode.value = "";
    els.customLabelQty.value = "1";
  }

  // 작업자에게 배정된 행을 (그룹번호+업체명) 기준 합산해, 임계값 이상인 조합마다
  // 분할 단위로 나눈 만큼 "여분" 라벨을 인쇄 — 대표 행(rows[0])의 전체 데이터로 채움
  function computeSpareGroups(detailRows) {
    var totals = {};
    var order = [];
    detailRows.forEach(function (r) {
      var key = r.groupNo + "|" + r.company;
      if (!totals[key]) {
        totals[key] = { groupNo: r.groupNo, company: r.company, qty: 0, rows: [] };
        order.push(key);
      }
      totals[key].qty += (r.quantity || 0);
      totals[key].rows.push(r);
    });
    return order.map(function (key) { return totals[key]; });
  }

  function spareGroupKey(g) {
    return g.groupNo + "|" + g.company;
  }

  function spareGroupCount(g, splitSize, overrides) {
    var override = overrides && overrides[spareGroupKey(g)];
    return override || Math.ceil(g.qty / splitSize);
  }

  // 겉 테두리·구분선이 전혀 없는 완전한 백지 한 장(맨 앞 빈 라벨 옵션용)
  function buildBlankLabelHtml() {
    return '<div class="gt-label break-after-page w-[5cm] h-[4cm] box-border"></div>';
  }

  function printSpareLabels(detailRows, threshold, splitSize, leadingBlank, overrides) {
    var groups = computeSpareGroups(detailRows);
    var qualifying = groups.filter(function (g) { return g.qty >= threshold; });
    var totalNeeded = qualifying.reduce(function (sum, g) { return sum + spareGroupCount(g, splitSize, overrides); }, 0);
    if (!totalNeeded && !leadingBlank) return;

    var availableCodes = getAvailableGtCodes().slice().reverse();
    var codeIdx = 0;
    var usedCodes = [];
    var labelsHtml = leadingBlank ? buildBlankLabelHtml() : "";

    qualifying.forEach(function (g) {
      var n = spareGroupCount(g, splitSize, overrides);
      var rep = g.rows[0];
      var line1 = bracketPart(formatPurchaseTypeLabel(rep.purchaseType)) + bracketPart(rep.transportType) + bracketPart(rep.groupNo);
      var line3 = bracketPart(formatMonthDay(rep.deadline));
      for (var i = 0; i < n; i++) {
        var code = availableCodes[codeIdx] || "";
        if (code) { usedCodes.push(code); codeIdx++; }
        labelsHtml += buildLabelHtml(line1, g.company, line3, buildBarcodeHtml(code));
      }
    });

    els.printArea.innerHTML = labelsHtml;
    renderLabelBarcodes(els.printArea, LABEL_BARCODE_OPTS);

    if (usedCodes.length) {
      usedCodes.forEach(function (c) { state.gtPrinted.push(c); });
      saveGtState();
      renderGtAvailableList();
    }

    triggerPrint();
  }

  var pendingSparePrintRows = null;
  var sparePrintOverrides = {};

  function getQualifyingSpareGroups(threshold) {
    if (!pendingSparePrintRows) return [];
    return computeSpareGroups(pendingSparePrintRows).filter(function (g) { return g.qty >= threshold; });
  }

  function computeSparePreviewTotal(threshold, splitSize) {
    return getQualifyingSpareGroups(threshold).reduce(function (sum, g) {
      return sum + spareGroupCount(g, splitSize, sparePrintOverrides);
    }, 0);
  }

  function renderSparePrintGroupList() {
    var threshold = parseInt(els.sparePrintThreshold.value, 10);
    var splitSize = parseInt(els.sparePrintSplitSize.value, 10);
    if (!threshold || threshold < 1 || !splitSize || splitSize < 1) {
      els.sparePrintGroupList.innerHTML = '<span class="text-xs text-slate-400">임계값·분할단위를 입력해주세요.</span>';
      return;
    }
    var groups = getQualifyingSpareGroups(threshold);
    if (!groups.length) {
      els.sparePrintGroupList.innerHTML = '<span class="text-xs text-slate-400">임계값 이상인 조합이 없습니다.</span>';
      return;
    }
    els.sparePrintGroupList.innerHTML = groups.map(function (g) {
      var key = spareGroupKey(g);
      var defaultCount = Math.ceil(g.qty / splitSize);
      var overrideVal = sparePrintOverrides[key] !== undefined ? sparePrintOverrides[key] : "";
      return (
        '<div class="flex items-center justify-between gap-2 text-xs py-1 border-b border-slate-100 last:border-b-0">' +
        '<span class="text-slate-700">' + escapeHtml(g.groupNo) + " · " + escapeHtml(g.company) +
        ' <span class="text-slate-400">(' + g.qty.toLocaleString("ko-KR") + "개, 기본 " + defaultCount + "장)</span></span>" +
        '<input type="number" min="1" step="1" class="spare-group-override w-16 bg-white border border-slate-200 rounded-md px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" data-key="' + escapeHtml(key) + '" placeholder="' + defaultCount + '" value="' + overrideVal + '">' +
        "</div>"
      );
    }).join("");

    Array.prototype.forEach.call(els.sparePrintGroupList.querySelectorAll(".spare-group-override"), function (input) {
      input.addEventListener("input", function () {
        var key = input.dataset.key;
        var v = parseInt(input.value, 10);
        if (v && v >= 1) sparePrintOverrides[key] = v; else delete sparePrintOverrides[key];
        updateSparePrintPreview();
      });
    });
  }

  function updateSparePrintPreview() {
    if (!pendingSparePrintRows) return;
    var threshold = parseInt(els.sparePrintThreshold.value, 10);
    var splitSize = parseInt(els.sparePrintSplitSize.value, 10);
    if (!threshold || threshold < 1 || !splitSize || splitSize < 1) {
      els.sparePrintPreview.textContent = "0";
      return;
    }
    var total = computeSparePreviewTotal(threshold, splitSize) + (els.sparePrintLeadingBlank.checked ? 1 : 0);
    els.sparePrintPreview.textContent = total;
  }

  function handleSparePrintClick(detailRows) {
    pendingSparePrintRows = detailRows;
    sparePrintOverrides = {};
    els.sparePrintModalMsg.textContent = "";
    renderSparePrintGroupList();
    updateSparePrintPreview();
    openModalWithTransition(els.sparePrintModal, els.sparePrintModalBox);
  }

  // 임계값/분할단위 기본값(40/15)으로 되돌리고 나머지 입력도 초기화 —
  // 취소든 출력이든 모달을 닫을 때마다 호출해 다음에 열었을 때 항상 기본값으로 보이게 함
  function resetSparePrintModal() {
    els.sparePrintThreshold.value = "40";
    els.sparePrintSplitSize.value = "15";
    els.sparePrintLeadingBlank.checked = false;
    sparePrintOverrides = {};
    els.sparePrintModalMsg.textContent = "";
    els.sparePrintGroupList.innerHTML = '<span class="text-xs text-slate-400">임계값·분할단위를 입력해주세요.</span>';
    els.sparePrintPreview.textContent = "0";
  }

  // 정렬된 존 목록(수량)을 n명에게 연속 구간으로, 가장 많이 배정된 사람의 합계를
  // 최소화하는 방식으로 나눔("Split Array Largest Sum"과 동일한 이진 탐색 분할).
  function splitBalanced(items, n) {
    if (!items.length) {
      var emptyGroups = [];
      for (var e = 0; e < n; e++) emptyGroups.push([]);
      return emptyGroups;
    }
    if (items.length <= n) {
      var groups = items.map(function (it) { return [it]; });
      while (groups.length < n) groups.push([]);
      return groups;
    }

    var qtys = items.map(function (it) { return it.qty; });
    var lo = Math.max.apply(null, qtys);
    var hi = qtys.reduce(function (a, b) { return a + b; }, 0);

    function groupsNeeded(limit) {
      var count = 1;
      var sum = 0;
      for (var i = 0; i < qtys.length; i++) {
        if (sum + qtys[i] > limit) {
          count++;
          sum = qtys[i];
        } else {
          sum += qtys[i];
        }
      }
      return count;
    }

    while (lo < hi) {
      var mid = Math.floor((lo + hi) / 2);
      if (groupsNeeded(mid) <= n) hi = mid; else lo = mid + 1;
    }

    var result = [];
    var current = [];
    var currentSum = 0;
    for (var i = 0; i < items.length; i++) {
      if (currentSum + items[i].qty > lo && current.length) {
        result.push(current);
        current = [];
        currentSum = 0;
      }
      current.push(items[i]);
      currentSum += items[i].qty;
    }
    if (current.length) result.push(current);

    // 균등 임계값(lo)을 만족하는 최소 그룹 수가 n보다 적을 수 있음(예: 수량이 동일한
    // 존이 많은 경우) — 그런 경우 인원 전체가 일감을 나눠 갖도록 가장 존이 많이
    // 몰린 그룹을 계속 반으로 쪼개 n개를 채운다(더 이상 쪼갤 그룹이 없으면 중단).
    while (result.length < n) {
      var splitIdx = -1;
      var maxLen = 1;
      for (var gi = 0; gi < result.length; gi++) {
        if (result[gi].length > maxLen) {
          maxLen = result[gi].length;
          splitIdx = gi;
        }
      }
      if (splitIdx === -1) break;
      var group = result[splitIdx];
      var half = Math.ceil(group.length / 2);
      result.splice(splitIdx, 1, group.slice(0, half), group.slice(half));
    }
    while (result.length < n) result.push([]);
    return result;
  }

  function getAssignZoneItems(floorInput, selectedDates) {
    var rows = getAssignBaseRows();
    var byZone = {};
    rows.forEach(function (r) {
      if (selectedDates.indexOf(getCreatedDate(r)) === -1) return;
      var floorCode = getFloor(r.zone);
      if (floorCode.indexOf(floorInput) !== 0) return;
      var zone = r.zone || "(미지정)";
      if (!byZone[zone]) byZone[zone] = { qty: 0, rows: [] };
      byZone[zone].qty += (r.quantity || 0);
      byZone[zone].rows.push(r);
    });
    return Object.keys(byZone)
      .sort(function (a, b) { return a.localeCompare(b, "ko", { numeric: true }); })
      .map(function (z) { return { zone: z, qty: byZone[z].qty, rows: byZone[z].rows }; });
  }

  // 존 개수가 인원수보다 적을 때, 행이 가장 많은 존을 절반씩 쪼개 아이템 수를
  // 늘려서(같은 존이라도 별도 아이템으로) 인원수만큼 나눠 가질 여지를 만든다.
  // 더 쪼갤 아이템(행 2개 이상)이 없으면 중단 — 데이터 자체가 인원수보다 적은
  // 불가피한 경우.
  function expandZoneItemsForCount(items, n) {
    var result = items.map(function (it) {
      return { zone: it.zone, qty: it.qty, rows: it.rows.slice() };
    });
    function sumQty(rows) {
      return rows.reduce(function (s, r) { return s + (r.quantity || 0); }, 0);
    }
    while (result.length < n) {
      var idx = -1;
      var maxRows = 1;
      for (var i = 0; i < result.length; i++) {
        if (result[i].rows.length > maxRows) {
          maxRows = result[i].rows.length;
          idx = i;
        }
      }
      if (idx === -1) break;
      var item = result[idx];
      var half = Math.ceil(item.rows.length / 2);
      var rowsA = item.rows.slice(0, half);
      var rowsB = item.rows.slice(half);
      result.splice(idx, 1,
        { zone: item.zone, qty: sumQty(rowsA), rows: rowsA },
        { zone: item.zone, qty: sumQty(rowsB), rows: rowsB }
      );
    }
    return result;
  }

  function renderAssignTabs() {
    els.assignTabsContainer.innerHTML = "";
    if (!state.assignConfigs.length) {
      els.assignTabsContainer.innerHTML = '<span class="text-sm text-slate-400">홈 화면의 "집품 할당" 버튼으로 배정을 생성해주세요.</span>';
      els.assignTableContainer.innerHTML = "";
      return;
    }
    state.assignConfigs.forEach(function (cfg) {
      var isActive = cfg.id === state.assignActiveId;
      var tabBtn = document.createElement("button");
      tabBtn.className = isActive ? ASSIGN_TAB_ACTIVE : ASSIGN_TAB_INACTIVE;
      var dates = cfg.createdDates || [];
      var tabLabel = cfg.custom ? "커스텀" : (escapeHtml(cfg.floorInput) + "층 · " + cfg.count + "명");
      tabBtn.innerHTML =
        "<span>" + tabLabel +
        (dates.length ? " · " + escapeHtml(dates.join(", ")) : "") + "</span>" +
        '<span class="assign-tab-close text-xs opacity-70 hover:opacity-100 ml-1">✕</span>';
      tabBtn.addEventListener("click", function (e) {
        if (e.target.closest(".assign-tab-close")) {
          removeAssignConfig(cfg.id);
        } else {
          state.assignActiveId = cfg.id;
          state.assignActiveWorkerIdx = null;
          saveAssignState();
          renderAssignTabs();
        }
      });
      els.assignTabsContainer.appendChild(tabBtn);
    });
    renderAssignPanel();
  }

  var ASSIGN_DETAIL_COLUMNS = [
    { key: "groupNo", label: "그룹번호" },
    { key: "deadline", label: "마감일시" },
    { key: "createdAt", label: "생성일시" },
    { key: "company", label: "업체명" },
    { key: "transportType", label: "운송타입" },
    { key: "zone", label: "존" },
    { key: "quantity", label: "수량" }
  ];

  function renderAssignDetailTable(rows, cfgId, workerIdx, workerCount) {
    if (!rows.length) {
      return '<div class="px-5 py-6 text-center text-sm text-slate-400">배정 없음</div>';
    }
    var headHtml = ASSIGN_DETAIL_COLUMNS.map(function (col) {
      return '<th class="px-4 py-2.5 text-left' + (col.key === "quantity" ? " text-right" : "") + '">' + col.label + "</th>";
    }).join("") + '<th class="px-4 py-2.5 text-left">GT 바코드</th><th class="px-4 py-2.5 text-right">작업자</th><th class="px-4 py-2.5"></th>';
    var workerOptionsHtml = "";
    for (var w = 0; w < workerCount; w++) {
      workerOptionsHtml += '<option value="' + w + '"' + (w === workerIdx ? " selected" : "") + '>작업자 ' + (w + 1) + "</option>";
    }
    var bodyHtml = rows.map(function (r) {
      var gtKey = cfgId + ":" + r.id;
      var gtValue = state.gtAssignments[gtKey] || "";
      var moveSelectHtml = workerCount > 1
        ? '<select class="assign-result-row-select bg-white border border-slate-200 rounded-md px-2 py-1 text-xs" data-row-id="' + escapeHtml(r.id) + '" data-from-worker="' + workerIdx + '">' + workerOptionsHtml + "</select>"
        : "";
      return (
        '<tr class="hover:bg-slate-50/80 transition-colors">' +
        ASSIGN_DETAIL_COLUMNS.map(function (col) {
          if (col.key === "quantity") {
            return '<td class="px-4 py-2 text-right tabular-nums text-slate-700">' + Number(r.quantity || 0).toLocaleString("ko-KR") + "</td>";
          }
          if (col.key === "groupNo") {
            return '<td class="px-4 py-2 font-semibold text-slate-900 whitespace-nowrap">' + escapeHtml(r.groupNo) + "</td>";
          }
          if (col.key === "deadline" || col.key === "createdAt") {
            return '<td class="px-4 py-2 text-slate-700 whitespace-nowrap">' + escapeHtml(formatDateDisplay(r[col.key])) + "</td>";
          }
          return '<td class="px-4 py-2 text-slate-700 whitespace-nowrap">' + escapeHtml(r[col.key]) + "</td>";
        }).join("") +
        '<td class="px-4 py-2 whitespace-nowrap"><input type="text" class="assign-gt-input w-36 bg-white border border-slate-200 rounded-md px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" data-gt-key="' + escapeHtml(gtKey) + '" value="' + escapeHtml(gtValue) + '"></td>' +
        '<td class="px-4 py-2 text-right whitespace-nowrap">' + moveSelectHtml + "</td>" +
        '<td class="px-4 py-2 text-right whitespace-nowrap"><button type="button" class="assign-result-row-delete-btn text-slate-300 hover:text-rose-500 transition-colors" data-row-id="' + escapeHtml(r.id) + '" data-worker-idx="' + workerIdx + '" title="배정에서 빼기">✕</button></td>' +
        "</tr>"
      );
    }).join("");
    return (
      '<div class="overflow-x-auto">' +
      '<table class="w-full border-collapse text-left text-xs min-w-max">' +
      '<thead><tr class="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500">' + headHtml + "</tr></thead>" +
      '<tbody class="divide-y divide-slate-100">' + bodyHtml + "</tbody>" +
      "</table></div>"
    );
  }

  // 구버전 저장 데이터 호환용: entries 안에 "존 아이템"(zone/qty/rows)이 섞여 있으면 rows로
  // 펼치고, 이미 원본 데이터 행(zone/qty가 아니라 groupNo 등을 가짐)이면 그대로 둔다.
  function flattenWorkerGroup(entries) {
    var result = [];
    (entries || []).forEach(function (e) {
      if (e && e.rows) {
        result = result.concat(e.rows);
      } else {
        result.push(e);
      }
    });
    return result;
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

  // --- 공용 행 선택 모달: 커스텀 할당 생성 / 기존 작업자에 행 추가 ---
  var rowPickerMode = null; // "create" | "append"
  var rowPickerTargetCfgId = null;
  var rowPickerTargetWorkerIdx = null;
  var rowPickerSelectedRows = []; // 확정 전까지 state에 반영되지 않는 임시 선택 목록

  // 이미 어떤 assignConfig에도 배정된 행의 id 집합 — 중복 배정 방지용
  function getAssignedRowIdSet() {
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

  function getRowPickerAvailableRows() {
    var dateVal = els.rowPickerDateSelect.value;
    var term = trim(els.rowPickerSearchInput.value).toLowerCase();
    var assignedIds = getAssignedRowIdSet();
    var selectedIds = new Set(rowPickerSelectedRows.map(function (r) { return r.id; }));
    return state.rows.filter(function (r) {
      if (assignedIds.has(r.id) || selectedIds.has(r.id)) return false;
      if (dateVal && getCreatedDate(r) !== dateVal) return false;
      if (term) {
        var hay = (String(r.groupNo) + " " + String(r.company) + " " + String(r.zone)).toLowerCase();
        if (hay.indexOf(term) === -1) return false;
      }
      return true;
    });
  }

  function buildRowPickerTable(rows, btnClass, btnLabel, btnClickAttr) {
    if (!rows.length) {
      return '<div class="px-4 py-6 text-center text-xs text-slate-400">해당하는 행이 없습니다.</div>';
    }
    var bodyHtml = rows.map(function (r) {
      return (
        '<tr class="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/80 transition-colors">' +
        '<td class="px-3 py-1.5 font-semibold text-slate-900 whitespace-nowrap">' + escapeHtml(r.groupNo) + "</td>" +
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
      '<th class="px-3 py-1.5">그룹번호</th><th class="px-3 py-1.5">마감일시</th><th class="px-3 py-1.5">생성일자</th><th class="px-3 py-1.5">업체명</th><th class="px-3 py-1.5">운송타입</th><th class="px-3 py-1.5">존</th><th class="px-3 py-1.5 text-right">수량</th><th class="px-3 py-1.5"></th>' +
      "</tr></thead><tbody>" + bodyHtml + "</tbody></table>"
    );
  }

  function renderRowPickerDateSelect() {
    var dates = getAllCreatedDates();
    var current = els.rowPickerDateSelect.value;
    els.rowPickerDateSelect.innerHTML = '<option value="">전체</option>' + dates.map(function (d) {
      return '<option value="' + escapeHtml(d) + '"' + (d === current ? " selected" : "") + '>' + escapeHtml(d) + "</option>";
    }).join("");
  }

  function renderRowPickerAvailableList() {
    els.rowPickerAvailableList.innerHTML = buildRowPickerTable(getRowPickerAvailableRows(), "row-picker-add-btn bg-indigo-600 hover:bg-indigo-700 text-white", "추가", "");
    Array.prototype.forEach.call(els.rowPickerAvailableList.querySelectorAll(".row-picker-add-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var row = state.rows.find(function (r) { return r.id === btn.dataset.rowId; });
        if (!row) return;
        rowPickerSelectedRows.push(row);
        renderRowPickerAvailableList();
        renderRowPickerSelectedList();
      });
    });
  }

  function renderRowPickerSelectedList() {
    els.rowPickerSelectedCount.textContent = rowPickerSelectedRows.length;
    els.rowPickerSelectedList.innerHTML = buildRowPickerTable(rowPickerSelectedRows, "row-picker-remove-btn bg-rose-50 hover:bg-rose-100 text-rose-600", "삭제", "");
    Array.prototype.forEach.call(els.rowPickerSelectedList.querySelectorAll(".row-picker-remove-btn"), function (btn) {
      btn.addEventListener("click", function () {
        rowPickerSelectedRows = rowPickerSelectedRows.filter(function (r) { return r.id !== btn.dataset.rowId; });
        renderRowPickerAvailableList();
        renderRowPickerSelectedList();
      });
    });
  }

  function openRowPickerModal(mode, cfgId, workerIdx) {
    rowPickerMode = mode;
    rowPickerTargetCfgId = cfgId || null;
    rowPickerTargetWorkerIdx = (typeof workerIdx === "number") ? workerIdx : null;
    rowPickerSelectedRows = [];
    els.rowPickerTitle.textContent = mode === "append" ? "작업자 " + (workerIdx + 1) + "에게 행 추가" : "커스텀 할당 만들기";
    els.rowPickerConfirmBtn.textContent = mode === "append" ? "추가" : "확정";
    els.rowPickerDateSelect.value = "";
    els.rowPickerSearchInput.value = "";
    renderRowPickerDateSelect();
    renderRowPickerAvailableList();
    renderRowPickerSelectedList();
    openModalWithTransition(els.rowPickerModal, els.rowPickerModalBox);
  }

  function closeRowPickerModal() {
    closeModalWithTransition(els.rowPickerModal, els.rowPickerModalBox);
    rowPickerSelectedRows = [];
  }

  function confirmRowPicker() {
    if (!rowPickerSelectedRows.length) return;
    if (rowPickerMode === "create") {
      var dates = Array.from(new Set(rowPickerSelectedRows.map(function (r) { return getCreatedDate(r); })));
      var id = Date.now();
      state.assignConfigs.push({
        id: id,
        floorInput: null,
        custom: true,
        count: 1,
        workerGroups: [rowPickerSelectedRows.slice()],
        createdDates: dates
      });
      state.assignActiveId = id;
      state.assignActiveWorkerIdx = null;
      saveAssignState();
      closeRowPickerModal();
      switchView("assign");
      renderAssignTabs();
      if (window.showToast) window.showToast("커스텀 할당이 생성되었습니다.");
    } else if (rowPickerMode === "append") {
      var cfg = state.assignConfigs.find(function (c) { return c.id === rowPickerTargetCfgId; });
      if (cfg) {
        if (!cfg.workerGroups) {
          cfg.workerGroups = splitBalanced(cfg.items || [], cfg.count).map(flattenWorkerGroup);
        }
        var targetGroup = cfg.workerGroups[rowPickerTargetWorkerIdx];
        targetGroup.push.apply(targetGroup, rowPickerSelectedRows);
        saveAssignState();
      }
      closeRowPickerModal();
      renderAssignPanel();
      if (window.showToast) window.showToast("선택한 행이 추가되었습니다.");
    }
  }

  function renderAssignPanel() {
    var cfg = state.assignConfigs.find(function (c) { return c.id === state.assignActiveId; });
    if (!cfg) {
      els.assignTableContainer.innerHTML = "";
      return;
    }
    // workerGroups: 모달에서 확정된(수동 재배정 포함) 최종 분배(작업자별 원본 데이터 행 배열).
    // 구버전 config(items만 있거나, workerGroups가 존 아이템 배열이던 이전 버전)는 최초 진입 시
    // splitBalanced+flattenWorkerGroup으로 정규화해 cfg.workerGroups에 실제로 저장해둔다 —
    // 이후 행 추가/삭제/이동 핸들러가 cfg.workerGroups를 직접 변경해야 하므로, 매 렌더링마다
    // 새로 만들어지는 임시 배열이 아니라 실제 저장되는 배열이 있어야 한다.
    if (!cfg.workerGroups) {
      cfg.workerGroups = splitBalanced(cfg.items || [], cfg.count).map(flattenWorkerGroup);
    }
    var groups = cfg.workerGroups.map(flattenWorkerGroup);
    var totalItems = groups.reduce(function (sum, g) { return sum + g.length; }, 0);
    if (!totalItems) {
      els.assignTableContainer.innerHTML = '<div class="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500 shadow-sm">해당 층에 데이터가 없습니다.</div>';
      return;
    }
    var activeWorkerIdx = state.assignActiveWorkerIdx;

    var tabsHtml = "";
    if (groups.length > 1) {
      tabsHtml = '<div class="flex flex-wrap gap-2 mb-4">' +
        '<button type="button" class="assign-worker-tab-btn ' + (activeWorkerIdx === null ? ASSIGN_TAB_ACTIVE : ASSIGN_TAB_INACTIVE) + '" data-worker-idx="">전체</button>' +
        groups.map(function (g, idx) {
          return '<button type="button" class="assign-worker-tab-btn ' + (activeWorkerIdx === idx ? ASSIGN_TAB_ACTIVE : ASSIGN_TAB_INACTIVE) + '" data-worker-idx="' + idx + '">작업자 ' + (idx + 1) + "</button>";
        }).join("") +
        "</div>";
    }

    var cardsHtml = groups.map(function (detailRows, idx) {
      if (activeWorkerIdx !== null && activeWorkerIdx !== idx) return "";
      var total = detailRows.reduce(function (sum, r) { return sum + (r.quantity || 0); }, 0);
      var zoneList = Array.from(new Set(detailRows.map(function (r) { return r.zone; }).filter(Boolean))).join(", ");
      return (
        '<div class="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">' +
        '<div class="flex items-center justify-between flex-wrap gap-2 px-5 py-3 bg-slate-50 border-b border-slate-200">' +
        '<div class="text-sm font-bold text-slate-900">작업자 ' + (idx + 1) +
        (zoneList ? '<span class="ml-2 text-xs font-normal text-slate-500">담당 존: ' + escapeHtml(zoneList) + "</span>" : "") + "</div>" +
        '<div class="flex items-center gap-3">' +
        '<div class="text-sm font-bold text-indigo-600">합계 ' + total.toLocaleString("ko-KR") + "개 · " + detailRows.length + "장</div>" +
        '<button type="button" class="assign-add-row-btn inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium text-xs px-3 py-1.5 rounded-lg transition-colors" data-worker-idx="' + idx + '">행 추가</button>' +
        '<button type="button" class="assign-automatch-btn inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium text-xs px-3 py-1.5 rounded-lg transition-colors" data-worker-idx="' + idx + '">미사용 GT 자동매칭</button>' +
        '<button type="button" class="assign-gt-reset-btn bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium text-xs px-3 py-1.5 rounded-lg transition-colors" data-worker-idx="' + idx + '">GT 바코드 초기화</button>' +
        '<button type="button" class="assign-spare-print-btn bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium text-xs px-3 py-1.5 rounded-lg transition-colors" data-worker-idx="' + idx + '">여분 출력</button>' +
        '<button type="button" class="assign-print-btn bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs px-3 py-1.5 rounded-lg shadow-sm transition-all duration-150" data-worker-idx="' + idx + '">출력</button>' +
        (groups.length > 1 ? '<button type="button" class="assign-delete-worker-btn bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-medium text-xs px-3 py-1.5 rounded-lg transition-colors" data-worker-idx="' + idx + '">삭제</button>' : "") +
        "</div>" +
        "</div>" +
        renderAssignDetailTable(detailRows, cfg.id, idx, groups.length) +
        "</div>"
      );
    }).join("");

    els.assignTableContainer.innerHTML = tabsHtml + '<div class="space-y-4">' + cardsHtml + "</div>";

    Array.prototype.forEach.call(els.assignTableContainer.querySelectorAll(".assign-worker-tab-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var v = btn.dataset.workerIdx;
        state.assignActiveWorkerIdx = v === "" ? null : parseInt(v, 10);
        renderAssignPanel();
      });
    });

    Array.prototype.forEach.call(els.assignTableContainer.querySelectorAll(".assign-gt-input"), function (input) {
      input.addEventListener("change", function () {
        setAssignGt(input.dataset.gtKey, trim(input.value));
      });
    });

    Array.prototype.forEach.call(els.assignTableContainer.querySelectorAll(".assign-automatch-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var workerIdx = parseInt(btn.dataset.workerIdx, 10);
        autoMatchGtForWorker(cfg, groups[workerIdx]);
      });
    });

    Array.prototype.forEach.call(els.assignTableContainer.querySelectorAll(".assign-gt-reset-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var workerIdx = parseInt(btn.dataset.workerIdx, 10);
        resetGtForWorker(cfg, groups[workerIdx]);
      });
    });

    Array.prototype.forEach.call(els.assignTableContainer.querySelectorAll(".assign-print-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var workerIdx = parseInt(btn.dataset.workerIdx, 10);
        printWorkerLabels(cfg, groups[workerIdx]);
        resetGtForWorker(cfg, groups[workerIdx]);
      });
    });

    Array.prototype.forEach.call(els.assignTableContainer.querySelectorAll(".assign-spare-print-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var workerIdx = parseInt(btn.dataset.workerIdx, 10);
        handleSparePrintClick(groups[workerIdx]);
      });
    });

    Array.prototype.forEach.call(els.assignTableContainer.querySelectorAll(".assign-delete-worker-btn"), function (btn) {
      btn.addEventListener("click", function () {
        removeAssignWorker(cfg);
      });
    });

    Array.prototype.forEach.call(els.assignTableContainer.querySelectorAll(".assign-add-row-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var workerIdx = parseInt(btn.dataset.workerIdx, 10);
        openRowPickerModal("append", cfg.id, workerIdx);
      });
    });

    Array.prototype.forEach.call(els.assignTableContainer.querySelectorAll(".assign-result-row-select"), function (sel) {
      sel.addEventListener("change", function () {
        var fromIdx = parseInt(sel.dataset.fromWorker, 10);
        var toIdx = parseInt(sel.value, 10);
        if (fromIdx === toIdx) return;
        var rowId = sel.dataset.rowId;
        var fromGroup = cfg.workerGroups[fromIdx];
        var rowIdx = fromGroup.findIndex(function (r) { return r && r.id === rowId; });
        if (rowIdx === -1) return;
        var row = fromGroup.splice(rowIdx, 1)[0];
        cfg.workerGroups[toIdx].push(row);
        saveAssignState();
        renderAssignPanel();
      });
    });

    Array.prototype.forEach.call(els.assignTableContainer.querySelectorAll(".assign-result-row-delete-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var workerIdx = parseInt(btn.dataset.workerIdx, 10);
        var rowId = btn.dataset.rowId;
        var group = cfg.workerGroups[workerIdx];
        var rowIdx = group.findIndex(function (r) { return r && r.id === rowId; });
        if (rowIdx !== -1) group.splice(rowIdx, 1);
        delete state.gtAssignments[cfg.id + ":" + rowId];
        saveGtState();
        saveAssignState();
        renderAssignPanel();
      });
    });
  }

  function removeAssignWorker(cfg) {
    if (cfg.count <= 1) return;
    // GT 키가 이제 행 id 기준이라(작업자 인덱스 무관) 병합해도 기존 매칭이 그대로 유지됨 —
    // 별도로 GT를 초기화할 필요 없음
    if (cfg.workerGroups) {
      // 삭제되는 마지막 작업자의 항목은 그 앞 작업자에게 합쳐, 이미 수동 배정한
      // 다른 작업자들의 구성은 그대로 유지한다(splitBalanced로 전체 재계산하지 않음).
      var removed = cfg.workerGroups.pop();
      var target = cfg.workerGroups[cfg.workerGroups.length - 1];
      if (target) target.push.apply(target, removed);
    }
    cfg.count -= 1;
    saveAssignState();
    renderAssignTabs();
  }

  function setAssignMsg(msg, kind) {
    var color = kind === "error" ? "text-rose-600" : "text-slate-500";
    els.assignMsg.textContent = msg || "";
    els.assignMsg.className = "text-xs " + color;
  }

  function getSelectedAssignDates() {
    return Array.prototype.map.call(
      els.assignDateCheckboxes.querySelectorAll(".assign-date-cb:checked"),
      function (cb) { return cb.value; }
    );
  }

  function renderAssignDateCheckboxes() {
    var dates = getAllCreatedDates();
    if (!dates.length) {
      els.assignDateCheckboxes.innerHTML = '<span class="text-xs text-slate-400">업로드된 데이터가 없습니다.</span>';
      return;
    }
    var checkedBefore = {};
    Array.prototype.forEach.call(els.assignDateCheckboxes.querySelectorAll(".assign-date-cb"), function (cb) {
      checkedBefore[cb.value] = cb.checked;
    });
    els.assignDateCheckboxes.innerHTML = dates.map(function (date) {
      var checked = checkedBefore[date] ? " checked" : "";
      return (
        '<label class="flex items-center gap-1.5 cursor-pointer text-slate-700"><input type="checkbox" class="assign-date-cb accent-indigo-600" value="' + escapeHtml(date) + '"' + checked + "> " + escapeHtml(date) + "</label>"
      );
    }).join("");
  }

  // 모달에서 생성 중인 미리보기(작업자별 원본 데이터 행 배열) — 확정 전까지는 state에 반영되지 않음
  var assignPreviewGroups = null;
  var assignPreviewMeta = null; // { floorInput, count, selectedDates } — 확정 시 config에 함께 저장
  var assignPreviewActiveWorkerIdx = null; // 미리보기 탭(전체/작업자 N) 상태

  function generateAssignPreview() {
    var floorInput = trim(els.assignFloorInput.value);
    var count = parseInt(els.assignCountInput.value, 10);
    var selectedDates = getSelectedAssignDates();
    if (!floorInput) {
      setAssignMsg("층수를 입력해주세요.", "error");
      return;
    }
    if (!count || count < 1) {
      setAssignMsg("투입 인원을 1명 이상 입력해주세요.", "error");
      return;
    }
    if (!selectedDates.length) {
      setAssignMsg("생성일자를 1개 이상 선택해주세요.", "error");
      return;
    }
    // 미리보기 생성 시점의 존/행 데이터를 스냅샷으로 고정 — 이후 홈 화면 필터가 바뀌어도
    // 확정된 배정은 유지됨(재조회하지 않음). 존 단위 균형 분배(splitBalanced) 결과를
    // 바로 원본 데이터 행 단위로 펼쳐서, 미리보기에 존 요약이 아니라 실제 행이 보이게 한다.
    var items = expandZoneItemsForCount(getAssignZoneItems(floorInput, selectedDates), count);
    var groups = splitBalanced(items, count);
    assignPreviewGroups = groups.map(function (g) {
      return g.reduce(function (acc, it) { return acc.concat(it.rows); }, []);
    });
    assignPreviewMeta = { floorInput: floorInput, count: count, selectedDates: selectedDates };
    assignPreviewActiveWorkerIdx = null;
    setAssignMsg("", null);
    renderAssignPreview();
  }

  function renderAssignPreviewRows(rows, workerIdx, workerCount) {
    if (!rows.length) {
      return '<div class="px-5 py-4 text-center text-xs text-slate-400">배정 없음</div>';
    }
    var headHtml = ASSIGN_DETAIL_COLUMNS.map(function (col) {
      return '<th class="px-2 py-1.5 text-left' + (col.key === "quantity" ? " text-right" : "") + '">' + col.label + "</th>";
    }).join("") + '<th class="px-2 py-1.5 text-right">작업자</th>';
    var workerOptionsHtml = "";
    for (var wIdx = 0; wIdx < workerCount; wIdx++) {
      workerOptionsHtml += '<option value="' + wIdx + '"' + (wIdx === workerIdx ? " selected" : "") + '>작업자 ' + (wIdx + 1) + "</option>";
    }
    var bodyHtml = rows.map(function (r, rowIdx) {
      var selectHtml =
        '<select class="assign-preview-row-select bg-white border border-slate-200 rounded-md px-2 py-1 text-xs" data-worker-idx="' + workerIdx + '" data-row-idx="' + rowIdx + '">' +
        workerOptionsHtml +
        "</select>";
      return (
        '<tr class="border-b border-slate-100 last:border-b-0">' +
        ASSIGN_DETAIL_COLUMNS.map(function (col) {
          if (col.key === "quantity") {
            return '<td class="px-2 py-1.5 text-right tabular-nums text-slate-700">' + Number(r.quantity || 0).toLocaleString("ko-KR") + "</td>";
          }
          if (col.key === "groupNo") {
            return '<td class="px-2 py-1.5 font-semibold text-slate-900 whitespace-nowrap">' + escapeHtml(r.groupNo) + "</td>";
          }
          if (col.key === "deadline" || col.key === "createdAt") {
            return '<td class="px-2 py-1.5 text-slate-700 whitespace-nowrap">' + escapeHtml(formatDateDisplay(r[col.key])) + "</td>";
          }
          return '<td class="px-2 py-1.5 text-slate-700 whitespace-nowrap">' + escapeHtml(r[col.key]) + "</td>";
        }).join("") +
        '<td class="px-2 py-1.5 text-right">' + selectHtml + "</td>" +
        "</tr>"
      );
    }).join("");
    return (
      '<div class="overflow-x-auto">' +
      '<table class="w-full border-collapse text-left text-xs min-w-max">' +
      '<thead><tr class="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500">' + headHtml + "</tr></thead>" +
      '<tbody class="divide-y divide-slate-100">' + bodyHtml + "</tbody>" +
      "</table></div>"
    );
  }

  function renderAssignPreview() {
    if (!assignPreviewGroups) {
      els.assignPreviewContainer.innerHTML = "";
      return;
    }
    var groups = assignPreviewGroups;
    var workerCount = groups.length;
    var activeIdx = assignPreviewActiveWorkerIdx;

    var tabsHtml = "";
    if (groups.length > 1) {
      tabsHtml = '<div class="flex flex-wrap gap-2 mb-3">' +
        '<button type="button" class="assign-preview-tab-btn ' + (activeIdx === null ? ASSIGN_TAB_ACTIVE : ASSIGN_TAB_INACTIVE) + '" data-worker-idx="">전체</button>' +
        groups.map(function (g, idx) {
          return '<button type="button" class="assign-preview-tab-btn ' + (activeIdx === idx ? ASSIGN_TAB_ACTIVE : ASSIGN_TAB_INACTIVE) + '" data-worker-idx="' + idx + '">작업자 ' + (idx + 1) + "</button>";
        }).join("") +
        "</div>";
    }

    var cardsHtml = groups.map(function (rows, idx) {
      if (activeIdx !== null && activeIdx !== idx) return "";
      var total = rows.reduce(function (sum, r) { return sum + (r.quantity || 0); }, 0);
      return (
        '<div class="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-3">' +
        '<div class="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">' +
        '<div class="text-sm font-bold text-slate-900">작업자 ' + (idx + 1) + "</div>" +
        '<div class="text-xs font-bold text-indigo-600">합계 ' + total.toLocaleString("ko-KR") + "개 · " + rows.length + "장</div>" +
        "</div>" +
        renderAssignPreviewRows(rows, idx, workerCount) +
        "</div>"
      );
    }).join("");

    els.assignPreviewContainer.innerHTML = tabsHtml + cardsHtml;

    Array.prototype.forEach.call(els.assignPreviewContainer.querySelectorAll(".assign-preview-tab-btn"), function (btn) {
      btn.addEventListener("click", function () {
        var v = btn.dataset.workerIdx;
        assignPreviewActiveWorkerIdx = v === "" ? null : parseInt(v, 10);
        renderAssignPreview();
      });
    });

    Array.prototype.forEach.call(els.assignPreviewContainer.querySelectorAll(".assign-preview-row-select"), function (sel) {
      sel.addEventListener("change", function () {
        var fromIdx = parseInt(sel.dataset.workerIdx, 10);
        var rowIdx = parseInt(sel.dataset.rowIdx, 10);
        var toIdx = parseInt(sel.value, 10);
        if (fromIdx === toIdx) return;
        var row = assignPreviewGroups[fromIdx][rowIdx];
        assignPreviewGroups[fromIdx].splice(rowIdx, 1);
        assignPreviewGroups[toIdx].push(row);
        renderAssignPreview();
      });
    });
  }

  function confirmAssignConfig() {
    if (!assignPreviewGroups || !assignPreviewMeta) {
      setAssignMsg("먼저 미리보기를 생성해주세요.", "error");
      return;
    }
    var id = Date.now();
    state.assignConfigs.push({
      id: id,
      floorInput: assignPreviewMeta.floorInput,
      count: assignPreviewMeta.count,
      workerGroups: assignPreviewGroups,
      createdDates: assignPreviewMeta.selectedDates
    });
    state.assignActiveId = id;
    state.assignActiveWorkerIdx = null;
    saveAssignState();
    closeAssignCreateModal();
    switchView("assign");
    renderAssignTabs();
    if (window.showToast) window.showToast("집품 할당이 생성되었습니다.");
  }

  function resetAssignCreateModal() {
    els.assignFloorInput.value = "";
    els.assignCountInput.value = "";
    assignPreviewGroups = null;
    assignPreviewMeta = null;
    assignPreviewActiveWorkerIdx = null;
    setAssignMsg("", null);
    renderAssignPreview();
  }

  function openAssignCreateModal() {
    resetAssignCreateModal();
    renderAssignDateCheckboxes();
    openModalWithTransition(els.assignCreateModal, els.assignCreateModalBox);
  }

  function closeAssignCreateModal() {
    closeModalWithTransition(els.assignCreateModal, els.assignCreateModalBox);
    resetAssignCreateModal();
  }

  function removeAssignConfig(id) {
    state.assignConfigs = state.assignConfigs.filter(function (c) { return c.id !== id; });
    if (state.assignActiveId === id) {
      state.assignActiveId = state.assignConfigs.length ? state.assignConfigs[0].id : null;
    }
    // 이 config에 속했던 GT 매칭 키(고아 키)도 함께 정리
    var prefix = id + ":";
    Object.keys(state.gtAssignments).forEach(function (key) {
      if (key.indexOf(prefix) === 0) delete state.gtAssignments[key];
    });
    saveGtState();
    saveAssignState();
    renderAssignTabs();
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

    els.tableBody.innerHTML = rows.map(function (r) {
      return (
        '<tr class="hover:bg-slate-50/80 transition-colors">' +
        COLUMNS.map(function (col) {
          if (col.key === "status") {
            var cls = state.statusBadgeMap[r.status] || "";
            return '<td class="' + tdBase + '"><span class="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ' + cls + '">' + escapeHtml(r.status) + "</span></td>";
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
        "</tr>"
      );
    }).join("");
  }

  function refreshAll() {
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
      renderTable(sorted);
      updateSortHeaderClasses();
      updateFilterButtonStates();
      renderSortRules();
    }
    if (!els.assignView.classList.contains("hidden")) {
      renderAssignPanel();
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
    state.floorExcluded = new Set();
    localStorage.removeItem(STORAGE_KEY);
    els.pasteArea.value = "";
    els.fileName.textContent = "";
    setStatusMsg("데이터를 초기화했습니다.", "ok");
    refreshAll();
  });

  var debouncedRenderFloorPanel = debounce(function () {
    renderFloorPanel(getFilteredRows());
  }, 200);

  els.laborInput.addEventListener("input", function () {
    localStorage.setItem(LABOR_STORAGE_KEY, els.laborInput.value);
    debouncedRenderFloorPanel();
  });

  els.navHomeBtn.addEventListener("click", function () { switchView("home"); });
  els.navAssignBtn.addEventListener("click", function () { switchView("assign"); });
  els.assignOpenModalBtn.addEventListener("click", openAssignCreateModal);
  els.assignPreviewBtn.addEventListener("click", generateAssignPreview);
  els.assignConfirmBtn.addEventListener("click", confirmAssignConfig);
  els.assignCancelBtn.addEventListener("click", closeAssignCreateModal);
  els.assignCreateCloseBtn.addEventListener("click", closeAssignCreateModal);

  els.assignCustomBtn.addEventListener("click", function () { openRowPickerModal("create"); });
  els.rowPickerDateSelect.addEventListener("change", renderRowPickerAvailableList);
  els.rowPickerSearchInput.addEventListener("input", renderRowPickerAvailableList);
  els.rowPickerConfirmBtn.addEventListener("click", confirmRowPicker);
  els.rowPickerCancelBtn.addEventListener("click", closeRowPickerModal);
  els.rowPickerCloseBtn.addEventListener("click", closeRowPickerModal);

  els.sortAddBtn.addEventListener("click", function () {
    var usedKeys = state.sortRules.map(function (r) { return r.key; });
    var nextCol = ALL_COLUMNS.find(function (c) { return usedKeys.indexOf(c.key) === -1; }) || ALL_COLUMNS[0];
    state.sortRules.push({ key: nextCol.key, dir: 1 });
    refreshAll();
  });
  els.sortResetBtn.addEventListener("click", function () {
    state.sortRules = [];
    refreshAll();
  });

  els.gtSaveBtn.addEventListener("click", function () {
    var tokens = parseGtTokens(els.gtPasteArea.value);
    if (!tokens.length) return;
    var seen = {};
    state.gtCodes.forEach(function (c) { seen[c] = true; });
    tokens.forEach(function (t) {
      if (!seen[t]) {
        seen[t] = true;
        state.gtCodes.push(t);
      }
    });
    saveGtState();
    els.gtPasteArea.value = "";
    renderGtAvailableList();
    renderAssignPanel();
  });

  els.gtClearBtn.addEventListener("click", async function () {
    if (!(await window.confirmModal("저장된 GT 바코드 데이터를 모두 삭제할까요?"))) return;
    state.gtCodes = [];
    state.gtAssignments = {};
    state.gtPrinted = [];
    saveGtState();
    renderGtAvailableList();
    renderAssignPanel();
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
    codes.forEach(function (c) { state.gtPrinted.push(c); });
    saveGtState();
    renderGtAvailableList();
    closeModalWithTransition(els.gtPrintModal, els.gtPrintModalBox);
    els.gtPrintQty.value = "";
    els.gtPrintModalMsg.textContent = "";
    printGtLabels(codes);
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

  els.sparePrintModalCancelBtn.addEventListener("click", function () {
    closeModalWithTransition(els.sparePrintModal, els.sparePrintModalBox);
    pendingSparePrintRows = null;
    resetSparePrintModal();
  });

  els.sparePrintModalPrintBtn.addEventListener("click", function () {
    var threshold = parseInt(els.sparePrintThreshold.value, 10);
    var splitSize = parseInt(els.sparePrintSplitSize.value, 10);
    if (!threshold || threshold < 1 || !splitSize || splitSize < 1) {
      els.sparePrintModalMsg.textContent = "1 이상의 숫자를 입력해주세요.";
      return;
    }
    var expected = computeSparePreviewTotal(threshold, splitSize);
    if (!expected) {
      els.sparePrintModalMsg.textContent = "임계값 " + threshold + "개 이상인 조합이 없습니다.";
      return;
    }
    var leadingBlank = els.sparePrintLeadingBlank.checked;
    var rows = pendingSparePrintRows;
    var overrides = sparePrintOverrides;
    closeModalWithTransition(els.sparePrintModal, els.sparePrintModalBox);
    pendingSparePrintRows = null;
    resetSparePrintModal();
    printSpareLabels(rows, threshold, splitSize, leadingBlank, overrides);
  });

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

  // --- Init ---
  setupSortLabels();
  setupFilterBar();
  loadFromStorage();
  loadDateTabState();
  loadAssignState();
  loadGtState();
  els.laborInput.value = localStorage.getItem(LABOR_STORAGE_KEY) || "";
  refreshAll();
  renderAssignTabs();
  renderGtAvailableList();
})();
