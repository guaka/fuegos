#!/usr/bin/env node
/**
 * Basic CI tests for Fuegos Vivos (no build / no deps).
 * Run: node ci/test.mjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const FF = require("../lib/fires.js");
const { runFireTests } = require("./test-fires.cjs");
const { runExtraTests } = require("./test-extra.cjs");

const root = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok  - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`fail - ${name}`);
    console.error(`      ${err && err.stack ? err.stack : err}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`ok  - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`fail - ${name}`);
    console.error(`      ${err && err.stack ? err.stack : err}`);
  }
}

function parseResources(text) {
  return FF.parseResources(text);
}

function statusClass(status) {
  return FF.statusClass(status);
}

function inFocusBbox(lat, lng, bbox) {
  const [w, s, e, n] = bbox;
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

function parseHectares(surface) {
  const m = String(surface || "").match(/([\d]+(?:[.,]\d+)?)\s*ha\b/i);
  if (!m) return 0;
  return Number(m[1].replace(",", ".")) || 0;
}

function seriousnessScore(fire) {
  const man = Number(fire.man) || 0;
  const terrain = Number(fire.terrain) || 0;
  const aerial = Number(fire.aerial) || 0;
  const resources = man + terrain * 2 + aerial * 5;
  const ha = Math.min(parseHectares(fire.surface), 500);
  const statusBoost =
    fire.statusClass === "activo" ? 12 : fire.statusClass === "controlado" ? 4 : 0;
  return resources + ha * 0.4 + statusBoost;
}

function markerSizeClass(fire) {
  const s = seriousnessScore(fire);
  if (s >= 90) return "size-xl";
  if (s >= 45) return "size-lg";
  if (s >= 18) return "size-md";
  return "size-sm";
}

function isExtinguished(row) {
  return FF.isExtinguished(row);
}

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

async function main() {
  test("required files exist", () => {
    for (const f of ["index.html", "index.js", "about.html", "favicon.svg", "LICENSE", "README.md", "DATA.md", ".nojekyll", "lib/fires.js"]) {
      assert.ok(fs.existsSync(path.join(root, f)), missing(f));
    }
    assert.ok(!fs.existsSync(path.join(root, "about.js")), "about.js removed with coverage map");
  });

  test("index.js is valid JavaScript", () => {
    require("child_process").execFileSync(process.execPath, ["--check", path.join(root, "index.js")], {
      stdio: "pipe",
    });
    require("child_process").execFileSync(process.execPath, ["--check", path.join(root, "lib/fires.js")], {
      stdio: "pipe",
    });
  });

  test("about page describes coverage without map", () => {
    const html = read("index.html");
    for (const needle of [
      'id="about"',
      "De dónde salen",
      "Castilla y León",
      "toda España",
      "FIRMS",
      "incendios.gal",
      "fogos.pt",
      "software experimental de aficionado",
      "par de horas",
      'href="#about"',
      "about-to-map",
    ]) {
      assert.ok(html.includes(needle), `missing ${needle}`);
    }
    assert.ok(!html.includes("coverage-map"));
    assert.ok(!html.includes("about.js"));
    const redirect = read("about.html");
    assert.ok(redirect.includes("#about"), "about.html redirects to #about");
  });

  test("HTML has core UI hooks", () => {
    const html = read("index.html");
    for (const needle of [
      "fuegos.guaka.org",
      'id="map"',
      'id="fire-list"',
      'id="sidebar"',
      'id="ticker"',
      'id="layer-oficiales"',
      'id="layer-galicia"',
      'id="btn-sheet"',
      "sheet-handle",
      "./index.js",
      "maplibre-gl",
      "AGPL",
      "#about",
      "favicon.svg",
      "112",
    ]) {
      assert.ok(html.includes(needle), `missing ${needle}`);
    }
  });

  test("index.js wires ES + Galicia + FIRMS + fogos.pt via Worker", () => {
    const js = read("index.js");
    const html = read("index.html");
    const lib = read("lib/fires.js");
    for (const needle of [
      "analisis.datosabiertos.jcyl.es",
      "incendios.gal/api/incidencias",
      "maps.effis.emergency.copernicus.eu",
      "fuegos-proxy.crew.workers.dev",
      "PROXY_ORIGIN",
      "FIRMS_FALLBACK_URL",
      "FOGOS_FALLBACK_URL",
      "fetchJsonWithFallback",
      "./data/firms.geojson",
      "./data/fires.json",
      "/firms",
      "/fires",
      "SOURCE",
      "SITE_HOST",
      "ATTR_OSM_CARTO",
      "FIRMS_COLORS",
      "syncRouteFromHash",
      "fetchJcylFires",
      "fetchGaliciaFires",
      "fetchFogosPtFires",
      "fetchFirmsHotspots",
      "filterFogosRows",
      "ensureFirmsLayers",
      "GALICIA_BBOX",
      "España · satélite",
      "is-firms",
      "isMobileLayout",
      "setSheetOpen",
      "flyToFirms",
      "flyToBbox",
      "mapFlyToLngLat",
      "canUseMapLibre",
      "isWebglUsable",
      "ensureLeaflet",
      "initLeafletMap",
      "initMapLibre",
      "maplibregl",
      "mapIsReady",
      "markerSizeClass",
      "seriousnessScore",
      "sourceBadgeMeta",
      "source-badge",
      "Satélite · FIRMS",
      "__FUEGOS_FORCE_LEAFLET",
      "scheduleLeafletResize",
      "preferCanvas",
      "HISTORY_LOOKBACK_DAYS",
      "buildResourcesChart",
      "reduceJcylRows",
      "filterGaliciaRows",
    ]) {
      assert.ok(js.includes(needle), `missing ${needle}`);
    }
    assert.ok(html.includes("./lib/fires.js"));
    assert.ok(html.includes("layer-firms"));
    assert.ok(html.includes("layer-portugal"));
    assert.ok(js.includes("leaflet@1.9.4"), "Leaflet CDN for Lockdown/no-WebGL fallback");
    assert.ok(js.includes("Modo de aislamiento") || html.includes("Modo de aislamiento"));
    assert.ok(lib.includes("OFFICIAL_PROVINCES"));
    assert.ok(lib.includes("LEÓN"));
    assert.ok(lib.includes("fecha_extinguido is null"));
    assert.ok(lib.includes("PARTE_LOOKBACK_DAYS"));
    assert.ok(lib.includes("function mergeHistory"));
    assert.ok(lib.includes("pointInSpain"));
    assert.ok(lib.includes("filterFogosRows"));
    assert.ok(js.includes("reduceJcylRows(rows)"));
    assert.ok(js.includes("filterGaliciaRows(rows)"));
    assert.ok(js.includes("[-9.5, 35.95, 4.45, 43.85]"), "default Spain bbox");
    assert.ok(!js.includes("REGION_SECTIONS"), "no per-CCAA sat card list");
    assert.ok(!js.includes("ver mapa"), "no empty ver-mapa sat cards");
    assert.ok(!js.includes("is-empty"), "sat cards must stay clickable (not is-empty)");
    assert.ok(!js.includes("api-lb.fogos.pt"), "browser must use Worker, not api-lb directly");
    assert.ok(
      !/\.\.\.\s*map\.getStyle\s*\(/.test(js),
      "must not call setStyle({...map.getStyle()}) — breaks MapLibre before load"
    );
    assert.ok(!js.includes("data/pt-fires.json"), "must not bake PT fires into static data files");
  });

  test("DATA.md documents sources with tables", () => {
    const md = read("DATA.md");
    for (const needle of [
      "| Fuente |",
      "JCyL",
      "EFFIS",
      "incendios.gal",
      "fogos.pt",
      "EGIF",
      "incidents-pt",
      "CORS",
    ]) {
      assert.ok(md.includes(needle), `missing ${needle}`);
    }
  });

  test("LICENSE is AGPL", () => {
    const license = read("LICENSE");
    assert.ok(/GNU AFFERO GENERAL PUBLIC LICENSE/i.test(license));
    assert.ok(/Version 3/i.test(license));
  });

  test("parseResources counts CyL medios text", () => {
    const sample =
      "7 Técnicos;36 A.M.;2 HT-CUETO;1 HT-VILLAELES;2 AA-;14 ELIF;5 Bulldozer;14 Autobombas;20 Cuadrillas de tierra";
    const r = parseResources(sample);
    assert.strictEqual(r.aerial, 5, `aerial=${r.aerial}`);
    assert.strictEqual(r.terrain, 19, `terrain=${r.terrain}`);
    assert.strictEqual(r.man, 77, `man=${r.man}`);
  });

  test("parseResources handles empty input", () => {
    assert.deepStrictEqual(parseResources(""), { man: 0, terrain: 0, aerial: 0 });
    assert.deepStrictEqual(parseResources(null), { man: 0, terrain: 0, aerial: 0 });
  });

  test("statusClass maps CyL labels", () => {
    assert.strictEqual(statusClass("ACTIVO"), "activo");
    assert.strictEqual(statusClass("CONTROLADO"), "controlado");
    assert.strictEqual(statusClass("ESTABILIZADO"), "estabilizado");
  });

  test("marker size grows with medios / hectares", () => {
    assert.strictEqual(parseHectares("FORESTAL 12,5 HA"), 12.5);
    assert.strictEqual(parseHectares("sin dato"), 0);
    assert.strictEqual(
      markerSizeClass({ man: 2, terrain: 0, aerial: 0, surface: "", statusClass: "estabilizado" }),
      "size-sm"
    );
    assert.strictEqual(
      markerSizeClass({ man: 20, terrain: 4, aerial: 0, surface: "", statusClass: "activo" }),
      "size-md"
    );
    assert.strictEqual(
      markerSizeClass({ man: 25, terrain: 5, aerial: 1, surface: "", statusClass: "activo" }),
      "size-lg"
    );
    assert.strictEqual(
      markerSizeClass({ man: 80, terrain: 20, aerial: 5, surface: "200 HA", statusClass: "activo" }),
      "size-xl"
    );
    assert.ok(
      seriousnessScore({ man: 10, terrain: 0, aerial: 2, surface: "", statusClass: "activo" }) >
        seriousnessScore({ man: 10, terrain: 0, aerial: 0, surface: "", statusClass: "estabilizado" })
    );
  });

  test("selected marker / size CSS present", () => {
    const html = read("index.html");
    assert.ok(html.includes("size-xl"));
    assert.ok(html.includes("marker-pulse"));
    assert.ok(html.includes(".map-marker.is-selected"));
    assert.ok(html.includes("legend-hint"));
    assert.ok(html.includes("recency-stale"));
    assert.ok(html.includes("Resumen por provincia") || html.includes("Resumen por región"));
  });

  test("sidebar renders region overview helpers", () => {
    const js = read("index.js");
    assert.ok(js.includes("renderSidebar"));
    assert.ok(js.includes("renderRegionOverview"));
    assert.ok(js.includes("renderFireDetail"));
    assert.ok(js.includes("regionStats"));
    assert.ok(!js.includes("function renderList("));
  });

  test("map stays north-up (no rotate)", () => {
    const js = read("index.js");
    assert.ok(js.includes("dragRotate: false"));
    assert.ok(js.includes("disableRotation"));
    assert.ok(js.includes("bearing: 0"));
    const html = read("index.html");
    assert.ok(html.includes('id="btn-locate"'));
    assert.ok(html.includes('class="map-locate"'));
    assert.ok(/map-wrap[\s\S]*id="btn-locate"/.test(html), "locate control must sit on the map");
    const topActions = html.match(/<div class="top-actions">[\s\S]*?<\/div>/);
    assert.ok(topActions, "top-actions present");
    assert.ok(!topActions[0].includes("btn-locate"), "locate must not be in the header");
    assert.ok(js.includes("locateMe"));
    assert.ok(js.includes("navigator.geolocation"));
    assert.ok(js.includes("user-location"));
    assert.ok(!html.includes('id="btn-recenter"'));
    assert.ok(!html.includes('id="btn-toggle-list"'));
  });

  test("relief hillshade layer is wired", () => {
    const js = read("index.js");
    assert.ok(js.includes("raster-dem"));
    assert.ok(js.includes("hillshade"));
    assert.ok(js.includes('id: "relief"'));
    assert.ok(js.includes("elevation-tiles-prod/terrarium"));
    const html = read("index.html");
    assert.ok(html.includes('id="layer-relief"'));
  });

  test("mergeHistory sorts and dedupes parte snapshots", () => {
    const out = FF.mergeHistory([
      { t: 300, man: 3 },
      { t: 100, man: 1 },
      { t: 300, man: 9 },
      { t: 200, man: 2 },
      { t: 0, man: 0 },
    ]);
    assert.strictEqual(out.length, 3);
    assert.deepStrictEqual(
      out.map((p) => p.t),
      [100, 200, 300]
    );
    assert.strictEqual(out[2].man, 9);
  });

  test("extinguished and stale fires are excluded", () => {
    assert.ok(isExtinguished({ fecha_extinguido: "2026-07-26" }));
    assert.ok(isExtinguished({ fecha_extinguido: "2026-07-26 13:03" }));
    assert.ok(!isExtinguished({ fecha_extinguido: null }));
    assert.ok(!isExtinguished({ fecha_extinguido: "" }));
    assert.ok(!isExtinguished({ fecha_extinguido: "09:59" })); // time-only junk
  });

  test("focus bbox covers Spain sample points", () => {
    const bbox = [-9.5, 35.95, 4.45, 43.85];
    assert.ok(inFocusBbox(42.88, -8.54, bbox)); // Santiago
    assert.ok(inFocusBbox(40.42, -3.7, bbox)); // Madrid
    assert.ok(inFocusBbox(41.39, 2.17, bbox)); // Barcelona
    assert.ok(inFocusBbox(39.57, 2.65, bbox)); // Palma
    assert.ok(inFocusBbox(37.39, -5.99, bbox)); // Sevilla
    assert.ok(inFocusBbox(39.48, -6.37, bbox)); // Cáceres
    assert.ok(!inFocusBbox(28.1, -15.4, bbox)); // Canarias — fuera de la vista por defecto
  });

  await testAsync("JCyL API responds", async () => {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 3);
    const iso = since.toISOString().slice(0, 10);
    const where =
      `fecha_del_parte >= date'${iso}'` +
      ` and situacion_actual in ('ACTIVO','CONTROLADO','ESTABILIZADO')` +
      ` and fecha_extinguido is null`;
    const url = new URL(
      "https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/incendios-forestales/records"
    );
    url.searchParams.set("limit", "1");
    url.searchParams.set("where", where);
    const res = await fetch(url);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.results));
    assert.ok(typeof data.total_count === "number");
  });

  await testAsync("incendios.gal API responds", async () => {
    const res = await fetch("https://incendios.gal/api/incidencias", {
      headers: { Accept: "application/json" },
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get("access-control-allow-origin"));
    const data = await res.json();
    assert.ok(Array.isArray(data));
  });

  await testAsync("EFFIS WMS returns PNG", async () => {
    const end = new Date();
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 7);
    const iso = (d) => d.toISOString().slice(0, 10);
    const url =
      "https://maps.effis.emergency.copernicus.eu/effis?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap" +
      "&LAYERS=viirs.hs&STYLES=default&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:4326" +
      `&WIDTH=64&HEIGHT=64&BBOX=-7,40,-6,41&TIME=${iso(start)}/${iso(end)}`;
    const res = await fetch(url);
    assert.strictEqual(res.status, 200);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 8);
    assert.strictEqual(buf[0], 0x89);
    assert.strictEqual(buf.toString("ascii", 1, 4), "PNG");
  });

  await runFireTests(test, testAsync);
  await runExtraTests(test, testAsync);

  console.log("");
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

function missing(f) {
  return `missing ${f}`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
