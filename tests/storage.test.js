import { test } from "node:test";
import assert from "node:assert/strict";
import { load, memoryStorage, plain } from "./helpers.js";

const KEY = "countdown.timers.v1";
const good = { id: "a", name: "A", targetTime: 2000, createdAt: 1000, sound: "bell", repeat: "never", tags: [] };

test("timers round-trip through storage", () => {
  const { storage } = load(["js/storage.js"]);
  assert.equal(storage.saveTimers([good]), true);
  assert.deepEqual(plain(storage.getTimers()), [good]);
});

test("malformed records are dropped and corrupt JSON is cleared", () => {
  const ls = memoryStorage();
  const { storage } = load(["js/storage.js"], { localStorage: ls });
  ls.setItem(KEY, JSON.stringify([good, { id: "b" }, null, "x"]));
  assert.equal(storage.getTimers().length, 1);
  ls.setItem(KEY, "{oops");
  assert.equal(storage.getTimers().length, 0);
  assert.equal(ls.getItem(KEY), null);
});

test("deleteTimer removes by id", () => {
  const { storage } = load(["js/storage.js"]);
  storage.saveTimers([good, { ...good, id: "b" }]);
  storage.deleteTimer("a");
  assert.deepEqual(plain(storage.getTimers().map((t) => t.id)), ["b"]);
});

test("settings fall back to defaults and ignore junk", () => {
  const ls = memoryStorage();
  const { storage } = load(["js/storage.js"], { localStorage: ls });
  const defaults = plain(storage.getSettings());
  ls.setItem("countdown.settings.v1", JSON.stringify({ sound: "yes", timeFormat: "13" }));
  assert.deepEqual(plain(storage.getSettings()), defaults);
  storage.saveSettings({ sound: false, confetti: true, notify: false, timeFormat: "12" });
  assert.equal(storage.getSettings().timeFormat, "12");
});

test("blocked storage degrades instead of throwing", () => {
  const fail = () => {
    throw new Error("blocked");
  };
  const { storage } = load(["js/storage.js"], {
    localStorage: { getItem: fail, setItem: fail, removeItem: fail },
  });
  assert.equal(storage.isAvailable(), false);
  assert.equal(storage.getTimers().length, 0);
  assert.equal(storage.saveTimers([good]), false);
});

test("records from before repeat and tags load as one-off and untagged", () => {
  const ls = memoryStorage();
  const { storage } = load(["js/storage.js"], { localStorage: ls });
  ls.setItem(KEY, JSON.stringify([{ id: "old", name: "Old", targetTime: 5000, createdAt: 1000, sound: "bell" }]));
  assert.deepEqual(plain(storage.getTimers()), [
    { id: "old", name: "Old", targetTime: 5000, createdAt: 1000, sound: "bell", repeat: "never", tags: [] },
  ]);
});

test("repeat, anchor and tags are validated", () => {
  const { storage } = load(["js/storage.js"]);
  const n = (t) => plain(storage.normalize({ id: "x", targetTime: 9000, ...t }));
  assert.equal(n({ repeat: "hourly" }).repeat, "never");
  assert.equal("anchor" in n({ repeat: "never", anchor: 1 }), false);
  assert.equal(n({ repeat: "monthly" }).anchor, 9000);
  assert.equal(n({ repeat: "monthly", anchor: 4000 }).anchor, 4000);
  assert.equal(n({ repeat: "monthly", anchor: 99999 }).anchor, 9000, "an anchor after the target is ignored");
  assert.deepEqual(n({ tags: [" a ", "A", 7, "", "b"] }).tags, ["a", "b"]);
  assert.deepEqual(n({ tags: "a,b" }).tags, []);
});

test("the tag filter is remembered", () => {
  const { storage } = load(["js/storage.js"]);
  assert.equal(storage.getFilter(), "");
  storage.saveFilter("work");
  assert.equal(storage.getFilter(), "work");
  storage.saveFilter("");
  assert.equal(storage.getFilter(), "");
});
