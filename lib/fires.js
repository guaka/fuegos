/**
 * Shared fire filter / normalize logic for Fuegos Vivos.
 * Used by the browser map (via globalThis.FuegosFires) and Node CI tests.
 * AGPL-3.0
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FuegosFires = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

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

  const SOURCE = {
    JCYL: "JCyL",
    GALICIA: "incendios.gal",
    FOGOS: "fogos.pt",
    BOMBERS: "Bombers",
    INFOCA: "INFOCA",
  };
  const ACTIVE_STATUSES = new Set(["ACTIVO", "CONTROLADO", "ESTABILIZADO"]);
  /** Ongoing bulletin window for CyL map points. */
  const PARTE_LOOKBACK_DAYS = 3;
  /** Fetch window for CyL history / chart. */
  const HISTORY_LOOKBACK_DAYS = 14;
  const GALICIA_LOOKBACK_DAYS = 30;
  /** Bombers CAT / INFOCA AND open-incident window. */
  const REGIONAL_LOOKBACK_DAYS = 14;
  const GALICIA_FIRE_TIPOS = new Set([
    "lume-visible",
    "fume",
    "zona-queimada",
    "presenza-de-medios-de-emerxencia",
    "afectacion-a-poboacion",
  ]);

  const BOMBERS_VIEWER_URL =
    "https://experience.arcgis.com/experience/f6172fd2d6974bc0a8c51e3a6bc2a735";
  const INFOCA_DASHBOARD_URL =
    "https://laagencia.maps.arcgis.com/apps/dashboards/87a5fe2d397e4140add84f50d8bdafd3";

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

  function isExtinguished(row) {
    return /^\d{4}-\d{2}-\d{2}/.test(String(row.fecha_extinguido || "").trim());
  }

  function parseParteMs(fecha, hora) {
    if (!fecha) return 0;
    const t = Date.parse(`${fecha}T${(hora || "00:00").slice(0, 5)}`);
    return Number.isFinite(t) ? t : 0;
  }

  function normalizeStatusKey(status) {
    return String(status || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function statusClass(status) {
    const s = normalizeStatusKey(status);
    if (
      s === "activo" ||
      s === "actiu" ||
      s === "declarado" ||
      s === "declarat" ||
      s === "em curso" ||
      s === "chegada ao to" ||
      s.startsWith("despacho")
    ) {
      return "activo";
    }
    if (s === "controlado" || s === "controlat" || s === "em resolucao") return "controlado";
    if (s === "estabilizado" || s === "estabilitzat" || s === "vigilancia") return "estabilizado";
    if (
      s === "conclusao" ||
      s === "encerrada" ||
      s === "extingit" ||
      s === "extinguido" ||
      s === "extinto"
    ) {
      return "conclusao";
    }
    return "otro";
  }

  function parseResources(text) {
    const out = { man: 0, terrain: 0, aerial: 0 };
    if (!text) return out;
    const parts = String(text)
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean);
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
        out.man += n;
      }
    }
    return out;
  }

  function shortMunicipality(name) {
    if (!name) return "Sin municipio";
    return String(name).replace(/\s+/g, " ").trim();
  }

  function isCandidateRow(row) {
    const mun = (row.termino_municipal || "").trim().toUpperCase();
    if (!mun || mun.startsWith("SIN INCID")) return false;
    const status = (row.situacion_actual || "").trim().toUpperCase();
    if (!ACTIVE_STATUSES.has(status)) return false;
    if (isExtinguished(row)) return false;
    if (!OFFICIAL_PROVINCES.has(provinceOf(row.provincia))) return false;
    if (!row.posicion || typeof row.posicion.lat !== "number") return false;
    return true;
  }

  function isCurrentFire(fire, nowMs, lookbackDays) {
    const now = nowMs == null ? Date.now() : nowMs;
    const days = lookbackDays == null ? PARTE_LOOKBACK_DAYS : lookbackDays;
    const cutoff = now - days * 24 * 36e5;
    return !!(fire.parteMs && fire.parteMs >= cutoff);
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
      source: SOURCE.JCYL,
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
      history: [],
    };
  }

  function mergeHistory(points) {
    const byT = new Map();
    for (const p of points) {
      if (!p || !p.t) continue;
      byT.set(p.t, p);
    }
    return Array.from(byT.values()).sort((a, b) => a.t - b.t);
  }

  function severityRank(fire) {
    const order = { activo: 0, controlado: 1, estabilizado: 2, conclusao: 3, otro: 4 };
    return order[fire.statusClass] ?? 9;
  }

  function compareFires(a, b) {
    const ra = severityRank(a);
    const rb = severityRank(b);
    if (ra !== rb) return ra - rb;
    const ma = a.man + a.terrain + a.aerial;
    const mb = b.man + b.terrain + b.aerial;
    if (mb !== ma) return mb - ma;
    return (b.parteMs || 0) - (a.parteMs || 0);
  }

  /**
   * Reduce raw JCyL ODS rows → current fires (deduped, lookback applied).
   * @param {object[]} rows
   * @param {number} [nowMs]
   */
  function reduceJcylRows(rows, nowMs) {
    const byId = new Map();
    for (const row of rows) {
      if (!isCandidateRow(row)) continue;
      const n = normalizeFire(row);
      const snap = {
        t: n.parteMs,
        label: n.parteAt,
        man: n.man,
        terrain: n.terrain,
        aerial: n.aerial,
        status: n.status,
      };
      let g = byId.get(n.id);
      if (!g) {
        g = { fire: n, history: [] };
        byId.set(n.id, g);
      }
      g.history.push(snap);
      if ((n.parteMs || 0) >= (g.fire.parteMs || 0)) g.fire = n;
    }

    const list = [];
    for (const g of byId.values()) {
      if (!isCurrentFire(g.fire, nowMs)) continue;
      g.fire.history = mergeHistory(g.history);
      list.push(g.fire);
    }
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
      source: SOURCE.GALICIA,
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

  function filterGaliciaRows(rows, nowMs) {
    const now = nowMs == null ? Date.now() : nowMs;
    const cutoff = now - GALICIA_LOOKBACK_DAYS * 24 * 36e5;
    return rows
      .filter((row) => {
        const slug = row.tipo && row.tipo.slug;
        if (!GALICIA_FIRE_TIPOS.has(slug)) return false;
        if (row.latitude == null || row.lonxitude == null) return false;
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

  /** fogos.pt date is DD-MM-YYYY */
  function parseFogosDateMs(date, hour) {
    const m = String(date || "").trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!m) return 0;
    const hhmm = String(hour || "00:00").trim().slice(0, 5);
    const t = Date.parse(`${m[3]}-${m[2]}-${m[1]}T${hhmm}`);
    return Number.isFinite(t) ? t : 0;
  }

  function isFogosForestFire(row) {
    const code = String(row.naturezaCode || row.natureza_code || "");
    return code.startsWith("31");
  }

  function isFogosOpen(row) {
    const code = Number(row.statusCode);
    if (code === 8 || code === 11) return false; // Conclusão / Encerrada
    const sc = statusClass(row.status);
    return sc !== "conclusao";
  }

  function normalizeFogos(row) {
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    const status = String(row.status || "").trim();
    const concelho = shortMunicipality(row.concelho || row.freguesia || row.location);
    const district = String(row.district || "").trim();
    const parteMs = parseFogosDateMs(row.date, row.hour);
    const id = row.id != null ? String(row.id) : `${lat},${lng},${row.date}`;
    return {
      id: `pt:${id}`,
      country: "PT",
      source: SOURCE.FOGOS,
      municipality: concelho,
      province: district || "Portugal",
      status,
      statusClass: statusClass(status),
      level: row.important ? "Importante" : "—",
      cause: row.natureza || "—",
      surface: row.natureza || "—",
      resourcesText: "",
      man: Number(row.man) || 0,
      terrain: Number(row.terrain) || 0,
      aerial: Number(row.aerial) || 0,
      started: [row.date, row.hour].filter(Boolean).join(" "),
      parteAt: [row.date, row.hour].filter(Boolean).join(" "),
      parteMs,
      rawOrden: "",
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      locationLine: row.location || [concelho, district].filter(Boolean).join(", "),
      detailUrl: id ? `https://fogos.pt/?fire=${encodeURIComponent(id)}` : "https://fogos.pt/",
    };
  }

  /**
   * fogos.pt /new/fires payload → open rural fires with coordinates.
   * @param {object} payload `{ success, data }` or array
   */
  function filterFogosRows(payload) {
    const rows = Array.isArray(payload)
      ? payload
      : payload && Array.isArray(payload.data)
        ? payload.data
        : [];
    return rows
      .filter((row) => {
        if (!isFogosForestFire(row)) return false;
        if (!isFogosOpen(row)) return false;
        const lat = Number(row.lat);
        const lng = Number(row.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
        if (row.coords === false) return false;
        return true;
      })
      .map(normalizeFogos)
      .sort(compareFires);
  }

  function geojsonFeatures(payload) {
    if (!payload) return [];
    if (Array.isArray(payload.features)) return payload.features;
    if (Array.isArray(payload)) return payload;
    return [];
  }

  function featureCoords(feature) {
    const g = feature && feature.geometry;
    if (!g || g.type !== "Point" || !Array.isArray(g.coordinates)) return null;
    const lng = Number(g.coordinates[0]);
    const lat = Number(g.coordinates[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  function epochMs(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    // ArcGIS sometimes returns seconds.
    return n < 1e12 ? n * 1000 : n;
  }

  function formatEsDateTime(ms, hourStr) {
    if (!ms) return hourStr || "—";
    try {
      const d = new Date(ms);
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const yyyy = d.getUTCFullYear();
      const hhmm = hourStr ? String(hourStr).slice(0, 5) : "";
      return hhmm ? `${dd}-${mm}-${yyyy} ${hhmm}` : `${dd}-${mm}-${yyyy}`;
    } catch {
      return hourStr || "—";
    }
  }

  function isBombersOpen(props) {
    if (!props) return false;
    if (props.ACT_DAT_FI != null && props.ACT_DAT_FI !== "") return false;
    const fase = normalizeStatusKey(props.COM_FASE || "");
    if (fase === "extingit" || fase === "extinguido" || fase === "extinto") return false;
    return true;
  }

  function normalizeBombers(feature) {
    const p = feature.properties || feature.attributes || {};
    const coords = featureCoords(feature) || {};
    const status = String(p.COM_FASE || p.TAL_DESC_ALARMA2 || "Actiu").trim() || "Actiu";
    const municipality = shortMunicipality(p.MUNICIPI_SIG || p.MUNICIPI_DPX);
    const parteMs =
      epochMs(p.DATA_ACT) || epochMs(p.ACT_DAT_ACTUAL) || epochMs(p.ACT_DAT_INICI) || epochMs(p.ACT_DAT_ACTUACIO);
    const oid = p.OBJECTID != null ? p.OBJECTID : p.ESRI_OID != null ? p.ESRI_OID : feature.id;
    const vehicles = Number(p.ACT_NUM_VEH) || 0;
    return {
      id: `cat:${oid}`,
      country: "ES",
      source: SOURCE.BOMBERS,
      municipality,
      province: "Cataluña",
      status,
      statusClass: statusClass(status),
      level: p.ACT_URGENT === "S" ? "Urgent" : "—",
      cause: p.TAL_DESC_ALARMA2 || p.TAL_DESC_ALARMA1 || "Incendi vegetació",
      surface: p.TAL_DESC_ALARMA2 || "—",
      resourcesText: "",
      man: 0,
      terrain: vehicles,
      aerial: 0,
      started: formatEsDateTime(epochMs(p.ACT_DAT_INICI) || parteMs),
      parteAt: formatEsDateTime(parteMs),
      parteMs,
      rawOrden: "",
      lat: coords.lat != null ? coords.lat : null,
      lng: coords.lng != null ? coords.lng : null,
      locationLine: [municipality, "Cataluña"].filter(Boolean).join(", "),
      detailUrl: BOMBERS_VIEWER_URL,
    };
  }

  /**
   * Bombers CAT GeoJSON (Worker `/bombers`) → open vegetation fires.
   * @param {object} payload FeatureCollection
   */
  function filterBombersRows(payload, nowMs) {
    const now = nowMs == null ? Date.now() : nowMs;
    const cutoff = now - REGIONAL_LOOKBACK_DAYS * 24 * 36e5;
    return geojsonFeatures(payload)
      .filter((feature) => {
        const p = feature.properties || feature.attributes || {};
        if (String(p.TAL_COD_ALARMA1 || "") !== "IV") return false;
        if (!isBombersOpen(p)) return false;
        const coords = featureCoords(feature);
        if (!coords) return false;
        // Drop corrupt geometries (seen: lat≈3°) and anything outside Spain.
        if (!pointInSpain(coords.lat, coords.lng)) return false;
        if (coords.lat < 40.4 || coords.lat > 43.05 || coords.lng < -0.6 || coords.lng > 3.5) return false;
        const parteMs =
          epochMs(p.DATA_ACT) ||
          epochMs(p.ACT_DAT_ACTUAL) ||
          epochMs(p.ACT_DAT_INICI) ||
          epochMs(p.ACT_DAT_ACTUACIO);
        if (parteMs && parteMs < cutoff) return false;
        return true;
      })
      .map(normalizeBombers)
      .sort(compareFires);
  }

  function normalizeInfoca(feature) {
    const p = feature.properties || feature.attributes || {};
    const coords = featureCoords(feature) || {};
    const status = String(p.ESTADO || "ACTIVO").trim();
    const municipality = shortMunicipality(p.TERMINO_MUNICIPAL);
    const province = String(p.PROVINCIA || "Andalucía").trim();
    const fechaMs = epochMs(p.FECHA);
    const parteMs = fechaMs;
    const oid = p.ESRI_OID != null ? p.ESRI_OID : p.OID_ENTERO != null ? p.OID_ENTERO : feature.id;
    const man =
      (Number(p.GRUPOS_ESPECIALISTAS) || 0) +
      (Number(p.BRICAS) || 0) +
      (Number(p.TECNICOS) || 0) +
      (Number(p.UMIF) || 0) +
      (Number(p.GRUPOS_APOYO) || 0) +
      (Number(p.UNASIF_ACO) || 0);
    const terrain = Number(p.VEHICULOS) || 0;
    const aerial = Number(p.MEDIOS_AEREOS) || 0;
    return {
      id: `and:${oid}`,
      country: "ES",
      source: SOURCE.INFOCA,
      municipality,
      province,
      status,
      statusClass: statusClass(status),
      level: "—",
      cause: p.TIPO_INCIDENTE || "Incendio forestal",
      surface: p.TIPO_INCIDENTE || "—",
      resourcesText: "",
      man,
      terrain,
      aerial,
      started: formatEsDateTime(fechaMs, p.HORA),
      parteAt: formatEsDateTime(fechaMs, p.HORA),
      parteMs,
      rawOrden: "",
      lat: coords.lat != null ? coords.lat : null,
      lng: coords.lng != null ? coords.lng : null,
      locationLine: [municipality, province].filter(Boolean).join(", "),
      detailUrl: INFOCA_DASHBOARD_URL,
    };
  }

  /**
   * INFOCA AND GeoJSON (Worker `/infoca`) → open official-ish incidents.
   * @param {object} payload FeatureCollection
   */
  function filterInfocaRows(payload, nowMs) {
    const now = nowMs == null ? Date.now() : nowMs;
    const cutoff = now - REGIONAL_LOOKBACK_DAYS * 24 * 36e5;
    const open = new Set(["activo", "controlado", "estabilizado", "declarado"]);
    return geojsonFeatures(payload)
      .filter((feature) => {
        const p = feature.properties || feature.attributes || {};
        const st = normalizeStatusKey(p.ESTADO || "");
        if (!open.has(st)) return false;
        const coords = featureCoords(feature);
        if (!coords) return false;
        if (!pointInSpain(coords.lat, coords.lng)) return false;
        const parteMs = epochMs(p.FECHA);
        if (parteMs && parteMs < cutoff) return false;
        return true;
      })
      .map(normalizeInfoca)
      .sort(compareFires);
  }

  function jcylWhereClause(sinceIsoDate) {
    return (
      `fecha_del_parte >= date'${sinceIsoDate}'` +
      ` and situacion_actual in ('ACTIVO','CONTROLADO','ESTABILIZADO')` +
      ` and fecha_extinguido is null`
    );
  }

  function isoDate(d) {
    return d.toISOString().slice(0, 10);
  }

  function daysAgo(n, fromMs) {
    const d = new Date(fromMs == null ? Date.now() : fromMs);
    d.setUTCDate(d.getUTCDate() - n);
    return d;
  }

  /**
   * Approx. Spain (península + Baleares + Canarias + Ceuta/Melilla).
   * Used to filter Europe FIRMS detections away from Algeria / France / Morocco.
   */
  function pointInSpain(lat, lng) {
    if (27.5 <= lat && lat <= 29.5 && -18.5 <= lng && lng <= -13.2) return true;
    if (38.55 <= lat && lat <= 40.15 && 1.0 <= lng && lng <= 4.35) return true;
    if (35.85 <= lat && lat <= 35.95 && -5.4 <= lng && lng <= -5.25) return true;
    if (35.25 <= lat && lat <= 35.35 && -3.0 <= lng && lng <= -2.9) return true;
    if (!(35.95 <= lat && lat <= 43.85 && -9.5 <= lng && lng <= 3.35)) return false;
    if (lat < 37.55 && lng > -0.85) return false;
    if (lat > 43.05 && lng > -1.55) return false;
    if (lat > 42.45 && lng > 2.85) return false;
    if (lat < 36.05 && lng > -5.6) return false;
    return true;
  }

  /** Reasons a JCyL row is excluded — for regression diagnostics. */
  function rejectReason(row, nowMs) {
    const mun = (row.termino_municipal || "").trim().toUpperCase();
    if (!mun || mun.startsWith("SIN INCID")) return "sin-municipio";
    const status = (row.situacion_actual || "").trim().toUpperCase();
    if (!ACTIVE_STATUSES.has(status)) return "status";
    if (isExtinguished(row)) return "extinguido";
    if (!OFFICIAL_PROVINCES.has(provinceOf(row.provincia))) return "fuera-cyl";
    if (!row.posicion || typeof row.posicion.lat !== "number") return "sin-coords";
    const fire = normalizeFire(row);
    if (!isCurrentFire(fire, nowMs)) return "parte-stale";
    return null;
  }

  return {
    SOURCE,
    OFFICIAL_PROVINCES,
    ACTIVE_STATUSES,
    PARTE_LOOKBACK_DAYS,
    HISTORY_LOOKBACK_DAYS,
    GALICIA_LOOKBACK_DAYS,
    REGIONAL_LOOKBACK_DAYS,
    GALICIA_FIRE_TIPOS,
    BOMBERS_VIEWER_URL,
    INFOCA_DASHBOARD_URL,
    provinceOf,
    fireKey,
    isExtinguished,
    parseParteMs,
    normalizeStatusKey,
    statusClass,
    parseResources,
    shortMunicipality,
    isCandidateRow,
    isCurrentFire,
    normalizeFire,
    mergeHistory,
    compareFires,
    reduceJcylRows,
    galiciaStatus,
    normalizeGalicia,
    filterGaliciaRows,
    parseFogosDateMs,
    isFogosForestFire,
    isFogosOpen,
    normalizeFogos,
    filterFogosRows,
    filterBombersRows,
    normalizeBombers,
    filterInfocaRows,
    normalizeInfoca,
    jcylWhereClause,
    isoDate,
    daysAgo,
    pointInSpain,
    rejectReason,
  };
});
