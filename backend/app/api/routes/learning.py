from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AnswerRecord, ChatMessage, Document, KnowledgePoint, LearningCheckin, LearningSuggestion, MistakeRecord
from app.runtime import ai_service
from app.schemas import CourseTaskRequest, DailyPlanRequest, LearningCheckinRequest
from app.services.application_service import require_course

router = APIRouter()

@router.post("/api/ai/generate-learning-plan")
def generate_learning_plan(payload: CourseTaskRequest, db: Session = Depends(get_db)) -> dict[str, object]:
    course = require_course(db, payload.course_id, payload.user_id)
    course_name = course.name
    existing = db.scalar(
        select(LearningSuggestion)
        .where(
            LearningSuggestion.user_id == payload.user_id,
            LearningSuggestion.course_id == payload.course_id,
            LearningSuggestion.title.in_(["整体学习计划", "下一步学习建议"]),
        )
        .order_by(LearningSuggestion.id.desc())
    )
    mistakes = db.scalars(
        select(MistakeRecord)
        .where(MistakeRecord.user_id == payload.user_id, MistakeRecord.course_id == payload.course_id)
        .order_by(MistakeRecord.id.desc())
        .limit(5)
    ).all()
    mistake_context = "\n".join(item.ai_analysis or "" for item in mistakes) or "暂无错题记录。"
    plan = ai_service.generate_text(
        (
            "你是学习规划助手。请基于课程、错题、当前整体计划和学生新的修改意见，更新一份可执行的整体学习计划。"
            "不要只回复修改说明，要返回完整新版计划。"
            "禁止使用 Markdown 大表格或超宽表格。"
            "请按以下结构输出：一、总体目标；二、阶段安排；三、每周任务；四、实验安排；五、每日节奏；六、检查点与调整规则。"
            "阶段安排必须使用分周小标题和项目符号，每周包含：目标、理论任务、实验任务、验收标准、时间分配。"
            "如果有多个模块放在同一周，要拆成同一周下的多个小节，不要塞进一行表格。"
        ),
        (
            f"课程：{course_name}\n"
            f"当前整体计划：\n{existing.content if existing else '暂无当前整体计划。'}\n\n"
            f"学生修改意见或目标约束：{payload.text or '学生暂未补充目标，请给出默认 MVP 学习计划。'}\n"
            f"最近错题：\n{mistake_context}"
        ),
    )
    if existing is not None:
        existing.title = "整体学习计划"
        existing.content = plan
        existing.status = "updated"
        suggestion = existing
    else:
        suggestion = LearningSuggestion(
            user_id=payload.user_id,
            course_id=payload.course_id,
            title="整体学习计划",
            content=plan,
            status="active",
        )
        db.add(suggestion)
    db.flush()
    study_date = date.today().isoformat()
    daily = build_daily_plan(
        db,
        payload.user_id,
        payload.course_id,
        study_date,
        f"整体学习计划已根据这条修改意见更新：{payload.text or '快速生成默认整体计划'}。请同步调整今日计划，使它服务于新版整体计划。",
    )
    db.commit()
    db.refresh(suggestion)
    db.refresh(daily)
    return {"suggestion_id": suggestion.id, "plan": plan, "daily_plan": daily.content, "daily_suggestion_id": daily.id}


