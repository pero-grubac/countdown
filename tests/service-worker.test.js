import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const sw = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const shell = [...sw.match(/(?:var|const) SHELL = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

test("every precached file exists", () => {
  for (const f of shell.filter((f) => f !== "./")) {
    assert.ok(existsSync(new URL("../" + f, import.meta.url)), `${f} is missing`);
  }
});

test("every script in js/ is precached", () => {
  for (const f of readdirSync(new URL("../js/", import.meta.url))) {
    assert.ok(shell.includes("js/" + f), `js/${f} is not in SHELL`);
  }
});
