import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { useTheme } from "./theme.js";

// Штриховые SVG-иконки в едином стиле приложения.
const LIKE_PATH = (
  <>
    <path d="M2.5 10.5h4v10.5h-4z" />
    <path d="M6.5 21V10.5l4.8-7.3a2 2 0 0 1 3.5 1.9l-1.6 5.4h6.1a2.2 2.2 0 0 1 2.2 2.7l-1.7 6.4a2.6 2.6 0 0 1-2.5 1.9H6.5z" />
  </>
);
const DISLIKE_PATH = (
  <>
    <path d="M21.5 13.5h-4V3h4z" />
    <path d="M17.5 3v10.5l-4.8 7.3a2 2 0 0 1-3.5-1.9l1.6-5.4H4.7a2.2 2.2 0 0 1-2.2-2.7l1.7-6.4a2.6 2.6 0 0 1 2.5-1.9h10.8z" />
  </>
);
const SHARE_PATHS = (
  <>
    <circle cx="6" cy="12" r="2.6" />
    <circle cx="18" cy="5.5" r="2.6" />
    <circle cx="18" cy="18.5" r="2.6" />
    <path d="M8.4 10.8 15.6 6.8M8.4 13.2l7.2 4" />
  </>
);
const STATUS_NAMES = {
  created: "Создан",
  assigned: "Назначен исполнитель",
  accepted: "Исполнитель едет к вам",
  in_progress: "Выполняется",
  completed: "Завершён",
};

function MiniIcon({ path, size = 18, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flex: "0 0 auto", ...style }}
    >
      {path}
    </svg>
  );
}

export function useSummary() {
  const [summary, setSummary] = useState(null);

  async function load() {
    try {
      setSummary(await api("/me/summary"));
    } catch (e) {
      // нет токена/сессии — карточка просто не показывается
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, []);

  return [summary, load];
}

export function ProfileBalance() {
  const [summary] = useSummary();
  const { t } = useTheme();

  if (!summary) {
    return (
      <div style={{
        padding: 18, borderRadius: 22, background: t.card,
        border: `1px solid ${t.border}`, marginBottom: 12, color: t.text,
      }}>
        <h3 style={{ color: t.text }}>Кабинет</h3>
        <p style={{ color: t.sub, fontSize: 13 }}>Загрузка…</p>
      </div>
    );
  }

  const balance = summary.executor_balance ?? summary.client_balance;

  return (
    <div style={{
      padding: 18, borderRadius: 22, background: t.card,
      border: `1px solid ${t.border}`, marginBottom: 12, color: t.text,
    }}>
      <h3 style={{ margin: "0 0 6px", color: t.text }}>Кабинет</h3>
      <p style={{ margin: "6px 0", fontWeight: 800, color: t.text }}>
        {summary.name || "Пользователь"}
      </p>
      <p style={{ margin: "6px 0", color: t.sub, fontSize: 13 }}>
        Роль: {summary.role || "не определена"}
      </p>
      <p style={{ margin: "6px 0", fontSize: 24, fontWeight: 900, color: t.text }}>
        Баланс: {balance} ₽
      </p>
    </div>
  );
}

// Карточка оценки последнего завершённого заказа.
// Показывается, пока поездка не оценена второй стороной.
function RatingCard({ rate, busyRate, onRate, t }) {
  return (
    <div style={{
      padding: 16,
      borderRadius: 18,
      background: t.card,
      border: `2px solid ${t.accent}`,
      color: t.text,
      boxShadow: t.shadow,
    }}>
      <strong>Заказ №{rate.id} выполнен</strong>
      <p style={{ margin: "6px 0 0", color: t.sub, fontSize: 13 }}>
        {rate.from_address} → {rate.to_address}
      </p>
      <p style={{ margin: "10px 0 8px", fontWeight: 800, color: t.text }}>Как всё прошло?</p>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={() => onRate("like")}
          disabled={busyRate}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            gap: 8, padding: 12, borderRadius: 12, border: 0, cursor: "pointer",
            background: t.successSoft, color: t.success, fontWeight: 800,
            opacity: busyRate ? 0.6 : 1,
          }}
        >
          <MiniIcon path={LIKE_PATH} /> Понравилось
        </button>
        <button
          onClick={() => onRate("dislike")}
          disabled={busyRate}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            gap: 8, padding: 12, borderRadius: 12, border: 0, cursor: "pointer",
            background: t.dangerSoft, color: t.danger, fontWeight: 800,
            opacity: busyRate ? 0.6 : 1,
          }}
        >
          <MiniIcon path={DISLIKE_PATH} /> Не понравилось
        </button>
      </div>
    </div>
  );
}

