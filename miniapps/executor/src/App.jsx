import React, { useEffect, useRef, useState } from "react";
import { api, setExecutorToken } from "./api.js";
import { isMaxEnv } from "./maxGate.js";
import MaxGate from "./MaxGate.jsx";
import { useTheme, maxPalette } from "./theme.js";
// maplibre (~600 КБ) — отдельный чанк, грузится только при открытии
// карточки заказа с трекингом; стартовый экран стартует мгновенно.
const TrackMap = React.lazy(() => import("./TrackMap.jsx"));
// Карта на главной (стиль Яндекс такси) — тоже отдельный чанк
const HomeMap = React.lazy(() => import("./HomeMap.jsx"));

// Штриховые SVG-иконки в едином стиле — как в клиентском приложении.
const ICON_PATHS = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      <path d="M10 21v-6h4v6" />
    </>
  ),
  orders: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  my: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.5V3.8A1.3 1.3 0 0 1 10.3 2.5h3.4A1.3 1.3 0 0 1 15 3.8v.7" />
      <path d="m9 13 2 2 4-4" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  taxi: (
    <>
      <rect x="9.7" y="2.7" width="4.6" height="2.4" rx="0.9" />
      <path d="M4.4 15.7v-3.4l1.8-4A2 2 0 0 1 8 6.9h8a2 2 0 0 1 1.8 1.4l1.8 4v3.4" />
      <path d="M3.2 15.7h17.6" />
      <circle cx="7.6" cy="17.7" r="1.5" />
      <circle cx="16.4" cy="17.7" r="1.5" />
    </>
  ),
  key: (
    <>
      <circle cx="7" cy="7" r="3.6" />
      <path d="M9.6 9.6 20.5 20.5" />
      <path d="m16.6 16.6 1.6-1.6" />
      <path d="m14.2 14.2 1.6-1.6" />
    </>
  ),
  house: (
    <>
      <path d="M3.5 10.6 12 3.6l8.5 7" />
      <path d="M5.6 9.6V20h12.8V9.6" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  package: (
    <>
      <path d="M5 8.2h14l-1.2 11a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
      <path d="M9 8.2V6.4a3 3 0 0 1 6 0v1.8" />
    </>
  ),
  truck: (
    <>
      <rect x="2.8" y="6.6" width="9.4" height="9.8" rx="1.2" />
      <path d="M12.2 10.2h3.6l3.4 3.4v2.8h-7z" />
      <path d="M2.8 9.8h9.4" />
      <circle cx="6.6" cy="17.7" r="1.6" />
      <circle cx="16.6" cy="17.7" r="1.6" />
    </>
  ),
  wrench: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  ),
  building: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" />
    </>
  ),
  id: (
    <>
      <circle cx="12" cy="8.5" r="3" />
      <path d="M7 20a5.2 5.2 0 0 1 10 0" />
      <rect x="3.5" y="3" width="17" height="18" rx="3" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.3 3.8 5.2 3.8 8.5s-1.3 6.2-3.8 8.5c-2.5-2.3-3.8-5.2-3.8-8.5s1.3-6.2 3.8-8.5z" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.5 18h15z" />
      <path d="M10 21a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  support: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.8 9.2a2.3 2.3 0 0 1 4.4.8c0 1.5-2.2 1.9-2.2 3.2" />
      <path d="M12 16.6h.01" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  doc: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M13.5 3v4.5H18" />
      <path d="M9 12h6M9 15.5h6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 5.5v5c0 4.6 3 8.9 7 10.5 4-1.6 7-5.9 7-10.5v-5z" />
      <path d="m9 11.8 2.2 2.2L15.5 9.7" />
    </>
  ),
  link: (
    <>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M10.2 6.6 12 4.8a4.07 4.07 0 0 1 5.8 0c1.6 1.6 1.6 4.2 0 5.8L16 12.4" />
      <path d="M13.8 17.4 12 19.2a4.07 4.07 0 0 1-5.8 0c-1.6-1.6-1.6-4.2 0-5.8L8 11.6" />
    </>
  ),
  chevronRight: <path d="m9 6 6 6-6 6" />,
  camera: (
    <>
      <path d="M3.5 8.5h3.2l1.6-2.4h7.4l1.6 2.4h3.2a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1h-18a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.5" r="3.6" />
    </>
  ),
  // Шестерёнка — как вкладка «Настройки» в мессенджере MAX
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.09-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.09 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="M3 10h18" />
      <path d="M16.5 14.5h.01" />
    </>
  ),
  trend: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.2 1 5.9L12 17l-5.2 2.8 1-5.9-4.3-4.2 5.9-.9z" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  arrowRight: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />,
  monitor: (
    <>
      <rect x="3" y="4.5" width="18" height="13" rx="2" />
      <path d="M9 21h6M12 17.5V21" />
    </>
  ),
};

function Icon({ name, size = 24, style, strokeWidth = 2.2 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flex: "0 0 auto", ...style }}
    >
      {ICON_PATHS[name] || null}
    </svg>
  );
}

const RATE_ICON_PATHS = {
  like: (
    <>
      <path d="M2.5 10.5h4v10.5h-4z" />
      <path d="M6.5 21V10.5l4.8-7.3a2 2 0 0 1 3.5 1.9l-1.6 5.4h6.1a2.2 2.2 0 0 1 2.2 2.7l-1.7 6.4a2.6 2.6 0 0 1-2.5 1.9H6.5z" />
    </>
  ),
  dislike: (
    <>
      <path d="M21.5 13.5h-4V3h4z" />
      <path d="M17.5 3v10.5l-4.8 7.3a2 2 0 0 1-3.5-1.9l1.6-5.4H4.7a2.2 2.2 0 0 1-2.2-2.7l1.7-6.4a2.6 2.6 0 0 1 2.5-1.9h10.8z" />
    </>
  ),
};

function RateIcon({ name, size = 17 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {RATE_ICON_PATHS[name]}
    </svg>
  );
}

// ---------- Профиль исполнителя в стиле меню настроек MAX (референс 111.mp4) ----------
// Палитра профиля приходит из theme.js (PROFILE_LIGHT / PROFILE_DARK).

// Карточка-секция без заголовка — как группы в MAX
function MaxGroup({ m, children }) {
  return (
    <div style={{
      background: m.card, borderRadius: 16, overflow: "hidden",
      display: "flex", flexDirection: "column", marginTop: 12,
    }}>
      {children}
    </div>
  );
}

// Строка: контурная иконка + подпись + значение справа + шеврон
function MaxRow({ m, icon, label, value, onClick, danger, accent, badge }) {
  const row = {
    display: "flex", alignItems: "center", gap: 14, width: "100%",
    padding: "15px 18px", background: "transparent", border: 0,
    textAlign: "left", cursor: onClick ? "pointer" : "default",
    fontFamily: "inherit", WebkitTapHighlightColor: "transparent",
    flex: "0 0 auto",
  };
  const body = (
    <>
      <span style={{ color: danger ? m.danger : accent ? m.invite : m.icon }}>{icon}</span>
      <span style={{
        flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600,
        color: danger ? m.danger : accent ? m.invite : m.text,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {label}
      </span>
      {badge > 0 && (
        <span style={{
          flexShrink: 0, minWidth: 22, height: 22, padding: "0 7px",
          borderRadius: 999, background: m.link, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 800,
        }}>{badge > 99 ? "99+" : badge}</span>
      )}
      {value != null && value !== "" && (
        <span style={{
          fontSize: 13.5, color: m.sub, fontWeight: 550, maxWidth: 160, flexShrink: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {value}
        </span>
      )}
      {onClick && <Icon name="chevronRight" size={16} style={{ color: m.chevron }} />}
    </>
  );
  return onClick ? <button style={row} onClick={onClick}>{body}</button> : <div style={row}>{body}</div>;
}

// Рейтинг в виде заряжающейся батареи: изначально 100%, каждая оценка
// за последние 100 заказов двигает заряд. Цветовая индикация: зелёный
// (80–100%), жёлтый (60–79%), оранжевый (40–59%), красный (<40%).
function RatingBattery({ value = 100, w = 52 }) {
  const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const color = v >= 80 ? "#17b26a" : v >= 60 ? "#f5b400" : v >= 40 ? "#f97316" : "#ff3b5d";
  const h = Math.max(16, Math.round(w * 0.45));
  const fs = Math.max(9, Math.round(h * 0.5));
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ display: "inline-flex", alignItems: "center" }}>
        {/* Процент внутри корпуса: заряд заливает батарею слева,
            цифра поверх — белая с тенью, читается на любом заряде */}
        <span style={{
          position: "relative", width: w, height: h, borderRadius: 4,
          boxSizing: "border-box", border: "1.5px solid rgba(128,132,150,.55)",
          background: "#4b4f63", overflow: "hidden",
        }}>
          <span style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: `${v}%`, background: color, transition: "width .3s",
          }} />
          <span style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            fontSize: fs, fontWeight: 850, lineHeight: 1,
            color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,.55)",
          }}>{v}%</span>
        </span>
        <span style={{
          width: 3, height: Math.round(h * 0.42), borderRadius: "0 2px 2px 0",
          background: "rgba(128,132,150,.55)", marginLeft: 1,
        }} />
      </span>
    </span>
  );
}

// Данные пользователя из MAX (initData: user = {id, first_name, photo_url})
function readMaxUser() {
  try {
    const raw =
      window.WebApp?.initData ||
      window.Max?.initData ||
      window.Max?.WebApp?.initData ||
      window.Telegram?.WebApp?.initData ||
      new URLSearchParams(window.location.search).get("initData") ||
      "";
    if (!raw) return null;
    const fromParams = new URLSearchParams(raw).get("user");
    if (fromParams) return JSON.parse(fromParams);
    const parsed = JSON.parse(raw);
    return parsed?.user || null;
  } catch (e) {
    return null;
  }
}

