/**
 * 家校信箱 - the letters between one family and the child's teacher.
 *
 * ## The thread is filtered here, and it has to be
 *
 * The class's message feed answers every `HOME_SCHOOL` row of that class - it has no idea which
 * family is asking. A letter of this family is the one the parent sent, or a teacher's reply
 * addressed to the parent (`receiver_id` is the parent's user id); every other row in that answer
 * belongs to another family and must not be rendered. The web's parent page applies exactly this
 * rule, so the two clients show the same thread - and this is a privacy boundary, not tidiness.
 *
 * Asking the server for one family's rows is not an option: the feed's optional filters are
 * validated against the actor's *children* (student ids), while a parent's own messages are keyed by
 * the parent's user id, so no query parameter names this thread. Hence the read takes `classId` and
 * the message type only - the web's parent usage - and the filter runs here.
 *
 * ## Why a send re-reads the thread
 *
 * The write answers `{ success, message, id }` and nothing else: there is no row to append. Building
 * one locally would mean inventing `created_at` and `sender_name` (the server joins the name) and
 * duplicating the filter above - and a locally appended row would be missing precisely the fields
 * the next read supplies. So a successful send clears the box and reloads.
 */

import { requireSession } from '../../services/auth'
import { HOME_SCHOOL_MESSAGE_TYPE, homeSchoolMessages, parentChild, sendHomeSchoolMessage } from '../../services/parent'
import type { HomeSchoolMessageDto } from '../../services/parent'
import { syncTabBar } from '../../utils/feature'
import { formatDateTime } from '../../utils/format'
import { classIdOf, readSession, studentIdOf } from '../../utils/storage'
import { errorMessage, toastError, toastSuccess } from '../../utils/toast'

interface MessageView {
  id: number
  /** True for the parent's own letter: right-aligned, brand chip, "我". */
  mine: boolean
  /** `我`, or the teacher's name the server joined - never a locally invented one. */
  who: string
  time: string
  content: string
  /** Kept for sorting only; the rendered form is `time`. */
  createdAt: string
}

