/**
 * Hand-written typings for the *only* `wx.*` surface this mini program calls.
 *
 * ## Why not `miniprogram-api-typings`
 *
 * The project rule is "no npm runtime dependencies", and the type package is the thin end of
 * that wedge: pulling `miniprogram-api-typings` in means a `node_modules/` inside
 * `miniprogram/`, a `package.json` to keep in sync, and `miniprogram_npm/` in the upload
 * bundle. The list of APIs a four-tab classroom client actually touches is short, so it is
 * written out here instead - and the list doubles as documentation of that surface: adding a
 * `wx.*` call means adding it here first, which is a deliberate speed bump.
 *
 * ## Scope of the typing
 *
 * Deliberately permissive about payloads (`any` for `data`, storage values and component
 * properties) and strict about *shape* only where getting it wrong is a compile-time class of
 * bug: `setData` takes a partial of the page's own data, `Page`/`Component` bind `this`, and
 * the cloud container call is declared optional because a plain-`request` deployment never
 * has `wx.cloud` at all.
 *
 * Everything here is global (this file has no imports/exports), which is what the mini
 * program's own module model expects: pages never import `wx`.
 */

/** Success envelope shared by every `wx.*` callback. */
interface WxCallbackResult {
  errMsg: string
}

interface WxFailResult extends WxCallbackResult {}

/** A callback-style API's common tail, so `success`/`fail`/`complete` are typed once. */
interface WxCallbackOptions<S, F = WxFailResult> {
  success?: (res: S) => void
  fail?: (err: F) => void
  complete?: (res: S | F) => void
}

// ---------------------------------------------------------------------------
// wx.request

interface WxRequestSuccess extends WxCallbackResult {
  data: any
  statusCode: number
  header: Record<string, string>
  cookies: string[]
}

interface WxRequestOption {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'TRACE' | 'CONNECT'
  data?: any
  header?: Record<string, string>
  /** Per-request ceiling in ms; the wrapper passes one on every call. */
  timeout?: number
  dataType?: string
  responseType?: 'text' | 'arraybuffer'
  success?: (res: WxRequestSuccess) => void
  fail?: (err: WxFailResult) => void
  complete?: (res: WxRequestSuccess | WxFailResult) => void
}

interface WxRequestTask {
  abort(): void
}

// ---------------------------------------------------------------------------
// wx.login / storage

interface WxLoginSuccess extends WxCallbackResult {
  /** The one-shot credential the backend exchanges for a session. */
  code: string
}

interface WxLoginOption extends WxCallbackOptions<WxLoginSuccess> {
  timeout?: number
}

// ---------------------------------------------------------------------------
// UI feedback

type WxToastIcon = 'success' | 'error' | 'loading' | 'none'

interface WxShowToastOption extends WxCallbackOptions<WxCallbackResult> {
  title: string
  icon?: WxToastIcon
  image?: string
  duration?: number
  mask?: boolean
}

interface WxShowLoadingOption extends WxCallbackOptions<WxCallbackResult> {
  title: string
  mask?: boolean
}

interface WxShowModalSuccess extends WxCallbackResult {
  confirm: boolean
  cancel: boolean
  /** Only filled when `editable` is set. */
  content?: string
}

interface WxShowModalOption extends WxCallbackOptions<WxShowModalSuccess> {
  title?: string
  content?: string
  showCancel?: boolean
  cancelText?: string
  cancelColor?: string
  confirmText?: string
  confirmColor?: string
  editable?: boolean
  placeholderText?: string
}

// ---------------------------------------------------------------------------
// Navigation

interface WxNavigateOption extends WxCallbackOptions<WxCallbackResult> {
  url: string
}

interface WxNavigateBackOption extends WxCallbackOptions<WxCallbackResult> {
  delta?: number
}

// ---------------------------------------------------------------------------
// Device info

interface WxSystemInfo {
  brand: string
  model: string
  system: string
  platform: string
  SDKVersion: string
  windowWidth: number
  windowHeight: number
  screenWidth: number
  screenHeight: number
  statusBarHeight: number
  pixelRatio: number
  language: string
  version: string
  safeArea?: { top: number; left: number; right: number; bottom: number; width: number; height: number }
}

// ---------------------------------------------------------------------------
// 云托管 (CloudBase container) transport - optional by design.
//
// `wx.cloud` exists only in a base library that carries the cloud module, and only a
// deployment that switched `TRANSPORT` to `'container'` will ever touch it. Declaring it
// optional is what makes the plain-HTTP build compile without a `wx.cloud` guard everywhere.

interface WxCallContainerSuccess extends WxCallbackResult {
  /** Already JSON-parsed when the container answered `application/json`. */
  data: any
  statusCode: number
  header: Record<string, string>
}

interface WxCallContainerOption {
  config: { env: string }
  path: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS'
  header?: Record<string, string>
  data?: any
  timeout?: number
  success?: (res: WxCallContainerSuccess) => void
  fail?: (err: WxFailResult) => void
  complete?: (res: WxCallContainerSuccess | WxFailResult) => void
}

interface WxCloud {
  callContainer?: (option: WxCallContainerOption) => void
}

// ---------------------------------------------------------------------------
// The namespace object itself

interface Wx {
  request(option: WxRequestOption): WxRequestTask
  login(option: WxLoginOption): void

  setStorageSync(key: string, data: any): void
  getStorageSync<T = any>(key: string): T
  removeStorageSync(key: string): void

