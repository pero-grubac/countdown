/*
 * share.js — turn a countdown into a link and back.
 *
 * The whole timer is packed into the URL hash (no server needed), so opening
 * the link on any device reconstructs the same countdown. Because the target
 * is an absolute instant (epoch ms), everyone who opens the link counts down
 * to the same moment — in sync across time zones automatically.
 */
window.CD = window.CD || {};

CD.share = (function () {
  "use strict";

  function toBase64Url(str) {
    var b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function fromBase64Url(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return decodeURIComponent(escape(atob(s)));
  }

  var REPEATS = ["daily", "weekly", "monthly", "yearly"];

  // A compact payload with short keys to keep the link short. The repeat rule
  // (r) and its anchor (a) are only added for recurring timers, so one-off
  // links look exactly like they did before recurrence existed.
  function encode(timer) {
    var payload = {
      id: timer.id,
      n: timer.name || "",
      t: timer.targetTime,
      c: timer.createdAt,
      s: timer.sound || "chime",
    };
    if (REPEATS.indexOf(timer.repeat) >= 0) {
      payload.r = timer.repeat;
      if (typeof timer.anchor === "number" && timer.anchor !== timer.targetTime) {
        payload.a = timer.anchor;
      }
    }
    return "#c=" + toBase64Url(JSON.stringify(payload));
  }

  function url(timer) {
    return location.origin + location.pathname + encode(timer);
  }

  // Returns a timer object, or null if the hash has no valid shared countdown.
  // Links made before recurrence existed decode as one-off timers.
  function decode(hash) {
    if (!hash) return null;
    var m = hash.match(/[#&]c=([^&]+)/);
    if (!m) return null;
    try {
      var obj = JSON.parse(fromBase64Url(m[1]));
      if (!obj || typeof obj.t !== "number" || !isFinite(obj.t)) return null;
      var timer = {
        id: typeof obj.id === "string" && obj.id ? obj.id : "shared_" + obj.t,
        name: typeof obj.n === "string" ? obj.n : "",
        targetTime: obj.t,
        createdAt:
          typeof obj.c === "number" && isFinite(obj.c) ? obj.c : obj.t,
        sound: typeof obj.s === "string" && obj.s ? obj.s : "chime",
        repeat: REPEATS.indexOf(obj.r) >= 0 ? obj.r : "never",
        tags: [],
      };
      if (timer.repeat !== "never") {
        timer.anchor =
          typeof obj.a === "number" && isFinite(obj.a) && obj.a <= obj.t ? obj.a : obj.t;
      }
      return timer;
    } catch (e) {
      return null;
    }
  }

  return { url: url, encode: encode, decode: decode };
})();
