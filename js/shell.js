// 화면 전환(앱 전환/뷰 전환) 시 짧게 겹쳐 보여주는 로딩 오버레이 — 실제 전환은
// 서버 통신 없이 즉시 이뤄지지만, 순간적으로 뚝 끊겨 보이는 느낌을 줄이기 위한
// 순수 시각 연출용 타이머. 전환 로직 자체를 지연시키지 않는다.
(function () {
  "use strict";

  var overlay = document.getElementById("pageLoadingOverlay");
  var hideTimer = null;
  var showTimer = null;

  window.flashPageLoading = function () {
    if (!overlay) return;
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    overlay.classList.remove("hidden");
    requestAnimationFrame(function () {
      overlay.classList.remove("opacity-0");
    });
    showTimer = setTimeout(function () {
      overlay.classList.add("opacity-0");
      hideTimer = setTimeout(function () {
        overlay.classList.add("hidden");
      }, 200);
    }, 180);
  };
})();

// 두 앱 공용 모달 배경 스크롤 잠금 — 모달 내부를 스크롤할 때 배경 페이지까지
// 같이 스크롤되는 것을 막는다. 참조 카운트를 두는 이유: 모달이 겹쳐 열릴 수
// 있어서(예: 확인 모달이 다른 모달 위에 뜨는 경우) 안쪽 모달이 닫혀도 바깥
// 모달이 아직 열려 있으면 잠금을 풀면 안 된다 — 카운트가 0이 될 때만 해제.
(function () {
  "use strict";
  var openModalCount = 0;
  window.lockBodyScroll = function () {
    if (openModalCount === 0) {
      var scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarWidth > 0) document.body.style.paddingRight = scrollbarWidth + "px";
    }
    openModalCount++;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  };
  window.unlockBodyScroll = function () {
    openModalCount = Math.max(0, openModalCount - 1);
    if (openModalCount === 0) {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    }
  };
})();

// 두 앱(집품현황/트럭현황) 공용 토스트 알림 — 생성/출력 완료 등 짧은 완료
// 안내에 사용. app.js/truck.js가 로드된 뒤(이벤트 핸들러 안에서) 호출되므로
// 스크립트 로드 순서와 무관하게 안전하다.
(function () {
  "use strict";

  var toastContainer = document.getElementById("toastContainer");

  window.showToast = function (message, type) {
    if (!toastContainer) return;
    type = type || "success";
    var toast = document.createElement("div");
    toast.className = "p-4 rounded-xl shadow-lg border text-sm font-medium flex items-center space-x-2 bg-white transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto";

    if (type === "success") {
      toast.classList.add("border-emerald-200", "text-emerald-800", "bg-emerald-50/80");
      toast.innerHTML = '<svg class="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><span></span>';
    } else if (type === "info") {
      toast.classList.add("border-blue-200", "text-blue-800", "bg-blue-50/80");
      toast.innerHTML = '<svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><span></span>';
    } else {
      toast.classList.add("border-rose-200", "text-rose-800", "bg-rose-50/80");
      toast.innerHTML = '<svg class="w-5 h-5 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg><span></span>';
    }
    toast.querySelector("span").textContent = message;

    toastContainer.appendChild(toast);
    setTimeout(function () {
      toast.classList.remove("translate-y-2", "opacity-0");
    }, 50);

    setTimeout(function () {
      toast.classList.add("opacity-0", "translate-y-[-10px]");
      setTimeout(function () { toast.remove(); }, 300);
    }, 4000);
  };
})();

(function () {
  "use strict";

  var STORAGE_KEY = "activeAppView";
  var dashboardApp = document.getElementById("dashboardApp");
  var pickApp = document.getElementById("pickApp");
  var truckApp = document.getElementById("truckApp");
  var dashboardBtn = document.getElementById("switchToDashboardBtn");
  var pickBtn = document.getElementById("switchToPickBtn");
  var truckBtn = document.getElementById("switchToTruckBtn");
  var pickSubnav = document.getElementById("pickSidebarSubnav");
  var truckSubnav = document.getElementById("truckSidebarSubnav");
  var TOP_BASE = "w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors ";
  var TOP_ACTIVE = "bg-indigo-600 text-white shadow-sm";
  var TOP_INACTIVE = "text-slate-300 hover:bg-slate-700/70 hover:text-white";
  var SUBNAV_BASE = "grid transition-[grid-template-rows] duration-300 ease-in-out ";
  var SUBNAV_OPEN = "grid-rows-[1fr]";
  var SUBNAV_CLOSED = "grid-rows-[0fr]";

  function apply(view) {
    dashboardApp.classList.toggle("hidden", view !== "dashboard");
    pickApp.classList.toggle("hidden", view !== "pick");
    truckApp.classList.toggle("hidden", view !== "truck");
    dashboardBtn.className = TOP_BASE + (view === "dashboard" ? TOP_ACTIVE : TOP_INACTIVE);
    pickBtn.className = TOP_BASE + (view === "pick" ? TOP_ACTIVE : TOP_INACTIVE);
    truckBtn.className = TOP_BASE + (view === "truck" ? TOP_ACTIVE : TOP_INACTIVE);
    pickSubnav.className = SUBNAV_BASE + (view === "pick" ? SUBNAV_OPEN : SUBNAV_CLOSED);
    truckSubnav.className = SUBNAV_BASE + (view === "truck" ? SUBNAV_OPEN : SUBNAV_CLOSED);
    try { localStorage.setItem(STORAGE_KEY, view); } catch (e) {}
    // 대시보드의 존/층 막대그래프는 집품현황의 state.rows를 사용하는데, 대시보드가
    // 숨겨진 동안은 refreshAll()이 렌더를 건너뛰므로 돌아올 때 다시 그려 따라잡는다.
    // window.Pick이 아직 없는 최초 parse-time apply() 호출에는 안전하게 무시된다.
    if (view === "dashboard" && window.Pick && window.Pick.refreshAll) window.Pick.refreshAll();
  }

  dashboardBtn.addEventListener("click", function () { apply("dashboard"); });
  pickBtn.addEventListener("click", function () { apply("pick"); });
  truckBtn.addEventListener("click", function () { apply("truck"); });

  var saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
  apply(saved === "truck" ? "truck" : saved === "pick" ? "pick" : "dashboard");
})();