  showToast(option: WxShowToastOption): void
  hideToast(option?: WxCallbackOptions<WxCallbackResult>): void
  showLoading(option: WxShowLoadingOption): void
  hideLoading(option?: WxCallbackOptions<WxCallbackResult>): void
  showModal(option: WxShowModalOption): void

  navigateTo(option: WxNavigateOption): void
  redirectTo(option: WxNavigateOption): void
  switchTab(option: WxNavigateOption): void
  reLaunch(option: WxNavigateOption): void
  navigateBack(option?: WxNavigateBackOption): void

  getSystemInfoSync(): WxSystemInfo
  stopPullDownRefresh(option?: WxCallbackOptions<WxCallbackResult>): void

  cloud?: WxCloud
}

declare const wx: Wx

// ---------------------------------------------------------------------------
// Framework entry points

/** The options object `App()` is called with; `globalData` is the app-wide scratch space. */
interface IAppOption {
  globalData: any
  onLaunch?(options: WxLaunchOption): void
  onShow?(options: WxLaunchOption): void
  onHide?(): void
  onError?(message: string): void
  onUnhandledRejection?(res: { reason: string; promise: Promise<any> }): void
}

interface WxLaunchOption {
  path: string
  query: Record<string, string>
  scene: number
  shareTicket?: string
}

interface WxPageInstance<D> {
  data: D
  route: string
  options: Record<string, string>
  setData(data: Partial<D> & Record<string, any>, callback?: () => void): void
  selectComponent(selector: string): any
  /** Present on tab pages only; call sites still guard with `typeof` before using it. */
  getTabBar(): any
}

interface WxPageOptions<D> {
  data?: D
  onLoad?(query: Record<string, string>): void
  onReady?(): void
  onShow?(): void
  onHide?(): void
  onUnload?(): void
  onPullDownRefresh?(): void
  onReachBottom?(): void
  onShareAppMessage?(): { title?: string; path?: string; imageUrl?: string }
}

/**
 * `ThisType` is what makes `this.setData` / `this.someMethod()` work inside the object literal: the
 * custom members `M` are intersected into the instance type, so a page can call its own helpers (and
 * the framework's lifecycles, which `M` also carries) without an explicit `this` annotation.
 *
 * `M` is constrained to `Record<string, any>` rather than to a function map on purpose: TypeScript
 * infers `M` from the *whole* options literal, `data` included, so a function-only constraint makes
 * any page with a `data` block fail to compile. `Omit<M, 'data'>` keeps the instance's own `data`
 * type coming from `D` alone.
 */
declare function Page<D extends Record<string, any>, M extends Record<string, any>>(
  options: WxPageOptions<D> & M & ThisType<WxPageInstance<D> & Omit<M, 'data'>>,
): void

interface WxPropertyOption {
  type: StringConstructor | NumberConstructor | BooleanConstructor | ArrayConstructor | ObjectConstructor | null
  value?: any
  observer?: string | ((newValue: any, oldValue: any) => void)
}

interface WxComponentInstance<D> {
  /**
   * `properties` are merged into `data` by the framework at runtime, so the instance type
   * allows them through rather than forcing every component to also list its properties in
   * its own `data` literal.
   */
  data: D & Record<string, any>
  properties: Record<string, any>
  setData(data: Partial<D> & Record<string, any>, callback?: () => void): void
  triggerEvent(name: string, detail?: any, options?: { bubbles?: boolean; composed?: boolean; capturePhase?: boolean }): void
  selectComponent(selector: string): any
}

interface WxComponentOptions<D, M> {
  properties?: Record<string, WxPropertyOption>
  data?: D
  methods?: M
  observers?: Record<string, (...args: any[]) => void>
  lifetimes?: {
    created?(): void
    attached?(): void
    ready?(): void
    moved?(): void
    detached?(): void
  }
  pageLifetimes?: { show?(): void; hide?(): void; resize?(size: { size: { windowWidth: number; windowHeight: number } }): void }
  externalClasses?: string[]
  options?: {
    multipleSlots?: boolean
    addGlobalClass?: boolean
    styleIsolation?: 'isolated' | 'apply-shared' | 'shared'
    virtualHost?: boolean
  }
}

declare function Component<D extends Record<string, any>, M extends Record<string, (...args: any[]) => any>>(
  options: WxComponentOptions<D, M> & ThisType<WxComponentInstance<D> & M>,
): void

declare function App<T extends IAppOption>(options: T & ThisType<T>): void
declare function getApp<T = IAppOption>(): T
declare function getCurrentPages(): Array<{ route?: string; options?: Record<string, string> }>

// ---------------------------------------------------------------------------
// Language globals the ES-only `lib` setting does not provide.
//
// `tsconfig.json` deliberately sets `"lib": ["ES2018"]` so that browser and Node globals
// (`window`, `fetch`, `process`) are *not* available - a mini program has none of them.
// Timers and `console` are the two the runtime does provide, so they are declared here.

declare function setTimeout(handler: () => void, timeout?: number): number
declare function clearTimeout(handle: number): void
declare function setInterval(handler: () => void, timeout?: number): number
declare function clearInterval(handle: number): void

interface WxConsole {
  log(...args: any[]): void
  info(...args: any[]): void
  warn(...args: any[]): void
  error(...args: any[]): void
  debug(...args: any[]): void
}

declare const console: WxConsole