// 79000000000 → +7 900 000 00 00
function formatPhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) {
    const d = digits[0] === "8" ? `7${digits.slice(1)}` : digits;
    return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9, 11)}`;
  }
  return String(value);
}

// ---------- Экраны исполнителя: статистика, роли, фото-контроль, информация ----------
function SubPageHeader({ m, title, onBack }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      marginBottom: 14, paddingTop: 2,
    }}>
      <button
        onClick={onBack}
        aria-label="Назад"
        style={{
          width: 38, height: 38, borderRadius: 12, border: 0, cursor: "pointer",
          background: m.card, color: m.text, fontSize: 18, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >←</button>
      <strong style={{ fontSize: 20, color: m.text, letterSpacing: -0.4 }}>{title}</strong>
    </div>
  );
}

// Статистика: по умолчанию — последние 7 дней, по месяцу — доход по неделям
function ExecutorStatsPage({ me, t, m, onBack }) {
  const [data, setData] = useState(null);
  const [month, setMonth] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const params = month ? `?month=${month}` : "";
    api(`/executors/${me.id}/balance-history${params}`)
      .then(res => { if (alive) setData(res); })
      .catch(e => { if (alive) setError(e.message || "Не удалось загрузить статистику"); });
    return () => { alive = false; };
  }, [me.id, month]);

  const isWeek = data?.period === "month";
  const weeks = data?.weeks || [];
  const days = data?.days || [];
  const bars = isWeek ? weeks : days;
  const maxBar = Math.max(1, ...bars.map(w => w.amount));
  const topups = data?.topups || [];
  const months = data?.available_months || [];

  const MONTHS_SHORT = {
    "01": "янв", "02": "фев", "03": "мар", "04": "апр", "05": "мая", "06": "июн",
    "07": "июл", "08": "авг", "09": "сен", "10": "окт", "11": "ноя", "12": "дек",
  };

  return (
    <div style={{ padding: "14px 16px 30px", background: m.bg, minHeight: "100dvh" }}>
      <SubPageHeader m={m} title="Баланс и заработок" onBack={onBack} />

      {/* Переключатель: 7 дней или месяц */}
      <div style={{
        display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6,
        scrollbarWidth: "none", marginBottom: 12,
      }}>
        <button
          onClick={() => setMonth(null)}
          style={{
            flexShrink: 0, padding: "9px 13px", borderRadius: 12, cursor: "pointer",
            border: `1px solid ${!month ? m.accent : m.cardAltBorder}`,
            background: !month ? m.accent : m.card,
            color: !month ? m.onAccent : m.text,
            fontWeight: 800, fontSize: 12.5, fontFamily: "inherit",
            WebkitTapHighlightColor: "transparent",
          }}
        >7 дней</button>

        {months.map(key => {
          const [y, mo] = key.split("-");
          const selected = key === month;
          return (
            <button
              key={key}
              onClick={() => setMonth(key)}
              style={{
                flexShrink: 0, padding: "9px 13px", borderRadius: 12, cursor: "pointer",
                border: `1px solid ${selected ? m.accent : m.cardAltBorder}`,
                background: selected ? m.accent : m.card,
                color: selected ? m.onAccent : m.text,
                fontWeight: 800, fontSize: 12.5, fontFamily: "inherit",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {MONTHS_SHORT[mo]} {y}
            </button>
          );
        })}
      </div>

      <div style={{
        padding: 18, borderRadius: 18, background: m.card, border: `1px solid ${m.cardAltBorder}`,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: m.sub }}>
          Текущий баланс
        </span>
        <strong style={{ display: "block", marginTop: 6, fontSize: 32, fontWeight: 900, letterSpacing: -1, color: m.text }}>
          {data ? `${Number(data.balance).toLocaleString("ru-RU")} ₽` : "—"}
        </strong>
        <span style={{ display: "block", marginTop: 10, fontSize: 13, color: m.sub }}>
          За {data?.period_label || "период"}:{" "}
          <b style={{ color: m.text }}>{data ? `${Number(data.total_earned).toLocaleString("ru-RU")} ₽` : "—"}</b>
        </span>
      </div>

      {/* Столбики: по дням за 7 дней или по неделям за месяц */}
      <div style={{ marginTop: 12, padding: 18, borderRadius: 18, background: m.card, border: `1px solid ${m.cardAltBorder}` }}>
        <strong style={{ fontSize: 14, color: m.text }}>
          {isWeek ? "Заработок по неделям" : "Заработок по дням"}
        </strong>
        {bars.length === 0 ? (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: m.sub }}>
            Данных за период пока нет.
          </p>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 160, marginTop: 14 }}>
            {bars.map(w => (
              <div key={w.start || w.date} style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "flex-end", height: "100%",
              }}>
                <span style={{
                  fontSize: 10.5, fontWeight: 800, color: w.amount ? m.text : m.sub,
                  marginBottom: 5, whiteSpace: "nowrap",
                }}>
                  {w.amount ? `${Number(w.amount).toLocaleString("ru-RU")} ₽` : "—"}
                </span>
                <div style={{
                  width: "100%", maxWidth: 46,
                  height: w.amount
                    ? `${Math.max(10, Math.round((w.amount / maxBar) * 100))}%`
                    : 3,
                  borderRadius: 8,
                  background: w.amount ? m.accent : m.cardAltBorder,
                }} />
                <span style={{
                  marginTop: 6, fontSize: 10, color: m.sub, whiteSpace: "nowrap",
                }}>{isWeek ? w.label : `${w.weekday} ${w.label}`}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Пополнения за выбранный месяц */}
      <div style={{ marginTop: 12, padding: 18, borderRadius: 18, background: m.card, border: `1px solid ${m.cardAltBorder}` }}>
        <strong style={{ fontSize: 14, color: m.text }}>Пополнения баланса</strong>
        {topups.length === 0 ? (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: m.sub }}>
            За выбранный месяц пополнений не было. Оператор может зачислить средства на баланс.
          </p>
        ) : (
          topups.map(op => (
            <div key={op.id} style={{
              display: "flex", justifyContent: "space-between", gap: 10,
              padding: "11px 0", borderBottom: `1px solid ${m.cardAltBorder}`,
            }}>
              <span style={{ fontSize: 13.5, color: m.text }}>
                {op.comment || (op.amount > 0 ? "Пополнение" : "Корректировка")}
                <small style={{ display: "block", color: m.sub, fontSize: 11.5, marginTop: 2 }}>
                  {op.created_at ? new Date(op.created_at).toLocaleString("ru-RU") : ""}
                </small>
              </span>
              <strong style={{
                fontSize: 14, fontWeight: 800, flexShrink: 0,
                color: op.amount > 0 ? m.link : m.text,
              }}>
                {op.amount > 0 ? "+" : ""}{Number(op.amount).toLocaleString("ru-RU")} ₽
              </strong>
            </div>
          ))
        )}
      </div>

      {error && <p style={{ marginTop: 12, color: m.danger, fontSize: 13 }}>{error}</p>}
    </div>
  );
}

// Смена роли: список ролей, активная, доход за 7 дней
function ExecutorRolesPage({ me, t, m, earnings, activeRole, onSwitchRole, onAddRole, onLogout, onBack }) {
  function roleValue(r) {
    const inc = earnings?.by_role?.[r];
    const money = inc ? `+${Number(inc).toLocaleString("ru-RU")} ₽` : "нет заказов";
    return r === activeRole ? `${money} · активна` : money;
  }

  return (
    <div style={{ padding: "14px 16px 30px", background: m.bg, minHeight: "100dvh" }}>
      <SubPageHeader m={m} title="Смена роли" onBack={onBack} />

      <p style={{ margin: "0 0 12px", fontSize: 13, color: m.sub, lineHeight: 1.5 }}>
        Текущая роль — <b style={{ color: m.text }}>{ROLE_NAMES[activeRole] || "не выбрана"}</b>.
        Выберите другую, чтобы получать заказы по ней.
      </p>

      <div style={{ background: m.card, borderRadius: 16, overflow: "hidden" }}>
        {ROLES.map(r => {
          const included = me.roles?.includes(r.id);
          return (
            <button
              key={r.id}
              onClick={() => (included ? onSwitchRole(r.id) : onAddRole(r.id))}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%",
                padding: "14px 16px", background: "transparent", border: 0,
                borderBottom: `1px solid ${m.cardAltBorder}`,
                textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                color: m.text,
              }}
            >
              <span style={{ color: m.icon, display: "flex" }}>
                <Icon name={r.icon} size={21} strokeWidth={2.2} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14.5, fontWeight: 600 }}>{r.title}</span>
                <span style={{ display: "block", fontSize: 12, color: m.sub, marginTop: 2 }}>
                  {roleValue(r.id)}
                </span>
              </span>
              {!included && (
                <span style={{
                  flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: m.link,
                  padding: "4px 9px", borderRadius: 999, background: m.cardAlt,
                }}>Добавить</span>
              )}
              {included && r.id === activeRole && (
                <span style={{ flexShrink: 0, color: m.chevron, display: "flex" }}>
                  <Icon name="check" size={18} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Фото-контроль: запросы оператора, отправленные фото и решения модератора
const PHOTO_KIND_LABELS = {
  car: "Фото автомобиля",
  documents: "Фото документов",
  selfie: "Селфи",
  plate: "Фото номера",
};

const PHOTO_STATUS_RU = {
  requested: "Ждём фото",
  pending: "На проверке",
  approved: "Принято",
  rejected: "Отклонено",
};

function ExecutorPhotoChecksPage({ me, t, m, onBack }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [sendKind, setSendKind] = useState("car");

  async function load() {
    try {
      const res = await api(`/executors/${me.id}/photo-checks`);
      setItems(Array.isArray(res) ? res : []);
    } catch (e) {
      setError(e.message || "Не удалось загрузить проверки");
      setItems([]);
    }
  }

  useEffect(() => { load(); }, [me.id]);

  // Фото с камеры уменьшаем сами: смартфон отдаёт 3–5 МБ, а сервер ждёт лёгкий кадр
  async function compressImage(file, maxSide = 1600, quality = 0.82) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Не удалось прочитать фото"));
      reader.readAsDataURL(file);
    });

    const loadImage = src => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Не удалось открыть фото"));
      img.src = src;
    });

    let img;
    try {
      img = await loadImage(dataUrl);
    } catch (e) {
      return dataUrl; // не смогли перерисовать — отправим как есть
    }

    const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round((img.width || 1) * scale));
    const height = Math.max(1, Math.round((img.height || 1) * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, width, height);

    let out = canvas.toDataURL("image/jpeg", quality);
    // если всё ещё большой — жмём сильнее
    while (out.length > 1_600_000 && quality > 0.45) {
      quality -= 0.12;
      out = canvas.toDataURL("image/jpeg", quality);
    }
    return out;
  }

  function readFile(file, then) {
    if (!file) return;
    // Только живой снимок: снимок из галереи — это старый файл, отклоняем
    const age = Date.now() - Number(file.lastModified || 0);
    if (file.lastModified && age > 2 * 60 * 1000) {
      setError("Нужен свежий снимок с камеры — галерею использовать нельзя");
      return;
    }
    compressImage(file)
      .then(then)
      .catch(() => setError("Не удалось обработать фото"));
  }

  async function answer(checkId, file) {
    setBusyId(checkId);
    setError("");
    readFile(file, async (dataUrl) => {
      try {
        await api(`/executors/${me.id}/photo-checks/${checkId}`, {
          method: "PUT",
          body: { photo_url: dataUrl, status: "answered", captured_at: Date.now() },
        });
        await load();
      } catch (e) {
        setError(e.message || "Не удалось отправить фото");
      } finally {
        setBusyId(null);
      }
    });
  }

  async function sendOwn(file) {
    setBusyId(0);
    setError("");
    readFile(file, async (dataUrl) => {
      try {
        await api(`/executors/${me.id}/photo-checks`, {
          method: "POST",
          body: {
            kind: sendKind,
            photo_url: dataUrl,
            title: PHOTO_KIND_LABELS[sendKind],
            captured_at: Date.now(),
          },
        });
        await load();
      } catch (e) {
        setError(e.message || "Не удалось отправить фото");
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <div style={{ padding: "14px 16px 30px", background: m.bg, minHeight: "100dvh" }}>
      <SubPageHeader m={m} title="Фотоконтроль" onBack={onBack} />

      <p style={{ margin: "0 0 12px", fontSize: 13, color: m.sub, lineHeight: 1.5 }}>
        Оператор может запросить фото автомобиля, документов или селфи. Пришлите его —
        модератор проверит и пришлёт решение.
      </p>

      {/* Своё фото на проверку */}
      <div style={{
        padding: 16, borderRadius: 18, background: m.card, border: `1px solid ${m.cardAltBorder}`,
      }}>
        <strong style={{ fontSize: 14, color: m.text }}>Прислать фото на проверку</strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {Object.entries(PHOTO_KIND_LABELS).map(([kind, label]) => (
            <button
              key={kind}
              onClick={() => setSendKind(kind)}
              style={{
                padding: "9px 12px", borderRadius: 12, cursor: "pointer",
                border: `1px solid ${sendKind === kind ? m.accent : m.cardAltBorder}`,
                background: sendKind === kind ? m.accent : m.card,
                color: sendKind === kind ? m.onAccent : m.text,
                fontSize: 12.5, fontWeight: 700, fontFamily: "inherit",
              }}
            >{label}</button>
          ))}
        </div>
        <label style={{
          display: "block", marginTop: 12, padding: 12, borderRadius: 12,
          background: m.cardAlt, color: m.text, textAlign: "center",
          fontWeight: 800, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit",
        }}>
          {busyId === 0 ? "Отправляем…" : "Сделать фото на камеру"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={e => sendOwn(e.target.files?.[0])}
          />
        </label>
      </div>

      {items === null && <p style={{ marginTop: 14, fontSize: 13, color: m.sub }}>Загружаем проверки…</p>}

      {items && items.length === 0 && (
        <div style={{
          marginTop: 12, padding: 22, borderRadius: 18, background: m.card,
          border: `1px solid ${m.cardAltBorder}`, textAlign: "center",
        }}>
          <strong style={{ fontSize: 15, color: m.text }}>Проверок пока нет</strong>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: m.sub }}>
            Если оператор запросит фото, оно появится здесь.
          </p>
        </div>
      )}

      {items && items.map(item => (
        <div key={item.id} style={{
          marginTop: 12, padding: 16, borderRadius: 18,
          background: m.card, border: `1px solid ${m.cardAltBorder}`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <strong style={{ fontSize: 15, color: m.text }}>
              {item.title || PHOTO_KIND_LABELS[item.kind] || "Фото"}
            </strong>
            <span style={{
              flexShrink: 0, fontSize: 11.5, fontWeight: 700,
              color: item.status === "rejected" ? m.danger : item.status === "approved" ? m.link : m.sub,
              padding: "4px 9px", borderRadius: 999, background: m.cardAlt,
            }}>{PHOTO_STATUS_RU[item.status] || item.status}</span>
          </div>

          {item.comment && (
            <p style={{ margin: "8px 0 0", fontSize: 13, color: m.sub, lineHeight: 1.45 }}>
              {item.comment}
            </p>
          )}

          {item.decision_comment && (
            <p style={{
              margin: "8px 0 0", fontSize: 13,
              color: item.status === "rejected" ? m.danger : m.link, lineHeight: 1.45,
            }}>
              Модератор: {item.decision_comment}
            </p>
          )}

          {item.photo_url && (
            <img
              src={item.photo_url}
              alt=""
              style={{
                marginTop: 12, width: "100%", maxHeight: 220, objectFit: "cover",
                borderRadius: 12, display: "block",
              }}
            />
          )}

          {item.status === "requested" && (
            <label style={{
              display: "block", marginTop: 12, padding: 12, borderRadius: 12,
              background: m.cardAlt, color: m.text, textAlign: "center",
              fontWeight: 800, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit",
            }}>
              {busyId === item.id ? "Отправляем…" : "Сделать фото на камеру"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={e => answer(item.id, e.target.files?.[0])}
              />
            </label>
          )}
        </div>
      ))}

      {error && <p style={{ marginTop: 12, color: m.danger, fontSize: 13 }}>{error}</p>}
    </div>
  );
}

// Информация: договоры и юридические сведения
function ExecutorVehiclePage({ me, t, m, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [mileage, setMileage] = useState("");
  const [savingMileage, setSavingMileage] = useState(false);
  const [form, setForm] = useState({ title: "", note: "", done_at: "", done_mileage: "", interval_km: "" });
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const res = await api(`/executors/${me.id}/vehicle`);
      setData(res);
      setMileage(res?.vehicle?.mileage != null ? String(res.vehicle.mileage) : "");
    } catch (e) {
      setError(e.message || "Не удалось загрузить транспорт");
    }
  }

  useEffect(() => { load(); }, [me.id]);

  async function saveMileage() {
    setSavingMileage(true);
    setError("");
    try {
      await api(`/executors/${me.id}/vehicle/mileage`, {
        method: "PUT",
        body: { mileage: Number(mileage || 0) },
      });
      await load();
    } catch (e) {
      setError(e.message || "Не удалось сохранить пробег");
    } finally {
      setSavingMileage(false);
    }
  }

  async function addWork() {
    if (!String(form.title || "").trim()) {
      setError("Укажите название работы");
      return;
    }
    setAdding(true);
    setError("");
    try {
      await api(`/executors/${me.id}/maintenance`, {
        method: "POST",
        body: {
          title: form.title,
          note: form.note || null,
          done_at: form.done_at ? new Date(form.done_at).toISOString() : null,
          done_mileage: Number(form.done_mileage || 0),
          interval_km: Number(form.interval_km || 0),
        },
      });
      setForm({ title: "", note: "", done_at: "", done_mileage: "", interval_km: "" });
      await load();
    } catch (e) {
      setError(e.message || "Не удалось добавить работу");
    } finally {
      setAdding(false);
    }
  }

  async function removeWork(id) {
    try {
      await api(`/executors/${me.id}/maintenance/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e.message || "Не удалось удалить запись");
    }
  }

  const v = data?.vehicle;
  const items = Array.isArray(data?.maintenance) ? data.maintenance : [];
  const dueCount = Number(data?.maintenance_due_count || 0);
  // Стандартные работы ТО: выбираются из списка, своё название
  // можно вписать вручную (поле остаётся свободным)
  const WORK_TYPES = [
    "Замена моторного масла",
    "Замена воздушного фильтра",
    "Замена свечей зажигания",
    "Замена тормозных колодок",
    "Замена масла в трансмиссии",
    "Замена ремня или цепи ГРМ",
  ];
  const inputStyle = {
    width: "100%", padding: "11px 12px", borderRadius: 12,
    border: `1px solid ${m.cardAltBorder}`,
    background: m.cardAlt, color: m.text, fontSize: 14,
    fontFamily: "inherit", boxSizing: "border-box",
  };

  return (
    <div style={{ padding: "14px 16px 30px", background: m.bg, minHeight: "100dvh" }}>
      <SubPageHeader m={m} title="Транспорт" onBack={onBack} />

      {data?.reminder && (
        <div style={{
          marginBottom: 12, padding: 12, borderRadius: 14,
          background: t.accentSoft, color: t.accent, fontSize: 13, fontWeight: 700,
        }}>{data.reminder}</div>
      )}

      {/* Карточка авто — заполняет администратор/оператор */}
      <div style={{
        padding: 16, borderRadius: 18, background: m.card, border: `1px solid ${m.cardAltBorder}`,
      }}>
        <strong style={{ fontSize: 14, color: m.text }}>Автомобиль</strong>
        {!v ? (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: m.sub, lineHeight: 1.5 }}>
            Транспорт не оформлен. Данные автомобиля заполняет администратор при регистрации.
          </p>
        ) : (
          <>
            <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800, color: m.text }}>
              {[v.brand, v.model].filter(Boolean).join(" ") || "Марка не указана"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {v.plate && (
                <span style={{
                  padding: "6px 12px", borderRadius: 10, background: m.cardAlt,
                  border: `1px solid ${m.cardAltBorder}`, color: m.text,
                  fontSize: 15, fontWeight: 900, letterSpacing: 1,
                }}>{v.plate}</span>
              )}
              {v.color && <span style={{ fontSize: 13, color: m.sub, alignSelf: "center" }}>{v.color}</span>}
              {v.year ? <span style={{ fontSize: 13, color: m.sub, alignSelf: "center" }}>{v.year} г.в.</span> : null}
              {v.seats ? <span style={{ fontSize: 13, color: m.sub, alignSelf: "center" }}>{v.seats} мест</span> : null}
              <span style={{
                marginLeft: "auto", alignSelf: "center",
                display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3,
              }}>
                {/* Значок проверки над подписью: зелёная галочка — проверен,
                    красный прочерк — ещё на проверке */}
                <span style={{
                  fontSize: 16, fontWeight: 900, lineHeight: 1,
                  color: v.approved ? t.success : t.danger,
                }}>{v.approved ? "✓" : "—"}</span>
                <span style={{
                  fontSize: 11.5, fontWeight: 800,
                  color: v.approved ? t.success : m.sub,
                }}>{v.approved ? "Проверен" : "На проверке"}</span>
              </span>
            </div>

            {/* Текущий пробег — по нему считается срок работ по ТО */}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="Текущий пробег, км"
                value={mileage}
                onChange={e => setMileage(e.target.value)}
                style={inputStyle}
              />
              <button
                onClick={saveMileage}
                disabled={savingMileage}
                style={{
                  padding: "0 14px", borderRadius: 12, border: 0, cursor: "pointer",
                  background: t.accent, color: t.onAccent, fontWeight: 800,
                  fontSize: 12.5, fontFamily: "inherit", flexShrink: 0,
                }}
              >{savingMileage ? "…" : "Сохранить"}</button>
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 12, color: m.sub, lineHeight: 1.45 }}>
              По пробегу система следит, какие работы по ТО пора повторить.
            </p>
          </>
        )}
      </div>

      {/* Техобслуживание: работы с пробегом и интервалом повтора */}
      <div style={{
        marginTop: 12, padding: 16, borderRadius: 18, background: m.card,
        border: `1px solid ${m.cardAltBorder}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <strong style={{ fontSize: 14, color: m.text }}>Техобслуживание</strong>
          {dueCount > 0 && (
            <span style={{
              padding: "4px 10px", borderRadius: 999, background: t.dangerSoft,
              color: t.danger, fontSize: 11.5, fontWeight: 800,
            }}>{dueCount} пора повторить</span>
          )}
        </div>

        {items.length === 0 ? (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: m.sub, lineHeight: 1.5 }}>
            Внесите работы по обслуживанию: замена масла, колодки и т.п. —
            с пробегом на момент выполнения и интервалом повтора.
          </p>
        ) : items.map(item => (
          <div key={item.id} style={{
            marginTop: 10, padding: 12, borderRadius: 14,
            background: item.due ? t.dangerSoft : m.cardAlt,
            border: `1px solid ${item.due ? t.danger : "transparent"}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ fontSize: 13.5, color: m.text }}>{item.title}</strong>
              <button
                onClick={() => removeWork(item.id)}
                aria-label="Удалить"
                style={{
                  border: 0, background: "transparent", color: m.sub, cursor: "pointer",
                  fontSize: 16, lineHeight: 1, padding: 0, fontFamily: "inherit",
                }}
              >✕</button>
            </div>
            <div style={{ fontSize: 12, color: m.sub, marginTop: 4, lineHeight: 1.45 }}>
              {item.done_at ? `Выполнено: ${new Date(item.done_at).toLocaleDateString("ru-RU")} · ` : ""}
              пробег {Number(item.done_mileage || 0).toLocaleString("ru-RU")} км
              {item.interval_km > 0 ? ` · повторять каждые ${Number(item.interval_km).toLocaleString("ru-RU")} км` : ""}
            </div>
            {item.due && (
              <div style={{ fontSize: 12, fontWeight: 800, color: t.danger, marginTop: 4 }}>
                Пора повторить — отметка {Number(item.due_at_mileage).toLocaleString("ru-RU")} км пройдена
              </div>
            )}
            {item.note && (
              <div style={{ fontSize: 12, color: m.sub, marginTop: 4 }}>{item.note}</div>
            )}
          </div>
        ))}

        {/* Добавление работы самим исполнителем */}
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            list="maintenance-work-types"
            placeholder="Название работы: выберите из списка или впишите своё"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            style={inputStyle}
          />
          <datalist id="maintenance-work-types">
            {WORK_TYPES.map(w => <option key={w} value={w} />)}
          </datalist>
          <input
            placeholder="Заметка: сервис, детали (необязательно)"
            value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="date"
              value={form.done_at}
              onChange={e => setForm(f => ({ ...f, done_at: e.target.value }))}
              style={inputStyle}
            />
            <input
              type="number"
              inputMode="numeric"
              min="0"
              placeholder="Пробег, км"
              value={form.done_mileage}
              onChange={e => setForm(f => ({ ...f, done_mileage: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="Повторять через, км (0 — без повтора)"
            value={form.interval_km}
            onChange={e => setForm(f => ({ ...f, interval_km: e.target.value }))}
            style={inputStyle}
          />
          <button
            onClick={addWork}
            disabled={adding}
            style={{
              padding: 13, borderRadius: 12, border: 0, cursor: "pointer",
              background: t.accent, color: t.onAccent, fontWeight: 800,
              fontSize: 13.5, fontFamily: "inherit",
            }}
          >{adding ? "Добавляем…" : "Добавить работу"}</button>
        </div>
      </div>

      {error && (
        <div style={{
          marginTop: 12, padding: 12, borderRadius: 12,
          background: t.dangerSoft, color: t.danger, fontSize: 13, fontWeight: 700,
        }}>{error}</div>
      )}
    </div>
  );
}

function ExecutorInfoPage({ t, m, onBack }) {
  const docs = [
    ["Оферта исполнителя", "Условия работы, порядок приёма и выполнения заказов, размер комиссии."],
    ["Политика конфиденциальности", "Как обрабатываются персональные данные клиентов и исполнителей."],
    ["Согласие на обработку данных", "Разрешение на обработку персональных данных при регистрации."],
    ["Правила фото-контроля", "Когда и какие документы нужно предъявить для проверки."],
    ["Реквизиты и контакты", "ИНН, расчётный счёт, адрес и контакты сервиса «Про»."],
  ];

  return (
    <div style={{ padding: "14px 16px 30px", background: m.bg, minHeight: "100dvh" }}>
      <SubPageHeader m={m} title="Информация" onBack={onBack} />

      <div style={{ background: m.card, borderRadius: 16, overflow: "hidden" }}>
        {docs.map(([title, text], i) => (
          <div key={title} style={{ padding: 16, borderBottom: i < docs.length - 1 ? `1px solid ${m.cardAltBorder}` : "none" }}>
            <strong style={{ display: "block", fontSize: 14.5, color: m.text }}>{title}</strong>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: m.sub, lineHeight: 1.5 }}>{text}</p>
          </div>
        ))}
      </div>

      <p style={{ margin: "16px 2px 0", fontSize: 12, color: m.sub, lineHeight: 1.6 }}>
        Документы доступны в приложении MAX. Актуальные версии всегда размещены в разделе
        «Информация» — при расхождении с приложением действует редакция из приложения.
      </p>
    </div>
  );
}

