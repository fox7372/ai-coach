import React, { useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  Clock,
  FileText,
  FileUp,
  Loader2,
  Plus,
  Trash2,
  Video,
} from 'lucide-react'
import { http } from '../api/http'
import { type Course } from '../data'
import { type ImportStatus, type PdfParser, type Resource, type RecommendedResource, pdfParserOptions, pdfParserDetails, recordImportTimings, estimateFilesImportTime, statusClass, Panel, DoclingParsingNotice, getErrorMessage } from '../shared'

export function UploadView({ userId, courses, onCoursesChanged }: { userId: number; courses: Course[]; onCoursesChanged: () => Promise<void> }) {
  const [targetMode, setTargetMode] = useState<'existing' | 'new'>('existing')
  const [selectedCourseId, setSelectedCourseId] = useState<number | ''>(courses[0]?.id || '')
  const [courseName, setCourseName] = useState('')
  const [learningGoal, setLearningGoal] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [pdfParser, setPdfParser] = useState<PdfParser>('pymupdf')
  const [videoUrls, setVideoUrls] = useState('')
  const [webUrl, setWebUrl] = useState('https://jyywiki.cn/OS/2026/')
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [message, setMessage] = useState('成功导入资料后才会生成或保留课程。')
  const [activeImportKind, setActiveImportKind] = useState<'docling' | 'normal' | null>(null)
  const [lastResource, setLastResource] = useState<Resource | null>(null)
  const [recommendedResources, setRecommendedResources] = useState<RecommendedResource[]>([])
  const [recommendedCourseId, setRecommendedCourseId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const selectedFilesEstimate = useMemo(() => estimateFilesImportTime(selectedFiles, pdfParser), [selectedFiles, pdfParser])

  function getSelectedCourse() {
    return courses.find((course) => course.id === Number(selectedCourseId)) || courses[0] || null
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

  function selectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    setSelectedFiles(files)
    if (!files.length) return
    const estimate = estimateFilesImportTime(files, pdfParser)
    setStatus('idle')
    setActiveImportKind(null)
    setMessage(`已选择 ${files.length} 份资料，预计处理 ${estimate?.label}。点击“开始处理”才会上传并写入知识库；点击“取消上传”会直接丢弃本次选择。`)
  }

  function cancelSelectedFiles() {
    setSelectedFiles([])
    setActiveImportKind(null)
    setStatus('idle')
    setMessage('已取消本次文件选择，文件没有上传，也不会写入知识库。')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function uploadSelectedFiles() {
    const files = selectedFiles
    if (!files.length) return
    setStatus('loading')
    const usesDocling = files.some((file) => /\.pptx?$/i.test(file.name) || (file.name.toLowerCase().endsWith('.pdf') && pdfParser === 'docling'))
    const hasWord = files.some((file) => file.name.toLowerCase().endsWith('.docx'))
    const estimate = estimateFilesImportTime(files, pdfParser)
    setActiveImportKind(usesDocling ? 'docling' : 'normal')
    const processingMessage = usesDocling
      ? '正在批量解析资料，包含 Docling 结构化任务...'
      : hasWord
        ? '正在批量提取 Word 和 PDF 文本...'
        : pdfParserDetails[pdfParser].loadingMessage
    setMessage(`${processingMessage} 预计 ${estimate?.label}。`)
    const uploadTimeout = Math.max(usesDocling ? 300000 : 180000, Math.ceil((estimate?.maxSeconds || 180) * 1000 + 60000))
    const finalName = files.length === 1
      ? files[0].name.replace(/\.[^.]+$/, '') || '未命名课程'
      : `${files[0].name.replace(/\.[^.]+$/, '')} 等 ${files.length} 份资料`
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    let createdCourse: Course | null = null
    let created = false
    try {
      const result = await resolveCourseForResource(finalName, `由 ${files.length} 份资料自动创建`)
      createdCourse = result.course
      created = result.created
      const uploadResult = await http.post(`/documents/upload/batch?course_id=${createdCourse.id}&parser=${pdfParser}`, formData, { timeout: uploadTimeout }) as unknown as {
        success_count: number
        failed_count: number
        results: Array<{ success: boolean; resource?: Resource; chunk_count?: number; processing_seconds?: number; error?: string }>
      }
      recordImportTimings(files, uploadResult.results, pdfParser)
      const firstResource = uploadResult.results.find((item) => item.resource)?.resource || null
      setLastResource(firstResource)
      if (uploadResult.success_count === 0) {
        await cleanupCourse(createdCourse, created)
        setStatus('error')
        setMessage(uploadResult.results.find((item) => item.error)?.error || '所有资料都导入失败，已清理本次新建课程。')
        return
      }
      setStatus('success')
      setActiveImportKind(null)
      setMessage(`批量导入完成：已加入《${createdCourse.name}》，成功 ${uploadResult.success_count} 份，失败 ${uploadResult.failed_count} 份。`)
      setSelectedFiles([])
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      await onCoursesChanged()
    } catch (error: unknown) {
      if (createdCourse) await cleanupCourse(createdCourse, created)
      setStatus('error')
      setActiveImportKind(null)
      setMessage(getErrorMessage(error, '资料上传失败，已清理本次新建课程。'))
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
    } catch (error: unknown) {
      if (createdCourse) await cleanupCourse(createdCourse, created)
      setStatus('error')
      setActiveImportKind(null)
      setMessage(getErrorMessage(error, '视频导入失败，已清理本次新建课程。'))
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
    } catch (error: unknown) {
      if (createdCourse) await cleanupCourse(createdCourse, created)
      setStatus('error')
      setActiveImportKind(null)
      setMessage(getErrorMessage(error, '网页导入失败，已清理本次新建课程。'))
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
    } catch (error: unknown) {
      setStatus('error')
      setActiveImportKind(null)
      setMessage(getErrorMessage(error, '无资料课程创建失败，请检查 AI 设置或稍后重试。'))
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
    } catch (error: unknown) {
      setStatus('error')
      setActiveImportKind(null)
      setMessage(getErrorMessage(error, '资料加入失败，请核对网址后重试。'))
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-700">资料入口</p>
          <h2 className="mt-1 text-3xl font-semibold text-slate-950">上传/导入资料</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">先选择加入已有课程，或切换为新建课程，再批量上传 PDF、PPT 或 Word，或导入视频和网页。</p>
        </div>
        <div className={`rounded-2xl border px-4 py-3 text-sm ${statusClass(status)}`}>
          {status === 'loading' ? '处理中' : status === 'success' ? '最近成功' : status === 'error' ? '需要处理' : '等待导入'}
        </div>
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="grid gap-5">
          <Panel className="order-1 bg-white/92">
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
          <Panel className="order-3">
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
          <Panel className="order-2 border-2 border-emerald-300 bg-emerald-50/70">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><FileText /></div>
              <div>
                  <h3 className="text-lg font-semibold text-slate-950">批量导入资料</h3>
                  <p className="text-sm text-slate-600">选择多份文件后，一次加入当前课程。</p>
                </div>
              </div>
              <span className="rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white">最多 20 份</span>
            </div>
            <label className={`mt-4 flex cursor-pointer items-center justify-center gap-3 rounded-lg border-2 border-dashed border-emerald-400 bg-white px-4 py-6 text-center text-emerald-800 transition hover:border-emerald-600 hover:bg-emerald-100 ${status === 'loading' ? 'pointer-events-none opacity-60' : ''}`}>
              <FileUp size={22} />
              <span>
                <span className="block text-base font-semibold">选择多份文件</span>
                <span className="mt-1 block text-xs text-emerald-700">PDF、PPT/PPTX、Word DOCX</span>
              </span>
              <input ref={fileInputRef} type="file" accept=".pdf,.ppt,.pptx,.docx" multiple className="hidden" onChange={selectFiles} disabled={status === 'loading'} />
            </label>
            <p className="mt-2 text-sm text-slate-600">{selectedFiles.length ? `已选择 ${selectedFiles.length} 份资料，点击下方“开始批量导入”提交。` : '可按 Ctrl 或 Shift 一次选择多份文件。'}</p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              PDF 解析方式
              <select
                value={pdfParser}
                onChange={(event) => setPdfParser(event.target.value as PdfParser)}
                className="input-surface mt-2 w-full px-3 py-2.5 outline-none"
              >
                {pdfParserOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs leading-5 text-slate-500">{pdfParserDetails[pdfParser].description}</p>
            {selectedFiles.length > 0 && (
              <div className="mt-2 text-xs leading-5 text-slate-500">
                {selectedFiles.slice(0, 3).map((file) => <p key={`${file.name}-${file.lastModified}`}>{file.name}</p>)}
                {selectedFiles.length > 3 && <p>另有 {selectedFiles.length - 3} 份资料。</p>}
              </div>
            )}
            {selectedFilesEstimate && (
              <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                <div className="flex items-center gap-2 font-semibold">
                  <Clock size={16} />
                  批量预计处理时间：{selectedFilesEstimate.label}
                </div>
                <p className="mt-1 text-xs leading-5 text-sky-800">{selectedFilesEstimate.detail}</p>
              </div>
            )}
            {selectedFiles.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button onClick={() => void uploadSelectedFiles()} disabled={status === 'loading'} className="primary-action inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:bg-slate-400">
                  {status === 'loading' ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                  开始批量导入 {selectedFiles.length} 份
                </button>
                <button type="button" onClick={cancelSelectedFiles} disabled={status === 'loading'} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:border-red-200 hover:text-red-600 disabled:cursor-not-allowed disabled:text-slate-400">
                  <Trash2 size={16} />
                  取消上传
                </button>
              </div>
            )}
          </Panel>
          <Panel className="order-4">
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
          <Panel className="order-5">
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
