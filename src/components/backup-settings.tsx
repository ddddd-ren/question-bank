"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { showToast } from "@/components/toast"

export function BackupSettings() {
  const [busy, setBusy] = useState(false)
  const download = async () => {
    setBusy(true)
    try {
      const response = await fetch("/api/backup")
      if (!response.ok) throw new Error((await response.json()).error || "备份失败")
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement("a")
      link.href = url
      link.download = `question-bank-${new Date().toISOString().slice(0, 10)}.db`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      showToast("完整备份已下载", "success")
    } catch (error) {
      showToast(error instanceof Error ? error.message : "备份失败", "error")
    } finally { setBusy(false) }
  }
  return <Card>
    <CardHeader><CardTitle>完整备份与恢复</CardTitle></CardHeader>
    <CardContent className="space-y-3 text-sm">
      <p>备份包含题目、收藏、练习历史、复习进度、已保存试卷和 AI 配置。题目 CSV / JSON 导出仅用于交换题目。</p>
      <p className="text-muted-foreground">完整备份可能包含已保存的 API Key，请妥善保管。恢复前停止题库服务，使用项目备份工具校验并恢复；恢复时会保留原数据库。</p>
      <Button onClick={download} disabled={busy}><Download className="mr-2 h-4 w-4" />{busy ? "正在备份…" : "下载完整备份"}</Button>
    </CardContent>
  </Card>
}
