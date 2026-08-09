/* Fuegos Vivos — AGPL-3.0 */
(function () {
  "use strict";

  const FF = globalThis.FuegosFires;
  if (!FF) {
    document.body.innerHTML =
      "<p style='padding:2rem;font-family:sans-serif'>Falta lib/fires.js — recarga o revisa el deploy.</p>";
    return;
  }

  const FOCUS = {
    center: [-3.5, 40.0],
    zoom: 5.4,
    // Península + Baleares (Canarias alcanzable al navegar)
    bbox: [-9.5, 35.95, 4.45, 43.85],
  };

  const {
    HISTORY_LOOKBACK_DAYS,
    reduceJcylRows,
    filterGaliciaRows,
    filterFogosRows,
    jcylWhereClause,
    isoDate,
    daysAgo,
    compareFires,
  } = FF;

  /**
   * Sidebar: live CyL + Galicia + one national FIRMS sat card (no per-CCAA fly-to spam).
   */
  const GALICIA_BBOX = [-9.35, 41.78, -6.7, 43.8];

  const REFRESH_MS = 5 * 60 * 1000;
  const JCYL_URL =
    "https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/incendios-forestales/records";
  const GALICIA_URL = "https://incendios.gal/api/incidencias";
  const FIRMS_URL = "https://fuegos-proxy.crew.workers.dev/firms";
  const FOGOS_URL = "https://fuegos-proxy.crew.workers.dev/fires";
  const EFFIS_WMS = "https://maps.effis.emergency.copernicus.eu/effis";

  const STREET_TILES = [
    "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
    "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
    "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
  ];
  const SAT_TILES = [
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  ];

  const els = {
    sidebar: document.getElementById("sidebar"),
    list: document.getElementById("fire-list"),
    status: document.getElementById("status-line"),
    ticker: document.getElementById("ticker"),
    search: document.getElementById("search"),
    btnToggleList: document.getElementById("btn-toggle-list"),
    btnLocate: document.getElementById("btn-locate"),
    btnRecenter: document.getElementById("btn-recenter"),
    btnLayers: document.getElementById("btn-layers"),
    layersPanel: document.getElementById("layers-panel"),
    layerOficiales: document.getElementById("layer-oficiales"),
    layerGalicia: document.getElementById("layer-galicia"),
    layerPortugal: document.getElementById("layer-portugal"),
    layerFirms: document.getElementById("layer-firms"),
    layerHotspots: document.getElementById("layer-hotspots"),
    layerBurned: document.getElementById("layer-burned"),
    layerRelief: document.getElementById("layer-relief"),
    layerSatellite: document.getElementById("layer-satellite"),
  };

  /** @type {"gl"|"leaflet"|null} */
  let mapKind = null;
  /** @type {any} */
  let map = null;
  /** @type {Array<ReturnType<typeof normalizeFire>>} */
  let fires = [];
  /** @type {string|null} */
  let selectedId = null;
  /** @type {Map<string, any>} */
  const markers = new Map();
  /** @type {any} */
  let userMarker = null;
  /** @type {any} */
  let firmsPopup = null;
  let firmsCount = 0;
  /** @type {{ type: string, features: any[] }} */
  let firmsGeo = { type: "FeatureCollection", features: [] };
  let query = "";

  /** Leaflet-only layer handles */
  /** @type {Record<string, any>} */
  let Llayers = {};
  /** @type {any} */
  let firmsLeafletLayer = null;

  function effisTileUrl(layer, withTime) {
    const params = new URLSearchParams({
      SERVICE: "WMS",
      VERSION: "1.1.1",
      REQUEST: "GetMap",
      LAYERS: layer,
      STYLES: "default",
      FORMAT: "image/png",
      TRANSPARENT: "true",
      SRS: "EPSG:3857",
      WIDTH: "256",
      HEIGHT: "256",
      BBOX: "{bbox-epsg-3857}",
    });
    if (withTime) {
      params.set("TIME", `${isoDate(daysAgo(7))}/${isoDate(new Date())}`);
    }
    return `${EFFIS_WMS}?${params.toString().replace("%7Bbbox-epsg-3857%7D", "{bbox-epsg-3857}")}`;
  }

  function parseHectares(surface) {
    const m = String(surface || "").match(/([\d]+(?:[.,]\d+)?)\s*ha\b/i);
    if (!m) return 0;
    return Number(m[1].replace(",", ".")) || 0;
  }

  /** Higher = more serious: medios (aéreos pesan más) + ha + estado activo. */
  function seriousnessScore(fire) {
    const man = Number(fire.man) || 0;
    const terrain = Number(fire.terrain) || 0;
    const aerial = Number(fire.aerial) || 0;
    const resources = man + terrain * 2 + aerial * 5;
    const ha = Math.min(parseHectares(fire.surface), 500);
    const statusBoost =
      fire.statusClass === "activo" ? 12 : fire.statusClass === "controlado" ? 4 : 0;
    return resources + ha * 0.4 + statusBoost;
  }

  function markerSizeClass(fire) {
    const s = seriousnessScore(fire);
    if (s >= 90) return "size-xl";
    if (s >= 45) return "size-lg";
    if (s >= 18) return "size-md";
    return "size-sm";
  }

  function recencyClass(fire) {
    const ageH = (Date.now() - (fire.parteMs || 0)) / 36e5;
    if (!fire.parteMs || ageH > 48) return "recency-stale";
    if (ageH > 18) return "recency-aging";
    return "recency-fresh";
  }

  function formatRelativeParte(fire) {
    const ms = fire.parteMs || 0;
    if (!ms) return fire.parteAt || "—";
    const ageH = (Date.now() - ms) / 36e5;
    if (ageH < 1) return "hace menos de 1 h";
    if (ageH < 24) return `hace ${Math.round(ageH)} h`;
    const days = Math.round(ageH / 24);
    return days === 1 ? "hace 1 día" : `hace ${days} días`;
  }

  async function fetchJcylPage(where, offset) {
    const params = new URLSearchParams({
      limit: "100",
      offset: String(offset),
      order_by: "fecha_del_parte desc, hora_del_parte desc",
      where,
    });
    const res = await fetch(`${JCYL_URL}?${params}`);
    if (!res.ok) throw new Error(`JCyL HTTP ${res.status}`);
    return res.json();
  }

  async function fetchJcylFires() {
    const since = isoDate(daysAgo(HISTORY_LOOKBACK_DAYS));
    const where = jcylWhereClause(since);
    const rows = [];
    let offset = 0;
    let total = Infinity;
    while (offset < total && offset < 800) {
      const data = await fetchJcylPage(where, offset);
      const batch = Array.isArray(data.results) ? data.results : [];
      total = typeof data.total_count === "number" ? data.total_count : batch.length;
      rows.push(...batch);
      if (!batch.length) break;
      offset += batch.length;
    }
    return reduceJcylRows(rows);
  }

  async function fetchGaliciaFires() {
    // Do not use ?data=30d — that param currently returns ~1 row; full list + client filter.
    const res = await fetch(GALICIA_URL, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`incendios.gal HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return filterGaliciaRows(rows);
  }

  /** Lockdown Mode / privacy browsers disable WebGL — MapLibre cannot paint. */
  function isWebglUsable() {
    try {
      if (!window.WebGLRenderingContext) return false;
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) ||
        canvas.getContext("webgl", { failIfMajorPerformanceCaveat: false }) ||
        canvas.getContext("experimental-webgl");
      if (!gl || typeof gl.getParameter !== "function") return false;
      return true;
    } catch {
      return false;
    }
  }

  function canUseMapLibre() {
    if (!isWebglUsable()) return false;
    if (typeof maplibregl === "undefined") return false;
    try {
      if (typeof maplibregl.supported === "function") {
        return !!maplibregl.supported({ failIfMajorPerformanceCaveat: false });
      }
    } catch {
      return false;
    }
    return true;
  }

  function loadStylesheet(href) {
    return new Promise((resolve, reject) => {
      if ([...document.styleSheets].some((s) => s.href && s.href.includes("leaflet"))) {
        resolve();
        return;
      }
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`CSS ${href}`));
      document.head.appendChild(link);
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (typeof L !== "undefined") {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Script ${src}`));
      document.head.appendChild(s);
    });
  }

  async function ensureLeaflet() {
    await loadStylesheet("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
    await loadScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js");
    if (typeof L === "undefined") throw new Error("Leaflet no cargó");
  }

  function mapIsReady() {
    if (!map) return false;
    if (mapKind === "gl") return typeof map.isStyleLoaded === "function" ? map.isStyleLoaded() : true;
    return mapKind === "leaflet";
  }

  function mapGetZoom() {
    return map ? map.getZoom() : FOCUS.zoom;
  }

  function mapFlyToLngLat(lng, lat, zoom) {
    if (!map) return;
    const z = zoom == null ? mapGetZoom() : zoom;
    if (mapKind === "gl") {
      map.flyTo({ center: [lng, lat], zoom: z, bearing: 0, pitch: 0, essential: true });
    } else {
      map.flyTo([lat, lng], z, { duration: 0.6 });
    }
  }

  function mapEaseHome() {
    if (!map) return;
    if (mapKind === "gl") {
      map.easeTo({
        center: FOCUS.center,
        zoom: FOCUS.zoom,
        bearing: 0,
        pitch: 0,
        essential: true,
      });
    } else {
      map.setView([FOCUS.center[1], FOCUS.center[0]], FOCUS.zoom);
    }
  }

  /** @param {[number, number, number, number]} bbox west,south,east,north */
  function mapFitBbox(bbox, padding, maxZoom) {
    if (!map || !bbox) return;
    const pad = padding == null ? 56 : padding;
    const mz = maxZoom == null ? 9.5 : maxZoom;
    if (mapKind === "gl") {
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        { padding: pad, maxZoom: mz, essential: true }
      );
    } else {
      map.fitBounds(
        [
          [bbox[1], bbox[0]],
          [bbox[3], bbox[2]],
        ],
        { padding: [pad, pad], maxZoom: mz }
      );
    }
  }

  function mapFitLngLats(points, padding, maxZoom) {
    if (!map || !points.length) return;
    const pad = padding == null ? 56 : padding;
    const mz = maxZoom == null ? 9.5 : maxZoom;
    if (points.length === 1) {
      mapFlyToLngLat(points[0].lng, points[0].lat, Math.max(mapGetZoom(), 9));
      return;
    }
    if (mapKind === "gl") {
      const bounds = new maplibregl.LngLatBounds();
      for (const p of points) bounds.extend([p.lng, p.lat]);
      map.fitBounds(bounds, { padding: pad, maxZoom: mz, essential: true });
    } else {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [pad, pad], maxZoom: mz });
    }
  }

  function createHtmlMarker(el, lng, lat) {
    if (mapKind === "gl") {
      return new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
    }
    const icon = L.divIcon({
      className: "fuegos-marker-wrap",
      html: "",
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
    const marker = L.marker([lat, lng], { icon, keyboard: false }).addTo(map);
    const node = marker.getElement();
    if (node) {
      node.innerHTML = "";
      node.appendChild(el);
    }
    marker._fuegosEl = el;
    return marker;
  }

  function markerDom(marker) {
    if (!marker) return null;
    if (marker._fuegosEl) return marker._fuegosEl;
    if (typeof marker.getElement === "function") return marker.getElement();
    return null;
  }

  function firmsPopupHtml(props) {
    const p = props || {};
    const time = String(p.acq_time || "").padStart(4, "0");
    const hhmm = time.length >= 4 ? `${time.slice(0, 2)}:${time.slice(2, 4)}` : time;
    return `
      <strong>Detección satélite</strong><br/>
      ${escapeHtml(p.acq_date || "—")} ${escapeHtml(hhmm)} UTC<br/>
      Confianza: ${escapeHtml(p.confidence || "—")} · FRP ${escapeHtml(String(p.frp ?? "—"))}<br/>
      <em>No es un parte oficial de extinción</em>
    `;
  }

  function initMapLibre() {
    mapKind = "gl";
    map = new maplibregl.Map({
      container: "map",
      style: {
        version: 8,
        sources: {
          basemap: {
            type: "raster",
            tiles: STREET_TILES,
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          },
          terrain: {
            type: "raster-dem",
            tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
            encoding: "terrarium",
            tileSize: 256,
            maxzoom: 15,
            attribution: '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Terrain</a>',
          },
          "effis-hotspots": {
            type: "raster",
            tiles: [effisTileUrl("viirs.hs", true)],
            tileSize: 256,
            attribution:
              '<a href="https://forest-fire.emergency.copernicus.eu/">EFFIS / Copernicus EMS</a>',
          },
          "effis-burned": {
            type: "raster",
            tiles: [effisTileUrl("modis.ba.week", false)],
            tileSize: 256,
            attribution:
              '<a href="https://forest-fire.emergency.copernicus.eu/">EFFIS burnt areas</a>',
          },
        },
        layers: [
          { id: "basemap", type: "raster", source: "basemap" },
          {
            id: "relief",
            type: "hillshade",
            source: "terrain",
            layout: { visibility: "visible" },
            paint: {
              "hillshade-exaggeration": 0.5,
              "hillshade-shadow-color": "#3a3228",
              "hillshade-highlight-color": "#ffffff",
              "hillshade-accent-color": "#6a5a48",
              "hillshade-illumination-direction": 315,
            },
          },
          {
            id: "effis-burned",
            type: "raster",
            source: "effis-burned",
            layout: { visibility: "none" },
            paint: { "raster-opacity": 0.55 },
          },
          {
            id: "effis-hotspots",
            type: "raster",
            source: "effis-hotspots",
            layout: { visibility: "none" },
            paint: { "raster-opacity": 0.85 },
          },
        ],
      },
      center: FOCUS.center,
      zoom: FOCUS.zoom,
      bearing: 0,
      pitch: 0,
      maxPitch: 0,
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      maxBounds: [
        [-19.5, 26.8],
        [5.8, 44.6],
      ],
      attributionControl: true,
    });

    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("click", () => selectFire(null, false));
  }

  function initLeafletMap() {
    mapKind = "leaflet";
    document.getElementById("map")?.classList.add("is-leaflet");
    document.querySelector(".map-wrap")?.classList.add("is-leaflet");

    map = L.map("map", {
      center: [FOCUS.center[1], FOCUS.center[0]],
      zoom: FOCUS.zoom,
      zoomControl: false,
      maxBounds: [
        [26.8, -19.5],
        [44.6, 5.8],
      ],
      maxBoundsViscosity: 0.85,
      attributionControl: true,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    Llayers.street = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
        subdomains: "abcd",
      }
    );
    Llayers.satellite = L.tileLayer(SAT_TILES[0], {
      attribution: "Esri",
      maxZoom: 19,
    });
    Llayers.street.addTo(map);

    Llayers["effis-hotspots"] = L.tileLayer.wms(EFFIS_WMS, {
      layers: "viirs.hs",
      styles: "default",
      format: "image/png",
      transparent: true,
      version: "1.1.1",
      opacity: 0.85,
      attribution: '<a href="https://forest-fire.emergency.copernicus.eu/">EFFIS</a>',
      time: `${isoDate(daysAgo(7))}/${isoDate(new Date())}`,
    });
    Llayers["effis-burned"] = L.tileLayer.wms(EFFIS_WMS, {
      layers: "modis.ba.week",
      styles: "default",
      format: "image/png",
      transparent: true,
      version: "1.1.1",
      opacity: 0.55,
      attribution: '<a href="https://forest-fire.emergency.copernicus.eu/">EFFIS</a>',
    });

    firmsLeafletLayer = L.layerGroup();
    if (els.layerFirms && els.layerFirms.checked) firmsLeafletLayer.addTo(map);

    map.on("click", () => selectFire(null, false));

    // Hillshade needs WebGL — hide control in compatible mode.
    if (els.layerRelief) {
      const item = els.layerRelief.closest(".layer-item");
      if (item) item.hidden = true;
      els.layerRelief.checked = false;
    }

    if (els.status) {
      els.status.textContent =
        "Mapa compatible (sin WebGL — p. ej. Modo de aislamiento). Capas raster activas.";
    }

    requestAnimationFrame(() => {
      try {
        map.invalidateSize();
      } catch {
        /* ignore */
      }
    });
    window.addEventListener(
      "resize",
      () => {
        try {
          map.invalidateSize();
        } catch {
          /* ignore */
        }
      },
      { passive: true }
    );
  }

  function ensureFirmsLayers() {
    if (mapKind === "leaflet") {
      setFirmsVisibility(!!(els.layerFirms && els.layerFirms.checked));
      return;
    }
    if (!map.getSource("firms")) {
      map.addSource("firms", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        attribution:
          '<a href="https://firms.modaps.eosdis.nasa.gov/">NASA FIRMS</a> VIIRS',
      });
      map.addLayer({
        id: "firms-glow",
        type: "circle",
        source: "firms",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 8, 10, 12, 16],
          "circle-color": "#ff6e02",
          "circle-opacity": 0.22,
          "circle-blur": 0.55,
        },
      });
      map.addLayer({
        id: "firms-points",
        type: "circle",
        source: "firms",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2.5, 8, 5, 12, 8],
          "circle-color": [
            "match",
            ["get", "confidence"],
            "high",
            "#d9480f",
            "nominal",
            "#ff6e02",
            "#f0a060",
          ],
          "circle-stroke-width": 1.25,
          "circle-stroke-color": "#fff8f0",
          "circle-opacity": 0.92,
        },
      });

      map.on("click", "firms-points", (e) => {
        e.originalEvent.stopPropagation();
        const f = e.features && e.features[0];
        if (!f) return;
        if (!firmsPopup) {
          firmsPopup = new maplibregl.Popup({ closeButton: true, maxWidth: "260px" });
        }
        firmsPopup.setLngLat(e.lngLat).setHTML(firmsPopupHtml(f.properties)).addTo(map);
      });
      map.on("mouseenter", "firms-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "firms-points", () => {
        map.getCanvas().style.cursor = "";
      });
    }
    setFirmsVisibility(!!(els.layerFirms && els.layerFirms.checked));
  }

  function setFirmsVisibility(visible) {
    if (mapKind === "leaflet") {
      if (!firmsLeafletLayer || !map) return;
      if (visible) {
        if (!map.hasLayer(firmsLeafletLayer)) firmsLeafletLayer.addTo(map);
      } else if (map.hasLayer(firmsLeafletLayer)) {
        map.removeLayer(firmsLeafletLayer);
      }
      return;
    }
    setLayerVisibility("firms-glow", visible);
    setLayerVisibility("firms-points", visible);
  }

  function setFirmsData(geojson) {
    const fc =
      geojson && geojson.type === "FeatureCollection"
        ? geojson
        : { type: "FeatureCollection", features: [] };
    firmsGeo = fc;
    firmsCount = Array.isArray(fc.features) ? fc.features.length : 0;

    if (mapKind === "leaflet") {
      if (firmsLeafletLayer) firmsLeafletLayer.clearLayers();
      else firmsLeafletLayer = L.layerGroup();
      L.geoJSON(fc, {
        pointToLayer: (feature, latlng) => {
          const conf = (feature.properties && feature.properties.confidence) || "";
          const color = conf === "high" ? "#d9480f" : "#ff6e02";
          return L.circleMarker(latlng, {
            radius: 5,
            color: "#fff8f0",
            weight: 1.25,
            fillColor: color,
            fillOpacity: 0.92,
          });
        },
        onEachFeature: (feature, layer) => {
          layer.bindPopup(firmsPopupHtml(feature.properties));
          layer.on("click", (e) => {
            if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
          });
        },
      }).addTo(firmsLeafletLayer);
      setFirmsVisibility(!!(els.layerFirms && els.layerFirms.checked));
      return;
    }

    const src = map && map.getSource("firms");
    if (src && typeof src.setData === "function") src.setData(fc);
  }

  function flyToFirms() {
    if (!map) return;
    const feats = (firmsGeo.features || []).filter(
      (f) => f.geometry && Array.isArray(f.geometry.coordinates)
    );
    if (!feats.length) {
      mapFitBbox(FOCUS.bbox, 48, 6.5);
      return;
    }
    mapFitLngLats(
      feats.map((f) => ({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] })),
      56,
      7.5
    );
  }

  function setLayerVisibility(layerId, visible) {
    if (mapKind === "leaflet") {
      const layer = Llayers[layerId];
      if (!layer || !map) return;
      if (visible) {
        if (!map.hasLayer(layer)) layer.addTo(map);
      } else if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
      return;
    }
    if (!map || !map.getLayer(layerId)) return;
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }

  function setBasemap(satellite) {
    if (!map || !mapIsReady()) return;
    if (mapKind === "leaflet") {
      if (satellite) {
        if (map.hasLayer(Llayers.street)) map.removeLayer(Llayers.street);
        if (!map.hasLayer(Llayers.satellite)) Llayers.satellite.addTo(map);
      } else {
        if (map.hasLayer(Llayers.satellite)) map.removeLayer(Llayers.satellite);
        if (!map.hasLayer(Llayers.street)) Llayers.street.addTo(map);
      }
      return;
    }
    const src = map.getSource("basemap");
    if (!src || typeof src.setTiles !== "function") return;
    src.setTiles(satellite ? SAT_TILES : STREET_TILES);
  }

  function applyLayerChecks() {
    if (!map || !mapIsReady()) return;
    setFirmsVisibility(!!(els.layerFirms && els.layerFirms.checked));
    setLayerVisibility("effis-hotspots", !!(els.layerHotspots && els.layerHotspots.checked));
    setLayerVisibility("effis-burned", !!(els.layerBurned && els.layerBurned.checked));
    if (mapKind === "gl") {
      setLayerVisibility("relief", !!(els.layerRelief && els.layerRelief.checked));
    }
    setBasemap(!!(els.layerSatellite && els.layerSatellite.checked));
  }

  async function fetchFirmsHotspots() {
    const res = await fetch(FIRMS_URL, { headers: { Accept: "application/geo+json, application/json" } });
    if (!res.ok) throw new Error(`FIRMS proxy HTTP ${res.status}`);
    return res.json();
  }

  async function fetchFogosPtFires() {
    const res = await fetch(FOGOS_URL, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`fogos proxy HTTP ${res.status}`);
    return filterFogosRows(await res.json());
  }

  function clearMarkers() {
    for (const m of markers.values()) {
      if (mapKind === "leaflet" && map) {
        map.removeLayer(m);
      } else if (m && typeof m.remove === "function") {
        m.remove();
      }
    }
    markers.clear();
  }

  function layerAllows(fire) {
    if (fire.source === "incendios.gal") {
      return !!(els.layerGalicia && els.layerGalicia.checked);
    }
    if (fire.source === "fogos.pt") {
      return !!(els.layerPortugal && els.layerPortugal.checked);
    }
    return !!(els.layerOficiales && els.layerOficiales.checked);
  }

  function filteredFires() {
    const q = query.trim().toLowerCase();
    return fires.filter((f) => {
      if (!layerAllows(f)) return false;
      if (!q) return true;
      return `${f.municipality} ${f.province} ${f.status} ${f.locationLine} ${f.country} ${f.source}`
        .toLowerCase()
        .includes(q);
    });
  }

  function selectFire(id, fly) {
    selectedId = id;
    const fire = fires.find((f) => f.id === id) || null;

    for (const [mid, marker] of markers) {
      const el = markerDom(marker);
      if (!el) continue;
      const on = mid === id;
      el.classList.toggle("is-selected", on);
      const wrap = el.parentElement;
      if (wrap) wrap.style.zIndex = on ? "600" : "";
    }

    renderSidebar();

    if (fire && fly && fire.lat != null && fire.lng != null) {
      mapFlyToLngLat(fire.lng, fire.lat, Math.max(mapGetZoom(), 10));
      showSidebar(true);
    }

    if (id) {
      history.replaceState(null, "", `#${encodeURIComponent(id)}`);
    } else if (location.hash) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  function assetBlock(fire) {
    return `
      <div class="assets" aria-label="Medios">
        <span class="asset" title="Operativos">
          <svg><use href="#ico-man"></use></svg>
          <span><strong>${fire.man}</strong><br /><em>Operativos</em></span>
        </span>
        <span class="asset" title="Terrestres">
          <svg><use href="#ico-truck"></use></svg>
          <span><strong>${fire.terrain}</strong><br /><em>Terrestres</em></span>
        </span>
        <span class="asset" title="Aéreos">
          <svg><use href="#ico-plane"></use></svg>
          <span><strong>${fire.aerial}</strong><br /><em>Aéreos</em></span>
        </span>
      </div>
    `;
  }

  function displayProvince(name) {
    const key = String(name || "")
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const labels = {
      LEON: "León",
      SALAMANCA: "Salamanca",
      ZAMORA: "Zamora",
      AVILA: "Ávila",
      VALLADOLID: "Valladolid",
      PALENCIA: "Palencia",
      BURGOS: "Burgos",
      SEGOVIA: "Segovia",
      SORIA: "Soria",
      GALICIA: "Galicia",
    };
    return labels[key] || String(name || "—");
  }

  function regionStats(list) {
    const byProv = new Map();
    for (const fire of list) {
      const key = fire.province || "—";
      let g = byProv.get(key);
      if (!g) {
        g = {
          province: key,
          total: 0,
          activo: 0,
          controlado: 0,
          estabilizado: 0,
          man: 0,
          terrain: 0,
          aerial: 0,
          fires: [],
        };
        byProv.set(key, g);
      }
      g.total += 1;
      if (fire.statusClass === "activo") g.activo += 1;
      else if (fire.statusClass === "controlado") g.controlado += 1;
      else if (fire.statusClass === "estabilizado") g.estabilizado += 1;
      g.man += fire.man;
      g.terrain += fire.terrain;
      g.aerial += fire.aerial;
      g.fires.push(fire);
    }
    return Array.from(byProv.values()).sort(
      (a, b) => b.activo - a.activo || b.total - a.total || a.province.localeCompare(b.province, "es")
    );
  }

  function flyToFires(regionFires) {
    const pts = regionFires.filter((f) => f.lat != null && f.lng != null);
    if (!pts.length || !map) return;
    mapFitLngLats(pts, 72, 9.5);
  }

  function flyToBbox(bbox, label) {
    if (!map || !bbox) return;
    mapFitBbox(bbox, 56, 9.5);
    if (label && els.status) {
      els.status.textContent = `${label}: acercando en el mapa.`;
    }
  }

  function renderMarkers() {
    clearMarkers();

    filteredFires().forEach((fire) => {
      const el = document.createElement("button");
      el.type = "button";
      const size = markerSizeClass(fire);
      const recency = recencyClass(fire);
      el.className = `map-marker ${fire.statusClass} ${size} ${recency}${
        fire.source === "incendios.gal" ? " citizen" : ""
      }${fire.country === "PT" ? " pt" : ""}`;
      const medios = fire.man + fire.terrain + fire.aerial;
      el.title = `${fire.locationLine} — ${fire.status} · parte ${formatRelativeParte(fire)} · ${medios} medios`;
      el.setAttribute(
        "aria-label",
        `${fire.municipality}, ${fire.status}, parte ${formatRelativeParte(fire)}, magnitud ${size.replace("size-", "")}`
      );
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        selectFire(fire.id, true);
      });
      const marker = createHtmlMarker(el, fire.lng, fire.lat);
      markers.set(fire.id, marker);
    });

    if (selectedId) {
      const marker = markers.get(selectedId);
      if (marker) {
        const el = markerDom(marker);
        if (el) {
          el.classList.add("is-selected");
          if (el.parentElement) el.parentElement.style.zIndex = "600";
        }
      }
    }
  }

  function appendListItem(node) {
    const li = document.createElement("li");
    li.appendChild(node);
    els.list.appendChild(li);
  }

  function buildResourcesChart(history) {
    const wrap = document.createElement("div");
    wrap.className = "chart-block";

    const title = document.createElement("h6");
    title.className = "field-label";
    title.textContent = "Medios en el tiempo";
    wrap.appendChild(title);

    if (!history || history.length < 2) {
      const empty = document.createElement("p");
      empty.className = "chart-empty";
      empty.textContent =
        history && history.length === 1
          ? "Solo un parte reciente: aún no hay curva de medios."
          : "Sin histórico de medios para este incendio.";
      wrap.appendChild(empty);
      return wrap;
    }

    const W = 340;
    const H = 168;
    const pad = { t: 14, r: 10, b: 30, l: 30 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const t0 = history[0].t;
    const t1 = history[history.length - 1].t || t0 + 1;
    const span = Math.max(t1 - t0, 1);
    let yMax = 1;
    for (const p of history) {
      yMax = Math.max(yMax, p.man || 0, p.terrain || 0, p.aerial || 0);
    }
    yMax = Math.ceil(yMax * 1.15) || 1;

    const xOf = (t) => pad.l + ((t - t0) / span) * iw;
    const yOf = (v) => pad.t + ih - (v / yMax) * ih;

    const series = [
      { key: "man", label: "Operativos", color: "#ff6e02" },
      { key: "terrain", label: "Terrestres", color: "#5d6d7e" },
      { key: "aerial", label: "Aéreos", color: "#1f7aaf" },
    ];

    const fmtTick = (ms) => {
      const d = new Date(ms);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      return `${dd}/${mm} ${hh}h`;
    };

    let paths = "";
    for (const s of series) {
      const d = history
        .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.t).toFixed(1)},${yOf(p[s.key] || 0).toFixed(1)}`)
        .join(" ");
      paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" />`;
      for (const p of history) {
        paths += `<circle cx="${xOf(p.t).toFixed(1)}" cy="${yOf(p[s.key] || 0).toFixed(1)}" r="2.4" fill="${s.color}" />`;
      }
    }

    const midT = t0 + span / 2;
    const svg = `
      <svg class="resources-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución de medios por parte">
        <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ih}" stroke="rgba(0,0,0,.12)" />
        <line x1="${pad.l}" y1="${pad.t + ih}" x2="${pad.l + iw}" y2="${pad.t + ih}" stroke="rgba(0,0,0,.12)" />
        <text x="${pad.l - 6}" y="${pad.t + 4}" text-anchor="end" class="chart-tick">${yMax}</text>
        <text x="${pad.l - 6}" y="${pad.t + ih}" text-anchor="end" class="chart-tick">0</text>
        <text x="${pad.l}" y="${H - 8}" text-anchor="start" class="chart-tick">${escapeHtml(fmtTick(t0))}</text>
        <text x="${pad.l + iw / 2}" y="${H - 8}" text-anchor="middle" class="chart-tick">${escapeHtml(fmtTick(midT))}</text>
        <text x="${pad.l + iw}" y="${H - 8}" text-anchor="end" class="chart-tick">${escapeHtml(fmtTick(t1))}</text>
        ${paths}
      </svg>
    `;
    const chart = document.createElement("div");
    chart.innerHTML = svg;
    wrap.appendChild(chart.firstElementChild);

    const legend = document.createElement("div");
    legend.className = "chart-legend";
    legend.innerHTML = series
      .map((s) => `<span><i style="background:${s.color}"></i>${escapeHtml(s.label)}</span>`)
      .join("");
    wrap.appendChild(legend);

    const note = document.createElement("p");
    note.className = "chart-note";
    note.textContent = `${history.length} partes JCyL · operativos / terrestres / aéreos`;
    wrap.appendChild(note);
    return wrap;
  }

  function renderFireDetail(fire) {
    els.sidebar.classList.add("is-detail");
    els.sidebar.setAttribute("aria-label", "Detalle del incendio");

    const back = document.createElement("button");
    back.type = "button";
    back.className = "detail-back";
    back.textContent = "← Resumen por región";
    back.addEventListener("click", () => selectFire(null, false));
    appendListItem(back);

    const card = document.createElement("article");
    card.className = "card is-selected";
    card.innerHTML = `
      <div class="fire-status ${fire.statusClass}"></div>
      <div class="card-body">
        <span class="country-badge ${fire.country.toLowerCase()}">${fire.country}</span>
        <span class="status-pill ${fire.statusClass}">${escapeHtml(fire.status)}</span>
        <h3 class="card-title">${escapeHtml(fire.municipality)}</h3>
        <div class="fields">
          <div>
            <h6 class="field-label">Local</h6>
            <p class="field-value">${escapeHtml(fire.locationLine)}</p>
          </div>
          <div>
            <h6 class="field-label">Inicio</h6>
            <p class="field-value">${escapeHtml(fire.started || "—")}</p>
          </div>
          <div>
            <h6 class="field-label">Último parte</h6>
            <p class="field-value">${escapeHtml(formatRelativeParte(fire))}</p>
          </div>
          <div>
            <h6 class="field-label">Superficie / naturaleza</h6>
            <p class="field-value">${escapeHtml(fire.surface)}</p>
          </div>
          <div>
            <h6 class="field-label">Nivel</h6>
            <p class="field-value">${escapeHtml(String(fire.level ?? "—"))}</p>
          </div>
          <div>
            <h6 class="field-label">${
              fire.source === "incendios.gal"
                ? "Origen"
                : fire.source === "fogos.pt"
                  ? "Naturaleza"
                  : "Causa probable"
            }</h6>
            <p class="field-value">${escapeHtml(String(fire.cause ?? "—"))}</p>
          </div>
          <div>
            <h6 class="field-label">Fuente</h6>
            <p class="field-value">${
              fire.source === "incendios.gal"
                ? fire.detailUrl
                  ? `<a href="${escapeHtml(fire.detailUrl)}" rel="noopener" target="_blank">incendios.gal</a> (avisos cidadáns)`
                  : "incendios.gal"
                : fire.source === "fogos.pt"
                  ? fire.detailUrl
                    ? `<a href="${escapeHtml(fire.detailUrl)}" rel="noopener" target="_blank">fogos.pt</a> (ANEPC)`
                    : "fogos.pt"
                  : "España · JCyL"
            }</p>
          </div>
        </div>
        ${fire.source === "incendios.gal" ? "" : assetBlock(fire)}
      </div>
    `;
    if (fire.source === "JCyL") {
      const body = card.querySelector(".card-body");
      if (body) body.appendChild(buildResourcesChart(fire.history || []));
    }
    appendListItem(card);
  }

  function renderSearchHits(list) {
    els.sidebar.classList.remove("is-detail");
    els.sidebar.setAttribute("aria-label", "Resultados de búsqueda");

    const title = document.createElement("p");
    title.className = "panel-title";
    title.textContent = `${list.length} coincidencia${list.length === 1 ? "" : "s"}`;
    appendListItem(title);

    list.forEach((fire) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hit-card";
      btn.innerHTML = `
        <span class="status-pill ${fire.statusClass}">${escapeHtml(fire.status)}</span>
        <h3 class="hit-title">${escapeHtml(fire.municipality)}</h3>
        <p class="hit-sub">${escapeHtml(displayProvince(fire.province))} · parte ${escapeHtml(formatRelativeParte(fire))}</p>
      `;
      btn.addEventListener("click", () => selectFire(fire.id, true));
      appendListItem(btn);
    });
  }

  function renderSatNationCard() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "region-card is-firms";
    btn.innerHTML = `
      <div class="region-head">
        <h3 class="region-name">España · satélite</h3>
        <span class="region-count"><strong>${firmsCount}</strong> detección${firmsCount === 1 ? "" : "es"}</span>
      </div>
      <p class="region-meta">VIIRS 24h (NASA FIRMS) en todo el mapa — no son partes oficiales</p>
    `;
    btn.addEventListener("click", () => {
      if (els.layerFirms && !els.layerFirms.checked) {
        els.layerFirms.checked = true;
        els.layerFirms.closest(".layer-item")?.classList.toggle("is-on", true);
        setFirmsVisibility(true);
      }
      flyToFirms();
      showSidebar(true);
    });
    appendListItem(btn);
  }

  function renderGaliciaCard(gaFires) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "region-card";
    const n = gaFires.length;
    if (!n) btn.classList.add("is-sat");
    btn.innerHTML = `
      <div class="region-head">
        <h3 class="region-name">Galicia</h3>
        <span class="region-count"><strong>${n}</strong> aviso${n === 1 ? "" : "s"}</span>
      </div>
      <p class="region-meta">${
        n
          ? "Avisos cidadáns recientes (incendios.gal) — no oficiales"
          : "Pulsa para acercar · avisos cidadáns + satélite"
      }</p>
    `;
    btn.addEventListener("click", () => {
      if (gaFires.length) flyToFires(gaFires);
      else flyToBbox(GALICIA_BBOX, "Galicia");
      showSidebar(true);
    });
    appendListItem(btn);
  }

  function renderCylSection(cylFires) {
    const cylTitle = document.createElement("p");
    cylTitle.className = "panel-title";
    cylTitle.textContent = "Castilla y León · oficiales";
    appendListItem(cylTitle);

    const regions = regionStats(cylFires);
    if (!regions.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No hay partes oficiales en curso en CyL.";
      appendListItem(empty);
      return;
    }
    regions.forEach((region, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "region-card";
      btn.style.animationDelay = `${Math.min(i, 10) * 0.03}s`;
      const bits = [];
      if (region.activo) bits.push(`${region.activo} activo${region.activo === 1 ? "" : "s"}`);
      if (region.controlado) bits.push(`${region.controlado} controlado${region.controlado === 1 ? "" : "s"}`);
      if (region.estabilizado) bits.push(`${region.estabilizado} estabilizado${region.estabilizado === 1 ? "" : "s"}`);
      btn.innerHTML = `
        <div class="region-head">
          <h3 class="region-name">${escapeHtml(displayProvince(region.province))}</h3>
          <span class="region-count"><strong>${region.total}</strong> en curso</span>
        </div>
        <p class="region-meta">${escapeHtml(bits.join(" · ") || "Sin desglose")}</p>
        <div class="region-stats">
          <span><b>${region.man}</b> operativos</span>
          <span><b>${region.terrain}</b> terrestres</span>
          <span><b>${region.aerial}</b> aéreos</span>
        </div>
      `;
      btn.addEventListener("click", () => {
        flyToFires(region.fires);
        showSidebar(true);
      });
      appendListItem(btn);
    });
  }

  function renderPortugalSection(ptFires) {
    const title = document.createElement("p");
    title.className = "panel-title";
    title.textContent = "Portugal · fogos.pt";
    appendListItem(title);

    if (!ptFires.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No hay incendios abiertos en fogos.pt ahora.";
      appendListItem(empty);
      return;
    }

    const summary = document.createElement("button");
    summary.type = "button";
    summary.className = "region-card is-pt";
    const activos = ptFires.filter((f) => f.statusClass === "activo").length;
    summary.innerHTML = `
      <div class="region-head">
        <h3 class="region-name">Portugal</h3>
        <span class="region-count"><strong>${ptFires.length}</strong> en curso</span>
      </div>
      <p class="region-meta">${
        activos ? `${activos} activos · ` : ""
      }Despachos ANEPC vía fogos.pt — pulsa para ver todos</p>
    `;
    summary.addEventListener("click", () => {
      if (els.layerPortugal && !els.layerPortugal.checked) {
        els.layerPortugal.checked = true;
        els.layerPortugal.closest(".layer-item")?.classList.toggle("is-on", true);
        renderSidebar();
        renderMarkers();
        updateTicker();
      }
      flyToFires(ptFires);
      showSidebar(true);
    });
    appendListItem(summary);

    const regions = regionStats(ptFires);
    regions.forEach((region, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "region-card";
      btn.style.animationDelay = `${Math.min(i, 10) * 0.03}s`;
      btn.innerHTML = `
        <div class="region-head">
          <h3 class="region-name">${escapeHtml(region.province)}</h3>
          <span class="region-count"><strong>${region.total}</strong></span>
        </div>
        <p class="region-meta">${escapeHtml(
          [
            region.activo && `${region.activo} activo${region.activo === 1 ? "" : "s"}`,
            region.controlado && `${region.controlado} en resolución`,
            region.estabilizado && `${region.estabilizado} vigilancia`,
          ]
            .filter(Boolean)
            .join(" · ") || "En curso"
        )}</p>
      `;
      btn.addEventListener("click", () => {
        flyToFires(region.fires);
        showSidebar(true);
      });
      appendListItem(btn);
    });
  }

  function renderRegionOverview(list) {
    els.sidebar.classList.remove("is-detail");
    els.sidebar.setAttribute("aria-label", "Resumen por región");

    const cylFires = list.filter((f) => f.source === "JCyL");
    const gaFires = list.filter((f) => f.source === "incendios.gal");
    const ptFires = list.filter((f) => f.source === "fogos.pt");

    const nation = document.createElement("p");
    nation.className = "panel-title";
    nation.textContent = "Toda España";
    appendListItem(nation);
    renderSatNationCard();

    renderCylSection(cylFires);

    const gaTitle = document.createElement("p");
    gaTitle.className = "panel-title";
    gaTitle.textContent = "Galicia · avisos cidadáns";
    appendListItem(gaTitle);
    renderGaliciaCard(gaFires);

    renderPortugalSection(ptFires);

    const sat = document.createElement("p");
    sat.className = "overview-note";
    sat.innerHTML =
      "Fuera de CyL no hay parte diario nacional abierto: el mapa muestra <strong>detecciones FIRMS</strong> (calor satélite). Galicia: <a href=\"https://incendios.gal/\" rel=\"noopener\" target=\"_blank\">incendios.gal</a>. Portugal: <a href=\"https://fogos.pt\" rel=\"noopener\" target=\"_blank\">fogos.pt</a>.";
    appendListItem(sat);
  }

  function renderSidebar() {
    const list = filteredFires();
    els.list.innerHTML = "";

    if (selectedId) {
      const fire = fires.find((f) => f.id === selectedId);
      if (fire && layerAllows(fire)) {
        renderFireDetail(fire);
        return;
      }
    }

    if (query.trim()) {
      if (!list.length) {
        els.sidebar.classList.remove("is-detail");
        els.list.innerHTML = '<li class="empty">Ninguna coincidencia. Prueba otro municipio o provincia.</li>';
        return;
      }
      renderSearchHits(list);
      return;
    }

    renderRegionOverview(list);
  }

  function updateTicker() {
    const visible = filteredFires();
    const cyl = visible.filter((f) => f.source === "JCyL").length;
    const ga = visible.filter((f) => f.source === "incendios.gal").length;
    const pt = visible.filter((f) => f.source === "fogos.pt").length;
    const hot = visible.filter((f) => f.statusClass === "activo").length;
    const now = new Date();
    const hhmm = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    const firmsOn = !(els.layerFirms && !els.layerFirms.checked);
    els.ticker.textContent =
      `${hhmm} — ${cyl} CyL` +
      `${ga ? ` · ${ga} Galicia` : ""}` +
      `${pt ? ` · ${pt} PT` : ""}` +
      `${hot ? ` · ${hot} activos` : ""}` +
      `${firmsOn && firmsCount ? ` · ${firmsCount} satélite ES` : ""}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatUpdated(date) {
    try {
      return new Intl.DateTimeFormat("es-ES", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
    } catch {
      return date.toLocaleString("es-ES");
    }
  }

  async function refresh() {
    els.status.textContent = "Actualizando CyL, Galicia, Portugal y satélite…";
    try {
      const [esResult, gaResult, ptResult, firmsResult] = await Promise.allSettled([
        fetchJcylFires(),
        fetchGaliciaFires(),
        fetchFogosPtFires(),
        fetchFirmsHotspots(),
      ]);
      const esFires = esResult.status === "fulfilled" ? esResult.value : [];
      const gaFires = gaResult.status === "fulfilled" ? gaResult.value : [];
      const ptFires = ptResult.status === "fulfilled" ? ptResult.value : [];
      if (esResult.status === "rejected") console.error(esResult.reason);
      if (gaResult.status === "rejected") console.error(gaResult.reason);
      if (ptResult.status === "rejected") console.error(ptResult.reason);
      if (firmsResult.status === "rejected") console.error(firmsResult.reason);

      if (firmsResult.status === "fulfilled") {
        setFirmsData(firmsResult.value);
      } else {
        setFirmsData({ type: "FeatureCollection", features: [] });
      }

      fires = [...esFires, ...gaFires, ...ptFires].sort(compareFires);
      const notes = [];
      if (esResult.status === "rejected") notes.push("CyL falló");
      if (gaResult.status === "rejected") notes.push("Galicia falló");
      if (ptResult.status === "rejected") notes.push("Portugal falló");
      if (firmsResult.status === "rejected") notes.push("FIRMS falló");
      els.status.textContent =
        `Mapa: ${firmsCount} satélite ES · CyL ${esFires.length} · Galicia ${gaFires.length} · PT ${ptFires.length}. ` +
        `Actualizado ${formatUpdated(new Date())}` +
        (notes.length ? ` · ${notes.join(", ")}` : "");

      if (selectedId && !fires.some((f) => f.id === selectedId)) selectedId = null;
      renderSidebar();
      renderMarkers();
      updateTicker();

      const hashId = decodeURIComponent((location.hash || "").replace(/^#/, ""));
      if (hashId && fires.some((f) => f.id === hashId)) selectFire(hashId, true);

      if (
        !fires.length &&
        esResult.status === "rejected" &&
        gaResult.status === "rejected" &&
        ptResult.status === "rejected" &&
        firmsResult.status === "rejected"
      ) {
        els.list.innerHTML = '<li class="error">No se pudieron cargar los datos.</li>';
      }
    } catch (err) {
      console.error(err);
      fires = [];
      selectedId = null;
      els.sidebar.classList.remove("is-detail");
      els.status.innerHTML = '<span class="error">Error al actualizar.</span>';
      els.ticker.textContent = "Error al actualizar datos";
      els.list.innerHTML = '<li class="error">No se pudieron cargar los datos.</li>';
      clearMarkers();
    }
  }

  function showSidebar(show) {
    els.sidebar.classList.toggle("is-hidden", !show);
  }

  function setUserLocation(lng, lat) {
    if (!map) return;
    if (!userMarker) {
      const el = document.createElement("div");
      el.className = "user-location";
      el.setAttribute("aria-hidden", "true");
      userMarker = createHtmlMarker(el, lng, lat);
    } else if (mapKind === "leaflet" && typeof userMarker.setLatLng === "function") {
      userMarker.setLatLng([lat, lng]);
    } else if (typeof userMarker.setLngLat === "function") {
      userMarker.setLngLat([lng, lat]);
    }
  }

  function locateMe() {
    if (!map) return;
    if (!navigator.geolocation) {
      els.status.textContent = "Tu navegador no permite geolocalización.";
      return;
    }
    if (els.btnLocate) {
      els.btnLocate.disabled = true;
      els.btnLocate.setAttribute("aria-busy", "true");
    }
    els.status.textContent = "Obteniendo tu ubicación…";

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation(lng, lat);
        mapFlyToLngLat(lng, lat, Math.max(mapGetZoom(), 10));
        els.status.textContent = "Mapa centrado en tu ubicación.";
        if (els.btnLocate) {
          els.btnLocate.disabled = false;
          els.btnLocate.removeAttribute("aria-busy");
        }
      },
      (err) => {
        let msg = "No se pudo obtener tu ubicación.";
        if (err && err.code === 1) msg = "Permiso de ubicación denegado.";
        else if (err && err.code === 2) msg = "Ubicación no disponible.";
        else if (err && err.code === 3) msg = "Tiempo de espera al obtener la ubicación.";
        els.status.textContent = msg;
        if (els.btnLocate) {
          els.btnLocate.disabled = false;
          els.btnLocate.removeAttribute("aria-busy");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  function wireUi() {
    if (els.btnRecenter) {
      els.btnRecenter.addEventListener("click", () => {
        mapEaseHome();
        selectFire(null, false);
      });
    }

    if (els.btnLocate) {
      els.btnLocate.addEventListener("click", locateMe);
    }

    if (els.btnToggleList) {
      els.btnToggleList.addEventListener("click", () => {
        const hidden = els.sidebar.classList.contains("is-hidden");
        showSidebar(hidden);
      });
    }

    els.btnLayers.addEventListener("click", () => {
      els.layersPanel.classList.toggle("collapsed");
      els.btnLayers.textContent = els.layersPanel.classList.contains("collapsed") ? "›" : "‹";
    });

    els.search.addEventListener("input", () => {
      query = els.search.value || "";
      renderSidebar();
      renderMarkers();
      updateTicker();
    });

    const bindCheck = (input, onChange) => {
      const sync = () => {
        const label = input.closest(".layer-item");
        if (label) label.classList.toggle("is-on", input.checked);
        onChange(input.checked);
      };
      input.addEventListener("change", sync);
      // Sync label styling only; map mutations wait until style is loaded.
      const label = input.closest(".layer-item");
      if (label) label.classList.toggle("is-on", input.checked);
    };

    els.layerHotspots.addEventListener("change", () => {
      const on = els.layerHotspots.checked;
      els.layerHotspots.closest(".layer-item")?.classList.toggle("is-on", on);
      setLayerVisibility("effis-hotspots", on);
    });
    if (els.layerFirms) {
      els.layerFirms.addEventListener("change", () => {
        const on = els.layerFirms.checked;
        els.layerFirms.closest(".layer-item")?.classList.toggle("is-on", on);
        setFirmsVisibility(on);
        updateTicker();
      });
    }
    els.layerBurned.addEventListener("change", () => {
      const on = els.layerBurned.checked;
      els.layerBurned.closest(".layer-item")?.classList.toggle("is-on", on);
      setLayerVisibility("effis-burned", on);
    });
    if (els.layerRelief) {
      els.layerRelief.addEventListener("change", () => {
        const on = els.layerRelief.checked;
        els.layerRelief.closest(".layer-item")?.classList.toggle("is-on", on);
        setLayerVisibility("relief", on);
      });
    }
    els.layerOficiales.addEventListener("change", () => {
      const on = els.layerOficiales.checked;
      els.layerOficiales.closest(".layer-item")?.classList.toggle("is-on", on);
      renderSidebar();
      renderMarkers();
      updateTicker();
    });
    if (els.layerGalicia) {
      els.layerGalicia.addEventListener("change", () => {
        const on = els.layerGalicia.checked;
        els.layerGalicia.closest(".layer-item")?.classList.toggle("is-on", on);
        renderSidebar();
        renderMarkers();
        updateTicker();
      });
    }
    if (els.layerPortugal) {
      els.layerPortugal.addEventListener("change", () => {
        const on = els.layerPortugal.checked;
        els.layerPortugal.closest(".layer-item")?.classList.toggle("is-on", on);
        renderSidebar();
        renderMarkers();
        updateTicker();
      });
    }
    els.layerSatellite.addEventListener("change", () => {
      const on = els.layerSatellite.checked;
      els.layerSatellite.closest(".layer-item")?.classList.toggle("is-on", on);
      setBasemap(on);
    });

    // Initial chip styles
    [
      els.layerOficiales,
      els.layerGalicia,
      els.layerPortugal,
      els.layerFirms,
      els.layerHotspots,
      els.layerBurned,
      els.layerRelief,
      els.layerSatellite,
    ].forEach((input) => {
      if (!input) return;
      input.closest(".layer-item")?.classList.toggle("is-on", input.checked);
    });

    if (window.matchMedia("(max-width: 900px)").matches) {
      showSidebar(true);
    }
  }

  async function boot() {
    wireUi();
    const startData = () => {
      ensureFirmsLayers();
      applyLayerChecks();
      refresh();
      setInterval(refresh, REFRESH_MS);
    };

    try {
      if (canUseMapLibre()) {
        initMapLibre();
        map.on("load", startData);
        return;
      }

      // iPhone Lockdown Mode and other no-WebGL browsers: Leaflet raster map.
      await ensureLeaflet();
      initLeafletMap();
      startData();
    } catch (err) {
      console.error(err);
      const mapEl = document.getElementById("map");
      if (mapEl) {
        mapEl.innerHTML =
          "<p style='padding:1.5rem;font-family:sans-serif;max-width:28rem'>No se pudo iniciar el mapa. En iPhone con Modo de aislamiento, prueba recargar; si sigue fallando, excluye este sitio del modo o usa otro navegador.</p>";
      }
      if (els.status) {
        els.status.innerHTML = '<span class="error">Mapa no disponible en este navegador.</span>';
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
