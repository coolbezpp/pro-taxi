import React, { useEffect, useState } from "react";

const ROLES = {
  driver: "Водитель такси",
  courier: "Курьер",
  cargo: "Грузоперевозчик",
  master: "Мастер",
  car_owner: "Арендодатель авто",
  flat_owner: "Арендодатель жилья"
};

const STATUS = {
  pending: ["На проверке", "#eee9ff", "#6545ed"],
  approved: ["Одобрен", "#e6f7ed", "#177e46"],
  rejected: ["Отклонён", "#ffe9ec", "#d92b45"]
};

async function loadExecutors() {
  const data = await api("/admin/executors");
  return Array.isArray(data) ? data : data.executors || [];
}

export default function Executors({ api }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      setItems(await loadExecutors());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function setStatus(id, status) {
    try {
      await api(`/admin/executors/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status })
      });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <h2>Исполнители и верификация</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}

      {items.map(x => {
        const [label, bg, color] = STATUS[x.status] || STATUS.pending;
        return (
          <div key={x.id} style={{ background: "#fff", borderRadius: 16, padding: 14, marginBottom: 10 }}>
            <strong>{x.name || "Исполнитель"}</strong>
            <p style={{ color: "#858197", fontSize: 12, margin: "4px 0" }}>
              ID MAX: {x.max_id} · {ROLES[x.role] || x.role}
            </p>
            <span style={{ background: bg, color, padding: "6px 10px", borderRadius: 20, fontSize: 11 }}>{label}</span>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => setStatus(x.id, "approved")} style={{ flex: 1, padding: 11, borderRadius: 12, background: "#177e46", color: "#fff", border: 0, fontWeight: 650 }}>
                Одобрить
              </button>
              <button onClick={() => setStatus(x.id, "rejected")} style={{ flex: 1, padding: 11, borderRadius: 12, background: "#ffe9ec", color: "#d92b45", border: 0, fontWeight: 650 }}>
                Отклонить
              </button>
            </div>
          </div>
        );
      })}

      {items.length === 0 && <div style={{ background: "#fff", borderRadius: 16, padding: 16 }}>Исполнителей пока нет</div>}
    </div>
  );
}
