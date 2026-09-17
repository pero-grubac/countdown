/*
 * notify.js — a thin wrapper around the Notification API.
 *
 * The app schedules these so a countdown can reach you even when the tab is in
 * the background. Delivery is best-effort: browsers throttle timers in hidden
 * tabs, so a notification may arrive a little late, and permission is required.
 */
window.CD = window.CD || {};

CD.notify = (function () {
  "use strict";

  function isSupported() {
    return typeof window !== "undefined" && "Notification" in window;
  }

  function permission() {
    return isSupported() ? Notification.permission : "denied";
  }

  // Ask the user. Resolves to "granted" | "denied" | "default".
  function request() {
    if (!isSupported()) return Promise.resolve("denied");
    try {
      var r = Notification.requestPermission();
      if (r && typeof r.then === "function") return r;
      // Older Safari only supports the callback form.
      return new Promise(function (resolve) {
        Notification.requestPermission(resolve);
      });
    } catch (e) {
      return Promise.resolve("denied");
    }
  }

  function show(title, body, tag) {
    if (!isSupported() || Notification.permission !== "granted") return;
    try {
      var n = new Notification(title, { body: body, tag: tag });
      n.onclick = function () {
        try {
          window.focus();
        } catch (e) {}
        n.close();
      };
    } catch (e) {
      /* some browsers throw if construction isn't allowed here */
    }
  }

  return {
    isSupported: isSupported,
    permission: permission,
    request: request,
    show: show,
  };
})();
