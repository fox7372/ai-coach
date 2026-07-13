import React, { useMemo, useState } from 'react'
import {
  BookOpen,
  BrainCircuit,
  FileUp,
  Layers3,
  LogOut,
  Settings,
} from 'lucide-react'
import { http } from './api/http'
import { type Course } from './data'
import { type MainView, type User, getErrorMessage } from './shared'
import { CoursesView, SideButton } from './components/CoursesView'
import { CourseDetailView } from './components/CourseDetailView'
import { UploadView } from './components/UploadView'
import { SettingsView } from './components/SettingsView'

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
      await loadCourses()
      setAuthMessage(result.message)
    } catch (error: unknown) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
      if (code === 'ERR_NETWORK') {
        setAuthMessage('后端服务未启动，暂时无法登录或注册')
      } else if (code === 'ECONNABORTED') {
        setAuthMessage('后端响应超时，请稍后再试')
      } else {
        setAuthMessage(getErrorMessage(error, '登录/注册失败'))
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
      <main className="app-shell min-h-[100dvh] text-slate-900">
        <div className="mx-auto flex min-h-[100dvh] max-w-7xl items-center px-6 py-10">
          <section className="grid w-full items-center gap-10 lg:grid-cols-[1fr_430px]">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-sm font-semibold text-emerald-700 shadow-sm">
                <BrainCircuit size={16} />
                AI Learning MVP
              </div>
              <h1 className="balanced-text mt-6 text-5xl font-semibold leading-tight text-slate-950 md:text-6xl">个性化异步学习平台</h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">围绕课程资料、RAG 问答、错题诊断、知识画像和每日计划，形成一条学生能反复使用的学习闭环。</p>
              <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
                {[
                  ['资料', 'PDF / 网页 / 视频'],
                  ['诊断', '错题和掌握度'],
                  ['计划', '整体和每日同步'],
                ].map(([label, value]) => (
                  <div key={label} className="soft-card p-4">
                    <p className="text-sm font-semibold text-emerald-700">{label}</p>
                    <p className="mt-1 text-sm text-slate-600">{value}</p>
                  </div>
                ))}
              </div>
            </div>
            <form onSubmit={submitAuth} className="panel-surface p-6 text-slate-900">
              <h2 className="text-2xl font-semibold text-slate-950">{authMode === 'login' ? '学生登录' : '注册账号'}</h2>
              <p className="mt-2 text-sm text-slate-500">进入课程工作台后再上传资料、配置 AI 和查看学习诊断。</p>
              <label className="mt-5 block text-sm font-medium">
                账号
                <input value={username} onChange={(event) => setUsername(event.target.value)} className="input-surface mt-2 w-full px-3 py-2.5 outline-none" />
              </label>
              <label className="mt-4 block text-sm font-medium">
                密码
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="input-surface mt-2 w-full px-3 py-2.5 outline-none" />
              </label>
              {authMessage && <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${authMessage.includes('成功') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{authMessage}</p>}
              <button disabled={authLoading} className="primary-action mt-5 w-full rounded-xl px-4 py-2.5 font-semibold disabled:bg-slate-400">{authLoading ? '处理中...' : authMode === 'login' ? '登录' : '注册'}</button>
              <button type="button" disabled={authLoading} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="secondary-action mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:bg-slate-100">
                {authMode === 'login' ? '注册账号' : '返回登录'}
              </button>
            </form>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="study-app-shell min-h-[100dvh] text-slate-900">
      <header className="mobile-commandbar sticky top-0 z-30 border-b border-slate-200 bg-white/96 px-3 py-2 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-emerald-700 font-bold text-white">学</div>
            <div className="min-w-0"><p className="truncate text-sm font-semibold">AI Coach</p><p className="truncate text-xs text-slate-500">{selectedCourse?.name || '学习工作台'}</p></div>
          </div>
          <button onClick={() => setUser(null)} className="secondary-action grid h-9 w-9 place-items-center rounded-md" title="退出登录"><LogOut size={16} /></button>
        </div>
        <nav className="mt-2 grid grid-cols-4 gap-1" aria-label="移动端主导航">
          {[
            ['courses', '课程', <BookOpen size={16} />],
            ['detail', '学习', <Layers3 size={16} />],
            ['upload', '导入', <FileUp size={16} />],
            ['settings', '设置', <Settings size={16} />],
          ].map(([view, label, icon]) => (
            <button key={view as string} onClick={() => setMainView(view as MainView)} className={`flex min-h-10 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium ${mainView === view ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{icon}{label}</button>
          ))}
        </nav>
      </header>
      <aside className="study-sidebar fixed inset-y-4 left-4 z-20 hidden w-72 overflow-y-auto p-5 text-slate-900 lg:block">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-emerald-700 font-bold text-white">学</div>
          <div>
            <p className="font-semibold">AI Coach</p>
            <p className="text-xs text-slate-500">课程学习工作台</p>
          </div>
        </div>
        <div className="mt-6 border-l-2 border-emerald-600 pl-3">
          <p className="text-xs font-semibold text-emerald-700">当前课程</p>
          <p className="mt-1 truncate text-sm font-medium text-slate-800">{selectedCourse?.name || '尚未选择课程'}</p>
        </div>
        <nav className="mt-6 grid gap-2">
          <SideButton active={mainView === 'courses'} icon={<BookOpen size={18} />} label="课程" onClick={() => setMainView('courses')} />
          <div>
            <SideButton active={mainView === 'detail'} icon={<Layers3 size={18} />} label="课程详情" onClick={() => setMainView('detail')} />
            <div className="ml-6 mt-2 grid gap-1 border-l border-emerald-100 pb-2 pl-3">
              {courses.map((course) => (
                <button key={course.id} onClick={() => openCourse(course.id)} className={`rounded-md px-3 py-2 text-left text-sm ${selectedCourse?.id === course.id && mainView === 'detail' ? 'bg-emerald-50 font-medium text-emerald-800' : 'text-slate-600 hover:bg-slate-50 hover:text-emerald-700'}`}>
                  {course.name}
                </button>
              ))}
              {!courses.length && <p className="px-3 py-2 text-xs text-slate-500">暂无课程</p>}
            </div>
          </div>
          <SideButton active={mainView === 'upload'} icon={<FileUp size={18} />} label="上传/导入" onClick={() => setMainView('upload')} />
          <SideButton active={mainView === 'settings'} icon={<Settings size={18} />} label="设置" onClick={() => setMainView('settings')} />
        </nav>
        <div className="mt-8 border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-500">当前学生</p>
          <p className="mt-1 font-semibold">{user.nickname || user.username}</p>
          <div className="mt-4 grid gap-2 text-xs text-slate-600">
            <div className="flex items-center justify-between"><span>课程</span><span className="font-semibold text-slate-950">{courses.length}</span></div>
            <div className="flex items-center justify-between"><span>AI 接口</span><span className="font-semibold text-emerald-700">可配置</span></div>
          </div>
        </div>
      </aside>
      <section className="min-h-[100dvh] lg:ml-[312px]">
        <header className="hidden px-4 pt-2 lg:block lg:px-8 lg:pt-6">
          <div className="workspace-header mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 py-4">
            <div>
              <p className="section-kicker">今天的学习空间</p>
              <h1 className="balanced-text mt-1 text-2xl font-semibold text-slate-950">{selectedCourse?.name || '先选一门课开始'}</h1>
              <p className="mt-1 text-sm text-slate-600">课程、资料、问答、计划、测验和错题都在这里串起来。</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="hidden gap-5 border-r border-slate-200 pr-4 text-sm text-slate-600 lg:flex">
                <div><span className="text-slate-400">课程</span><span className="ml-2 font-semibold text-slate-950">{courses.length}</span></div>
                <div><span className="text-slate-400">当前</span><span className="ml-2 font-semibold text-slate-950">{selectedCourse?.name || '未选择'}</span></div>
              </div>
              <button onClick={() => setMainView('upload')} className="primary-action inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold">
                <FileUp size={16} />
                加资料
              </button>
              <button onClick={() => setUser(null)} className="secondary-action inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm">
                <LogOut size={16} />
                退出
              </button>
            </div>
          </div>
        </header>
        <div id="main-content" className="mx-auto max-w-[1440px] px-3 py-4 sm:px-4 lg:px-8 lg:py-6">
          {mainView === 'courses' && <CoursesView courses={courses} onOpen={openCourse} onDelete={deleteCourse} />}
      {mainView === 'detail' && <CourseDetailView key={selectedCourse?.id ?? 'empty'} course={selectedCourse} userId={user.id} />}
          {mainView === 'upload' && <UploadView userId={user.id} courses={courses} onCoursesChanged={loadCourses} />}
          {mainView === 'settings' && <SettingsView />}
        </div>
      </section>
    </main>
  )
}

export default App
