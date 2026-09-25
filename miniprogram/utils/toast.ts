/**
 * Feedback helpers: the three toasts the app uses, a modal confirm, and one place that turns a
 * thrown value into a line of Chinese a K-12 user can act on.
 *
 * Wrapped rather than called directly for two reasons: `wx.showToast` truncates a long title
 * (and silently shows nothing for a title over ~14 characters on some clients), and every page
 * would otherwise repeat the same `try/catch` -> `err.message || '未知错误'` dance.
 */

/** Plain text toast - the default for短提示 the user reads once. */
export function toast(title: string): void {
  wx.showToast({ title: trim(title), icon: 'none', duration: 2000 })
}

export function toastSuccess(title: string): void {
  wx.showToast({ title: trim(title), icon: 'success', duration: 1600 })
}

export function toastError(title: string): void {
  // `icon: 'none'` and not `'error'`: the error glyph is a red cross that reads as "you broke
  // something" to a pupil who merely tapped a disabled item, and several messages here are
  // informational ("该功能未开启").
  wx.showToast({ title: trim(title), icon: 'none', duration: 2400 })
}

export function showLoading(title = '加载中'): void {
  wx.showLoading({ title, mask: true })
}

export function hideLoading(): void {
  wx.hideLoading()
}

/** `wx.showToast` renders at most about two lines; anything longer is cut mid-sentence. */
function trim(title: string): string {
  const text = (title || '').trim() || '操作失败'
  return text.length > 30 ? `${text.slice(0, 29)}…` : text
}

export interface ConfirmOptions {
  title?: string
  content: string
  confirmText?: string
  cancelText?: string
  /** Destructive confirmations get the danger colour instead of the brand green. */
  danger?: boolean
}

export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      title: options.title || '请确认',
      content: options.content,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      confirmColor: options.danger ? '#DE3B35' : '#17583E',
      success: (res) => resolve(res.confirm === true),
      // A modal that fails to open (a second modal already up) resolves false: callers use this
      // to gate a destructive write, so "we could not ask" must mean "do not do it".
      fail: () => resolve(false),
    })
  })
}

/**
 * The message to show for anything thrown by the service layer.
 *
 * `ApiError` already carries the server's own `message` (the contract's 中文提示), so the order
 * here is: that message, then a plain `Error`, then the network-failure fallback.
 */
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; status?: unknown }
    if (typeof candidate.message === 'string' && candidate.message.trim()) {
      return candidate.message.trim()
    }
    if (candidate.status === 0) {
      return '网络连接失败，请检查网络后重试'
    }
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }
  return '操作失败，请稍后重试'
}

export function toastErrorFrom(error: unknown): void {
  toastError(errorMessage(error))
}
