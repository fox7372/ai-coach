from fastapi import APIRouter

from app.runtime import *
from app.schemas import *
from app.services import *

router = APIRouter()

@router.post("/qa/ask", response_model=AskResponse)
def ask_question(payload: AskRequest, db: Session = Depends(get_db)) -> AskResponse:
    course = db.scalar(select(CourseModel).where(CourseModel.id == payload.course_id, CourseModel.user_id == payload.user_id))
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课程不存在或不属于当前用户")

    session = db.scalar(
        select(ChatSession).where(
            ChatSession.id == payload.session_id,
            ChatSession.user_id == payload.user_id,
            ChatSession.course_id == payload.course_id,
        )
    ) if payload.session_id else None
    if session is None:
        session = ensure_default_chat_session(db, payload.user_id, payload.course_id)

    if session.title == "新对话":
        session.title = payload.question.strip()[:30] or "新对话"

    user_message = ChatMessage(user_id=payload.user_id, course_id=payload.course_id, session_id=session.id, role="user", content=payload.question)
    db.add(user_message)
    db.flush()

    retrieved_chunks = retrieve_relevant_chunks(db, payload.course_id, payload.question)
    rag_context = ""
    direct_match = has_direct_text_match(payload.question, retrieved_chunks)
    if retrieved_chunks and direct_match:
        context_parts = []
        for index, (chunk, score) in enumerate(retrieved_chunks, start=1):
            document = db.get(Document, chunk.document_id)
            label = chunk_location_label(chunk, document, index, score)
            context_parts.append(f"[{label}]\n{chunk.chunk_text}")
        rag_context = "\n\n".join(context_parts)
    elif retrieved_chunks:
        rag_context = (
            "检索说明：当前课程资料没有直接命中学生问题中的关键词。"
            "你可以用操作系统通用知识解释概念，但不能把下面低相关片段说成该知识点的直接出处，"
            "也不能臆造课程章节、实验或文件位置。\n\n"
            + "\n\n".join(
                f"[低相关参考 {index}] {compact_excerpt(chunk.chunk_text, 260)}"
                for index, (chunk, _) in enumerate(retrieved_chunks[:2], start=1)
            )
        )

    try:
        answer = ai_service.answer_question(payload.question, context=rag_context or None)
        provider = settings.ai_provider if ai_service.enabled else "mock"
    except Exception as exc:
        answer = f"AI 模型调用失败：{exc}"
        provider = f"{settings.ai_provider}-error"

    if retrieved_chunks and direct_match:
        references = []
        for index, (chunk, score) in enumerate(retrieved_chunks, start=1):
            document = db.get(Document, chunk.document_id)
            source_url = chunk.source_url or build_timestamp_url(document.source_url if document else None, chunk.start_time)
            label = chunk_location_label(chunk, document, index, score)
            if source_url:
                label = f"[{label}]({source_url})"
            references.append(f"{label}\n  摘录：{compact_excerpt(chunk.chunk_text)}")
    elif retrieved_chunks:
        references = ["当前课程资料未直接命中该问题关键词；以下回答包含通用操作系统知识，需要补充更具体讲义或教材片段后再精确核对。"]
    else:
        references = build_references(db, payload.course_id)
    answer_with_references = answer + "\n\n### 核对位置\n" + "\n".join(f"- {item}" for item in references)
    assistant_message = ChatMessage(user_id=payload.user_id, course_id=payload.course_id, session_id=session.id, role="assistant", content=answer_with_references)
    db.add(assistant_message)
    session.updated_at = datetime.now()
    db.flush()
    db.commit()

    return AskResponse(
        answer=answer_with_references,
        references=references,
        provider=provider,
        user_message_id=user_message.id,
        assistant_message_id=assistant_message.id,
    )


