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
  timeout?: number
}

/**
 * The four pages `app.json` declares in `tabBar.list`, duplicated here on purpose.
 *
 * The platform, not the client, owns this rule: `switchTab` accepts these urls and `redirectTo`
 * refuses them. A fake that accepted everything would let a call site keep the wrong one and still
 * pass. `tests/miniprogram/client-feature.test.ts` pins the client's own mirror of the list, so a
 * future fifth tab page fails there before it can drift from this constant.
 */
const DECLARED_TAB_PAGES = new Set([
  'pages/student/home',
  'pages/student/homework',
  'pages/student/shop',
  'pages/student/me',
])

/** One `wx.uploadFile` call, as the multipart transport makes it. */
export interface RecordedUpload {
  url: string
  filePath: string
  /** The multipart field name; the kernel's `FileInterceptor` reads `file`. */
  name: string
  header: Record<string, string>
  formData?: Record<string, string>
}

/** What the fake runtime answers for one request. `{ fail: true }` is a transport failure. */
export type Responder = (
  request: RecordedRequest,
) => { statusCode: number; data: unknown } | { fail: true };

/** The same, for `wx.uploadFile` - whose body arrives as a *string* on the real platform. */
export type UploadResponder = (
  upload: RecordedUpload,
) => { statusCode: number; data: unknown } | { fail: true };

export interface FakeWxOptions {
  respond: Responder
  /** `wx.uploadFile`. Defaults to a successful `{success:true,data:{}}` envelope. */
  upload?: UploadResponder
  /** The code `wx.login` returns. `null` makes `wx.login` fail (no AppID, denied). */
  loginCode?: string | null
  /** The page stack `getCurrentPages()` reports, top of stack last. */
  pages?: string[]
  /** What `wx.chooseMedia` answers, as temp file paths. Defaults to one photograph. */
  media?: string[]
}

export interface FakeWx {
  storage: Map<string, string>
  requests: RecordedRequest[]
  uploads: RecordedUpload[]
  toasts: string[]
  relaunches: string[]
  /** Pages opened with `wx.switchTab` (only app.json's tabBar.list accepts these). */
  switchTabs: string[]
  /** Pages opened with `wx.redirectTo` (the stack's current page is replaced). */
  redirects: string[]
  navigations: string[]
  loginCalls: number
  setPages(pages: string[]): void
  /** The requests whose URL contains `fragment`, in order. */
  requestsTo(fragment: string): RecordedRequest[]
  /** The uploads whose URL contains `fragment`, in order. */
  uploadsTo(fragment: string): RecordedUpload[]
}

