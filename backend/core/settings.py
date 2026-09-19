from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file='.env', env_file_encoding='utf-8', extra='ignore'
    )

    DATABASE_URL: SecretStr

    JWT_SECRET_KEY: SecretStr
    JWT_ALGORITHM: str = 'HS256'
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    OPENAI_API_KEY: SecretStr
    OPENAI_CHAT_MODEL: str
    OPENAI_EMBEDDING_MODEL: str = 'text-embedding-3-small'

    STORAGE_ENDPOINT_URL: str | None = None
    STORAGE_ACCESS_KEY: SecretStr
    STORAGE_SECRET_KEY: SecretStr
    STORAGE_BUCKET: str = 'documents'
    STORAGE_REGION: str = 'us-east-1'
    STORAGE_AUTO_CREATE_BUCKET: bool = False

    MAX_UPLOAD_SIZE_MB: int = 10

    REDIS_URL: str = 'redis://localhost:6379/0'


settings = Settings()
