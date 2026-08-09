# Fuentes de datos

Inventario de fuentes consideradas para **Fuegos Vivos**, qué aporta cada una y si encaja en un sitio estático en el navegador (GitHub Pages, sin backend).

## Resumen

| Fuente | Ámbito | Tipo | En vivo | CORS navegador | En Fuegos Vivos | Notas |
|--------|--------|------|---------|----------------|-----------------|-------|
| [JCyL incendios-forestales](https://analisis.datosabiertos.jcyl.es/explore/dataset/incendios-forestales/) | Castilla y León (9 provincias) | Partes oficiales (JSON ODS) | Sí (partes diarios) | Sí (`*`) | **Sí** — puntos + resumen | Filtramos: sin `fecha_extinguido`, estado ACTIVO/CONTROLADO/ESTABILIZADO, parte ≤3 días |
| [incendios.gal](https://incendios.gal/) API | Galicia | Avisos cidadáns (JSON) | Sí | Sí (`*`) | **Sí** — puntos Galicia | No oficial; filtramos tipos lume/fume/queimada/medios/afectación, ≤14 días |
| [EFFIS / Copernicus EMS](https://forest-fire.emergency.copernicus.eu/) WMS | Europa (toda España) | Hotspots VIIRS + área quemada | Sí (satélite) | Sí (teselas WMS) | **Sí** — capas mapa | Detecciones, **no** despachos de extinción |
| [fogos.pt](https://fogos.pt) / `api-lb.fogos.pt` | Portugal | Despachos ANEPC (JSON) | Sí | **No** (CORS) desde github.io | Solo **enlace** | API útil con proxy/servidor; no desde SPA estática |
| [ppetru/incidents-pt](https://github.com/ppetru/incidents-pt) | Portugal | Espejo scrape ANEPC → JSON en GitHub | ~horario | Sí (raw GitHub) | No (candidato) | Incluye todos los incidentes; filtrar incendios (`Natureza` 31xx) |
| ICNF `fogos.icnf.pt` webservice | Portugal | Inventario/rural (XML grande) | Histórico / pesado | Variable | No | ~MB de XML; mal encaje para SPA en vivo |
| ANEPC / prociv ArcGIS | Portugal | Oficial GIS | Sí | A menudo **no** | No | Auth / CORS hostiles para SPA |
| [EGIF / MITECO](https://www.miteco.gob.es/es/biodiversidad/temas/incendios-forestales/estadisticas-datos.html) | España | Estadística consolidada (partes anuales) | No (histórico) | N/A (buscador/XML) | No | Base nacional de referencia; no feed diario de operaciones |
| Portales CCAA (WMS/WFS/ArcGIS) | Por comunidad | Riesgo, perímetros históricos, a veces campañas | Variable | Variable | No | Asturias/Cantabria/PV/Navarra sin parte vivo CORS comparable |
| NASA FIRMS / similares | Global | Hotspots satélite | Sí | Depende del endpoint | No | Solapado con EFFIS para nuestro uso |

## En uso

### Junta de Castilla y León (oficial)

- **URL API:** `https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/incendios-forestales/records`
- **Catálogo:** [incendios-forestales](https://analisis.datosabiertos.jcyl.es/explore/dataset/incendios-forestales/)
- **Qué usamos:** municipio, provincia, posición, situación, fechas de inicio/parte/extinción, superficie, medios de extinción (texto → operativos / terrestres / aéreos).
- **Criterio “en curso”:** `fecha_extinguido` vacía; situación en `ACTIVO`, `CONTROLADO`, `ESTABILIZADO`; último parte en los últimos 3 días.
- **Por qué es especial:** una de las pocas CCAA con API abierta JSON usable directamente desde el navegador.

### incendios.gal (Galicia, cidadán)

- **API:** `https://incendios.gal/api/incidencias` (filtros `data`, `tipo`) — docs en [desenvolvedores](https://incendios.gal/desenvolvedores)
- **Qué usamos:** avisos con tipos relacionados con lume/fume/queimada/medios/afectación, ≤14 días, con coordenadas.
- **Importante:** **no es oficial**; es un mapa colaborativo. Complementa EFFIS en Galicia.

### EFFIS / Copernicus (satélite)

- **WMS:** `https://maps.effis.emergency.copernicus.eu/effis`
- **Capas:** `viirs.hs` (hotspots), área quemada.
- **Cobertura en la app:** toda España navegable; vista por defecto = norte (Galicia → Navarra).
- **Límite:** un píxel caliente no es un parte de extinción ni un municipio confirmado.

### fogos.pt (Portugal)

- Referencia de producto e inspiración de UI.
- En la app: **solo enlace** a [fogos.pt](https://fogos.pt).
- Su API (`api-lb.fogos.pt/new/fires`) responde bien desde servidor/CI, pero **no envía CORS** usable desde Pages.

## Evaluadas / no integradas (aún)

### Portugal sin fogos.pt

| Opción | Pros | Contras |
|--------|------|---------|
| Espejo [incidents-pt](https://github.com/ppetru/incidents-pt) | CORS vía GitHub raw; actualiza a menudo | Tercero; hay que filtrar tipo incendio; no es ANEPC “oficial” directo |
| ICNF XML | Oficial ICNF | Volumen enorme; modelo inventarial |
| ArcGIS ANEPC/prociv | Oficial | CORS / acceso poco amigable para SPA |

### Resto de España

No hay un feed nacional **diario** abierto tipo “todos los incendios activos con coordenadas y medios”.

- **EGIF (MITECO):** consolidación estadística a partir de partes de las CCAA; buscador y descargas, no mapa operativo en vivo.
- **CCAA:** muchas publican riesgo de incendio, perímetros de campañas pasadas o WMS/WFS históricos (p. ej. REDIAM Andalucía, servicios de Galicia, Madrid, Castilla-La Mancha, Comunitat Valenciana). Casi ninguna ofrece un JSON de partes activos con CORS comparable al de JCyL.

Hasta que exista otra fuente abierta usable en el navegador, el resto de España se cubre con **EFFIS**.

## Cómo se combina en el mapa

```text
┌─────────────────────────────────────────────┐
│  Mapa norte ES (MapLibre)                   │
│  · Capas EFFIS                              │
│  · Marcadores JCyL (CyL)                    │
│  · Marcadores incendios.gal (Galicia)       │
│  · Portugal → enlace fogos.pt               │
└─────────────────────────────────────────────┘
```

- **Tamaño del punto:** magnitud aproximada (medios + hectáreas + estado).
- **Opacidad:** lo reciente del último parte.
- **Selección:** anillo/pulso naranja + tarjeta destacada.

## Enlaces rápidos

| Recurso | Enlace |
|---------|--------|
| JCyL dataset | https://analisis.datosabiertos.jcyl.es/explore/dataset/incendios-forestales/ |
| incendios.gal | https://incendios.gal/ |
| EFFIS | https://forest-fire.emergency.copernicus.eu/ |
| fogos.pt | https://fogos.pt |
| EGIF / MITECO | https://www.miteco.gob.es/es/biodiversidad/temas/incendios-forestales/estadisticas-datos.html |
| incidents-pt | https://github.com/ppetru/incidents-pt |
| Código de esta app | https://github.com/guaka/fuegos |

## Actualizar este documento

Si se añade una CCAA u otra fuente PT, actualizar la tabla del resumen y la sección correspondiente, y mencionar el cambio en [`README.md`](./README.md) y [`about.html`](./about.html).
