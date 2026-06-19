import { create } from "zustand"
import { persist } from "zustand/middleware"

interface FilterState {
  questionType: string
  searchQuery: string
  hasAnswer: boolean
  recentOnly: boolean
  currentPage: number
  pageSize: number

  setQuestionType: (type: string) => void
  setSearchQuery: (query: string) => void
  setHasAnswer: (has: boolean) => void
  setRecentOnly: (recent: boolean) => void
  setCurrentPage: (page: number) => void
  setPageSize: (size: number) => void
  resetFilters: () => void
}

export const useFilterStore = create<FilterState>((set) => ({
  questionType: "all",
  searchQuery: "",
  hasAnswer: false,
  recentOnly: false,
  currentPage: 1,
  pageSize: 20,

  setQuestionType: (type) => set({ questionType: type, currentPage: 1 }),
  setSearchQuery: (query) => set({ searchQuery: query, currentPage: 1 }),
  setHasAnswer: (has) => set({ hasAnswer: has, currentPage: 1 }),
  setRecentOnly: (recent) => set({ recentOnly: recent, currentPage: 1 }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setPageSize: (size) => set({ pageSize: size, currentPage: 1 }),
  resetFilters: () => set({
    questionType: "all",
    searchQuery: "",
    hasAnswer: false,
    recentOnly: false,
    currentPage: 1,
  }),
}))

interface AppState {
  sidebarOpen: boolean
  theme: "light" | "dark" | "system"

  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setTheme: (theme: "light" | "dark" | "system") => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarOpen: false,
      theme: "system",

      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "app-storage",
      partialize: (state) => ({ theme: state.theme }),
    }
  )
)
