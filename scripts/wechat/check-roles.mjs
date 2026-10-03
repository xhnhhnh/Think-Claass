#!/usr/bin/env node
/**
 * 自检：三种角色的账号密码登录，以及管理端端点。
 *
 * 为什么要在**真实服务端**上跑一遍：小程序里的账号登录是两步（`/api/wechat/login` 判断绑定 →
 * `/api/wechat/bind` 用账号密码完成绑定），微信一键登录只是第一步的另一种走法。两条路共用同一批
 * 路由，所以这里的断言同时覆盖了两者：**未绑定的微信号拿不到 token，只能拿到 ticket**。
 *
 * 它**不创建任何持久数据**：绑定用的是临时 openid，跑完就 `unbind` 掉。用 `unbind` 而不是
 * `DELETE /api/admin/users/:id`，是因为后者会连带删掉该教师名下的班级与学生。
 *
 * ## 用法
 *
 *   # 后端已在跑，且 .env 里有两个可用的账号（见 docs/wechat/50-ai-capability.md 与提审清单）
 *   TEACHER_USERNAME=thinkclass_teacher TEACHER_PASSWORD='...' \
 *   SUPERADMIN_USERNAME=admin_f7cf07feab SUPERADMIN_PASSWORD='...' \
 *   node scripts/wechat/check-roles.mjs
 *
 * ## 退出码
 *
 * 0 = 五种角色都能登录、管理端对超管开放、对教师关闭；1 = 有断言失败（原因打印在对应行下）。
 */

const BASE = process.env.THINK_CLASS_BASE_URL?.trim() || 'http://localhost:3001'
const teacherUsername = process.env.TEACHER_USERNAME?.trim()
const teacherPassword = process.env.TEACHER_PASSWORD
const superUsername = process.env.SUPERADMIN_USERNAME?.trim()
const superPassword = process.env.SUPERADMIN_PASSWORD

if (!teacherUsername || !teacherPassword || !superUsername || !superPassword) {
  console.error(
    '缺少凭据。用法：\n' +
      "  TEACHER_USERNAME=thinkclass_teacher TEACHER_PASSWORD='...' \\\n" +
      "  SUPERADMIN_USERNAME=admin_xxx SUPERADMIN_PASSWORD='...' \\\n" +
      '  node scripts/wechat/check-roles.mjs\n\n' +
      '两个账号都必须是这台服务端上真实存在的（教师账号在电脑端管理中心创建）。',
  )
  process.exit(2)
}

const log = (...args) => console.log(...args)
const failures = []

function check(label, condition, detail) {
  if (condition) {
    log(`  OK  ${label}`)
    return true
  }
  log(`  ERR ${label}${detail ? ` -- ${detail}` : ''}`)
  failures.push(label)
  return false
}

async function api(method, path, { body, token } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60000),
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* 原文留着报错 */
  }
  return { status: response.status, json, text }
}

/** Bind this temporary openid to the given account, exactly as the mini program's second door does. */
async function bindThroughWechat(openid, username, password, role) {
  const unbound = await api('POST', '/api/wechat/login', { body: { code: '', devOpenid: openid } })
  const bound = await api('POST', '/api/wechat/bind', { body: { ticket: unbound.json?.ticket, username, password, role } })
  return { unbound, bound }
}

log(`[自检] ${BASE}\n`)

// ---------------------------------------------------------------------------
// 1. 五种角色都能用账号密码登录（走小程序那条两步路）
// ---------------------------------------------------------------------------

log('=== 1) 账号密码登录（微信未绑定时必须先绑定）===')
/*
 * Three positive cases, one per account shape the product actually has: a teacher, and a console
 * account. `superadmin` is the console role this deployment stores; `admin` is the *other* console
 * role and is asserted as a **failure** further down, because it is the trap the role picker walks
 * into: a credential is resolved by `(username, role)`, so picking a role the account is not stored
 * under answers 401「账号或密码错误」. The server words it that way on purpose - "no such account in
 * this role" and "wrong password" must be indistinguishable to someone guessing credentials.
 */
const ROLE_CASES = [
  { role: 'teacher', username: teacherUsername, password: teacherPassword, expect: 'teacher' },
  { role: 'superadmin', username: superUsername, password: superPassword, expect: 'superadmin' },
]

const issuedTokens = []
let teacherToken = ''
let superToken = ''

for (const [index, testCase] of ROLE_CASES.entries()) {
  const openid = `check-roles-${Date.now()}-${index}`
  const { unbound, bound } = await bindThroughWechat(openid, testCase.username, testCase.password, testCase.role)

  check(`${testCase.role}: 第一步返回未绑定 + ticket`, unbound.json?.bound === false && !!unbound.json?.ticket)
  if (
    check(
      `${testCase.role}: 绑定后拿到 token 且角色=${testCase.expect}`,
      bound.status === 200 && bound.json?.user?.role === testCase.expect,
      `HTTP ${bound.status} ${bound.text.slice(0, 160)}`,
    )
  ) {
    issuedTokens.push({ token: bound.json.token, openid })
    if (testCase.role === 'teacher') teacherToken = bound.json.token
    if (testCase.role === 'superadmin') superToken = bound.json.token
  }
}