export function ActiveOrderCard({ fallback = null }) {
  const [summary, reload] = useSummary();
  const { t } = useTheme();
  const order = summary?.active_order;
  const completed = summary?.last_completed;
  const rateOpen = completed && !completed.rated;
  const [busy, setBusy] = useState(false);
  const [busyRate, setBusyRate] = useState(false);

  if (!order && !rateOpen) return fallback ?? null;

  async function sendRating(value) {
    setBusyRate(true);
    try {
      await api("/ratings", {
        method: "POST",
        body: { order_id: completed.id, value },
      });
      await reload();
    } catch (e) {
      alert(e.message || "Не удалось отправить оценку");
    } finally {
      setBusyRate(false);
    }
  }

  async function shareTrip() {
    const status = STATUS_NAMES[order.status] || order.status;
    const text = `Заказ «Про» №${order.id}: ${order.from_address} → ${order.to_address}. Статус: ${status}.`;

    // В MAX работает штатное «Поделиться», иначе системное окно, иначе буфер
    const webApp = window.WebApp || window.Max?.WebApp;
    try {
      if (webApp?.share && typeof webApp.share === "function") {
        await webApp.share({ text });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: "Про", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      alert("Скопировано в буфер обмена");
    } catch (e) {
      // пользователь отменил системное окно — это нормально
    }
  }

  return (
    <div style={{
      position: "fixed",
      bottom: 60,
      left: "50%",
      transform: "translateX(-50%)",
      width: "calc(100% - 36px)",
      maxWidth: 424,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      zIndex: 20,
    }}>
      {rateOpen && (
        <RatingCard rate={completed} busyRate={busyRate} onRate={sendRating} t={t} />
      )}

      {order && (
        <div style={{
          padding: 16,
          borderRadius: 20,
          background: t.card,
          border: `1px solid ${t.border}`,
          boxShadow: t.shadow,
          color: t.text,
        }}>
          <strong>Активный заказ №{order.id}</strong>
          <p style={{ margin: "6px 0", color: t.sub, fontSize: 13 }}>
            {STATUS_NAMES[order.status] || order.status}
          </p>
          <p style={{ margin: "0 0 6px", fontSize: 14, color: t.text }}>
            {order.from_address} → {order.to_address}
          </p>
          <strong>{order.total_price} ₽</strong>

          {order.share_code && (
            <button
              onClick={shareTrip}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginTop: 10,
                padding: 12,
                borderRadius: 12,
                border: `1.5px solid ${t.accent}`,
                background: t.accentSoft,
                color: t.accent,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              <MiniIcon path={SHARE_PATHS} /> Поделиться поездкой
            </button>
          )}

          {["created", "accepted"].includes(order.status) && (
            <button
              onClick={async () => {
                if (!confirm("Отменить заказ?")) return;
                setBusy(true);
                try {
                  await api(`/orders/${order.id}/cancel`, { method: "POST" });
                  alert("Заказ отменён");
                } catch (e) {
                  alert(e.message || "Не удалось отменить заказ");
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              style={{
                width: "100%",
                marginTop: 10,
                padding: 12,
                borderRadius: 12,
                border: 0,
                background: t.dangerSoft,
                color: t.danger,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {busy ? "Отмена…" : "Отменить заказ"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
