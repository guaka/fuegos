// @ts-check
const { test, expect } = require("@playwright/test");
const {
  installApiMocks,
  jcylApiBody,
  fogosSample,
  firmsGeo,
} = require("./helpers.cjs");

test.describe("Fuegos Vivos map e2e", () => {
  test.beforeEach(async ({ page }) => {
    await installApiMocks(page);
  });

  test("loads lib/fires and shows CyL + Galicia + Portugal markers", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    await page.goto("/");
    await expect(page.locator("#map")).toBeVisible();
    await expect(page.locator("#ticker")).not.toHaveText(/Cargando/i, { timeout: 30_000 });
    await expect(page.locator("#ticker")).toContainText(/\d+\s+incendio/i, { timeout: 30_000 });
    await expect(page.locator("#ticker")).toContainText(/\d+\s+sat/i);

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
    await expect(page.locator(".region-card.is-firms")).toContainText(String(firmsGeo().features.length));
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

  test("language switcher defaults to ES and can switch to EN", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.locator('.lang-btn[data-lang="es"]')).toHaveClass(/is-active/);
    await page.locator('.lang-btn[data-lang="en"]').click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("#btn-layers")).toHaveText(/^Map$/);
    await expect(page.locator("#link-about")).toHaveText(/^About$/);
    // Panel titles also switch with language.
    await expect(page.locator(".panel-title").first()).toContainText(/All of Spain/i, {
      timeout: 30_000,
    });
    await page.locator("#link-about").click();
    await expect(page.locator("#coverage-title")).toContainText(/Where it comes from/i);
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
    await expect(page.locator("article.card.is-selected .source-badge")).toBeVisible();
    await expect(page.locator("article.card.is-selected .source-badge")).toHaveText(
      /Oficial|Aviso|Despacho/i
    );
    const after = await page.locator(".map-marker").count();
    expect(after).toBe(before);
  });

  test("overview cards label source kind", async ({ page }) => {
    await page.goto("/");
    // Desktop: sidebar is already open (sheet handle is mobile-only).
    await expect(page.locator(".region-card.is-firms .source-badge.sat")).toContainText(/Satélite/i, {
      timeout: 30_000,
    });
    await expect(page.locator(".source-badge.oficial").first()).toBeVisible();
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