def build_daily_plan(db: Session, user_id: int, course_id: int, study_date: str, feedback: str | None = None) -> LearningSuggestion:
    course = require_course(db, course_id, user_id)
    course_name = course.name
    mistakes = db.scalars(
        select(MistakeRecord)
        .where(MistakeRecord.user_id == user_id, MistakeRecord.course_id == course_id)
        .order_by(MistakeRecord.id.desc())
        .limit(5)
    ).all()
    checkins = db.scalars(
        select(LearningCheckin)
        .where(LearningCheckin.user_id == user_id, LearningCheckin.course_id == course_id)
        .order_by(LearningCheckin.id.desc())
        .limit(5)
    ).all()
    mistake_context = "\n".join(item.ai_analysis or "" for item in mistakes) or "暂无错题记录。"
    checkin_context = "\n".join(f"{item.study_date} {item.status} {item.minutes}分钟 {item.difficulty}：{item.feedback}" for item in checkins) or "暂无学习状态反馈。"
    overall = db.scalar(
        select(LearningSuggestion)
        .where(
            LearningSuggestion.user_id == user_id,
            LearningSuggestion.course_id == course_id,
            LearningSuggestion.title == "整体学习计划",
        )
        .order_by(LearningSuggestion.id.desc())
    )
    previous_daily = db.scalar(
        select(LearningSuggestion)
        .where(
            LearningSuggestion.user_id == user_id,
            LearningSuggestion.course_id == course_id,
            LearningSuggestion.title.like("每日学习计划 %"),
            LearningSuggestion.title < f"每日学习计划 {study_date}",
        )
        .order_by(LearningSuggestion.title.desc(), LearningSuggestion.id.desc())
    )
    existing = db.scalar(
        select(LearningSuggestion)
        .where(
            LearningSuggestion.user_id == user_id,
            LearningSuggestion.course_id == course_id,
            LearningSuggestion.title == f"每日学习计划 {study_date}",
        )
        .order_by(LearningSuggestion.id.desc())
    )
    extra_feedback = feedback or "今天还没有新的反馈。"
    plan = ai_service.generate_text(
        (
            "你是每日学习计划助手。请生成指定日期的学习计划。今日计划必须服务于整体计划，并且是上一日期计划的延续："
            "先承接未完成任务，再根据最新反馈调整任务数量、难度和顺序，避免每天从头重新规划。"
            "输出包含：与前一日的衔接、今日目标、学习任务、练习任务、复盘提醒、下一日调整依据。"
        ),
        (
            f"日期：{study_date}\n课程：{course_name}\n"
            f"当前整体学习计划：\n{overall.content if overall else '暂无整体学习计划。'}\n\n"
            f"上一日期计划：\n{previous_daily.content if previous_daily else '这是首个每日计划，请从整体计划的第一阶段开始。'}\n\n"
            f"调整前的本日计划：\n{existing.content if existing else '本日尚未生成计划。'}\n\n"
            f"最新反馈：{extra_feedback}\n最近学习状态：\n{checkin_context}\n最近错题：\n{mistake_context}"
        ),
    )
    if existing is not None:
        existing.content = plan
        existing.status = "updated"
        suggestion = existing
    else:
        suggestion = LearningSuggestion(
            user_id=user_id,
            course_id=course_id,
            title=f"每日学习计划 {study_date}",
            content=plan,
            status="active",
        )
        db.add(suggestion)
    db.flush()
    return suggestion


@router.post("/api/ai/daily-learning-plan")
def get_or_create_daily_learning_plan(payload: DailyPlanRequest, db: Session = Depends(get_db)) -> dict[str, object]:
    require_course(db, payload.course_id, payload.user_id)
    study_date = payload.study_date or date.today().isoformat()
    existing = db.scalar(
        select(LearningSuggestion)
        .where(
            LearningSuggestion.user_id == payload.user_id,
            LearningSuggestion.course_id == payload.course_id,
            LearningSuggestion.title == f"每日学习计划 {study_date}",
        )
        .order_by(LearningSuggestion.id.desc())
    )
    if existing is None:
        existing = build_daily_plan(db, payload.user_id, payload.course_id, study_date)
        db.commit()
        db.refresh(existing)
    return {"suggestion_id": existing.id, "study_date": study_date, "plan": existing.content, "status": existing.status}


@router.post("/api/ai/update-daily-learning-plan")
def update_daily_learning_plan(payload: LearningCheckinRequest, db: Session = Depends(get_db)) -> dict[str, object]:
    course = require_course(db, payload.course_id, payload.user_id)
    study_date = payload.study_date or date.today().isoformat()
    checkin = LearningCheckin(
        user_id=payload.user_id,
        course_id=payload.course_id,
        plan_id=payload.plan_id,
        study_date=study_date,
        status=payload.status,
        minutes=max(0, payload.minutes),
        difficulty=payload.difficulty,
        feedback=payload.feedback,
    )
    db.add(checkin)
    db.flush()
    suggestion = build_daily_plan(db, payload.user_id, payload.course_id, study_date, payload.feedback)
    checkin.plan_id = suggestion.id

    if payload.status == "completed":
        course.progress = min(100, course.progress + 5)
        course.mastery = min(100, course.mastery + 3)
    elif payload.status == "stuck":
        course.mastery = max(0, course.mastery - 3)

    db.commit()
    db.refresh(suggestion)
    db.refresh(checkin)
    return {
        "checkin_id": checkin.id,
        "suggestion_id": suggestion.id,
        "study_date": study_date,
        "plan": suggestion.content,
        "course_progress": course.progress if course else None,
        "course_mastery": course.mastery if course else None,
    }


