import html
import ipaddress
import json
import math
import re
import socket
from hashlib import md5, sha256
from datetime import date
from pathlib import Path
from typing import Literal
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse
from urllib.request import Request, urlopen
from uuid import uuid4

from fastapi.responses import JSONResponse
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app.ai_service import AIService
from app.database import Base, SessionLocal, engine, get_db, settings
from app.models import (
    AnswerRecord,
    ChatMessage,
    ChatSession,
    CourseModel,
    Document,
    DocumentChunk,
    KnowledgePoint,
    LearningCheckin,
    LearningSuggestion,
    MasteryRecord,
    MistakeRecord,
    Question,
    User,
)


ROOT_DIR = Path(__file__).resolve().parents[1]
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


class Utf8JSONResponse(JSONResponse):
    media_type = "application/json; charset=utf-8"

    def render(self, content: object) -> bytes:
        import json

        return json.dumps(
            jsonable_encoder(content),
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")


app = FastAPI(title="AI Learning Diagnosis API", version="0.1.0", default_response_class=Utf8JSONResponse)
ai_service = AIService()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class UserOut(BaseModel):
    id: int
    username: str
    nickname: str | None


class AuthRequest(BaseModel):
    username: str
    password: str
    nickname: str | None = None


class AuthResponse(BaseModel):
    user: UserOut
    message: str


class CourseOut(BaseModel):
    id: int
    name: str
    description: str | None
    progress: int
    mastery: int


class CourseCreate(BaseModel):
    user_id: int = 1
    name: str
    description: str | None = None


class AskRequest(BaseModel):
    question: str
    course_id: int = 1
    user_id: int = 1
    session_id: int | None = None


class AskResponse(BaseModel):
    answer: str
    references: list[str]
    provider: str
    user_message_id: int
    assistant_message_id: int


class ChatMessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: str


class ChatSessionOut(BaseModel):
    id: int
    title: str
    course_id: int
    created_at: str
    updated_at: str


class ChatSessionCreate(BaseModel):
    user_id: int = 1
    course_id: int = 1
    title: str | None = None


class AIChatRequest(BaseModel):
    user_id: int = 1
    course_id: int = 1
    session_id: int | None = None
    message: str


class CourseTaskRequest(BaseModel):
    user_id: int = 1
    course_id: int = 1
    document_id: int | None = None
    text: str | None = None


class QuizGenerateRequest(CourseTaskRequest):
    count: int = 5


class MistakeAnalyzeRequest(BaseModel):
    user_id: int = 1
    course_id: int = 1
    question_id: int | None = None
    question: str
    student_answer: str
    correct_answer: str | None = None


class QuizSubmitRequest(BaseModel):
    user_id: int = 1
    course_id: int = 1
    question_id: int
    student_answer: str


class DailyPlanRequest(BaseModel):
    user_id: int = 1
    course_id: int = 1
    study_date: str | None = None


class LearningCheckinRequest(BaseModel):
    user_id: int = 1
    course_id: int = 1
    plan_id: int | None = None
    study_date: str | None = None
    status: Literal["not_started", "studying", "completed", "stuck"] = "studying"
    minutes: int = 0
    difficulty: Literal["easy", "normal", "hard"] = "normal"
    feedback: str


class VideoPreviewRequest(BaseModel):
    url: str


class VideoResourceCreate(BaseModel):
    url: str
    preferred_language: str = "zh"
    allow_transcription: bool = False
    priority: int = 3


class VideoBatchResourceCreate(BaseModel):
    urls: list[str]
    preferred_language: str = "zh"
    allow_transcription: bool = False
    priority: int = 3


class WebExtractRequest(BaseModel):
    url: str


class WebResourceCreate(BaseModel):
    url: str
    priority: int = 3


class ResourceOut(BaseModel):
    id: int
    course_id: int
    title: str
    source_type: str | None = None
    source_url: str | None = None
    platform: str | None = None
    author: str | None = None
    duration_seconds: float | None = None
    thumbnail_url: str | None = None
    language: str | None = None
    subtitle_type: str | None = None
    status: str | None = None
    progress_stage: str | None = None
    priority: int = 3
    error_message: str | None = None
    chunk_count: int = 0


def build_references(db: Session, course_id: int) -> list[str]:
    course = db.scalar(select(CourseModel).where(CourseModel.id == course_id))
    documents = db.scalars(select(Document).where(Document.course_id == course_id).order_by(Document.id.desc())).all()
    references: list[str] = []

    if course is not None:
        references.append(f"课程：{course.name}")

    if documents:
        for index, document in enumerate(documents[:3], start=1):
            references.append(f"资料 {index}：{document.filename}（当前 MVP 已保存文件，暂未解析到页码）")
    else:
        references.append("暂无上传资料：本次回答主要来自大模型通用知识，建议上传课程 PDF 后再核对。")

    references.append("后续 RAG 完成 document_chunks 后，将精确显示页码、段落和原文片段。")
    return references


def get_course_context(db: Session, course_id: int, fallback_text: str | None = None) -> str:
    chunks = db.scalars(
        select(DocumentChunk)
        .where(DocumentChunk.course_id == course_id)
        .order_by(DocumentChunk.chunk_index)
        .limit(8)
    ).all()
    if chunks:
        return "\n\n".join(chunk.chunk_text for chunk in chunks)

    documents = db.scalars(select(Document).where(Document.course_id == course_id).order_by(Document.id.desc())).all()
    document_names = "、".join(document.filename for document in documents[:5])
    if fallback_text:
        return fallback_text
    if document_names:
        return f"已上传资料：{document_names}。当前 MVP 尚未解析 PDF 原文，请基于课程主题生成初步内容。"
    return "当前课程暂无上传资料，请基于课程名称生成初步内容。"


def get_course_name(db: Session, course_id: int) -> str:
    course = db.scalar(select(CourseModel).where(CourseModel.id == course_id))
    return course.name if course else f"课程 {course_id}"


def validate_public_url(url: str) -> str:
    clean_url = url.strip()
    if len(clean_url) > 2048:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="链接过长")

    parsed = urlparse(clean_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只支持公开 http/https 链接")

    host = parsed.hostname.lower()
    if host in {"localhost", "127.0.0.1", "0.0.0.0"} or host.endswith(".local"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不允许导入本机或内网链接")

    try:
        infos = socket.getaddrinfo(host, None)
        for info in infos:
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不允许导入内网、保留地址或本机地址")
    except HTTPException:
        raise
    except OSError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"链接域名无法解析：{exc}") from exc

    return clean_url


def detect_video_platform(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    if "youtube.com" in host or "youtu.be" in host:
        return "youtube"
    if "bilibili.com" in host or "b23.tv" in host:
        return "bilibili"
    return "web_video"


def normalize_video_url(url: str) -> str:
    clean_url = validate_public_url(url)
    parsed = urlparse(clean_url)
    host = (parsed.hostname or "").lower()
    if "bilibili.com" in host:
        match = re.search(r"/video/(BV[\w]+)", parsed.path)
        if match:
            return f"{parsed.scheme}://{parsed.netloc}/video/{match.group(1)}/"
    if "youtu.be" in host or "youtube.com" in host:
        return clean_url
    return clean_url


def build_timestamp_url(source_url: str | None, start_time: float | None) -> str | None:
    if not source_url or start_time is None:
        return source_url
    seconds = max(0, int(start_time))
    parsed = urlparse(source_url)
    host = (parsed.hostname or "").lower()
    if "youtube.com" in host or "youtu.be" in host:
        query = parse_qs(parsed.query)
        query["t"] = [f"{seconds}s"]
        return urlunparse(parsed._replace(query=urlencode(query, doseq=True)))
    if "bilibili.com" in host or "b23.tv" in host:
        query = parse_qs(parsed.query)
        query["t"] = [str(seconds)]
        return urlunparse(parsed._replace(query=urlencode(query, doseq=True)))
    return f"{source_url}#t={seconds}"


def format_time(seconds: float | None) -> str:
    if seconds is None:
        return "未知时间"
    total = max(0, int(seconds))
    minutes, sec = divmod(total, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{sec:02d}"
    return f"{minutes:02d}:{sec:02d}"


def make_embedding(text_value: str, dimensions: int = 96) -> list[float]:
    vector = [0.0] * dimensions
    tokens = re.findall(r"[\w\u4e00-\u9fff]+", text_value.lower())
    if not tokens:
        tokens = list(text_value[:500])
    for token in tokens:
        digest = md5(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimensions
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign
    norm = math.sqrt(sum(item * item for item in vector)) or 1.0
    return [round(item / norm, 6) for item in vector]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right:
        return 0.0
    size = min(len(left), len(right))
    return sum(left[index] * right[index] for index in range(size))


def retrieve_relevant_chunks(db: Session, course_id: int, query: str, limit: int = 5) -> list[tuple[DocumentChunk, float]]:
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


def is_academic_knowledge_point(name: str, description: str) -> bool:
    text_value = f"{name} {description}"
    blocked_terms = [
        "课时",
        "上课",
        "地点",
        "成绩",
        "期末",
        "期中",
        "分数",
        "deadline",
        "ddl",
        "截止",
        "直播",
        "回看",
        "教科书",
        "参考资料",
        "实验须知",
        "课程安排",
        "课程时间",
    ]
    if any(term.lower() in text_value.lower() for term in blocked_terms):
        return False
    generic_names = {"知识点", "知识点名称", "核心概念", "概念"}
    return name.strip() not in generic_names and len(name.strip()) >= 2


def parse_knowledge_point_result(result: str) -> list[dict[str, str]]:
    try:
        parsed = json.loads(result)
    except json.JSONDecodeError:
        parsed = None
    if isinstance(parsed, list):
        items = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or item.get("知识点") or "").strip()
            description = str(item.get("description") or item.get("说明") or "").strip()
            if name and description and is_academic_knowledge_point(name, description):
                items.append({"name": name, "description": description})
        return items

    items = []
    for line in result.splitlines():
        clean = line.strip().lstrip("-0123456789.、 ")
        separator = "：" if "：" in clean else ":" if ":" in clean else ""
        if not clean or not separator:
            continue
        name, description = clean.split(separator, 1)
        name = name.strip()
        description = description.strip()
        if name and description and is_academic_knowledge_point(name, description):
            items.append({"name": name, "description": description})
    return items


def find_knowledge_support(name: str, chunks: list[DocumentChunk], fallback: DocumentChunk | None) -> tuple[DocumentChunk | None, str | None, bool]:
    lowered = name.lower()
    for chunk in chunks:
        text_value = chunk.chunk_text
        index = text_value.lower().find(lowered)
        if index >= 0:
            start = max(0, index - 80)
            end = min(len(text_value), index + 180)
            return chunk, compact_excerpt(text_value[start:end], 220), True
    if fallback is None:
        return None, None, False
    return fallback, compact_excerpt(fallback.chunk_text, 180), False


def appears_in_chunks(name: str, chunks: list[DocumentChunk]) -> bool:
    lowered = name.lower()
    return any(lowered in chunk.chunk_text.lower() for chunk in chunks)


def clean_subtitle_text(text_value: str) -> str:
    without_tags = re.sub(r"<[^>]+>", "", text_value)
    return re.sub(r"\s+", " ", html.unescape(without_tags)).strip()


def parse_timestamp(value: str) -> float:
    parts = value.replace(",", ".").split(":")
    if len(parts) == 3:
        hours, minutes, seconds = parts
    elif len(parts) == 2:
        hours, minutes, seconds = "0", parts[0], parts[1]
    else:
        return 0.0
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def parse_subtitle_segments(content: str) -> list[dict[str, object]]:
    normalized = content.replace("\ufeff", "").replace("\r\n", "\n").replace("\r", "\n")
    blocks = re.split(r"\n\s*\n", normalized)
    segments: list[dict[str, object]] = []
    time_pattern = re.compile(r"(?P<start>\d{1,2}:\d{2}(?::\d{2})?[\.,]\d{1,3})\s*-->\s*(?P<end>\d{1,2}:\d{2}(?::\d{2})?[\.,]\d{1,3})")
    for block in blocks:
        lines = [line.strip() for line in block.splitlines() if line.strip() and not line.strip().isdigit()]
        time_index = next((idx for idx, line in enumerate(lines) if "-->" in line), -1)
        if time_index < 0:
            continue
        match = time_pattern.search(lines[time_index])
        if not match:
            continue
        text_lines = [line for line in lines[time_index + 1:] if not line.startswith(("NOTE", "STYLE", "WEBVTT"))]
        segment_text = clean_subtitle_text(" ".join(text_lines))
        if segment_text:
            segments.append({"start": parse_timestamp(match.group("start")), "end": parse_timestamp(match.group("end")), "text": segment_text})
    return segments


def merge_segments_to_chunks(segments: list[dict[str, object]], target_chars: int = 800, max_seconds: int = 120) -> list[dict[str, object]]:
    chunks: list[dict[str, object]] = []
    current: list[dict[str, object]] = []
    for segment in segments:
        current.append(segment)
        start = float(current[0]["start"])
        end = float(current[-1]["end"])
        text_value = " ".join(str(item["text"]) for item in current)
        if len(text_value) >= target_chars or end - start >= max_seconds:
            chunks.append({"start": start, "end": end, "text": text_value})
            current = current[-1:]
    if current:
        chunks.append({"start": float(current[0]["start"]), "end": float(current[-1]["end"]), "text": " ".join(str(item["text"]) for item in current)})
    return chunks


def fetch_text_url(url: str) -> str:
    validate_public_url(url)
    request = Request(url, headers={"User-Agent": "AI-Learning-MVP/0.1"})
    with urlopen(request, timeout=20) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def fetch_webpage_html(url: str) -> str:
    clean_url = validate_public_url(url)
    request = Request(
        clean_url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; AI-Learning-MVP/0.1; +https://localhost)",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
    )
    with urlopen(request, timeout=25) as response:
        content_type = response.headers.get("Content-Type", "")
        if "text/html" not in content_type and "application/xhtml" not in content_type:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该链接不是 HTML 网页")
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def extract_webpage_content(url: str) -> dict[str, object]:
    html_content = fetch_webpage_html(url)
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html_content, flags=re.IGNORECASE | re.DOTALL)
    title = clean_subtitle_text(title_match.group(1)) if title_match else url

    without_noise = re.sub(r"<(script|style|noscript|svg|canvas)[^>]*>.*?</\1>", " ", html_content, flags=re.IGNORECASE | re.DOTALL)
    without_comments = re.sub(r"<!--.*?-->", " ", without_noise, flags=re.DOTALL)
    text_content = re.sub(r"</(p|div|section|article|li|h[1-6]|tr)>", "\n", without_comments, flags=re.IGNORECASE)
    text_content = re.sub(r"<[^>]+>", " ", text_content)
    text_content = html.unescape(text_content)
    lines = [re.sub(r"\s+", " ", line).strip() for line in text_content.splitlines()]
    lines = [line for line in lines if len(line) >= 2]
    body_text = "\n".join(lines)

    links = []
    parsed_base = urlparse(url)
    for href, label in re.findall(r"<a[^>]+href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", html_content, flags=re.IGNORECASE | re.DOTALL):
        label_text = clean_subtitle_text(label)
        if not label_text:
            continue
        if href.startswith("/"):
            href = f"{parsed_base.scheme}://{parsed_base.netloc}{href}"
        elif href.startswith("#"):
            href = f"{url.rstrip('/')}{href}"
        if href.startswith(("http://", "https://")):
            links.append({"title": label_text[:120], "url": href})
        if len(links) >= 30:
            break

    if len(body_text) < 100:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="网页正文太少，可能需要登录或由脚本动态加载")

    return {"title": title[:255], "text": body_text, "links": links}


def split_text_to_chunks(text_value: str, target_chars: int = 1200, overlap_chars: int = 120) -> list[str]:
    paragraphs = [item.strip() for item in re.split(r"\n{1,}", text_value) if item.strip()]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if len(current) + len(paragraph) + 1 > target_chars and current:
            chunks.append(current.strip())
            current = current[-overlap_chars:] if overlap_chars else ""
        current = f"{current}\n{paragraph}".strip()
    if current:
        chunks.append(current.strip())
    return chunks


def choose_subtitle_track(info: dict[str, object], preferred_language: str) -> tuple[str | None, str | None, str | None]:
    language_candidates = [preferred_language, "zh-CN", "zh-Hans", "zh", "en"]
    for subtitle_type, key in (("manual", "subtitles"), ("automatic", "automatic_captions")):
        tracks = info.get(key)
        if not isinstance(tracks, dict):
            continue
        for language in language_candidates:
            variants = tracks.get(language)
            if not isinstance(variants, list):
                continue
            selected = next((item for item in variants if item.get("ext") in {"vtt", "srt"} and item.get("url")), None)
            if selected:
                return str(selected["url"]), language, subtitle_type
    return None, None, None


def document_to_resource(db: Session, document: Document) -> ResourceOut:
    chunk_count = db.scalar(select(func.count()).select_from(DocumentChunk).where(DocumentChunk.document_id == document.id)) or 0
    return ResourceOut(
        id=document.id,
        course_id=document.course_id,
        title=document.filename,
        source_type=document.source_type or document.file_type,
        source_url=document.source_url,
        platform=document.platform,
        author=document.author,
        duration_seconds=document.duration_seconds,
        thumbnail_url=document.thumbnail_url,
        language=document.language,
        subtitle_type=document.subtitle_type,
        status=document.status or document.parse_status,
        progress_stage=document.progress_stage,
        priority=document.priority,
        error_message=document.error_message,
        chunk_count=int(chunk_count),
    )


def clean_error_message(exc: Exception) -> str:
    return re.sub(r"\x1b\[[0-9;]*m", "", str(exc)).strip()


class AIConfigOut(BaseModel):
    provider: str
    model: str
    base_url: str
    has_api_key: bool


class AIConfigUpdate(BaseModel):
    api_key: str
    base_url: str = "https://api.deepseek.com"
    model: str = "deepseek-chat"


class DiagnosisSignal(BaseModel):
    user_id: int = 1
    course_id: int = 1
    signal_type: Literal["student_question", "mistake", "not_understood", "quiz"]
    content: str


class MistakeCreate(BaseModel):
    user_id: int = 1
    course_id: int = 1
    question_id: int | None = None
    mistake_type: str = "concept_confusion"
    ai_analysis: str
    weak_points: str | None = None
    suggestion: str | None = None


def hash_password(password: str) -> str:
    return sha256(password.encode("utf-8")).hexdigest()


def to_user_out(user: User) -> UserOut:
    return UserOut(id=user.id, username=user.username, nickname=user.nickname)


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
        (1, "操作系统原理", "虚拟内存、进程管理与文件系统", 68, 61),
        (2, "数据结构", "线性表、树、图和查找排序", 82, 76),
        (3, "高等数学", "极限、积分、多元函数与微分方程", 47, 58),
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


def ensure_default_chat_session(db: Session, user_id: int, course_id: int) -> ChatSession:
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


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_chat_schema()
    ensure_resource_schema()
    with SessionLocal() as db:
        seed_demo_data(db)


@app.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, object]:
    db.execute(select(1))
    return {
        "status": "ok",
        "database": "connected",
        "ai_provider": "deepseek" if ai_service.enabled else "mock",
        "ai_model": settings.deepseek_model,
    }


