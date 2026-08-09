# CORS proxy

## Purpose

Define the Cloudflare Worker that unlocks fogos.pt and NASA FIRMS for the SPA
origins without becoming an open proxy.

## Requirements

### Requirement: Locked upstreams only

The Worker MUST only proxy known paths: `GET /fires` → fogos.pt fires JSON and
`GET /firms` → FIRMS Europe CSVs reduced to Spain GeoJSON. Other paths MUST 404.

#### Scenario: Unknown path

- **GIVEN** `GET /random`
- **WHEN** the Worker handles the request
- **THEN** the response MUST be 404 with a hint to `/firms` or `/fires`

### Requirement: CORS for the SPA origin

Browser calls from `https://fuegos.guaka.org`, `https://guaka.github.io`, and local
static origins listed in `ALLOWED_ORIGINS` MUST receive
`Access-Control-Allow-Origin` for that origin. OPTIONS preflight MUST succeed for GET.

#### Scenario: custom domain Origin

- **GIVEN** `Origin: https://fuegos.guaka.org`
- **WHEN** `GET /fires` or `GET /firms` succeeds
- **THEN** CORS headers MUST allow that origin

#### Scenario: github.io Origin

- **GIVEN** `Origin: https://guaka.github.io`
- **WHEN** `GET /fires` or `GET /firms` succeeds
- **THEN** CORS headers MUST allow that origin

### Requirement: Caching

Fogos responses MUST be cacheable briefly (~60s). FIRMS GeoJSON MUST be cacheable
longer (~300s) to reduce upstream load.

#### Scenario: Cache header on miss

- **GIVEN** a successful upstream fetch
- **WHEN** the Worker returns the body
- **THEN** `Cache-Control` MUST be present and `X-Proxy-Cache` SHOULD indicate MISS or HIT

### Requirement: FIRMS reduction

`/firms` MUST filter to Spain (including Balears/Canarias), drop low confidence, and
cluster roughly at 0.05° before returning a FeatureCollection.

#### Scenario: FeatureCollection shape

- **GIVEN** upstream Europe CSVs are available
- **WHEN** `GET /firms` returns 200
- **THEN** the body MUST be GeoJSON with `features` array and each point having FIRMS properties
