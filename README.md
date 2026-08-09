# Fuegos Vivos

Mapa público de incendios en **toda España**, al estilo de [fogos.pt](https://fogos.pt).

Sitio estático (`index.html` + `index.js`). Sin build. Licencia **AGPL-3.0**.

## Datos

Resumen corto; detalle y comparación en **[DATA.md](./DATA.md)** (tablas de fuentes).

- **Oficiales en vivo:** [incendios-forestales](https://analisis.datosabiertos.jcyl.es/explore/dataset/incendios-forestales/) (JCyL) — Castilla y León.
- **Galicia:** avisos cidadáns [incendios.gal](https://incendios.gal/).
- **Resto de España:** detecciones [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) (vía proxy) + [EFFIS](https://forest-fire.emergency.copernicus.eu/) opcional.
- **Portugal:** despachos [fogos.pt](https://fogos.pt) vía Cloudflare Worker (`/fires`).

La interfaz sigue el patrón de fogos.pt: barra naranja, tarjetas, mapa y capas.

## Páginas

- [`index.html`](./index.html) — mapa en vivo
- [`about.html`](./about.html) — cobertura geográfica y fuentes
- [`DATA.md`](./DATA.md) — fuentes de datos (tablas)

```bash
python3 -m http.server 8080
```

Abre `http://localhost:8080`.

## GitHub Pages

El workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) publica el sitio en cada push a `main`/`master`.

1. Crea el repositorio en GitHub y sube el código.
2. En **Settings → Pages → Build and deployment**, elige **GitHub Actions**.
3. Tras el primer deploy, la URL será `https://<usuario>.github.io/<repo>/`.

No hay paso de build: se sirven `index.html` e `index.js` tal cual.

## CI

```bash
npm test          # unit + fixture + live API smoke (node ci/test.cjs)
npm run test:e2e  # Playwright map e2e (mocked feeds)
npm run test:all  # both
```

Shared filter logic lives in [`lib/fires.js`](./lib/fires.js) (used by the map and tests) so we do not silently drop CyL / Galicia points.

Behaviour specs for agents live under [`openspec/`](./openspec/) (`openspec validate --specs`).

GitHub Actions runs unit tests and Playwright on push/PR ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Licencia

GNU Affero General Public License v3.0 — ver [LICENSE](./LICENSE).
