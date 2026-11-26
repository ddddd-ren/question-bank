import { z } from "zod"

export const MAX_PRACTICE_ANSWER_LENGTH = 10000
export const MAX_PRACTICE_TIME = 7200
export const PracticeSubmitSchema = z.object({
  questionId: z.number().int().positive(),
  userAnswer: z.string().trim().min(1, "请先填写答案").max(MAX_PRACTICE_ANSWER_LENGTH, "答案不能超过10000字，请缩短后提交"),
  // 单题计时最多记录两小时，客户端和服务端使用相同规则。
  timeSpent: z.number().int().min(0).transform(value => Math.min(value, MAX_PRACTICE_TIME)).optional(),
})
