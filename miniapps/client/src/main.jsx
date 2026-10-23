import React from "react";
import { createRoot } from "react-dom/client";
import AuthGate from "./AuthGate.jsx";
import App from "./App.jsx";

// Миниап в MAX ведёт себя как нативное приложение: запрещаем выделение
// текста и контекстное меню копирования. В полях ввода выделение работает.
const guard = document.createElement("style");
guard.textContent =
  "html{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}" +
  "input,textarea{-webkit-user-select:text;user-select:text}";
document.head.appendChild(guard);
document.addEventListener("contextmenu", (e) => e.preventDefault());

createRoot(document.getElementById("root")).render(
  <AuthGate>
    <App />
  </AuthGate>
);
