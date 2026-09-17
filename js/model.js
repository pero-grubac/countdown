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

  function newId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "t_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  /*
   * Build a timer record. `input` is one of:
   *   { name, targetTime }                       // an absolute instant
   *   { name, durationMs }                       // relative to `now`
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

    return {
      timer: {
        id: newId(),
        name: name,
        targetTime: targetTime,
        createdAt: now,
        sound: sound,
      },
    };
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
      },
      now
    );
    if (built.error) return built;
    return {
      timer: {
        id: timer.id, // identity is preserved across edits
        name: built.timer.name,
        targetTime: built.timer.targetTime,
        // Reset the interval so the progress bar reflects the new countdown.
        createdAt: now,
        sound: built.timer.sound,
      },
    };
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

  // Newest target first keeps imminent and long-range timers grouped sensibly.
  function sortForDisplay(timers) {
    return timers.slice().sort(function (a, b) {
      return a.targetTime - b.targetTime;
    });
  }

  return {
    SOON_MS: SOON_MS,
    DEFAULT_SOUND: DEFAULT_SOUND,
    newId: newId,
    create: create,
    applyEdit: applyEdit,
    remaining: remaining,
    isExpired: isExpired,
    state: state,
    progress: progress,
    sortForDisplay: sortForDisplay,
  };
})();
