import { createHash, timingSafeEqual } from "node:crypto"

export const AUTH_COOKIE_NAME = "question_bank_session"

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/favicon.ico",
  "/icon.png",
  "/apple-icon.png",
  "/manifest.json",
  "/sw.js",
  "/file.svg",
  "/globe.svg",
  "/next.svg",
  "/vercel.svg",
  "/window.svg",
])

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function isAccessTokenValid(candidate: string | undefined): boolean {
  const expected = process.env.APP_ACCESS_TOKEN
  if (!expected || !candidate) return false
  return safeEqual(candidate, expected)
}

export function createSessionToken(): string | undefined {
  const accessToken = process.env.APP_ACCESS_TOKEN
  if (!accessToken) return undefined

  return createHash("sha256")
    .update(`question-bank-session:${accessToken}`)
    .digest("hex")
}

export function isSessionTokenValid(candidate: string | undefined): boolean {
  const expected = createSessionToken()
  if (!expected || !candidate) return false
  return safeEqual(candidate, expected)
}

export function isPublicPath(pathname: string): boolean {
  return pathname.startsWith("/_next/") || PUBLIC_PATHS.has(pathname)
}
