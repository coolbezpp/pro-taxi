import React from "react";

// Заглушка «откройте в MAX»: в обычном браузере миниапп исполнителя
// не открывается — приложение работает только внутри мессенджера MAX.
export default function MaxGate() {
  return (
    <div style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 16,
      padding: 28, textAlign: "center",
      background: "#0e1116", color: "#f5f7fa", fontFamily: "system-ui",
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 20, background: "#2f7bff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 900, fontSize: 30, color: "#fff",
      }}>П</div>
      <h1 style={{ margin: 0, fontSize: 21, fontWeight: 900 }}>
        Откройте приложение в MAX
      </h1>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#aeb6c2", maxWidth: 330 }}>
        «Про» — мини-приложение мессенджера MAX: открывайте его оттуда —
        вход по подписи MAX, уведомления и быстрые заказы работают только внутри.
      </p>
      <div style={{
        fontSize: 12.5, color: "#8b93a3", background: "#171c24",
        border: "1px solid #232a35", borderRadius: 12, padding: "11px 15px",
        maxWidth: 330, lineHeight: 1.55,
      }}>
        Откройте MAX → найдите бота сервиса → «Открыть» мини-приложение.
        Прямые ссылки в браузере не работают.
      </div>
    </div>
  );
}
