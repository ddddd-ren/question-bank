import type { TemplateSection } from "./template"

export function formatTemplateHeading(section: TemplateSection) {
  const points = section.slots.map(slot => slot.points)
  const total = points.every(n => n !== null) ? Number(points.reduce<number>((a,b) => a + (b ?? 0),0).toFixed(6)) : null
  const same = points[0] != null && points.every(p => p === points[0])
  return section.title
    .replace(/((?:共|计|本大题)?\s*)\d+(\s*(?:小)?题)/g, (_,a,b) => a + section.slots.length + b)
    .replace(/(每(?:小)?题\s*)\d+(?:\.\d+)?(\s*分)|各题分值见题号/g, (_,label,unit) => same ? (label || "每题") + points[0] + (unit || "分") : "各题分值见题号")
    .replace(/((?:共|总计|合计|满分)\s*)\d+(?:\.\d+)?(\s*分)|总分待定/g, (_,label,unit) => total === null ? "总分待定" : (label || "共") + total + (unit || "分"))
    .replace(/([（(])\s*\d+(?:\.\d+)?\s*分\s*([）)])/g, (_,a,b) => a + (total === null ? "总分待定" : total + "分") + b)
}
