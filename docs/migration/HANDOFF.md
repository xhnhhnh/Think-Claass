# 交接文档 · ThinkClass「最小 Core + 无限 Plugins」重构

> **用途**：在**新对话**中接续本重构。本文档是唯一权威入口。
> **生成时间**：第 6 轮结束时（P4.3b.0 已按 §11 的规矩复核并修正）
> **工作区**：`D:\think-class`
> **分支**：`refactor/plugin-kernel`
> **HEAD**：以 `git log --oneline -1` 为准。撰写时为 `d69098e`；P4.3b.0 开工时核实到实际 HEAD 是 `eab37e4`
> （**本文档 §7 当时写的 `b2a8f7b` 已经落后两个提交** —— 这正是不要盲信本文档的理由之一，见 §0 反面教材）。
> **目标**：把现有前端、后端、数据库与整体架构重构为真正的 `Core → Plugin Runtime → Plugin API/SDK → Plugins`

---

## 0. 新对话怎么用这份文档

把下面这段直接粘进新对话的第一条消息即可（它会触发目标模式）：

```
请阅读 D:\think-class\docs\migration\HANDOFF.md 并严格按其中的「下一步」继续执行。
工作区是 D:\think-class，分支 refactor/plugin-kernel。
这是一个跨多轮的长期重构目标，请创建长期目标并持续推进：
按照 docs/migration/ 下的方案，把 ThinkClass 重构为「最小 Core 内核 + 无限 Plugins」架构，
完成 P4.3b 之后的所有剩余阶段（P4.3b/P4.3c/P5/P6/P7），每轮交付一个可验证的完整片段。
```

---

### ⚠️ 第一条规矩：先验证，再行动。不要相信本文档的叙述

**本文档是上一个会话写的，可能是错的、过时的、或只说了它以为发生的事。**
工作区、`git` 历史和命令输出才是事实。**文档与事实冲突时，永远以事实为准，并顺手修正文档。**

新对话开工前，先跑这三条，用输出核对本文档的「现状」与「验证状态」两节：

```bash
cd D:\think-class
git log --oneline -3          # 核对提交历史与 HEAD
git status --short            # 核对有无未提交的半成品
npm test                      # 核对我声称的 114 文件 / 437 用例
```

**如果 `git status` 不是干净的，很可能上一轮被中断在半途 —— 优先判断那是「已完成但未提交」还是「改坏了」，再决定继续还是回退。**

#### 为什么要把这条写在这里：一个真实的反面教材

本文档撰写的那一轮，最后一个工具调用被用户中断了。当时的**叙述**是：

> 「现在删除 `api/modules/game` 目录，然后跑类型检查」

如果新会话相信这段叙述，它会以为：删除动作没做、类型检查没跑、下一步就是重做这两件事。

而**实际状态**是：目录早就删掉了，六个新模块也已生成；真正没做的是验证 —— 而验证一跑就暴露出**两个叙述里一个字都没提的真实缺陷**（一个六个控制器共用的 `ok()` helper 没能跟着拆分走、一个相对 import 因目录上移而失效并静默废掉了 `instanceof` 收窄）。

结论：**叙述记录的是"打算做什么"，工作区记录的是"实际发生了什么"，两者经常不一致。** 这一条适用于本重构的每一轮，也适用于你正在读的这份文档。

#### 发现文档与事实不符时怎么办

1. **以事实为准**执行，不要为了"符合文档"去改回代码
2. **顺手把文档改对** —— 过时的交接文档比没有文档更危险
3. 把差异写进当轮的提交信息，让下一个人看得到

---

## 1. 一句话现状

**P0–P4.3a 已完成并全部验证。** 内核、插件运行时、SDK、两个参考插件、能力系统、审计下沉、`game` 上帝模块拆分都已落地。
**剩余**：把其余后端域真正迁成插件（P4.3b）、把 `api/db.ts` 启动期 DDL 收编（P4.3c）、前端插件化（P5）、运行期安装（P6）、清理（P7）。

---

## 2. 环境约束（重要）

| 项 | 状态 |
|---|---|
| 网络 | **完全不可用**（npm registry / github 均 TLS 失败）。**不能 `pnpm install` 或加依赖。** |
| node_modules | 已从源仓库复制，可用 |
| 测试 | `npm test` 正常。此前沙箱受限时需要提权，当前文件策略为 full-access，直接跑即可 |
| 原始仓库 | `D:\ThinkClass\Think-Claass-main`（只读参照，未改动） |
| 工具链 | node v24.16.0 / npm 12.0.2 / pnpm 11.5.2 |

---

## 3. 常用命令

```bash
npm test              # 全部：app + backend + guardrails
npm run test:app      # 前端 + 遗留 api/** 套件（jsdom + MSW）
npm run test:backend  # kernel + plugin-runtime + plugins（node）
npm run guard         # 13 组防伪护栏（棘轮，43 用例）

npm run class-features:check   # 前端功能开关目录是否与插件 manifest 一致
npm run check         # tsc --noEmit
npm run measure       # 基线度量（死代码/重复/schema 漂移）
npm run api:surface -- --check     # 292 条端点必须零漂移（含 plugins/**）
npm run spike:nest    # R10 技术验证（8/8）
```

---

## 4. 阶段状态

