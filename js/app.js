/*
 * app.js — the controller. Holds the timer list, wires UI callbacks to the
 * model and storage, and drives the redraw loop.
 *
 * The loop's only job is to decide WHEN to repaint. WHAT to paint is always
 * derived from targetTime - Date.now(), so the display is correct after a
 * refresh, after the tab is frozen, or after the device has been offline.
 */
(function () {
  "use strict";

  var storage = CD.storage;
  var model = CD.model;
  var ui = CD.ui;

  var timers = [];
  var settings = storage.getSettings();
  var notifyTimeouts = {}; // timer id -> setTimeout handle

  /* ---------- data operations ---------- */

  function load() {
    timers = storage.getTimers();
  }

  function persist() {
    storage.saveTimers(timers);
  }

  function repaint() {
    ui.render(timers, Date.now());
  }

  /* ---------- background notifications ---------- */

  // Delivery is best-effort: hidden tabs throttle timers, so a notification may
  // arrive late. The on-screen sound/confetti still fire from the paint loop.
  var MAX_DELAY = 2147483000; // setTimeout overflows past ~24.8 days.

  function clearScheduled() {
    Object.keys(notifyTimeouts).forEach(function (id) {
      clearTimeout(notifyTimeouts[id]);
    });
    notifyTimeouts = {};
  }

  function scheduleNotifications() {
    clearScheduled();
    if (!settings.notify || CD.notify.permission() !== "granted") return;
    var now = Date.now();
    timers.forEach(function (t) {
      var delay = t.targetTime - now;
      if (delay <= 0 || delay > MAX_DELAY) return;
      notifyTimeouts[t.id] = setTimeout(function () {
        if (!settings.notify || CD.notify.permission() !== "granted") return;
        var title = t.name ? t.name + " has ended" : "Countdown finished";
        CD.notify.show("\u23F0 " + title, "Your countdown reached zero.", t.id);
      }, delay);
    });
  }

  // Persist, repaint, and re-arm background notifications after any change.
  function commit() {
    persist();
    repaint();
    scheduleNotifications();
  }

  function handleNew() {
    ui.openCreate();
  }

  function handleEdit(id) {
    var t = find(id);
    if (t) ui.openEdit(t);
  }

  function handleDelete(id) {
    timers = timers.filter(function (t) {
      return t.id !== id;
    });
    commit();
  }

  // Returns { error } to keep the modal open, or null on success.
  function handleSubmit(input, editingId) {
    var now = Date.now();
    if (editingId) {
      var existing = find(editingId);
      if (!existing) return { error: "That countdown no longer exists." };
      var edited = model.applyEdit(existing, input, now);
      if (edited.error) return { error: edited.error };
      timers = timers.map(function (t) {
        return t.id === editingId ? edited.timer : t;
      });
    } else {
      var built = model.create(input, now);
      if (built.error) return { error: built.error };
      timers.push(built.timer);
    }
    commit();
    return null;
  }

  function find(id) {
    return timers.filter(function (t) {
      return t.id === id;
    })[0];
  }

  /* ---------- redraw loop ---------- */

  var lastPaint = 0;

  function frame() {
    var now = Date.now();
    // ~4 fps is plenty for a seconds display and keeps the main thread idle.
    if (now - lastPaint >= 250) {
      lastPaint = now;
      ui.tick(now);
    }
    window.requestAnimationFrame(frame);
  }

  // requestAnimationFrame is throttled/paused when the tab is hidden, so force
  // an immediate, correct repaint the instant we're visible or refocused again.
  function forceTick() {
    lastPaint = 0;
    ui.tick(Date.now());
  }

  /* ---------- startup ---------- */

  function start() {
    ui.init({
      onNew: handleNew,
      onEdit: handleEdit,
      onDelete: handleDelete,
      onSubmit: handleSubmit,
      initialSettings: settings,
      onSettingsChange: function (s) {
        settings = s;
        storage.saveSettings(s);
        scheduleNotifications();
      },
      onRefresh: repaint,
    });

    if (!storage.isAvailable()) ui.showStorageWarning();

    load();
    repaint();
    scheduleNotifications();
    maybeImportShared();

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) forceTick();
    });
    window.addEventListener("focus", forceTick);
    window.addEventListener("pageshow", forceTick);

    window.requestAnimationFrame(frame);
    registerServiceWorker();
  }

  // If the page was opened from a share link, import that countdown once.
  function maybeImportShared() {
    var shared = CD.share.decode(location.hash);
    if (!shared) return;
    // Drop the hash so a refresh doesn't re-import (and the link looks clean).
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch (e) {}
    var exists = timers.some(function (t) {
      return t.id === shared.id;
    });
    if (!exists) {
      timers.push(shared);
      commit();
    }
    ui.flashShared(shared);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    // Relative path so it works from a GitHub Pages project subpath.
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("service-worker.js").catch(function () {
        // Offline support is a bonus; the app is fully functional without it.
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
