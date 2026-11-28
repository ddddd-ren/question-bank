"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { BookMarked, BookOpen, FileText, FileUp, GraduationCap, Heart, LayoutDashboard, Layers, LogOut, Menu, PenTool, Settings, X, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "./theme-toggle"
import { clearQuestionBankCaches } from "@/hooks/use-service-worker"

const navItems = [
  { href: "/", label: "仪表盘", icon: LayoutDashboard },
  { href: "/import", label: "导入", icon: FileUp },
  { href: "/bank", label: "题库", icon: BookOpen },
  { href: "/textbooks", label: "教材", icon: BookMarked },
  { href: "/subjects", label: "学科", icon: Layers },
  { href: "/paper", label: "组卷", icon: FileText },
  { href: "/practice", label: "练习", icon: PenTool },
  { href: "/mistakes", label: "错题", icon: XCircle },
  { href: "/favorites", label: "收藏", icon: Heart },
  { href: "/settings", label: "设置", icon: Settings },
]
const showLogout = process.env.NEXT_PUBLIC_QUESTION_BANK_DESKTOP !== "1"

export function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen(prev => !prev)
  }, [])

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false)
  }, [])

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    await clearQuestionBankCaches()
    router.replace("/login")
  }, [router])

  if (pathname === "/login") return null

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/82 backdrop-blur-xl">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 font-semibold text-[15px]">
          <div className="w-8 h-8 rounded-lg bg-foreground text-background flex items-center justify-center">
            <GraduationCap className="h-4.5 w-4.5" />
          </div>
          <span className="text-foreground">题库系统</span>
        </Link>

        <div className="hidden lg:flex items-center gap-3">
          <nav className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-card/72 p-1 shadow-sm">
            {navItems.map((item) => {
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 px-2 xl:px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors",
                    isActive
                      ? "bg-secondary text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>
          <ThemeToggle />
          {showLogout && <button
            type="button"
            onClick={logout}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="退出登录"
            title="退出登录"
          >
            <LogOut className="h-4 w-4" />
          </button>}
        </div>

        <div className="flex lg:hidden items-center gap-2">
          <ThemeToggle />
          {showLogout && <button
            type="button"
            onClick={logout}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="退出登录"
            title="退出登录"
          >
            <LogOut className="h-4 w-4" />
          </button>}
          <button
            type="button"
            onClick={toggleMobileMenu}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border/70 bg-card text-foreground transition-colors hover:bg-muted"
            aria-label={mobileMenuOpen ? "关闭导航" : "打开导航"}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-border/70 bg-background/95 backdrop-blur-xl">
          <nav className="w-full max-w-7xl mx-auto px-4 py-2 grid gap-1">
            {navItems.map((item) => {
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMobileMenu}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-secondary text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="h-4.5 w-4.5" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      )}
    </header>
  )
}
