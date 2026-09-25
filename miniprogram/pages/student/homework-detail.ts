/**
 * 作业详情 - one paper: answer it, save it, hand it in, then read the result.
 *
 * ## One POST to rule the paper
 *
 * `POST /api/homework/:id/attempt` is what opens this page. It is a POST because it may create the
 * `draft` submission row, and it is idempotent, so re-entering the page resumes the same attempt
 * instead of starting a second one - which is why this page has no GET fallback and no "start"
 * button.
 *
 * ## Saving
 *
 * The local answer state is the source of truth while the student types; 保存草稿 sends every
 * *answered* question in one `PUT .../answers`. Unanswered questions are omitted rather than sent as
 * empty values, so a half-finished paper can never blank out an answer the student wrote earlier and
 * this page failed to load. On submit the same array goes with `POST .../submit`, so a student who
 * never pressed 保存草稿 still hands in everything they wrote.
 *
 * ## Read-only once graded
 *
 * `graded` and `closed` papers render the questions, the student's own answers, the per-question
 * score and the teacher's comment - and hide the action bar entirely, because a write the server
 * will refuse is worse than no button at all.
 *
 * 拍照题 (`photo_ids` / the photos endpoint) is *not* implemented here: uploading needs
 * `wx.uploadFile` and a multipart body, and a photo taken on a phone would then need a signed or
 * allowlisted URL to be displayed back. The web client owns that flow; the mini program answers the
 * typed questions and shows what the teacher said about them.
 */

import { requireSession } from '../../services/auth'
import { saveAnswers, startAttempt, submitAttempt } from '../../services/homework'
import type { HomeworkAnswer, HomeworkAnswerInput, HomeworkAttemptDetail, HomeworkOption, HomeworkQuestionType } from '../../services/homework'
import { confirm, errorMessage, toastError, toastSuccess } from '../../utils/toast'
import { formatDueLabel, formatScore, questionTypeText, submissionStatusText } from '../../utils/format'

interface OptionView extends HomeworkOption {
  selected: boolean
}

interface QuestionView {
  id: number
  order: number
  type: HomeworkQuestionType
  /** `单选题` / `填空题` …, so the WXML does not need a switch of its own. */
  typeText: string
  stem: string
  points: number
  options: OptionView[]
  /** Chosen option ids (`single` / `multiple`). */
  choice: string[]
  /** Free text (`blank` / `short`). */
  text: string
  /** The student's answer, flattened for the read-only view. */
  answerText: string
  scoreText: string
  /** 1 = right, 0 = wrong, -1 = not judged (a subjective question nobody scored). */
  correct: number
  teacherComment: string
  aiComment: string
}

Page({
  data: {
    homeworkId: 0,
    loading: true,
    error: '',
    submitting: false,
    saving: false,
    title: '',
    description: '',
    dueText: '',
    dueTone: 'muted',
    statusText: '',
    totalPoints: 0,
    scoreText: '',
    teacherFeedback: '',
    aiFeedback: '',
    questions: [] as QuestionView[],
    answeredCount: 0,
    /** Whether the answers can still be edited (draft/returned, and the homework is not closed). */
    editable: true,
    /** True once this page has handed the paper in, so the footer explains what happens next. */
    justSubmitted: false,
  },

  /** Held outside `data`: only the code uses it, and it never needs to reach WXML. */
  submissionId: 0,

  onLoad(query: Record<string, string>) {
    requireSession()
    const id = Number(query.id || 0)
    if (!id) {
      toastError('作业不存在')
      wx.navigateBack()
      return
    }
    this.setData({ homeworkId: id })
    void this.load()
  },

  onPullDownRefresh() {
    void this.load().then(() => wx.stopPullDownRefresh())
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const detail = await startAttempt(this.data.homeworkId)
      this.applyDetail(detail)
    } catch (error) {
      this.setData({ loading: false, error: errorMessage(error) })
    }
  },

  applyDetail(detail: HomeworkAttemptDetail) {
    const due = formatDueLabel(detail.homework.due_at)
    const submission = detail.submission
    const editable = (submission.status === 'draft' || submission.status === 'returned') && detail.homework.status !== 'closed'

    this.submissionId = submission.id
    const questions = detail.homework.questions
      .slice()
      .sort((left, right) => left.order_no - right.order_no)
      .map((question, index) => toQuestionView(question, index, detail.answers, editable))

    this.setData({
      loading: false,
      error: '',
      title: detail.homework.title,
      description: detail.homework.description || '',
      dueText: due.text,
      dueTone: due.tone,
      statusText: submissionStatusText(submission.status),
      totalPoints: detail.homework.total_points,
      scoreText: submission.status === 'graded' ? formatScore(submission.score, submission.total_points) : '',
      teacherFeedback: submission.teacher_feedback || '',
      aiFeedback: submission.ai_feedback || '',
      questions,
      answeredCount: countAnswered(questions),
      editable,
    })
  },

  /** Single choice: tapping replaces the selection. */
  onSingleTap(event: { currentTarget: { dataset: Record<string, string> } }) {
    if (!this.data.editable) {
      return
    }
    const index = Number(event.currentTarget.dataset.index)
    const optionId = event.currentTarget.dataset.option
    const questions = this.data.questions
    const question = questions[index]
    if (!question) {
      return
    }
    question.options = question.options.map((option) => ({ ...option, selected: option.id === optionId }))
    question.choice = [optionId]
    this.commit(questions)
  },

  /** Multiple choice: tapping toggles one option. */
  onMultipleTap(event: { currentTarget: { dataset: Record<string, string> } }) {
    if (!this.data.editable) {
      return
    }
    const index = Number(event.currentTarget.dataset.index)
    const optionId = event.currentTarget.dataset.option
    const questions = this.data.questions
    const question = questions[index]
    if (!question) {
      return
    }
    const selected = question.options.map((option) => (option.id === optionId ? { ...option, selected: !option.selected } : option))
    question.options = selected
    question.choice = selected.filter((option) => option.selected).map((option) => option.id)
    this.commit(questions)
  },

  /** Free text. `setData` on the one path keeps typing cheap on a long paper. */
  onTextInput(event: { currentTarget: { dataset: Record<string, string> }; detail: { value: string } }) {
    const index = Number(event.currentTarget.dataset.index)
    const value = event.detail.value
    this.setData({ [`questions[${index}].text`]: value })
    // `this.data` is already updated by the call above (only the *view* update is asynchronous), so
    // the progress line follows the typing without re-rendering the whole paper.
    this.setData({ answeredCount: countAnswered(this.data.questions) })
  },

  commit(questions: QuestionView[]) {
    this.setData({ questions, answeredCount: countAnswered(questions) })
  },

  async onSaveDraft() {
    if (this.data.saving || this.data.submitting) {
      return
    }
    this.setData({ saving: true })
    try {
      const detail = await saveAnswers(this.submissionId, collectAnswers(this.data.questions))
      // The server answers the full attempt, so the page adopts it: a question the grader could
      // already judge (a `single` one) comes back with its score, and the ids stay in step.
      this.applyDetail(detail)
      toastSuccess('已保存')
    } catch (error) {
      toastError(errorMessage(error))
    } finally {
      this.setData({ saving: false })
    }
  },

  async onSubmit() {
    if (this.data.submitting || this.data.saving) {
      return
    }
    const answered = this.data.answeredCount
    const total = this.data.questions.length
    const content =
      answered < total
        ? `还有 ${total - answered} 题没有作答，提交后老师会看到现在的答案，确定提交吗？`
        : '提交后老师就能看到你的答案了，确定提交吗？'

    const confirmed = await confirm({ title: '提交作业', content, confirmText: '提交' })
    if (!confirmed) {
      return
    }

    this.setData({ submitting: true })
    try {
      const detail = await submitAttempt(this.submissionId, collectAnswers(this.data.questions))
      this.applyDetail(detail)
      this.setData({ justSubmitted: true })
      toastSuccess('提交成功')
      // Back to the list, which reloads on show and moves this paper into 已完成. The delay lets
      // the toast be read; `navigateBack` on a page with no stack (a deep link) fails harmlessly.
      setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/student/homework' }) }), 900)
    } catch (error) {
      toastError(errorMessage(error))
    } finally {
      this.setData({ submitting: false })
    }
  },

  onRetry() {
    void this.load()
  },
})

