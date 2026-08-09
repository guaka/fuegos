#!/usr/bin/env node
/**
 * Basic CI tests for Fuegos Vivos (no build / no deps).
 * Run: node ci/test.mjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

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
  const out = { man: 0, terrain: 0, aerial: 0 };
  if (!text) return out;
  const parts = String(text).split(";").map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^(\d+)\s+(.+)$/i);
    if (!m) continue;
    const n = Number(m[1]) || 0;
    const label = m[2].toUpperCase();
    if (
      /HT-|HK-|AA-|HELI|AVION|AVI[OÓ]N|MEDIO\s*A[EÉ]REO|BRIF\s*A[EÉ]RE/.test(label) ||
      /^AA\b/.test(label) ||
      /^HT\b/.test(label) ||
      /^HK\b/.test(label)
    ) {
      out.aerial += n;
    } else if (/AUTOBOMBA|BULDOZER|BULLDOZER|CAMI[OÓ]N|TERRESTRE|VEH[IÍ]CULO|NODRIZA/.test(label)) {
      out.terrain += n;
    } else if (
      /A\.?\s*M\.?|ELIF|CUADRILLA|T[EÉ]CNICO|BRIF|BOMBERO|OPERATIVO|PERSONAL|CONVOY/.test(label)
    ) {
      out.man += n;
    } else {
      out.man += n;
    }
  }
  return out;
}

function normalizeStatusKey(status) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function statusClass(status) {
  const s = normalizeStatusKey(status);
  if (s === "activo" || s === "em curso" || s === "chegada ao to" || s.startsWith("despacho")) {
    return "activo";
  }
  if (s === "controlado" || s === "em resolucao") return "controlado";
  if (s === "estabilizado" || s === "vigilancia") return "estabilizado";
  if (s === "conclusao" || s === "encerrada") return "conclusao";
  return "otro";
}

function parseFogosDate(date, hour) {
  const m = String(date || "").match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return Date.parse(`${date}T${hour || "00:00"}`) || 0;
  return Date.parse(`${m[3]}-${m[2]}-${m[1]}T${hour || "00:00"}`) || 0;
}

function inFocusBbox(lat, lng, bbox) {
  const [w, s, e, n] = bbox;
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

async function main() {
  test("required files exist", () => {
    for (const f of ["index.html", "index.js", "LICENSE", "README.md", ".nojekyll"]) {
      assert.ok(fs.existsSync(path.join(root, f)), missing(f));
    }
  });

  test("index.js is valid JavaScript", () => {
    require("child_process").execFileSync(process.execPath, ["--check", path.join(root, "index.js")], {
      stdio: "pipe",
    });
  });

  test("HTML has core UI hooks", () => {
    const html = read("index.html");
    for (const needle of [
      "Fuegos",
      'id="map"',
      'id="fire-list"',
      'id="sidebar"',
      'id="ticker"',
      'id="layer-oficiales"',
      'id="layer-portugal"',
      "./index.js",
      "maplibre-gl",
      "AGPL",
    ]) {
      assert.ok(html.includes(needle), `missing ${needle}`);
    }
  });

  test("index.js wires ES + PT + EFFIS sources", () => {
    const js = read("index.js");
    for (const needle of [
      "analisis.datosabiertos.jcyl.es",
      "api-lb.fogos.pt",
      "maps.effis.emergency.copernicus.eu",
      "parseResources",
      "normalizeFogosPt",
      "fetchFogosPtFires",
      "LEÓN",
      "SALAMANCA",
      "maplibregl",
      "isStyleLoaded",
    ]) {
      assert.ok(js.includes(needle), `missing ${needle}`);
    }
    assert.ok(
      !/\.\.\.\s*map\.getStyle\s*\(/.test(js),
      "must not call setStyle({...map.getStyle()}) — breaks MapLibre before load"
    );
    assert.ok(!js.includes("data/pt-fires.json"), "must not bake PT fires into static data files");
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

  test("statusClass maps ES and PT labels", () => {
    assert.strictEqual(statusClass("ACTIVO"), "activo");
    assert.strictEqual(statusClass("CONTROLADO"), "controlado");
    assert.strictEqual(statusClass("ESTABILIZADO"), "estabilizado");
    assert.strictEqual(statusClass("Em Curso"), "activo");
    assert.strictEqual(statusClass("Em Resolução"), "controlado");
    assert.strictEqual(statusClass("Vigilância"), "estabilizado");
    assert.strictEqual(statusClass("Conclusão"), "conclusao");
    assert.strictEqual(statusClass("Chegada ao TO"), "activo");
    assert.strictEqual(statusClass("Despacho de 1º Alerta"), "activo");
  });

  test("parseFogosDate understands DD-MM-YYYY", () => {
    const t = parseFogosDate("09-08-2026", "15:01");
    assert.ok(t > 0);
    const d = new Date(t);
    assert.strictEqual(d.getUTCFullYear(), 2026);
    assert.strictEqual(d.getUTCMonth(), 7);
    assert.strictEqual(d.getUTCDate(), 9);
  });

  test("focus bbox includes Portuguese border sample points", () => {
    const bbox = [-8.35, 38.45, -4.55, 43.45];
    assert.ok(inFocusBbox(41.636695, -7.33691, bbox)); // Vila Real
    assert.ok(inFocusBbox(40.569068, -7.509515, bbox)); // Guarda
    assert.ok(inFocusBbox(42.721508, -5.951445, bbox)); // León
    assert.ok(!inFocusBbox(38.7, -9.1, bbox)); // Lisboa area — west of focus
  });

  await testAsync("JCyL API responds", async () => {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 14);
    const iso = since.toISOString().slice(0, 10);
    const where =
      `fecha_del_parte >= date'${iso}'` +
      ` and provincia in ('LEÓN','SALAMANCA')` +
      ` and situacion_actual in ('ACTIVO','CONTROLADO','ESTABILIZADO')`;
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

  await testAsync("fogos.pt API responds", async () => {
    const res = await fetch("https://api-lb.fogos.pt/new/fires", {
      headers: {
        Accept: "application/json",
        "User-Agent": "FuegosVivos-CI/1.0",
      },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.success === true || Array.isArray(data.data));
    assert.ok(Array.isArray(data.data));
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
