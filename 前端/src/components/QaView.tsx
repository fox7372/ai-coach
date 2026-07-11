import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Loader2,
  Plus,
  Search,
  Send,
  Trash2,
} from 'lucide-react'
import { http } from '../api/http'
import { type Course } from '../data'
import { type ChatMessage, type ChatSession, type ChatSearchResult, getErrorMessage, repairMojibake, Panel, LoadingNotice, MarkdownBlock } from '../shared'

export function QaView({ course, userId, onMistakeSaved }: { course: Course | null; userId: number; onMistakeSaved: () => Promise<void> }) {
  const courseId = course?.id
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
  const activeSessionIdRef = useRef<number | null>(null)

  const loadMessages = useCallback(async (sessionId: number) => {
    if (!courseId) return
    setHistoryLoading(true)
    try {
      const result = (await http.get(`/qa/messages?user_id=${userId}&course_id=${courseId}&session_id=${sessionId}`)) as unknown as ChatMessage[]
      setMessages(result)
      activeSessionIdRef.current = sessionId
      setActiveSessionId(sessionId)
    } finally {
      setHistoryLoading(false)
    }
  }, [courseId, userId])

  const loadSessions = useCallback(async (preferredSessionId?: number | null) => {
    if (!courseId) return
    const result = (await http.get(`/qa/sessions?user_id=${userId}&course_id=${courseId}`)) as unknown as ChatSession[]
    setSessions(result)
    const nextSessionId = preferredSessionId !== undefined ? preferredSessionId : activeSessionIdRef.current || result[0]?.id || null
    activeSessionIdRef.current = nextSessionId
    setActiveSessionId(nextSessionId)
    if (nextSessionId) await loadMessages(nextSessionId)
  }, [courseId, loadMessages, userId])

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
    setMessages((items) => [{ id: `u-${Date.now()}`, role: 'user', content: current }, ...items])
    setLoading(true)
    try {
      const result = (await http.post('/qa/ask', { question: current, course_id: course.id, user_id: userId, session_id: activeSessionId })) as unknown as { answer: string; assistant_message_id: number }
      setMessages((items) => [{ id: result.assistant_message_id, role: 'assistant', content: result.answer }, ...items])
      await loadSessions(activeSessionId || undefined)
    } catch (error: unknown) {
      setMessages((items) => [{ id: `e-${Date.now()}`, role: 'assistant', content: getErrorMessage(error, '问答失败') }, ...items])
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
        ocr_text: previousQuestion || '未记录',
      })
      setMistakeMessage('已加入当前课程错题库。')
      await onMistakeSaved()
    } catch (error: unknown) {
      setMistakeMessage(getErrorMessage(error, '加入错题库失败。'))
    } finally {
      setSavingMistakeId(null)
    }
  }

  useEffect(() => {
    setQuestion('')
    setMessages([])
    setSessions([])
    activeSessionIdRef.current = null
    setActiveSessionId(null)
    setSearchKeyword('')
    setSearchResults([])
    setMistakeMessage('')
    void loadSessions()
  }, [courseId, loadSessions])

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
                <p className="mt-1 line-clamp-3 text-sm text-slate-600">{repairMojibake(item.content)}</p>
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
        <div className="mt-4 grid gap-3">
          {historyLoading && <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">正在加载历史...</div>}
          {messages.map((message, index) => {
            const pairedQuestion = messages.slice(index + 1).find((item) => item.role === 'user')?.content
            return (
            <div key={message.id} className={`rounded-lg p-4 ${message.role === 'user' ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50'}`}>
              <MarkdownBlock>{message.content}</MarkdownBlock>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {message.created_at && <p className="text-xs text-slate-400">{new Date(message.created_at).toLocaleString()}</p>}
                {message.role === 'assistant' && (
                  <button
                    onClick={() => void saveAnswerAsMistake(message, pairedQuestion)}
                    disabled={savingMistakeId === message.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-100 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:text-slate-400"
                  >
                    {savingMistakeId === message.id ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />}
                    加入错题本
                  </button>
                )}
              </div>
            </div>
            )
          })}
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
