import React, { useEffect, useState } from "react";
import OrderForm from "./OrderForm.jsx";
import OrderSearch from "./OrderSearch.jsx";
import { api } from "./api.js";
import { ActiveOrderCard, useSummary } from "./Summary.jsx";
import { useTheme, formatEventDate, maxPalette } from "./theme.js";

// Штриховые SVG-иконки (stroke 2.2) — единый набор приложения.
const ICONS = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      <path d="M10 21v-6h4v6" />
    </>
  ),
  orders: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  chat: (
    <>
      <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4 3 1.1-4.3A7.5 7.5 0 1 1 20 11.5z" />
      <path d="M9 11.5h.01M12.5 11.5h.01M16 11.5h.01" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  taxi: (
    <>
      <rect x="9.7" y="2.7" width="4.6" height="2.4" rx="0.9" />
      <path d="M4.4 15.7v-3.4l1.8-4A2 2 0 0 1 8 6.9h8a2 2 0 0 1 1.8 1.4l1.8 4v3.4" />
      <path d="M3.2 15.7h17.6" />
      <circle cx="7.6" cy="17.7" r="1.5" />
      <circle cx="16.4" cy="17.7" r="1.5" />
    </>
  ),
  courier: (
    <>
      <path d="M5 8.2h14l-1.2 11a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
      <path d="M9 8.2V6.4a3 3 0 0 1 6 0v1.8" />
    </>
  ),
  truck: (
    <>
      <rect x="2.8" y="6.6" width="9.4" height="9.8" rx="1.2" />
      <path d="M12.2 10.2h3.6l3.4 3.4v2.8h-7z" />
      <path d="M2.8 9.8h9.4" />
      <circle cx="6.6" cy="17.7" r="1.6" />
      <circle cx="16.6" cy="17.7" r="1.6" />
    </>
  ),
  wrench: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  ),
  briefcase: (
    <>
      <rect x="3" y="7.5" width="18" height="12" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3 12.5h18" />
    </>
  ),
  house: (
    <>
      <path d="M3.5 10.6 12 3.6l8.5 7" />
      <path d="M5.6 9.6V20h12.8V9.6" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  key: (
    <>
      <circle cx="7" cy="7" r="3.6" />
      <path d="M9.6 9.6 20.5 20.5" />
      <path d="m16.6 16.6 1.6-1.6" />
      <path d="m14.2 14.2 1.6-1.6" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.8h.01" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  arrowRight: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  id: (
    <>
      <circle cx="12" cy="8.5" r="3" />
      <path d="M7 20a5.2 5.2 0 0 1 10 0" />
      <rect x="3.5" y="3" width="17" height="18" rx="3" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.3 3.8 5.2 3.8 8.5s-1.3 6.2-3.8 8.5c-2.5-2.3-3.8-5.2-3.8-8.5s1.3-6.2 3.8-8.5z" />
    </>
  ),
  city: (
    <>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="M3 10h18" />
      <path d="M16.5 14.5h.01" />
    </>
  ),
  bell: (
    <>
      <path d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.5 18h15z" />
      <path d="M10 21a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.2 1 5.9L12 17l-5.2 2.8 1-5.9-4.3-4.2 5.9-.9z" />,
  starFilled: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.2 1 5.9L12 17l-5.2 2.8 1-5.9-4.3-4.2 5.9-.9z" />,
  doc: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M13.5 3v4.5H18" />
      <path d="M9 12h6M9 15.5h6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 5.5v5c0 4.6 3 8.9 7 10.5 4-1.6 7-5.9 7-10.5v-5z" />
      <path d="m9 11.8 2.2 2.2L15.5 9.7" />
    </>
  ),
  support: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.8 9.2a2.3 2.3 0 0 1 4.4.8c0 1.5-2.2 1.9-2.2 3.2" />
      <path d="M12 16.6h.01" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />,
  monitor: (
    <>
      <rect x="3" y="4.5" width="18" height="13" rx="2" />
      <path d="M9 21h6M12 17.5V21" />
    </>
  ),
  link: (
    <>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M10.2 6.6 12 4.8a4.07 4.07 0 0 1 5.8 0c1.6 1.6 1.6 4.2 0 5.8L16 12.4" />
      <path d="M13.8 17.4 12 19.2a4.07 4.07 0 0 1-5.8 0c-1.6-1.6-1.6-4.2 0-5.8L8 11.6" />
    </>
  ),
  // Шестерёнка — как вкладка «Настройки» в мессенджере MAX
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.09-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.09 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
};

function Icon({ name, size = 24, style, strokeWidth = 2.2, fill = "none" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flex: "0 0 auto", ...style }}
    >
      {ICONS[name] || null}
    </svg>
  );
}

// Плитки услуг: vivid-градиенты + белые иконки + мягкая цветная тень,
// как на референсе.
const SERVICES = [
  { id: "taxi", icon: "taxi", label: "Такси", grad: "linear-gradient(135deg,#4687f5,#7a5cfa)", glow: "rgba(84,110,246,.45)" },
  { id: "courier", icon: "courier", label: "Курьер", grad: "linear-gradient(135deg,#ffb347,#ff7a2f)", glow: "rgba(255,138,61,.45)" },
  { id: "cargo", icon: "truck", label: "Грузовое", grad: "linear-gradient(135deg,#2bd9a7,#0fb5ba)", glow: "rgba(27,192,178,.45)" },
  { id: "master", icon: "wrench", label: "Мастера", grad: "linear-gradient(135deg,#ff7a93,#f0326e)", glow: "rgba(245,63,120,.45)", badge: "NEW" },
  { id: "tech_help", icon: "key", label: "Автотехпомощь", grad: "linear-gradient(135deg,#38bdf8,#0284c7)", glow: "rgba(14,165,233,.45)", badge: "NEW" },
  { id: "work", icon: "briefcase", label: "Работа", grad: "linear-gradient(135deg,#a78bfa,#6d4ef5)", glow: "rgba(120,96,246,.45)" },
  { id: "cars", icon: "key", label: "Авто", grad: "linear-gradient(135deg,#4fd1ff,#2296f3)", glow: "rgba(47,157,243,.45)" },
  { id: "flats", icon: "house", label: "Жильё", grad: "linear-gradient(135deg,#f482ff,#b13bfb)", glow: "rgba(186,74,251,.45)" },
];

// Услуги автотехпомощи: цена считается на сервере.
// tow (эвакуация) — по тарифу грузоперевозок, sober_driver — 3× тариф такси.
const TECH_HELP_SERVICES = [
  { key: "jump_start",   title: "Прикурить авто",   price: 500,  desc: "Запуск двигателя от постороннего аккумулятора" },
  { key: "tire_inflate", title: "Подкачать колесо", price: 250,  desc: "Подкачка спущенного колеса на месте" },
  { key: "diagnostics",  title: "Диагностика",      price: 1000, desc: "Компьютерная диагностика неисправностей" },
  { key: "tow",          title: "Эвакуация",        price: null, desc: "По тарифу грузоперевозок · только предзаказ" },
  { key: "sober_driver", title: "Трезвый водитель", price: null, desc: "A→B по тройному тарифу такси, мин. 1000 ₽" },
];

const STATUS_RU = {
  created: "Создан",
  assigned: "Назначен исполнитель",
  accepted: "Исполнитель в пути",
  in_progress: "Выполняется",
  completed: "Завершён",
  cancelled: "Отменён",
};

const THEME_OPTIONS = [
  { id: "light", icon: "sun", title: "Светлая" },
  { id: "dark", icon: "moon", title: "Тёмная" },
  { id: "system", icon: "monitor", title: "Системная" },
];

const CITIES = [
  "Анапа", "Краснодар", "Сочи", "Новороссийск", "Армавир", "Ейск", "Кропоткин",
  "Геленджик", "Славянск-на-Кубани", "Туапсе", "Тихорецк", "Крымск", "Тимашевск",
  "Белореченск", "Курганинск", "Лабинск", "Усть-Лабинск", "Кореновск", "Горячий Ключ",
  "Абинск", "Приморско-Ахтарск", "Темрюк", "Полтавская", "Каневская", "Павловская",
  "Староминская", "Ленинградская", "Кущёвская", "Отрадная", "Гулькевичи"
];