@app.get("/settings/ai", response_model=AIConfigOut)
def get_ai_config() -> AIConfigOut:
    return AIConfigOut(
        provider="deepseek" if ai_service.enabled else "mock",
        model=settings.deepseek_model,
        base_url=settings.deepseek_base_url,
        has_api_key=bool(settings.deepseek_api_key),
    )


@app.post("/settings/ai", response_model=AIConfigOut)
def update_ai_config(payload: AIConfigUpdate) -> AIConfigOut:
    api_key = payload.api_key.strip()
    if not api_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="API Key 不能为空")

    settings.deepseek_api_key = api_key
    settings.deepseek_base_url = payload.base_url.strip() or "https://api.deepseek.com"
    settings.deepseek_model = payload.model.strip() or "deepseek-chat"

    write_env_value("DEEPSEEK_API_KEY", settings.deepseek_api_key)
    write_env_value("DEEPSEEK_BASE_URL", settings.deepseek_base_url)
    write_env_value("DEEPSEEK_MODEL", settings.deepseek_model)

    ai_service.reload()

    return AIConfigOut(
        provider="deepseek" if ai_service.enabled else "mock",
        model=settings.deepseek_model,
        base_url=settings.deepseek_base_url,
        has_api_key=bool(settings.deepseek_api_key),
    )