| 阶段 | 内容 | 提交 | 状态 |
|---|---|---|---|
| P0 | 基线冻结 + 8 条护栏 | `f580511` | ✅ |
| P1 | 最小内核 + 工作区骨架 + R10 定论 | `d8d1d72` | ✅ |
| P2 | 契约收口（`src/shared` → `packages/contracts`）+ 真实会话认证 | `87b0233` | ✅ |
| P3 | 插件运行时 + SDK + `pet`/`classroom` 参考插件 | `9f40aae` | ✅ |
| P4.1 | 能力系统（替换 19 个 `enable_*` 列） | `a455753` | ✅ |
| P4.2 | 审计下沉（描述符注册表 + 内核 sink） | `5891754` | ✅ |
| P4.3a | 拆 `game` 上帝模块为六个域模块 | `b2a8f7b` | ✅ |
| P4.3b.0 | **结构前置**：legacy 组装也能挂载插件 + 扫描/护栏补盲区 | `bd613f8` | ✅ |
| P4.3b.1 | **`economy` 迁成插件**（首个域，模板） | `3296a41` | ✅ |
| P4.3b.2 | **`dungeon`/`gacha`/`slg`/`battles`/`challenge` 五个域批量迁成插件** | `a844e01` | ✅ |
| P4.3b.3 | **`collaboration`/`marketplace` 迁成插件** | `4279ea7` | ✅ |
| P4.3b.4 | **`portal` 迁成插件** + 修 dbApi 正则误判 | 见 `git log` | ✅ |
| **P4.3b.5** | **剩余域**：`insights`/`engagement`/`platform`（见下方"platform 不是干净域"）/`learning` | — | ⬜ **下一步** |
| P4.3b.6 | `classroom` 的 HTTP 面 + `pet` HTTP 面补全 + `auth`→`identity` + `settings`/`system` | — | ⬜ |
| P4.3c | `api/db.ts` 启动期 DDL → 编号迁移 | **进行中**（见下） | 🔶 |
| P4.3c.1 | **787 行启动 DDL 收编为 `0000_legacy_boot_schema` 迁移** | `b63c74d` | ✅ |
| P4.3c.2 | **两套组装共用同一份 DDL**（删掉 `adoptedTables.ts` 的重复定义） | 见 `git log` | ✅ |
| P4.3c.3 | 按域拆分 migration（让 kernel-only 部署不再建业务表） | — | ⬜ |
| P5 | 前端插件化（注册表驱动路由/菜单/插槽） | — | 🔶 |
| P5.1 | **19 个 `enable_*` 前端硬编码表 → 从插件 manifest 生成** | 见 `git log` | ✅ |
| P5.2 | 62 个转发 shim → 真实 UI 移入插件；`AppRoutes` 的 80 条 Route → 注册表驱动 | — | ⬜ |
| P5.3 | 4 个布局的硬编码菜单 → `MenuRegistry`；`window.__TC_CONFIG__` 取代部署期 `sed` | — | ⬜ |
| P6 | 运行期安装/升级/第三方隔离 | — | ⬜ |
| P7 | 清理（死代码、19 列、兼容层、文档） | — | ⬜ |

逐阶段详细记录见 `docs/migration/00-baseline.md` … `04-capabilities-and-domains.md`。

---

## 5. 已建成的架构（可复用，不要重造）

```
packages/contracts      纯类型共享词汇（G6 强制零运行时代码）
  src/http.ts           ApiSuccess/ApiFailure/PageResult/HealthStatus
  src/identity.ts       Actor / Role / ScopeRef / PermissionDeclaration
  src/events.ts         EventContracts（已含 classroom.* 与 pet.* 事件）
  src/services.ts       ServiceContracts：'classroom.public' | 'pet.public'
  src/plugin.ts         PluginManifest（含 data.tables/adopted/reads/capabilities）
  src/domains/*.ts      17 个域的 DTO + ClassroomPort / PetPort

packages/kernel         最小内核
  bootstrap/createKernel.ts   createKernel({ authProvider, mountPlugins, pluginHost, ensureSchema })
                              ↑ `ensureSchema(db)` 是 P4.3b.1 加的一次性桥：插件只能建 `p_<slug>_`
                                表，被 adopted 的旧表必须由宿主建，否则 kernel 组装下插件能激活但首个请求就挂。
                                P4.3c 把 DDL 收编成编号迁移后这个钩子应删除
  http/kernelRoutes.ts        /api/health, /api/kernel/*
  http/requestContext.ts      Bearer 优先；出示令牌即终局（不回落请求头）
  auth/{password,session,authProvider}.ts
  permissions/permissionEngine.ts + capabilityStore.ts
  logging/{logger,auditLog}.ts
  storage/{connection,migrations,settingsStore}.ts
  events/eventBus.ts

packages/plugin-sdk     definePlugin / manifest 校验 / semver / KernelContext / PLUGIN_CONTEXT
                        PermissionsApi.assignedTo(scopeType, scopeId, key) ← P4.3b.1 加，只允许读
                        本插件自己声明的 key（否则可枚举别的插件的能力指派，违反 G1）
packages/plugin-runtime discovery / resolver / host / boundary / serviceRegistry / dbApi / migrationRunner / stateStore
                        host.ts 现在拆成「收集模块」与「挂载」两半：
                          buildPluginModule() 每个插件一个 Nest 模块 → host.modules
                          options.mountControllers: 'host'(默认) | 'external'
                        'external' = 宿主只收集，由调用方并进自己的 Nest 根模块（api/app.ts 用）

api/schema/adoptedTables.ts  adopted 表的**唯一**权威定义（students/classes/records/
                             bank_accounts/stocks/student_stocks）。api/db.ts 调它、不再自己定义；
                             测试也调它 —— 两份定义会静默漂移：capability 回落是按列名读
                             `classes.enable_*` 的，缺列会让每个班都"功能已关闭"而不报错

plugins/classroom       基础插件，required:true，owns students+classes+records（adopted），
                        发布 classroom.public，声明 19 条 classroom.enable_* 权限
                        classroom.public 端口（迁移的公共依赖）：
                          getStudentById / getClassById / listClassStudents / assertStudentInClass
                          adjustPoints（total+available 同时动，发事件）
                          transferStudentCredits（只动 available，余额不足返回 refusal）
                          recordStudentLedgerEntry（共享流水 records 的唯一写入口）
                          checkStudentFeature / checkClassFeature（能力指派优先，回落旧列）
                        拒绝用返回值表达：ClassroomResult<T> = { value?, refusal? }
plugins/pet             功能插件参考实现，自有迁移、控制器、端口、事件、权限
                        注意：HTTP 面**不完整**（4/19 端点），与 api/modules/pet 有 1 条路由碰撞
plugins/economy         P4.3b.1 首个迁出的真实域，20 个端点，是后续域的模板
```

