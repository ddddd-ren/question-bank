interface RateLimitOptions {
  limit: number
  windowMs: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

interface RateLimitEntry {
  count: number
  expiresAt: number
}

const entries = new Map<string, RateLimitEntry>()

export function consumeRateLimit(
  key: string,
  options: RateLimitOptions,
  now = Date.now(),
): RateLimitResult {
  for (const [entryKey, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(entryKey)
  }

  const current = entries.get(key)
  if (!current) {
    entries.set(key, { count: 1, expiresAt: now + options.windowMs })
    return { allowed: true, remaining: options.limit - 1, retryAfterSeconds: 0 }
  }

  if (current.count >= options.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.expiresAt - now) / 1000)),
    }
  }

  current.count += 1
  return {
    allowed: true,
    remaining: options.limit - current.count,
    retryAfterSeconds: 0,
  }
}

export function resetRateLimits() {
  entries.clear()
}
