import { describe, expect, it } from "vitest"
import type { TemplateSection } from "@/lib/paper/template"
import { resizeTemplateSection } from "./resize-template-section"

function section(numbers: string[], points: (number | null)[] = []): TemplateSection {
  return { title: "大题", type: "essay", slots: numbers.map((number, i) => ({ number, points: points[i] ?? null })) }
}
const labels = (sections: TemplateSection[]) => sections.map(s => s.slots.map(slot => slot.number))

describe("校正大题题量", () => {
  it("从原题号新增并沿用统一分值，连续的后续大题顺延，重启处停止", () => {
    const original = [section(["10", "11"], [2,2]), section(["12"]), section(["13", "14"]), section(["1"]), section(["2"])]
    const changed = resizeTemplateSection(original, 0, 3)
    expect(labels(changed)).toEqual([["10","11","12"], ["13"], ["14","15"], ["1"], ["2"]])
    expect(changed[0].slots[2].points).toBe(2)
    expect(labels(resizeTemplateSection(changed, 0, 2))).toEqual(labels(original))
  })
  it("原有混合分值留空，保留补零题号和下一区的自定义编号", () => {
    const changed = resizeTemplateSection([section(["01","02"], [1,2]), section(["03","04b"]), section(["5"])], 0, 3)
    expect(labels(changed)).toEqual([["01","02","03"], ["03","04b"], ["5"]])
    expect(changed[0].slots[2].points).toBeNull()
  })
  it("人工非连续编号的新增题位留待确认", () => {
    const changed = resizeTemplateSection([section(["10","12"]), section(["13"])], 0, 3)
    expect(labels(changed)).toEqual([["10","12",""], ["13"]])
  })
})
