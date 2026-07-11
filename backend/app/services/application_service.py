from hashlib import sha256
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.database import engine
from app.models import AnswerRecord, ChatSession, CourseModel, LearningCheckin, MistakeRecord, User
from app.runtime import ROOT_DIR, UPLOAD_DIR
from app.schemas import CourseOut, UserOut

def hash_password(password: str) -> str:
    return sha256(password.encode("utf-8")).hexdigest()


def to_user_out(user: User) -> UserOut:
    return UserOut(id=user.id, username=user.username, nickname=user.nickname)


def course_metric_evidence(db: Session, course: CourseModel) -> tuple[bool, bool]:
    has_answers = db.scalar(
        select(AnswerRecord.id)
        .where(AnswerRecord.user_id == course.user_id, AnswerRecord.course_id == course.id)
        .limit(1)
    ) is not None
    has_checkins = db.scalar(
        select(LearningCheckin.id)
        .where(LearningCheckin.user_id == course.user_id, LearningCheckin.course_id == course.id)
        .limit(1)
    ) is not None
    has_mistakes = db.scalar(
        select(MistakeRecord.id)
        .where(MistakeRecord.user_id == course.user_id, MistakeRecord.course_id == course.id)
        .limit(1)
    ) is not None
    return has_answers or has_checkins, has_answers or has_checkins or has_mistakes


def to_course_out(db: Session, course: CourseModel) -> CourseOut:
    has_progress_evidence, has_mastery_evidence = course_metric_evidence(db, course)
    return CourseOut(
        id=course.id,
        name=course.name,
        description=course.description,
        progress=course.progress,
        mastery=course.mastery,
        has_progress_evidence=has_progress_evidence,
        has_mastery_evidence=has_mastery_evidence,
    )


def seed_demo_data(db: Session) -> None:
    user = db.scalar(select(User).where(User.username == "demo"))
    if user is None:
        db.add(User(id=1, username="demo", password_hash=hash_password("demo123"), nickname="演示学生"))
    else:
        user.password_hash = hash_password("demo123")
        user.nickname = "演示学生"

    if db.scalar(select(CourseModel.id).limit(1)) is not None:
        db.commit()
        return

    demo_courses = [
        (1, "操作系统原理", "虚拟内存、进程管理与文件系统", 0, 0),
        (2, "数据结构", "线性表、树、图和查找排序", 0, 0),
        (3, "高等数学", "极限、积分、多元函数与微分方程", 0, 0),
    ]
    for course_id, name, description, progress, mastery in demo_courses:
        course = db.scalar(select(CourseModel).where(CourseModel.id == course_id))
        if course is None:
            db.add(CourseModel(id=course_id, user_id=1, name=name, description=description, progress=progress, mastery=mastery))
        else:
            course.name = name
            course.description = description
            course.progress = progress
            course.mastery = mastery

    db.commit()


def normalize_legacy_demo_course_metrics(db: Session) -> None:
    legacy_metrics = {
        "操作系统原理": (68, 61),
        "数据结构": (82, 76),
        "高等数学": (47, 58),
    }
    changed = False
    for name, (progress, mastery) in legacy_metrics.items():
        course = db.scalar(
            select(CourseModel).where(
                CourseModel.user_id == 1,
                CourseModel.name == name,
                CourseModel.progress == progress,
                CourseModel.mastery == mastery,
            )
        )
        if course is None:
            continue
        _, has_mastery_evidence = course_metric_evidence(db, course)
        if not has_mastery_evidence:
            course.progress = 0
            course.mastery = 0
            changed = True
    if changed:
        db.commit()


def write_env_value(key: str, value: str) -> None:
    env_path = ROOT_DIR / ".env"
    lines: list[str] = []
    if env_path.exists():
      lines = env_path.read_text(encoding="utf-8-sig").splitlines()

    updated = False
    output: list[str] = []
    for line in lines:
        if line.startswith(f"{key}="):
            output.append(f"{key}={value}")
            updated = True
        else:
            output.append(line)

    if not updated:
        output.append(f"{key}={value}")

    env_path.write_text("\n".join(output) + "\n", encoding="utf-8")


def remove_env_values(keys: set[str]) -> None:
    env_path = ROOT_DIR / ".env"
    if not env_path.exists():
        return

    lines = env_path.read_text(encoding="utf-8-sig").splitlines()
    output = [line for line in lines if not any(line.startswith(f"{key}=") for key in keys)]
    env_path.write_text("\n".join(output) + ("\n" if output else ""), encoding="utf-8")


def delete_uploaded_file(storage_path: str) -> bool:
    """Delete an uploaded file only when it is inside the managed uploads folder."""
    try:
        target = Path(storage_path).resolve()
        uploads_root = UPLOAD_DIR.resolve()
        if target.is_file() and target.is_relative_to(uploads_root):
            target.unlink()
            return True
    except OSError:
        return False

    return False


def save_mistake_image(file: UploadFile, user_id: int, course_id: int) -> Path:
    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请上传图片文件")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}:
        suffix = ".png"

    image_dir = UPLOAD_DIR / "mistake-images" / str(user_id) / str(course_id)
    image_dir.mkdir(parents=True, exist_ok=True)
    target = image_dir / f"{uuid4().hex}{suffix}"
    with target.open("wb") as output:
        while chunk := file.file.read(1024 * 1024):
            output.write(chunk)
    return target


