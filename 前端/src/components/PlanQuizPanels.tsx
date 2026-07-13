import ReactMarkdown from 'react-markdown'
import { useState } from 'react'
import {
  BarChart3,
  CalendarCheck2,
  Loader2,
  MessageSquareText,
  Sparkles,
} from 'lucide-react'
import { http } from '../api/http'
import { type Suggestion, type DailyLearningHistory, type KnowledgePoint, type PlanGenerateResult, type QuizQuestion, type QuizAnswerRecord, type PlanFeedback, getErrorMessage, repairMojibake, Panel, LoadingNotice, MarkdownBlock } from '../shared'

function toLocalDateString(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildStudyTimeSeries(history: DailyLearningHistory[]) {
  const minutesByDate = new Map(history.map((record) => [record.study_date, record.minutes]))
  const today = new Date()
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - 6 + index)
    const studyDate = toLocalDateString(date)
    return {
      studyDate,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      minutes: minutesByDate.get(studyDate) || 0,
    }
  })
}

function buildKnowledgeKeywords(knowledge: KnowledgePoint[], history: DailyLearningHistory[]) {
  const activityText = history.map((record) => `${record.feedback || ''}\n${record.plan || ''}`).join('\n').toLocaleLowerCase()
  return knowledge
    .filter((point) => point.name.trim())
    .map((point) => {
      const name = point.name.trim()
      const occurrences = activityText.split(name.toLocaleLowerCase()).length - 1
      return { name, weight: 4 + occurrences * 3 }
    })
    .sort((left, right) => right.weight - left.weight || left.name.localeCompare(right.name, 'zh-CN'))
    .slice(0, 18)
}

