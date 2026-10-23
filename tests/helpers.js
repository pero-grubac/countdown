// Loads the browser scripts (which attach to `window.CD`) into a sandbox so
// the pure modules can be tested in Node without a DOM.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);

export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

export function load(files, { localStorage = memoryStorage(), location } = {}) {
  // In a browser `window` is the global object, so the sandbox plays both roles.
  const window = {
    localStorage,
    crypto: globalThis.crypto,
    location: location || { origin: "https://example.test", pathname: "/countdown/" },
    btoa,
    atob,
    escape,
    unescape,
    Intl,
  };
  window.window = window;
  const sandbox = window;
  vm.createContext(sandbox);
  for (const f of files) {
    vm.runInContext(readFileSync(new URL(f, root), "utf8"), sandbox, { filename: f });
  }
  return window.CD;
}

// Objects created inside the sandbox have a different prototype; copy them so
// deepEqual compares plain data.
export const plain = (v) => JSON.parse(JSON.stringify(v));
