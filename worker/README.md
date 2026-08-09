# fuegos-proxy (Cloudflare Worker)

Small CORS proxy so the GitHub Pages SPA can read `api-lb.fogos.pt/new/fires`.

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

## Wire the SPA later

Point `index.js` at that `/fires` URL (not `api-lb.fogos.pt` directly). Keep origins in `src/index.js` (`ALLOWED_ORIGINS`) in sync with where the site is served.

## Notes

- Upstream often wants a real `User-Agent` (bare curl can get 403).
- Not an open proxy: only `/fires` → fogos.
- Cache ~60s to be gentle on fogos.