def extract_text_from_image(image_path: Path) -> tuple[str, str]:
    try:
        from paddleocr import PaddleOCR  # type: ignore

        ocr = PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)
        result = ocr.ocr(str(image_path), cls=True)
        lines: list[str] = []
        for page in result or []:
            for item in page or []:
                if len(item) >= 2 and item[1]:
                    lines.append(str(item[1][0]))
        text_value = "\n".join(line.strip() for line in lines if line.strip())
        if text_value:
            return text_value, "paddleocr"
    except Exception:
        pass

    try:
        import pytesseract  # type: ignore
        from PIL import Image  # type: ignore

        text_value = pytesseract.image_to_string(Image.open(image_path), lang="chi_sim+eng")
        text_value = text_value.strip()
        if text_value:
            return text_value, "tesseract"
    except Exception:
        pass

    return "", "manual"


def ensure_chat_schema() -> None:
    with engine.begin() as connection:
        columns = {
            row[0]
            for row in connection.execute(
                text(
                    """
                    SELECT COLUMN_NAME
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = 'chat_messages'
                    """
                )
            )
        }
        if "session_id" not in columns:
            connection.execute(text("ALTER TABLE chat_messages ADD COLUMN session_id INT NULL"))


def ensure_resource_schema() -> None:
    table_columns: dict[str, dict[str, str]] = {
        "documents": {
            "source_type": "VARCHAR(50) NULL",
            "source_url": "TEXT NULL",
            "platform": "VARCHAR(50) NULL",
            "external_id": "VARCHAR(255) NULL",
            "author": "VARCHAR(255) NULL",
            "duration_seconds": "FLOAT NULL",
            "thumbnail_url": "TEXT NULL",
            "language": "VARCHAR(50) NULL",
            "subtitle_type": "VARCHAR(50) NULL",
            "status": "VARCHAR(30) NULL DEFAULT 'uploaded'",
            "progress_stage": "VARCHAR(60) NULL",
            "priority": "INT NOT NULL DEFAULT 3",
            "error_message": "TEXT NULL",
            "raw_content": "LONGTEXT NULL",
        },
        "document_chunks": {
            "start_time": "FLOAT NULL",
            "end_time": "FLOAT NULL",
            "section_title": "VARCHAR(255) NULL",
            "source_url": "TEXT NULL",
            "metadata_json": "TEXT NULL",
            "token_count": "INT NOT NULL DEFAULT 0",
        },
        "knowledge_points": {
            "source_document": "VARCHAR(255) NULL",
            "source_page": "INT NULL",
            "source_excerpt": "TEXT NULL",
            "confidence": "INT NOT NULL DEFAULT 50",
        },
        "answer_records": {
            "ai_feedback": "TEXT NULL",
        },
        "mistake_records": {
            "image_path": "TEXT NULL",
            "ocr_text": "LONGTEXT NULL",
        },
    }
    with engine.begin() as connection:
        for table_name, columns_to_add in table_columns.items():
            existing_columns = {
                row[0]
                for row in connection.execute(
                    text(
                        """
                        SELECT COLUMN_NAME
                        FROM INFORMATION_SCHEMA.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE()
                          AND TABLE_NAME = :table_name
                        """
                    ),
                    {"table_name": table_name},
                )
            }
            for column_name, column_type in columns_to_add.items():
                if column_name not in existing_columns:
                    connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))

        if connection.dialect.name == "mysql":
            raw_content_type = connection.execute(
                text(
                    """
                    SELECT DATA_TYPE
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = 'documents'
                      AND COLUMN_NAME = 'raw_content'
                    """
                )
            ).scalar_one_or_none()
            if raw_content_type and raw_content_type.lower() != "longtext":
                connection.execute(text("ALTER TABLE documents MODIFY COLUMN raw_content LONGTEXT NULL"))


def require_course(db: Session, course_id: int, user_id: int | None = None) -> CourseModel:
    if user_id is None:
        course = db.scalar(select(CourseModel).where(CourseModel.id == course_id))
    else:
        course = db.scalar(select(CourseModel).where(CourseModel.id == course_id, CourseModel.user_id == user_id))
    if course is None:
        detail = "课程不存在或不属于当前用户" if user_id is not None else "课程不存在"
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return course


def ensure_default_chat_session(db: Session, user_id: int, course_id: int) -> ChatSession:
    require_course(db, course_id, user_id)

    session = db.scalar(
        select(ChatSession)
        .where(ChatSession.user_id == user_id, ChatSession.course_id == course_id)
        .order_by(ChatSession.id)
    )
    if session is None:
        session = ChatSession(user_id=user_id, course_id=course_id, title="默认对话")
        db.add(session)
        db.flush()

    db.execute(
        text(
            """
            UPDATE chat_messages
            SET session_id = :session_id
            WHERE user_id = :user_id
              AND course_id = :course_id
              AND session_id IS NULL
            """
        ),
        {"session_id": session.id, "user_id": user_id, "course_id": course_id},
    )
    return session
