/*
 * service-worker.js — makes the app shell available offline.
 *
 * Strategy:
 *   - Precache the shell on install (relative URLs, so it works from any
 *     GitHub Pages subpath).
 *   - Navigations: try the network, fall back to the cached index.html so the
 *     app opens offline.
 *   - Same-origin assets: cache-first (they're versioned by CACHE name).
 *
 * Bump CACHE to ship an update; old caches are removed on activate.
 */
var CACHE = "countdown-v5";

var SHELL = [
  "./",
  "index.html",
  "styles.css",
  "js/storage.js",
  "js/format.js",
  "js/model.js",
  "js/sound.js",
  "js/confetti.js",
  "js/notify.js",
  "js/share.js",
  "js/ui.js",
  "js/app.js",
  "manifest.webmanifest",
  "favicon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // addAll is atomic; if one file 404s the install fails, so keep the list
      // to files we know exist and let other assets be cached on first fetch.
      return cache.addAll(SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          if (k !== CACHE) return caches.delete(k);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  // App navigations: network-first, cached shell as the offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match("index.html").then(function (r) {
          return r || caches.match("./");
        });
      })
    );
    return;
  }

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let cross-origin (fonts) pass through

  // Same-origin assets: serve from cache, then fill the cache in the background.
  event.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req)
        .then(function (res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) {
              c.put(req, copy);
            });
          }
          return res;
        })
        .catch(function () {
          return cached;
        });
      return cached || network;
    })
  );
});
