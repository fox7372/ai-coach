from fastapi import APIRouter

from app.runtime import *
from app.schemas import *
from app.services import *

router = APIRouter()

@router.post("/auth/register", response_model=AuthResponse)
def register(payload: AuthRequest, db: Session = Depends(get_db)) -> AuthResponse:
    username = payload.username.strip()
    password = payload.password.strip()
    nickname = payload.nickname.strip() if payload.nickname else username

    if len(username) < 3:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="账号至少需要 3 个字符")
    if len(password) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="密码至少需要 6 个字符")

    exists = db.scalar(select(User).where(User.username == username))
    if exists is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="账号已存在")

    user = User(username=username, password_hash=hash_password(password), nickname=nickname)
    db.add(user)
    db.commit()
    db.refresh(user)

    return AuthResponse(user=to_user_out(user), message="注册成功")


@router.post("/auth/login", response_model=AuthResponse)
def login(payload: AuthRequest, db: Session = Depends(get_db)) -> AuthResponse:
    username = payload.username.strip()
    password_hash = hash_password(payload.password.strip())

    user = db.scalar(select(User).where(User.username == username))
    if user is None or user.password_hash != password_hash:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="账号或密码错误")

    return AuthResponse(user=to_user_out(user), message="登录成功")


@router.get("/courses", response_model=list[CourseOut])
def list_courses(db: Session = Depends(get_db)) -> list[CourseOut]:
    courses = db.scalars(select(CourseModel).order_by(CourseModel.id)).all()
    return [to_course_out(db, course) for course in courses]


@router.post("/courses", response_model=CourseOut)
def create_course(payload: CourseCreate, db: Session = Depends(get_db)) -> CourseOut:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="课程名称不能为空")

    existing = db.scalar(
        select(CourseModel).where(
            CourseModel.user_id == payload.user_id,
            CourseModel.name == name,
        )
    )
    if existing is not None:
        return to_course_out(db, existing)

    course = CourseModel(
        user_id=payload.user_id,
        name=name,
        description=payload.description or "由上传资料自动创建",
        progress=0,
        mastery=0,
    )
    db.add(course)
    db.commit()
    db.refresh(course)

    return to_course_out(db, course)


@router.post("/api/ai/recommend-course-resources", response_model=CourseResourceRecommendResponse)
def recommend_course_resources(payload: CourseResourceRecommendRequest) -> CourseResourceRecommendResponse:
    course_name = payload.course_name.strip()
    if not course_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="课程名称不能为空")

    is_cs_course = is_computer_science_course(course_name, payload.learning_goal)
    result = ai_service.generate_text(
        (
            "你是学习资料规划助手。请根据课程名称和学习目标，为学生列出后续应该加入平台的资料。"
            "不要编造确定存在的下载链接，不要声称平台已经拥有这些资料。"
            "如果能确定官网、课程主页或公开课页面，可以给 url；不确定就留空 url。"
            "如果是计算机相关课程，优先参考 CS 自学指南：https://csdiy.wiki/，可以把它作为课程资料入口。"
            "只输出 JSON，不要 Markdown，不要代码块。"
            "JSON 格式：{\"summary\":\"一句话说明\",\"resources\":[{\"title\":\"资料名称\",\"resource_type\":\"教材/讲义/视频/网页/习题/项目\",\"reason\":\"为什么需要\",\"keyword\":\"建议搜索关键词\",\"url\":\"可核对网址或空字符串\"}]}"
            "resources 数量 4 到 6 个，名称要具体，适合学生后续上传 PDF、导入网页或视频。"
        ),
        (
            f"课程名称：{course_name}\n"
            f"学习目标：{payload.learning_goal.strip() if payload.learning_goal else '未填写，请按入门到测验的 MVP 学习场景规划。'}\n"
            f"是否计算机相关课程：{'是' if is_cs_course else '否'}"
        ),
    )
    summary, resources = parse_recommended_resources(result, course_name)
    if is_cs_course:
        resources = add_cs_diy_resource(resources)
    return CourseResourceRecommendResponse(course_name=course_name, summary=summary, resources=resources)


@router.delete("/courses/{course_id}")
def delete_course(course_id: int, db: Session = Depends(get_db)) -> dict[str, object]:
    course = db.scalar(select(CourseModel).where(CourseModel.id == course_id))
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课程不存在")

    documents = db.scalars(select(Document).where(Document.course_id == course_id)).all()
    deleted_files = 0
    for document in documents:
        try:
            rag_service.delete_document(document.id)
        except Exception:
            pass
        if delete_uploaded_file(document.storage_path):
            deleted_files += 1

    db.execute(delete(DocumentChunk).where(DocumentChunk.course_id == course_id))
    db.execute(delete(MistakeRecord).where(MistakeRecord.course_id == course_id))
    db.execute(delete(AnswerRecord).where(AnswerRecord.course_id == course_id))
    db.execute(delete(ChatMessage).where(ChatMessage.course_id == course_id))
    db.execute(delete(ChatSession).where(ChatSession.course_id == course_id))
    db.execute(delete(MasteryRecord).where(MasteryRecord.course_id == course_id))
    db.execute(delete(LearningCheckin).where(LearningCheckin.course_id == course_id))
    db.execute(delete(LearningSuggestion).where(LearningSuggestion.course_id == course_id))
    db.execute(delete(KnowledgePoint).where(KnowledgePoint.course_id == course_id))
    db.execute(delete(Question).where(Question.course_id == course_id))
    db.execute(delete(Document).where(Document.course_id == course_id))

    db.delete(course)
    db.commit()
    return {
        "status": "deleted",
        "course_id": course_id,
        "deleted_documents": len(documents),
        "deleted_files": deleted_files,
    }
