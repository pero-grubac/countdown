import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./helpers.js";

const { backup, storage } = load(["js/storage.js", "js/backup.js"]);
const a = { id: "a", name: "A", targetTime: 2000, createdAt: 1000, sound: "bell", repeat: "never", tags: [] };
const b = { id: "b", name: "B", targetTime: 3000, createdAt: 1000, sound: "chime", repeat: "daily", anchor: 3000, tags: ["work"] };

test("serialize and parse round-trip the timers", () => {
  const text = backup.serialize([a, b], Date.UTC(2026, 0, 1));
  const data = JSON.parse(text);
  assert.equal(data.format, "countdown-backup");
  assert.equal(data.version, 1);
  assert.equal(data.exportedAt, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(plain(backup.parse(text)), { timers: [a, b], skipped: 0 });
});

test("parse accepts a bare array and normalises old records", () => {
  const result = backup.parse(JSON.stringify([{ id: "old", targetTime: 5000 }]));
  assert.deepEqual(plain(result.timers), [
    { id: "old", name: "", targetTime: 5000, createdAt: 5000, sound: "chime", repeat: "never", tags: [] },
  ]);
});

test("parse drops invalid records and counts them", () => {
  const result = backup.parse(JSON.stringify({ timers: [a, { id: "" }, { id: "x", targetTime: "soon" }, null] }));
  assert.deepEqual(plain(result.timers), [a]);
  assert.equal(result.skipped, 3);
});

test("parse rejects files that aren't backups", () => {
  assert.ok(backup.parse("{nope").error);
  assert.ok(backup.parse("42").error);
  assert.ok(backup.parse(JSON.stringify({ hello: "world" })).error);
  assert.ok(backup.parse(JSON.stringify({ timers: [{ id: 1 }, "x"] })).error);
  assert.deepEqual(plain(backup.parse(JSON.stringify({ timers: [] }))), { timers: [], skipped: 0 });
});

test("merge adds new ids and replaces known ones, keeping order", () => {
  const renamed = { ...a, name: "A2" };
  const c = { ...a, id: "c" };
  const result = backup.merge([a, b], [c, renamed]);
  assert.deepEqual(plain(result.timers.map((t) => t.id)), ["a", "b", "c"]);
  assert.equal(result.timers[0].name, "A2");
  assert.equal(result.added, 1);
  assert.equal(result.updated, 1);
});

test("merge handles duplicate ids inside the import", () => {
  const result = backup.merge([], [a, { ...a, name: "last" }]);
  assert.equal(result.timers.length, 1);
  assert.equal(result.timers[0].name, "last");
  assert.equal(result.added, 1);
});

test("summary reads naturally", () => {
  assert.equal(backup.summary({ added: 2, updated: 1, skipped: 0 }), "Imported: 2 added, 1 updated.");
  assert.equal(backup.summary({ added: 0, updated: 0, skipped: 3 }), "Imported: 0 added, 0 updated, 3 skipped.");
});

test("an imported list survives a save and reload", () => {
  const { timers } = backup.parse(backup.serialize([a, b]));
  assert.equal(storage.saveTimers(timers), true);
  assert.deepEqual(plain(storage.getTimers()), [a, b]);
});
