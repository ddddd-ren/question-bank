"use client"

import React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sparkles, Loader2 } from "lucide-react"
import { RichContent } from "@/components/rich-content"

interface AiResponseCardProps {
  response: string
  loading?: boolean
}

export const AiResponseCard = React.memo(function AiResponseCard({ response, loading }: AiResponseCardProps) {
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
          <RichContent content={response} />
        ) : (
          <p className="text-sm text-muted-foreground">正在生成解答...</p>
        )}
      </CardContent>
    </Card>
  )
})