@app.post("/auth/register", response_model=AuthResponse)
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


@app.post("/auth/login", response_model=AuthResponse)
def login(payload: AuthRequest, db: Session = Depends(get_db)) -> AuthResponse:
    username = payload.username.strip()
    password_hash = hash_password(payload.password.strip())

    user = db.scalar(select(User).where(User.username == username))
    if user is None or user.password_hash != password_hash:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="账号或密码错误")

    return AuthResponse(user=to_user_out(user), message="登录成功")


@app.get("/courses", response_model=list[CourseOut])
def list_courses(db: Session = Depends(get_db)) -> list[CourseOut]:
    courses = db.scalars(select(CourseModel).order_by(CourseModel.id)).all()
    return [
        CourseOut(
            id=course.id,
            name=course.name,
            description=course.description,
            progress=course.progress,
            mastery=course.mastery,
        )
        for course in courses
    ]


@app.post("/courses", response_model=CourseOut)
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
        return CourseOut(
            id=existing.id,
            name=existing.name,
            description=existing.description,
            progress=existing.progress,
            mastery=existing.mastery,
        )

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

    return CourseOut(
        id=course.id,
        name=course.name,
        description=course.description,
        progress=course.progress,
        mastery=course.mastery,
    )


@app.delete("/courses/{course_id}")
def delete_course(course_id: int, db: Session = Depends(get_db)) -> dict[str, object]:
    course = db.scalar(select(CourseModel).where(CourseModel.id == course_id))
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课程不存在")

    documents = db.scalars(select(Document).where(Document.course_id == course_id)).all()
    deleted_files = 0
    for document in documents:
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


