import type { TemplateSection, TemplateSlot } from "@/lib/paper/template"

function numericStart(slots: TemplateSlot[]) {
  const first = slots[0]?.number
  if (!first || !/^\d+$/.test(first)) return null
  const start = BigInt(first)
  return slots.every((slot, i) => /^\d+$/.test(slot.number) && BigInt(slot.number) === start + BigInt(i)) ? start : null
}

function displayNumber(value: bigint, original: string) {
  return String(value).padStart(original.startsWith("0") ? original.length : 0, "0")
}

export function resizeTemplateSection(sections: TemplateSection[], index: number, count: number) {
  const before = sections[index].slots
  const delta = count - before.length
  if (!delta) return sections
  const start = numericStart(before)
  const points = before.length && before.every(slot => slot.points === before[0].points) ? before[0].points : null
  const slots = Array.from({ length: count }, (_, i) => before[i] ?? {
    number: start === null ? "" : displayNumber(start + BigInt(i), before[0].number),
    points,
  })
  const result = [...sections]
  result[index] = { ...sections[index], slots }
  if (start === null) return result
  let next = start + BigInt(before.length)
  for (let i = index + 1; i < sections.length; i++) {
    const section = sections[i]
    if (numericStart(section.slots) !== next || next <= BigInt(1)) break
    result[i] = { ...section, slots: section.slots.map(slot => ({
      ...slot, number: displayNumber(BigInt(slot.number) + BigInt(delta), slot.number),
    })) }
    next += BigInt(section.slots.length)
  }
  return result
}
