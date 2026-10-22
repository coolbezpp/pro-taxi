import React, { useEffect, useState } from "react";

const NAMES = {
  taxi: "Такси",
  courier: "Курьерская доставка",
  cargo: "Грузоперевозки",
  master: "Услуги мастеров",
  car_rent: "Аренда автомобилей",
  flat_rent: "Аренда жилья"
};

export default function Commissions({ api }) {
  const [items, setItems] = useState({});
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      setItems(await api("/commissions"));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function save(service) {
    try {
      await api("/commissions", {
        method: "PUT",
        body: JSON.stringify({ service, percent: Number(items[service]) })
      });
      setSaved(NAMES[service]);
      setTimeout(() => setSaved(""), 2000);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <h2>Комиссии по услугам</h2>
      <p style={{ color: "#858197", fontSize: 13 }}>
        Укажите процент, который сервис удерживает с исполнителя за завершённый заказ.
      </p>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {saved && <p style={{ color: "#6545ed" }}>Сохранено: {saved}</p>}

      {Object.keys(NAMES).map(service => (
        <div key={service} style={{ background: "#fff", borderRadius: 16, padding: 14, marginBottom: 10 }}>
          <strong>{NAMES[service]}</strong>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <input
              type="number"
              min="0"
              max="50"
              step="0.5"
              value={items[service] ?? ""}
              onChange={e => setItems({ ...items, [service]: e.target.value })}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #e2ddf2" }}
            />
            <button
              onClick={() => save(service)}
              style={{ padding: "12px 18px", borderRadius: 12, background: "#6545ed", color: "#fff", border: 0, fontWeight: 650 }}
            >
              Сохранить
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
