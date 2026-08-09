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

  test("Worker source exposes /fires and /firms only", () => {
    const src = fs.readFileSync(path.join(root, "worker", "src", "index.js"), "utf8");
    assert.ok(src.includes('pathname === "/firms"'));
    assert.ok(src.includes('pathname === "/fires"'));
    assert.ok(src.includes("firmsToGeoJSON"));
    assert.ok(src.includes("FOGOS_UPSTREAM") || src.includes("api-lb.fogos.pt"));
  });

  await testAsync("live Worker /fires returns fogos-shaped JSON with CORS", async () => {
    const res = await fetch("https://fuegos-proxy.crew.workers.dev/fires", {
      headers: { Origin: "https://guaka.github.io", Accept: "application/json" },
    });
    assert.ok(res.ok, `HTTP ${res.status}`);
    assert.strictEqual(res.headers.get("access-control-allow-origin"), "https://guaka.github.io");
    const body = await res.json();
    assert.ok(body && Array.isArray(body.data), "expected { data: [] }");
    const filtered = FF.filterFogosRows(body);
    assert.ok(filtered.every((f) => f.country === "PT" && f.source === "fogos.pt"));
    assert.ok(filtered.every((f) => f.statusClass !== "conclusao"));
  });

  await testAsync("live Worker /firms returns Spain GeoJSON with CORS", async () => {
    const res = await fetch("https://fuegos-proxy.crew.workers.dev/firms", {
      headers: { Origin: "https://guaka.github.io", Accept: "application/geo+json, application/json" },
    });
    assert.ok(res.ok, `HTTP ${res.status}`);
    assert.strictEqual(res.headers.get("access-control-allow-origin"), "https://guaka.github.io");
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
