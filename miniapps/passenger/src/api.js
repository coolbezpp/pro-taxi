const API = import.meta.env.VITE_API_URL || "/api";
export async function api(path, options={}) {
  const res = await fetch(API+path, {
    headers: {"Content-Type":"application/json", Authorization: localStorage.getItem("token") ? "Bearer "+localStorage.getItem("token") : ""},
    ...options, body: options.body?JSON.stringify(options.body):undefined
  });
  if(!res.ok) {
    let detail = "Ошибка сети";
    try { detail = (await res.json()).detail || detail; } catch {}
    const err = new Error(detail);
    err.status = res.status; // фронт отличает «войдите заново» (401) от прочих ошибок
    throw err;
  }
  return res.json();
}
