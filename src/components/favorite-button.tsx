"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Heart, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { showToast } from "@/components/toast"

interface FavoriteButtonProps {
  questionId: number
  className?: string
}

export function FavoriteButton({ questionId, className }: FavoriteButtonProps) {
  const [isFavorited, setIsFavorited] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkFavorite = async () => {
      try {
        const res = await fetch(`/api/favorites?questionId=${questionId}`)
        if (res.ok) {
          const data = await res.json()
          setIsFavorited(data.isFavorited)
        }
      } catch (error) {
        console.error("Check favorite error:", error)
      } finally {
        setChecking(false)
      }
    }
    checkFavorite()
  }, [questionId])

  const toggleFavorite = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "操作失败")
      }
      const data = await res.json()
      setIsFavorited(data.isFavorited)
      showToast(data.isFavorited ? "已收藏" : "已取消收藏", "success")
    } catch (error) {
      showToast(error instanceof Error ? error.message : "操作失败", "error")
    } finally {
      setLoading(false)
    }
  }, [questionId])

  if (checking) {
    return (
      <Button variant="ghost" size="sm" disabled className={className} aria-label="检查收藏状态">
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleFavorite}
      disabled={loading}
      aria-label={isFavorited ? "取消收藏" : "收藏题目"}
      className={cn(
        isFavorited ? "text-red-500 hover:text-red-600" : "text-muted-foreground",
        className
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Heart className={cn("h-4 w-4", isFavorited && "fill-current")} />
      )}
    </Button>
  )
}
