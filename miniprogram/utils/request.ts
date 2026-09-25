/**
 * The one HTTP path out of the mini program.
 *
 * ## What this file is responsible for
 *
 *   1. **Transport.** `TRANSPORT` in `config/index.ts` picks `wx.request` or
 *      `wx.cloud.callContainer`. Both go through `send()`, so the envelope rules, the 401
 *      recovery and the error messages below are shared and a deployment switch cannot change
 *      the app's failure behaviour.
 *   2. **The envelope.** The kernel answers the payload *directly* - there is no `{ data }`
 *      wrapper - and reports failure two different ways: a non-2xx status, or a 2xx body with
 *      `success: false`. Both are failures here, and `body.message` (the contract's 中文提示) is
 *      the message the user sees. Callers therefore never unwrap anything: `request<T>` resolves
 *      the body as `T`.
 *   3. **401 recovery.** A session that expired - or a token the server no longer honours - is
 *      not a dead end: the mini program can mint a new one silently, because WeChat itself
 *      identifies the user. `silentRelogin()` runs `wx.login` -> `POST /api/wechat/login`, and
 *      an already-bound user gets a fresh 7-day token with no UI at all. Only when *that* fails
 *      (the account was unbound, or the WeChat credential is refused) is the session cleared and
 *      the login page shown.
 *
 * ## Auth is a bearer token, and only that
 *
 * No cookies exist in a mini program, and the kernel's legacy `x-user-role` / `x-user-id`
 * bridge is deliberately never used here: every authenticated call carries
 * `Authorization: Bearer <token>` and nothing else.
 */

import { BASE_URL, CLOUD_ENV, CLOUD_SERVICE, DEV_LOGIN_OPENID, MOCK, REQUEST_TIMEOUT, TRANSPORT } from '../config/index'
import { mockRequest } from './mock'
import { clearSession, readSession, writeSession } from './storage'
import { toastError } from './toast'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface RequestOptions {
  method: HttpMethod
  /** Path below the API root, query string included. Always starts with `/api`. */
  path: string
  data?: any
  /**
   * Attach the bearer token. Defaults to `true`; the two WeChat auth routes set `false`, which
   * also opts them out of the 401 recovery below (a 401 from `bind` is "wrong password", not
   * "session expired", and re-running `wx.login` would only lose the ticket).
   */
  auth?: boolean
  timeout?: number
  /** Skip the「登录已过期」toast when the re-login attempt fails. */
  silent?: boolean
}

/** Everything a caller may want to know about a failed request. */
export class ApiError extends Error {
  status: number
  body: any

  constructor(status: number, message: string, body: any) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

interface RawResponse {
  statusCode: number
  data: any
}

// ---------------------------------------------------------------------------
// Transport

function buildUrl(path: string): string {
  return `${BASE_URL.replace(/\/+$/, '')}${path}`
}

function headersFor(token: string): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) {
    // The only identity the kernel is told about. See the file comment.
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

function currentToken(options: RequestOptions): string {
  if (options.auth === false) {
    return ''
  }
  const session = readSession()
  return session ? session.token : ''
}

/** `wx.request`, promisified. A transport failure is a `status 0` `ApiError`. */
function sendViaRequest(options: RequestOptions, token: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: buildUrl(options.path),
      method: options.method,
      data: options.data,
      header: headersFor(token),
      timeout: options.timeout || REQUEST_TIMEOUT,
      success: (res) => resolve({ statusCode: res.statusCode, data: res.data }),
      fail: (err) => reject(new ApiError(0, '网络连接失败，请检查网络后重试', err)),
    })
  })
}

/**
 * `wx.cloud.callContainer` - the 微信云托管 transport.
 *
 * Two differences from `wx.request` matter and are handled here rather than at the call sites:
 * the service is addressed by environment + `X-WX-SERVICE` header instead of a hostname (which
 * is exactly why 云托管 needs no 服务器域名 allowlist entry), and `callContainer` is not
 * guaranteed to exist - it is a base-library feature, so its absence is reported as a
 * configuration mistake instead of a crash.
 */