@app.post("/documents/upload")
async def upload_document(
    course_id: int = 1,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    suffix = Path(file.filename or "document.pdf").suffix or ".pdf"
    filename = file.filename or "document.pdf"
    exists = db.scalar(select(Document).where(Document.course_id == course_id, Document.filename == filename))
    if exists is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该课程已经上传过同名文件，请不要重复上传")

    document_id = str(uuid4())
    target = UPLOAD_DIR / f"{document_id}{suffix}"
    target.write_bytes(await file.read())

    document = Document(
        course_id=course_id,
        filename=filename,
        file_type=suffix.lstrip("."),
        storage_path=str(target),
        parse_status="processing",
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    return {
        "document_id": str(document.id),
        "filename": document.filename,
        "status": document.parse_status,
        "message": "文件已保存到数据库记录，下一步接入 PDF 解析、切块和 RAG 检索。",
    }


def extract_video_metadata(url: str) -> dict[str, object]:
    try:
        from yt_dlp import YoutubeDL
    except ImportError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="后端缺少 yt-dlp，请先安装 requirements.txt") from exc

    platform = detect_video_platform(url)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    if platform == "bilibili":
        headers["Referer"] = "https://www.bilibili.com/"
    options = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "extract_flat": False,
        "http_headers": headers,
        "socket_timeout": 20,
    }
    try:
        with YoutubeDL(options) as ydl:
            return ydl.extract_info(url, download=False)
    except Exception as exc:
        if platform == "bilibili":
            raise RuntimeError(
                "B 站公开视频元信息读取失败。常见原因是 B 站 412 风控、网络 TLS 中断、视频无公开字幕或需要登录。"
                f"原始错误：{clean_error_message(exc)}"
            ) from exc
        raise


