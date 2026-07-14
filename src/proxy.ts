import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { AUTH_COOKIE_NAME, isPublicPath, isSessionTokenValid } from "@/lib/auth"

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!isPublicPath(pathname)) {
    const sessionToken = request.cookies.get(AUTH_COOKIE_NAME)?.value
    if (!isSessionTokenValid(sessionToken)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "未授权访问" },
          { status: 401, headers: { "Cache-Control": "private, no-store" } },
        )
      }

      const loginUrl = new URL("/login", request.url)
      return NextResponse.redirect(loginUrl)
    }
  }

  const response = NextResponse.next()

  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-XSS-Protection", "1; mode=block")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")

  if (request.nextUrl.pathname.startsWith("/api/")) {
    response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate")
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image).*)",
  ],
}
