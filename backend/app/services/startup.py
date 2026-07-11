from app.services.application_service import ensure_chat_schema, ensure_resource_schema, normalize_legacy_demo_course_metrics, seed_demo_data
from app.runtime import Base, SessionLocal, engine

def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_chat_schema()
    ensure_resource_schema()
    with SessionLocal() as db:
        seed_demo_data(db)
        normalize_legacy_demo_course_metrics(db)