def process_video_document(db: Session, document: Document, preferred_language: str, allow_transcription: bool) -> None:
    document.status = "processing"
    document.progress_stage = "extract_metadata"
    document.error_message = None
    db.commit()

    try:
        info = extract_video_metadata(document.source_url or document.storage_path)
        title = str(info.get("title") or document.filename or "在线视频资料")[:255]
        document.filename = title
        document.author = str(info.get("uploader") or info.get("channel") or "")[:255] or None
        document.duration_seconds = float(info["duration"]) if info.get("duration") is not None else None
        document.thumbnail_url = str(info.get("thumbnail") or "") or None
        document.external_id = str(info.get("id") or "")[:255] or None
        document.raw_content = json.dumps(
            {
                "title": document.filename,
                "uploader": document.author,
                "duration": document.duration_seconds,
                "webpage_url": info.get("webpage_url"),
            },
            ensure_ascii=False,
        )
        document.progress_stage = "fetch_subtitle"
        db.commit()

        subtitle_url, language, subtitle_type = choose_subtitle_track(info, preferred_language)
        if not subtitle_url:
            if allow_transcription:
                raise ValueError("该视频没有可读取字幕。MVP 暂未启用本地语音转写，请先选择带字幕的视频或手动上传文字/PDF。")
            raise ValueError("该视频没有可读取字幕。请换一个公开且带字幕的视频，或勾选允许转写后再重试。")

        subtitle_text = fetch_text_url(subtitle_url)
        segments = parse_subtitle_segments(subtitle_text)
        if not segments:
            raise ValueError("字幕解析失败，未识别到有效时间轴。")

        document.language = language
        document.subtitle_type = subtitle_type
        document.progress_stage = "chunk_and_embed"
        db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
        chunks = merge_segments_to_chunks(segments)
        for index, chunk in enumerate(chunks):
            chunk_text = str(chunk["text"])
            start_time = float(chunk["start"])
            end_time = float(chunk["end"])
            timestamp_url = build_timestamp_url(document.source_url, start_time)
            db.add(
                DocumentChunk(
                    document_id=document.id,
                    course_id=document.course_id,
                    chunk_text=chunk_text,
                    page_number=None,
                    start_time=start_time,
                    end_time=end_time,
                    section_title=f"{format_time(start_time)} - {format_time(end_time)}",
                    source_url=timestamp_url,
                    metadata_json=json.dumps(
                        {
                            "resource_title": document.filename,
                            "platform": document.platform,
                            "subtitle_type": subtitle_type,
                            "language": language,
                            "source_url": timestamp_url,
                        },
                        ensure_ascii=False,
                    ),
                    token_count=len(chunk_text),
                    chunk_index=index,
                    embedding=json.dumps(make_embedding(chunk_text), ensure_ascii=False),
                )
            )

        document.status = "ready"
        document.parse_status = "ready"
        document.progress_stage = f"completed:{len(chunks)} chunks"
        db.commit()
    except Exception as exc:
        document.status = "failed"
        document.parse_status = "failed"
        document.progress_stage = "failed"
        document.error_message = clean_error_message(exc)
        db.commit()


@app.post("/api/video/preview")
def preview_video(payload: VideoPreviewRequest) -> dict[str, object]:
    url = normalize_video_url(payload.url)
    try:
        info = extract_video_metadata(url)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    subtitle_url, language, subtitle_type = choose_subtitle_track(info, "zh")
    return {
        "title": info.get("title"),
        "author": info.get("uploader") or info.get("channel"),
        "duration_seconds": info.get("duration"),
        "thumbnail_url": info.get("thumbnail"),
        "platform": detect_video_platform(url),
        "has_subtitle": bool(subtitle_url),
        "subtitle_language": language,
        "subtitle_type": subtitle_type,
    }


