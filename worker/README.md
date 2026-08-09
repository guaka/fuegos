# fuegos-proxy (Cloudflare Worker)

Small CORS proxy so the GitHub Pages SPA can read fogos.pt and NASA FIRMS.

## Endpoints

| Path | Upstream |
|------|----------|
| `GET /fires` | `https://api-lb.fogos.pt/new/fires` |
| `GET /firms` | NASA FIRMS VIIRS Europe CSVs → Spain GeoJSON |

CORS for `https://guaka.github.io` (+ local static servers).

## One-time setup

1. Cloudflare account: https://dash.cloudflare.com/sign-up/workers-and-pages  
2. From this folder:

```bash
cd worker
npm install
npx wrangler login   # browser OAuth — Allow
```

## Local test

```bash
npm run dev
# then:
curl -s http://127.0.0.1:8787/fires | head -c 200
```

## Deploy

```bash
npm run deploy
```

Copy the printed URL, e.g. `https://fuegos-proxy.<you>.workers.dev/fires`.

## Wire the SPA

`index.js` calls:

- `https://fuegos-proxy.crew.workers.dev/fires`
- `https://fuegos-proxy.crew.workers.dev/firms`

Keep origins in `src/index.js` (`ALLOWED_ORIGINS`) in sync with where the site is served.

## Notes

- Upstream often wants a real `User-Agent` (bare curl can get 403).
- Not an open proxy: only `/fires` and `/firms`.
- Cache ~60s (fogos) / ~300s (FIRMS).
