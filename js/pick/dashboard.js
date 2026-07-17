(function (Pick) {
  "use strict";

  // --- imported from other js/pick/*.js files via window.Pick ---
  var state = Pick.state;
  var els = Pick.els;
  var escapeHtml = Pick.escapeHtml;
  var getCreatedDate = Pick.getCreatedDate;
  var uniqueValuesFrom = Pick.uniqueValuesFrom;
  var ASSIGN_TAB_ACTIVE = Pick.ASSIGN_TAB_ACTIVE;
  var ASSIGN_TAB_INACTIVE = Pick.ASSIGN_TAB_INACTIVE;
  var openModalWithTransition = Pick.openModalWithTransition;
  var closeModalWithTransition = Pick.closeModalWithTransition;
  var textToMatrix = Pick.textToMatrix;

  // 대시보드 전용 데이터셋 — 집품리스트 현황(state.rows, 9열)과는 완전히 별개.
  // A~N(14열) 원본 엑셀에서 C(내부반출번호)/D(생성일시)/H(업체명)/N(상태값)/J·K·L(수량)만
  // 포지셔널로 읽는다. 1행은 머리글이라 건너뛴다(extract.js의 시트2 파싱과 동일 컨벤션).
  // J=반출요청수량(그 행의 총 요청량), K=집품완료 수량(누적), L=반출완료 수량(누적) —
  // 집품 단계에서는 J가 전체, K가 진행량(qtyTotal-qtyPicked=남은 집품량), 상차 단계에서는
  // K가 전체(집품이 끝나야 상차가 시작되므로), L이 진행량(qtyPicked-qtyLoaded=남은 상차량).
  var dashboardRows = [];
  var dashboardActiveDateTabs = [];

  var DASHBOARD_STORAGE_KEY = "pickListDashboardData";
  var DASHBOARD_DATE_TAB_KEY = "pickListDashboardDateTab";

  // C=내부반출번호, D=생성일시, H=업체명, J=반출요청수량, K=집품완료 수량, L=반출완료 수량, N=상태값
  var COL = { exportNo: 2, createdAt: 3, company: 7, qtyTotal: 9, qtyPicked: 10, qtyLoaded: 11, status: 13 };

  function toNumber(v) {
    var n = Number(String(v === undefined || v === null ? "" : v).replace(/,/g, "").trim());
    return isNaN(n) ? 0 : n;
  }

  function cellStr(row, idx) {
    return (row[idx] === undefined || row[idx] === null ? "" : String(row[idx])).trim();
  }

  function parseDashboardMatrix(matrix) {
    var rows = [];
    for (var i = 1; i < matrix.length; i++) {
      var row = matrix[i];
      if (!row || !row.length) continue;
      var status = cellStr(row, COL.status);
      if (!status) continue;
      rows.push({
        exportNo: cellStr(row, COL.exportNo),
        createdAt: cellStr(row, COL.createdAt),
        company: cellStr(row, COL.company),
        status: status,
        qtyTotal: toNumber(row[COL.qtyTotal]),
        qtyPicked: toNumber(row[COL.qtyPicked]),
        qtyLoaded: toNumber(row[COL.qtyLoaded])
      });
    }
    return rows;
  }

  // 재업로드는 행 단위 중복제거가 아니라 "생성일자(D열) 단위 갱신" — 새로 올라온
  // 데이터에 포함된 날짜는 기존 dashboardRows에서 그 날짜분을 통째로 지우고
  // 새 값으로 교체(해당 날짜가 기존에 없었으면 그냥 추가되는 것과 동일 효과),
  // 그 외 날짜의 기존 데이터는 그대로 보존한다 — 최신 스냅샷만 남기기 위함.
  function mergeDashboardRows(rows) {
    var incomingDates = uniqueValuesFrom(rows, getCreatedDate);
    var dateSet = new Set(incomingDates);
    var replacedCount = dashboardRows.filter(function (r) { return dateSet.has(getCreatedDate(r)); }).length;
    dashboardRows = dashboardRows.filter(function (r) { return !dateSet.has(getCreatedDate(r)); }).concat(rows);
    return { added: rows.length, dates: incomingDates, replaced: replacedCount };
  }

  function loadDashboardState() {
    try {
      var raw = localStorage.getItem(DASHBOARD_STORAGE_KEY);
      dashboardRows = raw ? JSON.parse(raw) : [];
    } catch (e) {
      dashboardRows = [];
    }
    try {
      var rawTabs = localStorage.getItem(DASHBOARD_DATE_TAB_KEY);
      dashboardActiveDateTabs = rawTabs ? JSON.parse(rawTabs) : [];
    } catch (e) {
      dashboardActiveDateTabs = [];
    }
  }

  function saveDashboardData() {
    localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(dashboardRows));
  }

  function saveDashboardDateTabState() {
    localStorage.setItem(DASHBOARD_DATE_TAB_KEY, JSON.stringify(dashboardActiveDateTabs));
  }

  function getDashboardScopedRows() {
    if (!dashboardActiveDateTabs.length) return dashboardRows;
    var activeSet = new Set(dashboardActiveDateTabs);
    return dashboardRows.filter(function (r) { return activeSet.has(getCreatedDate(r)); });
  }

  function setDashboardUploadStatusMsg(msg, kind) {
    var color = kind === "error" ? "text-rose-600" : kind === "ok" ? "text-emerald-600" : "text-slate-500";
    els.dashboardUploadStatusMsg.textContent = msg || "";
    els.dashboardUploadStatusMsg.className = "text-xs " + color;
  }

  function applyDashboardRows(rows, sourceLabel) {
    if (!rows.length) {
      setDashboardUploadStatusMsg("유효한 데이터가 없습니다. N열(상태값)이 비어있지 않은 행이 있는지 확인해주세요.", "error");
      return;
    }
    var result = mergeDashboardRows(rows);
    saveDashboardData();
    renderDashboard();
    setDashboardUploadStatusMsg(
      sourceLabel + "에서 " + result.added + "건을 업로드했습니다. (" + result.dates.length + "개 날짜 갱신" +
        (result.replaced ? ", 기존 " + result.replaced + "건 교체" : "") + ")",
      "ok"
    );
    closeDashboardUploadModal();
  }

  function handleDashboardFile(file) {
    if (!file) return;
    els.dashboardFileName.textContent = file.name;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = new Uint8Array(e.target.result);
        var wb = XLSX.read(data, { type: "array" });
        var matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
        applyDashboardRows(parseDashboardMatrix(matrix), "엑셀 파일");
      } catch (err) {
        setDashboardUploadStatusMsg("엑셀 파일을 읽는 중 오류가 발생했습니다: " + err.message, "error");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleDashboardPaste() {
    var text = els.dashboardPasteArea.value;
    if (!text.trim()) {
      setDashboardUploadStatusMsg("붙여넣을 데이터를 입력해주세요.", "error");
      return;
    }
    var matrix = textToMatrix(text);
    applyDashboardRows(parseDashboardMatrix(matrix), "붙여넣기");
    els.dashboardPasteArea.value = "";
  }

  async function removeDashboardRowsByDate(date) {
    var count = dashboardRows.filter(function (r) { return getCreatedDate(r) === date; }).length;
    if (!(await window.confirmModal("생성일자 '" + date + "' 데이터 " + count + "건을 모두 삭제할까요?"))) return;
    dashboardRows = dashboardRows.filter(function (r) { return getCreatedDate(r) !== date; });
    dashboardActiveDateTabs = dashboardActiveDateTabs.filter(function (d) { return d !== date; });
    saveDashboardData();
    saveDashboardDateTabState();
    renderDashboard();
    if (window.showToast) window.showToast("생성일자 '" + date + "' 데이터 " + count + "건이 삭제되었습니다.", "info");
  }

  function openDashboardUploadModal() {
    els.dashboardFileInput.value = "";
    els.dashboardFileName.textContent = "";
    els.dashboardPasteArea.value = "";
    setDashboardUploadStatusMsg("", null);
    openModalWithTransition(els.dashboardUploadModal, els.dashboardUploadModalBox);
  }

  function closeDashboardUploadModal() {
    closeModalWithTransition(els.dashboardUploadModal, els.dashboardUploadModalBox);
  }

  // --- 집계 ---

  function sumByStatus(rows, statuses, fieldFn) {
    var set = new Set(Array.isArray(statuses) ? statuses : [statuses]);
    return rows.reduce(function (sum, r) { return set.has(r.status) ? sum + fieldFn(r) : sum; }, 0);
  }

  function qtyTotalOf(r) { return r.qtyTotal; }
  function qtyPickedOf(r) { return r.qtyPicked; }
  function qtyLoadedOf(r) { return r.qtyLoaded; }

  function qtyRemainLoadOf(r) { return r.qtyPicked - r.qtyLoaded; }

  function computeDashboardStats(rows) {
    var pending = sumByStatus(rows, "집품대기", qtyTotalOf);
    var picking = sumByStatus(rows, "집품중", qtyTotalOf);
    var pickTotal = sumByStatus(rows, ["집품대기", "집품중"], qtyTotalOf);
    var pickRemaining = sumByStatus(rows, ["집품대기", "집품중"], function (r) { return r.qtyTotal - r.qtyPicked; });
    var loadReady = sumByStatus(rows, "상차준비완료", qtyPickedOf);
    var loading = sumByStatus(rows, "상차중", qtyRemainLoadOf);
    // 상태값 "반출완료"는 L열(반출완료 수량)과 이름이 정확히 대응 — 상차완료 행도
    // 같은 컬럼(반출까지 진행된 누적량)으로 합산한다.
    var shipped = sumByStatus(rows, ["상차완료", "반출완료"], qtyLoadedOf);

    var loadTotal = sumByStatus(rows, ["상차준비완료", "상차중"], qtyPickedOf);
    // 남은 상차 수량 — 상차준비완료/상차중 두 상태 모두 동일하게 (K-L)로 통일.
    var loadRemaining = sumByStatus(rows, ["상차준비완료", "상차중"], qtyRemainLoadOf);

    return {
      pending: pending,
      picking: picking,
      pickTotal: pickTotal,
      pickRemaining: pickRemaining,
      loadReady: loadReady,
      loading: loading,
      shipped: shipped,
      loadTotal: loadTotal,
      loadRemaining: loadRemaining
    };
  }

  function computeDashboardCompanyLists(rows) {
    function companiesFor(status) {
      var set = {};
      rows.forEach(function (r) { if (r.status === status && r.company) set[r.company] = true; });
      return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, "ko-KR"); });
    }
    return {
      pending: companiesFor("집품대기"),
      picking: companiesFor("집품중"),
      loadReady: companiesFor("상차준비완료"),
      loading: companiesFor("상차중")
    };
  }

  function computeZoneQuantities(rows) {
    var map = {};
    rows.forEach(function (r) {
      var zone = r.zone || "(미지정)";
      map[zone] = (map[zone] || 0) + Number(r.quantity || 0);
    });
    return Object.keys(map).sort().map(function (zone) { return { zone: zone, qty: map[zone] }; });
  }

  // --- 날짜 탭 (대시보드 전용, 홈의 renderDateTabs와 별개 — dashboardRows 기준) ---

  function renderDashboardDateTabs() {
    var dates = uniqueValuesFrom(dashboardRows, getCreatedDate);
    els.dashboardDateTabsContainer.innerHTML = "";

    var allBtn = document.createElement("button");
    allBtn.className = !dashboardActiveDateTabs.length ? ASSIGN_TAB_ACTIVE : ASSIGN_TAB_INACTIVE;
    allBtn.innerHTML = "<span>전체</span>";
    allBtn.addEventListener("click", function () {
      dashboardActiveDateTabs = [];
      saveDashboardDateTabState();
      renderDashboard();
    });
    els.dashboardDateTabsContainer.appendChild(allBtn);

    dates.forEach(function (date) {
      var isActive = dashboardActiveDateTabs.indexOf(date) !== -1;
      var tabBtn = document.createElement("button");
      tabBtn.className = isActive ? ASSIGN_TAB_ACTIVE : ASSIGN_TAB_INACTIVE;
      tabBtn.innerHTML =
        "<span>" + escapeHtml(date) + "</span>" +
        '<span class="date-tab-close text-xs opacity-70 hover:opacity-100 ml-1">✕</span>';
      tabBtn.addEventListener("click", function (e) {
        if (e.target.closest(".date-tab-close")) {
          removeDashboardRowsByDate(date);
          return;
        }
        if (e.ctrlKey || e.metaKey) {
          var idx = dashboardActiveDateTabs.indexOf(date);
          dashboardActiveDateTabs = idx !== -1
            ? dashboardActiveDateTabs.slice(0, idx).concat(dashboardActiveDateTabs.slice(idx + 1))
            : dashboardActiveDateTabs.concat([date]);
        } else {
          dashboardActiveDateTabs = [date];
        }
        saveDashboardDateTabState();
        renderDashboard();
      });
      els.dashboardDateTabsContainer.appendChild(tabBtn);
    });
  }

  // --- Chart.js 렌더링 ---

  var pickChartInstance = null;
  var loadChartInstance = null;
  var zoneChartInstance = null;

  function renderDonutChart(prevInstance, canvasEl, remaining, completed, remainingColor) {
    if (prevInstance) prevInstance.destroy();
    var total = remaining + completed;
    var hasData = total > 0;
    var data = hasData ? [Math.max(remaining, 0), Math.max(completed, 0)] : [1, 0];
    var colors = hasData ? [remainingColor, "#e2e8f0"] : ["#e2e8f0", "#e2e8f0"];
    return new Chart(canvasEl, {
      type: "doughnut",
      data: {
        labels: ["남은 수량", "완료 수량"],
        datasets: [{ data: data, backgroundColor: colors, borderWidth: 0 }]
      },
      options: {
        cutout: "72%",
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: hasData } },
        animation: { duration: 300 }
      }
    });
  }

  function renderZoneChart(zoneData) {
    if (zoneChartInstance) { zoneChartInstance.destroy(); zoneChartInstance = null; }
    var hasZones = zoneData.length > 0;
    els.dashboardZoneEmptyState.classList.toggle("hidden", hasZones);
    els.dashboardZoneChartWrap.classList.toggle("hidden", !hasZones);
    if (!hasZones) return;
    zoneChartInstance = new Chart(els.dashboardZoneChart, {
      type: "bar",
      data: {
        labels: zoneData.map(function (z) { return z.zone; }),
        datasets: [{ label: "수량", data: zoneData.map(function (z) { return z.qty; }), backgroundColor: "#4f46e5", borderRadius: 4, maxBarThickness: 48 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  function renderCompanyList(containerEl, countEl, companies) {
    countEl.textContent = companies.length + "개";
    if (!companies.length) {
      containerEl.innerHTML = '<p class="text-xs text-slate-400 py-2">해당 업체 없음</p>';
      return;
    }
    containerEl.innerHTML = companies.map(function (name) {
      return '<div class="px-4 py-2 text-xs text-slate-700">' + escapeHtml(name) + "</div>";
    }).join("");
  }

  function renderDashboardCompanyLists(rows) {
    var lists = computeDashboardCompanyLists(rows);
    renderCompanyList(els.dashboardPendingCompanyList, els.dashboardPendingCompanyCount, lists.pending);
    renderCompanyList(els.dashboardPickingCompanyList, els.dashboardPickingCompanyCount, lists.picking);
    renderCompanyList(els.dashboardLoadReadyCompanyList, els.dashboardLoadReadyCompanyCount, lists.loadReady);
    renderCompanyList(els.dashboardLoadingCompanyList, els.dashboardLoadingCompanyCount, lists.loading);
  }

  function pct(part, total) {
    if (total <= 0) return "0%";
    return Math.round((part / total) * 100) + "%";
  }

  function renderDashboard() {
    var hasData = dashboardRows.length > 0;
    els.dashboardActiveFileInfo.classList.toggle("hidden", !hasData);
    els.dashboardEmptyState.classList.toggle("hidden", hasData);
    els.dashboardContent.classList.toggle("hidden", !hasData);

    renderDashboardDateTabs();

    if (hasData) {
      var scoped = getDashboardScopedRows();
      var stats = computeDashboardStats(scoped);

      els.dashboardCardPendingValue.textContent = stats.pending.toLocaleString("ko-KR");
      els.dashboardCardPickingValue.textContent = stats.picking.toLocaleString("ko-KR");
      els.dashboardCardLoadReadyValue.textContent = stats.loadReady.toLocaleString("ko-KR");
      els.dashboardCardLoadingValue.textContent = stats.loading.toLocaleString("ko-KR");
      els.dashboardCardShippedValue.textContent = stats.shipped.toLocaleString("ko-KR");

      els.dashboardPickRemainingLabel.textContent = stats.pickRemaining.toLocaleString("ko-KR");
      els.dashboardPickRemainingPct.textContent = "전체 " + stats.pickTotal.toLocaleString("ko-KR") + "개 중 " + pct(stats.pickRemaining, stats.pickTotal) + " 남음";
      els.dashboardLoadRemainingLabel.textContent = stats.loadRemaining.toLocaleString("ko-KR");
      els.dashboardLoadRemainingPct.textContent = "전체 " + stats.loadTotal.toLocaleString("ko-KR") + "개 중 " + pct(stats.loadRemaining, stats.loadTotal) + " 남음";

      pickChartInstance = renderDonutChart(pickChartInstance, els.dashboardPickChart, stats.pickRemaining, stats.pickTotal - stats.pickRemaining, "#4f46e5");
      loadChartInstance = renderDonutChart(loadChartInstance, els.dashboardLoadChart, stats.loadRemaining, stats.loadTotal - stats.loadRemaining, "#0891b2");

      renderDashboardCompanyLists(scoped);
    }

    renderZoneChart(computeZoneQuantities(state.rows));
  }

  // --- exposed to other js/pick/*.js files via window.Pick ---
  Pick.loadDashboardState = loadDashboardState;
  Pick.renderDashboard = renderDashboard;
  Pick.handleDashboardFile = handleDashboardFile;
  Pick.handleDashboardPaste = handleDashboardPaste;
  Pick.openDashboardUploadModal = openDashboardUploadModal;
  Pick.closeDashboardUploadModal = closeDashboardUploadModal;
})(window.Pick = window.Pick || {});