// ---------- Контроль рабочего времени ----------
function formatMinutes(minutes) {
  const m = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h && rest) return `${h} ч ${rest} мин`;
  if (h) return `${h} ч`;
  return `${rest} мин`;
}

function WorkTimeCard({ work, t }) {
  // Живой обратный отсчёт: тикаем локально, не дожидаясь опроса работы (60 с)
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const it = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(it);
  }, []);

  if (!work) return null;

  const limit = work.limit_minutes || 720;
  const worked = work.worked_minutes || 0;
  const remaining = work.remaining_minutes || 0;
  const progress = Math.min(100, Math.round((worked / limit) * 100));
  const blocked = work.status === "blocked";
  const warning = work.status === "warning";
  const resting = work.status === "resting";

  const accent = blocked ? t.danger : warning ? t.amber : t.accent;
  const softBg = blocked ? t.dangerSoft : warning ? t.amberSoft : t.accentSoft;

  // Правила смены: работа до 12 ч, после смены — отдых 6 ч.
  // Конец отсчёта: у открытой смены — started_at + лимит, у отдыха — rest_until.
  const endsAt = resting && work.rest_until
    ? new Date(work.rest_until).getTime()
    : !resting && work.started_at
      ? new Date(work.started_at).getTime() + limit * 60000
      : null;
  const leftMinutes = endsAt ? Math.max(0, (endsAt - tick) / 60000) : 0;
  const leftLabel = formatMinutes(leftMinutes);
  const endsLabel = endsAt
    ? new Date(endsAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : null;

  let title = "Рабочее время";
  let note = `До ограничения доступа к заказам осталось ${formatMinutes(remaining)}`;

  if (blocked) {
    title = "Доступ к заказам ограничен";
    note = `Лимит рабочего времени (12 часов) исчерпан${endsLabel ? ` — до ${endsLabel}` : ""}. Новые заказы не поступают, нужен отдых 6 часов.`;
  } else if (warning) {
    title = "Скоро доступ к заказам ограничат";
    note = `Осталось ${leftLabel}${endsLabel ? ` (до ${endsLabel})` : ""} — после этого новые заказы не поступят.`;
  } else if (resting) {
    title = "Отдых";
    note = work.rest_until
      ? `После смены нужен отдых 6 часов. Вернёмся к заказам в ${new Date(work.rest_until).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} — через ${leftLabel}.`
      : "После смены нужен отдых 6 часов.";
  } else if (worked > 0) {
    note = `Отработано ${formatMinutes(worked)} из 12 ч. До ограничения — ${leftLabel}${endsLabel ? ` (до ${endsLabel})` : ""}.`;
  } else {
    note = "Отсчёт начнётся с первого принятого заказа. Лимит — 12 часов.";
  }

  return (
    <div style={{
      marginTop: 14, padding: 16, borderRadius: 18,
      background: t.card, border: `1px solid ${t.border}`,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 800, color: t.sub }}>
          <Icon name="trend" size={15} style={{ color: accent }} />
          {title}
        </span>
        {endsAt ? (
          /* Обратный отсчёт: до конца смены / до конца отдыха */
          <span style={{ fontSize: 12.5, fontWeight: 800, color: accent }}>
            {resting ? `через ${leftLabel}` : endsLabel}
          </span>
        ) : worked > 0 ? (
          <span style={{ fontSize: 12.5, fontWeight: 800, color: accent }}>
            {formatMinutes(worked)} / 12 ч
          </span>
        ) : null}
      </div>

      {worked > 0 && !resting && (
        <div style={{ height: 6, borderRadius: 999, background: softBg, overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, height: "100%", background: accent, borderRadius: 999 }} />
        </div>
      )}

      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: blocked || warning ? accent : t.sub }}>
        {note}
      </p>
    </div>
  );
}

