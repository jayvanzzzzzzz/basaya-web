importScripts("./offline-shell.js");
const CACHE = `basaya-offline-v2-${self.BASAYA_VERSION}`;
const SDK_CACHE = "basaya-sdk-v2";
const root = self.registration.scope;
const OFFLINE_URL = new URL("offline.html", root).href;
const studentURL = new URL("student/", root).href;
const shell = new Set(self.BASAYA_SHELL.map((path) => new URL(path, root).href));

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([...shell]);
    const sdk = await caches.open(SDK_CACHE);
    const visited = new Set();
    async function module(url) {
      if (visited.has(url)) return;
      visited.add(url);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`SDK download failed: ${url}`);
      const source = await response.clone().text();
      await sdk.put(url, response);
      const dependencies = [...source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)]
        .filter((match) => /^(https:\/\/|\.\.?\/)/.test(match[1]))
        .map((match) => new URL(match[1], url).href)
        .filter((value) => value.startsWith("https://www.gstatic.com/firebasejs/"));
      await Promise.all(dependencies.map(module));
    }
    await Promise.all(self.BASAYA_SDK.map(module));
    await cache.put(new URL(".offline-ready", root), new Response("ready"));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => (key.startsWith("basaya-offline-") || key.startsWith("basaya-student-offline-") || key.startsWith("basaya-sdk-")) && ![CACHE, SDK_CACHE].includes(key))
      .map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});

// Cache only public shell assets and Firebase ESM code, never authenticated API responses.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const clean = url.origin + url.pathname;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      // The shared manifest starts at the site root. Redirect so the student
      // shell keeps the correct base URL for its relative scripts and links.
      if (clean === root) return Response.redirect(studentURL, 302);
      const cache = await caches.open(CACHE);
      const fallback = clean === studentURL || clean === `${studentURL}index.html`
        ? new URL("student/index.html", root).href : OFFLINE_URL;
      return (await cache.match(fallback)) || Response.error();
    }));
  } else if (shell.has(clean)) {
    event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(clean)) || fetch(request)));
  } else if (url.origin === "https://www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    event.respondWith(caches.open(SDK_CACHE).then(async (cache) => (await cache.match(request)) || fetch(request)));
  }
});
