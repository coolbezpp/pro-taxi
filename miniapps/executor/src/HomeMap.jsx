import React, { useEffect, useRef, useState } from "react";
import { Map, Marker, setWorkerUrl } from "maplibre-gl";
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
export default function HomeMap({ t, position = null, full = false, onPosition = null, onEnableTrack = null, trackBusy = false }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const haloRef = useRef(null);
  const accRef = useRef(40);   // точность последнего fix, метры
  const gpsRef = useRef(false); // был ли свежий GPS-fix
  const sentRef = useRef(0);   // когда последний раз шли позицию на сервер
  const watchIdRef = useRef(null); // id watchPosition (чтобы не дублировать)
  const [geoBlocked, setGeoBlocked] = useState(false); // геолокация запрещена
  const [attrOpen, setAttrOpen] = useState(false);     // раскрытая строка © OSM
  const [noPos, setNoPos] = useState(false);           // GPS не смог дать координаты
  const [noWebgl, setNoWebgl] = useState(false);       // вебвью не дало WebGL2

  // Высота с учётом safe-area (iPhone): низ карты не заезжает под навбар
  const height = full
    ? "calc(100dvh - 128px - env(safe-area-inset-bottom, 0px))"
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

  // GPS-watch: запрос геолокации запускается при каждом открытии миниаппа
  // (см. useEffect ниже) и повторяется кнопками. Первый fix подлетает к
  // реальной точке
  const startGeo = () => {
    const map = mapRef.current;
    if (!map || watchIdRef.current != null || !navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const lon = pos.coords.longitude;
        const lat = pos.coords.latitude;
        ensureMarker(lon, lat, pos.coords.accuracy);
        setGeoBlocked(false);
        setNoPos(false);
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
      err => {
        // code 1 — доступ к геолокации запрещён (в MAX это отказывает
        // само приложение, настройки телефона не всегда помогают)
        if (err && err.code === 1) {
          setGeoBlocked(true);
        } else {
          // нет спутников / таймаут — покажем баннер с повтором
          setNoPos(true);
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  // Ручной выбор места и диагностика удалены по решению пользователя: место
  // добывается браузерным трекингом (кнопка «Включить GPS» → страница
  // трекинга в системном браузере). Здесь только GPS-watch и ретраи.

  useEffect(() => {
    let map;
    let observer;
    // maplibre v6 требует WebGL2. Вебвью MAX на части Android-устройств
    // не даёт WebGL2-контекст — new Map() бросает, и раньше карта молча
    // оставалась пустым прямоугольником. Проверяем заранее и показываем
    // понятную заглушку вместо пустоты.
    try {
      const probe = document.createElement("canvas");
      const gl = probe.getContext("webgl2");
      if (!gl) {
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
        center: position ? [position.lon, position.lat] : KKR_CENTER,
        zoom: position ? 13.4 : 11.6,
        // Краснодарский край — карта мира не нужна. Приближать можно
        // свободно (тайлы z15 переразмериваются), а отдалять дальше
        // края нельзя: minZoom + жёсткие границы обзора
        minZoom: 7,
        maxZoom: 19,
        // maxBounds: [[югоЗапад], [североВосток]] — порядок важен
        maxBounds: [[37.0, 42.0], [43.0, 47.2]],
        attributionControl: false,
      });
      // Копирайт — свой статичный неинтерактивный ярлык в JSX (клик по
      // «© OpenStreetMap» больше не открывает полное описание)
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

      // Запрос геолокации при каждом открытии миниаппа — единственный
      // источник места исполнителя (IP-хинт и ручной выбор удалены)
      startGeo();

      // Разрешение на геолокацию отозвано — предупредим прямо на карте
      try {
        if (navigator.permissions?.query) {
          navigator.permissions.query({ name: "geolocation" }).then((st) => {
            setGeoBlocked(st.state === "denied");
            st.onchange = () => setGeoBlocked(st.state === "denied");
          }).catch(() => {});
        }
      } catch (e) {}
    } catch (e) {
      // new Map() бросил (нет WebGL2/контекст потерян) — показываем заглушку
      setNoWebgl(true);
      return undefined;
    }
    return () => {
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
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

  // Позиция из профиля догрузилась позже карты — ставим точку-подсказку.
  // Если точка ОБНОВИЛАСЬ (пришла от бота через вебхук) и живого GPS нет —
  // передвигаем маркер: исполнитель вернулся из чата в миниапп и видит
  // свою свежую точку. Сравниваем координаты, а не объект: position
  // пересоздаётся на каждый рендер профиля
  useEffect(() => {
    if (!position || gpsRef.current) return;
    const m = markerRef.current;
    if (!m) {
      ensureMarker(position.lon, position.lat, null);
      mapRef.current?.flyTo({
        center: [position.lon, position.lat],
        zoom: 13.4,
        duration: 700,
      });
      setNoPos(false);
      return;
    }
    const cur = m.getLngLat();
    if (Math.abs(cur.lat - position.lat) > 1e-5 || Math.abs(cur.lng - position.lon) > 1e-5) {
      ensureMarker(position.lon, position.lat, null);
      setNoPos(false);
      mapRef.current?.flyTo({
        center: [position.lon, position.lat],
        zoom: 13.4,
        duration: 700,
      });
    }
  }, [position]);

  // Кнопка «показать меня»: при живом GPS — подлёт к точке, как в Яндекс
  // такси. Живого GPS пока нет — пробуем его добыть ещё раз
  const recenter = () => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map) return;
    if (!gpsRef.current) {
      startGeo();
      return;
    }
    if (marker) {
      const c = marker.getLngLat();
      map.flyTo({
        center: [c.lng, c.lat],
        zoom: Math.max(map.getZoom(), 13.8),
        duration: 700,
      });
    }
  };

  // Вебвью MAX на части Android-устройств не даёт WebGL2: карта не может
  // отрисоваться. Вместо пустого прямоугольника — заглушка с объяснением
  // и рабочей кнопкой «Включить GPS» (трекинг работает без WebGL).
  if (noWebgl) {
    return (
      <div style={{
        position: "relative",
        width: full ? "calc(100% + 32px)" : "100%",
        margin: full ? "0 -16px" : 0,
        height,
        borderRadius: full ? 0 : 18,
        background: t.mapBg,
        border: full ? "none" : `1px solid ${t.border}`,
        marginBottom: full ? 0 : 12,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 10, padding: "18px 20px", textAlign: "center",
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 14,
          background: t.card, border: `1px solid ${t.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke={t.sub} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 20l-5.5 2.5V6L9 3.5m0 16.5l6-2.5m-6 2.5V3.5m6 14l5.5 2V6l-5.5-2.5m0 14V3.5" />
          </svg>
        </div>
        <div style={{ fontWeight: 800, fontSize: 14.5, color: t.text, lineHeight: 1.35 }}>
          Карта временно недоступна
        </div>
        <div style={{ fontSize: 12.5, color: t.sub, lineHeight: 1.5, maxWidth: 280 }}>
          Ваше устройство не поддерживает отрисовку карты (WebGL).
          Заказы и GPS-позиция работают — геопозиция обновляется кнопкой ниже.
        </div>
        {onEnableTrack && (
          <button
            type="button"
            onClick={onEnableTrack}
            disabled={trackBusy}
            style={{
              marginTop: 4, padding: "10px 18px", borderRadius: 12,
              background: "#2f7bff", color: "#fff", border: "none",
              fontWeight: 800, fontSize: 13.5, cursor: "pointer",
              opacity: trackBusy ? 0.6 : 1,
            }}
          >
            {trackBusy ? "Открываю…" : "Включить GPS"}
          </button>
        )}
      </div>
    );
  }

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
      {/* Копирайт OSM (лицензия требует авторство): маленький значок ©
          в углу карты — по тапу раскрывается строка, мешает кнопкам нет */}
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
      {geoBlocked && (
        <div style={{
          position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
          zIndex: 3, maxWidth: "calc(100% - 24px)", padding: "6px 8px 6px 13px",
          borderRadius: 16, background: "rgba(255,214,102,.95)", color: "#5b4200",
          fontSize: 11, fontWeight: 750, lineHeight: 1.35,
          boxShadow: "0 6px 16px rgba(0,0,0,.22)",
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          justifyContent: "center", textAlign: "center",
        }}>
          <span>MAX не даёт доступ к геолокации в приложении</span>
          {onEnableTrack && (
            <button
              type="button"
              onClick={onEnableTrack}
              disabled={trackBusy}
              style={{
                border: 0, cursor: trackBusy ? "default" : "pointer", borderRadius: 999,
                padding: "5px 11px", fontSize: 11, fontWeight: 800,
                background: "#177e46", color: "#fff", fontFamily: "inherit",
              }}
            >{trackBusy ? "Готовлю код…" : "Включить GPS"}</button>
          )}
        </div>
      )}
      {/* GPS не смог дать координаты (нет спутников / таймаут) */}
      {noPos && !geoBlocked && (
        <div style={{
          position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
          zIndex: 3, maxWidth: "calc(100% - 24px)", padding: "6px 8px 6px 13px",
          borderRadius: 16, background: "rgba(255,255,255,.94)", color: "#3a4048",
          fontSize: 11, fontWeight: 750, lineHeight: 1.35,
          boxShadow: "0 6px 16px rgba(0,0,0,.22)",
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          justifyContent: "center", textAlign: "center",
        }}>
          <span>Не удалось определить место</span>
          {onEnableTrack && (
            <button
              type="button"
              onClick={onEnableTrack}
              disabled={trackBusy}
              style={{
                border: 0, cursor: trackBusy ? "default" : "pointer", borderRadius: 999,
                padding: "5px 11px", fontSize: 11, fontWeight: 800,
                background: "#177e46", color: "#fff", fontFamily: "inherit",
              }}
            >{trackBusy ? "Готовлю код…" : "Включить GPS"}</button>
          )}
        </div>
      )}
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