const NAV_ITEMS = [
  ["home", "home", "Главная"],
  ["orders", "orders", "Заказы"],
  ["favorites", "star", "Избранные"],
  ["profile", "gear", "Профиль"]
];

export default function App() {
  const { setting, choose, t } = useTheme();
  // Навигация со стеком: кнопка «назад» телефона возвращаем предыдущую страницу,
  // а не закрывает миниапп (см. эффект с WebApp.BackButton ниже).
  const [nav, setNav] = React.useState({ page: "home", stack: [] });
  const page = nav.page;
  const goPage = (next) => {
    // Раздел «Заказы» — всегда свежий список с сервера (не полагаемся
    // только на загрузку при старте: старые веб-вью могли её не дождаться)
    if (next === "orders") loadMyOrders();
    setNav(n => ({ page: next, stack: [...n.stack, n.page] }));
  };
  const backPage = () => setNav(n => (
    n.stack.length ? { page: n.stack[n.stack.length - 1], stack: n.stack.slice(0, -1) } : n
  ));
  const resetPage = (next) => setNav({ page: next, stack: [] });

  // Кнопка «назад» телефона: если есть история внутри миниаппа —
  // возвращаемся на предыдущую страницу; если нет — MAX закроет приложение сам.
  React.useEffect(() => {
    const wb = window.WebApp || window.Max?.WebApp || window.Telegram?.WebApp;
    const bb = wb?.BackButton;
    if (!bb) return;
    const handler = () => backPage();
    try { bb.onClick(handler); } catch (e) {}
    return () => { try { bb.offClick?.(handler); } catch (e) {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Стрелка показывается только когда есть куда возвращаться
  React.useEffect(() => {
    const wb = window.WebApp || window.Max?.WebApp || window.Telegram?.WebApp;
    const bb = wb?.BackButton;
    if (!bb) return;
    try {
      if (nav.stack.length > 0) { bb.show && bb.show(); }
      else { bb.hide && bb.hide(); }
    } catch (e) {}
  }, [nav.stack.length, nav.page]);

  // Отладочный хук для e2e-проверок (в реальном MAX не мешает)
  React.useEffect(() => {
    window.__nav = { page: nav.page, stack: nav.stack, backPage, goPage };
  });
  const [tariff, setTariff] = useState("standard");
  const [intercityAt, setIntercityAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rideOptions, setRideOptions] = useState({
    children: 0,
    animals: false,
    child_seats: 0,
    wheelchair: false,
    own_child_seat: false
  });
  const [order, setOrder] = useState(null);
  const [orders, setOrders] = useState([]);
  const [extras, setExtras] = useState([]);
  const [cargoFrom, setCargoFrom] = useState("");
  const [cargoTo, setCargoTo] = useState("");
  const [cargoDistance, setCargoDistance] = useState(10);
  const [cargoDate, setCargoDate] = useState("");
  const [cargoTime, setCargoTime] = useState("");
  const [loaders, setLoaders] = useState(0);
  const [loaderHours, setLoaderHours] = useState(1);
  const [cargoPrice, setCargoPrice] = useState(null);
  const [masterServices, setMasterServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [masterAddress, setMasterAddress] = useState("");
  const [masterDate, setMasterDate] = useState("");
  const [masterTime, setMasterTime] = useState("");
  // Автотехпомощь
  const [techService, setTechService] = useState(null);
  const [techAddress, setTechAddress] = useState("");
  const [techTo, setTechTo] = useState("");
  const [techDistance, setTechDistance] = useState("");
  const [techDate, setTechDate] = useState("");
  const [techTime, setTechTime] = useState("");
  const [techComment, setTechComment] = useState("");
  const [error, setError] = useState("");
  const [city, setCity] = useState(localStorage.getItem("pro_city") || "Анапа");
  const [popular, setPopular] = useState(null);
  const [ads, setAds] = useState([]);
  const [events, setEvents] = useState([]);

  const servicesGrid = React.useMemo(() => {
    const list = [...SERVICES];
    if (popular?.top) {
      const idx = list.findIndex(x => x.id === popular.top);
      if (idx > 0) {
        const [svc] = list.splice(idx, 1);
        list.unshift(svc);
      }
    }
    return list;
  }, [popular?.top]);

  useEffect(() => {
    api("/stats/popular-services")
      .then(setPopular)
      .catch(() => setPopular(null));
  }, []);

  useEffect(() => {
    api("/ads")
      .then(res => setAds(Array.isArray(res?.ads) ? res.ads : []))
      .catch(() => setAds([]));
    api("/ads?kind=events")
      .then(res => setEvents(Array.isArray(res?.ads) ? res.ads : []))
      .catch(() => setEvents([]));
  }, []);

  // Заказы клиента с сервера: список и текущий заказ должны переживать
  // перезапуск миниаппа. Если заказ активен — сразу открываем окно слежения.
  async function loadMyOrders() {
    try {
      const res = await api("/me/orders");
      const list = Array.isArray(res?.orders) ? res.orders : [];
      setOrders(list);
      const activeId = res?.active_order_id;
      if (activeId) {
        const active = list.find(o => o.id === activeId);
        if (active) {
          setOrder(prev => (prev && prev.id === active.id ? prev : active));
          setNav(n => (n.page === "home" ? { ...n, page: "search" } : n));
        }
      }
    } catch (e) {
      if (e?.status === 401) {
        // Токен протух или аккаунт больше не существует: сбрасываем его,
        // чтобы увидеть экран входа, а не вечный пустой список
        localStorage.removeItem("token");
        window.location.reload();
        return;
      }
      // прочие ошибки — список остаётся пустым
    }
  }

  useEffect(() => {
    loadMyOrders();
  }, []);

  async function loadExtras() {
    if (!order?.id) return;
    try {
      const res = await api(`/orders/${order.id}/extras`);
      setExtras(Array.isArray(res) ? res : []);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    if (!order?.id) return;
    loadExtras();
    const tt = setInterval(loadExtras, 5000);
    return () => clearInterval(tt);
  }, [order?.id]);

  async function decideExtra(extraId, decision) {
    try {
      await api(`/extras/${extraId}/decision`, { method: "PUT", body: { decision } });
      const updated = await api(`/orders/${order.id}`);
      setOrder(updated);
      setOrders(orders.map(o => o.id === updated.id ? updated : o));
      loadExtras();
    } catch (e) {
      setError(e.message);
    }
  }

  // Оформление заказа из нового окна: адреса вручную, надбавка, комментарий.
  async function submitOrder(payload) {
    setError("");
    setSubmitting(true);
    try {
      const res = await api("/orders", {
        method: "POST",
        body: {
          client_id: 1,
          tariff_code: tariff,
          children: rideOptions.children,
          animals: rideOptions.animals,
          child_seats: rideOptions.child_seats,
          wheelchair: rideOptions.wheelchair,
          own_child_seat: rideOptions.own_child_seat,
          from_address: payload.from.title,
          to_address: payload.to.title,
          from_lat: payload.from.lat,
          from_lon: payload.from.lon,
          to_lat: payload.to.lat,
          to_lon: payload.to.lon,
          distance_km: Number(payload.route.distance_km),
          city_km: Number(payload.route.distance_km),
          out_km: 0,
          manual_increase: payload.increase,
          comment: payload.comment,
          scheduled_at: tariff === "intercity" && intercityAt
            ? new Date(intercityAt).toISOString()
            : null
        }
      });
      setOrder(res);
      setOrders([res, ...orders]);
      goPage("search");
    } catch (e) {
      setError(e.message || "Не удалось оформить заказ");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelOrder() {
    if (!order?.id) return;
    try {
      await api(`/orders/${order.id}/cancel`, { method: "POST" });
      const fresh = await api(`/orders/${order.id}`);
      setOrder(fresh);
      setOrders(orders.map(o => (o.id === fresh.id ? fresh : o)));
    } catch (e) {
      setError(e.message || "Не удалось отменить заказ");
    }
  }

  const LOADER_HOUR_PRICE = 500;
  const CARGO_BASE_PRICE = 700;
  const CARGO_KM_PRICE = 35;

  function calculateCargo() {
    const km = Number(cargoDistance || 0);
    const total = CARGO_BASE_PRICE + km * CARGO_KM_PRICE + Number(loaders) * Number(loaderHours) * LOADER_HOUR_PRICE;
    setCargoPrice(total);
  }

  async function createCargoOrder() {
    try {
      if (!cargoFrom || !cargoTo || !cargoDate || !cargoTime) {
        setError("Укажите адреса, дату и время подачи машины");
        return;
      }
      const scheduled = new Date(`${cargoDate}T${cargoTime}:00`);
      if (scheduled < new Date()) {
        setError("Нельзя выбрать время в прошлом");
        return;
      }
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + 7);
      if (scheduled > maxDate) {
        setError("Предзаказ доступен только на 7 дней вперёд");
        return;
      }
      const res = await api("/orders", {
        method: "POST",
        body: {
          client_id: 1,
          service: "cargo",
          tariff_code: "cargo",
          from_address: cargoFrom,
          to_address: cargoTo,
          distance_km: Number(cargoDistance),
          scheduled_at: scheduled.toISOString(),
          meta: {
            loaders: Number(loaders),
            loader_hours: Number(loaderHours)
          }
        }
      });
      setOrder(res);
      setOrders([res, ...orders]);
      goPage("search");
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadMasterServices() {
    try {
      const res = await api("/masters/services");
      setMasterServices(Array.isArray(res) ? res : []);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    if (page === "master") loadMasterServices();
  }, [page]);

  async function createMasterOrder() {
    try {
      if (!selectedService || !masterAddress) {
        setError("Выберите услугу и укажите адрес");
        return;
      }
      const scheduled = masterDate && masterTime
        ? new Date(`${masterDate}T${masterTime}:00`).toISOString()
        : null;
      const res = await api("/masters/orders", {
        method: "POST",
        body: {
          service_id: selectedService.id,
          client_id: 1,
          from_address: masterAddress,
          to_address: "",
          scheduled_at: scheduled
        }
      });
      setOrder(res);
      setOrders([res, ...orders]);
      goPage("search");
    } catch (e) {
      setError(e.message);
    }
  }

  async function createTechHelpOrder() {
    try {
      if (!techService || !techAddress) {
        setError("Выберите услугу и укажите адрес (место положения авто)");
        return;
      }
      const key = techService.key;
      const needsAB = key === "sober_driver" || key === "tow";
      if (needsAB && (!techTo || !Number(techDistance))) {
        setError("Укажите назначение и расстояние A→B, км");
        return;
      }
      if (key === "tow" && (!techDate || !techTime)) {
        setError("Эвакуация доступна только как предзаказ — укажите дату и время");
        return;
      }
      const scheduled = techDate && techTime
        ? new Date(`${techDate}T${techTime}:00`).toISOString()
        : null;
      const res = await api("/orders", {
        method: "POST",
        body: {
          client_id: 1,
          service: "tech_help",
          tariff_code: "tech_help",
          from_address: techAddress,
          to_address: needsAB ? techTo : "",
          distance_km: needsAB ? Number(techDistance) : 0,
          scheduled_at: scheduled,
          comment: techComment.trim() || null,
          meta: { service_key: key }
        }
      });
      setOrder(res);
      setOrders([res, ...orders]);
      goPage("search");
    } catch (e) {
      setError(e.message);
    }
  }

  async function increase() {
    try {
      const res = await api(`/orders/${order.id}/increase`, { method: "POST" });
      setOrder(res);
      setOrders(orders.map(o => o.id === res.id ? res : o));
    } catch (e) {
      setError(e.message);
    }
  }

  function openAd(ad) {
    const link = (ad.link || "").trim();
    if (!link) return;
    if (link.startsWith("http")) {
      window.open(link, "_blank", "noopener");
      return;
    }
    goPage(link.replace(/^\//, ""));
  }

  async function toggleFavorite(o) {
    try {
      await api(`/orders/${o.id}/favorite`, {
        method: "POST",
        body: { favorite: !o.favorite },
      });
      await loadMyOrders();
    } catch (e) {
      setError(e.message || "Не удалось изменить избранное");
    }
  }

  async function renameFavorite(id, title) {
    try {
      await api(`/orders/${id}/favorite-title`, {
        method: "PUT",
        body: { title },
      });
      await loadMyOrders();
    } catch (e) {
      setError(e.message || "Не удалось переименовать");
    }
  }

  function continueOrder(o) {
    setOrder(o);
    goPage("search");
  }

  const summaryData = useAppSummary();
  const summary = summaryData.summary;

  // Телефон приходит из MAX по запросу контакта. Если в профиле его нет
  // (старый вход, номер не подтверждали) — запрашиваем ещё раз.
  const contactAsked = React.useRef(false);
  async function syncContact() {
    if (contactAsked.current) return;
    const webApp = window.WebApp || window.Max?.WebApp || window.Max;
    if (!webApp || typeof webApp.requestContact !== "function") return;
    contactAsked.current = true;
    try {
      const contact = await webApp.requestContact();
      if (!contact || !contact.phone) {
        // Пользователь не поделился номером — без телефона входа нет
        localStorage.removeItem("token");
        window.location.reload();
        return;
      }
      const res = await fetch("/api/auth/max/miniapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          init_data: webApp.initData || window.Max?.initData || "",
          contact
        })
      });
      if (res.ok) {
        // Новый токен ОБЯЗАТЕЛЬНО сохраняем: раньше он терялся, приложение
        // вечно ходило со старым «мёртвым» токеном — заказы пустовали,
        // и перелогин не помогал. Перезапуск, чтобы список подхватил токен.
        try {
          const data = await res.json();
          if (data.token) localStorage.setItem("token", data.token);
        } catch {}
        window.location.reload();
        return;
      }
    } catch (e) {
      // пользователь мог отказаться — тогда выходим на экран входа
      localStorage.removeItem("token");
      window.location.reload();
    }
  }

  useEffect(() => {
    if (summary && !summary.phone) {
      syncContact();
    }
  }, [summary?.phone, summary?.id]);

  const s = makeStyles(t);

  return (
    <div className="pro-shell" style={s.shell}>
      <style>{`
        .pro-shell, .pro-shell *, .pro-shell *::before, .pro-shell *::after {
          box-sizing: border-box;
        }
        .pro-tiles::-webkit-scrollbar{display:none;width:0;height:0}
      `}</style>

      {page === "home" && (
        <div style={{ padding: "14px 16px 24px" }}>
          {/* Строка поиска — ведёт в заказ такси */}
          <button style={s.searchPill} onClick={() => goPage("taxi")}>
            <Icon name="search" size={18} style={{ color: t.sub }} />
            <span style={s.searchText}>Куда поедем?</span>
          </button>

          {/* Активный заказ / оценка — появляется только когда есть заказ */}
          <div style={{ marginTop: 14 }}>
            <ActiveOrderCard />
          </div>

          {/* Услуги: до 9 — сетка 3×N, больше 9 — горизонтальная прокрутка */}
          {servicesGrid.length > 9 ? (
            <div className="pro-tiles" style={s.tilesScroller}>
              {servicesGrid.map(x => (
                <button key={x.id} style={s.tileScrollItem} onClick={() => goPage(x.id)}>
                  <span style={{ ...s.tile, background: x.grad, boxShadow: `0 10px 22px -6px ${x.glow}` }}>
                    <Icon name={x.icon} size={30} strokeWidth={2.6} style={{ color: t.onHero }} />
                    {x.badge && <span style={s.badge}>{x.badge}</span>}
                  </span>
                  <span style={s.tileLabel}>{x.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div style={s.tilesGrid}>
              {servicesGrid.map(x => (
                <button key={x.id} style={s.tileWrap} onClick={() => goPage(x.id)}>
                  <span style={{ ...s.tile, background: x.grad, boxShadow: `0 10px 22px -6px ${x.glow}` }}>
                    <Icon name={x.icon} size={30} strokeWidth={2.6} style={{ color: t.onHero }} />
                    {x.badge && <span style={s.badge}>{x.badge}</span>}
                  </span>
                  <span style={s.tileLabel}>{x.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Афиша города — тёмные медиа-карточки */}
          {events.length > 0 && (
            <section style={{ marginTop: 20 }}>
              <div style={s.sectionRow}>
                <strong style={s.sectionTitle}>Афиша · {city}</strong>
              </div>
              <div style={s.hScroll}>
                {events.map(ad => {
                  const when = formatEventDate(ad.event_date);
                  const hasLink = !!(ad.link || "").trim();
                  const isImage = !!(ad.image_url || "").trim();
                  return (
                    <button
                      key={ad.id}
                      style={{ ...s.mediaCard, cursor: hasLink ? "pointer" : "default" }}
                      onClick={() => hasLink && openAd(ad)}
                    >
                      {isImage
                        ? <>
                            <img src={ad.image_url} alt="" loading="lazy" style={s.mediaImg} />
                            <span style={s.mediaShade} />
                          </>
                        : <span style={{ ...s.mediaNoImg, background: t.mediaPlaceholder }} />}
                      {when && <span style={s.datePill}>{when}</span>}
                      <span style={s.mediaBody}>
                        <strong style={{ ...s.mediaTitle, color: isImage ? t.onHero : t.text }}>
                          {ad.title}
                        </strong>
                        {ad.description && (
                          <small style={{ ...s.mediaText, color: isImage ? "rgba(255,255,255,.92)" : t.sub }}>
                            {ad.description}
                          </small>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Акции местного бизнеса */}
          {ads.length > 0 && (
            <section style={{ marginTop: 18 }}>
              <div style={s.sectionRow}>
                <strong style={s.sectionTitle}>Акции рядом</strong>
              </div>
              <div style={s.hScroll}>
                {ads.map(ad => {
                  const hasLink = !!(ad.link || "").trim();
                  const isImage = !!(ad.image_url || "").trim();
                  return (
                    <button
                      key={ad.id}
                      style={{ ...s.mediaCard, cursor: hasLink ? "pointer" : "default" }}
                      onClick={() => hasLink && openAd(ad)}
                    >
                      {isImage
                        ? <>
                            <img src={ad.image_url} alt="" loading="lazy" style={s.mediaImg} />
                            <span style={s.mediaShade} />
                          </>
                        : <span style={{ ...s.mediaNoImg, background: "linear-gradient(135deg,#7a5cfa,#4687f5)" }} />}
                      <span style={s.mediaBody}>
                        <strong style={s.mediaTitle}>{ad.title}</strong>
                        {ad.description && <small style={s.mediaText}>{ad.description}</small>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {page === "city" && (
        <CityPage s={s} t={t} city={city} setCity={c => { setCity(c); localStorage.setItem("pro_city", c); backPage(); }} />
      )}

      {page === "taxi" && (
        <OrderForm
          s={s}
          t={t}
          city={city}
          options={rideOptions}
          setOptions={setRideOptions}
          onSubmit={submitOrder}
          submitting={submitting}
          error={error}
          tariff={tariff}
          setTariff={setTariff}
          intercityAt={intercityAt}
          setIntercityAt={setIntercityAt}
          onClose={() => { setError(""); if (nav.stack.length) backPage(); else resetPage("home"); }}
        />
      )}

      {page === "search" && order && (
        <OrderSearch
          s={s}
          t={t}
          orderId={order.id}
          onBack={() => { if (nav.stack.length) backPage(); else resetPage("home"); }}
          onCancel={cancelOrder}
        />
      )}

      {page === "orders" && (
        <OrdersPage
          s={s} t={t}
          orders={orders} order={order} extras={extras}
          onIncrease={increase} onDecide={decideExtra}
          onToggleFavorite={toggleFavorite} onContinue={continueOrder}
        />
      )}

      {page === "favorites" && (
        <FavoritesPage
          s={s} t={t}
          orders={orders}
          onToggleFavorite={toggleFavorite} onRename={renameFavorite}
          onContinue={continueOrder}
        />
      )}

      {page === "cargo" && (
        <CargoPage s={s} t={t} p={{
          cargoFrom, setCargoFrom, cargoTo, setCargoTo, cargoDistance, setCargoDistance,
          cargoDate, setCargoDate, cargoTime, setCargoTime, loaders, setLoaders,
          loaderHours, setLoaderHours, cargoPrice, calculateCargo, createCargoOrder,
          LOADER_HOUR_PRICE
        }} />
      )}

      {page === "master" && (
        <MasterPage s={s} t={t} p={{
          masterServices, selectedService, setSelectedService, masterAddress, setMasterAddress,
          masterDate, setMasterDate, masterTime, setMasterTime, createMasterOrder
        }} />
      )}

      {page === "tech_help" && (
        <TechHelpPage s={s} t={t} p={{
          techService, setTechService, techAddress, setTechAddress,
          techTo, setTechTo, techDistance, setTechDistance,
          techDate, setTechDate, techTime, setTechTime,
          techComment, setTechComment, createTechHelpOrder
        }} />
      )}

      {page === "support" && (
        <SupportPage s={s} t={t} />
      )}

      {page === "info" && (
        <InfoPage s={s} t={t} />
      )}

      {page === "profile" && (
        <ProfilePage s={s} t={t} summary={summary} setting={setting} choose={choose}
          city={city} onCity={() => goPage("city")} onSupport={() => goPage("support")} onInfo={() => goPage("info")} />
      )}

      {["home", "orders", "favorites", "city", "taxi", "cargo", "master", "tech_help", "support", "info", "profile"].indexOf(page) < 0 && (
        <div style={{ padding: "16px 16px 24px" }}>
          <div style={s.listGroup}>
            <div style={{ padding: 20, textAlign: "center" }}>
              <strong style={{ color: t.text }}>Раздел в разработке</strong>
              <p style={{ color: t.sub, fontSize: 13, margin: "6px 0 0" }}>Появится в следующем обновлении.</p>
            </div>
          </div>
        </div>
      )}

      {error && page !== "taxi" && (
        <div style={{ ...s.errorBox, margin: "0 16px 10px" }}>{error}</div>
      )}

      {/* Нижняя навигация: компактная, иконки как в мессенджере MAX */}
      <nav style={s.tabbar}>
        {NAV_ITEMS.map(([id, icon, title]) => {
          const active = page === id;
          return (
            <button key={id} onClick={() => goPage(id)} style={s.tabBtn}>
              <Icon name={icon} size={21} strokeWidth={2} style={{ color: active ? t.accent : t.sub }} />
              <span style={{ ...s.tabLabel, color: active ? t.accent : t.sub }}>{title}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// Локальная обёртка useSummary (импортировать React-хук из Summary)
function useAppSummary() {
  const [summary, reload] = useSummary();
  useEffect(() => { /* polling уже внутри useSummary */ }, []);
  return { summary, reload };
}

// ---------- Профиль в стиле меню настроек MAX (видеореференс 111.mp4) ----------
// Палитра профиля приходит из theme.js (PROFILE_LIGHT / PROFILE_DARK).

// Карточка-секция без заголовка и без разделителей — как группы в MAX
function MaxGroup({ m, children }) {
  return (
    <div style={{
      background: m.card, borderRadius: 16, overflow: "hidden",
      display: "flex", flexDirection: "column", marginTop: 12,
    }}>
      {children}
    </div>
  );
}

// Строка: белая контурная иконка + подпись + значение справа + шеврон
function MaxRow({ m, icon, label, value, onClick, danger, accent }) {
  const row = {
    display: "flex", alignItems: "center", gap: 14, width: "100%",
    padding: "15px 18px", background: "transparent", border: 0,
    textAlign: "left", cursor: onClick ? "pointer" : "default",
    fontFamily: "inherit", WebkitTapHighlightColor: "transparent",
    flex: "0 0 auto",
  };
  const body = (
    <>
      <span style={{ color: danger ? m.danger : accent ? m.invite : m.icon }}>{icon}</span>
      <span style={{
        flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600,
        color: danger ? m.danger : accent ? m.invite : m.text,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {label}
      </span>
      {value != null && value !== "" && (
        <span style={{
          fontSize: 14, color: m.sub, fontWeight: 550, maxWidth: 150, flexShrink: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {value}
        </span>
      )}
      {onClick && <Icon name="chevronRight" size={16} style={{ color: m.chevron }} />}
    </>
  );
  return onClick ? <button style={row} onClick={onClick}>{body}</button> : <div style={row}>{body}</div>;
}

// Данные пользователя из MAX: initData приходит строкой query-параметров
// (user = {"id": ..., "first_name": ..., "photo_url": ...}).
function readMaxUser() {
  try {
    const raw =
      window.WebApp?.initData ||
      window.Max?.initData ||
      window.Max?.WebApp?.initData ||
      window.Telegram?.WebApp?.initData ||
      new URLSearchParams(window.location.search).get("initData") ||
      "";
    if (!raw) return null;
    const fromParams = new URLSearchParams(raw).get("user");
    if (fromParams) return JSON.parse(fromParams);
    const parsed = JSON.parse(raw);
    return parsed?.user || null;
  } catch (e) {
    return null;
  }
}

// Телефон в читаемом виде: 79000000000 → +7 900 000 00 00
function formatPhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) {
    const d = digits[0] === "8" ? `7${digits.slice(1)}` : digits;
    return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9, 11)}`;
  }
  return String(value);
}

function ProfilePage({ s, t, summary, setting, choose, city, onCity, onSupport, onInfo }) {
  const m = maxPalette(t.mode);
  const maxUser = readMaxUser();
  const name = maxUser?.first_name || maxUser?.username || summary?.name || "Гость";
  const initials = (name || "П")
    .split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const photo = maxUser?.photo_url || null;
  const phone = formatPhone(summary?.phone || maxUser?.phone_number || maxUser?.phone);
  const maxId = maxUser?.id || summary?.max_id || summary?.id || null;

  const themeCycle = () => {
    const order = ["light", "dark", "system"];
    choose(order[(order.indexOf(setting) + 1) % order.length]);
  };
  const THEME_RU = { light: "Светлая", dark: "Тёмная", system: "Системная" };

  async function invite() {
    const text = "«Про» — сервисы города: такси, курьер, грузовое, мастера и работа. Попробуй!";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Про", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      alert("Скопировано в буфер обмена");
    } catch (e) {
      // отменили системное окно — это нормально
    }
  }

  return (
    <div style={{ padding: "12px 16px 44px", background: m.bg }}>
      {/* Шапка по центру: аватар, имя, синий телефон — как в MAX */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "6px 0 8px", maxWidth: "100%", overflow: "hidden",
      }}>
        {photo ? (
          <img
            src={photo}
            alt=""
            referrerPolicy="no-referrer"
            style={{
              width: 96, height: 96, borderRadius: "50%", objectFit: "cover",
              background: m.avatarBg, border: `2px solid ${m.card}`,
            }}
          />
        ) : (
          <span style={{
            width: 96, height: 96, borderRadius: "50%", background: m.avatarBg,
            color: m.text, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 30, fontWeight: 800, letterSpacing: 1,
          }}>{initials}</span>
        )}
        <strong style={{
          margin: "14px 0 4px", fontSize: 23, color: m.text, letterSpacing: -0.4,
          maxWidth: "100%", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>{name}</strong>
        {phone && (
          <span style={{
            color: m.link, fontSize: 15, fontWeight: 600,
            maxWidth: "100%", textAlign: "center", overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{phone}</span>
        )}
      </div>

      <MaxGroup m={m}>
        <MaxRow m={m} icon={<Icon name="id" size={20} />} label="ID" value={maxId ?? "—"} />
        <MaxRow m={m} icon={<Icon name="phone" size={20} />} label="Телефон" value={phone || "Не указан"} />
        <MaxRow m={m} icon={<Icon name="city" size={20} />} label="Город" value={city} onClick={onCity} />
      </MaxGroup>

      {/* Сиреневая строка-приглашение — прямой аналог «Пригласить друзей» в MAX */}
      <MaxGroup m={m}>
        <MaxRow m={m} icon={<Icon name="link" size={20} />} label="Пригласить друзей" onClick={invite} accent />
      </MaxGroup>

      <MaxGroup m={m}>
        <MaxRow m={m} icon={<Icon name="orders" size={20} />} label="Оплата" value="Наличные" />
      </MaxGroup>

      <MaxGroup m={m}>
        <MaxRow
          m={m}
          icon={<Icon name={setting === "dark" ? "moon" : setting === "system" ? "monitor" : "sun"} size={20} />}
          label="Тема оформления"
          value={THEME_RU[setting] || "Системная"}
          onClick={themeCycle}
        />
        <MaxRow m={m} icon={<Icon name="support" size={20} />} label="Поддержка" onClick={onSupport} />
        <MaxRow m={m} icon={<Icon name="info" size={20} />} label="Информация и тарифы" onClick={onInfo} />
      </MaxGroup>
    </div>
  );
}

// ---------- Готовые подстраницы ----------
function CityPage({ s, t, city, setCity }) {
  return (
    <div style={{ padding: "18px 16px 24px" }}>
      <h1 style={s.pageTitle}>Выберите город</h1>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {CITIES.map(c => (
          <button
            key={c}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
              padding: "13px 13px", borderRadius: 14, textAlign: "left",
              background: c === city ? t.accent : t.card,
              border: 0, color: c === city ? t.onAccent : t.text,
              fontWeight: 700, fontSize: 13, cursor: "pointer",
              boxShadow: c === city ? "0 8px 20px -6px rgba(44,123,246,.5)" : "none",
            }}
            onClick={() => setCity(c)}
          >
            {c}
            {c === city && <Icon name="check" size={14} style={{ color: t.onAccent }} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function OrdersPage({ s, t, orders, order, extras, onIncrease, onDecide, onToggleFavorite, onContinue }) {
  return (
    <div style={{ padding: "18px 16px 24px" }}>
      <h1 style={s.pageTitle}>Мои заказы</h1>

      {orders.length === 0 && (
        <div style={s.listGroup}>
          <div style={{ padding: 20, textAlign: "center", color: t.sub }}>
            Заказов пока нет
          </div>
        </div>
      )}

      {orders.map(o => {
        const isCancel = o.status === "cancelled";
        const isDone = o.status === "completed";
        const isActive = ["created", "assigned", "accepted", "in_progress"].includes(o.status);
        return (
          <div key={o.id} style={{ ...s.listGroup, marginBottom: 10 }}>
            <div style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <span style={{
                  padding: "5px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800,
                  background: isCancel ? t.dangerSoft : isDone ? t.successSoft : t.accent,
                  color: isCancel ? t.danger : isDone ? t.success : t.onAccent,
                }}>
                  {STATUS_RU[o.status] || o.status}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <strong style={{ color: t.text, fontSize: 15 }}>{o.total_price} ₽</strong>
                  <button
                    onClick={() => onToggleFavorite(o)}
                    aria-label={o.favorite ? "Убрать из избранного" : "В избранное"}
                    style={{
                      background: "transparent", border: 0, cursor: "pointer", padding: 0,
                      color: o.favorite ? t.cta : t.sub, display: "flex",
                    }}
                  >
                    <Icon
                      name={o.favorite ? "starFilled" : "star"}
                      size={20}
                      strokeWidth={o.favorite ? 2.6 : 2}
                      fill={o.favorite ? "currentColor" : "none"}
                    />
                  </button>
                </div>
              </div>

              {o.favorite && o.favorite_title && (
                <p style={{ margin: "8px 0 0", fontSize: 12.5, color: t.cta, fontWeight: 800 }}>
                  {o.favorite_title}
                </p>
              )}

              <p style={{ margin: "10px 0 6px", fontWeight: 700, color: t.text, fontSize: 14, lineHeight: 1.35 }}>
                {o.from_address} → {o.to_address}
              </p>
              <p style={{ margin: 0, color: t.sub, fontSize: 12.5 }}>
                {o.tariff_code === "standard" ? "Стандарт" : o.tariff_code === "intercity" ? "Межгород" : o.tariff_code} · наличные
              </p>

              {isActive && (
                <button onClick={() => onContinue(o)} style={{ ...s.btnBlue, marginTop: 12 }}>
                  Продолжить — следить за заказом
                </button>
              )}

              {order && order.id === o.id && (
                <>
                  <button onClick={onIncrease} style={{ ...s.btnYellow, marginTop: 12 }}>Повысить цену +50 ₽</button>

                  {extras.filter(x => x.status === "pending").map(x => (
                    <div key={x.id} style={{ marginTop: 12, padding: 12, borderRadius: 14, background: t.accentSoft }}>
                      <strong style={{ display: "block", color: t.accent }}>{x.title}</strong>
                      {x.description && <small style={{ color: t.sub, display: "block", marginTop: 3 }}>{x.description}</small>}
                      <strong style={{ display: "block", margin: "8px 0", color: t.text }}>{x.price} ₽</strong>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => onDecide(x.id, "approved")} style={{ ...s.extraBtn, background: t.accent, color: t.onAccent }}>Подтвердить</button>
                        <button onClick={() => onDecide(x.id, "rejected")} style={{ ...s.extraBtn, background: t.dangerSoft, color: t.danger }}>Отклонить</button>
                      </div>
                    </div>
                  ))}

                  {extras.filter(x => x.status === "approved").length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${t.border}` }}>
                      <strong style={{ fontSize: 13, color: t.text }}>Подтверждённые допуслуги</strong>
                      {extras.filter(x => x.status === "approved").map(x => (
                        <p key={x.id} style={{ margin: "6px 0 0", fontSize: 12, color: t.sub }}>{x.title} — {x.price} ₽</p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Избранные заказы: можно переименовать и убрать
function FavoritesPage({ s, t, orders, onToggleFavorite, onRename, onContinue }) {
  const [editingId, setEditingId] = React.useState(null);
  const [title, setTitle] = React.useState("");

  const items = orders.filter(o => o.favorite);

  return (
    <div style={{ padding: "18px 16px 24px" }}>
      <h1 style={s.pageTitle}>Избранные</h1>

      {items.length === 0 && (
        <div style={s.listGroup}>
          <div style={{ padding: 20, textAlign: "center", color: t.sub }}>
            Пока пусто. Отмечайте заказы звёздочкой во вкладке «Заказы».
          </div>
        </div>
      )}

      {items.map(o => (
        <div key={o.id} style={{ ...s.listGroup, marginBottom: 10 }}>
          <div style={{ padding: 16 }}>
            {editingId === o.id ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  autoFocus
                  value={title}
                  maxLength={120}
                  placeholder="Например: Аэропорт, работа, домой"
                  onChange={e => setTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { onRename(o.id, title); setEditingId(null); } }}
                  style={{
                    flex: 1, minWidth: 0, padding: "11px 13px", borderRadius: 12,
                    border: `1px solid ${t.border}`, background: t.inputBg, color: t.text,
                    fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                  }}
                />
                <button
                  onClick={() => { onRename(o.id, title); setEditingId(null); }}
                  style={{
                    padding: "11px 14px", borderRadius: 12, border: 0, cursor: "pointer",
                    background: t.accent, color: t.onAccent, fontWeight: 800, fontFamily: "inherit",
                  }}
                >Сохранить</button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <strong style={{ fontSize: 15, color: t.text }}>
                    {o.favorite_title || `Заказ №${o.id}`}
                  </strong>
                  <button
                    onClick={() => { setEditingId(o.id); setTitle(o.favorite_title || ""); }}
                    aria-label="Переименовать"
                    style={{
                      background: "transparent", border: 0, cursor: "pointer", padding: 0,
                      color: t.sub, display: "flex",
                    }}
                  >
                    <Icon name="doc" size={18} />
                  </button>
                </div>

                <p style={{ margin: "8px 0 0", fontSize: 13, color: t.sub, lineHeight: 1.4 }}>
                  {o.from_address} → {o.to_address}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 12.5, color: t.sub }}>
                  {o.total_price} ₽ · {STATUS_RU[o.status] || o.status}
                </p>

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={() => onContinue(o)} style={{ ...s.btnBlue, flex: 1 }}>
                    Открыть
                  </button>
                  <button
                    onClick={() => onToggleFavorite(o)}
                    style={{ ...s.extraBtn, background: t.dangerSoft, color: t.danger, flexShrink: 0, padding: "11px 16px" }}
                  >Убрать</button>
                </div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function CargoPage({ s, t, p }) {
  return (
    <div style={{ padding: "18px 16px 24px" }}>
      <h1 style={s.pageTitle}>Грузоперевозки</h1>
      <div style={s.listGroup}>
        <div style={{ padding: 16 }}>
          <input placeholder="Откуда" value={p.cargoFrom} onChange={e => p.setCargoFrom(e.target.value)} style={s.input} />
          <input placeholder="Куда" value={p.cargoTo} onChange={e => p.setCargoTo(e.target.value)} style={s.input} />
          <input type="number" min="1" placeholder="Расстояние, км" value={p.cargoDistance} onChange={e => p.setCargoDistance(e.target.value)} style={s.input} />

          <label style={s.formLabel}>Дата подачи</label>
          <input
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            max={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
            value={p.cargoDate}
            onChange={e => p.setCargoDate(e.target.value)}
            style={s.input}
          />

          <label style={s.formLabel}>Время подачи</label>
          <input type="time" value={p.cargoTime} onChange={e => p.setCargoTime(e.target.value)} style={s.input} />

          <label style={s.formLabel}>Грузчики</label>
          <select value={p.loaders} onChange={e => p.setLoaders(Number(e.target.value))} style={s.input}>
            {[0, 1, 2, 3, 4].map(n => (
              <option key={n} value={n}>{n === 0 ? "Без грузчиков" : `${n} грузчик${n === 1 ? "" : "а"}`}</option>
            ))}
          </select>

          {p.loaders > 0 && (
            <>
              <label style={s.formLabel}>Часы работы грузчиков</label>
              <input type="number" min="1" max="12" value={p.loaderHours} onChange={e => p.setLoaderHours(e.target.value)} style={s.input} />
              <p style={s.formLabel}>Грузчики: {p.LOADER_HOUR_PRICE} ₽/час за человека</p>
            </>
          )}

          {p.cargoPrice !== null && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0 4px" }}>
              <span style={{ fontSize: 24, fontWeight: 850, color: t.text, letterSpacing: -0.5 }}>{p.cargoPrice} ₽</span>
              <small style={{ color: t.sub }}>Предварительно</small>
            </div>
          )}

          <button onClick={p.calculateCargo} style={{ ...s.btnYellow, marginTop: 12 }}>Рассчитать стоимость</button>

          {p.cargoPrice !== null && (
            <button onClick={p.createCargoOrder} style={{ ...s.btnBlue, marginTop: 10 }}>
              Заказать на {p.cargoDate} в {p.cargoTime}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MasterPage({ s, t, p }) {
  return (
    <div style={{ padding: "18px 16px 24px" }}>
      <h1 style={s.pageTitle}>Мастера</h1>
      <div style={s.listGroup}>
        <div style={{ padding: 16 }}>
          <strong style={{ color: t.text, fontSize: 14 }}>Выбранная услуга</strong>
          {p.selectedService ? (
            <p style={{ margin: "6px 0", color: t.accent, fontWeight: 800 }}>
              {p.selectedService.title} · {p.selectedService.price} ₽
            </p>
          ) : (
            <p style={{ margin: "6px 0", color: t.sub, fontSize: 12.5 }}>Выберите услугу из списка ниже</p>
          )}

          <input placeholder="Адрес" value={p.masterAddress} onChange={e => p.setMasterAddress(e.target.value)} style={s.input} />

          <label style={s.formLabel}>Дата визита</label>
          <input type="date" min={new Date().toISOString().slice(0, 10)} value={p.masterDate} onChange={e => p.setMasterDate(e.target.value)} style={s.input} />

          <label style={s.formLabel}>Время визита</label>
          <input type="time" value={p.masterTime} onChange={e => p.setMasterTime(e.target.value)} style={s.input} />

          <button onClick={p.createMasterOrder} style={{ ...s.btnYellow, marginTop: 10 }}>Заказать мастера</button>
        </div>
      </div>

      {p.masterServices.map(x => (
        <button
          key={x.id}
          onClick={() => p.setSelectedService(x)}
          style={{
            width: "100%", textAlign: "left", marginTop: 10, cursor: "pointer",
            padding: 16, borderRadius: 16, fontFamily: "inherit",
            background: p.selectedService?.id === x.id ? t.accentSoft : t.card,
            border: p.selectedService?.id === x.id ? `2px solid ${t.accent}` : `1px solid ${t.border}`,
          }}
        >
          <strong style={{ color: t.text, fontSize: 14 }}>{x.title}</strong>
          <p style={{ color: t.sub, fontSize: 12.5, margin: "5px 0" }}>Мастер: {x.master_name}</p>
          {x.description && <p style={{ fontSize: 12.5, color: t.text }}>{x.description}</p>}
          <strong style={{ color: t.accent }}>{x.price} ₽</strong>
        </button>
      ))}

      {p.masterServices.length === 0 && (
        <div style={{ ...s.listGroup, marginTop: 10 }}>
          <div style={{ padding: 20, textAlign: "center", color: t.sub }}>Пока нет доступных услуг мастеров</div>
        </div>
      )}
    </div>
  );
}

function TechHelpPage({ s, t, p }) {
  const key = p.techService?.key;
  const needsAB = key === "sober_driver" || key === "tow";
  const priceLabel = (x) => x.price != null
    ? `${x.price} ₽`
    : x.key === "tow" ? "по тарифу грузоперевозок" : "от 1000 ₽";
  return (
    <div style={{ padding: "18px 16px 24px" }}>
      <h1 style={s.pageTitle}>Автотехпомощь</h1>
      <div style={s.listGroup}>
        <div style={{ padding: 16 }}>
          <strong style={{ color: t.text, fontSize: 14 }}>Выбранная услуга</strong>
          {p.techService ? (
            <p style={{ margin: "6px 0", color: t.accent, fontWeight: 800 }}>
              {p.techService.title} · {priceLabel(p.techService)}
            </p>
          ) : (
            <p style={{ margin: "6px 0", color: t.sub, fontSize: 12.5 }}>Выберите услугу из списка ниже</p>
          )}

          <input
            placeholder={needsAB ? "Откуда (где авто)" : "Адрес (место положения авто)"}
            value={p.techAddress}
            onChange={e => p.setTechAddress(e.target.value)}
            style={s.input}
          />
          {needsAB && (
            <>
              <input placeholder="Куда (назначение)" value={p.techTo} onChange={e => p.setTechTo(e.target.value)} style={s.input} />
              <input type="number" min="1" placeholder="Расстояние A→B, км" value={p.techDistance} onChange={e => p.setTechDistance(e.target.value)} style={s.input} />
              <p style={{ margin: "4px 0 0", fontSize: 12, color: t.sub, lineHeight: 1.45 }}>
                {key === "tow"
                  ? "Эвакуация считается по тарифу грузоперевозок — только предзаказ (дата и время обязательны)."
                  : "Трезвый водитель рассчитывается по тройному тарифу такси за км, но не меньше 1000 ₽."}
              </p>
            </>
          )}

          <label style={s.formLabel}>Дата подачи</label>
          <input
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            max={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
            value={p.techDate}
            onChange={e => p.setTechDate(e.target.value)}
            style={s.input}
          />
          <label style={s.formLabel}>Время подачи</label>
          <input type="time" value={p.techTime} onChange={e => p.setTechTime(e.target.value)} style={s.input} />

          <label style={s.formLabel}>Комментарий</label>
          <input placeholder="Необязательно" value={p.techComment} onChange={e => p.setTechComment(e.target.value)} style={s.input} />

          <button onClick={p.createTechHelpOrder} style={{ ...s.btnYellow, marginTop: 10 }}>
            Заказать автотехпомощь
          </button>
        </div>
      </div>

      {TECH_HELP_SERVICES.map(x => (
        <button
          key={x.key}
          onClick={() => p.setTechService(x)}
          style={{
            width: "100%", textAlign: "left", marginTop: 10, cursor: "pointer",
            padding: 16, borderRadius: 16, fontFamily: "inherit",
            background: p.techService?.key === x.key ? t.accentSoft : t.card,
            border: p.techService?.key === x.key ? `2px solid ${t.accent}` : `1px solid ${t.border}`,
          }}
        >
          <strong style={{ color: t.text, fontSize: 14 }}>{x.title}</strong>
          <p style={{ color: t.sub, fontSize: 12.5, margin: "5px 0" }}>{x.desc}</p>
          <strong style={{ color: t.accent }}>
            {priceLabel(x)}
          </strong>
        </button>
      ))}
    </div>
  );
}

function SupportPage({ s, t }) {
  const [items, setItems] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const chatRef = React.useRef(null);

  async function load() {
    try {
      const res = await api("/me/support");
      setItems(Array.isArray(res?.messages) ? res.messages : []);
    } catch (e) {
      setErr(e.message || "Не удалось загрузить переписку");
      setItems(prev => (Array.isArray(prev) ? prev : []));
    }
  }

  useEffect(() => {
    load();
    const it = setInterval(load, 10000);
    return () => clearInterval(it);
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [items && items.length]);

  async function send() {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setErr("");
    try {
      await api("/me/support", { method: "POST", body: { text: value } });
      setText("");
      await load();
    } catch (e) {
      setErr(e.message || "Не удалось отправить сообщение");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ padding: "16px 16px 24px" }}>
      <div style={s.listGroup}>
        <div style={{ padding: 16 }}>
          <strong style={{ color: t.text, fontSize: 15 }}>Поддержка</strong>
          <p style={{ color: t.sub, fontSize: 13, margin: "8px 0 12px", lineHeight: 1.5 }}>
            Напишите оператору — ответ придёт сюда и в MAX. Поможем с заказом
            и вопросами поездки.
          </p>

          <div
            ref={chatRef}
            style={{
              maxHeight: 340, overflowY: "auto", padding: 12, borderRadius: 16,
              background: t.bg, border: `1px solid ${t.border}`,
              display: "flex", flexDirection: "column", gap: 8,
            }}
          >
            {items === null && (
              <p style={{ margin: 0, fontSize: 12.5, color: t.sub, textAlign: "center" }}>
                Загружаем переписку…
              </p>
            )}
            {items && items.length === 0 && (
              <p style={{ margin: 0, fontSize: 12.5, color: t.sub, textAlign: "center" }}>
                Сообщений пока нет — напишите первым.
              </p>
            )}
            {items && items.map(msg => {
              const mine = msg.author_role === "client";
              return (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: mine ? "flex-end" : "flex-start",
                    maxWidth: "84%",
                    padding: "9px 12px", borderRadius: 14,
                    background: mine ? t.accent : t.card,
                    color: mine ? t.onAccent : t.text,
                    border: mine ? "none" : `1px solid ${t.border}`,
                    fontSize: 13, lineHeight: 1.4, wordBreak: "break-word",
                  }}
                >
                  {msg.text}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") send(); }}
              placeholder="Сообщение оператору…"
              style={{ ...s.input, flex: 1, minWidth: 0, marginBottom: 0, boxSizing: "border-box" }}
            />
            <button
              onClick={send}
              disabled={!text.trim() || sending}
              style={{
                padding: "12px 16px", borderRadius: 12, border: 0,
                background: text.trim() ? t.accent : t.inputBg,
                color: text.trim() ? t.onAccent : t.sub,
                fontWeight: 850, cursor: text.trim() ? "pointer" : "default",
                fontFamily: "inherit", fontSize: 13.5, flexShrink: 0,
              }}
            >Отправить</button>
          </div>

          {err && <div style={{ ...s.errorBox, marginTop: 10 }}>{err}</div>}
        </div>
      </div>
    </div>
  );
}

function InfoPage({ s, t }) {
  return (
    <div style={{ padding: "18px 16px 24px" }}>
      <h1 style={s.pageTitle}>Информация</h1>

      <div style={{ ...s.listGroup, marginBottom: 14 }}>
        <div style={{ padding: 16 }}>
          <strong style={{ display: "block", marginBottom: 6, color: t.text }}>Тарифы</strong>
          <p style={{ color: t.sub, fontSize: 13, lineHeight: 1.55, margin: "0 0 10px" }}>
            <strong style={{ color: t.text }}>Такси</strong><br />
            Стандарт: 150 ₽, включено 1,5 км, далее 15 ₽/км в городе и 20 ₽/км за городом.<br />
            Межгород: 40 ₽/км, минимум 1000 ₽.
          </p>
          <p style={{ color: t.sub, fontSize: 13, lineHeight: 1.55, margin: "0 0 10px" }}>
            <strong style={{ color: t.text }}>Грузоперевозки</strong><br />
            700 ₽ + 35 ₽/км; грузчики 500 ₽/час за человека.
          </p>
          <p style={{ color: t.sub, fontSize: 13, lineHeight: 1.55, margin: 0 }}>
            <strong style={{ color: t.text }}>Автотехпомощь</strong><br />
            Прикурить авто — 500 ₽<br />
            Подкачать колесо — 250 ₽<br />
            Диагностика — 1000 ₽<br />
            Эвакуация — по тарифу грузоперевозок (только предзаказ)<br />
            Трезвый водитель — A→B по тройному тарифу такси, минимум 1000 ₽
          </p>
        </div>
      </div>

      <div style={s.listGroup}>
        <div style={{ padding: 16 }}>
          <strong style={{ display: "block", marginBottom: 6, color: t.text }}>Документы</strong>
          <p style={{ color: t.sub, fontSize: 13, lineHeight: 1.7, margin: 0 }}>
            Политика конфиденциальности<br />
            Согласие на обработку персональных данных<br />
            Оферта для клиентов
          </p>
        </div>
      </div>
    </div>
  );
}

function makeStyles(t) {
  return {
    shell: {
      maxWidth: 460, minHeight: "100dvh", margin: "auto",
      padding: "0 0 74px", background: t.bg, color: t.text,
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      transition: "background 0.25s, color 0.25s",
    },

    // Поисковая строка
    searchPill: {
      width: "100%", display: "flex", alignItems: "center", gap: 10,
      padding: "13px 15px", borderRadius: 14, border: 0, cursor: "pointer",
      background: t.inputBg, color: t.sub, fontSize: 14,
    },
    searchText: { color: t.sub, fontWeight: 600 },

    // Сетка плиток 3 колонки
    tilesGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px 12px", marginTop: 18 },
    // Лента услуг (когда услуг больше 9) — горизонтальная прокрутка со снапом
    tilesScroller: {
      display: "flex", gap: 12, marginTop: 18,
      overflowX: "auto", overflowY: "hidden",
      padding: "2px 2px 10px", scrollbarWidth: "none",
      scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch",
    },
    tileScrollItem: {
      flex: "0 0 30%", maxWidth: "30%",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
      background: "transparent", border: 0, padding: 0, cursor: "pointer",
      scrollSnapAlign: "start",
    },
    tileWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "transparent", border: 0, padding: 0, cursor: "pointer" },
    tile: {
      width: "100%", aspectRatio: "1 / 0.92", borderRadius: 20, display: "flex",
      alignItems: "center", justifyContent: "center", position: "relative",
    },
    badge: {
      position: "absolute", top: 6, right: 6, padding: "3px 6px", borderRadius: 999,
      background: t.cta, color: t.onCta, fontSize: 8.5, fontWeight: 900, letterSpacing: 0.4,
    },
    tileLabel: { fontSize: 12.5, fontWeight: 650, color: t.text, textAlign: "center", lineHeight: 1.2 },

    sectionRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "0 2px 10px" },
    sectionTitle: { fontSize: 17, fontWeight: 850, letterSpacing: -0.3 },

    hScroll: {
      display: "flex", gap: 10, overflowX: "auto", padding: "2px 2px 8px",
      scrollbarWidth: "none", scrollSnapType: "x proximity",
    },

    mediaCard: {
      position: "relative", flex: "0 0 62%", height: 150, borderRadius: 18, overflow: "hidden",
      border: 0, padding: 0, textAlign: "left", scrollSnapAlign: "start",
      background: "#1b2029", color: t.onHero, boxShadow: "0 12px 26px -10px rgba(16,19,25,.45)",
    },
    mediaImg: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
    mediaNoImg: { position: "absolute", inset: 0, background: "linear-gradient(135deg,#242838,#101319)" },
    mediaShade: {
      position: "absolute", inset: 0,
      background: "linear-gradient(180deg, rgba(12,14,20,0.08) 32%, rgba(12,14,20,0.78) 100%)",
    },
    datePill: {
      position: "absolute", top: 10, left: 10, padding: "5px 9px", borderRadius: 999,
      background: t.accent, color: t.onAccent, fontSize: 10.5, fontWeight: 850,
    },
    mediaBody: { position: "absolute", left: 0, right: 0, bottom: 0, padding: "10px 12px 12px" },
    mediaTitle: {
      display: "block", fontSize: 13.5, fontWeight: 850, color: t.onHero, lineHeight: 1.25,
      textShadow: "0 1px 4px rgba(0,0,0,0.35)",
    },
    mediaText: {
      display: "-webkit-box", marginTop: 3, fontSize: 11, color: "rgba(255,255,255,0.92)",
      lineHeight: 1.3, overflow: "hidden", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
      textShadow: "0 1px 4px rgba(0,0,0,0.35)",
    },

    // Такси-страница
    routeChip: {
      display: "inline-block", padding: "6px 11px", borderRadius: 999,
      background: t.accentSoft, color: t.accent, fontSize: 12, fontWeight: 800,
    },
    sheetHint: { margin: "0 0 10px", color: t.sub, fontSize: 13, textAlign: "center" },
    tariffRow: { display: "flex", gap: 8, marginBottom: 10 },
    tariffChip: active => ({
      flex: 1, padding: 12, borderRadius: 12,
      border: 0, background: active ? t.accent : t.inputBg,
      color: active ? t.onAccent : t.text, fontWeight: 800, fontSize: 13.5,
      cursor: "pointer",
    }),
    input: {
      width: "100%", padding: 12, border: 0, borderRadius: 12,
      background: t.inputBg, color: t.text, marginBottom: 10, boxSizing: "border-box",
      fontSize: 14,
    },
    extrasRow: {
      width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "13px 14px", borderRadius: 12, border: 0, background: t.inputBg,
      fontWeight: 700, marginBottom: 10, color: t.text, fontSize: 13.5,
    },
    extrasValue: { color: t.sub, fontSize: 12.5, fontWeight: 600 },
    errorBox: {
      padding: 12, borderRadius: 12, background: t.dangerSoft, color: t.danger,
      fontSize: 12.5, fontWeight: 700,
    },

    ctaBig: {
      width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 16px", borderRadius: 14, border: 0, background: t.cta, color: t.onCta,
      cursor: "pointer", boxShadow: "0 10px 24px -8px rgba(255,205,45,.55)",
      fontFamily: "inherit",
    },
    ctaLeft: { display: "flex", flexDirection: "column", alignItems: "flex-start" },
    ctaLabel: { fontSize: 9.5, opacity: 0.7, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 },
    ctaValue: { fontSize: 17, fontWeight: 900, letterSpacing: -0.3 },
    ctaRight: { display: "flex", alignItems: "center", gap: 7, fontSize: 15, fontWeight: 900 },

    mapBack: {
      position: "absolute", top: 14, left: 14, zIndex: 10, width: 42, height: 42,
      borderRadius: 12, border: 0, background: t.card, color: t.text,
      boxShadow: "0 8px 24px rgba(0,0,0,.25)", fontWeight: 800, cursor: "pointer",
    },

    // Страницы
    pageTitle: { margin: "0 0 14px", fontSize: 23, fontWeight: 850, letterSpacing: -0.5, color: t.text },
    listGroup: {
      background: t.card, borderRadius: 16, border: `1px solid ${t.border}`, overflow: "hidden",
      boxShadow: t.shadow, marginBottom: 10,
    },

    btnYellow: {
      width: "100%", padding: 14, borderRadius: 14, background: t.cta, color: t.onCta,
      fontWeight: 900, border: 0, cursor: "pointer", fontSize: 14.5, fontFamily: "inherit",
      boxShadow: "0 10px 24px -10px rgba(255,205,45,.6)",
    },
    btnBlue: {
      width: "100%", padding: 14, borderRadius: 14, background: t.accent, color: t.onAccent,
      fontWeight: 850, border: 0, cursor: "pointer", fontSize: 14.5, fontFamily: "inherit",
    },
    extraBtn: { flex: 1, padding: 11, borderRadius: 12, border: 0, fontWeight: 800, cursor: "pointer", fontSize: 13 },

    formLabel: { fontSize: 11.5, color: t.sub, margin: "2px 0 4px", display: "block", fontWeight: 700 },

    // Профиль (меню настроек)
    avatar: {
      width: 76, height: 76, borderRadius: "50%", background: t.accentSoft, color: t.accent,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 24, fontWeight: 900, letterSpacing: 0.5,
      border: `2px solid ${t.accent}`,
    },

    // Нижняя навигация (компактная, как в MAX)
    tabbar: {
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "min(100%, 460px)", display: "flex", justifyContent: "space-around",
      padding: "4px 6px calc(4px + env(safe-area-inset-bottom, 0px))",
      background: t.navBg, borderTop: `1px solid ${t.border}`, zIndex: 120,
      backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
    },
    tabBtn: {
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
      background: "transparent", border: 0, cursor: "pointer", padding: 0, fontFamily: "inherit",
    },
    tabLabel: { fontSize: 9.5, fontWeight: 700, lineHeight: 1 },
  };
}
