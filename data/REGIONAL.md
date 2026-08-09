# Regional fire sources — backlog & research notes
#
# Live in map now: JCyL, incendios.gal, Bombers CAT, INFOCA AND, fogos.pt, FIRMS.
#
# Next candidates (priority):
# 1. FIDIAS (Castilla-La Mancha) — HTML list at fidias.castillalamancha.es;
#    no coordinates → municipality centroids via Worker scrape + INE lookup.
# 2. 112 Comunitat Valenciana — public JSF map (WebPublica-MapasOnLineV2);
#    peers use it; needs reverse-engineering of XHR/ArcGIS behind the app.
# 3. EUMETSAT LSA-SAF SEVIRI FRP — denser Spain-wide sat between VIIRS passes
#    (server-side ingest; not CCAA partes).
#
# Looked at, not live-ops feeds (risk / history / empty folders):
# - Asturias Servicio_Emergencias ArcGIS folder: empty services list.
# - Illes Balears / Navarra / Euskadi: risk & exposure layers, not open incidents.
# - Extremadura INFOEX: prevention visor / ZAR, no public active-incident JSON found.
# - Madrid Incendios_2026 FeatureServer: campaign perímetros, SSL flaky; not status feed.
# - Canarias GRAFCAN: no public FeatureService for live fires found in AGO search.
#
# If you find a CORS-friendly FeatureServer with lat/lng + status for another CCAA,
# add a Worker path + filter*Rows in lib/fires.js following Bombers/INFOCA.
