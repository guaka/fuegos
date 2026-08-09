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

  const ACTIVE_STATUSES = new Set(["ACTIVO", "CONTROLADO", "ESTABILIZADO"]);
  /** Ongoing bulletin window for CyL map points. */
  const PARTE_LOOKBACK_DAYS = 3;
  /** Fetch window for CyL history / chart. */
  const HISTORY_LOOKBACK_DAYS = 14;
  const GALICIA_LOOKBACK_DAYS = 30;
  const GALICIA_FIRE_TIPOS = new Set([
    "lume-visible",
    "fume",
    "zona-queimada",
    "presenza-de-medios-de-emerxencia",
    "afectacion-a-poboacion",
  ]);

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
    if (s === "activo" || s === "em curso" || s === "chegada ao to" || s.startsWith("despacho")) {
      return "activo";
    }
    if (s === "controlado" || s === "em resolucao") return "controlado";
    if (s === "estabilizado" || s === "vigilancia") return "estabilizado";
    if (s === "conclusao" || s === "encerrada") return "conclusao";
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
    OFFICIAL_PROVINCES,
    ACTIVE_STATUSES,
    PARTE_LOOKBACK_DAYS,
    HISTORY_LOOKBACK_DAYS,
    GALICIA_LOOKBACK_DAYS,
    GALICIA_FIRE_TIPOS,
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
    jcylWhereClause,
    isoDate,
    daysAgo,
    rejectReason,
  };
});