// ---------- Чат с клиентом по активному заказу ----------
function ExecutorChat({ orderId, executorId, t, s }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const chatRef = useRef(null);

  async function load() {
    try {
      const res = await api(`/orders/${orderId}/messages`);
      setMessages(Array.isArray(res) ? res : []);
    } catch (e) {}
  }

  useEffect(() => {
    load();
    const it = setInterval(load, 5000);
    return () => clearInterval(it);
  }, [orderId]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages.length]);

  async function send() {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      await api(`/orders/${orderId}/messages`, {
        method: "POST",
        body: { text: value, executor_id: executorId },
      });
      setText("");
      await load();
    } catch (e) {
      // не отправлено
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <strong style={{ display: "block", fontSize: 13.5, color: t.sub, marginBottom: 8 }}>
        Чат с клиентом
      </strong>
      <div
        ref={chatRef}
        style={{
          maxHeight: 200, overflowY: "auto", padding: 12, borderRadius: 16,
          background: t.card, border: `1px solid ${t.border}`,
          display: "flex", flexDirection: "column", gap: 8,
        }}
      >
        {messages.length === 0 && (
          <p style={{ margin: 0, fontSize: 12.5, color: t.sub, textAlign: "center" }}>
            Сообщений пока нет — напишите клиенту.
          </p>
        )}
        {messages.map(msg => {
          const mine = msg.author_role === "executor";
          return (
            <div
              key={msg.id}
              style={{
                alignSelf: mine ? "flex-end" : "flex-start",
                maxWidth: "82%",
                padding: "9px 12px", borderRadius: 14,
                background: mine ? t.accent : t.inputBg,
                color: mine ? t.onAccent : t.text,
                fontSize: 13, lineHeight: 1.35, wordBreak: "break-word",
              }}
            >{msg.text}</div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") send(); }}
          placeholder="Сообщение клиенту…"
          style={{
            flex: 1, minWidth: 0, padding: "12px 14px", borderRadius: 12,
            border: `1px solid ${t.border}`, background: t.inputBg, color: t.text,
            fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
          }}
        />
        <button
          onClick={send}
          disabled={!text.trim() || sending}
          style={{
            padding: "12px 16px", borderRadius: 12, border: 0,
            background: text.trim() ? t.accent : t.inputBg,
            color: text.trim() ? t.onAccent : t.sub,
            fontWeight: 850, cursor: text.trim() ? "pointer" : "default",
            fontFamily: "inherit", fontSize: 13.5,
          }}
        >Отправить</button>
      </div>
    </div>
  );
}

// ---------- Уведомления исполнителя ----------
function ExecutorNotificationsPage({ me, t, m, onBack }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await api(`/executors/${me.id}/notifications`);
      setItems(Array.isArray(res?.notifications) ? res.notifications : []);
    } catch (e) {
      setError(e.message || "Не удалось загрузить уведомления");
      setItems([]);
    }
  }

  useEffect(() => {
    load();
    // при открытии экрана отмечаем всё прочитанным
    api(`/executors/${me.id}/notifications/read-all`, { method: "PUT" }).catch(() => {});
    const it = setInterval(load, 20000);
    return () => clearInterval(it);
  }, [me.id]);

  return (
    <div style={{ padding: "14px 16px 30px", background: m.bg, minHeight: "100dvh" }}>
      <SubPageHeader m={m} title="Уведомления" onBack={onBack} />

      {items === null && <p style={{ fontSize: 13, color: m.sub }}>Загружаем уведомления…</p>}

      {items && items.length === 0 && (
        <div style={{
          padding: 22, borderRadius: 18, background: m.card,
          border: `1px solid ${m.cardAltBorder}`, textAlign: "center",
        }}>
          <strong style={{ fontSize: 15, color: m.text }}>Уведомлений пока нет</strong>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: m.sub }}>
            Сюда приходят сообщения от администратора и сервисные уведомления.
          </p>
        </div>
      )}

      {items && items.map(n => (
        <div key={n.id} style={{
          marginTop: 12, padding: 16, borderRadius: 18,
          background: m.card, border: `1px solid ${m.cardAltBorder}`,
          borderLeft: `3px solid ${n.is_read ? "transparent" : m.accent}`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <strong style={{ fontSize: 14.5, color: m.text }}>{n.title}</strong>
            {!n.is_read && (
              <span style={{
                flexShrink: 0, width: 8, height: 8, borderRadius: "50%",
                background: m.accent, marginTop: 6,
              }} />
            )}
          </div>
          {n.body && (
            <p style={{ margin: "6px 0 0", fontSize: 13, color: m.sub, lineHeight: 1.45 }}>{n.body}</p>
          )}
          {n.created_at && (
            <p style={{ margin: "6px 0 0", fontSize: 11.5, color: m.sub }}>
              {new Date(n.created_at).toLocaleString("ru-RU")}
            </p>
          )}
        </div>
      ))}

      {error && <p style={{ marginTop: 12, color: m.danger, fontSize: 13 }}>{error}</p>}
    </div>
  );
}

// ---------- Переписка с оператором ----------
// ---------- Подробности заказа по клику: инфо + трекинг на карте ----------
// Карта ограничена Краснодарским краем — масштабируется только вниз.
function ExecutorOrderDetail({ t, orderId, onClose }) {
  const [order, setOrder] = useState(null);
  const [track, setTrack] = useState(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const [oRes, tRes] = await Promise.allSettled([
        api(`/orders/${orderId}`),
        api(`/orders/${orderId}/track`),
      ]);
      if (!alive) return;
      if (oRes.status === "fulfilled") setOrder(oRes.value);
      if (tRes.status === "fulfilled") setTrack(tRes.value);
    }
    load();
    // Активный заказ трекаем живьём, завершённый/отменённый — один раз
    const active = ["created", "assigned", "accepted", "in_progress"].includes(order?.status);
    const it = active ? setInterval(load, 5000) : null;
    return () => { alive = false; if (it) clearInterval(it); };
  }, [orderId, order?.status]);

  const status = order?.status || "created";
  const executor = track?.executor;
  const from = track && track.from_lat != null ? { lat: track.from_lat, lon: track.from_lon } : null;
  const to = track && track.to_lat != null ? { lat: track.to_lat, lon: track.to_lon } : null;
  const statusColor = status === "cancelled" ? t.danger : status === "completed" ? t.success : t.accent;

  const rowStyle = {
    display: "flex", justifyContent: "space-between", gap: 10,
    padding: "9px 0", borderTop: `1px solid ${t.border}`, fontSize: 13,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.45)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480, maxHeight: "90dvh", overflowY: "auto",
          background: t.bg, borderRadius: "20px 20px 0 0",
          padding: "10px 16px 26px", boxSizing: "border-box",
        }}
      >
        <div style={{ width: 42, height: 4, borderRadius: 999, background: t.border, margin: "2px auto 10px" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <strong style={{ fontSize: 17, color: t.text }}>Заказ №{orderId}</strong>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            style={{
              width: 32, height: 32, borderRadius: 10, border: 0, cursor: "pointer",
              background: t.card, color: t.sub, fontSize: 17, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >×</button>
        </div>

        {/* Крупный статус и основная информация */}
        <div style={{ padding: 16, borderRadius: 18, background: t.card, border: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: statusColor, letterSpacing: -0.3 }}>
            {STATUS_RU[status] || status}
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: t.text, marginTop: 6 }}>
            {order?.total_price != null ? `${order.total_price} ₽` : "—"}
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 14, color: t.text, lineHeight: 1.4 }}>
            {track?.from_address || order?.from_address} → {track?.to_address || order?.to_address}
          </p>
          {track?.comment && (
            <p style={{ margin: "8px 0 0", fontSize: 12.5, color: t.sub, lineHeight: 1.4 }}>
              Комментарий: {track.comment}
            </p>
          )}

          {order?.created_at && (
            <div style={{ ...rowStyle, borderTop: "none", marginTop: 8 }}>
              <span style={{ color: t.sub }}>Создан</span>
              <span style={{ color: t.text }}>
                {new Date(order.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          )}
          {order?.completed_at && (
            <div style={rowStyle}>
              <span style={{ color: t.sub }}>Завершён</span>
              <span style={{ color: t.text }}>
                {new Date(order.completed_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          )}
        </div>

        {/* Трекинг: карта Краснодарского края — только уменьшение масштаба */}
        {(from || to || executor) && (
          <div style={{ marginTop: 12 }}>
            <React.Suspense fallback={
              <div style={{ height: 240, borderRadius: 14, background: t.card, border: `1px solid ${t.border}` }} />
            }>
              <TrackMap from={from} to={to} executor={executor} t={t} height={240} />
            </React.Suspense>
          </div>
        )}
      </div>
    </div>
  );
}

function ExecutorSupportPage({ me, t, m, onBack }) {
  const [items, setItems] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const chatRef = useRef(null);

  async function load() {
    try {
      const res = await api("/messages");
      // Служебные сообщения (author_role=system) живут на вкладке Дашборд
      const list = Array.isArray(res?.messages) ? res.messages : [];
      setItems(list.filter(msg => msg.author_role !== "system"));
    } catch (e) {
      setError(e.message || "Не удалось загрузить переписку");
      setItems([]);
    }
  }

  useEffect(() => {
    load();
    const it = setInterval(load, 10000);
    return () => clearInterval(it);
  }, [me.id]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [items && items.length]);

  async function send() {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      await api("/messages", { method: "POST", body: { text: value } });
      setText("");
      await load();
    } catch (e) {
      setError(e.message || "Не удалось отправить сообщение");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ padding: "14px 16px 30px", background: m.bg, minHeight: "100dvh" }}>
      <SubPageHeader m={m} title="Поддержка" onBack={onBack} />

      <p style={{ margin: "0 0 12px", fontSize: 13, color: m.sub, lineHeight: 1.5 }}>
        Напишите оператору — ответ придёт сюда и в MAX. Служебные сообщения — на вкладке Профиль → Дашборд.
      </p>

      <div
        ref={chatRef}
        style={{
          maxHeight: 320, overflowY: "auto", padding: 12, borderRadius: 16,
          background: m.card, border: `1px solid ${m.cardAltBorder}`,
          display: "flex", flexDirection: "column", gap: 8,
        }}
      >
        {items === null && (
          <p style={{ margin: 0, fontSize: 12.5, color: m.sub, textAlign: "center" }}>Загружаем переписку…</p>
        )}
        {items && items.length === 0 && (
          <p style={{ margin: 0, fontSize: 12.5, color: m.sub, textAlign: "center" }}>
            Сообщений пока нет — напишите первым.
          </p>
        )}
        {items && items.map(msg => {
          const mine = msg.author_role === "executor";
          return (
            <div
              key={msg.id}
              style={{
                alignSelf: mine ? "flex-end" : "flex-start",
                maxWidth: "84%",
                padding: "9px 12px", borderRadius: 14,
                background: mine ? m.accent : m.inputBg,
                color: mine ? m.onAccent : m.text,
                fontSize: 13, lineHeight: 1.4, wordBreak: "break-word",
              }}
            >
              {msg.text}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") send(); }}
          placeholder="Сообщение оператору…"
          style={{
            flex: 1, minWidth: 0, padding: "12px 14px", borderRadius: 12,
            border: `1px solid ${m.cardAltBorder}`, background: m.card, color: m.text,
            fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
          }}
        />
        <button
          onClick={send}
          disabled={!text.trim() || sending}
          style={{
            padding: "12px 16px", borderRadius: 12, border: 0,
            background: text.trim() ? m.accent : m.cardAlt,
            color: text.trim() ? m.onAccent : m.sub,
            fontWeight: 850, cursor: text.trim() ? "pointer" : "default",
            fontFamily: "inherit", fontSize: 13.5, flexShrink: 0,
          }}
        >Отправить</button>
      </div>

      {error && <p style={{ marginTop: 12, color: m.danger, fontSize: 13 }}>{error}</p>}
    </div>
  );
}

function ProfileExecutor({ me, t, setting, choose, activeRole, earnings, unread, vehicleDue, work, onStats, onNotifications, onPhotoChecks, onVehicle, onInfo, onSupport }) {
  const m = maxPalette(t.mode);
  const [tab, setTab] = useState("profile");
  const maxUser = readMaxUser();
  const name = maxUser?.first_name || maxUser?.username || me.name || me.max_id || "Исполнитель";
  const initials = (name || "И")
    .split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const photo = maxUser?.photo_url || null;
  const phone = formatPhone(me.phone || maxUser?.phone_number || maxUser?.phone);
  const maxId = maxUser?.id || me.max_id || null;
  const STATUS_RU2 = { approved: "Пройдена", pending: "На проверке", rejected: "Отклонён" };

  const themeCycle = () => {
    const order = ["light", "dark", "system"];
    choose(order[(order.indexOf(setting) + 1) % order.length]);
  };
  const THEME_RU = { light: "Светлая", dark: "Тёмная", system: "Системная" };

  async function invite() {
    // Нативная ссылка MAX: открывает бота-исполнителя прямо в мессенджере
    // (прямые ссылки на procityservice.ru в браузере гейт не пускает).
    // В share ссылка передаётся отдельным полем — в тексте её не дублируем,
    // иначе в чате вылезает два одинаковых адреса.
    const url = "https://max.ru/se14320724_1_bot?startapp";
    const text = "«Про» — сервисы города: такси, курьер, грузовое, мастера и работа. Попробуй!";
    try {
      const wb = window.Max?.WebApp || window.Max || window.WebApp || window.Telegram?.WebApp;
      if (wb?.share) {
        await wb.share({ text, url });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: "Про", text, url });
        return;
      }
      await navigator.clipboard.writeText(text + " " + url);
      alert("Скопировано в буфер обмена");
    } catch (e) {
      // отменили системное окно — это нормально
    }
  }

  return (
    <div style={{ margin: "0 -16px", padding: "12px 16px 40px", background: m.bg }}>
      {/* Шапка по центру: аватар, имя, синий телефон — как в MAX */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "6px 0 8px", maxWidth: "100%", overflow: "hidden",
      }}>
        {photo ? (
          <img
            src={photo}
            alt=""
            referrerPolicy="no-referrer"
            style={{
              width: 96, height: 96, borderRadius: "50%", objectFit: "cover",
              background: m.avatarBg, border: `2px solid ${m.card}`,
            }}
          />
        ) : (
          <span style={{
            width: 96, height: 96, borderRadius: "50%", background: m.avatarBg,
            color: m.text, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 30, fontWeight: 800, letterSpacing: 1,
          }}>{initials}</span>
        )}
        <strong style={{
          margin: "14px 0 4px", fontSize: 23, color: m.text, letterSpacing: -0.4,
          maxWidth: "100%", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>{name}</strong>
      </div>

      {/* Вкладки: Профиль и Дашборд (смена, статистика, служебные сообщения) */}
      <div style={{
        display: "flex", gap: 4, padding: 4, borderRadius: 14,
        background: m.cardAlt, marginBottom: 12,
      }}>
        {[["profile", "Профиль"], ["dashboard", "Дашборд"]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 11, border: 0, cursor: "pointer",
              background: tab === id ? m.card : "transparent",
              color: tab === id ? m.text : m.sub,
              fontSize: 13, fontWeight: 800, fontFamily: "inherit",
            }}
          >{label}</button>
        ))}
      </div>

      {/* Отстранение от заказов: низкий рейтинг или решение администратора */}
      {me.suspension && (
        <div style={{
          marginBottom: 12, padding: 14, borderRadius: 16,
          background: t.dangerSoft, color: t.danger, fontSize: 13, lineHeight: 1.45,
        }}>
          <strong style={{ display: "block", marginBottom: 2 }}>
            Вы временно отстранены от заказов
          </strong>
          До {new Date(me.suspension.ends_at).toLocaleString("ru-RU")}. {me.suspension.reason}
        </div>
      )}

      {tab === "profile" && (
        <>
      <MaxGroup m={m}>
        <MaxRow m={m} icon={<Icon name="id" size={20} />} label="ID" value={maxId ?? "—"} />
        <MaxRow m={m} icon={<Icon name="star" size={20} />} label="Рейтинг"
          value={<RatingBattery value={me.rating_percent ?? 100} w={40} />} />
        <MaxRow m={m} icon={<Icon name="taxi" size={20} />} label="Транспорт"
          badge={vehicleDue}
          onClick={onVehicle} />
        <MaxRow m={m} icon={<Icon name="shield" size={20} />} label="Верификация"
          value={STATUS_RU2[me.status] || "На проверке"} />
      </MaxGroup>

      {/* Текущая роль — только информация, смена роли убрана */}
      <MaxGroup m={m}>
        <MaxRow m={m} icon={<Icon name="truck" size={20} />} label="Текущая роль"
          value={ROLE_NAMES[activeRole] || "Не выбрана"} />
      </MaxGroup>

      {/* Сиреневая строка-приглашение — аналогично «Пригласить друзей» в MAX */}
      <MaxGroup m={m}>
        <MaxRow m={m} icon={<Icon name="link" size={20} />} label="Пригласить друзей" onClick={invite} accent />
      </MaxGroup>

      {/* Баланс — отдельный блок, ведёт в статистику заработка и пополнений */}
      <button onClick={onStats} style={{
        display: "block", width: "100%", marginTop: 12, textAlign: "left",
        padding: "18px", borderRadius: 18, border: 0, cursor: "pointer",
        background: m.cardAlt,
        color: m.text, fontFamily: "inherit",
        border: `1px solid ${m.cardAltBorder}`,
      }}>
        <span style={{
          display: "flex", alignItems: "center", gap: 10,
          fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
          textTransform: "uppercase", color: m.sub,
        }}>
          <Icon name="wallet" size={15} /> Баланс
        </span>
        <span style={{
          display: "flex", alignItems: "baseline", justifyContent: "space-between",
          marginTop: 8, gap: 10,
        }}>
          <strong style={{ fontSize: 30, fontWeight: 900, letterSpacing: -0.8 }}>
            {Number(me.balance || 0).toLocaleString("ru-RU")} ₽
          </strong>
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: m.sub, fontSize: 13, fontWeight: 700 }}>
            Статистика
            <Icon name="chevronRight" size={14} style={{ color: m.chevron }} />
          </span>
        </span>
      </button>

      <MaxGroup m={m}>
        <MaxRow m={m} icon={<Icon name="bell" size={20} />} label="Уведомления"
          badge={unread}
          onClick={onNotifications} />
        <MaxRow m={m} icon={<Icon name="camera" size={20} />} label="Фотоконтроль" onClick={onPhotoChecks} />
        <MaxRow m={m} icon={<Icon name="doc" size={20} />} label="Информация" onClick={onInfo} />
        <MaxRow m={m} icon={<Icon name="support" size={20} />} label="Поддержка" onClick={onSupport} />
      </MaxGroup>

      <MaxGroup m={m}>
        <MaxRow
          m={m}
          icon={<Icon name={setting === "dark" ? "moon" : setting === "system" ? "monitor" : "sun"} size={20} />}
          label="Тема оформления"
          value={THEME_RU[setting] || "Системная"}
          onClick={themeCycle}
        />
      </MaxGroup>
        </>
      )}

      {tab === "dashboard" && (
        <ExecutorDashboard me={me} t={t} work={work} earnings={earnings} activeRole={activeRole} />
      )}
    </div>
  );
}

