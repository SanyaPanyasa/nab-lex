/* Offline support: the game's files stay on the phone. Each launch is answered from the phone at once,
   while a fresh copy is fetched in the background, so a new version arrives on the following launch. */
const CACHE_PREFIX = "nab-lek-";
const CACHE = CACHE_PREFIX + "v9";
const GAME = "three.min.js";
const CORE = [
  "./", "index.html", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-192.png", "icons/maskable-512.png",
  "icons/apple-touch-icon.png", "icons/favicon-48.png",
  "icons/practice-creatures.webp",
];

async function cacheGame(cache) {
  const saved = await caches.match(GAME);
  if (saved) {
    await cache.put(GAME, saved);
    return;
  }
  const download = new AbortController();
  const timer = setTimeout(() => download.abort(), 5000);
  try {
    await cache.add(new Request(GAME, { cache: "reload", signal: download.signal }));
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("install", (event) => {
  const requests = CORE.map((path) => new Request(path, { cache: "reload" }));
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all([
      cache.addAll(requests),
      cacheGame(cache).catch(() => {}), // Practice updates even when 3D cannot be downloaded.
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const ours = url.origin === self.location.origin;
  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!ours && !fonts) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const page = request.mode === "navigate";
    const cached = await cache.match(request, { ignoreSearch: page });
    const fresh = fetch(request)
      .then((response) => {
        if (response && (response.ok || response.type === "opaque")) cache.put(request, response.clone());
        return response;
      })
      .catch(() => null);
    if (cached) {
      event.waitUntil(fresh);
      return cached;
    }
    const response = await fresh;
    if (response) return response;
    if (page) return (await cache.match("index.html")) || Response.error();
    return Response.error();
  })());
});
