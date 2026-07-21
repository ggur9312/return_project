/* ================================================================
   SECTION 1: GLOBAL STATE
   ================================================================ */
let globalProcessedData = {}; // Stores core processed data structured by date
let activeTabDate = null;     // Track current tab

const dropZone = document.getElementById('truckDropZone');
const fileInput = document.getElementById('excelFile');


/* ================================================================
   SECTION 2: DRAG & DROP / FILE INPUT LISTENERS
   ================================================================ */
dropZone.addEventListener('click', () => fileInput.click());

['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.add('border-indigo-500', 'bg-indigo-50/30');
    }, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-indigo-500', 'bg-indigo-50/30');
    }, false);
});

dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length) {
        fileInput.files = files;
        handleFile(files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
        // reset input so same file can be selected again
        fileInput.value = '';
    }
});


/* ================================================================
   SECTION 2B: 업로드 모달 (버튼 클릭 시 오픈, 파일선택/붙여넣기 포함)
   ================================================================ */
const truckUploadModal = document.getElementById('truckUploadModal');
const truckUploadModalBox = document.getElementById('truckUploadModalBox');

function openTruckUploadModal() {
    if (!truckUploadModal.classList.contains('hidden')) return;
    if (window.lockBodyScroll) window.lockBodyScroll();
    truckUploadModal.classList.remove('hidden');
    truckUploadModal.classList.add('flex');
    requestAnimationFrame(() => {
        truckUploadModal.classList.remove('opacity-0');
        truckUploadModalBox.classList.remove('scale-95');
    });
}

function closeTruckUploadModal() {
    if (truckUploadModal.classList.contains('opacity-0')) return;
    truckUploadModal.classList.add('opacity-0');
    truckUploadModalBox.classList.add('scale-95');
    setTimeout(() => {
        truckUploadModal.classList.remove('flex');
        truckUploadModal.classList.add('hidden');
        if (window.unlockBodyScroll) window.unlockBodyScroll();
    }, 200);
}

document.getElementById('truckUploadBtn').addEventListener('click', openTruckUploadModal);
document.getElementById('truckUploadCloseBtn').addEventListener('click', closeTruckUploadModal);


/* ================================================================
   SECTION 2B-2: 트럭 건 수동 추가 모달
   ================================================================ */
const truckAddModal = document.getElementById('truckAddModal');
const truckAddModalBox = document.getElementById('truckAddModalBox');

function openTruckAddModal() {
    if (!truckAddModal.classList.contains('hidden')) return;
    if (window.lockBodyScroll) window.lockBodyScroll();
    document.getElementById('truckAddGroupNoInput').value = '';
    document.getElementById('truckAddDateInput').value = '';
    document.getElementById('truckAddCompanyInput').value = '';
    document.getElementById('truckAddMsg').classList.add('hidden');
    truckAddModal.classList.remove('hidden');
    truckAddModal.classList.add('flex');
    requestAnimationFrame(() => {
        truckAddModal.classList.remove('opacity-0');
        truckAddModalBox.classList.remove('scale-95');
    });
}

function closeTruckAddModal() {
    if (truckAddModal.classList.contains('opacity-0')) return;
    truckAddModal.classList.add('opacity-0');
    truckAddModalBox.classList.add('scale-95');
    setTimeout(() => {
        truckAddModal.classList.remove('flex');
        truckAddModal.classList.add('hidden');
        if (window.unlockBodyScroll) window.unlockBodyScroll();
    }, 200);
}

function confirmTruckAdd() {
    const groupNo = document.getElementById('truckAddGroupNoInput').value.trim();
    const dateVal = document.getElementById('truckAddDateInput').value;
    const company = document.getElementById('truckAddCompanyInput').value.trim();
    const msgEl = document.getElementById('truckAddMsg');

    if (!dateVal || !company) {
        msgEl.textContent = '생성일시와 업체명은 필수입니다.';
        msgEl.classList.remove('hidden');
        return;
    }

    if (!globalProcessedData[dateVal]) globalProcessedData[dateVal] = [];

    // processData()와 동일한 그룹번호_업체명 중복 검사(같은 날짜 버킷 내에서만)
    const uniqueKey = `${groupNo}_${company}`;
    const isDuplicate = globalProcessedData[dateVal].some(item => `${item.groupNo}_${item.company}` === uniqueKey);
    if (isDuplicate) {
        msgEl.textContent = '이미 같은 그룹번호/업체명의 데이터가 해당 날짜에 존재합니다.';
        msgEl.classList.remove('hidden');
        return;
    }

    globalProcessedData[dateVal].push({
        groupNo: groupNo,
        company: company,
        picking: false,
        inputs: { palette: 'KPP', emptyGt: 0, palettePick: 0, paletteGt: 0 }
    });
    globalProcessedData[dateVal].sort((a, b) => a.company.localeCompare(b.company, 'ko-KR'));

    document.getElementById('truckEmptyState').classList.add('hidden');
    document.getElementById('activeFileInfo').classList.remove('hidden');

    activeTabDate = dateVal; // 방금 추가한 날짜 탭이 바로 보이도록
    renderDashboard(globalProcessedData);
    closeTruckAddModal();
    showToast('트럭 건이 추가되었습니다.');
}

document.getElementById('truckAddBtn').addEventListener('click', openTruckAddModal);
document.getElementById('truckAddCloseBtn').addEventListener('click', closeTruckAddModal);
document.getElementById('truckAddCancelBtn').addEventListener('click', closeTruckAddModal);
document.getElementById('truckAddConfirmBtn').addEventListener('click', confirmTruckAdd);


// core.js의 textToMatrix()와 동일 로직(줄바꿈/탭 분리) — js/truck.js는 window.Pick과
// 별개라 로컬로 복제한다.
function truckTextToMatrix(text) {
    return text
        .split(/\r\n|\r|\n/)
        .filter(line => line.trim().length > 0)
        .map(line => {
            const delimiter = line.indexOf('\t') !== -1 ? '\t' : ',';
            return line.split(delimiter).map(s => s.trim());
        });
}

document.getElementById('truckPasteApplyBtn').addEventListener('click', () => {
    const text = document.getElementById('truckPasteArea').value;
    if (!text.trim()) {
        showToast('붙여넣을 데이터를 입력해주세요.', 'error');
        return;
    }
    const matrix = truckTextToMatrix(text);
    if (matrix.length < 2) {
        showToast('가공할 데이터가 부족합니다.', 'error');
        return;
    }
    processData(matrix, '붙여넣기');
    document.getElementById('truckPasteArea').value = '';
});


/* ================================================================
   SECTION 2C: 계산기 위젯 (드래그 가능한 팝업, 배경을 막지 않음)
   ================================================================ */
let calcState = { display: '0', prevValue: null, operator: null, waitingForOperand: false };

const CALC_OP_SYMBOLS = { '+': '+', '-': '−', '*': '×', '/': '÷' };

function calcUpdateDisplay() {
    document.getElementById('calcDisplay').textContent = calcState.display;
    const pendingEl = document.getElementById('calcPendingLabel');
    if (pendingEl) {
        pendingEl.textContent = (calcState.operator && calcState.prevValue !== null)
            ? (calcState.prevValue + ' ' + (CALC_OP_SYMBOLS[calcState.operator] || calcState.operator))
            : '';
    }
}

function calcInputDigit(d) {
    if (calcState.waitingForOperand) {
        calcState.display = d;
        calcState.waitingForOperand = false;
    } else {
        calcState.display = calcState.display === '0' ? d : calcState.display + d;
    }
    calcUpdateDisplay();
}

function calcInputDecimal() {
    if (calcState.waitingForOperand) {
        calcState.display = '0.';
        calcState.waitingForOperand = false;
    } else if (calcState.display.indexOf('.') === -1) {
        calcState.display += '.';
    }
    calcUpdateDisplay();
}

function calcClear() {
    calcState = { display: '0', prevValue: null, operator: null, waitingForOperand: false };
    calcUpdateDisplay();
}

function calcBackspace() {
    if (calcState.waitingForOperand) return;
    calcState.display = calcState.display.length > 1 ? calcState.display.slice(0, -1) : '0';
    calcUpdateDisplay();
}

function calcCompute(a, b, op) {
    switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b === 0 ? 0 : a / b;
        default: return b;
    }
}

function calcRound(n) {
    return Math.round(n * 1e10) / 1e10;
}

function calcInputOperator(nextOp) {
    const inputValue = parseFloat(calcState.display);
    if (calcState.prevValue === null) {
        calcState.prevValue = inputValue;
    } else if (calcState.operator && !calcState.waitingForOperand) {
        const result = calcRound(calcCompute(calcState.prevValue, inputValue, calcState.operator));
        calcState.display = String(result);
        calcState.prevValue = result;
    }
    calcState.waitingForOperand = true;
    calcState.operator = nextOp;
    calcUpdateDisplay();
}

function calcEquals() {
    const inputValue = parseFloat(calcState.display);
    if (calcState.operator !== null && calcState.prevValue !== null) {
        const result = calcRound(calcCompute(calcState.prevValue, inputValue, calcState.operator));
        calcState.display = String(result);
        calcState.prevValue = null;
        calcState.operator = null;
        calcState.waitingForOperand = true;
        calcUpdateDisplay();
    }
}

const calcWidget = document.getElementById('calcWidget');
const calcOpenBtn = document.getElementById('calcOpenBtn');
const calcCloseBtn = document.getElementById('calcCloseBtn');
const calcDragHandle = document.getElementById('calcDragHandle');

