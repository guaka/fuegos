// @ts-check
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const fixtures = path.join(__dirname, "..", "fixtures");
const jcylSample = JSON.parse(fs.readFileSync(path.join(fixtures, "jcyl-sample.json"), "utf8"));
const gaSample = JSON.parse(fs.readFileSync(path.join(fixtures, "galicia-sample.json"), "utf8"));

/** Build a JCyL ODS-like page response from fixture rows (only "keepable" ones for live map). */
function jcylApiBody() {
  // Use only rows that should appear after reduce at fixture.now — but browser uses Date.now().
  // So rewrite parte dates to "today" for e2e determinism.
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
    // Soft-fail remote tiles so map still boots offline-ish
    await page.route("**/basemaps.cartocdn.com/**", (route) => route.abort());
    await page.route("**/elevation-tiles-prod/**", (route) => route.abort());
    await page.route("**/maps.effis.emergency.copernicus.eu/**", (route) => route.abort());
  });

  test("loads lib/fires and shows all mocked CyL + Galicia markers", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    await page.goto("/");
    await expect(page.locator("#map")).toBeVisible();
    await expect(page.locator("#ticker")).not.toHaveText(/Cargando/i, { timeout: 30_000 });

    // Wait until status mentions CyL counts
    await expect(page.locator("#status-line")).toContainText(/CyL/i, { timeout: 30_000 });

    const markerCount = await page.locator(".map-marker").count();
    const expectedJcyl = jcylApiBody().results;
    // Deduped CyL + 2 Galicia
    const FF = require("../../lib/fires.js");
    const reduced = FF.reduceJcylRows(expectedJcyl);
    const expected = reduced.length + 2;
    expect(markerCount).toBe(expected);
    expect(pageErrors).toEqual([]);
  });

  test("sidebar lists CyL oficiales before sat regions", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".panel-title").first()).toContainText(/Castilla y León/i, {
      timeout: 30_000,
    });
    await expect(page.locator(".region-card").first()).toBeVisible();
  });

  test("hobby warning is visible in the footer", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".footnote-warn")).toContainText(/experimental/i);
    await expect(page.locator(".footnote-warn")).toContainText(/112/);
  });

  test("Aquí locate control is on the map", async ({ page }) => {
    await page.goto("/");
    const locate = page.locator("#btn-locate.map-locate");
    await expect(locate).toBeVisible();
    await expect(page.locator("header #btn-locate")).toHaveCount(0);
    await expect(page.locator("#btn-recenter")).toHaveCount(0);
    await expect(page.locator("#btn-toggle-list")).toHaveCount(0);
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
});
