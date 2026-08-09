# Fuegos Vivos

Mapa público de incendios alrededor de **León**, **Salamanca** y **Badajoz**, al estilo de [fogos.pt](https://fogos.pt).

Sitio estático de dos archivos (`index.html` + `index.js`). Sin build. Licencia **AGPL-3.0**.

## Datos

- **Castilla y León (León / Salamanca):** partes oficiales del dataset [incendios-forestales](https://analisis.datosabiertos.jcyl.es/explore/dataset/incendios-forestales/) (Junta de Castilla y León).
- **Badajoz y contexto satélite:** capas WMS de [EFFIS / Copernicus EMS](https://forest-fire.emergency.copernicus.eu/) (hotspots VIIRS y área quemada reciente).

Las detecciones satélite no son despachos de extinción.

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

El workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) comprueba archivos, sintaxis de `index.js`, contratos básicos del HTML/JS y humo de las APIs JCyL y EFFIS.

## Licencia

GNU Affero General Public License v3.0 — ver [LICENSE](./LICENSE).
