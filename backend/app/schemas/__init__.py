from typing import Literal

from pydantic import BaseModel

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
    has_progress_evidence: bool
    has_mastery_evidence: bool


class CourseCreate(BaseModel):
    user_id: int = 1
    name: str
    description: str | None = None


class CourseResourceRecommendRequest(BaseModel):
    user_id: int = 1
    course_name: str
    learning_goal: str | None = None


class RecommendedResource(BaseModel):
    title: str
    resource_type: str
    reason: str
    keyword: str
    url: str


class CourseResourceRecommendResponse(BaseModel):
    course_name: str
    summary: str
    resources: list[RecommendedResource]


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
    force: bool = False


class QuizGenerateRequest(CourseTaskRequest):
    count: int = 5


class MistakeAnalyzeRequest(BaseModel):
    user_id: int = 1
    course_id: int = 1
    question_id: int | None = None
    question: str
    student_answer: str
    correct_answer: str | None = None


class MistakeImageAnalyzeRequest(BaseModel):
    user_id: int = 1
    course_id: int = 1
    question_text: str
    student_answer: str | None = None
    correct_answer: str | None = None
    image_path: str | None = None
    ocr_text: str | None = None
    save_to_mistakes: bool = True


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



class AIConfigOut(BaseModel):
    provider: str
    model: str
    base_url: str
    has_api_key: bool


class AIConfigUpdate(BaseModel):
    provider: str = "deepseek"
    api_key: str | None = None
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
    image_path: str | None = None
    ocr_text: str | None = None
