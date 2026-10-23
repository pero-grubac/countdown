import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./helpers.js";

const { share } = load(["js/share.js"]);
const timer = {
  id: "x1",
  name: "Launch 🚀 Ćevapi",
  targetTime: 1_900_000_000_000,
  createdAt: 1_800_000_000_000,
  sound: "bell",
  repeat: "never",
  tags: [],
};
const hashOf = (obj) => "#c=" + Buffer.from(JSON.stringify(obj)).toString("base64url");

test("encode/decode round-trips a timer, including non-ASCII names", () => {
  assert.deepEqual(plain(share.decode(share.encode(timer))), timer);
});

test("the hash is URL-safe", () => {
  assert.match(share.encode(timer), /^#c=[A-Za-z0-9_-]+$/);
});

test("url uses the current page as the base", () => {
  assert.ok(share.url(timer).startsWith("https://example.test/countdown/#c="));
});

test("decode rejects missing or broken payloads", () => {
  assert.equal(share.decode(""), null);
  assert.equal(share.decode("#other=1"), null);
  assert.equal(share.decode("#c=not-base64!!"), null);
  assert.equal(share.decode(hashOf({ n: "no time" })), null);
});

test("decode fills sensible defaults", () => {
  assert.deepEqual(plain(share.decode(hashOf({ t: 123 }))), {
    id: "shared_123",
    name: "",
    targetTime: 123,
    createdAt: 123,
    sound: "chime",
    repeat: "never",
    tags: [],
  });
});

test("recurring timers carry their repeat rule and anchor", () => {
  const monthly = { ...timer, repeat: "monthly", anchor: 1_700_000_000_000 };
  assert.deepEqual(plain(share.decode(share.encode(monthly))), monthly);
  const fresh = { ...timer, repeat: "weekly", anchor: timer.targetTime };
  assert.deepEqual(plain(share.decode(share.encode(fresh))), fresh);
});

test("one-off links keep the old payload shape", () => {
  const payload = JSON.parse(Buffer.from(share.encode(timer).slice(3), "base64url").toString());
  assert.deepEqual(Object.keys(payload), ["id", "n", "t", "c", "s"]);
});

test("decode ignores an unknown repeat rule", () => {
  assert.equal(share.decode(hashOf({ t: 5, r: "hourly" })).repeat, "never");
  assert.equal(share.decode(hashOf({ t: 5, r: "daily", a: 9 })).anchor, 5);
});
