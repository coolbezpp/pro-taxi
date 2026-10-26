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

// Карта на главной в духе Яндекс такси: наш тайловый сервер (PMTiles
// Краснодарского края), синяя точка «я здесь» и кнопка «показать меня».
export default function HomeMap({ t, position = null }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const flewRef = useRef(false);

  const height = Math.min(330, Math.max(240, Math.round(window.innerHeight * 0.42)));

  useEffect(() => {
    let map;
    let observer;
    let watchId;
    try {
      const start = position
        ? [position.lon, position.lat]
        : KKR_CENTER;
      map = new Map({
        container: container.current,
        style: makeStyle(),
        center: start,
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
      mapRef.current = map;
      observer = new ResizeObserver(() => map.resize());
      observer.observe(container.current);

      const ensureMarker = (lon, lat) => {
        if (!markerRef.current) {
          const el = document.createElement("div");
          el.className = "pro-home-dot";
          markerRef.current = new Marker({ element: el, anchor: "center" })
            .setLngLat([lon, lat])
            .addTo(map);
        } else {
          markerRef.current.setLngLat([lon, lat]);
        }
      };

      // Точка из профиля — сразу, если сервер уже знает позицию
      if (position) {
        ensureMarker(position.lon, position.lat);
        flewRef.current = true;
      }

      // Живая геопозиция: обновляем точку, при первом определении — подлетаем
      if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
          pos => {
            const lon = pos.coords.longitude;
            const lat = pos.coords.latitude;
            ensureMarker(lon, lat);
            if (!flewRef.current) {
              flewRef.current = true;
              map.flyTo({ center: [lon, lat], zoom: 13.6, duration: 900 });
            }
          },
          () => {},
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
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
      flewRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Кнопка «показать меня» — подлёт к точке, как в Яндекс такси
  const recenter = () => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map) return;
    if (marker) {
      const c = marker.getLngLat();
      map.flyTo({
        center: [c.lng, c.lat],
        zoom: Math.max(map.getZoom(), 13.6),
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
      position: "relative", width: "100%", height, borderRadius: 18,
      overflow: "hidden", background: t.mapBg,
      border: `1px solid ${t.border}`, marginBottom: 12,
    }}>
      <div ref={container} style={{ position: "absolute", inset: 0 }} />
      <button
        type="button"
        onClick={recenter}
        aria-label="Показать моё местоположение"
        style={{
          position: "absolute", right: 12, bottom: 26,
          width: 40, height: 40, borderRadius: "50%",
          background: t.card, color: t.text,
          border: `1px solid ${t.border}`,
          boxShadow: "0 6px 18px rgba(0,0,0,.18)",
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
        .pro-home-dot {
          width: 18px; height: 18px; border-radius: 50%;
          background: #2f7bff; border: 3px solid #fff;
          animation: proDotPulse 2.2s infinite;
        }
      `}</style>
    </div>
  );
}
