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
  review_status: string
}
type Diagnosis = { progress: number; mastery: number; items: Array<{ label: string; value: number; status: string }> }
type Profile = { radar: Array<{ name: string; value: number }>; conclusion: string }
type ChatMessage = { id: number | string; role: 'user' | 'assistant'; content: string; created_at?: string }
type ChatSession = { id: number; title: string; course_id: number; created_at: string; updated_at: string }
type ChatSearchResult = ChatMessage & { session_id: number; session_title: string }
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

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">{children}</section>
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
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6">
          <section className="grid w-full gap-8 lg:grid-cols-[1fr_420px]">
            <div className="flex flex-col justify-center">
              <p className="text-sm font-semibold text-emerald-300">AI Learning MVP</p>
              <h1 className="mt-4 text-4xl font-bold tracking-tight">个性化异步学习平台</h1>
              <p className="mt-4 max-w-xl text-slate-300">课程资料、RAG 问答、错题诊断、知识画像和学习计划形成完整学习闭环。</p>
            </div>
            <form onSubmit={submitAuth} className="rounded-lg border border-slate-800 bg-white p-6 text-slate-900 shadow-xl">
              <h2 className="text-xl font-semibold">{authMode === 'login' ? '学生登录' : '注册账号'}</h2>
              <label className="mt-5 block text-sm font-medium">
                账号
                <input value={username} onChange={(event) => setUsername(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500" />
              </label>
              <label className="mt-4 block text-sm font-medium">
                密码
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500" />
              </label>
              {authMessage && <p className={`mt-3 rounded-md px-3 py-2 text-sm ${authMessage.includes('成功') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{authMessage}</p>}
              <button disabled={authLoading} className="mt-5 w-full rounded-md bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-400">{authLoading ? '处理中...' : authMode === 'login' ? '登录' : '注册'}</button>
              <button type="button" disabled={authLoading} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="mt-3 w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100">
                {authMode === 'login' ? '注册账号' : '返回登录'}
              </button>
            </form>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <aside className="fixed inset-y-0 left-0 w-64 overflow-y-auto bg-slate-950 p-5 text-white">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-emerald-500 font-bold">学</div>
          <div>
            <p className="font-semibold">智学诊断台</p>
            <p className="text-xs text-slate-400">AI Learning MVP</p>
          </div>
        </div>
        <nav className="mt-8 grid gap-2">
          <SideButton active={mainView === 'courses'} icon={<BookOpen size={18} />} label="课程" onClick={() => setMainView('courses')} />
          <div className={`rounded-md ${mainView === 'detail' ? 'bg-slate-900/80' : ''}`}>
            <SideButton active={mainView === 'detail'} icon={<Layers3 size={18} />} label="课程详情" onClick={() => setMainView('detail')} />
            <div className="ml-6 mt-2 grid gap-1 border-l border-slate-800 pb-2 pl-3">
              {courses.map((course) => (
                <button key={course.id} onClick={() => openCourse(course.id)} className={`rounded-md px-3 py-2 text-left text-sm ${selectedCourse?.id === course.id && mainView === 'detail' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                  {course.name}
                </button>
              ))}
              {!courses.length && <p className="px-3 py-2 text-xs text-slate-500">暂无课程</p>}
            </div>
          </div>
          <SideButton active={mainView === 'upload'} icon={<FileUp size={18} />} label="上传/导入" onClick={() => setMainView('upload')} />
          <SideButton active={mainView === 'settings'} icon={<Settings size={18} />} label="设置" onClick={() => setMainView('settings')} />
        </nav>
      </aside>
      <section className="ml-64 min-h-screen">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-5">
          <div>
            <p className="text-sm text-slate-500">React + FastAPI + MariaDB</p>
            <h1 className="text-2xl font-semibold">{selectedCourse?.name || 'AI 学习诊断系统'}</h1>
          </div>
          <button onClick={() => setUser(null)} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
            <LogOut size={16} />
            退出
          </button>
        </header>
        <div className="p-8">
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
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${active ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-900 hover:text-white'}`}>
      {icon}
      {label}
    </button>
  )
}

function CoursesView({ courses, onOpen, onDelete }: { courses: Course[]; onOpen: (id: number) => void; onDelete: (id: number) => Promise<void> }) {
  return (
    <div>
      <h2 className="text-xl font-semibold">课程列表</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {courses.map((course) => (
          <Panel key={course.id}>
            <div className="flex items-start justify-between gap-3">
              <button onClick={() => onOpen(course.id)} className="text-left">
                <p className="font-semibold">{course.name}</p>
                <p className="mt-1 text-sm text-slate-500">{course.description || '暂无说明'}</p>
              </button>
              <button onClick={() => void onDelete(course.id)} className="rounded-md p-2 text-red-500 hover:bg-red-50" title="删除课程">
                <Trash2 size={16} />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-slate-50 p-3">进度 {course.progress}%</div>
              <div className="rounded-md bg-slate-50 p-3">掌握 {course.mastery}%</div>
            </div>
          </Panel>
        ))}
        {!courses.length && <p className="text-sm text-slate-500">暂无课程。成功导入资料后才会生成课程。</p>}
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
  const [manualMistake, setManualMistake] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  async function loadDetail() {
    if (!course) return
    const [resourceResult, pointResult, suggestionResult, mistakeResult, diagnosisResult, profileResult, dailyResult] = await Promise.all([
      http.get(`/api/courses/${course.id}/resources`),
      http.get(`/courses/${course.id}/knowledge-points`),
      http.get(`/courses/${course.id}/learning-suggestions?user_id=${userId}`),
      http.get(`/mistakes?user_id=${userId}&course_id=${course.id}`),
      http.get(`/courses/${course.id}/diagnosis?user_id=${userId}`),
      http.get(`/courses/${course.id}/profile?user_id=${userId}`),
      http.post('/api/ai/daily-learning-plan', { user_id: userId, course_id: course.id }),
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
  }

  useEffect(() => {
    setNotice('')
    void loadDetail()
  }, [course?.id])

  if (!course) return <Panel>请先成功导入资料生成课程。</Panel>
  const activeCourse = course

  async function generateCourseKnowledge() {
    setLoading(true)
    try {
      await http.post('/api/ai/extract-knowledge-points', { user_id: userId, course_id: activeCourse.id })
      setNotice('已根据课程资料生成知识点。')
      await loadDetail()
    } finally {
      setLoading(false)
    }
  }

  async function generatePlan(text?: string) {
    setLoading(true)
    try {
      const result = (await http.post('/api/ai/generate-learning-plan', { user_id: userId, course_id: activeCourse.id, text })) as unknown as { plan: string }
      setOverallPlan(result.plan)
      setNotice(text?.trim() ? '已根据你的目标生成整体学习计划。' : '学习建议已生成。')
      await loadDetail()
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

  async function generateQuiz() {
    setLoading(true)
    try {
      const result = (await http.post('/api/ai/generate-quiz', { user_id: userId, course_id: activeCourse.id, count: 5 })) as unknown as { raw: string }
      setQuizRaw(result.raw)
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">课程详情</h2>
          <p className="mt-1 text-sm text-slate-500">{activeCourse.name}</p>
        </div>
        {notice && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`rounded-md px-3 py-2 text-sm font-medium ${tab === key ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {tab === 'overview' && <Overview course={activeCourse} resources={resources} knowledge={knowledge} mistakes={mistakes} suggestions={suggestions} />}
        {tab === 'resources' && <ResourcesPanel courseId={activeCourse.id} resources={resources} onChanged={loadDetail} />}
        {tab === 'qa' && <QaView course={activeCourse} userId={userId} />}
        {tab === 'knowledge' && <KnowledgePanel items={knowledge} loading={loading} onGenerate={generateCourseKnowledge} />}
        {tab === 'plan' && <PlanPanel overallPlan={overallPlan} dailyPlan={dailyPlan} suggestions={suggestions} loading={loading} onGenerate={generatePlan} onFeedback={updatePlanWithFeedback} />}
        {tab === 'quiz' && <QuizPanel raw={quizRaw} loading={loading} onGenerate={generateQuiz} />}
        {tab === 'mistakes' && <MistakesPanel mistakes={mistakes} value={manualMistake} onChange={setManualMistake} onSave={saveMistake} loading={loading} />}
        {tab === 'diagnosis' && <DiagnosisPanel diagnosis={diagnosis} />}
        {tab === 'profile' && <ProfilePanel profile={profile} />}
      </div>
    </div>
  )
}

function Overview({ course, resources, knowledge, mistakes, suggestions }: { course: Course; resources: Resource[]; knowledge: KnowledgePoint[]; mistakes: Mistake[]; suggestions: Suggestion[] }) {
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Panel><Metric icon={<FileText />} label="资料数" value={resources.length} /></Panel>
      <Panel><Metric icon={<Target />} label="知识点" value={knowledge.length} /></Panel>
      <Panel><Metric icon={<ClipboardList />} label="错题" value={mistakes.length} /></Panel>
      <Panel><Metric icon={<BookOpen />} label="课程进度" value={`${course.progress}%`} /></Panel>
      <Panel><Metric icon={<BrainCircuit />} label="掌握度" value={`${course.mastery}%`} /></Panel>
      <Panel><Metric icon={<MessageSquare />} label="建议数" value={suggestions.length} /></Panel>
    </div>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-md bg-emerald-50 text-emerald-700">{icon}</div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
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
      await http.post('/api/ai/extract-knowledge-points', { course_id: courseId, document_id: resourceId })
      setMessage('已只根据这份资料生成知识点。')
      await onChanged()
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || '生成知识点失败。')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">课程资料</h3>
        {message && <p className="text-sm text-slate-500">{message}</p>}
      </div>
      <div className="mt-4 grid gap-3">
        {resources.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{item.title}</p>
                <p className="mt-1 text-sm text-slate-500">类型：{item.source_type || '-'} · 状态：{item.status || '-'} · 片段：{item.chunk_count}</p>
                {item.source_url && <a className="mt-2 block break-all text-sm text-emerald-700" href={item.source_url} target="_blank" rel="noreferrer">{item.source_url}</a>}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button onClick={() => void generateFromResource(item.id)} disabled={busyId === item.id || item.status !== 'ready'} className="rounded-md border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-slate-400">
                  {busyId === item.id ? <Loader2 className="animate-spin" size={16} /> : '生成知识点'}
                </button>
                <button onClick={() => void deleteResource(item.id)} disabled={busyId === item.id} className="rounded-md p-2 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400" title="删除资料">
                  {busyId === item.id ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                </button>
              </div>
            </div>
            {item.error_message && <p className="mt-2 text-sm text-red-600">{item.error_message}</p>}
          </div>
        ))}
        {!resources.length && <p className="text-sm text-slate-500">暂无资料。</p>}
      </div>
    </Panel>
  )
}

function KnowledgePanel({ items, loading, onGenerate }: { items: KnowledgePoint[]; loading: boolean; onGenerate: () => Promise<void> }) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">知识点</h3>
        <button onClick={() => void onGenerate()} disabled={loading} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-400">按课程生成</button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="font-semibold">{item.name}</p>
            <p className="mt-1 text-sm text-slate-600">{item.description || '暂无说明'}</p>
            <p className="mt-2 text-xs text-slate-500">来源：{item.source_document || '课程资料'} {item.confidence ? `可信度 ${item.confidence}%` : ''}</p>
            {item.source_excerpt && <p className="mt-2 line-clamp-2 text-xs text-slate-500">{item.source_excerpt}</p>}
          </div>
        ))}
        {!items.length && <p className="text-sm text-slate-500">暂无知识点。可以在“资料”里针对单份资料生成。</p>}
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
  onGenerate: (text?: string) => Promise<void>
  onFeedback: (payload: PlanFeedback) => Promise<void>
}) {
  const [planView, setPlanView] = useState<'overall' | 'today' | 'history'>('overall')
  const [goalText, setGoalText] = useState('')
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
    await onGenerate(goalText)
    setGoalText('')
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
        {planView === 'overall' && (
          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-700">整体计划</h4>
                <span className="text-xs text-slate-400">目标 / 阶段 / 节奏</span>
              </div>
              <div className="prose prose-sm mt-2 max-w-none rounded-lg bg-emerald-50 p-4">
                <ReactMarkdown>{overallContent || '暂无整体计划。请在右侧输入目标后生成。'}</ReactMarkdown>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h4 className="font-semibold">和 AI 一起修改整体计划</h4>
              <p className="mt-1 text-sm text-slate-500">写下想调整的地方，AI 会参考左侧当前计划生成完整新版计划。</p>
              <textarea
                value={goalText}
                onChange={(event) => setGoalText(event.target.value)}
                rows={7}
                className="mt-4 w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                placeholder="例如：把计划压缩到 7 天；每天最多 40 分钟；先做实验再看理论；增加系统调用练习。"
              />
              <button onClick={() => void submitOverallPlan()} disabled={loading} className="mt-3 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400">根据我的目标更新整体计划</button>
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
              <div className="prose prose-sm mt-2 max-w-none rounded-lg bg-slate-50 p-4">
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
              <button onClick={() => void submitFeedback()} disabled={loading || !feedback.trim()} className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400">根据反馈更新今日计划</button>
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
                <div className="prose prose-sm mt-3 max-w-none">
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

function QuizPanel({ raw, loading, onGenerate }: { raw: string; loading: boolean; onGenerate: () => Promise<void> }) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">测验生成</h3>
        <button onClick={() => void onGenerate()} disabled={loading} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-400">生成 5 道题</button>
      </div>
      <div className="prose prose-sm mt-4 max-w-none rounded-lg bg-slate-50 p-4">
        <ReactMarkdown>{raw || '点击生成测验题。后续可以继续接入答题判分。'}</ReactMarkdown>
      </div>
    </Panel>
  )
}

function MistakesPanel({ mistakes, value, onChange, onSave, loading }: { mistakes: Mistake[]; value: string; onChange: (value: string) => void; onSave: () => Promise<void>; loading: boolean }) {
  return (
    <Panel>
      <h3 className="font-semibold">错题库</h3>
      <div className="mt-4 flex gap-3">
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500" placeholder="记录一道错题或薄弱点" />
        <button onClick={() => void onSave()} disabled={loading} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400">保存</button>
      </div>
      <div className="mt-4 grid gap-3">
        {mistakes.map((item) => (
          <div key={item.id} className="rounded-lg border border-red-100 bg-red-50 p-4">
            <p className="font-semibold text-red-700">{item.mistake_type || '错题记录'} · {item.review_status}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.ai_analysis}</p>
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
  const [courseName, setCourseName] = useState('')
  const [fileName, setFileName] = useState('')
  const [videoUrls, setVideoUrls] = useState('')
  const [webUrl, setWebUrl] = useState('https://jyywiki.cn/OS/2026/')
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [message, setMessage] = useState('成功导入资料后才会生成或保留课程。')
  const [lastResource, setLastResource] = useState<Resource | null>(null)

  async function createCourseForResource(name: string, description: string) {
    const existing = courses.find((course) => course.name === name)
    const course = (await http.post('/courses', { user_id: userId, name, description })) as unknown as Course
    return { course, created: !existing }
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

  async function uploadPdf(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setStatus('loading')
    setMessage('正在上传 PDF...')
    const finalName = courseName.trim() || file.name.replace(/\.[^.]+$/, '') || '未命名课程'
    const formData = new FormData()
    formData.append('file', file)
    let createdCourse: Course | null = null
    let created = false
    try {
      const result = await createCourseForResource(finalName, `由资料 ${file.name} 自动创建`)
      createdCourse = result.course
      created = result.created
      await http.post(`/documents/upload?course_id=${createdCourse.id}`, formData)
      setStatus('success')
      setMessage(`PDF 上传成功，课程已保留：${createdCourse.name}`)
      await onCoursesChanged()
    } catch (error: any) {
      if (createdCourse) await cleanupCourse(createdCourse, created)
      setStatus('error')
      setMessage(error?.response?.data?.detail || 'PDF 上传失败，已清理本次新建课程。')
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
    setMessage(`正在导入 ${urls.length} 个视频...`)
    const finalName = courseName.trim() || '在线视频课程'
    let createdCourse: Course | null = null
    let created = false
    try {
      const result = await createCourseForResource(finalName, `由在线视频资料自动创建：${urls[0]}`)
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
          setMessage(response.results[0]?.error || '所有视频都导入失败，已清理本次新建课程。')
          return
        }
        setStatus('success')
        setMessage(`批量导入完成：成功 ${response.success_count} 个，失败 ${response.failed_count} 个。`)
      } else {
        setLastResource(response)
        if (response.status !== 'ready') {
          await cleanupCourse(createdCourse, created)
          setStatus('error')
          setMessage(response.error_message || '视频导入失败，已清理本次新建课程。')
          return
        }
        setStatus('success')
        setMessage(`视频导入成功，生成 ${response.chunk_count} 个知识片段。`)
      }
      await onCoursesChanged()
    } catch (error: any) {
      if (createdCourse) await cleanupCourse(createdCourse, created)
      setStatus('error')
      setMessage(error?.response?.data?.detail || '视频导入失败，已清理本次新建课程。')
    }
  }

  async function importWebpage() {
    if (!webUrl.trim()) return
    setStatus('loading')
    setMessage('正在提取网页并构建知识库...')
    const finalName = courseName.trim() || '网页资料课程'
    let createdCourse: Course | null = null
    let created = false
    try {
      const result = await createCourseForResource(finalName, `由网页资料自动创建：${webUrl}`)
      createdCourse = result.course
      created = result.created
      const resource = (await http.post(`/api/courses/${createdCourse.id}/resources/webpage`, { url: webUrl, priority: 3 })) as unknown as Resource
      setLastResource(resource)
      if (resource.status !== 'ready') {
        await cleanupCourse(createdCourse, created)
        setStatus('error')
        setMessage(resource.error_message || '网页导入失败，已清理本次新建课程。')
        return
      }
      setStatus('success')
      setMessage(`网页导入成功：${resource.title}，生成 ${resource.chunk_count} 个知识片段。`)
      await onCoursesChanged()
    } catch (error: any) {
      if (createdCourse) await cleanupCourse(createdCourse, created)
      setStatus('error')
      setMessage(error?.response?.data?.detail || '网页导入失败，已清理本次新建课程。')
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold">上传/导入资料</h2>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-5">
          <Panel>
            <label className="block text-sm font-medium">
              课程名称
              <input value={courseName} onChange={(event) => setCourseName(event.target.value)} placeholder="不填则使用资料名称" className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500" />
            </label>
          </Panel>
          <Panel>
            <div className="flex items-center gap-3">
              <FileText className="text-emerald-600" />
              <div>
                <h3 className="font-semibold">上传 PDF</h3>
                <p className="text-sm text-slate-500">上传成功后才会生成或保留课程。</p>
              </div>
            </div>
            <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              <FileUp size={16} />
              选择文件
              <input type="file" accept=".pdf" className="hidden" onChange={uploadPdf} />
            </label>
            <p className="mt-2 text-sm text-slate-500">{fileName || '尚未选择文件'}</p>
          </Panel>
          <Panel>
            <div className="flex items-center gap-3">
              <Video className="text-emerald-600" />
              <div>
                <h3 className="font-semibold">导入在线视频</h3>
                <p className="text-sm text-slate-500">一行一个链接；全部失败时会删除本次新建课程。</p>
              </div>
            </div>
            <textarea value={videoUrls} onChange={(event) => setVideoUrls(event.target.value)} rows={5} placeholder="https://www.bilibili.com/video/BV.../\nhttps://www.youtube.com/watch?v=..." className="mt-4 w-full resize-none rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500" />
            <button onClick={() => void importVideos()} disabled={status === 'loading'} className="mt-3 inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-400">
              {status === 'loading' ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
              导入视频
            </button>
          </Panel>
          <Panel>
            <h3 className="font-semibold">导入网页资料</h3>
            <p className="mt-1 text-sm text-slate-500">例如课程主页、讲义页面。导入失败不会保留空课程。</p>
            <input value={webUrl} onChange={(event) => setWebUrl(event.target.value)} className="mt-4 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500" />
            <button onClick={() => void importWebpage()} disabled={status === 'loading'} className="mt-3 inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-400">
              {status === 'loading' ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
              导入网页
            </button>
          </Panel>
        </div>
        <Panel>
          <h3 className="font-semibold">导入状态</h3>
          <div className={`mt-4 rounded-lg border p-4 ${statusClass(status)}`}>
            <div className="flex gap-3">
              {status === 'loading' ? <Loader2 className="animate-spin" /> : status === 'success' ? <CheckCircle2 /> : status === 'error' ? <AlertCircle /> : <FileText />}
              <p className="text-sm">{message}</p>
            </div>
          </div>
          {lastResource && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
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

function QaView({ course, userId }: { course: Course | null; userId: number }) {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<ChatSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)

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

  useEffect(() => {
    setQuestion('')
    setMessages([])
    setSessions([])
    setActiveSessionId(null)
    setSearchKeyword('')
    setSearchResults([])
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
        <div className="mt-4 grid max-h-[520px] gap-3 overflow-y-auto pr-1">
          {historyLoading && <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">正在加载历史...</div>}
          {messages.map((message) => (
            <div key={message.id} className={`rounded-lg p-4 ${message.role === 'user' ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50'}`}>
              <ReactMarkdown>{message.content}</ReactMarkdown>
              {message.created_at && <p className="mt-2 text-xs text-slate-400">{new Date(message.created_at).toLocaleString()}</p>}
            </div>
          ))}
          {!messages.length && !historyLoading && <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">选择一个历史对话，或新建对话后开始提问。</div>}
          {loading && <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">AI 正在回答...</div>}
        </div>
        <div className="mt-4 flex gap-3">
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask() } }} rows={3} className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500" placeholder="输入问题，Enter 发送" />
          <button onClick={() => void ask()} disabled={loading} className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-400">
            <Send size={16} />
            发送
          </button>
        </div>
      </Panel>
    </div>
  )
}

function SettingsView() {
  const [apiKey, setApiKey] = useState('')
  const [message, setMessage] = useState('')

  async function save() {
    if (!apiKey.trim()) {
      setMessage('请输入 DeepSeek API Key')
      return
    }
    await http.post('/settings/ai', { api_key: apiKey, base_url: 'https://api.deepseek.com', model: 'deepseek-chat' })
    setApiKey('')
    setMessage('AI 设置已保存')
  }

  return (
    <Panel>
      <h2 className="text-xl font-semibold">设置</h2>
      <label className="mt-4 block text-sm font-medium">
        DeepSeek API Key
        <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500" />
      </label>
      <button onClick={() => void save()} className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">保存</button>
      {message && <p className="mt-3 text-sm text-slate-500">{message}</p>}
    </Panel>
  )
}

export default App
