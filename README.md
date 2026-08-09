# Fuegos Vivos

Mapa público de incendios en **España** (península y Baleares; Canarias navegable), al estilo de [fogos.pt](https://fogos.pt).

Sitio estático (`index.html` + `index.js`). Sin build. Licencia **AGPL-3.0**.

## Datos

Resumen corto; detalle y comparación en **[DATA.md](./DATA.md)** (tablas de fuentes).

- **Oficiales en vivo:** [incendios-forestales](https://analisis.datosabiertos.jcyl.es/explore/dataset/incendios-forestales/) (JCyL) — Castilla y León, solo partes en curso (sin extinción, parte reciente).
- **Resto de España:** capas WMS [EFFIS / Copernicus EMS](https://forest-fire.emergency.copernicus.eu/) (detecciones satélite, no despachos). No hay un feed nacional abierto diario comparable.
- **Portugal:** enlace a [fogos.pt](https://fogos.pt).

La interfaz sigue el patrón de fogos.pt: barra naranja, tarjetas, mapa y capas.

## Páginas

- [`index.html`](./index.html) — mapa en vivo
- [`about.html`](./about.html) — cobertura geográfica (texto + mapa)
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
node ci/test.cjs
```

GitHub Actions runs the same suite on push/PR ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): file contracts, JS syntax, resource/status helpers, and smoke checks for JCyL and EFFIS.

## Licencia

GNU Affero General Public License v3.0 — ver [LICENSE](./LICENSE).
