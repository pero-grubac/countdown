/*
 * model.js — the timer data model and the derived values the UI needs.
 *
 * The one rule that makes this app trustworthy after refreshes, sleep, and
 * offline gaps: remaining time is ALWAYS computed as targetTime - now.
 * Nothing here decrements a counter. The interval only decides when to redraw.
 */
window.CD = window.CD || {};

CD.model = (function () {
  "use strict";

  var SOON_MS = 60 * 1000; // "Ending soon" threshold: under a minute left.
  var DEFAULT_SOUND = "chime";
  var REPEATS = ["never", "daily", "weekly", "monthly", "yearly"];
  var MAX_TAGS = 8;
  var MAX_TAG_LENGTH = 24;

  function newId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "t_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  function normalizeRepeat(value) {
    return REPEATS.indexOf(value) > 0 ? value : "never";
  }

  function isRecurring(timer) {
    return !!timer && normalizeRepeat(timer.repeat) !== "never";
  }

  /*
   * Tags arrive as "work, home" from the form or as an array from storage.
   * Trimmed, de-duplicated case-insensitively (first spelling wins), capped.
   */
  function parseTags(input) {
    var list = Array.isArray(input)
      ? input
      : typeof input === "string"
        ? input.split(",")
        : [];
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length && out.length < MAX_TAGS; i++) {
      if (typeof list[i] !== "string") continue;
      var tag = list[i].trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH).trim();
      var key = tag.toLowerCase();
      if (!tag || seen[key]) continue;
      seen[key] = true;
      out.push(tag);
    }
    return out;
  }

  /*
   * Build a timer record. `input` is one of:
   *   { name, targetTime }                       // an absolute instant
   *   { name, durationMs }                       // relative to `now`
   * plus optional { sound, repeat, tags }.
   * Returns { timer } or { error } — never throws on bad input.
   */
  function create(input, now) {
    now = typeof now === "number" ? now : Date.now();
    var name = input && typeof input.name === "string" ? input.name.trim() : "";
    var sound =
      input && typeof input.sound === "string" && input.sound
        ? input.sound
        : DEFAULT_SOUND;

    var targetTime;
    if (typeof input.durationMs === "number") {
      if (!isFinite(input.durationMs) || input.durationMs <= 0) {
        return { error: "Enter a duration greater than zero." };
      }
      targetTime = now + Math.round(input.durationMs);
    } else if (typeof input.targetTime === "number") {
      if (!isFinite(input.targetTime)) {
        return { error: "That date and time isn't valid." };
      }
      if (input.targetTime <= now) {
        return { error: "Pick a date and time in the future." };
      }
      targetTime = Math.round(input.targetTime);
    } else {
      return { error: "Choose a duration or a target date and time." };
    }

    var timer = {
      id: newId(),
      name: name,
      targetTime: targetTime,
      createdAt: now,
      sound: sound,
      repeat: normalizeRepeat(input.repeat),
      tags: parseTags(input.tags),
    };
    // The anchor is the first occurrence; later ones are counted from it so a
    // monthly timer on the 31st comes back to the 31st after a short month.
    if (timer.repeat !== "never") timer.anchor = targetTime;
    return { timer: timer };
  }

  /*
   * Apply an edit to an existing timer, recomputing the target. Editing a
   * duration measures from `now` again (a fresh countdown), which matches what
   * a person means when they change "45 minutes" to "20 minutes".
   */
  function applyEdit(timer, input, now) {
    now = typeof now === "number" ? now : Date.now();
    var built = create(
      {
        name: input.name,
        targetTime: input.targetTime,
        durationMs: input.durationMs,
        sound: input.sound,
        repeat: input.repeat,
        tags: input.tags,
      },
      now
    );
    if (built.error) return built;
    // Identity is preserved across edits; createdAt is reset by create() so
    // the progress bar reflects the new countdown.
    built.timer.id = timer.id;
    return built;
  }

  /* ---------- recurrence ---------- */

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  /*
   * The k-th occurrence after `anchor`, in local wall-clock time (so a daily
   * 09:00 stays 09:00 across a DST change). Months and years clamp to the
   * last valid day: Jan 31 monthly -> Feb 28/29, Feb 29 yearly -> Feb 28.
   */
  function occurrence(anchor, repeat, k) {
    var d = new Date(anchor);
    var y = d.getFullYear();
    var m = d.getMonth();
    var day = d.getDate();
    var h = d.getHours();
    var mi = d.getMinutes();
    var s = d.getSeconds();
    var ms = d.getMilliseconds();
    if (repeat === "daily") return new Date(y, m, day + k, h, mi, s, ms).getTime();
    if (repeat === "weekly") return new Date(y, m, day + 7 * k, h, mi, s, ms).getTime();
    if (repeat === "monthly") {
      var total = m + k;
      y += Math.floor(total / 12);
      m = ((total % 12) + 12) % 12;
    } else if (repeat === "yearly") {
      y += k;
    } else {
      return anchor;
    }
    return new Date(y, m, Math.min(day, daysInMonth(y, m)), h, mi, s, ms).getTime();
  }

  // The longest one step can be (plus an hour for DST), used to jump close to
  // `now` without looping over years of missed daily occurrences.
  var MAX_STEP = {
    daily: 25 * 3600 * 1000,
    weekly: (7 * 24 + 1) * 3600 * 1000,
    monthly: (31 * 24 + 1) * 3600 * 1000,
    yearly: (366 * 24 + 1) * 3600 * 1000,
  };

  /*
   * Roll a recurring timer forward to its first occurrence after `now`.
   * createdAt becomes the occurrence just before it, so the progress bar
   * measures the current period. Non-recurring or still-running timers come
   * back unchanged.
   */
  function rollForward(timer, now) {
    now = typeof now === "number" ? now : Date.now();
    if (!isRecurring(timer) || timer.targetTime > now) return timer;
    var repeat = normalizeRepeat(timer.repeat);
    var anchor =
      typeof timer.anchor === "number" && isFinite(timer.anchor) && timer.anchor <= timer.targetTime
        ? timer.anchor
        : timer.targetTime;
    var k = Math.max(1, Math.floor((now - anchor) / MAX_STEP[repeat]));
    while (occurrence(anchor, repeat, k) <= now) k++;
    var next = {};
    for (var key in timer) {
      if (Object.prototype.hasOwnProperty.call(timer, key)) next[key] = timer[key];
    }
    next.anchor = anchor;
    next.targetTime = occurrence(anchor, repeat, k);
    next.createdAt = occurrence(anchor, repeat, k - 1);
    return next;
  }

  // Milliseconds left, floored at zero — the countdown never goes negative.
  function remaining(timer, now) {
    return Math.max(0, timer.targetTime - now);
  }

  function isExpired(timer, now) {
    return timer.targetTime - now <= 0;
  }

  // "active" | "soon" | "expired" — a single source of truth for state.
  function state(timer, now) {
    var left = timer.targetTime - now;
    if (left <= 0) return "expired";
    if (left <= SOON_MS) return "soon";
    return "active";
  }

  /*
   * Fraction elapsed across the whole interval (0..1) for the progress track.
   * Guards against a zero or negative span so we never divide by zero.
   */
  function progress(timer, now) {
    var span = timer.targetTime - timer.createdAt;
    if (span <= 0) return 1;
    var done = (now - timer.createdAt) / span;
    if (done < 0) return 0;
    if (done > 1) return 1;
    return done;
  }

  // Soonest target first, so whatever ends next is at the top.
  function sortForDisplay(timers) {
    return timers.slice().sort(function (a, b) {
      return a.targetTime - b.targetTime;
    });
  }

  // Distinct tags across all timers, alphabetical (for the filter bar).
  function allTags(timers) {
    var seen = {};
    var out = [];
    timers.forEach(function (t) {
      (t.tags || []).forEach(function (tag) {
        var key = tag.toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        out.push(tag);
      });
    });
    return out.sort(function (a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
  }

  function hasTag(timer, tag) {
    var key = String(tag).toLowerCase();
    return (timer.tags || []).some(function (t) {
      return t.toLowerCase() === key;
    });
  }

  return {
    SOON_MS: SOON_MS,
    DEFAULT_SOUND: DEFAULT_SOUND,
    REPEATS: REPEATS,
    newId: newId,
    create: create,
    applyEdit: applyEdit,
    normalizeRepeat: normalizeRepeat,
    isRecurring: isRecurring,
    parseTags: parseTags,
    occurrence: occurrence,
    rollForward: rollForward,
    allTags: allTags,
    hasTag: hasTag,
    remaining: remaining,
    isExpired: isExpired,
    state: state,
    progress: progress,
    sortForDisplay: sortForDisplay,
  };
})();
