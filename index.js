/* Fuegos Vivos — AGPL-3.0 */
(function () {
  "use strict";

  const FOCUS = {
    center: [-6.15, 40.85],
    zoom: 7.1,
    bbox: [-7.85, 38.55, -4.55, 43.35], // west,south,east,north
  };

  const FOCUS_PROVINCES = new Set(["LEÓN", "SALAMANCA"]);
  const ACTIVE_STATUSES = new Set(["ACTIVO", "CONTROLADO", "ESTABILIZADO"]);
  const REFRESH_MS = 5 * 60 * 1000;
  const JCYL_URL =
    "https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/incendios-forestales/records";
  const EFFIS_WMS = "https://maps.effis.emergency.copernicus.eu/effis";

  const els = {
    panel: document.getElementById("panel"),
    list: document.getElementById("fire-list"),
    detail: document.getElementById("fire-detail"),
    status: document.getElementById("status-line"),
    btnActivos: document.getElementById("btn-activos"),
    btnRecenter: document.getElementById("btn-recenter"),
    btnClose: document.getElementById("btn-close-panel"),
    layerOficiales: document.getElementById("layer-oficiales"),
    layerHotspots: document.getElementById("layer-hotspots"),
    layerBurned: document.getElementById("layer-burned"),
  };

  /** @type {maplibregl.Map} */
  let map;
  /** @type {Array<ReturnType<typeof normalizeFire>>} */
  let fires = [];
  /** @type {string|null} */
  let selectedId = null;
  /** @type {Map<string, maplibregl.Marker>} */
  const markers = new Map();
  let lastUpdated = null;

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
    // MapLibre needs the template placeholder unencoded
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
    const normalized = String(raw).replace(/\//g, "-");
    const t = Date.parse(normalized.replace(" ", "T"));
    return Number.isFinite(t) ? t : 0;
  }

  function normalizeFire(row) {
    const province = provinceOf(row.provincia);
    const status = (row.situacion_actual || "").trim().toUpperCase();
    const pos = row.posicion || {};
    return {
      id: fireKey(row),
      municipality: row.termino_municipal || "Sin municipio",
      province,
      status,
      statusClass: statusClass(status),
      level: row.nivel || row.nivel_maximo_alcanzado || "—",
      cause: row.causa_probable || "—",
      surface: row.tipo_y_has_de_superficie_afectada || "—",
      resources: row.medios_de_extincion || "—",
      started: [row.fecha_de_inicio, row.hora_de_inicio].filter(Boolean).join(" "),
      extinguished: [row.fecha_extinguido, row.hora_extinguido].filter(Boolean).join(" ") || null,
      parteAt: [row.fecha_del_parte, row.hora_del_parte].filter(Boolean).join(" "),
      lat: typeof pos.lat === "number" ? pos.lat : null,
      lng: typeof pos.lon === "number" ? pos.lon : null,
      rawOrden: row.orden || "",
    };
  }

  function isActiveRow(row) {
    const mun = (row.termino_municipal || "").trim().toUpperCase();
    if (!mun || mun.startsWith("SIN INCID")) return false;
    const status = (row.situacion_actual || "").trim().toUpperCase();
    if (!ACTIVE_STATUSES.has(status)) return false;
    const province = provinceOf(row.provincia);
    if (!FOCUS_PROVINCES.has(province)) return false;
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
            tiles: [
              "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            ],
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
  }

  function setLayerVisibility(layerId, visible) {
    if (!map.getLayer(layerId)) return;
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }

  function clearMarkers() {
    for (const m of markers.values()) m.remove();
    markers.clear();
  }

  function selectFire(id, fly) {
    selectedId = id;
    const fire = fires.find((f) => f.id === id) || null;

    for (const [mid, marker] of markers) {
      const el = marker.getElement();
      el.classList.toggle("selected", mid === id);
    }

    Array.from(els.list.querySelectorAll(".fire-item")).forEach((btn) => {
      btn.setAttribute("aria-selected", btn.dataset.id === id ? "true" : "false");
    });

    if (!fire) {
      els.detail.hidden = true;
      els.detail.innerHTML = "";
      return;
    }

    els.detail.hidden = false;
    els.detail.innerHTML = `
      <h3>${escapeHtml(fire.municipality)}</h3>
      <p class="meta">${escapeHtml(fire.province)} · parte ${escapeHtml(fire.parteAt || "—")}</p>
      <dl>
        <dt>Estado</dt><dd>${escapeHtml(fire.status)}</dd>
        <dt>Nivel</dt><dd>${escapeHtml(String(fire.level))}</dd>
        <dt>Inicio</dt><dd>${escapeHtml(fire.started || "—")}</dd>
        <dt>Causa</dt><dd>${escapeHtml(fire.cause)}</dd>
        <dt>Superficie</dt><dd>${escapeHtml(fire.surface)}</dd>
        <dt>Medios</dt><dd>${escapeHtml(fire.resources)}</dd>
      </dl>
    `;

    if (fly && fire.lat != null && fire.lng != null) {
      map.flyTo({ center: [fire.lng, fire.lat], zoom: Math.max(map.getZoom(), 10), essential: true });
    }
  }

  function renderMarkers() {
    clearMarkers();
    const show = els.layerOficiales.getAttribute("aria-pressed") === "true";
    if (!show) return;

    fires.forEach((fire) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `marker ${fire.statusClass}`;
      el.title = `${fire.municipality} — ${fire.status}`;
      el.setAttribute("aria-label", `${fire.municipality}, ${fire.status}`);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        openPanel();
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
    els.list.innerHTML = "";
    if (!fires.length) {
      els.list.innerHTML =
        '<li class="empty">No hay partes activos en León o Salamanca en las últimas dos semanas. Revisa la capa de hotspots satélite para Badajoz y el resto del área.</li>';
      return;
    }

    fires.forEach((fire, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fire-item";
      btn.dataset.id = fire.id;
      btn.style.animationDelay = `${Math.min(i, 12) * 0.04}s`;
      btn.setAttribute("aria-selected", fire.id === selectedId ? "true" : "false");
      btn.innerHTML = `
        <span class="badge badge-${fire.statusClass}">${escapeHtml(fire.status)}</span>
        <span class="name">${escapeHtml(fire.municipality)}</span>
        <span class="sub">
          <span>${escapeHtml(fire.province)}</span>
          <span>Nivel ${escapeHtml(String(fire.level))}</span>
          <span>${escapeHtml(fire.parteAt || "")}</span>
        </span>
      `;
      btn.addEventListener("click", () => selectFire(fire.id, true));
      li.appendChild(btn);
      els.list.appendChild(li);
    });
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
      lastUpdated = new Date();
      const n = fires.length;
      els.status.textContent = `${n} activo${n === 1 ? "" : "s"} en León/Salamanca · actualizado ${formatUpdated(lastUpdated)}`;
      if (selectedId && !fires.some((f) => f.id === selectedId)) {
        selectedId = null;
        els.detail.hidden = true;
      }
      renderList();
      renderMarkers();
    } catch (err) {
      console.error(err);
      els.status.innerHTML = `<span class="error">No se pudieron cargar los partes de CyL.</span>`;
      if (!fires.length) {
        els.list.innerHTML =
          '<li class="error">Error de red al consultar datos abiertos de la Junta de Castilla y León.</li>';
      }
    }
  }

  function openPanel() {
    els.panel.hidden = false;
  }

  function closePanel() {
    if (window.matchMedia("(max-width: 820px)").matches) {
      els.panel.hidden = true;
    }
  }

  function wireUi() {
    els.btnActivos.addEventListener("click", () => {
      openPanel();
      els.list.scrollTop = 0;
    });
    els.btnRecenter.addEventListener("click", () => {
      map.flyTo({ center: FOCUS.center, zoom: FOCUS.zoom, essential: true });
    });
    els.btnClose.addEventListener("click", () => {
      els.panel.hidden = true;
    });

    const toggle = (btn, layerId, onChange) => {
      btn.addEventListener("click", () => {
        const next = btn.getAttribute("aria-pressed") !== "true";
        btn.setAttribute("aria-pressed", next ? "true" : "false");
        if (layerId) setLayerVisibility(layerId, next);
        if (onChange) onChange(next);
      });
    };

    toggle(els.layerHotspots, "effis-hotspots");
    toggle(els.layerBurned, "effis-burned");
    toggle(els.layerOficiales, null, () => renderMarkers());

    // Desktop: panel open. Mobile: start open so CTA is useful.
    els.panel.hidden = false;
  }

  function boot() {
    if (typeof maplibregl === "undefined") {
      document.body.innerHTML =
        "<p style='padding:2rem;font-family:sans-serif'>No se pudo cargar MapLibre. Revisa la conexión.</p>";
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
