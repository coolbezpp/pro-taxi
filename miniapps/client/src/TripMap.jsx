import React, { useEffect, useRef, useState } from "react";
import { Map, Marker, NavigationControl, AttributionControl, LngLatBounds, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { api } from "./api.js";
import { useTheme } from "./theme.js";
import {
  installPmtilesProtocol,
  makeStyle,
  fallbackStyle,
  OSM_ATTRIBUTION
} from "./mapStyle";

setWorkerUrl(workerUrl);
installPmtilesProtocol();

const empty = () => ({ type: "FeatureCollection", features: [] });

export default function TripMap({
  onPointsChange,
  onAddressesChange,
  onRouteChange,
  onError,
  city,
  children,
  hideSheet = false,
  sheetOffsetVh = 58
}) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const markers = useRef({});
  const pointsRef = useRef({ from: null, to: null });
  const modeRef = useRef("from");
  const requestId = useRef(0);
  const alive = useRef(false);
  const busyRef = useRef(false);
  const { t } = useTheme();

  const [mode, setMode] = useState("from");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [route, setRoute] = useState(null);
  const [error, setError] = useState("");

  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [activeField, setActiveField] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);

  function setPoint(key, point, title) {
    const next = { ...pointsRef.current, [key]: point };
    pointsRef.current = next;
    onPointsChange?.(next);

    const nextFrom = key === "from" ? (title || "Точка на карте") : fromQuery;
    const nextTo = key === "to" ? (title || "Точка на карте") : toQuery;

    if (key === "from") setFromQuery(nextFrom);
    if (key === "to") setToQuery(nextTo);

    onAddressesChange?.({ from: nextFrom, to: nextTo });

    const map = mapRef.current;
    if (map) {
      if (markers.current[key]) {
        markers.current[key].setLngLat([point.lon, point.lat]);
      } else {
        const el = document.createElement("div");
        el.textContent = key === "from" ? "A" : "B";
        Object.assign(el.style, {
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          background: key === "from" ? t.markerA : t.markerB,
          color: t.onSolid,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: "800",
          border: `3px solid ${t.card}`,
          boxShadow: "0 4px 12px rgba(0,0,0,.25)"
        });
        markers.current[key] = new Marker({ element: el })
          .setLngLat([point.lon, point.lat])
          .addTo(map);
      }
    }

    if (key === "from" && !next.to) {
      modeRef.current = "to";
      setMode("to");
    }
  }

  async function search(query) {
    if (!query || query.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    const id = ++requestId.current;
    setSearching(true);

    const cityQuery = city && city.trim() ? `${city.trim()}, ${query}` : query;

    try {
      const rows = await api(`/geo/search?q=${encodeURIComponent(cityQuery)}`);
      if (alive.current && requestId.current === id) {
        const rowsList = Array.isArray(rows) ? rows : [];
        const cityLower = (city || "").trim().toLowerCase();
        rowsList.sort((a, b) => {
          const aCity = cityLower && a.title?.toLowerCase().includes(cityLower) ? 0 : 1;
          const bCity = cityLower && b.title?.toLowerCase().includes(cityLower) ? 0 : 1;
          return aCity - bCity;
        });
        setSuggestions(rowsList);
      }
    } catch {
      if (alive.current && requestId.current === id) setSuggestions([]);
    } finally {
      if (alive.current && requestId.current === id) setSearching(false);
    }
  }

  function chooseSuggestion(item) {
    if (!activeField) return;
    setSuggestions([]);
    setPoint(activeField, { lat: item.lat, lon: item.lon }, item.title);
    mapRef.current?.flyTo({ center: [item.lon, item.lat], zoom: 15, duration: 600 });
  }

  async function buildRoute() {
    if (busyRef.current) return;
    const { from, to } = pointsRef.current;
    if (!from || !to) return;

    const id = ++requestId.current;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setRoute(null);
    mapRef.current?.getSource("trip-route")?.setData(empty());

    try {
      const result = await api("/geo/route", {
        method: "POST",
        body: {
          from_lat: from.lat,
          from_lon: from.lon,
          to_lat: to.lat,
          to_lon: to.lon
        }
      });

      if (!alive.current || requestId.current !== id) return;

      const coords = result.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) {
        throw new Error("Не удалось построить маршрут");
      }

      mapRef.current?.getSource("trip-route")?.setData({
        type: "Feature",
        properties: {},
        geometry: result.geometry
      });

      const bounds = coords.reduce(
        (box, point) => box.extend(point),
        new LngLatBounds(coords[0], coords[0])
      );
      mapRef.current?.fitBounds(bounds, { padding: 90, maxZoom: 16, duration: 600 });

      setRoute(result);
      onRouteChange?.({
        distanceKm: Number(result.distance_km),
        durationMin: Number(result.duration_min)
      });
    } catch (e) {
      if (alive.current && requestId.current === id) {
        const message = String(e.message || "Не удалось построить маршрут");
        setError(message);
        onError?.(message);
      }
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

  useEffect(() => {
    const { from, to } = pointsRef.current;
    if (from && to) buildRoute();
  }, [pointsRef.current.from, pointsRef.current.to]);

  useEffect(() => {
    alive.current = true;
    let map;
    let observer;

    try {
      map = new Map({
        container: container.current,
        style: makeStyle(),
        center: [37.3164, 44.8908],
        zoom: 12,
        attributionControl: false
      });
      map.addControl(
        new AttributionControl({
          customAttribution: OSM_ATTRIBUTION,
          compact: true
        }),
        "bottom-left"
      );
      map.on("error", e => {
        if (e?.error?.message?.includes("pmtiles") && map.getStyle()?.sources?.osm) {
          map.setStyle(fallbackStyle());
        }
      });
      mapRef.current = map;
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");

      map.on("style.load", () => {
        if (!alive.current) return;
        map.addSource("trip-route", { type: "geojson", data: empty() });
        map.addLayer({
          id: "trip-route-line",
          type: "line",
          source: "trip-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": t.markerA, "line-width": 6 }
        });
        setReady(true);
      });

      map.on("click", event => {
        setPoint(modeRef.current, {
          lat: event.lngLat.lat,
          lon: event.lngLat.lng
        });
      });

      observer = new ResizeObserver(() => map.resize());
      observer.observe(container.current);
    } catch (e) {
      const message = "Карта не запустилась. Проверьте поддержку WebGL.";
      setError(message);
      onError?.(message);
    }

    return () => {
      alive.current = false;
      requestId.current += 1;
      observer?.disconnect();
      Object.values(markers.current).forEach(marker => marker.remove());
      markers.current = {};
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Цвет линии маршрута следует за темой
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (map.getLayer("trip-route-line")) {
        map.setPaintProperty("trip-route-line", "line-color", t.markerA);
      }
    } catch (e) {
      // слой ещё не создан — перекрасится при style.load
    }
  }, [t.markerA]);

  function locate() {
    if (!navigator.geolocation) {
      setError("Геолокация недоступна");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        setLocating(false);
        const point = {
          lat: position.coords.latitude,
          lon: position.coords.longitude
        };
        setPoint("from", point, "Моё местоположение");
        mapRef.current?.flyTo({ center: [point.lon, point.lat], zoom: 15 });
      },
      () => {
        setLocating(false);
        const message = "Не удалось определить местоположение";
        setError(message);
        onError?.(message);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: t.mapBg }}>
      <div ref={container} style={{ position: "absolute", inset: 0 }} />

      <div style={{
        position: "absolute",
        top: 14,
        left: 14,
        right: 14,
        zIndex: 5,
        background: t.card,
        borderRadius: 18,
        boxShadow: t.shadow,
        overflow: "hidden"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: `1px solid ${t.border}` }}>
          <span style={{
            width: 24, height: 24, borderRadius: "50%",
            background: t.markerA, color: t.onSolid,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 800
          }}>A</span>
          <input
            placeholder="Откуда"
            value={fromQuery}
            onFocus={() => { setActiveField("from"); setMode("from"); modeRef.current = "from"; }}
            onChange={e => { setFromQuery(e.target.value); search(e.target.value); }}
            style={{ flex: 1, border: 0, outline: "none", fontSize: 15, color: t.text, background: "transparent" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
          <span style={{
            width: 24, height: 24, borderRadius: "50%",
            background: t.markerB, color: t.onSolid,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 800
          }}>B</span>
          <input
            placeholder="Куда"
            value={toQuery}
            onFocus={() => { setActiveField("to"); setMode("to"); modeRef.current = "to"; }}
            onChange={e => { setToQuery(e.target.value); search(e.target.value); }}
            style={{ flex: 1, border: 0, outline: "none", fontSize: 15, color: t.text, background: "transparent" }}
          />
        </div>

        {suggestions.length > 0 && (
          <div style={{ maxHeight: 240, overflowY: "auto", borderTop: `1px solid ${t.border}` }}>
            {suggestions.map((item, index) => (
              <button
                key={`${item.lat}-${item.lon}-${index}`}
                onClick={() => chooseSuggestion(item)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 14px",
                  background: t.card,
                  border: 0,
                  borderBottom: `1px solid ${t.border}`,
                  color: t.text,
                  fontSize: 13,
                  lineHeight: 1.35
                }}
              >
                {item.title}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "50%",
          top: "calc(50% - 60px)",
          transform: "translate(-50%, -100%)",
          zIndex: 4,
          pointerEvents: "none",
          textAlign: "center"
        }}
      >
        <div style={{
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: mode === "from" ? t.markerA : t.markerB,
          border: `3px solid ${t.card}`,
          boxShadow: "0 6px 18px rgba(0,0,0,.28)",
          color: t.onSolid,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 900,
          fontSize: 15
        }}>
          {mode === "from" ? "A" : "B"}
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          const map = mapRef.current;
          if (!map) return;
          const center = map.getCenter();
          setPoint(modeRef.current, {
            lat: center.lat,
            lon: center.lng
          }, modeRef.current === "from" ? "Точка подачи на карте" : "Точка назначения на карте");
        }}
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: `calc(${sheetOffsetVh}vh + 14px)`,
          zIndex: 5,
          padding: "12px 18px",
          borderRadius: 14,
          border: `1px solid ${t.border}`,
          background: t.card,
          color: t.text,
          fontWeight: 800,
          boxShadow: "0 8px 24px rgba(0,0,0,.14)"
        }}
      >
        Выбрать {mode === "from" ? "точку подачи" : "точку назначения"}
      </button>

      <button
        onClick={locate}
        disabled={!ready || locating}
        style={{
          position: "absolute",
          right: 14,
          bottom: `calc(${sheetOffsetVh}vh + 72px)`,
          zIndex: 5,
          width: 48,
          height: 48,
          borderRadius: "50%",
          border: 0,
          background: t.card,
          color: t.text,
          boxShadow: "0 8px 24px rgba(0,0,0,.18)",
          fontSize: 20
        }}
      >
        {locating ? "…" : "◎"}
      </button>

      {!hideSheet && (
        <div style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 6,
          background: t.card,
          borderRadius: "24px 24px 0 0",
          padding: "14px 16px 18px",
          boxShadow: t.sheetShadow,
          maxHeight: "58vh",
          overflowY: "auto",
          color: t.text
        }}>
          {route ? (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <strong>{Number(route.distance_km).toFixed(1)} км</strong>
              <span style={{ color: t.sub }}>≈ {Math.ceil(route.duration_min)} мин</span>
            </div>
          ) : (
            <div style={{ color: t.sub, fontSize: 13, marginBottom: 12 }}>
              {busy ? "Строим маршрут…" : "Выберите точки А и B"}
            </div>
          )}

          {children}

          {error && <div style={{ color: t.danger, fontSize: 13, marginTop: 10 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}
