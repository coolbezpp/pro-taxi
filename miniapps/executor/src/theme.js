import { useEffect, useState } from "react";

// Темы миниаппа: светлая, тёмная и системная (следит за настройкой телефона).
// Палитра: белый фон, ярко-синий акцент, жёлтая кнопка действия — как в
// современных российских супераппах.
export const THEME_KEY = "pro_theme";

export const LIGHT = {
  mode: "light",
  bg: "#f5f7fa",
  card: "#ffffff",
  text: "#17181d",
  sub: "#7c838c",
  border: "#ebeef2",
  inputBg: "#f1f4f8",
  accent: "#2c7bf6",
  accentStrong: "#1e5fcb",
  accentSoft: "#eaf2fe",
  onAccent: "#ffffff",
  cta: "#ffdd2d",
  onCta: "#14171f",
  danger: "#ff3b5d",
  dangerSoft: "#ffe9ee",
  success: "#17b26a",
  successSoft: "#e4f7ee",
  green: "#0fb5ba",
  greenSoft: "#dff6f6",
  amber: "#f97316",
  amberSoft: "#ffede0",
  sky: "#38bdf8",
  skySoft: "#e1f3fe",
  pink: "#ec4899",
  pinkSoft: "#fde7f1",
  violet: "#6366f1",
  violetSoft: "#e7e9ff",
  shadow: "0 10px 30px rgba(28,37,49,0.08)",
  navBg: "rgba(255,255,255,0.94)",
  onHero: "#ffffff",
  onHeroMuted: "rgba(255,255,255,0.85)",
  // Карта и панели
  mapBg: "#e7ecf1",
  markerA: "#2c7bf6",
  markerB: "#12b76a",
  onSolid: "#ffffff",
  handle: "#d6dbe1",
  softPanel: "#f4f6f9",
  inverseBg: "#14171f",
  inverseText: "#ffffff",
  successText: "#16834b",
  sheetShadow: "0 -10px 34px rgba(16,19,25,0.14)",
  mediaPlaceholder: "linear-gradient(135deg,#eaeff5,#d9e1ea)",
};

export const DARK = {
  mode: "dark",
  bg: "#12151c",
  card: "#1b2029",
  text: "#f2f5f9",
  sub: "#98a2b0",
  border: "#262d38",
  inputBg: "#232a35",
  accent: "#4e9bff",
  accentStrong: "#2c7bf6",
  accentSoft: "#1f2c40",
  onAccent: "#ffffff",
  cta: "#ffdd2d",
  onCta: "#14171f",
  danger: "#ff6b82",
  dangerSoft: "#3a2029",
  success: "#4ade9b",
  successSoft: "#16302a",
  green: "#34d3a0",
  greenSoft: "#14332f",
  amber: "#ffa24d",
  amberSoft: "#33261a",
  sky: "#7dd3fc",
  skySoft: "#13303f",
  pink: "#f472b6",
  pinkSoft: "#3a1f2e",
  violet: "#8b93ff",
  violetSoft: "#26294b",
  shadow: "0 12px 32px rgba(0,0,0,0.5)",
  navBg: "rgba(18,21,28,0.94)",
  onHero: "#ffffff",
  onHeroMuted: "rgba(255,255,255,0.85)",
  // Карта и панели
  mapBg: "#14181e",
  markerA: "#4e9bff",
  markerB: "#34d3a0",
  onSolid: "#0b0d10",
  handle: "#39414b",
  softPanel: "#232a35",
  inverseBg: "#f2f5f9",
  inverseText: "#12151c",
  successText: "#4ade9b",
  sheetShadow: "0 -10px 34px rgba(0,0,0,0.45)",
  mediaPlaceholder: "linear-gradient(135deg,#242838,#101319)",
};

// Палитра экранов профиля — стиль меню настроек мессенджера MAX.
export const PROFILE_LIGHT = {
  bg: "#f2f3f6",
  card: "#ffffff",
  cardAlt: "#ffffff",
  cardAltBorder: "#e6e9ee",
  text: "#14171c",
  sub: "#8a9199",
  icon: "#3a4046",
  chevron: "#b9bfc5",
  link: "#2f8fe8",
  invite: "#8b6cf5",
  danger: "#d92b45",
  avatarBg: "#e8eaee",
};

export const PROFILE_DARK = {
  bg: "#0b0d10",
  card: "#1f2429",
  cardAlt: "#161a1f",
  cardAltBorder: "#242a31",
  text: "#f2f4f6",
  sub: "#8a9199",
  icon: "#e8ebef",
  chevron: "#6e747b",
  link: "#3d9cf5",
  invite: "#a688ff",
  danger: "#ff5560",
  avatarBg: "#262c32",
};

export function maxPalette(mode) {
  return mode === "dark" ? PROFILE_DARK : PROFILE_LIGHT;
}

function osPrefersDark() {  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function useTheme() {
  const [setting, setSetting] = useState(
    () => localStorage.getItem(THEME_KEY) || "system"
  );
  const [osDark, setOsDark] = useState(osPrefersDark);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = e => setOsDark(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
  }, []);

  const resolved = setting === "system" ? (osDark ? "dark" : "light") : setting;
  const t = resolved === "dark" ? DARK : LIGHT;

  // Фон за пределами «телефона» (overscroll) тоже перекрашиваем
  useEffect(() => {
    document.body.style.background = t.bg;
    document.body.style.colorScheme = t.mode;
    document.documentElement.style.colorScheme = t.mode;
  }, [t]);

  function choose(next) {
    localStorage.setItem(THEME_KEY, next);
    setSetting(next);
  }

  return { setting, choose, t, resolved };
}

// Дата мероприятий: «14 окт · 19:00»
export function formatEventDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;

  const day = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(d);

  const hh = d.getHours();
  const mm = d.getMinutes();
  if (hh === 0 && mm === 0) return day;
  return `${day} · ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
