"use client"

import { ErrorBoundary } from "@/components/error-boundary"
import { useServiceWorker } from "@/hooks/use-service-worker"
import { type ReactNode } from "react"

export function ClientErrorBoundary({ children }: { children: ReactNode }) {
  useServiceWorker()
  return <ErrorBoundary>{children}</ErrorBoundary>
}
