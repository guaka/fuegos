/**
 * Light i18n for Fuegos Vivos — ES (default), EN, PT.
 * Chrome: nav, sheet, legend, footnotes, ticker, detail, chart, region panels, layers.
 * Source catalogues on About and raw fire field values stay as provided by upstreams.
 * AGPL-3.0
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FuegosI18n = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORAGE_KEY = "fuegos.lang";
  const SUPPORTED = ["es", "en", "pt"];
  const DEFAULT_LANG = "es";

  /** @type {Record<string, Record<string, string>>} */
  const MESSAGES = {
    es: {
      "nav.map": "Mapa",
      "nav.about": "Sobre",
      "nav.lang": "Idioma",
      "sheet.list": "Lista de incendios",
      "sheet.close": "Cerrar lista",
      "sheet.note": "Experimental · consulta también fuentes oficiales",
      "legend.active": "Activo",
      "legend.controlled": "Controlado",
      "legend.stabilized": "Estabilizado",
      "legend.hint":
        "Naranja satélite = detecciones FIRMS (no partes oficiales). Pulsa un punto para el detalle.",
      "foot.coverage": "Sobre la cobertura y fuentes",
      "foot.warn":
        "Aviso: software experimental de aficionado. No es un servicio oficial de emergencias; no sustituye a 112 / Protección Civil. Los datos pueden estar incompletos o desactualizados.",
      "map.aria": "Mapa de incendios",
      "locate.title": "Mi ubicación",
      "locate.aria": "Centrar mapa en mi ubicación",
      "sidebar.overview": "Resumen por región",
      "sidebar.detail": "Detalle del incendio",
      "ticker.loading": "Cargando…",
      "ticker.updating": "Actualizando…",
      "ticker.fires_one": "{n} incendio",
      "ticker.fires_many": "{n} incendios",
      "ticker.active_one": "{n} activo",
      "ticker.active_many": "{n} activos",
      "ticker.sat": "{n} sat",
      "ticker.unavailable": "Mapa no disponible",
      "detail.back": "← Resumen por región",
      "detail.start": "Inicio",
      "detail.parte": "Parte",
      "detail.surface": "Superficie",
      "detail.level": "Nivel",
      "detail.cause": "Causa",
      "detail.origin": "Origen",
      "detail.nature": "Naturaleza",
      "detail.source": "Fuente",
      "detail.man": "Operativos",
      "detail.terrain": "Terrestres",
      "detail.aerial": "Aéreos",
      "detail.assets": "Medios",
      "rel.lt1h": "hace menos de 1 h",
      "rel.hours": "hace {n} h",
      "rel.day": "hace 1 día",
      "rel.days": "hace {n} días",
      "error.load": "No se pudieron cargar los datos.",
      "chart.title": "Medios en el tiempo",
      "chart.empty": "Sin histórico de medios para este incendio.",
      "chart.aria": "Evolución de medios por parte",
      "chart.note.partes": "{n} partes {src} · pasa el cursor por los puntos",
      "chart.note.synth": "{src} · inicio→actual (medios al inicio en 0) · hover en puntos",
      "chart.note.single": "{src} · un punto de medios · hover para detalle",
      "chart.status": "Estado",
      "panel.allSpain": "Toda España",
      "panel.cyl": "Castilla y León · oficiales",
      "panel.galicia": "Galicia · avisos cidadáns",
      "panel.catalunya": "Cataluña · Bombers",
      "panel.andalucia": "Andalucía · INFOCA",
      "panel.clm": "Castilla-La Mancha · INFOCAM",
      "panel.aragon": "Aragón · CartoFor",
      "panel.portugal": "Portugal · fogos.pt",
      "region.satName": "España · satélite",
      "region.satMeta_one": "{n} detección VIIRS 24h (NASA FIRMS) — no son partes oficiales",
      "region.satMeta_many": "{n} detecciones VIIRS 24h (NASA FIRMS) — no son partes oficiales",
      "region.galiciaMeta_one": "{n} aviso cidadán (incendios.gal) — no oficial",
      "region.galiciaMeta_many": "{n} avisos cidadáns (incendios.gal) — no oficiales",
      "region.galiciaEmpty": "Pulsa para acercar · avisos cidadáns + satélite",
      "region.cylEmpty": "No hay partes oficiales en curso en CyL.",
      "region.ptEmpty": "No hay incendios abiertos en fogos.pt ahora.",
      "region.bombersEmpty": "No hay incendios de vegetación abiertos en Bombers ahora.",
      "region.infocaEmpty": "No hay incidentes INFOCA abiertos ahora.",
      "region.infocamEmpty": "No hay partes INFOCAM abiertos ahora.",
      "region.aragonEmpty": "No hay incendios activos en el WFS de Aragón ahora.",
      "region.ongoing": "{n} en curso",
      "region.ongoingActive": "{n} en curso · {a} activo",
      "region.ongoingActives": "{n} en curso · {a} activos",
      "region.ptMeta": "{n} en curso{active} · ANEPC vía fogos.pt",
      "region.tapZoom": "Pulsa para acercar el mapa",
      "region.stats": "{man} operativos · {terrain} terrestres · {aerial} aéreos",
      "region.active_one": "{n} activo",
      "region.active_many": "{n} activos",
      "region.controlled_one": "{n} controlado",
      "region.controlled_many": "{n} controlados",
      "region.stabilized_one": "{n} estabilizado",
      "region.stabilized_many": "{n} estabilizados",
      "badge.official": "Oficial",
      "badge.alert": "Aviso",
      "badge.dispatch": "Despacho",
      "badge.sat": "Satélite",
      "layer.cyl": "Oficiales CyL (ES)",
      "layer.galicia": "Galicia (incendios.gal)",
      "layer.catalunya": "Cataluña (Bombers)",
      "layer.andalucia": "Andalucía (INFOCA)",
      "layer.clm": "Castilla-La Mancha (INFOCAM)",
      "layer.aragon": "Aragón (CartoFor)",
      "layer.portugal": "Portugal (fogos.pt)",
      "layer.firms": "Detecciones satélite (FIRMS)",
      "layer.effis": "Teselas EFFIS",
      "layer.burned": "Área quemada",
      "layer.relief": "Relieve",
      "layer.satellite": "Vista satélite",
      "layers.note":
        'Portugal vía proxy Cloudflare → <a href="https://fogos.pt" rel="noopener" target="_blank">fogos.pt</a>',
      "firms.badge": "Satélite · FIRMS",
      "firms.title": "Detección de calor VIIRS",
      "firms.caveat": "No es un parte oficial de extinción. Contrasta con 112 / Protección Civil.",
      "firms.conf": "Confianza",
      "map.noWebgl": "Mapa · sin WebGL",
      "overview.note":
        "Cobertura regional: JCyL, Galicia, Bombers (CAT), INFOCA (AND), INFOCAM (C-LM), Aragón, fogos.pt. Resto: <strong>FIRMS</strong> satélite. Candidatos: 112CV, EUMETSAT FRP.",
      "about.lead": "Mapa público de incendios en toda España y Portugal.",
      "about.heroNote":
        '<a href="https://fogos.pt" rel="noopener">fogos.pt</a> es genial — y en España faltaba algo parecido, así que montamos esto en un par de horas.',
      "about.kickerData": "Datos",
      "about.coverageTitle": "De dónde salen",
      "about.coverageLead":
        "Cobertura nacional por satélite, más partes y avisos donde hay feeds abiertos.",
      "about.kickerTransparency": "Transparencia",
      "about.licenseTitle": "Fuentes y licencia",
      "about.hobbyWarn":
        "<strong>Aviso:</strong> software experimental de aficionado. No es un servicio oficial de emergencias; no sustituye a 112 / Protección Civil. Los datos pueden estar incompletos o desactualizados.",
      "title.about": "Sobre {host}",
    },
    en: {
      "nav.map": "Map",
      "nav.about": "About",
      "nav.lang": "Language",
      "sheet.list": "Fire list",
      "sheet.close": "Close list",
      "sheet.note": "Experimental · also check official sources",
      "legend.active": "Active",
      "legend.controlled": "Contained",
      "legend.stabilized": "Stabilized",
      "legend.hint":
        "Orange satellite = FIRMS detections (not official reports). Tap a point for details.",
      "foot.coverage": "About coverage and sources",
      "foot.warn":
        "Note: experimental hobby software. Not an official emergency service; does not replace 112 / civil protection. Data may be incomplete or outdated.",
      "map.aria": "Wildfire map",
      "locate.title": "My location",
      "locate.aria": "Center map on my location",
      "sidebar.overview": "Summary by region",
      "sidebar.detail": "Fire details",
      "ticker.loading": "Loading…",
      "ticker.updating": "Updating…",
      "ticker.fires_one": "{n} fire",
      "ticker.fires_many": "{n} fires",
      "ticker.active_one": "{n} active",
      "ticker.active_many": "{n} active",
      "ticker.sat": "{n} sat",
      "ticker.unavailable": "Map unavailable",
      "detail.back": "← Regional summary",
      "detail.start": "Started",
      "detail.parte": "Update",
      "detail.surface": "Area",
      "detail.level": "Level",
      "detail.cause": "Cause",
      "detail.origin": "Origin",
      "detail.nature": "Nature",
      "detail.source": "Source",
      "detail.man": "Crew",
      "detail.terrain": "Ground",
      "detail.aerial": "Air",
      "detail.assets": "Resources",
      "rel.lt1h": "less than 1 h ago",
      "rel.hours": "{n} h ago",
      "rel.day": "1 day ago",
      "rel.days": "{n} days ago",
      "error.load": "Could not load the data.",
      "chart.title": "Resources over time",
      "chart.empty": "No resource history for this fire.",
      "chart.aria": "Resource counts over time",
      "chart.note.partes": "{n} {src} updates · hover the points",
      "chart.note.synth": "{src} · start→now (0 resources at start) · hover points",
      "chart.note.single": "{src} · one resource point · hover for detail",
      "chart.status": "Status",
      "panel.allSpain": "All of Spain",
      "panel.cyl": "Castilla y León · official",
      "panel.galicia": "Galicia · citizen alerts",
      "panel.catalunya": "Catalonia · Bombers",
      "panel.andalucia": "Andalusia · INFOCA",
      "panel.clm": "Castilla-La Mancha · INFOCAM",
      "panel.aragon": "Aragon · CartoFor",
      "panel.portugal": "Portugal · fogos.pt",
      "region.satName": "Spain · satellite",
      "region.satMeta_one": "{n} VIIRS detection in 24h (NASA FIRMS) — not official reports",
      "region.satMeta_many": "{n} VIIRS detections in 24h (NASA FIRMS) — not official reports",
      "region.galiciaMeta_one": "{n} citizen alert (incendios.gal) — not official",
      "region.galiciaMeta_many": "{n} citizen alerts (incendios.gal) — not official",
      "region.galiciaEmpty": "Tap to zoom · citizen alerts + satellite",
      "region.cylEmpty": "No open official CyL reports right now.",
      "region.ptEmpty": "No open fires on fogos.pt right now.",
      "region.bombersEmpty": "No open vegetation incidents from Bombers right now.",
      "region.infocaEmpty": "No open INFOCA incidents right now.",
      "region.infocamEmpty": "No open INFOCAM reports right now.",
      "region.aragonEmpty": "No active fires in the Aragon WFS right now.",
      "region.ongoing": "{n} ongoing",
      "region.ongoingActive": "{n} ongoing · {a} active",
      "region.ongoingActives": "{n} ongoing · {a} active",
      "region.ptMeta": "{n} ongoing{active} · ANEPC via fogos.pt",
      "region.tapZoom": "Tap to zoom the map",
      "region.stats": "{man} crew · {terrain} ground · {aerial} air",
      "region.active_one": "{n} active",
      "region.active_many": "{n} active",
      "region.controlled_one": "{n} contained",
      "region.controlled_many": "{n} contained",
      "region.stabilized_one": "{n} stabilized",
      "region.stabilized_many": "{n} stabilized",
      "badge.official": "Official",
      "badge.alert": "Alert",
      "badge.dispatch": "Dispatch",
      "badge.sat": "Satellite",
      "layer.cyl": "Official CyL (ES)",
      "layer.galicia": "Galicia (incendios.gal)",
      "layer.catalunya": "Catalonia (Bombers)",
      "layer.andalucia": "Andalusia (INFOCA)",
      "layer.clm": "Castilla-La Mancha (INFOCAM)",
      "layer.aragon": "Aragon (CartoFor)",
      "layer.portugal": "Portugal (fogos.pt)",
      "layer.firms": "Satellite detections (FIRMS)",
      "layer.effis": "EFFIS tiles",
      "layer.burned": "Burned area",
      "layer.relief": "Relief",
      "layer.satellite": "Satellite view",
      "layers.note":
        'Portugal via Cloudflare proxy → <a href="https://fogos.pt" rel="noopener" target="_blank">fogos.pt</a>',
      "firms.badge": "Satellite · FIRMS",
      "firms.title": "VIIRS heat detection",
      "firms.caveat": "Not an official firefighting report. Cross-check with 112 / civil protection.",
      "firms.conf": "Confidence",
      "map.noWebgl": "Map · no WebGL",
      "overview.note":
        "Regional coverage: JCyL, Galicia, Bombers (CAT), INFOCA (AND), INFOCAM (C-LM), Aragon, fogos.pt. Elsewhere: <strong>FIRMS</strong> satellite. Candidates: 112CV, EUMETSAT FRP.",
      "about.lead": "Public wildfire map for Spain and Portugal.",
      "about.heroNote":
        '<a href="https://fogos.pt" rel="noopener">fogos.pt</a> is great — and Spain was missing something similar, so we put this together in a couple of hours.',
      "about.kickerData": "Data",
      "about.coverageTitle": "Where it comes from",
      "about.coverageLead":
        "Nationwide satellite coverage, plus official reports and alerts where open feeds exist.",
      "about.kickerTransparency": "Transparency",
      "about.licenseTitle": "Sources and license",
      "about.hobbyWarn":
        "<strong>Note:</strong> experimental hobby software. Not an official emergency service; does not replace 112 / civil protection. Data may be incomplete or outdated.",
      "title.about": "About {host}",
    },
    pt: {
      "nav.map": "Mapa",
      "nav.about": "Sobre",
      "nav.lang": "Idioma",
      "sheet.list": "Lista de incêndios",
      "sheet.close": "Fechar lista",
      "sheet.note": "Experimental · consulta também fontes oficiais",
      "legend.active": "Ativo",
      "legend.controlled": "Controlado",
      "legend.stabilized": "Estabilizado",
      "legend.hint":
        "Laranja satélite = deteções FIRMS (não são partes oficiais). Toca num ponto para o detalhe.",
      "foot.coverage": "Sobre a cobertura e fontes",
      "foot.warn":
        "Aviso: software experimental de amador. Não é um serviço oficial de emergências; não substitui o 112 / Proteção Civil. Os dados podem estar incompletos ou desatualizados.",
      "map.aria": "Mapa de incêndios",
      "locate.title": "A minha localização",
      "locate.aria": "Centrar o mapa na minha localização",
      "sidebar.overview": "Resumo por região",
      "sidebar.detail": "Detalhe do incêndio",
      "ticker.loading": "A carregar…",
      "ticker.updating": "A atualizar…",
      "ticker.fires_one": "{n} incêndio",
      "ticker.fires_many": "{n} incêndios",
      "ticker.active_one": "{n} ativo",
      "ticker.active_many": "{n} ativos",
      "ticker.sat": "{n} sat",
      "ticker.unavailable": "Mapa indisponível",
      "detail.back": "← Resumo por região",
      "detail.start": "Início",
      "detail.parte": "Parte",
      "detail.surface": "Superfície",
      "detail.level": "Nível",
      "detail.cause": "Causa",
      "detail.origin": "Origem",
      "detail.nature": "Natureza",
      "detail.source": "Fonte",
      "detail.man": "Operacionais",
      "detail.terrain": "Terrestres",
      "detail.aerial": "Aéreos",
      "detail.assets": "Meios",
      "rel.lt1h": "há menos de 1 h",
      "rel.hours": "há {n} h",
      "rel.day": "há 1 dia",
      "rel.days": "há {n} dias",
      "error.load": "Não foi possível carregar os dados.",
      "chart.title": "Meios ao longo do tempo",
      "chart.empty": "Sem histórico de meios para este incêndio.",
      "chart.aria": "Evolução de meios por parte",
      "chart.note.partes": "{n} partes {src} · passa o rato pelos pontos",
      "chart.note.synth": "{src} · início→atual (meios a 0 no início) · hover nos pontos",
      "chart.note.single": "{src} · um ponto de meios · hover para detalhe",
      "chart.status": "Estado",
      "panel.allSpain": "Toda a Espanha",
      "panel.cyl": "Castela e Leão · oficiais",
      "panel.galicia": "Galiza · avisos cidadãos",
      "panel.catalunya": "Catalunha · Bombers",
      "panel.andalucia": "Andaluzia · INFOCA",
      "panel.clm": "Castela-Mancha · INFOCAM",
      "panel.aragon": "Aragão · CartoFor",
      "panel.portugal": "Portugal · fogos.pt",
      "region.satName": "Espanha · satélite",
      "region.satMeta_one": "{n} deteção VIIRS 24h (NASA FIRMS) — não são partes oficiais",
      "region.satMeta_many": "{n} deteções VIIRS 24h (NASA FIRMS) — não são partes oficiais",
      "region.galiciaMeta_one": "{n} aviso cidadão (incendios.gal) — não oficial",
      "region.galiciaMeta_many": "{n} avisos cidadãos (incendios.gal) — não oficiais",
      "region.galiciaEmpty": "Toca para aproximar · avisos cidadãos + satélite",
      "region.cylEmpty": "Não há partes oficiais em curso na CyL.",
      "region.ptEmpty": "Não há incêndios abertos no fogos.pt agora.",
      "region.bombersEmpty": "Não há incêndios de vegetação abertos nos Bombers agora.",
      "region.infocaEmpty": "Não há incidentes INFOCA abertos agora.",
      "region.infocamEmpty": "Não há partes INFOCAM abertos agora.",
      "region.aragonEmpty": "Não há incêndios ativos no WFS de Aragão agora.",
      "region.ongoing": "{n} em curso",
      "region.ongoingActive": "{n} em curso · {a} ativo",
      "region.ongoingActives": "{n} em curso · {a} ativos",
      "region.ptMeta": "{n} em curso{active} · ANEPC via fogos.pt",
      "region.tapZoom": "Toca para aproximar o mapa",
      "region.stats": "{man} operacionais · {terrain} terrestres · {aerial} aéreos",
      "region.active_one": "{n} ativo",
      "region.active_many": "{n} ativos",
      "region.controlled_one": "{n} controlado",
      "region.controlled_many": "{n} controlados",
      "region.stabilized_one": "{n} estabilizado",
      "region.stabilized_many": "{n} estabilizados",
      "badge.official": "Oficial",
      "badge.alert": "Aviso",
      "badge.dispatch": "Despacho",
      "badge.sat": "Satélite",
      "layer.cyl": "Oficiais CyL (ES)",
      "layer.galicia": "Galiza (incendios.gal)",
      "layer.catalunya": "Catalunha (Bombers)",
      "layer.andalucia": "Andaluzia (INFOCA)",
      "layer.clm": "Castela-Mancha (INFOCAM)",
      "layer.aragon": "Aragão (CartoFor)",
      "layer.portugal": "Portugal (fogos.pt)",
      "layer.firms": "Deteções satélite (FIRMS)",
      "layer.effis": "Tiles EFFIS",
      "layer.burned": "Área queimada",
      "layer.relief": "Relevo",
      "layer.satellite": "Vista satélite",
      "layers.note":
        'Portugal via proxy Cloudflare → <a href="https://fogos.pt" rel="noopener" target="_blank">fogos.pt</a>',
      "firms.badge": "Satélite · FIRMS",
      "firms.title": "Deteção de calor VIIRS",
      "firms.caveat": "Não é uma parte oficial de extinção. Confirma com 112 / Proteção Civil.",
      "firms.conf": "Confiança",
      "map.noWebgl": "Mapa · sem WebGL",
      "overview.note":
        "Cobertura regional: JCyL, Galiza, Bombers (CAT), INFOCA (AND), INFOCAM (C-LM), Aragão, fogos.pt. Resto: <strong>FIRMS</strong> satélite. Candidatos: 112CV, EUMETSAT FRP.",
      "about.lead": "Mapa público de incêndios em toda a Espanha e Portugal.",
      "about.heroNote":
        '<a href="https://fogos.pt" rel="noopener">fogos.pt</a> é ótimo — e em Espanha faltava algo parecido, por isso montámos isto num par de horas.',
      "about.kickerData": "Dados",
      "about.coverageTitle": "De onde vêm",
      "about.coverageLead":
        "Cobertura nacional por satélite, mais partes e avisos onde há feeds abertos.",
      "about.kickerTransparency": "Transparência",
      "about.licenseTitle": "Fontes e licença",
      "about.hobbyWarn":
        "<strong>Aviso:</strong> software experimental de amador. Não é um serviço oficial de emergências; não substitui o 112 / Proteção Civil. Os dados podem estar incompletos ou desatualizados.",
      "title.about": "Sobre {host}",
    },
  };

  let currentLang = DEFAULT_LANG;
  /** @type {((lang: string) => void) | null} */
  let onChange = null;

  function normalizeLang(raw) {
    const s = String(raw || "")
      .trim()
      .toLowerCase()
      .slice(0, 2);
    return SUPPORTED.includes(s) ? s : null;
  }

  function resolveLang(search, stored) {
    const fromQuery = normalizeLang(
      search && typeof URLSearchParams !== "undefined"
        ? new URLSearchParams(search).get("lang")
        : null
    );
    if (fromQuery) return fromQuery;
    const fromStore = normalizeLang(stored);
    if (fromStore) return fromStore;
    return DEFAULT_LANG;
  }

  function t(key, vars) {
    const dict = MESSAGES[currentLang] || MESSAGES[DEFAULT_LANG];
    let out = dict[key];
    if (out == null) out = MESSAGES[DEFAULT_LANG][key];
    if (out == null) return key;
    if (vars) {
      out = String(out).replace(/\{(\w+)\}/g, (_, name) =>
        vars[name] == null ? "" : String(vars[name])
      );
    }
    return out;
  }

  function applyDom(root) {
    if (typeof document === "undefined") return;
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      el.textContent = t(key);
    });
    scope.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const key = el.getAttribute("data-i18n-html");
      if (!key) return;
      el.innerHTML = t(key);
    });
    scope.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      const spec = el.getAttribute("data-i18n-attr");
      if (!spec) return;
      spec.split(";").forEach((part) => {
        const [attr, key] = part.split(":").map((s) => s.trim());
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });
    document.documentElement.lang = currentLang;
    syncLangButtons();
  }

  function syncLangButtons() {
    if (typeof document === "undefined") return;
    document.querySelectorAll(".lang-btn[data-lang]").forEach((btn) => {
      const lang = btn.getAttribute("data-lang");
      const on = lang === currentLang;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function persistLang(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
    if (typeof history !== "undefined" && history.replaceState && typeof location !== "undefined") {
      try {
        const url = new URL(location.href);
        if (lang === DEFAULT_LANG) url.searchParams.delete("lang");
        else url.searchParams.set("lang", lang);
        history.replaceState(null, "", url.pathname + url.search + url.hash);
      } catch {
        /* ignore */
      }
    }
  }

  function setLang(lang, opts) {
    const next = normalizeLang(lang) || DEFAULT_LANG;
    const skipPersist = opts && opts.skipPersist;
    const silent = opts && opts.silent;
    currentLang = next;
    if (!skipPersist) persistLang(next);
    if (typeof document !== "undefined") applyDom(document);
    if (!silent && typeof onChange === "function") onChange(next);
    return next;
  }

  function init(opts) {
    const search =
      opts && opts.search != null
        ? opts.search
        : typeof location !== "undefined"
          ? location.search
          : "";
    let stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (opts && opts.stored != null) stored = opts.stored;
    currentLang = resolveLang(search, stored);
    if (typeof document !== "undefined") {
      document.documentElement.lang = currentLang;
      applyDom(document);
      document.querySelectorAll(".lang-btn[data-lang]").forEach((btn) => {
        btn.addEventListener("click", () => {
          setLang(btn.getAttribute("data-lang"));
        });
      });
    }
    return currentLang;
  }

  function getLang() {
    return currentLang;
  }

  function setOnChange(fn) {
    onChange = typeof fn === "function" ? fn : null;
  }

  function clockLocale() {
    if (currentLang === "en") return "en-GB";
    if (currentLang === "pt") return "pt-PT";
    return "es-ES";
  }

  return {
    STORAGE_KEY,
    SUPPORTED,
    DEFAULT_LANG,
    MESSAGES,
    normalizeLang,
    resolveLang,
    t,
    applyDom,
    setLang,
    getLang,
    init,
    setOnChange,
    clockLocale,
  };
});
