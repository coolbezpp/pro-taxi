import React, { useCallback, useEffect, useState } from "react";

// Вкладка «Антифрод» (docs/ANTIFRAUD.md §5): очередь пар «клиент:исполнитель»
// с риском и сигналами. Автобанов нет — всегда решение человека:
// подтвердить фрод (блок клиента + отстранение исполнителя), ложная
// тревога (снять флаг, пара больше не беспокоит) или эскалация.

const API = "/api";
const PURPLE = "#6545ed";

const STATUS_LABELS = {
  open: "Открыта",
  review: "На проверке",
  under_review: "Под подозрением",
  confirmed: "Фрод подтверждён",
  false_positive: "Ложная тревога",
};

const STATUS_COLORS = {
  open: { background: "#f1f0f7", color: "#5b5670" },
  review: { background: "#fff4e5", color: "#b45309" },
  under_review: { background: "#ffe9ec", color: "#d92b45" },
  confirmed: { background: "#d92b45", color: "#fff" },
  false_positive: { background: "#e6f7ed", color: "#177e46" },
};

function riskColor(score) {
  if (score >= 60) return "#d92b45";
  if (score >= 30) return "#b45309";
  return "#177e46";
}

const BTN = (bg, color = "#fff") => ({
  border: 0, cursor: "pointer", borderRadius: 10,
  padding: "9px 14px", fontSize: 13, fontWeight: 700,
  background: bg, color, fontFamily: "inherit",
});

