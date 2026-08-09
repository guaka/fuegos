/**
 * Light i18n for Fuegos Vivos — ES (default), EN, PT.
 * Chrome visitors hit first (nav, sheet, legend, footnotes, ticker, detail labels, About).
 * Layer names, region cards, and source catalogues stay Spanish.
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
