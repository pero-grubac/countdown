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

  /* ---------- recurring timers ---------- */

  // Move every recurring timer that has reached zero on to its next
  // occurrence. Runs right after a paint, so the card has already played its
  // alert for this one. Returns true if anything changed.
  function rollDue(now) {
    var changed = false;
    timers = timers.map(function (t) {
      var next = model.rollForward(t, now);
      if (next !== t) changed = true;
      return next;
    });
    if (changed) commit();
    return changed;
  }

  /* ---------- calendar + backup ---------- */

  // One timer (from its card) or all of them (from Settings).
  function handleExportCalendar(id) {
    var list = id ? [find(id)].filter(Boolean) : model.sortForDisplay(timers);
    if (!list.length) {
      ui.toast("There are no countdowns to export yet.");
      return;
    }
    var name = id ? CD.ics.fileName(list[0]) : "countdowns.ics";
    ui.download(name, "text/calendar;charset=utf-8", CD.ics.build(list, Date.now()));
  }

  function handleExportBackup() {
    var day = new Date().toISOString().slice(0, 10);
    ui.download(
      "countdown-backup-" + day + ".json",
      "application/json",
      CD.backup.serialize(timers, Date.now())
    );
  }

  function handleImportBackup(text) {
    var parsed = CD.backup.parse(text);
    if (parsed.error) {
      ui.toast(parsed.error);
      return;
    }
    var result = CD.backup.merge(timers, parsed.timers);
    result.skipped = parsed.skipped;
    timers = result.timers;
    commit();
    rollDue(Date.now());
    ui.toast(CD.backup.summary(result));
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
      rollDue(now);
    }
    window.requestAnimationFrame(frame);
  }

  // requestAnimationFrame is throttled/paused when the tab is hidden, so force
  // an immediate, correct repaint the instant we're visible or refocused again.
  function forceTick() {
    lastPaint = 0;
    var now = Date.now();
    ui.tick(now);
    rollDue(now);
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
      onExportCalendar: handleExportCalendar,
      onExportBackup: handleExportBackup,
      onImportBackup: handleImportBackup,
      initialFilter: storage.getFilter(),
      onFilterChange: function (tag) {
        storage.saveFilter(tag);
      },
    });

    if (!storage.isAvailable()) ui.showStorageWarning();

    load();
    // Recurring timers that ended while the app was closed start over quietly.
    timers = timers.map(function (t) {
      return model.rollForward(t, Date.now());
    });
    persist();
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
      timers.push(model.rollForward(shared, Date.now()));
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