function calcOpenWidget() {
    calcWidget.classList.remove('hidden');
    requestAnimationFrame(() => {
        calcWidget.classList.remove('opacity-0', 'scale-95');
    });
}

if (calcOpenBtn) calcOpenBtn.addEventListener('click', calcOpenWidget);

calcCloseBtn.addEventListener('click', () => {
    calcWidget.classList.add('opacity-0', 'scale-95');
    setTimeout(() => calcWidget.classList.add('hidden'), 150);
});

calcWidget.querySelectorAll('button[data-calc]').forEach((btn) => {
    btn.addEventListener('click', () => {
        const type = btn.dataset.calc;
        if (type === 'digit') calcInputDigit(btn.dataset.digit);
        else if (type === 'decimal') calcInputDecimal();
        else if (type === 'clear') calcClear();
        else if (type === 'backspace') calcBackspace();
        else if (type === 'op') calcInputOperator(btn.dataset.op);
        else if (type === 'equals') calcEquals();
    });
});

// 제목 표시줄을 드래그하면 위젯을 원하는 위치로 옮길 수 있음 — 기본값(우하단 고정)에서
// 한 번 옮기면 그 지점에 top/left로 고정되고, 새로고침하면 다시 기본 위치로 돌아옴.
let calcDragOffsetX = 0;
let calcDragOffsetY = 0;
let calcDragging = false;

calcDragHandle.addEventListener('mousedown', (e) => {
    calcDragging = true;
    const rect = calcWidget.getBoundingClientRect();
    calcDragOffsetX = e.clientX - rect.left;
    calcDragOffsetY = e.clientY - rect.top;
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    if (!calcDragging) return;
    const x = e.clientX - calcDragOffsetX;
    const y = e.clientY - calcDragOffsetY;
    calcWidget.style.left = Math.max(0, x) + 'px';
    calcWidget.style.top = Math.max(0, y) + 'px';
    calcWidget.style.right = 'auto';
    calcWidget.style.bottom = 'auto';
});

document.addEventListener('mouseup', () => {
    calcDragging = false;
});


/* ================================================================
   SECTION 3: TOAST NOTIFICATION UTILITY
   ================================================================ */
// showToast()는 js/shell.js로 이동(집품/트럭 두 앱 공용 전역 함수).

/* ================================================================
   SECTION 4: DATA RESET
   ================================================================ */
async function clearData() {
    if (!(await window.confirmModal('모든 데이터를 초기화하시겠습니까?'))) return;
    globalProcessedData = {};
    activeTabDate = null;
    document.getElementById('dashboardContainer').classList.add('hidden');
    document.getElementById('printSettingsCard').classList.add('hidden');
    document.getElementById('truckEmptyState').classList.remove('hidden');
    document.getElementById('activeFileInfo').classList.add('hidden');
    renderCycleDateTabs();
    saveState();
    showToast('데이터가 초기화되었습니다.', 'info');
}

async function deleteDateData(date) {
    if (!(await window.confirmModal(`${date} 데이터를 삭제하시겠습니까?`))) return;

    delete globalProcessedData[date];
    const remainingDates = Object.keys(globalProcessedData);

    if (remainingDates.length === 0) {
        activeTabDate = null;
        document.getElementById('dashboardContainer').classList.add('hidden');
        document.getElementById('printSettingsCard').classList.add('hidden');
        document.getElementById('truckEmptyState').classList.remove('hidden');
        document.getElementById('activeFileInfo').classList.add('hidden');
    } else {
        if (activeTabDate === date) {
            activeTabDate = remainingDates.sort()[0];
        }
        renderDashboard(globalProcessedData);
    }

    renderCycleDateTabs();
    saveState();
    showToast(`${date} 데이터가 삭제되었습니다.`, 'info');
}


/* ================================================================
   SECTION 5: EXCEL FILE UPLOAD & PARSING
   ================================================================ */
