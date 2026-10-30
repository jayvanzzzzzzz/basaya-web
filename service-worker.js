const CACHE = "basaya-offline-v1";
const OFFLINE_URL = new URL("./offline.html", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => (key.startsWith("basaya-offline-") || key.startsWith("basaya-student-offline-")) && key !== CACHE)
      .map((key) => caches.delete(key))
  )));
});

// Only navigations use the fallback. Firebase, lessons and
// authenticated responses are never stored in this service worker's cache.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(async () => {
    return (await caches.match(OFFLINE_URL)) || Response.error();
  }));
});
