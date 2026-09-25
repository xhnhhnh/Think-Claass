/**
 * A fake `wx` runtime, and `getCurrentPages`.
 *
 * The mini program client cannot be executed here - that needs 微信开发者工具 - but most of its
 * logic is plain TypeScript that only *touches* the platform through a handful of globals:
 * `wx.request`, `wx.login`, the three storage calls, `wx.showToast`, `wx.reLaunch` and
 * `getCurrentPages`. Faking exactly those is what turns "it compiles" into "the envelope, the 401
 * recovery and the tab gating actually behave", which is the part a first run in the devtools
 * would otherwise be discovering in front of an audience.
 *
 * Deliberately not a mock of the whole SDK: a method this client does not call is not here, so a
 * test that starts calling one fails loudly instead of silently succeeding against a stub.
 */

export interface RecordedRequest {
  url: string
  method: string
  data: unknown
  header: Record<string, string>
}

/** What the fake runtime answers for one request. `{ fail: true }` is a transport failure. */
export type Responder = (
  request: RecordedRequest,
) => { statusCode: number; data: unknown } | { fail: true };

export interface FakeWxOptions {
  respond: Responder
  /** The code `wx.login` returns. `null` makes `wx.login` fail (no AppID, denied). */
  loginCode?: string | null
  /** The page stack `getCurrentPages()` reports, top of stack last. */
  pages?: string[]
}

export interface FakeWx {
  storage: Map<string, string>
  requests: RecordedRequest[]
  toasts: string[]
  relaunches: string[]
  loginCalls: number
  setPages(pages: string[]): void
  /** The requests whose URL contains `fragment`, in order. */
  requestsTo(fragment: string): RecordedRequest[]
}

export function installFakeWx(options: FakeWxOptions): FakeWx {
  const storage = new Map<string, string>()
  const requests: RecordedRequest[] = []
  const toasts: string[] = []
  const relaunches: string[] = []
  let loginCalls = 0;
  let pages = options.pages ?? ['pages/student/home']

  const wx = {
    request(config: {
      url: string
      method: string
      data?: unknown
      header?: Record<string, string>
      success?: (res: { statusCode: number; data: unknown; header: Record<string, string> }) => void
      fail?: (err: { errMsg: string }) => void
    }): void {
      const recorded: RecordedRequest = {
        url: config.url,
        method: config.method,
        data: config.data,
        header: config.header ?? {},
      }
      requests.push(recorded)

      const outcome = options.respond(recorded)
      if ('fail' in outcome) {
        config.fail?.({ errMsg: 'request:fail' })
        return
      }
      config.success?.({ statusCode: outcome.statusCode, data: outcome.data, header: {} })
    },

    login(config: { success?: (res: { code?: string }) => void; fail?: (err: { errMsg: string }) => void }): void {
      loginCalls += 1
      if (options.loginCode === null) {
        config.fail?.({ errMsg: 'login:fail' })
        return
      }
      config.success?.({ code: options.loginCode ?? 'code-from-wx' })
    },

    setStorageSync(key: string, value: string): void {
      storage.set(key, value)
    },
    getStorageSync(key: string): string {
      return storage.get(key) ?? ''
    },
    removeStorageSync(key: string): void {
      storage.delete(key)
    },

    showToast(entry: { title: string }): void {
      toasts.push(entry.title)
    },
    showLoading(): void {},
    hideLoading(): void {},
    showModal(config: { success?: (res: { confirm: boolean }) => void }): void {
      config.success?.({ confirm: true })
    },
    reLaunch(config: { url: string }): void {
      relaunches.push(config.url)
    },
  };

  (globalThis as unknown as { wx: unknown }).wx = wx;
  (globalThis as unknown as { getCurrentPages: unknown }).getCurrentPages = () =>
    pages.map((route) => ({ route }))

  return {
    storage,
    requests,
    toasts,
    relaunches,
    get loginCalls() {
      return loginCalls
    },
    setPages(next: string[]) {
      pages = next
    },
    requestsTo(fragment: string) {
      return requests.filter((entry) => entry.url.includes(fragment))
    },
  }
}

/** The `Authorization` header of a recorded request, or `undefined` when it carried none. */
export function authHeader(request: RecordedRequest): string | undefined {
  return request.header.Authorization ?? request.header.authorization
}
