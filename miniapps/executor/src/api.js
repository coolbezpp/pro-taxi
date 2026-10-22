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
  const res = await fetch(API+path, {
    headers: {
      "Content-Type":"application/json",
      Authorization: getExecutorToken() ? "Bearer "+getExecutorToken() : "",
    },
    ...options,
    body: options.body ? (typeof options.body === "string" ? options.body : JSON.stringify(options.body)) : undefined
  });
  if(res.status === 401) {
    // Токен протух или вышел — сбрасываем сессию
    setExecutorToken(null);
  }
  if(!res.ok) throw new Error((await res.json()).detail||"Ошибка сети");
  return res.json();
}
