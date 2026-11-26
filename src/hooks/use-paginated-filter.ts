"use client"

import { useCallback, useState } from "react"
import { useDebounce } from "./use-debounce"

export function usePaginatedFilter() {
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilterState] = useState("all")
  const [searchInput, setSearchInputState] = useState("")
  const committedSearch = useDebounce(searchInput.trim(), 300)

  const setTypeFilter = useCallback((value: string) => {
    setTypeFilterState(value)
    setPage(1)
  }, [])

  const setSearchInput = useCallback((value: string) => {
    setSearchInputState(value)
    setPage(1)
  }, [])

  const clearFilters = useCallback(() => {
    setSearchInputState("")
    setTypeFilterState("all")
    setPage(1)
  }, [])

  return {
    page,
    setPage,
    typeFilter,
    setTypeFilter,
    searchInput,
    setSearchInput,
    committedSearch,
    clearFilters,
  }
}
