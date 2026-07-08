import React, { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  AlertCircle,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  FileText,
  FileUp,
  Layers3,
  Loader2,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Send,
  Settings,
  Target,
  Trash2,
  Video,
} from 'lucide-react'
import { http } from './api/http'
import { type Course } from './data'

type User = { id: number; username: string; nickname: string | null }
type ImportStatus = 'idle' | 'loading' | 'success' | 'error'
type MainView = 'courses' | 'detail' | 'upload' | 'settings'
type DetailTab = 'overview' | 'resources' | 'qa' | 'knowledge' | 'plan' | 'quiz' | 'mistakes' | 'diagnosis' | 'profile'
type AIConfig = { provider: string; model: string; base_url: string; has_api_key: boolean }

type Resource = {
  id: number
  course_id: number
  title: string
  source_type: string | null
  source_url: string | null
  status: string | null
  error_message: string | null
  chunk_count: number
}

type RecommendedResource = {
  title: string
  resource_type: string
  reason: string
  keyword: string
  url: string
}

type KnowledgePoint = {
  id: number
  name: string
  description: string | null
  source_document?: string | null
  source_excerpt?: string | null
  confidence?: number | null
}

type Suggestion = { id: number; title: string; content: string; status?: string }
type Mistake = {
  id: number
  mistake_type: string | null
  ai_analysis: string | null
  weak_points: string | null
  suggestion: string | null
  image_path?: string | null
  ocr_text?: string | null
  review_status: string
}
type OcrMistakeResult = { image_path: string; ocr_text: string; ocr_engine: string; message: string }
type Diagnosis = { progress: number; mastery: number; items: Array<{ label: string; value: number; status: string }> }
type Profile = { radar: Array<{ name: string; value: number }>; conclusion: string }
type ChatMessage = { id: number | string; role: 'user' | 'assistant'; content: string; created_at?: string }
type ChatSession = { id: number; title: string; course_id: number; created_at: string; updated_at: string }
type ChatSearchResult = ChatMessage & { session_id: number; session_title: string }
type PlanGenerateResult = { plan: string; daily_plan?: string }
type QuizQuestion = {
  id: number
  content: string
  correct_answer: string
  explanation: string
}
type QuizAnswerRecord = {
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
type PlanFeedback = {
  status: 'not_started' | 'studying' | 'completed' | 'stuck'
  minutes: number
  difficulty: 'easy' | 'normal' | 'hard'
  feedback: string
}

function statusClass(status: ImportStatus) {
  if (status === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'error') return 'border-red-200 bg-red-50 text-red-700'
  if (status === 'loading') return 'border-blue-200 bg-blue-50 text-blue-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`panel-surface p-5 ${className}`}>{children}</section>
}

function LoadingNotice({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/85 px-4 py-3 text-sm text-emerald-800">
      <span className="relative flex h-5 w-5 items-center justify-center">
        <span className="absolute h-5 w-5 animate-ping rounded-full bg-emerald-300 opacity-40" />
        <Loader2 className="relative animate-spin" size={18} />
      </span>
      <span className="font-medium">{text}</span>
    </div>
  )
}

function DoclingParsingNotice({ message }: { message: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
      <div className="flex items-start gap-3">
        <span className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 shadow-sm">
          <span className="absolute h-9 w-9 animate-ping rounded-xl bg-amber-300 opacity-30" />
          <Layers3 className="relative animate-pulse" size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Docling 正在结构化解析</p>
            <Loader2 className="animate-spin" size={15} />
          </div>
          <p className="mt-1 text-sm leading-6 text-amber-800">{message}</p>
          <div className="mt-3 space-y-2">
            {['读取页面结构', '识别标题和表格', '生成 RAG 知识片段'].map((step, index) => (
              <div key={step} className="h-2 overflow-hidden rounded-full bg-white/80">
                <div
                  className="h-full w-1/2 animate-pulse rounded-full bg-amber-400"
                  style={{ animationDelay: `${index * 180}ms` }}
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-amber-700">复杂 PDF 或 PPT 可能需要较长时间，请等待当前上传完成。</p>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [username, setUsername] = useState('demo')
  const [password, setPassword] = useState('demo123')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authMessage, setAuthMessage] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const [mainView, setMainView] = useState<MainView>('courses')

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) || courses[0] || null,
    [courses, selectedCourseId],
  )

  async function loadCourses() {
    const result = (await http.get('/courses')) as unknown as Course[]
    setCourses(result)
    setSelectedCourseId((current) => {
      if (current && result.some((course) => course.id === current)) return current
      return result[0]?.id ?? null
    })
  }

  useEffect(() => {
    if (user) void loadCourses()
  }, [user])

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault()
    setAuthMessage('')
    if (!username.trim() || !password.trim()) {
      setAuthMessage('请输入账号和密码')
      return
    }
    setAuthLoading(true)
    try {
      const result = (await http.post(authMode === 'login' ? '/auth/login' : '/auth/register', {
        username: username.trim(),
        password,
        nickname: username.trim(),
      })) as unknown as { user: User; message: string }
      setUser(result.user)
      setAuthMessage(result.message)
    } catch (error: any) {
      if (error?.code === 'ERR_NETWORK') {
        setAuthMessage('后端服务未启动，暂时无法登录或注册')
      } else if (error?.code === 'ECONNABORTED') {
        setAuthMessage('后端响应超时，请稍后再试')
      } else {
        setAuthMessage(error?.response?.data?.detail || '登录/注册失败')
      }
    } finally {
      setAuthLoading(false)
    }
  }

  async function deleteCourse(courseId: number) {
    await http.delete(`/courses/${courseId}`)
    await loadCourses()
  }

  function openCourse(courseId: number) {
    setSelectedCourseId(courseId)
    setMainView('detail')
  }

  if (!user) {
    return (
      <main className="app-shell min-h-[100dvh] text-slate-900">
        <div className="mx-auto flex min-h-[100dvh] max-w-7xl items-center px-6 py-10">
          <section className="grid w-full items-center gap-10 lg:grid-cols-[1fr_430px]">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-sm font-semibold text-emerald-700 shadow-sm">
                <BrainCircuit size={16} />
                AI Learning MVP
              </div>
              <h1 className="balanced-text mt-6 text-5xl font-semibold leading-tight text-slate-950 md:text-6xl">个性化异步学习平台</h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">围绕课程资料、RAG 问答、错题诊断、知识画像和每日计划，形成一条学生能反复使用的学习闭环。</p>
              <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
                {[
                  ['资料', 'PDF / 网页 / 视频'],
                  ['诊断', '错题和掌握度'],
                  ['计划', '整体和每日同步'],
                ].map(([label, value]) => (
                  <div key={label} className="soft-card p-4">
                    <p className="text-sm font-semibold text-emerald-700">{label}</p>
                    <p className="mt-1 text-sm text-slate-600">{value}</p>
                  </div>
                ))}
              </div>
            </div>
            <form onSubmit={submitAuth} className="panel-surface p-6 text-slate-900">
              <h2 className="text-2xl font-semibold text-slate-950">{authMode === 'login' ? '学生登录' : '注册账号'}</h2>
              <p className="mt-2 text-sm text-slate-500">进入课程工作台后再上传资料、配置 AI 和查看学习诊断。</p>
              <label className="mt-5 block text-sm font-medium">
                账号
                <input value={username} onChange={(event) => setUsername(event.target.value)} className="input-surface mt-2 w-full px-3 py-2.5 outline-none" />
              </label>
              <label className="mt-4 block text-sm font-medium">
                密码
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="input-surface mt-2 w-full px-3 py-2.5 outline-none" />
              </label>
              {authMessage && <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${authMessage.includes('成功') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{authMessage}</p>}
              <button disabled={authLoading} className="primary-action mt-5 w-full rounded-xl px-4 py-2.5 font-semibold disabled:bg-slate-400">{authLoading ? '处理中...' : authMode === 'login' ? '登录' : '注册'}</button>
              <button type="button" disabled={authLoading} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="secondary-action mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:bg-slate-100">
                {authMode === 'login' ? '注册账号' : '返回登录'}
              </button>
            </form>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="study-app-shell min-h-[100dvh] text-slate-900">
      <aside className="study-sidebar sticky top-3 z-20 m-4 max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-5 text-slate-900 lg:fixed lg:inset-y-4 lg:left-4 lg:m-0 lg:w-72">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500 font-bold text-white shadow-lg shadow-emerald-900/20">学</div>
          <div>
            <p className="font-semibold tracking-wide">我的学习空间</p>
            <p className="text-xs text-slate-500">AI Learning MVP</p>
          </div>
        </div>
        <div className="mt-6 rounded-3xl border border-emerald-100 bg-white/78 p-4 shadow-sm">
          <p className="text-xs font-semibold text-emerald-700">今日入口</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">选一门课，继续看资料、问 AI、做测验和整理错题。</p>
        </div>
        <nav className="mt-6 grid gap-2">
          <SideButton active={mainView === 'courses'} icon={<BookOpen size={18} />} label="课程" onClick={() => setMainView('courses')} />
          <div className={`rounded-3xl ${mainView === 'detail' ? 'bg-emerald-50/80 p-1' : ''}`}>
            <SideButton active={mainView === 'detail'} icon={<Layers3 size={18} />} label="课程详情" onClick={() => setMainView('detail')} />
            <div className="ml-6 mt-2 grid gap-1 border-l border-emerald-100 pb-2 pl-3">
              {courses.map((course) => (
                <button key={course.id} onClick={() => openCourse(course.id)} className={`rounded-2xl px-3 py-2 text-left text-sm ${selectedCourse?.id === course.id && mainView === 'detail' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:bg-white hover:text-emerald-700'}`}>
                  {course.name}
                </button>
              ))}
              {!courses.length && <p className="px-3 py-2 text-xs text-slate-500">暂无课程</p>}
            </div>
          </div>
          <SideButton active={mainView === 'upload'} icon={<FileUp size={18} />} label="上传/导入" onClick={() => setMainView('upload')} />
          <SideButton active={mainView === 'settings'} icon={<Settings size={18} />} label="设置" onClick={() => setMainView('settings')} />
        </nav>
        <div className="mt-8 rounded-3xl border border-emerald-100 bg-emerald-50/72 p-4">
          <p className="text-xs text-slate-500">当前学生</p>
          <p className="mt-1 font-semibold">{user.nickname || user.username}</p>
          <div className="mt-4 grid gap-2 text-xs text-slate-600">
            <div className="flex items-center justify-between"><span>课程</span><span className="font-semibold text-slate-950">{courses.length}</span></div>
            <div className="flex items-center justify-between"><span>AI 接口</span><span className="font-semibold text-emerald-700">可配置</span></div>
          </div>
        </div>
      </aside>
      <section className="min-h-[100dvh] lg:ml-[312px]">
        <header className="px-4 pt-2 lg:px-8 lg:pt-6">
          <div className="learning-hero mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="section-kicker">今天的学习空间</p>
              <h1 className="balanced-text mt-1 text-2xl font-semibold text-slate-950">{selectedCourse?.name || '先选一门课开始'}</h1>
              <p className="mt-1 text-sm text-slate-600">课程、资料、问答、计划、测验和错题都在这里串起来。</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="hidden gap-5 rounded-2xl border border-emerald-100 bg-white/78 px-4 py-2 text-sm text-slate-600 shadow-sm lg:flex">
                <div><span className="text-slate-400">课程</span><span className="ml-2 font-semibold text-slate-950">{courses.length}</span></div>
                <div><span className="text-slate-400">当前</span><span className="ml-2 font-semibold text-slate-950">{selectedCourse?.name || '未选择'}</span></div>
              </div>
              <button onClick={() => setMainView('upload')} className="primary-action inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
                <FileUp size={16} />
                加资料
              </button>
              <button onClick={() => setUser(null)} className="secondary-action inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm">
                <LogOut size={16} />
                退出
              </button>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-[1440px] px-4 py-6 lg:px-8">
          {mainView === 'courses' && <CoursesView courses={courses} onOpen={openCourse} onDelete={deleteCourse} />}
          {mainView === 'detail' && <CourseDetailView course={selectedCourse} userId={user.id} />}
          {mainView === 'upload' && <UploadView userId={user.id} courses={courses} onCoursesChanged={loadCourses} />}
          {mainView === 'settings' && <SettingsView />}
        </div>
      </section>
    </main>
  )
}

function SideButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium ${active ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/18' : 'text-slate-600 hover:bg-white hover:text-emerald-700'}`}>
      {icon}
      {label}
    </button>
  )
}

function CoursesView({ courses, onOpen, onDelete }: { courses: Course[]; onOpen: (id: number) => void; onDelete: (id: number) => Promise<void> }) {
  return (
    <div>
      <div className="learning-hero p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="section-kicker">继续学习</p>
            <h2 className="mt-1 text-3xl font-semibold text-slate-950">今天想学哪门课？</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">每门课程都有自己的资料、AI 问答、学习计划、测验和错题库。选一门课继续往前走。</p>
          </div>
          <div className="grid gap-1 text-right">
            <p className="text-3xl font-semibold text-slate-950">{courses.length}</p>
            <p className="text-sm text-slate-500">门课程</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="friendly-chip px-4 py-3 text-sm font-medium">先看资料</div>
          <div className="friendly-chip px-4 py-3 text-sm font-medium">再问 AI</div>
          <div className="friendly-chip px-4 py-3 text-sm font-medium">最后做测验</div>
        </div>
      </div>
      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {courses.map((course) => (
          <div key={course.id} className="lesson-card group overflow-hidden p-5">
            <div className="flex items-start justify-between gap-3">
              <button onClick={() => onOpen(course.id)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-lg font-semibold text-slate-950 group-hover:text-emerald-700">{course.name}</p>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{course.description || '暂无说明'}</p>
              </button>
              <button onClick={() => void onDelete(course.id)} className="rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="删除课程">
                <Trash2 size={16} />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-emerald-100 bg-white/74 p-3">
                <p className="text-xs text-slate-500">进度</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{course.progress}%</p>
                <div className="mt-2 h-1.5 rounded-full bg-white"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, course.progress)}%` }} /></div>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-white/74 p-3">
                <p className="text-xs text-slate-500">掌握</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{course.mastery}%</p>
                <div className="mt-2 h-1.5 rounded-full bg-white"><div className="h-1.5 rounded-full bg-slate-700" style={{ width: `${Math.min(100, course.mastery)}%` }} /></div>
              </div>
            </div>
            <button onClick={() => onOpen(course.id)} className="primary-action mt-4 w-full rounded-2xl px-3 py-2.5 text-sm font-semibold">继续学习</button>
          </div>
        ))}
        {!courses.length && <Panel className="md:col-span-2 xl:col-span-3"><p className="text-sm text-slate-500">暂无课程。可以在“上传/导入”中上传资料，或用 AI 推荐资料先创建课程。</p></Panel>}
      </div>
    </div>
  )
}

function CourseDetailView({ course, userId }: { course: Course | null; userId: number }) {
  const [tab, setTab] = useState<DetailTab>('overview')
  const [resources, setResources] = useState<Resource[]>([])
  const [knowledge, setKnowledge] = useState<KnowledgePoint[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [mistakes, setMistakes] = useState<Mistake[]>([])
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [dailyPlan, setDailyPlan] = useState('')
  const [overallPlan, setOverallPlan] = useState('')
  const [quizRaw, setQuizRaw] = useState('')
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([])
  const [quizAnswerRecords, setQuizAnswerRecords] = useState<QuizAnswerRecord[]>([])
  const [manualMistake, setManualMistake] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  async function loadDetail() {
    if (!course) return
    const [resourceResult, pointResult, suggestionResult, mistakeResult, diagnosisResult, profileResult, dailyResult, answerResult] = await Promise.all([
      http.get(`/api/courses/${course.id}/resources`),
      http.get(`/courses/${course.id}/knowledge-points`),
      http.get(`/courses/${course.id}/learning-suggestions?user_id=${userId}`),
      http.get(`/mistakes?user_id=${userId}&course_id=${course.id}`),
      http.get(`/courses/${course.id}/diagnosis?user_id=${userId}`),
      http.get(`/courses/${course.id}/profile?user_id=${userId}`),
      http.post('/api/ai/daily-learning-plan', { user_id: userId, course_id: course.id }),
      http.get(`/api/quiz/answer-records?user_id=${userId}&course_id=${course.id}`),
    ])
    setResources(resourceResult as unknown as Resource[])
    setKnowledge(pointResult as unknown as KnowledgePoint[])
    const suggestionItems = suggestionResult as unknown as Suggestion[]
    setSuggestions(suggestionItems)
    setOverallPlan(suggestionItems.find((item) => !item.title.startsWith('每日学习计划'))?.content || '')
    setMistakes(mistakeResult as unknown as Mistake[])
    setDiagnosis(diagnosisResult as unknown as Diagnosis)
    setProfile(profileResult as unknown as Profile)
    setDailyPlan((dailyResult as unknown as { plan: string }).plan)
    setQuizAnswerRecords(answerResult as unknown as QuizAnswerRecord[])
  }

  useEffect(() => {
    setNotice('')
    setResources([])
    setKnowledge([])
    setSuggestions([])
    setMistakes([])
    setDiagnosis(null)
    setProfile(null)
    setDailyPlan('')
    setOverallPlan('')
    setQuizRaw('')
    setQuizQuestions([])
    setQuizAnswerRecords([])
    setManualMistake('')
    void loadDetail()
  }, [course?.id])

  if (!course) return <Panel>请先成功导入资料生成课程。</Panel>
  const activeCourse = course

  async function generateCourseKnowledge(force = false) {
    setLoading(true)
    try {
      const result = (await http.post('/api/ai/extract-knowledge-points', { user_id: userId, course_id: activeCourse.id, force })) as unknown as { message?: string; reused?: boolean }
      setNotice(result.message || (result.reused ? '已显示已有知识点。' : '已根据课程资料生成知识点。'))
      await loadDetail()
    } finally {
      setLoading(false)
    }
  }

  async function generatePlan(text?: string): Promise<PlanGenerateResult | null> {
    setLoading(true)
    try {
      const result = (await http.post('/api/ai/generate-learning-plan', { user_id: userId, course_id: activeCourse.id, text }, { timeout: 300000 })) as unknown as PlanGenerateResult
      setOverallPlan(result.plan)
      if (result.daily_plan) setDailyPlan(result.daily_plan)
      setNotice(text?.trim() ? '已根据你的对话修改整体计划，并同步更新今日计划。' : '学习建议已生成，并同步更新今日计划。')
      try {
        await loadDetail()
      } catch {
        // The plan update already succeeded; detail refresh can recover on the next page load.
      }
      return result
    } catch (error: any) {
      setNotice(error?.code === 'ECONNABORTED' ? 'AI 生成时间较长，请稍后重试。' : error?.response?.data?.detail || '整体计划修改失败，请稍后再试。')
      return null
    } finally {
      setLoading(false)
    }
  }

  async function updatePlanWithFeedback(payload: PlanFeedback) {
    setLoading(true)
    try {
      const result = (await http.post('/api/ai/update-daily-learning-plan', {
        user_id: userId,
        course_id: activeCourse.id,
        ...payload,
      })) as unknown as { plan: string }
      setDailyPlan(result.plan)
      setNotice('已根据你的反馈更新今日学习计划。')
      await loadDetail()
    } finally {
      setLoading(false)
    }
  }

  async function generateQuiz(text?: string) {
    setLoading(true)
    try {
      const result = (await http.post('/api/ai/generate-quiz', { user_id: userId, course_id: activeCourse.id, count: 5, text })) as unknown as { raw: string; questions: QuizQuestion[] }
      setQuizRaw(result.raw)
      setQuizQuestions(result.questions || [])
      setNotice('测验题已生成。')
    } finally {
      setLoading(false)
    }
  }

  async function saveMistake() {
    if (!manualMistake.trim()) return
    setLoading(true)
    try {
      await http.post('/mistakes', {
        user_id: userId,
        course_id: activeCourse.id,
        mistake_type: 'manual_review',
        ai_analysis: manualMistake,
        weak_points: '待 AI 进一步分析',
        suggestion: '加入错题库后复习',
      })
      setManualMistake('')
      setNotice('错题已保存。')
      await loadDetail()
    } finally {
      setLoading(false)
    }
  }

  async function deleteMistake(mistakeId: number) {
    setLoading(true)
    try {
      await http.delete(`/mistakes/${mistakeId}?user_id=${userId}`)
      setNotice('错题已删除。')
      await loadDetail()
    } finally {
      setLoading(false)
    }
  }

  const tabs: Array<[DetailTab, string]> = [
    ['overview', '概览'],
    ['resources', '资料'],
    ['qa', 'AI 问答'],
    ['knowledge', '知识点'],
    ['plan', '学习计划'],
    ['quiz', '测验'],
    ['mistakes', '错题库'],
    ['diagnosis', '学习诊断'],
    ['profile', '学习画像'],
  ]

  return (
    <div>
      <div className="learning-hero overflow-hidden p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-kicker">课程详情</p>
            <h2 className="balanced-text mt-1 text-3xl font-semibold text-slate-950">{activeCourse.name}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{activeCourse.description || '暂无课程说明。'}</p>
          </div>
          {notice && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{notice}</p>}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <button onClick={() => setTab('resources')} className="rounded-2xl border border-emerald-100 bg-white/76 p-3 text-left hover:border-emerald-300"><p className="text-xs text-slate-500">资料</p><p className="mt-1 text-xl font-semibold text-slate-950">{resources.length}</p></button>
          <button onClick={() => setTab('knowledge')} className="rounded-2xl border border-emerald-100 bg-white/76 p-3 text-left hover:border-emerald-300"><p className="text-xs text-slate-500">知识点</p><p className="mt-1 text-xl font-semibold text-slate-950">{knowledge.length}</p></button>
          <button onClick={() => setTab('mistakes')} className="rounded-2xl border border-emerald-100 bg-white/76 p-3 text-left hover:border-emerald-300"><p className="text-xs text-slate-500">错题</p><p className="mt-1 text-xl font-semibold text-slate-950">{mistakes.length}</p></button>
          <button onClick={() => setTab('quiz')} className="rounded-2xl border border-emerald-100 bg-white/76 p-3 text-left hover:border-emerald-300"><p className="text-xs text-slate-500">作答</p><p className="mt-1 text-xl font-semibold text-slate-950">{quizAnswerRecords.length}</p></button>
          <div className="rounded-2xl border border-emerald-100 bg-white/76 p-3"><p className="text-xs text-slate-500">进度</p><p className="mt-1 text-xl font-semibold text-slate-950">{activeCourse.progress}%</p></div>
          <div className="rounded-2xl border border-emerald-100 bg-white/76 p-3"><p className="text-xs text-slate-500">掌握</p><p className="mt-1 text-xl font-semibold text-slate-950">{activeCourse.mastery}%</p></div>
        </div>
      </div>
      <div className="tab-strip mt-5 flex gap-2 overflow-x-auto rounded-3xl border border-emerald-100 bg-white/76 p-2 shadow-sm">
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`shrink-0 rounded-2xl px-3 py-2 text-sm font-medium ${tab === key ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/15' : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {tab === 'overview' && <Overview course={activeCourse} resources={resources} knowledge={knowledge} mistakes={mistakes} suggestions={suggestions} />}
        {tab === 'resources' && <ResourcesPanel courseId={activeCourse.id} resources={resources} onChanged={loadDetail} />}
        {tab === 'qa' && <QaView course={activeCourse} userId={userId} onMistakeSaved={loadDetail} />}
        {tab === 'knowledge' && <KnowledgePanel items={knowledge} loading={loading} onGenerate={generateCourseKnowledge} />}
        {tab === 'plan' && <PlanPanel overallPlan={overallPlan} dailyPlan={dailyPlan} suggestions={suggestions} loading={loading} onGenerate={generatePlan} onFeedback={updatePlanWithFeedback} />}
        {tab === 'quiz' && <QuizPanel courseId={activeCourse.id} userId={userId} courseName={activeCourse.name} raw={quizRaw} questions={quizQuestions} answerRecords={quizAnswerRecords} loading={loading} onGenerate={generateQuiz} onAnswered={loadDetail} onMistakeSaved={loadDetail} />}
        {tab === 'mistakes' && <MistakesPanel courseId={activeCourse.id} userId={userId} mistakes={mistakes} value={manualMistake} onChange={setManualMistake} onSave={saveMistake} onSaved={loadDetail} onDelete={deleteMistake} loading={loading} />}
        {tab === 'diagnosis' && <DiagnosisPanel diagnosis={diagnosis} />}
        {tab === 'profile' && <ProfilePanel profile={profile} />}
      </div>
    </div>
  )
}

function Overview({ course, resources, knowledge, mistakes, suggestions }: { course: Course; resources: Resource[]; knowledge: KnowledgePoint[]; mistakes: Mistake[]; suggestions: Suggestion[] }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <Panel className="xl:row-span-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="section-kicker">学习画像快照</p>
            <h3 className="mt-1 text-2xl font-semibold text-slate-950">{course.name}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">从资料、测验、错题和计划四个入口观察当前课程状态。</p>
          </div>
          <BrainCircuit className="text-emerald-700" />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <ProgressBlock label="课程进度" value={course.progress} tone="emerald" />
          <ProgressBlock label="掌握度" value={course.mastery} tone="slate" />
        </div>
      </Panel>
      <Panel><Metric icon={<FileText />} label="资料数" value={resources.length} /></Panel>
      <Panel><Metric icon={<Target />} label="知识点" value={knowledge.length} /></Panel>
      <Panel><Metric icon={<ClipboardList />} label="错题" value={mistakes.length} /></Panel>
      <Panel><Metric icon={<MessageSquare />} label="建议数" value={suggestions.length} /></Panel>
    </div>
  )
}

function ProgressBlock({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'slate' }) {
  return (
    <div className="soft-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-semibold text-slate-950">{value}%</p>
      </div>
      <div className="mt-4 h-2 rounded-full bg-white">
        <div className={`h-2 rounded-full ${tone === 'emerald' ? 'bg-emerald-500' : 'bg-slate-700'}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700">{icon}</div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
      </div>
    </div>
  )
}

function ResourcesPanel({ courseId, resources, onChanged }: { courseId: number; resources: Resource[]; onChanged: () => Promise<void> }) {
  const [busyId, setBusyId] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  async function deleteResource(resourceId: number) {
    setBusyId(resourceId)
    setMessage('')
    try {
      await http.delete(`/api/resources/${resourceId}`)
      setMessage('资料已删除。')
      await onChanged()
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || '删除资料失败。')
    } finally {
      setBusyId(null)
    }
  }

  async function generateFromResource(resourceId: number) {
    setBusyId(resourceId)
    setMessage('')
    try {
      const result = (await http.post('/api/ai/extract-knowledge-points', { course_id: courseId, document_id: resourceId })) as unknown as { message?: string; reused?: boolean }
      setMessage(result.message || (result.reused ? '已存在这份资料的知识点。' : '已只根据这份资料生成知识点。'))
      await onChanged()
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || '生成知识点失败。')
    } finally {
      setBusyId(null)
    }
  }

  async function regenerateFromResource(resourceId: number) {
    if (!window.confirm('重新生成会删除这份资料已有知识点并覆盖为新结果，确定继续吗？')) return
    setBusyId(resourceId)
    setMessage('')
    try {
      const result = (await http.post('/api/ai/extract-knowledge-points', { course_id: courseId, document_id: resourceId, force: true })) as unknown as { message?: string }
      setMessage(result.message || '已重新生成这份资料的知识点。')
      await onChanged()
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || '重新生成知识点失败。')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">课程资料</h3>
          <p className="mt-1 text-sm text-slate-500">资料进入知识库后，问答、知识点和测验都会围绕当前课程生成。</p>
        </div>
        {message && <p className="text-sm text-slate-500">{message}</p>}
      </div>
      <div className="mt-4 grid gap-3">
        {resources.map((item) => (
          <div key={item.id} className="content-rail p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{item.title}</p>
                <p className="mt-1 text-sm text-slate-500">类型：{item.source_type || '-'} · 状态：{item.status || '-'} · 片段：{item.chunk_count}</p>
                {item.source_url && <a className="mt-2 block break-all text-sm text-emerald-700" href={item.source_url} target="_blank" rel="noreferrer">{item.source_url}</a>}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button onClick={() => void generateFromResource(item.id)} disabled={busyId === item.id || item.status !== 'ready'} className="rounded-md border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-slate-400">
                  {busyId === item.id ? <Loader2 className="animate-spin" size={16} /> : '生成/查看'}
                </button>
                <button onClick={() => void regenerateFromResource(item.id)} disabled={busyId === item.id || item.status !== 'ready'} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400">
                  重生成
                </button>
                <button onClick={() => void deleteResource(item.id)} disabled={busyId === item.id} className="rounded-md p-2 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400" title="删除资料">
                  {busyId === item.id ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                </button>
              </div>
            </div>
            {item.error_message && <p className="mt-2 text-sm text-red-600">{item.error_message}</p>}
          </div>
        ))}
        {!resources.length && (
          <div className="content-rail p-5 text-sm text-slate-500">
            暂无资料。可以到“上传/导入”添加 PDF、网页或视频，也可以先用 AI 推荐资料创建课程。
          </div>
        )}
      </div>
    </Panel>
  )
}

function KnowledgePanel({ items, loading, onGenerate }: { items: KnowledgePoint[]; loading: boolean; onGenerate: (force?: boolean) => Promise<void> }) {
  function regenerate() {
    if (!items.length || window.confirm('重新生成会删除当前课程已有知识点并覆盖为新结果，确定继续吗？')) {
      void onGenerate(true)
    }
  }

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">知识点</h3>
          <p className="mt-1 text-sm text-slate-500">已有知识点会直接复用；只有点击重新生成才会覆盖，避免每次结果变化。</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={() => void onGenerate(false)} disabled={loading} className="rounded-md border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:text-slate-400">
            {items.length ? '查看已有' : '按课程生成'}
          </button>
          <button onClick={regenerate} disabled={loading} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-400">
            {loading ? '生成中...' : '重新生成'}
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.id} className="content-rail p-4">
            <p className="font-semibold">{item.name}</p>
            <p className="mt-1 text-sm text-slate-600">{item.description || '暂无说明'}</p>
            <p className="mt-2 text-xs text-slate-500">来源：{item.source_document || '课程资料'} {item.confidence ? `可信度 ${item.confidence}%` : ''}</p>
            {item.source_excerpt && <p className="mt-2 line-clamp-2 text-xs text-slate-500">{item.source_excerpt}</p>}
          </div>
        ))}
        {!items.length && <div className="content-rail p-5 text-sm text-slate-500 md:col-span-2">暂无知识点。可以先上传资料，再按课程生成，或在“资料”里针对单份资料生成。</div>}
      </div>
    </Panel>
  )
}

function PlanPanel({
  overallPlan,
  dailyPlan,
  suggestions,
  loading,
  onGenerate,
  onFeedback,
}: {
  overallPlan: string
  dailyPlan: string
  suggestions: Suggestion[]
  loading: boolean
  onGenerate: (text?: string) => Promise<PlanGenerateResult | null>
  onFeedback: (payload: PlanFeedback) => Promise<void>
}) {
  const [planView, setPlanView] = useState<'overall' | 'today' | 'history'>('overall')
  const [goalText, setGoalText] = useState('')
  const [planDialog, setPlanDialog] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [planEditing, setPlanEditing] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [minutes, setMinutes] = useState(30)
  const [status, setStatus] = useState<PlanFeedback['status']>('studying')
  const [difficulty, setDifficulty] = useState<PlanFeedback['difficulty']>('normal')
  const overallContent = overallPlan || suggestions.find((item) => !item.title.startsWith('每日学习计划'))?.content || ''
  const planViews: Array<[typeof planView, string]> = [
    ['overall', '整体计划'],
    ['today', '今日计划'],
    ['history', '历史计划'],
  ]

  async function submitOverallPlan() {
    if (!goalText.trim() || planEditing) return
    const instruction = goalText.trim()
    setGoalText('')
    setPlanDialog((items) => [...items, { role: 'user', content: instruction }])
    setPlanEditing(true)
    setPlanDialog((items) => [...items, { role: 'assistant', content: '正在根据这条对话修改整体计划，并同步重写今日计划...' }])
    const result = await onGenerate(instruction)
    setPlanEditing(false)
    setPlanDialog((items) => {
      const withoutPending = items.filter((item) => item.content !== '正在根据这条对话修改整体计划，并同步重写今日计划...')
      return [
        ...withoutPending,
        {
          role: 'assistant',
          content: result ? '已完成：整体计划已更新，今日计划也已同步调整。' : '修改失败：AI 生成可能超时或后端暂时不可用。',
        },
      ]
    })
  }

  async function submitFeedback() {
    if (!feedback.trim()) return
    await onFeedback({ status, minutes, difficulty, feedback })
    setFeedback('')
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">个性化学习计划</h3>
          <p className="mt-1 text-sm text-slate-500">计划和对应修改入口放在一起，查看时可以直接调整。</p>
        </div>
        <button onClick={() => void onGenerate()} disabled={loading} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-400">快速生成</button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {planViews.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPlanView(key)}
            className={`rounded-md px-3 py-2 text-sm font-medium ${planView === key ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {loading && <div className="mb-4"><LoadingNotice text={planEditing ? 'AI 正在根据你的对话修改整体计划，并同步更新今日计划...' : 'AI 正在生成学习计划...'} /></div>}
        {planView === 'overall' && (
          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-700">整体计划</h4>
                <span className="text-xs text-slate-400">目标 / 阶段 / 节奏</span>
              </div>
              <div className="markdown-answer mt-2 rounded-lg bg-emerald-50 p-4">
                <ReactMarkdown>{overallContent || '暂无整体计划。请在右侧输入目标后生成。'}</ReactMarkdown>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h4 className="font-semibold">和 AI 一起修改整体计划</h4>
              <p className="mt-1 text-sm text-slate-500">写下想调整的地方，AI 会参考左侧当前计划生成完整新版计划。</p>
              <div className="mt-4 grid max-h-44 gap-2 overflow-y-auto">
                {planDialog.map((item, index) => (
                  <div key={index} className={`rounded-md px-3 py-2 text-sm ${item.role === 'user' ? 'bg-emerald-100 text-emerald-900' : 'bg-white text-slate-600'}`}>
                    {item.content}
                  </div>
                ))}
                {!planDialog.length && <p className="rounded-md bg-white px-3 py-2 text-sm text-slate-500">可以像聊天一样输入修改意见，例如“压缩到 7 天”或“每天只安排 30 分钟”。</p>}
              </div>
              <textarea
                value={goalText}
                onChange={(event) => setGoalText(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submitOverallPlan() } }}
                rows={7}
                className="mt-4 w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                placeholder="例如：把计划压缩到 7 天；每天最多 40 分钟；先做实验再看理论；增加系统调用练习。"
              />
              <button onClick={() => void submitOverallPlan()} disabled={loading || planEditing || !goalText.trim()} className="mt-3 inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400">{planEditing && <Loader2 className="animate-spin" size={16} />}{planEditing ? '正在同步...' : '发送修改并同步今日计划'}</button>
            </div>
          </div>
        )}

        {planView === 'today' && (
          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-700">今日计划</h4>
                <span className="text-xs text-slate-400">每日反馈后更新</span>
              </div>
              <div className="markdown-answer mt-2 rounded-lg bg-slate-50 p-4">
                <ReactMarkdown>{dailyPlan || '暂无今日计划。'}</ReactMarkdown>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h4 className="font-semibold">今日学习反馈</h4>
              <p className="mt-1 text-sm text-slate-500">把今天的学习状态告诉 AI，它会直接更新左侧今日计划。</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="text-sm text-slate-600">
                  状态
                  <select value={status} onChange={(event) => setStatus(event.target.value as PlanFeedback['status'])} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-emerald-500">
                    <option value="studying">学习中</option>
                    <option value="completed">已完成</option>
                    <option value="stuck">卡住了</option>
                    <option value="not_started">未开始</option>
                  </select>
                </label>
                <label className="text-sm text-slate-600">
                  分钟
                  <input type="number" min={0} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-emerald-500" />
                </label>
                <label className="text-sm text-slate-600">
                  难度
                  <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as PlanFeedback['difficulty'])} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-emerald-500">
                    <option value="easy">偏简单</option>
                    <option value="normal">适中</option>
                    <option value="hard">偏难</option>
                  </select>
                </label>
              </div>
              <textarea
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                rows={5}
                className="mt-3 w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                placeholder="例如：今天看完第一节，但矩阵乘法例题还是不会，想明天多练 3 道基础题。"
              />
              <button onClick={() => void submitFeedback()} disabled={loading || !feedback.trim()} className="mt-3 inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400">{loading && <Loader2 className="animate-spin" size={16} />}根据反馈更新今日计划</button>
            </div>
          </div>
        )}

        {planView === 'history' && (
          <div className="grid gap-3">
            {suggestions.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800">{item.title}</p>
                  {item.status && <span className="rounded-md bg-white px-2 py-1 text-xs text-slate-500">{item.status}</span>}
                </div>
                <div className="markdown-answer mt-3">
                  <ReactMarkdown>{item.content}</ReactMarkdown>
                </div>
              </div>
            ))}
            {!suggestions.length && <p className="text-sm text-slate-500">暂无历史计划。</p>}
          </div>
        )}
      </div>
    </Panel>
  )
}

function QuizPanel({
  courseId,
  userId,
  courseName,
  raw,
  questions,
  answerRecords,
  loading,
  onGenerate,
  onAnswered,
  onMistakeSaved,
}: {
  courseId: number
  userId: number
  courseName: string
  raw: string
  questions: QuizQuestion[]
  answerRecords: QuizAnswerRecord[]
  loading: boolean
  onGenerate: (text?: string) => Promise<void>
  onAnswered: () => Promise<void>
  onMistakeSaved: () => Promise<void>
}) {
  const [quizFocus, setQuizFocus] = useState('')
  const [mode, setMode] = useState<'answer' | 'practice'>('answer')
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [evaluations, setEvaluations] = useState<Record<number, string>>({})
  const [busyQuestionId, setBusyQuestionId] = useState<number | null>(null)
  const [savedMistakes, setSavedMistakes] = useState<Record<number, boolean>>({})

  async function submitQuiz(text?: string) {
    await onGenerate(text ?? quizFocus)
    setAnswers({})
    setEvaluations({})
    setSavedMistakes({})
  }

  async function evaluateAnswer(question: QuizQuestion) {
    const answer = answers[question.id]?.trim()
    if (!answer) return
    setBusyQuestionId(question.id)
    try {
      const result = (await http.post('/api/quiz/evaluate-answer', {
        user_id: userId,
        course_id: courseId,
        question_id: question.id,
        student_answer: answer,
      })) as unknown as { analysis: string; answer_record_id: number }
      setEvaluations((items) => ({ ...items, [question.id]: result.analysis }))
      await onAnswered()
    } finally {
      setBusyQuestionId(null)
    }
  }

  async function addToMistakeBook(question: QuizQuestion, reason?: string) {
    setBusyQuestionId(question.id)
    try {
      await http.post('/mistakes', {
        user_id: userId,
        course_id: courseId,
        question_id: question.id,
        mistake_type: mode === 'practice' ? 'quiz_practice' : 'quiz_review',
        ai_analysis: [
          `题目：${question.content}`,
          answers[question.id]?.trim() ? `我的答案：${answers[question.id].trim()}` : '',
          `参考答案：${question.correct_answer || '未提供'}`,
          `解析：${question.explanation || '未提供'}`,
          reason ? `AI 判定：${reason}` : '',
        ].filter(Boolean).join('\n\n'),
        weak_points: '测验中标记的薄弱点',
        suggestion: '加入错题本后复习对应知识点，并重新完成同类题。',
      })
      setSavedMistakes((items) => ({ ...items, [question.id]: true }))
      await onMistakeSaved()
    } finally {
      setBusyQuestionId(null)
    }
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">测验生成</h3>
          <p className="mt-1 text-sm text-slate-500">当前课程：{courseName}。默认按今日学习计划检测，也可以指定检测范围。</p>
        </div>
        <button onClick={() => void submitQuiz('按今日学习计划检测当前学习内容')} disabled={loading} className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-400">{loading && <Loader2 className="animate-spin" size={16} />}检测今日内容</button>
      </div>
      <div className="mt-4 inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm">
        <button onClick={() => setMode('answer')} className={`rounded-lg px-3 py-2 font-medium ${mode === 'answer' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>答案模式</button>
        <button onClick={() => setMode('practice')} className={`rounded-lg px-3 py-2 font-medium ${mode === 'practice' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>练习模式</button>
      </div>
      {loading && <div className="mt-4"><LoadingNotice text="AI 正在根据检测范围生成测试题..." /></div>}
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <label className="block text-sm font-medium text-slate-700">
          检测需求
          <textarea
            value={quizFocus}
            onChange={(event) => setQuizFocus(event.target.value)}
            rows={3}
            className="mt-2 w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-emerald-500"
            placeholder="例如：检测系统调用、进程同步；或者检测今天计划里的重点。"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => void submitQuiz()} disabled={loading} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-400">{loading && <Loader2 className="animate-spin" size={16} />}按我的需求生成</button>
          <button onClick={() => { setQuizFocus('检测今天学习计划中的核心知识点和任务完成情况'); void submitQuiz('检测今天学习计划中的核心知识点和任务完成情况') }} disabled={loading} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-white disabled:text-slate-400">今日计划</button>
          <button onClick={() => { setQuizFocus('检测最近错题暴露的薄弱点'); void submitQuiz('检测最近错题暴露的薄弱点') }} disabled={loading} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-white disabled:text-slate-400">薄弱点</button>
        </div>
      </div>
      {!questions.length && (
        <div className="markdown-answer mt-4 rounded-lg bg-slate-50 p-4">
          <ReactMarkdown>{raw ? `当前课程：${courseName}\n\n${raw}` : '当前课程还没有生成测验题。点击生成后，只会显示这门课的题目。'}</ReactMarkdown>
        </div>
      )}
      {!!questions.length && (
        <div className="mt-4 grid gap-4">
          {questions.map((question, index) => (
            <div key={question.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-emerald-700">第 {index + 1} 题</p>
                  <p className="mt-2 whitespace-pre-wrap font-medium text-slate-900">{question.content}</p>
                </div>
                <button onClick={() => void addToMistakeBook(question)} disabled={busyQuestionId === question.id || savedMistakes[question.id]} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:text-slate-400">
                  {savedMistakes[question.id] ? '已加入错题本' : '加入错题本'}
                </button>
              </div>

              {mode === 'answer' ? (
                <div className="markdown-answer mt-4 rounded-lg bg-white p-4">
                  <ReactMarkdown>{`**参考答案**\n\n${question.correct_answer || '暂无参考答案'}\n\n**解析**\n\n${question.explanation || '暂无解析'}`}</ReactMarkdown>
                </div>
              ) : (
                <div className="mt-4">
                  <textarea
                    value={answers[question.id] || ''}
                    onChange={(event) => setAnswers((items) => ({ ...items, [question.id]: event.target.value }))}
                    rows={4}
                    className="input-surface w-full resize-none px-3 py-2.5 text-sm outline-none"
                    placeholder="在这里写下你的答案，提交后 AI 会判断并给出建议。"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => void evaluateAnswer(question)} disabled={busyQuestionId === question.id || !answers[question.id]?.trim()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-400">
                      {busyQuestionId === question.id && <Loader2 className="animate-spin" size={16} />}
                      AI 判断
                    </button>
                    <button onClick={() => void addToMistakeBook(question, evaluations[question.id])} disabled={busyQuestionId === question.id || savedMistakes[question.id]} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:text-slate-400">
                      {savedMistakes[question.id] ? '已加入错题本' : '加入错题本'}
                    </button>
                  </div>
                  {evaluations[question.id] && (
                    <div className="markdown-answer mt-3 rounded-lg bg-white p-4">
                      <ReactMarkdown>{evaluations[question.id]}</ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="mt-6 border-t border-slate-200 pt-5">
        <h4 className="font-semibold text-slate-900">已保存的作答记录</h4>
        <div className="mt-3 grid gap-3">
          {answerRecords.map((record) => (
            <div key={record.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{record.question}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">我的答案：{record.student_answer || '未填写'}</p>
                </div>
                <span className={`rounded-lg px-2 py-1 text-xs font-medium ${record.is_correct ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>得分 {record.score}</span>
              </div>
              {record.ai_feedback && (
                <div className="markdown-answer mt-3 rounded-lg bg-slate-50 p-3">
                  <ReactMarkdown>{record.ai_feedback}</ReactMarkdown>
                </div>
              )}
              <p className="mt-2 text-xs text-slate-400">{record.answered_at ? new Date(record.answered_at).toLocaleString() : '暂无时间'}</p>
            </div>
          ))}
          {!answerRecords.length && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">暂无已保存作答。练习模式提交 AI 判断后会自动保存。</p>}
        </div>
      </div>
    </Panel>
  )
}

function MistakesPanel({
  courseId,
  userId,
  mistakes,
  value,
  onChange,
  onSave,
  onSaved,
  onDelete,
  loading,
}: {
  courseId: number
  userId: number
  mistakes: Mistake[]
  value: string
  onChange: (value: string) => void
  onSave: () => Promise<void>
  onSaved: () => Promise<void>
  onDelete: (mistakeId: number) => Promise<void>
  loading: boolean
}) {
  const [imageBusy, setImageBusy] = useState(false)
  const [imageMessage, setImageMessage] = useState('')
  const [ocrResult, setOcrResult] = useState<OcrMistakeResult | null>(null)
  const [questionText, setQuestionText] = useState('')
  const [studentAnswer, setStudentAnswer] = useState('')
  const [correctAnswer, setCorrectAnswer] = useState('')
  const [imageAnalysis, setImageAnalysis] = useState('')

  async function uploadMistakeImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setImageBusy(true)
    setImageMessage('正在保存图片并尝试 OCR 识别...')
    setImageAnalysis('')
    try {
      const formData = new FormData()
      formData.append('image', file)
      const result = (await http.post(`/api/ai/ocr-mistake-image?user_id=${userId}&course_id=${courseId}`, formData, { timeout: 120000 })) as unknown as OcrMistakeResult
      setOcrResult(result)
      setQuestionText(result.ocr_text)
      setImageMessage(result.message)
    } catch (error: any) {
      setImageMessage(error?.response?.data?.detail || '图片识别失败，请稍后重试。')
    } finally {
      setImageBusy(false)
      event.target.value = ''
    }
  }

  async function analyzeImageMistake() {
    if (!questionText.trim()) {
      setImageMessage('请先确认或输入题目文字。')
      return
    }
    setImageBusy(true)
    setImageMessage('AI 正在分析错题图片...')
    try {
      const result = (await http.post('/api/ai/analyze-mistake-image', {
        user_id: userId,
        course_id: courseId,
        question_text: questionText,
        student_answer: studentAnswer,
        correct_answer: correctAnswer,
        image_path: ocrResult?.image_path,
        ocr_text: ocrResult?.ocr_text,
        save_to_mistakes: true,
      }, { timeout: 300000 })) as unknown as { analysis: string; mistake_id: number | null }
      setImageAnalysis(result.analysis)
      setImageMessage(result.mistake_id ? 'AI 分析完成，已加入错题库。' : 'AI 分析完成。')
      await onSaved()
    } catch (error: any) {
      setImageMessage(error?.response?.data?.detail || 'AI 分析失败，请检查后端或稍后重试。')
    } finally {
      setImageBusy(false)
    }
  }

  return (
    <Panel>
      <h3 className="font-semibold">错题库</h3>
      <div className="mt-4 flex gap-3">
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500" placeholder="记录一道错题或薄弱点" />
        <button onClick={() => void onSave()} disabled={loading} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400">保存</button>
      </div>
      <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="font-semibold text-slate-900">上传错题图片</h4>
            <p className="mt-1 text-sm text-slate-500">先 OCR 识别图片文字，学生确认后再交给当前 AI 模型分析并加入错题库。</p>
          </div>
          <label className="secondary-action inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
            {imageBusy ? <Loader2 className="animate-spin" size={16} /> : <FileUp size={16} />}
            选择图片
            <input type="file" accept="image/*" onChange={(event) => void uploadMistakeImage(event)} className="hidden" />
          </label>
        </div>
        {imageMessage && <p className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-sm text-slate-600">{imageMessage}</p>}
        {(ocrResult || questionText) && (
          <div className="mt-4 grid gap-3">
            <label className="block text-sm font-medium text-slate-700">
              识别/确认后的题目文字
              <textarea value={questionText} onChange={(event) => setQuestionText(event.target.value)} rows={5} className="mt-2 w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-emerald-500" placeholder="OCR 没识别出来时，可以手动输入题目文字。" />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                学生答案
                <textarea value={studentAnswer} onChange={(event) => setStudentAnswer(event.target.value)} rows={3} className="mt-2 w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-emerald-500" placeholder="可选，填入学生写错的答案。" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                参考答案
                <textarea value={correctAnswer} onChange={(event) => setCorrectAnswer(event.target.value)} rows={3} className="mt-2 w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-emerald-500" placeholder="可选，有答案时填入。" />
              </label>
            </div>
            <button onClick={() => void analyzeImageMistake()} disabled={imageBusy || !questionText.trim()} className="primary-action inline-flex w-fit items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:bg-slate-400">
              {imageBusy ? <Loader2 className="animate-spin" size={16} /> : <BrainCircuit size={16} />}
              AI 分析并加入错题库
            </button>
            {imageAnalysis && (
              <div className="markdown-answer rounded-xl bg-white p-4 text-sm">
                <ReactMarkdown>{imageAnalysis}</ReactMarkdown>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mt-4 grid gap-3">
        {mistakes.map((item) => (
          <div key={item.id} className="rounded-lg border border-red-100 bg-red-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-red-700">{item.mistake_type || '错题记录'} · {item.review_status}</p>
              <button onClick={() => void onDelete(item.id)} disabled={loading} className="rounded-lg bg-white p-2 text-red-500 hover:bg-red-100 disabled:text-slate-400" title="删除错题">
                {loading ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
              </button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.ai_analysis}</p>
            {item.ocr_text && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white/70 p-3 text-xs text-slate-500">OCR/题目文字：{item.ocr_text}</p>}
            {item.weak_points && <p className="mt-2 text-sm text-slate-600">薄弱点：{item.weak_points}</p>}
            {item.suggestion && <p className="text-sm text-slate-600">建议：{item.suggestion}</p>}
          </div>
        ))}
        {!mistakes.length && <p className="text-sm text-slate-500">暂无错题。</p>}
      </div>
    </Panel>
  )
}

function DiagnosisPanel({ diagnosis }: { diagnosis: Diagnosis | null }) {
  return (
    <Panel>
      <h3 className="font-semibold">学习诊断</h3>
      {!diagnosis ? <p className="mt-4 text-sm text-slate-500">诊断加载中。</p> : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {diagnosis.items.map((item) => (
            <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between"><p>{item.label}</p><p className="font-semibold text-emerald-700">{item.value}%</p></div>
              <div className="mt-3 h-2 rounded-full bg-white"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, item.value)}%` }} /></div>
              <p className="mt-2 text-sm text-slate-500">{item.status}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function ProfilePanel({ profile }: { profile: Profile | null }) {
  return (
    <Panel>
      <h3 className="font-semibold">学生知识画像</h3>
      {!profile ? <p className="mt-4 text-sm text-slate-500">画像加载中。</p> : (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {profile.radar.map((item) => (
              <div key={item.name} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between"><p>{item.name}</p><p className="font-semibold">{item.value}%</p></div>
                <div className="mt-3 h-2 rounded-full bg-white"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, item.value)}%` }} /></div>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">{profile.conclusion}</p>
        </>
      )}
    </Panel>
  )
}

function UploadView({ userId, courses, onCoursesChanged }: { userId: number; courses: Course[]; onCoursesChanged: () => Promise<void> }) {
  const [targetMode, setTargetMode] = useState<'existing' | 'new'>('existing')
  const [selectedCourseId, setSelectedCourseId] = useState<number | ''>(courses[0]?.id || '')
  const [courseName, setCourseName] = useState('')
  const [learningGoal, setLearningGoal] = useState('')
  const [fileName, setFileName] = useState('')
  const [videoUrls, setVideoUrls] = useState('')
  const [webUrl, setWebUrl] = useState('https://jyywiki.cn/OS/2026/')
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [message, setMessage] = useState('成功导入资料后才会生成或保留课程。')
  const [activeImportKind, setActiveImportKind] = useState<'docling' | 'normal' | null>(null)
  const [lastResource, setLastResource] = useState<Resource | null>(null)
  const [recommendedResources, setRecommendedResources] = useState<RecommendedResource[]>([])
  const [recommendedCourseId, setRecommendedCourseId] = useState<number | null>(null)

  useEffect(() => {
    if (courses.length && !courses.some((course) => course.id === Number(selectedCourseId))) {
      setSelectedCourseId(courses[0].id)
    }
    if (!courses.length) {
      setTargetMode('new')
      setSelectedCourseId('')
    }
  }, [courses, selectedCourseId])

  function getSelectedCourse() {
    return courses.find((course) => course.id === Number(selectedCourseId)) || null
  }

  async function resolveCourseForResource(fallbackName: string, description: string) {
    if (targetMode === 'existing') {
      const selected = getSelectedCourse()
      if (!selected) {
        throw new Error('请先选择要加入的已有课程，或切换为新建课程。')
      }
      return { course: selected, created: false }
    }

    const name = courseName.trim() || fallbackName
    const existing = courses.find((course) => course.name === name)
    if (existing) return { course: existing, created: false }
    const course = (await http.post('/courses', { user_id: userId, name, description })) as unknown as Course
    return { course, created: true }
  }

  async function cleanupCourse(course: Course, created: boolean) {
    if (!created) return
    try {
      await http.delete(`/courses/${course.id}`)
      await onCoursesChanged()
    } catch {
      // Best effort cleanup.
    }
  }

  async function uploadFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setStatus('loading')
    const suffix = file.name.split('.').pop()?.toLowerCase() || ''
    const isPresentation = suffix === 'ppt' || suffix === 'pptx'
    const parser = isPresentation ? 'docling' : 'pymupdf'
    setActiveImportKind(parser === 'docling' ? 'docling' : 'normal')
    setMessage(isPresentation ? '正在用 Docling 解析 PPT/PPTX，可能较慢...' : '正在用 PyMuPDF 快速解析 PDF...')
    const finalName = file.name.replace(/\.[^.]+$/, '') || '未命名课程'
    const formData = new FormData()
    formData.append('file', file)
    let createdCourse: Course | null = null
    let created = false
    try {
      const result = await resolveCourseForResource(finalName, `由资料 ${file.name} 自动创建`)
      createdCourse = result.course
      created = result.created
      const uploadResult = await http.post(`/documents/upload?course_id=${createdCourse.id}&parser=${parser}`, formData, { timeout: 180000 }) as unknown as { chunk_count: number; message?: string }
      setStatus('success')
      setActiveImportKind(null)
      setMessage(`${isPresentation ? 'PPT/PPTX' : 'PDF'} 已加入《${createdCourse.name}》，生成 ${uploadResult.chunk_count} 个知识片段。`)
      await onCoursesChanged()
    } catch (error: any) {
      if (createdCourse) await cleanupCourse(createdCourse, created)
      setStatus('error')
      setActiveImportKind(null)
      setMessage(error?.response?.data?.detail || error?.message || '资料上传失败，已清理本次新建课程。')
    }
  }

  async function importVideos() {
    const urls = videoUrls.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    if (!urls.length) {
      setStatus('error')
      setMessage('请至少输入一个视频链接。')
      return
    }
    setStatus('loading')
    setActiveImportKind('normal')
    setMessage(`正在导入 ${urls.length} 个视频...`)
    const finalName = '在线视频课程'
    let createdCourse: Course | null = null
    let created = false
    try {
      const result = await resolveCourseForResource(finalName, `由在线视频资料自动创建：${urls[0]}`)
      createdCourse = result.course
      created = result.created
      const response = urls.length === 1
        ? await http.post(`/api/courses/${createdCourse.id}/resources/video`, { url: urls[0], preferred_language: 'zh', allow_transcription: false, priority: 3 }) as unknown as Resource
        : await http.post(`/api/courses/${createdCourse.id}/resources/videos/batch`, { urls, preferred_language: 'zh', allow_transcription: false, priority: 3 }) as unknown as { success_count: number; failed_count: number; results: Array<{ resource: Resource | null; error: string | null }> }

      if ('success_count' in response) {
        const firstResource = response.results.find((item) => item.resource)?.resource || null
        setLastResource(firstResource)
        if (response.success_count === 0) {
          await cleanupCourse(createdCourse, created)
          setStatus('error')
          setActiveImportKind(null)
          setMessage(response.results[0]?.error || '所有视频都导入失败，已清理本次新建课程。')
          return
        }
        setStatus('success')
        setActiveImportKind(null)
        setMessage(`批量导入完成：成功 ${response.success_count} 个，失败 ${response.failed_count} 个。`)
      } else {
        setLastResource(response)
        if (response.status !== 'ready') {
          await cleanupCourse(createdCourse, created)
          setStatus('error')
          setActiveImportKind(null)
          setMessage(response.error_message || '视频导入失败，已清理本次新建课程。')
          return
        }
        setStatus('success')
        setActiveImportKind(null)
        setMessage(`视频已加入《${createdCourse.name}》，生成 ${response.chunk_count} 个知识片段。`)
      }
      await onCoursesChanged()
    } catch (error: any) {
      if (createdCourse) await cleanupCourse(createdCourse, created)
      setStatus('error')
      setActiveImportKind(null)
      setMessage(error?.response?.data?.detail || error?.message || '视频导入失败，已清理本次新建课程。')
    }
  }

  async function importWebpage() {
    if (!webUrl.trim()) return
    setStatus('loading')
    setActiveImportKind('normal')
    setMessage('正在提取网页并构建知识库...')
    const finalName = '网页资料课程'
    let createdCourse: Course | null = null
    let created = false
    try {
      const result = await resolveCourseForResource(finalName, `由网页资料自动创建：${webUrl}`)
      createdCourse = result.course
      created = result.created
      const resource = (await http.post(`/api/courses/${createdCourse.id}/resources/webpage`, { url: webUrl, priority: 3 })) as unknown as Resource
      setLastResource(resource)
      if (resource.status !== 'ready') {
        await cleanupCourse(createdCourse, created)
        setStatus('error')
        setActiveImportKind(null)
        setMessage(resource.error_message || '网页导入失败，已清理本次新建课程。')
        return
      }
      setStatus('success')
      setActiveImportKind(null)
      setMessage(`网页已加入《${createdCourse.name}》：${resource.title}，生成 ${resource.chunk_count} 个知识片段。`)
      await onCoursesChanged()
    } catch (error: any) {
      if (createdCourse) await cleanupCourse(createdCourse, created)
      setStatus('error')
      setActiveImportKind(null)
      setMessage(error?.response?.data?.detail || error?.message || '网页导入失败，已清理本次新建课程。')
    }
  }

  async function createCourseWithAiResources() {
    if (targetMode !== 'new') {
      setStatus('error')
      setMessage('无资料 AI 推荐会创建新课程，请先切换到“新建课程”。')
      return
    }
    const finalName = courseName.trim()
    if (!finalName) {
      setStatus('error')
      setMessage('请先填写课程名称，再创建无资料课程。')
      return
    }
    setStatus('loading')
    setActiveImportKind('normal')
    setMessage('AI 正在生成推荐资料清单...')
    setRecommendedResources([])
    try {
      const recommendation = (await http.post('/api/ai/recommend-course-resources', {
        user_id: userId,
        course_name: finalName,
        learning_goal: learningGoal,
      }, { timeout: 120000 })) as unknown as { summary: string; resources: RecommendedResource[] }
      const createdCourse = (await http.post('/courses', {
        user_id: userId,
        name: finalName,
        description: `${learningGoal.trim() || recommendation.summary}\n\nAI 推荐资料：${recommendation.resources.map((item) => item.title).join('；')}`,
      })) as unknown as Course
      setRecommendedResources(recommendation.resources)
      setRecommendedCourseId(createdCourse.id)
      setStatus('success')
      setActiveImportKind(null)
      setMessage(`课程已创建：${finalName}。请按下方推荐清单继续上传 PDF、导入网页或视频。`)
      await onCoursesChanged()
    } catch (error: any) {
      setStatus('error')
      setActiveImportKind(null)
      setMessage(error?.response?.data?.detail || '无资料课程创建失败，请检查 AI 设置或稍后重试。')
    }
  }

  async function addRecommendedResource(item: RecommendedResource, index: number) {
    if (!recommendedCourseId) {
      setStatus('error')
      setMessage('请先用 AI 推荐创建课程，再加入资料。')
      return
    }
    if (!item.url) {
      setStatus('error')
      setMessage('这条推荐没有直接网址，不能自动加入课程。请先打开真实资料页面后，在“导入网页资料”中粘贴网址。')
      return
    }
    setStatus('loading')
    setActiveImportKind('normal')
    setMessage(`正在加入资料：${item.title}`)
    try {
      const resource = (await http.post(`/api/courses/${recommendedCourseId}/resources/webpage`, { url: item.url, priority: 3 })) as unknown as Resource
      setLastResource(resource)
      if (resource.status !== 'ready') {
        setStatus('error')
        setActiveImportKind(null)
        setMessage(resource.error_message || '资料加入失败，请核对网址后重试。')
        return
      }
      setRecommendedResources((items) => items.filter((_, itemIndex) => itemIndex !== index))
      setStatus('success')
      setActiveImportKind(null)
      setMessage(`已加入课程资料：${resource.title}`)
      await onCoursesChanged()
    } catch (error: any) {
      setStatus('error')
      setActiveImportKind(null)
      setMessage(error?.response?.data?.detail || '资料加入失败，请核对网址后重试。')
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-700">资料入口</p>
          <h2 className="mt-1 text-3xl font-semibold text-slate-950">上传/导入资料</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">先选择加入已有课程，或切换为新建课程，再上传 PDF/PPT、导入视频或网页。</p>
        </div>
        <div className={`rounded-2xl border px-4 py-3 text-sm ${statusClass(status)}`}>
          {status === 'loading' ? '处理中' : status === 'success' ? '最近成功' : status === 'error' ? '需要处理' : '等待导入'}
        </div>
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="grid gap-5">
          <Panel className="bg-white/92">
            <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
              <div>
                <p className="text-sm font-medium text-slate-800">资料加入到</p>
                <div className="mt-2 grid grid-cols-2 rounded-2xl bg-slate-100 p-1 text-sm font-semibold">
                  <button type="button" onClick={() => setTargetMode('existing')} className={`rounded-xl px-3 py-2 ${targetMode === 'existing' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}>
                    已有课程
                  </button>
                  <button type="button" onClick={() => setTargetMode('new')} className={`rounded-xl px-3 py-2 ${targetMode === 'new' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}>
                    新建课程
                  </button>
                </div>
              </div>
              {targetMode === 'existing' ? (
                <label className="block text-sm font-medium">
                  选择课程
                  <select value={selectedCourseId} onChange={(event) => setSelectedCourseId(Number(event.target.value) || '')} className="input-surface mt-2 w-full px-3 py-2.5 outline-none">
                    {courses.length ? courses.map((course) => (
                      <option key={course.id} value={course.id}>{course.name}</option>
                    )) : <option value="">暂无课程，请先新建课程</option>}
                  </select>
                </label>
              ) : (
                <label className="block text-sm font-medium">
                  新课程名称
                  <input value={courseName} onChange={(event) => setCourseName(event.target.value)} placeholder="不填则使用资料名称" className="input-surface mt-2 w-full px-3 py-2.5 outline-none" />
                </label>
              )}
            </div>
          </Panel>
          <Panel>
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><BrainCircuit /></div>
              <div>
                <h3 className="text-lg font-semibold text-slate-950">无资料创建课程</h3>
                <p className="text-sm text-slate-500">先创建课程，AI 罗列建议加入的资料，后续再补充 PDF、网页或视频。</p>
              </div>
            </div>
            <textarea
              value={learningGoal}
              onChange={(event) => setLearningGoal(event.target.value)}
              rows={3}
              placeholder="学习目标，例如：30 天掌握操作系统基础并完成实验。"
              className="input-surface mt-4 w-full resize-none px-3 py-2.5 outline-none"
            />
            <button onClick={() => void createCourseWithAiResources()} disabled={status === 'loading'} className="primary-action mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:bg-slate-400">
              {status === 'loading' ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
              AI 推荐并创建课程
            </button>
            {recommendedResources.length > 0 && (
              <div className="mt-4 grid gap-3">
                {recommendedResources.map((item, index) => (
                  <div key={`${item.resource_type}-${item.title}`} className="soft-card p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-slate-800">{item.title}</p>
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-white px-2 py-1 text-xs text-slate-600">{item.resource_type}</span>
                        <button
                          type="button"
                          onClick={() => setRecommendedResources((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:text-red-600"
                          title="删除这条推荐"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-slate-600">{item.reason}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-500">搜索关键词：{item.keyword}</span>
                      {item.url ? (
                        <>
                          <a href={item.url} target="_blank" rel="noreferrer" className="rounded-lg border border-emerald-200 bg-white px-2 py-1 font-medium text-emerald-700 hover:bg-emerald-50">
                            打开网址
                          </a>
                          <button type="button" onClick={() => void addRecommendedResource(item, index)} disabled={status === 'loading'} className="rounded-lg bg-emerald-600 px-2 py-1 font-medium text-white hover:bg-emerald-700 disabled:bg-slate-400">
                            加入课程
                          </button>
                        </>
                      ) : (
                        <span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-500">暂无直接网址</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel>
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><FileText /></div>
              <div>
                <h3 className="text-lg font-semibold text-slate-950">上传 PDF / PPT</h3>
                <p className="text-sm text-slate-500">上传成功后才会生成或保留课程。PPT/PPTX 使用 Docling 解析。</p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-semibold">PDF 使用 PyMuPDF 快速解析</p>
              <p className="mt-1 text-xs leading-5 text-emerald-800">适合当前 RAG 问答和知识点生成；Docling PDF 入口已关闭，避免上传后长时间卡住。PPT/PPTX 仍使用 Docling。</p>
            </div>
            <label className="primary-action mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold">
              <FileUp size={16} />
              选择文件
              <input type="file" accept=".pdf,.ppt,.pptx" className="hidden" onChange={uploadFile} />
            </label>
            <p className="mt-2 text-sm text-slate-500">{fileName || '尚未选择文件，支持 PDF、PPT、PPTX'}</p>
          </Panel>
          <Panel>
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Video /></div>
              <div>
                <h3 className="text-lg font-semibold text-slate-950">导入在线视频</h3>
                <p className="text-sm text-slate-500">一行一个链接；全部失败时会删除本次新建课程。</p>
              </div>
            </div>
            <textarea value={videoUrls} onChange={(event) => setVideoUrls(event.target.value)} rows={5} placeholder="https://www.bilibili.com/video/BV.../\nhttps://www.youtube.com/watch?v=..." className="input-surface mt-4 w-full resize-none px-3 py-2.5 outline-none" />
            <button onClick={() => void importVideos()} disabled={status === 'loading'} className="primary-action mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:bg-slate-400">
              {status === 'loading' ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
              导入视频
            </button>
          </Panel>
          <Panel>
            <h3 className="text-lg font-semibold text-slate-950">导入网页资料</h3>
            <p className="mt-1 text-sm text-slate-500">例如课程主页、讲义页面。导入失败不会保留空课程。</p>
            <input value={webUrl} onChange={(event) => setWebUrl(event.target.value)} className="input-surface mt-4 w-full px-3 py-2.5 outline-none" />
            <button onClick={() => void importWebpage()} disabled={status === 'loading'} className="primary-action mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:bg-slate-400">
              {status === 'loading' ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
              导入网页
            </button>
          </Panel>
        </div>
        <Panel className="h-fit xl:sticky xl:top-28">
          <h3 className="text-lg font-semibold text-slate-950">导入状态</h3>
          <div className="mt-4">
            {status === 'loading' && activeImportKind === 'docling' ? (
              <DoclingParsingNotice message={message} />
            ) : (
              <div className={`rounded-2xl border p-4 ${statusClass(status)}`}>
                <div className="flex gap-3">
                  {status === 'loading' ? <Loader2 className="animate-spin" /> : status === 'success' ? <CheckCircle2 /> : status === 'error' ? <AlertCircle /> : <FileText />}
                  <p className="text-sm">{message}</p>
                </div>
              </div>
            )}
          </div>
          {status === 'loading' && activeImportKind === 'docling' && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
              <div className="rounded-xl bg-white px-2 py-2 shadow-sm">结构分析</div>
              <div className="rounded-xl bg-white px-2 py-2 shadow-sm">内容抽取</div>
              <div className="rounded-xl bg-white px-2 py-2 shadow-sm">写入知识库</div>
            </div>
          )}
          {lastResource && (
            <div className="soft-card mt-4 p-4 text-sm">
              <p className="font-semibold">{lastResource.title}</p>
              <p className="mt-1 text-slate-500">类型：{lastResource.source_type || '-'}，状态：{lastResource.status || '-'}，片段：{lastResource.chunk_count}</p>
              {lastResource.error_message && <p className="mt-2 text-red-600">{lastResource.error_message}</p>}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

function QaView({ course, userId, onMistakeSaved }: { course: Course | null; userId: number; onMistakeSaved: () => Promise<void> }) {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<ChatSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [savingMistakeId, setSavingMistakeId] = useState<number | string | null>(null)
  const [mistakeMessage, setMistakeMessage] = useState('')

  async function loadSessions(preferredSessionId?: number | null) {
    if (!course) return
    const result = (await http.get(`/qa/sessions?user_id=${userId}&course_id=${course.id}`)) as unknown as ChatSession[]
    setSessions(result)
    const nextSessionId = preferredSessionId !== undefined ? preferredSessionId : activeSessionId || result[0]?.id || null
    setActiveSessionId(nextSessionId)
    if (nextSessionId) await loadMessages(nextSessionId)
  }

  async function loadMessages(sessionId: number) {
    if (!course) return
    setHistoryLoading(true)
    try {
      const result = (await http.get(`/qa/messages?user_id=${userId}&course_id=${course.id}&session_id=${sessionId}`)) as unknown as ChatMessage[]
      setMessages(result)
      setActiveSessionId(sessionId)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function createSession() {
    if (!course) return
    const session = (await http.post('/qa/sessions', { user_id: userId, course_id: course.id, title: '新对话' })) as unknown as ChatSession
    setQuestion('')
    setMessages([])
    await loadSessions(session.id)
  }

  async function deleteSession(sessionId: number) {
    if (!course) return
    await http.delete(`/qa/sessions/${sessionId}?user_id=${userId}`)
    setMessages([])
    setActiveSessionId(null)
    await loadSessions(null)
  }

  async function searchHistory(keyword: string) {
    setSearchKeyword(keyword)
    if (!course || !keyword.trim()) {
      setSearchResults([])
      return
    }
    const result = (await http.get(`/qa/messages/search?user_id=${userId}&course_id=${course.id}&keyword=${encodeURIComponent(keyword.trim())}`)) as unknown as ChatSearchResult[]
    setSearchResults(result)
  }

  async function ask() {
    if (!course || !question.trim()) return
    const current = question.trim()
    setQuestion('')
    setMessages((items) => [...items, { id: `u-${Date.now()}`, role: 'user', content: current }])
    setLoading(true)
    try {
      const result = (await http.post('/qa/ask', { question: current, course_id: course.id, user_id: userId, session_id: activeSessionId })) as unknown as { answer: string; assistant_message_id: number }
      setMessages((items) => [...items, { id: result.assistant_message_id, role: 'assistant', content: result.answer }])
      await loadSessions(activeSessionId || undefined)
    } catch (error: any) {
      setMessages((items) => [...items, { id: `e-${Date.now()}`, role: 'assistant', content: error?.response?.data?.detail || '问答失败' }])
    } finally {
      setLoading(false)
    }
  }

  async function saveAnswerAsMistake(message: ChatMessage, previousQuestion?: string) {
    if (!course || message.role !== 'assistant') return
    setSavingMistakeId(message.id)
    setMistakeMessage('')
    try {
      await http.post('/mistakes', {
        user_id: userId,
        course_id: course.id,
        mistake_type: 'qa_review',
        ai_analysis: `来自 AI 问答的复盘记录\n\n学生问题：\n${previousQuestion || '未记录'}\n\nAI 回答：\n${message.content}`,
        weak_points: '由学生从 AI 问答加入错题库',
        suggestion: '回到原问题和课程资料核对，整理成自己的订正笔记。',
      })
      setMistakeMessage('已加入当前课程错题库。')
      await onMistakeSaved()
    } catch (error: any) {
      setMistakeMessage(error?.response?.data?.detail || '加入错题库失败。')
    } finally {
      setSavingMistakeId(null)
    }
  }

  useEffect(() => {
    setQuestion('')
    setMessages([])
    setSessions([])
    setActiveSessionId(null)
    setSearchKeyword('')
    setSearchResults([])
    setMistakeMessage('')
    void loadSessions()
  }, [course?.id])

  if (!course) return <Panel>请先成功导入资料生成课程。</Panel>

  return (
    <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
      <Panel>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">对话历史</h3>
            <p className="mt-1 text-xs text-slate-500">{course.name}</p>
          </div>
          <button onClick={() => void createSession()} className="grid h-9 w-9 place-items-center rounded-md bg-emerald-600 text-white" title="新建对话">
            <Plus size={16} />
          </button>
        </div>

        <label className="mt-4 flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2">
          <Search size={16} className="text-slate-400" />
          <input value={searchKeyword} onChange={(event) => void searchHistory(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="搜索历史对话" />
        </label>

        {searchKeyword.trim() ? (
          <div className="mt-4 grid gap-2">
            {searchResults.map((item) => (
              <button key={`${item.session_id}-${item.id}`} onClick={() => void loadMessages(item.session_id)} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-left hover:border-emerald-300">
                <p className="text-xs font-semibold text-emerald-700">{item.session_title}</p>
                <p className="mt-1 line-clamp-3 text-sm text-slate-600">{item.content}</p>
              </button>
            ))}
            {!searchResults.length && <p className="text-sm text-slate-500">没有匹配的历史记录。</p>}
          </div>
        ) : (
          <div className="mt-4 grid gap-2">
            {sessions.map((session) => (
              <div key={session.id} className={`flex items-start gap-2 rounded-md border p-2 ${activeSessionId === session.id ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                <button onClick={() => void loadMessages(session.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium text-slate-800">{session.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{session.updated_at ? new Date(session.updated_at).toLocaleString() : '暂无时间'}</p>
                </button>
                <button onClick={() => void deleteSession(session.id)} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600" title="删除对话">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {!sessions.length && <p className="text-sm text-slate-500">暂无历史对话。</p>}
          </div>
        )}
      </Panel>

      <Panel>
        <h3 className="font-semibold">AI 问答</h3>
        <p className="mt-1 text-sm text-slate-500">当前课程：{course.name}</p>
        {mistakeMessage && <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{mistakeMessage}</p>}
        <div className="mt-4 grid max-h-[520px] gap-3 overflow-y-auto pr-1">
          {historyLoading && <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">正在加载历史...</div>}
          {messages.map((message, index) => (
            <div key={message.id} className={`rounded-lg p-4 ${message.role === 'user' ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50'}`}>
              <ReactMarkdown>{message.content}</ReactMarkdown>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {message.created_at && <p className="text-xs text-slate-400">{new Date(message.created_at).toLocaleString()}</p>}
                {message.role === 'assistant' && (
                  <button
                    onClick={() => void saveAnswerAsMistake(message, messages[index - 1]?.role === 'user' ? messages[index - 1].content : '')}
                    disabled={savingMistakeId === message.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-100 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:text-slate-400"
                  >
                    {savingMistakeId === message.id ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />}
                    加入错题本
                  </button>
                )}
              </div>
            </div>
          ))}
          {!messages.length && !historyLoading && <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">选择一个历史对话，或新建对话后开始提问。</div>}
          {loading && <LoadingNotice text="AI 正在检索课程资料并生成回答..." />}
        </div>
        <div className="mt-4 flex gap-3">
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask() } }} rows={3} className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500" placeholder="输入问题，Enter 发送" />
          <button onClick={() => void ask()} disabled={loading} className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-400">
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
            {loading ? '回答中' : '发送'}
          </button>
        </div>
      </Panel>
    </div>
  )
}

function SettingsView() {
  const providerPresets = [
    { value: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
    { value: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    { value: 'qwen', label: '通义千问 DashScope', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    { value: 'siliconflow', label: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
    { value: 'custom', label: '自定义 OpenAI 兼容接口', baseUrl: '', model: '' },
  ]
  const [apiKey, setApiKey] = useState('')
  const [provider, setProvider] = useState('deepseek')
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com')
  const [model, setModel] = useState('deepseek-chat')
  const [current, setCurrent] = useState<AIConfig | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const result = (await http.get('/settings/ai')) as unknown as AIConfig
        setCurrent(result)
        if (result.provider !== 'mock') setProvider(result.provider)
        setBaseUrl(result.base_url)
        setModel(result.model)
      } catch {
        setMessage('AI 设置读取失败，请确认后端已启动。')
      }
    }
    void load()
  }, [])

  function applyPreset(nextProvider: string) {
    setProvider(nextProvider)
    const preset = providerPresets.find((item) => item.value === nextProvider)
    if (!preset) return
    if (preset.baseUrl) setBaseUrl(preset.baseUrl)
    if (preset.model) setModel(preset.model)
  }

  async function save() {
    if (!apiKey.trim()) {
      setMessage('请输入 API Key')
      return
    }
    if (!baseUrl.trim() || !model.trim()) {
      setMessage('请填写 Base URL 和模型名')
      return
    }
    const result = (await http.post('/settings/ai', {
      provider,
      api_key: apiKey,
      base_url: baseUrl,
      model,
    })) as unknown as AIConfig
    setCurrent(result)
    setApiKey('')
    setMessage(`AI 设置已保存：${result.provider} / ${result.model}`)
  }

  return (
    <Panel>
      <h2 className="text-xl font-semibold">设置</h2>
      <p className="mt-2 text-sm text-slate-500">支持 DeepSeek、OpenAI、通义千问、硅基流动，以及其他 OpenAI 兼容接口。</p>
      {current && (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 text-sm text-slate-700">
          当前：{current.provider} · {current.model} · {current.has_api_key ? '已配置 Key' : '未配置 Key'}
        </div>
      )}
      <label className="mt-4 block text-sm font-medium">
        模型服务
        <select value={provider} onChange={(event) => applyPreset(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500">
          {providerPresets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="mt-4 block text-sm font-medium">
        Base URL
        <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500" />
      </label>
      <label className="mt-4 block text-sm font-medium">
        模型名
        <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="deepseek-chat / gpt-4o-mini / qwen-plus" className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500" />
      </label>
      <label className="mt-4 block text-sm font-medium">
        API Key
        <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500" />
      </label>
      <button onClick={() => void save()} className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">保存</button>
      {message && <p className="mt-3 text-sm text-slate-500">{message}</p>}
    </Panel>
  )
}

export default App