### 关键机制（改代码前务必理解）

- **声明即许可**：未声明的事件/路由/表访问会在调用点失败（fail-closed）。
- **`data.adopted`**：插件可拥有"仍带旧名"的表。护栏 **G10** 棘轮其数量（当前 2）到 0。
- **插件集合是启动的输入**：R10 已证明 Nest 可运行期装配控制器，但 `container.addModule()` 不注册控制器、也没有可用的移除路径 → **启停/装卸一律重启**。
- **`Module()` 装饰器返回 `undefined`**（副作用式），普通调用时不要用它的返回值。
- **`abortOnError` 默认 true**，会 `process.exit(1)` 吞掉真实原因 → Nest 启动必须传 `abortOnError: false`。
- **`Migration.up` 可以是函数**（SQLite 没有 `ADD COLUMN IF NOT EXISTS`），校验和覆盖函数源码。
- **前端不能 import `@thinkclass/kernel`**（会把 express/better-sqlite3 打进浏览器包）。

---

## 6. 护栏与棘轮（只能降，不能升）

`tests/guardrails/lib/allowances.json`：

| 键 | 当前 | 目标 | 含义 |
|---|---|---|---|
| `shimPages` | 62 | 0 | 插件树里的一行转发 shim（"假插件化"） |
| `deadCode` | 70 | 0 | 应用不可达文件 |
| `staticPluginRoutes` | 76 | 0 | 路由表里静态 import 的插件页面 |
| `legacyFeatureKeySurfaces` | **0** ✅（原 2 → 1 → 0）| 0 | 仍硬编码 19 个 `enable_*` 键的文件 |
| `adoptedTables` | 2 | 0 | 仍带旧名的插件自有表 |
| `routeCollisions` | **1 → 0**（P4.3b R1 新增）| 0 | 同一 METHOD+PATH 被两个控制器文件声明 |

其余护栏：G1 插件间只经 `public.ts`、G2 内核不 import 插件、G5 内核零业务知识、G6 contracts 纯类型、G7 manifest 合规、G8 端点快照、G9 system settings 双份一致、G10 adopted 表、**G11 路由碰撞**。

### ⚠️ 快照的两个盲区（P4.3b R1 已修，务必知道）

`api:surface` 原本只扫 `api/**`。域一旦迁进 `plugins/**`，端点会从快照里"消失"而不报错（§7 的陷阱）。现在 `extractApiSurface` 同时扫 `api` 与 `plugins`，扫完立刻就"凭空"多出 4 条 `plugins/pet` 的端点 —— **这说明原来的 288 是在漏扫，不是真实的 288**。修正后快照为 **292**。

第二个盲区更隐蔽：快照比较的是 **METHOD+PATH 的集合**，所以"两个控制器声明同一条路由"完全不可见 —— 而半成品迁移产生的正是这个状态（模块还在 `api/`，插件已经在服务同样的路径），只有先注册的那个可达，另一个是没有任何测试会发现的死代码。新增 **G11** 棘轮（`routeCollisions`，当前 1）专治此症；当前那 1 条就是 `plugins/pet` 与 `api/modules/pet` 同时声明了 `GET /api/pet/students/:studentId`。

**注意**：G8 快照目前只扫 `api/**` —— 该句已过时，扫描范围已扩到 `plugins/**`。

---

## 7. 当前验证状态

**下面是 P4.3b.4 完成时（HEAD 见 `git log -1`）跑出来的数字。**
**它一定会随每一轮变化 —— 请用 §0 的三条命令重新跑一遍，把输出当成本节的真实内容。**

```
npm test        113 文件 / 567 用例全绿
npm run check   exit 0
api:surface     unchanged (292 endpoints)
guardrails      11 文件 / 43 用例
```

**已迁成插件的域（11 个）**：economy, dungeon, gacha, slg, battles, challenge, collaboration, marketplace, portal（+ 原有 classroom, pet）
**仍在 `api/modules/` 的域（10 个）**：admin, auth, classroom, engagement, insights, learning, pet, platform, settings, system

**验收基线**：

| 指标 | 期望 | 变了说明什么 |
|---|---|---|
| `api:surface` 端点数 | **292** | 迁移期间**不应变化**。变小 → 扫描漏了插件；变大 → 多出端点 |
| `deadCode` | **66** | 每迁完一个域应继续下降：删掉旧模块（含死的 `*.repository.prisma.ts`）就该降 |
| `shimPages` | 62 | P5 之前不应变化 |
| `legacyFeatureKeySurfaces` | **0** | P5.1 已达成；G14 保证它不会回升 |
| `adoptedTables` | **26** | 每迁一个域会上升，P7 改名后归零。**`records` 不计入**（永久共享） |
| `routeCollisions` | **1** | 只剩 `plugins/pet` 与 `api/modules/pet` 的碰撞（见 §8.3.1）。每迁完一个域必须回落 |

### ⚠️ `platform` 不是一个干净的功能域（迁移前必读）

`api/modules/platform` 的 4 条路由里，**3 条是支付基础设施**（`POST /api/payment/create`、`GET /api/payment/status/:orderNo`、`POST /api/payment/notify`），
依赖 `api/services/paymentService.ts`、`api/services/paymentProviders/**`、`prisma.settings`（`payment_environment`）。
只有 `POST /api/parent-buff` 是业务（写 `parent_activity`）。

**按"一个域一个插件"机械迁移会把 `api/services/**` 一起拖进插件**，那是把基础设施当业务迁。
建议的拆法（尚未实施）：
- `parent-buff` → 一个 feature 插件（`data.adopted: ['parent_activity']`，`dependsOn: classroom`）
- `payment/*` → 归内核/平台侧（它读 `settings` 与 `payment_orders`，且 `payment_orders`/`payment_transactions` **只存在于 Prisma**，见 §9 P4.3c 注意事项）

