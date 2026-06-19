import type { Metadata, Viewport } from "next"
import "./globals.css"
import { Nav } from "@/components/nav"
import { ToastContainer } from "@/components/toast"
import { ClientErrorBoundary } from "@/components/client-error-boundary"

export const metadata: Metadata = {
  title: "题库系统",
  description: "个人题库管理与练习工具",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "题库系统",
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#111113" },
  ],
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <head>
        <link rel="apple-touch-icon" href="/apple-icon.png" />
      </head>
      <body className="min-h-full flex flex-col">
        <Nav />
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fade-in">
          <ClientErrorBoundary>
            {children}
          </ClientErrorBoundary>
        </main>
        <footer className="border-t border-border/70 py-4 text-center text-xs text-muted-foreground">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p>题库系统 · 本地专业学习工具</p>
          </div>
        </footer>
        <ToastContainer />
      </body>
    </html>
  )
}
