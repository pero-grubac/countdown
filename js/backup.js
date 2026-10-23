/*
 * backup.js — export the timer list as JSON and import it back.
 *
 * Imported records go through the same validation and normalisation as
 * localStorage (CD.storage.sanitize), so a hand-edited or old backup can't
 * put a malformed timer into the app. Import merges by id: unknown ids are
 * added, known ids are replaced.
 */
window.CD = window.CD || {};

CD.backup = (function () {
  "use strict";

  var FORMAT = "countdown-backup";
  var VERSION = 1;

  function serialize(timers, now) {
    return JSON.stringify(
      {
        format: FORMAT,
        version: VERSION,
        exportedAt: new Date(typeof now === "number" ? now : Date.now()).toISOString(),
        timers: CD.storage.sanitize(timers),
      },
      null,
      2
    );
  }

  /*
   * Accepts a backup file ({ format, timers: [...] }) or a bare array of
   * timers. Returns { timers, skipped } or { error } — never throws.
   */
  function parse(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { error: "That file isn't valid JSON." };
    }
    var list = Array.isArray(data) ? data : data && Array.isArray(data.timers) ? data.timers : null;
    if (!list) return { error: "No timers found in that file." };
    var timers = CD.storage.sanitize(list);
    if (list.length && !timers.length) return { error: "No valid timers found in that file." };
    return { timers: timers, skipped: list.length - timers.length };
  }

  // Merge `incoming` into `existing` by id, keeping the existing order.
  function merge(existing, incoming) {
    var byId = {};
    incoming.forEach(function (t) {
      byId[t.id] = t;
    });
    var updated = 0;
    var timers = existing.map(function (t) {
      if (!Object.prototype.hasOwnProperty.call(byId, t.id)) return t;
      updated++;
      var next = byId[t.id];
      delete byId[t.id];
      return next;
    });
    var added = 0;
    incoming.forEach(function (t) {
      if (Object.prototype.hasOwnProperty.call(byId, t.id) && byId[t.id] === t) {
        timers.push(t);
        delete byId[t.id];
        added++;
      }
    });
    return { timers: timers, added: added, updated: updated };
  }

  // "2 added, 1 updated" — for the toast after an import.
  function summary(result) {
    var parts = [];
    parts.push(result.added + " added");
    parts.push(result.updated + " updated");
    if (result.skipped) parts.push(result.skipped + " skipped");
    return "Imported: " + parts.join(", ") + ".";
  }

  return { serialize: serialize, parse: parse, merge: merge, summary: summary };
})();