// ---------- Дашборд: смена с обратным отсчётом, статистика, служебное ----------
function ExecutorDashboard({ me, t, work, earnings, activeRole }) {
  const s = makeStyles(t);
  const [sys, setSys] = useState(null);

  // Служебные сообщения (раньше висели в чате поддержки) — живём своим списком
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await api("/messages");
        const list = Array.isArray(res?.messages) ? res.messages : [];
        if (alive) setSys(list.filter(msg => msg.author_role === "system"));
      } catch (e) {
        if (alive) setSys([]);
      }
    }
    load();
    const it = setInterval(load, 15000);
    return () => { alive = false; clearInterval(it); };
  }, [me.id]);

  return (
    <>
      {/* Смена: лимит 12 ч, предупреждение за 2 ч, отдых 6 ч — с обратным отсчётом */}
      <WorkTimeCard work={work} t={t} />

      {/* Сетка статов 2×2 — с главной страницы */}
      <div style={s.statsGrid}>
        <div style={s.statBig}>
          <span style={s.statLabel}>Баланс</span>
          <strong style={s.statMoney}>{Number(me.balance || 0).toLocaleString("ru-RU")} ₽</strong>
          <span style={s.statNote}>наличные через оператора</span>
        </div>
        <div style={s.statSmall}>
          <span style={s.statLabel}>
            <Icon name="trend" size={12} style={{ display: "inline" }} /> Заработок 7 дней
          </span>
          <strong style={s.statValue(earnings && earnings.total > 0)}>
            {earnings ? `${Number(earnings.total).toLocaleString("ru-RU")} ₽` : "—"}
          </strong>
          <span style={s.statNote}>{earnings ? `${earnings.orders_count} заказов` : "\u00A0"}</span>
        </div>
        <div style={s.statSmall}>
          <span style={s.statLabel}>Верификация</span>
          <strong style={s.statValue(me.status === "approved")}>
            {me.status === "approved" ? "Пройдена" : me.status === "rejected" ? "Отклонён" : "На проверке"}
          </strong>
          <span style={s.statNote}>роль: {ROLE_NAMES[activeRole] || "—"}</span>
        </div>
        <div style={s.statSmall}>
          <span style={s.statLabel}>
            <Icon name="star" size={12} style={{ display: "inline" }} /> Рейтинг
          </span>
          <strong style={s.statValue((me.rating_percent ?? 100) >= 60)}>
            <RatingBattery value={me.rating_percent ?? 100} w={44} />
          </strong>
          <span style={s.statNote}>по оценкам за 100 заказов</span>
        </div>
      </div>

      {/* Служебное — системные сообщения, перенесённые из поддержки */}
      <div style={{
        marginTop: 16, padding: 16, borderRadius: 18,
        background: t.card, border: `1px solid ${t.border}`,
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <span style={{
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 12.5, fontWeight: 800, color: t.sub,
        }}>
          <Icon name="doc" size={15} /> Служебное
        </span>
        {sys === null && (
          <p style={{ margin: 0, fontSize: 12.5, color: t.sub }}>Загружаем…</p>
        )}
        {sys !== null && sys.length === 0 && (
          <p style={{ margin: 0, fontSize: 12.5, color: t.sub }}>Пока нет служебных сообщений.</p>
        )}
        {sys !== null && sys.slice(-10).reverse().map((msg, i, arr) => (
          <div
            key={msg.id}
            style={{
              paddingTop: i < arr.length - 1 ? 8 : 0,
              borderTop: i > 0 ? `1px solid ${t.border}` : "none",
            }}
          >
            <span style={{ fontSize: 10.5, fontWeight: 750, color: t.sub }}>
              {msg.created_at
                ? new Date(msg.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                : ""}
            </span>
            <p style={{ margin: "2px 0 0", fontSize: 13, lineHeight: 1.4, color: t.text }}>{msg.text}</p>
          </div>
        ))}
      </div>
    </>
  );
}

const ROLES = [
  { id: "driver", icon: "taxi", hue: "accent", title: "Такси", text: "Стандарт и Межгород" },
  { id: "courier", icon: "package", hue: "green", title: "Курьер", text: "Доставка посылок" },
  { id: "cargo", icon: "truck", hue: "green", title: "Грузоперевозчик", text: "Грузовой транспорт" },
  { id: "master", icon: "wrench", hue: "amber", title: "Мастер", text: "Бытовые и ремонтные услуги" },
  { id: "car_owner", icon: "key", hue: "sky", title: "Арендодатель авто", text: "Сдача автомобилей" },
  { id: "flat_owner", icon: "house", hue: "sky", title: "Арендодатель жилья", text: "Сдача квартир" }
];

const ROLE_NAMES = {
  driver: "Такси",
  courier: "Курьер",
  cargo: "Грузоперевозки",
  master: "Мастер",
  car_owner: "Аренда авто",
  flat_owner: "Аренда жилья"
};

function roleHue(id) {
  const r = ROLES.find(x => x.id === id);
  return r ? r.hue : "accent";
}

const ACCEPT_SECONDS = 15;

const STATUS_RU = {
  created: "Новый",
  assigned: "Назначен вам",
  accepted: "Вы на месте",
  in_progress: "Выполняется",
  completed: "Завершён",
  cancelled: "Отменён",
};

// Подпись сервиса в карточке заказа (для ролей кроме такси)
const SERVICE_LABELS = {
  courier: "Курьерская доставка",
  cargo: "Грузоперевозка",
  master: "Заказ мастера",
};

// Детали входящего заказа: время подачи, грузчики, услуга мастера, комментарий
function orderDetails(o) {
  const lines = [];
  const meta = o?.meta || {};
  if (o?.scheduled_at) {
    const d = new Date(o.scheduled_at);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    lines.push(`Подача: ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")} ${hh}:${mm}`);
  }
  if (Number(meta.loaders || 0) > 0) {
    lines.push(`Грузчики: ${meta.loaders} на ${meta.loader_hours || 1} ч`);
  }
  if (meta.master_title) {
    lines.push(`Услуга: ${meta.master_title}`);
  }
  if (meta.comment) {
    lines.push(`«${meta.comment}»`);
  }
  return lines;
}

const THEME_OPTIONS = [
  { id: "light", icon: "sun", title: "Светлая" },
  { id: "dark", icon: "moon", title: "Тёмная" },
  { id: "system", icon: "monitor", title: "Системная" },
];

export default function App() {
  const { setting, choose, t } = useTheme();

  const [role, setRole] = useState(localStorage.getItem("pro_role") || "");
  // Токен аннулирован на сервере (вход с другого устройства) — экран кика
  const [sessionKick, setSessionKick] = useState(null);
  // Навигация со стеком: кнопка «назад» телефона возвращает предыдущую страницу,
  // а не закрывает миниапп (см. эффект с WebApp.BackButton ниже)
  const [nav, setNav] = React.useState({ page: role ? "home" : "role", stack: [] });
  // Подробная карточка заказа (клик из «Мои») с трекингом на карте
  const [detailOrderId, setDetailOrderId] = React.useState(null);
  const page = nav.page;
  const goPage = (next) => setNav(n => ({ page: next, stack: [...n.stack, n.page] }));
  const backPage = () => setNav(n => (
    n.stack.length ? { page: n.stack[n.stack.length - 1], stack: n.stack.slice(0, -1) } : n
  ));
  const resetPage = (next) => setNav({ page: next, stack: [] });

  // Кнопка «назад» телефона: если есть история — шаг назад, иначе MAX закроет сам
  useEffect(() => {
    const wb = window.WebApp || window.Max?.WebApp || window.Telegram?.WebApp;
    const bb = wb?.BackButton;
    if (!bb) return;
    const handler = () => backPage();
    try { bb.onClick(handler); } catch (e) {}
    return () => { try { bb.offClick?.(handler); } catch (e) {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Стрелка видна только когда есть куда возвращаться
  useEffect(() => {
    const wb = window.WebApp || window.Max?.WebApp || window.Telegram?.WebApp;
    const bb = wb?.BackButton;
    if (!bb) return;
    try {
      if (nav.stack.length > 0) { bb.show && bb.show(); }
      else { bb.hide && bb.hide(); }
    } catch (e) {}
  }, [nav.stack.length, nav.page]);

  // Отладочный хук для e2e-проверок
  useEffect(() => {
    window.__nav = { page, stack: nav.stack, backPage, goPage };
  });
  const [me, setMe] = useState(null);
  const [activeRole, setActiveRole] = useState("");
  const [online, setOnline] = useState(false);
  const [work, setWork] = useState(null);
  const [unread, setUnread] = useState(0);
  const [vehicleDue, setVehicleDue] = useState(0);
  const [orders, setOrders] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [incoming, setIncoming] = useState(null);
  const [chain, setChain] = useState(null);
  const [extraTitle, setExtraTitle] = useState("");
  const [extraDesc, setExtraDesc] = useState("");
  const [extraPrice, setExtraPrice] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(ACCEPT_SECONDS);
  const [error, setError] = useState("");
  const [earnings, setEarnings] = useState(null);
  const timerRef = useRef(null);

  function startTimer(order) {
    clearInterval(timerRef.current);
    setIncoming(order);
    setSecondsLeft(ACCEPT_SECONDS);

    timerRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setIncoming(null);
          // Время вышло — заказ пропущен
          reportSkip(order);
          return ACCEPT_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
  }

  // Пропуск заказа: два подряд — автоматическое снятие с линии
  async function reportSkip(order) {
    if (!order?.id || !me) return;
    try {
      const res = await api(`/orders/${order.id}/skip`, {
        method: "POST",
        body: { executor_id: me.id },
      });
      if (res?.taken_offline) {
        setOnline(false);
        setError("Пропущено два заказа подряд — вы сняты с линии. Вернитесь на линию, когда сможете брать заказы.");
        loadWork();
      }
    } catch (e) {
      // сеть недоступна — пропуск просто не засчитается
    }
  }

  async function authMax(roleId) {
    try {
      const initData =
        window?.WebApp?.initData ||
        window?.Max?.initData ||
        window?.Telegram?.WebApp?.initData ||
        new URLSearchParams(window.location.search).get("initData") || "";

      const res = await api("/executors/auth", {
        method: "POST",
        body: JSON.stringify({ initData, role: roleId })
      });

      if (res?.token) setExecutorToken(res.token);
      setMe(res);
      setActiveRole(res.active_role || roleId);
      return res;
    } catch (e) {
      setError(e.message);
      return null;
    }
  }

  async function chooseRole(id) {
    const profile = await authMax(id);
    if (!profile) return;
    setMe(profile);
    setRole(id);
    localStorage.setItem("pro_role", id);
    resetPage("home");
  }

  useEffect(() => {
    if (role && !me) {
      authMax(role).then((profile) => {
        if (profile) {
          setMe(profile);
        }
      });
    }
  }, [role]);

  // API ответил 401 с живым токеном: вошли на другом устройстве или истёк
  // токен. Показываем экран кика — без автовхода, иначе два телефона будут
  // «отбирать» сессию друг у друга в цикле.
  useEffect(() => {
    const onKick = (e) => {
      setSessionKick(
        (e && e.detail && e.detail.message) || "Выполнен вход на другом устройстве"
      );
    };
    window.addEventListener("pro:401", onKick);
    return () => window.removeEventListener("pro:401", onKick);
  }, []);

  async function loadOrders() {
    if (!online || !me) return;
    try {
      const res = await api(`/available-orders?executor_id=${me.id}&role=${role}`);
      const list = Array.isArray(res) ? res : [res];
      setOrders(list);

      const available = list.find(o => o.status === "created");
      if (available && (!incoming || incoming.id !== available.id)) {
        startTimer(available);
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadChain() {
    if (!me || !myOrders.length) return;
    const active = myOrders.find(o => ["assigned", "accepted", "in_progress"].includes(o.status));
    if (!active) {
      setChain(null);
      return;
    }
    try {
      const res = await api(`/orders/${active.id}/chain?executor_id=${me.id}`);
      setChain(res);
    } catch (e) {
      setChain(null);
    }
  }

  async function loadMyOrders() {
    if (!me) return;
    try {
      const res = await api(`/orders/executor/${me.id}`);
      setMyOrders(Array.isArray(res) ? res : [res]);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    if (me && online && page === "orders") {
      loadOrders();
      const it = setInterval(loadOrders, 5000);
      return () => clearInterval(it);
    }
    if (me && page === "my") { loadMyOrders(); loadChain(); }
    if (me && page === "profile") { loadEarnings(); }
  }, [me, online, page]);

  // Доход за 7 дней — подсказка для переключателя ролей
  async function loadEarnings() {
    if (!me) return;
    try {
      setEarnings(await api(`/executors/${me.id}/earnings`));
    } catch (e) {}
  }

  // Контроль рабочего времени: лимит 12 ч, предупреждение за 2 ч, отдых 6 ч
  async function loadWork() {
    if (!me) return;
    try {
      setWork(await api(`/executors/${me.id}/work-time`));
    } catch (e) {}
  }

  // Счётчик непрочитанных уведомлений
  async function loadUnread() {
    if (!me) return;
    try {
      const res = await api(`/executors/${me.id}/notifications`);
      setUnread(Number(res?.unread || 0));
    } catch (e) {}
  }

  // Счётчик работ по ТО, которые пора повторить по пробегу
  async function loadVehicleDue() {
    if (!me) return;
    try {
      const res = await api(`/executors/${me.id}/vehicle`);
      setVehicleDue(Number(res?.maintenance_due_count || 0));
    } catch (e) {}
  }

  useEffect(() => {
    if (!me) return;
    loadWork();
    loadUnread();
    loadVehicleDue();
    const it = setInterval(loadWork, 60000);
    const it2 = setInterval(loadUnread, 30000);
    return () => { clearInterval(it); clearInterval(it2); };
  }, [me && me.id]);

  // Выход на линию и завершение смены
  async function toggleOnline() {
    if (online) {
      setOnline(false);
      try {
        await api(`/executors/${me.id}/online`, { method: "POST", body: { online: false } });
        await api(`/executors/${me.id}/work-session/stop`, { method: "POST" });
      } catch (e) {}
      loadWork();
      return;
    }
    if (work && !work.can_accept_orders) {
      setError(
        work.status === "resting"
          ? "После смены нужен отдых 6 часов — вернёмся к заказам позже"
          : "Исчерпан лимит рабочего времени — новые заказы не поступают"
      );
      return;
    }
    setOnline(true);
    setError("");
    try {
      await api(`/executors/${me.id}/online`, { method: "POST", body: { online: true } });
    } catch (e) {}
  }

  useEffect(() => () => clearInterval(timerRef.current), []);

  // Своя геопозиция с главной — держим профиль свежим, чтобы карта
  // в следующий раз открывалась на реальной точке, а не на устаревшей
  const sentPosAtRef = useRef(0);
  const sendHomePos = (lat, lon) => {
    const now = Date.now();
    if (!me || now - sentPosAtRef.current < 120000) return;
    sentPosAtRef.current = now;
    api(`/executors/${me.id}/position`, {
      method: "POST",
      body: { lat, lon },
    }).catch(() => {});
  };

  // Геопозиция для слежения за исполнителем: пока есть активный заказ
  useEffect(() => {
    const active = myOrders.find(o => ["assigned", "accepted", "in_progress"].includes(o.status));
    if (!me || !active) return undefined;

    const send = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        async pos => {
          try {
            await api(`/executors/${me.id}/position`, {
              method: "POST",
              body: { lat: pos.coords.latitude, lon: pos.coords.longitude },
            });
          } catch (e) {
            // сеть недоступна — отправим позже
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
      );
    };

    send();
    const it = setInterval(send, 15000);
    return () => clearInterval(it);
  }, [me && me.id, myOrders.map(o => `${o.id}:${o.status}`).join(",")]);

  async function refreshMe() {
    if (!me?.id) return;
    try {
      const fresh = await api(`/executors/${me.id}`);
      setMe(prev => ({ ...prev, ...fresh }));
      // Сервер мог снять с линии (пропуск заказов) — синхронизируем состояние
      if (fresh.is_online === false && online) {
        setOnline(false);
        setError("Вы сняты с линии: пропущено два заказа подряд. Вернитесь на линию, когда сможете брать заказы.");
      }
    } catch (e) {}
  }

  useEffect(() => {
    if (me && page === "home") {
      refreshMe();
      const it = setInterval(refreshMe, 15000);
      return () => clearInterval(it);
    }
  }, [me && me.id, page]);

  async function accept(order) {
    clearInterval(timerRef.current);
    try {
      const check = await api(`/executors/${me.id}/can-accept?role=${activeRole}`);
      if (!check.allowed) {
        setError(check.reason);
        setIncoming(null);
        return;
      }

      await api(`/orders/${order.id}/assign/${me.id}`, { method: "POST" });
      setIncoming(null);
      loadOrders();
      loadMyOrders();
      goPage("my");
    } catch (e) {
      setError(e.message);
    }
  }

  async function acceptAssigned(orderId) {
    try {
      setError("");
      await api(`/orders/${orderId}/accept?executor_id=${me.id}`, { method: "POST" });
      await loadMyOrders();
    } catch (e) {
      setError(e.message);
    }
  }

  async function startOrder(orderId) {
    try {
      setError("");
      await api(`/orders/${orderId}/start?executor_id=${me.id}`, { method: "POST" });
      await loadMyOrders();
    } catch (e) {
      setError(e.message);
    }
  }

  async function addExtra(orderId) {
    try {
      if (!extraTitle.trim() || !extraPrice) {
        setError("Укажите название и цену допуслуги");
        return;
      }

      await api(`/orders/${orderId}/extras`, {
        method: "POST",
        body: JSON.stringify({
          order_id: orderId,
          executor_id: me.id,
          title: extraTitle.trim(),
          description: extraDesc.trim(),
          price: Number(extraPrice)
        })
      });

      setExtraTitle("");
      setExtraDesc("");
      setExtraPrice("");
      setError("");
      alert("Допуслуга отправлена клиенту на подтверждение");
    } catch (e) {
      setError(e.message);
    }
  }

  async function reserveChain(order) {
    try {
      const active = myOrders.find(o => ["assigned", "accepted", "in_progress"].includes(o.status));
      await api(`/orders/${active.id}/chain/${order.id}/reserve?executor_id=${me.id}`, { method: "POST" });
      setChain(null);
      loadMyOrders();
    } catch (e) {
      setError(e.message);
    }
  }

  async function complete(id) {
    try {
      await api(`/orders/${id}/complete`, { method: "POST" });
      await loadMyOrders();
      loadEarnings();
    } catch (e) {
      setError(e.message);
    }
  }

  async function sendRating(orderId, value) {
    try {
      await api("/ratings", {
        method: "POST",
        body: { order_id: orderId, value, executor_id: me.id },
      });
      setError("");
      await loadMyOrders();
    } catch (e) {
      setError(e.message);
    }
  }

  async function switchActiveRole(roleId) {
    try {
      const res = await api(`/executors/${me.id}/active-role`, {
        method: "PUT",
        body: JSON.stringify({ role: roleId })
      });
      setMe(res);
      setActiveRole(res.active_role);
    } catch (e) {
      setError(e.message);
    }
  }

  async function addRole(roleId) {
    try {
      const res = await api(`/executors/${me.id}/roles`, {
        method: "POST",
        body: JSON.stringify({ role: roleId })
      });
      setMe(res);
    } catch (e) {
      setError(e.message);
    }
  }

  // Окно оценки: час после завершения. Внутри него негатив можно
  // передумать и поставить лайк — положительная оценка финальная.
  const rateTarget = myOrders.find(o =>
    o.status === "completed"
    && o.completed_at
    && Date.now() - new Date(o.completed_at).getTime() <= 3600e3
    && (!o.rated || o.rated_value === "dislike")
  );
  // Активный заказ — для чата с клиентом
  const activeOrder = myOrders.find(o => ["assigned", "accepted", "in_progress"].includes(o.status));

  const scale = incoming ? 0.75 + 0.25 * (secondsLeft / ACCEPT_SECONDS) : 1;
  const currentRole = ROLES.find(r => r.id === activeRole) || ROLES[0];
  const s = makeStyles(t);
  const m = maxPalette(t.mode);

  // Миниапп исполнителя открывается только внутри мессенджера MAX
  if (!isMaxEnv()) return <MaxGate />;

  // Токен аннулирован — вход только вручную кнопкой (без автоповтора)
  if (sessionKick) {
    return (
      <div style={{
        minHeight: "100dvh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 14,
        padding: 28, textAlign: "center",
        background: t.bg, color: t.text, fontFamily: "system-ui",
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20, background: t.accent,
          color: "#fff", display: "flex", alignItems: "center",
          justifyContent: "center", fontWeight: 900, fontSize: 30,
        }}>П</div>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 900 }}>Сессия закрыта</h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: t.sub, maxWidth: 330 }}>
          {sessionKick}. Чтобы продолжить работу, войдите заново на этом телефоне.
        </p>
        <button
          onClick={async () => {
            const res = await authMax(role || "driver");
            if (res) setSessionKick(null);
          }}
          style={{
            padding: "13px 26px", borderRadius: 14, border: 0, cursor: "pointer",
            background: t.cta, color: t.onCta, fontWeight: 850, fontSize: 15,
          }}
        >Войти заново</button>
        {error ? (
          <div style={{
            fontSize: 12.5, color: t.danger, background: t.dangerSoft,
            borderRadius: 12, padding: "9px 13px", maxWidth: 330,
          }}>{error}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="pro-shell" style={s.shell}>
      <style>{`
        .pro-shell, .pro-shell *, .pro-shell *::before, .pro-shell *::after {
          box-sizing: border-box;
        }
      `}</style>

      {page === "role" ? (
        <>
          <header style={{ padding: "20px 0 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={s.logoDot}>П</span>
            <span style={{ fontWeight: 900, fontSize: 18, color: t.text }}>Про · Исполнитель</span>
          </header>
          <div style={s.card}>
            <h1 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 900, color: t.text }}>Чем вы будете заниматься?</h1>
            <p style={{ color: t.sub, fontSize: 12.5, margin: 0 }}>
              Выберите первую роль. Другие роли можно добавить в профиле.
            </p>
          </div>

          {ROLES.map(r => {
            const hue = s.hue(r.hue);
            return (
              <button key={r.id} style={s.roleBtn(role === r.id, hue)} onClick={() => chooseRole(r.id)}>
                <span style={s.roleIcon(role === r.id, hue)}>
                  <Icon name={r.icon} size={26} strokeWidth={2.6} />
                </span>
                <span>
                  <strong style={{ display: "block", color: t.text }}>{r.title}</strong>
                  <small style={{ color: t.sub }}>{r.text}</small>
                </span>
                <Icon name="arrowRight" size={16} style={{ color: t.accent, marginLeft: "auto" }} />
              </button>
            );
          })}
        </>
      ) : (
        <>
          {/* Топбар: бренд + большой тумблер линии (Grab style) */}
          <header style={s.topbar}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={s.logoDot}>П</span>
              <div>
                <div style={{ fontWeight: 900, fontSize: 15, lineHeight: 1, color: t.text }}>Про</div>
                <div style={{ fontSize: 9.5, fontWeight: 750, color: t.sub, marginTop: 2 }}>Исполнитель</div>
              </div>
            </div>
            <button
              onClick={toggleOnline}
              style={{ ...s.onlineBtn(online), opacity: work && !work.can_accept_orders ? 0.55 : 1 }}
            >
              <span style={s.onlineDot(online)} />
              {online ? "Работаю" : "Отдыхаю"}
            </button>
          </header>

          {page === "home" && (
            <>
              {/* Главная исполнителя — только карта во весь доступный экран:
                  наши тайлы PMTiles Краснодарского края + живая геопозиция */}
              <React.Suspense fallback={
                <div style={{
                  height: "calc(100dvh - 128px - env(safe-area-inset-bottom, 0px))",
                  margin: "0 -16px",
                  background: t.mapBg,
                }} />
              }>
                <HomeMap
                  t={t}
                  full
                  position={
                    me && me.last_lat != null && me.last_lon != null
                      ? { lat: me.last_lat, lon: me.last_lon }
                      : null
                  }
                  onPosition={sendHomePos}
                />
              </React.Suspense>
            </>
          )}

          {page === "orders" && (
            <>
              <h2 style={s.h2}>Заказы</h2>
              <p style={{ color: t.sub, fontSize: 12, margin: "0 0 12px" }}>
              {work && !work.can_accept_orders && (
                <div style={{
                  marginBottom: 12, padding: 14, borderRadius: 16,
                  background: t.dangerSoft, color: t.danger, fontSize: 13, lineHeight: 1.45,
                }}>
                  {work.status === "resting"
                    ? "После смены нужен отдых 6 часов — новые заказы пока не поступают."
                    : "Лимит рабочего времени исчерпан (12 часов). Новые заказы не поступают."}
                </div>
              )}
              {online ? "Вы на линии, поиск заказов включён" : "Вы офлайн — вернитесь на главную и включите тумблер"}
              </p>

              {incoming && (
                <div style={s.incoming}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ color: t.accent }}>Заказ №{incoming.id}</strong>
                    <span style={{ fontSize: 14.5, fontWeight: 900, color: secondsLeft <= 5 ? t.danger : t.text }}>
                      {secondsLeft} сек
                    </span>
                  </div>

                  <p style={{ margin: "8px 0", color: t.text, fontWeight: 650 }}>
                    {incoming.from_address} → {incoming.to_address}
                  </p>
                  {incoming.service && incoming.service !== "taxi" && (
                    <p style={{ margin: "0 0 2px", color: t.sub, fontSize: 12 }}>
                      {SERVICE_LABELS[incoming.service] || incoming.service}
                    </p>
                  )}
                  {orderDetails(incoming).map((line, i) => (
                    <p key={i} style={{ margin: "2px 0", color: t.sub, fontSize: 13 }}>{line}</p>
                  ))}
                  <p style={{ fontSize: 22, fontWeight: 900, color: t.text, margin: "0 0 10px", letterSpacing: -0.5 }}>
                    {incoming.total_price} ₽
                  </p>

                  <button
                    onClick={() => accept(incoming)}
                    style={{
                      width: "100%",
                      padding: 15,
                      borderRadius: 14,
                      background: t.cta,
                      color: t.onCta,
                      border: 0,
                      fontWeight: 850,
                      fontSize: 16,
                      cursor: "pointer",
                      boxShadow: "0 10px 24px -8px rgba(255,205,45,.55)",
                      transform: `scale(${scale})`,
                      transition: "transform 0.9s linear"
                    }}
                  >
                    Принять заказ
                  </button>
                </div>
              )}

              {orders.map(o => (
                <div key={o.id} style={s.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <strong style={{ color: t.text }}>Заказ №{o.id}</strong>
                    <strong style={{ color: t.text }}>{o.total_price} ₽</strong>
                  </div>
                  <p style={{ margin: "0 0 4px", color: t.text }}>{o.from_address} → {o.to_address}</p>
                  {o.service && o.service !== "taxi" && (
                    <p style={{ margin: "0 0 2px", color: t.sub, fontSize: 12 }}>{SERVICE_LABELS[o.service] || o.service}</p>
                  )}
                  {orderDetails(o).map((line, i) => (
                    <p key={i} style={{ margin: "1px 0", color: t.sub, fontSize: 12 }}>{line}</p>
                  ))}
                  <p style={{ margin: 0, color: t.sub, fontSize: 12 }}>{STATUS_RU[o.status] || o.status}</p>
                </div>
              ))}

              {orders.length === 0 && <div style={s.empty}>Пока нет доступных заказов</div>}
            </>
          )}

          {page === "my" && (
            <>
              <h2 style={s.h2}>Мои заказы</h2>

              {rateTarget && (
                <div style={s.rateCard}>
                  <strong style={{ color: t.text }}>Заказ №{rateTarget.id} завершён</strong>
                  <p style={{ color: t.sub, fontSize: 12.5, margin: "4px 0" }}>
                    {rateTarget.from_address} → {rateTarget.to_address}
                  </p>
                  <p style={{ margin: "10px 0 8px", fontWeight: 850, color: t.text }}>
                    {rateTarget.rated ? "Изменить оценку клиента?" : "Как был клиент?"}
                  </p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => sendRating(rateTarget.id, "like")} style={{ ...s.rateBtn, background: t.successSoft, color: t.success }}>
                      <RateIcon name="like" /> {rateTarget.rated ? "Всё понравилось" : "Понравился"}
                    </button>
                    {/* Дислайк скрыт в режиме изменения: негатив можно только заменить на лайк */}
                    {!rateTarget.rated && (
                      <button onClick={() => sendRating(rateTarget.id, "dislike")} style={{ ...s.rateBtn, background: t.dangerSoft, color: t.danger }}>
                        <RateIcon name="dislike" /> Не понравился
                      </button>
                    )}
                  </div>
                </div>
              )}

              {myOrders.map(o => (
                <div key={o.id} style={s.card}>
                  {/* Клик по информации заказа — подробная карточка с трекингом */}
                  <div
                    onClick={() => setDetailOrderId(o.id)}
                    style={{ cursor: "pointer", marginBottom: 10 }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong style={{ color: t.text }}>Заказ №{o.id}</strong>
                      <strong style={{ color: t.text }}>{o.total_price} ₽</strong>
                    </div>
                    <p style={{ margin: "4px 0 6px", color: t.text }}>{o.from_address} → {o.to_address}</p>
                    {/* Крупный статус заказа (батарея оценки клиента убрана) */}
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      fontSize: 14.5, fontWeight: 850,
                      color: o.status === "cancelled" ? t.danger : o.status === "completed" ? t.success : t.accent,
                    }}>
                      {STATUS_RU[o.status] || o.status}
                      <Icon name="chevronRight" size={14} />
                    </span>
                  </div>

                  {o.status === "assigned" && (
                    <button onClick={() => acceptAssigned(o.id)} style={s.primary}>Я на месте</button>
                  )}

                  {o.status === "accepted" && (
                    <button onClick={() => startOrder(o.id)} style={s.primary}>Начать поездку</button>
                  )}

                  {o.status === "in_progress" && (
                    <button onClick={() => complete(o.id)} style={s.primary}>Завершить заказ</button>
                  )}

                  {["assigned", "accepted", "in_progress"].includes(o.status) && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
                      <strong style={{ fontSize: 13, color: t.text }}>Добавить допуслугу</strong>

                      <input
                        placeholder="Название: Поездка за материалами"
                        value={extraTitle}
                        onChange={e => setExtraTitle(e.target.value)}
                        style={s.input}
                      />
                      <input
                        placeholder="Описание: купить смеситель"
                        value={extraDesc}
                        onChange={e => setExtraDesc(e.target.value)}
                        style={s.input}
                      />
                      <input
                        placeholder="Цена, ₽"
                        type="number"
                        min="0"
                        value={extraPrice}
                        onChange={e => setExtraPrice(e.target.value)}
                        style={s.input}
                      />

                      <button onClick={() => addExtra(o.id)} style={s.primary}>
                        Отправить клиенту
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {chain?.available && (
                <div style={s.chainBox}>
                  <strong style={{ color: t.accent }}>
                    {chain.mode === "reverse_intercity" ? "Встречный заказ в обратном направлении" : "Следующий заказ в цепочке"}
                  </strong>
                  {chain.orders.map(o => (
                    <div key={o.id} style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.border}` }}>
                      <strong style={{ color: t.text }}>Заказ №{o.id}</strong>
                      <p style={{ margin: "6px 0", color: t.text, fontWeight: 650 }}>
                        {o.from_address} → {o.to_address}
                      </p>
                      <p style={{ fontSize: 18, fontWeight: 900, color: t.text, margin: "0 0 8px" }}>{o.total_price} ₽</p>
                      <button onClick={() => reserveChain(o)} style={{ width: "100%", padding: 12, borderRadius: 12, background: t.accent, color: t.onAccent, border: 0, fontWeight: 800, cursor: "pointer" }}>
                        Забронировать следующим
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {myOrders.length === 0 && <div style={s.empty}>Пока нет принятых заказов</div>}

              {activeOrder && (
                <ExecutorChat
                  orderId={activeOrder.id}
                  executorId={me.id}
                  t={t}
                  s={s}
                />
              )}
            </>
          )}

          {page === "support" && me && (
            <ExecutorSupportPage me={me} t={t} m={m} onBack={backPage} />
          )}

          {page === "profile" && me && (
            <ProfileExecutor
              me={me}
              t={t}
              setting={setting}
              choose={choose}
              activeRole={activeRole}
              earnings={earnings}
              unread={unread}
              vehicleDue={vehicleDue}
              work={work}
              onStats={() => goPage("stats")}
              onNotifications={() => goPage("notifications")}
              onPhotoChecks={() => goPage("photo")}
              onVehicle={() => goPage("vehicle")}
              onInfo={() => goPage("info")}
              onSupport={() => goPage("support")}
            />
          )}

          {page === "notifications" && me && (
            <ExecutorNotificationsPage me={me} t={t} m={m} onBack={backPage} />
          )}

          {page === "stats" && me && (
            <ExecutorStatsPage me={me} t={t} m={m} onBack={backPage} />
          )}

          {page === "roles" && me && (
            <ExecutorRolesPage
              me={me}
              t={t}
              m={m}
              earnings={earnings}
              activeRole={activeRole}
              onSwitchRole={switchActiveRole}
              onAddRole={addRole}
              onLogout={() => {
                setRole("");
                localStorage.removeItem("pro_role");
                sessionStorage.removeItem("executor_contact_ok");
                setExecutorToken(null);
                setMe(null);
                resetPage("role");
              }}
              onBack={backPage}
            />
          )}

          {page === "photo" && me && (
            <ExecutorPhotoChecksPage me={me} t={t} m={m} onBack={backPage} />
          )}

          {page === "vehicle" && me && (
            <ExecutorVehiclePage me={me} t={t} m={m} onBack={backPage} />
          )}

          {page === "info" && (
            <ExecutorInfoPage t={t} m={m} onBack={backPage} />
          )}

          {error && (
            <div style={{ ...s.errorBox, marginTop: 10 }}>{error}</div>
          )}

          <nav style={s.nav}>
            {[
              ["home", "home", "Главная"],
              ["orders", "orders", "Заказы"],
              ["my", "my", "Мои"],
              ["profile", "gear", "Профиль"]
            ].map(([id, icon, title]) => (
              <button key={id} onClick={() => goPage(id)} style={s.navBtn(page === id)}>
                <span style={{ height: 22, display: "flex", alignItems: "center" }}>
                  <Icon name={icon} size={21} strokeWidth={2} />
                </span>
                {title}
              </button>
            ))}
          </nav>

          {detailOrderId != null && (
            <ExecutorOrderDetail
              t={t}
              orderId={detailOrderId}
              onClose={() => setDetailOrderId(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

function makeStyles(t) {
  return {
    shell: {
      maxWidth: 460, minHeight: "100dvh", margin: "auto",
      padding: "0 16px 64px", background: t.bg, color: t.text,
      fontFamily: "system-ui", transition: "background 0.25s, color 0.25s",
    },

    hue: name => {
      const map = {
        accent: { c: t.accent, soft: t.accentSoft },
        green: { c: t.green, soft: t.greenSoft },
        amber: { c: t.amber, soft: t.amberSoft },
        sky: { c: t.sky, soft: t.skySoft },
      };
      return map[name] || map.accent;
    },

    logoDot: {
      width: 28, height: 28, borderRadius: 9, background: t.accent, color: t.onAccent,
      display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 14,
    },

    topbar: {
      position: "sticky", top: 0, zIndex: 30, margin: "0 -16px", padding: "12px 16px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: t.navBg, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      borderBottom: `1px solid ${t.border}`,
    },
    onlineBtn: online => ({
      display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 13,
      border: 0, cursor: "pointer",
      background: online ? t.successSoft : t.card,
      color: online ? t.success : t.text,
      border: online ? "none" : `1px solid ${t.border}`,
      fontSize: 12.5, fontWeight: 800,
    }),
    onlineDot: online => ({
      width: 9, height: 9, borderRadius: 999, background: online ? t.success : t.sub,
    }),

    // --- сетка статов 2x2 ---
    statsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 },
    statBig: {
      gridColumn: "1 / 3", padding: 16, borderRadius: 20,
      background: t.card, color: t.text, border: `1px solid ${t.border}`,
      display: "flex", flexDirection: "column", boxShadow: t.shadow,
    },
    statSmall: {
      padding: 14, borderRadius: 18, background: t.card, border: `1px solid ${t.border}`,
      display: "flex", flexDirection: "column", gap: 3,
    },
    statLabel: { fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: t.sub },
    statMoney: { fontSize: 26, fontWeight: 900, letterSpacing: -0.5, marginTop: 2, color: t.text },
    statValue: positive => ({
      fontSize: 17, fontWeight: 900, marginTop: 2,
      color: positive ? t.success : t.text,
    }),
    statNote: { fontSize: 10.5, color: t.sub, fontWeight: 600 },

    roleRow: {
      display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 14px",
      marginTop: 10, borderRadius: 16, background: t.card, border: `1px solid ${t.border}`,
      cursor: "pointer",
    },
    roleRowIcon: h => ({
      width: 40, height: 40, borderRadius: 13, background: h.soft, color: h.c,
      display: "flex", alignItems: "center", justifyContent: "center",
    }),

    primaryDark: {
      width: "100%", marginTop: 10, padding: 15, borderRadius: 15,
      background: t.cta, color: t.onCta,
      boxShadow: "0 10px 24px -8px rgba(255,205,45,.55)",
      fontWeight: 850, fontSize: 15, border: 0, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
    },
    liveDot: online => ({
      width: 8, height: 8, borderRadius: 999,
      background: online ? t.success : "rgba(128,126,142,0.9)",
    }),

    roleBtn: (selected, h) => ({
      display: "flex", gap: 13, alignItems: "center", width: "100%", padding: 13,
      marginBottom: 10, borderRadius: 16, background: selected ? h.soft : t.card,
      border: selected ? `2px solid ${h.c}` : `1px solid ${t.border}`, textAlign: "left", cursor: "pointer",
    }),
    roleIcon: (selected, h) => ({
      width: 42, height: 42, borderRadius: 13, background: selected ? t.card : h.soft,
      color: h.c, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto",
    }),

    incoming: {
      padding: 16, borderRadius: 18, marginBottom: 12,
      background: t.card, border: `2px solid ${t.accent}`, boxShadow: t.shadow,
    },

    chainBox: {
      padding: 16, borderRadius: 18, marginBottom: 12,
      background: t.card, border: `2px solid ${t.accent}`,
    },

    rateCard: {
      padding: 15, borderRadius: 16, background: t.card, border: `2px solid ${t.accent}`,
      marginBottom: 12,
    },
    rateBtn: {
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
      padding: 11, borderRadius: 12, fontWeight: 850, border: 0, cursor: "pointer", fontSize: 13,
    },

    h2: { fontSize: 19, fontWeight: 900, letterSpacing: -0.4, margin: "16px 0 8px", color: t.text },

    card: {
      padding: 16, borderRadius: 18, background: t.card, border: `1px solid ${t.border}`,
      marginBottom: 12, color: t.text,
    },
    empty: {
      padding: 18, borderRadius: 18, background: t.card, border: `1px solid ${t.border}`,
      marginBottom: 12, color: t.sub,
    },

    input: {
      width: "100%", padding: 12, borderRadius: 12, border: `1px solid ${t.border}`,
      background: t.inputBg, color: t.text, marginTop: 8, boxSizing: "border-box",
    },
    primary: {
      width: "100%", padding: 13, borderRadius: 13, background: t.accent, color: t.onAccent,
      fontWeight: 850, border: 0, marginTop: 10, cursor: "pointer",
    },
    ghostBtn: {
      flex: 1, padding: 12, borderRadius: 13, background: t.accentSoft, color: t.accent,
      fontWeight: 750, border: 0, cursor: "pointer",
    },

    themeBtn: active => ({
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
      padding: "11px 6px", borderRadius: 14, cursor: "pointer",
      border: active ? `2px solid ${t.accent}` : `1px solid ${t.border}`,
      background: active ? t.accentSoft : "transparent",
      color: active ? t.accent : t.sub, fontWeight: 750, fontSize: 12,
    }),

    errorBox: {
      padding: 12, borderRadius: 13, background: t.dangerSoft, color: t.danger,
      fontSize: 13, fontWeight: 700,
    },

    nav: {
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "min(100%,460px)", display: "flex", justifyContent: "space-around",
      padding: "4px 6px", gap: 2, borderTop: `1px solid ${t.border}`, background: t.navBg,
      backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
      paddingBottom: "max(4px, env(safe-area-inset-bottom))",
    },
    navBtn: active => ({
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
      padding: "0 4px", background: "transparent",
      border: 0, color: active ? t.accent : t.sub,
      fontSize: 9.5, fontWeight: 700, lineHeight: 1.1,
    }),
  };
}