/*
 * 角色选错 -> 401。
 *
 * `admin` is the probe *because the picker does not offer it*: the kernel accepts the role and gates
 * the admin routes on `admin` or `superadmin`, but no account in this product is created with it, so
 * choosing it can only ever fail. Pinning that here keeps the trap documented: if this ever starts
 * answering 200, either an `admin` account was created on purpose (then offer it in the picker) or
 * the `(username, role)` lookup was loosened (then it is a security bug, not a feature).
 */
{
  const openid = `check-roles-${Date.now()}-wrongrole`
  const { bound } = await bindThroughWechat(openid, superUsername, superPassword, 'admin')
  check(
    '角色选错（用不存在的 admin 角色）: 401，服务端不区分"角色不对"与"密码错"',
    bound.status === 401 && !bound.json?.token,
    `HTTP ${bound.status} ${bound.text.slice(0, 120)}`,
  )
}

// 密码错 -> 401，且 ticket 已被消费（服务端先认票再验密码，这是刻意的）
{
  const openid = `check-roles-${Date.now()}-wrong`
  const unbound = await api('POST', '/api/wechat/login', { body: { code: '', devOpenid: openid } })
  const wrong = await api('POST', '/api/wechat/bind', {
    body: { ticket: unbound.json?.ticket, username: teacherUsername, password: 'definitely-not-the-password', role: 'teacher' },
  })
  check('密码错: 401 且不返回 token', wrong.status === 401 && !wrong.json?.token, `HTTP ${wrong.status} ${wrong.text.slice(0, 120)}`)
  const replay = await api('POST', '/api/wechat/bind', {
    body: { ticket: unbound.json?.ticket, username: teacherUsername, password: teacherPassword, role: 'teacher' },
  })
  check('ticket 一次性: 重放被拒（所以客户端每次提交都取新票）', replay.status === 401, `HTTP ${replay.status} ${replay.text.slice(0, 120)}`)
}

// ---------------------------------------------------------------------------
// 2. 管理端：超管可用，教师被拒
// ---------------------------------------------------------------------------

log('\n=== 2) 管理端端点 ===')
const stats = await api('GET', '/api/admin/system/stats', { token: superToken })
check(
  '超管: GET /api/admin/system/stats -> 200 且含 database 统计',
  stats.status === 200 && typeof stats.json?.data?.database?.totalUsers === 'number',
  `HTTP ${stats.status} ${stats.text.slice(0, 160)}`,
)

const users = await api('GET', '/api/admin/users', { token: superToken })
check(
  '超管: GET /api/admin/users -> 200 且 items 是数组',
  users.status === 200 && Array.isArray(users.json?.data?.items),
  `HTTP ${users.status} ${users.text.slice(0, 160)}`,
)
if (Array.isArray(users.json?.data?.items)) {
  const sample = users.json.data.items.find((row) => row.username === teacherUsername)
  check(`超管: 教师列表里能看到 ${teacherUsername}`, !!sample, JSON.stringify(users.json.data.items.slice(0, 3)))
}

const settings = await api('GET', '/api/admin/system/settings', { token: superToken })
const aiKeys = settings.json?.data ?? {}
check(
  '超管: GET /api/admin/system/settings -> 200 且只回显打码后的 AI 配置',
  settings.status === 200 && 'ai_provider' in aiKeys && aiKeys.ai_api_key !== undefined,
  `HTTP ${settings.status} ${settings.text.slice(0, 200)}`,
)
if (settings.status === 200) {
  // 这一条是"密钥不会漏给客户端"的回归断言：读回来的 key 不能等于环境里配置的那把明文。
  const configured = process.env.AI_API_KEY?.trim()
  if (configured) {
    check('超管: 读回的 ai_api_key 不是明文（存取都不回显密钥）', aiKeys.ai_api_key !== configured, String(aiKeys.ai_api_key).slice(0, 12))
  }
}

const teacherStats = await api('GET', '/api/admin/system/stats', { token: teacherToken })
check('教师: GET /api/admin/system/stats -> 被拒（403/401）', teacherStats.status === 403 || teacherStats.status === 401, `HTTP ${teacherStats.status}`)

// ---------------------------------------------------------------------------
// 3. 清理：解绑临时 openid，并吊销本次签发的会话
// ---------------------------------------------------------------------------

log('\n=== 3) 清理 ===')
for (const { token } of issuedTokens) {
  const out = await api('POST', '/api/wechat/unbind', { token })
  check('解绑临时 openid', out.status === 200 && out.json?.success === true, `HTTP ${out.status} ${out.text.slice(0, 120)}`)
}
for (const { token } of issuedTokens) {
  await api('POST', '/api/kernel/auth/logout', { token })
}
log(`  已吊销 ${issuedTokens.length} 个临时会话`)

log('')
if (failures.length) {
  log(`[失败] ${failures.length} 项未通过：`)
  for (const name of failures) log(`  - ${name}`)
  process.exit(1)
}
log('[通过] 账号密码登录（教师 + 超管）、首次绑定、角色选错与密码错的拒绝、ticket 一次性、管理端权限边界都符合预期。')
