export function normalizeChoiceAnswer(answer?: string | null): string | null {
  if (!answer) return null

  const normalized = answer
    .trim()
    .replace(/[\uff41-\uff5a\uff21-\uff3a]/g, (char) => {
      const code = char.charCodeAt(0)
      return String.fromCharCode(code >= 0xff41 ? code - 0xff41 + 97 : code - 0xff21 + 65)
    })
    .toUpperCase()

  // 题型识别也复用此函数，判断答案不能被拆成多选字母。
  if (normalized === "FALSE" || !/^[A-T](?:[\s\u3001\uff0c,;\uff1b|/]*[A-T])*$/.test(normalized)) {
    return null
  }

  const letters = normalized.match(/[A-T]/g)
  if (!letters) return null

  return Array.from(new Set(letters)).sort().join("") || null
}
