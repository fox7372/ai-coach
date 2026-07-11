import json
import os
import sys
from pathlib import Path

import pytest


PDF_PATH = Path(r"C:\Users\fox\Desktop\ai study\LADR4eChinese.pdf")


os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("CHROMA_PERSIST_DIR", "backend/.test_chroma")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Base, engine  # noqa: E402
from app.services.knowledge_service import select_knowledge_chunks  # noqa: E402
from app.services.resource_service import mark_document_failed, process_pdf_document  # noqa: E402
import app.services.resource_service as main  # noqa: E402
from app.models import CourseModel, Document, DocumentChunk  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402


@pytest.fixture(autouse=True)
def reset_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def test_ladr_pdf_parse_chunk_and_index(monkeypatch):
    if not PDF_PATH.exists():
        pytest.skip(f"测试材料不存在：{PDF_PATH}")

    indexed_chunks = []

    def fake_embedding(text: str) -> list[float]:
        # Keep the integration test fast and deterministic; the slow test below
        # verifies the real transformers model separately when explicitly enabled.
        return [float(len(text) % 7), float(len(text) % 11), 1.0]

    def fake_embeddings(texts: list[str]) -> list[list[float]]:
        return [fake_embedding(text) for text in texts]

    def fake_index_chunks(chunks: list[DocumentChunk]) -> None:
        for chunk in chunks:
            indexed_chunks.append(
                {
                    "chunk_id": chunk.id,
                    "document_id": chunk.document_id,
                    "course_id": chunk.course_id,
                    "text": chunk.chunk_text,
                    "embedding": json.loads(chunk.embedding or "[]"),
                }
            )

    monkeypatch.setattr(main, "make_embeddings", fake_embeddings)
    monkeypatch.setattr(main, "index_chunks_in_chroma", fake_index_chunks)

    with Session(engine) as db:
        course = CourseModel(user_id=1, name="线性代数测试课", description="LADR 中文版 RAG 测试")
        db.add(course)
        db.commit()
        db.refresh(course)

        document = Document(
            course_id=course.id,
            filename=PDF_PATH.name,
            file_type="pdf",
            storage_path=str(PDF_PATH),
            parse_status="uploaded",
            status="uploaded",
        )
        db.add(document)
        db.commit()
        db.refresh(document)

        process_pdf_document(db, document, parser="pymupdf")
        db.refresh(document)

        chunks = db.scalars(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == document.id)
            .order_by(DocumentChunk.chunk_index)
        ).all()

        assert document.status == "ready"
        assert document.parse_status == "ready"
        assert "completed:" in (document.progress_stage or "")
        assert document.raw_content
        assert len(chunks) > 20
        assert len(indexed_chunks) == len(chunks)

        first_chunk = chunks[0]
        assert first_chunk.course_id == course.id
        assert any(chunk.page_number is not None for chunk in chunks)
        assert first_chunk.embedding
        assert json.loads(first_chunk.embedding) == fake_embedding(first_chunk.chunk_text)
        assert any("线性" in chunk.chunk_text or "向量" in chunk.chunk_text for chunk in chunks)


def test_real_transformers_embedding_dimension_matches_configured_model():
    if os.environ.get("RUN_SLOW_RAG_TESTS") != "1":
        pytest.skip("设置 RUN_SLOW_RAG_TESTS=1 后验证真实 transformers embedding 模型")

    from app.database import settings
    from app.rag_service import rag_service

    vector = rag_service.embed_text("线性代数中的向量空间是什么？")

    expected_dimensions = 512 if "small" in settings.embedding_model else 768
    assert len(vector) == expected_dimensions
    assert all(isinstance(value, float) for value in vector)


def test_document_failure_recovery_rolls_back_before_saving_status():
    with Session(engine) as db:
        course = CourseModel(user_id=1, name="失败恢复课程")
        db.add(course)
        db.flush()
        document = Document(
            course_id=course.id,
            filename="oversized.pdf",
            file_type="pdf",
            storage_path="/tmp/oversized.pdf",
            parse_status="processing",
            status="processing",
        )
        db.add(document)
        db.commit()

        mark_document_failed(db, document.id, RuntimeError("raw_content exceeds column capacity"))
        db.refresh(document)

        assert document.status == "failed"
        assert document.parse_status == "failed"
        assert document.progress_stage == "failed"
        assert "raw_content" in (document.error_message or "")


def test_knowledge_chunk_sampling_covers_document_beginning_and_end():
    chunks = [
        DocumentChunk(
            document_id=1,
            course_id=1,
            chunk_index=index,
            page_number=index + 2,
            chunk_text=f"第 {index + 1} 节的有效课程内容。" * 12,
        )
        for index in range(120)
    ]

    selected = select_knowledge_chunks(chunks, limit=24)

    assert len(selected) == 24
    assert selected[0].chunk_index == 0
    assert selected[-1].chunk_index == 119
