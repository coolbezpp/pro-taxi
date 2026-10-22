from pydantic_settings import BaseSettings
class Settings(BaseSettings):
    database_url: str = "postgresql://pro:change_me@db:5432/pro"
    jwt_secret: str = "change_me"
    max_client_bot_token: str = ""
    max_executor_bot_token: str = ""
    commission_percent: float = 15.0
    class Config: env_file = ".env"
settings = Settings()
