import type { StructuredParagraph } from "./recognition-types"

function normalizeFullWidthAscii(text: string): string {
  return text
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xfee0))
    .replace(/[．：：（）【】]/g, (character) => ({
      "．": ".",
      "：": ":",
      "（": "(",
      "）": ")",
      "【": "[",
      "】": "]",
    })[character] || character)
}

function isPdfArtifact(text: string): boolean {
  return /^第\s*\d+\s*页$/i.test(text)
    || /^\d+\s*[/／]\s*\d+$/.test(text)
    || /^[-—]?\s*\d+\s*[-—]?$/.test(text)
}

export function normalizeParagraphs(paragraphs: StructuredParagraph[]): StructuredParagraph[] {
  const result: StructuredParagraph[] = []

  for (const paragraph of paragraphs) {
    const text = normalizeFullWidthAscii(paragraph.text)
      .replace(/[\u200b\ufeff\u2060]/g, "")
      .replace(/[ \t\u00a0]+/g, " ")
      .trim()

    if (!text || (paragraph.sourceKind === "pdf-line" && isPdfArtifact(text))) continue
    const normalized = { ...paragraph, text }
    const previous = result.at(-1)
    if (paragraph.sourceKind === "slide" && previous?.sourceKind === "slide" && previous.text === text) continue
    result.push(normalized)
  }

  return result
}
