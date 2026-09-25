/**
 * 我的 - the account page, shared by both roles.
 *
 * There is no `pages/teacher/me`: the two tab sets both end in 我的, and everything on this page
 * (who am I, my points if I am a student, my 奖状, change my account, unbind WeChat, log out) is the
 * same for a teacher except that two blocks are student-only. Splitting it would have duplicated the
 * destructive half of the page - the half that must behave identically every time.
 *
 * ## Why 解绑 and 退出 are two different buttons
 *
 * 退出登录 ends this session and leaves the WeChat link in place: next launch is one tap. 解绑微信
 * removes the link itself, which means the *next* launch has to go through username + password again.
 * A pupil who taps the wrong one cannot undo it from here, so both are behind a confirmation and the
 * unbind one spells out that it needs the password next time.
 */

import { forgetSession, logout, requireSession, unbindWechat, updateProfile } from '../../services/auth'
import { getCertificates, getStudent } from '../../services/student'
import type { CertificateDto, StudentDto } from '../../services/student'
import type { ClassFeatureFlags } from '../../utils/storage'
import { classIdOf, studentIdOf } from '../../utils/storage'
import { getResolution, isTeacherRole, resolveFeatures, syncTabBar } from '../../utils/feature'
import { formatDate, roleText } from '../../utils/format'
import { confirm, errorMessage, toastError, toastSuccess } from '../../utils/toast'

interface CertificateView extends CertificateDto {
  dateText: string
}

Page({
  data: {
    featuresReady: false,
    features: {} as ClassFeatureFlags,
    loading: true,
    error: '',
    name: '',
    username: '',
    roleLabel: '',
    isTeacher: false,
    classId: null as number | null,
    student: null as StudentDto | null,
    showAchievements: false,
    certificates: [] as CertificateView[],
    certificatesError: '',
    /** The 修改资料 form. */
    editing: false,
    formUsername: '',
    formPassword: '',
    saving: false,
    busy: false,
  },

  studentId: null as number | null,

  onLoad() {
    const session = requireSession()
    if (!session) {
      return
    }
    this.studentId = studentIdOf(session.user)
    this.setData({
      name: session.user.name || session.user.username,
      username: session.user.username,
      roleLabel: roleText(session.user.role),
      isTeacher: isTeacherRole(session.user.role),
      classId: classIdOf(session.user),
      formUsername: session.user.username,
    })
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
    this.setData({
      featuresReady: true,
      features: resolution.features,
      showAchievements: resolution.features.enable_achievements === true,
    })
  },

  async load(options: { silent?: boolean; force?: boolean } = {}) {
    if (!options.silent) {
      this.setData({ loading: true })
    }
    if (options.force) {
      await resolveFeatures({ force: true })
      this.applyFeatures()
    }

    const [student, certificates] = await Promise.all([this.fetchStudent(), this.fetchCertificates()])
    this.setData({
      loading: false,
      student: student.value,
      certificates: certificates.value,
      certificatesError: certificates.error,
      error: student.error,
    })
  },

  async fetchStudent(): Promise<{ value: StudentDto | null; error: string }> {
    if (this.studentId === null) {
      return { value: null, error: '' }
    }
    try {
      return { value: await getStudent(this.studentId), error: '' }
    } catch (error) {
      return { value: null, error: errorMessage(error) }
    }
  },

  async fetchCertificates(): Promise<{ value: CertificateView[]; error: string }> {
    if (this.studentId === null || !this.data.showAchievements) {
      return { value: [], error: '' }
    }
    try {
      const raw = await getCertificates(this.studentId)
      return {
        value: raw.map((certificate) => ({ ...certificate, dateText: formatDate(certificate.created_at) })),
        error: '',
      }
    } catch (error) {
      return { value: [], error: errorMessage(error) }
    }
  },

  // ------------------------------------------------------------------ profile edit

  onToggleEdit() {
    this.setData({
      editing: !this.data.editing,
      formUsername: this.data.username,
      formPassword: '',
    })
  },

  onUsernameInput(event: { detail: { value: string } }) {
    this.setData({ formUsername: event.detail.value })
  },

  onPasswordInput(event: { detail: { value: string } }) {
    this.setData({ formPassword: event.detail.value })
  },

  async onSaveProfile() {
    const username = this.data.formUsername.trim()
    if (!username) {
      toastError('账号不能为空')
      return
    }
    if (this.data.saving) {
      return
    }
    this.setData({ saving: true })
    try {
      await updateProfile(username, this.data.formPassword || undefined)
      this.setData({ username, editing: false, formPassword: '' })
      toastSuccess('已保存')
    } catch (error) {
      toastError(errorMessage(error))
    } finally {
      this.setData({ saving: false })
    }
  },

  // ------------------------------------------------------------------ session ends

  async onLogout() {
    const confirmed = await confirm({ title: '退出登录', content: '退出后需要重新用微信登录，确定吗？', confirmText: '退出' })
    if (!confirmed || this.data.busy) {
      return
    }
    this.setData({ busy: true })
    await logout()
    wx.reLaunch({ url: '/pages/login/login' })
  },

  async onUnbind() {
    const confirmed = await confirm({
      title: '解绑微信',
      content: '解绑后，下次进入需要用账号和密码重新绑定微信。确定解绑吗？',
      confirmText: '解绑',
      danger: true,
    })
    if (!confirmed || this.data.busy) {
      return
    }
    this.setData({ busy: true })
    try {
      await unbindWechat()
      // The token was issued *to this WeChat account*: the link is gone, so the session goes with it.
      // Without this the login page would find a stored token, verify it and bounce the user straight
      // back in - which is exactly what the user just asked not to happen.
      forgetSession()
      toastSuccess('已解绑')
      wx.reLaunch({ url: '/pages/login/login' })
    } catch (error) {
      toastError(errorMessage(error))
      this.setData({ busy: false })
    }
  },

  onGoClass() {
    wx.navigateTo({ url: '/pages/teacher/class' })
  },

  onRetry() {
    void this.bootstrap()
  },
})
