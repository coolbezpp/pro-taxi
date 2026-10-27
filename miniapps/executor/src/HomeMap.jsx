import React, { useEffect, useRef } from "react";
import { Map, AttributionControl, Marker, setWorkerUrl } from "maplibre-gl";
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

// Краснодар — стартовый центр, пока позиция не известна
const KKR_CENTER = [38.975, 45.035];

// Карта на главной исполнителя в духе Яндекс такси: наш тайловый сервер
// (PMTiles Краснодарского края), синяя точка «я здесь» с ореолом точности
// и кнопка «показать меня». Свежий GPS всегда приоритетнее позиции из
// профиля — устаревшая серверная точка не «привязывает» карту.
export default function HomeMap({ t, position = null, full = false, onPosition = null }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const haloRef = useRef(null);
  const accRef = useRef(40);   // точность последнего fix, метры
  const gpsRef = useRef(false); // был ли свежий GPS-fix
  const sentRef = useRef(0);   // когда последний раз шли позицию на сервер

  const height = full
    ? "calc(100dvh - 128px)"
    : Math.min(330, Math.max(240, Math.round(window.innerHeight * 0.42)));

  // Ореол точности: радиус GPS в метрах → пиксели при текущем масштабе
  const resizeHalo = () => {
    const map = mapRef.current;
    const halo = haloRef.current;
    if (!map || !halo) return;
    const lat = markerRef.current ? markerRef.current.getLngLat().lat : map.getCenter().lat;
    const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, map.getZoom());
    const px = Math.min(300, Math.max(24, (accRef.current * 2) / mpp));
    halo.style.width = `${px}px`;
    halo.style.height = `${px}px`;
  };

  // Синяя точка с ореолом: ставится при первой известной координате,
  // дальше просто перемещается по свежим данным
  const ensureMarker = (lon, lat, accuracy) => {
    const map = mapRef.current;
    if (!map) return;
    if (accuracy != null) accRef.current = accuracy;
    if (!markerRef.current) {
      const el = document.createElement("div");
      el.className = "pro-home-dot";
      const halo = document.createElement("div");
      halo.className = "pro-home-halo";
      haloRef.current = halo;
      const core = document.createElement("div");
      core.className = "pro-home-core";
      el.append(halo, core);
      markerRef.current = new Marker({ element: el, anchor: "center" })
        .setLngLat([lon, lat])
        .addTo(map);
    } else {
      markerRef.current.setLngLat([lon, lat]);
    }
    resizeHalo();
  };

  useEffect(() => {
    let map;
    let observer;
    let watchId;
    try {
      map = new Map({
        container: container.current,
        style: makeStyle(),
        center: position ? [position.lon, position.lat] : KKR_CENTER,
        zoom: position ? 13.4 : 11.6,
        maxZoom: 14,
        attributionControl: false,
      });
      map.addControl(
        new AttributionControl({ customAttribution: OSM_ATTRIBUTION, compact: true }),
        "bottom-left"
      );
      // Свой тайловый сервер недоступен — переключаемся на публичный
      map.on("error", (e) => {
        if (e?.error?.message?.includes("pmtiles") && map.getStyle()?.sources?.osm) {
          map.setStyle(fallbackStyle());
        }
      });
      map.on("zoom", resizeHalo);
      mapRef.current = map;
      observer = new ResizeObserver(() => map.resize());
      observer.observe(container.current);

      // Точка из профиля — подсказка до первого GPS-fix
      if (position) ensureMarker(position.lon, position.lat, null);

      // Свежая геопозиция без кэша: первый fix всегда подлетает к реальной
      // точке (даже если профиль прислал устаревшую), дальше — обновление
      if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
          pos => {
            const lon = pos.coords.longitude;
            const lat = pos.coords.latitude;
            ensureMarker(lon, lat, pos.coords.accuracy);
            if (!gpsRef.current) {
              gpsRef.current = true;
              map.flyTo({ center: [lon, lat], zoom: 13.8, duration: 1000 });
            }
            const now = Date.now();
            if (onPosition && now - sentRef.current > 60000) {
              sentRef.current = now;
              onPosition(lat, lon);
            }
          },
          () => {},
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
      }
    } catch (e) {
      return undefined;
    }
    return () => {
      if (watchId != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
      observer?.disconnect();
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
      haloRef.current = null;
      gpsRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Позиция из профиля догрузилась позже карты — ставим точку-подсказку
  useEffect(() => {
    if (!position || gpsRef.current || markerRef.current) return;
    ensureMarker(position.lon, position.lat, null);
    mapRef.current?.flyTo({
      center: [position.lon, position.lat],
      zoom: 13.4,
      duration: 700,
    });
  }, [position]);

  // Кнопка «показать меня» — подлёт к точке, как в Яндекс такси
  const recenter = () => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map) return;
    if (marker) {
      const c = marker.getLngLat();
      map.flyTo({
        center: [c.lng, c.lat],
        zoom: Math.max(map.getZoom(), 13.8),
        duration: 700,
      });
    } else if (navigator.geolocation) {
      // точки ещё нет — запросим позицию, watchPosition покажет её сам
      navigator.geolocation.getCurrentPosition(
        () => {},
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  };

  return (
    <div style={{
      position: "relative",
      width: full ? "calc(100% + 32px)" : "100%",
      margin: full ? "0 -16px" : 0,
      height,
      borderRadius: full ? 0 : 18,
      overflow: "hidden", background: t.mapBg,
      border: full ? "none" : `1px solid ${t.border}`,
      marginBottom: full ? 0 : 12,
    }}>
      <div ref={container} style={{ position: "absolute", inset: 0 }} />
      <button
        type="button"
        onClick={recenter}
        aria-label="Показать моё местоположение"
        style={{
          position: "absolute", right: 14, bottom: 30,
          width: 42, height: 42, borderRadius: "50%",
          background: t.card, color: t.text,
          border: `1px solid ${t.border}`,
          boxShadow: "0 6px 18px rgba(0,0,0,.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", padding: 0,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="10" cy="10" r="4.2" />
          <path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3" />
        </svg>
      </button>
      <style>{`
        @keyframes proDotPulse {
          0% { box-shadow: 0 0 0 0 rgba(47,123,255,.35); }
          70% { box-shadow: 0 0 0 14px rgba(47,123,255,0); }
          100% { box-shadow: 0 0 0 0 rgba(47,123,255,0); }
        }
        .pro-home-dot { position: relative; width: 0; height: 0; }
        .pro-home-halo {
          position: absolute; left: 50%; top: 50%;
          transform: translate(-50%, -50%);
          width: 64px; height: 64px; border-radius: 50%;
          background: rgba(47,123,255,.15);
          border: 1px solid rgba(47,123,255,.3);
        }
        .pro-home-core {
          position: absolute; left: 50%; top: 50%;
          transform: translate(-50%, -50%);
          width: 18px; height: 18px; border-radius: 50%;
          background: #2f7bff; border: 3px solid #fff;
          animation: proDotPulse 2.2s infinite;
        }
      `}</style>
    </div>
  );
}
