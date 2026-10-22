import React, { useEffect, useState } from "react";

export function useSummary() {
  const [summary, setSummary] = useState(null);

  async function load() {
    try {
      const res = await fetch("/me/summary", { credentials: "include" });
      if (!res.ok) return;
      setSummary(await res.json());
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, []);

  return summary;
}

export function ProfileBalance() {
  const summary = useSummary();

  if (!summary) {
    return (
      <div style={{ padding: 20, borderRadius: 22, background: "#fff", marginBottom: 12 }}>
        <h3>Кабинет исполнителя</h3>
        <p style={{ color: "#858197", fontSize: 13 }}>Загрузка…</p>
      </div>
    );
  }

  const balance = summary.executor_balance ?? summary.client_balance;

  return (
    <div style={{ padding: 20, borderRadius: 22, background: "#fff", marginBottom: 12 }}>
      <h3>Кабинет исполнителя</h3>
      <p style={{ margin: "6px 0", fontWeight: 700 }}>{summary.name || "Исполнитель"}</p>
      <p style={{ margin: "6px 0", color: "#858197", fontSize: 13 }}>
        Роль: {summary.role || "не определена"}
      </p>
      <p style={{ margin: "6px 0", fontSize: 24, fontWeight: 850 }}>
        Баланс: {balance} ₽
      </p>
    </div>
  );
}

export function ActiveOrderCard() {
  const summary = useSummary();
  const order = summary?.active_order;
  const [busy, setBusy] = useState(false);

  if (!order) return null;

  async function doAction(action) {
    setBusy(true);

    try {
      const res = await fetch(`/orders/${order.id}/executor-action`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.detail || "Ошибка");
        return;
      }

      alert("Действие выполнено");
    } finally {
      setBusy(false);
    }
  }

  const buttonStyle = {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    border: 0,
    background: "#6545ed",
    color: "#fff",
    fontWeight: 700,
  };

  return (
    <div style={{
      position: "fixed",
      bottom: 60,
      left: "50%",
      transform: "translateX(-50%)",
      width: "min(100%, 424px)",
      padding: 16,
      borderRadius: 18,
      background: "#fff",
      boxShadow: "0 8px 24px rgba(0,0,0,.12)",
      zIndex: 20,
    }}>
      <strong>Активный заказ №{order.id}</strong>
      <p style={{ margin: "6px 0", color: "#858197", fontSize: 13 }}>
        {order.service} · {order.status}
      </p>
      <strong>{order.total_price} ₽</strong>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {order.status === "created" && (
          <button
            style={buttonStyle}
            disabled={busy}
            onClick={() => doAction("accept")}
          >
            Принять
          </button>
        )}

        {order.status === "accepted" && (
          <button
            style={buttonStyle}
            disabled={busy}
            onClick={() => doAction("start")}
          >
            Начать
          </button>
        )}

        {order.status === "in_progress" && (
          <button
            style={buttonStyle}
            disabled={busy}
            onClick={() => doAction("complete")}
          >
            Завершить
          </button>
        )}
      </div>
    </div>
  );
}
