/**
 * Tiny CORS proxy for fogos.pt fires JSON.
 * Locked upstream — not an open proxy.
 *
 * GET  /fires   → https://api-lb.fogos.pt/new/fires
 * OPTIONS /*    → CORS preflight
 */

const UPSTREAM = "https://api-lb.fogos.pt/new/fires";

/** Origins allowed to call this Worker from the browser. */
const ALLOWED_ORIGINS = new Set([
  "https://guaka.github.io",
  "http://127.0.0.1:8080",
  "http://localhost:8080",
  "http://127.0.0.1:8765",
  "http://localhost:8765",
]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://guaka.github.io";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders(request) });
    }

    if (url.pathname !== "/fires" && url.pathname !== "/") {
      return new Response("Not Found — try GET /fires", {
        status: 404,
        headers: { ...corsHeaders(request), "content-type": "text/plain; charset=utf-8" },
      });
    }

    // Cache API keys must be same-origin as this Worker.
    const cache = caches.default;
    const cacheKey = new Request(new URL("/fires", url.origin).toString(), { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) {
      const hit = new Response(cached.body, cached);
      for (const [k, v] of Object.entries(corsHeaders(request))) hit.headers.set(k, v);
      hit.headers.set("X-Proxy-Cache", "HIT");
      return hit;
    }

    const upstream = await fetch(UPSTREAM, {
      headers: {
        Accept: "application/json",
        "User-Agent": "FuegosVivos/0.1 (+https://guaka.github.io/fuegos/; proxy)",
      },
    });

    const body = await upstream.arrayBuffer();
    const res = new Response(body, {
      status: upstream.status,
      headers: {
        ...corsHeaders(request),
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
        "Cache-Control": "public, max-age=60",
        "X-Proxy-Cache": "MISS",
      },
    });

    if (upstream.ok) {
      // Fire-and-forget; don't block the response on cache write.
      cache.put(cacheKey, res.clone());
    }

    return res;
  },
};
