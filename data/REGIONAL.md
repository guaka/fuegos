# Regional sources — backlog

What is **live** in Fuegos, what is worth **looking into later**, and what to **avoid**.

For the live inventory (URLs, filters, Worker paths), see [`DATA.md`](../DATA.md).

## Live now

| Source | Scope | Kind |
|--------|--------|------|
| JCyL open data | Castilla y León | Official partes |
| Bombers CAT FeatureServer | Cataluña | Vegetation despachos |
| INFOCA FeatureServer | Andalucía | Open incidents |
| INFOCAM FeatureServer | Castilla-La Mancha | Forestal partes |
| Aragón IDEAragon WFS | Aragón | Active points (sparse props) |
| incendios.gal API | Galicia | Citizen avisos (not official) |
| fogos.pt via Worker | Portugal | ANEPC-shaped despachos |
| NASA FIRMS via Worker | Spain | Satellite heat (not partes) |
| EFFIS WMS | Europe | Optional satellite tiles |

Pattern for a new CCAA: Worker path + `filter*Rows` in `lib/fires.js` (same as Bombers / INFOCA / INFOCAM / Aragón).

---

## Look into later (potential)

Promising for a future wire **if** the blocker clears. Re-check before writing code.

### 1. 112 Comunitat Valenciana — highest priority

| | |
|--|--|
| **Why** | Live emergency map with forestal / incendio incidents; peers already show CV points. |
| **Map** | https://www.112cv.gva.es/WebPublica-MapasOnLineV2/incidentes.jsf |
| **Client** | `…/js/initIncidentes.js` (OpenLayers ImageWMS) |
| **GeoServer** | `https://www.112cv.gva.es/geoserver/cv112/wms?` |
| **Layer** | `gis112cv:V_INCIDENTES_CURSO` (also `V_INCIDENTES_EN_CURSO`, alerts) |
| **Wire plan** | Worker `GET /cv112` → WFS `GetFeature` `typeName=gis112cv:V_INCIDENTES_CURSO` `outputFormat=application/json` |
| **Useful fields** | `TITULO_ES`, `CREATED`, `DESCRIPCION_ES` / `_VA`, `MUNICIPIO`, `DIRECCION` — filter forestal / “incendio” |
| **Blocker (2026-08-09)** | GeoServer returns `Service WMS is disabled` / `Service WFS is disabled` (even with JSF session + Referer). |

Re-probe:

```bash
curl -sS 'https://www.112cv.gva.es/geoserver/cv112/wms?SERVICE=WMS&REQUEST=GetCapabilities' | head
```

When OWS works again: implement `/cv112` + `filterCv112Rows` — do **not** scrape third-party mirrors in the meantime (see below).

### 2. EUMETSAT LSA-SAF MSG-FRP (satellite denser than VIIRS)

| | |
|--|--|
| **Why** | Geo stationary FRP ~15 min; fills gaps between FIRMS VIIRS passes. |
| **WMS** | `https://adaguc.lsasvcs.ipma.pt/adagucserver?DATASET=MSG-FRP&` |
| **Layer** | `FRP` |
| **GFI** | `INFO_FORMAT=application/json` — `frp`, `fire_confidence`, `obs_time` (CORS `*`) |
| **Caveat** | Not CCAA partes. No bulk FeatureCollection — only GetFeatureInfo per pixel or GetMap tiles. |
| **Wire plan** | Optional Worker `/lsasaf-frp` (tile proxy or sparse GFI grid), or WMS layer like EFFIS. |

### 3. Portugal without fogos.pt (fallback only)

| Option | Notes |
|--------|--------|
| [incidents-pt](https://github.com/ppetru/incidents-pt) | GitHub-raw JSON mirror; filter natureza `31xx`. Third party — prefer fogos.pt Worker. |
| ICNF / ANEPC ArcGIS | Official but heavy XML or hostile CORS/auth — last resort. |

### 4. Soft / weak leads (revisit if something changes)

- **Madrid INFOMA / IDEM** — public FeatureServers appear for campaign perímetros (`Incendios_2026`); watch for an *open status* layer, not only burned polygons.
- **Extremadura INFOEX** — only prevention / ZAR / press today; if they publish a FeatureServer of active fires, treat like INFOCAM.
- **Asturias / Cantabria / La Rioja** — empty or missing public incident services; re-scan geoportals yearly.
- **datos.gob.es** — new “incendios activos” datasets that are not FIRMS wrappers.

---

## Do not use

These look fire-related but are the **wrong product** for Fuegos (live ops points with status), or are unsafe / non-official substitutes.

| Source | Why not |
|--------|---------|
| **Third-party “CV112” / incendiosespeña-style APIs** | Not GVA. Remapped schemas, fragile, ToS/ethics. Wait for 112CV GeoServer. |
| **ICV `prevencion_de_incendios` MapServer** | Historical perímetros (1993–2024), not live incidents. |
| **Navarra IDENA `FOREST_Pol_HcoIncendio*`** | Historical perímetros only. |
| **Murcia `RIESGOS_112_INFOMUR` / FWI / ZAR** | Risk indices, not open fires. |
| **Murcia `IncendioGarres_*` stubs** | Empty / one-off event layers. |
| **Illes Balears `GOIB_RiscIncendi_IB`** | Risk, not activos. |
| **Canarias GRAFCAN ZARI** | Risk / zoning, not live status. |
| **Madrid campaign perímetros only** | Season polygons ≠ active parte feed. |
| **Extremadura INFOEX HTML visors** | No public active GeoJSON; don’t scrape HTML for production. |
| **FIDIAS HTML listado (C-LM)** | Superseded by INFOCAM FeatureServer — don’t scrape. |
| **MITECO EGIF / daily PDF bulletins** | Statistics or PDFs without a machine-readable live ops API. |
| **EGIF public search** | Historical PIF export, not a live map feed. |
| **datos.gob.es hits that wrap FIRMS/EFFIS** | Duplicate satellite we already have. |
| **Euskadi geo endpoints that 403/404** | No usable public incident JSON found. |
| **Asturias `Servicio_Emergencias` empty folder** | Directory exists; no layers to query. |
| **Survey123 / token-gated edit layers** | Auth required — not for a public AGPL SPA. |
| **ICNF giant XML dumps** | Inventory / rural backlog; too heavy for SPA refresh. |

---

## Criteria for a “good” new source

1. Public HTTPS, no login / Survey123 token.
2. GeoJSON, ArcGIS `query` (`f=geojson`), or WFS `application/json`.
3. Points (or polygons with a usable centroid) **and** a status/date field for open/active.
4. Prefer Worker proxy if browser CORS is missing (same as FIRMS / fogos / Aragón).
5. Label provenance clearly in UI (`Oficial` / `Aviso` / `Despacho` / `Satélite`).

---

## Changelog (research)

- **2026-08** — Wired INFOCAM + Aragón; deep scan of remaining CCAA.
- **2026-08-09** — Re-hunt: 112CV fully reverse-engineered but OWS disabled; LSA-SAF FRP GFI confirmed; no other official wire-now feed.
