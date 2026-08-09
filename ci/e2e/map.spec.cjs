// @ts-check
const { test, expect } = require("@playwright/test");
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
        geometry: { type: "Point", coordinates: [-5.6, 41.5] },
        properties: {
          id: "firms:test:1",
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
          id: "firms:test:2",
          confidence: "high",
          frp: 40,
          acq_date: "2026-08-09",
          acq_time: "1210",
          source: "FIRMS",
        },
      },
    ],
  };
}

test.describe("Fuegos Vivos map e2e", () => {
  test.beforeEach(async ({ page }) => {
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
    // Soft-fail remote tiles so map still boots offline-ish
    await page.route("**/basemaps.cartocdn.com/**", (route) => route.abort());
    await page.route("**/elevation-tiles-prod/**", (route) => route.abort());
    await page.route("**/maps.effis.emergency.copernicus.eu/**", (route) => route.abort());
  });

  test("loads lib/fires and shows CyL + Galicia + Portugal markers", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    await page.goto("/");
    await expect(page.locator("#map")).toBeVisible();
    await expect(page.locator("#ticker")).not.toHaveText(/Cargando/i, { timeout: 30_000 });
    await expect(page.locator("#ticker")).toContainText(/CyL/i, { timeout: 30_000 });
    await expect(page.locator("#ticker")).toContainText(/PT/i);

    const markerCount = await page.locator(".map-marker").count();
    const FF = require("../../lib/fires.js");
    const reduced = FF.reduceJcylRows(jcylApiBody().results);
    const pt = FF.filterFogosRows(fogosSample);
    const expected = reduced.length + 2 + pt.length;
    expect(markerCount).toBe(expected);
    expect(await page.locator(".map-marker.pt").count()).toBe(pt.length);
    expect(pageErrors).toEqual([]);
  });

  test("sidebar starts with national sat then CyL", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".panel-title").first()).toContainText(/Toda España/i, {
      timeout: 30_000,
    });
    await expect(page.locator(".region-card.is-firms")).toContainText(/2/);
    await expect(page.locator(".panel-title").nth(1)).toContainText(/Castilla y León/i);
    await expect(page.getByText("Portugal · fogos.pt")).toBeVisible();
  });

  test("hobby warning is visible in the footer", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".footnote-warn")).toContainText(/experimental/i);
    await expect(page.locator(".footnote-warn")).toContainText(/112/);
  });

  test("header puts Mapa and Sobre together", async ({ page }) => {
    await page.goto("/");
    const actions = page.locator(".top-actions");
    await expect(actions.locator("#btn-layers")).toHaveText(/Mapa/i);
    await expect(actions.locator('a.top-btn[href="#about"]')).toHaveText(/Sobre/i);
    await expect(page.locator(".layers-head")).toHaveCount(0);
  });

  test("Aquí locate control is on the map", async ({ page }) => {
    await page.goto("/");
    const locate = page.locator("#btn-locate.map-locate");
    await expect(locate).toBeVisible();
    await expect(page.locator("header #btn-locate")).toHaveCount(0);
    await expect(page.locator("#btn-recenter")).toHaveCount(0);
    await expect(page.locator("#btn-toggle-list")).toHaveCount(0);
  });

  test("Portugal layer toggle hides PT markers", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".map-marker.pt").first()).toBeVisible({ timeout: 30_000 });
    const before = await page.locator(".map-marker.pt").count();
    expect(before).toBeGreaterThan(0);
    await page.locator("#btn-layers").click();
    await expect(page.locator("#layers-panel")).toBeVisible();
    await page.locator("#layer-portugal").uncheck();
    await expect(page.locator(".map-marker.pt")).toHaveCount(0);
  });

  test("selecting a fire opens detail without losing the fire", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".map-marker").first()).toBeVisible({ timeout: 30_000 });
    const before = await page.locator(".map-marker").count();
    await page.locator(".map-marker").first().click();
    await expect(page.locator("#sidebar.is-detail")).toBeVisible();
    await expect(page.locator("article.card.is-selected")).toBeVisible();
    const after = await page.locator(".map-marker").count();
    expect(after).toBe(before);
  });

  test("mobile map-first sheet peeks then expands", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("#map")).toBeVisible();
    await expect(page.locator("#btn-sheet")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#sidebar")).not.toHaveClass(/is-sheet-open/);
    // List body hidden while peeking
    await expect(page.locator("#fire-list")).toBeHidden();
    await page.locator("#btn-sheet").click();
    await expect(page.locator("#sidebar")).toHaveClass(/is-sheet-open/);
    await expect(page.locator("#fire-list")).toBeVisible();
    await expect(page.locator(".panel-title").first()).toContainText(/Toda España/i);
  });
});
