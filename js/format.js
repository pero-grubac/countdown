/*
 * format.js — pure functions that turn numbers and dates into display text.
 *
 * Nothing here reads the clock or the DOM; everything takes its inputs as
 * arguments, which keeps it trivial to reason about and to test.
 */
window.CD = window.CD || {};

CD.format = (function () {
  "use strict";

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  // Break a millisecond span into whole d / h / m / s components.
  function breakdown(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    return {
      days: Math.floor(total / 86400),
      hours: Math.floor((total % 86400) / 3600),
      minutes: Math.floor((total % 3600) / 60),
      seconds: total % 60,
      totalSeconds: total,
    };
  }

  /*
   * Produce the segments the card renders, e.g. [{value:"02",unit:"d"}, ...].
   * Sensible rule: start at the largest non-zero unit and go down to seconds,
   * so a 15-minute timer shows "14m 32s" rather than "00d 00h 14m 32s".
   */
  function segments(ms) {
    var b = breakdown(ms);
    var out = [];
    if (b.days > 0) {
      out.push({ value: pad2(b.days), unit: "d" });
      out.push({ value: pad2(b.hours), unit: "h" });
      out.push({ value: pad2(b.minutes), unit: "m" });
      out.push({ value: pad2(b.seconds), unit: "s" });
    } else if (b.hours > 0) {
      out.push({ value: pad2(b.hours), unit: "h" });
      out.push({ value: pad2(b.minutes), unit: "m" });
      out.push({ value: pad2(b.seconds), unit: "s" });
    } else if (b.minutes > 0) {
      out.push({ value: pad2(b.minutes), unit: "m" });
      out.push({ value: pad2(b.seconds), unit: "s" });
    } else {
      out.push({ value: pad2(b.seconds), unit: "s" });
    }
    return out;
  }

  // A spoken version for screen readers: "2 days, 14 hours, 32 minutes remaining".
  function spoken(ms) {
    var b = breakdown(ms);
    if (b.totalSeconds <= 0) return "Expired";
    var bits = [];
    function part(n, word) {
      if (n > 0) bits.push(n + " " + word + (n === 1 ? "" : "s"));
    }
    part(b.days, "day");
    part(b.hours, "hour");
    part(b.minutes, "minute");
    // Only mention seconds when the whole thing is under an hour, to avoid noise.
    if (b.days === 0 && b.hours === 0) part(b.seconds, "second");
    return bits.join(", ") + " remaining";
  }

  var dow = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function sameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  // Clock display mode: "24" | "12" | "auto" (follow the visitor's locale).
  var clockMode = "24";
  function setClockMode(m) {
    clockMode = m === "12" || m === "auto" ? m : "24";
  }

  // Local time as HH:MM, honoring the chosen clock mode.
  function clock(date) {
    try {
      var opts = { hour: "2-digit", minute: "2-digit" };
      if (clockMode === "24") {
        opts.hour12 = false;
        opts.hourCycle = "h23";
      } else if (clockMode === "12") {
        opts.hour12 = true;
      }
      return new Intl.DateTimeFormat(clockMode === "auto" ? undefined : "en-US", opts).format(
        date
      );
    } catch (e) {
      return pad2(date.getHours()) + ":" + pad2(date.getMinutes());
    }
  }

  /*
   * A friendly target description built around "now" so the common cases read
   * naturally: "Ends today, 15:04", "Ends tomorrow, 09:00",
   * otherwise "Ends Sat 20 Sep 2026, 12:00" (year dropped when it's this year).
   */
  function target(targetTime, now) {
    var d = new Date(targetTime);
    var ref = new Date(now);
    var tmr = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 1);
    var time = clock(d);

    if (sameDay(d, ref)) return "Ends today, " + time;
    if (sameDay(d, tmr)) return "Ends tomorrow, " + time;

    var label = dow[d.getDay()].slice(0, 3) + " " + d.getDate() + " " + mon[d.getMonth()];
    if (d.getFullYear() !== ref.getFullYear()) label += " " + d.getFullYear();
    return "Ends " + label + ", " + time;
  }

  return {
    pad2: pad2,
    breakdown: breakdown,
    segments: segments,
    spoken: spoken,
    target: target,
    setClockMode: setClockMode,
  };
})();