**批量迁移的实测经验（P4.3b.2，五个域并行）**：
- **`api:surface -- --check` 的括号数字在迁移中途会是"虚高"的**（如 345），因为它打印的是**声明条数**，而判定用的是**集合**。旧模块与插件并存期间每条路由声明两次。**别把它当成漂移**，要看 `added`/`removed` 是否为空；删掉旧模块后自然回到 292。
- **G11 路由碰撞数 = 各新插件声明数之和**（本次峰值 54），删旧模块后回落。这是迁移中途的正常中间态。
- 五个域并行时**共享文件（`app.module.ts`、`allowances.json`、`api/schema/adoptedTables.ts`）必须由一个人独占改**，否则互相覆盖。

### 迁移一个域的标准动作（P4.3b.1 实证后的清单）

1. 建 `plugins/<slug>/plugin.json` + `src/`
2. **plugin.json 关键字段**：`tier:"feature"`、`required:false`、`isolation:"restricted"`、`dependsOn:{classroom:"^1.0.0"}`、`data.adopted:[该域的旧表]`、`provides.routes[]`
3. 旧的 repository 改吃 `ctx.db`（`DbApi`），service 改吃端口 + repository
4. `ApiError` 从 `@thinkclass/kernel` 取（**不是** `api/utils/apiError.ts`）
5. 删 `api/modules/<slug>/` + 从 `app.module.ts` 移除（**必须同一次提交**，否则 G11 会多一条碰撞、端点数也会翻倍）
6. 测试搬到 `tests/plugins/<slug>-service.test.ts`（backend 项目，node 环境）
7. `plugins/<slug>/src/economy.service.test.ts` 那种直接放在插件目录里的测试**不会被任何 vitest 项目收集** —— 放 `tests/plugins/`

---

## 8. 下一步：P4.3b —— 把域真正迁成插件

### 8.1 为什么这是关键一步

P4.3a 只是把 741 行的 `game.controllers.ts` 拆成六个域模块 —— **仍然是 `api/` 里的 Nest 模块，不是插件**。
真正的目标：`plugins/<domain>/{plugin.json, src/}`，由插件运行时装配。

### 8.2 迁一个域要做的四件事（`economy` 已按此完成，照抄即可）

1. **建 `plugins/<slug>/plugin.json`**
   - `tier:"feature"`、`required:false`、`isolation:"restricted"`
   - `dependsOn:{ "classroom": "^1.0.0" }`（要做功能开关/班级校验就必须）
   - `data.adopted`: **该域拥有的旧表**（不能写 `data.tables` —— 校验器只放行 `p_<slug>_` 前缀）
   - `provides.routes[]`、`provides.events`

2. **把 repository / service / controllers / types 移入 `plugins/<slug>/src/`**
   - repository 改吃 `ctx.db`（`DbApi`，所有权受检），不再 `import db from '../../db.js'`
   - `ApiError` 改从 `@thinkclass/kernel` 取（**不要**用 `api/utils/apiError.ts`：那是另一个类，`instanceof` 不成立）
   - `ok()` 这类纯 helper 可以复制进插件（本来就只有 3 行）

3. **功能开关与跨域数据一律走 `classroom.public` 端口**
   端口现已提供（P4.3b.1 加的）：
   - `getStudentById` / `getClassById` / `listClassStudents` / `assertStudentInClass`
   - `adjustPoints`（同时动 total+available，发事件）
   - **`transferStudentCredits({studentId,delta,reason,actorId})`** —— 只动 available，余额不足返回 refusal（不抛异常）
   - **`recordStudentLedgerEntry({studentId,type,amount,description})`** —— 共享积分流水 `records` 的唯一写入路径
   - **`listStudentLedger(studentId,limit?)`** —— 读某学生流水（新→旧）
   - **`sumClassPointsEarnedSince(classId,since)`** —— 某班某时刻后 `ADD_POINTS` 合计（需要 `students` join，只有 classroom 能做）
   - **`checkStudentFeature(studentId,feature)` / `checkClassFeature(classId,feature)`** —— `enable_*` 开关，先查能力指派再回落 `classes.enable_*` 列
   - **`getStudentByUserId(userId)`** —— 请求 actor 只带 `userId`（session 与 legacy 头桥都不填 `studentId`），按 actor 控制的开关必须靠它
   - **`searchClasses(query?,excludeClassId,limit?)`** —— 班级名模糊搜索；**有 query 时默认无 LIMIT，无 query 时默认 10**（与迁移前两个分支各自的行为一致）

   **端口用返回值表达拒绝，不抛异常**：`ClassroomResult<T> = { value?: T; refusal?: ClassroomRefusal }`。
   为什么不抛异常、也不用 `{ok:true}|{ok:false}` 判别联合：contracts 是**纯类型**（G6 禁止运行时类），而且本项目 `strict:false` 下 TS 会把布尔字面量判别符**拓宽成 `boolean`**，判别联合根本不收窄 —— 已用本地类型实测确认。所以用可选判别符，调用方判 `if (result.refusal)`。

4. **删 `api/modules/<slug>/` + 从 `api/app.module.ts` 移除**
   **必须与新增插件同一次提交**：两者并存会产生 N 条路由碰撞（G11 报警）且端点数翻倍。
   删完 `deadCode` 应下降，把它在 `allowances.json` 里调低。

**注意**：插件目录里自带的 `*.test.ts` **不会被任何 vitest 项目收集** —— 测试放 `tests/plugins/`（backend 项目，node 环境，无 jsdom/MSW）。


### 8.3 必须一起解决的结构问题：legacy 组装也要挂载插件 —— ✅ P4.3b.0 已解决

**问题**：`createLegacyApp()` 原来只挂内核基础设施、不跑插件宿主。域一旦迁成插件，legacy 模式下这些端点就消失了（端点快照会失败）。而 legacy 是默认且回滚目标，所以不解决它就无法迁任何域。

**实际采用的方案**（与本文档早先的推荐方案略有出入，以代码为准）：

