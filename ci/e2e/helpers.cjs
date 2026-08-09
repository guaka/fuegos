// @ts-check
const fs = require("fs");
const path = require("path");

const fixtures = path.join(__dirname, "..", "fixtures");
const jcylSample = JSON.parse(fs.readFileSync(path.join(fixtures, "jcyl-sample.json"), "utf8"));
const gaSample = JSON.parse(fs.readFileSync(path.join(fixtures, "galicia-sample.json"), "utf8"));
const fogosSample = JSON.parse(fs.readFileSync(path.join(fixtures, "fogos-sample.json"), "utf8"));

/** Build a JCyL ODS-like page response from fixture rows (only "keepable" ones for live map). */
function jcylApiBody() {
  const today = new Date().toISOString().slice(0, 10);
  const results = jcylSample.results
    .filter((r) => {
      const mun = (r.termino_municipal || "").toUpperCase();
      if (mun.startsWith("SIN INCID")) return false;
      if (r.fecha_extinguido) return false;
      if (r.provincia === "MADRID") return false;
      if (!r.posicion) return false;
      if (mun === "OLD FIRE") return false;
      return ["ACTIVO", "CONTROLADO", "ESTABILIZADO"].includes(r.situacion_actual);
    })
    .map((r) => ({
      ...r,
      fecha_del_parte: today,
      hora_del_parte: "12:00",
    }));
  return { total_count: results.length, results };
}

function firmsGeo() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-8.4, 42.9] },
        properties: {
          id: "firms:test:nw",
          confidence: "nominal",
          frp: 12,
          acq_date: "2026-08-09",
          acq_time: "1200",
          source: "FIRMS",
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-3.7, 40.4] },
        properties: {
          id: "firms:test:center",
          confidence: "high",
          frp: 40,
          acq_date: "2026-08-09",
          acq_time: "1210",
          source: "FIRMS",
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [2.1, 41.4] },
        properties: {
          id: "firms:test:east",
          confidence: "high",
          frp: 22,
          acq_date: "2026-08-09",
          acq_time: "1220",
          source: "FIRMS",
        },
      },
    ],
  };
}

/** Mock live fire APIs + soft-fail basemap tiles. */
async function installApiMocks(page) {
  await page.route("**/analisis.datosabiertos.jcyl.es/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(jcylApiBody()),
    });
  });
  await page.route("**/incendios.gal/api/incidencias**", async (route) => {
    const todayIso = new Date().toISOString();
    const rows = gaSample
      .filter((r) => r.id === 101 || r.id === 102)
      .map((r) => ({ ...r, updated_at: todayIso, created_at: todayIso }));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(rows),
    });
  });
  await page.route("**/fuegos-proxy.crew.workers.dev/fires**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(fogosSample),
    });
  });
  await page.route("**/fuegos-proxy.crew.workers.dev/firms**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/geo+json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(firmsGeo()),
    });
  });
  await page.route("**/basemaps.cartocdn.com/**", (route) => route.abort());
  await page.route("**/elevation-tiles-prod/**", (route) => route.abort());
  await page.route("**/maps.effis.emergency.copernicus.eu/**", (route) => route.abort());
  await page.route("**/server.arcgisonline.com/**", (route) => route.abort());
}

/**
 * Simulate iPhone Lockdown Mode / no-WebGL: force Leaflet fallback.
 * Must run before page scripts (addInitScript).
 */
async function forceLeafletLockdown(page) {
  await page.addInitScript(() => {
    globalThis.__FUEGOS_FORCE_LEAFLET = true;
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      const t = String(type || "");
      if (t.includes("webgl")) return null;
      return orig.call(this, type, attrs);
    };
  });
}

module.exports = {
  fixtures,
  jcylSample,
  gaSample,
  fogosSample,
  jcylApiBody,
  firmsGeo,
  installApiMocks,
  forceLeafletLockdown,
};
