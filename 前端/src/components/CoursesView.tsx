import React from 'react'
import {
  Trash2,
} from 'lucide-react'
import { type Course } from '../data'
import { Panel } from '../shared'

export function SideButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium ${active ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-emerald-700'}`}>
      {icon}
      {label}
    </button>
  )
}

export function CoursesView({ courses, onOpen, onDelete }: { courses: Course[]; onOpen: (id: number) => void; onDelete: (id: number) => Promise<void> }) {
  return (
    <div>
      <div className="learning-hero p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="section-kicker">继续学习</p>
            <h2 className="mt-1 text-3xl font-semibold text-slate-950">今天想学哪门课？</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">每门课程都有自己的资料、AI 问答、学习计划、测验和错题库。选一门课继续往前走。</p>
          </div>
          <div className="grid gap-1 text-right">
            <p className="text-3xl font-semibold text-slate-950">{courses.length}</p>
            <p className="text-sm text-slate-500">门课程</p>
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {courses.map((course) => (
          <article key={course.id} className="lesson-card group flex min-h-64 flex-col overflow-hidden p-5">
            <div className="flex items-start justify-between gap-3">
              <button onClick={() => onOpen(course.id)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-lg font-semibold text-slate-950 group-hover:text-emerald-700">{course.name}</p>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{course.description || '暂无说明'}</p>
              </button>
              <button onClick={() => void onDelete(course.id)} className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="删除课程">
                <Trash2 size={16} />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 divide-x divide-slate-200 border-y border-slate-200 py-3 text-sm">
              <div className="pr-4">
                <p className="text-xs text-slate-500">进度</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{course.has_progress_evidence ? `${course.progress}%` : '待开始'}</p>
                <div className="mt-2 h-1.5 rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${course.has_progress_evidence ? 'bg-emerald-600' : 'bg-slate-200'}`} style={{ width: `${course.has_progress_evidence ? Math.min(100, course.progress) : 100}%` }} /></div>
              </div>
              <div className="pl-4">
                <p className="text-xs text-slate-500">掌握</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{course.has_mastery_evidence ? `${course.mastery}%` : '待评估'}</p>
                <div className="mt-2 h-1.5 rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${course.has_mastery_evidence ? 'bg-slate-700' : 'bg-slate-200'}`} style={{ width: `${course.has_mastery_evidence ? Math.min(100, course.mastery) : 100}%` }} /></div>
              </div>
            </div>
            <button onClick={() => onOpen(course.id)} className="primary-action mt-auto w-full rounded-md px-3 py-2.5 text-sm font-semibold">继续学习</button>
          </article>
        ))}
        {!courses.length && <Panel className="md:col-span-2 xl:col-span-3"><p className="text-sm text-slate-500">暂无课程。可以在“上传/导入”中上传资料，或用 AI 推荐资料先创建课程。</p></Panel>}
      </div>
    </div>
  )
}
