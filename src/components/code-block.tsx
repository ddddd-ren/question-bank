"use client"

import React, { useEffect, useRef, useMemo } from "react"
import hljs from "highlight.js/lib/core"
import javascript from "highlight.js/lib/languages/javascript"
import typescript from "highlight.js/lib/languages/typescript"
import python from "highlight.js/lib/languages/python"
import java from "highlight.js/lib/languages/java"
import cpp from "highlight.js/lib/languages/cpp"
import c from "highlight.js/lib/languages/c"
import csharp from "highlight.js/lib/languages/csharp"
import go from "highlight.js/lib/languages/go"
import rust from "highlight.js/lib/languages/rust"
import sql from "highlight.js/lib/languages/sql"
import bash from "highlight.js/lib/languages/bash"
import xml from "highlight.js/lib/languages/xml"
import css from "highlight.js/lib/languages/css"
import json from "highlight.js/lib/languages/json"

let languagesRegistered = false

function ensureLanguagesRegistered() {
  if (languagesRegistered) return
  hljs.registerLanguage("javascript", javascript)
  hljs.registerLanguage("typescript", typescript)
  hljs.registerLanguage("python", python)
  hljs.registerLanguage("java", java)
  hljs.registerLanguage("cpp", cpp)
  hljs.registerLanguage("c", c)
  hljs.registerLanguage("csharp", csharp)
  hljs.registerLanguage("go", go)
  hljs.registerLanguage("rust", rust)
  hljs.registerLanguage("sql", sql)
  hljs.registerLanguage("bash", bash)
  hljs.registerLanguage("xml", xml)
  hljs.registerLanguage("css", css)
  hljs.registerLanguage("json", json)
  languagesRegistered = true
}

interface CodeBlockProps {
  code: string
  language?: string
  className?: string
}

export const CodeBlock = React.memo(function CodeBlock({ code, language, className = "" }: CodeBlockProps) {
  const codeRef = useRef<HTMLElement>(null)

  useEffect(() => {
    ensureLanguagesRegistered()
    if (codeRef.current) {
      hljs.highlightElement(codeRef.current)
    }
  }, [code, language])

  const langClass = useMemo(() => language ? `language-${language}` : "language-auto", [language])

  return (
    <pre className={`rounded-lg bg-muted p-4 overflow-x-auto ${className}`}>
      <code
        ref={codeRef}
        className={langClass}
      >
        {code}
      </code>
    </pre>
  )
})
