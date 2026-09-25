/**
 * AI 智学 - today's practice set.
 *
 * ## The answer encoding is not free text
 *
 * `value` on this route is a **JSON string**, not a rendered answer: a single choice is
 * `"b"` (quotes included) and a multi choice is `["b","d"]`, because that is what the question bank
 * stores as its own key and what the owner's comparison parses. `serialiseChoice` / `parseChoice`
 * below mirror `StudentAiStudyAttemptPage.tsx` exactly - including its tolerance for the three
 * spellings a stored answer can have, so an answer saved by the web client (or by an older build)
 * still shows as selected here instead of silently vanishing.
 *
 * ## Whole-page guard
 *
 * The feature is gated by `enable_ai_study`, and the guard wraps *everything* - including the
 * "generate" button - because a class with the feature off has no set, no history and no route worth
 * showing. The guard is only rendered once the flags have been resolved, so a student never sees
 * 「该功能未开启」 for the half second the live call takes.
 */

import { requireSession } from '../../services/auth'
import { currentSet, generateSet, saveSetAnswers, submitSet } from '../../services/aiStudy'
import type { AiStudyOutcome, AiStudySet, AiStudySubmitResult } from '../../services/aiStudy'
import type { ClassFeatureFlags } from '../../utils/storage'
import { getResolution, resolveFeatures } from '../../utils/feature'
import { formatRelative } from '../../utils/format'
import { confirm, errorMessage, toastError, toastSuccess } from '../../utils/toast'

interface OptionView {
  id: string
  text: string
  selected: boolean
}

interface ItemView {
  id: number
  order: number
  reason: string
  aiRanked: boolean
  /** `true` when the question has options; otherwise it is a free-text answer. */
  hasOptions: boolean
  multiple: boolean
  stem: string
  points: number
  options: OptionView[]
  /** The wire value: a JSON string for choices, plain text otherwise. */
  value: string
  /** The free-text answer, so the textarea does not have to un-JSON anything. */
  text: string
  /** -1 unknown, 0 wrong, 1 right - only meaningful after a submit. */
  judged: number
}