function LearningAnalytics({ history, knowledge }: { history: DailyLearningHistory[]; knowledge: KnowledgePoint[] }) {
  const series = buildStudyTimeSeries(history)
  const maxMinutes = Math.max(...series.map((item) => item.minutes), 1)
  const totalMinutes = series.reduce((total, item) => total + item.minutes, 0)
  const activeDays = series.filter((item) => item.minutes > 0).length
  const keywords = buildKnowledgeKeywords(knowledge, history)
  const maxWeight = Math.max(...keywords.map((item) => item.weight), 1)

  return (
    <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
      <section className="border-b border-slate-200 pb-8 xl:border-r xl:border-b-0 xl:pr-8 xl:pb-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><BarChart3 size={17} className="text-emerald-600" />近 7 日学习时长</div>
            <p className="mt-1 text-sm text-slate-500">仅统计已完成的每日学习记录。</p>
          </div>
          <div className="text-right text-sm text-slate-600"><strong className="text-xl text-slate-900">{totalMinutes}</strong> 分钟<br /><span className="text-xs text-slate-400">{activeDays} 个学习日</span></div>
        </div>
        <div className="mt-5 grid h-44 grid-cols-7 items-end gap-2 border-b border-slate-200 px-1">
          {series.map((item) => {
            const height = item.minutes ? `${Math.max(10, Math.round((item.minutes / maxMinutes) * 100))}%` : '2px'
            return (
              <div key={item.studyDate} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
                <span className="text-xs font-medium text-slate-500">{item.minutes || ''}</span>
                <div className="w-full max-w-10 rounded-t-sm bg-emerald-500 transition-[height] duration-300" style={{ height }} title={`${item.studyDate}: ${item.minutes} 分钟`} />
                <span className="whitespace-nowrap text-[11px] text-slate-400">{item.label}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Sparkles size={17} className="text-emerald-600" />知识点关键词云</div>
        <p className="mt-1 text-sm text-slate-500">课程知识点会因在完成反馈和当日计划中被提及而提高权重。</p>
        {keywords.length ? (
          <div className="mt-5 flex min-h-44 flex-wrap content-center items-center justify-center gap-x-4 gap-y-3 border-y border-slate-100 py-5 text-center">
            {keywords.map((keyword) => (
              <span
                key={keyword.name}
                className="break-words font-semibold leading-tight text-slate-700"
                style={{
                  color: keyword.weight === maxWeight ? '#047857' : keyword.weight > 4 ? '#0f766e' : '#475569',
                  fontSize: `${14 + Math.round((keyword.weight / maxWeight) * 13)}px`,
                }}
                title={`权重 ${keyword.weight}`}
              >
                {keyword.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-8 text-sm text-slate-500">生成课程知识点后，这里会显示学习重点。</p>
        )}
      </section>
    </div>
  )
}

export function PlanPanel({
  overallPlan,
  dailyPlan,
  suggestions,
  history,
  knowledge,
  loading,
  onGenerate,
  onFeedback,
}: {
  overallPlan: string
  dailyPlan: string
  suggestions: Suggestion[]
  history: DailyLearningHistory[]
  knowledge: KnowledgePoint[]
  loading: boolean
  onGenerate: (text?: string) => Promise<PlanGenerateResult | null>
  onFeedback: (payload: PlanFeedback) => Promise<void>
}) {
  const [planView, setPlanView] = useState<'overall' | 'today' | 'analytics' | 'history'>('overall')
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
    ['analytics', '学习洞察'],
    ['history', '历史记录'],
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
          <div className="flex items-center gap-2"><Sparkles size={18} className="text-emerald-600" /><h3 className="font-semibold">AI 学习规划</h3></div>
          <p className="mt-1 text-sm text-slate-500">根据课程资料、错题和学习反馈生成下一步安排。</p>
        </div>
        <button onClick={() => void onGenerate()} disabled={loading} className="primary-action inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold disabled:bg-slate-400"><Sparkles size={16} />AI 生成计划</button>
      </div>

      <div className="mt-5 grid border-y border-emerald-100 bg-emerald-50 sm:grid-cols-3">
        <button aria-pressed={planView === 'overall'} onClick={() => setPlanView('overall')} className={`inline-flex items-center gap-2 px-3 py-3 text-sm font-medium ${planView === 'overall' ? 'bg-white text-emerald-900' : 'text-emerald-800 hover:bg-white/70'}`}><MessageSquareText size={16} />调整整体计划</button>
        <button aria-pressed={planView === 'today'} onClick={() => setPlanView('today')} className={`inline-flex items-center gap-2 border-t border-emerald-100 px-3 py-3 text-sm font-medium sm:border-t-0 sm:border-l ${planView === 'today' ? 'bg-white text-emerald-900' : 'text-emerald-800 hover:bg-white/70'}`}><CalendarCheck2 size={16} />记录今日反馈</button>
        <button aria-pressed={planView === 'analytics'} onClick={() => setPlanView('analytics')} className={`inline-flex items-center gap-2 border-t border-emerald-100 px-3 py-3 text-sm font-medium sm:border-t-0 sm:border-l ${planView === 'analytics' ? 'bg-white text-emerald-900' : 'text-emerald-800 hover:bg-white/70'}`}><BarChart3 size={16} />查看学习洞察</button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1 border-b border-slate-200">
        {planViews.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPlanView(key)}
            className={`border-b-2 px-3 py-2.5 text-sm font-medium ${planView === key ? 'border-emerald-700 text-emerald-800' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'}`}
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

        {planView === 'analytics' && <LearningAnalytics history={history} knowledge={knowledge} />}

        {planView === 'history' && (
          <div className="grid gap-3">
            {history.map((record) => (
              <div key={record.study_date} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800">{record.study_date}</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-md bg-emerald-100 px-2 py-1 font-medium text-emerald-800">已完成</span>
                    <span className="rounded-md bg-white px-2 py-1 text-slate-500">{record.minutes} 分钟</span>
                    {record.difficulty && <span className="rounded-md bg-white px-2 py-1 text-slate-500">{record.difficulty === 'easy' ? '偏简单' : record.difficulty === 'hard' ? '偏难' : '适中'}</span>}
                  </div>
                </div>
                {record.feedback && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{record.feedback}</p>}
                {record.plan && (
                  <details className="mt-3 rounded-md bg-white px-3 py-2 text-sm text-slate-600">
                    <summary className="cursor-pointer font-medium text-slate-700">当日计划</summary>
                    <div className="markdown-answer mt-3"><ReactMarkdown>{record.plan}</ReactMarkdown></div>
                  </details>
                )}
              </div>
            ))}
            {!history.length && <p className="text-sm text-slate-500">暂无已完成的每日学习记录。</p>}
          </div>
        )}
      </div>
    </Panel>
  )
}

export function QuizPanel({
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
    } catch (error: unknown) {
      setEvaluations((items) => ({ ...items, [question.id]: getErrorMessage(error, 'AI 判断失败，请稍后再试。') }))
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
        ocr_text: question.content,
      })
      setSavedMistakes((items) => ({ ...items, [question.id]: true }))
      await onMistakeSaved()
    } catch (error: unknown) {
      setEvaluations((items) => ({ ...items, [question.id]: getErrorMessage(error, '加入错题库失败。') }))
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
          <MarkdownBlock>{raw ? `当前课程：${courseName}\n\n${raw}` : '当前课程还没有生成测验题。点击生成后，只会显示这门课的题目。'}</MarkdownBlock>
        </div>
      )}
      {!!questions.length && (
        <div className="mt-4 grid gap-4">
          {questions.map((question, index) => {
            const questionContent = repairMojibake(question.content)
            const correctAnswer = repairMojibake(question.correct_answer) || '暂无参考答案'
            const explanation = repairMojibake(question.explanation) || '暂无解析'
            return (
            <div key={question.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-emerald-700">第 {index + 1} 题</p>
                  <div className="mt-2 whitespace-pre-wrap font-medium text-slate-900"><MarkdownBlock>{questionContent}</MarkdownBlock></div>
                </div>
                <button onClick={() => void addToMistakeBook(question)} disabled={busyQuestionId === question.id || savedMistakes[question.id]} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:text-slate-400">
                  {savedMistakes[question.id] ? '已加入错题本' : '加入错题本'}
                </button>
              </div>

              {mode === 'answer' ? (
                <div className="markdown-answer mt-4 rounded-lg bg-white p-4">
                  <MarkdownBlock>{`**参考答案**\n\n${correctAnswer}\n\n**解析**\n\n${explanation}`}</MarkdownBlock>
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
                      <MarkdownBlock>{evaluations[question.id]}</MarkdownBlock>
                    </div>
                  )}
                </div>
              )}
            </div>
            )
          })}
        </div>
      )}
      {!!raw && !!questions.length && (
        <details open className="markdown-answer mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer font-medium text-slate-800">完整生成内容</summary>
          <div className="mt-3 whitespace-pre-wrap break-words"><MarkdownBlock>{raw}</MarkdownBlock></div>
        </details>
      )}
      <div className="mt-6 border-t border-slate-200 pt-5">
        <h4 className="font-semibold text-slate-900">已保存的作答记录</h4>
        <div className="mt-3 grid gap-3">
          {answerRecords.map((record) => (
            <div key={record.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900"><MarkdownBlock>{record.question}</MarkdownBlock></div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">我的答案：{repairMojibake(record.student_answer) || '未填写'}</p>
                </div>
                <span className={`rounded-lg px-2 py-1 text-xs font-medium ${record.is_correct ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>得分 {record.score}</span>
              </div>
              {record.ai_feedback && (
                <div className="markdown-answer mt-3 rounded-lg bg-slate-50 p-3">
                  <MarkdownBlock>{record.ai_feedback}</MarkdownBlock>
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