// ---------------------------------------------------------------------------
// Pure helpers (no `this`, so they stay testable and out of the page object)

function toQuestionView(
  question: {
    id: number
    type: HomeworkQuestionType
    stem: string
    points: number
    options: HomeworkOption[]
  },
  index: number,
  answers: HomeworkAnswer[],
  editable: boolean,
): QuestionView {
  const answer = answers.filter((item) => item.question_id === question.id)[0]
  const value = answer ? answer.value || {} : {}
  const choice = value.choice || []
  const text = value.text || ''
  const score = answer && typeof answer.score === 'number' ? answer.score : null
  // `is_correct` is `1 | 0 | null` on the wire; null becomes -1 here so WXML can use `===` on a
  // number instead of juggling a tri-state.
  const correct = answer && answer.is_correct !== null && answer.is_correct !== undefined ? (answer.is_correct ? 1 : 0) : -1

  return {
    id: question.id,
    order: index + 1,
    type: question.type,
    typeText: questionTypeText(question.type),
    stem: question.stem,
    points: question.points,
    options: question.options.map((option) => ({ ...option, selected: choice.indexOf(option.id) >= 0 })),
    // The selected ids are preserved even when the paper is read-only, so a graded paper still shows
    // what was chosen.
    choice: choice.slice(),
    text,
    answerText: buildAnswerText(question.type, choice, text),
    scoreText: score === null ? '' : `${score} / ${question.points} 分`,
    correct: editable && answer === undefined ? -1 : correct,
    teacherComment: answer && answer.teacher_comment ? answer.teacher_comment : '',
    aiComment: answer && answer.ai_comment ? answer.ai_comment : '',
  }
}

function buildAnswerText(type: HomeworkQuestionType, choice: string[], text: string): string {
  if (type === 'single' || type === 'multiple') {
    return choice.length ? choice.join('、') : '未作答'
  }
  return text ? text : '未作答'
}

function isAnswered(question: QuestionView): boolean {
  if (question.type === 'single' || question.type === 'multiple') {
    return question.choice.length > 0
  }
  return question.text.trim().length > 0
}

function countAnswered(questions: QuestionView[]): number {
  let count = 0
  for (const question of questions) {
    if (isAnswered(question)) {
      count += 1
    }
  }
  return count
}

/** The wire payload: only answered questions, in paper order. */
function collectAnswers(questions: QuestionView[]): HomeworkAnswerInput[] {
  const payload: HomeworkAnswerInput[] = []
  for (const question of questions) {
    if (!isAnswered(question)) {
      continue
    }
    if (question.type === 'single' || question.type === 'multiple') {
      payload.push({ question_id: question.id, value: { choice: question.choice } })
    } else {
      payload.push({ question_id: question.id, value: { text: question.text.trim() } })
    }
  }
  return payload
}
