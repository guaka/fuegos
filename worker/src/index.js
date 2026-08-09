/**
 * CORS proxy for Fuegos Vivos (fuegos.guaka.org / github.io).
 * Locked upstreams — not an open proxy.
 *
 * GET  /fires   → fogos.pt fires JSON
 * GET  /firms   → NASA FIRMS VIIRS Europe CSV → Spain GeoJSON
 * GET  /bombers → Bombers CAT vegetation incidents (GeoJSON)
 * GET  /infoca  → Andalucía INFOCA open incidents (GeoJSON)
 * OPTIONS /*    → CORS preflight
 */

const FOGOS_UPSTREAM = "https://api-lb.fogos.pt/new/fires";

const BOMBERS_QUERY =
  "https://services7.arcgis.com/ZCqVt1fRXwwK6GF4/arcgis/rest/services/" +
  "ACTUACIONS_URGENTS_online_PRO_AMB_FASE_VIEW/FeatureServer/0/query";

const INFOCA_QUERY =
  "https://utility.arcgis.com/usrsvcs/servers/d6d1c0079ddd4c7f8876d58e13fcf1ac/" +
  "rest/services/INFOCA/AN_INCIDENTES_PRO/FeatureServer/2/query";

const FIRMS_CSVS = [
  "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Europe_24h.csv",
  "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Europe_24h.csv",
  "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Europe_24h.csv",
];

/** Cluster cell in degrees (~0.02° ≈ 2 km). Smaller = more dots, heavier payload. */
const FIRMS_CLUSTER_DEG = 0.02;

/** Origins allowed to call this Worker from the browser. */
const ALLOWED_ORIGINS = new Set([
  "https://fuegos.guaka.org",
  "https://www.fuegos.guaka.org",
  "https://guaka.github.io",
  "http://127.0.0.1:8080",
  "http://localhost:8080",
  "http://127.0.0.1:8765",
  "http://localhost:8765",
]);

const UA = "FuegosVivos/0.1 (+https://fuegos.guaka.org/; proxy)";

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://fuegos.guaka.org";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Rough Spain filter (península + Baleares + Canarias + Ceuta/Melilla). */
function pointInSpain(lat, lng) {
  if (27.5 <= lat && lat <= 29.5 && -18.5 <= lng && lng <= -13.2) return true;
  if (38.55 <= lat && lat <= 40.15 && 1.0 <= lng && lng <= 4.35) return true;
  if (35.85 <= lat && lat <= 35.95 && -5.4 <= lng && lng <= -5.25) return true;
  if (35.25 <= lat && lat <= 35.35 && -3.0 <= lng && lng <= -2.9) return true;
  if (!(35.95 <= lat && lat <= 43.85 && -9.5 <= lng && lng <= 3.35)) return false;
  if (lat < 37.55 && lng > -0.85) return false; // Argelia
  if (lat > 43.05 && lng > -1.55) return false; // Francia N Pirineos
  if (lat > 42.45 && lng > 2.85) return false; // Roussillon
  if (lat < 36.05 && lng > -5.6) return false; // Marruecos
  return true;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < headers.length) continue;
    const row = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = cols[j].trim();
    rows.push(row);
  }
  return rows;
}

function confRank(c) {
  if (c === "high") return 3;
  if (c === "nominal") return 2;
  if (c === "low") return 1;
  return 0;
}

/**
 * Filter Europe FIRMS rows to Spain, drop low confidence, cluster.
 * @returns {GeoJSON.FeatureCollection}
 */
function firmsToGeoJSON(allRows) {
  /** @type {Map<string, object>} */
  const best = new Map();

  for (const row of allRows) {
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!pointInSpain(lat, lng)) continue;
    const confidence = String(row.confidence || "").toLowerCase();
    if (confidence === "low") continue;
    const frp = Number(row.frp) || 0;
    const key = `${(Math.round(lat / FIRMS_CLUSTER_DEG) * FIRMS_CLUSTER_DEG).toFixed(3)},${(
      Math.round(lng / FIRMS_CLUSTER_DEG) * FIRMS_CLUSTER_DEG
    ).toFixed(3)}`;
    const prev = best.get(key);
    const cand = {
      lat,
      lng,
      confidence,
      frp,
      acq_date: row.acq_date || "",
      acq_time: row.acq_time || "",
      satellite: row.satellite || "",
      daynight: row.daynight || "",
    };
    if (
      !prev ||
      confRank(cand.confidence) > confRank(prev.confidence) ||
      (confRank(cand.confidence) === confRank(prev.confidence) && cand.frp > prev.frp)
    ) {
      best.set(key, cand);
    }
  }

  const features = [...best.values()].map((p, i) => ({
    type: "Feature",
    id: `firms:${p.acq_date}:${p.acq_time}:${i}`,
    geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    properties: {
      id: `firms:${p.acq_date}:${p.acq_time}:${p.lat.toFixed(3)}:${p.lng.toFixed(3)}`,
      confidence: p.confidence,
      frp: p.frp,
      acq_date: p.acq_date,
      acq_time: p.acq_time,
      satellite: p.satellite,
      daynight: p.daynight,
      source: "FIRMS",
    },
  }));

  return {
    type: "FeatureCollection",
    features,
    meta: {
      source: "NASA FIRMS VIIRS (Suomi-NPP + NOAA-20 + NOAA-21) Europe 24h",
      filtered: "Spain approx · confidence nominal/high · clustered ~0.02°",
      count: features.length,
      updated: new Date().toISOString(),
    },
  };
}

