"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sparkles, Loader2 } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface AiResponseCardProps {
  response: string
  loading?: boolean
}

export function AiResponseCard({ response, loading }: AiResponseCardProps) {
  if (!response && !loading) return null

  return (
    <Card className="animate-slide-up">
      <CardHeader className="py-3 px-6">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI解答
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-6 pb-4">
        {response ? (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {response}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">正在生成解答...</p>
        )}
      </CardContent>
    </Card>
  )
}
