import CityZones from "./CityZones";
import Fraud from "./Fraud";
import { useEffect, useState } from "react";

const API = "/api";
const PURPLE = "#6545ed";

// Рейтинг в виде заряжающейся батареи (как в миниапах): изначально 100%,
// цвет — зелёный ≥80, жёлтый 60–79, оранжевый 40–59, красный <40.
function RatingBattery({ value = 100, w = 44 }) {
  const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const color = v >= 80 ? "#17b26a" : v >= 60 ? "#f5b400" : v >= 40 ? "#f97316" : "#ff3b5d";
  const h = Math.max(16, Math.round(w * 0.45));
  const fs = Math.max(9, Math.round(h * 0.5));
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ display: "inline-flex", alignItems: "center" }}>
        {/* Процент внутри корпуса: заряд заливает батарею слева,
            цифра поверх — белая с тенью, читается на любом заряде */}
        <span style={{
          position: "relative", width: w, height: h, borderRadius: 4,
          boxSizing: "border-box", border: "1.5px solid rgba(128,132,150,.55)",
          background: "#4b4f63", overflow: "hidden",
        }}>
          <span style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: `${v}%`, background: color, transition: "width .3s",
          }} />
          <span style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            fontSize: fs, fontWeight: 850, lineHeight: 1,
            color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,.55)",
          }}>{v}%</span>
        </span>
        <span style={{
          width: 3, height: Math.round(h * 0.42), borderRadius: "0 2px 2px 0",
          background: "rgba(128,132,150,.55)", marginLeft: 1,
        }} />
      </span>
    </span>
  );
}

