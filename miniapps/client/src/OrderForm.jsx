import React, { useEffect, useRef, useState } from "react";
import { api } from "./api.js";

// Окно заказа: адреса вводятся вручную, подсказки — ближайшие к клиенту,
// расстояние и цена считаются автоматически, допуслуги и комментарий — здесь же.
export default function OrderForm({
  s,
  t,
  city,
  options,
  setOptions,
  onSubmit,
  submitting,
  error,
  onClose,
  tariff = "standard",
  setTariff,
  intercityAt = "",
  setIntercityAt,
}) {
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [active, setActive] = useState("from");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [myPos, setMyPos] = useState(null);
  const [route, setRoute] = useState(null);
  const [basePrice, setBasePrice] = useState(null);
  const [increase, setIncrease] = useState(0);
  const [comment, setComment] = useState("");
  const [calcError, setCalcError] = useState("");
  const [busy, setBusy] = useState(false);
  const reqId = useRef(0);

  // Геопозиция клиента — чтобы подсказки шли ближайшие к нему
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => setMyPos({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // Подсказки по введённому тексту: текущий город уточняет запрос и
  // поднимает «свои» адреса наверх (геокодер ищет по всей стране)
  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setSuggestions([]);
      return;
    }
    const id = ++reqId.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const cityTrim = (city || "").trim();
        const params = new URLSearchParams({
          q: cityTrim ? `${cityTrim}, ${text}` : text,
        });
        if (myPos) {
          params.set("lat", String(myPos.lat));
          params.set("lon", String(myPos.lon));
        }
        const res = await api(`/geo/search?${params.toString()}`);
        const rows = Array.isArray(res) ? res : [];
        const cityLower = cityTrim.toLowerCase();
        rows.sort((a, b) => {
          const aCity = cityLower && a.title?.toLowerCase().includes(cityLower) ? 0 : 1;
          const bCity = cityLower && b.title?.toLowerCase().includes(cityLower) ? 0 : 1;
          return aCity - bCity;
        });
        if (reqId.current === id) setSuggestions(rows);
      } catch (e) {
        if (reqId.current === id) setSuggestions([]);
      } finally {
        if (reqId.current === id) setSearching(false);
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [query, myPos, city]);

  // Пересчёт маршрута и цены, когда изменились адреса или опции
  useEffect(() => {
    if (!from || !to) {
      setRoute(null);
      setBasePrice(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setBusy(true);
      setCalcError("");
      try {
        const res = await api("/geo/route", {
          method: "POST",
          body: {
            from_lat: from.lat,
            from_lon: from.lon,
            to_lat: to.lat,
            to_lon: to.lon,
          },
        });
        if (cancelled) return;
        setRoute(res);

        const priceRes = await api("/price", {
          method: "POST",
          body: {
            tariff_code: tariff,
            children: options.children,
            animals: options.animals,
            child_seats: options.child_seats,
            distance_km: Number(res.distance_km),
            city_km: Number(res.distance_km),
            out_km: 0,
            manual_increase: 0,
          },
        });
        if (!cancelled) setBasePrice(Number(priceRes.total));
      } catch (e) {
        if (!cancelled) {
          setCalcError("Не удалось рассчитать маршрут — проверьте адреса");
          setRoute(null);
          setBasePrice(null);
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [from, to, options.children, options.animals, options.child_seats, tariff]);

  const maxIncrease = basePrice ? Math.floor(basePrice * 0.5) : 0;
  const total = basePrice === null ? null : basePrice + increase;
  const canIncrease = basePrice !== null && increase + 50 <= maxIncrease;

  function pick(item) {
    const point = { title: item.title, lat: item.lat, lon: item.lon };
    if (active === "from") {
      setFrom(point);
      setActive("to");
    } else {
      setTo(point);
    }
    setQuery("");
    setSuggestions([]);
  }

  function setField(field) {
    setActive(field);
    setQuery("");
    setSuggestions([]);
  }

  const inputStyle = {
    width: "100%", padding: "13px 14px", border: 0, borderRadius: 14,
    background: t.inputBg, color: t.text, fontSize: 15, fontFamily: "inherit",
    outline: "none", boxSizing: "border-box",
  };

  const chip = (activeChip) => ({
    display: "flex", alignItems: "center", gap: 7,
    padding: "10px 12px", borderRadius: 12, cursor: "pointer",
    border: `1px solid ${activeChip ? t.accent : t.border}`,
    background: activeChip ? t.accentSoft : t.card,
    color: activeChip ? t.accent : t.text,
    fontSize: 13, fontWeight: 700, fontFamily: "inherit",
  });

  return (
    <div style={{ padding: "14px 16px 30px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <button
          onClick={onClose}
          aria-label="Назад"
          style={{
            width: 38, height: 38, borderRadius: 12, border: 0, cursor: "pointer",
            background: t.card, color: t.text, fontSize: 18, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >←</button>
        <strong style={{ fontSize: 20, color: t.text, letterSpacing: -0.4 }}>Новый заказ</strong>
      </div>

      {/* Тариф */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[["standard", "Стандарт"], ["intercity", "Межгород"]].map(([code, title]) => (
          <button
            key={code}
            onClick={() => setTariff && setTariff(code)}
            style={{
              flex: 1, padding: "12px 14px", borderRadius: 12, cursor: "pointer",
              border: `1px solid ${tariff === code ? t.accent : t.border}`,
              background: tariff === code ? t.accentSoft : t.card,
              color: tariff === code ? t.accent : t.text,
              fontWeight: 800, fontSize: 13.5, fontFamily: "inherit",
            }}
          >{title}</button>
        ))}
      </div>

      {tariff === "intercity" && (
        <div style={{ marginBottom: 12 }}>
          <input
            type="datetime-local"
            value={intercityAt}
            onChange={e => setIntercityAt && setIntercityAt(e.target.value)}
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 12,
              border: `1px solid ${t.border}`, background: t.inputBg, color: t.text,
              fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
        </div>
      )}

      {/* Адреса */}
      <div style={{ background: t.card, borderRadius: 18, border: `1px solid ${t.border}`, padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
            background: t.accent, color: t.onAccent,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 800,
          }}>A</span>
          <input
            style={inputStyle}
            placeholder="Откуда подача"
            value={active === "from" ? query : (from?.title || "")}
            onFocus={() => setField("from")}
            onChange={e => { setActive("from"); setQuery(e.target.value); }}
          />
        </div>

        <div style={{ height: 1, background: t.border, margin: "10px 0" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
            background: t.success, color: t.onAccent,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 800,
          }}>B</span>
          <input
            style={inputStyle}
            placeholder="Куда едем"
            value={active === "to" ? query : (to?.title || "")}
            onFocus={() => setField("to")}
            onChange={e => { setActive("to"); setQuery(e.target.value); }}
          />
        </div>

        {suggestions.length > 0 && (
          <div style={{ marginTop: 10, borderTop: `1px solid ${t.border}` }}>
            {suggestions.map((item, i) => (
              <button
                key={`${item.lat}-${item.lon}-${i}`}
                onClick={() => pick(item)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  padding: "11px 4px", background: "transparent", border: 0,
                  borderBottom: `1px solid ${t.border}`, cursor: "pointer",
                  textAlign: "left", fontFamily: "inherit",
                }}
              >
                <span style={{ color: t.sub, display: "flex" }}>
                  <Icon name="pin" size={17} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, color: t.text, lineHeight: 1.3 }}>
                    {item.title}
                  </span>
                  {item.distance_km != null && (
                    <span style={{ display: "block", fontSize: 11.5, color: t.sub, marginTop: 2 }}>
                      {item.distance_km < 1
                        ? `${Math.round(item.distance_km * 1000)} м от вас`
                        : `${item.distance_km.toFixed(1)} км от вас`}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}

        {searching && (
          <p style={{ margin: "10px 2px 0", fontSize: 12, color: t.sub }}>Ищем адреса…</p>
        )}
      </div>

      {/* Маршрут и цена */}
      {route && (
        <div style={{
          marginTop: 12, padding: 14, borderRadius: 16,
          background: t.accentSoft, display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 13.5, color: t.text, fontWeight: 700 }}>
            {Number(route.distance_km).toFixed(1)} км · ≈ {Math.ceil(route.duration_min)} мин
          </span>
          {busy ? (
            <span style={{ fontSize: 12.5, color: t.sub }}>считаем…</span>
          ) : total !== null ? (
            <strong style={{ fontSize: 17, color: t.text, fontWeight: 900 }}>{total} ₽</strong>
          ) : null}
        </div>
      )}

      {calcError && (
        <p style={{ margin: "10px 2px 0", fontSize: 12.5, color: t.danger }}>{calcError}</p>
      )}

      {/* Допуслуги */}
      <div style={{ marginTop: 16 }}>
        <strong style={{ display: "block", fontSize: 13.5, color: t.sub, marginBottom: 8 }}>Допуслуги</strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            style={chip(options.child_seats > 0)}
            onClick={() => setOptions(o => ({
              ...o,
              child_seats: o.child_seats >= 2 ? 0 : o.child_seats + 1,
            }))}
          >
            Детское кресло
            {options.child_seats > 0 ? ` ×${options.child_seats}` : ""}
            <span style={{ color: t.sub, fontWeight: 600 }}>+50 ₽</span>
          </button>

          <button
            style={chip(options.own_child_seat)}
            onClick={() => setOptions(o => ({ ...o, own_child_seat: !o.own_child_seat }))}
          >
            Своё кресло
            <span style={{ color: t.sub, fontWeight: 600 }}>бесплатно</span>
          </button>

          <button
            style={chip(options.animals)}
            onClick={() => setOptions(o => ({ ...o, animals: !o.animals }))}
          >
            С животным
            <span style={{ color: t.sub, fontWeight: 600 }}>+50 ₽</span>
          </button>

          <button
            style={chip(options.wheelchair)}
            onClick={() => setOptions(o => ({ ...o, wheelchair: !o.wheelchair }))}
          >
            Инвалидное кресло
            <span style={{ color: t.sub, fontWeight: 600 }}>бесплатно</span>
          </button>
        </div>
      </div>

      {/* Повышение стоимости */}
      <div style={{ marginTop: 16 }}>
        <strong style={{ display: "block", fontSize: 13.5, color: t.sub, marginBottom: 8 }}>Стоимость</strong>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: 14, borderRadius: 16,
          background: t.card, border: `1px solid ${t.border}`,
        }}>
          <span style={{ fontSize: 13, color: t.sub, lineHeight: 1.4, flex: 1, minWidth: 0 }}>
            {basePrice === null
              ? "Сначала укажите адреса — посчитаем стоимость"
              : increase > 0
                ? `Надбавка ${increase} ₽ (максимум ${maxIncrease} ₽)`
                : "Можно поднять цену, если долго нет исполнителя"}
          </span>
          <button
            onClick={() => setIncrease(v => v + 50)}
            disabled={!canIncrease}
            style={{
              flexShrink: 0, padding: "11px 14px", borderRadius: 12, border: 0,
              background: canIncrease ? t.accent : t.inputBg,
              color: canIncrease ? t.onAccent : t.sub,
              fontWeight: 850, fontSize: 13, cursor: canIncrease ? "pointer" : "default",
              fontFamily: "inherit",
            }}
          >+50 ₽</button>
        </div>
      </div>

      {/* Комментарий */}
      <div style={{ marginTop: 16 }}>
        <strong style={{ display: "block", fontSize: 13.5, color: t.sub, marginBottom: 8 }}>Комментарий</strong>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          maxLength={500}
          placeholder="Например: к подъезду, не звонить — я в домофон"
          style={{
            width: "100%", minHeight: 84, padding: 13, borderRadius: 14,
            border: `1px solid ${t.border}`, background: t.inputBg, color: t.text,
            fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box",
            outline: "none",
          }}
        />
      </div>

      {error && (
        <div style={{
          marginTop: 14, padding: 12, borderRadius: 12,
          background: t.dangerSoft, color: t.danger, fontSize: 13, fontWeight: 700,
        }}>{error}</div>
      )}

      <button
        onClick={() => onSubmit({
          from, to, route, comment, increase, total, basePrice,
        })}
        disabled={!from || !to || basePrice === null || submitting}
        style={{
          width: "100%", marginTop: 18, padding: 16, borderRadius: 16, border: 0,
          background: t.cta, color: t.onCta, fontWeight: 900, fontSize: 16,
          cursor: from && to && basePrice !== null ? "pointer" : "default",
          opacity: from && to && basePrice !== null ? 1 : 0.5,
          fontFamily: "inherit",
          boxShadow: "0 12px 28px -10px rgba(255,205,45,.6)",
        }}
      >
        {submitting ? "Отправляем…" : total !== null ? `Заказать за ${total} ₽` : "Заказать"}
      </button>

      <p style={{ margin: "10px 2px 0", fontSize: 11.5, color: t.sub, lineHeight: 1.5 }}>
        Надбавка не может превышать 50% от расчётной стоимости — это защита от фиктивных заказов.
      </p>
    </div>
  );
}

// Локальная копия иконки (чтобы не тянуть весь набор в модуль формы)
function Icon({ name, size = 18, style }) {
  const paths = {
    pin: (
      <>
        <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flex: "0 0 auto", ...style }}
    >
      {paths[name] || null}
    </svg>
  );
}
