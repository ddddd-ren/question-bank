import { expect, it } from "vitest"
import { allocateStudyQuotas, type QuotaPool } from "./study-allocation"

it("按配额重排重叠题池，结果与小卷穷举的最大可填题位数一致", () => {
  const candidate = (id: number) => ({ id, identity: String(id) })
  const pool = (mask: number): QuotaPool => {
    const ids = [0, 1, 2, 3].filter(id => (mask & (1 << id)) !== 0)
    return { recent: ids.filter(id => id < 2).map(candidate), review: ids.filter(id => id >= 2).map(candidate) }
  }
  for (let mask = 0; mask < 16; mask++) {
    const broad = pool(mask), strict = pool(5)
    const slots = [broad, strict, broad]
    for (let count = 0; count <= slots.length; count++) {
      function best(at: number, used: number[], fresh: number): number {
        if (at === slots.length) return used.length
        let result = best(at + 1, used, fresh)
        for (const { id } of [...slots[at].recent, ...slots[at].review]) {
          const next = fresh + Number(id < 2)
          if (used.includes(id) || next > count || used.length + 1 - next > slots.length - count) continue
          result = Math.max(result, best(at + 1, [...used, id], next))
        }
        return result
      }
      const { assigned, newSlots } = allocateStudyQuotas(slots, count)
      expect(assigned.size).toBe(best(0, [], 0))
      expect(new Set(assigned.values()).size).toBe(assigned.size)
      for (const [index, id] of assigned) expect(newSlots.includes(index)).toBe(id < 2)
    }
  }
})
