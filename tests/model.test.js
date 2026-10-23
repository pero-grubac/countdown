import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.js";

const { model } = load(["js/model.js"]);
const NOW = 1_800_000_000_000;

test("create from a duration measures from now", () => {
  const { timer } = model.create({ name: "  Tea  ", durationMs: 5 * 60_000 }, NOW);
  assert.equal(timer.name, "Tea");
  assert.equal(timer.targetTime, NOW + 300_000);
  assert.equal(timer.createdAt, NOW);
  assert.equal(timer.sound, model.DEFAULT_SOUND);
  assert.ok(timer.id);
});

test("create rejects bad input without throwing", () => {
  assert.ok(model.create({ durationMs: 0 }, NOW).error);
  assert.ok(model.create({ durationMs: NaN }, NOW).error);
  assert.ok(model.create({ targetTime: NOW - 1 }, NOW).error);
  assert.ok(model.create({}, NOW).error);
});

test("applyEdit keeps the id and restarts the interval", () => {
  const { timer } = model.create({ name: "A", durationMs: 60_000 }, NOW);
  const edited = model.applyEdit(timer, { name: "B", durationMs: 120_000 }, NOW + 10_000).timer;
  assert.equal(edited.id, timer.id);
  assert.equal(edited.name, "B");
  assert.equal(edited.createdAt, NOW + 10_000);
  assert.equal(edited.targetTime, NOW + 130_000);
});

test("state moves from active to soon to expired", () => {
  const t = { targetTime: NOW + 5 * 60_000, createdAt: NOW };
  assert.equal(model.state(t, NOW), "active");
  assert.equal(model.state(t, t.targetTime - model.SOON_MS), "soon");
  assert.equal(model.state(t, t.targetTime), "expired");
  assert.equal(model.remaining(t, t.targetTime + 1000), 0);
});

test("progress is clamped to 0..1 and survives a zero span", () => {
  const t = { targetTime: NOW + 1000, createdAt: NOW };
  assert.equal(model.progress(t, NOW - 500), 0);
  assert.equal(model.progress(t, NOW + 500), 0.5);
  assert.equal(model.progress(t, NOW + 5000), 1);
  assert.equal(model.progress({ targetTime: NOW, createdAt: NOW }, NOW), 1);
});

test("sortForDisplay puts the soonest first without mutating", () => {
  const list = [{ targetTime: 3 }, { targetTime: 1 }, { targetTime: 2 }];
  assert.deepEqual(model.sortForDisplay(list).map((t) => t.targetTime), [1, 2, 3]);
  assert.equal(list[0].targetTime, 3);
});

const at = (y, m, d, h = 9, min = 0) => new Date(y, m, d, h, min).getTime();
const day = (ms) => {
  const d = new Date(ms);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
};

test("create stores repeat, tags and an anchor for recurring timers", () => {
  const { timer } = model.create({ targetTime: NOW + 1000, repeat: "weekly", tags: " work, Home ,work,," }, NOW);
  assert.equal(timer.repeat, "weekly");
  assert.deepEqual([...timer.tags], ["work", "Home"]);
  assert.equal(timer.anchor, NOW + 1000);
  const once = model.create({ durationMs: 1000, repeat: "hourly" }, NOW).timer;
  assert.equal(once.repeat, "never");
  assert.equal("anchor" in once, false);
  assert.deepEqual([...once.tags], []);
});

test("applyEdit carries repeat and tags and re-anchors", () => {
  const { timer } = model.create({ durationMs: 60_000, repeat: "daily", tags: "a" }, NOW);
  const edited = model.applyEdit(timer, { durationMs: 120_000, repeat: "monthly", tags: "b, c" }, NOW + 5).timer;
  assert.equal(edited.id, timer.id);
  assert.equal(edited.repeat, "monthly");
  assert.equal(edited.anchor, NOW + 120_005);
  assert.deepEqual([...edited.tags], ["b", "c"]);
});

test("parseTags trims, dedupes ignoring case and caps length and count", () => {
  assert.deepEqual([...model.parseTags("Work, work ,  deep   focus ")], ["Work", "deep focus"]);
  assert.equal(model.parseTags("x".repeat(40))[0].length, 24);
  assert.equal(model.parseTags("a,b,c,d,e,f,g,h,i,j").length, 8);
  assert.deepEqual([...model.parseTags(["a", 3, null, "A"])], ["a"]);
  assert.deepEqual([...model.parseTags(undefined)], []);
});

