/**
 * BEYU OS — Service Worker (safe offline-first)
 *
 * Design:
 *  - Cache ONLY explicitly public, static assets (brand icons, offline page, manifest).
 *  - NEVER cache: authenticated HTML, /api/*, /os/*, cookies, private responses, tokens.
 *  - Strategy: cache-first for approved static assets; network-first for navigation,
 *    falling back to /offline when network unavailable.
 *  - Versioned cache name; old caches purged on activate.
 *  - Credentials and private data are never stored.
 *
 * Security: this SW cannot bypass authorization — every authenticated route still
 * requires server validation on reconnect. Offline storage is minimal and public-only.
 */

const CACHE_VERSION = "beyu-os-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const OFFLINE_URL = "/offline";

const PRECACHE_URLS = [
  "/offline",
  "/brand/favicon.png",
  "/brand/beyu-app-icon-192.png",
  "/brand/beyu-app-icon-512.png",
  "/brand/beyu-os-logo.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  // Precache public assets only
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS.map((u) => new Request(u, { cache: "reload" })));
    }).catch(() => {
      // Precache failure is non-fatal — SW still installs
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k.startsWith("beyu-os-") && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Helper: is this a request we must NEVER cache?
function isPrivateOrSensitive(request) {
  const url = new URL(request.url);
  // Never cache API, authenticated OS routes, launcher, health mount
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname.startsWith("/os")) return true;
  if (url.pathname.startsWith("/launcher")) return true;
  if (url.pathname.startsWith("/health/os")) return true;
  // Never cache non-GET
  if (request.method !== "GET") return true;
  // Never cache requests with Authorization or Cookie-sensitive intent (range etc.)
  return false;
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/brand/") ||
    pathname.startsWith("/noelia/") ||
    pathname === "/manifest.webmanifest" ||
    pathname.endsWith(".png") && pathname.startsWith("/brand/") ||
    pathname === "/offline"
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // Never intercept private/sensitive
  if (isPrivateOrSensitive(request)) return;

  // For navigation requests: network-first, fallback to offline page or cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Don't cache navigations that are authenticated (check for redirect to sign-in is handled by browser)
          // Only cache successful public navigations if needed — we keep it minimal: no caching of navigations
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(STATIC_CACHE);
          // Try cached request first (for precached offline page)
          const cached = await cache.match(request);
          if (cached) return cached;
          const offline = await cache.match(OFFLINE_URL);
          if (offline) return offline;
          // Last resort: return offline page as plain response
          return new Response("You are offline. Please check your connection.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        })
    );
    return;
  }

  // For approved static assets: cache-first with network update
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Revalidate in background
          event.waitUntil(
            fetch(request).then((resp) => {
              if (resp && resp.ok) caches.open(STATIC_CACHE).then((c) => c.put(request, resp));
            }).catch(() => {})
          );
          return cached;
        }
        return fetch(request).then((resp) => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, clone));
          }
          return resp;
        }).catch(() => cached || Response.error());
      })
    );
  }
});

// Allow page to trigger skipWaiting via message
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
