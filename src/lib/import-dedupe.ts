export function splitDuplicateQuestions<T extends { contentHash: string }>(
  questions: T[],
  existingHashes: ReadonlySet<string>,
): { unique: T[]; duplicateCount: number } {
  const seenHashes = new Set(existingHashes)
  const unique: T[] = []
  let duplicateCount = 0

  for (const question of questions) {
    if (seenHashes.has(question.contentHash)) {
      duplicateCount += 1
      continue
    }
    seenHashes.add(question.contentHash)
    unique.push(question)
  }

  return { unique, duplicateCount }
}
