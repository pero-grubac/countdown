/*
 * ics.js — export countdowns as an iCalendar (.ics) file (RFC 5545).
 *
 * Pure string building, no DOM: the UI turns the result into a download.
 * Each timer becomes a zero-length VEVENT at its target instant (in UTC), with
 * a reminder at that moment and an RRULE when the timer repeats.
 */
window.CD = window.CD || {};

CD.ics = (function () {
  "use strict";

  var CRLF = "\r\n";
  var FREQ = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY" };

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  // 20261023T154500Z
  function formatUtc(ms) {
    var d = new Date(ms);
    return (
      d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) +
      "Z"
    );
  }

  // TEXT values: backslash, semicolon, comma and newlines must be escaped.
  function escapeText(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r\n|\r|\n/g, "\\n");
  }

  // UTF-8 length of one code point.
  function utf8Bytes(ch) {
    var c = ch.codePointAt(0);
    if (c < 0x80) return 1;
    if (c < 0x800) return 2;
    if (c < 0x10000) return 3;
    return 4;
  }

  // Lines longer than 75 octets are folded: CRLF plus one space, never in the
  // middle of a multi-byte character.
  function fold(line) {
    var out = "";
    var used = 0;
    var chars = Array.from(line);
    for (var i = 0; i < chars.length; i++) {
      var b = utf8Bytes(chars[i]);
      if (used + b > 75) {
        out += CRLF + " ";
        used = 1;
      }
      out += chars[i];
      used += b;
    }
    return out;
  }

  /*
   * The repeat rule. Months and years in the app clamp to the last valid day
   * (Jan 31 -> Feb 28), which RRULE expresses as "the anchor day, or the last
   * day of the month if that comes first": BYMONTHDAY=31,-1;BYSETPOS=1.
   */
  function rrule(timer) {
    var freq = FREQ[timer.repeat];
    if (!freq) return null;
    var rule = "FREQ=" + freq;
    var anchor = new Date(typeof timer.anchor === "number" ? timer.anchor : timer.targetTime);
    var day = anchor.getUTCDate();
    if (timer.repeat === "monthly" && day > 28) {
      rule += ";BYMONTHDAY=" + day + ",-1;BYSETPOS=1";
    } else if (timer.repeat === "yearly" && day > 28) {
      rule += ";BYMONTH=" + (anchor.getUTCMonth() + 1) + ";BYMONTHDAY=" + day + ",-1;BYSETPOS=1";
    }
    return rule;
  }

  function event(timer, stamp) {
    var title = timer.name || "Countdown";
    var lines = [
      "BEGIN:VEVENT",
      "UID:" + timer.id + "@countdown",
      "DTSTAMP:" + stamp,
      "DTSTART:" + formatUtc(timer.targetTime),
      "SUMMARY:" + escapeText(title),
    ];
    var rule = rrule(timer);
    if (rule) lines.push("RRULE:" + rule);
    if (timer.tags && timer.tags.length) {
      lines.push("CATEGORIES:" + timer.tags.map(escapeText).join(","));
    }
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:" + escapeText(title),
      "TRIGGER:PT0S",
      "END:VALARM",
      "END:VEVENT"
    );
    return lines;
  }

  // A complete calendar for one or more timers. `now` stamps DTSTAMP.
  function build(timers, now) {
    var stamp = formatUtc(typeof now === "number" ? now : Date.now());
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//pero-grubac//Countdown//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];
    (timers || []).forEach(function (t) {
      lines = lines.concat(event(t, stamp));
    });
    lines.push("END:VCALENDAR");
    return lines.map(fold).join(CRLF) + CRLF;
  }

  // "Flight to Vienna" -> "flight-to-vienna.ics"
  function fileName(timer) {
    var slug = String((timer && timer.name) || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    return (slug || "countdown") + ".ics";
  }

  return {
    build: build,
    fileName: fileName,
    formatUtc: formatUtc,
    escapeText: escapeText,
    fold: fold,
    rrule: rrule,
  };
})();
