import React, { useEffect, useState } from "react";

const FILTERS = [
  { id: "", title: "Все" },
  { id: "taxi", title: "Такси" },
  { id: "courier", title: "Курьер" },
  { id: "cargo", title: "Грузоперевозки" },
  { id: "master", title: "Мастера" },
];

export default function AvailableOrders() {
  const [orders, setOrders] = useState([]);
  const [service, setService] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newCount, setNewCount] = useState(0);
  const [prevCount, setPrevCount] = useState(0);

  async function load() {
    try {
      const params = new URLSearchParams();

      if (service) {
        params.set("service", service);
      }

      const res = await fetch(
        "/executor/available-orders?" + params.toString(),
        { credentials: "include" }
      );

      if (!res.ok) return;

      const data = await res.json();
      setOrders(data.orders || []);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [service]);

   useEffect(() => {
    if (orders.length > prevCount) {
      const diff = orders.length - prevCount;

      setNewCount(diff);

      if ("vibrate" in navigator) {
        navigator.vibrate([200, 100, 200]);
      }

      try {
        const audio = new Audio(
          "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
        );
        audio.play().catch(() => {});
      } catch (e) {}
    }

    setPrevCount(orders.length);
  }, [orders]);

  async function accept(id) {
    setBusy(true);

    try {
      const res = await fetch(`/orders/${id}/executor-action`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.detail || "Не удалось принять заказ");
        return;
      }

      alert("Заказ принят");
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h2 onClick={() => setNewCount(0)}>Доступные заказы</h2>
	{newCount > 0 && (
  <div style={{
    padding: 14,
    borderRadius: 14,
    background: "#6545ed",
    color: "#fff",
    fontWeight: 700,
    marginBottom: 12,
  }}>
    Новых заказов: {newCount}
  </div>
)}

      <div style={{
        display: "flex",
        gap: 8,
        overflowX: "auto",
        paddingBottom: 8,
        marginBottom: 12,
      }}>
        {FILTERS.map(filter => (
          <button
            key={filter.id}
            onClick={() => setService(filter.id)}
            style={{
              minWidth: 110,
              padding: 11,
              borderRadius: 14,
              border: 0,
              background: service === filter.id ? "#6545ed" : "#fff",
              color: service === filter.id ? "#fff" : "#232139",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {filter.title}
          </button>
        ))}
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {orders.length === 0 && (
        <div style={{
          padding: 20,
          borderRadius: 22,
          background: "#fff",
          color: "#858197",
        }}>
          Свободных заказов пока нет
        </div>
      )}

      {orders.map(order => (
        <div key={order.id} style={{
          padding: 18,
          borderRadius: 22,
          background: "#fff",
          marginBottom: 12,
        }}>
          <strong>Заказ №{order.id}</strong>
          <p style={{ margin: "6px 0", color: "#858197", fontSize: 13 }}>
            {order.service} · {order.tariff_code}
          </p>
          <p style={{ margin: "6px 0" }}>
            {order.from_address} → {order.to_address}
          </p>
          <p style={{ margin: "6px 0", color: "#858197", fontSize: 13 }}>
            Расстояние: {order.distance_km} км
          </p>
          <strong style={{ fontSize: 20 }}>{order.total_price} ₽</strong>

          <button
            onClick={() => accept(order.id)}
            disabled={busy}
            style={{
              width: "100%",
              marginTop: 12,
              padding: 14,
              borderRadius: 13,
              border: 0,
              background: "#6545ed",
              color: "#fff",
              fontWeight: 700,
            }}
          >
            {busy ? "Принимаем…" : "Принять заказ"}
          </button>
        </div>
      ))}
    </div>
  );
}
