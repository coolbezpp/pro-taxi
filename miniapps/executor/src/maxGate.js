// Миниапп исполнителя открывается только внутри мессенджера MAX.
// Признаки окружения MAX: initData/платформа/версия из SDK (st.max.ru),
// нативный мост WebViewHandler (Android-вебвью MAX), встраивание в iframe
// мессенджера и кэш initData, который SDK кладёт в sessionStorage при
// открытии внутри MAX.
export function isMaxEnv() {
  try {
    // Отладочный обход для тестов в обычном браузере: ?dev=1
    // или localStorage pro_dev=1
    if (new URLSearchParams(window.location.search).get("dev") === "1") return true;
    if (localStorage.getItem("pro_dev") === "1") return true;

    const w = window.WebApp;
    if (w && (w.initData || w.platform || w.version)) return true;
    if (window.Max && (window.Max.initData || (window.Max.WebApp && window.Max.WebApp.initData))) return true;
    if (window.WebViewHandler) return true;
    if (sessionStorage.getItem("WebAppData")) return true;
    if (window.self !== window.top) return true;
  } catch (e) {
    // окружение экзотическое — считаем обычным браузером
  }
  return false;
}
