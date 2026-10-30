import React, { useCallback, useEffect, useState } from "react";

// Вкладка «Адреса»: собственный справочник адресов с приоритетом над OSM
// в подсказках (/api/geo/search). Посёлки, новостройки и «кривые» адреса,
// которых нет в OpenStreetMap: админ добавляет город + название + точку,
// и адрес первым появляется клиенту в поле подачи/назначения.

const API = "/api";
const PURPLE = "#6545ed";

const BTN = (bg, color = "#fff") => ({
  border: 0, cursor: "pointer", borderRadius: 10,
  padding: "9px 14px", fontSize: 13, fontWeight: 700,
  background: bg, color, fontFamily: "inherit",
});

const INPUT = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px",
  fontSize: 13, borderRadius: 9, border: "1px solid #d9d5ea",
  fontFamily: "inherit", background: "#fff",
};

const emptyForm = { city: "", title: "", lat: "", lon: "", active: true };

export default function Addresses() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/admin/addresses`, { credentials: "include" });
      if (res.status === 401) {
        setError("Требуется вход в панель");
        return;
      }
      const data = await res.json().catch(() => ({}));
      setItems(data.addresses || []);
    } catch (e) {
      setError("Не удалось загрузить адреса");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e) {
    e.preventDefault();
    if (!form.city.trim() || !form.title.trim()) {
      setError("Город и название обязательны");
      return;
    }
    const lat = parseFloat(form.lat);
    const lon = parseFloat(form.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      setError("Широта и долгота — числа (например 44.89 / 37.32)");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const payload = {
        city: form.city.trim(),
        title: form.title.trim(),
        lat, lon,
        active: form.active,
      };
      const url = editingId
        ? `${API}/admin/addresses/${editingId}`
        : `${API}/admin/addresses`;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        setError("Требуется вход в панель");
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail || "Не удалось сохранить адрес");
        return;
      }
      setMsg(editingId ? "Адрес обновлён" : "Адрес добавлен");
      setForm(emptyForm);
      setEditingId(null);
      load();
    } catch (e2) {
      setError("Сеть недоступна");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(a) {
    const res = await fetch(`${API}/admin/addresses/${a.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ city: a.city, title: a.title, lat: a.lat, lon: a.lon, active: !a.active }),
    });
    if (res.ok) load();
  }

  async function remove(a) {
    if (!window.confirm(`Удалить адрес «${a.title}» (${a.city})?`)) return;
    const res = await fetch(`${API}/admin/addresses/${a.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) load();
  }

  function edit(a) {
    setEditingId(a.id);
    setForm({
      city: a.city,
      title: a.title,
      lat: String(a.lat),
      lon: String(a.lon),
      active: a.active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div>
      {/* Форма добавления/редактирования */}
      <form onSubmit={submit} style={{
        background: "#fff", borderRadius: 14, border: "1px solid #e2dff0",
        padding: 16, marginBottom: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>
          {editingId ? `Редактирование адреса #${editingId}` : "Новый адрес"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ fontSize: 12, color: "#7a7590" }}>
            Город
            <input
              style={INPUT} value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              placeholder="Анапа"
            />
          </label>
          <label style={{ fontSize: 12, color: "#7a7590" }}>
            Название адреса
            <input
              style={INPUT} value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="ул. Ленина, 15"
            />
          </label>
          <label style={{ fontSize: 12, color: "#7a7590" }}>
            Широта (lat)
            <input
              style={INPUT} value={form.lat}
              onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
              placeholder="44.8908"
            />
          </label>
          <label style={{ fontSize: 12, color: "#7a7590" }}>
            Долгота (lon)
            <input
              style={INPUT} value={form.lon}
              onChange={(e) => setForm((f) => ({ ...f, lon: e.target.value }))}
              placeholder="37.3164"
            />
          </label>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <button type="submit" disabled={busy} style={BTN(PURPLE)}>
            {busy ? "Сохраняю…" : editingId ? "Сохранить" : "Добавить"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => { setEditingId(null); setForm(emptyForm); }}
              style={BTN("#efedf9", PURPLE)}
            >
              Отмена
            </button>
          )}
          <label style={{ fontSize: 12.5, color: "#7a7590", display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox" checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            Активен (виден в подсказках)
          </label>
        </div>
      </form>

      {/* Строка статуса */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={load} style={BTN("#efedf9", PURPLE)}>
          {loading ? "Загрузка…" : "Обновить"}
        </button>
        <span style={{ fontSize: 13, color: "#7a7590" }}>Всего: {items.length}</span>
        {msg && <span style={{ fontSize: 13, color: PURPLE, fontWeight: 700 }}>{msg}</span>}
        {error && <span style={{ fontSize: 13, color: "#d92b45" }}>{error}</span>}
      </div>

      {/* Список адресов */}
      {items.length === 0 && !loading && (
        <div style={{
          padding: "28px 18px", borderRadius: 14, background: "#fff",
          border: "1px solid #e2dff0", fontSize: 14, color: "#7a7590",
          textAlign: "center",
        }}>
          Справочник пуст. Добавьте адрес — он первым появится в подсказках.
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {items.map((a) => (
          <div key={a.id} style={{
            background: "#fff", borderRadius: 12,
            border: `1px solid ${a.active ? "#e2dff0" : "#f0e6d8"}`,
            padding: "12px 14px",
            display: "flex", justifyContent: "space-between",
            alignItems: "center", gap: 10, flexWrap: "wrap",
            opacity: a.active ? 1 : 0.65,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{a.title}</div>
              <div style={{ fontSize: 12, color: "#7a7590" }}>
                {a.city} · {Number(a.lat).toFixed(4)}, {Number(a.lon).toFixed(4)}
                {!a.active && " · отключён"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => toggleActive(a)} style={BTN("#efedf9", PURPLE)}>
                {a.active ? "Выкл" : "Вкл"}
              </button>
              <button type="button" onClick={() => edit(a)} style={BTN("#efedf9", PURPLE)}>
                Изм.
              </button>
              <button type="button" onClick={() => remove(a)} style={BTN("#ffe9ec", "#d92b45")}>
                Удалить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
