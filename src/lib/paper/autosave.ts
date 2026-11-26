interface PaperDraft {
  answers: Record<string, string>
  marked: number[]
  submittedAt: number | null
}

export interface PaperEdit {
  questionId: number
  answer?: { from: string; to: string }
  marked?: boolean
}

export interface PaperSave {
  edits?: PaperEdit[]
  submit?: boolean
}

export interface PaperSaveAction {
  edit?: PaperEdit
  submit?: boolean
  resolve?: "local" | "saved"
}

export class PaperSaveConflict extends Error {
  constructor(public questionId: number, public savedAnswer: string) {
    super("这道题的答案已在其他页面修改")
  }
}

export function createPaperAutosave<T extends PaperDraft>(initial: T, send: (change: PaperSave) => Promise<T>) {
  let confirmed = initial
  let tail: Promise<T> = Promise.resolve(initial)
  let sent: PaperEdit[] = []
  const pending = new Map<number, PaperEdit>()
  let conflict: PaperSaveConflict | undefined
  let revision = 0

  async function transmit(edits: PaperEdit[], submit?: boolean) {
    sent = edits
    try {
      confirmed = await send({ edits, ...(submit && { submit }) })
      sent = []
      if (confirmed.submittedAt !== null) pending.clear()
    } catch (error) {
      if (error instanceof PaperSaveConflict) conflict = error
      throw error
    }
  }

  return {
    save(change: PaperSaveAction = {}) {
      const { edit, submit, resolve } = change
      if (edit) {
        const previous = pending.get(edit.questionId)
        const answer = edit.answer && { from: previous?.answer?.from ?? edit.answer.from, to: edit.answer.to }
        pending.set(edit.questionId, { ...previous, ...edit, ...(answer && { answer }) })
      }
      if (resolve && conflict) {
        const { questionId, savedAnswer } = conflict
        const waiting = pending.get(questionId)
        sent = sent.map(item => item.questionId !== questionId ? item : {
          ...item,
          answer: resolve === "local" ? { from: savedAnswer, to: waiting?.answer?.to ?? item.answer!.to } : undefined,
        }).filter(item => item.answer || item.marked !== undefined)
        if (waiting?.marked !== undefined) pending.set(questionId, { questionId, marked: waiting.marked })
        else pending.delete(questionId)
        conflict = undefined
      }

      const current = ++revision
      const promise = tail.catch(() => {}).then(async () => {
        if (current !== revision || confirmed.submittedAt !== null) return confirmed
        if (conflict) throw conflict
        // 原请求可能已写入但响应丢失，先重试同一批改动，再发送后续输入。
        if (sent.length) await transmit(sent)
        if (current !== revision || confirmed.submittedAt !== null) return confirmed
        const edits = [...pending.values()]
        pending.clear()
        if (edits.length || submit || resolve) await transmit(edits, submit)
        return confirmed
      })
      tail = promise
      return { promise, isLatest: () => current === revision }
    },
    flush: () => tail,
    hasPending: () => sent.length > 0 || pending.size > 0,
    draft() {
      const answers = { ...confirmed.answers }
      const marked = new Set(confirmed.marked)
      for (const edit of [...sent, ...pending.values()]) {
        if (edit.answer) answers[edit.questionId] = edit.answer.to
        if (edit.marked === true) marked.add(edit.questionId)
        if (edit.marked === false) marked.delete(edit.questionId)
      }
      return { answers, marked: [...marked] }
    },
  }
}
