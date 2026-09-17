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

  // A compact payload with short keys to keep the link short.
  function encode(timer) {
    var payload = {
      id: timer.id,
      n: timer.name || "",
      t: timer.targetTime,
      c: timer.createdAt,
      s: timer.sound || "chime",
    };
    return "#c=" + toBase64Url(JSON.stringify(payload));
  }

  function url(timer) {
    return location.origin + location.pathname + encode(timer);
  }

  // Returns a timer object, or null if the hash has no valid shared countdown.
  function decode(hash) {
    if (!hash) return null;
    var m = hash.match(/[#&]c=([^&]+)/);
    if (!m) return null;
    try {
      var obj = JSON.parse(fromBase64Url(m[1]));
      if (!obj || typeof obj.t !== "number" || !isFinite(obj.t)) return null;
      return {
        id: typeof obj.id === "string" && obj.id ? obj.id : "shared_" + obj.t,
        name: typeof obj.n === "string" ? obj.n : "",
        targetTime: obj.t,
        createdAt:
          typeof obj.c === "number" && isFinite(obj.c) ? obj.c : obj.t,
        sound: typeof obj.s === "string" && obj.s ? obj.s : "chime",
      };
    } catch (e) {
      return null;
    }
  }

  return { url: url, encode: encode, decode: decode };
})();
