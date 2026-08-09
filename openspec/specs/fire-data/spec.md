# Fire data

## Purpose

Define how Fuegos Vivos turns upstream wildfire feeds into map-ready fire objects
and satellite detections, without silently dropping valid points or mislabeling sources.

Shared logic lives in `lib/fires.js`. FIRMS Spain filtering also runs in the Worker
(`/firms`) and MUST stay consistent with `pointInSpain`.

## Requirements

### Requirement: CyL official parts filter

The system MUST reduce JCyL `incendios-forestales` rows to current official fires in
Castilla y León only: active statuses, not extinguished, with coordinates, and a
recent enough parte window (`PARTE_LOOKBACK_DAYS`).

#### Scenario: Keep current CyL fire

- **GIVEN** a JCyL row in an official CyL province with status ACTIVO/CONTROLADO/ESTABILIZADO, no `fecha_extinguido`, coords, and parte within lookback
- **WHEN** `reduceJcylRows` runs
- **THEN** the fire MUST appear once with `source: "JCyL"` and `country: "ES"`

#### Scenario: Drop extinguished or foreign province

- **GIVEN** a row with `fecha_extinguido` set OR province outside CyL
- **WHEN** `reduceJcylRows` / `rejectReason` runs
- **THEN** the row MUST be excluded

### Requirement: Galicia citizen avisos filter

Galicia points MUST come from incendios.gal fire-related tipos only, with coordinates,
within `GALICIA_LOOKBACK_DAYS`, labeled as citizen (not official).

#### Scenario: Keep lume/fume aviso

- **GIVEN** an incidencia with an allowed `tipo.slug`, lat/lon, and recent timestamp
- **WHEN** `filterGaliciaRows` runs
- **THEN** a fire with `source: "incendios.gal"` MUST be returned

### Requirement: Portugal fogos.pt open rural fires

Portugal points MUST be loaded via the Worker proxy (not `api-lb.fogos.pt` from the browser).
Only rural fire natures (`naturezaCode` starting with `31`) that are still open
(not Conclusão/Encerrada) with coordinates MUST be shown.

#### Scenario: Keep Em Resolução / Vigilância / Despacho

- **GIVEN** a fogos payload row with `naturezaCode` 31xx, open status, and lat/lng
- **WHEN** `filterFogosRows` runs
- **THEN** a fire with `source: "fogos.pt"` and `country: "PT"` MUST be returned

#### Scenario: Drop Conclusão and non-rural

- **GIVEN** statusCode 8 (Conclusão) OR naturezaCode not starting with 31
- **WHEN** `filterFogosRows` runs
- **THEN** the row MUST be excluded

### Requirement: FIRMS Spain satellite detections

National satellite points MUST come from Worker `GET /firms` as GeoJSON (Europe VIIRS
filtered to Spain, confidence nominal/high, clustered). They MUST NOT be presented as
official extinguishment partes.

#### Scenario: Exclude Maghreb / France false positives

- **GIVEN** a FIRMS detection near Algiers or Toulouse
- **WHEN** `pointInSpain` is applied
- **THEN** the point MUST be rejected

#### Scenario: Keep peninsula / Balears / Canarias

- **GIVEN** detections in Madrid, Santiago, Mallorca, or Gran Canaria
- **WHEN** `pointInSpain` is applied
- **THEN** the point MUST be accepted

### Requirement: Status class mapping

Spanish and Portuguese status labels MUST map to shared CSS classes (`activo`,
`controlado`, `estabilizado`, `conclusao`) for markers and pills.

#### Scenario: Portuguese Vigilância

- **GIVEN** status text `Vigilância`
- **WHEN** `statusClass` runs
- **THEN** the result MUST be `estabilizado`
