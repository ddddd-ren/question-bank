import useSWR from "swr"

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) {
    const error = new Error("请求失败")
    error.cause = await res.json().catch(() => null)
    throw error
  }
  return res.json()
}

export function useDashboard() {
  return useSWR("/api/dashboard", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  })
}

interface QuestionFilters {
  page?: number
  pageSize?: number
  type?: string
  search?: string
  hasAnswer?: boolean
  recentDays?: number
}

export function useQuestions(filters: QuestionFilters = {}) {
  const params = new URLSearchParams()
  if (filters.page) params.set("page", filters.page.toString())
  if (filters.pageSize) params.set("pageSize", filters.pageSize.toString())
  if (filters.type && filters.type !== "all") params.set("type", filters.type)
  if (filters.search) params.set("search", filters.search)
  if (filters.hasAnswer) params.set("hasAnswer", "true")
  if (filters.recentDays) params.set("recentDays", filters.recentDays.toString())

  const key = `/api/questions?${params.toString()}`
  return useSWR(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 2000,
  })
}

export function useSubjects() {
  return useSWR("/api/subjects", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })
}

export function useCategories() {
  return useSWR("/api/categories", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })
}

export function useKnowledgePoints(subjectId?: number) {
  const key = subjectId
    ? `/api/knowledge-points?subjectId=${subjectId}`
    : "/api/knowledge-points"
  return useSWR(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 10000,
  })
}
