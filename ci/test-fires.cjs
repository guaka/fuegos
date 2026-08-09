#!/usr/bin/env node
/**
 * Fire-filter regression tests — catch dropped CyL / Galicia points.
 * Run via: node ci/test.cjs (includes this) or node ci/test-fires.cjs
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

async function runFireTests(test, testAsync) {
  const sample = loadJson("jcyl-sample.json");
  const nowMs = Date.parse(sample.now);
  const rows = sample.results;
  const gaRows = loadJson("galicia-sample.json");

  test("fixture keeps every current CyL fire (no silent drops)", () => {
    const fires = FF.reduceJcylRows(rows, nowMs);
    const ids = fires.map((f) => f.municipality).sort();
    assert.deepStrictEqual(ids, ["ÁVILA EDGE", "DUP LEÓN A", "MANSILLA MAYOR", "NAVAS DE SAN ANTONIO"].sort());
    assert.strictEqual(fires.length, 4, `expected 4 current fires, got ${fires.length}: ${ids}`);
  });

  test("dedupes same fireKey keeping newest parte + history", () => {
    const fires = FF.reduceJcylRows(rows, nowMs);
    const dup = fires.find((f) => f.municipality === "DUP LEÓN A");
    assert.ok(dup, "dup fire missing");
    assert.strictEqual(dup.status, "CONTROLADO");
    assert.ok(dup.history.length >= 2, `history=${dup.history.length}`);
    assert.strictEqual(dup.man, 8);
  });

  test("rejects extinguished / stale / non-CyL / sin incid / no coords", () => {
    const reasons = {};
    for (const row of rows) {
      const r = FF.rejectReason(row, nowMs) || "kept";
      reasons[r] = (reasons[r] || 0) + 1;
    }
    assert.ok(reasons.kept >= 4, JSON.stringify(reasons));
    assert.ok(reasons.extinguido >= 1);
    assert.ok(reasons["parte-stale"] >= 1);
    assert.ok(reasons["fuera-cyl"] >= 1);
    assert.ok(reasons["sin-municipio"] >= 1);
    assert.ok(reasons["sin-coords"] >= 1);
  });

  test("province array ÁVILA is accepted as official", () => {
    assert.ok(FF.OFFICIAL_PROVINCES.has("ÁVILA"));
    assert.ok(FF.OFFICIAL_PROVINCES.has("AVILA"));
    const fires = FF.reduceJcylRows(rows, nowMs);
    assert.ok(fires.some((f) => f.province === "ÁVILA"));
  });

  test("ACTIVO CONTROLADO ESTABILIZADO all eligible statuses", () => {
    for (const s of ["ACTIVO", "CONTROLADO", "ESTABILIZADO"]) {
      assert.ok(FF.ACTIVE_STATUSES.has(s), s);
    }
    assert.ok(!FF.ACTIVE_STATUSES.has("EXTINGUIDO"));
  });

  test("isExtinguished requires YYYY-MM-DD not time-only junk", () => {
    assert.ok(FF.isExtinguished({ fecha_extinguido: "2026-08-08" }));
    assert.ok(!FF.isExtinguished({ fecha_extinguido: null }));
    assert.ok(!FF.isExtinguished({ fecha_extinguido: "" }));
    assert.ok(!FF.isExtinguished({ fecha_extinguido: "09:59" }));
  });

  test("Galicia keeps recent fire tipos with coords only", () => {
    const fires = FF.filterGaliciaRows(gaRows, nowMs);
    const ids = fires.map((f) => f.id).sort();
    assert.deepStrictEqual(ids, ["ga:101", "ga:102"]);
    assert.ok(!fires.some((f) => f.id === "ga:103"), "old aviso must drop");
    assert.ok(!fires.some((f) => f.id === "ga:104"), "solidariedade must drop");
    assert.ok(!fires.some((f) => f.id === "ga:105"), "null coords must drop");
  });

  test("lookback windows match documented constants", () => {
    assert.strictEqual(FF.PARTE_LOOKBACK_DAYS, 3);
    assert.strictEqual(FF.HISTORY_LOOKBACK_DAYS, 14);
    assert.strictEqual(FF.GALICIA_LOOKBACK_DAYS, 30);
  });

  test("jcyl where clause always excludes extinguished and limits statuses", () => {
    const w = FF.jcylWhereClause("2026-07-26");
    assert.ok(w.includes("fecha_extinguido is null"));
    assert.ok(w.includes("ACTIVO"));
    assert.ok(w.includes("CONTROLADO"));
    assert.ok(w.includes("ESTABILIZADO"));
    assert.ok(w.includes("2026-07-26"));
  });

  test("index.js delegates filtering to lib/fires.js", () => {
    const js = fs.readFileSync(path.join(root, "index.js"), "utf8");
    assert.ok(js.includes("reduceJcylRows"));
    assert.ok(js.includes("filterGaliciaRows"));
    assert.ok(js.includes("jcylWhereClause"));
    assert.ok(js.includes("globalThis.FuegosFires"));
    assert.ok(!js.includes("function isCandidateRow"));
    assert.ok(!js.includes("function normalizeGalicia"));
  });

  test("index.html loads lib/fires.js before index.js", () => {
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    const iLib = html.indexOf("./lib/fires.js");
    const iIdx = html.indexOf("./index.js");
    assert.ok(iLib > 0 && iIdx > iLib, "lib/fires.js must precede index.js");
  });

  test("every official CyL province is listed", () => {
    const expected = [
      "LEÓN",
      "SALAMANCA",
      "ZAMORA",
      "ÁVILA",
      "AVILA",
      "VALLADOLID",
      "PALENCIA",
      "BURGOS",
      "SEGOVIA",
      "SORIA",
    ];
    for (const p of expected) assert.ok(FF.OFFICIAL_PROVINCES.has(p), p);
  });

  test("parseResources still counts mixed medios strings", () => {
    const r = FF.parseResources(
      "7 Técnicos;36 A.M.;2 HT-CUETO;1 HT-VILLAELES;2 AA-;14 ELIF;5 Bulldozer;14 Autobombas;20 Cuadrillas de tierra"
    );
    assert.strictEqual(r.aerial, 5);
    assert.strictEqual(r.terrain, 19);
    assert.strictEqual(r.man, 77);
  });

  test("widening parte lookback would surface stale fixture fire", () => {
    const with3 = FF.reduceJcylRows(rows, nowMs);
    const with30 = rows
      .filter((row) => FF.isCandidateRow(row))
      .map((row) => FF.normalizeFire(row))
      .filter((f) => FF.isCurrentFire(f, nowMs, 30));
    assert.ok(with30.length > with3.length, "30d should include July stale ACTIVO");
    assert.ok(with30.some((f) => f.municipality === "OLD FIRE"));
    assert.ok(!with3.some((f) => f.municipality === "OLD FIRE"));
  });

  await testAsync("live JCyL: reduced set ⊆ candidate set (no extras dropped wrongly)", async () => {
    const since = FF.isoDate(FF.daysAgo(FF.HISTORY_LOOKBACK_DAYS));
    const where = FF.jcylWhereClause(since);
    const url =
      "https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/incendios-forestales/records?" +
      new URLSearchParams({
        limit: "100",
        order_by: "fecha_del_parte desc, hora_del_parte desc",
        where,
      }).toString();
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    assert.ok(res.ok, `JCyL HTTP ${res.status}`);
    const data = await res.json();
    const batch = Array.isArray(data.results) ? data.results : [];
    const now = Date.now();
    const reduced = FF.reduceJcylRows(batch, now);
    const candidates = batch.filter((r) => FF.isCandidateRow(r)).map((r) => FF.normalizeFire(r));
    const currentIds = new Set(
      candidates.filter((f) => FF.isCurrentFire(f, now)).map((f) => f.id)
    );
    for (const f of reduced) {
      assert.ok(currentIds.has(f.id), `unexpected fire in reduce: ${f.id}`);
    }
    // Every current candidate must appear in reduced (dedupe may collapse, so check by id set size)
    const reducedIds = new Set(reduced.map((f) => f.id));
    for (const id of currentIds) {
      assert.ok(reducedIds.has(id), `missing current fire ${id}`);
    }
    assert.ok(reduced.every((f) => f.lat != null && f.lng != null), "all mapped fires need coords");
    assert.ok(reduced.every((f) => FF.OFFICIAL_PROVINCES.has(f.province)), "only CyL provinces");
  });

  await testAsync("live Galicia: filter never drops rows that match tipo+coords+lookback", async () => {
    const res = await fetch("https://incendios.gal/api/incidencias", {
      headers: { Accept: "application/json" },
    });
    assert.ok(res.ok, `Galicia HTTP ${res.status}`);
    const rowsLive = await res.json();
    assert.ok(Array.isArray(rowsLive));
    const now = Date.now();
    const filtered = FF.filterGaliciaRows(rowsLive, now);
    const cutoff = now - FF.GALICIA_LOOKBACK_DAYS * 24 * 36e5;
    let expect = 0;
    for (const row of rowsLive) {
      const slug = row.tipo && row.tipo.slug;
      if (!FF.GALICIA_FIRE_TIPOS.has(slug)) continue;
      const lat = Number(row.latitude);
      const lng = Number(row.lonxitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const t = Date.parse(row.updated_at || row.created_at || "");
      if (t && t < cutoff) continue;
      expect += 1;
      assert.ok(
        filtered.some((f) => f.id === `ga:${row.id}`),
        `missing ga:${row.id}`
      );
    }
    assert.strictEqual(filtered.length, expect);
  });
}

module.exports = { runFireTests };

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
  (async () => {
    await runFireTests(test, testAsync);
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  })();
}
