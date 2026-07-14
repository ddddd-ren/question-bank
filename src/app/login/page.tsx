"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: formData.get("token") }),
    }).catch(() => null)

    if (!response?.ok) {
      setError("访问令牌无效或服务暂不可用")
      setSubmitting(false)
      return
    }

    router.replace("/")
    router.refresh()
  }

  return (
    <div className="min-h-[65vh] flex items-center justify-center py-10">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground text-background">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">访问题库</h1>
            <p className="text-sm text-muted-foreground">请输入部署时配置的访问令牌</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="token" className="text-sm font-medium">访问令牌</label>
            <Input
              id="token"
              name="token"
              type="password"
              autoComplete="current-password"
              required
              maxLength={200}
              autoFocus
            />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "验证中..." : "登录"}
          </Button>
        </form>
      </div>
    </div>
  )
}