@router.get("/qa/sessions", response_model=list[ChatSessionOut])
def list_chat_sessions(user_id: int = 1, course_id: int = 1, db: Session = Depends(get_db)) -> list[ChatSessionOut]:
    ensure_default_chat_session(db, user_id, course_id)
    db.commit()
    sessions = db.scalars(
        select(ChatSession)
        .where(ChatSession.user_id == user_id, ChatSession.course_id == course_id)
        .order_by(ChatSession.updated_at.desc(), ChatSession.id.desc())
    ).all()
    return [
        ChatSessionOut(
            id=session.id,
            title=session.title,
            course_id=session.course_id,
            created_at=session.created_at.isoformat() if session.created_at else "",
            updated_at=session.updated_at.isoformat() if session.updated_at else "",
        )
        for session in sessions
    ]


@router.post("/qa/sessions", response_model=ChatSessionOut)
def create_chat_session(payload: ChatSessionCreate, db: Session = Depends(get_db)) -> ChatSessionOut:
    course = db.scalar(select(CourseModel).where(CourseModel.id == payload.course_id, CourseModel.user_id == payload.user_id))
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课程不存在或不属于当前用户")

    title = (payload.title or "新对话").strip() or "新对话"
    session = ChatSession(user_id=payload.user_id, course_id=payload.course_id, title=title[:120])
    db.add(session)
    db.commit()
    db.refresh(session)
    return ChatSessionOut(
        id=session.id,
        title=session.title,
        course_id=session.course_id,
        created_at=session.created_at.isoformat() if session.created_at else "",
        updated_at=session.updated_at.isoformat() if session.updated_at else "",
    )


@router.delete("/qa/sessions/{session_id}")
def delete_chat_session(session_id: int, user_id: int = 1, db: Session = Depends(get_db)) -> dict[str, object]:
    session = db.scalar(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user_id))
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="对话不存在")

    result = db.execute(delete(ChatMessage).where(ChatMessage.session_id == session_id, ChatMessage.user_id == user_id))
    db.delete(session)
    db.commit()
    return {"status": "deleted", "deleted_messages": result.rowcount or 0, "session_id": session_id}


@router.get("/qa/messages", response_model=list[ChatMessageOut])
def list_chat_messages(user_id: int = 1, course_id: int = 1, session_id: int | None = None, db: Session = Depends(get_db)) -> list[ChatMessageOut]:
    if session_id is None:
        session_id = ensure_default_chat_session(db, user_id, course_id).id
        db.commit()
    messages = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.user_id == user_id, ChatMessage.course_id == course_id, ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
    ).all()
    return [
        ChatMessageOut(
            id=message.id,
            role=message.role,
            content=normalize_math_delimiters(message.content or ""),
            created_at=message.created_at.isoformat() if message.created_at else "",
        )
        for message in messages
    ]


@router.get("/qa/messages/search")
def search_chat_messages(keyword: str, user_id: int = 1, course_id: int = 1, db: Session = Depends(get_db)) -> list[dict[str, object]]:
    require_course(db, course_id, user_id)
    term = keyword.strip()
    if not term:
        return []
    rows = db.execute(
        select(ChatMessage, ChatSession)
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .where(
            ChatMessage.user_id == user_id,
            ChatMessage.course_id == course_id,
            ChatMessage.content.like(f"%{term}%"),
        )
        .order_by(ChatMessage.id.desc())
        .limit(50)
    ).all()
    return [
        {
            "id": message.id,
            "role": message.role,
            "content": normalize_math_delimiters(message.content or ""),
            "created_at": message.created_at.isoformat() if message.created_at else "",
            "session_id": session.id,
            "session_title": session.title,
        }
        for message, session in rows
    ]


@router.delete("/qa/messages")
def delete_chat_messages(user_id: int = 1, course_id: int = 1, session_id: int | None = None, db: Session = Depends(get_db)) -> dict[str, object]:
    require_course(db, course_id, user_id)
    if session_id is None:
        result = db.execute(delete(ChatMessage).where(ChatMessage.user_id == user_id, ChatMessage.course_id == course_id))
    else:
        result = db.execute(delete(ChatMessage).where(ChatMessage.user_id == user_id, ChatMessage.course_id == course_id, ChatMessage.session_id == session_id))
    db.commit()
    return {"status": "deleted", "deleted_messages": result.rowcount or 0}
