import { shuffle } from "../random"

export interface PaperCandidate { id: number; identity: string }
export interface QuotaPool { recent: PaperCandidate[]; review: PaperCandidate[] }
type Edge = { to: number; reverse: number; left: number }

// 大题、题目指纹及新旧课题数都有限额。残量路径允许把稀缺题让给更严格的大题。
export function allocateStudyQuotas(slots: QuotaPool[], newCount: number) {
  const graph: Edge[][] = []
  const node = () => graph.push([]) - 1
  function connect(from: number, to: number, capacity: number) {
    const forward = { to, reverse: graph[to].length, left: capacity }
    graph[to].push({ to: from, reverse: graph[from].length, left: 0 })
    graph[from].push(forward)
    return forward
  }
  const source = node(), newBucket = node(), oldBucket = node(), sink = node()
  const freshLimit = connect(newBucket, sink, newCount)
  const reviewLimit = connect(oldBucket, sink, slots.length - newCount)
  const identities = new Map<string, number>()
  const grouped = new Map<QuotaPool, number[]>()
  slots.forEach((pool, index) => {
    const existing = grouped.get(pool)
    if (existing) existing.push(index)
    else grouped.set(pool, [index])
  })
  const assignments: { indexes: number[]; choices: { id: number; fresh: boolean; edge: Edge }[] }[] = []
  for (const [pool, indexes] of grouped) {
    const group = node()
    connect(source, group, indexes.length)
    const choices = []
    for (const fresh of [true, false]) {
      for (const candidate of fresh ? pool.recent : pool.review) {
        let identity = identities.get(candidate.identity)
        if (identity === undefined) {
          identity = node()
          identities.set(candidate.identity, identity)
          connect(identity, fresh ? newBucket : oldBucket, 1)
        }
        choices.push({ id: candidate.id, fresh, edge: connect(group, identity, 1) })
      }
    }
    assignments.push({ indexes, choices })
  }
  while (true) {
    const levels = Array<number>(graph.length).fill(-1)
    const queue = [source]
    levels[source] = 0
    for (let i = 0; i < queue.length; i++) {
      for (const edge of graph[queue[i]]) {
        if (edge.left === 0 || levels[edge.to] !== -1) continue
        levels[edge.to] = levels[queue[i]] + 1
        queue.push(edge.to)
      }
    }
    if (levels[sink] === -1) break
    const next = Array<number>(graph.length).fill(0)
    function push(from: number, amount: number): number {
      if (from === sink) return amount
      for (; next[from] < graph[from].length; next[from]++) {
        const edge = graph[from][next[from]]
        if (!edge.left || levels[edge.to] !== levels[from] + 1) continue
        const sent = push(edge.to, Math.min(amount, edge.left))
        if (sent) {
          edge.left -= sent
          graph[edge.to][edge.reverse].left += sent
          return sent
        }
      }
      return 0
    }
    while (push(source, slots.length) > 0) { /* 本层还有可用路径。 */ }
  }
  const assigned = new Map<number, number>(), newSlots: number[] = []
  for (const { indexes, choices } of assignments) {
    // 随机分配同规则的题位，避免所有新课题总是排在大题最前。
    const chosen = shuffle(choices.filter(choice => choice.edge.left === 0))
    chosen.forEach((choice, i) => {
      assigned.set(indexes[i], choice.id)
      if (choice.fresh) newSlots.push(indexes[i])
    })
  }
  return { assigned, newSlots, balance: { newRequired: newCount, newAssigned: newCount - freshLimit.left,
    oldRequired: slots.length - newCount, oldAssigned: slots.length - newCount - reviewLimit.left } }
}