@app.post("/api/courses/{course_id}/resources/video", response_model=ResourceOut)
def create_video_resource(course_id: int, payload: VideoResourceCreate, db: Session = Depends(get_db)) -> ResourceOut:
    course = db.scalar(select(CourseModel).where(CourseModel.id == course_id))
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课程不存在")

    url = normalize_video_url(payload.url)
    duplicate = db.scalar(
        select(Document).where(Document.course_id == course_id, Document.source_type == "video", Document.source_url == url)
    )
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该课程已经导入过这个视频，请不要重复导入")

    document = Document(
        course_id=course_id,
        filename="在线视频资料",
        file_type="video",
        storage_path=url,
        parse_status="processing",
        source_type="video",
        source_url=url,
        platform=detect_video_platform(url),
        status="processing",
        progress_stage="queued",
        priority=max(1, min(5, payload.priority)),
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    process_video_document(db, document, payload.preferred_language.strip() or "zh", payload.allow_transcription)
    db.refresh(document)
    return document_to_resource(db, document)


@app.post("/api/courses/{course_id}/resources/videos/batch")
def create_video_resources_batch(course_id: int, payload: VideoBatchResourceCreate, db: Session = Depends(get_db)) -> dict[str, object]:
    urls = []
    invalid_results = []
    seen = set()
    for url in payload.urls:
        if not url.strip():
            continue
        try:
            normalized = normalize_video_url(url)
        except HTTPException as exc:
            invalid_results.append({"url": url, "status": "failed", "resource": None, "error": exc.detail})
            continue
        if normalized not in seen:
            urls.append(normalized)
            seen.add(normalized)
    if not urls and not invalid_results:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请至少输入一个公开视频链接")
    if len(urls) > 20:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MVP 单次最多导入 20 个视频")

    results = invalid_results[:]
    for url in urls:
        try:
            resource = create_video_resource(
                course_id,
                VideoResourceCreate(
                    url=url,
                    preferred_language=payload.preferred_language,
                    allow_transcription=payload.allow_transcription,
                    priority=payload.priority,
                ),
                db,
            )
            results.append({"url": url, "status": resource.status, "resource": resource.model_dump(), "error": resource.error_message})
        except HTTPException as exc:
            results.append({"url": url, "status": "failed", "resource": None, "error": exc.detail})
        except Exception as exc:
            results.append({"url": url, "status": "failed", "resource": None, "error": str(exc)})

    success_count = sum(1 for item in results if item["status"] == "ready")
    return {"total": len(results), "success_count": success_count, "failed_count": len(results) - success_count, "results": results}


@app.post("/api/web/extract")
def extract_webpage(payload: WebExtractRequest) -> dict[str, object]:
    url = validate_public_url(payload.url)
    extracted = extract_webpage_content(url)
    chunks = split_text_to_chunks(str(extracted["text"]))
    return {
        "url": url,
        "title": extracted["title"],
        "text_length": len(str(extracted["text"])),
        "chunk_count": len(chunks),
        "preview": str(extracted["text"])[:1200],
        "links": extracted["links"],
    }


@app.post("/api/courses/{course_id}/resources/webpage", response_model=ResourceOut)
def create_webpage_resource(course_id: int, payload: WebResourceCreate, db: Session = Depends(get_db)) -> ResourceOut:
    course = db.scalar(select(CourseModel).where(CourseModel.id == course_id))
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课程不存在")

    url = validate_public_url(payload.url)
    duplicate = db.scalar(
        select(Document).where(Document.course_id == course_id, Document.source_type == "webpage", Document.source_url == url)
    )
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该课程已经导入过这个网页，请不要重复导入")

    document = Document(
        course_id=course_id,
        filename="网页资料",
        file_type="html",
        storage_path=url,
        parse_status="processing",
        source_type="webpage",
        source_url=url,
        platform=urlparse(url).hostname,
        status="processing",
        progress_stage="fetch_webpage",
        priority=max(1, min(5, payload.priority)),
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    try:
        extracted = extract_webpage_content(url)
        document.filename = str(extracted["title"])[:255]
        document.raw_content = str(extracted["text"])
        document.progress_stage = "chunk_and_embed"
        chunks = split_text_to_chunks(str(extracted["text"]))
        for index, chunk_text in enumerate(chunks):
            db.add(
                DocumentChunk(
                    document_id=document.id,
                    course_id=course_id,
                    chunk_text=chunk_text,
                    page_number=None,
                    start_time=None,
                    end_time=None,
                    section_title=f"网页片段 {index + 1}",
                    source_url=url,
                    metadata_json=json.dumps(
                        {
                            "resource_title": document.filename,
                            "source_type": "webpage",
                            "source_url": url,
                        },
                        ensure_ascii=False,
                    ),
                    token_count=len(chunk_text),
                    chunk_index=index,
                    embedding=json.dumps(make_embedding(chunk_text), ensure_ascii=False),
                )
            )
        document.status = "ready"
        document.parse_status = "ready"
        document.progress_stage = f"completed:{len(chunks)} chunks"
        db.commit()
    except Exception as exc:
        document.status = "failed"
        document.parse_status = "failed"
        document.progress_stage = "failed"
        document.error_message = clean_error_message(exc)
        db.commit()

    db.refresh(document)
    return document_to_resource(db, document)


@app.get("/api/courses/{course_id}/resources", response_model=list[ResourceOut])
def list_course_resources(course_id: int, db: Session = Depends(get_db)) -> list[ResourceOut]:
    documents = db.scalars(select(Document).where(Document.course_id == course_id).order_by(Document.id.desc())).all()
    return [document_to_resource(db, document) for document in documents]


@app.get("/api/resources/{resource_id}", response_model=ResourceOut)
def get_resource(resource_id: int, db: Session = Depends(get_db)) -> ResourceOut:
    document = db.get(Document, resource_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资料不存在")
    return document_to_resource(db, document)


@app.post("/api/resources/{resource_id}/retry", response_model=ResourceOut)
def retry_resource(resource_id: int, db: Session = Depends(get_db)) -> ResourceOut:
    document = db.get(Document, resource_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资料不存在")
    if document.source_type != "video":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前只支持重试视频资料")
    process_video_document(db, document, document.language or "zh", False)
    db.refresh(document)
    return document_to_resource(db, document)


@app.delete("/api/resources/{resource_id}")
def delete_resource(resource_id: int, db: Session = Depends(get_db)) -> dict[str, object]:
    document = db.get(Document, resource_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资料不存在")
    deleted_file = delete_uploaded_file(document.storage_path)
    db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == resource_id))
    db.delete(document)
    db.commit()
    return {"status": "deleted", "deleted_file": deleted_file}


@app.post("/api/ai/chat", response_model=AskResponse)
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


@app.post("/api/ai/generate-summary")
def generate_summary(payload: CourseTaskRequest, db: Session = Depends(get_db)) -> dict[str, object]:
    course_name = get_course_name(db, payload.course_id)
    context = get_course_context(db, payload.course_id, payload.text)
    summary = ai_service.generate_text(
        "你是课程资料整理助手。请用中文生成结构化学习摘要，包含核心概念、易错点和复习顺序。",
        f"课程：{course_name}\n资料内容：\n{context}",
    )
    return {"course_id": payload.course_id, "summary": summary, "references": build_references(db, payload.course_id)}


@app.post("/api/ai/extract-knowledge-points")
def extract_knowledge_points(payload: CourseTaskRequest, db: Session = Depends(get_db)) -> dict[str, object]:
    course_name = get_course_name(db, payload.course_id)
    source_document = None
    chunks: list[DocumentChunk] = []
    if payload.document_id is not None:
        source_document = db.scalar(
            select(Document).where(
                Document.id == payload.document_id,
                Document.course_id == payload.course_id,
            )
        )
        if source_document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资料不存在或不属于当前课程")
        chunks = db.scalars(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == payload.document_id, DocumentChunk.course_id == payload.course_id)
            .order_by(DocumentChunk.chunk_index)
            .limit(12)
        ).all()
        if chunks:
            context = "\n\n".join(chunk.chunk_text for chunk in chunks)
        elif source_document.raw_content:
            context = source_document.raw_content[:8000]
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="这份资料还没有可用于生成知识点的解析内容")
        source_chunk = chunks[0] if chunks else None
    else:
        chunks = db.scalars(
            select(DocumentChunk)
            .where(DocumentChunk.course_id == payload.course_id)
            .order_by(DocumentChunk.chunk_index)
            .limit(20)
        ).all()
        context = "\n\n".join(chunk.chunk_text for chunk in chunks) if chunks else get_course_context(db, payload.course_id, payload.text)
        source_chunk = chunks[0] if chunks else None
        source_document = db.get(Document, source_chunk.document_id) if source_chunk else None

    result = ai_service.generate_text(
        (
            "你是教学知识图谱助手。请只根据给定资料提取 5 到 8 个学科知识点。"
            "只保留资料原文中明确出现的课程内容概念。"
            "不要提取课时、地点、成绩构成、DDL、直播、教材链接、课程安排等事务信息。"
            "如果资料只有课程主页或目录，请只提取目录中出现的学科主题，并在说明中写“初步主题，需讲义内容补充”。"
            "必须只返回 JSON 数组，不要使用 Markdown，不要输出解释。"
            'JSON 格式：[{"name":"知识点名","description":"一句话说明"}]。'
        ),
        f"课程：{course_name}\n资料：{source_document.filename if source_document else '课程资料'}\n资料内容：\n{context}",
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

    parsed_points = parse_knowledge_point_result(result)
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

@app.post("/api/ai/generate-quiz")
def generate_quiz(payload: QuizGenerateRequest, db: Session = Depends(get_db)) -> dict[str, object]:
    course_name = get_course_name(db, payload.course_id)
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
    blocks = [block.strip() for block in result.split("\n\n") if block.strip()]
    for block in blocks:
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        question_text = next((line[2:].strip() for line in lines if line.startswith("Q:")), "")
        answer_text = next((line[2:].strip() for line in lines if line.startswith("A:")), "")
        explanation = next((line[2:].strip() for line in lines if line.startswith("E:")), "")
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
                "content": question.content,
                "correct_answer": question.correct_answer,
                "explanation": question.explanation,
            }
            for question in questions
        ],
        "raw": result,
    }