function sendViaContainer(options: RequestOptions, token: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const cloud = wx.cloud
    if (!cloud || typeof cloud.callContainer !== 'function') {
      reject(new ApiError(0, '当前微信基础库不支持云托管调用，请升级微信后重试', null))
      return
    }
    if (!CLOUD_ENV || !CLOUD_SERVICE) {
      reject(new ApiError(0, '云托管未配置：请在 config/index.ts 填写 CLOUD_ENV 与 CLOUD_SERVICE', null))
      return
    }

    const header = headersFor(token)
    header['X-WX-SERVICE'] = CLOUD_SERVICE

    cloud.callContainer({
      config: { env: CLOUD_ENV },
      path: options.path,
      method: options.method,
      header,
      data: options.data,
      timeout: options.timeout || REQUEST_TIMEOUT,
      success: (res) => {
        let data = res.data
        // The container answers a string when the content-type is not JSON (a reverse-proxy
        // error page, for instance). Parsing it here keeps `isFailure` working on real bodies.
        if (typeof data === 'string' && data) {
          try {
            data = JSON.parse(data)
          } catch (error) {
            data = { message: data }
          }
        }
        resolve({ statusCode: res.statusCode, data })
      },
      fail: (err) => reject(new ApiError(0, '云托管调用失败，请稍后重试', err)),
    })
  })
}

function send(options: RequestOptions): Promise<RawResponse> {
  const token = currentToken(options)
  if (MOCK.enabled) {
    return mockRequest(
      { method: options.method, path: options.path, data: options.data, hasToken: !!token },
      MOCK.delayMs,
      MOCK.failRate,
    )
  }
  return TRANSPORT === 'container' ? sendViaContainer(options, token) : sendViaRequest(options, token)
}

// ---------------------------------------------------------------------------
// Envelope

function isFailure(statusCode: number, body: any): boolean {
  if (statusCode < 200 || statusCode >= 300) {
    return true
  }
  return !!body && typeof body === 'object' && body.success === false
}

/** The message for a failure: the server's own line when it sent one, else a status default. */
function failureMessage(statusCode: number, body: any): string {
  if (body && typeof body === 'object' && typeof body.message === 'string' && body.message.trim()) {
    return body.message.trim()
  }
  switch (statusCode) {
    case 0:
      return '网络连接失败，请检查网络后重试'
    case 400:
      return '请求有误，请检查后重试'
    case 401:
      return '登录已过期，请重新登录'
    case 403:
      return '当前账号无权访问该功能'
    case 404:
      return '内容不存在或已被删除'
    case 409:
      return '数据冲突，请刷新后重试'
    case 429:
      return '操作太频繁了，请稍后再试'
    case 500:
      return '服务器开小差了，请稍后重试'
    case 503:
      return '服务暂时不可用，请稍后重试'
    default:
      return '请求失败，请稍后重试'
  }
}

// ---------------------------------------------------------------------------
// Silent re-login (401 recovery)

let refreshInFlight: Promise<boolean> | null = null

/**
 * The body of `POST /api/wechat/login`.
 *
 * Exported because both login paths need the identical rule: the interactive one on the login page
 * and the silent re-login below. It carries `code` and, when `DEV_LOGIN_OPENID` is configured, the
 * development `devOpenid` - the server prefers the latter and refuses it outside development
 * (`wechat.service.ts` `resolveOpenid`), so sending it is harmless but sending it *only* is not:
 * a deployment with a real AppID still needs the code.
 */
export function buildLoginBody(code?: string): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (code) {
    body.code = code
  }
  if (DEV_LOGIN_OPENID) {
    body.devOpenid = DEV_LOGIN_OPENID
  }
  return body
}

function wxLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) {
          resolve(res.code)
        } else {
          reject(new ApiError(401, '微信登录失败，请重试', res))
        }
      },
      fail: (err) => reject(new ApiError(401, '微信登录失败，请重试', err)),
    })
  })
}