1. `createPluginHost()` 新增 `mountControllers: 'host' | 'external'`（默认 `'host'`）。
2. 原来内联在 `mountPluginControllers()` 里的模块构造拆成 `buildPluginModule()`（每个插件一个模块），宿主把结果放进 `host.modules`。
3. `api/app.ts` 的 `mountPlugins()` 现在**两种组装都会跑**；legacy 时传 `mountControllers: 'external'`，宿主只收集不挂载。
4. `createLegacyRootModule()` 把 `AppModule` 与 `host.modules` 一起塞进**同一个** Nest 根模块：

```ts
const Root = class {};
Module({ imports: [AppModule, ...pluginModules] })(Root);   // Module() 副作用式，返回 undefined
NestFactory.create(Root, new ExpressAdapter(server), { bodyParser: false, abortOnError: false })
```

全进程只有一个 Nest 实例、一个 not-found、顺序天然正确。

**为什么不是"宿主自己挂到 express 上"**：宿主自建 Nest 实例会再装一个 catch-all not-found，先注册的那个会把另一个的路由全部遮蔽 —— 这正是原来的设计在 legacy 下不可用的原因。

**验证方式**（`tests/plugins/legacy-boot-probe.test.ts`）：真的起一个子进程跑 `PLUGINS_ENABLED=1`（不开 `KERNEL_ENABLED`）的 `api/server.ts`，然后打真实 HTTP：

- `/api/kernel/plugins` → 200，列出 `classroom` + `pet`
- `/api/pet/health` → 200（**该路由只存在于插件**，不在 `api/modules/pet`）
- `/api/economy/classes/1/stocks` → 403「该功能当前已关闭」（未迁移模块的业务应答，不是 404）
- `/api/pet/students/999/dashboard` → 404 `Student not found`，而 `/api/pet/nope-not-a-route` → 404 `Cannot GET` —— **同为 404 但 body 不同**，这一条才真正能测出"路由被遮蔽"

`DATABASE_FILE` 已同时被内核配置与 `api/db.ts` 尊重，探针用临时库，不碰开发者的 `database.sqlite`。

### 8.3.1 立刻要还的债（别忘）

- **`plugins/pet` 与 `api/modules/pet` 路由碰撞**（G11 当前那 1 条）。两者都声明 `GET /api/pet/students/:studentId`，只有先注册的可达。
  **但 pet 插件目前不是等价替换**：插件只有 4 个端点，`api/modules/pet` 有 19 个（`/api/pets/**` 9 个 + `/api/pet/**` 10 个），且 `plugins/pet` 的表是 `p_pet_pets`（新命名），旧模块读的是旧 `pets` 表。
  所以**不能**用"删掉旧模块"来解决。正确顺序：先把 `api/modules/pet` 的 19 个端点按原语义补进 `plugins/pet`（含响应形状），再删旧模块，棘轮降到 0。
- 在 `plugins/pet` 补完之前，**不要**在 legacy 组装下开启插件后跑端到端前端流程 —— 那条碰撞路径上只有先注册者生效。
- **`admin.repository.ts` 仍在直接删除各域的表**（走 Prisma `$transaction`，不经 `DbApi` 所以所有权检查管不到）：
  `student_stocks` :434、`stocks` :444、`bank_accounts` :458、`dungeon_runs` :461、`gacha_pools` :525、`student_pets` :473、
  `territories` :523、`class_resources` :526、`class_battles` :514、`challenge_records` :460、`question_bank` :550。
  `DELETE /api/admin/users/:id` 时会级联清理。**迁移到 admin 域时必须改成调各域的端口**，否则"某插件拥有某表"只对插件生效、对 admin 不生效。
- **`records` 的其余写入方**（collaboration/marketplace/engagement/insights/pointsService/classroom）在各自迁移时都要改调 `classroom.public.recordStudentLedgerEntry()`。
  `api/services/pointsService.ts` 是共享 helper（marketplace 在用），它自己也要改。
- **kernel 组装下的"只读 legacy 表"**：`question_bank`（归 system，未迁移）与 legacy `pets`（归 `api/modules/pet`，未迁完）由
  `api/schema/adoptedTables.ts` 的 `ensureReadOnlyLegacyTables()` 建出来。它们**不属于** `data.adopted`（那会给出写所有权）。
  等 `system`/`pet` 迁完后，这两张表应移入各自插件的迁移并从那个列表删除。
- **`pets.attack_power` 无端口访问器**：challenge 通过 `data.reads: ["pets"]` 读它。等 pet 迁移完成后应改为端口方法。
  注意 legacy `pets` 与 `plugins/pet` 的 `p_pet_pets` **是两张不同的表**。
- **`checkStudentFeature` 对"班级行已删"返回 403 `feature-disabled`**，而 legacy 的 `assertClassFeatureEnabled` 抛 404「班级未找到」。
  正常路径一致；只有孤立学生（class 行被删）才有差异。economy/challenge 都受此影响，属已知语义差。

### 8.4 迁移顺序建议

1. ~~`economy`~~ ✅ `3296a41`
2. ~~`dungeon`、`gacha`、`slg`、`battles`、`challenge`~~ ✅ P4.3b.2
3. ~~`collaboration`、`marketplace`~~ ✅ P4.3b.3
4. **`portal`、`platform`（小）、`insights`（3 条路由但读表多）、`engagement`（24 路由，最大）** ← 下一个
5. `learning`（28 张表，最大）
6. `classroom` 的 HTTP 面（目前只有端口，端点仍在 `api/modules/classroom`）
7. `pet` 的 HTTP 面补全 → 删 `api/modules/pet`（解决 G11 那 1 条碰撞；注意**不是**等价替换，见 8.3.1）
8. `auth` → `identity` 基础插件；`settings`/`system` → 内核

**共享文件只有 Lead 改**：`api/app.module.ts`、`allowances.json`、`api/schema/adoptedTables.ts`、`packages/**`。
`plugins/<slug>/**` 与 `tests/plugins/<slug>-*.test.ts` 是每域独占的，可以并行。

**⚠️ 团队名额上限 8（含 Lead），且名字不可复用**：一个会话里最多雇 7 个 teammate，用完无法回收（inactive 也占位）。
批次并行时记住这条：R4 就是因为 6 个旧 teammate 占位，后 4 个域只能串行。

