import ReactMarkdown from 'react-markdown'
import React, { useState } from 'react'
import {
  BrainCircuit,
  FileUp,
  Loader2,
  Trash2,
} from 'lucide-react'
import { http } from '../api/http'
import { type Mistake, type ImageMistakeUploadResult, type Diagnosis, type Profile, Panel, cleanStudyText, getErrorMessage, stripDuplicateQuestion, MarkdownBlock } from '../shared'

export function MistakesPanel({
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
  const [imageResult, setImageResult] = useState<ImageMistakeUploadResult | null>(null)
  const [questionText, setQuestionText] = useState('')
  const [studentAnswer, setStudentAnswer] = useState('')
  const [correctAnswer, setCorrectAnswer] = useState('')
  const [imageAnalysis, setImageAnalysis] = useState('')

  async function uploadMistakeImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setImageBusy(true)
    setImageMessage('正在上传图片，并判断当前模型是否支持识图...')
    setImageAnalysis('')
    setQuestionText('')
    try {
      const formData = new FormData()
      formData.append('image', file)
      const result = (await http.post(`/api/ai/analyze-mistake-image-upload?user_id=${userId}&course_id=${courseId}`, formData, { timeout: 300000 })) as unknown as ImageMistakeUploadResult
      setImageResult(result)
      setQuestionText(result.ocr_text || '')
      if (result.analysis) setImageAnalysis(result.analysis)
      setImageMessage(result.message)
      if (result.mistake_id) await onSaved()
    } catch (error: unknown) {
      setImageMessage(getErrorMessage(error, '图片分析失败，请稍后重试。'))
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
        image_path: imageResult?.image_path,
        ocr_text: imageResult?.ocr_text || questionText,
        save_to_mistakes: true,
      }, { timeout: 300000 })) as unknown as { analysis: string; mistake_id: number | null }
      setImageAnalysis(result.analysis)
      setImageMessage(result.mistake_id ? 'AI 分析完成，已加入错题库。' : 'AI 分析完成。')
      await onSaved()
    } catch (error: unknown) {
      setImageMessage(getErrorMessage(error, 'AI 分析失败，请检查后端或稍后重试。'))
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
            <p className="mt-1 text-sm text-slate-500">识图模型会直接分析图片并加入错题库；非识图模型会提示你改用文字输入。</p>
          </div>
          <label className="secondary-action inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
            {imageBusy ? <Loader2 className="animate-spin" size={16} /> : <FileUp size={16} />}
            选择图片
            <input type="file" accept="image/*" onChange={(event) => void uploadMistakeImage(event)} className="hidden" />
          </label>
        </div>
        {imageMessage && <p className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-sm text-slate-600">{imageMessage}</p>}
        {((imageResult && !imageResult.supports_vision) || questionText) && (
          <div className="mt-4 grid gap-3">
            <label className="block text-sm font-medium text-slate-700">
              题目文字
              <textarea value={questionText} onChange={(event) => setQuestionText(event.target.value)} rows={5} className="mt-2 w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-emerald-500" placeholder="当前模型不能直接识图时，在这里输入题目文字。" />
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
        {mistakes.map((item) => {
          const questionText = cleanStudyText(item.ocr_text)
          const analysisText = stripDuplicateQuestion(item.ai_analysis, questionText)
          return (
            <div key={item.id} className="rounded-lg border border-red-100 bg-red-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-red-700">{item.mistake_type || '错题记录'} · {item.review_status}</p>
                <button onClick={() => void onDelete(item.id)} disabled={loading} className="rounded-lg bg-white p-2 text-red-500 hover:bg-red-100 disabled:text-slate-400" title="删除错题">
                  {loading ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
                </button>
              </div>
              {questionText && (
                <div className="mt-3 rounded-lg bg-white/80 p-3 text-sm text-slate-800">
                  <p className="mb-1 text-xs font-semibold text-red-600">题目</p>
                  <div className="markdown-answer">
                    <MarkdownBlock>{questionText}</MarkdownBlock>
                  </div>
                </div>
              )}
              {analysisText && (
                <div className="markdown-answer mt-3 rounded-lg bg-white/70 p-3 text-sm text-slate-700">
                  <p className="mb-2 text-xs font-semibold text-slate-500">AI 分析</p>
                  <MarkdownBlock>{analysisText}</MarkdownBlock>
                </div>
              )}
              {item.weak_points && <p className="mt-2 text-sm text-slate-600">薄弱点：{cleanStudyText(item.weak_points)}</p>}
              {item.suggestion && <p className="text-sm text-slate-600">建议：{cleanStudyText(item.suggestion)}</p>}
            </div>
          )
        })}
        {!mistakes.length && <p className="text-sm text-slate-500">暂无错题。</p>}
      </div>
    </Panel>
  )
}

export function DiagnosisPanel({ diagnosis }: { diagnosis: Diagnosis | null }) {
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">学习诊断</h3>
          <p className="mt-1 text-sm text-slate-500">基于作答、错题、学习反馈和课程问答给出当前优先级。</p>
        </div>
        {diagnosis && <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${diagnosis.confidence.level === 'high' ? 'bg-emerald-50 text-emerald-700' : diagnosis.confidence.level === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{diagnosis.confidence.label}</span>}
      </div>
      {!diagnosis ? <p className="mt-4 text-sm text-slate-500">诊断加载中。</p> : (
        <>
          <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">{diagnosis.confidence.detail}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {diagnosis.items.map((item) => {
              const value = item.value ?? 0
              const barClass = item.tone === 'red' ? 'bg-red-500' : item.tone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'
              return (
                <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3"><p className="font-medium">{item.label}</p><p className="font-semibold text-slate-900">{item.value === null ? '待采样' : `${item.value}%`}</p></div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className={`h-2 rounded-full ${barClass}`} style={{ width: `${value}%` }} /></div>
                  <p className="mt-2 text-sm text-slate-600">{item.status}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{item.hint}</p>
                </div>
              )
            })}
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div>
              <h4 className="font-semibold text-slate-900">当前优先动作</h4>
              <div className="mt-3 grid gap-3">
                {diagnosis.actions.map((item) => (
                  <div key={item.title} className={`rounded-lg border p-4 ${item.tone === 'red' ? 'border-red-100 bg-red-50/70' : item.tone === 'amber' ? 'border-amber-100 bg-amber-50/70' : 'border-emerald-100 bg-emerald-50/70'}`}>
                    <p className="font-medium text-slate-900">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.reason}</p>
                    <p className="mt-2 text-sm font-medium text-slate-800">下一步：{item.action}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900">已有优势</h4>
              <div className="mt-3 grid gap-2">
                {diagnosis.strengths.length ? diagnosis.strengths.map((item) => <p key={item} className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{item}</p>) : <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">继续积累作答、复盘和反馈记录后，这里会显示稳定优势。</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </Panel>
  )
}

export function ProfilePanel({ profile }: { profile: Profile | null }) {
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">学生学习画像</h3>
          <p className="mt-1 text-sm text-slate-500">画像展示学习行为与结果证据，不把缺少记录解释为能力不足。</p>
        </div>
        {profile && <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${profile.confidence.level === 'high' ? 'bg-emerald-50 text-emerald-700' : profile.confidence.level === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{profile.confidence.label}</span>}
      </div>
      {!profile ? <p className="mt-4 text-sm text-slate-500">画像加载中。</p> : (
        <>
          <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">{profile.confidence.detail}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {profile.radar.map((item) => {
              const value = item.value ?? 0
              return (
                <div key={item.name} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3"><p className="font-medium">{item.name}</p><p className="font-semibold text-slate-900">{item.value === null ? '待采样' : `${item.value}%`}</p></div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${value}%` }} /></div>
                  <p className="mt-2 text-xs text-slate-400">{item.evidence}</p>
                </div>
              )
            })}
          </div>
          <p className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">{profile.conclusion}</p>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div>
              <h4 className="font-semibold text-slate-900">下一阶段关注点</h4>
              <div className="mt-3 grid gap-3">
                {profile.focuses.map((item) => <div key={item.title} className="rounded-lg border border-slate-200 bg-white p-4"><p className="font-medium">{item.title}</p><p className="mt-1 text-sm text-slate-600">{item.action}</p></div>)}
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900">稳定表现</h4>
              <div className="mt-3 grid gap-2">
                {profile.strengths.length ? profile.strengths.map((item) => <p key={item} className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{item}</p>) : <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">完成测验、打卡和错题复盘后，会逐步形成可比较的学习画像。</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </Panel>
  )
}
