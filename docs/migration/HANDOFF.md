# 交接文档 · ThinkClass「最小 Core + 无限 Plugins」重构

> **用途**：在**新对话**中接续本重构。本文档是唯一权威入口。
> **生成时间**：第 8 轮结束时（P4.3b.6 完成：`pet` 域真正迁成插件，`routeCollisions` 归零）
> **工作区**：`D:\think-class`
> **分支**：`refactor/plugin-kernel`
> **HEAD**：以 `git log --oneline -1` 为准。本轮开工时核实到 HEAD 是 `36bb89d`（上一轮的 P4.3c.3a）。
> **目标**：把现有前端、后端、数据库与整体架构重构为真正的 `Core → Plugin Runtime → Plugin API/SDK → Plugins`

---

## 0. 新对话怎么用这份文档

把下面这段直接粘进新对话的第一条消息即可（它会触发目标模式）：

```
请阅读 D:\think-class\docs\migration\HANDOFF.md 并严格按其中的「下一步」继续执行。
工作区是 D:\think-class，分支 refactor/plugin-kernel。
这是一个跨多轮的长期重构目标，请创建长期目标并持续推进，不要每轮停下等我确认：
按照 docs/migration/ 下的方案，把 ThinkClass 重构为「最小 Core 内核 + 无限 Plugins」架构，
每轮交付一个可验证的完整片段。

开工前先跑 git log --oneline -3 / git status --short / npm test 核对真实状态，
不要相信文档的叙述；文档与事实冲突时以事实为准，并顺手把文档改对。
每轮提交前必须跑通 check + test + api:surface --check + guard。
```

> **上面这段刻意不写任何阶段名和数字。** 早先的版本写死了「完成 P4.3b/P4.3c/P5/P6/P7」
> 和「端点必须是 288」，结果另一个对话在同一工作区把 P4.3b 与 P5 大半做完后，
> 这段提示词当场变成误导 —— **提示词只写不变的规则，状态一律由本文档承载。**
> 更完整的版本见同目录 `BOOTSTRAP_PROMPT.md`。

---

### ⚠️ 第一条规矩：先验证，再行动。不要相信本文档的叙述

**本文档是上一个会话写的，可能是错的、过时的、或只说了它以为发生的事。**
工作区、`git` 历史和命令输出才是事实。**文档与事实冲突时，永远以事实为准，并顺手修正文档。**

新对话开工前，先跑这三条，用输出核对本文档的「现状」与「验证状态」两节：

