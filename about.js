/* Fuegos Vivos — about coverage map — AGPL-3.0 */
(function () {
  "use strict";

  // Keep in sync with FOCUS.bbox in index.js (oeste: Galicia → Andalucía)
  const BBOX = [-9.4, 35.95, -0.6, 43.9]; // west,south,east,north
  const CENTER = [-5.5, 40.0];

  const PLACES = [
    { name: "Santiago", country: "ES", lng: -8.54, lat: 42.88 },
    { name: "Oviedo", country: "ES", lng: -5.84, lat: 43.36 },
    { name: "Bilbao", country: "ES", lng: -2.93, lat: 43.26 },
    { name: "León", country: "ES", lng: -5.57, lat: 42.6 },
    { name: "Cáceres", country: "ES", lng: -6.37, lat: 39.48 },
    { name: "Badajoz", country: "ES", lng: -6.97, lat: 38.88 },
    { name: "Sevilla", country: "ES", lng: -5.99, lat: 37.39 },
    { name: "Granada", country: "ES", lng: -3.6, lat: 37.18 },
    { name: "Málaga", country: "ES", lng: -4.42, lat: 36.72 },
    { name: "Bragança", country: "PT", lng: -6.76, lat: 41.81 },
  ];

  function ringFromBbox(bbox) {
    const [w, s, e, n] = bbox;
    return [
      [w, s],
      [e, s],
      [e, n],
      [w, n],
      [w, s],
    ];
  }

  function boot() {
    if (typeof maplibregl === "undefined") {
      const el = document.getElementById("coverage-map");
      if (el) el.textContent = "No se pudo cargar MapLibre.";
      return;
    }

    const map = new maplibregl.Map({
      container: "coverage-map",
      style: {
        version: 8,
        sources: {
          basemap: {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
              "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          },
          coverage: {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "Polygon",
                coordinates: [ringFromBbox(BBOX)],
              },
            },
          },
        },
        layers: [
          { id: "basemap", type: "raster", source: "basemap" },
          {
            id: "coverage-fill",
            type: "fill",
            source: "coverage",
            paint: {
              "fill-color": "#ff6e02",
              "fill-opacity": 0.18,
            },
          },
          {
            id: "coverage-line",
            type: "line",
            source: "coverage",
            paint: {
              "line-color": "#ff512f",
              "line-width": 2,
              "line-opacity": 0.9,
            },
          },
        ],
      },
      center: CENTER,
      zoom: 5.2,
      bearing: 0,
      pitch: 0,
      maxPitch: 0,
      dragRotate: false,
      touchPitch: false,
      interactive: true,
      attributionControl: true,
    });

    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.fitBounds(
        [
          [BBOX[0], BBOX[1]],
          [BBOX[2], BBOX[3]],
        ],
        { padding: 28, duration: 800 }
      );

      if (!document.getElementById("about-marker-style")) {
        const style = document.createElement("style");
        style.id = "about-marker-style";
        style.textContent = `
          .place-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            border: 2px solid #fff;
            box-shadow: 0 1px 3px rgba(0,0,0,.35);
            flex: none;
          }
          .place-dot.es { background: #c60b1e; }
          .place-dot.pt { background: #006600; }
          .place-label {
            background: rgba(255,255,255,.92);
            color: #333;
            font: 600 11px/1 "Source Sans 3", system-ui, sans-serif;
            padding: 0.2rem 0.4rem;
            border-radius: 4px;
            box-shadow: 0 1px 3px rgba(0,0,0,.12);
            white-space: nowrap;
          }
        `;
        document.head.appendChild(style);
      }

      PLACES.forEach((place) => {
        const el = document.createElement("div");
        el.className = "place-marker";
        el.innerHTML = `<span class="place-dot ${place.country.toLowerCase()}"></span><span class="place-label">${place.name}</span>`;
        Object.assign(el.style, {
          display: "flex",
          alignItems: "center",
          gap: "0.35rem",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        });

        new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([place.lng, place.lat])
          .addTo(map);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