function handleFile(file) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
        showToast('엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            // cellDates:true를 쓰지 않는다 - SheetJS가 날짜 셀을 Date 객체로 변환할 때
            // 브라우저 시간대에 따라 실제 날짜보다 하루 어긋난 값을 만드는 문제가 있어,
            // 원본 엑셀 일련번호(raw serial number)를 그대로 받아 parseExcelDate에서 직접 계산한다.
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            if (jsonData.length < 2) {
                showToast('가공할 데이터가 엑셀 시트에 부족합니다.', 'error');
                return;
            }

            processData(jsonData, file.name);
        } catch (err) {
            console.error(err);
            showToast('엑셀 구조 해석 중 오류가 발생했습니다.', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

// 로컬(브라우저) 시간대 기준으로 YYYY-MM-DD 포맷. toISOString()은 UTC 기준이라
// 엑셀 원본이 자정이 아닌 시각으로 직렬화된 경우 한국 시간대에서 하루 당겨지는 문제가 있어 사용하지 않는다.
function formatDateYmdLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parseExcelDate(val) {
    if (!val) return '미지정 일시';
    if (val instanceof Date) {
        return formatDateYmdLocal(val);
    }
    if (typeof val === 'number') {
        const date = new Date((val - 25569) * 86400 * 1000);
        return formatDateYmdLocal(date);
    }
    let str = String(val).trim();
    if (str.includes(' ')) {
        str = str.split(' ')[0];
    }
    return str;
}


/* ================================================================
   SECTION 6: DATA PROCESSING (필터링 / 중복제거 / 병합)
   ================================================================ */
function processData(data, fileName) {
    const headers = data[0].map(h => String(h).trim());

    const groupIdx = headers.indexOf('그룹번호');
    const dateIdx = headers.indexOf('생성일시');
    const companyIdx = headers.indexOf('업체명');
    const transportTypeIdx = headers.indexOf('운송타입');

    if (groupIdx === -1 || dateIdx === -1 || companyIdx === -1) {
        showToast('필수 열 머리글(그룹번호, 생성일시, 업체명)이 확인되지 않습니다.', 'error');
        return;
    }
    if (transportTypeIdx === -1) {
        showToast('열 머리글에 "운송타입"이 존재하지 않아 필터링을 수행할 수 없습니다.', 'error');
        return;
    }

    const rawRows = data.slice(1);
    let addedCount = 0;

    rawRows.forEach(row => {
        if (!row[groupIdx] && !row[companyIdx]) return;

        const transportType = row[transportTypeIdx] ? String(row[transportTypeIdx]).trim() : '';
        if (transportType !== '트럭') return;

        const dateKey = parseExcelDate(row[dateIdx]);
        const groupNo = row[groupIdx] ? String(row[groupIdx]).trim() : '';
        const companyName = row[companyIdx] ? String(row[companyIdx]).trim() : '';
        const uniqueKey = `${groupNo}_${companyName}`;

        if (!globalProcessedData[dateKey]) {
            globalProcessedData[dateKey] = [];
        }

        // Check Duplication within the specific date
        const isDuplicate = globalProcessedData[dateKey].some(item => `${item.groupNo}_${item.company}` === uniqueKey);

        if (!isDuplicate) {
            globalProcessedData[dateKey].push({
                groupNo: groupNo,
                company: companyName,
                picking: false,
                inputs: {
                    palette: 'KPP',
                    emptyGt: 0,
                    palettePick: 0,
                    paletteGt: 0
                }
            });
            addedCount++;
        }
    });

    if (Object.keys(globalProcessedData).length === 0) {
        showToast(`조건(운송타입: '트럭')에 맞는 유효한 데이터가 없습니다.`, 'error');
        return;
    }

    // Sort all dates by company name
    for (const date in globalProcessedData) {
        globalProcessedData[date].sort((a, b) => a.company.localeCompare(b.company, 'ko-KR'));
    }

    document.getElementById('truckEmptyState').classList.add('hidden');
    document.getElementById('activeFileInfo').classList.remove('hidden');

    renderDashboard(globalProcessedData);
    closeTruckUploadModal();

    if (addedCount > 0) {
        showToast(`트럭 운송 데이터 ${addedCount}건이 병합(누적) 되었습니다.`);
    } else {
        showToast(`새로 추가된 데이터가 없습니다. (모두 중복이거나 트럭 조건 불일치)`, 'info');
    }
}


/* ================================================================
   SECTION 7: DASHBOARD RENDERING (탭 / 테이블)
   ================================================================ */
function getSafeId(str) {
    return btoa(encodeURIComponent(str)).replace(/=/g, '');
}

function renderDashboard(data) {
    const container = document.getElementById('dashboardContainer');
    container.classList.remove('hidden');
    document.getElementById('printSettingsCard').classList.remove('hidden');

    const tabsContainer = document.getElementById('tabsContainer');
    const tableContainer = document.getElementById('tableContainer');

    tabsContainer.innerHTML = '';
    tableContainer.innerHTML = '';

    const sortedDates = Object.keys(data).sort();

    // Retain active tab if it exists in new data, else select first
    if (!activeTabDate || !sortedDates.includes(activeTabDate)) {
        activeTabDate = sortedDates[0];
    }

    sortedDates.forEach((date) => {
        const safeTabDate = getSafeId(date);
        const uniqueTabId = `tab-${safeTabDate}`;
        const uniquePanelId = `panel-${safeTabDate}`;

        const isActive = (date === activeTabDate);

        // Render Tab Button Element
        const tabBtn = document.createElement('button');
        tabBtn.id = uniqueTabId;
        tabBtn.onclick = () => switchTab(date, sortedDates);

        if (isActive) {
            tabBtn.className = "px-4 py-2.5 text-sm font-semibold rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-100 flex items-center space-x-2 transition-all duration-200";
        } else {
            tabBtn.className = "px-4 py-2.5 text-sm font-medium rounded-lg bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 flex items-center space-x-2 transition-all duration-200";
        }

        const badgeClass = isActive ? "bg-indigo-700 text-indigo-100" : "bg-slate-100 text-slate-500";
        const deleteIconClass = isActive ? "text-indigo-200 hover:text-white" : "text-slate-300 hover:text-rose-500";
        tabBtn.innerHTML = `<span>${date}</span><span class="tab-badge px-2 py-0.5 text-xs font-bold rounded-full ${badgeClass}">${data[date].length}건</span><span class="tab-delete-icon ml-1 cursor-pointer ${deleteIconClass}" onclick="event.stopPropagation(); deleteDateData('${date}')" title="이 날짜 데이터 삭제"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></span>`;
        tabsContainer.appendChild(tabBtn);

        // Render Table Block Template
        const tablePanel = document.createElement('div');
        tablePanel.id = uniquePanelId;
        tablePanel.className = isActive ? "block animate-fadeIn" : "hidden";

        let tableRowsHtml = '';
        data[date].forEach((item, itemIdx) => {
            const emptyGt = item.inputs.emptyGt;
            const exp32 = (Math.round((emptyGt / 32) * 10) / 10).toFixed(1);
            const exp24 = (Math.round((emptyGt / 24) * 10) / 10).toFixed(1);

            const sKpp = item.inputs.palette === 'KPP' ? 'selected' : '';
            const sAj = item.inputs.palette === 'AJ' ? 'selected' : '';
            const sPal = item.inputs.palette === '팔레트' ? 'selected' : '';
            const sSm = item.inputs.palette === '소량' ? 'selected' : '';
            const pickingClass = item.picking ? 'bg-amber-50/70' : '';

            tableRowsHtml += `
                <tr id="row-${safeTabDate}-${itemIdx}" class="hover:bg-slate-50/80 transition-colors border-b border-slate-100 ${pickingClass}">
                    <td class="px-3 py-2 text-center">
                        <label class="relative inline-flex items-center cursor-pointer" title="집품중">
                            <input type="checkbox" ${item.picking ? 'checked' : ''} onchange="toggleItemPicking('${date}', ${itemIdx}, this.checked)" class="sr-only peer">
                            <div class="w-9 h-5 bg-slate-200 rounded-full peer-checked:bg-amber-500 transition-colors"></div>
                            <div class="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4"></div>
                        </label>
                    </td>
                    <td class="px-5 py-3 font-semibold text-slate-900 whitespace-nowrap">${item.groupNo}</td>
                    <td class="px-5 py-3 font-medium text-slate-700 whitespace-nowrap">${item.company}</td>
                    <td class="px-3 py-2 w-32">
                        <select onchange="updateInputValue('${date}', ${itemIdx}, 'palette', this.value)" class="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="KPP" ${sKpp}>KPP</option>
                            <option value="AJ" ${sAj}>AJ</option>
                            <option value="팔레트" ${sPal}>팔레트</option>
                            <option value="소량" ${sSm}>소량</option>
                        </select>
                    </td>
                    <td class="px-3 py-2 w-28">
                        <input type="number" min="0" value="${item.inputs.emptyGt}" onfocus="this.select()" oninput="updateInputValue('${date}', ${itemIdx}, 'emptyGt', this.value)" class="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 text-sm text-right font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    </td>
                    <td class="px-3 py-2 w-28">
                        <input type="number" min="0" value="${item.inputs.palettePick}" onfocus="this.select()" oninput="updateInputValue('${date}', ${itemIdx}, 'palettePick', this.value)" class="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 text-sm text-right font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    </td>
                    <td class="px-3 py-2 w-28">
                        <input type="number" min="0" value="${item.inputs.paletteGt}" onfocus="this.select()" oninput="updateInputValue('${date}', ${itemIdx}, 'paletteGt', this.value)" class="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 text-sm text-right font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    </td>
                    <td class="px-4 py-3 w-32 text-right font-bold text-indigo-600 bg-indigo-50/30" id="calc32-${safeTabDate}-${itemIdx}">${exp32}</td>
                    <td class="px-4 py-3 w-32 text-right font-bold text-teal-600 bg-teal-50/30" id="calc24-${safeTabDate}-${itemIdx}">${exp24}</td>
                    <td class="px-3 py-2 w-12 text-center">
                        <button onclick="deleteTruckRow('${date}', ${itemIdx})" class="text-slate-300 hover:text-rose-500" title="삭제">
                            <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </td>
                </tr>
            `;
        });

        tablePanel.innerHTML = `
            <div class="overflow-x-auto bg-white border border-slate-200 rounded-xl shadow-sm">
                <table class="w-full border-collapse text-left min-w-max">
                    <thead>
                        <tr class="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 text-center">
                            <th class="px-3 py-3">집품중</th>
                            <th class="px-5 py-3 text-left">그룹번호</th>
                            <th class="px-5 py-3 text-left">업체명</th>
                            <th class="px-3 py-3 text-left">팔레트 종류</th>
                            <th class="px-3 py-3">빈 GT</th>
                            <th class="px-3 py-3">팔레트 집품</th>
                            <th class="px-3 py-3">팔레트 GT</th>
                            <th class="px-3 py-3 bg-indigo-50/50">예상 팔레트<br><span class="text-[10px] text-indigo-400 font-medium">(32BOX)</span></th>
                            <th class="px-3 py-3 bg-teal-50/50">예상 팔레트<br><span class="text-[10px] text-teal-400 font-medium">(24BOX)</span></th>
                            <th class="px-3 py-3 w-12"></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                        ${tableRowsHtml}
                    </tbody>
                </table>
            </div>
            ${renderTruckPreviewSection(date)}
        `;
        tableContainer.appendChild(tablePanel);
    });

    renderPrintDateCheckboxList();
    renderCycleDateTabs();
    saveState();
}


/* ================================================================
   SECTION 8: ROW INPUT UPDATE & LIVE RECALCULATION
   ================================================================ */
function updateInputValue(date, index, field, value) {
    if (globalProcessedData[date] && globalProcessedData[date][index]) {
        if (field === 'palette') {
            globalProcessedData[date][index].inputs[field] = value;
            renderDashboard(globalProcessedData);
            return;
        }

        const numVal = parseInt(value) || 0;
        globalProcessedData[date][index].inputs[field] = numVal;

        const safeTabDate = getSafeId(date);

        if (field === 'emptyGt') {
            // Recalculate 32/24 BOX expectations
            const exp32 = (Math.round((numVal / 32) * 10) / 10).toFixed(1);
            const exp24 = (Math.round((numVal / 24) * 10) / 10).toFixed(1);

            const el32 = document.getElementById(`calc32-${safeTabDate}-${index}`);
            const el24 = document.getElementById(`calc24-${safeTabDate}-${index}`);

            if (el32) el32.innerText = exp32;
            if (el24) el24.innerText = exp24;
        }

        const previewEl = document.getElementById(`preview-${safeTabDate}`);
        if (previewEl) previewEl.outerHTML = renderTruckPreviewSection(date);

        saveState();
    }
}

function toggleItemPicking(date, index, checked) {
    if (globalProcessedData[date] && globalProcessedData[date][index]) {
        globalProcessedData[date][index].picking = checked;
        renderDashboard(globalProcessedData);
    }
}

function deleteTruckRow(date, index) {
    if (globalProcessedData[date] && globalProcessedData[date][index]) {
        globalProcessedData[date].splice(index, 1);
        renderDashboard(globalProcessedData);
        saveState();
        if (window.showToast) window.showToast('행이 삭제되었습니다.');
    }
}


/* ================================================================
   SECTION 9: TAB SWITCHING
   ================================================================ */
function switchTab(targetDate, allDates) {
    activeTabDate = targetDate;
    allDates.forEach(date => {
        const safeTabDate = getSafeId(date);
        const uniqueTabId = `tab-${safeTabDate}`;
        const uniquePanelId = `panel-${safeTabDate}`;

        const tab = document.getElementById(uniqueTabId);
        const panel = document.getElementById(uniquePanelId);

        if (date === targetDate) {
            tab.className = "px-4 py-2.5 text-sm font-semibold rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-100 flex items-center space-x-2 transition-all duration-200";
            tab.querySelector('.tab-badge').className = "tab-badge px-2 py-0.5 text-xs font-bold rounded-full bg-indigo-700 text-indigo-100";
            tab.querySelector('.tab-delete-icon').className = "tab-delete-icon ml-1 cursor-pointer text-indigo-200 hover:text-white";
            panel.className = "block animate-fadeIn";
        } else {
            tab.className = "px-4 py-2.5 text-sm font-medium rounded-lg bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 flex items-center space-x-2 transition-all duration-200";
            tab.querySelector('.tab-badge').className = "tab-badge px-2 py-0.5 text-xs font-bold rounded-full bg-slate-100 text-slate-500";
            tab.querySelector('.tab-delete-icon').className = "tab-delete-icon ml-1 cursor-pointer text-slate-300 hover:text-rose-500";
            panel.className = "hidden";
        }
    });
    saveState();
}


/* ================================================================
   SECTION 11: PRINT FUNCTIONALITY (상시 카드 + A4 출력물 생성 + 바코드)
   ================================================================ */

// #printSettingsCard의 날짜 체크박스 목록을 최신 데이터 기준으로 다시 그린다.
// (활성 탭 날짜가 기본 체크) — renderDashboard()에서 데이터가 바뀔 때마다 호출된다.
function renderPrintDateCheckboxList() {
    const listEl = document.getElementById('pDateCheckboxList');
    const sortedDates = Object.keys(globalProcessedData).sort();
    listEl.innerHTML = sortedDates.map(date => `
        <label class="flex items-center space-x-2 cursor-pointer text-slate-700">
            <input type="checkbox" value="${date}" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" ${date === activeTabDate ? 'checked' : ''}>
            <span>${date} <span class="text-slate-400">(${globalProcessedData[date].length}건)</span></span>
        </label>
    `).join('');
}

function toggleSelectAllDates() {
    const checkboxes = document.querySelectorAll('#pDateCheckboxList input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
}

// GT 수량 표시 텍스트: 팔레트 집품/팔레트 GT가 있으면 (+N P / N GT) 표기, 집품중이면 뒤에 물결(~) 표기.
// 인쇄 출력(buildTruckRows)과 화면 미리보기(buildPreviewRows) 양쪽에서 공용으로 사용.
function gtDisplayText(d) {
    const parts = [];
    if (d.inputs.palettePick > 0) parts.push(`${d.inputs.palettePick}P`);
    if (d.inputs.paletteGt > 0) parts.push(`${d.inputs.paletteGt}GT`);
    let text = `${d.inputs.emptyGt}`;
    if (parts.length > 0) text += ` (+${parts.join(' / ')})`;
    if (d.picking) text += ' ~';
    return text;
}

// Build table rows for a list of truck entries. When showPalette is true,
// palette type gets its own column instead of being appended to the company name.
function buildTruckRows(list, showPalette) {
    if (list.length === 0) {
        return `<tr><td colspan="${showPalette ? 3 : 2}" style="padding:15px;color:#999;">데이터 없음</td></tr>`;
    }
    return list.map(d => {
        const paletteCell = showPalette ? `<td>${d.inputs.palette}</td>` : '';
        return `<tr>
                <td style="text-align:left;">${d.company}</td>
                ${paletteCell}
                <td style="font-weight:bold;">${gtDisplayText(d)}</td>
            </tr>`;
    }).join('');
}

// Build the <thead> markup for a truck table, with or without a palette column.
function truckTableHeader(titleText, showPalette) {
    if (showPalette) {
        return `<tr>
                    <th style="width:55%;">${titleText}</th>
                    <th style="width:15%;">팔레트</th>
                    <th style="width:30%;">GT</th>
                </tr>`;
    }
    return `<tr>
                <th style="width:70%;">${titleText}</th>
                <th style="width:30%;">GT</th>
            </tr>`;
}

// 출력물 정렬 순서: 좌측(KPP/AJ/팔레트)은 팔레트 종류 -> GT 수량(많은순) -> 업체명(가나다순),
// 우측(소량)은 GT 수량(많은순) -> 업체명(가나다순)
const PALETTE_SORT_ORDER = { 'KPP': 0, 'AJ': 1, '팔레트': 2 };

function sortTruckSection(list, byPaletteType) {
    return list.slice().sort((a, b) => {
        if (byPaletteType) {
            const rankDiff = PALETTE_SORT_ORDER[a.inputs.palette] - PALETTE_SORT_ORDER[b.inputs.palette];
            if (rankDiff !== 0) return rankDiff;
        }
        const gtDiff = b.inputs.emptyGt - a.inputs.emptyGt;
        if (gtDiff !== 0) return gtDiff;
        return a.company.localeCompare(b.company, 'ko-KR');
    });
}

// 팔레트 종류에 따라 좌측(KPP/AJ/팔레트)/우측(소량) 트럭 구역으로 나눈다.
// 인쇄 출력(buildDateSectionHtml)과 화면 미리보기(renderTruckPreviewSection)가 공용으로 사용.
function splitTruckLeftRight(date) {
    const currentData = globalProcessedData[date] || [];
    const leftData = sortTruckSection(currentData.filter(d =>
        (d.inputs.palette === 'KPP' || d.inputs.palette === 'AJ' || d.inputs.palette === '팔레트') &&
        (d.inputs.emptyGt > 0 || d.inputs.palettePick > 0)
    ), true);
    const rightData = sortTruckSection(currentData.filter(d =>
        d.inputs.palette === '소량' &&
        (d.inputs.emptyGt > 0 || d.inputs.palettePick > 0)
    ), false);
    return { leftData, rightData };
}

// Build one date's left/right truck tables as a labeled, page-break-safe section
function buildDateSectionHtml(date) {
    const { leftData, rightData } = splitTruckLeftRight(date);

    // 좌측엔 KPP/AJ/팔레트 트럭, 우측엔 소량 트럭. 소량 트럭이 없으면 buildTruckRows가 우측에
    // "데이터 없음"을 표시한다.
    const leftRows = buildTruckRows(leftData, true);
    const rightRows = buildTruckRows(rightData, false);
    const leftHeader = truckTableHeader('업체명', true);
    const rightHeader = truckTableHeader('소량 트럭', false);

    return `<div class="p-date-section">
                <div class="p-date-heading">${date}</div>
                <div class="p-row" style="align-items:flex-start;">
                    <!-- Left Table -->
                    <div style="flex:1; min-width:0;">
                        <table class="p-table">
                            <thead>${leftHeader}</thead>
                            <tbody>${leftRows}</tbody>
                        </table>
                    </div>

                    <!-- Right Table -->
                    <div style="flex:1; min-width:0;">
                        <table class="p-table">
                            <thead>${rightHeader}</thead>
                            <tbody>${rightRows}</tbody>
                        </table>
                    </div>
                </div>
            </div>`;
}

// 홈 화면용 출력 미리보기 행 (인쇄용 buildTruckRows와 동일한 필터/GT 표시 규칙을 화면 스타일로 렌더링)
function buildPreviewRows(list, showPalette) {
    if (list.length === 0) {
        return `<tr><td colspan="${showPalette ? 3 : 2}" class="px-3 py-4 text-center text-xs text-slate-400">데이터 없음</td></tr>`;
    }
    return list.map(d => {
        const paletteCell = showPalette ? `<td class="px-3 py-2 text-center text-slate-500">${d.inputs.palette}</td>` : '';
        return `<tr class="border-b border-slate-100 last:border-b-0">
                <td class="px-3 py-2 text-slate-700">${d.company}</td>
                ${paletteCell}
                <td class="px-3 py-2 text-right font-semibold text-slate-900">${gtDisplayText(d)}</td>
            </tr>`;
    }).join('');
}

// 출력물 양식과 동일하게 좌측(소량 제외)/우측(소량) 트럭 구역으로 나눠 보여주는 화면 미리보기 패널.
// 팔레트 종류를 바꾸면 즉시 좌/우 구역 사이를 이동해 표시된다.
function renderTruckPreviewSection(date) {
    const safeTabDate = getSafeId(date);
    const { leftData, rightData } = splitTruckLeftRight(date);

    return `
        <div id="preview-${safeTabDate}" class="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mt-4">
            <h3 class="text-sm font-semibold text-slate-900 mb-3">트럭 리스트</h3>
            <div class="grid grid-cols-2 gap-4">
                <div class="overflow-x-auto">
                    <table class="w-full text-xs border-collapse min-w-max">
                        <thead>
                            <tr class="bg-slate-50 text-slate-500 font-bold">
                                <th class="px-3 py-2 text-left">업체명</th>
                                <th class="px-3 py-2 text-center">팔레트</th>
                                <th class="px-3 py-2 text-right">GT</th>
                            </tr>
                        </thead>
                        <tbody>${buildPreviewRows(leftData, true)}</tbody>
                    </table>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-xs border-collapse min-w-max">
                        <thead>
                            <tr class="bg-slate-50 text-slate-500 font-bold">
                                <th class="px-3 py-2 text-left">소량 트럭</th>
                                <th class="px-3 py-2 text-right">GT</th>
                            </tr>
                        </thead>
                        <tbody>${buildPreviewRows(rightData, false)}</tbody>
                    </table>
                </div>
            </div>
        </div>`;
}

function executePrint() {
    const notes = document.getElementById('pInputNotes').value;
    const dateLimit = document.getElementById('pInputDateLimit').value;
    const groupLimit = document.getElementById('pInputGroupLimit').value;
    const groupLimitCodes = groupLimit.split(',').map(s => s.trim()).filter(s => s !== '');
    // 3개씩 묶어 콤마로 재조합한 문자열 하나를 바코드 한 줄로 인코딩 (그리드 아님, 세로 스택).
    const groupLimitLines = [];
    for (let i = 0; i < groupLimitCodes.length; i += 3) {
        groupLimitLines.push(groupLimitCodes.slice(i, i + 3).join(','));
    }

    const selectedDates = Array.from(
        document.querySelectorAll('#pDateCheckboxList input[type="checkbox"]:checked')
    ).map(cb => cb.value).sort();

    if (selectedDates.length === 0) {
        showToast('출력할 생성일시를 하나 이상 선택해주세요.', 'error');
        return;
    }

    const printArea = document.getElementById('truckPrintArea');
    // 주기출력이 #truckPrintArea/#truckApp에 남겨뒀을 수 있는 named page 지정을
    // 정리(그쪽은 인쇄 완료 후 스스로 되돌리지만, 방어적으로 한 번 더 초기화).
    printArea.style.page = '';
    document.getElementById('truckApp').style.page = '';

    // Common header (한 번만 출력): 유의사항 + 상차제한
    let html = '';

    if (notes.trim() !== '') {
        html += `<div class="p-col" style="margin-bottom:8px;">
                    <div class="p-col-title">유의사항</div>
                    <div class="p-col-content" style="white-space:pre-wrap;">${notes}</div>
                 </div>`;
    }

    if (dateLimit.trim() !== '' || groupLimitLines.length > 0) {
        html += `<div class="p-row">`;

        // Left col (Date)
        html += `<div class="p-col">
                    <div class="p-col-title">날짜 상차제한</div>
                    <div class="p-col-content">${dateLimit}</div>
                 </div>`;

        // Right col (Barcode) — 3개씩 콤마로 묶은 문자열을 한 줄씩 세로로 쌓아 렌더링
        html += `<div class="p-col">
                    <div class="p-col-title">그룹번호 상차제한</div>
                    <div class="p-col-content">
                        ${groupLimitLines.length > 0 ? `<div class="p-barcode-stack">
                            ${groupLimitLines.map((line, i) => `<div class="p-barcode-stack-item"><svg id="printBarcode-${i}"></svg></div>`).join('')}
                        </div>` : ''}
                    </div>
                 </div>`;
        html += `</div>`;
    }

    // 선택된 날짜별로 구분된 테이블 섹션
    selectedDates.forEach(date => {
        html += buildDateSectionHtml(date);
    });

    printArea.innerHTML = html;

    // 3개씩 콤마로 묶인 줄 하나당 바코드 하나 — displayValue로 보이는 텍스트가
    // 곧 콤마 포함 원본 청크 문자열 그대로가 되도록 한다.
    groupLimitLines.forEach((line, i) => {
        try {
            JsBarcode(`#printBarcode-${i}`, line, {
                format: "CODE128",
                width: 1.5,
                height: 36,
                displayValue: true,
                fontSize: 13,
                margin: 0
            });
        } catch (e) {
            console.error("Barcode generation failed", e);
            document.getElementById(`printBarcode-${i}`).outerHTML = `<span>[바코드 변환 오류: ${line}]</span>`;
        }
    });

    // Trigger Print — 다른 6개 인쇄 흐름과 동일하게 printWithConfirm을 거쳐
    // "출력을 완료하셨나요?" 확인 후에만 성공 토스트가 뜨도록 통일(되돌릴 상태가
    // 없는 흐름이라 onConfirmed 콜백은 생략, 성공 토스트는 printWithConfirm이 자체 처리).
    setTimeout(() => {
        window.printWithConfirm();
    }, 300);
}


/* ================================================================
   SECTION 12: SIDEBAR VIEW SWITCHING (홈 / 트럭주기)
   ================================================================ */
function truckSwitchView(view) {
    const homeView = document.getElementById('truckHomeView');
    const cycleView = document.getElementById('cycleView');
    const navHomeBtn = document.getElementById('truckNavHomeBtn');
    const navCycleBtn = document.getElementById('navCycleBtn');

    const activeClass = "w-full text-left px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors text-white";
    const inactiveClass = "w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors text-slate-300 hover:bg-slate-700/70 hover:text-white";

    if (view === 'cycle') {
        homeView.classList.add('hidden');
        cycleView.classList.remove('hidden');
        cycleView.classList.add('animate-fadeIn');
        navHomeBtn.className = inactiveClass;
        navCycleBtn.className = activeClass;
        renderCycleDateTabs();
    } else {
        cycleView.classList.add('hidden');
        homeView.classList.remove('hidden');
        homeView.classList.add('animate-fadeIn');
        navCycleBtn.className = inactiveClass;
        navHomeBtn.className = activeClass;
    }
}


/* ================================================================
   SECTION 13: TRUCK CYCLE (트럭주기) - GLOBAL STATE
   ================================================================ */
let ctPool = [];            // [{ code: string, used: boolean }] - CT 바코드 데이터 풀 (모든 날짜 공통)
let truckCycleData = {};    // { [date]: [{ company, seq, ct, checked }] } - 날짜별 생성된 트럭 주기 행
let activeCycleDate = null; // 트럭주기 생성 모달에서 마지막으로 사용한 날짜(기본 선택값)


/* ================================================================
   SECTION 14: CT 바코드 데이터 관리 (붙여넣기 저장 / 사용가능 목록)
   ================================================================ */
function saveCtPaste() {
    const textarea = document.getElementById('ctPasteArea');
    // 한 줄에 여러 건이든 여러 줄에 걸쳐 있든 동일하게 처리: 탭/스페이스/쉼표/줄바꿈을 모두 구분자로 취급
    const tokens = textarea.value.split(/[\s,]+/).map(t => t.trim()).filter(t => t !== '');

    if (tokens.length === 0) {
        showToast('저장할 CT 바코드 데이터를 입력해주세요.', 'error');
        return;
    }

    const existingCodes = new Set(ctPool.map(c => c.code));
    let addedCount = 0;
    tokens.forEach(code => {
        if (!existingCodes.has(code)) {
            ctPool.push({ code, used: false });
            existingCodes.add(code);
            addedCount++;
        }
    });

    textarea.value = '';
    renderCtAvailableList();
    saveState();
    showToast(`CT 바코드 ${addedCount}건이 저장되었습니다. (중복 ${tokens.length - addedCount}건 제외)`);
}

function renderCtAvailableList() {
    const listEl = document.getElementById('ctAvailableList');
    const countEl = document.getElementById('ctAvailableCount');
    const available = ctPool.filter(c => !c.used);

    countEl.innerText = available.length;

    if (ctPool.length === 0) {
        listEl.innerHTML = `<span class="block p-2 text-xs text-slate-400">저장된 CT 데이터가 없습니다.</span>`;
        return;
    }

    const rowsHtml = ctPool.map((c, idx) => {
        const statusBadge = c.used
            ? `<span class="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-500">사용중</span>`
            : `<span class="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-50 text-emerald-600">사용가능</span>`;
        return `
            <tr class="border-b border-slate-100 last:border-b-0">
                <td class="px-3 py-1.5 w-12 text-center text-xs text-slate-400">${idx + 1}</td>
                <td class="px-3 py-1.5 font-mono text-slate-700">${c.code}</td>
                <td class="px-3 py-1.5 w-24 text-center">${statusBadge}</td>
            </tr>
        `;
    }).join('');

    listEl.innerHTML = `
        <table class="w-full text-sm border-collapse">
            <thead class="sticky top-0 bg-slate-100">
                <tr class="text-xs font-bold text-slate-500 text-left">
                    <th class="px-3 py-2 w-12 text-center">번호</th>
                    <th class="px-3 py-2">CT 코드</th>
                    <th class="px-3 py-2 w-24 text-center">상태</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;
}


/* ================================================================
   SECTION 14-1: CT 데이터 / 트럭주기 데이터 초기화 (분리)
   ================================================================ */
async function clearCtPool() {
    if (!(await window.confirmModal('저장된 CT 바코드 데이터를 모두 초기화하시겠습니까?'))) return;
    ctPool = [];
    renderCtAvailableList();
    saveState();
    showToast('CT 바코드 데이터가 초기화되었습니다.', 'info');
}

async function clearCycleData() {
    if (!(await window.confirmModal('생성된 트럭주기 데이터를 모두 초기화하시겠습니까?'))) return;
    truckCycleData = {};
    activeCycleDate = null;
    renderCycleDateTabs();
    saveState();
    showToast('트럭주기 데이터가 초기화되었습니다.', 'info');
}


/* ================================================================
   SECTION 15: 트럭주기 화면 진입점 (날짜 탭 없이 통합 렌더링)
   ================================================================ */
function renderCycleDateTabs() {
    const tabsContainer = document.getElementById('cycleTabsContainer');
    const sortedDates = Object.keys(globalProcessedData).sort();

    tabsContainer.innerHTML = '';

    if (sortedDates.length === 0) {
        tabsContainer.innerHTML = `<span class="text-sm text-slate-400">트럭리스트 현황에서 엑셀 데이터를 먼저 업로드해주세요.</span>`;
        document.getElementById('cycleTableContainer').innerHTML = '';
        activeCycleDate = null;
        saveState();
        return;
    }

    if (!activeCycleDate || !sortedDates.includes(activeCycleDate)) {
        activeCycleDate = sortedDates[0];
    }

    renderCycleTable();
}


/* ================================================================
   SECTION 16: 트럭주기 테이블 렌더링 (모든 날짜 통합, 날짜순 정렬)
   ================================================================ */
function renderCycleTable() {
    saveState();
    const container = document.getElementById('cycleTableContainer');

    const flatRows = [];
    Object.keys(truckCycleData).sort().forEach(date => {
        (truckCycleData[date] || []).forEach((row, idx) => {
            flatRows.push({ date, idx, ...row });
        });
    });

    if (flatRows.length === 0) {
        container.innerHTML = `
            <div class="bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center text-sm text-slate-400">
                아직 생성된 트럭 주기가 없습니다. "생성" 버튼으로 업체와 수량을 선택해 추가하세요.
            </div>
        `;
        return;
    }

    const allChecked = flatRows.every(row => row.checked);

    let rowsHtml = '';
    flatRows.forEach(row => {
        rowsHtml += `
            <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100">
                <td class="px-4 py-2 w-10 text-center">
                    <input type="checkbox" ${row.checked ? 'checked' : ''} onchange="toggleCycleRowChecked('${row.date}', ${row.idx}, this.checked)" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
                </td>
                <td class="px-3 py-2 w-28 text-center text-sm font-medium text-slate-500">${row.date}</td>
                <td class="px-3 py-2 w-56">
                    <textarea rows="2" oninput="updateCycleRow('${row.date}', ${row.idx}, 'company', this.value)" class="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 text-sm font-medium text-slate-700 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500">${row.company}</textarea>
                </td>
                <td class="px-3 py-2 w-28">
                    <input type="text" value="${row.seq}" oninput="updateCycleRow('${row.date}', ${row.idx}, 'seq', this.value)" class="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500">
                </td>
                <td class="px-3 py-2 w-48">
                    <input type="text" value="${row.ct}" oninput="updateCycleRow('${row.date}', ${row.idx}, 'ct', this.value)" class="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500">
                </td>
                <td class="px-3 py-2 w-16 text-center">
                    <button onclick="deleteCycleRow('${row.date}', ${row.idx})" class="text-slate-300 hover:text-rose-500" title="삭제">
                        <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </td>
            </tr>
        `;
    });

    container.innerHTML = `
        <div class="overflow-x-auto bg-white border border-slate-200 rounded-xl shadow-sm">
            <table class="w-full border-collapse text-left min-w-max">
                <thead>
                    <tr class="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 text-center">
                        <th class="px-4 py-3 w-10">
                            <input type="checkbox" ${allChecked ? 'checked' : ''} onchange="setAllCycleRowsChecked(this.checked)" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" title="전체 선택/해제">
                        </th>
                        <th class="px-3 py-3">생성일시</th>
                        <th class="px-4 py-3 text-left">업체명</th>
                        <th class="px-3 py-3">순번</th>
                        <th class="px-3 py-3">CT 데이터</th>
                        <th class="px-3 py-3 w-16"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
}


/* ================================================================
   SECTION 17: 트럭주기 행 편집 / 선택 / 삭제
   ================================================================ */
function updateCycleRow(date, index, field, value) {
    if (truckCycleData[date] && truckCycleData[date][index]) {
        if (field === 'ct') {
            const oldValue = truckCycleData[date][index].ct;
            if (oldValue && oldValue !== value) {
                releaseCtToPool(oldValue);
            }
            if (value && value !== oldValue) {
                consumeCtFromPool(value);
            }
        }
        truckCycleData[date][index][field] = value;
        saveState();
    }
}

function toggleCycleRowChecked(date, index, checked) {
    if (truckCycleData[date] && truckCycleData[date][index]) {
        truckCycleData[date][index].checked = checked;
        saveState();
    }
}

function setAllCycleRowsChecked(checked) {
    const allRows = Object.values(truckCycleData).flat();
    if (allRows.length === 0) return;
    allRows.forEach(r => r.checked = checked);
    renderCycleTable();
}

function deleteCycleRow(date, index) {
    if (truckCycleData[date] && truckCycleData[date][index]) {
        const removed = truckCycleData[date][index];
        if (removed.ct && removed.ct.trim() !== '') {
            releaseCtToPool(removed.ct);
        }
        truckCycleData[date].splice(index, 1);
        renderCycleTable();
    }
}


/* ================================================================
   SECTION 17-1: CT 풀 상태 보정 (사용가능 <-> 사용중 전환)
   ================================================================ */
function releaseCtToPool(code) {
    if (!code) return;
    const entry = ctPool.find(c => c.code === code);
    if (entry) {
        entry.used = false;
        renderCtAvailableList();
        saveState();
    }
}

function consumeCtFromPool(code) {
    if (!code) return;
    const entry = ctPool.find(c => c.code === code);
    if (entry && !entry.used) {
        entry.used = true;
        renderCtAvailableList();
        saveState();
    }
}


/* ================================================================
   SECTION 18: 트럭 주기 생성 모달 (업체 선택 + 수량 입력)
   ================================================================ */
const cycleGenModal = document.getElementById('cycleGenModal');
const cycleGenModalBox = document.getElementById('cycleGenModalBox');

function openCycleGenModal() {
    const sortedDates = Object.keys(globalProcessedData).sort();

    if (sortedDates.length === 0) {
        showToast('먼저 트럭리스트 현황에서 엑셀 데이터를 업로드해주세요.', 'error');
        return;
    }

    const dateSelect = document.getElementById('cGenDate');
    const defaultDate = (activeCycleDate && sortedDates.includes(activeCycleDate)) ? activeCycleDate : sortedDates[0];
    dateSelect.innerHTML = sortedDates.map(d => `<option value="${d}" ${d === defaultDate ? 'selected' : ''}>${d}</option>`).join('');

    renderCycleGenCompanyList();

    if (cycleGenModal.classList.contains('hidden')) {
        if (window.lockBodyScroll) window.lockBodyScroll();
        cycleGenModal.classList.remove('hidden');
        cycleGenModal.classList.add('flex');
        setTimeout(() => {
            cycleGenModal.classList.remove('opacity-0');
            cycleGenModalBox.classList.remove('scale-95');
        }, 10);
    }
}

function renderCycleGenCompanyList() {
    const date = document.getElementById('cGenDate').value;
    const listEl = document.getElementById('cGenCompanyList');
    const rows = globalProcessedData[date] || [];

    if (rows.length === 0) {
        listEl.innerHTML = `<span class="text-xs text-slate-400">선택한 날짜에 업체 데이터가 없습니다.</span>`;
        return;
    }

    // 같은 업체가 여러 그룹번호로 나뉘어 있을 수 있어(빈GT가 그룹마다 다를 수 있음) 그룹(행) 단위로 그대로 보여준다.
    listEl.innerHTML = rows.map((d, idx) => {
        const emptyGt = d.inputs.emptyGt;
        const exp32 = (Math.round((emptyGt / 32) * 10) / 10).toFixed(1);
        const exp24 = (Math.round((emptyGt / 24) * 10) / 10).toFixed(1);
        return `
        <div class="grid grid-cols-[1.25rem_1fr_4.5rem_4.5rem_5rem_5rem_5.5rem] gap-2 items-center py-1.5" data-company-row>
            <label class="contents cursor-pointer">
                <input type="checkbox" value="${idx}" class="cGenCompanyCheckbox rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
                <span class="truncate text-slate-700">${d.company}</span>
            </label>
            <span class="text-right tabular-nums text-slate-500">${emptyGt}</span>
            <span class="text-right tabular-nums text-slate-500">${d.inputs.palettePick}P</span>
            <span class="text-right tabular-nums text-slate-500">${exp32}P</span>
            <span class="text-right tabular-nums text-slate-500">${exp24}P</span>
            <input type="number" min="1" value="1" onfocus="this.select()" class="cGenCompanyQty w-14 mx-auto bg-white border border-slate-200 rounded-md px-2 py-1 text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500">
        </div>
    `;
    }).join('');
}

function toggleSelectAllGenCompanies() {
    const checkboxes = document.querySelectorAll('#cGenCompanyList .cGenCompanyCheckbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
}

function closeCycleGenModal() {
    if (cycleGenModal.classList.contains('opacity-0')) return;
    cycleGenModal.classList.add('opacity-0');
    cycleGenModalBox.classList.add('scale-95');
    setTimeout(() => {
        cycleGenModal.classList.remove('flex');
        cycleGenModal.classList.add('hidden');
        if (window.unlockBodyScroll) window.unlockBodyScroll();
    }, 200);
}

function confirmGenerateCycle() {
    const date = document.getElementById('cGenDate').value;

    if (!date) {
        showToast('생성일시를 선택해주세요.', 'error');
        return;
    }

    const dateRows = globalProcessedData[date] || [];
    const companyRows = document.querySelectorAll('#cGenCompanyList [data-company-row]');
    const selections = Array.from(companyRows)
        .map(row => {
            const checkbox = row.querySelector('.cGenCompanyCheckbox');
            const qtyInput = row.querySelector('.cGenCompanyQty');
            const sourceRow = dateRows[parseInt(checkbox.value)];
            return {
                company: sourceRow ? sourceRow.company : '',
                checked: checkbox.checked,
                qty: parseInt(qtyInput.value) || 0
            };
        })
        .filter(s => s.checked);

    if (selections.length === 0) {
        showToast('업체명을 하나 이상 선택해주세요.', 'error');
        return;
    }
    if (selections.some(s => s.qty < 1)) {
        showToast('선택한 업체는 모두 1 이상의 수량을 입력해주세요.', 'error');
        return;
    }

    if (!truckCycleData[date]) {
        truckCycleData[date] = [];
    }

    let totalCount = 0;
    selections.forEach(({ company, qty }) => {
        for (let i = 1; i <= qty; i++) {
            truckCycleData[date].push({
                company: company,
                seq: `${qty}-${i}`,
                ct: '',
                checked: true
            });
        }
        totalCount += qty;
    });

    activeCycleDate = date;
    renderCycleDateTabs();
    closeCycleGenModal();
    showToast(`업체 ${selections.length}곳, 총 ${totalCount}건의 트럭 주기가 생성되었습니다.`);
}


/* ================================================================
   SECTION 19: CT 바코드 자동 매칭 (미사용 CT를 순서대로 배정)
   ================================================================ */
function autoMatchCt() {
    const allRows = Object.values(truckCycleData).flat();
    if (allRows.length === 0) {
        showToast('매칭할 트럭 주기 데이터가 없습니다.', 'error');
        return;
    }

    let matchedCount = 0;

    allRows.forEach(row => {
        if (row.ct.trim() !== '') return;
        // 저장 순서상 가장 나중에 추가된 CT부터 역순으로 미사용 CT를 찾는다.
        const nextAvailable = [...ctPool].reverse().find(c => !c.used);
        if (!nextAvailable) return;
        nextAvailable.used = true;
        row.ct = nextAvailable.code;
        matchedCount++;
    });

    renderCycleTable();
    renderCtAvailableList();

    if (matchedCount === 0) {
        showToast('매칭할 미사용 CT 데이터가 없거나, 모든 행에 이미 CT가 있습니다.', 'info');
    } else {
        showToast(`CT 바코드 ${matchedCount}건이 자동 매칭되었습니다.`);
    }
}


/* ================================================================
   SECTION 20: 트럭주기 라벨 출력 (선택 행 -> 행 하나당 A4 1페이지)
   ================================================================ */
function executeCyclePrint() {
    const selectedRows = Object.keys(truckCycleData).sort()
        .flatMap(date => truckCycleData[date])
        .filter(r => r.checked);

    if (selectedRows.length === 0) {
        showToast('출력할 행을 하나 이상 선택해주세요.', 'error');
        return;
    }

    const printArea = document.getElementById('truckPrintArea');
    // 주기출력이 남겨뒀을 수 있는 named page 지정을 정리(방어적 초기화).
    printArea.style.page = '';
    document.getElementById('truckApp').style.page = '';

    // CT 소모/행 초기화는 인쇄창이 닫힌 뒤 자체 확인모달에서 실제 출력을
    // 확인받은 다음에만 반영한다(취소해도 CT가 이미 소모돼버리던 버그 수정) —
    // 라벨 렌더링에는 CT 값이 그대로 필요하므로 여기서는 아직 지우지 않는다.
    let html = '';
    selectedRows.forEach((row, idx) => {
        const hasCt = row.ct.trim() !== '';
        html += `<div class="p-label-page">
                    <div class="p-label-company">${row.company}</div>
                    <div class="p-label-seq">${row.seq}</div>
                    <div class="p-label-barcode">
                        ${hasCt ? `<svg id="cycleBarcode-${idx}"></svg>` : ''}
                    </div>
                 </div>`;
    });

    printArea.innerHTML = html;

    selectedRows.forEach((row, idx) => {
        if (row.ct.trim() === '') return;
        try {
            JsBarcode(`#cycleBarcode-${idx}`, row.ct, {
                format: "CODE128",
                width: 2,
                height: 70,
                displayValue: true,
                fontSize: 44,
                fontOptions: "bold",
                font: "'Inter', 'Noto Sans KR', sans-serif",
                margin: 0
            });
        } catch (e) {
            console.error("Barcode generation failed", e);
            document.getElementById(`cycleBarcode-${idx}`).outerHTML = `<span>[바코드 변환 오류: ${row.ct}]</span>`;
        }
    });

    setTimeout(() => {
        window.printWithConfirm(() => {
            selectedRows.forEach(row => {
                if (row.ct.trim() !== '') {
                    consumeCtFromPool(row.ct);
                }
            });
            selectedRows.forEach(row => {
                row.ct = '';
            });
            renderCycleTable();
        });
    }, 300);
}

/* ================================================================
   SECTION 20B: 주기출력 (자유 텍스트 A4 가로 출력, 여백/글씨크기/굵기/정렬 설정)
   ================================================================ */
const TRUCK_CYCLE_PRINT_MARGIN_TOP_KEY = 'truckDashboardCyclePrintMarginTop';
const TRUCK_CYCLE_PRINT_MARGIN_RIGHT_KEY = 'truckDashboardCyclePrintMarginRight';
const TRUCK_CYCLE_PRINT_MARGIN_BOTTOM_KEY = 'truckDashboardCyclePrintMarginBottom';
const TRUCK_CYCLE_PRINT_MARGIN_LEFT_KEY = 'truckDashboardCyclePrintMarginLeft';
const TRUCK_CYCLE_PRINT_FONT_SIZE_KEY = 'truckDashboardCyclePrintFontSize';
const TRUCK_CYCLE_PRINT_FONT_BOLD_KEY = 'truckDashboardCyclePrintFontBold';
const TRUCK_CYCLE_PRINT_ALIGN_H_KEY = 'truckDashboardCyclePrintAlignH';
const TRUCK_CYCLE_PRINT_ALIGN_V_KEY = 'truckDashboardCyclePrintAlignV';
// 기본값: 여백은 기존 truck-a4 페이지(15mm)와 동일 감각, 글씨 크기/굵기는
// 트럭주기 라벨의 업체명 서식(.p-label-company: 64pt bold)을 그대로 따른다.
const TRUCK_CYCLE_PRINT_DEFAULTS = { margin: 15, fontSize: 64, fontBold: true, alignH: 'center', alignV: 'middle' };

const cyclePrintModal = document.getElementById('cyclePrintModal');
const cyclePrintModalBox = document.getElementById('cyclePrintModalBox');
const truckCyclePrintPageStyleOverride = document.getElementById('truckCyclePrintPageStyleOverride');

function loadCyclePrintSettings() {
    const marginTop = parseFloat(localStorage.getItem(TRUCK_CYCLE_PRINT_MARGIN_TOP_KEY));
    const marginRight = parseFloat(localStorage.getItem(TRUCK_CYCLE_PRINT_MARGIN_RIGHT_KEY));
    const marginBottom = parseFloat(localStorage.getItem(TRUCK_CYCLE_PRINT_MARGIN_BOTTOM_KEY));
    const marginLeft = parseFloat(localStorage.getItem(TRUCK_CYCLE_PRINT_MARGIN_LEFT_KEY));
    const fontSize = parseFloat(localStorage.getItem(TRUCK_CYCLE_PRINT_FONT_SIZE_KEY));
    const fontBoldRaw = localStorage.getItem(TRUCK_CYCLE_PRINT_FONT_BOLD_KEY);
    const alignH = localStorage.getItem(TRUCK_CYCLE_PRINT_ALIGN_H_KEY);
    const alignV = localStorage.getItem(TRUCK_CYCLE_PRINT_ALIGN_V_KEY);
    return {
        marginTop: isNaN(marginTop) ? TRUCK_CYCLE_PRINT_DEFAULTS.margin : marginTop,
        marginRight: isNaN(marginRight) ? TRUCK_CYCLE_PRINT_DEFAULTS.margin : marginRight,
        marginBottom: isNaN(marginBottom) ? TRUCK_CYCLE_PRINT_DEFAULTS.margin : marginBottom,
        marginLeft: isNaN(marginLeft) ? TRUCK_CYCLE_PRINT_DEFAULTS.margin : marginLeft,
        fontSize: isNaN(fontSize) ? TRUCK_CYCLE_PRINT_DEFAULTS.fontSize : fontSize,
        fontBold: fontBoldRaw === null ? TRUCK_CYCLE_PRINT_DEFAULTS.fontBold : fontBoldRaw === '1',
        alignH: alignH || TRUCK_CYCLE_PRINT_DEFAULTS.alignH,
        alignV: alignV || TRUCK_CYCLE_PRINT_DEFAULTS.alignV
    };
}

function saveCyclePrintSettings(settings) {
    localStorage.setItem(TRUCK_CYCLE_PRINT_MARGIN_TOP_KEY, String(settings.marginTop));
    localStorage.setItem(TRUCK_CYCLE_PRINT_MARGIN_RIGHT_KEY, String(settings.marginRight));
    localStorage.setItem(TRUCK_CYCLE_PRINT_MARGIN_BOTTOM_KEY, String(settings.marginBottom));
    localStorage.setItem(TRUCK_CYCLE_PRINT_MARGIN_LEFT_KEY, String(settings.marginLeft));
    localStorage.setItem(TRUCK_CYCLE_PRINT_FONT_SIZE_KEY, String(settings.fontSize));
    localStorage.setItem(TRUCK_CYCLE_PRINT_FONT_BOLD_KEY, settings.fontBold ? '1' : '0');
    localStorage.setItem(TRUCK_CYCLE_PRINT_ALIGN_H_KEY, settings.alignH);
    localStorage.setItem(TRUCK_CYCLE_PRINT_ALIGN_V_KEY, settings.alignV);
}

// GT 라벨 출력의 applyGtLabelPageStyle(js/pick/gt-print.js)과 동일한 방식 —
// <style> 요소에 @page 규칙을 동적으로 주입해 인쇄 여백을 반영한다. 다만 이
// 기능은 5cm×4cm 고정 라벨이 아니라 A4 페이지 전체가 대상이라, "여백만큼
// 페이지를 키우는" 계산 없이 표준 @page margin을 그대로 쓰면 된다.
// #truckPrintArea에 이 named page를 매길지는(정적 CSS가 아니라) 인쇄 직전
// executeTruckCyclePrint()가 인라인 style.page로 직접 지정한다 — 별도
// div를 새로 만들면 기존 #truckPrintArea(항상 page:truck-a4 고정)와 이름이
// 다른 페이지가 DOM에서 바로 이웃하게 되어, 그 사이에서 강제 페이지 나눔이
// 발생해 첫 페이지가 빈 종이로 나오는 문제가 있었다.
function applyTruckCyclePrintPageStyle(top, right, bottom, left) {
    if (!truckCyclePrintPageStyleOverride) return;
    truckCyclePrintPageStyleOverride.textContent =
        `@media print { @page truck-cycle-note { size: A4 landscape; margin: ${top}mm ${right}mm ${bottom}mm ${left}mm; } }`;
}

function setCyclePrintAlignActive(groupSelector, attr, value) {
    document.querySelectorAll(groupSelector).forEach(btn => {
        const active = btn.dataset[attr] === value;
        btn.classList.toggle('bg-indigo-600', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('border-indigo-600', active);
        btn.classList.toggle('bg-white', !active);
        btn.classList.toggle('text-slate-700', !active);
        btn.classList.toggle('border-slate-200', !active);
        btn.classList.toggle('hover:bg-slate-50', !active);
    });
}

document.querySelectorAll('.cycle-print-align-h-btn').forEach(btn => {
    btn.addEventListener('click', () => setCyclePrintAlignActive('.cycle-print-align-h-btn', 'alignH', btn.dataset.alignH));
});
document.querySelectorAll('.cycle-print-align-v-btn').forEach(btn => {
    btn.addEventListener('click', () => setCyclePrintAlignActive('.cycle-print-align-v-btn', 'alignV', btn.dataset.alignV));
});

function openCyclePrintModal() {
    const settings = loadCyclePrintSettings();
    document.getElementById('cyclePrintTextInput').value = '';
    document.getElementById('cyclePrintMarginTopInput').value = settings.marginTop;
    document.getElementById('cyclePrintMarginRightInput').value = settings.marginRight;
    document.getElementById('cyclePrintMarginBottomInput').value = settings.marginBottom;
    document.getElementById('cyclePrintMarginLeftInput').value = settings.marginLeft;
    document.getElementById('cyclePrintFontSizeInput').value = settings.fontSize;
    document.getElementById('cyclePrintFontBoldCheckbox').checked = settings.fontBold;
    setCyclePrintAlignActive('.cycle-print-align-h-btn', 'alignH', settings.alignH);
    setCyclePrintAlignActive('.cycle-print-align-v-btn', 'alignV', settings.alignV);

    if (cyclePrintModal.classList.contains('hidden')) {
        if (window.lockBodyScroll) window.lockBodyScroll();
        cyclePrintModal.classList.remove('hidden');
        cyclePrintModal.classList.add('flex');
        setTimeout(() => {
            cyclePrintModal.classList.remove('opacity-0');
            cyclePrintModalBox.classList.remove('scale-95');
        }, 10);
    }
}

function closeCyclePrintModal() {
    if (cyclePrintModal.classList.contains('opacity-0')) return;
    cyclePrintModal.classList.add('opacity-0');
    cyclePrintModalBox.classList.add('scale-95');
    setTimeout(() => {
        cyclePrintModal.classList.remove('flex');
        cyclePrintModal.classList.add('hidden');
        if (window.unlockBodyScroll) window.unlockBodyScroll();
    }, 200);
}

function escapeTruckCyclePrintText(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

const CYCLE_PRINT_ALIGN_H_TO_JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' };
const CYCLE_PRINT_ALIGN_H_TO_TEXT_ALIGN = { left: 'left', center: 'center', right: 'right' };
const CYCLE_PRINT_ALIGN_V_TO_ITEMS = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };
let truckCyclePrintInProgress = false;

function executeTruckCyclePrint() {
    const text = document.getElementById('cyclePrintTextInput').value;
    if (!text.trim()) {
        showToast('출력할 내용을 입력해주세요.', 'error');
        return;
    }
    if (truckCyclePrintInProgress) return;

    const settings = {
        marginTop: parseFloat(document.getElementById('cyclePrintMarginTopInput').value),
        marginRight: parseFloat(document.getElementById('cyclePrintMarginRightInput').value),
        marginBottom: parseFloat(document.getElementById('cyclePrintMarginBottomInput').value),
        marginLeft: parseFloat(document.getElementById('cyclePrintMarginLeftInput').value),
        fontSize: parseFloat(document.getElementById('cyclePrintFontSizeInput').value),
        fontBold: document.getElementById('cyclePrintFontBoldCheckbox').checked,
        alignH: document.querySelector('.cycle-print-align-h-btn.bg-indigo-600')?.dataset.alignH || TRUCK_CYCLE_PRINT_DEFAULTS.alignH,
        alignV: document.querySelector('.cycle-print-align-v-btn.bg-indigo-600')?.dataset.alignV || TRUCK_CYCLE_PRINT_DEFAULTS.alignV
    };
    if (isNaN(settings.marginTop)) settings.marginTop = TRUCK_CYCLE_PRINT_DEFAULTS.margin;
    if (isNaN(settings.marginRight)) settings.marginRight = TRUCK_CYCLE_PRINT_DEFAULTS.margin;
    if (isNaN(settings.marginBottom)) settings.marginBottom = TRUCK_CYCLE_PRINT_DEFAULTS.margin;
    if (isNaN(settings.marginLeft)) settings.marginLeft = TRUCK_CYCLE_PRINT_DEFAULTS.margin;
    if (isNaN(settings.fontSize) || settings.fontSize <= 0) settings.fontSize = TRUCK_CYCLE_PRINT_DEFAULTS.fontSize;

    saveCyclePrintSettings(settings);
    applyTruckCyclePrintPageStyle(settings.marginTop, settings.marginRight, settings.marginBottom, settings.marginLeft);

    // 기존 출력(executeCyclePrint)/트럭 홈 출력(executePrint)과 #truckPrintArea를
    // 공유하므로, 이번 인쇄에만 쓸 named page를 인라인 style로 지정한다(정적
    // CSS로 고정하면 서로 다른 이름의 페이지가 이웃해 빈 페이지가 끼는 문제가
    // 있었다). 세로/가로 정렬이 실제로 동작하려면 컨텐츠 박스 높이가 부모의
    // height:100% 연쇄에 의존하지 않고 A4 인쇄 영역(여백 제외) 크기로 직접
    // 고정돼야 해서, 여백값으로 계산한 calc() 크기를 그대로 인라인으로 준다.
    const printArea = document.getElementById('truckPrintArea');
    const justifyContent = CYCLE_PRINT_ALIGN_H_TO_JUSTIFY[settings.alignH] || 'center';
    const textAlign = CYCLE_PRINT_ALIGN_H_TO_TEXT_ALIGN[settings.alignH] || 'center';
    const alignItems = CYCLE_PRINT_ALIGN_V_TO_ITEMS[settings.alignV] || 'center';
    const contentHeight = `calc(210mm - ${settings.marginTop}mm - ${settings.marginBottom}mm)`;
    const contentWidth = `calc(297mm - ${settings.marginLeft}mm - ${settings.marginRight}mm)`;
    // justify-content는 여러 줄 텍스트 블록 "전체"의 위치만 잡아줄 뿐, 그
    // 블록 안에서 줄바꿈된 개별 줄이 어떻게 정렬되는지는 text-align이
    // 결정한다 — 이걸 빠뜨리면 블록은 가운데에 있어도 짧은 줄이 블록의
    // 왼쪽 끝에 붙어버린다.
    printArea.innerHTML = `<div class="truck-cycle-print-content" style="justify-content:${justifyContent};align-items:${alignItems};text-align:${textAlign};font-size:${settings.fontSize}pt;font-weight:${settings.fontBold ? 'bold' : 'normal'};height:${contentHeight};width:${contentWidth};">${escapeTruckCyclePrintText(text)}</div>`;
    printArea.style.page = 'truck-cycle-note';
    // #truckApp도 같은 named page로 맞춰야 앞쪽 형제 서브뷰(page:auto)와의 경계에서
    // 강제 페이지 나눔(빈 첫 페이지)이 발생하지 않는다 — 정적 CSS(#pickApp/#truckApp
    // { page: ... })가 처리하는 pick-label/truck-a4와 달리 이 값은 동적이라 직접 동기화.
    document.getElementById('truckApp').style.page = 'truck-cycle-note';

    closeCyclePrintModal();

    // 이 기능은 출력 후 되돌려야 할 상태(GT 소모 등)가 없으므로, 다른 인쇄
    // 경로와 달리 "출력을 완료하셨나요?" 확인 없이 바로 인쇄한다(요청사항).
    // printInProgress 가드만 로컬로 둬 더블클릭으로 인쇄 대화상자가 중복
    // 뜨는 것만 막는다.
    truckCyclePrintInProgress = true;
    let settled = false;
    function finishTruckCyclePrint() {
        if (settled) return;
        settled = true;
        window.removeEventListener('afterprint', finishTruckCyclePrint);
        truckCyclePrintInProgress = false;
        printArea.style.page = '';
        document.getElementById('truckApp').style.page = ''; // 정적 CSS(#truckApp{page:truck-a4})로 복귀
    }
    window.addEventListener('afterprint', finishTruckCyclePrint);
    setTimeout(finishTruckCyclePrint, 20000);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            window.print();
        });
    });
}

/* ================================================================
   SECTION 21: LOCAL STORAGE PERSISTENCE (새로고침/재접속 시 데이터 유지)
   ================================================================ */
const STORAGE_KEY = 'truckDashboardState_v1';

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            globalProcessedData, activeTabDate,
            truckCycleData, ctPool, activeCycleDate
        }));
    } catch (e) {
        console.warn('상태 저장 실패(localStorage)', e);
    }
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        globalProcessedData = saved.globalProcessedData || {};
        activeTabDate = saved.activeTabDate || null;
        truckCycleData = saved.truckCycleData || {};
        ctPool = saved.ctPool || [];
        activeCycleDate = saved.activeCycleDate || null;

        if (Object.keys(globalProcessedData).length > 0) {
            document.getElementById('truckEmptyState').classList.add('hidden');
            document.getElementById('activeFileInfo').classList.remove('hidden');
            renderDashboard(globalProcessedData);
            showToast('이전에 저장된 데이터를 불러왔습니다.', 'info');
        }
        renderCtAvailableList();
    } catch (e) {
        console.warn('상태 복원 실패(localStorage)', e);
    }
}

// Restore any previously saved state, then render cycle view tabs
// (renderDashboard above already calls renderCycleDateTabs when data exists,
// but call it unconditionally too in case there was no home data to restore)
loadState();
renderCycleDateTabs();

// 주기출력 여백 설정도 새로고침 후 바로 반영되도록 초기화 시점에 한 번 적용
(function () {
    const settings = loadCyclePrintSettings();
    applyTruckCyclePrintPageStyle(settings.marginTop, settings.marginRight, settings.marginBottom, settings.marginLeft);
})();
