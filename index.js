/* Fuegos Vivos — AGPL-3.0 */
(function () {
  "use strict";

  const FOCUS = {
    center: [-5.8, 42.55],
    zoom: 6.15,
    // Norte: Galicia → Navarra (+ norte de CyL)
    bbox: [-9.4, 41.0, -0.6, 43.9],
  };

  /** Provinces with open live official partes (JCyL). */
  const OFFICIAL_PROVINCES = new Set([
    "LEÓN",
    "SALAMANCA",
    "ZAMORA",
    "ÁVILA",
    "AVILA",
    "VALLADOLID",
    "PALENCIA",
    "BURGOS",
    "SEGOVIA",
    "SORIA",
  ]);

  /** Northern CCAA in the sidebar (Galicia has citizen reports; others EFFIS). */
  const NORTH_REGIONS = [
    { id: "galicia", name: "Galicia", kind: "galicia", bbox: [-9.35, 41.78, -6.7, 43.8] },
    { id: "asturias", name: "Asturias", kind: "sat", bbox: [-7.25, 42.85, -4.45, 43.7] },
    { id: "cantabria", name: "Cantabria", kind: "sat", bbox: [-4.85, 42.75, -3.15, 43.55] },
    { id: "pais-vasco", name: "País Vasco", kind: "sat", bbox: [-3.45, 42.95, -1.7, 43.5] },
    { id: "navarra", name: "Navarra", kind: "sat", bbox: [-2.5, 41.85, -0.7, 43.35] },
    { id: "la-rioja", name: "La Rioja", kind: "sat", bbox: [-3.15, 41.9, -1.7, 42.65] },
  ];

  const ACTIVE_STATUSES = new Set(["ACTIVO", "CONTROLADO", "ESTABILIZADO"]);
  /** Only keep fires with a recent official parte (ongoing bulletin, not archive). */
  const PARTE_LOOKBACK_DAYS = 3;
  const GALICIA_LOOKBACK_DAYS = 14;
  const GALICIA_FIRE_TIPOS = new Set([
    "lume-visible",
    "fume",
    "zona-queimada",
    "presenza-de-medios-de-emerxencia",
    "afectacion-a-poboacion",
  ]);
  const REFRESH_MS = 5 * 60 * 1000;
  const JCYL_URL =
    "https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/incendios-forestales/records";
  const GALICIA_URL = "https://incendios.gal/api/incidencias";
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
    btnRecenter: document.getElementById("btn-recenter"),
    btnLayers: document.getElementById("btn-layers"),
    layersPanel: document.getElementById("layers-panel"),
    layerOficiales: document.getElementById("layer-oficiales"),
    layerGalicia: document.getElementById("layer-galicia"),
    layerHotspots: document.getElementById("layer-hotspots"),
    layerBurned: document.getElementById("layer-burned"),
    layerSatellite: document.getElementById("layer-satellite"),
  };

  /** @type {maplibregl.Map} */
  let map;
  /** @type {Array<ReturnType<typeof normalizeFire>>} */
  let fires = [];
  /** @type {string|null} */
  let selectedId = null;
  /** @type {Map<string, maplibregl.Marker>} */
  const markers = new Map();
  let query = "";

  function isoDate(d) {
    return d.toISOString().slice(0, 10);
  }

  function daysAgo(n) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d;
  }

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

  function statusClass(status) {
    const s = normalizeStatusKey(status);
    if (
      s === "activo" ||
      s === "em curso" ||
      s === "chegada ao to" ||
      s.startsWith("despacho")
    ) {
      return "activo";
    }
    if (s === "controlado" || s === "em resolucao") return "controlado";
    if (s === "estabilizado" || s === "vigilancia") return "estabilizado";
    if (s === "conclusao" || s === "encerrada") return "conclusao";
    return "otro";
  }

  function normalizeStatusKey(status) {
    return String(status || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function severityRank(fire) {
    const order = { activo: 0, controlado: 1, estabilizado: 2, conclusao: 3, otro: 4 };
    return order[fire.statusClass] ?? 9;
  }

  /** Parse hectares from JCyL surface text when present (e.g. "FORESTAL 12,5 HA"). */
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

  function provinceOf(raw) {
    if (Array.isArray(raw) && raw.length) return String(raw[0]).toUpperCase();
    if (typeof raw === "string") return raw.toUpperCase();
    return "";
  }

  function fireKey(row) {
    const mun = row.termino_municipal || "";
    const start = `${row.fecha_de_inicio || ""}T${row.hora_de_inicio || ""}`;
    const ine = row.codigo_ine || "";
    return `${ine}|${mun}|${start}`;
  }

  function parteStamp(fire) {
    const raw = fire.parteAt || fire.rawOrden || "";
    const t = Date.parse(String(raw).replace(" ", "T"));
    return Number.isFinite(t) ? t : 0;
  }

  /** True when JCyL recorded an extinguish date (YYYY-MM-DD). */
  function isExtinguished(row) {
    return /^\d{4}-\d{2}-\d{2}/.test(String(row.fecha_extinguido || "").trim());
  }

  function parseParteMs(fecha, hora) {
    if (!fecha) return 0;
    const t = Date.parse(`${fecha}T${(hora || "00:00").slice(0, 5)}`);
    return Number.isFinite(t) ? t : 0;
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

  /** Parse JCyL "medios_de_extincion" into fogos-like man / terrain / aerial counts. */
  function parseResources(text) {
    const out = { man: 0, terrain: 0, aerial: 0 };
    if (!text) return out;
    const parts = String(text).split(";").map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      const m = part.match(/^(\d+)\s+(.+)$/i);
      if (!m) continue;
      const n = Number(m[1]) || 0;
      const label = m[2].toUpperCase();
      if (
        /HT-|HK-|AA-|HELI|AVION|AVI[OÓ]N|MEDIO\s*A[EÉ]REO|BRIF\s*A[EÉ]RE/.test(label) ||
        /^AA\b/.test(label) ||
        /^HT\b/.test(label) ||
        /^HK\b/.test(label)
      ) {
        out.aerial += n;
      } else if (/AUTOBOMBA|BULDOZER|BULLDOZER|CAMI[OÓ]N|TERRESTRE|VEH[IÍ]CULO|NODRIZA/.test(label)) {
        out.terrain += n;
      } else if (
        /A\.?\s*M\.?|ELIF|CUADRILLA|T[EÉ]CNICO|BRIF|BOMBERO|OPERATIVO|PERSONAL|CONVOY/.test(label)
      ) {
        out.man += n;
      } else {
        // Unknown numbered resource: count as ground crew-ish if not clearly gear.
        out.man += n;
      }
    }
    return out;
  }

  function shortMunicipality(name) {
    if (!name) return "Sin municipio";
    // "UTRERA (LA)(VALDESAMARIO)" → keep readable
    return String(name).replace(/\s+/g, " ").trim();
  }

  function normalizeFire(row) {
    const province = provinceOf(row.provincia);
    const status = (row.situacion_actual || "").trim().toUpperCase();
    const pos = row.posicion || {};
    const resources = parseResources(row.medios_de_extincion);
    const municipality = shortMunicipality(row.termino_municipal);
    return {
      id: `es:${fireKey(row)}`,
      country: "ES",
      source: "JCyL",
      municipality,
      province,
      status,
      statusClass: statusClass(status),
      level: row.nivel || row.nivel_maximo_alcanzado || "—",
      cause: row.causa_probable || "—",
      surface: row.tipo_y_has_de_superficie_afectada || "—",
      resourcesText: row.medios_de_extincion || "—",
      man: resources.man,
      terrain: resources.terrain,
      aerial: resources.aerial,
      started: [row.fecha_de_inicio, row.hora_de_inicio].filter(Boolean).join(" "),
      parteAt: [row.fecha_del_parte, row.hora_del_parte].filter(Boolean).join(" "),
      parteMs: parseParteMs(row.fecha_del_parte, row.hora_del_parte),
      rawOrden: row.orden || "",
      lat: typeof pos.lat === "number" ? pos.lat : null,
      lng: typeof pos.lon === "number" ? pos.lon : null,
      locationLine: [municipality, province].filter(Boolean).join(", "),
      detailUrl: null,
    };
  }

  function isActiveRow(row) {
    const mun = (row.termino_municipal || "").trim().toUpperCase();
    if (!mun || mun.startsWith("SIN INCID")) return false;
    const status = (row.situacion_actual || "").trim().toUpperCase();
    if (!ACTIVE_STATUSES.has(status)) return false;
    if (isExtinguished(row)) return false;
    if (!OFFICIAL_PROVINCES.has(provinceOf(row.provincia))) return false;
    if (!row.posicion || typeof row.posicion.lat !== "number") return false;
    const parteMs = parseParteMs(row.fecha_del_parte, row.hora_del_parte);
    const cutoff = Date.now() - PARTE_LOOKBACK_DAYS * 24 * 36e5;
    if (parteMs && parteMs < cutoff) return false;
    return true;
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
    const since = isoDate(daysAgo(PARTE_LOOKBACK_DAYS));
    const where =
      `fecha_del_parte >= date'${since}'` +
      ` and situacion_actual in ('ACTIVO','CONTROLADO','ESTABILIZADO')` +
      ` and fecha_extinguido is null`;

    const rows = [];
    let offset = 0;
    let total = Infinity;
    while (offset < total && offset < 500) {
      const data = await fetchJcylPage(where, offset);
      const batch = Array.isArray(data.results) ? data.results : [];
      total = typeof data.total_count === "number" ? data.total_count : batch.length;
      rows.push(...batch);
      if (!batch.length) break;
      offset += batch.length;
    }

    const best = new Map();
    for (const row of rows) {
      if (!isActiveRow(row)) continue;
      const n = normalizeFire(row);
      const prev = best.get(n.id);
      if (!prev || parteStamp(n) >= parteStamp(prev)) best.set(n.id, n);
    }

    const list = Array.from(best.values());
    list.sort(compareFires);
    return list;
  }

  function galiciaStatus(slug, tipoNome) {
    const map = {
      "lume-visible": { status: "LUME VISIBLE", statusClass: "activo" },
      fume: { status: "FUME", statusClass: "activo" },
      "zona-queimada": { status: "ZONA QUEIMADA", statusClass: "estabilizado" },
      "presenza-de-medios-de-emerxencia": { status: "MEDIOS", statusClass: "controlado" },
      "afectacion-a-poboacion": { status: "AFECTACIÓN", statusClass: "activo" },
    };
    return map[slug] || { status: String(tipoNome || "AVISO").toUpperCase(), statusClass: "otro" };
  }

  function normalizeGalicia(row) {
    const slug = row.tipo && row.tipo.slug ? row.tipo.slug : "";
    const st = galiciaStatus(slug, row.tipo && row.tipo.nome);
    const lat = Number(row.latitude);
    const lng = Number(row.lonxitude);
    const when = row.updated_at || row.created_at || "";
    const parteMs = Date.parse(when) || 0;
    const label = row.nome || (row.tipo && row.tipo.nome) || `Incidencia ${row.id}`;
    return {
      id: `ga:${row.id}`,
      country: "ES",
      source: "incendios.gal",
      municipality: shortMunicipality(label),
      province: "GALICIA",
      status: st.status,
      statusClass: st.statusClass,
      level: "—",
      cause: "Aviso cidadán",
      surface: row.descricion || (row.tipo && row.tipo.nome) || "—",
      resourcesText: "",
      man: 0,
      terrain: 0,
      aerial: 0,
      started: when ? when.slice(0, 16).replace("T", " ") : "—",
      parteAt: when ? when.slice(0, 16).replace("T", " ") : "—",
      parteMs,
      rawOrden: "",
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      locationLine: `${label}, Galicia`,
      detailUrl: row.id ? `https://incendios.gal/?id=${row.id}` : "https://incendios.gal/",
    };
  }

  async function fetchGaliciaFires() {
    const res = await fetch(`${GALICIA_URL}?data=30d`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`incendios.gal HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    const cutoff = Date.now() - GALICIA_LOOKBACK_DAYS * 24 * 36e5;
    return rows
      .filter((row) => {
        const slug = row.tipo && row.tipo.slug;
        if (!GALICIA_FIRE_TIPOS.has(slug)) return false;
        const lat = Number(row.latitude);
        const lng = Number(row.lonxitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
        const t = Date.parse(row.updated_at || row.created_at || "");
        if (t && t < cutoff) return false;
        return true;
      })
      .map(normalizeGalicia)
      .sort(compareFires);
  }

  function compareFires(a, b) {
    const ra = severityRank(a);
    const rb = severityRank(b);
    if (ra !== rb) return ra - rb;
    const ma = a.man + a.terrain + a.aerial;
    const mb = b.man + b.terrain + b.aerial;
    if (mb !== ma) return mb - ma;
    const sa = a.parteMs || a._stamp || parteStamp(a);
    const sb = b.parteMs || b._stamp || parteStamp(b);
    return sb - sa;
  }

  function initMap() {
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
            layout: { visibility: "visible" },
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
      // Península + Baleares + margen; Canarias queda alcanzable al navegar.
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

  function setLayerVisibility(layerId, visible) {
    if (!map.getLayer(layerId)) return;
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }

  function setBasemap(satellite) {
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("basemap");
    if (!src || typeof src.setTiles !== "function") return;
    src.setTiles(satellite ? SAT_TILES : STREET_TILES);
  }

  function applyLayerChecks() {
    if (!map || !map.isStyleLoaded()) return;
    setLayerVisibility("effis-hotspots", els.layerHotspots.checked);
    setLayerVisibility("effis-burned", els.layerBurned.checked);
    setBasemap(els.layerSatellite.checked);
  }

  function clearMarkers() {
    for (const m of markers.values()) m.remove();
    markers.clear();
  }

  function layerAllows(fire) {
    if (fire.source === "incendios.gal") {
      return !!(els.layerGalicia && els.layerGalicia.checked);
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
      const el = marker.getElement();
      const on = mid === id;
      el.classList.toggle("is-selected", on);
      const wrap = el.parentElement;
      if (wrap) wrap.style.zIndex = on ? "6" : "";
    }

    renderSidebar();

    if (fire && fly && fire.lat != null && fire.lng != null) {
      map.flyTo({
        center: [fire.lng, fire.lat],
        zoom: Math.max(map.getZoom(), 10),
        essential: true,
      });
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
    if (pts.length === 1) {
      map.flyTo({ center: [pts[0].lng, pts[0].lat], zoom: Math.max(map.getZoom(), 9), essential: true });
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    for (const f of pts) bounds.extend([f.lng, f.lat]);
    map.fitBounds(bounds, { padding: 72, maxZoom: 9.5, essential: true });
  }

  function flyToBbox(bbox) {
    if (!map || !bbox) return;
    map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      { padding: 48, maxZoom: 9, essential: true }
    );
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
      }`;
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
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([fire.lng, fire.lat])
        .addTo(map);
      markers.set(fire.id, marker);
    });

    if (selectedId) {
      const marker = markers.get(selectedId);
      if (marker) {
        const el = marker.getElement();
        el.classList.add("is-selected");
        if (el.parentElement) el.parentElement.style.zIndex = "6";
      }
    }
  }

  function appendListItem(node) {
    const li = document.createElement("li");
    li.appendChild(node);
    els.list.appendChild(li);
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
            <h6 class="field-label">${fire.source === "incendios.gal" ? "Origen" : "Causa probable"}</h6>
            <p class="field-value">${escapeHtml(String(fire.cause ?? "—"))}</p>
          </div>
          <div>
            <h6 class="field-label">Fuente</h6>
            <p class="field-value">${
              fire.source === "incendios.gal"
                ? fire.detailUrl
                  ? `<a href="${escapeHtml(fire.detailUrl)}" rel="noopener" target="_blank">incendios.gal</a> (avisos cidadáns)`
                  : "incendios.gal"
                : "España · JCyL"
            }</p>
          </div>
        </div>
        ${fire.source === "incendios.gal" ? "" : assetBlock(fire)}
      </div>
    `;
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

  function renderRegionOverview(list) {
    els.sidebar.classList.remove("is-detail");
    els.sidebar.setAttribute("aria-label", "Resumen por región");

    const cylFires = list.filter((f) => f.source === "JCyL");
    const gaFires = list.filter((f) => f.source === "incendios.gal");

    const northTitle = document.createElement("p");
    northTitle.className = "panel-title";
    northTitle.textContent = "Norte de España";
    appendListItem(northTitle);

    NORTH_REGIONS.forEach((region, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "region-card";
      btn.style.animationDelay = `${Math.min(i, 10) * 0.03}s`;

      if (region.kind === "galicia") {
        const n = gaFires.length;
        if (!n) btn.classList.add("is-empty");
        btn.innerHTML = `
          <div class="region-head">
            <h3 class="region-name">${escapeHtml(region.name)}</h3>
            <span class="region-count"><strong>${n}</strong> aviso${n === 1 ? "" : "s"}</span>
          </div>
          <p class="region-meta">${
            n
              ? "Avisos cidadáns recientes (incendios.gal) — no oficiales"
              : "Sin avisos recientes · capas satélite EFFIS"
          }</p>
        `;
        btn.addEventListener("click", () => {
          if (gaFires.length) flyToFires(gaFires);
          else flyToBbox(region.bbox);
          showSidebar(true);
        });
      } else {
        btn.classList.add("is-empty");
        btn.innerHTML = `
          <div class="region-head">
            <h3 class="region-name">${escapeHtml(region.name)}</h3>
            <span class="region-count">satélite</span>
          </div>
          <p class="region-meta">Sin parte abierto en vivo — hotspots EFFIS en el mapa</p>
        `;
        btn.addEventListener("click", () => {
          flyToBbox(region.bbox);
          showSidebar(true);
        });
      }
      appendListItem(btn);
    });

    const cylTitle = document.createElement("p");
    cylTitle.className = "panel-title";
    cylTitle.textContent = "Castilla y León";
    appendListItem(cylTitle);

    const regions = regionStats(cylFires);
    if (!regions.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No hay partes oficiales en curso en CyL.";
      appendListItem(empty);
    } else {
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

    const sat = document.createElement("p");
    sat.className = "overview-note";
    sat.innerHTML =
      "Resto de España: EFFIS en el mapa. Galicia: <a href=\"https://incendios.gal/\" rel=\"noopener\" target=\"_blank\">incendios.gal</a> (cidadán).";
    appendListItem(sat);

    const pt = document.createElement("p");
    pt.className = "overview-note";
    pt.innerHTML =
      'Portugal: ver <a href="https://fogos.pt" rel="noopener" target="_blank">fogos.pt</a>.';
    appendListItem(pt);
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
    const hot = visible.filter((f) => f.statusClass === "activo").length;
    const man = visible.reduce((s, f) => s + f.man, 0);
    const terrain = visible.reduce((s, f) => s + f.terrain, 0);
    const aerial = visible.reduce((s, f) => s + f.aerial, 0);
    const regions = regionStats(visible).length;
    const now = new Date();
    const hhmm = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    els.ticker.textContent =
      `${hhmm} — ${visible.length} en curso` +
      `${regions ? ` · ${regions} provincia${regions === 1 ? "" : "s"}` : ""}` +
      `${hot ? ` · ${hot} activos` : ""}` +
      ` · ${man} op. · ${terrain} terr. · ${aerial} aér.`;
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
    els.status.textContent = "Actualizando CyL y Galicia…";
    try {
      const [esResult, gaResult] = await Promise.allSettled([fetchJcylFires(), fetchGaliciaFires()]);
      const esFires = esResult.status === "fulfilled" ? esResult.value : [];
      const gaFires = gaResult.status === "fulfilled" ? gaResult.value : [];
      if (esResult.status === "rejected") console.error(esResult.reason);
      if (gaResult.status === "rejected") console.error(gaResult.reason);

      fires = [...esFires, ...gaFires].sort(compareFires);
      const notes = [];
      if (esResult.status === "rejected") notes.push("CyL falló");
      if (gaResult.status === "rejected") notes.push("Galicia falló");
      els.status.textContent =
        `CyL ${esFires.length} · GA ${gaFires.length} · actualizado ${formatUpdated(new Date())}` +
        (notes.length ? ` · ${notes.join(", ")}` : "");

      if (selectedId && !fires.some((f) => f.id === selectedId)) selectedId = null;
      renderSidebar();
      renderMarkers();
      updateTicker();

      const hashId = decodeURIComponent((location.hash || "").replace(/^#/, ""));
      if (hashId && fires.some((f) => f.id === hashId)) selectFire(hashId, true);

      if (!fires.length && esResult.status === "rejected" && gaResult.status === "rejected") {
        els.list.innerHTML =
          '<li class="error">No se pudieron cargar CyL ni Galicia.</li>';
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

  function wireUi() {
    els.btnRecenter.addEventListener("click", () => {
      map.easeTo({
        center: FOCUS.center,
        zoom: FOCUS.zoom,
        bearing: 0,
        pitch: 0,
        essential: true,
      });
      selectFire(null, false);
    });

    els.btnToggleList.addEventListener("click", () => {
      const hidden = els.sidebar.classList.contains("is-hidden");
      showSidebar(hidden);
    });

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
    els.layerBurned.addEventListener("change", () => {
      const on = els.layerBurned.checked;
      els.layerBurned.closest(".layer-item")?.classList.toggle("is-on", on);
      setLayerVisibility("effis-burned", on);
    });
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
    els.layerSatellite.addEventListener("change", () => {
      const on = els.layerSatellite.checked;
      els.layerSatellite.closest(".layer-item")?.classList.toggle("is-on", on);
      setBasemap(on);
    });

    // Initial chip styles
    [els.layerOficiales, els.layerGalicia, els.layerHotspots, els.layerBurned, els.layerSatellite].forEach(
      (input) => {
        if (!input) return;
        input.closest(".layer-item")?.classList.toggle("is-on", input.checked);
      }
    );

    if (window.matchMedia("(max-width: 900px)").matches) {
      showSidebar(true);
    }
  }

  function boot() {
    if (typeof maplibregl === "undefined") {
      document.body.innerHTML =
        "<p style='padding:2rem;font-family:sans-serif'>No se pudo cargar MapLibre.</p>";
      return;
    }
    initMap();
    wireUi();
    map.on("load", () => {
      applyLayerChecks();
      refresh();
      setInterval(refresh, REFRESH_MS);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
