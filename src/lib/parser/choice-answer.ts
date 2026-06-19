export function normalizeChoiceAnswer(answer?: string | null): string | null {
  if (!answer) return null

  const normalized = answer
    .trim()
    .replace(/[\uff41-\uff5a\uff21-\uff3a]/g, (char) => {
      const code = char.charCodeAt(0)
      return String.fromCharCode(code >= 0xff41 ? code - 0xff41 + 97 : code - 0xff21 + 65)
    })
    .toUpperCase()

  if (!/^[A-H](?:[\s\u3001\uff0c,;\uff1b|/]*[A-H])*$/.test(normalized)) {
    return null
  }

  const letters = normalized.match(/[A-H]/g)
  if (!letters) return null

  return Array.from(new Set(letters)).sort().join("") || null
}
