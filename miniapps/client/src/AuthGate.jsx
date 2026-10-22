import React, { useState } from "react";
import { useTheme } from "./theme.js";

const API = import.meta.env.VITE_API_URL || "/api";

export default function AuthGate({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { t } = useTheme();

  async function login() {
    const webApp = window.WebApp;

    if (!webApp?.initData) {
      setError("Откройте приложение через кнопку в MAX.");
      return;
    }
    if (typeof webApp.requestContact !== "function") {
      setError("Ваш клиент MAX не поддерживает запрос номера телефона.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      // PRO_CONTACT_OBJECT_AUTH
      const contact = await webApp.requestContact();

      if (!contact || typeof contact !== "object") {
        setError("MAX не передал данные подтверждения номера.");
        return;
      }
      if (!contact.phone || !contact.hash || !contact.authDate) {
        setError("MAX передал неполные данные подтверждения номера.");
        return;
      }

      const response = await fetch(API + "/auth/max/miniapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          init_data: webApp.initData,
          contact
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof data.detail === "object"
            ? JSON.stringify(data.detail)
            : (data.detail || "Не удалось авторизоваться")
        );
      }
      if (!data.token) {
        throw new Error("Сервер не вернул токен");
      }

      localStorage.setItem("token", data.token);
      setToken(data.token);
    } catch (e) {
      // PRO_ERROR_DEBUG
      let message;
      try {
        message = typeof e === "object"
          ? JSON.stringify(e)
          : String(e);
      } catch {
        message = String(e);
      }
      setError(message || "Неизвестная ошибка входа");
    } finally {
      setBusy(false);
    }
  }

  if (token) return children;

  return (
    <div style={{
      minHeight: "100dvh", display: "flex",
      alignItems: "center", justifyContent: "center",
      padding: 24, background: t.bg,
      color: t.text, fontFamily: "system-ui"
    }}>
      <div style={{
        width: "100%", maxWidth: 380, background: t.card,
        border: `1px solid ${t.border}`,
        borderRadius: 18, padding: 22, textAlign: "center"
      }}>
        <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Про</h1>
        <p style={{ fontSize: 14, color: t.sub, margin: "0 0 18px" }}>
          Для заказа поездки подтвердите номер телефона в MAX.
        </p>

        <button
          type="button"
          onClick={login}
          disabled={busy}
          style={{
            width: "100%", padding: 14, border: 0,
            borderRadius: 14, background: t.cta, color: t.onCta,
            fontWeight: 850, cursor: "pointer",
            boxShadow: "0 10px 24px -10px rgba(255,205,45,.6)",
            opacity: busy ? 0.7 : 1
          }}
        >
          {busy ? "Подтверждаем…" : "Войти через MAX"}
        </button>

        {error && (
          <p role="alert" style={{
            color: t.danger, fontSize: 13,
            marginTop: 12, marginBottom: 0
          }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
