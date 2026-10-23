import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./helpers.js";

const { format } = load(["js/format.js"]);
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;

test("breakdown splits a span into whole units", () => {
  assert.deepEqual(plain(format.breakdown(2 * D + 3 * H + 4 * M + 5 * S + 999)), {
    days: 2, hours: 3, minutes: 4, seconds: 5, totalSeconds: 2 * 86400 + 3 * 3600 + 4 * 60 + 5,
  });
});

test("breakdown never goes negative", () => {
  assert.equal(format.breakdown(-5000).totalSeconds, 0);
});

test("segments start at the largest non-zero unit", () => {
  const units = (ms) => format.segments(ms).map((s) => s.unit).join("");
  assert.equal(units(3 * D), "dhms");
  assert.equal(units(2 * H), "hms");
  assert.equal(units(15 * M), "ms");
  assert.equal(units(42 * S), "s");
  assert.equal(units(0), "s");
});

test("segments are zero-padded", () => {
  assert.deepEqual(plain(format.segments(5 * M + 7 * S)), [
    { value: "05", unit: "m" },
    { value: "07", unit: "s" },
  ]);
});

test("spoken text pluralises and drops seconds past an hour", () => {
  assert.equal(format.spoken(0), "Expired");
  assert.equal(format.spoken(1 * M + 1 * S), "1 minute, 1 second remaining");
  assert.equal(format.spoken(2 * H + 30 * S), "2 hours remaining");
  assert.equal(format.spoken(1 * D + 1 * H), "1 day, 1 hour remaining");
});

test("target reads naturally for today, tomorrow and later dates", () => {
  format.setClockMode("24");
  const now = new Date(2026, 4, 10, 9, 0).getTime();
  assert.equal(format.target(new Date(2026, 4, 10, 15, 4).getTime(), now), "Ends today, 15:04");
  assert.equal(format.target(new Date(2026, 4, 11, 9, 0).getTime(), now), "Ends tomorrow, 09:00");
  assert.equal(format.target(new Date(2026, 4, 16, 12, 0).getTime(), now), "Ends Sat 16 May, 12:00");
  assert.equal(format.target(new Date(2027, 0, 2, 8, 30).getTime(), now), "Ends Sat 2 Jan 2027, 08:30");
});

test("12-hour clock mode", () => {
  format.setClockMode("12");
  const now = new Date(2026, 4, 10, 9, 0).getTime();
  assert.match(format.target(new Date(2026, 4, 10, 15, 4).getTime(), now), /^Ends today, 03:04\sPM$/);
  format.setClockMode("24");
});
