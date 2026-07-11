from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db, settings
from app.runtime import ai_service, rag_service
from app.schemas import AIConfigOut, AIConfigUpdate
from app.services.application_service import remove_env_values, write_env_value

router = APIRouter()

@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, object]:
    db.execute(select(1))
    return {
        "status": "ok",
        "database": "connected",
        "rag_vector_store": "chroma" if rag_service.ready() else "unavailable",
        "embedding_model": settings.embedding_model,
        "reranker_model": settings.reranker_model,
        "rag_device": rag_service.device(),
        "ai_provider": settings.ai_provider if ai_service.enabled else "mock",
        "ai_model": settings.ai_model,
    }


@router.get("/settings/ai", response_model=AIConfigOut)
def get_ai_config() -> AIConfigOut:
    return AIConfigOut(
        provider=settings.ai_provider,
        model=settings.ai_model,
        base_url=settings.ai_base_url,
        has_api_key=bool(settings.ai_api_key),
    )


@router.post("/settings/ai", response_model=AIConfigOut)
def update_ai_config(payload: AIConfigUpdate) -> AIConfigOut:
    api_key = payload.api_key.strip() if payload.api_key else None

    settings.ai_provider = payload.provider.strip() or "custom"
    settings.ai_base_url = payload.base_url.strip() or "https://api.deepseek.com"
    settings.ai_model = payload.model.strip() or "deepseek-chat"
    if api_key:
        settings.ai_api_key = api_key

    write_env_value("AI_PROVIDER", settings.ai_provider)
    write_env_value("AI_BASE_URL", settings.ai_base_url)
    write_env_value("AI_MODEL", settings.ai_model)
    if api_key:
        write_env_value("AI_API_KEY", settings.ai_api_key)

    ai_service.reload()

    return AIConfigOut(
        provider=settings.ai_provider,
        model=settings.ai_model,
        base_url=settings.ai_base_url,
        has_api_key=bool(settings.ai_api_key),
    )


@router.delete("/settings/ai", response_model=AIConfigOut)
def delete_ai_config() -> AIConfigOut:
    settings.ai_provider = "deepseek"
    settings.ai_api_key = None
    settings.ai_base_url = "https://api.deepseek.com"
    settings.ai_model = "deepseek-chat"
    settings.deepseek_api_key = None
    settings.deepseek_base_url = None
    settings.deepseek_model = None

    remove_env_values(
        {
            "AI_PROVIDER",
            "AI_API_KEY",
            "AI_BASE_URL",
            "AI_MODEL",
            "DEEPSEEK_API_KEY",
            "DEEPSEEK_BASE_URL",
            "DEEPSEEK_MODEL",
        }
    )

    ai_service.reload()

    return AIConfigOut(
        provider=settings.ai_provider,
        model=settings.ai_model,
        base_url=settings.ai_base_url,
        has_api_key=False,
    )
