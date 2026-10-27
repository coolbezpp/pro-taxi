import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ContactGate from "./ContactGate.jsx";
import MaxGate from "./MaxGate.jsx";
import { isMaxEnv } from "./maxGate.js";

// Миниап в MAX ведёт себя как нативное приложение: запрещаем выделение
// текста и контекстное меню копирования. В полях ввода выделение работает.
const guard = document.createElement("style");
guard.textContent =
  "html{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}" +
  "input,textarea{-webkit-user-select:text;user-select:text}";
document.head.appendChild(guard);
document.addEventListener("contextmenu", (e) => e.preventDefault());

// Гейт «только MAX» — до всего рендера: вне мессенджера не показываем
// ни контакт-гейт, ни приложение
createRoot(document.getElementById("root")).render(
  isMaxEnv() ? (
    <ContactGate>
      <App />
    </ContactGate>
  ) : (
    <MaxGate />
  )
);
