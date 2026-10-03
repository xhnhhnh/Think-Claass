/**
 * 管理 - the operator screen, for `admin` and `superadmin` only.
 *
 * ## One page, three cards
 *
 * The console roles already have the teacher tabs (their class and assignment routes accept
 * `admin` / `superadmin`), so this page answers the three questions a phone is actually the right
 * device for: is the service alive, who are the teachers, and is the AI configured. Everything
 * destructive stays on the web console - see `services/admin.ts` for why.
 *
 * ## Why it is not a tab page
 *
 * It is reached from the 管理 entry the tab bar appends for these roles (`utils/feature.ts`), and
 * `app.json`'s `tabBar.list` is full: WeChat caps it at five and the student set holds those slots.
 * So this page is an ordinary page that renders the very same bar by hand under `#tab-bar`, exactly
 * like the three teacher pages - which is why `syncTabBar(this)` runs in `onShow`.
 *
 * ## Refresh
 *
 * A button rather than pull-to-refresh: `enablePullDownRefresh` is a window option this page would
 * have to opt into in `app.json`, and one tap on “刷新” is the same affordance without a new
 * global window behaviour.
 */

import { adminSettings, adminStats, adminUsers, saveAdminSettings } from '../../services/admin'
import type { AdminAiSettings, AdminSystemStats, AdminUser } from '../../services/admin'
import { requireSession } from '../../services/auth'
import { syncTabBar } from '../../utils/feature'
import { errorMessage, toastError, toastSuccess } from '../../utils/toast'

/**
 * What the provider picker offers.
 *
 * `mock` is a real provider on the server (deterministic grading with no model call), not fabricated
 * data - it stays because a class with no model configured still needs a working grader. `http` is a
 * model behind an OpenAI-compatible endpoint.
 *
 * The form shows whatever the server reports as the *stored* setting. Note that the environment
 * variables (`AI_PROVIDER` and friends) outrank this setting, so a deployment configured entirely
 * through the environment displays `mock` here even while it is grading with a real model - the
 * resolution order is in `plugins/homework/src/homework.ai.ts`, and the server's own answer carries
 * the effective source.
 */
const PROVIDERS: Array<{ value: string; label: string }> = [
  { value: 'mock', label: '离线（mock）' },
  { value: 'http', label: 'OpenAI 兼容接口' },
]

/** `totalMem` is bytes; a phone screen wants GB. */
function formatMemory(stats: AdminSystemStats | null): string {
  if (!stats || !stats.server) {
    return '—'
  }
  const gb = stats.server.totalMem / 1024 / 1024 / 1024
  return `${stats.server.memUsage}%（共 ${gb.toFixed(1)} GB）`
}

/** `uptime` is seconds since the kernel started. */
function formatUptime(stats: AdminSystemStats | null): string {
  if (!stats || typeof stats.server?.uptime !== 'number') {
    return '—'
  }
  const hours = Math.floor(stats.server.uptime / 3600)
  const minutes = Math.floor((stats.server.uptime % 3600) / 60)
  return hours > 0 ? `${hours} 小时 ${minutes} 分` : `${minutes} 分`
}

Page({
  data: {
    loading: true,
    error: '',
    stats: null as AdminSystemStats | null,
    /** Pre-formatted so the template stays free of arithmetic. */
    memory: '—',
    uptime: '—',
    users: [] as AdminUser[],
    providers: PROVIDERS,
    form: { provider: 'mock', baseUrl: '', model: '', timeoutMs: '', apiKey: '' },
    saving: false,
    saveMessage: '',
  },

  onShow() {
    if (!requireSession()) {
      return
    }
    void syncTabBar(this)
    void this.load()
  },

  onRefresh() {
    void this.load()
  },

  /**
   * Read the three surfaces at once.
   *
   * `Promise.all` rather than three sequential awaits: they are independent reads against the same
   * kernel, and a slow one should not make the other two wait. A failure of any of them is reported
   * once - the page is useless if the token is gone, and `utils/request.ts` has already handled the
   * 401 case by the time the error reaches here.
   */
  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const [stats, users, settings] = await Promise.all([adminStats(), adminUsers(), adminSettings()])
      this.setData({
        stats,
        memory: formatMemory(stats),
        uptime: formatUptime(stats),
        users,
        // The key is never rendered: the server masks it on read, and this form only ever *sends* a
        // new one. Leaving it blank means "keep whatever is configured".
        form: {
          provider: settings.ai_provider || 'mock',
          baseUrl: settings.ai_base_url || '',
          model: settings.ai_model || '',
          timeoutMs: settings.ai_timeout_ms || '',
          apiKey: '',
        },
        loading: false,
      })
    } catch (error) {
      this.setData({ loading: false, error: errorMessage(error) })
    }
  },

  onProviderTap(event: { currentTarget: { dataset: Record<string, string> } }) {
    const provider = event.currentTarget.dataset.provider
    if (provider) {
      this.setData({ 'form.provider': provider, saveMessage: '' })
    }
  },

  onBaseUrlInput(event: { detail: { value: string } }) {
    this.setData({ 'form.baseUrl': event.detail.value, saveMessage: '' })
  },

  onModelInput(event: { detail: { value: string } }) {
    this.setData({ 'form.model': event.detail.value, saveMessage: '' })
  },

  onTimeoutInput(event: { detail: { value: string } }) {
    this.setData({ 'form.timeoutMs': event.detail.value, saveMessage: '' })
  },

  onApiKeyInput(event: { detail: { value: string } }) {
    this.setData({ 'form.apiKey': event.detail.value, saveMessage: '' })
  },

  /**
   * Save the AI settings.
   *
   * `ai_api_key` is included **only when the operator typed one**: the read side masks it, so an
   * empty field cannot be told apart from "the stored key is empty", and sending `''` would wipe a
   * working key every time somebody adjusted the timeout. The other keys are always sent, because
   * clearing a base URL is a legitimate way to fall back to the offline grader.
   */
  async onSave() {
    if (this.data.saving) {
      return
    }
    const form = this.data.form
    const patch: AdminAiSettings = {
      ai_provider: form.provider,
      ai_base_url: form.baseUrl.trim(),
      ai_model: form.model.trim(),
    }
    const timeout = form.timeoutMs.trim()
    if (timeout) {
      patch.ai_timeout_ms = timeout
    }
    if (form.apiKey.trim()) {
      patch.ai_api_key = form.apiKey.trim()
    }

    this.setData({ saving: true, saveMessage: '' })
    try {
      const saved = await saveAdminSettings(patch)
      this.setData({
        form: {
          provider: saved.ai_provider || form.provider,
          baseUrl: saved.ai_base_url || '',
          model: saved.ai_model || '',
          timeoutMs: saved.ai_timeout_ms || '',
          // Cleared on success: the new key is stored, and leaving it in a form would be a secret
          // sitting on screen for the next person who picks up the phone.
          apiKey: '',
        },
        saveMessage: '已保存。模型改动会在下一次判分/出题时生效。',
      })
      toastSuccess('设置已保存')
    } catch (error) {
      const message = errorMessage(error)
      this.setData({ saveMessage: message })
      toastError(message)
    } finally {
      this.setData({ saving: false })
    }
  },
})