export default function Fraud() {
  const [items, setItems] = useState([]);
  const [showResolved, setShowResolved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Что отправляем по каждой карточке: комментарий и дни отстранения
  const [form, setForm] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${API}/admin/fraud/queue?show_resolved=${showResolved ? "true" : "false"}`,
        { credentials: "include" }
      );
      if (res.status === 401) {
        setError("Требуется вход в панель");
        return;
      }
      const data = await res.json().catch(() => ({}));
      setItems(data.items || []);
    } catch (e) {
      setError("Не удалось загрузить очередь");
    } finally {
      setLoading(false);
    }
  }, [showResolved]);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(id, action) {
    const f = form[id] || {};
    if (action === "confirm_fraud"
      && !window.confirm("Подтвердить фрод? Клиент потеряет доступ к заказам, исполнитель будет отстранён.")) {
      return;
    }
    if (action === "false_positive"
      && !window.confirm("Пара проверена и больше не будет беспокоить?")) {
      return;
    }
    setBusyId(id);
    setMsg("");
    try {
      const res = await fetch(`${API}/admin/fraud/${id}/resolve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          comment: f.comment || null,
          days: f.days ? Number(f.days) : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.detail || "Не удалось сохранить решение");
        return;
      }
      setMsg("Решение сохранено");
      load();
    } catch (e) {
      setMsg("Сеть недоступна — попробуйте ещё раз");
    } finally {
      setBusyId(null);
    }
  }

  const set = (id, patch) =>
    setForm((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));

  const active = items.filter((i) => !["confirmed", "false_positive"].includes(i.status));
  const resolved = items.filter((i) => ["confirmed", "false_positive"].includes(i.status));
  const list = showResolved ? items : active;

  return (
    <div>
      <div style={{
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        marginBottom: 14,
      }}>
        <button type="button" onClick={load} style={BTN("#efedf9", PURPLE)}>
          {loading ? "Загрузка…" : "Обновить"}
        </button>
        <button
          type="button"
          onClick={() => setShowResolved((v) => !v)}
          style={BTN(showResolved ? PURPLE : "#efedf9", showResolved ? "#fff" : PURPLE)}
        >
          Решённые ({resolved.length})
        </button>
        <span style={{ fontSize: 13, color: "#7a7590" }}>
          Активных: {active.length}
        </span>
        {msg && <span style={{ fontSize: 13, color: PURPLE, fontWeight: 700 }}>{msg}</span>}
        {error && <span style={{ fontSize: 13, color: "#d92b45" }}>{error}</span>}
      </div>

      {list.length === 0 && !loading && (
        <div style={{
          padding: "28px 18px", borderRadius: 14, background: "#fff",
          border: "1px solid #e2dff0", fontSize: 14, color: "#7a7590",
          textAlign: "center",
        }}>
          Подозрительных пар нет — сервис чист 👍
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {list.map((it) => {
          const f = form[it.id] || {};
          const done = ["confirmed", "false_positive"].includes(it.status);
          return (
            <div key={it.id} style={{
              background: "#fff", borderRadius: 14,
              border: `1px solid ${it.status === "under_review" ? "#ffd4da" : "#e2dff0"}`,
              padding: 16,
            }}>
              {/* Шапка: пара + скор + статус */}
              <div style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10,
              }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {it.client?.name || `Клиент #${it.client?.id}` }
                  <span style={{ color: "#a9a4bd", margin: "0 8px" }}>↔</span>
                  {it.executor?.name || `Исполнитель #${it.executor?.id}`}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{
                    fontSize: 16, fontWeight: 800, color: riskColor(it.risk_score),
                  }}>
                    {Math.round(it.risk_score)}/100
                  </span>
                  <span style={{
                    fontSize: 12, fontWeight: 700, borderRadius: 999,
                    padding: "4px 10px", ...STATUS_COLORS[it.status],
                  }}>
                    {STATUS_LABELS[it.status] || it.status}
                  </span>
                </div>
              </div>

              {/* Контакты и блокировки */}
              <div style={{ fontSize: 12.5, color: "#7a7590", marginBottom: 10 }}>
                Клиент: {it.client?.phone || "—"}
                {it.client?.blocked && (
                  <span style={{ color: "#d92b45", fontWeight: 700 }}> · заказы заблокированы</span>
                )}
                <br />
                Исполнитель: {it.executor?.phone || "—"}
              </div>

              {/* Сработавшие сигналы */}
              <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                {it.signals.map((s) => (
                  <div key={s.code} style={{
                    display: "flex", justifyContent: "space-between", gap: 10,
                    fontSize: 13, background: "#f8f7fc", borderRadius: 8,
                    padding: "7px 10px",
                  }}>
                    <span>{s.label}</span>
                    <span style={{ fontWeight: 800, color: riskColor(s.weight * 2) }}>
                      +{s.weight}
                    </span>
                  </div>
                ))}
                {it.signals.length === 0 && (
                  <div style={{ fontSize: 13, color: "#7a7590" }}>
                    Активных сигналов нет
                  </div>
                )}
              </div>

              {!done && (
                <>
                  <input
                    value={f.comment || ""}
                    onChange={(e) => set(it.id, { comment: e.target.value })}
                    placeholder="Комментарий к решению (необязательно)"
                    style={{
                      width: "100%", boxSizing: "border-box", padding: "9px 12px",
                      borderRadius: 10, border: "1px solid #e2dff0", fontSize: 13,
                      fontFamily: "inherit", marginBottom: 10,
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      type="button"
                      disabled={busyId === it.id}
                      onClick={() => resolve(it.id, "confirm_fraud")}
                      style={BTN(busyId === it.id ? "#e08a95" : "#d92b45")}
                    >
                      Подтвердить фрод
                    </button>
                    <input
                      type="number" min={1} max={3650}
                      value={f.days || ""}
                      onChange={(e) => set(it.id, { days: e.target.value })}
                      placeholder="дней отстранения"
                      title="На сколько дней отстранить исполнителя (по умолчанию 90)"
                      style={{
                        width: 130, padding: "8px 10px", borderRadius: 10,
                        border: "1px solid #e2dff0", fontSize: 13, fontFamily: "inherit",
                      }}
                    />
                    <button
                      type="button"
                      disabled={busyId === it.id}
                      onClick={() => resolve(it.id, "false_positive")}
                      style={BTN("#177e46")}
                    >
                      Ложная тревога
                    </button>
                    <button
                      type="button"
                      disabled={busyId === it.id}
                      onClick={() => resolve(it.id, "escalate")}
                      style={BTN("#efedf9", PURPLE)}
                    >
                      Эскалировать
                    </button>
                  </div>
                </>
              )}

              {done && it.comment && (
                <div style={{ fontSize: 12.5, color: "#7a7590", fontStyle: "italic" }}>
                  «{it.comment}» — {it.resolved_by}
                  {it.resolved_at ? `, ${it.resolved_at.slice(0, 10)}` : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
