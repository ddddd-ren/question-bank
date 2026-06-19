import { create } from "zustand"

interface PracticeQuestion {
  id: number
  type: string
  content: string
  options: string[] | null
  answer: string | null
  explanation?: string | null
}

interface PracticeRecord {
  questionId: number
  isCorrect: boolean
  userAnswer: string
  timeSpent: number
}

interface PracticeState {
  questions: PracticeQuestion[]
  currentIndex: number
  answers: Map<number, string>
  records: PracticeRecord[]
  streak: number
  totalCorrect: number
  showResult: boolean
  showAnswer: boolean
  timerRunning: boolean
  currentQuestionTime: number

  setQuestions: (questions: PracticeQuestion[]) => void
  setCurrentIndex: (index: number) => void
  submitAnswer: (questionId: number, answer: string, timeSpent: number) => void
  goNext: () => void
  goPrev: () => void
  toggleAnswer: () => void
  toggleResult: () => void
  setTimerRunning: (running: boolean) => void
  setCurrentQuestionTime: (time: number) => void
  reset: () => void
}

export const usePracticeStore = create<PracticeState>((set, get) => ({
  questions: [],
  currentIndex: 0,
  answers: new Map(),
  records: [],
  streak: 0,
  totalCorrect: 0,
  showResult: false,
  showAnswer: false,
  timerRunning: false,
  currentQuestionTime: 0,

  setQuestions: (questions) => set({
    questions,
    currentIndex: 0,
    answers: new Map(),
    records: [],
    streak: 0,
    totalCorrect: 0,
    showResult: false,
    showAnswer: false,
    timerRunning: true,
    currentQuestionTime: 0,
  }),

  setCurrentIndex: (index) => {
    const { questions } = get()
    if (index >= 0 && index < questions.length) {
      set({
        currentIndex: index,
        showResult: false,
        showAnswer: false,
        currentQuestionTime: 0,
      })
    }
  },

  submitAnswer: (questionId, answer, timeSpent) => {
    const { questions, currentIndex, answers, records, streak, totalCorrect } = get()
    const question = questions[currentIndex]
    if (!question) return

    const newAnswers = new Map(answers)
    newAnswers.set(questionId, answer)

    let isCorrect = false
    if (question.type === "fill") {
      isCorrect = answer.trim().toLowerCase() === question.answer?.trim().toLowerCase()
    } else if (question.type === "code") {
      isCorrect = false
    } else {
      isCorrect = answer === question.answer
    }

    const newRecord: PracticeRecord = {
      questionId,
      isCorrect,
      userAnswer: answer,
      timeSpent,
    }

    set({
      answers: newAnswers,
      records: [...records, newRecord],
      streak: isCorrect ? streak + 1 : 0,
      totalCorrect: isCorrect ? totalCorrect + 1 : totalCorrect,
      showResult: true,
      timerRunning: false,
    })
  },

  goNext: () => {
    const { currentIndex, questions } = get()
    if (currentIndex < questions.length - 1) {
      set({
        currentIndex: currentIndex + 1,
        showResult: false,
        showAnswer: false,
        currentQuestionTime: 0,
        timerRunning: true,
      })
    }
  },

  goPrev: () => {
    const { currentIndex } = get()
    if (currentIndex > 0) {
      set({
        currentIndex: currentIndex - 1,
        showResult: false,
        showAnswer: false,
        currentQuestionTime: 0,
      })
    }
  },

  toggleAnswer: () => set((state) => ({ showAnswer: !state.showAnswer })),
  toggleResult: () => set((state) => ({ showResult: !state.showResult })),
  setTimerRunning: (running) => set({ timerRunning: running }),
  setCurrentQuestionTime: (time) => set({ currentQuestionTime: time }),

  reset: () => set({
    questions: [],
    currentIndex: 0,
    answers: new Map(),
    records: [],
    streak: 0,
    totalCorrect: 0,
    showResult: false,
    showAnswer: false,
    timerRunning: false,
    currentQuestionTime: 0,
  }),
}))
