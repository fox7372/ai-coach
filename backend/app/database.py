from collections.abc import Generator

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Settings(BaseSettings):
    database_url: str = "mysql+pymysql://root@127.0.0.1:3306/ai_learning?charset=utf8mb4"
    ai_provider: str = "deepseek"
    ai_api_key: str | None = None
    ai_base_url: str = "https://api.deepseek.com"
    ai_model: str = "deepseek-chat"
    # Legacy DeepSeek fields are kept so old .env files still work.
    deepseek_api_key: str | None = None
    deepseek_base_url: str | None = None
    deepseek_model: str | None = None
    chroma_persist_dir: str = "backend/chroma_db"
    chroma_collection: str = "course_document_chunks_bge_small_zh_v15"
    embedding_model: str = "BAAI/bge-small-zh-v1.5"
    reranker_model: str = "BAAI/bge-reranker-base"
    rag_device: str = "auto"
    env_file_path: str = ".env"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8-sig", extra="ignore")


settings = Settings()
if not settings.ai_api_key and settings.deepseek_api_key:
    settings.ai_api_key = settings.deepseek_api_key
if settings.deepseek_base_url:
    settings.ai_base_url = settings.deepseek_base_url
if settings.deepseek_model:
    settings.ai_model = settings.deepseek_model

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
