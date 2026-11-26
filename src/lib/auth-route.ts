import { NextResponse, type NextRequest } from "next/server"
import { AUTH_COOKIE_NAME, isSessionTokenValid } from "./auth"

type AuthenticatedRouteHandler = (
  request: NextRequest,
  ...args: never[]
) => Response | Promise<Response>

export function withSession<T extends AuthenticatedRouteHandler>(handler: T): T {
  return (async (...args: Parameters<T>) => {
    const request = args[0]
    const sessionToken = request.cookies.get(AUTH_COOKIE_NAME)?.value
    if (!isSessionTokenValid(sessionToken)) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401, headers: { "Cache-Control": "private, no-store" } },
      )
    }

    const invoke = handler as (...handlerArgs: Parameters<T>) => Response | Promise<Response>
    return invoke(...args)
  }) as T
}
