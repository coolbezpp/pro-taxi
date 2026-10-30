from pydantic_settings import BaseSettings
class Settings(BaseSettings):
    database_url: str = "postgresql://pro:change_me@db:5432/pro"
    # Секрет JWT обязателен из окружения (JWT_SECRET): падать с открытым
    # дефолтным «change_me» нельзя — токены с известным секретом бесполезны
    jwt_secret: str
    max_client_bot_token: str = ""
    max_executor_bot_token: str = ""
    # Секрет вебхука MAX: шлётся в подписке (POST /subscriptions) и
    # проверяется по заголовку X-Max-Bot-Api-Secret. Если пуст — берётся
    # jwt_secret (надёжнее, чем открытый вебхук)
    max_webhook_secret: str = ""
    commission_percent: float = 15.0
    # Телефоны (через запятую), которым разрешено брать свои же заказы
    self_order_exempt: str = ""
    class Config: env_file = ".env"
settings = Settings()
