export type User = { id: number; username: string; nickname: string | null }
export type ImportStatus = 'idle' | 'loading' | 'success' | 'error'
export type PdfParser = 'pymupdf' | 'docling'
export type MainView = 'courses' | 'detail' | 'upload' | 'settings'
export type DetailTab = 'overview' | 'resources' | 'qa' | 'knowledge' | 'plan' | 'quiz' | 'mistakes' | 'diagnosis' | 'profile'
export type AIConfig = { provider: string; model: string; base_url: string; has_api_key: boolean }

export type Resource = {
  id: number
  course_id: number
  title: string
  source_type: string | null
  source_url: string | null
  status: string | null
  error_message: string | null
  chunk_count: number
}

export type RecommendedResource = {
  title: string
  resource_type: string
  reason: string
  keyword: string
  url: string
}

export type KnowledgePoint = {
  id: number
  name: string
  description: string | null
  source_document?: string | null
  source_excerpt?: string | null
  confidence?: number | null
}

export type Suggestion = { id: number; title: string; content: string; status?: string }
export type Mistake = {
  id: number
  mistake_type: string | null
  ai_analysis: string | null
  weak_points: string | null
  suggestion: string | null
  image_path?: string | null
  ocr_text?: string | null
  review_status: string
}
export type ImageMistakeUploadResult = {
  image_path: string
  ocr_text?: string
  ocr_engine?: string
  message: string
  mode?: 'vision' | 'manual_text_required'
  supports_vision?: boolean
  analysis?: string
  mistake_id?: number | null
}
export type InsightTone = 'emerald' | 'amber' | 'red'
export type EvidenceConfidence = { level: 'low' | 'medium' | 'high'; label: string; detail: string }
export type LearningAction = { title: string; reason: string; action: string; tone: InsightTone }
export type Diagnosis = {
  progress: number
  mastery: number
  items: Array<{ label: string; value: number | null; status: string; hint: string; tone: InsightTone }>
  confidence: EvidenceConfidence
  actions: LearningAction[]
  strengths: string[]
}
export type Profile = {
  radar: Array<{ name: string; value: number | null; evidence: string }>
  confidence: EvidenceConfidence
  focuses: LearningAction[]
  strengths: string[]
  conclusion: string
}
export type ChatMessage = { id: number | string; role: 'user' | 'assistant'; content: string; created_at?: string }
export type ChatSession = { id: number; title: string; course_id: number; created_at: string; updated_at: string }
export type ChatSearchResult = ChatMessage & { session_id: number; session_title: string }
export type PlanGenerateResult = { plan: string; daily_plan?: string }
export type QuizQuestion = {
  id: number
  content: string
  correct_answer: string
  explanation: string
}
export type QuizAnswerRecord = {
  id: number
  question_id: number
  question: string
  student_answer: string | null
  is_correct: boolean
  score: number
  ai_feedback: string | null
  correct_answer: string | null
  explanation: string | null
  answered_at: string
}
export type PlanFeedback = {
  status: 'not_started' | 'studying' | 'completed' | 'stuck'
  minutes: number
  difficulty: 'easy' | 'normal' | 'hard'
  feedback: string
}

export type ImportEstimate = { label: string; detail: string; minSeconds: number; maxSeconds: number }
export type ImportTiming = { samples: number; secondsPerMb: number }
export type ApiValidationErrorItem = { loc?: Array<string | number>; msg?: string; type?: string }
export type ApiErrorBody = { detail?: string | ApiValidationErrorItem[] | Record<string, unknown>; message?: string }
