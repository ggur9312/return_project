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