@app.post("/api/ai/analyze-mistake")
def analyze_mistake(payload: MistakeAnalyzeRequest, db: Session = Depends(get_db)) -> dict[str, object]:
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
    )
    db.add(mistake)

    course = db.scalar(select(CourseModel).where(CourseModel.id == payload.course_id))
    if course is not None:
        course.mastery = max(0, min(100, course.mastery - 5))

    db.commit()
    db.refresh(mistake)
    return {"mistake_id": mistake.id, "analysis": result, "mastery_effect": -5}


@app.post("/api/quiz/submit-answer")
def submit_quiz_answer(payload: QuizSubmitRequest, db: Session = Depends(get_db)) -> dict[str, object]:
    question = db.scalar(select(Question).where(Question.id == payload.question_id, Question.course_id == payload.course_id))
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="题目不存在")

    expected = (question.correct_answer or "").strip()
    actual = payload.student_answer.strip()
    is_correct = bool(expected and actual == expected)
    answer_record = AnswerRecord(
        user_id=payload.user_id,
        course_id=payload.course_id,
        question_id=payload.question_id,
        student_answer=payload.student_answer,
        is_correct=is_correct,
        score=100 if is_correct else 0,
    )
    db.add(answer_record)
    course = db.scalar(select(CourseModel).where(CourseModel.id == payload.course_id))
    if course is not None:
        course.mastery = max(0, min(100, course.mastery + (3 if is_correct else -5)))
        course.progress = max(course.progress, 10)
    db.flush()

    mistake = None
    analysis = ""
    if not is_correct:
        analysis = ai_service.generate_text(
            "你是错题分析助手。请分析学生为什么错，并给出复习建议。",
            f"题目：{question.content}\n学生答案：{payload.student_answer}\n参考答案：{question.correct_answer}\n解析：{question.explanation}",
        )
        mistake = MistakeRecord(
            user_id=payload.user_id,
            course_id=payload.course_id,
            question_id=payload.question_id,
            answer_record_id=answer_record.id,
            mistake_type="quiz_wrong",
            ai_analysis=analysis,
            weak_points="测验错题暴露的薄弱点",
            suggestion="复习对应知识点后重新练习。",
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


@app.post("/api/ai/generate-learning-plan")
def generate_learning_plan(payload: CourseTaskRequest, db: Session = Depends(get_db)) -> dict[str, object]:
    course_name = get_course_name(db, payload.course_id)
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
    course_name = get_course_name(db, course_id)
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
    extra_feedback = feedback or "今天还没有新的反馈。"
    plan = ai_service.generate_text(
        "你是每日学习计划助手。请基于整体学习计划和学生最新状态生成今天的学习计划。今日计划必须服务于整体计划。输出包含：今日目标、学习任务、练习任务、复盘提醒、明日调整依据。",
        (
            f"日期：{study_date}\n课程：{course_name}\n"
            f"当前整体学习计划：\n{overall.content if overall else '暂无整体学习计划。'}\n\n"
            f"最新反馈：{extra_feedback}\n最近学习状态：\n{checkin_context}\n最近错题：\n{mistake_context}"
        ),
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


@app.post("/api/ai/daily-learning-plan")
def get_or_create_daily_learning_plan(payload: DailyPlanRequest, db: Session = Depends(get_db)) -> dict[str, object]:
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


@app.post("/api/ai/update-daily-learning-plan")
def update_daily_learning_plan(payload: LearningCheckinRequest, db: Session = Depends(get_db)) -> dict[str, object]:
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

    course = db.scalar(select(CourseModel).where(CourseModel.id == payload.course_id))
    if course is not None:
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


@app.get("/courses/{course_id}/knowledge-points")
def list_course_knowledge_points(course_id: int, db: Session = Depends(get_db)) -> list[dict[str, object]]:
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


@app.get("/courses/{course_id}/learning-suggestions")
def list_course_learning_suggestions(course_id: int, user_id: int = 1, db: Session = Depends(get_db)) -> list[dict[str, object]]:
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


@app.get("/courses/{course_id}/diagnosis")
def get_course_diagnosis(course_id: int, user_id: int = 1, db: Session = Depends(get_db)) -> dict[str, object]:
    course = db.scalar(select(CourseModel).where(CourseModel.id == course_id))
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="课程不存在")

    documents_count = db.scalar(select(func.count()).select_from(Document).where(Document.course_id == course_id)) or 0
    mistakes_count = db.scalar(select(func.count()).select_from(MistakeRecord).where(MistakeRecord.user_id == user_id, MistakeRecord.course_id == course_id)) or 0
    suggestions_count = db.scalar(select(func.count()).select_from(LearningSuggestion).where(LearningSuggestion.user_id == user_id, LearningSuggestion.course_id == course_id)) or 0
    messages_count = db.scalar(select(func.count()).select_from(ChatMessage).where(ChatMessage.user_id == user_id, ChatMessage.course_id == course_id)) or 0
    checkins = db.scalars(
        select(LearningCheckin)
        .where(LearningCheckin.user_id == user_id, LearningCheckin.course_id == course_id)
        .order_by(LearningCheckin.id.desc())
        .limit(7)
    ).all()
    recent_checkins = list(reversed(checkins))
    trend_dates = [item.study_date[5:] if len(item.study_date) >= 10 else item.study_date for item in recent_checkins]
    trend_activity = [max(1, round(item.minutes / 20)) for item in recent_checkins]
    trend_mastery = []
    running_mastery = max(0, course.mastery - len(recent_checkins) * 2)
    for item in recent_checkins:
        if item.status == "completed":
            running_mastery += 3
        elif item.status == "stuck":
            running_mastery -= 2
        elif item.status == "studying":
            running_mastery += 1
        trend_mastery.append(max(0, min(100, running_mastery)))

    if not trend_dates:
        trend_dates = ["暂无反馈"]
        trend_activity = [0]
        trend_mastery = [course.mastery]

    items = [
        {"label": "课程进度", "value": course.progress, "status": "待开始" if course.progress <= 0 else "进行中"},
        {"label": "掌握状态", "value": course.mastery, "status": "待诊断" if course.progress <= 0 else "已评估"},
        {"label": "资料数量", "value": min(100, documents_count * 25), "status": f"{documents_count} 份资料"},
        {"label": "错题风险", "value": min(100, mistakes_count * 20), "status": f"{mistakes_count} 条错题"},
        {"label": "问答活跃度", "value": min(100, messages_count * 5), "status": f"{messages_count} 条消息"},
    ]
    return {
        "course_id": course_id,
        "course_name": course.name,
        "progress": course.progress,
        "mastery": course.mastery,
        "documents_count": documents_count,
        "mistakes_count": mistakes_count,
        "suggestions_count": suggestions_count,
        "messages_count": messages_count,
        "items": items,
        "trend": {
            "dates": trend_dates,
            "mastery": trend_mastery,
            "activity": trend_activity,
        },
    }


@app.get("/courses/{course_id}/profile")
def get_course_profile(course_id: int, user_id: int = 1, db: Session = Depends(get_db)) -> dict[str, object]:
    diagnosis = get_course_diagnosis(course_id, user_id, db)
    progress = int(diagnosis["progress"])
    mastery = int(diagnosis["mastery"])
    mistakes_count = int(diagnosis["mistakes_count"])
    messages_count = int(diagnosis["messages_count"])
    suggestions_count = int(diagnosis["suggestions_count"])
    radar = [
        {"name": "理解力", "value": max(20, mastery)},
        {"name": "专注度", "value": min(100, progress + 30)},
        {"name": "练习量", "value": min(100, mistakes_count * 18 + 20)},
        {"name": "复盘能力", "value": min(100, suggestions_count * 25 + max(0, 60 - mistakes_count * 8))},
        {"name": "提问质量", "value": min(100, messages_count * 8 + 35)},
    ]
    conclusion = "当前画像来自课程进度、问答、错题和学习建议统计。完成更多测验后画像会更准确。"
    return {"course_id": course_id, "radar": radar, "conclusion": conclusion}


@app.post("/qa/ask", response_model=AskResponse)
def ask_question(payload: AskRequest, db: Session = Depends(get_db)) -> AskResponse:
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
        provider = "deepseek" if ai_service.enabled else "mock"
    except Exception as exc:
        answer = f"DeepSeek 调用失败：{exc}"
        provider = "deepseek-error"

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
    db.flush()
    db.commit()

    return AskResponse(
        answer=answer_with_references,
        references=references,
        provider=provider,
        user_message_id=user_message.id,
        assistant_message_id=assistant_message.id,
    )


@app.get("/qa/sessions", response_model=list[ChatSessionOut])
def list_chat_sessions(user_id: int = 1, course_id: int = 1, db: Session = Depends(get_db)) -> list[ChatSessionOut]:
    ensure_default_chat_session(db, user_id, course_id)
    db.commit()
    sessions = db.scalars(
        select(ChatSession)
        .where(ChatSession.user_id == user_id, ChatSession.course_id == course_id)
        .order_by(ChatSession.id.desc())
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


@app.post("/qa/sessions", response_model=ChatSessionOut)
def create_chat_session(payload: ChatSessionCreate, db: Session = Depends(get_db)) -> ChatSessionOut:
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


@app.delete("/qa/sessions/{session_id}")
def delete_chat_session(session_id: int, user_id: int = 1, db: Session = Depends(get_db)) -> dict[str, object]:
    session = db.scalar(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user_id))
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="对话不存在")

    result = db.execute(delete(ChatMessage).where(ChatMessage.session_id == session_id, ChatMessage.user_id == user_id))
    db.delete(session)
    db.commit()
    return {"status": "deleted", "deleted_messages": result.rowcount or 0, "session_id": session_id}