// Отстранение от заказов: активное, выдача вручную и история.
// Автоматические (<50% рейтинга) создаёт система — здесь видны все.
function SuspensionPanel({ profileId, profile, reload }) {
  const [hours, setHours] = useState(24);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const suspensions = profile.suspensions || [];
  const active = suspensions.find(s =>
    !s.revoked_at && s.ends_at && new Date(s.ends_at).getTime() > Date.now()
  );

  async function post(path, body) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`${API}${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Ошибка");
      await reload();
    } catch (e) {
      setErr(e.message || "Не удалось выполнить действие");
    } finally {
      setBusy(false);
    }
  }

  const smallBtn = {
    padding: "9px 14px", borderRadius: 10, border: 0, cursor: "pointer",
    fontSize: 13, fontWeight: 800, fontFamily: "inherit",
    background: "#ffe9ec", color: "#d92b45",
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 15 }}>Отстранение от заказов</div>

      {active ? (
        <div style={{
          marginTop: 8, padding: 12, borderRadius: 12,
          background: "#ffe9ec", border: "1px solid #ffb8c2",
        }}>
          <div style={{ fontWeight: 800, color: "#d92b45", fontSize: 13.5 }}>
            Активно до {new Date(active.ends_at).toLocaleString("ru-RU")}
          </div>
          <div style={{ fontSize: 12.5, color: "#55525f", marginTop: 4 }}>
            {active.reason} · {active.source === "auto" ? "автоматически (низкий рейтинг)" : "вручную"}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#77748a" }}>
              Новые заказы, назначение и выход на линию заблокированы.
            </span>
            <button
              onClick={() => post(`/admin/executors/${profileId}/suspensions/${active.id}/revoke`)}
              disabled={busy}
              style={{ ...smallBtn, marginLeft: "auto" }}
            >{busy ? "…" : "Снять отстранение"}</button>
          </div>
        </div>
      ) : (
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#77748a" }}>
          Отстранений нет — исполнитель может брать заказы.
        </p>
      )}

      {/* Выдача отстранения вручную */}
      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select
          value={hours}
          onChange={e => setHours(Number(e.target.value))}
          style={{
            padding: "9px 11px", borderRadius: 10, border: "1px solid #e2dff0",
            fontSize: 13.5, fontFamily: "inherit", background: "#fff",
          }}
        >
          <option value={24}>24 часа</option>
          <option value={72}>72 часа</option>
          <option value={168}>7 дней</option>
        </select>
        <input
          placeholder="Причина (необязательно)"
          value={reason}
          onChange={e => setReason(e.target.value)}
          style={{
            flex: "1 1 180px", padding: "9px 11px", borderRadius: 10,
            border: "1px solid #e2dff0", fontSize: 13.5, fontFamily: "inherit",
          }}
        />
        <button
          onClick={() => post(`/admin/executors/${profileId}/suspensions`, {
            hours, reason: reason.trim() || null,
          })}
          disabled={busy}
          style={{
            padding: "9px 14px", borderRadius: 10, border: 0, cursor: "pointer",
            fontSize: 13, fontWeight: 800, fontFamily: "inherit",
            background: "#d92b45", color: "#fff", opacity: busy ? 0.6 : 1,
          }}
        >{busy ? "…" : "Отстранить"}</button>
      </div>
      {err && <div style={{ marginTop: 6, fontSize: 12.5, color: "#d92b45" }}>{err}</div>}

      {/* История отстранений */}
      {suspensions.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {suspensions.map(s => {
            const live = !s.revoked_at && s.ends_at && new Date(s.ends_at).getTime() > Date.now();
            return (
              <div key={s.id} style={{
                display: "flex", justifyContent: "space-between", gap: 8,
                padding: "7px 0", borderBottom: "1px solid #eeecf3", fontSize: 12.5,
              }}>
                <span>
                  <strong>{s.source === "auto" ? "Авто" : "Админ"}</strong>
                  {" · "}{new Date(s.starts_at).toLocaleString("ru-RU")} →{" "}
                  {new Date(s.ends_at).toLocaleString("ru-RU")}
                  <small style={{ display: "block", color: "#9a97ab", fontSize: 11.5, marginTop: 2 }}>
                    {s.reason}
                  </small>
                </span>
                <span style={{
                  alignSelf: "center", whiteSpace: "nowrap", fontWeight: 700,
                  fontSize: 11.5, color: s.revoked_at ? "#177e46" : live ? "#d92b45" : "#9a97ab",
                }}>
                  {s.revoked_at ? "снято" : live ? "действует" : "истекло"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Иконки в едином штриховом стиле (как в миниаппах «Про»)
const ICON_PATHS = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      <path d="M10 21v-6h4v6" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  orders: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  car: (
    <>
      <path d="M5 11 6.5 6.8A2 2 0 0 1 8.4 5.5h7.2a2 2 0 0 1 1.9 1.3L19 11" />
      <rect x="3.5" y="11" width="17" height="6" rx="1.5" />
      <path d="M7 17v2M17 17v2M7.5 14h.01M16.5 14h.01" />
    </>
  ),
  camera: (
    <>
      <path d="M3.5 8.5h3.2l1.6-2.4h7.4l1.6 2.4h3.2a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.5" r="3.6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 2.8v5.4c0 4.4-3 8-7 9.8-4-1.8-7-5.4-7-9.8V5.8L12 3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  mega: (
    <>
      <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" />
      <path d="M15 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  brief: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12h18" />
    </>
  ),
  rent: (
    <>
      <path d="M3 21V9l9-6 9 6v12" />
      <path d="M9 21v-7h6v7" />
    </>
  ),
  map: (
    <>
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
      <path d="M9 3v15M15 6v15" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  money: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 10v4M18 10v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  star: <path d="m12 3 2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-3-5.5 3 1-6.1L3 9.5l6.3-.9z" />,
  power: (
    <>
      <path d="M12 3v9" />
      <path d="M6.5 6.5a8 8 0 1 0 11 0" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17s-2.5-1.5-2.5-7.5" />
      <path d="M13.7 19.5a2 2 0 0 1-3.4 0" />
    </>
  ),
};

function Icon({ name, size = 20, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flex: "0 0 auto", ...style }}
    >
      {ICON_PATHS[name] || null}
    </svg>
  );
}

const MENU = [
  { id: "dashboard", icon: "home", title: "Дашборд" },
  { id: "analytics", icon: "chart", title: "Статистика", adminOnly: true },
  { id: "orders", icon: "orders", title: "Заказы", count: "orders" },
  { id: "clients", icon: "person", title: "Клиенты", count: "clients" },
  { id: "executors", icon: "car", title: "Исполнители", count: "executors" },
  { id: "photo-checks", icon: "camera", title: "Фотоконтроль", count: "photoChecks" },
  { id: "fraud", icon: "shield", title: "Антифрод" },
  { id: "notifications", icon: "bell", title: "Уведомления", count: "messages" },
  { id: "ads", icon: "mega", title: "Реклама" },
  { id: "city-zones", icon: "map", title: "Городские зоны", adminOnly: true },
  { id: "settings", icon: "gear", title: "Настройки", adminOnly: true },
  { id: "operators", icon: "person", title: "Операторы", adminOnly: true },
];

// У оператора свой список вкладок: диспетчерская работа без админских разделов
const OPERATOR_TABS = [
  "orders", "clients", "executors", "photo-checks",
  "notifications", "ads", "dashboard", "fraud",
];

// Типы фото-контроля (как у конкурентов: авто, документы, селфи, номер)
const PHOTO_KINDS = {
  car: "Фото автомобиля",
  documents: "Фото документов",
  selfie: "Селфи исполнителя",
  plate: "Фото номера",
};

const PAGE_INFO = {
  dashboard: ["Дашборд сервиса", "Основные показатели, районы края, роли и проблемы"],
  analytics: ["Статистика сервиса", "Ключевые показатели и динамика заказов"],
  orders: ["Заказы", "Новые сверху, фильтры по статусу и услуге"],
  clients: ["Клиенты", "База клиентов, балансы и контакты"],
  executors: ["Исполнители", "Такси, курьеры, мастера и их балансы"],
  "photo-checks": ["Фотоконтроль", "Запросы фото и решения модератора"],
  fraud: ["Антифрод", "Пары «клиент:исполнитель» с подозрением на накрутку"],
  notifications: ["Уведомления", "Чаты с клиентами и исполнителями, служебные события"],
  ads: ["Реклама", "Блоки предложений на главной клиентского миниаппа"],
  jobs: ["Вакансии", "Модерация объявлений о работе"],
  rentals: ["Аренда", "Модерация объявлений об аренде авто и жилья"],
  "city-zones": ["Городские зоны", "Границы города и зоны на карте"],
  settings: ["Настройки", "Комиссия и параметры сервиса"],
  operators: ["Операторы", "Доступ в панель: логины, пароли, включение и удаление"],
};

const STATUS_LABELS = {
  created: "Создан",
  accepted: "Принят",
  assigned: "Назначен",
  in_progress: "Выполняется",
  completed: "Завершён",
  cancelled: "Отменён",
};

const STATUS_COLORS = {
  created: { background: "#eee9ff", color: "#6545ed" },
  accepted: { background: "#e8f0fe", color: "#1d4ed8" },
  assigned: { background: "#fff4e5", color: "#b45309" },
  in_progress: { background: "#e0f2fe", color: "#0369a1" },
  completed: { background: "#e6f7ed", color: "#177e46" },
  cancelled: { background: "#ffe9ec", color: "#d92b45" },
};

const SERVICE_LABELS = {
  taxi: "Такси",
  courier: "Курьер",
  cargo: "Грузоперевозки",
  master: "Мастера",
  tech_help: "Автотехпомощь",
};

// Какая роль исполнителя нужна для услуги (для диспетчеризации)
const SERVICE_ROLE = {
  taxi: "driver",
  courier: "courier",
  cargo: "cargo",
  master: "master",
  tech_help: "driver",
};

const ROLE_LABELS = {
  driver: "Исполнитель (такси)",
  courier: "Курьер",
  cargo: "Грузоперевозчик",
  master: "Мастер",
  car_owner: "Арендодатель авто",
  flat_owner: "Арендодатель жилья",
};

const SELECT_STYLE = {
  padding: "9px 12px", borderRadius: 10, border: "1px solid #e2dff0",
  fontSize: 14, fontFamily: "inherit", background: "#fff",
};

export default function App() {
  const [tab, setTab] = useState("orders");
  const [menuOpen, setMenuOpen] = useState(false);
  const [clock, setClock] = useState("");
  const [expandedOrder, setExpandedOrder] = useState(null);
  // Диспетчеризация: выбранный исполнитель по каждому заказу
  const [assignPick, setAssignPick] = useState({});
  const [assigning, setAssigning] = useState(null);
  const [commission, setCommission] = useState("15");
  const [msg, setMsg] = useState("");
  const [orders, setOrders] = useState([]);
  const [orderStatus, setOrderStatus] = useState("");
  const [orderService, setOrderService] = useState("");
  // Создание заказа за клиента (диспетчерская)
  const [createForm, setCreateForm] = useState({
    client_id: "", service: "taxi", tech_key: "jump_start",
    from_address: "", to_address: "", distance_km: "",
    date: "", time: "", comment: "",
  });
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [createMsg, setCreateMsg] = useState("");
  const [createErr, setCreateErr] = useState(false);
  const [clients, setClients] = useState([]);
  const [executors, setExecutors] = useState([]);
  const [photoChecks, setPhotoChecks] = useState([]);
  const [photoForm, setPhotoForm] = useState({ executor_id: "", kind: "car", comment: "" });
  const [error, setError] = useState("");
  // Профиль исполнителя (открывается двойным кликом по карточке)
  const [profileId, setProfileId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [noteText, setNoteText] = useState("");
  // Транспорт исполнителя (в карточке профиля)
  const [vehicleForm, setVehicleForm] = useState(null);
  const [vehicleSaving, setVehicleSaving] = useState(false);
  // Лента сообщений оператора
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState({});
  // Профиль клиента (двойной клик)
  const [clientId, setClientId] = useState(null);
  const [clientProfile, setClientProfile] = useState(null);
  const [clientNote, setClientNote] = useState("");
  const [jobs, setJobs] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [ads, setAds] = useState([]);
  const [adForm, setAdForm] = useState({
    title: "",
    description: "",
    link: "",
    position: 0,
    active: true,
    placement: "home",
    event_date: "",
  });
  const [adFile, setAdFile] = useState(null);
  const [adMsg, setAdMsg] = useState("");
  const [analytics, setAnalytics] = useState(null);
  // Дашборд: фильтры (период, роль, район КК) и данные сводки
  const [dash, setDash] = useState(null);
  const [dashPeriod, setDashPeriod] = useState(30);
  const [dashRole, setDashRole] = useState("");
  const [dashDistrict, setDashDistrict] = useState("");
  const [needLogin, setNeedLogin] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  // Кто вошёл: админ или оператор (определяет доступные вкладки)
  const [staff, setStaff] = useState(null);
  const [loginMode, setLoginMode] = useState("admin");
  const [opLogin, setOpLogin] = useState("");
  const [opPassword, setOpPassword] = useState("");
  // Управление операторами (только админ)
  const [operators, setOperators] = useState([]);
  const [opForm, setOpForm] = useState({ login: "", password: "", name: "" });
  const [opMsg, setOpMsg] = useState("");

  useEffect(() => {
    checkAuth();
  }, []);

  // Дашборд грузим при открытии вкладки и при смене любого фильтра
  useEffect(() => {
    if (tab === "dashboard" && !needLogin) loadDashboard();
  }, [tab, dashPeriod, dashRole, dashDistrict, needLogin]);

  // Оператору недоступные вкладки закрываем, «Операторы» грузим только админу
  useEffect(() => {
    if (!staff) return;
    if (staff.role === "operator" && !OPERATOR_TABS.includes(tab)) setTab("orders");
    if (tab === "operators" && staff.role === "admin") loadOperators();
  }, [staff, tab]);

  // Лента чатов: загрузка при открытии вкладки и живой опрос
  useEffect(() => {
    if (tab !== "notifications" || needLogin) return;
    loadMessages();
    const it = setInterval(loadMessages, 15000);
    return () => clearInterval(it);
  }, [tab, needLogin]);

  // Фотоконтроль тоже грузим при открытии вкладки (раньше — только после решения)
  useEffect(() => {
    if (tab === "photo-checks" && !needLogin) loadPhotoChecks();
  }, [tab, needLogin]);

  // Живые часы в шапке — как в админке конкурента
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const p = n => String(n).padStart(2, "0");
      setClock(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  async function checkAuth() {
    // whoami работает и для админа, и для оператора — по нему decide вкладки
    const res = await fetch(API + "/admin/whoami", {
      credentials: "include",
    });

    if (res.status === 401) {
      setNeedLogin(true);
      return;
    }

    const data = await res.json().catch(() => ({}));
    setStaff(data);
    loadAll(data);
  }

  async function loadSettings() {
    const res = await fetch(API + "/admin/settings", {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    setCommission(data.commission_percent || "15");
  }

  async function loadAll(who) {
    const role = (who || staff)?.role || "admin";
    const base = [
      loadOrders(),
      loadClients(),
      loadExecutors(),
      loadAds(),
      loadMessages(),
    ];
    if (role === "admin") {
      base.push(loadAnalytics(), loadSettings());
    }
    await Promise.all(base);
  }

  async function loadAds() {
    const res = await fetch(API + "/admin/ads", {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    setAds(data.ads || []);
  }

  async function uploadAd(e) {
    e.preventDefault();
    setAdMsg("");

    if (!adForm.title.trim()) {
      setAdMsg("Укажите заголовок");
      return;
    }

    const form = new FormData();
    form.append("title", adForm.title);
    form.append("description", adForm.description);
    form.append("link", adForm.link);
    form.append("position", String(adForm.position || 0));
    form.append("active", adForm.active ? "true" : "false");
    form.append("placement", adForm.placement || "home");
    form.append("event_date", adForm.event_date || "");
    if (adFile) form.append("image", adFile);

    const res = await fetch(API + "/admin/ads", {
      method: "POST",
      credentials: "include",
      body: form,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAdMsg(data.detail || "Не удалось сохранить");
      return;
    }

    setAdForm({
      title: "",
      description: "",
      link: "",
      position: 0,
      active: true,
      placement: "home",
      event_date: "",
    });
    setAdFile(null);
    setAdMsg("Реклама добавлена");
    loadAds();
  }

  async function toggleAd(ad) {
    await fetch(`${API}/admin/ads/${ad.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !ad.active }),
    });
    loadAds();
  }

  async function removeAd(ad) {
    if (!window.confirm(`Удалить «${ad.title}»?`)) return;
    await fetch(`${API}/admin/ads/${ad.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    loadAds();
  }

  async function loadOrders() {
    const params = new URLSearchParams();

    if (orderStatus) params.set("status", orderStatus);
    if (orderService) params.set("service", orderService);

    const res = await fetch(API + "/admin/orders?" + params.toString(), {
      credentials: "include",
    });

    const data = await res.json().catch(() => ({}));
    setOrders(data.orders || []);
  }

  // Диспетчеризация: админ/оператор назначает исполнителя на заказ
  async function assignOrder(orderId) {
    const execId = assignPick[orderId];
    if (!execId) return;
    setAssigning(orderId);
    setError("");
    try {
      const res = await fetch(`${API}/orders/${orderId}/assign/${execId}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail || "Не удалось назначить исполнителя");
      } else {
        setExpandedOrder(orderId);
      }
      await loadOrders();
    } catch (e) {
      setError(e.message || "Не удалось назначить исполнителя");
    } finally {
      setAssigning(null);
    }
  }

  // Оператор оформляет заказ за клиента — цена считается сервером
  async function createForClient(e) {
    e.preventDefault();
    setCreateMsg("");
    setCreateErr(false);
    const f = createForm;
    if (!f.client_id || !f.from_address.trim()) {
      setCreateMsg("Выберите клиента и укажите адрес подачи");
      setCreateErr(true);
      return;
    }
    const dist = Number(f.distance_km) || 0;
    const isTaxi = f.service === "taxi";
    const body = {
      client_id: Number(f.client_id),
      service: f.service,
      tariff_code: isTaxi ? "standard" : f.service,
      from_address: f.from_address.trim(),
      to_address: f.to_address.trim(),
      distance_km: dist,
      city_km: isTaxi ? dist : 0,
      out_km: 0,
      scheduled_at: f.date && f.time
        ? new Date(`${f.date}T${f.time}:00`).toISOString()
        : null,
      comment: f.comment.trim() || null,
      meta: f.service === "tech_help" ? { service_key: f.tech_key } : {},
    };
    setCreatingOrder(true);
    try {
      const res = await fetch(API + "/admin/orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateMsg(data.detail || "Не удалось создать заказ");
        setCreateErr(true);
      } else {
        setCreateMsg(`Заказ №${data.id} создан · ${data.total_price} ₽`);
        setCreateForm(prev => ({
          ...prev, from_address: "", to_address: "", distance_km: "", comment: "",
        }));
        loadOrders();
      }
    } catch (e2) {
      setCreateMsg(e2.message || "Ошибка при создании заказа");
      setCreateErr(true);
    } finally {
      setCreatingOrder(false);
    }
  }

  async function loadClients() {
    const res = await fetch(API + "/admin/clients", {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    setClients(data.clients || []);
  }

  async function loadExecutors() {
    const res = await fetch(API + "/admin/executors", {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    setExecutors(data.executors || []);
  }

  async function loadPhotoChecks() {
    const res = await fetch(API + "/admin/photo-checks", {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    setPhotoChecks(data.photo_checks || []);
  }

  async function decidePhotoCheck(id, status, comment) {
    try {
      await fetch(`${API}/admin/photo-checks/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, comment }),
      });
      await loadPhotoChecks();
    } catch (e) {
      setError(e.message || "Не удалось сохранить решение");
    }
  }

  async function requestPhotoCheck(executorId, kind, comment) {
    try {
      await fetch(`${API}/admin/executors/${executorId}/photo-checks`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, comment, title: PHOTO_KINDS[kind] }),
      });
      await loadPhotoChecks();
    } catch (e) {
      setError(e.message || "Не удалось отправить запрос");
    }
  }

  async function openExecutorProfile(executorId) {
    setProfileId(executorId);
    setProfile(null);
    setNoteText("");
    try {
      const res = await fetch(`${API}/admin/executors/${executorId}/profile`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      setProfile(data);
      const v = data.vehicle || {};
      setVehicleForm({
        brand: v.brand || "", model: v.model || "", color: v.color || "",
        plate: v.plate || "", year: v.year || "", seats: v.seats || "",
        approved: !!v.approved,
      });
    } catch (e) {
      setError(e.message || "Не удалось загрузить профиль");
    }
  }

  async function saveVehicle() {
    if (!profileId || !vehicleForm) return;
    setVehicleSaving(true);
    try {
      const res = await fetch(`${API}/admin/executors/${profileId}/vehicle`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...vehicleForm,
          year: vehicleForm.year ? Number(vehicleForm.year) : null,
          seats: vehicleForm.seats ? Number(vehicleForm.seats) : null,
        }),
      });
      const saved = await res.json().catch(() => ({}));
      setProfile(p => p && ({ ...p, vehicle: saved }));
    } catch (e) {
      setError(e.message || "Не удалось сохранить транспорт");
    } finally {
      setVehicleSaving(false);
    }
  }

  async function sendNote(executorId) {
    const body = noteText.trim();
    if (!body) return;
    try {
      await fetch(`${API}/admin/executors/${executorId}/notifications`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Сообщение от администратора", body }),
      });
      setNoteText("");
      await openExecutorProfile(executorId);
    } catch (e) {
      setError(e.message || "Не удалось отправить уведомление");
    }
  }

  async function openClientProfile(id) {
    setClientId(id);
    setClientProfile(null);
    setClientNote("");
    try {
      const res = await fetch(`${API}/admin/clients/${id}/profile`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      setClientProfile(data);
    } catch (e) {
      setError(e.message || "Не удалось загрузить профиль клиента");
    }
  }

  async function sendClientNote(id) {
    const body = clientNote.trim();
    if (!body) return;
    try {
      await fetch(`${API}/admin/clients/${id}/notifications`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Сообщение от оператора", body }),
      });
      setClientNote("");
    } catch (e) {
      setError(e.message || "Не удалось отправить уведомление");
    }
  }

  async function loadMessages() {
    try {
      const res = await fetch(API + "/admin/messages", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      setMessages(data.messages || []);
    } catch (e) {
      setError(e.message || "Не удалось загрузить уведомления");
    }
  }

  // Ключ собеседника в поле ответа: клиент или исполнитель
  const peerKey = m => (m.client_id ? `c${m.client_id}` : `e${m.executor_id}`);

  async function replyTo(m, text) {
    const body = (text || "").trim();
    if (!body) return;
    const q = m.client_id ? `client_id=${m.client_id}` : `executor_id=${m.executor_id}`;
    try {
      await fetch(`${API}/admin/messages?${q}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body }),
      });
      setReplyText(t => ({ ...t, [peerKey(m)]: "" }));
      await loadMessages();
    } catch (e) {
      setError(e.message || "Не удалось отправить ответ");
    }
  }

  async function loadJobs() {
    const res = await fetch(API + "/admin/jobs", {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    setJobs(data.jobs || []);
  }

  async function loadAnalytics() {
    const res = await fetch(API + "/admin/analytics", {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    setAnalytics(data);
  }

  async function loadDashboard() {
    const q = new URLSearchParams({ period: String(dashPeriod) });
    if (dashRole) q.set("role", dashRole);
    if (dashDistrict) q.set("district", dashDistrict);
    try {
      const res = await fetch(`${API}/admin/dashboard?${q}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      setDash(data);
    } catch (e) {
      setDash({ totals: null });
    }
  }

  async function loadRentals() {
    const res = await fetch(API + "/admin/rentals", {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    setRentals(data.listings || []);
  }

  async function login() {
    setLoginError("");

    if (loginMode === "operator") {
      const res = await fetch(API + "/admin/operator/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: opLogin.trim(), password: opPassword }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setLoginError(d.detail || "Неверный логин или пароль");
        return;
      }

      const data = await res.json().catch(() => ({}));
      setStaff({ role: "operator", name: data.name || data.login });
      setNeedLogin(false);
      setOpPassword("");
      setTab("orders");
      loadAll({ role: "operator" });
      return;
    }

    const res = await fetch(API + "/admin/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      setLoginError("Неверный пароль");
      return;
    }

    setStaff({ role: "admin", name: "Администратор" });
    setNeedLogin(false);
    setPassword("");
    loadAll({ role: "admin" });
  }

  async function logout() {
    // Закрываем обе сессии — cookie может быть админской или операторской
    await fetch(API + "/admin/logout", { method: "POST", credentials: "include" });
    await fetch(API + "/admin/operator/logout", { method: "POST", credentials: "include" });
    setStaff(null);
    setMenuOpen(false);
    setNeedLogin(true);
  }

  // --- операторы (только админ) ---
  async function loadOperators() {
    const res = await fetch(API + "/admin/operators", { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    setOperators(data.operators || []);
  }

  async function createOperator(e) {
    e.preventDefault();
    setOpMsg("");
    if (!opForm.login.trim() || !opForm.password) {
      setOpMsg("Логин и пароль обязательны");
      return;
    }
    const res = await fetch(API + "/admin/operators", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: opForm.login.trim(),
        password: opForm.password,
        name: opForm.name.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setOpMsg(data.detail || "Не удалось создать оператора");
      return;
    }
    setOpForm({ login: "", password: "", name: "" });
    setOpMsg("Оператор создан");
    loadOperators();
  }

  async function toggleOperator(id) {
    await fetch(`${API}/admin/operators/${id}/toggle`, {
      method: "POST",
      credentials: "include",
    });
    loadOperators();
  }

  async function deleteOperator(id) {
    if (!window.confirm("Удалить оператора? Доступ будет отключён сразу.")) return;
    await fetch(`${API}/admin/operators/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    loadOperators();
  }

  async function save() {
    const res = await fetch(API + "/admin/settings", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "commission_percent",
        value: commission,
      }),
    });

    setMsg(res.ok ? "Сохранено" : "Ошибка");
  }

  async function moderateJob(id, action) {
    await fetch(`${API}/admin/jobs/${id}/${action}`, {
      method: "POST",
      credentials: "include",
    });
    loadJobs();
  }

  async function moderateRental(id, action) {
    await fetch(`${API}/admin/rentals/${id}/${action}`, {
      method: "POST",
      credentials: "include",
    });
    loadRentals();
  }

  async function changeBalance(type, id) {
    const amount = prompt("Введите сумму. Например: 500 или -200");
    if (!amount) return;

    await fetch(`${API}/admin/${type}/${id}/balance`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount) }),
    });

    if (type === "clients") loadClients();
    if (type === "executors") loadExecutors();
    if (type === "photo-checks") { loadPhotoChecks(); loadExecutors(); }
    if (type === "notifications") loadMessages();
  }

  function go(id) {
    setTab(id);
    setMenuOpen(false);
  }

  const card = {
    border: "1px solid #ececf2",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    background: "#fff",
    boxShadow: "0 1px 3px rgba(20,16,50,.05)",
  };

  const button = {
    padding: "11px 18px",
    borderRadius: 10,
    border: 0,
    background: PURPLE,
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    marginRight: 8,
    marginBottom: 8,
  };

  const input = {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #e2e2ea",
    background: "#fafafd",
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
    color: "#232139",
  };

  const counts = {
    orders: orders.length,
    clients: clients.length,
    executors: executors.length,
    photoChecks: photoChecks.filter(p => p.status === "pending" || p.status === "requested").length,
    messages: messages.filter(m => !m.is_read).length,
  };

  if (needLogin) {
    return (
      <div style={{
        fontFamily: "system-ui",
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0e0d14",
        padding: 20,
      }}>
        <div style={{
          background: "#fff",
          padding: 30,
          borderRadius: 20,
          width: "100%",
          maxWidth: 380,
          boxShadow: "0 18px 50px rgba(0,0,0,.35)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{
              width: 38, height: 38, borderRadius: 12, background: PURPLE,
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 900, fontSize: 18,
            }}>П</span>
            <h1 style={{ margin: 0, fontSize: 20 }}>Про — Админпанель</h1>
          </div>

          {/* Режим входа: администратор по паролю, оператор по логину и паролю */}
          <div style={{
            display: "flex", gap: 6, background: "#f1f1f6",
            padding: 4, borderRadius: 10, margin: "14px 0 12px",
          }}>
            {[["admin", "Администратор"], ["operator", "Оператор"]].map(([id, label]) => (
              <button
                key={id}
                onClick={() => { setLoginMode(id); setLoginError(""); }}
                style={{
                  flex: 1, padding: "9px 8px", borderRadius: 8, border: 0,
                  background: loginMode === id ? PURPLE : "transparent",
                  color: loginMode === id ? "#fff" : "#77748a",
                  fontWeight: 750, fontSize: 13.5, cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >{label}</button>
            ))}
          </div>

          {loginMode === "operator" && (
            <input
              placeholder="Логин оператора"
              value={opLogin}
              onChange={e => setOpLogin(e.target.value)}
              onKeyDown={e => e.key === "Enter" && login()}
              style={{
                width: "100%",
                padding: 13,
                marginBottom: 10,
                borderRadius: 10,
                border: "1px solid #e2e2ea",
                background: "#fafafd",
                boxSizing: "border-box",
                fontFamily: "inherit",
                fontSize: 15,
              }}
            />
          )}

          <div style={{ position: "relative", margin: loginMode === "operator" ? "0 0 12px" : "16px 0 12px" }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder={loginMode === "operator" ? "Пароль оператора" : "Пароль администратора"}
              value={loginMode === "operator" ? opPassword : password}
              onChange={e => loginMode === "operator" ? setOpPassword(e.target.value) : setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && login()}
              style={{
                width: "100%",
                padding: "13px 46px 13px 13px",
                borderRadius: 10,
                border: "1px solid #e2e2ea",
                background: "#fafafd",
                boxSizing: "border-box",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              title={showPassword ? "Скрыть пароль" : "Показать пароль"}
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                width: 34,
                height: 34,
                border: 0,
                background: "transparent",
                color: "#8a8798",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {showPassword ? (
                  <>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 8 10 8a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
            </button>
          </div>

          <button
            onClick={login}
            style={{
              width: "100%",
              padding: 14,
              borderRadius: 10,
              border: 0,
              background: PURPLE,
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Войти
          </button>

          {loginError && (
            <p style={{ color: "#dc2626", marginTop: 10 }}>{loginError}</p>
          )}
        </div>
      </div>
    );
  }

  const page = PAGE_INFO[tab] || ["", ""];
  // Оператор видит только диспетчерские вкладки
  const isOperator = staff?.role === "operator";
  const visibleMenu = MENU.filter(m => !isOperator || OPERATOR_TABS.includes(m.id));

  return (
    <div style={{
      fontFamily: "system-ui",
      background: "#f0f1f5",
      minHeight: "100dvh",
      color: "#232139",
    }}>
      {/* Тёмная шапка: название + живые часы + гамбургер */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "#14131b",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 18px",
        boxShadow: "0 2px 12px rgba(0,0,0,.25)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{
            width: 30, height: 30, borderRadius: 9, background: PURPLE,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 15, flex: "0 0 auto",
          }}>П</span>
          <span style={{
            fontSize: 17, fontWeight: 700, whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis",
          }}>
            Про{isOperator && staff?.name ? ` · ${staff.name}` : ""} — {clock}
          </span>
        </div>

        <button
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Меню"
          style={{
            width: 46, height: 40,
            border: "1.5px solid rgba(255,255,255,.55)",
            borderRadius: 10,
            background: "transparent",
            color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            flex: "0 0 auto",
          }}
        >
          <Icon name={menuOpen ? "close" : "menu"} size={22} />
        </button>
      </header>

      {/* Тёмное меню-список со счётчиками */}
      {menuOpen && (
        <nav style={{
          position: "sticky",
          top: 69,
          zIndex: 49,
          background: "#1c1b24",
          padding: "8px 0 14px",
          boxShadow: "0 10px 24px rgba(0,0,0,.35)",
        }}>
          {visibleMenu.map(m => {
            const active = tab === m.id;
            return (
              <button
                key={m.id}
                onClick={() => go(m.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  width: "100%",
                  padding: "13px 20px",
                  background: active ? "rgba(101,69,237,.22)" : "transparent",
                  border: 0,
                  color: active ? "#fff" : "#c7c5d1",
                  fontSize: 16,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                <Icon name={m.icon} size={20} style={{ color: active ? "#a892ff" : "#8f8c9e" }} />
                <span style={{ flex: 1 }}>{m.title}</span>
                {m.count && counts[m.count] !== undefined && (
                  <span style={{
                    background: PURPLE, color: "#fff",
                    fontSize: 12, fontWeight: 800,
                    padding: "3px 9px", borderRadius: 999,
                  }}>
                    {counts[m.count]}
                  </span>
                )}
              </button>
            );
          })}

          <button
            onClick={logout}
            style={{
              display: "flex", alignItems: "center", gap: 14,
              width: "100%", padding: "13px 20px", marginTop: 6,
              background: "transparent", border: 0,
              color: "#ff8f9c", fontSize: 16, cursor: "pointer",
              textAlign: "left", fontFamily: "inherit",
            }}
          >
            <Icon name="power" size={20} />
            <span>Выйти</span>
          </button>
        </nav>
      )}

      <main style={{ maxWidth: 980, margin: "0 auto", padding: "18px 14px 90px" }}>
        {/* Заголовок раздела: крупный жирный + серый подзаголовок */}
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 850, letterSpacing: -0.4 }}>
            {page[0]}
          </h1>
          <p style={{ margin: "6px 0 0", color: "#77748a", fontSize: 15 }}>
            {page[1]}
          </p>
        </div>

        {tab === "city-zones" && <CityZones />}
        {tab === "fraud" && <Fraud />}

        {tab === "orders" && (
          <div>
            <div style={card}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 12,
              }}>
                <label style={{ fontSize: 13, color: "#77748a", fontWeight: 650 }}>
                  Статус
                  <select
                    value={orderStatus}
                    onChange={e => setOrderStatus(e.target.value)}
                    style={{ ...input, marginTop: 6, appearance: "auto" }}
                  >
                    <option value="">Все статусы</option>
                    <option value="created">Создан</option>
                    <option value="accepted">Принят</option>
                    <option value="assigned">Назначен</option>
                    <option value="in_progress">Выполняется</option>
                    <option value="completed">Завершён</option>
                    <option value="cancelled">Отменён</option>
                  </select>
                </label>

                <label style={{ fontSize: 13, color: "#77748a", fontWeight: 650 }}>
                  Услуга
                  <select
                    value={orderService}
                    onChange={e => setOrderService(e.target.value)}
                    style={{ ...input, marginTop: 6, appearance: "auto" }}
                  >
                    <option value="">Все услуги</option>
                    <option value="taxi">Такси</option>
                    <option value="courier">Курьер</option>
                    <option value="cargo">Грузоперевозки</option>
                    <option value="master">Мастера</option>
                    <option value="tech_help">Автотехпомощь</option>
                  </select>
                </label>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
                <button
                  onClick={loadOrders}
                  style={{ ...button, margin: 0, padding: "12px 34px", textTransform: "uppercase", letterSpacing: 0.5 }}
                >
                  Применить
                </button>

                <button
                  onClick={() => { setOrderStatus(""); setOrderService(""); setTimeout(loadOrders, 0); }}
                  style={{
                    background: "transparent", color: "#77748a",
                    border: 0, fontWeight: 650, cursor: "pointer",
                    fontSize: 14, fontFamily: "inherit", padding: "10px 4px",
                  }}
                >
                  Сброс
                </button>

                <span style={{ color: "#77748a", fontSize: 14 }}>
                  Найдено: <strong style={{ color: "#232139" }}>{orders.length}</strong>
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {[
                ["/admin/orders/export.csv", "Заказы CSV"],
                ["/admin/clients/export.csv", "Клиенты CSV"],
                ["/admin/executors/export.csv", "Исполнители CSV"],
              ].map(([href, title]) => (
                <a
                  key={href}
                  href={API + href}
                  style={{
                    padding: "9px 14px",
                    borderRadius: 10,
                    background: "#e6f7ed",
                    color: "#177e46",
                    textDecoration: "none",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  {title}
                </a>
              ))}
            </div>

            {/* Создание заказа за клиента — работает и у админа, и у оператора */}
            <div style={{ ...card, marginBottom: 12 }}>
              <div style={{ fontWeight: 850, fontSize: 16, marginBottom: 10 }}>
                Создать заказ за клиента
              </div>
              <form
                onSubmit={createForClient}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                  gap: 12,
                  alignItems: "end",
                }}
              >
                <label style={{ fontSize: 13, color: "#77748a", fontWeight: 650 }}>
                  Клиент
                  <select
                    value={createForm.client_id}
                    onChange={e => setCreateForm(f => ({ ...f, client_id: e.target.value }))}
                    style={{ ...input, marginTop: 6, appearance: "auto" }}
                  >
                    <option value="">Выберите…</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name || `ID ${c.id}`} · {c.phone || c.max_id}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ fontSize: 13, color: "#77748a", fontWeight: 650 }}>
                  Услуга
                  <select
                    value={createForm.service}
                    onChange={e => setCreateForm(f => ({ ...f, service: e.target.value }))}
                    style={{ ...input, marginTop: 6, appearance: "auto" }}
                  >
                    <option value="taxi">Такси</option>
                    <option value="cargo">Грузоперевозки</option>
                    <option value="tech_help">Автотехпомощь</option>
                  </select>
                </label>

                {createForm.service === "tech_help" && (
                  <label style={{ fontSize: 13, color: "#77748a", fontWeight: 650 }}>
                    Услуга автотехпомощи
                    <select
                      value={createForm.tech_key}
                      onChange={e => setCreateForm(f => ({ ...f, tech_key: e.target.value }))}
                      style={{ ...input, marginTop: 6, appearance: "auto" }}
                    >
                      <option value="jump_start">Прикурить авто — 500 ₽</option>
                      <option value="tire_inflate">Подкачать колесо — 250 ₽</option>
                      <option value="diagnostics">Диагностика — 1000 ₽</option>
                      <option value="tow">Эвакуация — по грузоперевозкам (предзаказ)</option>
                      <option value="sober_driver">Трезвый водитель — 3× тариф, от 1000 ₽</option>
                    </select>
                  </label>
                )}

                <label style={{ fontSize: 13, color: "#77748a", fontWeight: 650 }}>
                  Откуда
                  <input
                    value={createForm.from_address}
                    onChange={e => setCreateForm(f => ({ ...f, from_address: e.target.value }))}
                    placeholder="Адрес подачи"
                    style={{ ...input, marginTop: 6 }}
                  />
                </label>

                <label style={{ fontSize: 13, color: "#77748a", fontWeight: 650 }}>
                  Куда
                  <input
                    value={createForm.to_address}
                    onChange={e => setCreateForm(f => ({ ...f, to_address: e.target.value }))}
                    placeholder="Назначение"
                    style={{ ...input, marginTop: 6 }}
                  />
                </label>

                <label style={{ fontSize: 13, color: "#77748a", fontWeight: 650 }}>
                  Расстояние, км
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={createForm.distance_km}
                    onChange={e => setCreateForm(f => ({ ...f, distance_km: e.target.value }))}
                    placeholder="0"
                    style={{ ...input, marginTop: 6 }}
                  />
                </label>

                <label style={{ fontSize: 13, color: "#77748a", fontWeight: 650 }}>
                  Дата подачи
                  <input
                    type="date"
                    value={createForm.date}
                    onChange={e => setCreateForm(f => ({ ...f, date: e.target.value }))}
                    style={{ ...input, marginTop: 6 }}
                  />
                </label>

                <label style={{ fontSize: 13, color: "#77748a", fontWeight: 650 }}>
                  Время подачи
                  <input
                    type="time"
                    value={createForm.time}
                    onChange={e => setCreateForm(f => ({ ...f, time: e.target.value }))}
                    style={{ ...input, marginTop: 6 }}
                  />
                </label>

                <label style={{ fontSize: 13, color: "#77748a", fontWeight: 650 }}>
                  Комментарий
                  <input
                    value={createForm.comment}
                    onChange={e => setCreateForm(f => ({ ...f, comment: e.target.value }))}
                    placeholder="Необязательно"
                    style={{ ...input, marginTop: 6 }}
                  />
                </label>

                <button
                  type="submit"
                  disabled={creatingOrder}
                  style={{
                    ...button, marginTop: 0, marginBottom: 0,
                    opacity: creatingOrder ? 0.6 : 1,
                  }}
                >
                  {creatingOrder ? "Создаём…" : "Создать заказ"}
                </button>
              </form>
              {createMsg && (
                <p style={{ marginTop: 10, fontSize: 13.5, fontWeight: 700, color: createErr ? "#d92b45" : "#177e46" }}>
                  {createMsg}
                </p>
              )}
              {createForm.service === "tech_help" && createForm.tech_key === "tow" && (
                <p style={{ marginTop: 8, fontSize: 12.5, color: "#b45309" }}>
                  Эвакуация доступна только как предзаказ — укажите дату и время.
                </p>
              )}
            </div>

            {orders.length === 0 && (
              <div style={{ ...card, textAlign: "center", color: "#77748a" }}>
                Заказов по фильтру нет
              </div>
            )}

            {orders.map(o => {
              const open = expandedOrder === o.id;
              const st = STATUS_COLORS[o.status] || STATUS_COLORS.created;
              const created = o.created_at ? new Date(o.created_at) : null;
              return (
                <div key={o.id} style={card}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                    <span style={{
                      ...st,
                      padding: "5px 11px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 800,
                    }}>
                      {STATUS_LABELS[o.status] || o.status}
                    </span>
                    <span style={{
                      background: "#f0f1f5", color: "#55526a",
                      padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                    }}>
                      {SERVICE_LABELS[o.service] || o.service}
                    </span>
                    {o.tariff_code && (
                      <span style={{ color: "#77748a", fontSize: 13, fontWeight: 650 }}>
                        {o.tariff_code}
                      </span>
                    )}
                    <span style={{ marginLeft: "auto", fontWeight: 850, fontSize: 17 }}>
                      {o.total_price ?? "—"} ₽
                    </span>
                  </div>

                  <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.45 }}>
                    {o.from_address || "—"} → {o.to_address || "—"}
                  </div>

                  <div style={{
                    display: "flex", gap: 14, flexWrap: "wrap",
                    marginTop: 8, color: "#77748a", fontSize: 13,
                  }}>
                    <span>№{o.id}</span>
                    {created && (
                      <span>
                        {created.toLocaleDateString("ru-RU")} {created.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    <span>Клиент: {o.client_id || "—"}</span>
                    <span>Исполнитель: {o.executor_id || "—"}</span>
                  </div>

                  <button
                    onClick={() => setExpandedOrder(open ? null : o.id)}
                    style={{
                      marginTop: 12, background: "transparent", border: 0,
                      color: PURPLE, fontWeight: 750, fontSize: 14,
                      cursor: "pointer", padding: 0, fontFamily: "inherit",
                    }}
                  >
                    {open ? "Свернуть" : "Подробнее"} →
                  </button>

                  {open && (
                    <div style={{ marginTop: 12, borderTop: "1px solid #eeeef4", paddingTop: 6 }}>
                      {[
                        ["orders", "Номер заказа", `#${o.id}`],
                        ["car", "Услуга и тариф", `${SERVICE_LABELS[o.service] || o.service}${o.tariff_code ? " · " + o.tariff_code : ""}`],
                        ["clock", "Статус", STATUS_LABELS[o.status] || o.status],
                        ["pin", "Адрес подачи", o.from_address || "—"],
                        ["pin", "Адрес назначения", o.to_address || "—"],
                        ["money", "Стоимость", `${o.total_price ?? "—"} ₽`],
                        ["person", "Клиент", o.client_id ? `ID ${o.client_id}` : "—"],
                        ["car", "Исполнитель", o.executor_id ? `ID ${o.executor_id}` : "Не назначен"],
                        ["clock", "Создан", created ? created.toLocaleString("ru-RU") : "—"],
                      ].map(([icon, label, value]) => (
                        <div key={label} style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "11px 2px", borderBottom: "1px solid #f2f2f7",
                          fontSize: 14,
                        }}>
                          <Icon name={icon} size={17} style={{ color: "#9b98ab" }} />
                          <span style={{ color: "#55526a" }}>{label}</span>
                          <strong style={{ marginLeft: "auto", textAlign: "right" }}>{value}</strong>
                        </div>
                      ))}

                      {/* Диспетчеризация: назначение на несоставленный заказ */}
                      {o.status === "created" && (() => {
                        const needRole = SERVICE_ROLE[o.service] || "driver";
                        const pool = executors
                          .filter(e => e.status === "approved" && e.is_online)
                          .sort((a, b) =>
                            Number(b.active_role === needRole) - Number(a.active_role === needRole)
                          );
                        return (
                          <div style={{ marginTop: 14 }}>
                            <div style={{ fontSize: 13, fontWeight: 750, color: "#55526a", marginBottom: 6 }}>
                              Диспетчеризация — назначить исполнителя
                              {pool.length > 0 && (
                                <span style={{ color: "#77748a", fontWeight: 600 }}>
                                  {" "}· онлайн: {pool.length}
                                </span>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <select
                                value={assignPick[o.id] || ""}
                                onChange={e => setAssignPick(p => ({ ...p, [o.id]: Number(e.target.value) }))}
                                style={{ ...input, flex: 1, minWidth: 180, marginTop: 0, marginBottom: 0 }}
                              >
                                <option value="">Выберите исполнителя…</option>
                                {pool.map(e => (
                                  <option key={e.id} value={e.id}>
                                    {e.name || e.phone || `ID ${e.id}`} · {ROLE_LABELS[e.active_role] || e.active_role || "—"} · ID {e.id}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => assignOrder(o.id)}
                                disabled={!assignPick[o.id] || assigning === o.id}
                                style={{
                                  ...button, marginTop: 0, marginBottom: 0, flexShrink: 0,
                                  opacity: !assignPick[o.id] || assigning === o.id ? 0.55 : 1,
                                }}
                              >
                                {assigning === o.id ? "Назначаем…" : "Назначить"}
                              </button>
                            </div>
                            {pool.length === 0 && (
                              <p style={{ fontSize: 12.5, color: "#77748a", margin: "6px 0 0" }}>
                                Нет исполнителей онлайн с ролью «{ROLE_LABELS[needRole] || needRole}»
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "clients" && (
          <div>
            <div style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{
                width: 42, height: 42, borderRadius: 12, background: "#eee9ff",
                color: PURPLE, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon name="person" size={22} />
              </span>
              <div>
                <div style={{ fontWeight: 850, fontSize: 17 }}>{clients.length}</div>
                <div style={{ color: "#77748a", fontSize: 13 }}>всего клиентов</div>
              </div>
            </div>

            {clients.map(c => (
              <div
                key={c.id}
                style={{ ...card, cursor: "pointer" }}
                onDoubleClick={() => openClientProfile(c.id)}
                title="Двойной клик — профиль клиента"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: "#eee9ff", color: PURPLE,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 850, fontSize: 17,
                  }}>
                    {(c.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>
                      {(c.name || "Клиент").toUpperCase()}
                    </div>
                    <div style={{ color: "#77748a", fontSize: 13 }}>
                      {c.phone || "—"} · MAX ID: {c.max_id}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 850, fontSize: 17 }}>{c.balance} ₽</div>
                    <div style={{ color: "#77748a", fontSize: 12 }}>баланс</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    onDoubleClick={ev => ev.stopPropagation()}
                    onClick={() => changeBalance("clients", c.id)}
                    style={{ ...button, flex: 1, marginTop: 0, marginBottom: 0 }}
                  >
                    Изменить баланс
                  </button>
                  <button
                    onDoubleClick={ev => ev.stopPropagation()}
                    onClick={() => openClientProfile(c.id)}
                    style={{ ...button, flex: 1, marginTop: 0, marginBottom: 0, background: "#eaf2fe", color: "#2c7bf6" }}
                  >
                    Профиль
                  </button>
                </div>
              </div>
            ))}

            {clients.length === 0 && (
              <div style={{ ...card, textAlign: "center", color: "#77748a" }}>Клиентов нет</div>
            )}
          </div>
        )}

        {tab === "executors" && (
          <div>
            <div style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{
                width: 42, height: 42, borderRadius: 12, background: "#eee9ff",
                color: PURPLE, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon name="car" size={22} />
              </span>
              <div>
                <div style={{ fontWeight: 850, fontSize: 17 }}>{executors.length}</div>
                <div style={{ color: "#77748a", fontSize: 13 }}>всего исполнителей</div>
              </div>
            </div>

            {executors.map(e => (
              <div
                key={e.id}
                style={{ ...card, cursor: "pointer" }}
                onDoubleClick={() => openExecutorProfile(e.id)}
                title="Двойной клик — профиль исполнителя"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: "#eee9ff", color: PURPLE,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 850, fontSize: 17,
                  }}>
                    {(e.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>
                      {(e.name || "Исполнитель").toUpperCase()}
                    </div>
                    <div style={{ color: "#77748a", fontSize: 13 }}>
                      {e.phone || "—"} · {e.active_role || "роль не выбрана"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 850, fontSize: 17 }}>{e.balance} ₽</div>
                    <div style={{ color: "#77748a", fontSize: 12 }}>баланс</div>
                    <div style={{ marginTop: 4 }}>
                      <RatingBattery value={e.rating_percent ?? 100} w={40} />
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <span style={{
                    ...(e.status === "approved"
                      ? { background: "#e6f7ed", color: "#177e46" }
                      : e.status === "rejected"
                        ? { background: "#ffe9ec", color: "#d92b45" }
                        : { background: "#fff4e5", color: "#b45309" }),
                    padding: "5px 11px", borderRadius: 999,
                    fontSize: 12, fontWeight: 800,
                  }}>
                    {e.status === "approved" ? "Верификация пройдена" :
                      e.status === "rejected" ? "Отклонён" : "На проверке"}
                  </span>
                  <span style={{
                    marginLeft: 8,
                    ...(e.is_online
                      ? { background: "#e6f7ed", color: "#177e46" }
                      : { background: "#f0eff4", color: "#77748a" }),
                    padding: "5px 11px", borderRadius: 999,
                    fontSize: 12, fontWeight: 800,
                  }}>
                    {e.is_online ? "На линии" : "Не на линии"}
                  </span>
                  {e.skip_streak > 0 && (
                    <span style={{
                      marginLeft: 8, background: "#ffe9ec", color: "#d92b45",
                      padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 800,
                    }}>
                      Пропусков подряд: {e.skip_streak}
                    </span>
                  )}
                </div>

                {/* Текущая смена: лимит 12 часов, предупреждение за 2 часа, отдых 6 часов */}
                {(() => {
                  const w = e.work || {};
                  const worked = w.worked_minutes || 0;
                  const limit = w.limit_minutes || 720;
                  const remaining = w.remaining_minutes || 0;
                  const progress = Math.min(100, Math.round((worked / limit) * 100));
                  const blocked = w.status === "blocked";
                  const warning = w.status === "warning";
                  const resting = w.status === "resting";
                  const accent = blocked ? "#d92b45" : warning ? "#b45309" : "#177e46";
                  const note = blocked
                    ? "Лимит исчерпан — новые заказы не поступают"
                    : resting
                      ? "Отдых: работать можно после 6 часов отдыха"
                      : warning
                        ? `Скоро доступ ограничат — осталось ${Math.floor(remaining / 60)} ч ${remaining % 60} мин`
                        : worked > 0
                          ? `Отработано ${Math.floor(worked / 60)} ч ${worked % 60} мин из 12 ч`
                          : "Отсчёт начнётся с первого принятого заказа";
                  return (
                    <div style={{
                      marginTop: 12, padding: 12, borderRadius: 14,
                      background: "#faf9fd", border: "1px solid #e9e5f4",
                    }}>
                      <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        gap: 8,
                      }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#77748a" }}>
                          Текущая смена
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: accent }}>
                          {worked > 0 ? `${worked} / ${limit} мин` : "не начата"}
                        </span>
                      </div>
                      <div style={{
                        marginTop: 8, height: 6, borderRadius: 999, background: "#e9e5f4", overflow: "hidden",
                      }}>
                        <div style={{
                          width: `${progress}%`, height: "100%",
                          background: blocked ? "#d92b45" : warning ? "#b45309" : "#177e46",
                        }} />
                      </div>
                      <div style={{ marginTop: 7, fontSize: 12, color: "#77748a" }}>{note}</div>
                      {w.started_at && (
                        <div style={{ marginTop: 3, fontSize: 11.5, color: "#9a97ab" }}>
                          Начало смены: {new Date(w.started_at).toLocaleString("ru-RU")}
                        </div>
                      )}
                      {w.rest_until && (
                        <div style={{ marginTop: 3, fontSize: 11.5, color: "#9a97ab" }}>
                          Можно вернуться к заказам: {new Date(w.rest_until).toLocaleString("ru-RU")}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    onDoubleClick={ev => ev.stopPropagation()}
                    onClick={() => changeBalance("executors", e.id)}
                    style={{ ...button, flex: 1, marginTop: 0, marginBottom: 0 }}
                  >
                    Изменить баланс
                  </button>
                  <button
                    onDoubleClick={ev => ev.stopPropagation()}
                    onClick={() => openExecutorProfile(e.id)}
                    style={{ ...button, flex: 1, marginTop: 0, marginBottom: 0, background: "#eaf2fe", color: "#2c7bf6" }}
                  >
                    Профиль
                  </button>
                  <button
                    onDoubleClick={ev => ev.stopPropagation()}
                    onClick={() => {
                      const body = window.prompt(`Сообщение исполнителю ${(e.name || "").toUpperCase() || ""}`);
                      if (body && body.trim()) {
                        fetch(`${API}/admin/executors/${e.id}/notifications`, {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ title: "Сообщение от администратора", body: body.trim() }),
                        }).catch(() => {});
                      }
                    }}
                    style={{ ...button, flex: 1, marginTop: 0, marginBottom: 0, background: "#eaf2fe", color: "#2c7bf6" }}
                  >Написать</button>
                </div>
              </div>
            ))}

            {executors.length === 0 && (
              <div style={{ ...card, textAlign: "center", color: "#77748a" }}>Исполнителей нет</div>
            )}
          </div>
        )}

        {tab === "jobs" && (
          <div>
            {jobs.map(j => (
              <div key={j.id} style={card}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{j.title}</div>
                <div style={{ color: "#77748a", fontSize: 13, margin: "4px 0 8px" }}>
                  {j.city} · {j.salary || "Зарплата не указана"}
                </div>
                <p style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.5 }}>{j.description}</p>

                <span style={{
                  background: "#eee9ff", color: PURPLE,
                  padding: "5px 11px", borderRadius: 999,
                  fontSize: 12, fontWeight: 800,
                }}>
                  {j.status}
                </span>

                <div style={{ marginTop: 12 }}>
                  <button onClick={() => moderateJob(j.id, "approve")} style={{ ...button, marginBottom: 0 }}>
                    Одобрить
                  </button>
                  <button
                    onClick={() => moderateJob(j.id, "reject")}
                    style={{ ...button, background: "#dc2626", marginBottom: 0 }}
                  >
                    Отклонить
                  </button>
                </div>
              </div>
            ))}

            {jobs.length === 0 && (
              <div style={{ ...card, textAlign: "center", color: "#77748a" }}>Вакансий нет</div>
            )}
          </div>
        )}

        {tab === "rentals" && (
          <div>
            {rentals.map(r => (
              <div key={r.id} style={card}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{r.title}</div>
                <div style={{ color: "#77748a", fontSize: 13, margin: "4px 0 8px" }}>
                  {r.type === "car" ? "Авто" : "Жильё"} · {r.city}
                </div>
                <p style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.5 }}>{r.description}</p>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 850 }}>{r.price_per_day} ₽ / сутки</span>
                  <span style={{
                    background: "#eee9ff", color: PURPLE,
                    padding: "5px 11px", borderRadius: 999,
                    fontSize: 12, fontWeight: 800,
                  }}>
                    {r.status}
                  </span>
                </div>

                <div style={{ marginTop: 12 }}>
                  <button onClick={() => moderateRental(r.id, "approve")} style={{ ...button, marginBottom: 0 }}>
                    Одобрить
                  </button>
                  <button
                    onClick={() => moderateRental(r.id, "reject")}
                    style={{ ...button, background: "#dc2626", marginBottom: 0 }}
                  >
                    Отклонить
                  </button>
                </div>
              </div>
            ))}

            {rentals.length === 0 && (
              <div style={{ ...card, textAlign: "center", color: "#77748a" }}>Объявлений нет</div>
            )}
          </div>
        )}

        {tab === "dashboard" && (
          <div>
            {/* Фильтры: период, роль, район Краснодарского края */}
            <div style={{
              ...card, display: "flex", gap: 10, flexWrap: "wrap",
              alignItems: "center", marginBottom: 14,
            }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>Фильтры</span>
              <select
                value={dashPeriod}
                onChange={e => setDashPeriod(Number(e.target.value))}
                style={SELECT_STYLE}
              >
                <option value={7}>7 дней</option>
                <option value={30}>30 дней</option>
                <option value={0}>Всё время</option>
              </select>
              <select
                value={dashRole}
                onChange={e => setDashRole(e.target.value)}
                style={SELECT_STYLE}
              >
                <option value="">Все роли</option>
                {(dash?.roles || []).map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                ))}
              </select>
              <select
                value={dashDistrict}
                onChange={e => setDashDistrict(e.target.value)}
                style={SELECT_STYLE}
              >
                <option value="">Все районы КК</option>
                {(dash?.districts || []).map(d => (
                  <option key={d} value={d}>
                    {d === "__none__" ? "Не определён" : d}
                  </option>
                ))}
              </select>
              {(dashRole || dashDistrict) && (
                <button
                  onClick={() => { setDashRole(""); setDashDistrict(""); }}
                  style={{
                    padding: "9px 12px", borderRadius: 10, border: 0, cursor: "pointer",
                    background: "#f2f1f7", fontSize: 13.5, fontFamily: "inherit",
                  }}
                >Сбросить</button>
              )}
              {!dash && (
                <span style={{ color: "#77748a", fontSize: 13 }}>Загрузка…</span>
              )}
            </div>

            {dash?.totals && (
              <>
                {/* Ключевые показатели */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: 12, marginBottom: 14,
                }}>
                  {[
                    ["Заказов", dash.totals.orders, ""],
                    ["Завершено", dash.totals.completed, ""],
                    ["Отменено", dash.totals.cancelled, ""],
                    ["В работе", dash.totals.active, ""],
                    ["Оборот", dash.totals.revenue, "₽"],
                    ["Комиссия", dash.totals.commission, "₽"],
                    ["Средний чек", dash.totals.avg_check, "₽"],
                    ["Клиентов", dash.totals.clients, ""],
                    ["Исполнителей", dash.totals.executors, ""],
                    ["На линии", dash.totals.online, ""],
                  ].map(([label, value, suffix]) => (
                    <div key={label} style={{
                      background: "#fff", border: "1px solid #ececf2",
                      borderRadius: 16, padding: 16,
                      boxShadow: "0 1px 3px rgba(20,16,50,.05)",
                    }}>
                      <div style={{ fontSize: 24, fontWeight: 850, color: PURPLE }}>
                        {value}{suffix ? ` ${suffix}` : ""}
                      </div>
                      <div style={{ fontSize: 13, color: "#77748a", marginTop: 4 }}>
                        {label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Динамика по дням */}
                {(dash.by_day || []).length > 0 && (
                  <div style={{ ...card, marginBottom: 14 }}>
                    <h3 style={{ margin: "0 0 12px", fontSize: 17 }}>Заказы по дням</h3>
                    <div style={{ display: "grid", gap: 6 }}>
                      {(() => {
                        const max = Math.max(...dash.by_day.map(d => d.orders), 1);
                        return dash.by_day.map(d => (
                          <div key={d.day} style={{
                            display: "flex", alignItems: "center", gap: 10, fontSize: 13,
                          }}>
                            <span style={{ width: 44, color: "#55526a" }}>{d.day}</span>
                            <div style={{ flex: 1, height: 10, background: "#f0f1f5", borderRadius: 999 }}>
                              <div style={{
                                width: `${(d.orders / max) * 100}%`, height: "100%",
                                background: PURPLE, borderRadius: 999,
                              }} />
                            </div>
                            <span style={{ width: 30, textAlign: "right", fontWeight: 700 }}>
                              {d.orders}
                            </span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}

                {/* Районы Краснодарского края */}
                <div style={{ ...card, marginBottom: 14 }}>
                  <h3 style={{ margin: "0 0 4px", fontSize: 17 }}>Районы Краснодарского края</h3>
                  <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "#77748a" }}>
                    Клик по строке — выбор района для всего дашборда.
                  </p>
                  {(dash.by_district || []).length === 0 && (
                    <p style={{ margin: 0, fontSize: 13, color: "#77748a" }}>
                      Заказов за период нет
                    </p>
                  )}
                  {(dash.by_district || []).map(d => {
                    const isNone = d.district === "Не определён";
                    const selected = Boolean(dash.district)
                      && ((isNone && dash.district === "__none__")
                        || (!isNone && dash.district === d.district));
                    return (
                      <div
                        key={d.district}
                        onClick={() => setDashDistrict(
                          selected ? "" : (isNone ? "__none__" : d.district)
                        )}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "8px 10px", borderRadius: 10, cursor: "pointer",
                          background: selected ? "#eee9ff" : "transparent",
                          fontSize: 13.5, borderBottom: "1px solid #f5f4f9",
                        }}
                      >
                        <span style={{ flex: 1, fontWeight: selected ? 800 : 600 }}>
                          {d.district}
                        </span>
                        <span style={{ width: 70, textAlign: "right", color: "#55525f" }}>
                          {d.orders} зак.
                        </span>
                        <span style={{ width: 80, textAlign: "right", color: "#177e46" }}>
                          {d.completed} зав.
                        </span>
                        <span style={{ width: 90, textAlign: "right", fontWeight: 750 }}>
                          {d.revenue} ₽
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Роли: клик — фильтр по роли */}
                <div style={{ ...card, marginBottom: 14 }}>
                  <h3 style={{ margin: "0 0 4px", fontSize: 17 }}>Роли</h3>
                  <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "#77748a" }}>
                    Клик по строке — фильтр дашборда по роли.
                  </p>
                  <div style={{
                    display: "flex", gap: 10, fontSize: 11, color: "#9a97ab",
                    fontWeight: 700, padding: "0 10px 6px",
                  }}>
                    <span style={{ flex: 1 }}>Роль</span>
                    <span style={{ width: 100, textAlign: "right" }}>Исполнителей</span>
                    <span style={{ width: 70, textAlign: "right" }}>Онлайн</span>
                    <span style={{ width: 70, textAlign: "right" }}>Заказов</span>
                    <span style={{ width: 60, textAlign: "right" }}>Блок.</span>
                    <span style={{ width: 60, textAlign: "right" }}>Отстр.</span>
                  </div>
                  {(dash.by_role || []).map(r => {
                    const selected = dashRole === r.role;
                    return (
                      <div
                        key={r.role}
                        onClick={() => setDashRole(selected ? "" : r.role)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "8px 10px", borderRadius: 10, cursor: "pointer",
                          background: selected ? "#eee9ff" : "transparent",
                          fontSize: 13.5, borderBottom: "1px solid #f5f4f9",
                        }}
                      >
                        <span style={{ flex: 1, fontWeight: selected ? 800 : 600 }}>
                          {ROLE_LABELS[r.role] || r.role}
                        </span>
                        <span style={{ width: 100, textAlign: "right" }}>{r.executors}</span>
                        <span style={{ width: 70, textAlign: "right", color: "#177e46" }}>
                          {r.online}
                        </span>
                        <span style={{ width: 70, textAlign: "right" }}>{r.orders}</span>
                        <span style={{
                          width: 60, textAlign: "right",
                          color: r.blocked ? "#d92b45" : "#c9c6d6", fontWeight: 700,
                        }}>{r.blocked}</span>
                        <span style={{
                          width: 60, textAlign: "right",
                          color: r.suspended ? "#d92b45" : "#c9c6d6", fontWeight: 700,
                        }}>{r.suspended}</span>
                      </div>
                    );
                  })}
                  {(dash.by_role || []).length === 0 && (
                    <p style={{ margin: 0, fontSize: 13, color: "#77748a" }}>Исполнителей нет</p>
                  )}
                </div>

                {/* Заблокированные исполнители */}
                <div style={{ ...card, marginBottom: 14 }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: 17 }}>
                    Заблокированные исполнители
                  </h3>
                  {(dash.blocked || []).length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: "#77748a" }}>
                      В этой выборке заблокированных нет
                    </p>
                  ) : dash.blocked.map(e => (
                    <div key={e.id} style={{
                      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                      padding: "8px 10px", borderBottom: "1px solid #f5f4f9", fontSize: 13.5,
                    }}>
                      <span style={{ flex: 1, minWidth: 140, fontWeight: 700 }}>
                        {e.name || `Исполнитель ${e.id}`}
                      </span>
                      <span style={{ color: "#77748a" }}>{e.phone || "—"}</span>
                      <RatingBattery value={e.rating_percent} w={44} />
                      <span style={{
                        padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 800,
                        background: "#ffe9ec", color: "#d92b45",
                      }}>отклонён</span>
                    </div>
                  ))}
                </div>

                {/* Отстранённые от заказов */}
                <div style={card}>
                  <h3 style={{ margin: "0 0 10px", fontSize: 17 }}>
                    Отстранённые от заказов
                  </h3>
                  {(dash.suspended || []).length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: "#77748a" }}>
                      Отстранений нет — все могут брать заказы
                    </p>
                  ) : dash.suspended.map(e => (
                    <div key={e.id} style={{
                      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                      padding: "8px 10px", borderBottom: "1px solid #f5f4f9", fontSize: 13.5,
                    }}>
                      <span style={{ flex: 1, minWidth: 140, fontWeight: 700 }}>
                        {e.name || `Исполнитель ${e.id}`}
                      </span>
                      <span style={{ color: "#77748a" }}>{e.phone || "—"}</span>
                      <RatingBattery value={e.rating_percent} w={44} />
                      <span style={{ color: "#d92b45", fontWeight: 750, fontSize: 12.5 }}>
                        до {e.ends_at ? new Date(e.ends_at).toLocaleString("ru-RU") : "—"}
                      </span>
                      <span style={{
                        padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 800,
                        background: e.source === "auto" ? "#fff4e5" : "#eee9ff",
                        color: e.source === "auto" ? "#b45309" : "#6545ed",
                      }}>
                        {e.source === "auto" ? "автоматически" : "вручную"}
                      </span>
                      {e.reason && (
                        <span style={{ flexBasis: "100%", color: "#77748a", fontSize: 12 }}>
                          {e.reason}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "analytics" && (
          <div>
            {!analytics && (
              <div style={{ ...card, textAlign: "center", color: "#77748a" }}>Загрузка…</div>
            )}

            {analytics && (
              <>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: 12,
                  marginBottom: 14,
                }}>
                  {[
                    ["Заказов всего", analytics.total_orders, ""],
                    ["Завершено", analytics.completed_orders, ""],
                    ["Оборот", analytics.gross_volume, "₽"],
                    ["Средний чек", analytics.average_check, "₽"],
                    ["Доход сервиса", analytics.service_revenue, "₽"],
                    ["Комиссия", analytics.commission_percent, "%"],
                    ["Клиентов", analytics.clients_count, ""],
                    ["Исполнителей", analytics.executors_count, ""],
                    ["Онлайн", analytics.active_executors, ""],
                    ["Вакансии на модерации", analytics.pending_jobs, ""],
                    ["Аренда на модерации", analytics.pending_rentals, ""],
                  ].map(([label, value, suffix]) => (
                    <div key={label} style={{
                      background: "#fff",
                      border: "1px solid #ececf2",
                      borderRadius: 16,
                      padding: 16,
                      boxShadow: "0 1px 3px rgba(20,16,50,.05)",
                    }}>
                      <div style={{ fontSize: 24, fontWeight: 850, color: PURPLE }}>
                        {value}{suffix ? ` ${suffix}` : ""}
                      </div>
                      <div style={{ fontSize: 13, color: "#77748a", marginTop: 4 }}>
                        {label}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={card}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 17 }}>Заказы по услугам</h3>

                  <div style={{ display: "grid", gap: 8 }}>
                    {Object.entries(analytics.services || {}).map(([service, count]) => {
                      const max = Math.max(...Object.values(analytics.services || {}), 1);
                      return (
                        <div key={service} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
                          <span style={{ width: 130, color: "#55526a" }}>
                            {SERVICE_LABELS[service] || service}
                          </span>
                          <div style={{ flex: 1, height: 10, background: "#f0f1f5", borderRadius: 999 }}>
                            <div style={{
                              width: `${(count / max) * 100}%`,
                              height: "100%",
                              background: PURPLE,
                              borderRadius: 999,
                            }} />
                          </div>
                          <strong style={{ width: 36, textAlign: "right" }}>{count}</strong>
                        </div>
                      );
                    })}
                    {Object.keys(analytics.services || {}).length === 0 && (
                      <span style={{ color: "#77748a", fontSize: 14 }}>Данных пока нет</span>
                    )}
                  </div>
                </div>

                <div style={card}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 17 }}>Заказы за 7 дней</h3>

                  <div style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 10,
                    height: 180,
                    paddingTop: 10,
                  }}>
                    {(analytics.orders_by_day || []).map(day => {
                      const max = Math.max(
                        ...(analytics.orders_by_day || []).map(x => x.count || 0),
                        1
                      );

                      const height = Math.max(8, (day.count / max) * 140);

                      return (
                        <div key={day.date} style={{ flex: 1, textAlign: "center" }}>
                          <div style={{
                            height,
                            background: PURPLE,
                            borderRadius: 8,
                            marginBottom: 6,
                          }}></div>

                          <div style={{ fontSize: 12, fontWeight: 700 }}>{day.count}</div>
                          <div style={{ fontSize: 11, color: "#77748a" }}>{day.date}</div>
                        </div>
                      );
                    })}

                    {(analytics.orders_by_day || []).length === 0 && (
                      <span style={{ color: "#77748a", fontSize: 14 }}>Данных пока нет</span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "notifications" && (
          <div>
            {error && (
              <div style={{
                padding: 12, borderRadius: 12, background: "#ffe9ec", color: "#d92b45",
                fontSize: 13, fontWeight: 700, marginBottom: 10,
              }}>{error}</div>
            )}

            {messages.length === 0 && (
              <div style={{ ...card, textAlign: "center", color: "#77748a" }}>
                Сообщений пока нет
              </div>
            )}

            {messages.map(m => (
              <div key={m.id} style={{ ...card, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14.5 }}>
                      {m.author_role === "client"
                        ? `Клиент: ${(m.executor_name || "").toUpperCase() || "—"}`
                        : m.author_role === "executor"
                          ? `Исполнитель: ${(m.executor_name || "").toUpperCase() || "—"}`
                          : m.author_role === "system"
                            ? "Система"
                            : `Оператор → ${(m.executor_name || "").toUpperCase() || "собеседник"}`}
                    </div>
                    <div style={{ color: "#77748a", fontSize: 12, marginTop: 2 }}>
                      {m.executor_phone || ""} · {m.created_at ? new Date(m.created_at).toLocaleString("ru-RU") : ""}
                    </div>
                  </div>
                  <span style={{
                    background: m.author_role === "executor" ? "#eaf2fe" : m.author_role === "client" ? "#e6f7ed" : m.author_role === "system" ? "#fff4e5" : "#eee9ff",
                    color: m.author_role === "executor" ? "#2c7bf6" : m.author_role === "client" ? "#177e46" : m.author_role === "system" ? "#b45309" : "#6545ed",
                    padding: "4px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 800, flexShrink: 0,
                  }}>
                    {m.author_role === "executor" ? "от исполнителя" : m.author_role === "client" ? "от клиента" : m.author_role === "system" ? "событие" : "ответ оператора"}
                  </span>
                </div>

                <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.45 }}>{m.text}</p>

                {m.author_role !== "admin" && (m.executor_id || m.client_id) && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <input
                      value={replyText[peerKey(m)] || ""}
                      onChange={e => setReplyText(t => ({ ...t, [peerKey(m)]: e.target.value }))}
                      onKeyDown={e => { if (e.key === "Enter") replyTo(m, replyText[peerKey(m)]); }}
                      placeholder={m.client_id ? "Ответить клиенту…" : "Ответить исполнителю…"}
                      style={input}
                    />
                    <button
                      onClick={() => replyTo(m, replyText[peerKey(m)])}
                      style={{ ...button, marginTop: 0, marginBottom: 0, flexShrink: 0 }}
                    >Ответить</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Управление операторами — только для администратора */}
        {tab === "operators" && (
          <div>
            <div style={card}>
              <form
                onSubmit={createOperator}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                  alignItems: "end",
                }}
              >
                <label style={{ fontSize: 13, color: "#77748a", fontWeight: 650 }}>
                  Логин
                  <input
                    value={opForm.login}
                    onChange={e => setOpForm(f => ({ ...f, login: e.target.value }))}
                    placeholder="ivanov"
                    style={{ ...input, marginTop: 6 }}
                  />
                </label>
                <label style={{ fontSize: 13, color: "#77748a", fontWeight: 650 }}>
                  Пароль
                  <input
                    type="text"
                    value={opForm.password}
                    onChange={e => setOpForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Надёжный пароль"
                    style={{ ...input, marginTop: 6 }}
                  />
                </label>
                <label style={{ fontSize: 13, color: "#77748a", fontWeight: 650 }}>
                  Имя (необязательно)
                  <input
                    value={opForm.name}
                    onChange={e => setOpForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Иван Иванов"
                    style={{ ...input, marginTop: 6 }}
                  />
                </label>
                <button type="submit" style={{ ...button, marginTop: 0, marginBottom: 0 }}>
                  Создать оператора
                </button>
              </form>
              {opMsg && (
                <p style={{ marginTop: 10, fontSize: 13, color: "#177e46", fontWeight: 700 }}>{opMsg}</p>
              )}
            </div>

            {operators.length === 0 && (
              <div style={{ ...card, textAlign: "center", color: "#77748a" }}>
                Операторов пока нет — создайте первого
              </div>
            )}

            {operators.map(o => (
              <div key={o.id} style={{
                ...card, marginBottom: 10,
                display: "flex", justifyContent: "space-between",
                alignItems: "center", gap: 10,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14.5 }}>
                    {o.name || o.login}
                    {!o.is_active && (
                      <span style={{
                        marginLeft: 8, fontSize: 11.5, fontWeight: 800,
                        background: "#ffe9ec", color: "#d92b45",
                        padding: "3px 9px", borderRadius: 999,
                      }}>отключён</span>
                    )}
                  </div>
                  <div style={{ color: "#77748a", fontSize: 12.5, marginTop: 2 }}>
                    логин: {o.login}{o.created_at ? ` · с ${new Date(o.created_at).toLocaleDateString("ru-RU")}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => toggleOperator(o.id)}
                    style={{
                      ...button, marginTop: 0, marginBottom: 0,
                      background: o.is_active ? "#ffe9ec" : "#e6f7ed",
                      color: o.is_active ? "#d92b45" : "#177e46",
                    }}
                  >{o.is_active ? "Отключить" : "Включить"}</button>
                  <button
                    onClick={() => deleteOperator(o.id)}
                    style={{
                      ...button, marginTop: 0, marginBottom: 0,
                      background: "#f0f1f5", color: "#d92b45",
                    }}
                  >Удалить</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Профиль клиента (двойной клик по карточке) */}
        {clientId && (
          <div
            onClick={() => setClientId(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 100,
              background: "rgba(12,14,20,.55)", display: "flex",
              alignItems: "center", justifyContent: "center", padding: 16,
            }}
          >
            <div
              onClick={ev => ev.stopPropagation()}
              style={{
                width: "100%", maxWidth: 760, maxHeight: "88vh", overflowY: "auto",
                background: "#fff", borderRadius: 18, padding: 20,
                fontFamily: "inherit", color: "#1a1530",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 850, fontSize: 19 }}>
                    {(clientProfile?.client?.name || "КЛИЕНТ").toUpperCase()}
                  </div>
                  <div style={{ color: "#77748a", fontSize: 13, marginTop: 2 }}>
                    MAX ID {clientProfile?.client?.max_id || "—"}
                  </div>
                </div>
                <button
                  onClick={() => setClientId(null)}
                  style={{
                    border: 0, background: "#f2f1f7", borderRadius: 10,
                    padding: "8px 12px", cursor: "pointer", fontSize: 16,
                  }}
                >✕</button>
              </div>

              {!clientProfile && <p style={{ color: "#77748a" }}>Загружаем профиль…</p>}

              {clientProfile && (
                <>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
                    {[
                      ["Баланс", `${clientProfile.client.balance} ₽`],
                      ["Заказов", String(clientProfile.client.orders_count)],
                      ["Сумма заказов", `${clientProfile.client.total_sum} ₽`],
                      ["Активный заказ", clientProfile.active_order_id ? `№${clientProfile.active_order_id}` : "нет"],
                      ["Избранных", String((clientProfile.client.favorites || []).length)],
                      ["С нами с", clientProfile.client.created_at
                        ? new Date(clientProfile.client.created_at).toLocaleDateString("ru-RU")
                        : "—"],
                    ].map(([k, v]) => (
                      <div key={k} style={{
                        flex: "1 1 150px", padding: 12, borderRadius: 12,
                        background: "#faf9fd", border: "1px solid #e9e5f4",
                      }}>
                        <div style={{ fontSize: 11, color: "#77748a", fontWeight: 700, textTransform: "uppercase" }}>{k}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {(clientProfile.client.favorites || []).length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>Избранные заказы</div>
                      {clientProfile.client.favorites.map(f => (
                        <div key={f.id} style={{
                          padding: "9px 0", borderBottom: "1px solid #eeecf3", fontSize: 13.5,
                        }}>
                          {f.title ? `${f.title} · ` : `№${f.id} · `}
                          {f.from_address} → {f.to_address}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>Заказы</div>
                    {(clientProfile.orders || []).length === 0 ? (
                      <p style={{ margin: "6px 0 0", fontSize: 13, color: "#77748a" }}>Заказов не было</p>
                    ) : clientProfile.orders.map(o => (
                      <div key={o.id} style={{
                        display: "flex", justifyContent: "space-between", gap: 10,
                        padding: "9px 0", borderBottom: "1px solid #eeecf3", fontSize: 13.5,
                      }}>
                        <span>
                          №{o.id} · {o.from_address} → {o.to_address}
                          {o.favorite ? " ★" : ""}
                          <small style={{ display: "block", color: "#9a97ab", fontSize: 11.5, marginTop: 2 }}>
                            {o.created_at ? new Date(o.created_at).toLocaleString("ru-RU") : ""} · {o.status}
                          </small>
                        </span>
                        <strong style={{ flexShrink: 0 }}>{o.total_price} ₽</strong>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>Написать клиенту</div>
                    <p style={{ margin: "4px 0 10px", fontSize: 12.5, color: "#77748a" }}>
                      Уведомление придёт в приложение клиента и пушом в MAX.
                    </p>
                    <textarea
                      value={clientNote}
                      onChange={e => setClientNote(e.target.value)}
                      placeholder="Например: заказ №12 завершён, оплата наличными"
                      style={{
                        width: "100%", minHeight: 80, padding: 12, borderRadius: 12,
                        border: "1px solid #e9e5f4", background: "#faf9fd", color: "#1a1530",
                        fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box",
                      }}
                    />
                    <button
                      onClick={() => sendClientNote(clientId)}
                      disabled={!clientNote.trim()}
                      style={{ ...button, marginTop: 10, marginBottom: 0, opacity: clientNote.trim() ? 1 : 0.5 }}
                    >Отправить уведомление</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Профиль исполнителя (двойной клик по карточке) */}
        {profileId && (
          <div
            onClick={() => setProfileId(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 100,
              background: "rgba(12,14,20,.55)", display: "flex",
              alignItems: "center", justifyContent: "center", padding: 16,
            }}
          >
            <div
              onClick={ev => ev.stopPropagation()}
              style={{
                width: "100%", maxWidth: 760, maxHeight: "88vh", overflowY: "auto",
                background: "#fff", borderRadius: 18, padding: 20,
                fontFamily: "inherit", color: "#1a1530",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 850, fontSize: 19 }}>
                    {profile?.executor?.name
                      ? profile.executor.name.toUpperCase()
                      : "ИСПОЛНИТЕЛЬ"}
                  </div>
                  <div style={{ color: "#77748a", fontSize: 13, marginTop: 2 }}>
                    ID {profile?.executor?.max_id || "—"}
                  </div>
                </div>
                <button
                  onClick={() => setProfileId(null)}
                  style={{
                    border: 0, background: "#f2f1f7", borderRadius: 10,
                    padding: "8px 12px", cursor: "pointer", fontSize: 16,
                  }}
                >✕</button>
              </div>

              {!profile && <p style={{ color: "#77748a" }}>Загружаем профиль…</p>}

              {profile && (
                <>
                  {/* Ключевое */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
                    {[
                      ["Баланс", `${profile.executor.balance} ₽`],
                      ["На линии", profile.executor.is_online ? "да" : "нет"],
                      ["Рейтинг", (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <RatingBattery value={profile.rating?.percent ?? 100} w={44} />
                          <span style={{ fontSize: 12, color: "#77748a" }}>
                            {profile.rating?.likes ?? 0} 👍 / {profile.rating?.dislikes ?? 0} 👎
                          </span>
                        </span>
                      )],
                      ["Верификация", profile.executor.status === "approved" ? "пройдена" : profile.executor.status],
                      ["Пропусков подряд", String(profile.executor.skip_streak || 0)],
                      ["Роли", (profile.executor.roles || []).join(", ") || "—"],
                    ].map(([k, v]) => (
                      <div key={k} style={{
                        flex: "1 1 150px", padding: 12, borderRadius: 12,
                        background: "#faf9fd", border: "1px solid #e9e5f4",
                      }}>
                        <div style={{ fontSize: 11, color: "#77748a", fontWeight: 700, textTransform: "uppercase" }}>{k}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Текущая смена */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>Текущая смена</div>
                    <p style={{ margin: "6px 0 0", fontSize: 13, color: "#55525f" }}>
                      Отработано {Math.floor((profile.work?.worked_minutes || 0) / 60)} ч{" "}
                      {(profile.work?.worked_minutes || 0) % 60} мин из {Math.floor((profile.work?.limit_minutes || 720) / 60)} ч.
                      {profile.work?.status === "blocked" && " Лимит исчерпан — заказы не поступают."}
                      {profile.work?.status === "warning" && " Скоро доступ ограничат."}
                      {profile.work?.status === "resting" && " Отдых: работать можно после 6 часов отдыха."}
                      {profile.work?.started_at
                        ? ` Смена началась ${new Date(profile.work.started_at).toLocaleString("ru-RU")}.`
                        : " Смена не начата."}
                    </p>
                  </div>

                  {/* Отстранение: активное, выдача и история */}
                  <SuspensionPanel
                    profileId={profileId}
                    profile={profile}
                    reload={() => openExecutorProfile(profileId)}
                  />

                  {/* Транспорт: заполняет админ, данные уходят клиенту при заказе */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>Транспорт</div>
                    <p style={{ margin: "4px 0 8px", fontSize: 12.5, color: "#77748a" }}>
                      Марка, госномер и прочие данные — их клиент видит при заказе транспортных услуг.
                      {profile.vehicle?.mileage != null && ` Текущий пробег: ${Number(profile.vehicle.mileage).toLocaleString("ru-RU")} км.`}
                    </p>
                    {vehicleForm && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {[
                          ["brand", "Марка"],
                          ["model", "Модель"],
                          ["color", "Цвет"],
                          ["plate", "Госномер"],
                          ["year", "Год"],
                          ["seats", "Мест"],
                        ].map(([key, label]) => (
                          <input
                            key={key}
                            placeholder={label}
                            value={vehicleForm[key]}
                            onChange={e => setVehicleForm(f => ({ ...f, [key]: e.target.value }))}
                            style={{
                              flex: "1 1 130px", padding: "9px 11px", borderRadius: 10,
                              border: "1px solid #e2dff0", fontSize: 13.5, fontFamily: "inherit",
                            }}
                          />
                        ))}
                        <label style={{
                          display: "flex", alignItems: "center", gap: 6, fontSize: 13,
                          color: "#55525f", flex: "1 1 130px", padding: "9px 4px",
                        }}>
                          <input
                            type="checkbox"
                            checked={vehicleForm.approved}
                            onChange={e => setVehicleForm(f => ({ ...f, approved: e.target.checked }))}
                          />
                          Проверен
                        </label>
                        <button
                          onClick={saveVehicle}
                          disabled={vehicleSaving}
                          style={{
                            flex: "1 1 100%", padding: 10, borderRadius: 10, border: 0,
                            background: "#2c7bf6", color: "#fff", fontWeight: 800,
                            fontSize: 13.5, cursor: "pointer", fontFamily: "inherit",
                          }}
                        >{vehicleSaving ? "Сохраняем…" : "Сохранить транспорт"}</button>
                      </div>
                    )}

                    {/* Техобслуживание — вносит исполнитель, админ видит */}
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontWeight: 750, fontSize: 13.5 }}>Техобслуживание</div>
                      {(profile.maintenance || []).length === 0 ? (
                        <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#77748a" }}>
                          Работы по ТО не вносились
                        </p>
                      ) : profile.maintenance.map(item => (
                        <div key={item.id} style={{
                          display: "flex", justifyContent: "space-between", gap: 8,
                          padding: "7px 0", borderBottom: "1px solid #eeecf3", fontSize: 13,
                        }}>
                          <span>
                            <strong>{item.title}</strong>
                            {item.note ? ` · ${item.note}` : ""}
                            <small style={{ display: "block", color: "#9a97ab", fontSize: 11.5, marginTop: 2 }}>
                              {item.done_at ? `Выполнено: ${new Date(item.done_at).toLocaleDateString("ru-RU")} · ` : ""}
                              пробег {item.done_mileage} км
                              {item.interval_km > 0 ? ` · повтор каждые ${item.interval_km} км` : ""}
                            </small>
                          </span>
                          {item.due && (
                            <strong style={{ color: "#d92b45", flexShrink: 0, fontSize: 12 }}>Пора повторить</strong>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Операции по балансу */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>Операции по балансу</div>
                    {(profile.balance_ops || []).length === 0 ? (
                      <p style={{ margin: "6px 0 0", fontSize: 13, color: "#77748a" }}>Операций пока нет</p>
                    ) : profile.balance_ops.map(op => (
                      <div key={op.id} style={{
                        display: "flex", justifyContent: "space-between", gap: 10,
                        padding: "9px 0", borderBottom: "1px solid #eeecf3", fontSize: 13.5,
                      }}>
                        <span>
                          {op.type === "earning" ? "Заработок за заказ" : op.type === "topup" ? "Пополнение" : "Корректировка"}
                          {op.comment ? ` · ${op.comment}` : ""}
                          <small style={{ display: "block", color: "#9a97ab", fontSize: 11.5, marginTop: 2 }}>
                            {op.created_at ? new Date(op.created_at).toLocaleString("ru-RU") : ""}
                          </small>
                        </span>
                        <strong style={{ color: op.amount > 0 ? "#177e46" : "#d92b45", flexShrink: 0 }}>
                          {op.amount > 0 ? "+" : ""}{op.amount} ₽
                        </strong>
                      </div>
                    ))}
                  </div>

                  {/* Фото-контроли */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>Фото-контроль</div>
                    {(profile.photo_checks || []).length === 0 ? (
                      <p style={{ margin: "6px 0 0", fontSize: 13, color: "#77748a" }}>Проверок не было</p>
                    ) : profile.photo_checks.map(p => (
                      <div key={p.id} style={{
                        marginTop: 8, padding: 12, borderRadius: 12,
                        background: "#faf9fd", border: "1px solid #e9e5f4",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <strong style={{ fontSize: 14 }}>{p.title}</strong>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#77748a" }}>
                            {p.status === "approved" ? "Принято"
                              : p.status === "rejected" ? "Отклонено"
                              : p.status === "requested" ? "Ждём фото" : "На проверке"}
                          </span>
                        </div>
                        {p.photo_url && (
                          <img src={p.photo_url} alt="" style={{
                            marginTop: 8, width: "100%", maxHeight: 200, objectFit: "cover",
                            borderRadius: 10, display: "block", background: "#f2f1f7",
                          }} />
                        )}
                        {p.status === "pending" && (
                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <button
                              onClick={async () => { await decidePhotoCheck(p.id, "approved", ""); await openExecutorProfile(profileId); }}
                              style={{ ...button, flex: 1, marginTop: 0, marginBottom: 0, background: "#177e46", color: "#fff" }}
                            >Принять</button>
                            <button
                              onClick={async () => { await decidePhotoCheck(p.id, "rejected", "Фото не подходит, пришлите новое"); await openExecutorProfile(profileId); }}
                              style={{ ...button, flex: 1, marginTop: 0, marginBottom: 0, background: "#ffe9ec", color: "#d92b45" }}
                            >Отклонить</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Последние заказы */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>Последние заказы</div>
                    {(profile.orders || []).length === 0 ? (
                      <p style={{ margin: "6px 0 0", fontSize: 13, color: "#77748a" }}>Заказов не было</p>
                    ) : profile.orders.map(o => (
                      <div key={o.id} style={{
                        display: "flex", justifyContent: "space-between", gap: 10,
                        padding: "9px 0", borderBottom: "1px solid #eeecf3", fontSize: 13.5,
                      }}>
                        <span>
                          №{o.id} · {o.from_address} → {o.to_address}
                          <small style={{ display: "block", color: "#9a97ab", fontSize: 11.5, marginTop: 2 }}>
                            {o.created_at ? new Date(o.created_at).toLocaleString("ru-RU") : ""}
                          </small>
                        </span>
                        <strong style={{ flexShrink: 0 }}>{o.total_price} ₽</strong>
                      </div>
                    ))}
                  </div>

                  {/* Написать уведомление */}
                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>Написать исполнителю</div>
                    <p style={{ margin: "4px 0 10px", fontSize: 12.5, color: "#77748a" }}>
                      Сообщение придёт в приложение в «Уведомления» и пушом в MAX.
                    </p>
                    <textarea
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      placeholder="Например: выйдите на линию после 18:00, спрос на такси большой"
                      style={{
                        width: "100%", minHeight: 80, padding: 12, borderRadius: 12,
                        border: "1px solid #e9e5f4", background: "#faf9fd", color: "#1a1530",
                        fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box",
                      }}
                    />
                    <button
                      onClick={() => sendNote(profileId)}
                      disabled={!noteText.trim()}
                      style={{ ...button, marginTop: 10, marginBottom: 0, opacity: noteText.trim() ? 1 : 0.5 }}
                    >Отправить уведомление</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {tab === "photo-checks" && (
          <div>            {error && (
              <div style={{
                padding: 12, borderRadius: 12, background: "#ffe9ec", color: "#d92b45",
                fontSize: 13, fontWeight: 700, marginBottom: 10,
              }}>{error}</div>
            )}

            {/* Запрос фото конкретному исполнителю */}
            <div style={{ ...card }}>
              <div style={{ fontWeight: 850, fontSize: 16 }}>Запросить фото</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                <select
                  value={photoForm.executor_id}
                  onChange={e => setPhotoForm(f => ({ ...f, executor_id: e.target.value }))}
                  style={input}
                >
                  <option value="">— выберите исполнителя —</option>
                  {executors.map(x => (
                    <option key={x.id} value={x.id}>
                      {(x.name || "Исполнитель").toUpperCase()} · {x.phone || "без телефона"}
                    </option>
                  ))}
                </select>

                <select
                  value={photoForm.kind}
                  onChange={e => setPhotoForm(f => ({ ...f, kind: e.target.value }))}
                  style={input}
                >
                  {Object.entries(PHOTO_KINDS).map(([kind, label]) => (
                    <option key={kind} value={kind}>{label}</option>
                  ))}
                </select>

                <input
                  placeholder="Комментарий исполнителю (например: нужен номер на фото)"
                  value={photoForm.comment}
                  onChange={e => setPhotoForm(f => ({ ...f, comment: e.target.value }))}
                  style={input}
                />

                <button
                  disabled={!photoForm.executor_id}
                  onClick={async () => {
                    await requestPhotoCheck(photoForm.executor_id, photoForm.kind, photoForm.comment);
                    setPhotoForm(f => ({ ...f, comment: "" }));
                  }}
                  style={{ ...button, opacity: photoForm.executor_id ? 1 : 0.5 }}
                >Отправить запрос</button>
              </div>
            </div>

            {photoChecks.length === 0 && (
              <div style={{ ...card, textAlign: "center", color: "#77748a" }}>
                Фото-контроля пока нет
              </div>
            )}

            {photoChecks.map(p => (
              <div key={p.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 850, fontSize: 15 }}>
                      {p.title || PHOTO_KINDS[p.kind] || "Фото"}
                    </div>
                    <div style={{ color: "#77748a", fontSize: 12.5, marginTop: 2 }}>
                      {p.executor_name} · {p.executor_phone || "без телефона"} ·{" "}
                      {p.requested_at ? new Date(p.requested_at).toLocaleString("ru-RU") : ""}
                    </div>
                  </div>
                  <span style={{
                    background: p.status === "approved" ? "#e6f7ed"
                      : p.status === "rejected" ? "#ffe9ec"
                      : p.status === "requested" ? "#fff4e5" : "#eaf2fe",
                    color: p.status === "approved" ? "#177e46"
                      : p.status === "rejected" ? "#d92b45"
                      : p.status === "requested" ? "#b45309" : "#2c7bf6",
                    padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 800,
                    flexShrink: 0,
                  }}>
                    {p.status === "approved" ? "Принято"
                      : p.status === "rejected" ? "Отклонено"
                      : p.status === "requested" ? "Ждём фото" : "На проверке"}
                  </span>
                </div>

                {p.comment && (
                  <p style={{ margin: "10px 0 0", fontSize: 13, color: "#55525f" }}>{p.comment}</p>
                )}

                {p.photo_url && (
                  <img
                    src={p.photo_url}
                    alt=""
                    style={{
                      marginTop: 10, width: "100%", maxHeight: 260, objectFit: "cover",
                      borderRadius: 12, display: "block", background: "#f2f1f6",
                    }}
                  />
                )}

                {p.status === "pending" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button
                      onClick={() => decidePhotoCheck(p.id, "approved", "")}
                      style={{ ...button, flex: 1, marginTop: 0, marginBottom: 0, background: "#177e46", color: "#fff" }}
                    >Принять</button>
                    <button
                      onClick={() => decidePhotoCheck(p.id, "rejected", "Фото не подходит, пришлите новое")}
                      style={{ ...button, flex: 1, marginTop: 0, marginBottom: 0, background: "#ffe9ec", color: "#d92b45" }}
                    >Отклонить</button>
                  </div>
                )}

                {p.decision_comment && (
                  <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "#77748a" }}>
                    Решение модератора: {p.decision_comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "ads" && (
          <div>
            <div style={card}>
              <h2 style={{ margin: "0 0 4px", fontSize: 19 }}>Новая реклама</h2>
              <p style={{ color: "#77748a", fontSize: 13, margin: "0 0 14px" }}>
                Бизнес-блоки — в разделе «Предложения» на главной, афиша — в блоке «События».
              </p>

              <form onSubmit={uploadAd}>
                <div style={{ display: "grid", gap: 10 }}>
                  <input
                    placeholder="Заголовок"
                    value={adForm.title}
                    onChange={e => setAdForm({ ...adForm, title: e.target.value })}
                    style={input}
                  />
                  <textarea
                    placeholder="Текст (необязательно)"
                    rows={3}
                    value={adForm.description}
                    onChange={e => setAdForm({ ...adForm, description: e.target.value })}
                    style={{ ...input, resize: "vertical" }}
                  />
                  <input
                    placeholder="Ссылка: /taxi или https://..."
                    value={adForm.link}
                    onChange={e => setAdForm({ ...adForm, link: e.target.value })}
                    style={input}
                  />

                  <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ fontSize: 13, color: "#55526a", fontWeight: 650 }}>
                      Раздел:{" "}
                      <select
                        value={adForm.placement}
                        onChange={e => setAdForm({ ...adForm, placement: e.target.value })}
                        style={{ ...input, width: 170, display: "inline-block", marginLeft: 6 }}
                      >
                        <option value="home">Бизнес (предложения)</option>
                        <option value="events">Афиша (события)</option>
                      </select>
                    </label>
                    {adForm.placement === "events" && (
                      <label style={{ fontSize: 13, color: "#55526a", fontWeight: 650 }}>
                        Дата:{" "}
                        <input
                          type="datetime-local"
                          value={adForm.event_date}
                          onChange={e => setAdForm({ ...adForm, event_date: e.target.value })}
                          style={{ ...input, width: 230, display: "inline-block", marginLeft: 6 }}
                        />
                      </label>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ fontSize: 13, color: "#55526a", fontWeight: 650 }}>
                      Порядок:{" "}
                      <input
                        type="number"
                        value={adForm.position}
                        onChange={e => setAdForm({ ...adForm, position: Number(e.target.value) })}
                        style={{ ...input, width: 90, display: "inline-block", marginLeft: 6 }}
                      />
                    </label>
                    <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={adForm.active}
                        onChange={e => setAdForm({ ...adForm, active: e.target.checked })}
                        style={{ width: 18, height: 18, accentColor: PURPLE }}
                      />
                      Показывать
                    </label>
                  </div>

                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={e => setAdFile(e.target.files?.[0] || null)}
                    style={{ fontSize: 14 }}
                  />

                  <div>
                    <button type="submit" style={{ ...button, marginBottom: 0 }}>Загрузить</button>
                  </div>

                  {adMsg && (
                    <p style={{ margin: 0, color: /^Реклама/.test(adMsg) ? "#16a34a" : "#dc2626" }}>
                      {adMsg}
                    </p>
                  )}
                </div>
              </form>
            </div>

            <div style={card}>
              <h2 style={{ margin: "0 0 12px", fontSize: 19 }}>Блоки ({ads.length})</h2>

              {ads.length === 0 && (
                <p style={{ color: "#77748a" }}>Реклам пока нет.</p>
              )}

              {ads.map(ad => (
                <div
                  key={ad.id}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    padding: "12px 0",
                    borderTop: "1px solid #eeeef4",
                    flexWrap: "wrap",
                  }}
                >
                  {ad.image_url ? (
                    <img
                      src={ad.image_url}
                      alt=""
                      style={{ width: 96, height: 64, objectFit: "cover", borderRadius: 10, background: "#eee" }}
                    />
                  ) : (
                    <div style={{
                      width: 96,
                      height: 64,
                      borderRadius: 10,
                      background: "#f0f1f5",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#9b98ab",
                      fontSize: 12,
                    }}>
                      нет фото
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 750, display: "flex", gap: 8, alignItems: "center" }}>
                      {ad.title}
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: ad.placement === "events" ? "#fce7f3" : "#ede9fe",
                        color: ad.placement === "events" ? "#db2777" : "#6545ed",
                      }}>
                        {ad.placement === "events" ? "афиша" : "бизнес"}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "#77748a" }}>{ad.description || "—"}</div>
                    <div style={{ fontSize: 12, color: "#9b98ab" }}>
                      {ad.link || "без ссылки"} · порядок {ad.position} ·{" "}
                      {ad.active ? "активна" : "выключена"}
                      {ad.placement === "events" && ad.event_date && (
                        <> · событие: {new Date(ad.event_date).toLocaleString("ru-RU")}</>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => toggleAd(ad)}
                    style={{ ...button, background: ad.active ? "#6b7280" : "#16a34a" }}
                  >
                    {ad.active ? "Выключить" : "Включить"}
                  </button>
                  <button onClick={() => removeAd(ad)} style={{ ...button, background: "#dc2626" }}>
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div style={card}>
            <label style={{ fontSize: 14, fontWeight: 700, color: "#55526a" }}>
              Комиссия агрегатора, %
            </label>

            <input
              value={commission}
              onChange={e => setCommission(e.target.value)}
              type="number"
              style={{ ...input, margin: "8px 0 14px", maxWidth: 200 }}
            />

            <div>
              <button onClick={save} style={{ ...button, marginBottom: 0 }}>Сохранить</button>
            </div>

            {msg && (
              <p style={{ color: msg === "Сохранено" ? "#16a34a" : "#dc2626", margin: "10px 0 0" }}>
                {msg}
              </p>
            )}
          </div>
        )}
      </main>

      {/* Плавающая кнопка статистики — как у конкурента */}
      {!menuOpen && tab !== "analytics" && (
        <button
          onClick={() => go("analytics")}
          aria-label="Статистика"
          style={{
            position: "fixed",
            right: 18,
            bottom: 18,
            width: 54,
            height: 54,
            borderRadius: "50%",
            background: "#fff",
            border: "1px solid #ececf2",
            boxShadow: "0 8px 24px rgba(20,16,50,.18)",
            color: PURPLE,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 40,
          }}
        >
          <Icon name="chart" size={24} />
        </button>
      )}
    </div>
  );
}
