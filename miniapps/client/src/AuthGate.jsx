import React, { useEffect, useRef, useState } from "react";
import { useTheme } from "./theme.js";

const API = import.meta.env.VITE_API_URL || "/api";

// Объект миниаппа может жить в разных местах: официальный SDK MAX задаёт
// window.WebApp, часть клиентов инжектит window.Max / window.Max.WebApp,
// Telegram-совместимость — window.Telegram.WebApp. Ищем во всех местах,
// как это делает ContactGate исполнителя (там верификация в проде работает).
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
    window.Max?.WebApp?.initData ||
    window.WebApp?.initData ||
    window.Telegram?.WebApp?.initData ||
    new URLSearchParams(window.location.search).get("initData") ||
    ""
  );
}

// Запрос номера реально работает только внутри оболочки MAX
// (native webview-мост или iframe-режим). В обычном браузере автозапрос
// завис бы на 60 секунд до таймаута SDK — там сразу показываем кнопку.
function inMaxShell() {
  try {
    return Boolean(window.WebViewHandler) || window.self !== window.top;
  } catch (_) {
    return false;
  }
}

export default function AuthGate({ children }) {
  const [token] = useState(() => localStorage.getItem("token"));
  // Номер подтверждаем при каждом открытии миниаппа — так же, как у
  // исполнителя (ContactGate): один раз подтвердил — сессия вошла.
  const [confirmed] = useState(
    () =>
      sessionStorage.getItem("client_contact_ok") === "1" &&
      Boolean(localStorage.getItem("token"))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const autoAsked = useRef(false);
  const { t } = useTheme();

  async function login() {
    const webApp = getWebApp();
    const initData = webApp?.initData || getInitData();

    if (!initData) {
      setError("Откройте приложение через кнопку в MAX.");
      return;
    }
    if (!webApp || typeof webApp.requestContact !== "function") {
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
          init_data: initData,
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
      sessionStorage.setItem("client_contact_ok", "1");
      window.location.reload();
    } catch (e) {
      // PRO_ERROR_DEBUG
      let message;
      if (e && typeof e === "object" && e.error?.code) {
        message =
          "MAX не ответил на запрос номера. Попробуйте ещё раз или откройте приложение через кнопку MAX.";
      } else {
        try {
          message = typeof e === "object"
            ? JSON.stringify(e)
            : String(e);
        } catch {
          message = String(e);
        }
      }
      setError(message || "Неизвестная ошибка входа");
    } finally {
      setBusy(false);
    }
  }

  // В MAX номер спрашиваем сразу при открытии; кнопка остаётся для
  // повторной попытки и для открытия вне оболочки MAX.
  useEffect(() => {
    if (confirmed || autoAsked.current) return;
    const webApp = getWebApp();
    if (
      inMaxShell() &&
      webApp &&
      typeof webApp.requestContact === "function"
    ) {
      autoAsked.current = true;
      login();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (confirmed && token) return children;

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
          {busy ? "Подтверждаем…" : "Подтвердить номер"}
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
