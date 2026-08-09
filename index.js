/* Fuegos Vivos — AGPL-3.0 */
(function () {
  "use strict";

  const FOCUS = {
    center: [-6.55, 40.95],
    zoom: 7,
    bbox: [-8.35, 38.45, -4.55, 43.45], // west,south,east,north — includes PT border
  };

  const FOCUS_PROVINCES = new Set(["LEÓN", "SALAMANCA"]);
  const ACTIVE_STATUSES = new Set(["ACTIVO", "CONTROLADO", "ESTABILIZADO"]);
  const REFRESH_MS = 5 * 60 * 1000;
  const JCYL_URL =
    "https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/incendios-forestales/records";
  const FOGOS_PT_URL = "https://api-lb.fogos.pt/new/fires";
  const FOGOS_PT_LOCAL = "./data/pt-fires.json";
  const EFFIS_WMS = "https://maps.effis.emergency.copernicus.eu/effis";

  /** Portuguese districts near León / Salamanca / Badajoz. */
  const PT_BORDER_DISTRICTS = new Set([
    "BRAGANÇA",
    "GUARDA",
    "VILA REAL",
    "VISEU",
    "CASTELO BRANCO",
    "PORTALEGRE",
    "ÉVORA",
    "EVORA",
  ]);

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
    layerPortugal: document.getElementById("layer-portugal"),
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

  function inFocusBbox(lat, lng) {
    const [w, s, e, n] = FOCUS.bbox;
    return lng >= w && lng <= e && lat >= s && lat <= n;
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
      rawOrden: row.orden || "",
      lat: typeof pos.lat === "number" ? pos.lat : null,
      lng: typeof pos.lon === "number" ? pos.lon : null,
      locationLine: [municipality, province].filter(Boolean).join(", "),
      detailUrl: null,
    };
  }

  function parseFogosDate(date, hour) {
    // fogos.pt uses DD-MM-YYYY
    const m = String(date || "").match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!m) return Date.parse(`${date}T${hour || "00:00"}`) || 0;
    return Date.parse(`${m[3]}-${m[2]}-${m[1]}T${hour || "00:00"}`) || 0;
  }

  function normalizeFogosPt(row) {
    const district = String(row.district || "").trim();
    const concelho = String(row.concelho || "").trim();
    const freguesia = String(row.freguesia || "").trim();
    const municipality = [concelho, freguesia].filter(Boolean).join(" · ") || row.location || "Portugal";
    const status = String(row.status || "").trim();
    const lat = typeof row.lat === "number" ? row.lat : null;
    const lng = typeof row.lng === "number" ? row.lng : null;
    const id = `pt:${row.id || row.sadoId || `${district}|${concelho}|${row.date}|${row.hour}`}`;
    return {
      id,
      country: "PT",
      source: "fogos.pt",
      municipality,
      province: district,
      status,
      statusClass: statusClass(status),
      level: "—",
      cause: "—",
      surface: row.natureza || "—",
      resourcesText: "",
      man: Number(row.man) || 0,
      terrain: Number(row.terrain) || 0,
      aerial: Number(row.aerial) || 0,
      started: [row.date, row.hour].filter(Boolean).join(" "),
      parteAt: [row.date, row.hour].filter(Boolean).join(" "),
      rawOrden: "",
      _stamp: parseFogosDate(row.date, row.hour),
      lat,
      lng,
      locationLine: row.location || [freguesia, concelho, district].filter(Boolean).join(", "),
      detailUrl: row.id ? `https://fogos.pt/fogo/${row.id}` : "https://fogos.pt",
      important: !!row.important,
    };
  }

  function isFogosPtInScope(row) {
    if (!row || row.active === false) return false;
    const lat = row.lat;
    const lng = row.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return false;
    if (inFocusBbox(lat, lng)) return true;
    const district = String(row.district || "")
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return PT_BORDER_DISTRICTS.has(district) || PT_BORDER_DISTRICTS.has(String(row.district || "").trim().toUpperCase());
  }

  function isActiveRow(row) {
    const mun = (row.termino_municipal || "").trim().toUpperCase();
    if (!mun || mun.startsWith("SIN INCID")) return false;
    const status = (row.situacion_actual || "").trim().toUpperCase();
    if (!ACTIVE_STATUSES.has(status)) return false;
    if (!FOCUS_PROVINCES.has(provinceOf(row.provincia))) return false;
    if (!row.posicion || typeof row.posicion.lat !== "number") return false;
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
    const since = isoDate(daysAgo(14));
    const where =
      `fecha_del_parte >= date'${since}'` +
      ` and provincia in ('LEÓN','SALAMANCA')` +
      ` and situacion_actual in ('ACTIVO','CONTROLADO','ESTABILIZADO')`;

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

  async function fetchFogosPtFires() {
    // Live fogos.pt API often omits ACAO for browser Origins (e.g. GitHub Pages).
    // Prefer same-origin snapshot published by the Pages workflow; fall back to live.
    const data = await fetchFogosPtJson();
    const rows = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
    return rows.filter(isFogosPtInScope).map(normalizeFogosPt).sort(compareFires);
  }

  async function fetchFogosPtJson() {
    const errors = [];
    for (const url of [FOGOS_PT_LOCAL, FOGOS_PT_URL]) {
      try {
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          cache: url === FOGOS_PT_LOCAL ? "no-cache" : "default",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        errors.push(`${url}: ${err && err.message ? err.message : err}`);
      }
    }
    throw new Error(errors.join(" | "));
  }

  function compareFires(a, b) {
    const ra = severityRank(a);
    const rb = severityRank(b);
    if (ra !== rb) return ra - rb;
    const ma = a.man + a.terrain + a.aerial;
    const mb = b.man + b.terrain + b.aerial;
    if (mb !== ma) return mb - ma;
    const sa = a._stamp || parteStamp(a);
    const sb = b._stamp || parteStamp(b);
    return sb - sa;
  }

  function mergeFires(esFires, ptFires) {
    return [...esFires, ...ptFires].sort(compareFires);
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
      maxBounds: [
        [FOCUS.bbox[0] - 2.5, FOCUS.bbox[1] - 2],
        [FOCUS.bbox[2] + 2.5, FOCUS.bbox[3] + 2],
      ],
      attributionControl: true,
    });

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
    if (fire.country === "PT") return !!(els.layerPortugal && els.layerPortugal.checked);
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
      marker.getElement().classList.toggle("is-selected", mid === id);
    }
    Array.from(els.list.querySelectorAll(".card")).forEach((btn) => {
      btn.classList.toggle("is-selected", btn.dataset.id === id);
    });

    if (fire && fly && fire.lat != null && fire.lng != null) {
      map.flyTo({
        center: [fire.lng, fire.lat],
        zoom: Math.max(map.getZoom(), 10),
        essential: true,
      });
      const card = els.list.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
      if (card) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
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

  function renderMarkers() {
    clearMarkers();

    filteredFires().forEach((fire) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `map-marker ${fire.statusClass}${fire.country === "PT" ? " pt" : ""}`;
      el.title = `${fire.country} · ${fire.locationLine} — ${fire.status}`;
      el.setAttribute("aria-label", `${fire.country} ${fire.municipality}, ${fire.status}`);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        selectFire(fire.id, true);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([fire.lng, fire.lat])
        .addTo(map);
      markers.set(fire.id, marker);
    });

    if (selectedId) selectFire(selectedId, false);
  }

  function renderList() {
    const list = filteredFires();
    els.list.innerHTML = "";

    if (!fires.length) {
      els.list.innerHTML =
        '<li class="empty">No hay incendios oficiales en el área. Prueba los hotspots satélite.</li>';
      return;
    }
    if (!list.length) {
      els.list.innerHTML =
        '<li class="empty">Ningún incendio visible: revisa búsqueda o capas ES/PT.</li>';
      return;
    }

    list.forEach((fire, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `card${fire.id === selectedId ? " is-selected" : ""}`;
      btn.dataset.id = fire.id;
      btn.style.animationDelay = `${Math.min(i, 12) * 0.03}s`;
      const extra =
        fire.country === "PT" && fire.detailUrl
          ? `<div><h6 class="field-label">Fuente</h6><p class="field-value">Portugal · fogos.pt</p></div>`
          : `<div><h6 class="field-label">Fuente</h6><p class="field-value">España · JCyL</p></div>`;
      btn.innerHTML = `
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
              <h6 class="field-label">Superficie / naturaleza</h6>
              <p class="field-value">${escapeHtml(fire.surface)}</p>
            </div>
            ${extra}
          </div>
          ${assetBlock(fire)}
        </div>
      `;
      btn.addEventListener("click", () => selectFire(fire.id, true));
      li.appendChild(btn);
      els.list.appendChild(li);
    });
  }

  function updateTicker() {
    const visible = filteredFires();
    const es = visible.filter((f) => f.country === "ES").length;
    const pt = visible.filter((f) => f.country === "PT").length;
    const hot = visible.filter((f) => f.statusClass === "activo").length;
    const man = visible.reduce((s, f) => s + f.man, 0);
    const terrain = visible.reduce((s, f) => s + f.terrain, 0);
    const aerial = visible.reduce((s, f) => s + f.aerial, 0);
    const now = new Date();
    const hhmm = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    els.ticker.textContent =
      `${hhmm} — ${visible.length} incendios (ES ${es} · PT ${pt})` +
      `${hot ? ` · ${hot} en curso/activos` : ""}` +
      ` · ${man} operativos, ${terrain} terrestres, ${aerial} aéreos`;
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
    els.status.textContent = "Actualizando España y Portugal…";
    try {
      const [esResult, ptResult] = await Promise.allSettled([
        fetchJcylFires(),
        fetchFogosPtFires(),
      ]);

      const esFires = esResult.status === "fulfilled" ? esResult.value : [];
      const ptFires = ptResult.status === "fulfilled" ? ptResult.value : [];
      if (esResult.status === "rejected") console.error(esResult.reason);
      if (ptResult.status === "rejected") console.error(ptResult.reason);

      fires = mergeFires(esFires, ptFires);
      const notes = [];
      if (esResult.status === "rejected") notes.push("CyL falló");
      if (ptResult.status === "rejected") notes.push("fogos.pt falló");
      els.status.textContent =
        `ES ${esFires.length} · PT ${ptFires.length} · actualizado ${formatUpdated(new Date())}` +
        (notes.length ? ` · ${notes.join(", ")}` : "");

      if (selectedId && !fires.some((f) => f.id === selectedId)) selectedId = null;
      renderList();
      renderMarkers();
      updateTicker();

      const hashId = decodeURIComponent((location.hash || "").replace(/^#/, ""));
      if (hashId && fires.some((f) => f.id === hashId)) selectFire(hashId, true);

      if (!fires.length && (esResult.status === "rejected" || ptResult.status === "rejected")) {
        els.list.innerHTML =
          '<li class="error">No se pudieron cargar datos oficiales (JCyL / fogos.pt).</li>';
      }
    } catch (err) {
      console.error(err);
      els.status.innerHTML = '<span class="error">Error al actualizar.</span>';
      els.ticker.textContent = "Error al actualizar datos";
    }
  }

  function showSidebar(show) {
    els.sidebar.classList.toggle("is-hidden", !show);
  }

  function wireUi() {
    els.btnRecenter.addEventListener("click", () => {
      map.flyTo({ center: FOCUS.center, zoom: FOCUS.zoom, essential: true });
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
      renderList();
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
      renderList();
      renderMarkers();
      updateTicker();
    });
    els.layerPortugal.addEventListener("change", () => {
      const on = els.layerPortugal.checked;
      els.layerPortugal.closest(".layer-item")?.classList.toggle("is-on", on);
      renderList();
      renderMarkers();
      updateTicker();
    });
    els.layerSatellite.addEventListener("change", () => {
      const on = els.layerSatellite.checked;
      els.layerSatellite.closest(".layer-item")?.classList.toggle("is-on", on);
      setBasemap(on);
    });

    // Initial chip styles
    [
      els.layerOficiales,
      els.layerPortugal,
      els.layerHotspots,
      els.layerBurned,
      els.layerSatellite,
    ].forEach((input) => {
      if (!input) return;
      input.closest(".layer-item")?.classList.toggle("is-on", input.checked);
    });

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