### 8.7 `dbApi` 的 SQL 表名提取器：假阳性会打断合法查询

`packages/plugin-runtime/src/dbApi.ts` 的 `referencedTables()` 用正则从 SQL 里猜表名，猜错有两个方向：

- **假阳性**（把关键字当表名）：`INSERT ... ON CONFLICT DO UPDATE SET col = ?` 里的 `DO UPDATE SET` 长得和 `UPDATE <table>` 一模一样，
  于是 `SET` 被当成表名，**每一条 upsert 都被拒绝**，报错还是极具误导性的
  `plugin "portal" may not write to table "SET"`。这个 bug 由 `plugins/portal` 的首页批量 upsert 首次触发 —— 单元测试全绿（因为都 fake 了 repository），只有真实启动才暴露。
- **假阴性**（漏掉真表名）：会放过一次越权写入，更危险。

现在的实现是「宽松匹配 + 关键字黑名单」：正则只负责抓「动词后面的标识符」，`NON_TABLE_KEYWORDS` 负责剔除关键字。
两条回归测试在 `tests/plugins/isolation.test.ts`（upsert 可通过、DDL 目标仍能解析）。

**教训**：新增域时如果用了此前没出现过的 SQL 形态（upsert / CTE / 子查询 / 复合语句），**必须真启动一次**，不要只跑单测。

### 8.8 `adoptedTables.ts` 的两类坑（P4.3b 期间各踩中多次）

1. **SQL 注释里不能出现反引号**：整个 DDL 是模板字符串，一个反引号就会提前结束它，报错却是 `Expected ")" but found "xxx"`。
   新增护栏 **G12**（`tests/guardrails/ddl-template-literals.test.ts`）会在 2ms 内直接指出行号。
2. **DDL 必须包含所有 `addColumnIfNotExists` 添加的列**：`api/db.ts` 对**已存在**的表用 `ALTER` 补列，
   而 `adoptedTables.ts` 是 kernel 组装下**唯一**的建表者 —— 少一列不会报错，只会让按列名读的回退逻辑静默给出错误答案。
   已实测并核对过的清单（这些列现已全部就位）：
   `classes.enable_*`(19) / `classes.settings` / `classes.invite_code` / `classes.pet_selection_mode`、
   `students.group_id` / `students.last_checkin_date` / `students.birthday`、
   `pets.mood` / `pets.last_fed_at`、`peer_reviews.team_quest_id`、`world_bosses.status`。
   **新增 adopted 表时，务必对照 `addColumnIfNotExists` 全表清单再核对一次**（用 `PRAGMA table_info` 实测，不要靠肉眼）。

### 8.9 剩余域的**具体阻塞点**（2026 轮实测，不是猜测）

| 域 | 阻塞点 | 需要的动作 |
|---|---|---|
| `insights` | 3 条路由但**跨域读 10 张表**：`students`/`classes`/`records`（classroom 所有）+ `exams`/`student_exams`/`student_assignments`/`assignments`/`attendance_records`/`praises`/`leave_requests`（learning/classroom，**均未迁移**），且 `parent_students` 也要读。classroom 目前**没有报表类端口**（只有单人/单班查询） | 先给 `classroom.public` 加班级级聚合端口（或等 learning 迁移后提供），否则 insights 只能靠一堆 `data.reads`，那等于把"跨域读"合法化 |
| `engagement` | ① **写 `pets` 表**（:96 `UPDATE pets SET ... mood = ?`）——`pets` 属 pet 域；② 写 `redemption_tickets`（与 marketplace **双写**，已被 G10 的 `SHARED_WRITE_TABLES` 显式记录）；③ 读 `shop_items` | pet 需发布一个"宠物经验/等级"端口；`redemption_tickets` 需要一个真正的端口（marketplace 拥有？engagement 拥有？）——**这是必须先决定的所有权问题** |
| `platform` | 4 条路由里 3 条是支付基础设施（依赖 `api/services/paymentService.ts`、`paymentProviders/**`、`prisma.settings`），只有 `POST /api/parent-buff` 是业务 | 拆开：`parent-buff` → feature 插件；`payment/*` → 内核/平台侧（`payment_orders`/`payment_transactions` 只存在于 Prisma） |
| `learning` | 10 文件 / 1433 行 / 28 张表，最大 | 单独一轮，不要和别的域混 |
| `admin`/`auth`/`classroom`/`pet`/`settings`/`system` | 见 §8.4 与 §8.3.1 | `auth`→`identity`；`settings`/`system`→内核；`pet`/`classroom` 的 HTTP 面 |

**`redemption_tickets` 的双写是当前最该先解决的结构问题**：它决定 engagement 能不能迁。
现状是 marketplace 与 engagement 都 `data.adopted` 它（`SHARED_WRITE_TABLES` 例外），
这违反了"一张表一个写者"的模型。正确解法是让拥有方（看谁的生命周期更完整：marketplace 有 CRUD，engagement 只在发奖时 INSERT/UPDATE）
发布端口，另一方调用；或者把"兑换券"提升为一个独立的基础插件。

### 8.6 并行迁移的可行性（P4.3b.2 实证）

五个域同时交给五个 agent 是**可行**的，前提是：

| 条件 | 原因 |
|---|---|
| 每域写范围完全独占（`plugins/<slug>/**` + `tests/plugins/<slug>-*.test.ts`） | 无文件重叠 |
| 共享文件由 Lead 独占 | 否则 `allowances.json`/`app.module.ts` 互相覆盖 |
| 契约（`packages/contracts/**`）由 Lead 独占，且**在派活前把端口补齐** | 否则每个 agent 都会自己发明端口形状 |
| 明确告知"不要删旧模块、不要提交、不要跑 `npm test`" | 删除与提交必须与共享文件改动同批 |
| 允许 agent 报"端口缺口"而不是各自绕路 | 本次因此发现 3 个真实缺口（ledger 读、class 搜索、userId→student） |

