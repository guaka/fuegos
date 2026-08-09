/* Fuegos Vivos — AGPL-3.0 */
(function () {
  "use strict";

  const FF = globalThis.FuegosFires;
  if (!FF) {
    document.body.innerHTML =
      "<p style='padding:2rem;font-family:sans-serif'>Falta lib/fires.js — recarga o revisa el deploy.</p>";
    return;
  }

  const I18n = globalThis.FuegosI18n;
  if (!I18n) {
    document.body.innerHTML =
      "<p style='padding:2rem;font-family:sans-serif'>Falta lib/i18n.js — recarga o revisa el deploy.</p>";
    return;
  }

  const FOCUS = {
    center: [-3.5, 40.0],
    zoom: 5.4,
    // Península + Baleares (Canarias alcanzable al navegar)
    bbox: [-9.5, 35.95, 4.45, 43.85],
  };

  const {
    SOURCE,
    HISTORY_LOOKBACK_DAYS,
    reduceJcylRows,
    filterGaliciaRows,
    filterFogosRows,
    filterBombersRows,
    filterInfocaRows,
    filterInfocamRows,
    filterAragonRows,
    jcylWhereClause,
    isoDate,
    daysAgo,
    compareFires,
  } = FF;

  /**
   * Sidebar: live CyL + Galicia + CAT + AND + C-LM + Aragón + PT + national FIRMS.
   */
  const GALICIA_BBOX = [-9.35, 41.78, -6.7, 43.8];
  const CATALUNYA_BBOX = [0.05, 40.45, 3.35, 42.9];
  const ANDALUCIA_BBOX = [-7.55, 35.95, -1.55, 38.75];
  const CLM_BBOX = [-5.55, 38.0, -0.75, 41.45];
  const ARAGON_BBOX = [-2.25, 39.75, 0.85, 42.95];

  const SITE_HOST = "fuegos.guaka.org";
  const TITLE_HOME = SITE_HOST;
  function aboutTitle() {
    return I18n.t("title.about", { host: SITE_HOST });
  }

  const REFRESH_MS = 5 * 60 * 1000;
  /** If the tab sat idle / backgrounded this long, refresh as soon as the user returns. */
  const IDLE_STALE_MS = 15 * 60 * 1000;
  /** Show last known spots from localStorage while a fresh fetch runs. */
  const SPOTS_CACHE_KEY = "fuegos.spots.v1";
  const SPOTS_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
  const JCYL_URL =
    "https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/incendios-forestales/records";
  const GALICIA_URL = "https://incendios.gal/api/incidencias";
  const PROXY_ORIGIN = "https://fuegos-proxy.crew.workers.dev";
  const FIRMS_URL = `${PROXY_ORIGIN}/firms`;
  const FOGOS_URL = `${PROXY_ORIGIN}/fires`;
  const BOMBERS_URL = `${PROXY_ORIGIN}/bombers`;
  const INFOCA_URL = `${PROXY_ORIGIN}/infoca`;
  const INFOCAM_URL = `${PROXY_ORIGIN}/infocam`;
  const ARAGON_URL = `${PROXY_ORIGIN}/aragon`;
  /** Same-origin snapshots from Pages build — used if workers.dev is blocked (Lockdown / blockers). */
  const FIRMS_FALLBACK_URL = "./data/firms.geojson";
  const FOGOS_FALLBACK_URL = "./data/fires.json";
  const BOMBERS_FALLBACK_URL = "./data/bombers.geojson";
  const INFOCA_FALLBACK_URL = "./data/infoca.geojson";
  const INFOCAM_FALLBACK_URL = "./data/infocam.geojson";
  const ARAGON_FALLBACK_URL = "./data/aragon.geojson";
  const EFFIS_WMS = "https://maps.effis.emergency.copernicus.eu/effis";

  const STREET_TILE_TMPL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png";
  const STREET_TILES = ["a", "b", "c"].map((s) =>
    STREET_TILE_TMPL.replace("{s}", s)
  );
  const ATTR_OSM_CARTO =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
  const FIRMS_COLORS = {
    high: "#d9480f",
    nominal: "#ff6e02",
    other: "#f0a060",
    stroke: "#fff8f0",
    glow: "#ff6e02",
  };
  const SAT_TILES = [
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  ];

  const els = {
    sidebar: document.getElementById("sidebar"),
    list: document.getElementById("fire-list"),
    ticker: document.getElementById("ticker"),
    btnToggleList: document.getElementById("btn-toggle-list"),
    btnSheet: document.getElementById("btn-sheet"),
    sheetLabel: document.getElementById("sheet-label"),
    btnLocate: document.getElementById("btn-locate"),
    btnRecenter: document.getElementById("btn-recenter"),
    btnLayers: document.getElementById("btn-layers"),
    linkAbout: document.getElementById("link-about"),
    aboutView: document.getElementById("about"),
    layersPanel: document.getElementById("layers-panel"),
    layerOficiales: document.getElementById("layer-oficiales"),
    layerGalicia: document.getElementById("layer-galicia"),
    layerCatalunya: document.getElementById("layer-catalunya"),
    layerAndalucia: document.getElementById("layer-andalucia"),
    layerClm: document.getElementById("layer-clm"),
    layerAragon: document.getElementById("layer-aragon"),
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
  let lastRefreshAt = 0;
  let lastActivityAt = Date.now();
  /** @type {ReturnType<typeof setInterval> | null} */
  let refreshTimer = null;
  /** @type {Promise<void> | null} */
  let refreshInFlight = null;

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
    if (ageH < 1) return I18n.t("rel.lt1h");
    if (ageH < 24) return I18n.t("rel.hours", { n: Math.round(ageH) });
    const days = Math.round(ageH / 24);
    return days === 1 ? I18n.t("rel.day") : I18n.t("rel.days", { n: days });
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
    // E2E / manual: simulate Lockdown Mode (no WebGL) → Leaflet fallback.
    if (globalThis.__FUEGOS_FORCE_LEAFLET === true) return false;
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

  function mapChromePadding(extra) {
    const topbar = document.querySelector(".topbar");
    const top = (topbar ? topbar.offsetHeight : 48) + 12;
    let bottom = 48;
    if (isMobileLayout() && els.sidebar) {
      // Keep focused dots in the map band above the bottom sheet.
      bottom = Math.max(els.sidebar.offsetHeight || 0, 72) + 36;
    }
    const side = isMobileLayout() ? 20 : 40;
    const bump = extra == null ? 0 : extra;
    return {
      top: top + bump,
      right: side + bump,
      bottom: bottom + bump,
      left: side + bump,
    };
  }

  function mapFlyToLngLat(lng, lat, zoom, opts) {
    if (!map) return;
    const z = zoom == null ? mapGetZoom() : zoom;
    const pad = mapChromePadding();
    const durationMs = opts && opts.durationMs != null ? opts.durationMs : 650;
    if (mapKind === "gl") {
      map.flyTo({
        center: [lng, lat],
        zoom: z,
        padding: pad,
        bearing: 0,
        pitch: 0,
        essential: true,
        duration: durationMs,
      });
      return;
    }
    // Leaflet: place the point in the center of the unpadded (visible) area.
    try {
      map.invalidateSize({ animate: false, pan: false });
    } catch {
      /* ignore */
    }
    const target = L.latLng(lat, lng);
    const size = map.getSize();
    if (!size.x || !size.y) {
      map.setView(target, Math.round(z));
      scheduleLeafletResize();
      return;
    }
    const point = map.project(target, z);
    const cx = (pad.left + (size.x - pad.right)) / 2;
    const cy = (pad.top + (size.y - pad.bottom)) / 2;
    const offset = L.point(cx - size.x / 2, cy - size.y / 2);
    const center = map.unproject(point.subtract(offset), z);
    map.flyTo(center, z, { duration: durationMs / 1000 });
  }

  function keepSelectedFireInView(opts) {
    if (!map || !selectedId) return;
    const fire = fires.find((f) => f.id === selectedId);
    if (!fire || fire.lat == null || fire.lng == null) return;
    const delay = opts && opts.delay != null ? opts.delay : 0;
    const run = () =>
      mapFlyToLngLat(fire.lng, fire.lat, Math.max(mapGetZoom(), 10), {
        durationMs: opts && opts.durationMs != null ? opts.durationMs : 420,
      });
    if (delay > 0) window.setTimeout(run, delay);
    else requestAnimationFrame(run);
  }

  function mapEaseHome() {
    if (!map) return;
    const pad = mapChromePadding();
    if (mapKind === "gl") {
      map.easeTo({
        center: FOCUS.center,
        zoom: FOCUS.zoom,
        padding: pad,
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
    const bump = padding == null ? 0 : Math.max(0, padding - 40);
    const pad = mapChromePadding(bump);
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
        {
          paddingTopLeft: [pad.left, pad.top],
          paddingBottomRight: [pad.right, pad.bottom],
          maxZoom: mz,
        }
      );
    }
  }

  function mapFitLngLats(points, padding, maxZoom) {
    if (!map || !points.length) return;
    const bump = padding == null ? 0 : Math.max(0, padding - 40);
    const pad = mapChromePadding(bump);
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
      map.fitBounds(bounds, {
        paddingTopLeft: [pad.left, pad.top],
        paddingBottomRight: [pad.right, pad.bottom],
        maxZoom: mz,
      });
    }
  }

  function createHtmlMarker(el, lng, lat) {
    if (mapKind === "gl") {
      return new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
    }
    // Fixed icon box + centered child — nested CSS translate breaks on some iOS/Leaflet builds.
    const icon = L.divIcon({
      className: "fuegos-marker-wrap",
      html: "",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
    const marker = L.marker([lat, lng], { icon, keyboard: false, riseOnHover: true }).addTo(map);
    const node = marker.getElement();
    if (node) {
      node.innerHTML = "";
      node.appendChild(el);
    }
    marker._fuegosEl = el;
    return marker;
  }

  function scheduleLeafletResize() {
    if (mapKind !== "leaflet" || !map) return;
    const run = () => {
      try {
        map.invalidateSize({ animate: false, pan: false });
      } catch {
        /* ignore */
      }
    };
    run();
    requestAnimationFrame(run);
    [50, 150, 400, 1000].forEach((ms) => window.setTimeout(run, ms));
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
      <div class="firms-popup">
        <span class="source-badge sat">Satélite · FIRMS</span>
        <strong>Detección de calor VIIRS</strong><br/>
        ${escapeHtml(p.acq_date || "—")} ${escapeHtml(hhmm)} UTC<br/>
        Confianza: ${escapeHtml(p.confidence || "—")} · FRP ${escapeHtml(String(p.frp ?? "—"))}<br/>
        <em class="source-caveat">No es un parte oficial de extinción. Contrasta con 112 / Protección Civil.</em>
      </div>
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
            attribution: ATTR_OSM_CARTO,
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
      zoom: Math.round(FOCUS.zoom),
      zoomControl: false,
      preferCanvas: true,
      maxBounds: [
        [26.8, -19.5],
        [44.6, 5.8],
      ],
      maxBoundsViscosity: 0.85,
      attributionControl: true,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    Llayers.street = L.tileLayer(STREET_TILE_TMPL, {
      attribution: ATTR_OSM_CARTO,
      maxZoom: 19,
      subdomains: "abcd",
    });
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

    setHeaderStatus("Mapa · sin WebGL");
    scheduleLeafletResize();
    window.addEventListener("resize", scheduleLeafletResize, { passive: true });
    window.addEventListener("orientationchange", scheduleLeafletResize, { passive: true });
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
          "circle-color": FIRMS_COLORS.glow,
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
            FIRMS_COLORS.high,
            "nominal",
            FIRMS_COLORS.nominal,
            FIRMS_COLORS.other,
          ],
          "circle-stroke-width": 1.25,
          "circle-stroke-color": FIRMS_COLORS.stroke,
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
          const color =
            conf === "high" ? FIRMS_COLORS.high : FIRMS_COLORS.nominal;
          return L.circleMarker(latlng, {
            radius: 5,
            color: FIRMS_COLORS.stroke,
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
      scheduleLeafletResize();
      return;
    }

    const src = map && map.getSource("firms");
    if (src && typeof src.setData === "function") src.setData(fc);
  }

  function slimFireForCache(fire) {
    if (!fire || typeof fire !== "object") return null;
    const copy = { ...fire };
    delete copy.history;
    return copy;
  }

  function readSpotsCache() {
    try {
      const raw = localStorage.getItem(SPOTS_CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return null;
      const savedAt = Number(data.savedAt) || 0;
      if (!savedAt || Date.now() - savedAt > SPOTS_CACHE_MAX_AGE_MS) return null;
      const cachedFires = Array.isArray(data.fires) ? data.fires.filter(Boolean) : [];
      const firms =
        data.firms && data.firms.type === "FeatureCollection"
          ? data.firms
          : { type: "FeatureCollection", features: [] };
      if (!cachedFires.length && !(firms.features && firms.features.length)) return null;
      return { savedAt, fires: cachedFires, firms };
    } catch {
      return null;
    }
  }

  function writeSpotsCache(nextFires, nextFirms) {
    try {
      localStorage.setItem(
        SPOTS_CACHE_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          fires: (nextFires || []).map(slimFireForCache).filter(Boolean),
          firms:
            nextFirms && nextFirms.type === "FeatureCollection"
              ? {
                  type: "FeatureCollection",
                  features: Array.isArray(nextFirms.features) ? nextFirms.features : [],
                }
              : { type: "FeatureCollection", features: [] },
        })
      );
    } catch (err) {
      try {
        localStorage.setItem(
          SPOTS_CACHE_KEY,
          JSON.stringify({
            savedAt: Date.now(),
            fires: (nextFires || []).map(slimFireForCache).filter(Boolean),
            firms: { type: "FeatureCollection", features: [] },
          })
        );
      } catch {
        console.warn("spots cache write failed", err);
      }
    }
  }

  function hydrateFromCache() {
    const cached = readSpotsCache();
    if (!cached) return false;
    fires = cached.fires.slice().sort(compareFires);
    setFirmsData(cached.firms);
    lastRefreshAt = cached.savedAt;
    renderSidebar();
    renderMarkers();
    updateTicker();
    scheduleLeafletResize();
    const hashId = currentHash();
    if (hashId === "about" || (hashId && fires.some((f) => f.id === hashId))) {
      syncRouteFromHash();
    }
    return true;
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

  async function fetchJsonWithFallback(primaryUrl, fallbackUrl, label, timeoutMs) {
    const ms = timeoutMs == null ? 18_000 : timeoutMs;
    const tryOnce = async (url) => {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), ms);
      try {
        const res = await fetch(url, {
          signal: ctrl.signal,
          credentials: "omit",
          cache: "no-cache",
        });
        if (!res.ok) throw new Error(`${label} HTTP ${res.status} @ ${url}`);
        return await res.json();
      } finally {
        window.clearTimeout(t);
      }
    };
    try {
      return await tryOnce(primaryUrl);
    } catch (err) {
      console.warn(`${label} proxy failed, trying same-origin fallback`, err);
      return await tryOnce(fallbackUrl);
    }
  }

  async function fetchFirmsHotspots() {
    return fetchJsonWithFallback(FIRMS_URL, FIRMS_FALLBACK_URL, "FIRMS", 25_000);
  }

  async function fetchFogosPtFires() {
    const payload = await fetchJsonWithFallback(FOGOS_URL, FOGOS_FALLBACK_URL, "fogos", 18_000);
    return filterFogosRows(payload);
  }

  async function fetchBombersFires() {
    const payload = await fetchJsonWithFallback(BOMBERS_URL, BOMBERS_FALLBACK_URL, "Bombers", 18_000);
    return filterBombersRows(payload);
  }

  async function fetchInfocaFires() {
    const payload = await fetchJsonWithFallback(INFOCA_URL, INFOCA_FALLBACK_URL, "INFOCA", 18_000);
    return filterInfocaRows(payload);
  }

  async function fetchInfocamFires() {
    const payload = await fetchJsonWithFallback(INFOCAM_URL, INFOCAM_FALLBACK_URL, "INFOCAM", 18_000);
    return filterInfocamRows(payload);
  }

  async function fetchAragonFires() {
    const payload = await fetchJsonWithFallback(ARAGON_URL, ARAGON_FALLBACK_URL, "Aragón", 18_000);
    return filterAragonRows(payload);
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
    if (fire.source === SOURCE.GALICIA) {
      return !!(els.layerGalicia && els.layerGalicia.checked);
    }
    if (fire.source === SOURCE.BOMBERS) {
      return !!(els.layerCatalunya && els.layerCatalunya.checked);
    }
    if (fire.source === SOURCE.INFOCA) {
      return !!(els.layerAndalucia && els.layerAndalucia.checked);
    }
    if (fire.source === SOURCE.INFOCAM) {
      return !!(els.layerClm && els.layerClm.checked);
    }
    if (fire.source === SOURCE.ARAGON) {
      return !!(els.layerAragon && els.layerAragon.checked);
    }
    if (fire.source === SOURCE.FOGOS) {
      return !!(els.layerPortugal && els.layerPortugal.checked);
    }
    return !!(els.layerOficiales && els.layerOficiales.checked);
  }

  function filteredFires() {
    return fires.filter((f) => layerAllows(f));
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

    document.documentElement.classList.toggle("sheet-detail", !!fire);
    renderSidebar();

    if (fire && fly && fire.lat != null && fire.lng != null) {
      // Open sheet first so padding accounts for its height, then frame the dot.
      showSidebar(true);
      // Mobile: setSheetOpen (via showSidebar) reframes after the sheet transition.
      if (!isMobileLayout()) {
        keepSelectedFireInView({ delay: 0, durationMs: 650 });
      }
    }

    if (id) {
      history.replaceState(null, "", `#${encodeURIComponent(id)}`);
      setAboutOpen(false, { skipHash: true });
    } else if (location.hash && currentHash() !== "about") {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  function assetBlock(fire) {
    return `
      <div class="assets" aria-label="${escapeHtml(I18n.t("detail.assets"))}">
        <span class="asset" title="${escapeHtml(I18n.t("detail.man"))}">
          <svg><use href="#ico-man"></use></svg>
          <span><strong>${fire.man}</strong><br /><em>${escapeHtml(I18n.t("detail.man"))}</em></span>
        </span>
        <span class="asset" title="${escapeHtml(I18n.t("detail.terrain"))}">
          <svg><use href="#ico-truck"></use></svg>
          <span><strong>${fire.terrain}</strong><br /><em>${escapeHtml(I18n.t("detail.terrain"))}</em></span>
        </span>
        <span class="asset" title="${escapeHtml(I18n.t("detail.aerial"))}">
          <svg><use href="#ico-plane"></use></svg>
          <span><strong>${fire.aerial}</strong><br /><em>${escapeHtml(I18n.t("detail.aerial"))}</em></span>
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
      (a, b) =>
        b.activo - a.activo ||
        b.total - a.total ||
        a.province.localeCompare(b.province, "es")
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
    if (label) setHeaderStatus(`${label} · mapa`);
  }

  function renderMarkers() {
    clearMarkers();

    filteredFires().forEach((fire) => {
      const el = document.createElement("button");
      el.type = "button";
      const size = markerSizeClass(fire);
      const recency = recencyClass(fire);
      el.className = `map-marker ${fire.statusClass} ${size} ${recency}${
        fire.source === SOURCE.GALICIA ? " citizen" : ""
      }${fire.country === "PT" ? " pt" : ""}`;
      const medios = fire.man + fire.terrain + fire.aerial;
      const src = sourceBadgeMeta(fire);
      el.title = `${src.titleTag} · ${fire.locationLine} — ${fire.status} · parte ${formatRelativeParte(fire)} · ${medios} medios`;
      el.setAttribute(
        "aria-label",
        `${src.label}, ${fire.municipality}, ${fire.status}, parte ${formatRelativeParte(fire)}`
      );
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        selectFire(fire.id, true);
      });
      const marker = createHtmlMarker(el, fire.lng, fire.lat);
      if (mapKind === "leaflet" && marker && typeof marker.on === "function") {
        marker.on("click", (ev) => {
          L.DomEvent.stopPropagation(ev);
          selectFire(fire.id, true);
        });
      }
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
    scheduleLeafletResize();
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

    const xOf = (tMs) => pad.l + ((tMs - t0) / span) * iw;
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

  /** Province / place line without repeating the municipality title. */
  function detailPlaceLine(fire) {
    const loc = String(fire.locationLine || "").trim();
    const muni = String(fire.municipality || "").trim();
    if (!loc) return "";
    if (!muni) return loc;
    if (loc.localeCompare(muni, "es", { sensitivity: "accent" }) === 0) return "";
    const escaped = muni.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${escaped}\\s*,\\s*`, "i");
    if (re.test(loc)) return loc.replace(re, "").trim();
    return loc;
  }

  function causeFieldLabel(fire) {
    if (fire.source === SOURCE.GALICIA) return I18n.t("detail.origin");
    if (fire.source === SOURCE.FOGOS) return I18n.t("detail.nature");
    return I18n.t("detail.cause");
  }

  function renderFireDetail(fire) {
    els.sidebar.classList.add("is-detail");
    els.sidebar.setAttribute("aria-label", I18n.t("sidebar.detail"));

    const back = document.createElement("button");
    back.type = "button";
    back.className = "detail-back";
    back.textContent = I18n.t("detail.back");
    back.addEventListener("click", () => selectFire(null, false));
    appendListItem(back);

    const place = detailPlaceLine(fire);
    const card = document.createElement("article");
    card.className = "card is-selected";
    card.innerHTML = `
      <div class="fire-status ${fire.statusClass}"></div>
      <div class="card-body">
        <div class="card-badges">
          <span class="country-badge ${fire.country.toLowerCase()}">${fire.country}</span>
          ${sourceBadgeHtml(fire)}
          <span class="status-pill ${fire.statusClass}">${escapeHtml(fire.status)}</span>
        </div>
        <h3 class="card-title">${escapeHtml(fire.municipality)}</h3>
        ${place ? `<p class="card-sub">${escapeHtml(place)}</p>` : ""}
        ${sourceCaveatHtml(fire)}
        <div class="fields">
          <div class="field">
            <h6 class="field-label">${escapeHtml(I18n.t("detail.start"))}</h6>
            <p class="field-value">${escapeHtml(fire.started || "—")}</p>
          </div>
          <div class="field">
            <h6 class="field-label">${escapeHtml(I18n.t("detail.parte"))}</h6>
            <p class="field-value">${escapeHtml(formatRelativeParte(fire))}</p>
          </div>
          <div class="field">
            <h6 class="field-label">${escapeHtml(I18n.t("detail.surface"))}</h6>
            <p class="field-value">${escapeHtml(fire.surface)}</p>
          </div>
          <div class="field">
            <h6 class="field-label">${escapeHtml(I18n.t("detail.level"))}</h6>
            <p class="field-value">${escapeHtml(String(fire.level ?? "—"))}</p>
          </div>
          <div class="field">
            <h6 class="field-label">${escapeHtml(causeFieldLabel(fire))}</h6>
            <p class="field-value">${escapeHtml(String(fire.cause ?? "—"))}</p>
          </div>
        </div>
        ${fire.source === SOURCE.GALICIA ? "" : assetBlock(fire)}
        <p class="detail-source">${escapeHtml(I18n.t("detail.source"))} · ${sourceLinkHtml(fire)}</p>
      </div>
    `;
    if (fire.source === SOURCE.JCYL) {
      const body = card.querySelector(".card-body");
      const srcEl = body?.querySelector(".detail-source");
      const chart = buildResourcesChart(fire.history || []);
      if (body && srcEl) body.insertBefore(chart, srcEl);
      else if (body) body.appendChild(chart);
    }
    appendListItem(card);
  }

  function renderSatNationCard() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "region-card is-firms";
    btn.innerHTML = `
      <div class="region-head">
        <h3 class="region-name">España · satélite</h3>
        <span class="source-badge sat">Satélite</span>
      </div>
      <p class="region-meta"><strong>${firmsCount}</strong> detección${firmsCount === 1 ? "" : "es"} VIIRS 24h (NASA FIRMS) — no son partes oficiales</p>
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
        <span class="source-badge aviso">Aviso</span>
      </div>
      <p class="region-meta">${
        n
          ? `<strong>${n}</strong> aviso${n === 1 ? "" : "s"} cidadáns (incendios.gal) — no oficiales`
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
          <span class="source-badge oficial">Oficial</span>
        </div>
        <p class="region-meta"><strong>${region.total}</strong> en curso${
          bits.length ? ` · ${escapeHtml(bits.join(" · "))}` : ""
        }</p>
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
        <span class="source-badge despacho">Despacho</span>
      </div>
      <p class="region-meta"><strong>${ptFires.length}</strong> en curso${
        activos ? ` · ${activos} activos` : ""
      } · ANEPC vía fogos.pt</p>
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
          <span class="source-badge despacho">PT</span>
        </div>
        <p class="region-meta"><strong>${region.total}</strong> · ${escapeHtml(
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

  function renderRegionalSection(opts) {
    const { title, fires: regionFires, badgeKind, badgeLabel, emptyText, layerEl, bbox, label } = opts;
    const head = document.createElement("p");
    head.className = "panel-title";
    head.textContent = title;
    appendListItem(head);

    if (!regionFires.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = emptyText;
      appendListItem(empty);
      if (bbox) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "region-card is-sat";
        btn.innerHTML = `
          <div class="region-head">
            <h3 class="region-name">${escapeHtml(label)}</h3>
            <span class="source-badge ${badgeKind}">${escapeHtml(badgeLabel)}</span>
          </div>
          <p class="region-meta">Pulsa para acercar el mapa</p>
        `;
        btn.addEventListener("click", () => {
          flyToBbox(bbox, label);
          showSidebar(true);
        });
        appendListItem(btn);
      }
      return;
    }

    const summary = document.createElement("button");
    summary.type = "button";
    summary.className = "region-card";
    const activos = regionFires.filter((f) => f.statusClass === "activo").length;
    summary.innerHTML = `
      <div class="region-head">
        <h3 class="region-name">${escapeHtml(label)}</h3>
        <span class="source-badge ${badgeKind}">${escapeHtml(badgeLabel)}</span>
      </div>
      <p class="region-meta"><strong>${regionFires.length}</strong> en curso${
        activos ? ` · ${activos} activo${activos === 1 ? "" : "s"}` : ""
      }</p>
    `;
    summary.addEventListener("click", () => {
      if (layerEl && !layerEl.checked) {
        layerEl.checked = true;
        layerEl.closest(".layer-item")?.classList.toggle("is-on", true);
        renderSidebar();
        renderMarkers();
        updateTicker();
      }
      flyToFires(regionFires);
      showSidebar(true);
    });
    appendListItem(summary);
  }

  function renderRegionOverview(list) {
    els.sidebar.classList.remove("is-detail");
    els.sidebar.setAttribute("aria-label", I18n.t("sidebar.overview"));

    const cylFires = list.filter((f) => f.source === SOURCE.JCYL);
    const gaFires = list.filter((f) => f.source === SOURCE.GALICIA);
    const catFires = list.filter((f) => f.source === SOURCE.BOMBERS);
    const andFires = list.filter((f) => f.source === SOURCE.INFOCA);
    const clmFires = list.filter((f) => f.source === SOURCE.INFOCAM);
    const araFires = list.filter((f) => f.source === SOURCE.ARAGON);
    const ptFires = list.filter((f) => f.source === SOURCE.FOGOS);

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

    renderRegionalSection({
      title: "Cataluña · Bombers",
      fires: catFires,
      badgeKind: "despacho",
      badgeLabel: "Bombers",
      emptyText: "No hay incendios de vegetación abiertos en Bombers ahora.",
      layerEl: els.layerCatalunya,
      bbox: CATALUNYA_BBOX,
      label: "Cataluña",
    });

    renderRegionalSection({
      title: "Andalucía · INFOCA",
      fires: andFires,
      badgeKind: "oficial",
      badgeLabel: "INFOCA",
      emptyText: "No hay incidentes INFOCA abiertos ahora.",
      layerEl: els.layerAndalucia,
      bbox: ANDALUCIA_BBOX,
      label: "Andalucía",
    });

    renderRegionalSection({
      title: "Castilla-La Mancha · INFOCAM",
      fires: clmFires,
      badgeKind: "oficial",
      badgeLabel: "INFOCAM",
      emptyText: "No hay partes INFOCAM abiertos ahora.",
      layerEl: els.layerClm,
      bbox: CLM_BBOX,
      label: "C-LM",
    });

    renderRegionalSection({
      title: "Aragón · CartoFor",
      fires: araFires,
      badgeKind: "oficial",
      badgeLabel: "Aragón",
      emptyText: "No hay incendios activos en el WFS de Aragón ahora.",
      layerEl: els.layerAragon,
      bbox: ARAGON_BBOX,
      label: "Aragón",
    });

    renderPortugalSection(ptFires);

    const sat = document.createElement("p");
    sat.className = "overview-note";
    sat.innerHTML =
      "Cobertura regional: JCyL, Galicia, Bombers (CAT), INFOCA (AND), INFOCAM (C-LM), Aragón, fogos.pt. Resto: <strong>FIRMS</strong> satélite. Candidatos: 112CV, EUMETSAT FRP.";
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

    renderRegionOverview(list);
  }

  function formatClock(date) {
    const locale = I18n.clockLocale();
    try {
      return new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    } catch {
      return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    }
  }

  function setHeaderStatus(text) {
    if (els.ticker) els.ticker.textContent = text;
  }

  function updateTicker() {
    const visible = filteredFires();
    const activos = visible.filter((f) => f.statusClass === "activo").length;
    const firmsOn = !(els.layerFirms && !els.layerFirms.checked);
    const bits = [];
    if (visible.length) {
      bits.push(
        I18n.t(visible.length === 1 ? "ticker.fires_one" : "ticker.fires_many", {
          n: visible.length,
        })
      );
      if (activos) {
        bits.push(
          I18n.t(activos === 1 ? "ticker.active_one" : "ticker.active_many", { n: activos })
        );
      }
    }
    if (firmsOn && firmsCount) bits.push(I18n.t("ticker.sat", { n: firmsCount }));
    const clock = formatClock(new Date());
    const line = bits.length
      ? `${bits.join(" · ")} · ${clock}`
      : `${I18n.t("ticker.updating")} · ${clock}`;
    setHeaderStatus(line);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Short provenance label for UI (oficial / aviso / despacho). */
  function sourceBadgeMeta(fire) {
    if (fire.source === SOURCE.GALICIA) {
      return {
        kind: "aviso",
        label: "Aviso · incendios.gal",
        short: "Aviso",
        caveat: "Aviso colaborativo — no es un parte oficial de extinción.",
        titleTag: "aviso incendios.gal",
      };
    }
    if (fire.source === SOURCE.BOMBERS) {
      return {
        kind: "despacho",
        label: "Despacho · Bombers",
        short: "Bombers",
        caveat: "Actuación Bombers (Generalitat) — no sustituye 112 / Protecció Civil.",
        titleTag: "despacho Bombers CAT",
      };
    }
    if (fire.source === SOURCE.INFOCA) {
      return {
        kind: "oficial",
        label: "Oficial · INFOCA",
        short: "INFOCA",
        caveat: "Incidente INFOCA (Junta de Andalucía / EMA) vía cuadro de mando público.",
        titleTag: "INFOCA Andalucía",
      };
    }
    if (fire.source === SOURCE.INFOCAM) {
      return {
        kind: "oficial",
        label: "Oficial · INFOCAM",
        short: "INFOCAM",
        caveat: "Parte INFOCAM (Castilla-La Mancha) vía FeatureServer público.",
        titleTag: "INFOCAM C-LM",
      };
    }
    if (fire.source === SOURCE.ARAGON) {
      return {
        kind: "oficial",
        label: "Oficial · Aragón",
        short: "Aragón",
        caveat: "Incendio activo CartoFor / IDEAragon (metadatos limitados: id + punto).",
        titleTag: "Aragón CartoFor",
      };
    }
    if (fire.source === SOURCE.FOGOS) {
      return {
        kind: "despacho",
        label: "Despacho · fogos.pt",
        short: "Despacho",
        caveat: "Despacho ANEPC vía fogos.pt — no sustituye canales oficiales ES.",
        titleTag: "despacho fogos.pt",
      };
    }
    return {
      kind: "oficial",
      label: "Oficial · JCyL",
      short: "Oficial",
      caveat: null,
      titleTag: "oficial JCyL",
    };
  }

  function sourceBadgeHtml(fire) {
    const meta = sourceBadgeMeta(fire);
    return `<span class="source-badge ${meta.kind}">${escapeHtml(meta.label)}</span>`;
  }

  function sourceCaveatHtml(fire) {
    const meta = sourceBadgeMeta(fire);
    if (!meta.caveat) return "";
    return `<p class="source-caveat">${escapeHtml(meta.caveat)}</p>`;
  }

  function sourceLinkHtml(fire) {
    if (fire.source === SOURCE.GALICIA) {
      return fire.detailUrl
        ? `<a href="${escapeHtml(fire.detailUrl)}" rel="noopener" target="_blank">${SOURCE.GALICIA}</a> (avisos cidadáns)`
        : SOURCE.GALICIA;
    }
    if (fire.source === SOURCE.BOMBERS) {
      return fire.detailUrl
        ? `<a href="${escapeHtml(fire.detailUrl)}" rel="noopener" target="_blank">Bombers CAT</a>`
        : "Bombers CAT";
    }
    if (fire.source === SOURCE.INFOCA) {
      return fire.detailUrl
        ? `<a href="${escapeHtml(fire.detailUrl)}" rel="noopener" target="_blank">INFOCA / EMA</a>`
        : "INFOCA";
    }
    if (fire.source === SOURCE.INFOCAM) {
      return fire.detailUrl
        ? `<a href="${escapeHtml(fire.detailUrl)}" rel="noopener" target="_blank">INFOCAM / FIDIAS</a>`
        : "INFOCAM";
    }
    if (fire.source === SOURCE.ARAGON) {
      return fire.detailUrl
        ? `<a href="${escapeHtml(fire.detailUrl)}" rel="noopener" target="_blank">IDEAragon</a>`
        : "Aragón";
    }
    if (fire.source === SOURCE.FOGOS) {
      return fire.detailUrl
        ? `<a href="${escapeHtml(fire.detailUrl)}" rel="noopener" target="_blank">${SOURCE.FOGOS}</a> (ANEPC)`
        : SOURCE.FOGOS;
    }
    return `España · ${SOURCE.JCYL}`;
  }

  async function refresh() {
    if (refreshInFlight) return refreshInFlight;
    setHeaderStatus(I18n.t("ticker.updating"));
    refreshInFlight = (async () => {
    try {
      const [esResult, gaResult, catResult, andResult, clmResult, araResult, ptResult, firmsResult] =
        await Promise.allSettled([
          fetchJcylFires(),
          fetchGaliciaFires(),
          fetchBombersFires(),
          fetchInfocaFires(),
          fetchInfocamFires(),
          fetchAragonFires(),
          fetchFogosPtFires(),
          fetchFirmsHotspots(),
        ]);
      const esFires = esResult.status === "fulfilled" ? esResult.value : [];
      const gaFires = gaResult.status === "fulfilled" ? gaResult.value : [];
      const catFires = catResult.status === "fulfilled" ? catResult.value : [];
      const andFires = andResult.status === "fulfilled" ? andResult.value : [];
      const clmFires = clmResult.status === "fulfilled" ? clmResult.value : [];
      const araFires = araResult.status === "fulfilled" ? araResult.value : [];
      const ptFires = ptResult.status === "fulfilled" ? ptResult.value : [];
      if (esResult.status === "rejected") console.error(esResult.reason);
      if (gaResult.status === "rejected") console.error(gaResult.reason);
      if (catResult.status === "rejected") console.error(catResult.reason);
      if (andResult.status === "rejected") console.error(andResult.reason);
      if (clmResult.status === "rejected") console.error(clmResult.reason);
      if (araResult.status === "rejected") console.error(araResult.reason);
      if (ptResult.status === "rejected") console.error(ptResult.reason);
      if (firmsResult.status === "rejected") console.error(firmsResult.reason);

      if (firmsResult.status === "fulfilled") {
        setFirmsData(firmsResult.value);
      } else if (!firmsCount) {
        setFirmsData({ type: "FeatureCollection", features: [] });
      }

      fires = [...esFires, ...gaFires, ...catFires, ...andFires, ...clmFires, ...araFires, ...ptFires].sort(
        compareFires
      );
      const notes = [];
      if (esResult.status === "rejected") notes.push("CyL");
      if (gaResult.status === "rejected") notes.push("Gal");
      if (catResult.status === "rejected") notes.push("CAT");
      if (andResult.status === "rejected") notes.push("AND");
      if (clmResult.status === "rejected") notes.push("CLM");
      if (araResult.status === "rejected") notes.push("ARA");
      if (ptResult.status === "rejected") notes.push("PT");
      if (firmsResult.status === "rejected") notes.push("sat");

      if (selectedId && !fires.some((f) => f.id === selectedId)) selectedId = null;
      renderSidebar();
      renderMarkers();
      updateTicker();
      scheduleLeafletResize();
      lastRefreshAt = Date.now();
      if (fires.length || firmsCount) writeSpotsCache(fires, firmsGeo);
      if (notes.length) {
        setHeaderStatus(`${els.ticker.textContent} · falló ${notes.join("/")}`);
      }

      const hashId = currentHash();
      if (hashId === "about" || (hashId && fires.some((f) => f.id === hashId))) {
        syncRouteFromHash();
      }

      if (
        !fires.length &&
        !firmsCount &&
        esResult.status === "rejected" &&
        gaResult.status === "rejected" &&
        catResult.status === "rejected" &&
        andResult.status === "rejected" &&
        clmResult.status === "rejected" &&
        araResult.status === "rejected" &&
        ptResult.status === "rejected" &&
        firmsResult.status === "rejected"
      ) {
        els.list.innerHTML = `<li class="error">${escapeHtml(I18n.t("error.load"))}</li>`;
        setHeaderStatus("Error al actualizar");
      }
    } catch (err) {
      console.error(err);
      // Keep cached / last good spots on screen when the refresh blows up.
      if (!fires.length && !firmsCount) {
        selectedId = null;
        els.sidebar.classList.remove("is-detail");
        els.list.innerHTML = `<li class="error">${escapeHtml(I18n.t("error.load"))}</li>`;
        clearMarkers();
      }
      setHeaderStatus("Error al actualizar");
    } finally {
      refreshInFlight = null;
    }
    })();
    return refreshInFlight;
  }

  function dataIsStale() {
    if (!lastRefreshAt) return true;
    return Date.now() - lastRefreshAt >= IDLE_STALE_MS;
  }

  function noteActivity() {
    lastActivityAt = Date.now();
  }

  function refreshIfStale() {
    if (document.visibilityState === "hidden") return;
    if (!dataIsStale()) return;
    refresh();
  }

  function startRefreshLoop() {
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      refresh();
    }, REFRESH_MS);

    const onMaybeResume = () => {
      noteActivity();
      refreshIfStale();
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onMaybeResume();
    });
    window.addEventListener("pageshow", onMaybeResume);
    window.addEventListener("focus", onMaybeResume);

    for (const evt of ["pointerdown", "touchstart", "keydown", "scroll"]) {
      window.addEventListener(
        evt,
        () => {
          const wasIdle = Date.now() - lastActivityAt >= IDLE_STALE_MS;
          noteActivity();
          if (wasIdle) refreshIfStale();
        },
        { passive: true, capture: true }
      );
    }
  }

  function isMobileLayout() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

  function notifyMapResize() {
    if (!map) return;
    if (mapKind === "leaflet") {
      scheduleLeafletResize();
      return;
    }
    requestAnimationFrame(() => {
      try {
        if (mapKind === "gl" && typeof map.resize === "function") {
          map.resize();
        }
      } catch {
        /* ignore */
      }
    });
  }

  function setSheetOpen(open) {
    if (!els.sidebar) return;
    els.sidebar.classList.toggle("is-sheet-open", !!open);
    document.documentElement.classList.toggle("sheet-open", !!open);
    if (els.btnSheet) els.btnSheet.setAttribute("aria-expanded", open ? "true" : "false");
    notifyMapResize();
    if (selectedId) {
      keepSelectedFireInView({ delay: isMobileLayout() ? 300 : 0, durationMs: 380 });
    }
  }

  function showSidebar(show) {
    if (isMobileLayout()) {
      // Map-first: peek always visible; show=true expands the sheet.
      els.sidebar.classList.remove("is-hidden");
      setSheetOpen(!!show);
      return;
    }
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
      setHeaderStatus("Sin geolocalización");
      return;
    }
    if (els.btnLocate) {
      els.btnLocate.disabled = true;
      els.btnLocate.setAttribute("aria-busy", "true");
    }
    setHeaderStatus("Ubicando…");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation(lng, lat);
        mapFlyToLngLat(lng, lat, Math.max(mapGetZoom(), 10));
        setHeaderStatus("Aquí");
        updateTicker();
        if (els.btnLocate) {
          els.btnLocate.disabled = false;
          els.btnLocate.removeAttribute("aria-busy");
        }
      },
      (err) => {
        let msg = "Sin ubicación";
        if (err && err.code === 1) msg = "Ubicación denegada";
        else if (err && err.code === 2) msg = "Ubicación no disponible";
        else if (err && err.code === 3) msg = "Sin ubicación";
        setHeaderStatus(msg);
        if (els.btnLocate) {
          els.btnLocate.disabled = false;
          els.btnLocate.removeAttribute("aria-busy");
        }
        window.setTimeout(updateTicker, 2500);
      },
      // Coarse + short timeout: high-accuracy GPS can hang for a long time.
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 120000 }
    );
  }

  function currentHash() {
    return decodeURIComponent((location.hash || "").replace(/^#/, ""));
  }

  function setAboutOpen(open, opts) {
    const skipHash = opts && opts.skipHash;
    document.documentElement.classList.toggle("is-about", !!open);
    if (els.linkAbout) {
      els.linkAbout.classList.toggle("is-active", !!open);
      if (open) els.linkAbout.setAttribute("aria-current", "page");
      else els.linkAbout.removeAttribute("aria-current");
    }
    if (open && els.layersPanel) {
      els.layersPanel.classList.add("collapsed");
      els.layersPanel.hidden = true;
      if (els.btnLayers) {
        els.btnLayers.setAttribute("aria-expanded", "false");
        els.btnLayers.classList.remove("is-active");
      }
    }
    document.title = open ? aboutTitle() : TITLE_HOME;
    if (!skipHash) {
      if (open && currentHash() !== "about") {
        history.pushState(null, "", "#about");
      } else if (!open && currentHash() === "about") {
        history.replaceState(null, "", location.pathname + location.search);
      }
    }
    if (!open) notifyMapResize();
  }

  function syncRouteFromHash() {
    const h = currentHash();
    if (h === "about") {
      setAboutOpen(true, { skipHash: true });
      return;
    }
    if (document.documentElement.classList.contains("is-about")) {
      setAboutOpen(false, { skipHash: true });
    }
    if (h && fires.some((f) => f.id === h)) {
      selectFire(h, true);
    }
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
        if (isMobileLayout()) {
          setSheetOpen(!els.sidebar.classList.contains("is-sheet-open"));
          return;
        }
        const hidden = els.sidebar.classList.contains("is-hidden");
        showSidebar(hidden);
      });
    }

    if (els.btnSheet) {
      els.btnSheet.addEventListener("click", () => {
        setSheetOpen(!els.sidebar.classList.contains("is-sheet-open"));
      });
    }

    function syncLayersToggle() {
      if (!els.btnLayers || !els.layersPanel) return;
      const open = !els.layersPanel.classList.contains("collapsed");
      els.btnLayers.setAttribute("aria-expanded", open ? "true" : "false");
      els.btnLayers.classList.toggle("is-active", open);
      els.layersPanel.hidden = !open;
    }

    els.btnLayers.addEventListener("click", () => {
      if (document.documentElement.classList.contains("is-about")) {
        setAboutOpen(false);
        return;
      }
      els.layersPanel.classList.toggle("collapsed");
      syncLayersToggle();
    });

    // Close layers when clicking the map chrome (not the panel).
    document.addEventListener("click", (e) => {
      if (!els.layersPanel || els.layersPanel.classList.contains("collapsed")) return;
      const t = e.target;
      if (els.layersPanel.contains(t) || els.btnLayers.contains(t)) return;
      els.layersPanel.classList.add("collapsed");
      syncLayersToggle();
    });

    syncLayersToggle();

    window.addEventListener("hashchange", syncRouteFromHash);
    if (currentHash() === "about") setAboutOpen(true, { skipHash: true });

    if (els.linkAbout) {
      els.linkAbout.addEventListener("click", (e) => {
        if (currentHash() === "about") {
          e.preventDefault();
          setAboutOpen(true, { skipHash: true });
        }
      });
    }

    const brand = document.querySelector(".brand");
    if (brand) {
      brand.addEventListener("click", (e) => {
        if (document.documentElement.classList.contains("is-about")) {
          e.preventDefault();
          setAboutOpen(false);
        }
      });
    }

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
    if (els.layerCatalunya) {
      els.layerCatalunya.addEventListener("change", () => {
        const on = els.layerCatalunya.checked;
        els.layerCatalunya.closest(".layer-item")?.classList.toggle("is-on", on);
        renderSidebar();
        renderMarkers();
        updateTicker();
      });
    }
    if (els.layerAndalucia) {
      els.layerAndalucia.addEventListener("change", () => {
        const on = els.layerAndalucia.checked;
        els.layerAndalucia.closest(".layer-item")?.classList.toggle("is-on", on);
        renderSidebar();
        renderMarkers();
        updateTicker();
      });
    }
    if (els.layerClm) {
      els.layerClm.addEventListener("change", () => {
        const on = els.layerClm.checked;
        els.layerClm.closest(".layer-item")?.classList.toggle("is-on", on);
        renderSidebar();
        renderMarkers();
        updateTicker();
      });
    }
    if (els.layerAragon) {
      els.layerAragon.addEventListener("change", () => {
        const on = els.layerAragon.checked;
        els.layerAragon.closest(".layer-item")?.classList.toggle("is-on", on);
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
      els.layerCatalunya,
      els.layerAndalucia,
      els.layerClm,
      els.layerAragon,
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
      // Map-first like fogos.pt: peek strip only until the user opens the list.
      els.sidebar.classList.remove("is-hidden");
      setSheetOpen(false);
      if (els.layersPanel) {
        els.layersPanel.classList.add("collapsed");
        syncLayersToggle();
      }
    }

    window.addEventListener(
      "resize",
      () => {
        if (!isMobileLayout()) {
          document.documentElement.classList.remove("sheet-open", "sheet-detail");
          els.sidebar.classList.remove("is-sheet-open");
        }
        notifyMapResize();
      },
      { passive: true }
    );
  }

  async function boot() {
    I18n.init();
    I18n.setOnChange(() => {
      if (document.documentElement.classList.contains("is-about")) {
        document.title = aboutTitle();
      }
      updateTicker();
      renderSidebar();
    });
    wireUi();
    const startData = () => {
      ensureFirmsLayers();
      applyLayerChecks();
      hydrateFromCache();
      refresh();
      startRefreshLoop();
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
      if (els.ticker) setHeaderStatus(I18n.t("ticker.unavailable"));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
