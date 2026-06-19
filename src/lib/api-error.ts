import { NextResponse } from "next/server"

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export function handleApiError(error: unknown) {
  console.error("[API Error]", error)

  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: error.message,
        ...(error.details && { details: error.details }),
      },
      { status: error.statusCode }
    )
  }

  if (error instanceof Error) {
    if (error.message.includes("UNIQUE constraint")) {
      return NextResponse.json(
        { error: "数据已存在，请勿重复提交" },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: "服务器内部错误", details: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json(
    { error: "未知错误" },
    { status: 500 }
  )
}