async function cachedJsonProxy(request, url, cachePath, upstreamUrl, maxAgeSec) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(cachePath, url.origin).toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const hit = new Response(cached.body, cached);
    for (const [k, v] of Object.entries(corsHeaders(request))) hit.headers.set(k, v);
    hit.headers.set("X-Proxy-Cache", "HIT");
    return hit;
  }

  const upstream = await fetch(upstreamUrl, {
    headers: {
      Accept: "application/json, application/geo+json",
      "User-Agent": UA,
    },
  });

  const body = await upstream.arrayBuffer();
  const contentType = upstream.headers.get("Content-Type") || "application/json; charset=utf-8";
  const res = new Response(body, {
    status: upstream.status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": contentType,
      "Cache-Control": `public, max-age=${maxAgeSec}`,
      "X-Proxy-Cache": "MISS",
    },
  });

  if (upstream.ok) cache.put(cacheKey, res.clone());
  return res;
}

function bombersUpstreamUrl() {
  const q = new URLSearchParams({
    where: "TAL_COD_ALARMA1='IV'",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: "2000",
    f: "geojson",
  });
  return `${BOMBERS_QUERY}?${q}`;
}

function infocaUpstreamUrl() {
  const q = new URLSearchParams({
    where: "ESTADO IN ('ACTIVO','CONTROLADO','ESTABILIZADO','DECLARADO')",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: "2000",
    f: "geojson",
  });
  return `${INFOCA_QUERY}?${q}`;
}

async function proxyFogos(request, url) {
  return cachedJsonProxy(request, url, "/fires", FOGOS_UPSTREAM, 60);
}

async function proxyBombers(request, url) {
  return cachedJsonProxy(request, url, "/bombers", bombersUpstreamUrl(), 90);
}

async function proxyInfoca(request, url) {
  return cachedJsonProxy(request, url, "/infoca", infocaUpstreamUrl(), 90);
}

async function proxyFirms(request, url) {
  const cache = caches.default;
  const cacheKey = new Request(new URL("/firms", url.origin).toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const hit = new Response(cached.body, cached);
    for (const [k, v] of Object.entries(corsHeaders(request))) hit.headers.set(k, v);
    hit.headers.set("X-Proxy-Cache", "HIT");
    return hit;
  }

  const texts = await Promise.all(
    FIRMS_CSVS.map(async (csvUrl) => {
      const r = await fetch(csvUrl, {
        headers: { "User-Agent": "FuegosVivos/0.1 (+https://fuegos.guaka.org/; firms)" },
      });
      if (!r.ok) throw new Error(`FIRMS HTTP ${r.status} for ${csvUrl}`);
      return r.text();
    })
  );

  const rows = texts.flatMap(parseCsv);
  const geo = firmsToGeoJSON(rows);
  const res = new Response(JSON.stringify(geo), {
    status: 200,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/geo+json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Proxy-Cache": "MISS",
      "X-Firms-Count": String(geo.features.length),
    },
  });

  cache.put(cacheKey, res.clone());
  return res;
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

    try {
      if (url.pathname === "/firms") return await proxyFirms(request, url);
      if (url.pathname === "/bombers") return await proxyBombers(request, url);
      if (url.pathname === "/infoca") return await proxyInfoca(request, url);
      if (url.pathname === "/fires" || url.pathname === "/") return await proxyFogos(request, url);
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err && err.message ? err.message : err) }), {
        status: 502,
        headers: {
          ...corsHeaders(request),
          "Content-Type": "application/json; charset=utf-8",
        },
      });
    }

    return new Response("Not Found — try GET /firms /fires /bombers /infoca", {
      status: 404,
      headers: { ...corsHeaders(request), "content-type": "text/plain; charset=utf-8" },
    });
  },
};
