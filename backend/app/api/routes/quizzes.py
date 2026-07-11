from fastapi import APIRouter

from app.runtime import *
from app.schemas import *
from app.services import *

router = APIRouter()

QUIZ_SECTION_PATTERN = re.compile(
    r"(?m)(?=^\s*#{1,6}\s*(?:第\s*\d+\s*题?|题目\s*\d+|\d+\s*[.、]))"
)
QUIZ_QUESTION_PATTERN = re.compile(r"(?im)^\s*(?:Q|题目|问题)\s*[：:]\s*")
QUIZ_FIELD_PATTERN = re.compile(r"(?im)^\s*(Q|题目|问题|A|答案|参考答案|E|解析|说明|讲解|检测点)\s*[：:]\s*")


def parse_quiz_questions(result: str) -> list[tuple[str, str, str]]:
    """Extract quiz fields without depending on blank lines from the model response."""
    text_value = repair_mojibake(result).replace("\r\n", "\n")
    blocks = [block.strip() for block in QUIZ_SECTION_PATTERN.split(text_value) if block.strip()]
    if sum(bool(QUIZ_QUESTION_PATTERN.search(block)) for block in blocks) <= 1:
        blocks = [block.strip() for block in QUIZ_QUESTION_PATTERN.split(text_value) if block.strip()]
        blocks = [f"Q: {block}" for block in blocks]

    parsed: list[tuple[str, str, str]] = []
    for block in blocks:
        matches = list(QUIZ_FIELD_PATTERN.finditer(block))
        if not matches:
            continue

        fields: dict[str, str] = {}
        for index, match in enumerate(matches):
            field_name = match.group(1)
            value_end = matches[index + 1].start() if index + 1 < len(matches) else len(block)
            value = block[match.end() : value_end].strip()
            if field_name in {"Q", "题目", "问题"}:
                fields["question"] = value
            elif field_name in {"A", "答案", "参考答案"}:
                fields["answer"] = value
            elif field_name in {"E", "解析", "说明", "讲解"}:
                fields["explanation"] = value

        question_text = fields.get("question", "")
        if question_text:
            parsed.append((question_text, fields.get("answer", ""), fields.get("explanation", "")))
    return parsed


@router.post("/api/ai/generate-quiz")
def generate_quiz(payload: QuizGenerateRequest, db: Session = Depends(get_db)) -> dict[str, object]:
    course = require_course(db, payload.course_id, payload.user_id)
    course_name = course.name
    context = get_course_context(db, payload.course_id, payload.text)
    study_date = date.today().isoformat()
    daily_plan = db.scalar(
        select(LearningSuggestion)
        .where(
            LearningSuggestion.user_id == payload.user_id,
            LearningSuggestion.course_id == payload.course_id,
            LearningSuggestion.title == f"每日学习计划 {study_date}",
        )
        .order_by(LearningSuggestion.id.desc())
    )
    quiz_focus = payload.text.strip() if payload.text else ""
    result = ai_service.generate_text(
        (
            "你是严谨的课程检测出题助手。请用简体中文生成测验题，避免乱码、繁体字和无关英文。"
            "出题依据优先级：1. 用户检测需求；2. 今日学习计划；3. 课程资料。"
            "题目必须围绕当天学习内容或用户指定范围，不要泛泛覆盖整门课。"
            "每题包含题目、参考答案、解析、检测点。"
            "格式必须严格为 Markdown，不要使用表格。"
            "每题格式：### 第N题\nQ: ...\nA: ...\nE: ...\n检测点: ..."
        ),
        (
            f"课程：{course_name}\n"
            f"题目数量：{payload.count}\n"
            f"用户检测需求：{quiz_focus or '未指定，请根据今日学习计划检测。'}\n"
            f"今日学习计划：\n{daily_plan.content if daily_plan else '暂无今日学习计划。'}\n\n"
            f"课程资料：\n{context}"
        ),
    )
    questions: list[Question] = []
    for question_text, answer_text, explanation in parse_quiz_questions(result):
        if question_text:
            question = Question(
                course_id=payload.course_id,
                content=question_text,
                question_type="ai_generated",
                difficulty="normal",
                correct_answer=answer_text,
                explanation=explanation,
            )
            db.add(question)
            questions.append(question)
    db.commit()
    for question in questions:
        db.refresh(question)
    return {
        "course_id": payload.course_id,
        "questions": [
            {
                "id": question.id,
                "content": normalize_math_delimiters(question.content or ""),
                "correct_answer": normalize_math_delimiters(question.correct_answer or ""),
                "explanation": normalize_math_delimiters(question.explanation or ""),
            }
            for question in questions
        ],
        "raw": normalize_math_delimiters(result),
    }


