from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.routes.chat import ask_question
from app.database import get_db
from app.models import Document, DocumentChunk, KnowledgePoint, MasteryRecord
from app.runtime import ai_service
from app.schemas import AIChatRequest, AskRequest, AskResponse, CourseTaskRequest
from app.services.application_service import require_course
from app.services.context import build_references, get_course_context
from app.services.knowledge_service import (
    appears_in_chunks,
    build_knowledge_context,
    deduplicate_knowledge_points,
    find_knowledge_support,
    parse_knowledge_point_result,
    select_knowledge_chunks,
)

router = APIRouter()

@router.post("/api/ai/chat", response_model=AskResponse)
def ai_chat(payload: AIChatRequest, db: Session = Depends(get_db)) -> AskResponse:
    return ask_question(
        AskRequest(
            question=payload.message,
            course_id=payload.course_id,
            user_id=payload.user_id,
            session_id=payload.session_id,
        ),
        db,
    )


@router.post("/api/ai/generate-summary")
def generate_summary(payload: CourseTaskRequest, db: Session = Depends(get_db)) -> dict[str, object]:
    course = require_course(db, payload.course_id, payload.user_id)
    course_name = course.name
    context = get_course_context(db, payload.course_id, payload.text)
    summary = ai_service.generate_text(
        "你是课程资料整理助手。请用中文生成结构化学习摘要，包含核心概念、易错点和复习顺序。",
        f"课程：{course_name}\n资料内容：\n{context}",
    )
    return {"course_id": payload.course_id, "summary": summary, "references": build_references(db, payload.course_id)}


