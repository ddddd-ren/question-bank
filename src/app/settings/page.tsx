"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Settings, CheckCircle, XCircle, Loader2, Zap, Save, TestTube, Eye, EyeOff } from "lucide-react"
import { showToast } from "@/components/toast"

interface AiProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  maxTokens: number
  isActive: boolean
  hasApiKey: boolean
}

type EditableProviderField = "baseUrl" | "apiKey" | "model" | "maxTokens"

export default function SettingsPage() {
  const [providers, setProviders] = useState<AiProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null)
  const [editData, setEditData] = useState<Record<string, Partial<AiProvider>>>({})
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({})
  const [loadError, setLoadError] = useState<string | null>(null)

  const fetchProviders = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch("/api/ai/config")
      if (!res.ok) throw new Error("获取配置失败")
      const data = await res.json()
      setProviders(data)
    } catch (error) {
      console.error("Failed to fetch providers:", error)
      const message = error instanceof Error ? error.message : "获取配置失败"
      setLoadError(message)
      showToast(message, "error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchProviders()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchProviders])

  const handleUpdate = useCallback(async (id: string) => {
    const data = editData[id]
    if (!data) return

    setSaving(id)
    try {
      const res = await fetch("/api/ai/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      })

      if (!res.ok) throw new Error("保存失败")

      await fetchProviders(false)
      setEditData(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      showToast("保存成功", "success")
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存失败", "error")
    } finally {
      setSaving(null)
    }
  }, [editData, fetchProviders])

  const handleActivate = useCallback(async (id: string) => {
    try {
      const res = await fetch("/api/ai/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "activate" }),
      })

      if (!res.ok) throw new Error("激活失败")
      await fetchProviders(false)
      showToast("已设为默认", "success")
    } catch (error) {
      showToast(error instanceof Error ? error.message : "激活失败", "error")
    }
  }, [fetchProviders])

  const handleTest = useCallback(async (provider: AiProvider) => {
    setTesting(provider.id)
    setTestResult(null)

    const edit = editData[provider.id]
    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: edit?.baseUrl ?? provider.baseUrl,
          apiKey: edit?.apiKey ?? (provider.hasApiKey ? undefined : ""),
          model: edit?.model ?? provider.model,
        }),
      })

      const result = await res.json()
      setTestResult({ id: provider.id, ...result })
    } catch {
      setTestResult({ id: provider.id, success: false, message: "测试请求失败" })
    } finally {
      setTesting(null)
    }
  }, [editData])

  const updateEdit = useCallback((id: string, field: EditableProviderField, value: string) => {
    setEditData(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }))
  }, [])

  const getFieldValue = useCallback((provider: AiProvider, field: EditableProviderField) => {
    const edit = editData[provider.id]
    if (edit && field in edit) return edit[field]?.toString() ?? ""
    if (field === "apiKey") return provider.hasApiKey ? provider.apiKey : ""
    return provider[field].toString()
  }, [editData])

  const hasChanges = useCallback((id: string) => {
    return id in editData && Object.keys(editData[id]).length > 0
  }, [editData])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <h1 className="text-3xl font-bold">设置</h1>
        </div>
        <div className="space-y-4">
          {[1, 2].map(i => <div key={i} className="skeleton h-64" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="page-header">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Settings className="h-8 w-8 text-primary" />
          设置
        </h1>
        <p className="text-muted-foreground mt-2">配置AI大模型API服务</p>
      </div>

      {loadError && (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-sm text-red-700">
              <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{loadError}，请检查服务状态后重试。</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => void fetchProviders()}>
              重新加载
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Provider Cards */}
      <div className="space-y-4">
        {providers.map((provider) => (
          <Card
            key={provider.id}
            className={`animate-slide-up transition-all ${provider.isActive ? 'ring-2 ring-primary' : ''}`}
          >
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <CardTitle className="text-lg">{provider.name}</CardTitle>
                  {provider.isActive && (
                    <Badge className="bg-primary">
                      <Zap className="h-3 w-3 mr-1" />
                      当前使用
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!provider.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleActivate(provider.id)}
                    >
                      设为默认
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTest(provider)}
                    disabled={testing === provider.id}
                  >
                    {testing === provider.id ? (
                      <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
                    ) : (
                      <TestTube className="h-4 w-4 sm:mr-2" />
                    )}
                    <span>{testing === provider.id ? "测试中" : "测试连接"}</span>
                  </Button>
                </div>
              </div>
              <CardDescription>
                {provider.id === "deepseek" && "DeepSeek - 国产高性能大模型"}
                {provider.id === "minimax" && "MiniMax - 多模态AI助手"}
                {provider.id === "openai" && "OpenAI - GPT系列模型"}
                {provider.id === "custom" && "自定义OpenAI兼容接口"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Test Result */}
              {testResult && testResult.id === provider.id && (
                <div className={`p-3 rounded-lg flex items-center gap-2 ${
                  testResult.success ? 'bg-green-500/10 text-green-700' : 'bg-red-500/10 text-red-700'
                }`}>
                  {testResult.success ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <span className="text-sm">{testResult.message}</span>
                </div>
              )}

              {/* Config Fields */}
              <div className="grid gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">API Base URL</label>
                    <Input
                      value={getFieldValue(provider, "baseUrl")}
                      onChange={(e) => updateEdit(provider.id, "baseUrl", e.target.value)}
                      placeholder="https://api.example.com/v1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">模型名称</label>
                    <Input
                      value={getFieldValue(provider, "model")}
                      onChange={(e) => updateEdit(provider.id, "model", e.target.value)}
                      placeholder="model-name"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">API Key</label>
                  <div className="relative">
                    <Input
                      type={showApiKey[provider.id] ? "text" : "password"}
                      value={getFieldValue(provider, "apiKey")}
                      onChange={(e) => updateEdit(provider.id, "apiKey", e.target.value)}
                      placeholder="sk-..."
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                      aria-label={showApiKey[provider.id] ? "隐藏 API Key" : "显示 API Key"}
                      onClick={() => setShowApiKey(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                    >
                      {showApiKey[provider.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">最大Token数</label>
                  <Input
                    type="number"
                    value={getFieldValue(provider, "maxTokens")}
                    onChange={(e) => updateEdit(provider.id, "maxTokens", e.target.value)}
                    placeholder="2000"
                    min={100}
                    max={32000}
                  />
                </div>
              </div>

              {/* Save Button */}
              {hasChanges(provider.id) && (
                <div className="flex justify-end">
                  <Button
                    onClick={() => handleUpdate(provider.id)}
                    disabled={saving === provider.id}
                  >
                    {saving === provider.id ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    保存更改
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Usage Tips */}
      <Card className="animate-slide-up">
        <CardHeader>
          <CardTitle className="text-base">使用说明</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. 选择一个AI服务商，填入对应的API Key</p>
          <p>2. 点击&quot;测试连接&quot;验证配置是否正确</p>
          <p>3. 点击&quot;设为默认&quot;将该服务商设为当前使用的AI</p>
          <p>4. 在题目详情页或刷题页面点击&quot;AI解答&quot;即可使用</p>
          <p className="mt-4 font-medium text-foreground">支持的API格式：</p>
          <p>所有兼容OpenAI格式的API均可使用，包括DeepSeek、MiniMax、智谱、Moonshot等</p>
        </CardContent>
      </Card>
    </div>
  )
}
