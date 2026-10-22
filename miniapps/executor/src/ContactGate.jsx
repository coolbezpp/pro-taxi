import React, { useEffect, useState } from "react";
import { useTheme } from "./theme.js";
import { setExecutorToken } from "./api.js";

function getWebApp() {
  return (
    window.Max?.WebApp ||
    window.Max ||
    window.WebApp ||
    window.Telegram?.WebApp ||
    null
  );
}

function getInitData() {
  return (
    window.Max?.initData ||
    window.WebApp?.initData ||
    window.Telegram?.WebApp?.initData ||
    new URLSearchParams(window.location.search).get("initData") ||
    ""
  );
}

export default function ContactGate({ children }) {
  const [state, setState] = useState(
    sessionStorage.getItem("executor_contact_ok") === "1" ? "ready" : "ask"
  );
  const [error, setError] = useState("");
  const { t } = useTheme();

  useEffect(() => {
    if (state === "ask") {
      requestContact();
    }
  }, [state]);

  async function requestContact() {
    try {
      setError("");
      const webApp = getWebApp();

      if (!webApp || typeof webApp.requestContact !== "function") {
        throw new Error("Приложение MAX не предоставило запрос номера");
      }

      const contact = await webApp.requestContact();

      if (!contact || typeof contact !== "object") {
        throw new Error("Номер не был передан");
      }
      if (!contact.phone || !contact.hash || !contact.authDate) {
        throw new Error("Неполные данные номера телефона");
      }

      const res = await fetch("/api/executors/auth/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData: getInitData(),
          contact,
        }),
      });

      if (!res.ok) {
        let message = "Не удалось подтвердить номер";
        try {
          const data = await res.json();
          message = data.detail || message;
        } catch (_) {}
        throw new Error(message);
      }

      const payload = await res.json().catch(() => ({}));
      if (payload?.token) setExecutorToken(payload.token);
      sessionStorage.setItem("executor_contact_ok", "1");
      setState("ready");
    } catch (e) {
      setError(e.message || "Не удалось подтвердить номер");
      setState("error");
    }
  }

  if (state === "ready") {
    return children;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
        background: t.bg,
        color: t.text,
      }}
    >
      <h1 style={{ fontSize: 22, margin: 0 }}>Подтвердите номер</h1>
      <p style={{ margin: 0, color: t.sub }}>
        Для входа в приложение исполнителя подтвердите номер телефона.
      </p>

      {error ? (
        <div style={{ color: t.danger, maxWidth: 360 }}>{error}</div>
      ) : null}

      <button
        onClick={requestContact}
        style={{
          padding: "14px 22px",
          borderRadius: 14,
          border: "none",
          background: t.cta,
          color: t.onCta,
          fontSize: 16,
          fontWeight: 800,
          boxShadow: "0 10px 24px -10px rgba(255,205,45,.6)",
        }}
      >
        Поделиться номером
      </button>
    </div>
  );
}