@router.get("/courses/{course_id}/knowledge-points")
def list_course_knowledge_points(course_id: int, db: Session = Depends(get_db)) -> list[dict[str, object]]:
    require_course(db, course_id)
    points = db.scalars(select(KnowledgePoint).where(KnowledgePoint.course_id == course_id).order_by(KnowledgePoint.id)).all()
    return [
        {
            "id": point.id,
            "name": point.name,
            "description": point.description,
            "source_document": point.source_document,
            "source_page": point.source_page,
            "source_excerpt": point.source_excerpt,
            "confidence": point.confidence,
            "created_at": point.created_at,
        }
        for point in points
    ]


@router.get("/courses/{course_id}/learning-suggestions")
def list_course_learning_suggestions(course_id: int, user_id: int = 1, db: Session = Depends(get_db)) -> list[dict[str, object]]:
    require_course(db, course_id, user_id)
    suggestions = db.scalars(
        select(LearningSuggestion)
        .where(LearningSuggestion.course_id == course_id, LearningSuggestion.user_id == user_id)
        .order_by(LearningSuggestion.id.desc())
    ).all()
    return [
        {
            "id": suggestion.id,
            "title": suggestion.title,
            "content": suggestion.content,
            "status": suggestion.status,
            "created_at": suggestion.created_at,
        }
        for suggestion in suggestions
    ]


@router.get("/courses/{course_id}/learning-history")
def list_course_learning_history(course_id: int, user_id: int = 1, db: Session = Depends(get_db)) -> list[dict[str, object]]:
    require_course(db, course_id, user_id)
    daily_plans = db.scalars(
        select(LearningSuggestion)
        .where(
            LearningSuggestion.course_id == course_id,
            LearningSuggestion.user_id == user_id,
            LearningSuggestion.title.like("每日学习计划 %"),
        )
        .order_by(LearningSuggestion.title.desc(), LearningSuggestion.id.desc())
    ).all()
    checkins = db.scalars(
        select(LearningCheckin)
        .where(
            LearningCheckin.course_id == course_id,
            LearningCheckin.user_id == user_id,
        )
        .order_by(LearningCheckin.study_date.desc(), LearningCheckin.created_at.desc(), LearningCheckin.id.desc())
    ).all()

    history_by_date: dict[str, dict[str, object]] = {}
    for plan in daily_plans:
        study_date = plan.title.removeprefix("每日学习计划 ").strip()
        if not study_date:
            continue
        history_by_date.setdefault(
            study_date,
            {
                "study_date": study_date,
                "minutes": 0,
                "difficulty": None,
                "feedback": None,
                "plan": plan.content,
                "plan_status": plan.status,
                "planned_at": plan.created_at,
                "completed_at": None,
                "checkin_count": 0,
                "latest_status": "not_started",
                "feedbacks": [],
            },
        )

    for checkin in checkins:
        record = history_by_date.setdefault(
            checkin.study_date,
            {
                "study_date": checkin.study_date,
                "minutes": 0,
                "difficulty": None,
                "feedback": None,
                "plan": None,
                "plan_status": None,
                "planned_at": None,
                "completed_at": None,
                "checkin_count": 0,
                "latest_status": checkin.status,
                "feedbacks": [],
            },
        )
        record["minutes"] = int(record["minutes"]) + checkin.minutes
        record["checkin_count"] = int(record["checkin_count"]) + 1
        feedbacks = record["feedbacks"]
        if isinstance(feedbacks, list):
            feedbacks.append(
                {
                    "id": checkin.id,
                    "status": checkin.status,
                    "minutes": checkin.minutes,
                    "difficulty": checkin.difficulty,
                    "feedback": checkin.feedback,
                    "created_at": checkin.created_at,
                }
            )
        if record["difficulty"] is None and checkin.difficulty:
            record["difficulty"] = checkin.difficulty
        if record["feedback"] is None and checkin.feedback:
            record["feedback"] = checkin.feedback
        if record["completed_at"] is None and checkin.status == "completed":
            record["completed_at"] = checkin.created_at
        if int(record["checkin_count"]) == 1:
            record["latest_status"] = checkin.status

    return [history_by_date[study_date] for study_date in sorted(history_by_date, reverse=True)]


