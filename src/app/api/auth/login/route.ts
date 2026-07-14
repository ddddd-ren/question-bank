import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { AUTH_COOKIE_NAME, createSessionToken, isAccessTokenValid } from "@/lib/auth"
import { handleApiError } from "@/lib/api-error"

const LoginSchema = z.object({
  token: z.string().min(1).max(200),
})

export async function POST(request: NextRequest) {
  try {
    const { token } = LoginSchema.parse(await request.json())
    if (!isAccessTokenValid(token)) {
      return NextResponse.json({ error: "访问令牌无效" }, { status: 401 })
    }

    const sessionToken = createSessionToken()
    if (!sessionToken) {
      return NextResponse.json({ error: "服务未配置访问令牌" }, { status: 503 })
    }

    const response = NextResponse.json({ success: true })
    response.cookies.set(AUTH_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })
    return response
  } catch (error) {
    return handleApiError(error)
  }
}