test("daily and weekly keep the wall-clock time", () => {
  const a = at(2026, 2, 28, 9, 30);
  assert.deepEqual(day(model.occurrence(a, "daily", 1)), [2026, 3, 29, 9, 30]);
  assert.deepEqual(day(model.occurrence(a, "weekly", 2)), [2026, 4, 11, 9, 30]);
});

test("monthly on the 31st clamps to the last day and comes back", () => {
  const a = at(2026, 0, 31);
  assert.deepEqual(day(model.occurrence(a, "monthly", 1)), [2026, 2, 28, 9, 0]);
  assert.deepEqual(day(model.occurrence(a, "monthly", 2)), [2026, 3, 31, 9, 0]);
  assert.deepEqual(day(model.occurrence(a, "monthly", 3)), [2026, 4, 30, 9, 0]);
  assert.deepEqual(day(model.occurrence(at(2027, 11, 31), "monthly", 2)), [2028, 2, 29, 9, 0]);
  assert.deepEqual(day(model.occurrence(at(2026, 10, 15), "monthly", 14)), [2028, 1, 15, 9, 0]);
});

test("yearly on Feb 29 falls on Feb 28 in non-leap years", () => {
  const a = at(2028, 1, 29);
  assert.deepEqual(day(model.occurrence(a, "yearly", 1)), [2029, 2, 28, 9, 0]);
  assert.deepEqual(day(model.occurrence(a, "yearly", 4)), [2032, 2, 29, 9, 0]);
});

test("rollForward moves to the next occurrence and restarts progress", () => {
  const a = at(2026, 0, 31);
  const t = { id: "r", targetTime: a, createdAt: a - 1000, repeat: "monthly", anchor: a, tags: [] };
  const rolled = model.rollForward(t, a);
  assert.deepEqual(day(rolled.targetTime), [2026, 2, 28, 9, 0]);
  assert.equal(rolled.createdAt, a);
  assert.equal(rolled.id, "r");
  assert.equal(t.targetTime, a, "the input is not mutated");
  const again = model.rollForward(rolled, rolled.targetTime);
  assert.deepEqual(day(again.targetTime), [2026, 3, 31, 9, 0]);
});

test("rollForward skips every missed occurrence", () => {
  const a = at(2020, 0, 1);
  const t = { id: "d", targetTime: a, createdAt: a, repeat: "daily", anchor: a };
  const now = at(2026, 5, 15, 12);
  const rolled = model.rollForward(t, now);
  assert.deepEqual(day(rolled.targetTime), [2026, 6, 16, 9, 0]);
  assert.deepEqual(day(rolled.createdAt), [2026, 6, 15, 9, 0]);
});

test("rollForward leaves one-off and running timers alone", () => {
  const once = { id: "o", targetTime: NOW, createdAt: NOW - 1, repeat: "never" };
  assert.equal(model.rollForward(once, NOW + 1), once);
  const legacy = { id: "l", targetTime: NOW, createdAt: NOW - 1 };
  assert.equal(model.rollForward(legacy, NOW + 1), legacy);
  const running = { id: "x", targetTime: NOW + 10, createdAt: NOW, repeat: "daily" };
  assert.equal(model.rollForward(running, NOW), running);
});

test("rollForward without an anchor uses the current target", () => {
  const a = at(2026, 4, 10);
  const rolled = model.rollForward({ id: "y", targetTime: a, createdAt: a, repeat: "yearly" }, a + 1);
  assert.deepEqual(day(rolled.targetTime), [2027, 5, 10, 9, 0]);
  assert.equal(rolled.anchor, a);
});

test("allTags is sorted and, like hasTag, ignores case", () => {
  const list = [{ tags: ["Work"] }, { tags: ["work", "home"] }, {}];
  assert.deepEqual([...model.allTags(list)], ["home", "Work"]);
  assert.equal(model.hasTag(list[1], "WORK"), true);
  assert.equal(model.hasTag(list[2], "work"), false);
});
