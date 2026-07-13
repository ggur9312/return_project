(function (Pick) {
  "use strict";

  // --- imported from other js/pick/*.js files via window.Pick ---
  var ASSIGN_TAB_ACTIVE = Pick.ASSIGN_TAB_ACTIVE;
  var ASSIGN_TAB_INACTIVE = Pick.ASSIGN_TAB_INACTIVE;
  var closeModalWithTransition = Pick.closeModalWithTransition;
  var compareValues = Pick.compareValues;
  var createFilterBarController = Pick.createFilterBarController;
  var createSortBarController = Pick.createSortBarController;
  var els = Pick.els;
  var escapeHtml = Pick.escapeHtml;
  var filterRowsExceptKey = Pick.filterRowsExceptKey;
  var getAllCreatedDates = Pick.getAllCreatedDates;
  var getAssignBaseRows = Pick.getAssignBaseRows;
  var getCandidateValues = Pick.getCandidateValues;
  var getCreatedDate = Pick.getCreatedDate;
  var getFloor = Pick.getFloor;
  var getSortedRows = Pick.getSortedRows;
  var insertRowsSortedByZone = Pick.insertRowsSortedByZone;
  var openModalWithTransition = Pick.openModalWithTransition;
  var saveAssignState = Pick.saveAssignState;
  var state = Pick.state;
  var switchView = Pick.switchView;
  var trim = Pick.trim;
  var uniqueValuesFrom = Pick.uniqueValuesFrom;
  var autoMatchGtForWorker = Pick.autoMatchGtForWorker;
  var formatDateDisplay = Pick.formatDateDisplay;
  var handleSparePrintClick = Pick.handleSparePrintClick;
  var printWorkerLabels = Pick.printWorkerLabels;
  var resetGtForWorker = Pick.resetGtForWorker;
  var saveGtState = Pick.saveGtState;
  var setAssignGt = Pick.setAssignGt;

  // 정렬된 아이템 목록(존 오름차순으로 정렬된 행 단위 아이템)을 n명에게 연속
  // 구간으로, 가장 많이 배정된 사람의 합계를 최소화하는 방식으로 나눔
  // ("Split Array Largest Sum"과 동일한 이진 탐색 분할). 아이템이 행 단위이므로
  // 구간 경계가 존 중간에서 갈릴 수 있는데, 이는 인접한 두 사람 사이에서만
  // 일어나고 전체 순서는 그대로 유지되므로 오름차순 동선은 깨지지 않는다.
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

    // 장수(행 1개)당 "평균 수량"을 1행의 기준 비용으로 잡아 수량과 장수를 같은
    // 단위로 환산한 결합 점수로 밸런싱 — 수량이 큰 존을 담당하면 자연히 장수가
    // 줄고, 수량이 작은 존을 담당하면 장수가 늘어나는 방향으로 균형이 잡혀서,
    // 수량만 많고 장수는 적은/그 반대인 불공평한 배분을 방지한다.
    var totalQty = items.reduce(function (s, it) { return s + it.qty; }, 0);
    var totalRows = items.reduce(function (s, it) { return s + (it.rows ? it.rows.length : 0); }, 0);
    var unitQtyPerRow = totalRows ? totalQty / totalRows : 0;
    function itemScore(it) {
      return it.qty + (it.rows ? it.rows.length : 0) * unitQtyPerRow;
    }
    var scores = items.map(itemScore);

    var lo = Math.max.apply(null, scores);
    var hi = scores.reduce(function (a, b) { return a + b; }, 0);

    function groupsNeeded(limit) {
      var count = 1;
      var sum = 0;
      for (var i = 0; i < scores.length; i++) {
        if (sum + scores[i] > limit) {
          count++;
          sum = scores[i];
        } else {
          sum += scores[i];
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
      if (currentSum + scores[i] > lo && current.length) {
        result.push(current);
        current = [];
        currentSum = 0;
      }
      current.push(items[i]);
      currentSum += scores[i];
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

    // 위 이진탐색 분할은 "그룹 최대 합"만 억제할 뿐 그룹 간 편차(최대-최소)를
    // 직접 줄이지는 않아 유독 작은 그룹이 남을 수 있다 — 인접 그룹 경계의
    // 아이템을 한쪽씩 옮겨보며 편차가 줄어드는 이동만 반복 적용(작업자 담당
    // 구역의 인접성은 그대로 유지한 채 편차만 추가로 최소화).
    rebalanceContiguousGroups(result, itemScore);
    return result;
  }

  function rebalanceContiguousGroups(groups, scoreOf) {
    var sums = groups.map(function (g) {
      return g.reduce(function (s, it) { return s + scoreOf(it); }, 0);
    });
    function spreadOf(arr) {
      return Math.max.apply(null, arr) - Math.min.apply(null, arr);
    }
    var changed = true;
    var guard = 0;
    while (changed && guard < 1000) {
      changed = false;
      guard++;
      for (var i = 0; i < groups.length - 1; i++) {
        var base = spreadOf(sums);

        // 왼쪽 그룹의 마지막 아이템을 오른쪽으로
        if (groups[i].length > 1) {
          var s1 = scoreOf(groups[i][groups[i].length - 1]);
          var trial1 = sums.slice();
          trial1[i] -= s1;
          trial1[i + 1] += s1;
          if (spreadOf(trial1) < base) {
            groups[i + 1].unshift(groups[i].pop());
            sums = trial1;
            changed = true;
            continue;
          }
        }

        // 오른쪽 그룹의 첫 아이템을 왼쪽으로
        if (groups[i + 1].length > 1) {
          var s2 = scoreOf(groups[i + 1][0]);
          var trial2 = sums.slice();
          trial2[i] += s2;
          trial2[i + 1] -= s2;
          if (spreadOf(trial2) < base) {
            groups[i].push(groups[i + 1].shift());
            sums = trial2;
            changed = true;
          }
        }
      }
    }
    return groups;
  }

  // 화면에 표시되는 정렬(state.sortRules, O존 우선 옵션 포함)을 그대로 반영해
  // 정렬된 순서의 행 하나하나를 아이템 하나로 만든다 — 존 단위로 미리 묶지
  // 않기 때문에 splitBalanced가 필요하면 같은 존도 인접한 두 사람 사이에서
  // 나눠 배정할 수 있어(전체 순서는 그대로 유지되므로 오름차순 보장), 존 개수가
  // 인원수 이하라도 수량 균형을 맞출 여지가 생긴다.
  function getAssignRowItems(floorInput, selectedDates) {
    var rows = getSortedRows(getAssignBaseRows());
    var items = [];
    rows.forEach(function (r) {
      if (selectedDates.indexOf(getCreatedDate(r)) === -1) return;
      var floorCode = getFloor(r.zone);
      if (floorCode.indexOf(floorInput) !== 0) return;
      items.push({ zone: r.zone || "(미지정)", qty: (r.quantity || 0), rows: [r] });
    });
    return items;
  }

  function renderAssignTabs() {
    els.assignTabsContainer.innerHTML = "";
    if (!state.assignConfigs.length) {
      els.assignTabsContainer.innerHTML = '<span class="text-sm text-slate-400">홈 화면의 "집품 할당" 버튼으로 배정을 생성해주세요.</span>';
      els.assignTableContainer.innerHTML = "";
      els.assignFilterSortBar.classList.add("hidden");
      return;
    }
    state.assignConfigs.forEach(function (cfg) {
      var isActive = cfg.id === state.assignActiveId;
      var tabBtn = document.createElement("button");
      tabBtn.className = isActive ? ASSIGN_TAB_ACTIVE : ASSIGN_TAB_INACTIVE;
      var dates = cfg.createdDates || [];
      var tabLabel = cfg.custom ? ("커스텀 " + cfg.customSeq) : (escapeHtml(cfg.floorInput) + "층 · " + cfg.count + "명");
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
    { key: "groupNo", label: "그룹번호", type: "string" },
    { key: "deadline", label: "마감일시", type: "date" },
    { key: "createdAt", label: "생성일시", type: "date" },
    { key: "company", label: "업체명", type: "string" },
    { key: "transportType", label: "운송타입", type: "string" },
    { key: "zone", label: "존", type: "string" },
    { key: "quantity", label: "수량", type: "number" }
  ];

  // 집품 할당 필터바에서만 쓰는 "작업자" 가상 컬럼(실제 행 필드가 아니라 어느 작업자
  // 카드를 보여줄지 고르는 용도) 포함 목록 — getAssignPanelCandidateValues가 "__worker__"
  // 키를 특별 취급해서 후보값을 만든다.
  var ASSIGN_FILTER_COLUMNS = ASSIGN_DETAIL_COLUMNS.concat([{ key: "__worker__", label: "작업자", type: "string" }]);

  // renderAssignDetailTable의 작업자 이동 select용 — 현재 존재하는 모든 커스텀/집품
  // 할당(cfg)을 optgroup으로 묶고, 각 cfg의 작업자를 option으로 나열한다.
  // option value는 "cfgId:workerIdx" — 같은 cfg 내 이동과 다른 cfg로의 이동을
  // 하나의 select로 처리하기 위함(이동 핸들러에서 다시 split해서 사용).
  function buildAssignMoveOptionsHtml(cfgId, workerIdx) {
    return state.assignConfigs.map(function (c) {
      var groupCount = (c.workerGroups && c.workerGroups.length) || c.count || 1;
      var label = c.custom ? ("커스텀 " + c.customSeq) : (c.floorInput + "층 · " + c.count + "명");
      if (c.createdDates && c.createdDates.length) label += " · " + c.createdDates.join(", ");
      var opts = "";
      for (var w = 0; w < groupCount; w++) {
        var selected = (String(c.id) === String(cfgId) && w === workerIdx) ? " selected" : "";
        opts += '<option value="' + c.id + ':' + w + '"' + selected + '>' + (c.custom ? ("커스텀 " + c.customSeq) : ("작업자 " + (w + 1))) + "</option>";
      }
      return '<optgroup label="' + escapeHtml(label) + '">' + opts + "</optgroup>";
    }).join("");
  }

  // renderAssignDetailTable이 table-layout:fixed로 표를 항상 카드 폭에 딱 맞추기
  // 위한 컬럼별 퍼센트 폭(합 100% — 나머지 GT바코드/작업자이동/삭제 3칸은 함수 안에서
  // 직접 지정). table-layout:auto(내용 기반 자연폭)로 해봤더니 <input>/<select>가 든
  // 유연한 셀이 남는 공간을 과도하게 흡수해 양쪽 끝(그룹번호/작업자) 컬럼이 부자연스럽게
  // 좁아지고 표가 카드에 고르게 안 맞는 문제가 있어 고정폭으로 되돌렸다 — 원래 퍼센트보다
  // GT바코드/작업자 칸은 더 넉넉하게 잡음.
  var ASSIGN_DETAIL_COLUMN_WIDTHS = {
    groupNo: 10, deadline: 10, createdAt: 10, company: 12, transportType: 8, zone: 8, quantity: 8
  };

  function renderAssignDetailTable(rows, cfgId, workerIdx, workerCount) {
    if (!rows.length) {
      return '<div class="px-5 py-6 text-center text-sm text-slate-400">배정 없음</div>';
    }
    // table-layout:fixed라 <colgroup> 폭이 실제 렌더 폭을 결정 — 카드/화면 크기와
    // 무관하게 표가 항상 카드 폭 100%에 맞고, 넘치는 텍스트는 truncate로 말줄임된다.
    var colgroupHtml = "<colgroup>" +
      ASSIGN_DETAIL_COLUMNS.map(function (col) {
        return '<col style="width:' + ASSIGN_DETAIL_COLUMN_WIDTHS[col.key] + '%">';
      }).join("") +
      '<col style="width:18%"><col style="width:11%"><col style="width:5%">' +
      "</colgroup>";
    var headHtml = ASSIGN_DETAIL_COLUMNS.map(function (col) {
      return '<th class="px-3 py-2.5 text-left truncate' + (col.key === "quantity" ? " text-right" : "") + '">' + col.label + "</th>";
    }).join("") + '<th class="px-3 py-2.5 text-left">GT 바코드</th><th class="px-3 py-2.5 text-right">작업자</th><th class="px-3 py-2.5"></th>';
    var moveOptionsHtml = buildAssignMoveOptionsHtml(cfgId, workerIdx);
    var bodyHtml = rows.map(function (r, i) {
      var gtKey = cfgId + ":" + r.id;
      var gtValue = state.gtAssignments[gtKey] || "";
      var moveSelectHtml = (workerCount > 1 || state.assignConfigs.length > 1)
        ? '<select class="assign-result-row-select w-full bg-white border border-slate-200 rounded-md px-2 py-1 text-xs" data-row-id="' + escapeHtml(r.id) + '" data-from-worker="' + workerIdx + '" data-from-cfg="' + escapeHtml(String(cfgId)) + '">' + moveOptionsHtml + "</select>"
        : "";
      var rowBg = i % 2 === 1 ? "bg-slate-50/60" : "bg-white";
      return (
        '<tr class="' + rowBg + ' hover:bg-indigo-50/40 transition-colors">' +
        ASSIGN_DETAIL_COLUMNS.map(function (col) {
          if (col.key === "quantity") {
            return '<td class="px-3 py-2.5 text-right tabular-nums text-slate-700">' + Number(r.quantity || 0).toLocaleString("ko-KR") + "</td>";
          }
          if (col.key === "groupNo") {
            return '<td class="px-3 py-2.5 font-semibold text-slate-900 truncate" title="' + escapeHtml(r.groupNo) + '">' + escapeHtml(r.groupNo) + "</td>";
          }
          if (col.key === "deadline" || col.key === "createdAt") {
            var displayVal = formatDateDisplay(r[col.key]);
            return '<td class="px-3 py-2.5 text-slate-700 truncate" title="' + escapeHtml(displayVal) + '">' + escapeHtml(displayVal) + "</td>";
          }
          return '<td class="px-3 py-2.5 text-slate-700 truncate" title="' + escapeHtml(r[col.key]) + '">' + escapeHtml(r[col.key]) + "</td>";
        }).join("") +
        '<td class="px-3 py-2.5"><input type="text" class="assign-gt-input w-full bg-white border border-slate-200 rounded-md px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" data-gt-key="' + escapeHtml(gtKey) + '" value="' + escapeHtml(gtValue) + '"></td>' +
        '<td class="px-3 py-2.5 text-right">' + moveSelectHtml + "</td>" +
        '<td class="px-3 py-2.5 text-right"><button type="button" class="assign-result-row-delete-btn inline-flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" data-row-id="' + escapeHtml(r.id) + '" data-worker-idx="' + workerIdx + '" title="배정에서 빼기">✕</button></td>' +
        "</tr>"
      );
    }).join("");
    return (
      '<div class="overflow-x-auto">' +
      '<table class="w-full border-collapse text-left text-xs table-fixed">' +
      colgroupHtml +
      '<thead><tr class="bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-600">' + headHtml + "</tr></thead>" +
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

  // 집품 할당 결과 화면의 필터/정렬 — 홈/row-picker의 전역 상태와 달리 cfg 단위로
  // 스코프된다(작업자별로 따로 갖지 않고 "전체"/특정 작업자 탭 모두 이 하나를 공유 —
  // 예전엔 작업자마다 필터바가 따로 있어 "전체"에서 보면 필터바가 여러 번 반복돼
  // 복잡했다). cfg 객체 위에 얹지 않는 이유: cfg는 saveAssignState()로 그대로
  // localStorage에 저장되므로, 여기에 얹으면 화면 전용 정렬/필터까지 영구 저장되어
  // row-picker의 선례(비영속)와 어긋난다. 이 화면 표시만 바뀔 뿐 cfg.workerGroups
  // (실제 배정 데이터)는 절대 건드리지 않는다.
  // filters의 "__worker__" 키는 실제 행 컬럼이 아니라 "어느 작업자 카드를 보여줄지"를
  // 고르는 가상 필터(값: "작업자 N" 문자열 Set)로, ASSIGN_FILTER_COLUMNS에만 포함되고
  // ASSIGN_DETAIL_COLUMNS(실제 행 렌더링/행 단위 필터링)에는 없어서 자동으로 특별
  // 취급된다. O존 우선 정렬(assignWorkerZoneOPriorityState)도 홈/row-picker처럼
  // 비영속 — 화면을 벗어나거나 새로고침하면 초기화된다.
  var assignWorkerSortState = {};        // key cfgId -> [{key,dir}, ...]
  var assignWorkerFilterState = {};      // key cfgId -> { colKey: Set|null, __worker__: Set|null }
  var assignWorkerZoneOPriorityState = {}; // key cfgId -> boolean

  function getAssignWorkerSortRules(cfgId) {
    var key = String(cfgId);
    if (!assignWorkerSortState[key]) assignWorkerSortState[key] = [];
    return assignWorkerSortState[key];
  }

  function getAssignWorkerFilters(cfgId) {
    var key = String(cfgId);
    if (!assignWorkerFilterState[key]) assignWorkerFilterState[key] = {};
    return assignWorkerFilterState[key];
  }

  function getAssignWorkerZoneOPriority(cfgId) {
    return !!assignWorkerZoneOPriorityState[String(cfgId)];
  }

  function computeAssignWorkerFilteredRows(rows, cfgId) {
    var filters = getAssignWorkerFilters(cfgId);
    return filterRowsExceptKey(rows, ASSIGN_DETAIL_COLUMNS, filters);
  }

  function getAssignWorkerSortedRows(rows, cfgId) {
    var rules = getAssignWorkerSortRules(cfgId);
    var activeRules = rules
      .map(function (rule) { return { col: ASSIGN_DETAIL_COLUMNS.find(function (c) { return c.key === rule.key; }), dir: rule.dir }; })
      .filter(function (r) { return r.col; });
    if (!activeRules.length) return rows;
    var zoneOPriority = getAssignWorkerZoneOPriority(cfgId);
    var copy = rows.slice();
    copy.sort(function (a, b) {
      for (var i = 0; i < activeRules.length; i++) {
        var diff = compareValues(a, b, activeRules[i].col, zoneOPriority) * activeRules[i].dir;
        if (diff !== 0) return diff;
      }
      return 0;
    });
    return copy;
  }

  // 현재 활성 집품 할당(state.assignActiveId)의 작업자별 행 배열 — 필터바 컨트롤러의
  // getCandidateValues/getFilters 등이 "지금 보고 있는 cfg가 무엇이든" 매번 새로
  // 조회할 수 있도록 헬퍼로 뺐다(컨트롤러는 한 번만 생성되고 이후 계속 재사용되므로,
  // cfg를 클로저에 고정하면 탭을 바꿔도 이전 cfg를 계속 가리키게 됨).
  function getActiveAssignConfig() {
    return state.assignConfigs.find(function (c) { return c.id === state.assignActiveId; });
  }

  function getActiveAssignGroups() {
    var cfg = getActiveAssignConfig();
    if (!cfg || !cfg.workerGroups) return [];
    return cfg.workerGroups.map(flattenWorkerGroup);
  }

  // "작업자" 가상 필터(__worker__, 값: "작업자 N" Set)로 이미 좁혀진 범위의 행들 —
  // exceptKey가 "__worker__"면 그 필터 자체는 건너뛴다(자기 자신의 필터로 자기
  // 후보값을 좁히면 안 되므로, 엑셀 자동필터 캐스케이딩 규칙과 동일).
  function getAssignPanelScopedRows(exceptKey) {
    var groups = getActiveAssignGroups();
    var cfg = getActiveAssignConfig();
    if (!cfg) return [];
    var filters = getAssignWorkerFilters(cfg.id);
    var workerFilterSet = exceptKey === "__worker__" ? null : filters.__worker__;
    var visibleGroups = groups.filter(function (g, idx) {
      return !workerFilterSet || workerFilterSet.has("작업자 " + (idx + 1));
    });
    var rows = visibleGroups.reduce(function (acc, g) { return acc.concat(g); }, []);
    return filterRowsExceptKey(rows, ASSIGN_DETAIL_COLUMNS, filters, exceptKey);
  }

  // 엑셀 자동필터처럼 key 자신의 필터를 뺀 나머지 필터를 반영해 후보값을 계산 —
  // "__worker__"는 실제 행 필드가 아니라 작업자 카드 수만큼 "작업자 N" 라벨을 만든다.
  function getAssignPanelCandidateValues(key) {
    if (key === "__worker__") {
      return getActiveAssignGroups().map(function (g, idx) { return "작업자 " + (idx + 1); });
    }
    var rows = getAssignPanelScopedRows(key);
    var values = uniqueValuesFrom(rows, function (r) { return r[key]; });
    var col = ASSIGN_DETAIL_COLUMNS.find(function (c) { return c.key === key; });
    if (col && col.type === "number") {
      values.sort(function (a, b) { return parseFloat(a) - parseFloat(b); });
    }
    return values;
  }

  // 홈/row-picker와 동일한 컨트롤러를 재사용 — 단 활성 cfg가 탭에 따라 바뀌므로,
  // 고정된 필터/정렬 배열을 클로저에 담는 홈과 달리 매번 getActiveAssignConfig()로
  // "지금 보고 있는 cfg"를 다시 찾아 위임한다. 한 번만 생성하고(다른 컨트롤러들과
  // 동일한 위치), 이후 renderAssignPanel()에서 updateButtonStates()/render()만 호출.
  // els는 core.js가 소유한다 — 컨트롤러 생성/버튼 이벤트 연결은 다른 화면들과
  // 마찬가지로 함수로 미뤄, main.js의 초기화 단계(모든 파일이 로드된 뒤)에서
  // 명시적으로 호출하도록 한다(초기화 순서를 main.js 한 곳에 모아두기 위함).
  var assignFilterBarController;
  var assignSortBarController;

  function initAssignPanelControllers() {
    Pick.assignFilterBarController = assignFilterBarController = createFilterBarController({
      columns: ASSIGN_FILTER_COLUMNS,
      containerEl: els.assignFilterButtonsContainer,
      resetBtn: els.assignFilterResetAllBtn,
      getFilters: function () {
        var cfg = getActiveAssignConfig();
        return cfg ? getAssignWorkerFilters(cfg.id) : {};
      },
      setFilter: function (key, value) {
        var cfg = getActiveAssignConfig();
        if (cfg) getAssignWorkerFilters(cfg.id)[key] = value;
      },
      getCandidateValues: getAssignPanelCandidateValues,
      onApply: function () { renderAssignPanel(); }
    });

    Pick.assignSortBarController = assignSortBarController = createSortBarController({
      columns: ASSIGN_DETAIL_COLUMNS,
      containerEl: els.assignSortRulesContainer,
      addBtn: els.assignSortAddBtn,
      resetBtn: els.assignSortResetBtn,
      getSortRules: function () {
        var cfg = getActiveAssignConfig();
        return cfg ? getAssignWorkerSortRules(cfg.id) : [];
      },
      setSortRules: function (rules) {
        var cfg = getActiveAssignConfig();
        if (cfg) assignWorkerSortState[String(cfg.id)] = rules;
      },
      // 홈의 "정렬 초기화"가 O존 우선 정렬도 함께 끄는 것과 동일한 동작.
      onResetExtra: function () {
        var cfg = getActiveAssignConfig();
        if (cfg) assignWorkerZoneOPriorityState[String(cfg.id)] = false;
      },
      onApply: function () { renderAssignPanel(); }
    });

    els.assignSortZoneOPriorityBtn.addEventListener("click", function () {
      var cfg = getActiveAssignConfig();
      if (!cfg) return;
      assignWorkerZoneOPriorityState[String(cfg.id)] = true;
      renderAssignPanel();
      if (window.showToast) window.showToast("72·73층 O존 우선 정렬이 적용되었습니다.");
    });
  }

  // 작업자 카드 헤더에 인덱스별로 순환 적용하는 색상 — "전체" 보기에서 카드가 여러 개
  // 쌓였을 때 전부 같은 색이라 하나로 뭉쳐 보이던 문제(카드마다 구분이 안 됨)를
  // 해결하기 위해, 카드마다 다른 색으로 즉시 구분되게 한다. rail은 헤더를 지나
  // 스크롤해도 어느 작업자 구역인지 계속 보이도록 카드 왼쪽에 얇게 붙이는 액센트 바.
  // 색상 순서는 바로 옆 카드끼리 색상환에서 최대한 멀리 떨어지도록(인디고→앰버→틸→로즈→스카이)
  // 골라, 인접한 두 카드가 비슷한 색이라 헷갈리는 일이 없게 했다.
  var WORKER_CARD_ACCENTS = [
    { header: "bg-indigo-50/80 border-indigo-100", rail: "border-l-indigo-400" },
    { header: "bg-amber-50/80 border-amber-100", rail: "border-l-amber-400" },
    { header: "bg-teal-50/80 border-teal-100", rail: "border-l-teal-400" },
    { header: "bg-rose-50/80 border-rose-100", rail: "border-l-rose-400" },
    { header: "bg-sky-50/80 border-sky-100", rail: "border-l-sky-400" }
  ];

  function renderAssignPanel() {
    var cfg = state.assignConfigs.find(function (c) { return c.id === state.assignActiveId; });
    if (!cfg) {
      els.assignTableContainer.innerHTML = "";
      els.assignFilterSortBar.classList.add("hidden");
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
      els.assignTableContainer.innerHTML = '<div class="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500 shadow-sm">해당 층에 데이터가 없습니다.</div>';
      els.assignFilterSortBar.classList.add("hidden");
      return;
    }
    els.assignFilterSortBar.classList.remove("hidden");
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

    // "작업자" 가상 필터(filters.__worker__, 값: "작업자 N" Set)로 어느 작업자 카드를
    // 아예 보여줄지 결정 — 탭에서 특정 작업자를 골랐으면 그 하나만, "전체"에서는
    // 필터에 체크된 작업자만 보임.
    var workerFilters = getAssignWorkerFilters(cfg.id);
    var workerFilterSet = workerFilters.__worker__ || null;
    var visibleIndices = groups.map(function (g, idx) { return idx; }).filter(function (idx) {
      if (activeWorkerIdx !== null && activeWorkerIdx !== idx) return false;
      if (workerFilterSet && !workerFilterSet.has("작업자 " + (idx + 1))) return false;
      return true;
    });

    var cardsHtml = groups.map(function (detailRows, idx) {
      if (visibleIndices.indexOf(idx) === -1) return "";
      var total = detailRows.reduce(function (sum, r) { return sum + (r.quantity || 0); }, 0);
      var zoneList = Array.from(new Set(detailRows.map(function (r) { return r.zone; }).filter(Boolean))).join(", ");
      var isPrinted = !!(cfg.printedWorkerIdx && cfg.printedWorkerIdx[idx]);
      var accent = WORKER_CARD_ACCENTS[idx % WORKER_CARD_ACCENTS.length];
      var outlineBtn = "inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium text-xs px-3 py-1.5 rounded-lg transition-colors";
      return (
        '<div class="bg-white border-t border-r border-b border-slate-200 border-l-4 ' + accent.rail + ' rounded-2xl shadow-md overflow-hidden">' +
        '<div class="px-5 py-3 ' + accent.header + ' border-b space-y-2">' +
        '<div class="flex items-center justify-between flex-wrap gap-2">' +
        '<div class="text-sm font-bold text-slate-900">작업자 ' + (idx + 1) +
        (isPrinted ? ' <span class="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500 text-white shadow-sm align-middle">✓ 출력됨</span>' : "") +
        (zoneList ? '<span class="ml-2 text-xs font-normal text-slate-500">담당 존: ' + escapeHtml(zoneList) + "</span>" : "") + "</div>" +
        '<div class="text-sm font-bold text-indigo-600">합계 ' + total.toLocaleString("ko-KR") + "개 · " + detailRows.length + "장</div>" +
        "</div>" +
        '<div class="flex items-center justify-end flex-wrap gap-2">' +
        '<button type="button" class="assign-add-row-btn ' + outlineBtn + '" data-worker-idx="' + idx + '">할당 추가</button>' +
        '<button type="button" class="assign-automatch-btn ' + outlineBtn + '" data-worker-idx="' + idx + '">미사용 GT 자동매칭</button>' +
        '<button type="button" class="assign-gt-reset-btn ' + outlineBtn + '" data-worker-idx="' + idx + '">GT 바코드 초기화</button>' +
        '<button type="button" class="assign-spare-print-btn ' + outlineBtn + '" data-worker-idx="' + idx + '">여분 출력</button>' +
        '<button type="button" class="assign-print-btn bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs px-3 py-1.5 rounded-lg shadow-sm transition-all duration-150" data-worker-idx="' + idx + '">출력</button>' +
        (groups.length > 1 ? '<button type="button" class="assign-delete-worker-btn bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-medium text-xs px-3 py-1.5 rounded-lg transition-colors" data-worker-idx="' + idx + '">삭제</button>' : "") +
        "</div>" +
        "</div>" +
        renderAssignDetailTable(getAssignWorkerSortedRows(computeAssignWorkerFilteredRows(detailRows, cfg.id), cfg.id), cfg.id, idx, groups.length) +
        "</div>"
      );
    }).join("");

    els.assignTableContainer.innerHTML = tabsHtml + '<div class="space-y-8">' + cardsHtml + "</div>";
    assignFilterBarController.updateButtonStates();
    assignSortBarController.render();

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
      btn.addEventListener("click", async function () {
        var workerIdx = parseInt(btn.dataset.workerIdx, 10);
        if (cfg.printedWorkerIdx && cfg.printedWorkerIdx[workerIdx]) {
          if (!(await window.confirmModal("이미 출력한 작업자입니다. 다시 출력하시겠습니까?"))) return;
        }
        printWorkerLabels(cfg, groups[workerIdx], function () {
          groups[workerIdx].forEach(function (r) {
            var code = state.gtAssignments[cfg.id + ":" + r.id];
            if (code && state.gtPrinted.indexOf(code) === -1) state.gtPrinted.push(code);
          });
          saveGtState();
          cfg.printedWorkerIdx = cfg.printedWorkerIdx || [];
          cfg.printedWorkerIdx[workerIdx] = true;
          saveAssignState();
          renderAssignPanel();
        });
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
        Pick.openCustomAssignView("append", cfg.id, workerIdx);
      });
    });

    Array.prototype.forEach.call(els.assignTableContainer.querySelectorAll(".assign-result-row-select"), function (sel) {
      sel.addEventListener("change", function () {
        var fromCfgId = sel.dataset.fromCfg;
        var fromIdx = parseInt(sel.dataset.fromWorker, 10);
        var rowId = sel.dataset.rowId;
        var parts = sel.value.split(":");
        var toCfgId = parts[0];
        var toIdx = parseInt(parts[1], 10);
        if (fromCfgId === toCfgId && fromIdx === toIdx) return;

        var fromCfg = state.assignConfigs.find(function (c) { return String(c.id) === String(fromCfgId); });
        var toCfg = state.assignConfigs.find(function (c) { return String(c.id) === toCfgId; });
        if (!fromCfg || !toCfg) return;
        if (!toCfg.workerGroups) {
          toCfg.workerGroups = splitBalanced(toCfg.items || [], toCfg.count).map(flattenWorkerGroup);
        }

        var fromGroup = fromCfg.workerGroups[fromIdx];
        var rowIdx = fromGroup.findIndex(function (r) { return r && r.id === rowId; });
        if (rowIdx === -1) return;
        var row = fromGroup.splice(rowIdx, 1)[0];
        var insertedCount = insertRowsSortedByZone(toCfg.workerGroups[toIdx], [row]);
        if (insertedCount === 0 && window.showToast) {
          window.showToast("이미 대상 작업자에게 있는 행이라 병합했습니다.", "info");
        }

        // GT 바코드 키가 "cfgId:rowId" 형태라, 다른 할당으로 옮길 때는 매칭도 새 키로 옮겨야
        // 유실되지 않는다. 같은 할당 내 작업자 이동은 cfgId가 안 바뀌므로 영향 없음.
        if (String(fromCfg.id) !== String(toCfg.id)) {
          var oldGtKey = fromCfg.id + ":" + rowId;
          var newGtKey = toCfg.id + ":" + rowId;
          if (state.gtAssignments[oldGtKey] !== undefined) {
            state.gtAssignments[newGtKey] = state.gtAssignments[oldGtKey];
            delete state.gtAssignments[oldGtKey];
            saveGtState();
          }
        }

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
    // 정렬/필터는 이제 작업자별이 아니라 cfg 하나에 공용이라(위 상태 변수 주석 참고),
    // 작업자를 지워도 별도로 정리할 고아 키가 없다.
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
    // 확정된 배정은 유지됨(재조회하지 않음). 행 단위 균형 분배(splitBalanced) 결과를
    // 바로 원본 데이터 행 단위로 펼쳐서, 미리보기에 존 요약이 아니라 실제 행이 보이게 한다.
    var items = getAssignRowItems(floorInput, selectedDates);
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
    // 이 config에 속했던 공용 정렬/필터/O존우선 상태(고아 키)도 함께 정리
    delete assignWorkerSortState[String(id)];
    delete assignWorkerFilterState[String(id)];
    delete assignWorkerZoneOPriorityState[String(id)];
    saveAssignState();
    renderAssignTabs();
  }

  // --- exposed to other js/pick/*.js files via window.Pick ---
  Pick.splitBalanced = splitBalanced;
  Pick.rebalanceContiguousGroups = rebalanceContiguousGroups;
  Pick.getAssignRowItems = getAssignRowItems;
  Pick.renderAssignTabs = renderAssignTabs;
  Pick.ASSIGN_DETAIL_COLUMNS = ASSIGN_DETAIL_COLUMNS;
  Pick.ASSIGN_FILTER_COLUMNS = ASSIGN_FILTER_COLUMNS;
  Pick.buildAssignMoveOptionsHtml = buildAssignMoveOptionsHtml;
  Pick.renderAssignDetailTable = renderAssignDetailTable;
  Pick.flattenWorkerGroup = flattenWorkerGroup;
  Pick.assignWorkerSortState = assignWorkerSortState;
  Pick.assignWorkerFilterState = assignWorkerFilterState;
  Pick.assignWorkerZoneOPriorityState = assignWorkerZoneOPriorityState;
  Pick.getAssignWorkerSortRules = getAssignWorkerSortRules;
  Pick.getAssignWorkerFilters = getAssignWorkerFilters;
  Pick.getAssignWorkerZoneOPriority = getAssignWorkerZoneOPriority;
  Pick.computeAssignWorkerFilteredRows = computeAssignWorkerFilteredRows;
  Pick.getAssignWorkerSortedRows = getAssignWorkerSortedRows;
  Pick.getActiveAssignConfig = getActiveAssignConfig;
  Pick.getActiveAssignGroups = getActiveAssignGroups;
  Pick.getAssignPanelScopedRows = getAssignPanelScopedRows;
  Pick.getAssignPanelCandidateValues = getAssignPanelCandidateValues;
  Pick.assignFilterBarController = assignFilterBarController;
  Pick.assignSortBarController = assignSortBarController;
  Pick.initAssignPanelControllers = initAssignPanelControllers;
  Pick.renderAssignPanel = renderAssignPanel;
  Pick.removeAssignWorker = removeAssignWorker;
  Pick.setAssignMsg = setAssignMsg;
  Pick.getSelectedAssignDates = getSelectedAssignDates;
  Pick.renderAssignDateCheckboxes = renderAssignDateCheckboxes;
  Pick.assignPreviewGroups = assignPreviewGroups;
  Pick.assignPreviewMeta = assignPreviewMeta;
  Pick.assignPreviewActiveWorkerIdx = assignPreviewActiveWorkerIdx;
  Pick.generateAssignPreview = generateAssignPreview;
  Pick.renderAssignPreviewRows = renderAssignPreviewRows;
  Pick.renderAssignPreview = renderAssignPreview;
  Pick.confirmAssignConfig = confirmAssignConfig;
  Pick.resetAssignCreateModal = resetAssignCreateModal;
  Pick.openAssignCreateModal = openAssignCreateModal;
  Pick.closeAssignCreateModal = closeAssignCreateModal;
  Pick.removeAssignConfig = removeAssignConfig;
})(window.Pick = window.Pick || {});