Page({
  data: {
    /** False until `resolveFeatures` has answered, so the guard cannot flash its closed state. */
    featuresReady: false,
    features: {} as ClassFeatureFlags,
    loading: true,
    error: '',
    /** The set's own provenance line: which model ranked it, or why none did. */
    aiMessage: '',
    aiAvailable: false,
    setInfo: null as { id: number; status: string; source: string; createdAt: string } | null,
    items: [] as ItemView[],
    answeredCount: 0,
    generating: false,
    saving: false,
    submitting: false,
    result: null as AiStudySubmitResult | null,
    resultSummary: '',
  },

  onLoad() {
    requireSession()
    void this.bootstrap()
  },

  onShow() {
    // Re-resolving on show keeps a student who left the app mid-practice in step with a teacher who
    // switched the feature off in the meantime.
    if (this.data.featuresReady) {
      this.applyFeatures()
    }
  },

  onPullDownRefresh() {
    void this.load().then(() => wx.stopPullDownRefresh())
  },

  async bootstrap() {
    await resolveFeatures()
    this.applyFeatures()
    await this.load()
  },

  applyFeatures() {
    const resolution = getResolution()
    this.setData({ featuresReady: true, features: resolution.features })
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const result = await currentSet()
      this.applySet(result.set, result.ai)
    } catch (error) {
      this.setData({ loading: false, error: errorMessage(error) })
    }
  },

  applySet(set: AiStudySet | null, ai: AiStudyOutcome) {
    if (!set) {
      this.setData({
        loading: false,
        error: '',
        setInfo: null,
        items: [],
        answeredCount: 0,
        result: null,
        resultSummary: '',
        aiMessage: ai.message || '',
        aiAvailable: ai.available,
      })
      return
    }

    const items: ItemView[] = set.items
      .slice()
      .sort((left, right) => left.order_no - right.order_no)
      .map((item, index) => {
        const raw = item.answer ? item.answer.value : ''
        const choice = parseChoice(raw)
        const hasOptions = item.question.options.length > 0
        return {
          id: item.id,
          order: index + 1,
          reason: item.reason,
          aiRanked: item.ai_ranked,
          hasOptions,
          multiple: item.question.type === 'multiple',
          stem: item.question.stem,
          points: item.question.points,
          options: item.question.options.map((option) => ({ id: option.id, text: option.text, selected: choice.indexOf(option.id) >= 0 })),
          value: raw,
          text: hasOptions ? '' : raw,
          judged: -1,
        }
      })

    this.setData({
      loading: false,
      error: '',
      setInfo: {
        id: set.id,
        status: set.status,
        source: set.source,
        createdAt: formatRelative(set.created_at),
      },
      items,
      answeredCount: countAnswered(items),
      result: null,
      resultSummary: '',
      aiMessage: ai.message || '',
      aiAvailable: ai.available,
    })
  },

  async onGenerate() {
    if (this.data.generating) {
      return
    }
    this.setData({ generating: true })
    try {
      const result = await generateSet({})
      this.applySet(result.set, result.ai)
      if (result.set) {
        toastSuccess('练习已生成')
      } else {
        // `set: null` is a success with nothing to practise; the outcome explains why.
        toastError(result.ai.message || '现在还没有可以练习的题目')
      }
    } catch (error) {
      toastError(errorMessage(error))
    } finally {
      this.setData({ generating: false })
    }
  },

  /** Choice tap: replaces (single) or toggles (multiple) and re-serialises the item's value. */
  onOptionTap(event: { currentTarget: { dataset: Record<string, string> } }) {
    if (this.data.result) {
      return
    }
    const index = Number(event.currentTarget.dataset.index)
    const optionId = event.currentTarget.dataset.option
    const items = this.data.items
    const item = items[index]
    if (!item) {
      return
    }

    const current = parseChoice(item.value)
    const chosen = current.indexOf(optionId) >= 0
    const next = item.multiple ? (chosen ? current.filter((id) => id !== optionId) : current.concat([optionId]).sort()) : [optionId]

    item.options = item.options.map((option) => ({ ...option, selected: next.indexOf(option.id) >= 0 }))
    item.value = next.length ? JSON.stringify(item.multiple ? next : next[0]) : ''
    this.commit(items)
  },

  onTextInput(event: { currentTarget: { dataset: Record<string, string> }; detail: { value: string } }) {
    const index = Number(event.currentTarget.dataset.index)
    const value = event.detail.value
    this.setData({ [`items[${index}].value`]: value, [`items[${index}].text`]: value })
    this.setData({ answeredCount: countAnswered(this.data.items) })
  },

  commit(items: ItemView[]) {
    this.setData({ items, answeredCount: countAnswered(items) })
  },

  async onSave() {
    if (!this.data.setInfo || this.data.saving || this.data.submitting) {
      return
    }
    this.setData({ saving: true })
    try {
      const result = await saveSetAnswers(this.data.setInfo.id, collectAnswers(this.data.items))
      // Adopt the answered set (ids and reasons are the server's), but keep the local result view.
      this.applySet(result.set, result.ai)
      toastSuccess('已保存作答')
    } catch (error) {
      toastError(errorMessage(error))
    } finally {
      this.setData({ saving: false })
    }
  },

  async onSubmit() {
    if (!this.data.setInfo || this.data.submitting) {
      return
    }
    const total = this.data.items.length
    const answered = this.data.answeredCount
    const content = answered < total ? `还有 ${total - answered} 题没有作答，提交后会直接判分，确定交卷吗？` : '交卷后会立即判分，确定吗？'

    const confirmed = await confirm({ title: '交卷', content, confirmText: '交卷' })
    if (!confirmed) {
      return
    }

    this.setData({ submitting: true })
    try {
      // The saved answers travel with the submit: a student who never pressed 保存 still hands in
      // everything they wrote.
      await saveSetAnswers(this.data.setInfo.id, collectAnswers(this.data.items))
      const result = await submitSet(this.data.setInfo.id)
      const judged = applyJudgement(this.data.items, result)
      this.setData({
        items: judged,
        result,
        resultSummary: buildResultSummary(result),
      })
      toastSuccess('已交卷')
    } catch (error) {
      toastError(errorMessage(error))
    } finally {
      this.setData({ submitting: false })
    }
  },

  onRetry() {
    void this.bootstrap()
  },
})

// ---------------------------------------------------------------------------
// Pure helpers

/**
 * The chosen option ids out of a stored answer.
 *
 * Tolerant of the three spellings (`"b"`, `["b","d"]`, a bare `b`) exactly as the web page is: an
 * unparseable value is treated as one raw id rather than dropped, because dropping it would hide the
 * student's own work from them.
 */
function parseChoice(raw: string | undefined | null): string[] {
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => String(entry))
    }
    if (typeof parsed === 'string') {
      return [parsed]
    }
    return []
  } catch (error) {
    return [raw]
  }
}

function isAnswered(item: ItemView): boolean {
  return item.value.trim().length > 0
}

function countAnswered(items: ItemView[]): number {
  let count = 0
  for (const item of items) {
    if (isAnswered(item)) {
      count += 1
    }
  }
  return count
}

function collectAnswers(items: ItemView[]): Array<{ item_id: number; value: string }> {
  const payload: Array<{ item_id: number; value: string }> = []
  for (const item of items) {
    if (isAnswered(item)) {
      payload.push({ item_id: item.id, value: item.value.trim() })
    }
  }
  return payload
}

/** Fold the submit result back into the items, so each row can show its own verdict. */
function applyJudgement(items: ItemView[], result: AiStudySubmitResult): ItemView[] {
  return items.map((item) => {
    const judged = result.items.filter((entry) => entry.item_id === item.id)[0]
    let state = -1
    if (judged) {
      state = judged.is_correct === true ? 1 : judged.is_correct === false ? 0 : -1
    }
    return { ...item, judged: state }
  })
}

function buildResultSummary(result: AiStudySubmitResult): string {
  const parts = [`答对 ${result.correct} 题`, `共 ${result.total} 题`]
  if (result.pending > 0) {
    parts.push(`待老师判断 ${result.pending} 题`)
  }
  return parts.join(' · ')
}
