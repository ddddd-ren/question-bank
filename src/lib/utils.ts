import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 解析选项文本，如 "A. xxx" -> "xxx"
export function parseOptionText(option: string): string {
  if (option.length <= 2) return option
  const separator = option.charAt(1)
  if ([".", "、", "．", ":", "："].includes(separator)) {
    return option.substring(2).trim()
  }
  return option.substring(1).trim()
}

// 获取选项字母，如 "A. xxx" -> "A"
export function getOptionLetter(option: string): string {
  return option.charAt(0)
}

export function getErrorMessage(error: unknown, fallback = "Unknown error"): string {
  return error instanceof Error ? error.message : fallback
}

export async function fetchJson<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  if (!response.ok) {
    let errorMessage = `请求失败: ${response.status}`
    try {
      const errorData = await response.json()
      errorMessage = errorData.error || errorData.message || errorMessage
    } catch {
      // ignore
    }
    throw new Error(errorMessage)
  }
  return response.json()
}
