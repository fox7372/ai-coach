import json
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Document, DocumentChunk
from app.rag_service import hash_embedding, rag_service
from app.utils.url_utils import format_time

def make_embedding(text_value: str) -> list[float]:
    try:
        return rag_service.embed_text(text_value)
    except Exception:
        return hash_embedding(text_value)


def make_embeddings(text_values: list[str]) -> list[list[float]]:
    try:
        return rag_service.embed_texts(text_values)
    except Exception:
        return [hash_embedding(text_value) for text_value in text_values]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right:
        return 0.0
    size = min(len(left), len(right))
    return sum(left[index] * right[index] for index in range(size))


def index_chunk_in_chroma(db: Session, chunk: DocumentChunk) -> None:
    try:
        embedding = json.loads(chunk.embedding or "[]")
        if not embedding:
            embedding = make_embedding(chunk.chunk_text)
            chunk.embedding = json.dumps(embedding, ensure_ascii=False)
            db.flush()
        metadata = json.loads(chunk.metadata_json or "{}")
        metadata.update(
            {
                "page_number": chunk.page_number,
                "start_time": chunk.start_time,
                "end_time": chunk.end_time,
                "section_title": chunk.section_title,
                "source_url": chunk.source_url,
                "chunk_index": chunk.chunk_index,
            }
        )
        clean_metadata = {key: value for key, value in metadata.items() if value is not None}
        rag_service.index_chunk(
            chunk_id=chunk.id,
            document_id=chunk.document_id,
            course_id=chunk.course_id,
            text=chunk.chunk_text,
            embedding=[float(value) for value in embedding],
            metadata=clean_metadata,
        )
    except Exception:
        # The database row remains usable as a fallback if Chroma or local models are unavailable.
        return


def index_chunks_in_chroma(chunks: list[DocumentChunk]) -> None:
    items: list[dict[str, object]] = []
    for chunk in chunks:
        try:
            embedding = json.loads(chunk.embedding or "[]")
            metadata = json.loads(chunk.metadata_json or "{}")
        except json.JSONDecodeError:
            continue
        if not embedding:
            continue
        metadata.update(
            {
                "chunk_id": chunk.id,
                "document_id": chunk.document_id,
                "course_id": chunk.course_id,
                "page_number": chunk.page_number,
                "start_time": chunk.start_time,
                "end_time": chunk.end_time,
                "section_title": chunk.section_title,
                "source_url": chunk.source_url,
                "chunk_index": chunk.chunk_index,
            }
        )
        clean_metadata = {key: value for key, value in metadata.items() if value is not None}
        items.append(
            {
                "id": f"chunk-{chunk.id}",
                "text": chunk.chunk_text,
                "embedding": [float(value) for value in embedding],
                "metadata": clean_metadata,
            }
        )

    try:
        rag_service.index_chunks(items)
    except Exception:
        return


def retrieve_relevant_chunks(db: Session, course_id: int, query: str, limit: int = 5) -> list[tuple[DocumentChunk, float]]:
    try:
        candidates = rag_service.query(course_id, query, candidates=30)
        reranked = rag_service.rerank(query, candidates, limit=limit)
        retrieved: list[tuple[DocumentChunk, float]] = []
        for item in reranked:
            metadata = item.get("metadata") or {}
            chunk_id = int(metadata.get("chunk_id") or 0)
            chunk = db.get(DocumentChunk, chunk_id)
            if chunk is not None:
                score = float(item.get("rerank_score") or item.get("dot_score") or 0.0)
                retrieved.append((chunk, score))
        if retrieved:
            return retrieved
    except Exception:
        pass

    query_vector = make_embedding(query)
    chunks = db.scalars(
        select(DocumentChunk)
        .where(DocumentChunk.course_id == course_id, DocumentChunk.embedding.is_not(None))
        .order_by(DocumentChunk.id.desc())
        .limit(500)
    ).all()
    scored: list[tuple[DocumentChunk, float]] = []
    for chunk in chunks:
        try:
            embedding = json.loads(chunk.embedding or "[]")
            score = cosine_similarity(query_vector, embedding)
        except (TypeError, ValueError):
            continue
        if score > 0:
            scored.append((chunk, score))
    scored.sort(key=lambda item: item[1], reverse=True)
    return scored[:limit]


def compact_excerpt(text_value: str, max_length: int = 180) -> str:
    compact = re.sub(r"\s+", " ", text_value).strip()
    if len(compact) <= max_length:
        return compact
    return compact[:max_length].rstrip() + "..."


def chunk_location_label(chunk: DocumentChunk, document: Document | None, index: int, score: float | None = None) -> str:
    title = document.filename if document else f"资料 {chunk.document_id}"
    parts = [f"来源 {index}：{title}"]
    if chunk.page_number:
        parts.append(f"第 {chunk.page_number} 页")
    if chunk.section_title:
        parts.append(chunk.section_title)
    if chunk.start_time is not None or chunk.end_time is not None:
        parts.append(f"时间 {format_time(chunk.start_time)}-{format_time(chunk.end_time)}")
    if score is not None:
        parts.append(f"相似度 {score:.2f}")
    return "，".join(parts)


def has_direct_text_match(query: str, chunks: list[tuple[DocumentChunk, float]]) -> bool:
    terms = [item.strip().lower() for item in re.split(r"\s+", query) if len(item.strip()) >= 2]
    if not terms:
        compact_query = re.sub(r"\s+", "", query).lower()
        terms = [compact_query] if len(compact_query) >= 2 else []
    if not terms:
        return False
    return any(any(term in chunk.chunk_text.lower() for term in terms) for chunk, _ in chunks)
