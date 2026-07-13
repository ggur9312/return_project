(function (Pick) {
  "use strict";

  // --- imported from other js/pick/*.js files via window.Pick ---
  var GT_ASSIGNMENTS_KEY = Pick.GT_ASSIGNMENTS_KEY;
  var GT_CODES_KEY = Pick.GT_CODES_KEY;
  var GT_PRINTED_KEY = Pick.GT_PRINTED_KEY;
  var LABEL_BARCODE_OPTS = Pick.LABEL_BARCODE_OPTS;
  var LABEL_MARGIN_BOTTOM_KEY = Pick.LABEL_MARGIN_BOTTOM_KEY;
  var LABEL_MARGIN_DEFAULT = Pick.LABEL_MARGIN_DEFAULT;
  var LABEL_MARGIN_LEFT_KEY = Pick.LABEL_MARGIN_LEFT_KEY;
  var LABEL_MARGIN_LEFT_TOP_DEFAULT = Pick.LABEL_MARGIN_LEFT_TOP_DEFAULT;
  var LABEL_MARGIN_RIGHT_KEY = Pick.LABEL_MARGIN_RIGHT_KEY;
  var LABEL_MARGIN_TOP_KEY = Pick.LABEL_MARGIN_TOP_KEY;
  var closeModalWithTransition = Pick.closeModalWithTransition;
  var els = Pick.els;
  var escapeHtml = Pick.escapeHtml;
  var openModalWithTransition = Pick.openModalWithTransition;
  var parseFlexibleDate = Pick.parseFlexibleDate;
  var state = Pick.state;
  var trim = Pick.trim;
  var uniqueValuesFrom = Pick.uniqueValuesFrom;

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
    // 레거시 데이터 등으로 이미 저장된 중복 코드가 있으면 자동매칭이 같은 물리
    // 바코드를 서로 다른 행에 두 번 배정할 수 있으므로, 불러오는 시점에 정리한다.
    var seenCodes = {};
    var dedupedCodes = state.gtCodes.filter(function (c) {
      if (seenCodes[c]) return false;
      seenCodes[c] = true;
      return true;
    });
    if (dedupedCodes.length !== state.gtCodes.length) {
      state.gtCodes = dedupedCodes;
      localStorage.setItem(GT_CODES_KEY, JSON.stringify(state.gtCodes));
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

  // GT 데이터가 수천~수만 건으로 늘어나면 전체를 한 번에 DOM으로 그리는 게
  // 병목이 되므로(스크롤 박스 안에 몇 줄만 보이는데도 전체를 매번 다시 그림),
  // 실제로 보이는 구간만 렌더링하는 가상 스크롤로 처리한다. 위치값은 코드
  // 개수만큼 서로 다른 Tailwind 임의값 클래스를 만들지 않도록 인라인 style로
  // 직접 지정한다(이 프로젝트는 브라우저에서 클래스명을 감지해 CSS를 그때그때
  // 컴파일하는 Tailwind Play CDN을 쓰므로, 행마다 다른 클래스를 쓰면 그 자체가
  // 또 다른 성능 문제가 된다).
  // 헤더는 스크롤 영역 바깥의 별도 flex 자식으로 분리한다 — 헤더를 스크롤
  // 영역 "안"에 sticky로 두면 헤더의 실제 높이만큼 행의 절대좌표 기준(스크롤
  // 컨테이너 top=0)과 스크롤 가능한 콘텐츠의 실제 시작 위치가 어긋나서,
  // 스크롤 끝부분에서 헤더와 마지막 행들이 서로 겹쳐 보이는 버그가 생긴다.
  var GT_LIST_ROW_HEIGHT = 24;
  var GT_LIST_BUFFER_ROWS = 5;
  var GT_LIST_CONTAINER_CLASS_EMPTY = "overflow-x-auto overflow-y-auto max-h-40 bg-slate-50 border border-slate-100 rounded-lg p-2 min-h-[2.5rem]";
  var GT_LIST_CONTAINER_CLASS_FULL = "max-h-40 bg-slate-50 border border-slate-100 rounded-lg p-2 min-h-[2.5rem] flex flex-col";
  var gtListMatchOrder = [];
  var gtListUsedSet = {};
  var gtListRowsEl = null;
  var gtListScrollBodyEl = null;
  var gtListScrollListenerAttached = false;

  function buildGtRowHtml(code, idx, used) {
    var isUsed = !!used[code];
    var statusHtml = isUsed
      ? '<span class="px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 text-[10px] font-semibold">사용중</span>'
      : '<span class="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">사용가능</span>';
    return (
      '<div data-gt-row style="position:absolute;left:0;top:' + (idx * GT_LIST_ROW_HEIGHT) + 'px;width:100%;height:' + GT_LIST_ROW_HEIGHT + 'px" class="flex items-center border-b border-slate-100 text-xs">' +
      '<div class="w-10 shrink-0 px-2 text-slate-400 text-right">' + (idx + 1) + "</div>" +
      '<div class="flex-1 min-w-0 px-2 truncate font-mono font-medium ' + (isUsed ? "text-slate-400" : "text-indigo-700") + '">' + escapeHtml(code) + "</div>" +
      '<div class="w-20 shrink-0 px-2 text-right">' + statusHtml + "</div>" +
      "</div>"
    );
  }

  function renderGtVisibleRows() {
    if (!gtListRowsEl || !gtListScrollBodyEl) return;
    var total = gtListMatchOrder.length;
    var scrollTop = gtListScrollBodyEl.scrollTop;
    var viewportHeight = gtListScrollBodyEl.clientHeight;
    var firstVisible = Math.floor(scrollTop / GT_LIST_ROW_HEIGHT);
    var visibleCount = Math.ceil(viewportHeight / GT_LIST_ROW_HEIGHT) + 1;
    var start = Math.max(0, firstVisible - GT_LIST_BUFFER_ROWS);
    var end = Math.min(total, firstVisible + visibleCount + GT_LIST_BUFFER_ROWS);
    var html = "";
    for (var i = start; i < end; i++) {
      html += buildGtRowHtml(gtListMatchOrder[i], i, gtListUsedSet);
    }
    gtListRowsEl.innerHTML = html;
  }

  function attachGtListScrollListener() {
    if (gtListScrollListenerAttached) return;
    gtListScrollListenerAttached = true;
    var ticking = false;
    gtListScrollBodyEl.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        renderGtVisibleRows();
      });
    }, { passive: true });
  }

  function renderGtAvailableList() {
    var used = getGtUsedSet();
    var availableCount = 0;
    for (var i = 0; i < state.gtCodes.length; i++) {
      if (!used[state.gtCodes[i]]) availableCount++;
    }
    els.gtAvailableCount.textContent = availableCount;

    if (!state.gtCodes.length) {
      els.gtAvailableList.className = GT_LIST_CONTAINER_CLASS_EMPTY;
      els.gtAvailableList.innerHTML = '<span class="text-xs text-slate-400">저장된 GT 데이터가 없습니다.</span>';
      gtListMatchOrder = [];
      gtListUsedSet = {};
      gtListRowsEl = null;
      gtListScrollBodyEl = null;
      gtListScrollListenerAttached = false;
      return;
    }

    // 자동매칭/GT출력과 동일한 역순(나중에 붙여넣은 것부터)으로 보여줘서
    // 1행이 곧 다음 매칭에 쓰일 코드임을 그대로 확인할 수 있게 함
    gtListMatchOrder = state.gtCodes.slice().reverse();
    gtListUsedSet = used;
    var totalHeight = gtListMatchOrder.length * GT_LIST_ROW_HEIGHT;

    els.gtAvailableList.className = GT_LIST_CONTAINER_CLASS_FULL;
    els.gtAvailableList.innerHTML =
      '<div class="flex text-slate-400 border-b border-slate-200 text-xs font-medium shrink-0">' +
      '<div class="w-10 shrink-0 px-2 py-1 text-right">순번</div>' +
      '<div class="flex-1 min-w-0 px-2 py-1 text-left">GT 코드</div>' +
      '<div class="w-20 shrink-0 px-2 py-1 text-right">상태</div>' +
      "</div>" +
      '<div id="gtListScrollBody" class="flex-1 min-h-0 overflow-y-auto overflow-x-auto">' +
      '<div style="position:relative;height:' + totalHeight + 'px">' +
      '<div id="gtListRows" style="position:absolute;left:0;top:0;width:100%"></div>' +
      "</div>" +
      "</div>";

    gtListScrollBodyEl = document.getElementById("gtListScrollBody");
    gtListRowsEl = document.getElementById("gtListRows");
    gtListScrollListenerAttached = false;
    attachGtListScrollListener();
    renderGtVisibleRows();
  }

  async function setAssignGt(key, code) {
    if (code) {
      var dupKey = Object.keys(state.gtAssignments).filter(function (k) { return k !== key; }).find(function (k) { return state.gtAssignments[k] === code; });
      if (dupKey && !(await window.confirmModal("이 GT 코드(" + code + ")는 이미 다른 행에 사용 중입니다. 그래도 사용하시겠습니까?"))) {
        setTimeout(Pick.renderAssignPanel, 0);
        return;
      }
      state.gtAssignments[key] = code;
    } else {
      delete state.gtAssignments[key];
    }
    saveGtState();
    renderGtAvailableList();
    // change 이벤트가 이 input의 blur 처리 중일 수 있으므로, 그 처리가 끝난 뒤
    // 다음 틱에 컨테이너를 다시 그려서 "노드가 더 이상 자식이 아님" 오류를 피함.
    setTimeout(Pick.renderAssignPanel, 0);
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
    Pick.renderAssignPanel();
    if (window.showToast) {
      window.showToast(ai > 0 ? "GT " + ai + "건이 자동매칭되었습니다." : "매칭할 수 있는 GT 코드가 없습니다.", ai > 0 ? "success" : "error");
    }
  }

  function resetGtForWorker(cfg, detailRows) {
    detailRows.forEach(function (r) {
      delete state.gtAssignments[cfg.id + ":" + r.id];
    });
    saveGtState();
    renderGtAvailableList();
    Pick.renderAssignPanel();
    if (window.showToast) window.showToast("GT 매칭이 초기화되었습니다.", "info");
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

  // GT 라벨류(GT출력/할당출력/여분출력/커스텀출력) 인쇄 여백 — 프린터/라벨지에
  // 따라 필요한 여백이 달라질 수 있어 코드에 값을 고정하지 않고, 사용자가 "라벨
  // 여백 설정" 모달에서 mm 단위로 직접 조절해 localStorage에 저장하도록 함.
  // 라벨 콘텐츠 자체(w-[5cm] h-[4cm])는 항상 고정, 4방향 여유 공간만 조절됨.
  function loadLabelMargin() {
    var right = parseFloat(localStorage.getItem(LABEL_MARGIN_RIGHT_KEY));
    var bottom = parseFloat(localStorage.getItem(LABEL_MARGIN_BOTTOM_KEY));
    var left = parseFloat(localStorage.getItem(LABEL_MARGIN_LEFT_KEY));
    var top = parseFloat(localStorage.getItem(LABEL_MARGIN_TOP_KEY));
    return {
      right: isNaN(right) ? LABEL_MARGIN_DEFAULT : right,
      bottom: isNaN(bottom) ? LABEL_MARGIN_DEFAULT : bottom,
      left: isNaN(left) ? LABEL_MARGIN_LEFT_TOP_DEFAULT : left,
      top: isNaN(top) ? LABEL_MARGIN_LEFT_TOP_DEFAULT : top
    };
  }

  function applyGtLabelPageStyle(rightMm, bottomMm, leftMm, topMm) {
    var styleEl = document.getElementById("gtLabelPageStyleOverride");
    if (!styleEl) return;
    var pageWidthCm = 5 + rightMm / 10 + leftMm / 10;
    var pageHeightCm = 4 + bottomMm / 10 + topMm / 10;
    styleEl.textContent =
      "@media print { @page pick-label { size: " + pageWidthCm + "cm " + pageHeightCm + "cm; margin: " + topMm + "mm " + rightMm + "mm " + bottomMm + "mm " + leftMm + "mm; } }";
  }

  // innerHTML 갱신 직후 곧바로 print()를 호출하면 브라우저가 레이아웃을 아직
  // 반영하지 않아 이전 인쇄 내용이 나올 수 있음 — 두 번의 rAF로 페인트를 기다린 뒤 인쇄
  function triggerPrint(onConfirmed) {
    window.printWithConfirm(onConfirmed);
  }

  function printWorkerLabels(cfg, detailRows, onConfirmed) {
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
    triggerPrint(onConfirmed);
  }

  // 집품 할당과 무관하게 GT 바코드 자체만 담긴 라벨을 인쇄. 최근 붙여넣은
  // 순서부터(역순) 요청한 수량만큼 뽑아 인쇄하며, 인쇄된 코드는 gtPrintBtn
  // 핸들러에서 state.gtPrinted로 소진 처리되어 재사용/중복 인쇄가 불가능해짐.
  function printGtLabels(codes, onConfirmed) {
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
    triggerPrint(onConfirmed);
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

    // GT 소모는 출력을 실제로 확인받은 뒤에만 반영(취소 시 소모하지 않음).
    triggerPrint(function () {
      if (useAutoMatch && autoCodes.length) {
        autoCodes.forEach(function (c) { state.gtPrinted.push(c); });
        saveGtState();
        renderGtAvailableList();
      }
    });
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

    // GT 소모는 출력을 실제로 확인받은 뒤에만 반영(취소 시 소모하지 않음).
    triggerPrint(function () {
      if (usedCodes.length) {
        usedCodes.forEach(function (c) { state.gtPrinted.push(c); });
        saveGtState();
        renderGtAvailableList();
      }
    });
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


  // 아래 두 함수는 main.js의 이벤트 와이어링(스페어 출력 모달 취소/출력 버튼)에서
  // 호출된다 — pendingSparePrintRows는 이 파일(gt-print.js) 소유이므로 다른 파일이
  // 직접 재할당하지 않고(Pick.* 동기화 누락 방지) 함수로 감쌌다.

  function cancelSparePrintModal() {
    closeModalWithTransition(els.sparePrintModal, els.sparePrintModalBox);
    pendingSparePrintRows = null;
    resetSparePrintModal();
  }

  function confirmSparePrintModal() {
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
  }

  // --- exposed to other js/pick/*.js files via window.Pick ---
  Pick.saveGtState = saveGtState;
  Pick.loadGtState = loadGtState;
  Pick.parseGtTokens = parseGtTokens;
  Pick.getGtUsedSet = getGtUsedSet;
  Pick.getAvailableGtCodes = getAvailableGtCodes;
  Pick.GT_LIST_ROW_HEIGHT = GT_LIST_ROW_HEIGHT;
  Pick.GT_LIST_BUFFER_ROWS = GT_LIST_BUFFER_ROWS;
  Pick.GT_LIST_CONTAINER_CLASS_EMPTY = GT_LIST_CONTAINER_CLASS_EMPTY;
  Pick.GT_LIST_CONTAINER_CLASS_FULL = GT_LIST_CONTAINER_CLASS_FULL;
  Pick.gtListMatchOrder = gtListMatchOrder;
  Pick.gtListUsedSet = gtListUsedSet;
  Pick.gtListRowsEl = gtListRowsEl;
  Pick.gtListScrollBodyEl = gtListScrollBodyEl;
  Pick.gtListScrollListenerAttached = gtListScrollListenerAttached;
  Pick.buildGtRowHtml = buildGtRowHtml;
  Pick.renderGtVisibleRows = renderGtVisibleRows;
  Pick.attachGtListScrollListener = attachGtListScrollListener;
  Pick.renderGtAvailableList = renderGtAvailableList;
  Pick.setAssignGt = setAssignGt;
  Pick.autoMatchGtForWorker = autoMatchGtForWorker;
  Pick.resetGtForWorker = resetGtForWorker;
  Pick.formatMonthDay = formatMonthDay;
  Pick.formatDateDisplay = formatDateDisplay;
  Pick.formatDateOnly = formatDateOnly;
  Pick.bracketPart = bracketPart;
  Pick.formatPurchaseTypeLabel = formatPurchaseTypeLabel;
  Pick.buildBarcodeHtml = buildBarcodeHtml;
  Pick.buildBarcodeCellHtml = buildBarcodeCellHtml;
  Pick.buildLabelHtml = buildLabelHtml;
  Pick.renderLabelBarcodes = renderLabelBarcodes;
  Pick.loadLabelMargin = loadLabelMargin;
  Pick.applyGtLabelPageStyle = applyGtLabelPageStyle;
  Pick.triggerPrint = triggerPrint;
  Pick.printWorkerLabels = printWorkerLabels;
  Pick.printGtLabels = printGtLabels;
  Pick.printCustomLabels = printCustomLabels;
  Pick.getCustomLabelCompanyMatches = getCustomLabelCompanyMatches;
  Pick.fillCustomLabelFieldsFromCompany = fillCustomLabelFieldsFromCompany;
  Pick.renderCustomLabelCompanyDropdown = renderCustomLabelCompanyDropdown;
  Pick.openCustomLabelCompanyDropdown = openCustomLabelCompanyDropdown;
  Pick.closeCustomLabelCompanyDropdown = closeCustomLabelCompanyDropdown;
  Pick.resetCustomLabelModal = resetCustomLabelModal;
  Pick.computeSpareGroups = computeSpareGroups;
  Pick.spareGroupKey = spareGroupKey;
  Pick.spareGroupCount = spareGroupCount;
  Pick.buildBlankLabelHtml = buildBlankLabelHtml;
  Pick.printSpareLabels = printSpareLabels;
  Pick.pendingSparePrintRows = pendingSparePrintRows;
  Pick.sparePrintOverrides = sparePrintOverrides;
  Pick.getQualifyingSpareGroups = getQualifyingSpareGroups;
  Pick.computeSparePreviewTotal = computeSparePreviewTotal;
  Pick.renderSparePrintGroupList = renderSparePrintGroupList;
  Pick.updateSparePrintPreview = updateSparePrintPreview;
  Pick.handleSparePrintClick = handleSparePrintClick;
  Pick.resetSparePrintModal = resetSparePrintModal;
  Pick.cancelSparePrintModal = cancelSparePrintModal;
  Pick.confirmSparePrintModal = confirmSparePrintModal;
})(window.Pick = window.Pick || {});