// 두 앱(집품현황/트럭현황) 공용 확인·알림 모달 — 네이티브 confirm()/alert() 대체.
// 이 스크립트는 app.js/truck.js보다 늦게 로드되지만, 실제 호출은 사용자가 버튼을
// 누른 뒤(이벤트 핸들러 안에서) 이뤄지므로 로드 순서와 무관하게 안전하다.
(function () {
  "use strict";

  var modal = document.getElementById("uiConfirmModal");
  var box = document.getElementById("uiConfirmModalBox");
  var msgEl = document.getElementById("uiConfirmModalMsg");
  var okBtn = document.getElementById("uiConfirmModalOkBtn");
  var cancelBtn = document.getElementById("uiConfirmModalCancelBtn");
  var hideTimeoutId = null;

  function showUiModal(message, showCancel) {
    return new Promise(function (resolve) {
      // 이전 호출의 hide 타이머가 아직 안 지났으면 취소 — 안 그러면 두 확인모달을
      // 짧은 간격으로 연달아 띄울 때(예: 재출력 확인 → 출력완료 확인) 이전 타이머가
      // 새로 열린 모달을 도로 숨겨버려 "물어보지 않은 것처럼" 보이는 버그가 있었다.
      clearTimeout(hideTimeoutId);
      msgEl.textContent = message || "";
      cancelBtn.classList.toggle("hidden", !showCancel);

      function cleanup(result) {
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        modal.classList.add("opacity-0");
        box.classList.add("scale-95");
        hideTimeoutId = setTimeout(function () {
          modal.classList.add("hidden");
          modal.classList.remove("flex");
          if (window.unlockBodyScroll) window.unlockBodyScroll();
        }, 200);
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);

      // 연달아 호출되는 경우(예: 재출력 확인 → 출력완료 확인) 위의 clearTimeout이
      // 이전 호출의 hide(및 그 안의 unlock)를 이미 취소시켰으므로, 실제로 hidden
      // 상태였을 때만 새로 잠가야 카운트가 어긋나지 않는다.
      var wasHidden = modal.classList.contains("hidden");
      if (wasHidden && window.lockBodyScroll) window.lockBodyScroll();

      modal.classList.remove("hidden");
      modal.classList.add("flex");
      requestAnimationFrame(function () {
        modal.classList.remove("opacity-0");
        box.classList.remove("scale-95");
      });
    });
  }

  window.confirmModal = function (message) { return showUiModal(message, true); };
  window.alertModal = function (message) { return showUiModal(message, false); };
})();

// 두 앱 공용 인쇄 헬퍼 — 브라우저 인쇄창은 JS로 "출력함"과 "취소함"을 구분할
// 방법이 없다. afterprint 이벤트로 인쇄창이 닫힌 시점만 감지한 뒤, 위 확인모달로
// 실제 출력 여부를 사용자에게 다시 확인받아 그 답에 따라서만 상태변경(onConfirmed)과
// 성공 토스트를 실행한다. innerHTML 갱신 직후 곧바로 print()하면 레이아웃이 아직
// 반영되지 않아 이전 인쇄 내용이 나올 수 있어 두 번의 rAF로 페인트를 기다린다.
(function () {
  "use strict";

  var AFTERPRINT_FALLBACK_MS = 20000;
  // 모든 GT 인쇄 경로(작업자별 출력/GT 단독 출력/커스텀 라벨/여분 출력)가 이
  // 함수 하나로 모이므로, 여기 한 곳에서만 막아도 어느 버튼을 빠르게 두 번
  // 눌러도 같은 라벨이 중복 인쇄되지 않는다.
  var printInProgress = false;

  window.printWithConfirm = function (onConfirmed) {
    if (printInProgress) {
      if (window.showToast) window.showToast("이미 인쇄가 진행 중입니다.", "info");
      return Promise.resolve(false);
    }
    printInProgress = true;
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var settled = false;
          function finish(detected) {
            if (settled) return;
            settled = true;
            window.removeEventListener("afterprint", onAfterPrint);
            resolve(detected);
          }
          function onAfterPrint() { finish(true); }
          window.addEventListener("afterprint", onAfterPrint);
          window.print();
          // afterprint를 지원/발생시키지 않는 예외적 환경 대비 폴백 — 감지 실패 시
          // 출력 성공을 함부로 단정하지 않는다(아래에서 확인모달 없이 조용히 종료).
          setTimeout(function () { finish(false); }, AFTERPRINT_FALLBACK_MS);
        });
      });
    }).then(function (detected) {
      if (!detected) return false;
      return window.confirmModal("출력을 완료하셨나요?\n(확인 = 출력 완료 / 취소 = 출력하지 않음)").then(function (confirmed) {
        if (confirmed) {
          if (typeof onConfirmed === "function") onConfirmed();
          window.showToast("출력이 완료되었습니다.");
        }
        return confirmed;
      });
    }).then(function (result) {
      printInProgress = false;
      return result;
    }, function (err) {
      printInProgress = false;
      throw err;
    });
  };
})();
