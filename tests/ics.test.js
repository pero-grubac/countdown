import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.js";

const { ics } = load(["js/ics.js"]);
const NOW = Date.UTC(2026, 9, 23, 8, 0, 0);
const timer = {
  id: "abc-123",
  name: "Launch; v2, final\\notes",
  targetTime: Date.UTC(2026, 10, 1, 14, 30, 5),
  createdAt: NOW,
  sound: "chime",
  repeat: "never",
  tags: ["work", "big, launch"],
};
const lines = (text) => text.split("\r\n");
const unfold = (text) => lines(text.replace(/\r\n /g, ""));

test("formats instants as UTC date-times", () => {
  assert.equal(ics.formatUtc(Date.UTC(2026, 0, 5, 3, 4, 9)), "20260105T030409Z");
});

test("escapes TEXT values", () => {
  assert.equal(ics.escapeText("a\\b;c,d\ne\r\nf"), "a\\\\b\\;c\\,d\\ne\\nf");
});

test("builds a valid calendar with CRLF line endings", () => {
  const text = ics.build([timer], NOW);
  assert.ok(text.endsWith("\r\n"));
  assert.equal(/[^\r]\n/.test(text), false, "every newline is CRLF");
  const l = lines(text);
  assert.equal(l[0], "BEGIN:VCALENDAR");
  assert.ok(l.includes("VERSION:2.0"));
  assert.ok(l.some((x) => x.startsWith("PRODID:")));
  assert.ok(l.includes("UID:abc-123@countdown"));
  assert.ok(l.includes("DTSTAMP:20261023T080000Z"));
  assert.ok(l.includes("DTSTART:20261101T143005Z"));
  assert.ok(l.includes("SUMMARY:Launch\\; v2\\, final\\\\notes"));
  assert.ok(l.includes("CATEGORIES:work,big\\, launch"));
  assert.ok(l.includes("TRIGGER:PT0S"));
  assert.equal(l.some((x) => x.startsWith("RRULE")), false);
  assert.equal(l[l.length - 2], "END:VCALENDAR");
  assert.equal(l[l.length - 1], "");
  const begins = l.filter((x) => x.startsWith("BEGIN:")).length;
  assert.equal(begins, l.filter((x) => x.startsWith("END:")).length);
});

test("one event per timer, with a fallback summary", () => {
  const text = ics.build([timer, { ...timer, id: "b", name: "", tags: [] }], NOW);
  assert.equal(lines(text).filter((x) => x === "BEGIN:VEVENT").length, 2);
  assert.ok(lines(text).includes("SUMMARY:Countdown"));
  assert.ok(lines(text).includes("UID:b@countdown"));
});

test("recurring timers get an RRULE that matches the app's clamping", () => {
  const r = (repeat, anchor) => ics.rrule({ ...timer, repeat, anchor, targetTime: anchor });
  assert.equal(r("never", timer.targetTime), null);
  assert.equal(r("daily", Date.UTC(2026, 0, 5)), "FREQ=DAILY");
  assert.equal(r("weekly", Date.UTC(2026, 0, 5)), "FREQ=WEEKLY");
  assert.equal(r("monthly", Date.UTC(2026, 0, 15)), "FREQ=MONTHLY");
  assert.equal(r("monthly", Date.UTC(2026, 0, 31, 12)), "FREQ=MONTHLY;BYMONTHDAY=31,-1;BYSETPOS=1");
  assert.equal(r("yearly", Date.UTC(2028, 1, 29, 12)), "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29,-1;BYSETPOS=1");
  assert.equal(r("yearly", Date.UTC(2026, 6, 4)), "FREQ=YEARLY");
  const text = ics.build([{ ...timer, repeat: "weekly", anchor: timer.targetTime }], NOW);
  assert.ok(lines(text).includes("RRULE:FREQ=WEEKLY"));
});

test("long lines are folded at 75 octets without splitting characters", () => {
  const name = "Ćevapi i pita ".repeat(12).trim();
  const text = ics.build([{ ...timer, name }], NOW);
  for (const l of lines(text)) assert.ok(Buffer.byteLength(l) <= 75, l);
  assert.ok(text.includes("\r\n "), "something was folded");
  assert.ok(unfold(text).includes("SUMMARY:" + name));
});

test("file names are safe slugs", () => {
  assert.equal(ics.fileName({ name: "Flight to Vienna!" }), "flight-to-vienna.ics");
  assert.equal(ics.fileName({ name: "Ćevapi u Sarajevu" }), "cevapi-u-sarajevu.ics");
  assert.equal(ics.fileName({ name: "" }), "countdown.ics");
});
