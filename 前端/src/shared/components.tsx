import React from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import { Layers3, Loader2 } from 'lucide-react'
import { repairMojibake } from './utils'

export function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`panel-surface p-4 sm:p-5 ${className}`}>{children}</section>
}

export function LoadingNotice({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      <span className="relative flex h-5 w-5 items-center justify-center">
        <span className="absolute h-5 w-5 animate-ping rounded-full bg-emerald-300 opacity-40" />
        <Loader2 className="relative animate-spin" size={18} />
      </span>
      <span className="font-medium">{text}</span>
    </div>
  )
}

export function MarkdownBlock({ children }: { children: string }) {
  const normalized = repairMojibake(children)
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, '$$\n$1\n$$')
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, '$$$1$')
    .replace(/\\\\(?=[A-Za-z])/g, '\\')
  return <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{normalized}</ReactMarkdown>
}

export function DoclingParsingNotice({ message }: { message: string }) {
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
