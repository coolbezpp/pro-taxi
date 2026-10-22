const API = import.meta.env.VITE_API_URL || "/api";
export async function api(path, options={}) {
  const res = await fetch(API+path, {
    headers: {"Content-Type":"application/json", Authorization: localStorage.getItem("token") ? "Bearer "+localStorage.getItem("token") : ""},
    ...options, body: options.body?JSON.stringify(options.body):undefined
  });
  if(!res.ok) throw new Error((await res.json()).detail||"Ошибка сети");
  return res.json();
}