async function doSilentRelogin(): Promise<boolean> {
  try {
    // A dev-login build has no `code` to send (there is no AppID to exchange one against), so the
    // `wx.login` failure is tolerated exactly when `devOpenid` can stand in for it.
    let code = ''
    try {
      code = await wxLoginCode()
    } catch (error) {
      if (!DEV_LOGIN_OPENID) {
        throw error
      }
    }
    // Straight to `send` rather than through `request`: this *is* the recovery path, so it must
    // not be able to recurse into itself. `auth: false` also keeps a stale token off the wire.
    const res = await send({ method: 'POST', path: '/api/wechat/login', data: buildLoginBody(code), auth: false })
    const body = res.data
    const bound = res.statusCode >= 200 && res.statusCode < 300 && body && body.bound === true
    const user = body ? body.user : null
    // The user row is checked here and not just in `readSession`, because this write also reaches the
    // in-memory listeners: a session with no `role` would be refused by the next read but still be
    // handed to a caller that is about to route on `user.role`.
    const usableUser = !!user && typeof user === 'object' && typeof user.role === 'string' && user.role !== ''
    if (!bound || typeof body.token !== 'string' || !body.token || !usableUser) {
      // `bound: false` means this WeChat account is no longer linked to any Think-Class user:
      // there is nothing to recover, and the login page has to run the bind flow again.
      return false
    }
    writeSession({
      token: body.token,
      expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : '',
      user,
      classFeatures: body.classFeatures || {},
    })
    return true
  } catch (error) {
    console.warn('[request] silent re-login failed', error)
    return false
  }
}

/**
 * One re-login per burst, shared by every request that hit a 401 at the same time.
 *
 * Without the shared promise a page that fires three parallel calls on show would run three
 * `wx.login`s and three logins, and the last token to arrive would win while the other two
 * responses were already discarded.
 */
function silentRelogin(): Promise<boolean> {
  if (refreshInFlight) {
    return refreshInFlight
  }
  refreshInFlight = doSilentRelogin()
  refreshInFlight.then(
    () => {
      refreshInFlight = null
    },
    () => {
      refreshInFlight = null
    },
  )
  return refreshInFlight
}

/**
 * Clear the session and send the user to the login page.
 *
 * Guarded against a redirect loop: a 401 raised *on* the login page must not re-launch it (the
 * page owns its own error text, and re-launching would swallow the message the user needs).
 */
function routeToLogin(withToast: boolean): void {
  const pages = getCurrentPages()
  const current = pages.length ? pages[pages.length - 1].route || '' : ''
  if (current === 'pages/login/login') {
    return
  }
  if (withToast) {
    toastError('登录已过期，请重新登录')
  }
  wx.reLaunch({ url: '/pages/login/login' })
}

// ---------------------------------------------------------------------------
// The public entry point

/**
 * Perform one API call and resolve its body.
 *
 * Rejects with `ApiError` for every failure - a network error, a non-2xx status, or a 2xx body
 * carrying `success: false` - so a caller's single `catch` covers all three.
 */
export async function request<T>(options: RequestOptions): Promise<T> {
  const needsAuth = options.auth !== false
  let res = await send(options)

  if (needsAuth && res.statusCode === 401) {
    const recovered = await silentRelogin()
    if (recovered) {
      // Retry the very same call with the new token. A second 401 is handled below exactly like
      // a failed recovery: there is no session the server will accept.
      res = await send(options)
    }
    if (res.statusCode === 401) {
      clearSession()
      routeToLogin(options.silent !== true)
    }
  }

  if (isFailure(res.statusCode, res.data)) {
    throw new ApiError(res.statusCode, failureMessage(res.statusCode, res.data), res.data)
  }
  return res.data as T
}

/** Small sugar so services read as one line per route. */
export function get<T>(path: string, options: Partial<RequestOptions> = {}): Promise<T> {
  return request<T>({ method: 'GET', path, ...options })
}

export function post<T>(path: string, data?: any, options: Partial<RequestOptions> = {}): Promise<T> {
  return request<T>({ method: 'POST', path, data, ...options })
}

export function put<T>(path: string, data?: any, options: Partial<RequestOptions> = {}): Promise<T> {
  return request<T>({ method: 'PUT', path, data, ...options })
}
