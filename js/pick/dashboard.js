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

  // 대시보드 전용 데이터셋 — 집품리스트 현황(state.rows, 9열)과는 완전히 별개.
  // A~N(14열) 원본 엑셀에서 D(생성일시)/N(상태값)/J·K·L(수량) 열만 포지셔널로 읽는다.
  // 1행은 머리글이라 건너뛴다(extract.js의 시트2 파싱과 동일 컨벤션).
  var dashboardRows = [];
  var dashboardActiveDateTabs = [];

  var DASHBOARD_STORAGE_KEY = "pickListDashboardData";
  var DASHBOARD_DATE_TAB_KEY = "pickListDashboardDateTab";

  var COL = { createdAt: 3, qtyTotal: 9, qtyPicked: 10, qtyLoaded: 11, status: 13 };

  function toNumber(v) {
    var n = Number(String(v === undefined || v === null ? "" : v).replace(/,/g, "").trim());
    return isNaN(n) ? 0 : n;
  }

  function parseDashboardMatrix(matrix) {
    var rows = [];
    for (var i = 1; i < matrix.length; i++) {
      var row = matrix[i];
      if (!row || !row.length) continue;
      var status = (row[COL.status] === undefined || row[COL.status] === null ? "" : String(row[COL.status])).trim();
      if (!status) continue;
      rows.push({
        createdAt: (row[COL.createdAt] === undefined || row[COL.createdAt] === null ? "" : String(row[COL.createdAt])).trim(),
        status: status,
        qtyTotal: toNumber(row[COL.qtyTotal]),
        qtyPicked: toNumber(row[COL.qtyPicked]),
        qtyLoaded: toNumber(row[COL.qtyLoaded])
      });
    }
    return rows;
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

  function handleDashboardFile(file) {
    if (!file) return;
    els.dashboardFileName.textContent = file.name;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = new Uint8Array(e.target.result);
        var wb = XLSX.read(data, { type: "array" });
        var matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
        var rows = parseDashboardMatrix(matrix);
        if (!rows.length) {
          setDashboardUploadStatusMsg("유효한 데이터가 없습니다. N열(상태값)이 비어있지 않은 행이 있는지 확인해주세요.", "error");
          return;
        }
        dashboardRows = rows;
        dashboardActiveDateTabs = [];
        saveDashboardData();
        saveDashboardDateTabState();
        renderDashboard();
        setDashboardUploadStatusMsg(rows.length + "건이 업로드되었습니다.", "ok");
      } catch (err) {
        setDashboardUploadStatusMsg("엑셀 파일을 읽는 중 오류가 발생했습니다: " + err.message, "error");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function openDashboardUploadModal() {
    els.dashboardFileInput.value = "";
    els.dashboardFileName.textContent = "";
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

  function computeDashboardStats(rows) {
    var pending = sumByStatus(rows, "집품대기", qtyTotalOf);
    var picking = sumByStatus(rows, "집품중", qtyTotalOf);
    var pickTotal = sumByStatus(rows, ["집품대기", "집품중"], qtyTotalOf);
    var pickRemaining = sumByStatus(rows, ["집품대기", "집품중"], function (r) { return r.qtyTotal - r.qtyPicked; });
    var shipped = sumByStatus(rows, ["상차완료", "반출완료"], qtyPickedOf);

    var loadTotal = sumByStatus(rows, ["상차준비완료", "상차중"], qtyPickedOf);
    var loadRemaining =
      sumByStatus(rows, "상차준비완료", qtyPickedOf) +
      sumByStatus(rows, "상차중", function (r) { return r.qtyPicked - r.qtyLoaded; });

    return {
      pending: pending,
      picking: picking,
      pickTotal: pickTotal,
      pickRemaining: pickRemaining,
      shipped: shipped,
      loadTotal: loadTotal,
      loadRemaining: loadRemaining
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
      tabBtn.innerHTML = "<span>" + escapeHtml(date) + "</span>";
      tabBtn.addEventListener("click", function (e) {
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
      els.dashboardCardRemainingValue.textContent = stats.pickRemaining.toLocaleString("ko-KR");
      els.dashboardCardShippedValue.textContent = stats.shipped.toLocaleString("ko-KR");

      els.dashboardPickRemainingLabel.textContent = stats.pickRemaining.toLocaleString("ko-KR");
      els.dashboardLoadRemainingLabel.textContent = stats.loadRemaining.toLocaleString("ko-KR");

      pickChartInstance = renderDonutChart(pickChartInstance, els.dashboardPickChart, stats.pickRemaining, stats.pickTotal - stats.pickRemaining, "#4f46e5");
      loadChartInstance = renderDonutChart(loadChartInstance, els.dashboardLoadChart, stats.loadRemaining, stats.loadTotal - stats.loadRemaining, "#0891b2");
    }

    renderZoneChart(computeZoneQuantities(state.rows));
  }

  // --- exposed to other js/pick/*.js files via window.Pick ---
  Pick.loadDashboardState = loadDashboardState;
  Pick.renderDashboard = renderDashboard;
  Pick.handleDashboardFile = handleDashboardFile;
  Pick.openDashboardUploadModal = openDashboardUploadModal;
  Pick.closeDashboardUploadModal = closeDashboardUploadModal;
})(window.Pick = window.Pick || {});
