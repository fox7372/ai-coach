import { useEffect, useState } from 'react'
import { http } from '../api/http'
import { type AIConfig, Panel } from '../shared'

export function SettingsView() {
  const providerPresets = [
    { value: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
    { value: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    { value: 'qwen', label: '通义千问 DashScope', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    { value: 'siliconflow', label: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
    { value: 'custom', label: '自定义 OpenAI 兼容接口', baseUrl: '', model: '' },
  ]
  const [apiKey, setApiKey] = useState('')
  const [provider, setProvider] = useState('deepseek')
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com')
  const [model, setModel] = useState('deepseek-chat')
  const [current, setCurrent] = useState<AIConfig | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const result = (await http.get('/settings/ai')) as unknown as AIConfig
        setCurrent(result)
        if (result.provider !== 'mock') setProvider(result.provider)
        setBaseUrl(result.base_url)
        setModel(result.model)
      } catch {
        setMessage('AI 设置读取失败，请确认后端已启动。')
      }
    }
    void load()
  }, [])

  function applyPreset(nextProvider: string) {
    setProvider(nextProvider)
    const preset = providerPresets.find((item) => item.value === nextProvider)
    if (!preset) return
    if (preset.baseUrl) setBaseUrl(preset.baseUrl)
    if (preset.model) setModel(preset.model)
  }

  async function save() {
    if (!apiKey.trim()) {
      setMessage('请输入 API Key')
      return
    }
    if (!baseUrl.trim() || !model.trim()) {
      setMessage('请填写 Base URL 和模型名')
      return
    }
    const result = (await http.post('/settings/ai', {
      provider,
      api_key: apiKey,
      base_url: baseUrl,
      model,
    })) as unknown as AIConfig
    setCurrent(result)
    setApiKey('')
    setMessage(`AI 设置已保存：${result.provider} / ${result.model}`)
  }

  async function changeModel() {
    if (!baseUrl.trim() || !model.trim()) {
      setMessage('请填写 Base URL 和模型名')
      return
    }
    const result = (await http.post('/settings/ai', {
      provider,
      base_url: baseUrl,
      model,
    })) as unknown as AIConfig
    setCurrent(result)
    setMessage(`模型已更改：${result.provider} / ${result.model}${result.has_api_key ? '' : '，但还没有配置 Key'}`)
  }

  async function removeConfig() {
    if (!window.confirm('确定删除当前 AI 配置吗？删除后问答会回到演示模式。')) return
    try {
      const result = (await http.delete('/settings/ai')) as unknown as AIConfig
      setCurrent(result)
      setApiKey('')
      setProvider(result.provider)
      setBaseUrl(result.base_url)
      setModel(result.model)
      setMessage('AI 配置已删除，当前为演示模式。')
    } catch {
      setMessage('删除失败：当前后端可能不是最新版本，请重启后端后再试。')
    }
  }

  return (
    <Panel>
      <h2 className="text-xl font-semibold">设置</h2>
      <p className="mt-2 text-sm text-slate-500">支持 DeepSeek、OpenAI、通义千问、硅基流动，以及其他 OpenAI 兼容接口。</p>
      {current && (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 text-sm text-slate-700">
          当前：{current.provider} · {current.model} · {current.has_api_key ? '已配置 Key' : '未配置 Key'}
        </div>
      )}
      <label className="mt-4 block text-sm font-medium">
        模型服务
        <select value={provider} onChange={(event) => applyPreset(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500">
          {providerPresets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="mt-4 block text-sm font-medium">
        Base URL
        <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500" />
      </label>
      <label className="mt-4 block text-sm font-medium">
        模型名
        <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="deepseek-chat / gpt-4o-mini / qwen-plus" className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500" />
      </label>
      <label className="mt-4 block text-sm font-medium">
        API Key
        <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500" />
      </label>
      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={() => void save()} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">保存 API Key</button>
        <button onClick={() => void changeModel()} className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">更改模型</button>
        <button onClick={() => void removeConfig()} className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">删除 AI 配置</button>
      </div>
      {message && <p className="mt-3 text-sm text-slate-500">{message}</p>}
    </Panel>
  )
}
