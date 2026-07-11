import React, { useCallback, useEffect, useState } from 'react'
import {
  BrainCircuit,
  ClipboardList,
  FileText,
  MessageSquare,
  Target,
} from 'lucide-react'
import { http } from '../api/http'
import { type Course } from '../data'
import { type DetailTab, type Resource, type KnowledgePoint, type Suggestion, type Mistake, type Diagnosis, type Profile, type PlanGenerateResult, type QuizQuestion, type QuizAnswerRecord, type PlanFeedback, getErrorCode, getErrorMessage, localDateString, Panel } from '../shared'
import { ResourcesPanel, KnowledgePanel } from './ResourcesPanels'
import { PlanPanel, QuizPanel } from './PlanQuizPanels'
import { MistakesPanel, DiagnosisPanel, ProfilePanel } from './InsightPanels'
import { QaView } from './QaView'


export function CourseDetailView({ course, userId }: { course: Course | null; userId: number }) {
  const courseId = course?.id
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

  const loadDetail = useCallback(async () => {
    if (!courseId) return
    const failures: string[] = []
    const loadSection = async (label: string, request: () => Promise<unknown>, apply: (data: unknown) => void) => {
      try {
        apply(await request())
      } catch (error: unknown) {
        failures.push(`${label}：${getErrorMessage(error, '加载失败')}`)
      }
    }

    await Promise.all([
      loadSection('资料', () => http.get(`/api/courses/${courseId}/resources`), (data) => setResources(data as Resource[])),
      loadSection('知识点', () => http.get(`/courses/${courseId}/knowledge-points`), (data) => setKnowledge(data as KnowledgePoint[])),
      loadSection('学习计划', () => http.get(`/courses/${courseId}/learning-suggestions?user_id=${userId}`), (data) => {
        const suggestionItems = data as Suggestion[]
        const todayTitle = `每日学习计划 ${localDateString()}`
        const todayPlan = suggestionItems.find((item) => item.title === todayTitle) || suggestionItems.find((item) => item.title.startsWith('每日学习计划'))
        setSuggestions(suggestionItems)
        setOverallPlan(suggestionItems.find((item) => !item.title.startsWith('每日学习计划'))?.content || '')
        setDailyPlan(todayPlan?.content || '')
      }),
      loadSection('错题库', () => http.get(`/mistakes?user_id=${userId}&course_id=${courseId}`), (data) => setMistakes(data as Mistake[])),
      loadSection('学习诊断', () => http.get(`/courses/${courseId}/diagnosis?user_id=${userId}`), (data) => setDiagnosis(data as Diagnosis)),
      loadSection('学习画像', () => http.get(`/courses/${courseId}/profile?user_id=${userId}`), (data) => setProfile(data as Profile)),
      loadSection('测验记录', () => http.get(`/api/quiz/answer-records?user_id=${userId}&course_id=${courseId}`), (data) => setQuizAnswerRecords(data as QuizAnswerRecord[])),
    ])

    if (failures.length) {
      setNotice(`部分模块加载失败：${failures.slice(0, 3).join('；')}`)
    } else {
      setNotice((current) => current.startsWith('部分模块加载失败') || current.startsWith('课程数据加载失败') ? '' : current)
    }
  }, [courseId, userId])

  useEffect(() => {
    queueMicrotask(() => void loadDetail())
  }, [loadDetail])

  if (!course) return <Panel>请先成功导入资料生成课程。</Panel>
  const activeCourse = course

  async function generateCourseKnowledge(force = false) {
    setLoading(true)
    try {
      const result = (await http.post('/api/ai/extract-knowledge-points', { user_id: userId, course_id: activeCourse.id, force })) as unknown as { message?: string; reused?: boolean }
      setNotice(result.message || (result.reused ? '已显示已有知识点。' : '已根据课程资料生成知识点。'))
      await loadDetail()
    } catch (error: unknown) {
      setNotice(getErrorMessage(error, '知识点生成失败，请稍后再试。'))
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
    } catch (error: unknown) {
      setNotice(getErrorCode(error) === 'ECONNABORTED' ? 'AI 生成时间较长，请稍后重试。' : getErrorMessage(error, '整体计划修改失败，请稍后再试。'))
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
    } catch (error: unknown) {
      setNotice(getErrorMessage(error, '今日学习计划更新失败，请稍后再试。'))
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
    } catch (error: unknown) {
      setNotice(getErrorMessage(error, '测验生成失败，请稍后再试。'))
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
    } catch (error: unknown) {
      setNotice(getErrorMessage(error, '错题保存失败，请稍后再试。'))
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
    } catch (error: unknown) {
      setNotice(getErrorMessage(error, '错题删除失败，请稍后再试。'))
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
          <div className="rounded-2xl border border-emerald-100 bg-white/76 p-3"><p className="text-xs text-slate-500">进度</p><p className="mt-1 text-xl font-semibold text-slate-950">{activeCourse.has_progress_evidence ? `${activeCourse.progress}%` : '待开始'}</p></div>
          <div className="rounded-2xl border border-emerald-100 bg-white/76 p-3"><p className="text-xs text-slate-500">掌握</p><p className="mt-1 text-xl font-semibold text-slate-950">{activeCourse.has_mastery_evidence ? `${activeCourse.mastery}%` : '待评估'}</p></div>
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

export function Overview({ course, resources, knowledge, mistakes, suggestions }: { course: Course; resources: Resource[]; knowledge: KnowledgePoint[]; mistakes: Mistake[]; suggestions: Suggestion[] }) {
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
          <ProgressBlock label="课程进度" value={course.progress} available={course.has_progress_evidence} tone="emerald" />
          <ProgressBlock label="掌握度" value={course.mastery} available={course.has_mastery_evidence} tone="slate" />
        </div>
      </Panel>
      <Panel><Metric icon={<FileText />} label="资料数" value={resources.length} /></Panel>
      <Panel><Metric icon={<Target />} label="知识点" value={knowledge.length} /></Panel>
      <Panel><Metric icon={<ClipboardList />} label="错题" value={mistakes.length} /></Panel>
      <Panel><Metric icon={<MessageSquare />} label="建议数" value={suggestions.length} /></Panel>
    </div>
  )
}

export function ProgressBlock({ label, value, available, tone }: { label: string; value: number; available: boolean; tone: 'emerald' | 'slate' }) {
  return (
    <div className="soft-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-semibold text-slate-950">{available ? `${value}%` : label === '课程进度' ? '待开始' : '待评估'}</p>
      </div>
      <div className="mt-4 h-2 rounded-full bg-white" aria-label={available ? `${label} ${value}%` : `${label} 尚无学习证据`}>
        <div className={`h-2 rounded-full ${available ? tone === 'emerald' ? 'bg-emerald-500' : 'bg-slate-700' : 'bg-slate-200'}`} style={{ width: `${available ? Math.min(100, value) : 100}%` }} />
      </div>
      {!available && <p className="mt-2 text-xs text-slate-500">完成测验或学习反馈后自动生成</p>}
    </div>
  )
}

export function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
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