```bash
cd D:\think-class
git log --oneline -3          # 核对提交历史与 HEAD
git status --short            # 核对有无未提交的半成品
npm test                      # 核对 §7 声称的用例数（那个数字每轮都在变）
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

**P0–P4.3b.10 已完成并全部验证。** 内核、插件运行时、SDK、能力系统、审计下沉、`game` 上帝模块拆分都已落地。
**P4.3b 已迁走 20 个域**：P4.3b.6b 迁走 `classroom` 的整个 HTTP 面（47 条）与 `learning` 剩余部分（24 条）；P4.3b.7 把 `auth` 迁成 `plugins/identity`；P4.3b.8 把支付基础设施迁成 `plugins/payment`；**P4.3b.10 把 `engagement` 迁成 `plugins/engagement`**（17 条路由、9 个控制器、10 张表），并顺手把 §8.9 的两个所有权问题各自了结或写明。`routeCollisions` 保持 **0**，端点数保持 **297**。
**P4.3c 已把两套组装的 schema 合成同一份迁移链**（含 1 列 + 19 索引的补全）。
**P4.3b.9 修掉了那条悬了五轮的配置陷阱**：Prisma 与 `ctx.db` 现在**保证**打开同一个库（见 §9 的 P4.3b.9 记录）。

**`api/modules/` 现在只剩 2 个**：`admin`、`insights`。
**`api/services/` 只剩 1 个死文件**（`UserService.ts`，无人引用，P7 删）。

**SDK 在 P4.3b.8 新增第三种 tier**：`'foundation' | 'feature' | 'infrastructure'`。

**下一步（见 §8.4 与 §8.9）**：
- **`admin` 的 HTTP 面**：14 文件、`admin.repository.ts` 940 行，是 §8.3.1 那笔「用 Prisma `$transaction` 跨域删表」债的主体 —— 现在几乎每个域都有端口了，可以开始逐个改调。它同时是 **Prisma 在运行时的唯一消费者**，所以迁完它就等于把双数据路径彻底消灭（`api/db.ts` 那条 `better-sqlite3` 连接同理，见 §9 的 P4.3b.9）。
- **`insights`**：跨全域读模型（12 张表），需要 classroom 与 assignments 各自发布报表端口。
- 之后是 P4.3c.3（按域拆 migration）、P5 收尾、P6、P7。

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
npm run guard         # 防伪护栏棘轮（12 文件 / 53 用例；含 G17「schema 只住在迁移里」）

npm run class-features:check   # 前端功能开关目录是否与插件 manifest 一致
npm run check         # tsc --noEmit
npm run measure       # 基线度量（死代码/重复/schema 漂移）
npm run api:surface -- --check     # 297 条端点必须零漂移（含 plugins/** 与 packages/kernel/**）
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
| **P4.3b.5** | **剩余域**：`insights`/`engagement`/`platform`/`learning` → 见下方 5a–5d 拆分，**标记已作废**（5a/5b/5d 已完成，只剩 5c 与 6） | 见 `git log` | 🔶 |
| P4.3b.5a | **`system` 迁成插件**（8 条路由；`operation_logs` 只读，内核审计 sink 拥有） | 见 `git log` | ✅ |
| P4.3b.5b | **`assignments` 插件**：`learning` 里唯一不碰 Prisma 的 14 条路由（作业+考试）先切出来 | 见 `git log` | ✅ |
| **P4.3b.6** | **`pet` 域整体迁成插件**（17 条旧路由 + 真 `pets` 表 + 端口化 students/points/ledger），删 `api/modules/pet`，`routeCollisions` 1 → **0** | 见 `git log` | ✅ |
| P4.3b.5c | `learning` **其余部分**（papers/knowledge/wrong-questions/study-plans，28 个 Prisma 模型） | — | ⬜ |
| P4.3b.5c | **支付表补建**：`payment_orders`/`payment_transactions` 根本没有表，整个 `/api/payment` 面是死的；G13 加固 | 见 `git log` | ✅ |
| P4.3b.5d | **`parent-buff` 迁成插件**（`platform` 拆开：业务半边走插件，支付半边留在 `api/modules/platform`） | 见 `git log` | ✅ |
| **P4.3b.6b** | **`classroom` 的整个 HTTP 面（47 条）+ `learning` 剩余部分（24 条）迁成插件**；删 `api/modules/classroom` 与 `api/modules/learning`，`routeCollisions` 保持 0，端点数不变 | `e6c8e24` | ✅ |
| **P4.3b.7** | **`auth` 迁成 `plugins/identity`**：4 条路由 + `users`/`activation_codes`/`activation_events` 三张表 + 发布 `identity.public.activateUser`；删 `api/modules/auth/**` 与 `api/services/activationService.ts`，`legacyAuthProvider` 由 `ctx.auth.registerProvider` 取代 | `1e1d159` | ✅ |
| **P4.3b.8** | **支付基础设施迁成 `plugins/payment`**（`tier: "infrastructure"`，SDK 新增第三种 tier）：3 条路由 + `payment_orders`/`payment_transactions` + provider 层；删 `api/modules/platform/**`、`api/services/paymentService.ts`、`paymentProviders/**` | 见 `git log` | ✅ |
| **P4.3b.9** | **两条数据路径保证指向同一个库**：`api/prismaClient.ts` 用与 `loadConfig` 相同的规则解析库文件并把 datasource 显式传给 `PrismaClient`（覆盖 `.env` 的 `DATABASE_URL`）；新增 `tests/kernel/database-path-alignment.test.ts`（含真 Prisma 子进程断言 + 第四个读取者的围栏） | `4b311eb` | ✅ |
| **P4.3b.10** | **`engagement` 迁成 `plugins/engagement`**（17 条路由 / 9 控制器 / 10 张表）；`pets` 直写改成 `pet.public.grantPetExperience`，积分+流水改成 `classroom.public.spendStudentCredits`；删 `api/modules/engagement/**` | 见 `git log` | ✅ |
| P4.3b.6 | `classroom` 的 HTTP 面 + `pet` HTTP 面补全 + `auth`→`identity`（`settings`/`system` 已完成） | — | ✅ 全部完成（`pet` P4.3b.6；`classroom` P4.3b.6b；`auth`→`identity` P4.3b.7） |
| P4.3c | `api/db.ts` 启动期 DDL → 编号迁移 | **进行中**（见下） | 🔶 |
| P4.3c.1 | **787 行启动 DDL 收编为 `0000_legacy_boot_schema` 迁移** | `b63c74d` | ✅ |
| P4.3c.2 | **两套组装共用同一份 DDL**（删掉 `adoptedTables.ts` 的重复定义） | 见 `git log` | ✅ |
| P4.3c.3 | 按域拆分 migration（让 kernel-only 部署不再建业务表） | — | ⬜ |
| **P4.3c.3a** | **迁移链补全 schema**：`parent_activity.last_active_date`（1 列）+ 19 个索引（含 2 个 UNIQUE）；`api/db.ts` 不再自带 DDL；新增护栏 **G17** | 见 `git log` | ✅ |
| P5 | 前端插件化（注册表驱动路由/菜单/插槽） | — | 🔶 |
| P5.1 | **19 个 `enable_*` 前端硬编码表 → 从插件 manifest 生成** | 见 `git log` | ✅ |
| P5.2 | ~~62 个转发 shim~~ ✅ **P5.2a**：61 个 shim 变成真实实现，1 个错位重复 shim 删除 | 见 `git log` | ✅ |
| P5.2b | ~~`AppRoutes` 的 80 条 static import~~ ✅ 路由表 + 生成式模块映射（`import.meta.glob` 被否决，见 §9 说明） | 见 `git log` | ✅ |
| P5.3a | ~~`window.__TC_CONFIG__` 取代部署期 `sed`~~ ✅ 运行时配置真的生效了（发现它此前**从未生效**） | 见 `git log` | ✅ |
| P5.3b | ~~4 个布局的硬编码菜单~~ ✅ 全部从路由表派生（`navRegistry.ts`，护栏 G16） | 见 `git log` | ✅ |
| P5.3c | ~~`api/modules/settings`~~ ✅ 并入内核（`settings` 本就是内核自有表）；顺带发现扫描器**从不扫内核路由** | 见 `git log` | ✅ |
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

api/schema/appMigrations.ts  **两套组装共用的唯一迁移清单**（P4.3c.3a 新增）
                             0000 boot schema → 0000b payment → 0000c 兼容列 → 0000d 兼容索引
                             API_MIGRATIONS 被 api/db.ts、api/app.ts、G13、G17 同时引用
                             —— 之前这个清单有三份手抄副本，那正是两套组装漂移的成因
api/schema/legacyCompatColumns.ts  53 个兼容列（**函数迁移**，见 §9 的 checksum 陷阱）
api/schema/legacyCompatIndexes.ts  19 个索引（字符串迁移，`IF NOT EXISTS` 幂等；含 2 个 UNIQUE）
api/schema/paymentTables.ts  payment_orders/payment_transactions（原本只存在于 Prisma）

plugins/classroom       基础插件，required:true，owns students+classes+records（adopted），
                        发布 classroom.public，声明 19 条 classroom.enable_* 权限
                        classroom.public 端口（迁移的公共依赖）：
                          getStudentById / getClassById / listClassStudents / assertStudentInClass
                          adjustPoints（total+available 同时动，发事件）
                          transferStudentCredits（只动 available，余额不足返回 refusal）
                          recordStudentLedgerEntry（共享流水 records 的唯一写入口）
                          checkStudentFeature / checkClassFeature（能力指派优先，回落旧列）
                        拒绝用返回值表达：ClassroomResult<T> = { value?, refusal? }
plugins/pet             **真实 pet 域**（P4.3b.6 起，不再是 P3 的参考实现）
                        `data.adopted: ["pets"]`（旧表名，P7 才改名）+ `data.reads: ["praises","parent_activity"]`
                        17 条旧路由**逐字搬入**（`api/pet/**` 9 条 + `api/pets/**` 8 条，信封/状态码不变）
                        + 插件自有 3 条：`GET /api/pet/health`、`POST .../adopt`、`POST .../action`
                          —— 后两条是 `/adoptions` `/actions` 的**同实现别名**，唯一差别是权限门（pet.adopt/pet.interact）
                        students / 积分 / 流水 / 班级开关全走 `classroom.public`；只有 `pets` 本地读写
                        发布 `pet.public`（`getPetForStudent` / `hasPet` / `getBattleProfile`）
                        自有迁移 `0002_retire_reference_tables` **删掉了 P3 的两张虚构表**（p_pet_pets / p_pet_praise_log，
                        两张在真库与开发库里都是空的），这是"插件可以 DROP 自己前缀的表"的活证据
plugins/economy         P4.3b.1 首个迁出的真实域，20 个端点，是后续域的模板
```

### 关键机制（改代码前务必理解）

- **声明即许可**：未声明的事件/路由/表访问会在调用点失败（fail-closed）。
- **`data.adopted`**：插件可拥有"仍带旧名"的表。护栏 **G10** 棘轮其数量（当前 2）到 0。
- **插件集合是启动的输入**：R10 已证明 Nest 可运行期装配控制器，但 `container.addModule()` 不注册控制器、也没有可用的移除路径 → **启停/装卸一律重启**。
- **`Module()` 装饰器返回 `undefined`**（副作用式），普通调用时不要用它的返回值。
- **`abortOnError` 默认 true**，会 `process.exit(1)` 吞掉真实原因 → Nest 启动必须传 `abortOnError: false`。
- **`Migration.up` 可以是函数**（SQLite 没有 `ADD COLUMN IF NOT EXISTS`），校验和覆盖函数源码。
- **可选端口必须在调用时解析，不能在 `setup()` 里捕获**（P4.3b.6a 实测）：
  插件按 slug 字母序 setup，`challenge` 早于 `pet`，所以 `const p = ctx.tryUse('pet.public')` 拿到的是 `null` 并且**永远是 null**
  —— 战斗伤害会静默地一直用回退值 10（真库里的宠物是 468）。正确写法是传一个函数 `() => ctx.tryUse('pet.public')`，
  注册表本身是活 map（`serviceRegistry.ts`），调用时查得到。`dependsOn` + `ctx.use` 是另一种选择，但会把这个依赖变成硬依赖。
  `tests/plugins/host.test.ts` 里有一条集成断言（把宠物 attack_power 设成 777，断言世界 Boss 掉血 777）专门钉住这个坑，
  已用变异验证：改回"setup 里捕获"→ 断言报 `expected 10 to be 777`。
- **前端不能 import `@thinkclass/kernel`**（会把 express/better-sqlite3 打进浏览器包）。

---

## 6. 护栏与棘轮（只能降，不能升）

`tests/guardrails/lib/allowances.json`：

| 键 | 当前 | 目标 | 含义 |
|---|---|---|---|
| `shimPages` | **0** ✅（62 → 0）| 0 | 插件树里的一行转发 shim（"假插件化"） |
| `deadCode` | **59**（70 → 69 → 66 → 65 → 64 → 58 → 58 → 59）| 0 | 应用不可达文件（P4.3b.6 删 `api/modules/pet` 降 1；工作区清理删掉 6 个孤儿 hook/组件再降 6）。**P4.3b.6b 没有把它降下来**：删掉两个域后，原先因被引用而不算死的替代文件变成了新的不可达文件，总数回到同一个天花板。**P4.3b.10 把它升了 1**：迁走 engagement 之后 `src/features/engagement/api/praisesApi.ts` 失去了最后一个引用者（它的消费方是一个在更早的工作区清理里删掉的 hook）。**两轮实测的结论：这个棘轮在迁移期间不是单调的**，一个域搬走可能把某个文件留在原地没人引用 —— 这类文件属于 P7 的清理清单，本轮记录而不是顺手删 |
| `staticPluginRoutes` | **0** ✅（76 → 0）| 0 | 路由表里静态 import 的插件页面 |
| `legacyFeatureKeySurfaces` | **0** ✅（原 2 → 1 → 0）| 0 | 仍硬编码 19 个 `enable_*` 键的文件 |
| `adoptedTables` | **65**（26 → 28 → 32 → 33 → 34 → **50** → **53** → **55** → **65**）| 0 | 仍带旧名的插件自有表（`records` 永久共享，不计入）。**P4.3b.6b 的 +16 是 `learning`**；**P4.3b.7 的 +3 是 `identity`**（`users`/`activation_codes`/`activation_events`，第一批"给已有表找到主人"的条目）；**P4.3b.8 的 +2 是 `payment`**（此前连表都没有）；**P4.3b.10 的 +10 是 `engagement`**，清单在 `allowances.json` 里逐表列明 |
| `routeCollisions` | **0** ✅（33 → 1 → 0）| 0 | 同一 METHOD+PATH 被两个控制器文件声明。P4.3b.6 之后**必须保持 0**：出现一条就意味着某个域又同时注册在两处 |

注意 `adoptedTables` 的"只降不升"有一条**明示例外**：迁移一个新域会让它上升，因此每次上升都必须在 `allowances.json` 的注释里逐条写清是哪张表、来自哪个域（`routeCollisions` 与 `deadCode` 没有例外，只能降）。

其余护栏：G1 插件间只经 `public.ts`、G2 内核不 import 插件、G5 内核零业务知识、G6 contracts 纯类型、G7 manifest 合规、G8 端点快照、G9 system settings 双份一致、G10 adopted 表、**G11 路由碰撞**、G13 启动 schema 完整性（正向：manifest 声明的表；反向：每个 Prisma 模型都要有表；**P4.3b.11 新增：SQLite 有、Prisma 模型没有的列**）、**G17 schema 只住在迁移里**（`api/db.ts` 不得再出现 `addColumnIfNotExists` / `ADD COLUMN` / `CREATE INDEX`；允许的剩余 DDL 被逐条枚举，加了就报错）。

### ⚠️ schema 的第四个盲区（P4.3c.3a 发现，G13/G17 之前都看不见）

「两套组装共用一份 DDL」这句话在 P4.3c.2 之后**只对了一半**：共用的只是 `CREATE TABLE` 那一段。`api/db.ts` 的 `initDb()` 后面还有一段约 120 行的兼容 DDL —— 53 个 `addColumnIfNotExists(...)`、3 个裸 `ALTER TABLE ... ADD COLUMN`、20 条 `CREATE INDEX` —— 而 `initDb()` **只在 legacy 组装里被调用**。

实测（`.tmp/schema-gap-probe.mts`，真起 `createKernel()` 然后逐条核对上面那些语句）：

```
MISSING COLUMNS (1):  parent_activity.last_active_date
MISSING INDEXES (19): idx_parent_activity_parent_student（UNIQUE）、idx_classes_invite_code（UNIQUE）+ 17 条查询索引
```

两个 UNIQUE 索引不是性能问题：没有 `idx_parent_activity_parent_student` 时 `INSERT ... ON CONFLICT(parent_id, student_id)` 会被 SQLite **直接拒绝**（"ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint"），没有 `idx_classes_invite_code` 则两个班可以撞邀请码。

**为什么现有护栏看不到**：G8 比的是端点集合、G13 查的是「表 + 一份手写列清单」、G11 查路由。而缺列的典型症状不是报错 —— 按列名读的**回落逻辑**会给出错误答案（"功能已关闭"）。这正是 §8.8 记的那类坑，只是这次缺的列不在那份手写清单里。

**修法**：把上面那些语句**整体搬进迁移**（不是删掉 —— 它们是老库的升级路径：`CREATE TABLE IF NOT EXISTS` 对已存在的表什么都不做，老库的列全靠这些 ALTER 补上）。`api/db.ts` 现在只剩 DML（seed、邀请码回填、`messages` 重建），G17 逐条枚举允许留下的 DDL，多一条就红。

### ⚠️ 快照的三个盲区（第三个在 P5.3c 发现）

`api:surface` 原本只扫 `api/**`。域一旦迁进 `plugins/**`，端点会从快照里"消失"而不报错（§7 的陷阱）。P4.3b R1 让 `extractApiSurface` 同时扫 `api` 与 `plugins`，扫完立刻就"凭空"多出 4 条 `plugins/pet` 的端点 —— **这说明原来的 288 是在漏扫，不是真实的 288**。

第二个盲区更隐蔽：快照比较的是 **METHOD+PATH 的集合**，所以"两个控制器声明同一条路由"完全不可见 —— 而半成品迁移产生的正是这个状态（模块还在 `api/`，插件已经在服务同样的路径），只有先注册的那个可达，另一个是没有任何测试会发现的死代码。新增 **G11** 棘轮（`routeCollisions`，当前 1）专治此症；当前那 1 条就是 `plugins/pet` 与 `api/modules/pet` 同时声明了 `GET /api/pet/students/:studentId`。

**第三个盲区（P5.3c 实证）**：扫描器只认 Nest 装饰器，**内核自己的路由一条也没进快照**。P5.3c 把 `GET /api/settings` 从 Nest 搬进 `packages/kernel/src/http/kernelRoutes.ts` 时，`--check` 报的 `ADDED` 里**没有**它（因为去掉的声明和新增的声明互相抵消了，恰好掩盖了搬迁），却冒出 6 条 `GET|POST /api/kernel/*` —— 那些路由**从 P1 起就一直在服务，只是从来没被记录过**。所以：

- 扫描器现在同时读两种注册方式：`@Controller`+`@Get`（`api/**`、`plugins/**`）与 `router.get('/api/x')`（`packages/kernel/**`）；
- 快照从 292 更正为 **297（不同 METHOD+PATH 的集合）**，多出来的 5 条是内核基础设施端点，不是本轮新增的端点；
- **快照的单位是「不同的 METHOD+PATH」**。`extractApiSurface()` 返回的是"声明条数"，一条路由被两个文件声明就会出现两次；旧版把这两个数字放在两个文件里各断言一次（`count` = 声明数、`endpoints.length` = 声明数），于是给内核路由补扫后 `GET /api/health` 变成两条声明，守卫报"299 vs 298"这种**看不懂的尺寸错误**，而不是"重复声明"。现在 `count === endpoints.length` 且列表内无重复，重复声明**只**由 G11 负责。

**并且**：`GET /api/health` 曾被声明两次 —— `packages/kernel/src/http/kernelRoutes.ts` 与 `api/health.controller.ts`。两个组装里内核路由器都挂在 Nest 之前，所以 Nest 那个控制器**从未可达**，而集合比较看不见它。它的存在是死代码，已在 P5.3c 删除（`api/app.module.ts` 现在声明 0 个 controller）。

---

## 7. 当前验证状态

**下面是 P4.3b.7 完成时（HEAD 见 `git log -1`）跑出来的数字。**
**它一定会随每一轮变化 —— 请用 §0 的三条命令重新跑一遍，把输出当成本节的真实内容。**

```
npm test        119 文件 / 842 用例全绿
npm run check   exit 0
api:surface     unchanged (297 endpoints)   ← 迁移期间端点数必须不变
guardrails      12 文件 / 54 用例
```

**已迁成插件的域（20 个）**：economy, dungeon, gacha, slg, battles, challenge, collaboration, marketplace, portal, system, assignments, parent-buff, pet, classroom（P4.3b.6b 补上 HTTP 面）, learning（P4.3b.6b）, identity（P4.3b.7，原 `auth`）, payment（P4.3b.8，`tier: "infrastructure"`，原 `platform` 的支付半边）, **engagement**（P4.3b.10）
**仍在 `api/modules/` 的域（2 个）**：admin, insights。
另外 **`platform` 现在只剩支付三条路由**（业务半边 `parent-buff` 已迁走），它已经不是一个功能域，而是一块基础设施 —— 见 §8.9。
（`settings` 已在 P5.3c 并入内核 —— 它本来就只有一句 `SELECT key, value FROM settings`，而 `settings` 是内核自有存储。）

**验收基线**：

| 指标 | 期望 | 变了说明什么 |
|---|---|---|
| `api:surface` 端点数 | **297** | 迁移期间**不应变化**。变小 → 扫描漏了插件或内核；变大 → 多出端点 |
| `deadCode` | **59** | 2026 实测：迁移一个域**不保证**它下降（P4.3b.6b 删了两个域仍在 58），而且**可能上升**（P4.3b.10 因 `praisesApi.ts` 失去引用者升到 59）。上升时必须像本轮一样在 `allowances.json` 里写清是哪个文件、为什么它现在不可达 —— 棘轮的价值在于"每一次移动都要被解释"，不在于数字单调 |
| `shimPages` | **0** | P5.2a 已达成 |
| `legacyFeatureKeySurfaces` | **0** | P5.1 已达成；G14 保证它不会回升 |
| `adoptedTables` | **65** | 每迁一个域会上升，P7 改名后归零。**`records` 不计入**（永久共享）。最新一次是 P4.3b.10 的 engagement 10 张（含 `redemption_tickets` 这个共享写例外与无人认领的 `user_achievements`）。**这大概是最后一次由"迁域"带来的增量**：admin 与 insights 都没有一张可被新名字 adopt 的自有表 |
| `routeCollisions` | **0** ✅ | P4.3b.6 达成了目标，P4.3b.6b 在两个域上重复了同一套动作并保持 0。**再出现一条就是回归**：某个域同时注册在旧模块与插件里 |
| 两套组装的 schema | **一致** | 实测（P4.3c.3a）：fresh kernel 组装与 fresh legacy 组装都是 **86 表 / 89 索引**，`parent_activity.last_active_date` 与 19 个兼容索引都在。P4.3c.3a 之前 kernel 侧是 **83 表 / 65 索引且没有那一列**，而没有任何测试会失败 |

### ⚠️ `platform` 不是一个干净的功能域（迁移前必读）

`api/modules/platform` 的 4 条路由里，**3 条是支付基础设施**（`POST /api/payment/create`、`GET /api/payment/status/:orderNo`、`POST /api/payment/notify`），
依赖 `api/services/paymentService.ts`、`api/services/paymentProviders/**`、`prisma.settings`（`payment_environment`）。
只有 `POST /api/parent-buff` 是业务（写 `parent_activity`）。

**按"一个域一个插件"机械迁移会把 `api/services/**` 一起拖进插件**，那是把基础设施当业务迁。
建议的拆法（尚未实施）：
- `parent-buff` → 一个 feature 插件（`data.adopted: ['parent_activity']`，`dependsOn: classroom`）
- `payment/*` → 归内核/平台侧（它读 `settings` 与 `payment_orders`，且 `payment_orders`/`payment_transactions` **只存在于 Prisma**，见 §9 P4.3c 注意事项）

**批量迁移的实测经验（P4.3b.2，五个域并行）**：
- **`api:surface -- --check` 的括号数字**：它打印的是**集合大小（不同 METHOD+PATH）**，P5.3c 起 `count === endpoints.length`。迁移中途旧模块与插件并存时，同一路径被声明两次会被**去重**，所以数字**不会**虚高，但 G11 的碰撞数会等于各新插件声明数之和（本次峰值 54），删旧模块后回落。判定永远看 `added`/`removed` 是否为空。
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

- ~~**`plugins/pet` 与 `api/modules/pet` 路由碰撞**~~ ✅ **P4.3b.6 已还**：17 条旧路由按原语义/原信封搬进 `plugins/pet`（改用旧 `pets` 表），旧模块删除，`routeCollisions` 归 0。见 §9 的 P4.3b.6 记录。
- ~~在 `plugins/pet` 补完之前，不要在 legacy 组装下开启插件后跑端到端前端流程~~ —— 前提已消失（碰撞为 0），legacy 组装现在由插件提供全部 pet 路由，实测两套组装的 14 条请求 body 完全一致。
- **`admin.repository.ts` 的删教师级联是最后一笔跨域写债，而且它比本文档原先写的更具体**（P4.3b.11 实测，见 §9 的 P4.3b.11 记录）：
  它删 **58 张表 / 65 条语句**（`scripts/migration/probes/admin-cascade-inventory.mjs` 量出来的），全部在**一个** Prisma `$transaction` 里，
  所以"删干净"是**原子**的 —— 这正是它不能用端口方法改写的约束：65 个端口调用 = 65 个独立事务，
  进程死在中间就留下半删的账号。它还绕开 `DbApi`，所以所有权检查对它完全无效。
  **另外**：61 张表持有指向 `users`/`classes`/`students` 的外键，其中**只有 1 张**没被这个级联清理：
  `blind_boxes.teacher_id`（`scripts/migration/probes/admin-cascade-fk-coverage.mjs`）。它的行永远是 NULL，因为
  `plugins/marketplace` 的插入语句根本不写这一列 —— 所以今天不是活 bug，而是一处**此前没人看到的 schema 漂移**（见下一条）。
- **`records` 的其余写入方**（collaboration/marketplace/engagement/insights/pointsService/classroom）在各自迁移时都要改调 `classroom.public.recordStudentLedgerEntry()`。
  `api/services/pointsService.ts` 是共享 helper（marketplace 在用），它自己也要改。（pet 已在 P4.3b.6 改完。）
- ~~kernel 组装下的"只读 legacy 表"由 `ensureReadOnlyLegacyTables()` 建出来~~ —— 那个函数在 P4.3c.2 就删了，清单见 §8 的过时名字警告。
- **`pets.attack_power` 的端口债务已还** ✅ P4.3b.6a：`challenge` 不再声明 `data.reads: ["pets"]`，
  改用 `pet.public.getBattleProfile()`（见 §9 的 P4.3b.6a 记录，含一个**实测出来的坑**：可选端口在 `setup()` 里捕获会永远是 null）。
- **`praises` 表无主**：pet 的 dashboard 读它（`data.reads`）。它既不属于任何插件，也没有端口。P7 前应决定归 classroom 还是给它一个端口。
- **`checkStudentFeature` 对"班级行已删"返回 403 `feature-disabled`**，而 legacy 的 `assertClassFeatureEnabled` 抛 404「班级未找到」。
  正常路径一致；只有孤立学生（class 行被删）才有差异。economy/challenge 都受此影响，属已知语义差。

### 8.4 迁移顺序建议

1. ~~`economy`~~ ✅ `3296a41`
2. ~~`dungeon`、`gacha`、`slg`、`battles`、`challenge`~~ ✅ P4.3b.2
3. ~~`collaboration`、`marketplace`~~ ✅ P4.3b.3
4. ~~`portal`、`system`~~ ✅ P4.3b.5a；~~`parent-buff`~~ ✅ P4.3b.5d（`platform` 的支付半边留在原处，见 §8.9）
5. ~~`learning`：作业+考试~~ ✅ **P4.3b.5b 切出 `plugins/assignments`**；~~剩下的 papers/knowledge/wrong-questions/study-plans~~ ✅ **P4.3b.6b 迁成 `plugins/learning`**
6. ~~`classroom` 的 HTTP 面（目前只有端口，端点仍在 `api/modules/classroom`）~~ ✅ **P4.3b.6b 已完成**（47 条 METHOD+PATH，六个控制器）
7. ~~`pet` 的 HTTP 面补全 → 删 `api/modules/pet`~~ ✅ **P4.3b.6 已完成**（`routeCollisions` 0）
8. ~~`auth` → `identity` 基础插件~~ ✅ **P4.3b.7 已完成**（`settings` ✅ P5.3c 并入内核；`system` ✅ P4.3b.5a）。顺带补掉的端口缺口：`classroom.public` 的 `getClassFeatureSnapshot` / `findClassByInviteCode` / `listStudentsByParent` / `linkParentToStudent` / `bindStudentToUser`，以及 `parent_buff.public.touchParentLogin`
9. ~~`platform` 的支付三条路由~~ ✅ **P4.3b.8 已完成**：迁成 `plugins/payment`，`tier: "infrastructure"`（本轮给 SDK 加的第三种 tier）。§8.9 悬了三轮的那个决定就这样落地了 —— 内核侧会让 G5 破（内核要认识 `payment_orders`），`feature` 又谎称它可关（它拥有真实订单）
10. `admin` 的 HTTP 面（14 文件、`admin.repository.ts` 940 行）← **下一步**。它是 §8.3.1 那笔「用 Prisma `$transaction` 跨域删表」债的主体；现在几乎每个域都有端口了，可以逐个改调
11. `insights`、`engagement` → **最后**：insights 是跨全域读模型（12 张表），engagement 卡在 `pets`/`redemption_tickets` 的所有权决定（注意 engagement 写的 `pets` 现在是 **pet 插件的表**，所以它还多了一个"必须走 pet 端口"的约束）

**共享文件只有 Lead 改**：`api/app.module.ts`、`allowances.json`、`api/schema/adoptedTables.ts`、`packages/**`。
`plugins/<slug>/**` 与 `tests/plugins/<slug>-*.test.ts` 是每域独占的，可以并行。

**⚠️ 团队名额上限 8（含 Lead），且名字不可复用**：一个会话里最多雇 7 个 teammate，用完无法回收（inactive 也占位）。
批次并行时记住这条：R4 就是因为 6 个旧 teammate 占位，后 4 个域只能串行。

### 8.7 `dbApi` 的 SQL 表名提取器：假阳性会打断合法查询

### 8.10 `import.meta.glob` 为什么被否决（P5.2b 实证）

任务书写的是「`AppRoutes` → 注册表驱动 + `import.meta.glob`」。**实测后改成生成式映射**，
原因是 glob 在三个方面同时踩坑：

1. **构建与测试的别名行为不同**：`import.meta.glob('@/features/*/pages/*.tsx')`
   在 vitest 下可用，但 `vite build` 直接报错
   `[vite:import-glob] Invalid glob ... It must start with '/' or './'`。
   → 同一份代码「测试绿、构建红」。
2. **key 格式两边不同**：vitest 归一化成 `/src/features/...`，构建期保留原 specifier。
   按任一种写查找都会让另一种全挂 —— 而且失败形态是 `undefined`，不是报错。
3. **glob 会打包所有匹配文件**：`*.tsx` 会匹配 `*.test.tsx`，而 Vite **在运行期过滤之前**就为每个匹配文件生成 dynamic import。
   结果：干净构建里出现一个 **458 kB 的 `test.*` chunk，内含 `react-dom-test-utils`**。
   试过 `[A-Z]*.tsx` 收窄模式，无效。

**改用 `scripts/migration/route-modules.mjs` 从 `routeTable.ts` 生成显式映射**
（`npm run route-modules` / `route-modules:check`），路由表是唯一事实源，
`--check` 在护栏里跑（**G15**）。生成物只含 `import('literal')`，任何打包器都懂。

**代价**：新增路由要重新生成一次 —— 这正是想要的：`--check` 让「忘记生成」变成测试失败，
而不是线上某个路由白屏。

### 8.11 `window.__TC_CONFIG__` 的注入链**一直是断的**（P5.3a 实证）

任务书写「用 `window.__TC_CONFIG__` 取代部署期 `sed`」。实测发现这条链有**三个断点，每一环都断**：

1. **模板里没有占位符**。`createKernel` 做的是
   `readFileSync(indexHtml).replace('<!--__TC_CONFIG__-->', '<script>window.__TC_CONFIG__=...')`，
   而 `index.html` 里**根本没有这个注释** → replace 什么也没替换，注入是死代码。
2. **`express.static` 先截走了 `/`**。即使补上占位符，`app.use(express.static(dir))` 会自己用 `index.html` 响应 `/`，
   下面那个负责注入的 `app.get('*')` **永远不会执行** → 必须加 `{ index: false }`。
3. **前端从来没人读它**。`ADMIN_PATH = import.meta.env.VITE_ADMIN_PATH || '/beiadmin'` 是**构建期**常量；
   前端从未读过 `window.__TC_CONFIG__` → 新增 `src/constants.ts` 的 `runtimeConfig()` / `adminPath()`。

顺带：`scripts/deploy-common.sh` 的 `replace_custom_admin_path()`
（`find dist ... -exec sed -i "s|/beiadmin|...|g"`，**无法撤销**）是**定义了但全仓库从未调用**的死代码，已删除。

**现在**：`ADMIN_PATH=/control-room` + 重启 → 服务端注入 HTML、前端运行时读取；
管理端路由随之改变（`routeTable.layoutRoutes()` 因此**改成函数**——路径是运行时值，
模块级常量会在注入之前就固化它）。实测：起服务后 `/` 返回的 HTML 里确实有
`{"adminPath":"/control-room",...}`。

**教训**：这三处都是「声明了但没接通」的接线。补任何一条「某个设置应该生效」的链路时，
**必须端到端实测一次**（起服务 → 拉 HTML → 断言值在里面），否则很容易只改了其中一环，
而三环全断时每一环单独看都像是对的。

`packages/plugin-runtime/src/dbApi.ts` 的 `referencedTables()` 用正则从 SQL 里猜表名，猜错有两个方向：

- **假阳性**（把关键字当表名）：`INSERT ... ON CONFLICT DO UPDATE SET col = ?` 里的 `DO UPDATE SET` 长得和 `UPDATE <table>` 一模一样，
  于是 `SET` 被当成表名，**每一条 upsert 都被拒绝**，报错还是极具误导性的
  `plugin "portal" may not write to table "SET"`。这个 bug 由 `plugins/portal` 的首页批量 upsert 首次触发 —— 单元测试全绿（因为都 fake 了 repository），只有真实启动才暴露。
- **假阴性**（漏掉真表名）：会放过一次越权写入，更危险。

现在的实现是「宽松匹配 + 关键字黑名单」：正则只负责抓「动词后面的标识符」，`NON_TABLE_KEYWORDS` 负责剔除关键字。
两条回归测试在 `tests/plugins/isolation.test.ts`（upsert 可通过、DDL 目标仍能解析）。

**教训**：新增域时如果用了此前没出现过的 SQL 形态（upsert / CTE / 子查询 / 复合语句），**必须真启动一次**，不要只跑单测。

### 8.12 菜单的「三份同键清单」（P5.3b 实证）

四个布局各自维护一份 `navItems` 数组，把每条路径**又写了一遍**：

    const allNavItems = [
      { path: '/student/pet', icon: Star, label: '我的精灵' },
      ...

而 `studentFeatureRequirements`（决定这条菜单是否**显示**的开关表）把同样的路径**写了第三遍**。
三份清单用同一批字符串做键：任一处的笔误都会产生「点了没反应」的菜单项、或永远到不了的页面，而**没有任何测试会失败**。

现在：`label` 写在路由表里（**有 label = 是菜单项**），开关用路由表自己的 `feature`，
图标留在 `src/components/Layout/navRegistry.ts`（那才是表现层的事）。四个布局都不再有菜单数组。

**两点必须记住**：

1. **数组顺序 = 菜单顺序**。因此各布局的 child 顺序被调整成菜单顺序 —— 这也是为什么
   `routeTable.test.ts` 里那些「保持 child 路径」的断言改成了**集合比较**：
   顺序现在是表现层决定，断言顺序会让每次调整菜单都挂掉一个路由测试。
   真正不能变的（少一条路由、丢一个 label）仍然被断言。
2. **教师菜单的开关表和路由表故意不一致**，不是疏忽：`/teacher/communication` 由六个功能任一开启即显示，
   `/teacher/certificates` 在菜单里挂 `enable_achievements` 但路由本身不限，
   `/teacher/task-tree` 有开关却没有 label（不是菜单项）。合并它们会改变教师能看到的页面，
   所以在有人正式决定之前保持显式，并在代码里写明原因。

**新增护栏 G16**：菜单条数（teacher 25 / student 22 / parent 6 / admin 10）、每条都有图标、
每条 path/label 合法、同一布局内 path 不重复、以及**管理端菜单不依赖写死的 `/beiadmin`**
（按 layout 模块查、图标按路由表路径做键，否则改了 `ADMIN_PATH` 的部署会全部丢图标）。

### 8.8 `adoptedTables.ts` 的两类坑（P4.3b 期间各踩中多次）

1. **SQL 注释里不能出现反引号**：整个 DDL 是模板字符串，一个反引号就会提前结束它，报错却是 `Expected ")" but found "xxx"`。
   新增护栏 **G12**（`tests/guardrails/ddl-template-literals.test.ts`）会在 2ms 内直接指出行号。
2. **DDL 必须包含所有兼容列**：`api/db.ts` 过去对**已存在**的表用 `ALTER` 补列，而迁移链是 kernel 组装下**唯一**的建表者 —— 少一列不会报错，只会让按列名读的回退逻辑静默给出错误答案。
   **P4.3c.3a 之后这条已经机械化**：那 53 个 `addColumnIfNotExists`/裸 ALTER 变成了 `0000c_legacy_compat_columns` 迁移，`api/db.ts` 里不再有列 DDL，**G17** 会拦住任何回流的写法，而 G13 的列清单负责"按名读的列必须存在"。
   已实测并核对过的清单（这些列现已全部就位）：
   `classes.enable_*`(19) / `classes.settings` / `classes.invite_code` / `classes.pet_selection_mode`、
   `students.group_id` / `students.last_checkin_date` / `students.birthday`、
   `pets.mood` / `pets.last_fed_at`、`peer_reviews.team_quest_id`、`world_bosses.status`、`parent_activity.last_active_date`。
   **新增按列名读的回退逻辑时，仍然要 `PRAGMA table_info` 实测，不要靠肉眼** —— 但更该做的是直接往 G13 的清单里加一行。

### 8.9 剩余域的**具体阻塞点**（2026 轮实测，不是猜测）

| 域 | 阻塞点 | 需要的动作 |
|---|---|---|
| `insights` | 3 条路由但**跨域读 12 张表**。归属盘点：`exams`/`student_exams`/`student_assignments`/`assignments` 属 `plugins/assignments`（唯一碰这四张表的插件是 assignments 与 **admin**，后者是 §8.3.1 那笔 Prisma 债），`students`/`classes`/`records`/`praises`/`leave_requests`/`attendance_records` 属 classroom，`parent_students` 仍无主。**P4.3b.6b 之后新的事实：`plugins/learning` 的 `data.reads` 是空的**，说明该域对 insights **零贡献**（已用穷尽 grep 验证 insights 不读 papers/questions 那一簇）。classroom 与 assignments **都没有报表类端口** | 正确解法不是搬它，而是**先让 classroom 与 assignments 各自发布报表端口**（班级统计、考试成绩），再把 insights 改成端口的消费者：它的每条 SQL 都跨 2–3 个域，靠 `data.reads` 硬堆是 12 张表的隐式耦合。**insights 不是可以单独搬的域，它是一个跨全域的读模型** |
| `engagement` | ① **写 `pets` 表**（:96 `UPDATE pets SET ... mood = ?`）——`pets` 属 pet 域；② 写 `redemption_tickets`（与 marketplace **双写**，已被 G10 的 `SHARED_WRITE_TABLES` 显式记录）；③ 读 `shop_items` | pet 需发布一个"宠物经验/等级"端口；`redemption_tickets` 需要一个真正的端口（marketplace 拥有？engagement 拥有？）——**这是必须先决定的所有权问题** |
| `platform` | **已彻底关闭（P4.3b.8）**：`POST /api/parent-buff` → `plugins/parent-buff`（P4.3b.5d）；三条支付路由 + 订单表 + provider 层 → `plugins/payment`（`tier: "infrastructure"`）。`api/modules/platform/**` 与 `api/services/paymentService.ts` / `activationService.ts` / `paymentProviders/**` 全部删除 | **归宿已定**：不是内核侧（G5），也不是 feature（它拥有真实订单、不能被随手关掉），而是新增的第三种 tier。上一轮那句"把基础设施当业务迁"的判断没错、结论错了 —— 它需要的不是"别搬"，而是一个能说明它是什么的 tier |
| `learning` | **已完成（P4.3b.6b）**：作业+考试是 `plugins/assignments`（P4.3b.5b），papers/knowledge/wrong-questions/study-plans 是 `plugins/learning`。16 张表进 `data.adopted`，`data.reads` 故意为空（学生的唯一路径是 `classroom.public.getStudentByUserId`） | 剩下的 5 张同簇表（`rubric_point_scores`/`knowledge_products`/`notes`/`note_assets`/`note_products`）**仍无主**，且没有任何路由碰它们 —— P7 决定是删还是归 learning |
| `admin`/`auth` | 见 §8.4 与 §8.3.1 | `auth`→`identity`（下一轮）；`admin` 的 14 个文件里 `admin.repository.ts` 是跨域删表债的主体。（`settings` ✅ P5.3c 并入内核；`system` ✅ P4.3b.5a；`pet`/`classroom` 的 HTTP 面 ✅ P4.3b.6 / P4.3b.6b） |

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

**并且**：删完旧模块后确认 `routeCollisions` 回到 0（G11）。若没回到 0，说明旧模块没删干净 —— 那条路由只有先注册者可达。**注意**：G11 现在也扫内核路由器，所以"内核里已有一条同名路由"同样会被算成碰撞 —— 这是对的，那种情况下 Nest 控制器不可达（`api/health.controller.ts` 就是这样被发现的，P5.3c 已删）。

---

## 9. 后续阶段要点（提前知道，避免走错）

### P5.3c · `GET /api/settings` 搬进内核 —— ✅ 已完成

`api/modules/settings/`（4 文件 44 行）的全部内容就是 `SELECT key, value FROM settings` 并拍平成 `{success:true, data:{...}}`。而 `settings` 是**内核自有存储**（`packages/kernel/src/storage/settingsStore.ts`，插件只能写 `plugin.<slug>.<key>` 命名空间），所以它不该是 Nest 模块，更不该变成插件。

做法：

- `createKernelRouter()` 新增 `settings: SettingsStore` 选项 + `GET /api/settings`（返回 `options.settings.all()`，形状与原来逐字节一致）；
- `api/app.module.ts` 删掉 `SettingsModule`，`api/modules/settings/**` 删除；
- `api/app.ts` 的 `mountKernelInfrastructure()` 把 `kernel.settings` 传给路由器 —— legacy 组装因此**同样**由内核路由器提供该端点。

**实测（`.tmp/settings-route-probe.mts`，两种组装各跑一次）**：legacy 组装 200，14 个键（`site_title=Think-Class`、`payment_environment=mock` …），与旧 Nest 模块完全一致；内核组装也是 200，但数据为 `{}` —— 因为 `initDb()`（负责 seed 默认值）在纯内核组装里不跑，**原来那里是 404，现在是 200 + 空表**，仍是改进。

**注意 `settings` 与 `system_settings` 是两张不同的表**（前者 `key,value` 24 行，后者 `id,key,value,description,updated_at` 0 行）。`GET /api/settings` 只投影前者；探针专门断言了不会泄漏后者的列。

### P4.3b.5a · `api/modules/system` 迁成 `plugins/system` —— ✅ 已完成

8 条路由、3 个生产文件、纯 SQLite，是剩余域里唯一不碰 Prisma、也不碰班级/学生的。迁法照抄 §8.2 清单，值得记下来的只有三点：

1. **`operation_logs` 是内核的，不是这个域的**。P4.2 的审计 sink 拥有它（`packages/kernel/src/logging/auditLog.ts`，迁移 `0005_kernel_operation_logs`），所以 `GET /api/system/logs` 是**只读**，绝不能写进 `data.adopted` —— 那会宣称一个它没有的写所有权。
2. **`backup/export` 是"跨域读"的诚实登记**：它 dump 17 张表，其中 15 张属于别的域。全部写进 `data.reads`（所有权检查在非生产环境是**强制**的，`dbApi.ts:104`），于是这张表要么全对、要么启动就报错，不会静默漂移。`data.reads` 有 16 项，这不是设计味道，而是"备份导出天生是平台级关注点"的事实；P6/P7 应把它改成**内核侧的 dump 表注册表**，而不是各域自己列。
3. **`system_settings` 的所有权是已知欠债**：这个插件服务 `GET|POST /api/system/settings`，但真正在用的管理端点 `GET|PUT /api/admin/system/settings` 通过 Prisma 写同一张表（`api/modules/admin/admin.repository.ts:669-691`，键表在 `admin.defaults.ts`）。前端**没有任何地方**调用 `/api/system/settings`，所以正确解是 admin 拥有该表、这两条路由随 admin 迁移一起消失（删路由是端点变更，不能顺手做）。已写进 `plugin.json` 的 `_adopted_note`。

#### 迁移途中挖出来的两个"本来就是坏的"行为（不是本轮引入）

- **`POST /api/system/questions` 对合法输入也会 500**：body 缺 `answer` 时 SQL 把 `undefined` 绑成 NULL，撞上 `answer TEXT NOT NULL`。**已用 git 历史里那版 service 原文实测**：旧实现抛出一模一样的 `NOT NULL constraint failed: question_bank.answer`。所以这是**既有 bug**，本轮只是原样保留。
- **`teacher_id INTEGER REFERENCES users(id)`**：探针不带用户时插入会 `FOREIGN KEY constraint failed`。这**不是**插件 bug —— 探针漏了 seed 一个 user。**P4.3b.7 之后 `users` 不再是"空的引导表"而是 `plugins/identity` 的 adopted 表**，但这条结论不变：任何写 `question_bank.teacher_id` 的探针仍然要先有一个 user 行。
- **POST 返回 201 不是回归**：Nest 的 `RouterResponseController.getStatusByMethod()` 对 POST 默认 `HttpStatus.CREATED`，而旧 `SystemController` 没有任何 `@HttpCode`。这条结论来自 `node_modules/@nestjs/core/router/router-response-controller.js` 的**源码**，不是猜测（先在 `.tmp/` 里跑 Nest 探针会因为 tsconfig 不覆盖 `.tmp/` 而报 "Parameter decorators only work when experimental decorators are enabled"）。

### P4.3b.5b · `learning` 切出 `plugins/assignments` —— ✅ 已完成

`api/modules/learning` 是剩余域里最大的一块，但它的 10 个生产文件里只有两个 service **完全不碰 Prisma**：
`assignments.service.ts` 与 `exams.service.ts`（各自配一个 `*.repository.sqlite.ts`）。它们是 14 条路由
（`/api/assignments` 6 条 + `/api/exams` 8 条），插件的 `data.adopted` 是
`assignments`/`student_assignments`/`exams`/`student_exams` 四张表（两个父表 + 两个子表，子表离开父表没有意义），
只**读** `students`。`dependsOn` 故意为空：它需要的两件事（一个班的学号列表、学生姓名解密）都是 `students` 的普通读，
走 classroom 端口只会凭空增加启动依赖。

**为什么值得单独切**：剩下那 28 个 Prisma 模型是另一个量级的工作，而这 14 条路由是干净、可独立验证的一片。

#### 迁移中确认的三件事

1. **`ok(data, data)` 不是笔误，是契约**。`createAssignment`/`createExam`/`getGrades` 把结果既嵌进 `data`
   又平铺到信封顶层，所以 body 是 `{success:true, data:{id:1}, id:1}`。旧的 `learning.controllers.test.ts`
   用的是 `toEqual` 的子集匹配，**从来没验证过这个平铺**；新测试显式断言了它。实测探针也逐条打印了真实 body。
2. **事务边界留在 repository**。`createExam` 要"插考试 + 给班里每个学生插一条空成绩行"，原来靠
   `db.transaction(fn)()`；插件里 `DbApi.tx(fn)` 就是同一个东西，所以 repository 继续拥有这个边界，
   service 照旧只调 `transaction()`。探针里刻意让事务内抛异常，确认 `exams` 表**没有**留下半条记录。
3. **`student_name` 解密走宿主注入**，和 classroom 插件同一条路（`ctx.config.decryptName`）。
   探针用真实 `encrypt()` 写入库，再用真实 `decrypt` 读回，得到 `["小明","小红"]` —— 不是拿明文冒充。

#### 仍然存在的跨域写者（债务，已记进 `plugin.json` 的 `_known_debt`）

`api/modules/insights`（12 处引用这四张表）与 `api/modules/admin`（2 处级联删除）**仍然直接读写**它们。
admin 走 Prisma `$transaction` 而非 `DbApi`，所有权检查看不见 —— 与 §8.3.1 记的是同一笔债。

**并且**：这一轮实测后可以把 `insights` 的结论说得更死 —— 它读 12 张表、每条 SQL 跨 2–3 个域，
所以它**不该**靠 `data.reads` 搬走。正确顺序是 learning 与 classroom 都发布报表端口之后再迁它。

---

### P4.3b.5d · `platform` 拆成两半：`parent-buff` 走插件，支付留下 —— ✅ 已完成

`api/modules/platform` 只有 4 条路由，但它们属于**两类东西**，这是 §8.9 早就标出来的：

| 路由 | 性质 | 去向 |
|---|---|---|
| `POST /api/parent-buff` | 业务：往 `parent_activity` 写一行"今日祝福" | ✅ `plugins/parent-buff` |
| `POST /api/payment/create`<br>`GET /api/payment/status/:orderNo`<br>`POST /api/payment/notify` | **基础设施**：Prisma 驱动 `payment_orders`/`payment_transactions`，`paymentProviders/**` 做签名校验，`activationService` 开通用户 | 仍留 `api/modules/platform`，**归宿未定** |

**为什么不一起搬**：机械地把这 4 条路由搬进一个插件，等于把 `api/services/**` 一起拖进 feature 插件 —— 那是"把基础设施当业务迁"。
支付那半边的正确归宿是个真问题：放内核意味着 kernel 要认识支付概念（与 G5"零业务知识"张力最大），
放插件则要引入一个非 feature 的 `tier: "infrastructure"`。**本轮不替它做决定**，只把它从"一个域"降级成"一块待安置的基础设施"。

**实测**（`.tmp/parent-buff-probe.mts`，内核组装 + 真插件）：

```
POST, no body                  -> 400 {"success":false,"message":"Student ID required"}
POST, studentId 0              -> 400 （同上：`if (!studentId)` 把 0 也当缺失，行为保留）
POST, studentId 10（今天首次）  -> 200 {"success":true}
POST, studentId 10（今天再来）  -> 400 {"success":false,"message":"今日已经施放过祝福了"}
POST, studentId 11（另一个学生）-> 200 {"success":true}
POST, 不存在的学生 999          -> 500 （FK 约束，与迁移前一致）
parent_activity rows: [{student_id:10,...,parent_id:null},{student_id:11,...,parent_id:null}]
```

**"每天一次"这条规则值得单独说**：它靠 `date(created_at) = ?` 与 SQLite 自己的日期函数比较，
**假 repository 证明不了它**。所以测试里有一层真库断言：用 SQLite 写入一行、第二次被拒；
再显式写一行 `date('now','-1 day')` 的昨天记录，证明它**不会**挡住今天。
另外 `/api/payment/*` 在同一探针里是 404 —— 内核组装不加载 `api/modules/**`，这是预期，也顺带证明支付确实没被搬走。

---

### P4.3b.6 · `pet` 域整体迁成插件（`routeCollisions` 归零）—— ✅ 已完成

这是 §8.3.1 里挂了最久的那笔债。**它不能靠"删旧模块"来解决**，因为 `plugins/pet` 当时不是等价替换：
4 个端点、表是 P3 虚构的 `p_pet_pets`（`name`/`element`/`stage`，产品里从来没有这些字段），
而真实前端 `src/features/pet/api/petApi.ts` 调的是旧 `/api/pet/**` 的 9 条路由、`parentDashboardApi.ts` 还额外调 `/api/pets/:studentId`。

**做法**：把 17 条旧路由（`api/pet/**` 9 条 + `api/pets/**` 8 条）**逐字**搬进插件，改用真实 `pets` 表。

- `data.adopted: ["pets"]`（P7 才改名）；`data.reads: ["praises", "parent_activity"]`
- students / 积分扣减 / 流水追加 / 班级功能开关全部走 `classroom.public`；只有 `pets` 在本地读写
- 三个**极易在重写里丢掉**的细节，逐条钉住：
  1. **每个 POST 都是 `@HttpCode(200)`**。Nest 对 POST 默认 201，旧控制器显式设了 200。
  2. **信封是双份的**：`/api/pet/**` 把 payload 同时放进 `data` 和顶层（`ok(data, undefined, {pet, has_parent_buff})`），前端读的是扁平那份；`/api/pets/**` 则**没有** `data` 键。两者都不能"统一"。
  3. **`api/pets` 控制器里 `@Get(':studentId')` 必须声明在最后**，否则 `admin/class/:classId`、`classmates/:studentId`、`leaderboard/:classId` 会被它吃掉。
- 插件自有的 3 条路由保留：`GET /api/pet/health`，以及 `POST /api/pet/students/:studentId/adopt` / `.../action`
  —— 后两条现在**是 `/adoptions` `/actions` 的同实现别名**（同一 service 方法、同一信封），唯一差别是权限门 `pet.adopt` / `pet.interact`。
  这是"删路由是端点变更"与"声明的权限必须有地方执行"两件事的交集。
- 迁移 `0002_retire_reference_tables` **DROP 掉 P3 的两张虚构表**。实测两张表在真库与开发库里都是 **0 行**（只被参考实现的探针写过），
  所以删除无数据风险；`0001_init` 仍声明着（已应用的迁移不能改，见 §9 P4.3b.5c 发现 #3），
  新库会先建后删 —— 这是"永不重写迁移历史"的代价。
- 契约同步改真：`PetPort` 从虚构快照（`name`/`element`/`stage`）改成 `pets` 的投影，并新增
  `getBattleProfile()`（给 challenge 用，见 §8.3.1 的债务条）；`pet.action.performed` 的 `action: 'feed'|'play'|'train'`
  换成真实的 `actionType: string` + `cost`（旧枚举描述的是参考实现的语义，产品里 `actionType` 是「训练」这类自由文本）。
  两个契约都没有消费者，所以这次改动"原理上破坏性、实践上免费"。

**实测**（`.tmp/pet-migration-probe.mjs`，真起服务，两套组装各一次，请求 14 条）：

```
requests: 14   differences: 0
GET  /api/pet/students/2          -> 200  真实宠物（level 6 / exp 4680 / attack_power 468 / is_dead true）
GET  /api/pet/students/2/dashboard-> 200  availablePoints 10489 + 100 条真实流水
GET  /api/pets/2                  -> 200  扁平信封（无 data 键）
GET  /api/pet/classes/1           -> 200  {success, data:{students:[]}, students:[]}（经端口取班级名册）
POST /api/pet/students/1/adoptions-> 400  {"success":false,"message":"Pet already adopted"}
POST /api/pet/battles             -> 400  对方的宠物已饿死，无法对战！  ← 三天死亡规则真的在跑
GET  /api/pet/students/999        -> 404  Student not found
```

`is_dead true` 与那条战斗 400 是**真实业务规则**在真实数据上触发，不是构造出来的用例。

**护栏**：`routeCollisions` 1 → **0**（同时把 G11 的硬上限也降到 0）；`deadCode` 65 → 64；`adoptedTables` 33 → 34。
`api:surface` **仍是 297**：17 条旧路径换了实现者、碰撞路径仍在，集合不变 —— 这正是本轮"端点零漂移"的证据。

**测试迁移**：删掉 `api/modules/pet/pet.service.test.ts` 与 `pet.controllers.test.ts`，换成
`tests/plugins/pet-service.test.ts`（服务语义 + 端口边界）与 `tests/plugins/pet-controllers.test.ts`（17 条路由的信封逐条断言 + 权限门）。
**后者是刻意保留的**：信封的"扁平副本"这类细节，端到端测试只会覆盖其中几条，而删掉它的代价要在前端白屏时才会显现。

**顺带发现的一个测试耦合**（不是产品 bug）：`host.test.ts` 的 economy 断言数的是"student 10 的全部流水"，
pet 的用例一旦在同一内存库里追加流水，它就会数到 pet 的行。已把两处断言都按 `type` 收窄
——`records` 是**共享流水表**，按整表计数本来就是在断言别的域的行。

#### 附带：`challenge` 改用 `pet.public`（P4.3b.6a）

`plugins/challenge` 原来声明 `data.reads: ["pets"]` 直接 `SELECT attack_power FROM pets`。现在改成
`pet.public.getBattleProfile(studentId)?.attackPower ?? 10`，`data.reads` 只剩 `question_bank`。

**这一改踩到一个真实的坑，而且只有真启动能发现**（`.tmp/challenge-pet-port-probe.mjs`）：

```
第一次实现：const pets = ctx.tryUse('pet.public')   // 在 setup() 里捕获
真启动实测：POST /api/challenge/bosses/1/attacks -> damage 10      ← 真库里的宠物是 468
日志：      challenge service ready {"petDamageFromPort": false}
```

原因：**插件按 slug 字母序 setup**，`challenge` 早于 `pet`，所以 setup 时端口还不存在；注册表是活 map，
但结果被捕获了，于是**永远是 null**，伤害静默回退成 10，而单元测试完全看不见（它直接构造 service 并把端口塞进去）。

改法：把解析函数本身传进 service（`() => ctx.tryUse('pet.public')`），调用时查。重测：`damage 468`。

**为什么不用 `dependsOn: { pet }` + `ctx.use`**：那会让 pet 一被禁用，整个 challenge 域就被解析器拒掉，
而这里只差一个**有合理默认值**的数字。可选依赖 + 惰性解析是这类"要一个值"的跨域依赖的正确形状。

永久护栏：`tests/plugins/host.test.ts` 新增一条集成断言（把 student 10 的宠物 `attack_power` 设成 777，
世界 Boss HP 1000 → 断言掉血 777、HP 223）。**变异验证过**：把实现改回"setup 里捕获"，该断言立刻报
`expected 10 to be 777` —— 这正是第一次实现的形态。

---

### P4.3b.6b · `classroom` 的 HTTP 面 + `learning` 剩余部分一起迁成插件 —— ✅ 已完成

这是剩下最大的一块：`api/modules/classroom`（六个控制器、47 条 METHOD+PATH）与 `api/modules/learning`
的剩余部分（papers / knowledge / wrong-questions / study-plans，24 条）。两者**在同一次提交里**删掉旧模块，
否则 `routeCollisions` 会在中间态里多出 71 条、端点数也会翻倍（§7 的中间态说明）。

**`plugins/classroom`**：`data.adopted` 仍是 `students`/`classes`（+ `records` 共享不计入），
`dependsOn` 为空 —— 它是 foundation，没有人可以依赖。整个 `api/utils/classFeatures.ts` 的语义被搬成
`plugins/classroom/src/classroom.features.ts`（能力指派优先、回落 `classes.enable_*` 列），
`api/services/featureService.ts` 与 `api/services/pointsService.ts`、`studentService.ts` 随最后一批消费者
一起变成不可达文件并删除。

**`plugins/learning`**：16 张表进 `data.adopted`（清单在 `allowances.json` 里逐表列明），
**`data.reads` 故意为空** —— 该域对 `students` 的全部需求就是「调用者自己的那一行」，
唯一路径是 `ctx.use('classroom.public').getStudentByUserId(actor.userId)`。
同簇的 5 张表（`rubric_point_scores`/`knowledge_products`/`notes`/`note_assets`/`note_products`）
**没有**被声明：该插件没有任何路由碰它们，声明只会虚增 G10 棘轮并谎报所有权。

**这一轮挖出来的四件事**（都不在任务书里）：

1. **`GET /api/classes` 对无凭证请求答 403 才是对的。** 旧的 `listClasses` 有四个 actor 分支，
   都不命中时**抛** `403 无权限查看班级`（`api/modules/classroom/classroom.service.ts` 的最后一行）。
   探针里那条断言写的是 200 + 空列表，等于断言了一个「匿名调用者能拿到全部班级」的世界。
   修法是两层断言：无凭证 → 403 + 中文消息且不含 `Cannot GET`；带 teacher 头 → 200 + `classes` 键
   （**不是 `data`**）。状态码单独并不能证明路由挂上了，body 才能。
   **并且不能断言列表为空**：`initDb()` 会给默认老师 seed 一个「默认班级」，所以干净的 legacy 库本来就有 1 个班。
2. **Prisma mock 掩盖了三处坏 fixture。** `tests/plugins/learning-service.test.ts` 里三处引用了
   **不存在的主键**（`class_id: 3` 在当时只 seed 到 class 2、`subject_id: 1` 根本没有 subject、
   `teacher_id: 8` 而 user 8 是 student）。旧套件是 Prisma mock，**外键根本不生效**，
   所以这三条从未被真正验证过 —— 换成真 SQLite + 真迁移链后立刻 `FOREIGN KEY constraint failed`。
   现在有一个 `OTHER_TEACHER = { id: 12 }`，让「老师只看到自己的试卷」不再是废话。
3. **`plugins/classroom` 的写半边加密是个真实取舍**（`classroom.support.ts`）：内核注入 `decryptName`，
   但**没有** `encryptName`，而 `POST /api/students` 必须按旧格式写 `students.name`（AES-256-CBC，`iv:hex`）。
   明文落库是"把安全回退伪装成实现细节"，所以插件自己镜像了 `api/db.ts` 的算法与默认 key，
   同时**鸭子类型地**接受宿主将来注入的 `encryptName`（注入了就用，不用再改这里）。
4. **迁移一个域不保证 `deadCode` 下降。** 删掉两个模块后它停在 58 —— 新的不可达文件补上了被删的位置。
   棘轮的价值在「不上升」，不在「每轮必降」。

**实测**：`api:surface` 仍是 **297**（47 + 24 条路径换了实现者、碰撞路径仍在，集合不变）；
`routeCollisions` 峰值 71 → **0**；`adoptedTables` 34 → **50**；`npm test` 118 文件 / 767 用例全绿。

#### 独立等价性审计（112 条请求 × 5 次运行）

这一轮补了上一轮欠下的证据：用两个 worktree 把 `98bad3b`（旧）与迁移提交（新）各起一次服务，指向**逐字节相同**的种子库，跑 112 条请求 × 5 次运行，并加一列"实时工作区"作对照。

- **0 处状态码差异**（旧 vs 旧 的对照噪声也是 0）。classroom 的 POST 全 200、learning 的 POST 全 201，PUT/DELETE 200 —— `@HttpCode` 的迁移结论被实测钉住。
- **写路径 0 回归**：30 张表里 29 张逐字节相同（解密姓名 + 归一化时间戳/salt/随机邀请码之后）。`capability_assignments` 的双写一致、`records` 流水 8 行完全一致、新建学生姓名两边都是 `iv:hex:cipherhex` 的 AES、老的明文行仍可读。
- **信封**：`GET /api/classes` 两边都是 `{success, classes:[…]}`，匿名 403。**并且纠正了一个流传的说法**：`learning` 从来**没有**把 payload 平铺进信封（`legacyPayload` 在两个版本里都只出现在 `ok()` 定义处，无任何调用点传参）—— 平铺的是 pet，不是 learning。
- **一处真实漂移（已记入 `plugins/learning/plugin.json` 的 `_known_debt` #5）**：`GET /api/wrong-questions/my` 的 `mastery_score` 在库里从 `0.3` 变成 `0.30000000000000004`。公式两边逐字相同（`learning.service.ts:623`），变的是驱动绑定 double 的方式：Prisma 引擎落成"最接近 0.3 的 double"，better-sqlite3 写入原始 IEEE-754 值。**HTTP 上看不见**（`JSON.stringify(0.1+0.2)` 就是 `0.3`），只有直接从 SQLite 全精度读才不同。`knowledge_edges.weight` 对不可精确表示的输入同理。
- 另两处差异已记录/属预期：`/api/health` 的插件计数 14 → 15（`plugins/learning` 是新插件）；`DELETE /api/knowledge/nodes/2` 从"Prisma P2003 原文（含绝对路径与源码行）"变成内核信封的 `服务器内部错误`，状态码仍是 500。

**教训**：迁移一个域的价值不只是"跑通"，而是**测量**。这轮最大的收获不是 109/112 相同，而是那条 `0.3 → 0.30000000000000004` —— 它只有把两套实现的**真实响应逐条对比**才会出现，任何单测、类型检查、端点快照都看不见。

---

### P4.3b.7 · `auth` → `plugins/identity`（含 `activateUser` 端口）—— ✅ 已完成

`api/modules/auth/**`（9 文件）+ `api/services/activationService.ts` 变成一个 foundation 插件，
4 条路由（`POST /api/auth/login`、`PUT /api/auth/profile`、`POST /api/auth/register`、`POST /api/auth/activate`）
**METHOD+PATH 一个都没变**，端点数仍是 297 —— 这轮是纯粹的"实现者换了"。
它的 4 个测试文件（全部基于 `vi.mock` 的 Prisma）删掉，换成真库 + 真 `DbApi(strict)` 的
`tests/plugins/identity-service.test.ts`（29 例）与 `tests/plugins/identity-controllers.test.ts`（9 例）。

**这一轮的形状与前面几个域都不同**，值得记下来：

1. **它是第一个"给无主表找到主人"的迁移。** `users`/`activation_codes`/`activation_events`
   一直由 boot schema 建出来，但没有人拥有：旧代码走 Prisma，`api/modules/admin` 至今还走
   Prisma。所以这三张表进 `data.adopted` 后，所有权检查**第一次**对它们生效 —— 这也意味着
   任何漏写的表名会立刻在开发环境失败，而不是静默漂移。
2. **登录响应依赖两个之前不存在的 SDK 能力**，这轮才补上：
   - `ctx.settings.getPlatform(key)` —— 只读的平台设置访问器。`ctx.settings.get()` 故意加
     `plugin.<slug>.` 前缀，所以插件**根本读不到** `allow_teacher_registration`；旧代码正是为此
     去用 Prisma。新访问器**不写任何业务键名**，G5（内核零业务知识）不破。
   - `ctx.config.sessionTtlMs` —— 内核拥有会话策略，插件要签发会话就得用同一个 TTL。
3. **`ctx.auth.registerProvider` 取代了 `legacyAuthProvider`。** `POST /api/kernel/auth/login`
   在**内核路由器**里，而内核不能 import 插件（G2）、且它在插件挂载**之前**就建好了。
   解法是 `authProvider` 变成一个**可变 holder**（`{current: AuthProvider|null}`）：
   `api/app.ts` 把同一个对象分别交给 `createKernel` 与 `createPluginHost`，插件在 `setup()` 里填。
   值形态会让内核在启动时捕获 `undefined` —— 与 §5 那条"可选端口必须在调用时解析"是同一类坑，
   只不过这次的捕获点是**内核启动顺序**而不是插件 slug 顺序。
4. **两个新端口，都是为了不再跨域写表**：
   - `classroom.public` 新增 `getClassFeatureSnapshot`（登录响应要整张 `enable_*` 映射，
     `checkClassFeature` 一次只答一个布尔 **且** 用的是 `classroom.enable_*` 键空间）、
     `findClassByInviteCode`、`listStudentsByParent`、`linkParentToStudent`、
     `bindStudentToUser`（**姓名加密在这里**：`students.name` 是加密存储的，调用方直接写就会存明文）。
   - `parent_buff.public.touchParentLogin`（**注意是下划线**：服务注册表要求服务名第一段
     精确等于插件派生 slug，`slugOf('parent-buff') === 'parent_buff'`，G7 与运行时两侧都这么查）。
     家长登录的 `parent_activity` upsert 因此回到表的拥有方；identity 把它当**可选**依赖，
     在调用时 `tryUse`，所以 parent-buff 被禁用时家长照样能登录（只有活动记录会缺，并记一条 warn）。
5. **一处刻意的语义让步**：旧的 `activateUser` 在一个 Prisma 事务里同时写 `activation_events`
   和 `payment_orders`。identity **不 adopt `payment_orders`**，所以端口不做订单那半边 ——
   否则所有权检查会在开发环境直接拒绝（`strict = env !== 'production'`）。
   代价是两个写不再原子；收益是订单表只有一个写者。已写进 `plugin.json` 的 `_known_debt`，
   下一轮迁移支付时必须正面处理。

**实测**：`npm test` 116 文件 / 798 用例全绿；`check` exit 0；`api:surface` **297 不变**；
`guard` 12 文件 / 53 用例（`adoptedTables` 50 → 53，注释里逐表列明）；
`legacy-boot-probe` 新增 3 条真启动断言：真实登录拿到 token → 用该 token 打 `PUT /api/auth/profile` 得 200、
坏密码得插件自己的 401、以及 `/api/kernel/auth/login` 200（**这条就是"holder 接对了"的证据**：
没接上时它必然 503）。

**踩到的一个坑（与产品无关但会浪费一轮）**：探针里想用 `initDb()` seed 的 superadmin 登录，
却一直 401。原因是 `createApp()` 先跑 `dotenv.config()`、再跑 `initDb()`，所以**仓库里的 `.env`
会覆盖 seed 的默认凭据**（`SUPERADMIN_PASSWORD="superadmin"`）。改用 `initDb()` 里**写死**密码的
teacher（`admin`/`admin123`）后稳定通过 —— 探针要挑"不受环境变量影响"的种子。

---

### P4.3b.8 · 支付迁成 `plugins/payment`（给 SDK 加第三种 tier）—— ✅ 已完成

`api/modules/platform/**` + `api/services/paymentService.ts` + `api/services/paymentProviders/**`
变成一个 `tier: "infrastructure"` 的插件。3 条路由（`POST /api/payment/create`、
`GET /api/payment/status/:orderNo`、`POST /api/payment/notify`）METHOD+PATH 不变，端点数仍是 297。
**`api/modules/platform` 从 P4.3b.5d 起就不是一个功能域了**（parent-buff 走掉之后只剩基础设施），
这一轮把它彻底关掉：`api/modules/**` 现在只剩 admin / engagement / insights 三个真域。

#### §8.9 悬了三轮的那个决定，是这样落地的

| 选项 | 为什么被否 |
|---|---|
| 放内核侧 | 内核要认识 `payment_environment`、`payment_orders`、微信/支付宝 provider 层 —— 直接违反 **G5**（内核零业务知识）。这不是风格问题：G5 在 P4.3c.2 已经真的挡下过一次同类改动 |
| 当 `feature` 插件 | `feature` 的语义是"可以被随手关掉"，而它**拥有真实订单**。把它标成 feature 等于宣称线上可以安全地关掉收款 |
| **加第三种 tier** | `'foundation' \| 'feature' \| 'infrastructure'`：不是域、不能被关（`required: true`）、但也不进 foundation 的加载序（没有插件在 `setup()` 里解析它的端口） |

早先几轮那句"把 `api/services/**` 搬进插件就是把基础设施当业务迁"——**判断是对的，结论是错的**：
它需要的不是"别搬"，而是一个能说明它是什么的 tier。这个 tier 只改了 4 处（契约类型、manifest 校验、
resolver 的排序注释、G7 的 tier 集合），因为**只有 resolver 真的按 tier 分支**（实测 grep 过全仓）。

#### 跨插件写的那笔账，这轮改了**顺序**而不是只写注释

旧的 `activateUser` 在**一个** Prisma 事务里写 `activation_events` **和** `payment_orders.status`；
`markOrderPaid` 又在 `status === 'PAID'` 时提前返回。这个组合有一个洞：
**如果进程死在两次写之间，重试会发现事件已存在、直接返回，订单永远停在未支付。**

identity 不 adopt `payment_orders`（所有权检查会在开发环境直接拒绝），所以这轮把顺序**倒过来**：
先 `identity.public.activateUser`（幂等，按 `(userId, source, activationCode, orderId)` 去重），
再在本插件自己的事务里写 WEBHOOK + 置 PAID。进程死在中间 → 订单仍是未支付 → 重试重新进入 →
端口返回同一个事件 → 订单这半边补完。跨插件边界**仍然不是原子的**（没有分布式事务这种东西），
但现在"重试一定能收敛"，而旧顺序是"重试永远收敛不了"。这一条有专门的测试
（`payment-service.test.ts` 的「converges when the first attempt died after activating but before settling」）。

#### 实测挖出的两件事

1. **`expires_at` 有两种格式，字符串比较会漏判。** 这个插件写 ISO-8601（`...T...Z`），而
   raw SQL seed 的行是 SQLite 的 `YYYY-MM-DD HH:MM:SS`；SQLite 按字典序比较，
   `'2020-01-02 03:04:05' < '2020-01-02T03:04:05.678Z'` 对**同一时刻**是 **false**。
   所以"在 SQL 里比 `expires_at < ?`"会让 seed 过的订单**永远不过期**。
   现在两种格式都显式解析（空格形式补 `Z`，因为它就是 UTC），并由调用方决定是否过期。
   测试同时覆盖两种格式。
2. **家长登录会吃掉当天的祝福 —— 这是既有的 bug，不是本轮引入的。**
   祝福的守卫是 `WHERE student_id = ? AND date(created_at) = ?`，**没有 `activity_type` 过滤**，
   所以当天任何一行都算"已祝福"；而家长登录正好写这样一行。
   **已用 git 核对**：迁移前的 `platform.service.createParentBuff`（`05817b8~1`）跑的是逐字相同的查询，
   旧的 `auth.service` 家长分支也会写那行 —— 也就是说这条产品行为在 P4.3b.5d 之前就存在。
   这轮**没有**顺手修（它改的是产品路由的应答），而是用 `tests/plugins/parent-buff-port.test.ts`
   把现状钉住，并写进 manifest 的 `_known_debt`：修法是加一个谓词，但该由拥有那个决定的一轮来做。

**实测**：`npm test` 117 文件 / 821 用例全绿；`check` exit 0；`api:surface` **297 不变**；
`guard` 12 文件 / 53 用例（`adoptedTables` 53 → 55、G7 的 tier 集合加 `infrastructure`）；
`legacy-boot-probe` 新增 1 条**真启动端到端**断言：登录 → 建单 → 缺签名被 401 拒 →
带 `mock-valid-signature` 的 webhook 返回字面量 `success` → 订单读回 `PAID`
→ **`PUT /api/auth/profile` 的 `is_activated` 变成 true**。
最后这一步才是关键：`is_activated` 在 identity 的表里、订单在 payment 的表里，
两个都变了才证明跨插件的开通端口真的跑了 —— 任何 fake 都证明不了这件事。

---

### P4.3b.9 · 两条数据路径保证指向同一个库（P4.3b.5c 发现 #1 的收尾）—— ✅ 已完成

**这不是新问题**：§9 的 P4.3b.5c 发现 #1 五轮前就记下了 —— `.env` 的 `DATABASE_URL` 与
`DATABASE_FILE` 是两个独立设置，一旦只设置后者，Prisma 与 `api/db.ts` 就指向两个不同的文件。
当时判断是"归 P4.3c.3 一起收尾"。这一轮**重新实测后决定提前修**，因为它不是配置整洁度问题：

```
as shipped（只有 .env）      app -> <root>/database.sqlite    prisma -> <root>/database.sqlite    一致
DATABASE_FILE 被覆盖         app -> <tmp>/app-only.sqlite     prisma -> <root>/database.sqlite    分歧
```

**分歧的后果是静默的错误答案**：Prisma 把 `users` 行插进真实库，而请求经 `better-sqlite3`
从临时副本把它读出来 —— 行存在，答案是"没找到"。而**谁在设置 `DATABASE_FILE`？测试与探针**，
也就是最谨慎的那批人。`plugins/payment` 从另一侧记录了同一个陷阱（它坚持两个访问路径都用 `ctx.db`）。

**修法**：`api/prismaClient.ts` 用**与 `loadConfig` 完全相同的规则**解析库文件，并把该路径作为
datasource URL **显式**传给 `PrismaClient` —— 显式 datasource 优先于 `.env`，所以
`DATABASE_URL` 在运行时不再决定任何东西。部署脚本往 `.env` 写 `DATABASE_URL` 的那几行因此变得无害。

**新增 `tests/kernel/database-path-alignment.test.ts`（4 例）**，覆盖三种会静默回归的方式：

1. 解析规则漂移 —— 两条路径在 `DATABASE_FILE` 被设置时都解析到**同一个**值；
2. 覆盖不再抵达引擎 —— **真起一个子进程**（`DATABASE_FILE=<tmp>` 且 `DATABASE_URL` 故意指向别处）
   导入 `api/prismaClient.ts`，用 `PRAGMA database_list` 读出 Prisma **实际打开**的文件，
   断言它是那个临时文件。子进程是必需的：`PrismaClient` 在模块加载时构造，
   进程内测试要么复用先前导入的客户端（等于什么都没测），要么无法二次导入；
3. 出现**第四个**读取者 —— 扫描全仓（先剥注释）确认只有三个已知所有者。

**变异验证过非空转**：把 `api/prismaClient.ts` 改回 `new PrismaClient()` → 4 条全部失败。

**过程中自己踩的一个坑，值得记**：第一版探针**自己 `new PrismaClient()`**，所以它测的是
"Prisma 读 `.env` 的行为"，而不是被测代码 —— 修好之后它仍然报 `DIVERGENT`，一度让人以为修法无效。
**探针必须走生产路径，否则测的是探针本身。**

**顺带查出的第三处路径规则**：`api/db.ts` 直接 `new Database(dbPath)`，自己复制了一份
`path.resolve(process.cwd(), process.env.DATABASE_FILE)`。它是 legacy 组装的 `db` 句柄，
目前**解析到同一个文件**（所以没有活跃 bug），但它是一条**独立的 better-sqlite3 连接**，
也是第三个路径规则的副本 —— 已作为已知债务写进那条测试的枚举列表。admin 迁移完
（Prisma 在运行时的唯一消费者）之后，这两条重复路径应该合并。

---

### P4.3b.10 · `engagement` 迁成 `plugins/engagement`（§8.9 的两个阻塞点各自了结）—— ✅ 已完成

`api/modules/engagement/**`（785 行、17 条路由、9 个控制器、10 张表）变成一个 feature 插件。
METHOD+PATH 不变，端点数仍是 297。**`api/modules/` 因此只剩 `admin` 与 `insights`。**

§8.9 给这个域列了两个阻塞点，这轮分别处理：

| 阻塞点 | 处理 |
|---|---|
| ① 它**直接写 `pets`**（`UPDATE pets SET experience, level, attack_power, mood`）——那是 pet 插件的表，而 `data.reads` **连描述都描述不了写** | ✅ 新增 **`pet.public.grantPetExperience({studentId, expGain, mood})`**。成长公式（等级只升不降、上限 6、`Math.floor(exp*0.1) ‖ 10`）留在 pet 里 —— 消费方若自己重算就成了同一规则的第二个实现 |
| ② 与 marketplace **双写 `redemption_tickets`** | ⚠️ **本轮不解决，改为写明**：它是 G10 的 `SHARED_WRITE_TABLES` 明示例外。真正修好需要给 marketplace 设计端口**并同时迁移那个域**，那会把两轮的工作压成一轮。manifest 里 `_known_debt` 第 1 条记的就是这件事 |

另外两处结构性改动：

- **积分 + 流水合并成一个端口方法**：幸运抽奖原来在一个事务里 `UPDATE students.available_points` 再 `INSERT records`。拆成 `transferStudentCredits` + `recordStudentLedgerEntry` 会让进程死在两者之间时留下"扣了分但没有流水"的账 —— 所以新增
  **`classroom.public.spendStudentCredits({studentId, delta, entry})`**，一次调用两个写。
- **三个 JOIN 换成端口**：`praises` / `certificates` / `messages` 原来 JOIN `students`（还要解密姓名）、`users`（非学生发送者的用户名）和 `classes`（`enable_achievements` 开关），`messages` 还有一个取"最新成就"的相关子查询。这些都是**穿着查询外衣的跨插件读表**。现在改成 `listStudentNamesByIds`（批量、解密在 classroom 侧）、`identity.public.getUserById` 与 `getClassFeatureSnapshot`，由调用方按原来的顺序拼回响应。`user_achievements` 由本插件自己读。

#### 这一轮最值得记的事：**我"顺手修好"了三个状态码，被探针抓回来**

新写的控制器里，我把 legacy 的 `legacyError()` 实现成了内核的 `ApiError`，并把 catch 里的
`if (error instanceof HttpException) throw error` 改成了 `if (error instanceof ApiError) throw error`
—— 看起来是同一件事、还更一致。**实际上它悄悄改掉了三个状态码**：

- `legacyError` 是 Nest 的 `HttpException`，而内核的 `ApiError` 是**另一个类**。legacy 的 catch 只重抛 `HttpException`，所以控制器自己抛的 400/404 能通过，而**特性开关和 `getStudentById` 抛的 `ApiError` 会被吞成 500**。
- 改成 `instanceof ApiError` 之后：`GET /api/family-tasks`（无参数）从 legacy 的 **400** 变成 500；`?studentId=999` 从 legacy 的 **500** 变成 404；`/api/danmaku` 的开关从 **500** 变成 403。
- **三个都是"更好"的状态码，但都不是本轮该做的决定**。发现方式是真启动 + 真 HTTP 的探针（`.tmp/engagement-smoke.mjs`，11 条请求），不是任何单测 —— 单测里只断言 service 层，看不到 catch 分支。

**已全部改回 legacy 行为**，并把这条既有缺陷写进 manifest 的 `_known_debt` 第 4 条
（修法是每个 handler 加一个 `|| error instanceof ApiError`，但它改的是产品路由的应答，
该由拥有那个决定的一轮来做）。**`legacyError` 因此刻意保持返回 `HttpException`**，
注释里写明了原因 —— 这是一个"看起来该统一、但不能统一"的地方。

**教训**：迁移中最危险的改动不是搬代码，而是搬的过程中"顺手把明显的 bug 修掉"。
它不会让任何测试变红，只会让线上多出三个没人要求的状态码变化。

**实测**：`npm test` 118 文件 / 835 用例全绿；`check` exit 0；`api:surface` **297 不变**；
`guard` 12 文件 / 53 用例（`adoptedTables` 55 → **65**、`deadCode` 58 → **59** —— 后者是
`src/features/engagement/api/praisesApi.ts` 因失去最后一个引用者而不可达，属 P7 的清理清单，
本轮**记录并解释**而不是顺手删除）；真启动探针 11/11（含 500-vs-403 这类只在真实响应里才看得见的行为）。

---

### P4.3b.11 · admin 级联的实测与 G13 的第二个方向 —— ✅ 已完成（测量 + 护栏，非迁移）

这一轮没有迁域。它做的是**把 admin 迁移的前置未知数测量清楚**，并补上一条一直缺的护栏 ——
因为 admin 是本项目剩下最大的一块（940 行 repository + 58 张表的级联），在不知道约束的情况下动它
只会重演 §0 那个反面教材。

#### 1. 级联的规模与**原子性约束**（`数量来自 scripts/migration/probes/admin-cascade-inventory.mjs`）

`DELETE /api/admin/users/:id` → `deleteTeacherCascade` 删 **58 张表 / 65 条语句**（2 读 63 写），
全部包在**一个** `prisma.$transaction` 里。

**这个"一个事务"就是它不能简单端口化的原因**，而本文档此前只说了"要改成调各域端口"，
没说清代价：65 个端口调用 = 65 个独立事务，进程死在中间会留下**半删的账号** —— 一个今天不可能出现的状态。
所以 admin 迁移真正的决策不是"改成端口"，而是**在原子性与所有权之间选一个**：

| 方案 | 代价 |
|---|---|
| 各域发布级联删除端口 | 失去原子性 + 要给约 15 个域各设计一个删除方法 |
| 让插件按脚本注册自己的清理规则 | 保留原子性 + 内核要按名字执行 58 张表的删除（**与 G5 的张力需要正式裁决**） |
| 不动它 | 保持现状：`admin` 继续是唯一绕过所有权模型的写者，P7 的表改名也做不了 |

**本文档不替它做决定** —— 这是一个需要正式裁决的架构分叉，不是一次重构。

#### 2. 级联的第一次真库测试

`tests/plugins/admin-cascade.test.ts`（6 例）是**它第一次真正执行**：此前只有 mock 掉 Prisma 的
`admin.module.test.ts`。它在临时库上跑真级联，断言账号识别行、班级、学生、以及**六个域拥有的行**
（`pets`/`records`/`praises`/`certificates`/`attendance_records`/`assignments`+`student_assignments`）
和内核的 `operation_logs` 都被清掉，并断言保留的 superadmin 不受影响。

两个副产物值得记：

- **它必须用真文件库，并且靠 P4.3b.9 才安全**：`api/prismaClient.ts` 在模块加载时读 `DATABASE_FILE`，
  所以测试里动态 import（静态 import 会被提升，那会在 `beforeAll` 之前就用真库构造客户端）。
  **没有 P4.3b.9 的话，这个测试会去删开发者的 `database.sqlite`。**
- **第一版断言 `operation_logs` 计数为 0，错了**：级联先删掉种子行，再在**同一个事务里**写入自己的审计行，
  所以结果是 1。删掉和"记录这次删除"是一个单元 —— 这正好也说明了为什么原子性值得保留。

#### 3. 一条此前没人看到的 schema 漂移（已加护栏）

`scripts/migration/probes/admin-cascade-fk-coverage.mjs` 数出 **61 张表**持有指向 `users`/`classes`/`students` 的外键，
其中**只有 `blind_boxes`** 没被级联清理。继续查下去发现真正的问题不是级联：**`blind_boxes.teacher_id`
在 boot DDL 里是 `REFERENCES users(id)`，却不在 `prisma/schema.prisma` 的模型里**。

`scripts/migration/probes/schema-prisma-column-drift.mjs` 把两个方向的差集都量了一遍：**SQLite 有而 Prisma 没有的列恰好 2 个** ——
`blind_boxes.teacher_id`（**没有任何代码写它**：`plugins/marketplace` 的插入语句是
`(name, description, price, is_active)`，所以那列永远是 NULL）与 `peer_reviews.team_quest_id`
（`0000c` 加的，collaboration 在用，合法）。

**新增 G13 的第二个方向断言**：`tests/guardrails/boot-schema-completeness.test.ts` 现在会解析两份定义，
断言"SQLite 有而 Prisma 模型没有的列"集合**精确等于**那两个已知项。多一个就报错并点名。
**变异验证过非空转**：往 boot DDL 里塞一个 `mutation_probe INTEGER`，断言立刻报 `shop_items.mutation_probe`。

**为什么这条护栏值钱**：Prisma 看不见这样的列（`SELECT *` 不返回、`create` 设不了），
而 `ctx.db` 裸 SQL 读写自如 —— **两条数据路径对"一行是什么"的理解不一致**，
而且它不会被 G13 原有的两个方向（有表 / 有列清单）发现。`blind_boxes.teacher_id` 的清理属于 P7：
它要么被删列，要么被补进 Prisma 模型，两者都是 schema 迁移。

**实测**：`npm test` 119 文件 / 842 用例全绿；`check` exit 0；`api:surface` **297 不变**；
`guard` 12 文件 / **54** 用例（G13 多一条）。

---

### ⚠️ P4.3b.5c 的三个实测发现（都很容易再踩）

#### 1. `.env` 把 Prisma 与 `api/db.ts` 指向了**两个不同的库**

- Prisma 的 datasource 是 `env("DATABASE_URL")`，而 `.env` 里写死 `DATABASE_URL="file:../database.sqlite"`。
- `api/db.ts` 走 `DATABASE_FILE`（默认 `process.cwd()/database.sqlite`）。

**实测**（`.tmp/prisma-vs-db-probe.mts`，设 `DATABASE_FILE=.tmp/x.sqlite`）：

```
api/db.ts file:  ["D:\\think-class\\.tmp\\payment-probe2.sqlite"]
prisma    file:  ["D:\\think-class\\database.sqlite"]
```

所以设了 `DATABASE_FILE` 之后，**应用与 Prisma 在不同库上工作**。之前"内核组装下读到空表/缺表"的很多现象都有这一半原因。
**探针/测试凡是走 Prisma 的，不能再靠 `DATABASE_FILE` 隔离** —— 要么不覆盖它（就用 `database.sqlite`），要么同时设 `DATABASE_URL`。
这是环境配置缺陷，尚未修（它属于 P4.3c.3 的收尾，与"内核单独部署"一起做更合适）。

#### 2. `payment_orders` / `payment_transactions` **两个模型根本没有表**

它们只在 `prisma/schema.prisma` 里，boot DDL 里没有、`database.sqlite` 里也没有。后果是实测出来的（`.tmp/payment-live-probe.mts`，legacy 组装 + 全新库）：

```
POST /api/payment/create          -> 500   no such table: payment_orders
GET  /api/payment/status/:orderNo -> 500   （同上）
POST /api/payment/notify          -> 401   'Invalid signature'  ← 更早失败，根本没碰到表
```

**整个 `/api/payment` 面在任何靠 boot schema 建起来的库上都是死的**，只有 `prisma db push` 建过它们。
`activation_codes`/`activation_events` 一直在 boot DDL 里，正是这个对比让人漏掉了它们。

**修法**：新增 `api/schema/paymentTables.ts`（`0000b_payment_tables`，`owner: 'legacy'`），
列定义取自 Prisma 自己的输出（`prisma migrate diff --from-empty --to-schema-datamodel`），不是手抄近似值。
两处刻意翻译：唯一索引在 Prisma 输出里叫 `sqlite_autoindex_payment_orders_1`，而 SQLite 只允许隐式约束占用这个名字，
所以写成列上的 `UNIQUE`（结果就是同一个索引）；`updated_at` 默认 `CURRENT_TIMESTAMP` 但**没有触发器去更新它**，
与 Prisma schema 一致，本轮不半修。

**修完实测**（`.tmp/payment-real-db-probe.mts`，不覆盖 `DATABASE_FILE`，两个连接都落到 `database.sqlite`）：

```
prisma payment_orders count: 0                  ← Prisma 终于能看见表了
POST /api/payment/create   -> 200 {"success":true,"message":"订单创建成功","data":{...}}
GET  /api/payment/status   -> 200
transactions recorded: [{"transaction_type":"CREATE","status":"AWAITING_PAYMENT","provider":"wechat"}]
```

`/api/payment/notify` 仍是 401（mock provider 的签名校验），这一条**不在本轮范围内**，未改动。

#### 3. **绝对不能改已应用的迁移**（本轮差点酿成部署事故）

本轮第一次实现是**把两张表追加进 `0000_legacy_boot_schema` 的 SQL**。这是错的，而且错得很危险：
字符串迁移的 checksum 就是那段 SQL，`runMigrations` 对已应用的迁移做 checksum 比对，不一致就**直接抛错拒绝启动**：

```
migration "0000_legacy_boot_schema" was modified after it was applied
(recorded <a>, now <b>). Add a new migration instead of editing an applied one.
```

也就是说，那次改动会让**每一个已经迁移过的库**（包括线上库）在启动时崩掉。已 `git checkout` 撤回。
正确做法就是现在的样子：**新的、id 排在后面的迁移**（`0000b_` 排在 `0000_` 之后、`0001_` 之前，
所以 `users` 表先存在，外键才建得起来）。

**G13 现在同时盯住两个维护方向**（`tests/guardrails/boot-schema-completeness.test.ts`）：

- 正向（原有）：每个插件 manifest 声明的表都必须被建出来；
- **反向（本轮新增）**：**每个 Prisma 模型都必须有表**。这条如果早存在，发现 #2 会当场被拦下。
  已用**变异验证**过它非空转：临时把 `paymentTablesMigration` 从清单里去掉，测试立刻报
  `prisma model "payment_orders" has no table in the application migrations`。

#### 实测数字

```
prisma models: 79        迁移建出的表: 80        （80 = 79 个模型 + __core_migrations 账本）
models with NO table: 0  tables with no model: 0
```

---

### P4.3c · `api/db.ts` 启动期 DDL —— 🔶 进行中

**P4.3c.1 已完成**：`initDb()` 里那 787 行 DDL（79 张表 + 60 个索引）收编为编号迁移：

```ts
export const BOOT_SCHEMA_MIGRATION_ID = '0000_legacy_boot_schema';
export const bootSchemaMigration: Migration = { id: ..., owner: 'legacy', up: `...787 行 SQL...` };
```

- `initDb()` 现在直接 `runMigrations(db, [bootSchema, paymentTablesMigration])`，然后**照旧**每次启动执行 seed 段
  （首页内容、14 条 settings、`addColumnIfNotExists` 兼容列）—— 行为逐字不变。
  （原文这里写的是"先 `ensureAdoptedSchema(db)`"，那个函数连同 `api/schema/adoptedTables.ts` 已在 **P4.3c.2** 删除：它曾与 boot DDL 重复定义 6 张表，且 P4.3c.2 移走 DDL 时正是这 6 张表静默消失、测试却全绿的原因。）
- **注意**：`ensureAdoptedSchema` / `ensureReadOnlyLegacyTables` 这两个名字在旧笔记、旧探针（如 `.tmp/collaboration-probe.mts`）和 `plugins/challenge/plugin.json` 的 `_reads_note` 里都出现过，**它们现在都不存在**。看到就当过时信息处理。
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
- kernel 组装：`api/app.ts` 用 **`createKernel({ migrations: [bootSchemaMigration, paymentTablesMigration] })`** 注入它
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

### P4.3c.3a · 迁移链补全 schema（1 列 + 19 索引）—— ✅ 已完成

**发现**：P4.3c.2 的「两套组装共用同一份 DDL」只对了一半。共用的只有 `CREATE TABLE` 那一段；
`initDb()` 后面还有约 120 行兼容 DDL（53 个 `addColumnIfNotExists`、3 个裸 `ALTER TABLE ... ADD COLUMN`、
20 条 `CREATE INDEX`），而 `initDb()` **只在 legacy 组装里跑**。实测（`.tmp/schema-gap-probe.mts`，
真 `createKernel()` 启动后逐条核对）：

```
kernel 组装实测：83 表 / 65 索引
MISSING COLUMNS (1):  parent_activity.last_active_date
MISSING INDEXES (19): idx_parent_activity_parent_student（UNIQUE）、idx_classes_invite_code（UNIQUE）+ 17 条
```

第一次跑探针时还报了 `operation_logs.user_id`/`role`（以及 20 个索引）—— 那是探针自己的错：
它只跑了应用迁移、没跑内核迁移。`operation_logs` 那两列由内核自己的 `0005_kernel_operation_logs` 负责，
`idx_operation_logs_teacher_id` 也是它建的。**教训：探针必须跑"生产真正会跑的那套迁移"，否则量出来的是探针的形状，不是产品的形状。**

**修法**（`0000c_legacy_compat_columns` + `0000d_legacy_compat_indexes`）：

- 兼容语句**整体搬进迁移，一条不删**。它们是老库的升级路径：`CREATE TABLE IF NOT EXISTS` 对已存在的表什么都不做，
  老库的列全靠这些 ALTER 补上 —— 删掉等于把所有现存库留在旧形状。
- 列用**函数迁移**（SQLite 没有 `ADD COLUMN IF NOT EXISTS`）：`0000c` 先 `PRAGMA table_info` 再 ALTER，因此
  对已经跑过 legacy ALTER 的库是 no-op。
- 19 个索引用**字符串迁移**：全是 `IF NOT EXISTS`，本身幂等，可以保留"checksum = SQL 文本"这种搬家安全的形态。
  `idx_operation_logs_teacher_id` **不搬** —— 内核 `0005` 已经建了它，搬过来就是一个索引两个主人。
- `api/db.ts` 里的对应语句全部删除，`initDb()` 现在只剩 DML（seed、邀请码回填、`messages` 重建）。
- 新增 `api/schema/appMigrations.ts`：**两套组装共用的唯一迁移清单**。之前这份清单有三份手抄副本
  （`api/db.ts`、`api/app.ts`、G13 测试），那正是漂移的成因；G13 的副本还要求"每个迁移的 `up` 必须是字符串"，
  所以它连函数迁移都跑不了。

**两个必须记住的 checksum 陷阱**：

1. **函数迁移的 checksum 是 `up.toString()`，即"转换后的源码"，不是文件里的文本。**
   实测：tsx/esbuild 会把 `['a', 'b']` 重写成 `["a","b"]`。本项目服务端用 `tsx api/server.ts` 直接跑、
   **不打包**，所以同一个函数在各处 `toString()` 一致 —— 但**一旦给服务端加打包/压缩，每个函数迁移都会 checksum 失配、
   拒绝启动已迁移的库**。内核的 `0005_kernel_operation_logs` 已经依赖这个前提。
   （这也是 `0000c` 的列清单必须写在 `up` **函数体内部**的原因：写在模块顶层的话，改清单不会改 checksum，
   已迁移的库会永远停在旧形状，而且静默。）
2. **已应用的迁移一个字都不能改**（§上文 P4.3b.5c 发现 #3），所以两个新迁移的 id 都排在 `0000b_` 之后。

**实测（四种场景，全部真启动）**：

| 场景 | 结果 |
|---|---|
| 全新库 + kernel 组装 | ready；86 表 / 89 索引；`last_active_date` 在；19 个兼容索引齐；两个 UNIQUE 都是 `CREATE UNIQUE INDEX` |
| 全新库 + legacy 组装 | 同上（86 / 89，逐项一致）—— **两套组装现在产出同一个 schema** |
| 真实 13MB 库（副本）+ legacy 组装 | ready；既有 ledger checksum **一字未变**（`83c1006f…`、`35ed6b97…` 等 8 条前后完全相同），新增 2 行 ledger；数据完好（11 users / 3 students / 5 classes） |
| 真实库（副本，legacy 建的）+ **kernel** 组装 | ready；列与 19 索引全在，数据完好 —— 这是 P4.3c.3 要的"kernel-only 部署在既有库上"路径 |

**新增护栏 G17**（`tests/guardrails/schema-lives-in-migrations.test.ts`，5 个用例）：
`api/db.ts` 不得出现 `addColumnIfNotExists` / `ADD COLUMN` / `CREATE INDEX`；剩下的 DDL 被**逐条枚举**
（当前只有 `messages` 重建那三条），多一条就报错、少一条也报错（棘轮）；19 个索引必须在迁移建出的库里存在
且两个 UNIQUE 仍是 UNIQUE；列清单必须在 `up` 函数体内；两套组装必须引用同一份清单。
**变异验证过非空转**：去掉一个索引语句 → 报 `compatibility indexes not created`；把 UNIQUE 改成普通索引 →
报 `must stay UNIQUE`；往 `api/db.ts` 塞回一条 ALTER → 报两条断言；删掉 `parent_activity` 那一列 →
G13 报 `read by name but is not created`、G17 报列数 52 < 53。

**P4.3c.3 剩余待做**：schema 仍是**一整块**，kernel-only 部署会建出全部业务表。
按域拆分 migration 之后，kernel 才能只建自己需要的表。
~~**收尾时一并解决**：`.env` 的 `DATABASE_URL` 与 `DATABASE_FILE` 两个独立设置指向同一个库这件事（见上文 P4.3b.5c 发现 #1），
应该收敛成一个来源，否则"内核单独部署"永远无法配出一个 Prisma 与应用都对的库。~~
→ ✅ **P4.3b.9 已解决**（比原计划提前，因为它是个会静默给出错误答案的陷阱，见 §9 的 P4.3b.9 记录）。
**另外还欠一笔**：`api/db.ts` 里 `messages` 表的重建（去掉 `sender_id` 外键）仍是只在 legacy 组装里跑的 DDL ——
kernel 组装下那个外键还在。它被 G17 逐条枚举着，收编它就意味着把 G17 的允许清单降到空。

- 注意 `messages_new` 只存在于原始 SQL、不在 Prisma。
- ~~`payment_orders`/`payment_transactions` 只存在于 Prisma（不在 `initDb` 的 DDL 里）~~ → **P4.3b.5c 已修**：
  新增 `0000b_payment_tables` 迁移，G13 现在会拦住这类"有模型没表"的缺口（见上文）。

### P5 · 前端插件化
- 删掉 62 个一行 shim（`src/features/*/pages/*`），把真实 UI 从 `src/pages/<Role>/` 移入插件
- `AppRoutes.tsx` 的 80 个 `<Route>` → 注册表驱动 + `import.meta.glob` 组件映射 + 服务端下发的路由清单
- 4 个布局的硬编码菜单（Teacher 25 / Student 22 / Admin 10 / Parent 6 项）→ `MenuRegistry`
- ~~`src/lib/classFeatures.ts` 的 19 键 → 从插件 manifest 派生~~ ✅ **P5.1 已完成**：
  目录由 `plugins/classroom/plugin.json` 生成（`npm run class-features`），路由映射移到 `src/lib/featureRoutes.ts`，
  `PublicPluginDescriptor` 现在带 `permissionDeclarations`（键 + 标签 + 作用域）。新增 **G14** 保证生成物与 manifest 不漂移。
- ~~用 `window.__TC_CONFIG__` 取代 `scripts/deploy-common.sh` 里的 `sed /beiadmin`~~ ✅ **P5.3a**：
  但实测发现这条链**从来没通过**，两半都断了，见 §8.11。现在 `ADMIN_PATH=/x` 改环境变量 + 重启即可。
- ~~复活从未挂载的 `src/components/ErrorBoundary.tsx`~~ ⚠️ **该文件已在工作区清理中删除**（从未被 `import`，属确认死代码）：P5 若仍要错误边界，需**重新实现**而不是挂载旧文件

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
| 1 | ~~`getActiveKernel()` 是**服务定位器**~~ → **P4.3b.7 少了一个消费者**：`POST /api/auth/login` 改用 `ctx.sessions`，`legacyAuthProvider` 也删了。但 `getActiveKernel()` 本身还在（`api/utils/classFeatures.ts`、admin 侧仍在用），要等那些调用点迁移完才能删 |
| 2 | ~~`api/modules/auth/legacyAuthProvider.ts` 是临时 `AuthProvider` 实现~~ → **P4.3b.7 已删**：改由 `plugins/identity` 在 `setup()` 里通过 **`ctx.auth.registerProvider`** 注册凭据校验器。`createKernel`/`createPluginHost` 的 `authProvider` 参数现在是**一个可变 holder**（`{current: AuthProvider|null}`），因为内核路由器在插件挂载之前就建好了 —— 值形态会让内核在启动时捕获 `undefined`，`/api/kernel/auth/login` 永远 503 |
| 3 | 只有调用 `requireActorRole` 的路由受保护；多数路由直接读 `actor.id`。系统性授权随插件权限声明落地 |
| 4 | ~~G8 端点快照只扫 `api/**`~~ → **P4.3b.0 已修**：扫描范围已含 `plugins/**`；快照从 288 更正为 292（原数字是漏扫） |
| 5 | kernel 模式下未匹配的 `/api` 路径由 Nest 的 not-found 应答，不是内核信封 |
| 6 | `system_settings` 默认值在前后端各一份（G9 强制一致），P4/P5 应合为插件声明 |
| 7 | `DEFAULT_SYSTEM_SETTINGS` 是 G9 保护的"受控重复"，不是疏忽 |
| 8 | 定时任务（`provides.jobs`）在启动时被**明确拒绝**并给出原因 —— 不是静默忽略；调度器属 P6 |
| 9 | **`admin.repository.ts` 是跨域写者的最后一块**：它经 Prisma `$transaction` 直接删/建 `users`、`activation_codes`、`activation_events`、`students`、`classes`、以及各玩法域的表（§8.3.1 已逐行列出），`DbApi` 的所有权检查对它无效。admin 迁移时必须改成调各域端口 |
| 10 | **`plugins/learning` 的 5 张同簇表无主**（`rubric_point_scores`/`knowledge_products`/`notes`/`note_assets`/`note_products`）：没有任何路由碰它们，所以刻意没进 `data.adopted`。P7 决定删除还是归属 |

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
| `api/schema/appMigrations.ts` | **两套组装共用的唯一迁移清单**（P4.3c.3a） |
| `api/schema/legacyCompatColumns.ts` | 53 个兼容列的函数迁移（含 checksum 陷阱说明） |
| `api/schema/legacyCompatIndexes.ts` | 19 个兼容索引（2 个是 UNIQUE 完整性约束） |
| `scripts/migration/lib/analysis.mjs` | 所有度量的单一实现 |
| `tests/guardrails/` | 已实现的护栏（G1–G17）+ 棘轮额度 |
| `tests/guardrails/schema-lives-in-migrations.test.ts` | **G17**：`api/db.ts` 不得再带 schema DDL |
| `tests/plugins/pet-service.test.ts` | pet 域的语义（死亡时钟/等级上限/端口边界），替代 `api/modules/pet/pet.service.test.ts` |
| `tests/plugins/pet-controllers.test.ts` | 17 条旧路由的**逐条信封**断言 + 插件自有别名的权限门 |
| `plugins/classroom/src/classroom.controllers.ts` | 六个控制器 / 47 条 METHOD+PATH，P4.3b.6b 从 `api/modules/classroom` 逐字搬入 |
| `plugins/classroom/src/classroom.support.ts` | `requestActor` 与**写半边加密**（宿主只注入 `decryptName`，插件自己镜像 `api/db.ts` 的 AES-256-CBC 与 `iv:hex` 格式） |
| `tests/plugins/classroom-controllers.test.ts` | 47 条路由的清单、两个 class base、每个 POST 的 200、以及错误翻译 |
| `plugins/learning/src/learning.repository.ts` | 该域全部手写 SQL（16 张 adopted 表）；`data.reads` 为空，学生的唯一入口是端口 |
| `tests/plugins/learning-service.test.ts` | 真迁移链建库 + 真 `DbApi(strict)` 的 repository 测试；Prisma mock 换成真 SQLite |
| `tests/plugins/learning-controllers.test.ts` | 信封（`{success,data}` 不扁平）、四条裸 `{success:true}`、**无 `@HttpCode`**（POST 201）、401/403 分界 |
| `plugins/identity/plugin.json` | identity 的清单：3 张 adopted 表、4 条路由、`identity.public` 端口，以及 `_known_debt` 里那笔"不再跨域写 payment_orders"的取舍 |
| `plugins/identity/src/identity.service.ts` | 登录 / 个人资料 / 注册 / 激活 + `activateUser` 端口；跨域一律走端口（`parent_buff.public` 按可选依赖在调用时解析） |
| `plugins/identity/src/identity.repository.ts` | `users`/`activation_codes`/`activation_events` 的全部 SQL（含"已应用的激活码"守卫写与 activation 的单事务） |
| `plugins/payment/plugin.json` | payment 的清单：`tier: "infrastructure"`、2 张 adopted 表、3 条路由、`dependsOn: identity`，以及"两笔写不能原子"的诚实记录 |
| `plugins/payment/src/payment.service.ts` | 建单 / 查单 / webhook；**先开通再置 PAID** 的顺序就是为了让重试收敛（文件头写了旧顺序的那个洞） |
| `plugins/payment/src/payment.repository.ts` | `payment_orders`/`payment_transactions` 的全部 SQL，含 `expires_at` 两种格式的说明 |
| `tests/plugins/payment-service.test.ts` | 真迁移链建库 + 真 `DbApi(strict)` + 真 MockProvider；含"死在两次写之间后重试收敛"的用例 |
| `tests/plugins/parent-buff-port.test.ts` | `parent_buff.public.touchParentLogin` 与祝福行共存；并钉住既有 bug「当天登录会吃掉当天祝福」 |
| `plugins/engagement/src/engagement.service.ts` | 17 条路由的业务逻辑；三个 JOIN 换成端口，积分+流水合并成 `spendStudentCredits` 一次调用 |
| `plugins/engagement/src/engagement.controllers.ts` | 9 个控制器；**`legacyError` 刻意返回 Nest 的 `HttpException` 而非内核 `ApiError`**，注释解释了为什么不能统一 |
| `tests/plugins/engagement-service.test.ts` | 真迁移链 + 真 `DbApi(strict)`；含"写不到别的域的表"的证明与每个 gate 的 404/403 映射 |
| `.tmp/engagement-smoke.mjs` | 真启动 HTTP 探针（11 条），抓到三个被"顺手修好"的状态码 |
| `api/prismaClient.ts` | Prisma 客户端被钉在与内核相同的库文件上（显式 datasource 覆盖 `.env`），以及 `applicationDatabaseFile/Url` 两个函数 |
| `tests/kernel/database-path-alignment.test.ts` | 两条数据路径必须同一库：规则一致性 + 真子进程验证 Prisma 实际打开的文件 + 「第四个 `DATABASE_FILE` 读取者」围栏 |
| `tests/kernel/fixtures/database-path-probe.mts` | 上面那条子进程断言用的探针。**放在 `tests/` 而不是 `.tmp/`**：`.tmp/` 已 gitignore，第一版把它放在那里 —— 本机通过、新克隆必然失败。只在本机能跑的测试夹具不算测试 |
| `scripts/migration/probes/admin-cascade-inventory.mjs` | 量 admin 级联：58 张表 / 65 条语句 / **1 个事务** —— P4.3b.11 的原子性约束就是这么得出来的 |
| `scripts/migration/probes/admin-cascade-fk-coverage.mjs` | 61 张表持有指向 users/classes/students 的外键，并列出级联**没**清理的那 1 张（`blind_boxes`） |
| `scripts/migration/probes/schema-prisma-column-drift.mjs` | SQLite 有而 Prisma 模型没有的列（当前恰好 2 个）；G13 的第二个方向断言就用它的结果 |
| ⚠️ **这批探针为什么从 `.tmp/` 搬到这里** | `.tmp/` 是 gitignore 的。P4.3b.9 已经踩过一次同样的坑（测试夹具放在 `.tmp/` → 本机通过、新克隆必挂），P4.3b.11 又踩了一次（测量脚本）。**规则：凡会成为证据或断言依据的东西，一律放被跟踪的路径**；只有一次性、不需要复现的临时脚本才留在 `.tmp/` |
| `tests/plugins/identity-service.test.ts` | 真迁移链建库 + 真 `DbApi(strict)`；两家端口都是 fake 并记录调用，证明"只走端口" |
| `tests/plugins/identity-controllers.test.ts` | 4 条路由的动词/路径/`@HttpCode`、信封、以及 `ApiError` 与 500 兜底的翻译 |
| `tests/plugins/legacy-boot-probe.test.ts` | 唯一一条**真启动 + 真 HTTP** 的登录链路断言：登录拿 token → 用 token 打 profile → 200；以及 `/api/kernel/auth/login` 200（holder 接对了才算过） |
| `scripts/migration/spikes/nest-dynamic-controllers.mjs` | R10 证据（判断 Nest 能否动态装配时先跑它）—— ⚠️ **已随工作区清理删除**（结论已落地并记录在 `01-kernel.md` §3），需要时从 git 历史取回 |