@app.get("/qa/messages", response_model=list[ChatMessageOut])
def list_chat_messages(user_id: int = 1, course_id: int = 1, session_id: int | None = None, db: Session = Depends(get_db)) -> list[ChatMessageOut]:
    if session_id is None:
        session_id = ensure_default_chat_session(db, user_id, course_id).id
        db.commit()
    messages = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.user_id == user_id, ChatMessage.course_id == course_id, ChatMessage.session_id == session_id)
        .order_by(ChatMessage.id)
    ).all()
    return [
        ChatMessageOut(
            id=message.id,
            role=message.role,
            content=message.content,
            created_at=message.created_at.isoformat() if message.created_at else "",
        )
        for message in messages
    ]


@app.get("/qa/messages/search")
def search_chat_messages(keyword: str, user_id: int = 1, course_id: int = 1, db: Session = Depends(get_db)) -> list[dict[str, object]]:
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
            "content": message.content,
            "created_at": message.created_at.isoformat() if message.created_at else "",
            "session_id": session.id,
            "session_title": session.title,
        }
        for message, session in rows
    ]


@app.delete("/qa/messages")
def delete_chat_messages(user_id: int = 1, course_id: int = 1, session_id: int | None = None, db: Session = Depends(get_db)) -> dict[str, object]:
    if session_id is None:
        result = db.execute(delete(ChatMessage).where(ChatMessage.user_id == user_id, ChatMessage.course_id == course_id))
    else:
        result = db.execute(delete(ChatMessage).where(ChatMessage.user_id == user_id, ChatMessage.course_id == course_id, ChatMessage.session_id == session_id))
    db.commit()
    return {"status": "deleted", "deleted_messages": result.rowcount or 0}


@app.post("/diagnosis/signals")
def create_signal(payload: DiagnosisSignal, db: Session = Depends(get_db)) -> dict[str, object]:
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


@app.post("/mistakes")
def create_mistake(payload: MistakeCreate, db: Session = Depends(get_db)) -> dict[str, object]:
    mistake = MistakeRecord(
        user_id=payload.user_id,
        course_id=payload.course_id,
        question_id=payload.question_id,
        mistake_type=payload.mistake_type,
        ai_analysis=payload.ai_analysis,
        weak_points=payload.weak_points,
        suggestion=payload.suggestion,
    )
    db.add(mistake)
    db.commit()
    db.refresh(mistake)
    return {"status": "saved", "mistake_id": mistake.id}


@app.get("/mistakes")
def list_mistakes(user_id: int = 1, course_id: int | None = None, db: Session = Depends(get_db)) -> list[dict[str, object]]:
    query = select(MistakeRecord).where(MistakeRecord.user_id == user_id)
    if course_id is not None:
        query = query.where(MistakeRecord.course_id == course_id)
    mistakes = db.scalars(query.order_by(MistakeRecord.id.desc())).all()
    return [
        {
            "id": item.id,
            "course_id": item.course_id,
            "mistake_type": item.mistake_type,
            "ai_analysis": item.ai_analysis,
            "weak_points": item.weak_points,
            "suggestion": item.suggestion,
            "review_status": item.review_status,
            "created_at": item.created_at,
        }
        for item in mistakes
    ]

