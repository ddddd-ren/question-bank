"use client"

import { useEffect } from "react"

export function useServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return
    }

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        })

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing
          if (!newWorker) return

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "activated") {
              console.log("Service Worker 已更新")
            }
          })
        })
      } catch (error) {
        console.error("Service Worker 注册失败:", error)
      }
    }

    registerSW()
  }, [])
}

export async function clearQuestionBankCaches() {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem("question-bank:practice-draft:v1")
    window.dispatchEvent(new Event("question-bank:session-cleared"))
  } catch { /* 浏览器禁用本地存储时仍继续清理缓存。 */ }
  if (!("caches" in window)) return
  const cacheNames = await caches.keys()
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith("question-bank-"))
      .map((name) => caches.delete(name)),
  )
}
