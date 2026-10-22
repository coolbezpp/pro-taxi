async function getMaxInitData() {
  if (window.Telegram?.WebApp?.initData) {
    return window.Telegram.WebApp.initData;
  }

  if (window.Max?.WebApp?.initData) {
    return window.Max.WebApp.initData;
  }

  if (window.MAX?.WebApp?.initData) {
    return window.MAX.WebApp.initData;
  }

  const url = new URL(window.location.href);
  const fromUrl =
    url.searchParams.get("initData") ||
    url.searchParams.get("init_data") ||
    url.searchParams.get("tgWebAppData");

  if (fromUrl) {
    return fromUrl;
  }

  if (window.location.hash) {
    const hash = new URLSearchParams(window.location.hash.replace("#", ""));
    const fromHash =
      hash.get("initData") ||
      hash.get("init_data") ||
      hash.get("tgWebAppData");

    if (fromHash) {
      return fromHash;
    }
  }

  return "";
}

async function authorizeUser(endpoint) {
  const initData = await getMaxInitData();

  if (!initData) {
    console.warn("initData не найден");
    return null;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ init_data: initData }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("Ошибка авторизации:", data);
    return null;
  }

  console.log("Авторизация успешна:", data);
  return data;
}
