from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://brainx:brainx_dev@db:5432/brainx"
    anthropic_api_key: str = ""
    cors_origin: str = "http://localhost:3000"
    checkpoint_dir: str = "/var/lib/brainx/checkpoints"

    # Bounds how many subagent processes may run concurrently for one run,
    # per ARCHITECTURE.md §6.1's concurrency semaphore.
    max_concurrent_subagents: int = 3


settings = Settings()
