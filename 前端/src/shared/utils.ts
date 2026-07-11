import axios from 'axios'
import type { ApiErrorBody, ImportEstimate, ImportStatus, ImportTiming, PdfParser } from './types'
import { importTimingStorageKey } from './constants'

export function getErrorCode(error: unknown): string | undefined {
  if (axios.isAxiosError(error)) return error.code
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code
  return undefined
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      const messages = detail.map((item) => item.msg).filter((message): message is string => Boolean(message))
      if (messages.length) return messages.join('；')
    }
    const message = error.response?.data?.message
    if (typeof message === 'string') return message
    if (error.message) return error.message
  }
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}

export function repairMojibake(value: string | null | undefined) {
  const text = value || ''
  const markers = /(?:Ã|Â|â|ï¼|å|ç|è)/g
  if (!markers.test(text) || [...text].some((char) => char.charCodeAt(0) > 255)) return text

  try {
    const decode = new TextDecoder('utf-8', { fatal: true })
    const repaired = decode.decode(Uint8Array.from(text, (char) => char.charCodeAt(0)))
    const score = (content: string) => (content.match(/(?:Ã|Â|â|ï¼|å|ç|è)/g) || []).length
    return score(repaired) < score(text) ? repaired : text
  } catch {
    return text
  }
}

export function localDateString() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export function formatDuration(seconds: number) {
  if (seconds < 60) return `约 ${Math.max(10, Math.round(seconds / 10) * 10)} 秒`
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `约 ${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `约 ${hours} 小时 ${rest} 分钟` : `约 ${hours} 小时`
}

export function formatDurationRange(minSeconds: number, maxSeconds: number) {
  const minText = formatDuration(minSeconds).replace(/^约 /, '')
  const maxText = formatDuration(maxSeconds).replace(/^约 /, '')
  if (minText === maxText) return `约 ${minText}`
  return `约 ${minText} - ${maxText}`
}

export function importTimingKey(file: File, parser: PdfParser) {
  const suffix = file.name.split('.').pop()?.toLowerCase() || ''
  if (suffix === 'docx') return 'docx'
  if (suffix === 'ppt' || suffix === 'pptx') return 'presentation-docling'
  return parser === 'docling' ? 'pdf-docling' : 'pdf-pymupdf'
}

export function readImportTimings(): Record<string, ImportTiming> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(importTimingStorageKey) || '{}')
    return parsed && typeof parsed === 'object' ? parsed as Record<string, ImportTiming> : {}
  } catch {
    return {}
  }
}

export function recordImportTimings(files: File[], results: Array<{ success: boolean; processing_seconds?: number }>, parser: PdfParser) {
  const timings = readImportTimings()
  files.forEach((file, index) => {
    const result = results[index]
    const elapsedSeconds = result?.processing_seconds
    if (!result?.success || !elapsedSeconds || elapsedSeconds <= 0) return
    const key = importTimingKey(file, parser)
    const secondsPerMb = elapsedSeconds / Math.max(0.2, file.size / 1024 / 1024)
    const previous = timings[key]
    const samples = Math.min(8, (previous?.samples || 0) + 1)
    const previousWeight = Math.max(0, samples - 1)
    timings[key] = {
      samples,
      secondsPerMb: ((previous?.secondsPerMb || secondsPerMb) * previousWeight + secondsPerMb) / samples,
    }
  })
  try {
    window.localStorage.setItem(importTimingStorageKey, JSON.stringify(timings))
  } catch {
    // Estimation still works with the default profile when storage is unavailable.
  }
}

export function estimateImportTime(file: File, parser: PdfParser): ImportEstimate {
  const suffix = file.name.split('.').pop()?.toLowerCase() || ''
  const sizeMb = Math.max(0.2, file.size / 1024 / 1024)
  const isPresentation = suffix === 'ppt' || suffix === 'pptx'
  const effectiveParser: PdfParser = isPresentation ? 'docling' : parser

  const expectedSeconds = effectiveParser === 'pymupdf'
    ? 25 + sizeMb * 32
    : 75 + sizeMb * 70
  const timing = readImportTimings()[importTimingKey(file, parser)]
  const calibratedSeconds = timing ? Math.max(8, timing.secondsPerMb * sizeMb) : expectedSeconds
  const rangeRatio = timing ? (timing.samples >= 3 ? 0.2 : 0.35) : 0.45
  const minSeconds = Math.max(8, calibratedSeconds * (1 - rangeRatio))
  const maxSeconds = Math.max(20, calibratedSeconds * (1 + rangeRatio))

  return {
    label: formatDurationRange(minSeconds, maxSeconds),
    maxSeconds,
    minSeconds,
    detail: timing
      ? `基于本机最近 ${timing.samples} 次同类资料的实际处理速度校准。`
      : effectiveParser === 'pymupdf'
        ? '首次导入使用本机 CPU 的保守基线；完成后会按实际耗时自动校准。'
        : '首次导入使用 Docling 的保守基线；完成后会按实际耗时自动校准。',
  }
}

export function estimateFilesImportTime(files: File[], parser: PdfParser): ImportEstimate | null {
  if (!files.length) return null
  const estimates = files.map((file) => estimateImportTime(file, parser))
  const minSeconds = estimates.reduce((total, item) => total + item.minSeconds, 0)
  const maxSeconds = estimates.reduce((total, item) => total + item.maxSeconds, 0)
  const hasWord = files.some((file) => file.name.toLowerCase().endsWith('.docx'))
  const hasPresentation = files.some((file) => /\.pptx?$/i.test(file.name))
  const detail = hasPresentation
    ? '批量任务会按顺序处理；PPT/PPTX 固定使用 Docling，Word 使用文本提取，PDF 按当前解析方式处理。'
    : hasWord
      ? '批量任务会按顺序处理；Word 使用文本提取，PDF 按当前解析方式处理。'
      : estimates[0].detail
  return { label: formatDurationRange(minSeconds, maxSeconds), minSeconds, maxSeconds, detail }
}

export function statusClass(status: ImportStatus) {
  if (status === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'error') return 'border-red-200 bg-red-50 text-red-700'
  if (status === 'loading') return 'border-blue-200 bg-blue-50 text-blue-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

export function cleanStudyText(value: string | null | undefined) {
  return (value || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim()
}

export function stripDuplicateQuestion(analysis: string | null | undefined, question: string | null | undefined) {
  const text = cleanStudyText(analysis)
  const normalizedQuestion = cleanStudyText(question)
  if (!normalizedQuestion) return text
  return text
    .replace(new RegExp(`^\\s*题目[：:]\\s*${escapeRegExp(normalizedQuestion)}\\s*`, 'u'), '')
    .replace(new RegExp(`^\\s*题目文字[：:]\\s*${escapeRegExp(normalizedQuestion)}\\s*`, 'u'), '')
    .replace(/^题目文字：\s*[\s\S]*?\n\nAI 分析：\s*/u, '')
    .trim()
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