export function installFakeWx(options: FakeWxOptions): FakeWx {
  const storage = new Map<string, string>()
  const requests: RecordedRequest[] = []
  const uploads: RecordedUpload[] = []
  const toasts: string[] = []
  const relaunches: string[] = []
  const switchTabs: string[] = []
  const redirects: string[] = []
  const navigations: string[] = []
  let loginCalls = 0;
  let pages = options.pages ?? ['pages/student/home']

  const wx = {
    request(config: {
      url: string
      method: string
      data?: unknown
      header?: Record<string, string>
      timeout?: number
      success?: (res: { statusCode: number; data: unknown; header: Record<string, string> }) => void
      fail?: (err: { errMsg: string }) => void
    }): void {
      const recorded: RecordedRequest = {
        url: config.url,
        method: config.method,
        data: config.data,
        header: config.header ?? {},
        timeout: config.timeout,
      }
      requests.push(recorded)

      const outcome = options.respond(recorded)
      if ('fail' in outcome) {
        config.fail?.({ errMsg: 'request:fail' })
        return
      }
      config.success?.({ statusCode: outcome.statusCode, data: outcome.data, header: {} })
    },

    /**
     * `wx.uploadFile`.
     *
     * The real platform hands the body over as a **string** - it does not parse JSON for multipart -
     * so this fake serialises the responder's object exactly as the platform would, and the transport
     * has to parse it. A fake that passed an object through would let the client's parse be absent and
     * still pass.
     */
    uploadFile(config: {
      url: string
      filePath: string
      name: string
      header?: Record<string, string>
      formData?: Record<string, string>
      success?: (res: { statusCode: number; data: string }) => void
      fail?: (err: { errMsg: string }) => void
    }): void {
      const recorded: RecordedUpload = {
        url: config.url,
        filePath: config.filePath,
        name: config.name,
        header: config.header ?? {},
        formData: config.formData,
      }
      uploads.push(recorded)

      const outcome = options.upload
        ? options.upload(recorded)
        : { statusCode: 200, data: { success: true, data: { id: 1, storage_path: '/uploads/homework/x.jpg', mime: 'image/jpeg' } } }
      if ('fail' in outcome) {
        config.fail?.({ errMsg: 'uploadFile:fail' })
        return
      }
      config.success?.({ statusCode: outcome.statusCode, data: JSON.stringify(outcome.data) })
    },

    /** `wx.chooseMedia`: answers the configured temp paths, or one photograph. */
    chooseMedia(config: { success?: (res: unknown) => void; fail?: (err: { errMsg: string }) => void }): void {
      const files = options.media ?? ['/tmp/photo-1.jpg']
      if (files.length === 0) {
        config.fail?.({ errMsg: 'chooseMedia:fail cancel' })
        return
      }
      config.success?.({
        tempFiles: files.map((path) => ({ tempFilePath: path, size: 1024 })),
        type: 'image',
      })
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
    /**
     * Navigation.
     *
     * The real `switchTab` refuses every url outside `app.json`'s `tabBar.list`; a fake that
     * accepted anything would hide exactly the defect these tests exist for, so the refusal is
     * reproduced here (the failure callback runs and nothing is recorded).
     */
    switchTab(config: { url: string; fail?: (err: { errMsg: string }) => void }): void {
      const path = config.url.replace(/^\//, '')
      if (!DECLARED_TAB_PAGES.has(path)) {
        config.fail?.({ errMsg: 'switchTab:fail can not switch to a tabbar page' })
        return
      }
      switchTabs.push(config.url)
    },
    redirectTo(config: { url: string; fail?: (err: { errMsg: string }) => void }): void {
      const path = config.url.replace(/^\//, '')
      if (DECLARED_TAB_PAGES.has(path)) {
        config.fail?.({ errMsg: 'redirectTo:fail can not redirectTo a tabbar page' })
        return
      }
      redirects.push(config.url)
    },
    navigateTo(config: { url: string; fail?: (err: { errMsg: string }) => void }): void {
      const path = config.url.split('?')[0].replace(/^\//, '')
      if (DECLARED_TAB_PAGES.has(path)) {
        config.fail?.({ errMsg: 'navigateTo:fail can not navigateTo a tabbar page' })
        return
      }
      navigations.push(config.url)
    },
    navigateBack(): void {},
  };

  (globalThis as unknown as { wx: unknown }).wx = wx;
  (globalThis as unknown as { getCurrentPages: unknown }).getCurrentPages = () =>
    pages.map((route) => ({ route }))

  return {
    storage,
    requests,
    uploads,
    toasts,
    relaunches,
    switchTabs,
    redirects,
    navigations,
    get loginCalls() {
      return loginCalls
    },
    setPages(next: string[]) {
      pages = next
    },
    requestsTo(fragment: string) {
      return requests.filter((entry) => entry.url.includes(fragment))
    },
    uploadsTo(fragment: string) {
      return uploads.filter((entry) => entry.url.includes(fragment))
    },
  }
}

/** The `Authorization` header of a recorded request, or `undefined` when it carried none. */
export function authHeader(request: RecordedRequest): string | undefined {
  return request.header.Authorization ?? request.header.authorization
}