Page({
  data: {
    loading: true,
    /** True only for the first load, so a return to the page does not flash a skeleton. */
    firstLoad: true,
    error: '',
    /** `null` until the session (or, as a fallback, the child's own row) names a class. */
    classId: null as number | null,
    /** True when the session and the child's own row both fail to name a class (see `load`). */
    classMissing: false,
    messages: [] as MessageView[],
    draft: '',
    sending: false,
  },

  /** The parent's user id: the value both sides of the thread filter compare against. */
  meId: 0,

  onLoad() {
    const session = requireSession()
    if (!session) {
      return
    }
    this.meId = session.user.id
  },

  onShow() {
    // The session check comes first: a page still on the stack after the token was cleared must not
    // fire a doomed request and paint an error card over a redirect to the login page.
    if (!requireSession()) {
      return
    }
    void syncTabBar(this)
    // The teacher may have answered while the parent was on another tab.
    void this.load({ silent: !this.data.firstLoad })
  },

  onPullDownRefresh() {
    void this.load({ silent: true }).then(() => wx.stopPullDownRefresh())
  },

  /**
   * The class this mailbox belongs to.
   *
   * The login payload should carry it (`classIdOf` reads both spellings the server may use), and
   * this is the fallback: the child's own row knows the class even when the session does not. A
   * parent whose account is not linked to a student has neither, and `load` renders that as an
   * explanation rather than as an empty mailbox - "no letters" would be a lie.
   */
  async resolveClassId(): Promise<number | null> {
    const session = readSession()
    if (!session) {
      return null
    }
    const fromSession = classIdOf(session.user)
    if (fromSession !== null) {
      return fromSession
    }
    const studentId = studentIdOf(session.user)
    if (!studentId) {
      return null
    }
    try {
      const child = await parentChild(studentId)
      return child.class_id || null
    } catch (error) {
      console.warn('[communication] could not read the child\'s class', error)
      return null
    }
  },

  async load(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      this.setData({ loading: true })
    }
    try {
      let classId = this.data.classId
      if (classId === null) {
        classId = await this.resolveClassId()
      }
      if (classId === null) {
        this.setData({ loading: false, firstLoad: false, error: '', classMissing: true, messages: [] })
        return
      }

      const rows = await homeSchoolMessages(classId)
      this.setData({
        loading: false,
        firstLoad: false,
        error: '',
        classMissing: false,
        classId,
        messages: rows
          .filter((row) => belongsToFamily(row, this.meId))
          .map((row) => toView(row, this.meId))
          .sort(oldestFirst),
      })
    } catch (error) {
      this.setData({ loading: false, firstLoad: false, error: errorMessage(error) })
    }
  },

  onDraftInput(event: { detail: { value: string } }) {
    this.setData({ draft: event.detail.value })
  },

  async onSend() {
    const classId = this.data.classId
    const content = this.data.draft.trim()

    if (!classId) {
      toastError('还没有找到班级，暂时不能写信')
      return
    }
    if (!content) {
      toastError('请先写下想说的话')
      return
    }
    if (this.data.sending) {
      return
    }

    this.setData({ sending: true })
    try {
      /**
       * The body is the contract's `SendMessagePayload` - the same six fields the web posts.
       *
       * `sender_id` and `sender_role` are derived from the token server-side (the route overwrites
       * whatever the body says), so sending them is not a way to post as someone else; they are
       * included because the contract asks for them and because the web does.
       */
      await sendHomeSchoolMessage({
        class_id: classId,
        sender_id: this.meId,
        content,
        is_anonymous: false,
        type: HOME_SCHOOL_MESSAGE_TYPE,
        sender_role: 'parent',
      })
      this.setData({ draft: '' })
      await this.load({ silent: true })
      toastSuccess('信件已寄出')
    } catch (error) {
      toastError(errorMessage(error))
    } finally {
      this.setData({ sending: false })
    }
  },

  onRetry() {
    void this.load()
  },
})

/**
 * Which letters belong to this family.
 *
 * `user` is the legacy spelling older rows carry for a non-student sender (the web accepts it too),
 * and the second half is the teacher's side of the conversation: a reply is addressed *to* this
 * parent, which is why `sender_id !== parentUserId` and not merely `sender_role === 'teacher'` - the
 * feed also holds teachers' letters to other families of the same class.
 */
function belongsToFamily(message: HomeSchoolMessageDto, parentUserId: number): boolean {
  return isOwnLetter(message, parentUserId) || isTeacherReply(message, parentUserId)
}

function isOwnLetter(message: HomeSchoolMessageDto, parentUserId: number): boolean {
  return (message.sender_role === 'parent' || message.sender_role === 'user') && message.sender_id === parentUserId
}

function isTeacherReply(message: HomeSchoolMessageDto, parentUserId: number): boolean {
  return (
    (message.sender_role === 'teacher' || message.sender_role === 'user') &&
    message.sender_id !== parentUserId &&
    message.receiver_id === parentUserId
  )
}

function toView(message: HomeSchoolMessageDto, parentUserId: number): MessageView {
  const mine = isOwnLetter(message, parentUserId)
  return {
    id: message.id,
    mine,
    who: mine ? '我' : message.sender_name || '老师',
    time: formatDateTime(message.created_at),
    content: message.content,
    createdAt: message.created_at || '',
  }
}

/**
 * Oldest at the top, newest at the bottom - how a conversation is read.
 *
 * The feed arrives `created_at DESC`; sorting rather than reversing keeps two letters written in the
 * same second in a stable order (the id breaks the tie) instead of in whatever order the query
 * returned them.
 */
function oldestFirst(left: MessageView, right: MessageView): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? -1 : 1
  }
  return left.id - right.id
}
