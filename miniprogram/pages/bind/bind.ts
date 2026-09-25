/**
 * 绑定账号 - the first-run step that links this WeChat account to a Think-Class user.
 *
 * The ticket is single-use and short-lived, which is the whole reason this is a separate *page*
 * with a query parameter rather than a dialog on the login page: `wx.login`'s code cannot be
 * replayed, so the server hands back a ticket that survives the form being filled in slowly. When it
 * expires - or when the user backs out and returns - the server answers
 * `401 绑定已过期，请重新登录`, and the only correct response is to go back to the login page and
 * start over, because a fresh ticket can only come from a fresh `wx.login`.
 *
 * ## Why the role is a field the user fills in
 *
 * `plugins/identity` resolves a credential by the `(username, role)` pair, so the bind route requires
 * `role` and refuses the request without it (`400 绑定参数不完整`). It defaults to 学生 because that is
 * who uses this client, but a parent or teacher account has to be able to say so - guessing
 * server-side would mean one password hash verification per role.
 *
 * ## The failures worth naming
 *
 *   - `401 账号或密码错误，请重试` - a typo. Stay on the page, keep what was typed, let them fix it.
 *   - `401 绑定已过期，请重新登录` / `401 微信绑定已失效，请重新登录并绑定账号` - the ticket is gone
 *     (the route consumes it even on a wrong password). Back to 登录; retrying here cannot work.
 *   - `403 开发登录未启用…` / `403 生产环境不允许使用开发登录` - the server's dev-login fence. Printed
 *     verbatim, because it names the exact environment variable to set.
 *
 * ## The 409 in the original contract
 *
 * `409 该微信已绑定其他账号，请先解绑` is still handled defensively, but the implemented route does not
 * answer it: an openid that already has a row is logged in by `/login` and never reaches the bind
 * step. The branch stays because the page must not print a raw status if a future version restores
 * that refusal.
 */

import { bindAccount, persistSession } from '../../services/auth'
import type { BindRole } from '../../services/auth'
import { applyLoginSnapshot, homePathForRole } from '../../utils/feature'
import { classIdOf } from '../../utils/storage'
import type { AppInstance } from '../../app'
import { errorMessage, toastError } from '../../utils/toast'

/** Roles the bind form offers, in the order the people who use this client appear. */
const ROLES: Array<{ value: BindRole; label: string }> = [
  { value: 'student', label: '学生' },
  { value: 'parent', label: '家长' },
  { value: 'teacher', label: '老师' },
]

Page({
  data: {
    ticket: '',
    username: '',
    password: '',
    role: 'student' as BindRole,
    roles: ROLES,
    busy: false,
    error: '',
    /** Set on 409, where the advice is "ask your teacher", not "try again". */
    conflict: false,
  },

  onLoad(query: Record<string, string>) {
    const ticket = query.ticket ? decodeURIComponent(query.ticket) : ''
    this.setData({ ticket })
    if (!ticket) {
      // Reached without a ticket (a manual jump, or a stale link): there is nothing to bind with.
      toastError('登录信息已失效，请重新登录')
      wx.reLaunch({ url: '/pages/login/login' })
    }
  },

  onUsernameInput(event: { detail: { value: string } }) {
    this.setData({ username: event.detail.value, error: '' })
  },

  onPasswordInput(event: { detail: { value: string } }) {
    this.setData({ password: event.detail.value, error: '' })
  },

  onRoleTap(event: { currentTarget: { dataset: Record<string, string> } }) {
    const role = event.currentTarget.dataset.role as BindRole
    if (role) {
      this.setData({ role, error: '' })
    }
  },

  async onSubmit() {
    const username = this.data.username.trim()
    const password = this.data.password

    if (!username) {
      this.setData({ error: '请填写账号' })
      return
    }
    if (!password) {
      this.setData({ error: '请填写密码' })
      return
    }
    if (this.data.busy) {
      return
    }

    this.setData({ busy: true, error: '', conflict: false })
    try {
      const result = await bindAccount(this.data.ticket, username, password, this.data.role)
      const session = persistSession(result)
      applyLoginSnapshot(session.classFeatures, classIdOf(session.user))
      const app = getApp<AppInstance>()
      if (app && typeof app.setSession === 'function') {
        app.setSession(session)
      }
      wx.reLaunch({ url: homePathForRole(session.user.role) })
    } catch (error) {
      const status = (error as { status?: number }).status || 0
      const message = errorMessage(error)

      // A 401 from this route is either "wrong password" or "the ticket is dead", and the two need
      // opposite recoveries. The message decides: anything about the binding itself means the ticket
      // is gone, and the route's own words are the only reliable signal (it also consumes the ticket
      // on a wrong password, so a retry here would answer 绑定已过期 anyway).
      const ticketDead = status === 401 && (message.indexOf('绑定') >= 0 || message.indexOf('失效') >= 0)
      if (ticketDead || status === 400) {
        toastError(message)
        wx.reLaunch({ url: '/pages/login/login' })
        return
      }

      this.setData({ error: message, conflict: status === 409 })
    } finally {
      this.setData({ busy: false })
    }
  },

  onBackToLogin() {
    wx.reLaunch({ url: '/pages/login/login' })
  },
})