def clamp_percent(value: float) -> int:
    return max(0, min(100, round(value)))


def build_course_learning_snapshot(db: Session, course_id: int, user_id: int) -> dict[str, object]:
    course = require_course(db, course_id, user_id)
    documents_count = db.scalar(select(func.count()).select_from(Document).where(Document.course_id == course_id)) or 0
    knowledge_count = db.scalar(select(func.count()).select_from(KnowledgePoint).where(KnowledgePoint.course_id == course_id)) or 0
    suggestions_count = db.scalar(select(func.count()).select_from(LearningSuggestion).where(LearningSuggestion.user_id == user_id, LearningSuggestion.course_id == course_id)) or 0
    messages_count = db.scalar(select(func.count()).select_from(ChatMessage).where(ChatMessage.user_id == user_id, ChatMessage.course_id == course_id, ChatMessage.role == "user")) or 0
    answers = db.scalars(
        select(AnswerRecord)
        .where(AnswerRecord.user_id == user_id, AnswerRecord.course_id == course_id)
        .order_by(AnswerRecord.id.desc())
    ).all()
    mistakes = db.scalars(
        select(MistakeRecord)
        .where(MistakeRecord.user_id == user_id, MistakeRecord.course_id == course_id)
        .order_by(MistakeRecord.id.desc())
    ).all()
    checkins = db.scalars(
        select(LearningCheckin)
        .where(LearningCheckin.user_id == user_id, LearningCheckin.course_id == course_id)
        .order_by(LearningCheckin.id.desc())
    ).all()

    answer_count = len(answers)
    average_score = clamp_percent(sum(answer.score or 0 for answer in answers) / answer_count) if answer_count else None
    correct_rate = clamp_percent(sum(1 for answer in answers if answer.is_correct) / answer_count * 100) if answer_count else None
    mistakes_count = len(mistakes)
    reviewed_mistakes = sum(1 for item in mistakes if item.review_status == "reviewed" or item.review_count > 0)
    unresolved_mistakes = mistakes_count - reviewed_mistakes
    review_rate = clamp_percent(reviewed_mistakes / mistakes_count * 100) if mistakes_count else None
    checkin_count = len(checkins)
    completed_checkins = sum(1 for item in checkins if item.status == "completed")
    stuck_checkins = sum(1 for item in checkins if item.status == "stuck")
    total_minutes = sum(max(0, item.minutes or 0) for item in checkins)
    completion_rate = clamp_percent(completed_checkins / checkin_count * 100) if checkin_count else None
    continuity = clamp_percent((completion_rate or 0) * 0.7 + min(30, total_minutes / 10)) if checkin_count else None

    evidence_count = answer_count + min(checkin_count, 4) + min(mistakes_count, 3) + min(messages_count, 3)
    if evidence_count >= 12:
        confidence = {"level": "high", "label": "证据充分", "detail": f"已综合 {answer_count} 次作答、{checkin_count} 次打卡和 {mistakes_count} 条错题。"}
    elif evidence_count >= 4:
        confidence = {"level": "medium", "label": "证据有限", "detail": f"已综合 {answer_count} 次作答、{checkin_count} 次打卡和 {mistakes_count} 条错题。"}
    else:
        confidence = {"level": "low", "label": "样本不足", "detail": "当前记录较少，结论仅用于确定下一步学习动作。"}

    recent_checkins = list(reversed(checkins[:7]))
    trend_dates = [item.study_date[5:] if len(item.study_date) >= 10 else item.study_date for item in recent_checkins]
    trend_activity = [min(100, max(0, item.minutes or 0)) for item in recent_checkins]
    trend_mastery = []
    running_mastery = course.mastery
    for item in recent_checkins:
        if item.status == "completed":
            running_mastery += 3
        elif item.status == "stuck":
            running_mastery -= 3
        elif item.status == "studying":
            running_mastery += 1
        trend_mastery.append(clamp_percent(running_mastery))
    if not trend_dates:
        trend_dates, trend_activity, trend_mastery = ["暂无记录"], [0], [course.mastery]

    actions: list[dict[str, str]] = []
    strengths: list[str] = []
    if answer_count == 0:
        actions.append({"title": "先完成一次自测", "reason": "尚无作答记录，无法判断知识掌握。", "action": "在测验中完成 5 道题，优先选择当前课程重点。", "tone": "amber"})
    elif average_score is not None and average_score < 60:
        actions.append({"title": "优先修复基础题", "reason": f"最近 {answer_count} 次作答平均得分为 {average_score}%。", "action": "先整理错题中的概念与公式，再完成同类题复测。", "tone": "red"})
    elif average_score is not None and average_score >= 80:
        strengths.append(f"近期作答平均得分 {average_score}%，基础练习表现稳定。")
    if unresolved_mistakes:
        actions.append({"title": "完成错题闭环", "reason": f"有 {unresolved_mistakes} 条错题尚未复盘。", "action": "逐条补充订正原因，并在复习后重新完成相似题。", "tone": "red"})
    elif mistakes_count and review_rate == 100:
        strengths.append("已记录的错题均有复盘痕迹，复习闭环较完整。")
    if checkin_count == 0:
        actions.append({"title": "记录学习反馈", "reason": "尚无学习打卡，无法判断投入和连续性。", "action": "在学习计划页完成一次反馈，填写时长和卡点。", "tone": "amber"})
    elif continuity is not None and continuity < 50:
        actions.append({"title": "提高学习连续性", "reason": f"已完成 {completed_checkins}/{checkin_count} 次打卡，共学习 {total_minutes} 分钟。", "action": "连续 3 天完成 20 分钟学习，并在当天提交反馈。", "tone": "amber"})
    elif continuity is not None and continuity >= 70:
        strengths.append(f"已完成 {completed_checkins}/{checkin_count} 次学习反馈，学习节奏较稳定。")
    if messages_count >= 3:
        strengths.append(f"已围绕课程提出 {messages_count} 个问题，具备主动澄清习惯。")
    if not actions:
        actions.append({"title": "保持当前节奏", "reason": "当前没有突出的风险信号。", "action": "继续按计划学习，并每周完成一次针对性自测。", "tone": "emerald"})

    return {
        "course": course,
        "documents_count": documents_count,
        "knowledge_count": knowledge_count,
        "suggestions_count": suggestions_count,
        "messages_count": messages_count,
        "answer_count": answer_count,
        "average_score": average_score,
        "correct_rate": correct_rate,
        "mistakes_count": mistakes_count,
        "reviewed_mistakes": reviewed_mistakes,
        "unresolved_mistakes": unresolved_mistakes,
        "review_rate": review_rate,
        "checkin_count": checkin_count,
        "completed_checkins": completed_checkins,
        "stuck_checkins": stuck_checkins,
        "total_minutes": total_minutes,
        "completion_rate": completion_rate,
        "continuity": continuity,
        "confidence": confidence,
        "actions": actions[:3],
        "strengths": strengths[:3],
        "trend": {"dates": trend_dates, "mastery": trend_mastery, "activity": trend_activity},
    }


