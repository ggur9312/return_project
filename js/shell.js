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
  var pickApp = document.getElementById("pickApp");
  var truckApp = document.getElementById("truckApp");
  var pickBtn = document.getElementById("switchToPickBtn");
  var truckBtn = document.getElementById("switchToTruckBtn");
  var BASE = "px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ";
  var ACTIVE = "bg-white text-indigo-700 shadow-sm";
  var INACTIVE = "bg-indigo-500/40 text-white hover:bg-indigo-500/60";

  function apply(view) {
    var toTruck = view === "truck";
    truckApp.classList.toggle("hidden", !toTruck);
    pickApp.classList.toggle("hidden", toTruck);
    truckBtn.className = BASE + (toTruck ? ACTIVE : INACTIVE);
    pickBtn.className = BASE + (toTruck ? INACTIVE : ACTIVE);
    try { localStorage.setItem(STORAGE_KEY, view); } catch (e) {}
  }

  pickBtn.addEventListener("click", function () { window.flashPageLoading && window.flashPageLoading(); apply("pick"); });
  truckBtn.addEventListener("click", function () { window.flashPageLoading && window.flashPageLoading(); apply("truck"); });

  var saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
  apply(saved === "truck" ? "truck" : "pick");
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

  function showUiModal(message, showCancel) {
    return new Promise(function (resolve) {
      msgEl.textContent = message || "";
      cancelBtn.classList.toggle("hidden", !showCancel);

      function cleanup(result) {
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        modal.classList.add("opacity-0");
        box.classList.add("scale-95");
        setTimeout(function () {
          modal.classList.add("hidden");
          modal.classList.remove("flex");
        }, 200);
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);

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
