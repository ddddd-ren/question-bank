"use client"

import { useEffect, useRef, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { Button } from "@/components/ui/button"
import { version } from "../../../package.json"

const cookieName = "question_bank_update_seen"
const updateVersion = "0.1.4"

export function UpdateNotice() {
  const [open, setOpen] = useState(false)
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (version !== updateVersion) return
    const timer = window.setTimeout(() => {
      // Cookie 不区分端口，桌面版更换本地服务端口后仍能读取。
      const seen = document.cookie.split(/;\s*/).includes(`${cookieName}=${version}`)
      if (!seen) setOpen(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  function onOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      document.cookie = `${cookieName}=${version}; Path=/; Max-Age=31536000; SameSite=Lax`
    }
    setOpen(nextOpen)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-card p-5 text-card-foreground shadow-lg sm:p-6"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            closeButton.current?.focus()
          }}
        >
          <Dialog.Title className="text-lg font-semibold">题库系统 {version} 更新</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            首页新增错题分析，方便找出容易答错的学科和知识点。
          </Dialog.Description>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
            <li>用条形图查看答对次数、答错次数和错误率。</li>
            <li>按学科筛选，查看近 30 天或全部时间的已判分作答。</li>
            <li>点击知识点，进入对应的错题重练。</li>
          </ul>
          <div className="mt-5 flex justify-end">
            <Dialog.Close asChild>
              <Button ref={closeButton} type="button">知道了</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
