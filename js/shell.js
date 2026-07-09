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

  pickBtn.addEventListener("click", function () { apply("pick"); });
  truckBtn.addEventListener("click", function () { apply("truck"); });

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
