#!/usr/bin/env node
/**
 * Extra fire / proxy / openspec regression tests.
 * Included from ci/test.cjs via runExtraTests.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const FF = require("../lib/fires.js");

const root = path.resolve(__dirname, "..");
const fixtures = path.join(__dirname, "fixtures");

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtures, name), "utf8"));
}

async function runExtraTests(test, testAsync) {
  const fogosSample = loadJson("fogos-sample.json");

  test("fogos fixture keeps 3 open rural fires", () => {
    const fires = FF.filterFogosRows(fogosSample);
    assert.strictEqual(fires.length, 3, fires.map((f) => f.id).join(","));
    assert.deepStrictEqual(
      fires.map((f) => f.id).sort(),
      ["pt:pt-despacho", "pt:pt-open-1", "pt:pt-vigil"].sort()
    );
  });

  test("fogos statusClass maps PT labels used on the map", () => {
    assert.strictEqual(FF.statusClass("Em Resolução"), "controlado");
    assert.strictEqual(FF.statusClass("Vigilância"), "estabilizado");
    assert.strictEqual(FF.statusClass("Despacho de 1º Alerta"), "activo");
    assert.strictEqual(FF.statusClass("Em Curso"), "activo");
    assert.strictEqual(FF.statusClass("Conclusão"), "conclusao");
    assert.strictEqual(FF.statusClass("Encerrada"), "conclusao");
  });

  test("statusClass maps Catalan / INFOCA labels", () => {
    assert.strictEqual(FF.statusClass("Controlat"), "controlado");
    assert.strictEqual(FF.statusClass("Actiu"), "activo");
    assert.strictEqual(FF.statusClass("Extingit"), "conclusao");
    assert.strictEqual(FF.statusClass("DECLARADO"), "activo");
    assert.strictEqual(FF.statusClass("ACTIVO"), "activo");
  });

  test("filterBombersRows keeps open CAT fires and drops Extingit / bad coords", () => {
    const sample = loadJson("bombers-sample.geojson");
    const now = 1786290000000 + 3600e3;
    const fires = FF.filterBombersRows(sample, now);
    assert.strictEqual(fires.length, 1);
    assert.strictEqual(fires[0].source, "Bombers");
    assert.strictEqual(fires[0].municipality, "Barcelona");
    assert.strictEqual(fires[0].statusClass, "controlado");
    assert.strictEqual(fires[0].terrain, 3);
  });

  test("filterInfocaRows keeps ACTIVO and drops EXTINGUIDO", () => {
    const sample = loadJson("infoca-sample.geojson");
    const now = 1786233600000 + 3600e3;
    const fires = FF.filterInfocaRows(sample, now);
    assert.strictEqual(fires.length, 1);
    assert.strictEqual(fires[0].source, "INFOCA");
    assert.strictEqual(fires[0].municipality, "Niebla");
    assert.strictEqual(fires[0].statusClass, "activo");
    assert.strictEqual(fires[0].aerial, 2);
  });

  test("filterInfocamRows keeps open FORESTAL and drops extinguido / falsa alarma", () => {
    const sample = loadJson("infocam-sample.geojson");
    const now = 1786200000000 + 2 * 3600e3;
    const fires = FF.filterInfocamRows(sample, now);
    assert.ok(fires.length >= 1, fires.map((f) => f.id).join(","));
    assert.ok(fires.every((f) => f.source === "INFOCAM"));
    assert.ok(fires.some((f) => f.id === "clm:999003"));
    assert.ok(!fires.some((f) => f.id === "clm:999001"));
    assert.ok(!fires.some((f) => f.id === "clm:999002"));
    const albacete = fires.find((f) => f.id === "clm:999003");
    assert.strictEqual(albacete.statusClass, "activo");
    assert.strictEqual(albacete.surface, "12.5 ha");
  });

  test("filterAragonRows keeps esactivo points inside Aragón bbox", () => {
    const sample = loadJson("aragon-sample.geojson");
    const fires = FF.filterAragonRows(sample);
    assert.strictEqual(fires.length, 1);
    assert.strictEqual(fires[0].source, "Aragón");
    assert.strictEqual(fires[0].id, "ara:42001");
    assert.strictEqual(fires[0].statusClass, "activo");
  });

  test("parseFogosDateMs parses DD-MM-YYYY", () => {
    const ms = FF.parseFogosDateMs("09-08-2026", "14:30");
    assert.ok(ms > 0);
    const d = new Date(ms);
    assert.strictEqual(d.getUTCFullYear(), 2026);
    assert.strictEqual(d.getUTCMonth(), 7);
    assert.strictEqual(d.getUTCDate(), 9);
    assert.strictEqual(FF.parseFogosDateMs("bad", "x"), 0);
  });

  test("filterFogosRows accepts bare array payload", () => {
    const fires = FF.filterFogosRows(fogosSample.data);
    assert.strictEqual(fires.length, 3);
  });

  test("filterFogosRows handles empty / garbage payload", () => {
    assert.deepStrictEqual(FF.filterFogosRows(null), []);
    assert.deepStrictEqual(FF.filterFogosRows({}), []);
    assert.deepStrictEqual(FF.filterFogosRows({ data: null }), []);
    assert.deepStrictEqual(FF.filterFogosRows("nope"), []);
  });

  test("compareFires ranks activo before vigilancia and by medios", () => {
    const a = {
      statusClass: "activo",
      man: 1,
      terrain: 0,
      aerial: 0,
      parteMs: 1,
    };
    const b = {
      statusClass: "estabilizado",
      man: 50,
      terrain: 0,
      aerial: 0,
      parteMs: 9,
    };
    const c = {
      statusClass: "activo",
      man: 20,
      terrain: 0,
      aerial: 0,
      parteMs: 1,
    };
    assert.ok(FF.compareFires(a, b) < 0, "activo before estabilizado");
    assert.ok(FF.compareFires(c, a) < 0, "more medios first among activo");
  });

  test("pointInSpain edge: Ceuta Melilla and border rejects", () => {
    assert.ok(FF.pointInSpain(35.89, -5.32), "Ceuta");
    assert.ok(FF.pointInSpain(35.29, -2.94), "Melilla");
    assert.ok(FF.pointInSpain(36.72, -4.42), "Málaga");
    assert.ok(!FF.pointInSpain(35.78, -5.8), "Strait / Morocco-ish");
    assert.ok(!FF.pointInSpain(42.7, 3.0), "east of Catalonia / France");
  });

  test("normalizeFogos sets detailUrl and important level", () => {
    const fire = FF.normalizeFogos(fogosSample.data[0]);
    assert.strictEqual(fire.country, "PT");
    assert.strictEqual(fire.source, "fogos.pt");
    assert.strictEqual(fire.level, "Importante");
    assert.ok(fire.detailUrl.includes("fogos.pt"));
    assert.strictEqual(fire.aerial, 2);
  });

  test("openspec main specs and config exist", () => {
    const cfg = path.join(root, "openspec", "config.yaml");
    assert.ok(fs.existsSync(cfg), "openspec/config.yaml");
    const body = fs.readFileSync(cfg, "utf8");
    assert.ok(body.includes("schema: spec-driven"));
    assert.ok(body.includes("fuegos-proxy"));
    for (const name of ["fire-data", "map-spa", "cors-proxy"]) {
      const spec = path.join(root, "openspec", "specs", name, "spec.md");
      assert.ok(fs.existsSync(spec), spec);
      const md = fs.readFileSync(spec, "utf8");
      assert.ok(md.includes("### Requirement:"), `${name} has requirements`);
      assert.ok(md.includes("#### Scenario:"), `${name} has scenarios`);
    }
  });

  test("i18n defaults to ES and translates EN/PT", () => {
    const I18n = require("../lib/i18n.js");
    assert.strictEqual(I18n.DEFAULT_LANG, "es");
    assert.strictEqual(I18n.resolveLang("", null), "es");
    assert.strictEqual(I18n.resolveLang("?lang=en", null), "en");
    assert.strictEqual(I18n.resolveLang("?lang=pt", "en"), "pt");
    assert.strictEqual(I18n.resolveLang("", "en"), "en");
    assert.strictEqual(I18n.resolveLang("?lang=fr", "xx"), "es");
    I18n.setLang("es", { skipPersist: true, silent: true });
    assert.strictEqual(I18n.t("nav.map"), "Mapa");
    assert.strictEqual(I18n.t("nav.about"), "Sobre");
    I18n.setLang("en", { skipPersist: true, silent: true });
    assert.strictEqual(I18n.t("nav.map"), "Map");
    assert.strictEqual(I18n.t("nav.about"), "About");
    assert.ok(I18n.t("about.coverageTitle").includes("Where"));
    I18n.setLang("pt", { skipPersist: true, silent: true });
    assert.strictEqual(I18n.t("nav.map"), "Mapa");
    assert.ok(I18n.t("about.lead").includes("Portugal"));
    assert.ok(!("detectionUnit" in I18n));
    I18n.setLang("es", { skipPersist: true, silent: true });
  });

  test("index.html wires i18n script and lang switcher", () => {
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    assert.ok(html.includes("./lib/i18n.js"));
    assert.ok(html.includes('data-lang="es"'));
    assert.ok(html.includes('data-lang="en"'));
    assert.ok(html.includes('data-lang="pt"'));
    assert.ok(html.includes("lang-switch"));
    assert.ok(html.includes('data-i18n="nav.map"'));
    assert.ok((html.match(/id="coverage-title"/g) || []).length === 1);
  });

  test("index.js boots FuegosI18n", () => {
    const js = fs.readFileSync(path.join(root, "index.js"), "utf8");
    assert.ok(js.includes("FuegosI18n"));
    assert.ok(js.includes("I18n.init()"));
    assert.ok(js.includes("I18n.setOnChange"));
    assert.ok(js.includes("Toda España"));
    assert.ok(js.includes('I18n.t("title.about"'));
    assert.ok(js.includes("Satélite · FIRMS"));
  });

  test("Worker source exposes fires firms bombers infoca infocam aragon", () => {
    const src = fs.readFileSync(path.join(root, "worker", "src", "index.js"), "utf8");
    assert.ok(src.includes('pathname === "/firms"'));
    assert.ok(src.includes('pathname === "/fires"'));
    assert.ok(src.includes('pathname === "/bombers"'));
    assert.ok(src.includes('pathname === "/infoca"'));
    assert.ok(src.includes('pathname === "/infocam"'));
    assert.ok(src.includes('pathname === "/aragon"'));
    assert.ok(src.includes("firmsToGeoJSON"));
    assert.ok(src.includes("FOGOS_UPSTREAM") || src.includes("api-lb.fogos.pt"));
    assert.ok(src.includes("BOMBERS_QUERY") || src.includes("ACTUACIONS_URGENTS"));
    assert.ok(src.includes("INFOCA_QUERY") || src.includes("AN_INCIDENTES_PRO"));
    assert.ok(src.includes("INFOCAM_QUERY") || src.includes("PartesIncendio_APPWeb_Vista"));
    assert.ok(src.includes("ARAGON_WFS") || src.includes("INCENDIOS_ACTIVOS"));
    assert.ok(src.includes("https://fuegos.guaka.org"), "custom domain in ALLOWED_ORIGINS");
  });

  await testAsync("live Worker /fires returns fogos-shaped JSON with CORS", async () => {
    const res = await fetch("https://fuegos-proxy.crew.workers.dev/fires", {
      headers: { Origin: "https://fuegos.guaka.org", Accept: "application/json" },
    });
    assert.ok(res.ok, `HTTP ${res.status}`);
    assert.strictEqual(res.headers.get("access-control-allow-origin"), "https://fuegos.guaka.org");
    const body = await res.json();
    assert.ok(body && Array.isArray(body.data), "expected { data: [] }");
    const filtered = FF.filterFogosRows(body);
    assert.ok(filtered.every((f) => f.country === "PT" && f.source === "fogos.pt"));
    assert.ok(filtered.every((f) => f.statusClass !== "conclusao"));
  });

  await testAsync("live Worker /firms returns Spain GeoJSON with CORS", async () => {
    const res = await fetch("https://fuegos-proxy.crew.workers.dev/firms", {
      headers: { Origin: "https://fuegos.guaka.org", Accept: "application/geo+json, application/json" },
    });
    assert.ok(res.ok, `HTTP ${res.status}`);
    assert.strictEqual(res.headers.get("access-control-allow-origin"), "https://fuegos.guaka.org");
    const body = await res.json();
    assert.strictEqual(body.type, "FeatureCollection");
    assert.ok(Array.isArray(body.features));
    assert.ok(body.features.length > 0, "expected some Spain detections");
    for (const f of body.features.slice(0, 40)) {
      const [lng, lat] = f.geometry.coordinates;
      assert.ok(FF.pointInSpain(lat, lng), `out of Spain? ${lat},${lng}`);
      assert.notStrictEqual(f.properties.confidence, "low");
    }
  });
}

module.exports = { runExtraTests };

if (require.main === module) {
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
  runExtraTests(test, testAsync).then(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
}
