import os
from datetime import datetime, timedelta
from pathlib import Path
import sys


os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.routes.quizzes import parse_quiz_questions  # noqa: E402
from app.ai_service import normalize_math_delimiters  # noqa: E402
from app.database import Base, engine  # noqa: E402
from app.api.routes.chat import list_chat_messages  # noqa: E402
from app.api.routes import learning as learning_routes  # noqa: E402
from app.api.routes.learning import build_daily_plan, get_course_diagnosis, get_course_profile, list_course_learning_history  # noqa: E402
from app.services.application_service import normalize_legacy_demo_course_metrics, to_course_out  # noqa: E402
from app.models import AnswerRecord, ChatMessage, ChatSession, CourseModel, LearningCheckin, LearningSuggestion, MistakeRecord, Question, User  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402


def test_parse_quiz_questions_keeps_multiline_fields_without_blank_lines():
    result = """### 第1题
Q: 什么是系统调用？
A: 用户程序请求内核服务的受控接口。
E: 它让用户态程序通过受控入口切换到内核态。
检测点: 用户态与内核态
### 第2题
题目：文件系统的作用是什么？
参考答案：管理持久化数据与目录结构。
解析：文件系统负责命名、组织、读取和写入文件。
第二行解析也必须保留。"""

    assert parse_quiz_questions(result) == [
        (
            "什么是系统调用？",
            "用户程序请求内核服务的受控接口。",
            "它让用户态程序通过受控入口切换到内核态。",
        ),
        (
            "文件系统的作用是什么？",
            "管理持久化数据与目录结构。",
            "文件系统负责命名、组织、读取和写入文件。\n第二行解析也必须保留。",
        ),
    ]


def test_normalize_math_delimiters_supports_legacy_inline_and_block_latex():
    result = r"行内：\( \mathbf{A} \)。\n块：\[ c_{ij} = \sum_{k=1}^{n} a_{ik}b_{kj} \]"

    assert normalize_math_delimiters(result) == "行内：$\\mathbf{A}$。\\n块：$$\nc_{ij} = \\sum_{k=1}^{n} a_{ik}b_{kj}\n$$"


def test_normalize_math_delimiters_unescapes_model_latex_commands():
    result = r"$\\mathbf{A} \\times \\mathbf{B}$"

    assert normalize_math_delimiters(result) == r"$\mathbf{A} \times \mathbf{B}$"


def test_chat_messages_return_newest_answer_first():
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        user = User(username="quiz-parser-user", password_hash="demo")
        db.add(user)
        db.flush()
        course = CourseModel(user_id=user.id, name="测试课程")
        db.add(course)
        db.flush()
        session = ChatSession(user_id=user.id, course_id=course.id, title="测试对话")
        db.add(session)
        db.flush()
        base_time = datetime(2026, 7, 10, 12, 0, 0)
        db.add_all(
            [
                ChatMessage(user_id=user.id, course_id=course.id, session_id=session.id, role="user", content="先问", created_at=base_time),
                ChatMessage(user_id=user.id, course_id=course.id, session_id=session.id, role="assistant", content="先答", created_at=base_time + timedelta(seconds=1)),
                ChatMessage(user_id=user.id, course_id=course.id, session_id=session.id, role="user", content="后问", created_at=base_time + timedelta(seconds=2)),
                ChatMessage(user_id=user.id, course_id=course.id, session_id=session.id, role="assistant", content="后答", created_at=base_time + timedelta(seconds=3)),
            ]
        )
        db.commit()

        messages = list_chat_messages(user.id, course.id, session.id, db)

    assert [message.content for message in messages] == ["后答", "后问", "先答", "先问"]


def test_diagnosis_and_profile_are_evidence_based():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        user = User(username="diagnosis-user", password_hash="demo")
        db.add(user)
        db.flush()
        course = CourseModel(user_id=user.id, name="诊断课程", progress=20, mastery=55)
        db.add(course)
        db.flush()
        question = Question(course_id=course.id, content="测试题", correct_answer="答案")
        db.add(question)
        db.flush()
        db.add_all(
            [
                AnswerRecord(user_id=user.id, course_id=course.id, question_id=question.id, student_answer="错误", is_correct=False, score=40),
                LearningCheckin(user_id=user.id, course_id=course.id, study_date="2026-07-10", status="stuck", minutes=15),
                LearningCheckin(user_id=user.id, course_id=course.id, study_date="2026-07-11", status="studying", minutes=20),
                MistakeRecord(user_id=user.id, course_id=course.id, mistake_type="quiz_wrong", review_status="unreviewed"),
            ]
        )
        db.commit()

        diagnosis = get_course_diagnosis(course.id, user.id, db)
        profile = get_course_profile(course.id, user.id, db)

    assert diagnosis["confidence"]["level"] == "medium"
    assert any(item["label"] == "测验表现" and item["value"] == 40 for item in diagnosis["items"])
    assert any(action["title"] == "优先修复基础题" for action in diagnosis["actions"])
    assert any(item["name"] == "练习表现" and item["value"] == 40 for item in profile["radar"])


