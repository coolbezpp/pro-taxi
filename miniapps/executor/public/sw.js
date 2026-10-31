/* Про — GPS: service worker PWA (офлайн-оболочка страницы трекинга) */
const CACHE_NAME = "pro-gps-v1";
const SHELL = ["/executor/track.html", "/executor/manifest.json", "/executor/icon-192.png", "/executor/icon-512.png", "/executor/icon-maskable-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Кэшируем ТОЛЬКО оболочку GPS-приложения. Бандл миниаппа и API не трогаем:
  // их свежесть гарантирует сервер (no-store), а не SW — иначе миниапп мог бы
  // жить на старом бандле неделями.
  const p = url.pathname;
  const isShell =
    p === "/executor/track.html" ||
    p === "/executor/manifest.json" ||
    p === "/executor/icon-192.png" ||
    p === "/executor/icon-512.png" ||
    p === "/executor/icon-maskable-512.png";
  if (!isShell) return;
  // Сначала сеть (свежая страница трекинга), офлайн — из кэша
  event.respondWith(
    fetch(request).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(request, copy));
      }
      return res;
    }).catch(() => caches.match(request).then((cached) => cached || caches.match("/executor/track.html")))
  );
});
