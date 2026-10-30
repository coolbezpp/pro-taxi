import React, { useEffect, useRef, useState } from "react";
import { Map, Marker, LngLatBounds, setWorkerUrl } from "maplibre-gl";
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

// Границы Краснодарского края: трекинг живёт только в крае —
// карта «не в масштабе планеты», масштабируется только вниз
const KKR_BOUNDS = [[36.6, 43.3], [41.7, 47.1]];

// Карта слежения: точки А/Б и движение исполнителя (только просмотр).
export default function TrackMap({ from, to, executor, t, height = 240 }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const markers = useRef({});
  const followedRef = useRef(false); // камера уже наводилась на исполнителя
  const [ready, setReady] = useState(false);
  const [noWebgl, setNoWebgl] = useState(false); // вебвью не дало WebGL2
  const [attrOpen, setAttrOpen] = useState(false); // раскрытая строка © OSM

  useEffect(() => {
    let map;
    let observer;
    // maplibre v6 требует WebGL2. Вебвью MAX на части устройств не даёт
    // WebGL2-контекст — раньше карта молча оставалась пустой. Проверяем
    // заранее и показываем заглушку вместо пустоты.
    try {
      const probe = document.createElement("canvas");
      if (!probe.getContext("webgl2")) {
        setNoWebgl(true);
        return undefined;
      }
    } catch (e) {
      setNoWebgl(true);
      return undefined;
    }
    try {
      map = new Map({
        container: container.current,
        style: makeStyle(),
        center: [37.3164, 44.8908],
        zoom: 12,
        attributionControl: false,
      });
      // Копирайт — статичный неинтерактивный ярлык в JSX (клик по нему
      // не открывает описание OpenStreetMap)
      // Если свой тайловый сервер недоступен — переключаемся на публичный
      map.on("error", (e) => {
        if (e?.error?.message?.includes("pmtiles") && map.getStyle()?.sources?.osm) {
          map.setStyle(fallbackStyle());
        }
      });
      mapRef.current = map;
      map.on("load", () => {
        // Подгоняем карту под Краснодарский край и запрещаем зум-in:
        // максимум — масштаб подгонки края, дальше только уменьшение
        try {
          const kkr = LngLatBounds.convert(KKR_BOUNDS);
          const cam = map.cameraForBounds(kkr, {
            padding: { top: 36, bottom: 36, left: 24, right: 24 },
          });
          if (cam && Number.isFinite(cam.zoom)) {
            map.setMaxZoom(cam.zoom);
            map.setMinZoom(Math.max(3, cam.zoom - 5));
          }
          map.setMaxBounds(kkr);
        } catch (e) {}
        setReady(true);
      });
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

  // Маркер исполнителя: плавно ведём точку и при первом появлении наводим
  // камеру (дальше клиент может свободно отмотать — не дёргаем его зум).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !executor) return;
    if (executor.lat == null || executor.lon == null) {
      // Позиция скрыта (приватность/офлайн) — убираем маркер, если был
      if (markers.current.executor) {
        markers.current.executor.remove();
        delete markers.current.executor;
      }
      return;
    }
    if (!markers.current.executor) {
      const el = document.createElement("div");
      Object.assign(el.style, {
        width: "18px",
        height: "18px",
        borderRadius: "50%",
        background: t.amber,
        border: "3px solid #fff",
        boxShadow: "0 0 0 6px rgba(249,115,22,.25), 0 4px 12px rgba(0,0,0,.3)",
      });
      markers.current.executor = new Marker({ element: el })
        .setLngLat([executor.lon, executor.lat])
        .addTo(map);
    } else {
      markers.current.executor.setLngLat([executor.lon, executor.lat]);
    }
    // Наводим камеру один раз — при первом известном местоположении
    if (!followedRef.current) {
      followedRef.current = true;
      map.easeTo({ center: [executor.lon, executor.lat], zoom: Math.max(map.getZoom(), 14), duration: 700 });
    }
  }, [executor, ready, t.amber]);

  // Вебвью MAX на части устройств не даёт WebGL2 — карта не рисуется.
  // Вместо пустого прямоугольника показываем текстовое «слежение».
  if (noWebgl) {
    return (
      <div style={{
        width: "100%", height, borderRadius: 16, background: t.card,
        border: `1px solid ${t.border}`, padding: 16,
        display: "flex", flexDirection: "column", gap: 8,
        alignItems: "center", justifyContent: "center", textAlign: "center",
      }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: t.text }}>
          Карта недоступна на этом устройстве
        </div>
        <div style={{ fontSize: 12.5, color: t.sub, lineHeight: 1.5 }}>
          Слежение за исполнителем работает: позиция обновляется, когда исполнитель в пути.
        </div>
        {executor?.lat != null && (
          <div style={{ fontSize: 12.5, color: t.accent, fontWeight: 700 }}>
            Исполнитель {executor.name} сейчас на связи
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      position: "relative", width: "100%", height, borderRadius: 16,
      overflow: "hidden", background: t.mapBg,
      border: `1px solid ${t.border}`,
    }}>
      <div ref={container} style={{ position: "absolute", inset: 0 }} />
      {/* Копирайт OSM: значок ©, по тапу раскрывается строка */}
      <button
        type="button"
        onClick={() => setAttrOpen(v => !v)}
        aria-label="Авторство карты: OpenStreetMap"
        style={{
          position: "absolute", left: 8, bottom: 8, zIndex: 4,
          width: 20, height: 20, borderRadius: "50%", padding: 0,
          border: "none", cursor: "pointer",
          background: "rgba(255,255,255,.82)", color: "rgba(60,60,67,.85)",
          fontSize: 12, fontWeight: 700, lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,.18)",
          fontFamily: "system-ui",
        }}
      >©</button>
      {attrOpen && (
        <div style={{
          position: "absolute", left: 33, bottom: 8, zIndex: 4,
          fontSize: 9.5, lineHeight: 1.3, whiteSpace: "nowrap",
          color: "rgba(60,60,67,.85)", background: "rgba(255,255,255,.9)",
          borderRadius: 6, padding: "3px 7px",
          boxShadow: "0 1px 5px rgba(0,0,0,.18)",
          userSelect: "none", WebkitUserSelect: "none",
        }}>{OSM_ATTRIBUTION}</div>
      )}
    </div>
  );
}
