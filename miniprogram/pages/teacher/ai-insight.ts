/**
 * 智学看板 - what the class is collectively missing, and the dispatch that acts on it.
 *
 * ## Reading the board honestly
 *
 * `students_considered` and `students_total` are separate numbers on purpose: the plugin analyses a
 * capped slice of the class, and a board that showed only the analysed count would look complete. The
 * page prints both whenever they differ, and quotes `ai.message` when no model took part - the
 * ranking is still usable, and saying so is better than implying a model did it.
 *
 * ## Dispatch is per student, and partial by design
 *
 * 派发 sends one set per selected student and answers `{ created, failed }`. The page reports both
 * counts and re-reads the board, so a student whose set failed can be retried without guessing
 * whether the rest landed.
 *
 * `open_set_id` on a suggestion means that student already has an open set. The row says 已有练单
 * rather than offering a second one - the server would accept it, and the student would end up with
 * two, which is the kind of duplicate the teacher would then have to reason about.
 */

import { requireSession } from '../../services/auth'
import { assignSets, classInsight } from '../../services/aiStudy'
import type { AiStudyClassInsight, AiStudyWeakNode } from '../../services/aiStudy'
import type { ClassFeatureFlags } from '../../utils/storage'
import { classIdOf } from '../../utils/storage'
import { getResolution, resolveFeatures, syncTabBar } from '../../utils/feature'
import { confirm, errorMessage, toastError, toastSuccess } from '../../utils/toast'

interface WeakNodeView extends AiStudyWeakNode {
  /** Pre-formatted so the WXML does not render a raw 0..N importance. */
  importanceText: string
}

interface SuggestionView {
  studentId: number
  name: string
  nodeName: string
  wrongCount: number
  reason: string
  hasOpenSet: boolean
  openSetId: number | null
  selected: boolean
}

Page({
  data: {
    featuresReady: false,
    features: {} as ClassFeatureFlags,
    loading: true,
    error: '',
    classId: null as number | null,
    studentsConsidered: 0,
    studentsTotal: 0,
    /** Rendered only when the board analysed fewer students than the class holds. */
    truncated: false,
    weakNodes: [] as WeakNodeView[],
    suggestions: [] as SuggestionView[],
    selectedCount: 0,
    aiMessage: '',
    aiAvailable: false,
    /** Dispatch options. */
    size: '5',
    hint: '',
    assigning: false,
  },

  onLoad() {
    const session = requireSession()
    if (!session) {
      return
    }
    this.setData({ classId: classIdOf(session.user) })
    void this.bootstrap()
  },

  onShow() {
    void syncTabBar(this)
    if (!this.data.loading) {
      void this.load({ silent: true })
    }
  },

  onPullDownRefresh() {
    void this.load({ silent: true, force: true }).then(() => wx.stopPullDownRefresh())
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

  async load(options: { silent?: boolean; force?: boolean } = {}) {
    if (this.data.classId === null) {
      this.setData({ loading: false, error: '' })
      return
    }
    if (!options.silent) {
      this.setData({ loading: true })
    }
    if (options.force) {
      await resolveFeatures({ force: true })
      this.applyFeatures()
    }

    try {
      const insight = await classInsight(this.data.classId)
      this.applyInsight(insight)
    } catch (error) {
      this.setData({ loading: false, error: errorMessage(error) })
    }
  },

  applyInsight(insight: AiStudyClassInsight) {
    const suggestions: SuggestionView[] = insight.suggestions.map((suggestion) => ({
      studentId: suggestion.student_id,
      name: suggestion.name,
      nodeName: suggestion.top_node_name || '暂无薄弱点',
      wrongCount: suggestion.wrong_count,
      reason: suggestion.reason,
      hasOpenSet: suggestion.open_set_id !== null,
      openSetId: suggestion.open_set_id,
      selected: false,
    }))

    this.setData({
      loading: false,
      error: '',
      studentsConsidered: insight.students_considered,
      studentsTotal: insight.students_total,
      truncated: insight.students_total > insight.students_considered,
      weakNodes: insight.weak_nodes.map((node) => ({
        ...node,
        importanceText: node.importance === null ? '未标注重点' : `重点 ${node.importance}`,
      })),
      suggestions,
      selectedCount: 0,
      aiMessage: insight.ai.message || '',
      aiAvailable: insight.ai.available,
    })
  },

  onToggleStudent(event: { currentTarget: { dataset: Record<string, string> } }) {
    const studentId = Number(event.currentTarget.dataset.id)
    const suggestions = this.data.suggestions.map((suggestion) =>
      suggestion.studentId === studentId ? { ...suggestion, selected: !suggestion.selected } : suggestion,
    )
    this.setData({ suggestions, selectedCount: countSelected(suggestions) })
  },

  onSelectAll() {
    const selectable = this.data.suggestions.filter((suggestion) => !suggestion.hasOpenSet)
    const allSelected = this.data.selectedCount === selectable.length && selectable.length > 0
    const suggestions = this.data.suggestions.map((suggestion) =>
      suggestion.hasOpenSet ? suggestion : { ...suggestion, selected: !allSelected },
    )
    this.setData({ suggestions, selectedCount: countSelected(suggestions) })
  },

  onSizeInput(event: { detail: { value: string } }) {
    this.setData({ size: event.detail.value })
  },

  onHintInput(event: { detail: { value: string } }) {
    this.setData({ hint: event.detail.value })
  },

  async onAssign() {
    const selected = this.data.suggestions.filter((suggestion) => suggestion.selected && !suggestion.hasOpenSet)
    if (!selected.length) {
      toastError('请先选择学生')
      return
    }
    if (this.data.classId === null || this.data.assigning) {
      return
    }

    const size = Number(this.data.size) || 5
    const confirmed = await confirm({
      title: '派发练习',
      content: `为 ${selected.length} 名学生各派发一份 ${size} 题的智学练习？`,
      confirmText: '派发',
    })
    if (!confirmed) {
      return
    }

    this.setData({ assigning: true })
    try {
      const result = await assignSets(this.data.classId, {
        student_ids: selected.map((suggestion) => suggestion.studentId),
        size,
        hint: this.data.hint.trim() || null,
      })

      if (result.failed.length) {
        // Both halves are reported: "3 created, 2 failed" is the actionable sentence, and the first
        // failure's reason is the one that usually explains all of them.
        toastError(`成功 ${result.created.length} 人，失败 ${result.failed.length} 人：${result.failed[0].reason}`)
      } else {
        toastSuccess(`已为 ${result.created.length} 名学生派发练习`)
      }

      await this.load({ silent: true })
    } catch (error) {
      toastError(errorMessage(error))
    } finally {
      this.setData({ assigning: false })
    }
  },

  onRetry() {
    void this.bootstrap()
  },
})

function countSelected(suggestions: SuggestionView[]): number {
  let count = 0
  for (const suggestion of suggestions) {
    if (suggestion.selected && !suggestion.hasOpenSet) {
      count += 1
    }
  }
  return count
}
