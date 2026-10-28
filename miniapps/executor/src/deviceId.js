// Идентификатор устройства входа — для антифрода «свой–чужой»
// (сервер помнит, с каких телефонов заходили аккаунты; сам IP не хранится,
// только его хэш). В приватном режиме возвращает null — вход не ломается.
export function getDeviceId() {
  try {
    let id = localStorage.getItem("pro_device_id");
    if (!id) {
      id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("pro_device_id", id);
    }
    return id;
  } catch (e) {
    return null;
  }
}
