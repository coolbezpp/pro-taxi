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

// Примерные координаты по IP провайдера доступа — запасной источник,
// когда GPS молчит (нет разрешения, спутники не ловятся): город-уровень,
// на карте показывается большим ореолом «где-то здесь». Для мобильного
// интернета провайдер часто определяется по центру региона — поэтому
// возвращаем и название города, чтобы честно показать «примерно где».
async function ipHint() {
  for (const url of ["https://ipwho.is/", "https://ipapi.co/json/", "https://ipinfo.io/json"]) {
    try {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const to = ctrl ? setTimeout(() => ctrl.abort(), 4500) : null;
      const r = await fetch(url, ctrl ? { signal: ctrl.signal } : {});
      if (to) clearTimeout(to);
      if (!r.ok) continue;
      const j = await r.json();
      if (!j || j.success === false) continue;
      let lat = Number(j.latitude ?? j.lat);
      let lon = Number(j.longitude ?? j.lon);
      if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && typeof j.loc === "string") {
        // ipinfo.io: "loc": "45.035,38.975"
        const parts = j.loc.split(",");
        lat = Number(parts[0]);
        lon = Number(parts[1]);
      }
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        return { lat, lon, city: j.city || j.region || null };
      }
    } catch (e) {
      // источник недоступен — пробуем следующий
    }
  }
  return null;
}

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
  const watchIdRef = useRef(null); // id watchPosition (чтобы не дублировать)
  const [geoBlocked, setGeoBlocked] = useState(false); // геолокация запрещена
  const [attrOpen, setAttrOpen] = useState(false);     // раскрытая строка © OSM
  const [approx, setApprox] = useState(false);         // точка примерная (по IP)
  const [approxCity, setApproxCity] = useState("");    // город из IP-сервиса
  const [geoPending, setGeoPending] = useState(false); // ждём GPS-fix после запроса
  const [pickMode, setPickMode] = useState(false);     // режим «укажите место вручную»
  const [noPos, setNoPos] = useState(false);           // ни GPS, ни IP не ответили

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

  // GPS-watch: первый fix подлетает к реальной точке и снимает «примерную»
  // метку. Вынесено в функцию — кнопка «Определить точно» и кнопка «показать
  // меня» перезапрашивают позицию (на iOS запрос разрешения работает по жесту)
  const startGeo = () => {
    const map = mapRef.current;
    if (!map || watchIdRef.current != null || !navigator.geolocation) return;
    setGeoPending(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const lon = pos.coords.longitude;
        const lat = pos.coords.latitude;
        ensureMarker(lon, lat, pos.coords.accuracy);
        setGeoBlocked(false);
        setApprox(false);
        setApproxCity("");
        setGeoPending(false);
        try { markerRef.current?.getElement()?.classList.remove("pro-home-approx"); } catch (e) {}
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
        setGeoPending(false);
        // code 1 — пользователь запретил доступ к геолокации
        if (err && err.code === 1) setGeoBlocked(true);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  // Ручное указание места: GPS в вебвью MAX не работает (в SDK нет моста
  // к системной геолокации), поэтому исполнитель сам ставит точку —
  // тащит карту под неподвижный прицел и жмёт «Сохранить»
  const startPick = () => {
    setPickMode(true);
    const map = mapRef.current;
    if (map) {
      map.flyTo({ center: map.getCenter(), zoom: Math.max(map.getZoom(), 13.5), duration: 500 });
    }
  };

  const savePick = () => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    setPickMode(false);
    ensureMarker(c.lng, c.lat, 30);
    setApprox(false);
    setApproxCity("");
    setNoPos(false);
    setGeoBlocked(false);
    try { markerRef.current?.getElement()?.classList.remove("pro-home-approx"); } catch (e) {}
    // Третий аргумент force — ручное сохранение не ждёт троттлинг
    if (onPosition) {
      sentRef.current = Date.now();
      onPosition(c.lat, c.lng, true);
    }
  };

  useEffect(() => {
    let map;
    let observer;
    let hintTimer;
    try {
      map = new Map({
        container: container.current,
        style: makeStyle(),
        center: position ? [position.lon, position.lat] : KKR_CENTER,
        zoom: position ? 13.4 : 11.6,
        maxZoom: 14,
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

      // Свежая геопозиция без кэша: первый fix всегда подлетает к реальной
      // точке (даже если профиль прислал устаревшую), дальше — обновление
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

      // GPS молчит (нет разрешения / спутники не ловятся) — через 7 секунд
      // берём примерные координаты по IP провайдера доступа. Метка сразу
      // помечается как примерная: провайдер определяется по центру региона,
      // реальный город может быть другим — покажем баннер с кнопкой
      // «Определить точно»
      hintTimer = setTimeout(async () => {
        if (gpsRef.current || markerRef.current) return;
        const hint = await ipHint();
        if (!hint) {
          // и GPS, и IP молчат — остаётся ручной способ
          setNoPos(true);
          return;
        }
        if (gpsRef.current || markerRef.current || !mapRef.current) return;
        ensureMarker(hint.lon, hint.lat, 3500);
        setApprox(true);
        setApproxCity(hint.city || "");
        try { markerRef.current?.getElement()?.classList.add("pro-home-approx"); } catch (e) {}
        mapRef.current.flyTo({ center: [hint.lon, hint.lat], zoom: 10.8, duration: 900 });
      }, 7000);
    } catch (e) {
      return undefined;
    }
    return () => {
      clearTimeout(hintTimer);
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

  // Кнопка «показать меня»: при живом GPS — подлёт к точке, как в Яндекс
  // такси. Живого GPS в MAX нет (вебвью не отдаёт геолокацию) — тогда
  // кнопка становится постоянным входом в ручной выбор места
  const recenter = () => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map) return;
    if (!gpsRef.current) {
      startPick();
      return;
    }
    if (approx) startGeo();
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
      {!pickMode && (
      <button
        type="button"
        onClick={recenter}
        aria-label="Показать моё местоположение или указать место вручную"
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
      )}
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
      {geoBlocked && !pickMode && (
        <div style={{
          position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
          zIndex: 3, maxWidth: "calc(100% - 24px)", padding: "6px 8px 6px 13px",
          borderRadius: 16, background: "rgba(255,214,102,.95)", color: "#5b4200",
          fontSize: 11, fontWeight: 750, lineHeight: 1.35,
          boxShadow: "0 6px 16px rgba(0,0,0,.22)",
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          justifyContent: "center", textAlign: "center",
        }}>
          <span>Геопозиция запрещена — разрешите доступ в настройках телефона</span>
          <button
            type="button"
            onClick={startPick}
            style={{
              border: 0, cursor: "pointer", borderRadius: 999,
              padding: "5px 11px", fontSize: 11, fontWeight: 800,
              background: "#8a6d00", color: "#fff", fontFamily: "inherit",
            }}
          >Указать место вручную</button>
        </div>
      )}
      {/* Точка по IP-адресу провайдера — честно помечаем как примерную
          (провайдер часто определяется по центру региона, а не по городу) */}
      {approx && !geoBlocked && !pickMode && (
        <div style={{
          position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
          zIndex: 3, maxWidth: "calc(100% - 24px)", padding: "6px 8px 6px 13px",
          borderRadius: 16, background: "rgba(255,255,255,.94)", color: "#3a4048",
          fontSize: 11, fontWeight: 750, lineHeight: 1.35,
          boxShadow: "0 6px 16px rgba(0,0,0,.22)",
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          justifyContent: "center", textAlign: "center",
        }}>
          <span>Примерное место{approxCity ? `: ${approxCity}` : ""} (по IP)</span>
          <button
            type="button"
            onClick={startGeo}
            disabled={geoPending}
            style={{
              border: 0, cursor: geoPending ? "default" : "pointer", borderRadius: 999,
              padding: "5px 11px", fontSize: 11, fontWeight: 800,
              background: geoPending ? "#98a2b3" : "#2f7bff", color: "#fff",
              fontFamily: "inherit",
            }}
          >{geoPending ? "Ищу…" : "Определить точно"}</button>
          <button
            type="button"
            onClick={startPick}
            style={{
              border: 0, cursor: "pointer", borderRadius: 999,
              padding: "5px 11px", fontSize: 11, fontWeight: 800,
              background: "#3a4048", color: "#fff", fontFamily: "inherit",
            }}
          >Указать место</button>
        </div>
      )}
      {/* Ни GPS (в MAX он не работает), ни IP не ответили */}
      {noPos && !approx && !geoBlocked && !pickMode && (
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
          <button
            type="button"
            onClick={startPick}
            style={{
              border: 0, cursor: "pointer", borderRadius: 999,
              padding: "5px 11px", fontSize: 11, fontWeight: 800,
              background: "#2f7bff", color: "#fff", fontFamily: "inherit",
            }}
          >Указать вручную</button>
        </div>
      )}
      {/* Режим выбора места: карта тащится под неподвижный прицел */}
      {pickMode && (
        <>
          <div style={{
            position: "absolute", left: "50%", top: "50%",
            transform: "translate(-50%, -50%)", zIndex: 5, pointerEvents: "none",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%",
              border: "3px solid #2f7bff", background: "rgba(255,255,255,.85)",
              boxShadow: "0 2px 10px rgba(0,0,0,.35)",
            }} />
            <div style={{
              fontSize: 10.5, fontWeight: 850, color: "#2f7bff",
              background: "rgba(255,255,255,.92)", borderRadius: 6,
              padding: "2px 7px", boxShadow: "0 2px 8px rgba(0,0,0,.25)",
            }}>я здесь</div>
          </div>
          <div style={{
            position: "absolute", left: "50%", transform: "translateX(-50%)",
            bottom: 18, zIndex: 6, display: "flex", gap: 8,
            background: "rgba(255,255,255,.95)", borderRadius: 16, padding: 8,
            boxShadow: "0 8px 20px rgba(0,0,0,.25)", maxWidth: "calc(100% - 24px)",
          }}>
            <button
              type="button"
              onClick={savePick}
              style={{
                border: 0, cursor: "pointer", borderRadius: 999,
                padding: "11px 18px", fontSize: 13, fontWeight: 850,
                background: "#2f7bff", color: "#fff", fontFamily: "inherit",
              }}
            >Сохранить это место</button>
            <button
              type="button"
              onClick={() => setPickMode(false)}
              style={{
                border: 0, cursor: "pointer", borderRadius: 999,
                padding: "11px 16px", fontSize: 13, fontWeight: 750,
                background: "#e8ebf0", color: "#3a4048", fontFamily: "inherit",
              }}
            >Отмена</button>
          </div>
        </>
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
        /* Примерная точка (по IP): серая, с пунктирным ореолом */
        .pro-home-approx .pro-home-core {
          background: #98a2b3; animation: none;
        }
        .pro-home-approx .pro-home-halo {
          background: rgba(152,162,179,.16);
          border: 1px dashed rgba(152,162,179,.6);
        }
      `}</style>
    </div>
  );
}
