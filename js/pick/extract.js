(function (Pick) {
  "use strict";

  // --- imported from other js/pick/*.js files via window.Pick ---
  var COLUMNS = Pick.COLUMNS;
  var els = Pick.els;
  var escapeHtml = Pick.escapeHtml;
  var matrixToRows = Pick.matrixToRows;
  var applyParsedRows = Pick.applyParsedRows;
  var switchView = Pick.switchView;
  var formatDateOnly = Pick.formatDateOnly;

  // 확정 전까지는 state.rows에 반영하지 않는 임시 추출 결과 — "홈에 병합" 버튼을
  // 눌러야만 applyParsedRows()를 통해 실제로 합쳐진다.
  var extractedRows = [];

  // 시트2(A~N열, COLUMNS 표준 양식이 아니라 열 위치로만 읽음)에서 N열(인덱스 13)이
  // "집품대기"인 행만 골라 H열(인덱스 7, 업체명)을 중복 제거해 Set으로 반환.
  // 1행은 머리글이라 건너뛴다.
  function parseSheet2CompanySet(matrix) {
    var set = new Set();
    for (var i = 1; i < matrix.length; i++) {
      var row = matrix[i];
      var status = (row[13] === undefined || row[13] === null ? "" : String(row[13])).trim();
      if (status !== "집품대기") continue;
      var company = (row[7] === undefined || row[7] === null ? "" : String(row[7])).trim();
      if (company) set.add(company);
    }
    return set;
  }

  function updateExtractSummary(rows) {
    var totalQty = rows.reduce(function (sum, r) { return sum + Number(r.quantity || 0); }, 0);
    els.extractSummary.textContent = rows.length ? rows.length + "건 · 총 " + totalQty.toLocaleString("ko-KR") + "개" : "";
  }

  function renderExtractTable(rows) {
    updateExtractSummary(rows);
    if (!rows.length) {
      els.extractDataTable.classList.add("hidden");
      els.extractEmptyState.classList.remove("hidden");
      els.extractTableBody.innerHTML = "";
      return;
    }
    els.extractDataTable.classList.remove("hidden");
    els.extractEmptyState.classList.add("hidden");

    var tdBase = "px-4 py-2.5 whitespace-nowrap text-slate-700";
    els.extractTableBody.innerHTML = rows.map(function (r) {
      return (
        '<tr class="hover:bg-slate-50/80 transition-colors">' +
        COLUMNS.map(function (col) {
          if (col.key === "quantity") {
            return '<td class="' + tdBase + ' text-right tabular-nums">' + Number(r.quantity || 0).toLocaleString("ko-KR") + "</td>";
          }
          if (col.key === "deadline" || col.key === "createdAt") {
            return '<td class="' + tdBase + '">' + escapeHtml(formatDateOnly(r[col.key])) + "</td>";
          }
          return '<td class="' + tdBase + '">' + escapeHtml(r[col.key]) + "</td>";
        }).join("") +
        "</tr>"
      );
    }).join("");
  }

  function updateExtractMergeBtnState() {
    els.extractMergeBtn.disabled = extractedRows.length === 0;
  }

  function setExtractStatusMsg(msg, kind) {
    var color = kind === "error" ? "text-rose-600" : kind === "ok" ? "text-emerald-600" : "text-slate-500";
    els.extractStatusMsg.textContent = msg || "";
    els.extractStatusMsg.className = "text-xs " + color;
  }

  function handleExtractFile(file) {
    if (!file) return;
    els.extractFileName.textContent = file.name;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = new Uint8Array(e.target.result);
        var wb = XLSX.read(data, { type: "array" });
        if (wb.SheetNames.length < 2) {
          setExtractStatusMsg("엑셀 파일에 시트가 2개 이상 있어야 합니다(시트1: 집품 리스트, 시트2: A~N열 원본 데이터).", "error");
          return;
        }
        var sheet1Matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
        var sheet2Matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[1]], { header: 1, raw: false, defval: "" });

        // 시트1은 홈 업로드와 완전히 같은 양식이므로 기존 matrixToRows()를 그대로 재사용.
        var parsed = matrixToRows(sheet1Matrix);
        if (parsed.error) {
          setExtractStatusMsg("시트1 파싱 오류: " + parsed.error, "error");
          return;
        }

        var companySet = parseSheet2CompanySet(sheet2Matrix);
        // 최종 조건(AND): 시트1 상태="집품대기" 이면서 업체명이 시트2에서 뽑은
        // 업체명 집합에도 포함된 행만.
        var filtered = parsed.rows.filter(function (r) {
          return r.status === "집품대기" && companySet.has(r.company);
        });

        extractedRows = filtered;
        renderExtractTable(extractedRows);
        updateExtractMergeBtnState();
        setExtractStatusMsg(extractedRows.length + "건이 추출되었습니다.", extractedRows.length ? "ok" : "error");
      } catch (err) {
        setExtractStatusMsg("엑셀 파일을 읽는 중 오류가 발생했습니다: " + err.message, "error");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function mergeExtractedIntoHome() {
    if (!extractedRows.length) return;
    var result = applyParsedRows(extractedRows);
    setExtractStatusMsg("홈에 " + result.added + "건을 병합했습니다." +
      (result.skipped ? " (중복 " + result.skipped + "건 제외)" : ""), "ok");
    extractedRows = [];
    renderExtractTable(extractedRows);
    updateExtractMergeBtnState();
    switchView("home");
  }

  function resetExtractPreview() {
    extractedRows = [];
    els.extractFileInput.value = "";
    els.extractFileName.textContent = "";
    setExtractStatusMsg("", "");
    renderExtractTable(extractedRows);
    updateExtractMergeBtnState();
  }

  // --- exposed to other js/pick/*.js files via window.Pick ---
  Pick.handleExtractFile = handleExtractFile;
  Pick.mergeExtractedIntoHome = mergeExtractedIntoHome;
  Pick.resetExtractPreview = resetExtractPreview;
})(window.Pick = window.Pick || {});
