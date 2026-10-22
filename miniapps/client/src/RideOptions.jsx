import React, { useEffect, useRef } from "react";
import { useTheme } from "./theme.js";

export default function RideOptions({ value, onChange, onClose }) {
  const dialog = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const { t } = useTheme();

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();

    function handleKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === "Tab") {
        const items = [...(dialog.current?.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), [tabindex="0"]'
        ) || [])];
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      previousFocus?.focus?.();
    };
  }, []);

  const update = (key, next) => onChange({ ...value, [key]: next });
  const extra = 50 * Number(Boolean(value.animals))
    + 50 * value.child_seats;

  const row = {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    gap: 16, padding: "17px 0", borderBottom: `1px solid ${t.border}`
  };
  const step = {
    width: 36, height: 36, border: 0, borderRadius: 10,
    background: t.accentSoft, color: t.accent, fontSize: 23
  };
  const note = { color: t.sub, fontSize: 12, marginTop: 5 };

  function counter(key, label) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" aria-label={`Уменьшить: ${label}`}
          style={step} disabled={value[key] <= 0}
          onClick={() => update(key, Math.max(0, value[key] - 1))}>−</button>
        <span style={{ minWidth: 18, textAlign: "center" }}>{value[key]}</span>
        <button type="button" aria-label={`Увеличить: ${label}`}
          style={step}
          disabled={key === "child_seats" && value[key] >= 2}
          onClick={() => update(key, key === "child_seats"
            ? Math.min(2, Number(value[key] || 0) + 1)
            : Number(value[key] || 0) + 1)}>+</button>
      </div>
    );
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 10000,
      background: "rgba(0,0,0,.55)", display: "flex",
      alignItems: "flex-end", justifyContent: "center"
    }}>
      <style>{`
        @keyframes proRideOptionsIn {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .pro-ride-options { animation: proRideOptionsIn .24s ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .pro-ride-options { animation: none; }
        }
      `}</style>
      <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true"
        aria-labelledby="ride-options-title"
        className="pro-ride-options"
        onClick={event => event.stopPropagation()}
        style={{
          width: "100%", maxWidth: 540, maxHeight: "85dvh",
          overflowY: "auto", boxSizing: "border-box",
          borderRadius: "24px 24px 0 0", background: t.card,
          color: t.text, padding: "12px 20px",
          paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))"
        }}>
        <div style={{
          width: 38, height: 4, background: t.handle,
          borderRadius: 4, margin: "0 auto 15px"
        }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 id="ride-options-title" style={{ margin: 0, fontSize: 22 }}>Допуслуги</h2>
          <button type="button" aria-label="Закрыть меню" onClick={onClose}
            style={{ ...step, background: t.softPanel, color: t.sub }}>×</button>
        </div>

        

        

        <div style={row}>
          <div>
            <div>Детские кресла</div>
            <div style={note}>+50 ₽ за каждое · максимум 2</div>
          </div>
          {counter("child_seats", "Количество детских кресел")}
        </div>

        <label style={row}>
          <div>
            <div>Своё детское кресло</div>
            <div style={{ ...note, color: t.successText }}>Без доплаты</div>
          </div>
          <input type="checkbox" role="switch"
            checked={Boolean(value.own_child_seat)}
            onChange={event => update("own_child_seat", event.target.checked)}
            style={{ width: 24, height: 24, accentColor: t.accent, flexShrink: 0 }} />
        </label>

        <label style={row}>
          <div>
            <div>С животным</div>
            <div style={note}>+50 ₽</div>
          </div>
          <input type="checkbox" role="switch" checked={value.animals}
            onChange={event => update("animals", event.target.checked)}
            style={{ width: 24, height: 24, accentColor: t.accent, flexShrink: 0 }} />
        </label>

        <label style={row}>
          <div>
            <div>С инвалидным креслом</div>
            <div style={{ ...note, color: t.successText }}>Без доплаты</div>
          </div>
          <input type="checkbox" role="switch" checked={value.wheelchair}
            onChange={event => update("wheelchair", event.target.checked)}
            style={{ width: 24, height: 24, accentColor: t.accent, flexShrink: 0 }} />
        </label>

        <div style={{
          display: "flex", justifyContent: "space-between",
          padding: "18px 0", fontWeight: 700
        }}>
          <span>Доплата за опции</span>
          <span>{extra} ₽</span>
        </div>

        <button type="button" onClick={onClose} style={{
          width: "100%", padding: 16, border: 0, borderRadius: 14,
          background: t.accent, color: t.onAccent, fontSize: 16, fontWeight: 700
        }}>Применить</button>
        <div style={{ ...note, textAlign: "center", marginTop: 10 }}>
          Изменения сохраняются сразу. После изменения рассчитайте стоимость заново.
        </div>
      </section>
    </div>
  );
}
