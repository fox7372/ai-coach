import { useState } from 'react'
import {
  Loader2,
  Trash2,
} from 'lucide-react'
import { http } from '../api/http'
import { type Resource, type KnowledgePoint, Panel, getErrorMessage } from '../shared'

export function ResourcesPanel({ courseId, resources, onChanged }: { courseId: number; resources: Resource[]; onChanged: () => Promise<void> }) {
  const [busyId, setBusyId] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  async function deleteResource(resourceId: number) {
    setBusyId(resourceId)
    setMessage('')
    try {
      await http.delete(`/api/resources/${resourceId}`)
      setMessage('资料已删除。')
      await onChanged()
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, '删除资料失败。'))
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
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, '生成知识点失败。'))
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
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, '重新生成知识点失败。'))
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

export function KnowledgePanel({ items, loading, onGenerate }: { items: KnowledgePoint[]; loading: boolean; onGenerate: (force?: boolean) => Promise<void> }) {
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
