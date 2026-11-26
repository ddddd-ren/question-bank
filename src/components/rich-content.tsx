"use client"

import React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import { cn } from "@/lib/utils"
import { CodeBlock } from "@/components/code-block"

export function RichContent({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("rich-content min-w-0 break-words text-sm leading-relaxed [&_p]:whitespace-pre-wrap [&_p+p]:mt-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:block [&_table]:overflow-x-auto [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_a]:text-primary [&_a]:underline [&_.katex-display]:overflow-x-auto", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { trust: false, strict: "ignore", maxExpand: 1000 }]]}
        components={{
          pre: ({ children }) => {
            if (!React.isValidElement<{ children?: React.ReactNode; className?: string }>(children)) return <pre>{children}</pre>
            return <CodeBlock code={String(children.props.children || "").replace(/\n$/, "")} language={children.props.className?.replace(/^language-/, "")} />
          },
          // 题目外链图片尺寸未知，交由浏览器加载并禁止发送来源页面。
          // eslint-disable-next-line @next/next/no-img-element
          img: ({ src, alt, title }) => <img src={src} alt={alt || "题目图片"} title={title} loading="lazy" referrerPolicy="no-referrer" className="my-3 h-auto max-w-full rounded-md" />,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
        }}
      >{content}</ReactMarkdown>
    </div>
  )
}