@router.get("/courses/{course_id}/diagnosis")
def get_course_diagnosis(course_id: int, user_id: int = 1, db: Session = Depends(get_db)) -> dict[str, object]:
    snapshot = build_course_learning_snapshot(db, course_id, user_id)
    course = snapshot["course"]
    has_mastery_evidence = bool(snapshot["answer_count"] or snapshot["mistakes_count"] or snapshot["checkin_count"])
    items = [
        {"label": "课程掌握", "value": course.mastery if has_mastery_evidence else None, "status": f"课程当前估计 {course.mastery}%" if has_mastery_evidence else "尚无足够学习证据", "hint": "来自测验、错题和学习反馈带来的掌握度变化。", "tone": "emerald"},
        {"label": "测验表现", "value": snapshot["average_score"], "status": f"{snapshot['answer_count']} 次作答，正确率 {snapshot['correct_rate']}%" if snapshot["answer_count"] else "尚无作答记录", "hint": "按已保存作答的得分计算。", "tone": "emerald" if (snapshot["average_score"] or 0) >= 80 else "amber"},
        {"label": "学习连续性", "value": snapshot["continuity"], "status": f"{snapshot['completed_checkins']}/{snapshot['checkin_count']} 次完成，共 {snapshot['total_minutes']} 分钟" if snapshot["checkin_count"] else "尚无学习反馈", "hint": "综合完成率与累计学习时长。", "tone": "emerald" if (snapshot["continuity"] or 0) >= 70 else "amber"},
        {"label": "错题闭环", "value": snapshot["review_rate"], "status": f"已复盘 {snapshot['reviewed_mistakes']}/{snapshot['mistakes_count']}，待处理 {snapshot['unresolved_mistakes']}" if snapshot["mistakes_count"] else "尚未记录错题", "hint": "以错题的复盘状态和复习次数为依据。", "tone": "emerald" if snapshot["unresolved_mistakes"] == 0 else "red"},
    ]
    return {
        "course_id": course_id,
        "course_name": course.name,
        "progress": course.progress,
        "mastery": course.mastery,
        "documents_count": snapshot["documents_count"],
        "knowledge_count": snapshot["knowledge_count"],
        "mistakes_count": snapshot["mistakes_count"],
        "messages_count": snapshot["messages_count"],
        "items": items,
        "confidence": snapshot["confidence"],
        "actions": snapshot["actions"],
        "strengths": snapshot["strengths"],
        "trend": snapshot["trend"],
    }


