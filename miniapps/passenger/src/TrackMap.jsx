import React, { useEffect, useRef, useState } from "react";
import { Map, Marker, LngLatBounds, AttributionControl, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  installPmtilesProtocol,
  makeStyle,
  fallbackStyle,
  OSM_ATTRIBUTION,
} from "./mapStyle";

setWorkerUrl(workerUrl);
installPmtilesProtocol();

// Карта слежения: точки А/Б и движение исполнителя (только просмотр).
export default function TrackMap({ from, to, driver, t, height = 240 }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const markers = useRef({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let map;
    let observer;
    try {
      map = new Map({
        container: container.current,
        style: makeStyle(),
        center: [37.3164, 44.8908],
        zoom: 12,
        attributionControl: false,
      });
      map.addControl(
        new AttributionControl({
          customAttribution: OSM_ATTRIBUTION,
          compact: true,
        }),
        "bottom-left"
      );
      // Если свой тайловый сервер недоступен — переключаемся на публичный
      map.on("error", (e) => {
        if (e?.error?.message?.includes("pmtiles") && map.getStyle()?.sources?.osm) {
          map.setStyle(fallbackStyle());
        }
      });
      mapRef.current = map;
      map.on("load", () => setReady(true));
      observer = new ResizeObserver(() => map.resize());
      observer.observe(container.current);
    } catch (e) {
      return undefined;
    }
    return () => {
      observer?.disconnect();
      map?.remove();
      mapRef.current = null;
      markers.current = {};
      setReady(false);
    };
  }, []);

  function markerEl(label, color) {
    const el = document.createElement("div");
    el.textContent = label;
    Object.assign(el.style, {
      width: "30px",
      height: "30px",
      borderRadius: "50%",
      background: color,
      color: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: "800",
      fontSize: "12px",
      border: "3px solid #fff",
      boxShadow: "0 4px 12px rgba(0,0,0,.25)",
    });
    return el;
  }

  // Точки А/Б
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (from) {
      if (!markers.current.from) {
        markers.current.from = new Marker({ element: markerEl("A", t.accent) })
          .setLngLat([from.lon, from.lat])
          .addTo(map);
      } else {
        markers.current.from.setLngLat([from.lon, from.lat]);
      }
    }
    if (to) {
      if (!markers.current.to) {
        markers.current.to = new Marker({ element: markerEl("B", t.success) })
          .setLngLat([to.lon, to.lat])
          .addTo(map);
      } else {
        markers.current.to.setLngLat([to.lon, to.lat]);
      }
    }
    if (from && to) {
      const bounds = new LngLatBounds([from.lon, from.lat], [to.lon, to.lat]);
      map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 500 });
    } else if (from) {
      map.flyTo({ center: [from.lon, from.lat], zoom: 14, duration: 500 });
    }
  }, [from, to, ready, t.accent, t.success]);

  // Маркер исполнителя
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !driver) return;
    if (driver.lat == null || driver.lon == null) {
      // Позиция скрыта (приватность/офлайн) — убираем маркер, если был
      if (markers.current.driver) {
        markers.current.driver.remove();
        delete markers.current.driver;
      }
      return;
    }
    if (!markers.current.driver) {
      const el = document.createElement("div");
      Object.assign(el.style, {
        width: "18px",
        height: "18px",
        borderRadius: "50%",
        background: t.amber,
        border: "3px solid #fff",
        boxShadow: "0 0 0 6px rgba(249,115,22,.25), 0 4px 12px rgba(0,0,0,.3)",
      });
      markers.current.driver = new Marker({ element: el })
        .setLngLat([driver.lon, driver.lat])
        .addTo(map);
    } else {
      markers.current.driver.setLngLat([driver.lon, driver.lat]);
    }
  }, [driver, ready, t.amber]);

  return (
    <div style={{
      position: "relative", width: "100%", height, borderRadius: 16,
      overflow: "hidden", background: t.mapBg,
      border: `1px solid ${t.border}`,
    }}>
      <div ref={container} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}
