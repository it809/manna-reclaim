/* Manna Production Management — service worker
   Makes the app load with zero internet. Data sync (Supabase) still needs
   internet and is handled by the app's own offline queue, so this worker
   never caches those cross-origin calls.

   To push an app update to every tablet: bump CACHE_VERSION below
   (e.g. v1 -> v2) and re-host this file next to index.html. */

const CACHE_VERSION = "manna-pmm-v34";
const SHELL = ["./", "./index.html"];

/* Install: pre-cache the app shell so it works offline immediately. */
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

/* Activate: drop old caches and take control of open pages right away. */
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_VERSION; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  const req = event.request;

  /* Only handle GET. Let everything else (POST/PATCH to Supabase) go to network. */
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  /* Cross-origin (Supabase REST, anything not on this site): never intercept.
     Online -> works normally. Offline -> fails, and the app queues it. */
  if (url.origin !== self.location.origin) return;

  /* Page loads (navigations) + the HTML itself:
     NETWORK-FIRST so an online tablet always gets the latest app,
     with CACHE FALLBACK so an offline tablet still loads (no dino page). */
  const isHTML = req.mode === "navigate" ||
                 (req.headers.get("accept") || "").indexOf("text/html") !== -1;

  if (isHTML) {
    event.respondWith(
      fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(function (c) { c.put("./index.html", copy); });
        return res;
      }).catch(function () {
        return caches.match("./index.html").then(function (hit) {
          return hit || caches.match("./");
        });
      })
    );
    return;
  }

  /* Any other same-origin GET: cache-first, then network. */
  event.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        return res;
      });
    })
  );
});
