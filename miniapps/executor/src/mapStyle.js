import { Protocol } from "pmtiles";
import { addProtocol } from "maplibre-gl";

// Наш OSM-стек раздаёт векторные тайлы Краснодарского края одним файлом
// PMTiles. MapLibre читает его напрямую через протокол pmtiles (Range).
export const TILE_URL =
  "pmtiles:https://procityservice.ru/tiles/kkr.pmtiles";

// Лицензия ODbL требует подпись на любой карте с данными OpenStreetMap.
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

let installed = false;
export function installPmtilesProtocol() {
  if (installed) return;
  installed = true;
  addProtocol("pmtiles", new Protocol().tilejson);
}

// Компактный стиль под задачи такси: вода, парки, дороги, здания, подписи.
// Шрифты и иконки берём у OpenFreemap (это не геоданные, только glyph/sprite).
const OFM = "https://tiles.openfreemap.org";

export function makeStyle() {
  return {
    version: 8,
    glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${OFM}/sprites/ofm_f384/ofm`,
    sources: {
      osm: {
        type: "vector",
        url: TILE_URL,
        attribution: OSM_ATTRIBUTION,
        maxzoom: 15,
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#f5f7fa" } },
      {
        id: "water",
        type: "fill",
        source: "osm",
        "source-layer": "water",
        filter: ["!=", ["get", "brunnel"], "tunnel"],
        paint: { "fill-color": "#a8c8f0" },
      },
      {
        id: "park",
        type: "fill",
        source: "osm",
        "source-layer": "park",
        paint: { "fill-color": "#cfe6c0", "fill-opacity": 0.7 },
      },
      {
        id: "landuse",
        type: "fill",
        source: "osm",
        "source-layer": "landuse",
        maxzoom: 13,
        filter: ["match", ["get", "class"], ["residential", "commercial", "industrial"], true, false],
        paint: { "fill-color": "#eae6df", "fill-opacity": 0.6 },
      },
      {
        id: "waterway",
        type: "line",
        source: "osm",
        "source-layer": "waterway",
        paint: { "line-color": "#a8c8f0", "line-width": 1.5 },
      },
      // Дороги: обводка + заливка по классам
      {
        id: "road-casing",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        minzoom: 8,
        filter: ["!", ["in", ["get", "class"], ["literal", ["rail", "transit", "path"]]]],
        paint: {
          "line-color": "#d8d4cc",
          "line-width": [
            "interpolate", ["exponential", 1.5], ["zoom"],
            8, 1.5, 12, 3, 14, 8, 18, 24,
          ],
        },
      },
      {
        id: "road",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        minzoom: 8,
        filter: ["!", ["in", ["get", "class"], ["literal", ["rail", "transit", "path"]]]],
        paint: {
          "line-color": [
            "match", ["get", "class"],
            "motorway", "#fc8",
            "trunk", "#fea",
            "primary", "#fea",
            "secondary", "#fff",
            "tertiary", "#fff",
            "#ffffff",
          ],
          "line-width": [
            "interpolate", ["exponential", 1.5], ["zoom"],
            8, 0.8, 12, 1.8, 14, 5, 18, 18,
          ],
        },
      },
      {
        id: "rail",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        filter: ["==", ["get", "class"], "rail"],
        paint: { "line-color": "#bbb", "line-width": 1, "line-dasharray": [2, 2] },
      },
      {
        id: "building",
        type: "fill",
        source: "osm",
        "source-layer": "building",
        minzoom: 14,
        paint: { "fill-color": "#e3ded6", "fill-outline-color": "#d0cabf" },
      },
      {
        id: "boundary",
        type: "line",
        source: "osm",
        "source-layer": "boundary",
        minzoom: 7,
        filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
        paint: { "line-color": "#c8b6d8", "line-dasharray": [3, 2], "line-width": 1 },
      },
      {
        id: "place-label",
        type: "symbol",
        source: "osm",
        "source-layer": "place",
        minzoom: 5,
        layout: {
          "text-field": ["coalesce", ["get", "name"], ["get", "name_en"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": [
            "interpolate", ["linear"], ["zoom"],
            5, 10, 9, 13, 13, 16,
          ],
          "text-anchor": "bottom",
        },
        paint: {
          "text-color": "#333",
          "text-halo-color": "#fff",
          "text-halo-width": 1.2,
        },
      },
      {
        id: "street-label",
        type: "symbol",
        source: "osm",
        "source-layer": "transportation_name",
        minzoom: 13,
        layout: {
          "symbol-placement": "line",
          "text-field": ["coalesce", ["get", "name"], ["get", "name_en"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
        },
        paint: {
          "text-color": "#666",
          "text-halo-color": "#fff",
          "text-halo-width": 1,
        },
      },
    ],
  };
}

// Стиль-фолбэк: если свой сервер тайлов недоступен — публичный OpenFreemap.
export function fallbackStyle() {
  return "https://tiles.openfreemap.org/styles/liberty";
}
