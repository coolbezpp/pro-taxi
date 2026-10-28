import json
import os
import ssl
import urllib.request
from ..config import settings

# CA-сертификаты: в контейнере системных может не хватать цепочки для MAX API,
# а корневой «Russian Trusted Root CA» сервер не присылает — пинним промежуточный.
_CA_PIN = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "certs", "russian_trusted_sub_ca.pem")
)

try:
    import certifi

    _BASE_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:  # pragma: no cover
    _BASE_CTX = ssl.create_default_context()

try:
    if os.path.exists(_CA_PIN):
        _BASE_CTX.load_verify_locations(cafile=_CA_PIN)
        # Пиннинг промежуточного CA: корень не присылается сервером,
        # поэтому разрешаем завершать цепочку на промежуточном сертификате.
        _BASE_CTX.verify_flags |= ssl.VERIFY_X509_PARTIAL_CHAIN
except Exception:  # pragma: no cover
    pass

_SSL_CTX = _BASE_CTX


def send_max_message(max_id: str, text: str, bot: str = "client", keyboard: list | None = None):
    """Отправка сообщения ботом MAX.

    keyboard — двумерный массив кнопок inline-клавиатуры (например,
    [{"type": "request_geo_location", "text": "Поделиться геопозицией"}]).
    """
    tokens = {
        "client": settings.max_client_bot_token,
        "executor": settings.max_executor_bot_token
    }

    token = tokens.get(bot)

    if not token or token == "your_max_bot_token":
        return {"sent": False, "reason": f"Токен бота {bot} не настроен"}

    url = f"https://platform-api2.max.ru/messages?chat_id={max_id}"
    body: dict = {"text": text}
    if keyboard:
        body["attachments"] = [{"type": "inline_keyboard", "payload": {"buttons": keyboard}}]
    payload = json.dumps(body).encode("utf-8")

    request = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            # MAX ждёт токен без префикса Bearer (иначе «Malformed access token»)
            "Authorization": token,
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(request, timeout=10, context=_SSL_CTX) as response:
            return {"sent": True, "status": response.status}
    except Exception as e:
        return {"sent": False, "reason": str(e)}
