import type { PdfParser } from './types'

export const pdfParserOptions: Array<{ value: PdfParser; label: string; description: string; loadingMessage: string }> = [
  {
    value: 'pymupdf',
    label: 'PyMuPDF',
    description: '速度最快，适合有文本层的 PDF。',
    loadingMessage: '正在用 PyMuPDF 快速解析 PDF...',
  },
  {
    value: 'docling',
    label: 'Docling',
    description: '结构化解析，适合版式复杂的 PDF，但耗时更长。',
    loadingMessage: '正在用 Docling 结构化解析 PDF，可能较慢...',
  },
]

export const pdfParserDetails = Object.fromEntries(pdfParserOptions.map((option) => [option.value, option])) as Record<PdfParser, (typeof pdfParserOptions)[number]>

export const importTimingStorageKey = 'ai-learning-import-timings-v1'
