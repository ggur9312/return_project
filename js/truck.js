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
   SECTION 3: TOAST NOTIFICATION UTILITY
   ================================================================ */
function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `p-4 rounded-xl shadow-lg border text-sm font-medium flex items-center space-x-2 bg-white transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto`;

    if (type === 'success') {
        toast.classList.add('border-emerald-200', 'text-emerald-800', 'bg-emerald-50/80');
        toast.innerHTML = `<svg class="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><span>${message}</span>`;
    } else if (type === 'info') {
        toast.classList.add('border-blue-200', 'text-blue-800', 'bg-blue-50/80');
        toast.innerHTML = `<svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><span>${message}</span>`;
    } else {
        toast.classList.add('border-rose-200', 'text-rose-800', 'bg-rose-50/80');
        toast.innerHTML = `<svg class="w-5 h-5 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg><span>${message}</span>`;
    }

    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 50);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-[-10px]');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}


/* ================================================================
   SECTION 4: DATA RESET
   ================================================================ */
async function clearData() {
    if (!(await window.confirmModal('모든 데이터를 초기화하시겠습니까?'))) return;
    globalProcessedData = {};
    activeTabDate = null;
    document.getElementById('dashboardContainer').classList.add('hidden');
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
                        <input type="checkbox" ${item.picking ? 'checked' : ''} onchange="toggleItemPicking('${date}', ${itemIdx}, this.checked)" class="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500" title="집품중">
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
   SECTION 11: PRINT FUNCTIONALITY (모달 + A4 출력물 생성 + 바코드)
   ================================================================ */
const printModal = document.getElementById('printModal');
const printModalBox = document.getElementById('printModalBox');

function openPrintModal() {
    if (!activeTabDate) {
        showToast('출력할 데이터 탭이 활성화되지 않았습니다.', 'error');
        return;
    }

    // Render date checkbox list (multi-select), default checking the active tab's date
    const listEl = document.getElementById('pDateCheckboxList');
    const sortedDates = Object.keys(globalProcessedData).sort();
    listEl.innerHTML = sortedDates.map(date => `
        <label class="flex items-center space-x-2 cursor-pointer text-slate-700">
            <input type="checkbox" value="${date}" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" ${date === activeTabDate ? 'checked' : ''}>
            <span>${date} <span class="text-slate-400">(${globalProcessedData[date].length}건)</span></span>
        </label>
    `).join('');

    printModal.classList.remove('hidden');
    printModal.classList.add('flex');
    // small delay for transition
    setTimeout(() => {
        printModal.classList.remove('opacity-0');
        printModalBox.classList.remove('scale-95');
    }, 10);
}

function toggleSelectAllDates() {
    const checkboxes = document.querySelectorAll('#pDateCheckboxList input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
}

function closePrintModal() {
    printModal.classList.add('opacity-0');
    printModalBox.classList.add('scale-95');
    setTimeout(() => {
        printModal.classList.remove('flex');
        printModal.classList.add('hidden');
    }, 200);
}

// GT 수량 표시 텍스트: 팔레트 집품이 있으면 (+N P) 표기, 집품중이면 뒤에 물결(~) 표기.
// 인쇄 출력(buildTruckRows)과 화면 미리보기(buildPreviewRows) 양쪽에서 공용으로 사용.
function gtDisplayText(d) {
    let text = d.inputs.palettePick > 0
        ? `${d.inputs.emptyGt} (+${d.inputs.palettePick}P)`
        : `${d.inputs.emptyGt}`;
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

    const selectedDates = Array.from(
        document.querySelectorAll('#pDateCheckboxList input[type="checkbox"]:checked')
    ).map(cb => cb.value).sort();

    if (selectedDates.length === 0) {
        showToast('출력할 생성일시를 하나 이상 선택해주세요.', 'error');
        return;
    }

    const printArea = document.getElementById('truckPrintArea');

    // Common header (한 번만 출력): 유의사항 + 상차제한
    let html = '';

    if (notes.trim() !== '') {
        html += `<div class="p-col" style="margin-bottom:8px;">
                    <div class="p-col-title">유의사항</div>
                    <div class="p-col-content" style="white-space:pre-wrap;">${notes}</div>
                 </div>`;
    }

    if (dateLimit.trim() !== '' || groupLimit.trim() !== '') {
        html += `<div class="p-row">`;

        // Left col (Date)
        html += `<div class="p-col">
                    <div class="p-col-title">날짜 상차제한</div>
                    <div class="p-col-content">${dateLimit}</div>
                 </div>`;

        // Right col (Barcode)
        html += `<div class="p-col">
                    <div class="p-col-title">그룹번호 상차제한</div>
                    <div class="p-col-content">
                        ${groupLimit.trim() !== '' ? `<svg id="printBarcode"></svg>` : ''}
                    </div>
                 </div>`;
        html += `</div>`;
    }

    // 선택된 날짜별로 구분된 테이블 섹션
    selectedDates.forEach(date => {
        html += buildDateSectionHtml(date);
    });

    printArea.innerHTML = html;

    // Generate Barcode if groupLimit provided
    if (groupLimit.trim() !== '') {
        try {
            JsBarcode("#printBarcode", groupLimit, {
                format: "CODE128",
                width: 2,
                height: 40,
                displayValue: true,
                fontSize: 16,
                margin: 0
            });
        } catch (e) {
            console.error("Barcode generation failed", e);
            document.getElementById("printBarcode").outerHTML = `<span>[바코드 변환 오류: ${groupLimit}]</span>`;
        }
    }

    // Trigger Print
    setTimeout(() => {
        window.print();
        closePrintModal();
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

    const activeClass = "w-full text-left px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center space-x-2 transition-colors bg-indigo-600 text-white shadow-md shadow-indigo-100";
    const inactiveClass = "w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium flex items-center space-x-2 transition-colors bg-white text-slate-600 border border-slate-200 hover:bg-slate-50";

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
        tabsContainer.innerHTML = `<span class="text-sm text-slate-400">홈에서 엑셀 데이터를 먼저 업로드해주세요.</span>`;
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
                        <th class="px-4 py-3 w-10"></th>
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

function toggleSelectAllCycleRows() {
    const allRows = Object.values(truckCycleData).flat();
    if (allRows.length === 0) return;
    const allChecked = allRows.every(r => r.checked);
    allRows.forEach(r => r.checked = !allChecked);
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
        showToast('먼저 홈에서 엑셀 데이터를 업로드해주세요.', 'error');
        return;
    }

    const dateSelect = document.getElementById('cGenDate');
    const defaultDate = (activeCycleDate && sortedDates.includes(activeCycleDate)) ? activeCycleDate : sortedDates[0];
    dateSelect.innerHTML = sortedDates.map(d => `<option value="${d}" ${d === defaultDate ? 'selected' : ''}>${d}</option>`).join('');

    renderCycleGenCompanyList();

    cycleGenModal.classList.remove('hidden');
    cycleGenModal.classList.add('flex');
    setTimeout(() => {
        cycleGenModal.classList.remove('opacity-0');
        cycleGenModalBox.classList.remove('scale-95');
    }, 10);
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
    cycleGenModal.classList.add('opacity-0');
    cycleGenModalBox.classList.add('scale-95');
    setTimeout(() => {
        cycleGenModal.classList.remove('flex');
        cycleGenModal.classList.add('hidden');
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

    // 출력 시점에 실제 사용된 CT를 풀에서 차감 (수동 입력한 CT도 여기서 반영됨)
    selectedRows.forEach(row => {
        if (row.ct.trim() !== '') {
            consumeCtFromPool(row.ct);
        }
    });
    renderCtAvailableList();

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
                fontSize: 32,
                margin: 0
            });
        } catch (e) {
            console.error("Barcode generation failed", e);
            document.getElementById(`cycleBarcode-${idx}`).outerHTML = `<span>[바코드 변환 오류: ${row.ct}]</span>`;
        }
    });

    selectedRows.forEach(row => {
        row.ct = '';
    });
    renderCycleTable();
    saveState();

    setTimeout(() => {
        window.print();
    }, 300);
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
