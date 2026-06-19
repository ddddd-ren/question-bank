import { getErrorMessage } from "@/lib/utils"
import type { AiProvider } from "./schema"

export async function testApiConnection(provider: AiProvider): Promise<{ success: boolean; message: string }> {
  if (!provider.apiKey) {
    return { success: false, message: "API Key 未配置" }
  }

  if (!provider.baseUrl) {
    return { success: false, message: "API Base URL 未配置" }
  }

  try {
    const OpenAI = (await import("openai")).default
    const client = new OpenAI({
      baseURL: provider.baseUrl,
      apiKey: provider.apiKey,
      timeout: 10000,
    })

    const response = await client.chat.completions.create({
      model: provider.model,
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 10,
    })

    if (response.choices && response.choices.length > 0) {
      return { success: true, message: "连接成功" }
    }

    return { success: false, message: "响应格式异常" }
  } catch (error: unknown) {
    const message = getErrorMessage(error, "连接失败")
    return { success: false, message: message.substring(0, 200) }
  }
}
