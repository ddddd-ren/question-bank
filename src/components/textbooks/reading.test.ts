import { describe, expect, it } from "vitest"
import type { TextbookChapter } from "@/lib/textbooks/types"
import { advanceThrough, changeChapterMark, chapterAt, learnedLabel, progressChanges } from "./reading"

const chapters: TextbookChapter[] = [
  { id: "a", title: "第一章", start: 1, end: 10, level: 1, learnedTo: 8, recentFrom: 1, linkedCount: 0 },
  { id: "b", title: "第一节", start: 1, end: 3, level: 2, learnedTo: null, recentFrom: null, linkedCount: 0 },
  { id: "c", title: "第二节", start: 4, end: 10, level: 2, learnedTo: 4, recentFrom: 4, linkedCount: 0 },
  { id: "d", title: "第二章", start: 11, end: 20, level: 1, learnedTo: null, recentFrom: null, linkedCount: 0 },
]

describe("教材阅读与手动进度", () => {
  it("定位到具体小节，同时允许选中同页起始的父章或阅读目录前的正文", () => {
    expect(chapterAt(chapters, 1)?.id).toBe("b")
    expect(chapterAt(chapters, 1, "a")?.id).toBe("a")
    expect(chapterAt(chapters, 11, "a")?.id).toBe("d")
    expect(chapterAt(chapters.slice(2), 1)).toBeUndefined()
  })

  it("学到这里只向前推进，确认时可以排除跳过的小节", () => {
    const draft = advanceThrough(chapters, 6)
    expect(draft).toEqual({ b: "full", c: "6" })
    delete draft.b
    expect(progressChanges(chapters, draft)).toEqual([{ chapterId: "c", learnedTo: 6 }])
  })

  it("整章设置包含所有子节，可单独清除一节，保留相邻章", () => {
    const full = changeChapterMark(chapters, 0, "full", {})
    expect(full).toEqual({ a: "full", b: "full", c: "full" })
    const withSkip = changeChapterMark(chapters, 2, "skip", full)
    expect(progressChanges(chapters, withSkip)).toEqual([
      { chapterId: "a", learnedTo: 10 }, { chapterId: "b", learnedTo: 3 }, { chapterId: "c", learnedTo: null, skipped: true },
    ])
    expect(progressChanges(chapters, changeChapterMark(chapters, 2, "keep", {}))).toEqual([])
  })

  it("区分未学、跳过和主动恢复", () => {
    const skipped = chapters.map(chapter => chapter.id === "c" ? { ...chapter, learnedTo: null, skipped: true } : chapter)
    expect(learnedLabel(skipped[2], "页")).toBe("已跳过")
    expect(advanceThrough(skipped, 6)).toEqual({ b: "full" })
    expect(progressChanges(skipped, { c: "clear" })).toEqual([{ chapterId: "c", learnedTo: null, skipped: false }])
    expect(progressChanges(skipped, { c: "skip" })).toEqual([])
  })

  it("拒绝越界、小数和空的部分进度", () => {
    for (const value of ["", "abc", "2", "5.5", "11"]) {
      expect(() => progressChanges(chapters, { c: value })).toThrow("第二节")
    }
  })

  it("撤回整章设置时，清除未保存的子节联动；部分学习保留子节原有的更远进度", () => {
    const full = changeChapterMark(chapters, 0, "full", {})
    expect(changeChapterMark(chapters, 0, "keep", full)).toEqual({})
    const partial = changeChapterMark(chapters, 0, "2", full)
    expect(partial).toEqual({ a: "2", b: "2" })
    expect(progressChanges(chapters, partial).map(c => c.chapterId)).toEqual(["a", "b"])
  })
})
