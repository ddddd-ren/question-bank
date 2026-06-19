"use client"

import React from "react"
import { Keyboard } from "lucide-react"

export const KeyboardHints = React.memo(function KeyboardHints() {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-1">
        <Keyboard className="h-3 w-3" />
        <span>快捷键:</span>
      </div>
      <div className="flex items-center gap-3">
        <span><kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">1-4</kbd> 选择</span>
        <span><kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">Enter</kbd> 下一题</span>
      </div>
    </div>
  )
})
