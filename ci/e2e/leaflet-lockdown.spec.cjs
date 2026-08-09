// @ts-check
const { test, expect } = require("@playwright/test");
const {
  installApiMocks,
  forceLeafletLockdown,
  jcylApiBody,
  fogosSample,
  firmsGeo,
} = require("./helpers.cjs");

test.describe("Leaflet Lockdown Mode fallback", () => {
  test.beforeEach(async ({ page }) => {
    await forceLeafletLockdown(page);
    await installApiMocks(page);
  });

  test("boots Leaflet when WebGL is unavailable", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    await page.goto("/");
    await expect(page.locator("#map")).toBeVisible();
    await expect(page.locator("#map")).toHaveClass(/is-leaflet/, { timeout: 30_000 });
    await expect(page.locator(".map-wrap")).toHaveClass(/is-leaflet/);
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(page.locator(".maplibregl-canvas")).toHaveCount(0);
    await expect(page.locator("#ticker")).toContainText(/sin WebGL|CyL|sat|PT/i, { timeout: 30_000 });
    expect(pageErrors).toEqual([]);
  });

  test("shows CyL + Galicia + Portugal HTML markers on Leaflet", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#map.is-leaflet")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#ticker")).not.toHaveText(/Cargando/i, { timeout: 30_000 });
    await expect(page.locator("#ticker")).toContainText(/CyL/i, { timeout: 30_000 });
    await expect(page.locator("#ticker")).toContainText(/PT/i);

    const FF = require("../../lib/fires.js");
    const reduced = FF.reduceJcylRows(jcylApiBody().results);
    const pt = FF.filterFogosRows(fogosSample);
    const expected = reduced.length + 2 + pt.length;

    await expect(page.locator(".map-marker")).toHaveCount(expected, { timeout: 30_000 });
    await expect(page.locator(".map-marker.pt")).toHaveCount(pt.length);
    await expect(page.locator(".fuegos-marker-wrap .map-marker").first()).toBeVisible();
  });

  test("FIRMS satélite points render across Spain (not NW-only)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#map.is-leaflet")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#ticker")).toContainText(/sat/i, { timeout: 30_000 });

    // Leaflet canvas/SVG circle markers for FIRMS (not .map-marker buttons).
    const firmCount = firmsGeo().features.length;
    await expect
      .poll(async () => page.locator(".leaflet-overlay-pane path, .leaflet-overlay-pane canvas").count(), {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);

    await page.locator("#btn-sheet").click();
    await expect(page.locator(".region-card.is-firms")).toContainText(String(firmCount), {
      timeout: 15_000,
    });
    await expect(page.locator(".region-card.is-firms .source-badge.sat")).toBeVisible();
  });

  test("HTML markers are spread on screen (not piled top-left)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("#map.is-leaflet")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".map-marker").first()).toBeVisible({ timeout: 30_000 });

    // Allow delayed invalidateSize retries from scheduleLeafletResize.
    await page.waitForTimeout(500);

    const boxes = await page.locator(".map-marker").evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }))
    );
    expect(boxes.length).toBeGreaterThan(2);

    const xs = new Set(boxes.map((b) => b.x));
    const ys = new Set(boxes.map((b) => b.y));
    expect(xs.size).toBeGreaterThan(1);
    expect(ys.size).toBeGreaterThan(1);

    const mapBox = await page.locator("#map").boundingBox();
    expect(mapBox).toBeTruthy();
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(Math.floor(mapBox.x) - 2);
      expect(b.x).toBeLessThanOrEqual(Math.ceil(mapBox.x + mapBox.width) + 2);
      expect(b.y).toBeGreaterThanOrEqual(Math.floor(mapBox.y) - 2);
      expect(b.y).toBeLessThanOrEqual(Math.ceil(mapBox.y + mapBox.height) + 2);
    }
  });

  test("selecting a Leaflet marker opens sourced detail", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#map.is-leaflet .map-marker").first()).toBeVisible({ timeout: 30_000 });
    const before = await page.locator(".map-marker").count();
    await page.locator(".map-marker").first().click();
    await expect(page.locator("#sidebar.is-detail")).toBeVisible();
    await expect(page.locator("article.card.is-selected .source-badge")).toHaveText(
      /Oficial|Aviso|Despacho/i
    );
    expect(await page.locator(".map-marker").count()).toBe(before);
  });

  test("Portugal layer toggle works under Leaflet", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#map.is-leaflet .map-marker.pt").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.locator("#btn-layers").click();
    await page.locator("#layer-portugal").uncheck();
    await expect(page.locator(".map-marker.pt")).toHaveCount(0);
    await page.locator("#layer-portugal").check();
    await expect(page.locator(".map-marker.pt").first()).toBeVisible();
  });
});
