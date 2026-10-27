const API = import.meta.env.VITE_API_URL || "/api";

// Токен исполнителя хранится отдельно от клиентского: приложения на одном
// домене делят localStorage, иначе токены перетирают друг друга.
const TOKEN_KEY = "executor_token";

export function getExecutorToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setExecutorToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, options={}) {
  const hadToken = !!getExecutorToken();
  const res = await fetch(API+path, {
    headers: {
      "Content-Type":"application/json",
      Authorization: getExecutorToken() ? "Bearer "+getExecutorToken() : "",
    },
    ...options,
    body: options.body ? (typeof options.body === "string" ? options.body : JSON.stringify(options.body)) : undefined
  });

  let data = null;
  try { data = await res.json(); } catch (e) { /* пустой или не-JSON ответ */ }

  // 401 от эндпоинтов входа (/executors/auth*) — это ошибка логина
  // (не прошла подпись MAX), а не отзыв живой сессии: токен не трогаем
  // и экран кика не показываем.
  const isAuthCall = path.startsWith("/executors/auth");
  if (res.status === 401 && !isAuthCall) {
    // Токен аннулирован: вошли на другом устройстве либо истёк.
    // Сбрасываем сессию и сообщаем приложению событием — оно покажет
    // экран повторного входа (автоповтора не делаем, чтобы устройства
    // не «отбирали» сессию друг у друга в цикле).
    setExecutorToken(null);
    if (hadToken) {
      try {
        window.dispatchEvent(new CustomEvent("pro:401", {
          detail: { message: (data && data.detail) || "Сессия завершена" },
        }));
      } catch (e) { /* события нет — просто падаем в экран входа ниже */ }
    }
  }

  if (!res.ok) {
    const err = new Error((data && data.detail) || "Ошибка сети");
    err.status = res.status;
    throw err;
  }
  return data;
}
