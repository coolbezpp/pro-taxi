import React, { useEffect, useState } from "react";
import { api } from "./api.js";
// maplibre (~600 КБ) грузим только когда открывают карточку заказа:
// иначе весь бандл тянет его сразу и телефон вью за десятки секунд.
const TrackMap = React.lazy(() => import("./TrackMap.jsx"));

const STATUS_TEXT = {
  created: "Ищем исполнителя",
  assigned: "Исполнитель назначен",
  accepted: "Исполнитель едет к вам",
  arrived: "Исполнитель на месте",
  in_progress: "Поездка началась",
  completed: "Заказ выполнен",
  cancelled: "Заказ отменён",
};

// Причины отмены заказа от клиента
const CANCEL_REASONS = [
  { id: "long", label: "Долго ждать" },
  { id: "plans", label: "Изменились планы" },
  { id: "address", label: "Ошибся адресом" },
  { id: "other", label: "Другое" },
];

// Подробности заказа по клику из истории: статус, маршрут и трекинг.
// Карта ограничена Краснодарским краем — только уменьшение масштаба.
export default function OrderDetailSheet({ t, orderId, onClose }) {
  const [order, setOrder] = useState(null);
  const [track, setTrack] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelCustom, setCancelCustom] = useState("");
  const [cancelledReason, setCancelledReason] = useState(null);
  const [busy, setBusy] = useState(false);

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
    const active = ["created", "assigned", "accepted", "arrived", "in_progress"].includes(order?.status);
    const it = active ? setInterval(load, 5000) : null;
    return () => { alive = false; if (it) clearInterval(it); };
  }, [orderId, order?.status]);

  const status = order?.status || "created";
  const executor = track?.executor;
  const from = track && track.from_lat != null ? { lat: track.from_lat, lon: track.from_lon } : null;
  const to = track && track.to_lat != null ? { lat: track.to_lat, lon: track.to_lon } : null;
  const tariff = order?.tariff_code === "standard" ? "Стандарт"
    : order?.tariff_code === "intercity" ? "Межгород"
    : order?.tariff_code;
  const statusColor = status === "cancelled" ? t.danger : status === "completed" ? t.success : t.accent;

  const rowStyle = {
    display: "flex", justifyContent: "space-between", gap: 10,
    padding: "9px 0", borderTop: `1px solid ${t.border}`,
    fontSize: 13,
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
            {STATUS_TEXT[status] || status}
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

          <div style={{ marginTop: 10 }}>
            {order?.created_at && (
              <div style={{ ...rowStyle, borderTop: "none" }}>
                <span style={{ color: t.sub }}>Создан</span>
                <span style={{ color: t.text }}>{new Date(order.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            )}
            {order?.completed_at && (
              <div style={rowStyle}>
                <span style={{ color: t.sub }}>Завершён</span>
                <span style={{ color: t.text }}>{new Date(order.completed_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            )}
            {tariff && (
              <div style={rowStyle}>
                <span style={{ color: t.sub }}>Тариф</span>
                <span style={{ color: t.text }}>{tariff} · наличные</span>
              </div>
            )}
          </div>

          {/* Отмена клиентом — только до начала поездки */}
          {["created", "assigned", "accepted", "arrived"].includes(status) && (
            <button
              onClick={() => setCancelOpen(true)}
              style={{
                width: "100%",
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                border: 0,
                background: t.dangerSoft,
                color: t.danger,
                fontWeight: 800,
                fontSize: 14,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              Отменить заказ
            </button>
          )}

          {status === "cancelled" && (order?.cancel_reason || cancelledReason) && (
            <p style={{ margin: "10px 0 0", fontSize: 12.5, color: t.sub, lineHeight: 1.35 }}>
              Причина отмены: {cancelledReason || order.cancel_reason}
            </p>
          )}

          {executor && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
              <span style={{
                width: 36, height: 36, borderRadius: "50%", background: t.accentSoft, color: t.accent,
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900,
              }}>{String(executor.name || "И").slice(0, 1).toUpperCase()}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: t.text }}>{executor.name}</span>
                {executor.vehicle && (
                  <span style={{ display: "block", fontSize: 12, color: t.sub, marginTop: 1 }}>
                    {[executor.vehicle.brand, executor.vehicle.model].filter(Boolean).join(" ")}
                    {executor.vehicle.plate ? ` · ${executor.vehicle.plate}` : ""}
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Трекинг: карта Краснодарского края (масштаб — только вниз) */}
        {(from || to || executor) && (
          <div style={{ marginTop: 12 }}>
            <React.Suspense fallback={
              <div style={{ height: 240, borderRadius: 14, background: t.card, border: `1px solid ${t.border}` }} />
            }>
              <TrackMap from={from} to={to} executor={executor} t={t} height={240} />
            </React.Suspense>
          </div>
        )}

        {/* Модалка отмены заказа: причина из списка или своя */}
        {cancelOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(20,18,40,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70 }}>
            <div style={{ width: "88%", maxWidth: 360, padding: 16, borderRadius: 16, background: t.card, border: `1px solid ${t.border}`, color: t.text }}>
              <strong style={{ color: t.text }}>Отменить заказ?</strong>
              <p style={{ color: t.sub, fontSize: 12.5, margin: "6px 0 10px" }}>Причина уйдёт клиенту и исполнителю; штрафа нет.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {CANCEL_REASONS.map(r => (
                  <button
                    key={r.id}
                    onClick={() => { setCancelReason(r.id); if (r.id !== "other") setCancelOpen(false); }}
                    style={{
                      padding: 12, borderRadius: 12, border: `1px solid ${cancelReason === r.id ? t.accent : t.border}`,
                      background: cancelReason === r.id ? t.accentSoft : t.card,
                      color: cancelReason === r.id ? t.accent : t.text,
                      fontWeight: 750, fontSize: 13.5, fontFamily: "inherit", cursor: "pointer",
                    }}
                  >{r.label}</button>
                ))}
              </div>
              {cancelReason === "other" && (
                <input
                  value={cancelCustom}
                  onChange={e => setCancelCustom(e.target.value)}
                  placeholder="Укажите причину"
                  style={{
                    width: "100%", marginTop: 8, padding: 12, borderRadius: 12, border: `1px solid ${t.border}`,
                    background: t.inputBg, color: t.text, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
                  }}
                />
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button
                  onClick={() => { setCancelOpen(false); setCancelReason(""); setCancelCustom(""); }}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: 0, background: t.card, color: t.sub, fontWeight: 750, cursor: "pointer" }}
                >Отмена</button>
                <button
                  onClick={async () => {
                    const chosen = CANCEL_REASONS.find(r => r.id === cancelReason);
                    const reason = cancelReason === "other" ? cancelCustom.trim() : (chosen ? chosen.label : "");
                    if (!reason) return;
                    setBusy(true);
                    try {
                      const res = await api(`/orders/${orderId}/cancel`, { method: "POST", body: { reason } });
                      setCancelOpen(false);
                      setCancelReason("");
                      setCancelCustom("");
                      setCancelledReason(res?.cancel_reason || reason);
                      alert("Заказ отменён");
                      // перечитываем карточку: статус и причина должны обновиться
                      const fresh = await api(`/orders/${orderId}`).catch(() => null);
                      if (fresh) setOrder(fresh);
                    } catch (e) {
                      alert(e?.message || "Не удалось отменить заказ");
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy || !cancelReason}
                  style={{ flex: 2, padding: 12, borderRadius: 12, border: 0, background: t.danger, color: "#fff", fontWeight: 800, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
                >{busy ? "Отмена…" : "Отменить"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