本次五个 agent 各自独立发现了真实问题：dungeon 发现 `classes` DDL 缺 7 个 `enable_*` 列（kernel 组装下静默 403）、battles 发现我写的 `searchClasses` 给**带过滤**的分支多加了 `LIMIT 10`（legacy 无 LIMIT，属行为回归）、challenge 发现 kernel 组装下 `question_bank`/`pets` 根本不存在导致 500。**这些都不是"实现错误"，而是迁移本身暴露的隐藏耦合** —— 正是让每个 agent 用自己的启动探针验证的价值。

### 8.5 每个域完成后必须验证

```bash
npm run check && npm test && npm run api:surface -- --check && npm run guard
```

外加**真实启动探测**：两种组装各起一次，确认该域路由 200/403（**不是 404**）：

```bash
# kernel 组装
KERNEL_ENABLED=1 PLUGINS_ENABLED=1 npx tsx api/server.ts
# legacy 组装（默认，同样是回滚目标）
PLUGINS_ENABLED=1 npx tsx api/server.ts
```

两者都要能看到 `/api/kernel/plugins` 列出该域。`tests/plugins/legacy-boot-probe.test.ts` 已经把 legacy 这一半自动化了，照着加断言即可。

**并且**：删完旧模块后确认 `routeCollisions` 回到 0（G11）。若没回到 0，说明旧模块没删干净 —— 那条路由只有先注册者可达。

---

## 9. 后续阶段要点（提前知道，避免走错）

### P4.3c · `api/db.ts` 启动期 DDL —— 🔶 进行中

**P4.3c.1 已完成**：`initDb()` 里那 787 行 DDL（79 张表 + 60 个索引）收编为编号迁移：

```ts
export const BOOT_SCHEMA_MIGRATION_ID = '0000_legacy_boot_schema';
export const bootSchemaMigration: Migration = { id: ..., owner: 'legacy', up: `...787 行 SQL...` };
```

- `initDb()` 现在先 `ensureAdoptedSchema(db)`，再 `runMigrations(db, [bootSchemaMigration])`，然后**照旧**每次启动执行 seed 段
  （首页内容、14 条 settings、`addColumnIfNotExists` 兼容列）—— 行为逐字不变。
- **`up` 故意用字符串而不是函数**：字符串迁移的 checksum 取自 SQL 文本，因此代码搬到哪都不会变；
  函数迁移的 checksum 取自 `up.toString()`，一搬家就会让 `runMigrations` **拒绝启动**已迁移的库
  （`migration "x" was modified after it was applied`）。这也是 DDL 仍留在 `api/db.ts` 而不是搬去 `api/schema/` 的原因。
- id 选 `0000_` 是因为排序在 `0001_kernel_settings` 之前 —— 内核表依赖不了业务表，业务表要先进去。
- **实测验证**（不是推断）：
  - 全新库首启：79 张表、ledger 写入 1 行、`pets.mood`/`pets.last_fed_at` 存在；再次启动跳过、不重复执行。
  - **已存在的真实库（13MB 的 `database.sqlite`）**：84 张表（无重复建表）、11 个 users / 3 个 students 行全部保留，
    ledger 补记为 7 条（`0000_legacy_boot_schema` + 5 条 kernel + `p_pet_0001_init`）。
  - legacy 组装真实启动：`/api/website/home`、`/api/shop/items`、`/api/peer-reviews`、`/api/economy/...` 全部正常。

**P4.3c.2 已完成**：两套组装现在共用**同一份** DDL，`api/schema/adoptedTables.ts` **已删除**。

- DDL 移到 `api/schema/legacyBootSchema.ts`（**应用侧**，不是 kernel 包）。
- legacy 组装：`initDb()` 通过 ledger 跑它。
- kernel 组装：`api/app.ts` 用 **`createKernel({ migrations: [bootSchemaMigration] })`** 注入它
  —— 这个注入点在 `CreateKernelOptions` 里本来就有，专为"应用提供自己的迁移"而设。
- `createKernel` 的 `ensureSchema?` 钩子**已删除**（它存在的唯一理由是补 `adoptedTables.ts` 的重复 DDL）。
- 插件唯一能建的表仍是 `p_<slug>_`，插件 manifest 的 `data.adopted` 语义不变。

**关键教训（两次被护栏纠正）**：

1. **G5 是对的**：我先把 DDL 放进了 `packages/kernel/src/storage/`，G5 立刻报 19 个
   `enable_*` 特征键 —— `enable_economy`/`pets`/`dungeon_runs` 是**域知识**，不属于 kernel。
   正确做法是**注入**（应用提供 migration），而不是让 kernel 认识业务表。
   **kernel 零业务知识这条底线，在这次重构里第一次被真正压到，护栏挡住了。**
2. **我引入过一个真实回归**：把 DDL 从 `initDb` 移走后，`classes`/`students`/`records`/`bank_accounts`/
   `stocks`/`student_stocks` 这 6 张表**消失了** —— 因为它们的定义在 P4.3b 时被搬进了 `adoptedTables.ts`
   并由 `ensureAdoptedSchema()` 创建，而 boot DDL 里没有。测试当时**全绿**，因为测试 helper 仍在直接调那个函数。
   现在这 6 张表已并入 `legacyBootSchema.ts`，且**移除了所有直接调用**，所以这类"测试辅助路径掩盖真实缺口"的
   情况不会再发生。
3. **单文件校验不足**：`addColumnIfNotExists` 补的列（`pets.mood`/`pets.last_fed_at`/`peer_reviews.team_quest_id`）
   也必须写进 CREATE —— kernel 组装不跑那段 ALTER。现已补齐，并有检查脚本（见下）。

**验证方式**（含一次性的核对脚本思路，值得保留成测试）：
- `bootSchemaMigration` 单独执行后建出 **78 张表**；所有插件 manifest 声明的
  `adopted`/`reads` 表（31 张）**全部存在**；`classes.enable_*`、`students.group_id`、`pets.mood`、
  `peer_reviews.team_quest_id`、`world_bosses.status` 等列**全部存在**。
