/* Fuegos Vivos — AGPL-3.0 */
(function () {
  "use strict";

  const FOCUS = {
    center: [-6.15, 40.85],
    zoom: 7.1,
    bbox: [-7.85, 38.55, -4.55, 43.35],
  };

  const FOCUS_PROVINCES = new Set(["LEÓN", "SALAMANCA"]);
  const ACTIVE_STATUSES = new Set(["ACTIVO", "CONTROLADO", "ESTABILIZADO"]);
  const REFRESH_MS = 5 * 60 * 1000;
  const JCYL_URL =
    "https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/incendios-forestales/records";
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
    const s = (status || "").toLowerCase();
    if (s === "activo") return "activo";
    if (s === "controlado") return "controlado";
    if (s === "estabilizado") return "estabilizado";
    return "otro";
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
      id: fireKey(row),
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
    };
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
    list.sort((a, b) => {
      const rank = { ACTIVO: 0, CONTROLADO: 1, ESTABILIZADO: 2 };
      const ra = rank[a.status] ?? 9;
      const rb = rank[b.status] ?? 9;
      if (ra !== rb) return ra - rb;
      const ma = a.man + a.terrain + a.aerial;
      const mb = b.man + b.terrain + b.aerial;
      if (mb !== ma) return mb - ma;
      return parteStamp(b) - parteStamp(a);
    });
    return list;
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
    const src = map.getSource("basemap");
    if (!src || typeof src.setTiles !== "function") {
      // Fallback: swap via style mutation
      map.setStyle({
        ...map.getStyle(),
      });
    }
    if (src && typeof src.setTiles === "function") {
      src.setTiles(satellite ? SAT_TILES : STREET_TILES);
    }
  }

  function clearMarkers() {
    for (const m of markers.values()) m.remove();
    markers.clear();
  }

  function filteredFires() {
    const q = query.trim().toLowerCase();
    if (!q) return fires;
    return fires.filter((f) =>
      `${f.municipality} ${f.province} ${f.status} ${f.locationLine}`.toLowerCase().includes(q)
    );
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
    if (!els.layerOficiales.checked) return;

    filteredFires().forEach((fire) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `map-marker ${fire.statusClass}`;
      el.title = `${fire.locationLine} — ${fire.status}`;
      el.setAttribute("aria-label", `${fire.municipality}, ${fire.status}`);
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
        '<li class="empty">No hay partes activos en León o Salamanca. Usa hotspots satélite para Badajoz y el resto del área.</li>';
      return;
    }
    if (!list.length) {
      els.list.innerHTML = '<li class="empty">Ningún incendio coincide con la búsqueda.</li>';
      return;
    }

    list.forEach((fire, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `card${fire.id === selectedId ? " is-selected" : ""}`;
      btn.dataset.id = fire.id;
      btn.style.animationDelay = `${Math.min(i, 12) * 0.03}s`;
      btn.innerHTML = `
        <div class="fire-status ${fire.statusClass}"></div>
        <div class="card-body">
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
    const n = fires.length;
    const activos = fires.filter((f) => f.status === "ACTIVO").length;
    const man = fires.reduce((s, f) => s + f.man, 0);
    const terrain = fires.reduce((s, f) => s + f.terrain, 0);
    const aerial = fires.reduce((s, f) => s + f.aerial, 0);
    const now = new Date();
    const hhmm = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    els.ticker.textContent =
      `${hhmm} — ${n} incendio${n === 1 ? "" : "s"} en León/Salamanca` +
      `${activos ? ` (${activos} activo${activos === 1 ? "" : "s"})` : ""}` +
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
    els.status.textContent = "Actualizando partes oficiales…";
    try {
      fires = await fetchJcylFires();
      const n = fires.length;
      els.status.textContent = `${n} activo${n === 1 ? "" : "s"} · actualizado ${formatUpdated(new Date())}`;
      updateTicker();
      if (selectedId && !fires.some((f) => f.id === selectedId)) selectedId = null;
      renderList();
      renderMarkers();

      const hashId = decodeURIComponent((location.hash || "").replace(/^#/, ""));
      if (hashId && fires.some((f) => f.id === hashId)) selectFire(hashId, true);
    } catch (err) {
      console.error(err);
      els.status.innerHTML = '<span class="error">No se pudieron cargar los partes de CyL.</span>';
      els.ticker.textContent = "Error al actualizar datos oficiales";
      if (!fires.length) {
        els.list.innerHTML =
          '<li class="error">Error de red al consultar datos abiertos de la Junta de Castilla y León.</li>';
      }
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
    });

    const bindCheck = (input, onChange) => {
      const sync = () => {
        const label = input.closest(".layer-item");
        if (label) label.classList.toggle("is-on", input.checked);
        onChange(input.checked);
      };
      input.addEventListener("change", sync);
      sync();
    };

    bindCheck(els.layerHotspots, (on) => setLayerVisibility("effis-hotspots", on));
    bindCheck(els.layerBurned, (on) => setLayerVisibility("effis-burned", on));
    bindCheck(els.layerOficiales, () => renderMarkers());
    bindCheck(els.layerSatellite, (on) => setBasemap(on));

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
