/*
 * storage.js — a small, defensive wrapper around localStorage.
 *
 * The rest of the app never touches localStorage directly; it goes through
 * this module. That keeps the storage key, the JSON shape, and all the
 * "what if the data is corrupted" handling in exactly one place.
 */
window.CD = window.CD || {};

CD.storage = (function () {
  "use strict";

  var KEY = "countdown.timers.v1";
  var SETTINGS_KEY = "countdown.settings.v1";
  var DEFAULT_SETTINGS = { sound: true, confetti: true, notify: false, timeFormat: "24" };

  // Is localStorage actually usable? (private mode / disabled storage / quota)
  var available = (function () {
    try {
      var t = "__cd_probe__";
      window.localStorage.setItem(t, t);
      window.localStorage.removeItem(t);
      return true;
    } catch (e) {
      return false;
    }
  })();

  // A record is valid only if it has an id and a finite target timestamp.
  function isValidTimer(t) {
    return (
      t &&
      typeof t === "object" &&
      typeof t.id === "string" &&
      t.id.length > 0 &&
      typeof t.targetTime === "number" &&
      isFinite(t.targetTime)
    );
  }

  // Coerce a stored record into the exact shape the app expects, dropping
  // anything unexpected. Missing createdAt falls back so progress still works.
  function normalize(t) {
    return {
      id: String(t.id),
      name: typeof t.name === "string" ? t.name : "",
      targetTime: Number(t.targetTime),
      createdAt:
        typeof t.createdAt === "number" && isFinite(t.createdAt)
          ? Number(t.createdAt)
          : Number(t.targetTime),
      sound: typeof t.sound === "string" && t.sound ? t.sound : "chime",
    };
  }

  // Read all timers. Never throws: bad JSON or a non-array payload yields [].
  function getTimers() {
    if (!available) return [];
    var raw;
    try {
      raw = window.localStorage.getItem(KEY);
    } catch (e) {
      return [];
    }
    if (!raw) return [];

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Corrupted payload — clear it so the app starts clean next time.
      try {
        window.localStorage.removeItem(KEY);
      } catch (_) {}
      return [];
    }

    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidTimer).map(normalize);
  }

  // Persist the full list. Returns true on success, false if storage failed.
  function saveTimers(timers) {
    if (!available) return false;
    var clean = Array.isArray(timers) ? timers.filter(isValidTimer).map(normalize) : [];
    try {
      window.localStorage.setItem(KEY, JSON.stringify(clean));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Convenience: remove one timer by id and persist the result.
  function deleteTimer(id) {
    var remaining = getTimers().filter(function (t) {
      return t.id !== id;
    });
    return saveTimers(remaining);
  }

  // Settings are a small flat object of booleans; unknown keys are ignored and
  // missing keys fall back to defaults, so old payloads keep working.
  function getSettings() {
    var s = {
      sound: DEFAULT_SETTINGS.sound,
      confetti: DEFAULT_SETTINGS.confetti,
      notify: DEFAULT_SETTINGS.notify,
      timeFormat: DEFAULT_SETTINGS.timeFormat,
    };
    if (!available) return s;
    try {
      var raw = window.localStorage.getItem(SETTINGS_KEY);
      if (!raw) return s;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.sound === "boolean") s.sound = parsed.sound;
        if (typeof parsed.confetti === "boolean") s.confetti = parsed.confetti;
        if (typeof parsed.notify === "boolean") s.notify = parsed.notify;
        if (parsed.timeFormat === "24" || parsed.timeFormat === "12" || parsed.timeFormat === "auto") {
          s.timeFormat = parsed.timeFormat;
        }
      }
    } catch (e) {
      /* fall back to defaults */
    }
    return s;
  }

  function saveSettings(s) {
    if (!available) return false;
    var tf = s && (s.timeFormat === "12" || s.timeFormat === "auto") ? s.timeFormat : "24";
    var clean = {
      sound: !!(s && s.sound),
      confetti: !!(s && s.confetti),
      notify: !!(s && s.notify),
      timeFormat: tf,
    };
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(clean));
      return true;
    } catch (e) {
      return false;
    }
  }

  return {
    isAvailable: function () {
      return available;
    },
    getTimers: getTimers,
    saveTimers: saveTimers,
    deleteTimer: deleteTimer,
    getSettings: getSettings,
    saveSettings: saveSettings,
  };
})();