@router.get("/courses/{course_id}/profile")
def get_course_profile(course_id: int, user_id: int = 1, db: Session = Depends(get_db)) -> dict[str, object]:
    snapshot = build_course_learning_snapshot(db, course_id, user_id)
    course = snapshot["course"]
    has_mastery_evidence = bool(snapshot["answer_count"] or snapshot["mistakes_count"] or snapshot["checkin_count"])
    radar = [
        {"name": "知识掌握", "value": course.mastery if has_mastery_evidence else None, "evidence": f"课程当前掌握度 {course.mastery}%" if has_mastery_evidence else "尚无测验、错题或学习反馈"},
        {"name": "练习表现", "value": snapshot["average_score"], "evidence": f"{snapshot['answer_count']} 次作答" if snapshot["answer_count"] else "尚无作答样本"},
        {"name": "学习连续性", "value": snapshot["continuity"], "evidence": f"{snapshot['completed_checkins']}/{snapshot['checkin_count']} 次完成" if snapshot["checkin_count"] else "尚无学习反馈"},
        {"name": "错题复盘", "value": snapshot["review_rate"], "evidence": f"已复盘 {snapshot['reviewed_mistakes']}/{snapshot['mistakes_count']} 条" if snapshot["mistakes_count"] else "尚无错题样本"},
        {"name": "主动提问", "value": min(100, snapshot["messages_count"] * 20) if snapshot["messages_count"] else None, "evidence": f"已提出 {snapshot['messages_count']} 个课程问题" if snapshot["messages_count"] else "尚无课程提问"},
    ]
    available = [item["value"] for item in radar if item["value"] is not None]
    average = clamp_percent(sum(available) / len(available)) if available else 0
    conclusion = f"当前画像基于 {snapshot['answer_count']} 次作答、{snapshot['checkin_count']} 次学习反馈、{snapshot['mistakes_count']} 条错题和 {snapshot['messages_count']} 个课程问题生成。"
    if snapshot["confidence"]["level"] == "low":
        conclusion += " 当前样本不足，优先完成一次测验和一次学习反馈后再比较变化。"
    elif average >= 75:
        conclusion += " 当前学习状态较稳定，可逐步增加综合题和迁移练习。"
    else:
        conclusion += " 建议先处理诊断中的优先动作，再通过短测验验证改进。"
    return {
        "course_id": course_id,
        "radar": radar,
        "confidence": snapshot["confidence"],
        "focuses": snapshot["actions"],
        "strengths": snapshot["strengths"],
        "conclusion": conclusion,
    }