- 迁移**搬家的安全性用 ledger 实测**：拿一份"迁移还在 `api/db.ts` 时"产生的真实库，
  比对 checksum —— 搬家前后**完全一致**（`f1888d677c54a07f8d1744bcd4e423a4`），
  这正是字符串迁移（checksum 取自 SQL 文本）而非函数迁移（checksum 取自函数源码）的原因。
- kernel 组装真实启动：**84 张表**、11 个插件全活、零 rejection，
  `/api/website/home`、`/api/peer-reviews`、`/api/challenge/questions` 正常。

**P4.3c.3 待做**：schema 仍是**一整块**，kernel-only 部署会建出全部 78 张业务表。
按域拆分 migration 之后，kernel 才能只建自己需要的表；那也是删除 §8.8 那类漂移风险的最后一步。

- 注意 `payment_orders`/`payment_transactions` **只存在于 Prisma**（不在 `initDb` 的 DDL 里），`messages_new` 只存在于原始 SQL、不在 Prisma。

### P5 · 前端插件化
- 删掉 62 个一行 shim（`src/features/*/pages/*`），把真实 UI 从 `src/pages/<Role>/` 移入插件
- `AppRoutes.tsx` 的 80 个 `<Route>` → 注册表驱动 + `import.meta.glob` 组件映射 + 服务端下发的路由清单
- 4 个布局的硬编码菜单（Teacher 25 / Student 22 / Admin 10 / Parent 6 项）→ `MenuRegistry`
- ~~`src/lib/classFeatures.ts` 的 19 键 → 从插件 manifest 派生~~ ✅ **P5.1 已完成**：
  目录由 `plugins/classroom/plugin.json` 生成（`npm run class-features`），路由映射移到 `src/lib/featureRoutes.ts`，
  `PublicPluginDescriptor` 现在带 `permissionDeclarations`（键 + 标签 + 作用域）。新增 **G14** 保证生成物与 manifest 不漂移。
- 用 `window.__TC_CONFIG__` 取代 `scripts/deploy-common.sh` 里的 `sed /beiadmin`
- 复活从未挂载的 `src/components/ErrorBoundary.tsx`

### P6 · 运行期安装
- `.tcplugin` 打包/校验/签名；`plugins-ext/` 动态 import
- 前端远程 ESM chunk + `window.__TC_SHARED__` 共享 react 单例
- `worker_threads` 隔离（`child_process` 能力已要求 `isolation: "worker"`，manifest 校验器已强制）
- **`in-process-restricted` 不是安全沙箱**，文档必须写明

### P7 · 清理
- 删 `src/api/*`（31 个死文件）、15 个死 hook、7 个 `*.repository.prisma.ts`、`.tmp` 中被跟踪的 71 个文件
- 删除 19 个 `enable_*` 列与兼容层、`api/services/featureService.ts`
- 修正 `docs/modularization-boundary-audit.md` 里关于 `api/routes/registerModules.ts` 的失真描述

---

## 10. 已知遗留与坑

| # | 事项 |
|---|---|
| 1 | `getActiveKernel()` 是**服务定位器**（因 `AuthService` 由静态 Nest 工厂实例化，无构造器接缝）。identity 插件应消掉它 |
| 2 | `api/modules/auth/legacyAuthProvider.ts` 是临时 `AuthProvider` 实现，P4 后由 `identity` 插件取代 |
| 3 | 只有调用 `requireActorRole` 的路由受保护；多数路由直接读 `actor.id`。系统性授权随插件权限声明落地 |
| 4 | ~~G8 端点快照只扫 `api/**`~~ → **P4.3b.0 已修**：扫描范围已含 `plugins/**`；快照从 288 更正为 292（原数字是漏扫） |
| 5 | kernel 模式下未匹配的 `/api` 路径由 Nest 的 not-found 应答，不是内核信封 |
| 6 | `system_settings` 默认值在前后端各一份（G9 强制一致），P4/P5 应合为插件声明 |
| 7 | `DEFAULT_SYSTEM_SETTINGS` 是 G9 保护的"受控重复"，不是疏忽 |
| 8 | 定时任务（`provides.jobs`）在启动时被**明确拒绝**并给出原因 —— 不是静默忽略；调度器属 P6 |

---

## 11. 工作方式约定（前几轮有效的做法）

- **每轮交付一个可验证的完整片段**，跑完 `check + test + surface + guard` 再提交
- **不要相信叙述 —— 包括本文档、上一轮的总结、和你自己上一轮的打算**（见 §0 的反面教材）：
  先读工作区、跑命令；文档与事实冲突时以事实为准，并顺手把文档改对
- **测试失败优先查是不是真 bug**：前几轮 10+ 个真实缺陷都是端到端测试逼出来的（凭据降级、审计外键、`boundary.run` 无法区分空返回与异常、`^1` 无法解析、插件目录被扫两遍、六个控制器共用的 `ok()` helper 没跟着拆分走……）
- **工具调用被中断时，第一件事是核实真实状态**，不要按"它应该做到哪一步"继续往下做
- **棘轮只能降**：修好一处就把 `allowances.json` 调低，进度才可见
- **提交信息写清"为什么"**，尤其是与直觉相反的设计约束（如 `Module()` 返回 undefined）

---

## 12. 主要产出文件索引

| 文件 | 内容 |
|---|---|
| `docs/migration/00-baseline.md` | 基线度量、4 个既有测试失败、护栏清单 |
| `docs/migration/01-kernel.md` | 内核、工作区、R10 定论（三条硬约束） |
| `docs/migration/02-contracts-and-auth.md` | 契约收口、会话认证、凭据降级修复 |
| `docs/migration/03-plugin-runtime.md` | 插件运行时全貌、10 个缺陷 |
| `docs/migration/04-capabilities-and-domains.md` | 能力系统、审计下沉、`game` 拆分 |
| `scripts/migration/lib/analysis.mjs` | 所有度量的单一实现 |
| `tests/guardrails/` | 11 条护栏（G1–G13）+ 棘轮额度 |
| `scripts/migration/spikes/nest-dynamic-controllers.mjs` | R10 证据（判断 Nest 能否动态装配时先跑它） |