def test_learning_history_groups_plans_and_all_daily_feedback():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        user = User(username="history-user", password_hash="demo")
        db.add(user)
        db.flush()
        course = CourseModel(user_id=user.id, name="历史记录课程")
        db.add(course)
        db.flush()
        first_plan = LearningSuggestion(user_id=user.id, course_id=course.id, title="每日学习计划 2026-07-10", content="复习矩阵乘法")
        second_plan = LearningSuggestion(user_id=user.id, course_id=course.id, title="每日学习计划 2026-07-11", content="完成线性变换练习")
        db.add_all([first_plan, second_plan])
        db.flush()
        db.add_all(
            [
                LearningCheckin(user_id=user.id, course_id=course.id, plan_id=first_plan.id, study_date="2026-07-10", status="completed", minutes=25, difficulty="hard", feedback="矩阵题需要继续练", created_at=datetime(2026, 7, 10, 20, 0)),
                LearningCheckin(user_id=user.id, course_id=course.id, plan_id=second_plan.id, study_date="2026-07-11", status="completed", minutes=30, difficulty="normal", feedback="完成第一轮练习", created_at=datetime(2026, 7, 11, 19, 0)),
                LearningCheckin(user_id=user.id, course_id=course.id, plan_id=second_plan.id, study_date="2026-07-11", status="completed", minutes=15, difficulty="easy", feedback="补做两道题", created_at=datetime(2026, 7, 11, 20, 0)),
                LearningCheckin(user_id=user.id, course_id=course.id, plan_id=second_plan.id, study_date="2026-07-11", status="studying", minutes=10, difficulty="normal", feedback="未完成", created_at=datetime(2026, 7, 11, 18, 0)),
            ]
        )
        db.commit()

        history = list_course_learning_history(course.id, user.id, db)

    assert [record["study_date"] for record in history] == ["2026-07-11", "2026-07-10"]
    assert history[0]["minutes"] == 55
    assert history[0]["checkin_count"] == 3
    assert history[0]["feedback"] == "补做两道题"
    assert history[0]["plan"] == "完成线性变换练习"
    assert history[0]["latest_status"] == "completed"
    assert [item["feedback"] for item in history[0]["feedbacks"]] == ["补做两道题", "完成第一轮练习", "未完成"]


def test_daily_plan_continues_previous_date_plan(monkeypatch):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    prompts: list[str] = []

    def fake_generate_text(_system_prompt: str, user_prompt: str) -> str:
        prompts.append(user_prompt)
        return "承接昨日任务并完成今日练习"

    monkeypatch.setattr(learning_routes.ai_service, "generate_text", fake_generate_text)
    with Session(engine) as db:
        user = User(username="daily-plan-user", password_hash="demo")
        db.add(user)
        db.flush()
        course = CourseModel(user_id=user.id, name="日期计划课程")
        db.add(course)
        db.flush()
        db.add_all(
            [
                LearningSuggestion(user_id=user.id, course_id=course.id, title="整体学习计划", content="两周完成课程"),
                LearningSuggestion(user_id=user.id, course_id=course.id, title="每日学习计划 2026-07-14", content="完成第一章并留下两道练习"),
                LearningCheckin(user_id=user.id, course_id=course.id, study_date="2026-07-14", status="stuck", minutes=30, difficulty="hard", feedback="两道练习没有做完"),
            ]
        )
        db.flush()

        plan = build_daily_plan(db, user.id, course.id, "2026-07-15")

    assert plan.title == "每日学习计划 2026-07-15"
    assert plan.content == "承接昨日任务并完成今日练习"
    assert "完成第一章并留下两道练习" in prompts[0]
    assert "两道练习没有做完" in prompts[0]


def test_daily_plan_feedback_adjusts_current_date_plan(monkeypatch):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    prompts: list[str] = []

    monkeypatch.setattr(
        learning_routes.ai_service,
        "generate_text",
        lambda _system_prompt, user_prompt: prompts.append(user_prompt) or "减少任务后继续学习",
    )
    with Session(engine) as db:
        user = User(username="daily-feedback-user", password_hash="demo")
        db.add(user)
        db.flush()
        course = CourseModel(user_id=user.id, name="反馈调整课程")
        db.add(course)
        db.flush()
        current = LearningSuggestion(
            user_id=user.id,
            course_id=course.id,
            title="每日学习计划 2026-07-15",
            content="先完成三道进程调度题",
        )
        db.add(current)
        db.flush()

        adjusted = build_daily_plan(db, user.id, course.id, "2026-07-15", "时间不足，只完成了一道")

    assert adjusted.id == current.id
    assert adjusted.content == "减少任务后继续学习"
    assert "先完成三道进程调度题" in prompts[0]
    assert "时间不足，只完成了一道" in prompts[0]


def test_legacy_demo_metrics_are_cleared_until_learning_evidence_exists():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        user = User(id=1, username="demo", password_hash="demo")
        db.add(user)
        db.flush()
        course = CourseModel(user_id=user.id, name="操作系统原理", progress=68, mastery=61)
        db.add(course)
        db.commit()

        normalize_legacy_demo_course_metrics(db)
        db.refresh(course)
        response = to_course_out(db, course)

    assert (course.progress, course.mastery) == (0, 0)
    assert response.has_progress_evidence is False
    assert response.has_mastery_evidence is False
