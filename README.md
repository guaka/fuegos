# Fuegos Vivos

Mapa público de incendios alrededor de **León**, **Salamanca** y **Badajoz**, al estilo de [fogos.pt](https://fogos.pt).

Sitio estático de dos archivos (`index.html` + `index.js`). Sin build. Licencia **AGPL-3.0**.

## Datos

- **España — Castilla y León (León / Salamanca):** partes oficiales [incendios-forestales](https://analisis.datosabiertos.jcyl.es/explore/dataset/incendios-forestales/) (JCyL), con conteo de medios a partir del texto.
- **Portugal — distritos fronterizos:** incidentes de [fogos.pt](https://fogos.pt) (ANEPC). En GitHub Pages se sirven desde `data/pt-fires.json` (refresco en cada deploy / cada hora), porque la API pública no envía CORS usable desde el navegador.
- **Satélite:** capas WMS [EFFIS / Copernicus EMS](https://forest-fire.emergency.copernicus.eu/).

La interfaz sigue el patrón de fogos.pt: barra naranja, tarjetas, mapa y capas. Las detecciones satélite no son despachos de extinción.

## Uso local

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
node ci/test.cjs
```

GitHub Actions runs the same suite on push/PR ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): file contracts, JS syntax, resource/status helpers, and smoke checks for JCyL, fogos.pt, and EFFIS.

## Licencia

GNU Affero General Public License v3.0 — ver [LICENSE](./LICENSE).