@router.post("/api/ai/extract-knowledge-points")
def extract_knowledge_points(payload: CourseTaskRequest, db: Session = Depends(get_db)) -> dict[str, object]:
    course = require_course(db, payload.course_id, payload.user_id)
    course_name = course.name
    source_document = None
    chunks: list[DocumentChunk] = []
    existing_query = select(KnowledgePoint).where(KnowledgePoint.course_id == payload.course_id)
    if payload.document_id is not None:
        source_document = db.scalar(
            select(Document).where(
                Document.id == payload.document_id,
                Document.course_id == payload.course_id,
            )
        )
        if source_document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资料不存在或不属于当前课程")
        existing_query = existing_query.where(KnowledgePoint.source_document == source_document.filename)
        existing_points = db.scalars(existing_query.order_by(KnowledgePoint.id)).all()
        if existing_points and not payload.force:
            return {
                "course_id": payload.course_id,
                "document_id": payload.document_id,
                "reused": True,
                "message": "已存在这份资料的知识点，未重复生成。如需覆盖，请使用重新生成。",
                "knowledge_points": [
                    {
                        "id": point.id,
                        "name": point.name,
                        "description": point.description,
                        "source_document": point.source_document,
                        "source_page": point.source_page,
                        "source_excerpt": point.source_excerpt,
                        "confidence": point.confidence,
                    }
                    for point in existing_points
                ],
                "raw": "",
            }
        all_chunks = db.scalars(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == payload.document_id, DocumentChunk.course_id == payload.course_id)
            .order_by(DocumentChunk.chunk_index)
        ).all()
        chunks = select_knowledge_chunks(all_chunks, limit=48)
        if chunks:
            context = build_knowledge_context(chunks)
        elif source_document.raw_content:
            context = source_document.raw_content[:60_000]
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="这份资料还没有可用于生成知识点的解析内容")
        source_chunk = chunks[0] if chunks else None
    else:
        all_chunks = db.scalars(
            select(DocumentChunk)
            .where(DocumentChunk.course_id == payload.course_id)
            .order_by(DocumentChunk.document_id, DocumentChunk.chunk_index)
        ).all()
        chunks = select_knowledge_chunks(all_chunks, limit=60)
        context = build_knowledge_context(chunks) if chunks else get_course_context(db, payload.course_id, payload.text)
        source_chunk = chunks[0] if chunks else None
        source_document = db.get(Document, source_chunk.document_id) if source_chunk else None
        existing_points = db.scalars(existing_query.order_by(KnowledgePoint.id)).all()
        if existing_points and not payload.force:
            return {
                "course_id": payload.course_id,
                "document_id": payload.document_id,
                "reused": True,
                "message": "已存在课程知识点，未重复生成。如需覆盖，请使用重新生成。",
                "knowledge_points": [
                    {
                        "id": point.id,
                        "name": point.name,
                        "description": point.description,
                        "source_document": point.source_document,
                        "source_page": point.source_page,
                        "source_excerpt": point.source_excerpt,
                        "confidence": point.confidence,
                    }
                    for point in existing_points
                ],
                "raw": "",
            }

    result = ai_service.generate_text(
        (
            "你是教学知识图谱助手。请只根据给定资料提取尽可能完整、彼此不重复的学科知识点，最多 24 个。"
            "资料内容足够时至少输出 12 个，并覆盖资料前、中、后各部分的章节与主题，不能只总结开头内容。"
            "只保留资料原文中明确出现的课程内容概念。"
            "如果资料内容不足 12 个，只输出资料能明确支持的知识点，不要编造。"
            "知识点名称必须使用中文或课程中常用的技术缩写，不能用书名、章节标题、页眉、页脚、英文教材名或任务字段。"
            "不要提取课时、地点、成绩构成、DDL、直播、教材链接、课程安排等事务信息。"
            "不要输出“资料”“任务内容”“Computer Networking”“Security”“本章目标”等非知识点。"
            "如果资料只有课程主页或目录，请只提取目录中出现的学科主题，并在说明中写“初步主题，需讲义内容补充”。"
            "必须只返回 JSON 数组，不要使用 Markdown，不要输出解释。"
            'JSON 格式：[{"name":"知识点名","description":"一句话说明"}]。'
        ),
        f"课程：{course_name}\n资料：{source_document.filename if source_document else '课程资料'}\n资料内容：\n{context}",
        temperature=0,
    )
    if payload.document_id is not None and source_document is not None:
        old_point_ids = db.scalars(
            select(KnowledgePoint.id).where(
                KnowledgePoint.course_id == payload.course_id,
                KnowledgePoint.source_document == source_document.filename,
            )
        ).all()
    else:
        old_point_ids = db.scalars(
            select(KnowledgePoint.id).where(KnowledgePoint.course_id == payload.course_id)
        ).all()

    if old_point_ids:
        db.execute(delete(MasteryRecord).where(MasteryRecord.knowledge_point_id.in_(old_point_ids)))
        db.execute(delete(KnowledgePoint).where(KnowledgePoint.id.in_(old_point_ids)))

    parsed_points = deduplicate_knowledge_points(parse_knowledge_point_result(result), limit=24)
    created = []
    for item in parsed_points:
        name = item["name"].strip()[:100]
        description = item["description"].strip()
        is_single_webpage_outline = bool(source_document and source_document.source_type == "webpage" and len(chunks) <= 1)
        if is_single_webpage_outline and not appears_in_chunks(name, chunks):
            continue
        support_chunk, source_excerpt, direct_support = find_knowledge_support(name, chunks, source_chunk)
        if is_single_webpage_outline and not direct_support:
            continue
        if is_single_webpage_outline and "初步主题" not in description:
            description = f"{description}（初步主题，需导入讲义或教材内容后完善。）"
        point = KnowledgePoint(
            course_id=payload.course_id,
            name=name,
            description=description,
            source_document=source_document.filename if source_document else None,
            source_page=support_chunk.page_number if support_chunk else None,
            source_excerpt=source_excerpt,
            confidence=80 if payload.document_id is not None else 45 if is_single_webpage_outline else 60,
        )
        db.add(point)
        created.append(point)
    db.commit()
    for point in created:
        db.refresh(point)
    return {
        "course_id": payload.course_id,
        "document_id": payload.document_id,
        "reused": False,
        "message": "知识点已重新生成并保存。" if payload.force else "知识点已生成并保存。",
        "knowledge_points": [
            {
                "id": point.id,
                "name": point.name,
                "description": point.description,
                "source_document": point.source_document,
                "source_page": point.source_page,
                "source_excerpt": point.source_excerpt,
                "confidence": point.confidence,
            }
            for point in created
        ],
        "raw": result,
    }