@router.post("/api/ai/analyze-mistake")
def analyze_mistake(payload: MistakeAnalyzeRequest, db: Session = Depends(get_db)) -> dict[str, object]:
    course = require_course(db, payload.course_id, payload.user_id)
    result = ai_service.generate_text(
        "你是错题分析助手。请用中文分析错误原因、薄弱知识点、订正建议和下一步练习。",
        (
            f"题目：{payload.question}\n"
            f"学生答案：{payload.student_answer}\n"
            f"参考答案：{payload.correct_answer or '未提供'}"
        ),
    )
    answer_record_id = None
    if payload.question_id:
        is_correct = bool(payload.correct_answer and payload.student_answer.strip() == payload.correct_answer.strip())
        answer_record = AnswerRecord(
            user_id=payload.user_id,
            course_id=payload.course_id,
            question_id=payload.question_id,
            student_answer=payload.student_answer,
            is_correct=is_correct,
            score=100 if is_correct else 0,
        )
        db.add(answer_record)
        db.flush()
        answer_record_id = answer_record.id

    mistake = MistakeRecord(
        user_id=payload.user_id,
        course_id=payload.course_id,
        question_id=payload.question_id,
        answer_record_id=answer_record_id,
        mistake_type="ai_analyzed",
        ai_analysis=result,
        weak_points="由 AI 分析生成",
        suggestion="根据错题分析完成针对性复习和练习。",
        ocr_text=payload.question,
    )
    db.add(mistake)

    course.mastery = max(0, min(100, course.mastery - 5))

    db.commit()
    db.refresh(mistake)
    return {"mistake_id": mistake.id, "analysis": result, "mastery_effect": -5}


