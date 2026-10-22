import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ContactGate from "./ContactGate.jsx";

createRoot(document.getElementById("root")).render(
  <ContactGate>
    <App />
  </ContactGate>
);
