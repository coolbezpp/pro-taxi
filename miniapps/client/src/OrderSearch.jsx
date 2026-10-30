import React, { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
// maplibre вынесен в отдельный чанк — тянем его только при открытии карты.
const TrackMap = React.lazy(() => import("./TrackMap.jsx"));

const STATUS_TEXT = {
  created: "Ищем исполнителя",
  assigned: "Исполнитель назначен",
  accepted: "Исполнитель едет к вам",
  in_progress: "Поездка началась",
  completed: "Заказ выполнен",
  cancelled: "Заказ отменён",
};

// Рейтинг в виде заряжающейся батареи: изначально 100%, каждая оценка
// за последние 100 заказов двигает заряд. Цветовая индикация: зелёный
// (80–100%), жёлтый (60–79%), оранжевый (40–59%), красный (<40%).
export function RatingBattery({ value = 100, w = 52 }) {
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

// Окно после оформления: поиск исполнителя, слежение за движением и чат.
export default function OrderSearch({ s, t, orderId, onBack, onCancel }) {
  const [order, setOrder] = useState(null);
  const [track, setTrack] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [lostSending, setLostSending] = useState(false);
  const [lostDone, setLostDone] = useState(false);
  const chatRef = useRef(null);

  async function loadOrder() {
    try {
      setOrder(await api(`/orders/${orderId}`));
    } catch (e) {}
  }

  async function loadTrack() {
    try {
      setTrack(await api(`/orders/${orderId}/track`));
    } catch (e) {}
  }

  async function loadMessages() {
    try {
      const res = await api(`/orders/${orderId}/messages`);
      setMessages(Array.isArray(res) ? res : []);
    } catch (e) {}
  }

  useEffect(() => {
    loadOrder();
    loadTrack();
    loadMessages();
    const it = setInterval(() => {
      loadOrder();
      loadTrack();
      loadMessages();
    }, 5000);
    return () => clearInterval(it);
  }, [orderId]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages.length]);

  async function send() {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      await api(`/orders/${orderId}/messages`, { method: "POST", body: { text: value } });
      setText("");
      await loadMessages();
    } catch (e) {
      setError(e.message || "Сообщение не отправлено");
    } finally {
      setSending(false);
    }
  }

  // «Оставили вещи»: услуга такси, час после завершения, один раз
  async function lostItem() {
    if (lostSending) return;
    setLostSending(true);
    setError("");
    try {
      await api(`/orders/${orderId}/lost-item`, { method: "POST" });
      setLostDone(true);
      await loadOrder();
    } catch (e) {
      setError(e.message || "Не удалось отправить уведомление");
    } finally {
      setLostSending(false);
    }
  }

  const status = order?.status || "created";
  const executor = track?.executor;
  const completedAt = order?.completed_at ? new Date(order.completed_at).getTime() : null;
  const withinHour = completedAt != null && Date.now() - completedAt <= 3600e3;
  const isTaxi = (order?.service || "taxi") === "taxi";
  const lostSent = Boolean(order?.lost_item) || lostDone;
  // Координаты могут отсутствовать (например, грузовой заказ без карты) —
  // тогда не отдаём в карту точку вовсе, чтобы не рисовать маркеры с null
  const from = track && track.from_lat != null ? { lat: track.from_lat, lon: track.from_lon } : null;
  const to = track && track.to_lat != null ? { lat: track.to_lat, lon: track.to_lon } : null;

  return (
    <div style={{ padding: "14px 16px 30px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <button
          onClick={onBack}
          aria-label="Назад"
          style={{
            width: 38, height: 38, borderRadius: 12, border: 0, cursor: "pointer",
            background: t.card, color: t.text, fontSize: 18, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >←</button>
        <strong style={{ fontSize: 20, color: t.text, letterSpacing: -0.4 }}>
          {STATUS_TEXT[status] || "Заказ"}
        </strong>
      </div>

      {/* Статус заказа */}
      <div style={{
        padding: 16, borderRadius: 18, background: t.card, border: `1px solid ${t.border}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: t.sub }}>Заказ №{orderId}</span>
          <strong style={{ fontSize: 19, color: t.text, fontWeight: 900 }}>
            {order?.total_price != null ? `${order.total_price} ₽` : "—"}
          </strong>
        </div>

        <p style={{ margin: "10px 0 0", fontSize: 13.5, color: t.text, lineHeight: 1.4 }}>
          {track?.from_address} → {track?.to_address}
        </p>

        {track?.comment && (
          <p style={{ margin: "8px 0 0", fontSize: 12.5, color: t.sub, lineHeight: 1.4 }}>
            Комментарий: {track.comment}
          </p>
        )}

        {status === "created" && (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: t.accent, fontWeight: 700 }}>
            Подбираем ближайшего исполнителя…
          </p>
        )}

        {executor && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.border}`,
          }}>
            <span style={{
              width: 38, height: 38, borderRadius: "50%", background: t.accentSoft, color: t.accent,
              display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900,
            }}>{String(executor.name || "И").slice(0, 1).toUpperCase()}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: t.text }}>
                {executor.name}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                <RatingBattery value={executor.rating_percent ?? 100} />
                {executor.lat != null && (
                  <span style={{ fontSize: 12, color: t.sub }}>на связи</span>
                )}
              </span>
              {executor.vehicle && (
                <span style={{ display: "block", fontSize: 12.5, color: t.text, marginTop: 3, fontWeight: 700 }}>
                  {[executor.vehicle.brand, executor.vehicle.model].filter(Boolean).join(" ")}
                  {executor.vehicle.plate ? ` · ${executor.vehicle.plate}` : ""}
                </span>
              )}
            </span>
          </div>
        )}

        {["created", "assigned"].includes(status) && (
          <button
            onClick={onCancel}
            style={{
              width: "100%", marginTop: 12, padding: 12, borderRadius: 12, border: 0,
              background: t.dangerSoft, color: t.danger, fontWeight: 800, cursor: "pointer",
              fontFamily: "inherit", fontSize: 13.5,
            }}
          >Отменить заказ</button>
        )}
      </div>

      {/* Слежение за исполнителем: карта видна с момента заказа —
          сначала маршрут А→Б, затем точка исполнителя в пути */}
      {(from || to || executor) && (
        <div style={{ marginTop: 12 }}>
          <React.Suspense fallback={
            <div style={{ height: 230, borderRadius: 14, background: t.card, border: `1px solid ${t.border}` }} />
          }>
            <TrackMap from={from} to={to} executor={executor} t={t} height={230} />
          </React.Suspense>
        </div>
      )}

      {/* Чат с исполнителем */}
      {executor && (
        <div style={{ marginTop: 16 }}>
          <strong style={{ display: "block", fontSize: 13.5, color: t.sub, marginBottom: 8 }}>
            Чат с исполнителем
            {status === "completed" && " · доступен час после завершения"}
          </strong>

          <div
            ref={chatRef}
            style={{
              maxHeight: 220, overflowY: "auto", padding: 12, borderRadius: 16,
              background: t.card, border: `1px solid ${t.border}`,
              display: "flex", flexDirection: "column", gap: 8,
            }}
          >
            {messages.length === 0 && (
              <p style={{ margin: 0, fontSize: 12.5, color: t.sub, textAlign: "center" }}>
                Напишите исполнителю — сообщения придут сюда.
              </p>
            )}
            {messages.map(msg => {
              const mine = msg.author_role !== "executor";
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
              placeholder="Сообщение…"
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
      )}

      {/* Оставили вещи: только услуга такси, в течение часа после завершения */}
      {status === "completed" && isTaxi && withinHour && (
        lostSent ? (
          <div style={{
            marginTop: 12, padding: 13, borderRadius: 14,
            background: t.successSoft, color: t.success,
            fontSize: 13, fontWeight: 750, textAlign: "center",
          }}>
            Исполнитель и оператор уведомлены — с вами свяжутся.
          </div>
        ) : (
          <button
            onClick={lostItem}
            disabled={lostSending}
            style={{
              display: "block", width: "100%", marginTop: 12, padding: 13,
              borderRadius: 14, border: 0, cursor: "pointer",
              background: t.dangerSoft, color: t.danger,
              fontWeight: 850, fontFamily: "inherit", fontSize: 13.5,
            }}
          >{lostSending ? "Отправляем…" : "Оставили вещи"}</button>
        )
      )}

      {error && (
        <p style={{ marginTop: 12, fontSize: 12.5, color: t.danger }}>{error}</p>
      )}
    </div>
  );
}
