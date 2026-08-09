# Regional fire sources — backlog & research notes
#
# Live in map now: JCyL, incendios.gal, Bombers CAT, INFOCA AND, INFOCAM C-LM,
# Aragón CartoFor WFS, fogos.pt, FIRMS.
#
# Added 2026-08 (after deep scan of CCAA ArcGIS / WFS / open data):
# - INFOCAM FeatureServer `PartesIncendio_APPWeb_Vista` — supersedes FIDIAS HTML scrape;
#   FORESTAL + Estado≠EXTINGUIDO + FalsaAlarma=NO, WGS84 points + ha + municipio.
# - Aragón IDEAragon WFS `DAGMA_INCENDIOS:INCENDIOS_ACTIVOS` — active-only points;
#   sparse props (id / id_estado / esactivo); needs Worker (no browser CORS).
#
# Next candidates (priority):
# 1. 112 Comunitat Valenciana — public JSF map (WebPublica-MapasOnLineV2);
#    peers use it; needs reverse-engineering of XHR/ArcGIS behind the app.
#    ICV `prevencion_de_incendios` MapServer is historical perímetros (1993–2024), not live.
# 2. EUMETSAT LSA-SAF SEVIRI FRP — denser Spain-wide sat between VIIRS passes
#    (WMS GetFeatureInfo JSON via Worker; not CCAA partes).
#
# Looked at hard, not live-ops feeds (risk / history / empty / auth):
# - Asturias Servicio_Emergencias / geoportal: no public active-incident JSON found.
# - Illes Balears / Navarra / Euskadi: risk & exposure layers, or Survey123 token-gated.
# - Extremadura INFOEX: prevention visor / ZAR / press — no public active-incident JSON.
# - Madrid Incendios_2026 FeatureServer: campaign perímetros, not status feed.
# - Murcia IncendiosForestales90a23: historical polygons 1990–2023.
# - Canarias GRAFCAN: ZARI risk WMS / event perímetros — not live status.
# - Cantabria / La Rioja: no FeatureServer / WFS for open incidents located.
# - datos.gob.es “incendios activos” hits mostly wrap FIRMS/EFFIS, not CCAA partes.
#
# If you find a CORS-friendly FeatureServer with lat/lng + status for another CCAA,
# add a Worker path + filter*Rows in lib/fires.js following Bombers/INFOCA/INFOCAM.
