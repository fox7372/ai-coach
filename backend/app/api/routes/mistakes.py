from fastapi import APIRouter

from app.runtime import *
from app.schemas import *
from app.services import *

router = APIRouter()

@router.post("/diagnosis/signals")
def create_signal(payload: DiagnosisSignal, db: Session = Depends(get_db)) -> dict[str, object]:
    require_course(db, payload.course_id, payload.user_id)
    suggestion = LearningSuggestion(
        user_id=payload.user_id,
        course_id=payload.course_id,
        title="今日学习建议",
        content="根据本次学习信号，建议复习相关知识点并完成 3 道针对性练习。",
    )
    db.add(suggestion)
    db.commit()

    return {
        "status": "saved",
        "course_id": payload.course_id,
        "mastery_effect": -5 if payload.signal_type in {"mistake", "not_understood"} else 3,
        "suggestion": suggestion.content,
    }


@router.post("/mistakes")
def create_mistake(payload: MistakeCreate, db: Session = Depends(get_db)) -> dict[str, object]:
    require_course(db, payload.course_id, payload.user_id)
    mistake = MistakeRecord(
        user_id=payload.user_id,
        course_id=payload.course_id,
        question_id=payload.question_id,
        mistake_type=payload.mistake_type,
        ai_analysis=payload.ai_analysis,
        weak_points=payload.weak_points,
        suggestion=payload.suggestion,
        image_path=payload.image_path,
        ocr_text=payload.ocr_text or extract_mistake_question_text(payload.ai_analysis),
    )
    db.add(mistake)
    db.commit()
    db.refresh(mistake)
    return {"status": "saved", "mistake_id": mistake.id}


@router.get("/mistakes")
def list_mistakes(user_id: int = 1, course_id: int | None = None, db: Session = Depends(get_db)) -> list[dict[str, object]]:
    query = select(MistakeRecord).where(MistakeRecord.user_id == user_id)
    if course_id is not None:
        require_course(db, course_id, user_id)
        query = query.where(MistakeRecord.course_id == course_id)
    mistakes = db.scalars(query.order_by(MistakeRecord.id.desc())).all()
    results: list[dict[str, object]] = []
    for item in mistakes:
        ai_analysis = repair_mojibake(item.ai_analysis or "")
        ocr_text = repair_mojibake(item.ocr_text or "") or extract_mistake_question_text(ai_analysis)
        results.append(
            {
                "id": item.id,
                "course_id": item.course_id,
                "mistake_type": item.mistake_type,
                "ai_analysis": ai_analysis,
                "weak_points": repair_mojibake(item.weak_points or ""),
                "suggestion": repair_mojibake(item.suggestion or ""),
                "image_path": item.image_path,
                "ocr_text": ocr_text,
                "review_status": item.review_status,
                "created_at": item.created_at,
            }
        )
    return results


@router.delete("/mistakes/{mistake_id}")
def delete_mistake(mistake_id: int, user_id: int = 1, db: Session = Depends(get_db)) -> dict[str, object]:
    mistake = db.scalar(select(MistakeRecord).where(MistakeRecord.id == mistake_id, MistakeRecord.user_id == user_id))
    if mistake is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="错题不存在")
    db.delete(mistake)
    db.commit()
    return {"status": "deleted", "mistake_id": mistake_id}
