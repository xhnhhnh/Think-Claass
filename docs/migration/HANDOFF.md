# 交接文档 · ThinkClass「最小 Core + 无限 Plugins」重构

> **用途**：在**新对话**中接续本重构。本文档是唯一权威入口。
> **生成时间**：第 6 轮结束时
> **工作区**：`D:\think-class`
> **分支**：`refactor/plugin-kernel`
> **HEAD**：`b2a8f7b`
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

新对话要做的第一件事：`git log --oneline -3` 与 `npm test`，确认状态与本文档一致。
**不要相信本文档的叙述，以工作区和命令输出为准。**

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
npm run guard         # 8 条防伪护栏（棘轮）
npm run check         # tsc --noEmit
npm run measure       # 基线度量（死代码/重复/schema 漂移）
npm run api:surface -- --check     # 288 端点必须零漂移
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
| **P4.3b** | **把六个域（及其余域）真正迁成插件** | — | ⬜ **下一步** |
| P4.3c | `api/db.ts` 78 条启动期 DDL → 编号迁移 | — | ⬜ |
| P5 | 前端插件化（注册表驱动路由/菜单/插槽） | — | ⬜ |
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
  bootstrap/createKernel.ts   createKernel({ authProvider, mountPlugins, pluginHost })
  http/kernelRoutes.ts        /api/health, /api/kernel/*
  http/requestContext.ts      Bearer 优先；出示令牌即终局（不回落请求头）
  auth/{password,session,authProvider}.ts
  permissions/permissionEngine.ts + capabilityStore.ts
  logging/{logger,auditLog}.ts
  storage/{connection,migrations,settingsStore}.ts
  events/eventBus.ts

packages/plugin-sdk     definePlugin / manifest 校验 / semver / KernelContext / PLUGIN_CONTEXT
packages/plugin-runtime discovery / resolver / host / boundary / serviceRegistry / dbApi / migrationRunner / stateStore

plugins/classroom       基础插件，required:true，owns students+classes（adopted），
                        发布 classroom.public，声明 19 条 classroom.enable_* 权限
plugins/pet             功能插件参考实现，自有迁移、控制器、端口、事件、权限
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
| `legacyFeatureKeySurfaces` | **1**（原 2）| 0 | 仍硬编码 19 个 `enable_*` 键的文件 |
| `adoptedTables` | 2 | 0 | 仍带旧名的插件自有表 |

其余护栏：G1 插件间只经 `public.ts`、G2 内核不 import 插件、G5 内核零业务知识、G6 contracts 纯类型、G7 manifest 合规、G8 288 端点快照、G9 system settings 双份一致、G10 adopted 表。

**注意**：G8 快照目前只扫 `api/**`。域迁入 `plugins/**` 后，`extractApiSurface` 必须也扫 `plugins/**`，否则端点会从快照里"消失"而不报错。

---

## 7. 当前验证状态（HEAD = b2a8f7b）

```
npm test        114 文件 / 437 用例全绿
                app 235 · backend 175 · guardrails 27
npm run check   exit 0
api:surface     unchanged (288 endpoints)
guardrails      8 文件 / 27 用例
```

---

## 8. 下一步：P4.3b —— 把域真正迁成插件

### 8.1 为什么这是关键一步

P4.3a 只是把 741 行的 `game.controllers.ts` 拆成六个域模块 —— **仍然是 `api/` 里的 Nest 模块，不是插件**。
真正的目标：`plugins/<domain>/{plugin.json, src/}`，由插件运行时装配。

### 8.2 迁一个域需要做的四件事

以 `economy` 为例（建议先做它：表少、无跨域写）：

1. **建 `plugins/economy/plugin.json`**
   - `tier: "feature"`，`required: false`，`isolation: "restricted"`
   - `entry.backend: "./src/index.ts"`
   - `provides.routes`: `base: "/api/economy"`（`compat` 可留空，路径不变）
   - `provides.migrations`: 若域有自有表
   - `provides.events` / `provides.permissions`: 按需
   - `data.adopted`: **该域现在拥有的旧表**（`bank_accounts`, `stocks`, `student_stocks`）
   - `dependsOn: { "classroom": "^1.0.0" }`（因为它要做功能开关与班级校验）

2. **把 service / repository / controllers / types 移入 `plugins/economy/src/`**
   - `import { ApiError } from '../../utils/apiError.js'` → `import { ApiError } from '@thinkclass/kernel'`
   - `import db from '../../db.js'` → 用 `ctx.db`（所有权受检）
   - `import { getRequestActor } from '../../utils/requestAuth.js'` → `getRequestContext(req)`（kernel）
   - `import { ok } from '../../utils/apiResponse.js'` → 保持，或移入 SDK

3. **功能开关改走端口**（当前是**唯一的真实阻塞点**）
   现在：`assertClassFeatureEnabled(classId, 'enable_economy')` —— 来自 `api/utils/classFeatures.ts`，插件不能 import `api/`。
   建议方案（尚未实施，请先设计再动手）：
   - 给 `ClassroomPort` 增加 `assertClassFeatureEnabled(classId, feature)` / `assertStudentFeatureEnabled(studentId, feature)` / `getClassFeatures(classId)`
   - **但**：`classroom` 插件的端口在 **legacy 组装下不会运行**（插件只在 kernel 组装下挂载），而 legacy 是默认且回滚目标 → 必须先解决"legacy 也挂载插件"
   - 另一条更小的路：给 `PermissionEngine` 加 `fallback(scopeType, scopeId, key)` 钩子，由 `api/` 注册"读 `classes.enable_*` 列"的回退（内核保持零业务知识），插件只调用 `ctx.permissions.can(...)`

4. **`api/modules/<domain>/` 整个删除，`app.module.ts` 移除该模块**
   **但**：端点必须仍然存在 → 见 8.3

### 8.3 必须一起解决的结构问题：legacy 组装也要挂载插件

现在 `createLegacyApp()` 只挂内核基础设施，不运行插件宿主。域一旦迁成插件，legacy 模式下这些端点就消失了（288 端点快照会失败）。

**难点**：插件宿主会创建**自己的 Nest 实例**并 `nest.init()`，而 Nest 的 not-found 是 catch-all `use` —— 先注册会遮蔽 legacy 路由，后注册则插件路由被 legacy 的 not-found 遮蔽。

**推荐方案**：让插件宿主支持 `mountControllers: false`，改为把插件模块合并进**同一个** Nest 根模块：

```ts
const Root = class {};
Module({ imports: [AppModule, ...pluginModules] })(Root);   // 注意：副作用式，返回 undefined
NestFactory.create(Root, new ExpressAdapter(server), { abortOnError: false })
```

这样全进程只有一个 Nest 实例、一个 not-found、顺序天然正确。
`packages/plugin-runtime/src/host.ts` 的 `mountPluginControllers()` 需要拆成"收集"与"挂载"两半。

### 8.4 迁移顺序建议

1. `economy`（试点，验证 8.3 的方案）→ 跑通后再批量
2. `dungeon`、`gacha`、`slg`、`battles`、`challenge`
3. `learning`（最大，28 张表）、`marketplace`、`engagement`、`collaboration`、`insights`、`portal`、`platform`
4. `classroom` 的 HTTP 面（目前只有端口，端点仍在 `api/modules/classroom`）
5. `auth` → `identity` 基础插件；`settings`/`system` → 内核

### 8.5 每个域完成后必须验证

```bash
npm run check && npm test && npm run api:surface -- --check && npm run guard
```
外加**真实启动探测**：`KERNEL_ENABLED=1 PLUGINS_ENABLED=1 npx tsx api/server.ts`，确认该域路由 200/403（不是 404），且 `/api/kernel/plugins` 列出它。

---

## 9. 后续阶段要点（提前知道，避免走错）

### P4.3c · `api/db.ts` 启动期 DDL
- 78 条 `CREATE TABLE` + `addColumnIfNotExists` + 表重建（`messages_new`）需收编为编号迁移
- `db.ts` 最终只保留连接与 PRAGMA
- 注意 `payment_orders`/`payment_transactions` 只存在于 Prisma，`messages_new` 只存在于原始 SQL

### P5 · 前端插件化
- 删掉 62 个一行 shim（`src/features/*/pages/*`），把真实 UI 从 `src/pages/<Role>/` 移入插件
- `AppRoutes.tsx` 的 80 个 `<Route>` → 注册表驱动 + `import.meta.glob` 组件映射 + 服务端下发的路由清单
- 4 个布局的硬编码菜单（Teacher 25 / Student 22 / Admin 10 / Parent 6 项）→ `MenuRegistry`
- `src/lib/classFeatures.ts` 的 19 键 → 从插件 manifest 派生（这会把 `legacyFeatureKeySurfaces` 降到 0）
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
| 4 | G8 端点快照只扫 `api/**`，域迁入 `plugins/**` 后必须扩展扫描范围 |
| 5 | kernel 模式下未匹配的 `/api` 路径由 Nest 的 not-found 应答，不是内核信封 |
| 6 | `system_settings` 默认值在前后端各一份（G9 强制一致），P4/P5 应合为插件声明 |
| 7 | `DEFAULT_SYSTEM_SETTINGS` 是 G9 保护的"受控重复"，不是疏忽 |
| 8 | 定时任务（`provides.jobs`）在启动时被**明确拒绝**并给出原因 —— 不是静默忽略；调度器属 P6 |

---

## 11. 工作方式约定（前几轮有效的做法）

- **每轮交付一个可验证的完整片段**，跑完 `check + test + surface + guard` 再提交
- **不要相信叙述**：先读工作区、跑命令
- **测试失败优先查是不是真 bug**：前几轮 10+ 个真实缺陷都是端到端测试逼出来的（凭据降级、审计外键、`boundary.run` 无法区分空返回与异常、`^1` 无法解析、插件目录被扫两遍……）
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
| `tests/guardrails/` | 8 条护栏 + 棘轮额度 |
| `scripts/migration/spikes/nest-dynamic-controllers.mjs` | R10 证据（判断 Nest 能否动态装配时先跑它） |
