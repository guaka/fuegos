# Map SPA

## Purpose

Define the static Fuegos Vivos map experience: Iberian wildfire markers, FIRMS
detections, layer toggles, sidebar summary, and a non-WebGL fallback for Lockdown Mode.

## Requirements

### Requirement: Default map engines

The SPA MUST use MapLibre when WebGL is usable. When WebGL is unavailable (or MapLibre
reports unsupported), the SPA MUST load Leaflet and render an equivalent raster map
instead of a blank canvas.

#### Scenario: Lockdown Mode / no WebGL

- **GIVEN** `canUseMapLibre()` is false
- **WHEN** the app boots
- **THEN** Leaflet MUST initialize on `#map` and status SHOULD mention compatible / sin WebGL mode

### Requirement: Layer toggles

Users MUST be able to toggle CyL oficiales, Galicia, Portugal (fogos.pt), FIRMS
detections, optional EFFIS tiles, burned area, relief (MapLibre only), and basemap satellite.

#### Scenario: Hide Portugal layer

- **GIVEN** Portugal fires are loaded
- **WHEN** `#layer-portugal` is unchecked
- **THEN** fogos.pt markers MUST disappear from the map and sidebar lists filtered by that layer

### Requirement: Sidebar overview

The overview MUST surface national FIRMS count, CyL oficiales by province, Galicia avisos,
and Portugal fogos.pt — without a long list of empty per-CCAA “ver mapa” sat cards.

#### Scenario: National sat card

- **GIVEN** FIRMS GeoJSON loaded with N features
- **WHEN** the overview renders
- **THEN** a card MUST show N detecciones and fly-to-all behavior

### Requirement: Hobby disclaimer

The UI MUST keep a visible experimental / non-official emergency disclaimer including 112.

#### Scenario: Footer warning

- **GIVEN** the main map page
- **WHEN** a user scrolls the sidebar footer
- **THEN** `.footnote-warn` MUST mention experimental software and 112

### Requirement: No direct blocked upstreams

The browser MUST NOT call `api-lb.fogos.pt` or NASA FIRMS CSV URLs directly; it MUST use
`fuegos-proxy.crew.workers.dev` paths for those feeds.

#### Scenario: Contract in CI

- **GIVEN** `index.js` source
- **WHEN** CI contract tests run
- **THEN** they MUST assert Worker URLs are present and `api-lb.fogos.pt` is absent