@router.post("/api/ai/ocr-mistake-image")
def ocr_mistake_image(
    user_id: int = 1,
    course_id: int = 1,
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    course = db.scalar(select(CourseModel).where(CourseModel.id == course_id, CourseModel.user_id == user_id))
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课程不存在")

    image_path = save_mistake_image(image, user_id, course_id)
    ocr_text, ocr_engine = extract_text_from_image(image_path)
    return {
        "image_path": str(image_path),
        "ocr_text": ocr_text,
        "ocr_engine": ocr_engine,
        "message": "已识别图片文字，请核对后再让 AI 分析。" if ocr_text else "图片已保存。当前 OCR 环境不可用或未识别出文字，请手动输入/修正题目文字后再分析。",
    }


@router.post("/api/ai/analyze-mistake-image-upload")
def analyze_mistake_image_upload(
    user_id: int = 1,
    course_id: int = 1,
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    course = db.scalar(select(CourseModel).where(CourseModel.id == course_id, CourseModel.user_id == user_id))
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课程不存在")

    image_path = save_mistake_image(image, user_id, course_id)
    if not ai_service.enabled:
        return {
            "mode": "manual_text_required",
            "supports_vision": False,
            "image_path": str(image_path),
            "analysis": "",
            "mistake_id": None,
            "message": "当前还没有配置 AI API Key，不能直接识别图片。请先在设置里配置 Key，或在下方手动输入题目文字后再让 AI 分析。",
        }

    if not ai_service.supports_vision():
        return {
            "mode": "manual_text_required",
            "supports_vision": False,
            "image_path": str(image_path),
            "analysis": "",
            "mistake_id": None,
            "message": f"当前模型 {settings.ai_model} 在文本模型黑名单中，不直接发送图片。请切换到识图模型，或在下方手动输入题目文字后再让 AI 分析。",
        }

    try:
        result = ai_service.analyze_image(
            "你是错题图片分析助手。请直接阅读图片内容，用中文分析题目、解题步骤、错误原因、薄弱知识点和下一步练习建议。"
            "如果图片中包含学生作答痕迹，请区分题目、学生答案和正确思路。"
            "如果图片不清晰或信息不足，请明确指出需要学生补充的信息，不要编造题干。"
            "不要使用 emoji。回答第一行必须写“题目：”，后面给出你从图片中识别到的题目内容。",
            "请分析这张错题图片，并给出可执行的订正建议。请按“题目、解题思路、错误原因、薄弱知识点、复习建议”的结构回答。",
            image_path,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"识图模型调用失败：{clean_error_message(exc)}") from exc

    mistake = MistakeRecord(
        user_id=user_id,
        course_id=course_id,
        mistake_type="image_mistake",
        ai_analysis=f"AI 直接识别图片分析：\n{result}",
        weak_points="由识图模型分析错题图片生成",
        suggestion="根据 AI 图片分析完成订正；若图片不清晰，请补充题目文字后再次分析。",
        image_path=str(image_path),
        ocr_text=extract_mistake_question_text(result),
    )
    db.add(mistake)
    course.mastery = max(0, min(100, course.mastery - 5))
    db.commit()
    db.refresh(mistake)

    return {
        "mode": "vision",
        "supports_vision": True,
        "image_path": str(image_path),
        "analysis": result,
        "mistake_id": mistake.id,
        "message": "识图模型已直接分析图片，并加入错题库。",
    }


@router.post("/api/ai/analyze-mistake-image")
def analyze_mistake_image(payload: MistakeImageAnalyzeRequest, db: Session = Depends(get_db)) -> dict[str, object]:
    if not payload.question_text.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请先确认或输入题目文字")
    course = require_course(db, payload.course_id, payload.user_id)

    result = ai_service.generate_text(
        "你是错题图片分析助手。请用中文分析题目、解题步骤、错误原因、薄弱知识点和下一步练习建议。"
        "如果题目文字可能不完整，请明确提醒学生补充原题信息。",
        (
            f"手动输入/确认后的题目文字：\n{payload.question_text}\n\n"
            f"学生答案：{payload.student_answer or '未提供'}\n"
            f"参考答案：{payload.correct_answer or '未提供'}"
        ),
    )

    mistake_id: int | None = None
    if payload.save_to_mistakes:
        mistake = MistakeRecord(
            user_id=payload.user_id,
            course_id=payload.course_id,
            mistake_type="image_mistake",
            ai_analysis=f"题目文字：\n{payload.question_text}\n\nAI 分析：\n{result}",
            weak_points="由错题图片分析生成",
            suggestion="核对题目文字后，按 AI 建议完成订正和同类练习。",
            image_path=payload.image_path,
            ocr_text=payload.ocr_text or payload.question_text,
        )
        db.add(mistake)

        course.mastery = max(0, min(100, course.mastery - 5))

        db.commit()
        db.refresh(mistake)
        mistake_id = mistake.id

    return {"mistake_id": mistake_id, "analysis": result, "mastery_effect": -5 if payload.save_to_mistakes else 0}


@router.post("/api/quiz/submit-answer")
def submit_quiz_answer(payload: QuizSubmitRequest, db: Session = Depends(get_db)) -> dict[str, object]:
    course = require_course(db, payload.course_id, payload.user_id)
    question = db.scalar(select(Question).where(Question.id == payload.question_id, Question.course_id == payload.course_id))
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="题目不存在")

    expected = (question.correct_answer or "").strip()
    actual = payload.student_answer.strip()
    is_correct = bool(expected and actual == expected)
    analysis = ""
    if not is_correct:
        analysis = ai_service.generate_text(
            "你是错题分析助手。请分析学生为什么错，并给出复习建议。",
            f"题目：{question.content}\n学生答案：{payload.student_answer}\n参考答案：{question.correct_answer}\n解析：{question.explanation}",
        )
    answer_record = AnswerRecord(
        user_id=payload.user_id,
        course_id=payload.course_id,
        question_id=payload.question_id,
        student_answer=payload.student_answer,
        is_correct=is_correct,
        score=100 if is_correct else 0,
        ai_feedback=analysis,
    )
    db.add(answer_record)
    course.mastery = max(0, min(100, course.mastery + (3 if is_correct else -5)))
    course.progress = max(course.progress, 10)
    db.flush()

    mistake = None
    if not is_correct:
        mistake = MistakeRecord(
            user_id=payload.user_id,
            course_id=payload.course_id,
            question_id=payload.question_id,
            answer_record_id=answer_record.id,
            mistake_type="quiz_wrong",
            ai_analysis=analysis,
            weak_points="测验错题暴露的薄弱点",
            suggestion="复习对应知识点后重新练习。",
            ocr_text=question.content,
        )
        db.add(mistake)

    db.commit()
    return {
        "answer_record_id": answer_record.id,
        "is_correct": is_correct,
        "score": answer_record.score,
        "mistake_id": mistake.id if mistake else None,
        "analysis": analysis,
    }


@router.post("/api/quiz/evaluate-answer")
def evaluate_quiz_answer(payload: QuizSubmitRequest, db: Session = Depends(get_db)) -> dict[str, object]:
    course = require_course(db, payload.course_id, payload.user_id)
    question = db.scalar(select(Question).where(Question.id == payload.question_id, Question.course_id == payload.course_id))
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="题目不存在")

    result = ai_service.generate_text(
        (
            "你是课程测验判题助手。请根据题目、学生答案、参考答案和解析判断学生回答质量。"
            "不要自动加入错题本，只输出给学生看的判定和建议。"
            "请用简体中文，格式为 Markdown，包含：判定、得分建议、问题分析、下一步复习建议。"
        ),
        (
            f"题目：{question.content}\n"
            f"学生答案：{payload.student_answer}\n"
            f"参考答案：{question.correct_answer or '未提供'}\n"
            f"解析：{question.explanation or '未提供'}"
        ),
    )
    expected = (question.correct_answer or "").strip()
    actual = payload.student_answer.strip()
    is_exact = bool(expected and actual == expected)
    answer_record = AnswerRecord(
        user_id=payload.user_id,
        course_id=payload.course_id,
        question_id=payload.question_id,
        student_answer=payload.student_answer,
        is_correct=is_exact,
        score=100 if is_exact else 60,
        ai_feedback=result,
    )
    db.add(answer_record)
    course.mastery = max(0, min(100, course.mastery + (2 if is_exact else 0)))
    course.progress = max(course.progress, 10)
    db.commit()
    db.refresh(answer_record)
    return {
        "answer_record_id": answer_record.id,
        "is_exact": is_exact,
        "score": answer_record.score,
        "analysis": result,
    }


@router.get("/api/quiz/answer-records")
def list_quiz_answer_records(user_id: int = 1, course_id: int | None = None, db: Session = Depends(get_db)) -> list[dict[str, object]]:
    query = select(AnswerRecord, Question).join(Question, AnswerRecord.question_id == Question.id).where(AnswerRecord.user_id == user_id)
    if course_id is not None:
        require_course(db, course_id, user_id)
        query = query.where(AnswerRecord.course_id == course_id)
    rows = db.execute(query.order_by(AnswerRecord.id.desc()).limit(50)).all()
    return [
        {
            "id": answer.id,
            "course_id": answer.course_id,
            "question_id": answer.question_id,
            "question": normalize_math_delimiters(question.content or ""),
            "student_answer": normalize_math_delimiters(answer.student_answer or ""),
            "is_correct": answer.is_correct,
            "score": answer.score,
            "ai_feedback": normalize_math_delimiters(answer.ai_feedback or ""),
            "correct_answer": normalize_math_delimiters(question.correct_answer or ""),
            "explanation": normalize_math_delimiters(question.explanation or ""),
            "answered_at": answer.answered_at,
        }
        for answer, question in rows
    ]
