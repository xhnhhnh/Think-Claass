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

**P0–P4.3a 已完成并全部验证。** 内核、插件运行时、SDK、能力系统、审计下沉、`game` 上帝模块拆分都已落地。
**P4.3b 已迁走 15 个域**，`routeCollisions` 首次归零（最后一条是 pet 的碰撞）。
**P4.3c 已把两套组装的 schema 合成同一份迁移链**（含 1 列 + 19 索引的补全）。
**剩余**：`learning` 的 Prisma 半边（P4.3b.5c）、`classroom`/`auth`/`admin` 的 HTTP 面、`insights`/`engagement`（跨全域读模型，最后做）、按域拆 migration（P4.3c.3）、P5 收尾、P6、P7。

**下一步（P4.3b.5c 或 P4.3b.6b，二选一，见 §8.4）**：
- **`learning` 剩余部分**（papers/knowledge/wrong-questions/study-plans，10 文件 1433 行、28 张表、**全 Prisma**）——最大的一块，且必须先决定"插件的 repository 还能不能用 Prisma"。
- **`challenge` 改用 `pet.public.getBattleProfile`**（本轮已经把该端口方法做出来了，challenge 现在仍声明 `data.reads: ["pets"]` 直接读那一列）—— 小、干净、去掉一次跨插件读表。

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
| **P4.3b.5** | **剩余域**：`insights`/`engagement`/`platform`/`learning` → 见下方 5a–5d 拆分，**标记已作废**（5a/5b/5d 已完成，只剩 5c 与 6） | 见 `git log` | 🔶 |
| P4.3b.5a | **`system` 迁成插件**（8 条路由；`operation_logs` 只读，内核审计 sink 拥有） | 见 `git log` | ✅ |
| P4.3b.5b | **`assignments` 插件**：`learning` 里唯一不碰 Prisma 的 14 条路由（作业+考试）先切出来 | 见 `git log` | ✅ |
| **P4.3b.6** | **`pet` 域整体迁成插件**（17 条旧路由 + 真 `pets` 表 + 端口化 students/points/ledger），删 `api/modules/pet`，`routeCollisions` 1 → **0** | 见 `git log` | ✅ |
| P4.3b.5c | `learning` **其余部分**（papers/knowledge/wrong-questions/study-plans，28 个 Prisma 模型） | — | ⬜ |
| P4.3b.5c | **支付表补建**：`payment_orders`/`payment_transactions` 根本没有表，整个 `/api/payment` 面是死的；G13 加固 | 见 `git log` | ✅ |
| P4.3b.5d | **`parent-buff` 迁成插件**（`platform` 拆开：业务半边走插件，支付半边留在 `api/modules/platform`） | 见 `git log` | ✅ |
| P4.3b.6 | `classroom` 的 HTTP 面 + `pet` HTTP 面补全 + `auth`→`identity`（`settings`/`system` 已完成） | — | 🔶 `pet` 半边 ✅ P4.3b.6；`classroom`/`auth` 未动 |
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
- **前端不能 import `@thinkclass/kernel`**（会把 express/better-sqlite3 打进浏览器包）。

---

## 6. 护栏与棘轮（只能降，不能升）

`tests/guardrails/lib/allowances.json`：

| 键 | 当前 | 目标 | 含义 |
|---|---|---|---|
| `shimPages` | **0** ✅（62 → 0）| 0 | 插件树里的一行转发 shim（"假插件化"） |
| `deadCode` | **64**（70 → 69 → 66 → 65 → 64）| 0 | 应用不可达文件（P4.3b.6 删 `api/modules/pet` 降 1） |
| `staticPluginRoutes` | **0** ✅（76 → 0）| 0 | 路由表里静态 import 的插件页面 |
| `legacyFeatureKeySurfaces` | **0** ✅（原 2 → 1 → 0）| 0 | 仍硬编码 19 个 `enable_*` 键的文件 |
| `adoptedTables` | **34**（26 → 28 → 32 → 33 → 34）| 0 | 仍带旧名的插件自有表（`records` 永久共享，不计入）。P4.3b.6 的 +1 是 pet 的 `pets` —— 这是唯一一次"没有给系统新增表"的增量：`pets` 本来就是该域的存储，被替换掉的 `p_pet_pets` 是虚构的 |
| `routeCollisions` | **0** ✅（33 → 1 → 0）| 0 | 同一 METHOD+PATH 被两个控制器文件声明。P4.3b.6 之后**必须保持 0**：出现一条就意味着某个域又同时注册在两处 |

注意 `adoptedTables` 的"只降不升"有一条**明示例外**：迁移一个新域会让它上升，因此每次上升都必须在 `allowances.json` 的注释里逐条写清是哪张表、来自哪个域（`routeCollisions` 与 `deadCode` 没有例外，只能降）。

其余护栏：G1 插件间只经 `public.ts`、G2 内核不 import 插件、G5 内核零业务知识、G6 contracts 纯类型、G7 manifest 合规、G8 端点快照、G9 system settings 双份一致、G10 adopted 表、**G11 路由碰撞**、G13 启动 schema 完整性（正向：manifest 声明的表；**反向：每个 Prisma 模型都要有表**）、**G17 schema 只住在迁移里**（`api/db.ts` 不得再出现 `addColumnIfNotExists` / `ADD COLUMN` / `CREATE INDEX`；允许的剩余 DDL 被逐条枚举，加了就报错）。

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

**下面是 P4.3b.6 完成时（HEAD 见 `git log -1`）跑出来的数字。**
**它一定会随每一轮变化 —— 请用 §0 的三条命令重新跑一遍，把输出当成本节的真实内容。**

```
npm test        118 文件 / 671 用例全绿（api/modules/pet 的 2 个测试文件删掉，
                 换成 tests/plugins/pet-service.test.ts + pet-controllers.test.ts）
npm run check   exit 0
api:surface     unchanged (297 endpoints)   ← 迁移期间端点数必须不变
guardrails      12 文件 / 53 用例
```

**已迁成插件的域（15 个）**：economy, dungeon, gacha, slg, battles, challenge, collaboration, marketplace, portal, system, assignments, parent-buff, **pet**（+ 原有 classroom）
**仍在 `api/modules/` 的域（7 个）**：admin, auth, classroom, engagement, insights, learning, platform。
另外 **`platform` 现在只剩支付三条路由**（业务半边 `parent-buff` 已迁走），它已经不是一个功能域，而是一块基础设施 —— 见 §8.9。
（`settings` 已在 P5.3c 并入内核 —— 它本来就只有一句 `SELECT key, value FROM settings`，而 `settings` 是内核自有存储。）

**验收基线**：

| 指标 | 期望 | 变了说明什么 |
|---|---|---|
| `api:surface` 端点数 | **297** | 迁移期间**不应变化**。变小 → 扫描漏了插件或内核；变大 → 多出端点 |
| `deadCode` | **64** | 每迁完一个域应继续下降：删掉旧模块（含死的 `*.repository.prisma.ts`）就该降 |
| `shimPages` | **0** | P5.2a 已达成 |
| `legacyFeatureKeySurfaces` | **0** | P5.1 已达成；G14 保证它不会回升 |
| `adoptedTables` | **34** | 每迁一个域会上升，P7 改名后归零。**`records` 不计入**（永久共享）。最新一次是 P4.3b.6 的 pet `pets` |
| `routeCollisions` | **0** ✅ | P4.3b.6 达成了目标。**再出现一条就是回归**：某个域同时注册在旧模块与插件里 |
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
- **`admin.repository.ts` 仍在直接删除各域的表**（走 Prisma `$transaction`，不经 `DbApi` 所以所有权检查管不到）：
  `student_stocks` :434、`stocks` :444、`bank_accounts` :458、`dungeon_runs` :461、`gacha_pools` :525、`student_pets` :473、
  `territories` :523、`class_resources` :526、`class_battles` :514、`challenge_records` :460、`question_bank` :550。
  `DELETE /api/admin/users/:id` 时会级联清理。**迁移到 admin 域时必须改成调各域的端口**，否则"某插件拥有某表"只对插件生效、对 admin 不生效。
  （`pets` 现在也在这一批里：admin 删用户时清 `pets` 走的还是 Prisma，绕过 pet 插件。）
- **`records` 的其余写入方**（collaboration/marketplace/engagement/insights/pointsService/classroom）在各自迁移时都要改调 `classroom.public.recordStudentLedgerEntry()`。
  `api/services/pointsService.ts` 是共享 helper（marketplace 在用），它自己也要改。（pet 已在 P4.3b.6 改完。）
- ~~kernel 组装下的"只读 legacy 表"由 `ensureReadOnlyLegacyTables()` 建出来~~ —— 那个函数在 P4.3c.2 就删了，清单见 §8 的过时名字警告。
- **`pets.attack_power` 有了端口访问器，但 challenge 还没改** ✅→⬜：P4.3b.6 给 `pet.public` 加了
  `getBattleProfile(studentId) -> {attackPower, level, isDead} | null`；`plugins/challenge/src/challenge.repository.ts:89` 目前**仍**声明
  `data.reads: ["pets"]` 直接读那一列。改成端口调用是一轮独立的小工作（challenge 的 manifest 要加 `dependsOn.pet`，
  或让端口查找变成可选的，否则 pet 被禁用时 challenge 会被一起拒掉 —— 这个决定留到那一轮）。
- **`praises` 表无主**：pet 的 dashboard 读它（`data.reads`）。它既不属于任何插件，也没有端口。P7 前应决定归 classroom 还是给它一个端口。
- **`checkStudentFeature` 对"班级行已删"返回 403 `feature-disabled`**，而 legacy 的 `assertClassFeatureEnabled` 抛 404「班级未找到」。
  正常路径一致；只有孤立学生（class 行被删）才有差异。economy/challenge 都受此影响，属已知语义差。

### 8.4 迁移顺序建议

1. ~~`economy`~~ ✅ `3296a41`
2. ~~`dungeon`、`gacha`、`slg`、`battles`、`challenge`~~ ✅ P4.3b.2
3. ~~`collaboration`、`marketplace`~~ ✅ P4.3b.3
4. ~~`portal`、`system`~~ ✅ P4.3b.5a；~~`parent-buff`~~ ✅ P4.3b.5d（`platform` 的支付半边留在原处，见 §8.9）
5. `learning`：作业+考试 ✅ **P4.3b.5b 已切出 `plugins/assignments`**；剩下的 papers/knowledge/wrong-questions/study-plans（28 个 Prisma 模型）← 单独一轮
6. `classroom` 的 HTTP 面（目前只有端口，端点仍在 `api/modules/classroom`）
7. ~~`pet` 的 HTTP 面补全 → 删 `api/modules/pet`~~ ✅ **P4.3b.6 已完成**（`routeCollisions` 0）
8. `auth` → `identity` 基础插件（`settings` ✅ P5.3c 并入内核；`system` ✅ P4.3b.5a 迁成插件）
9. `insights`、`engagement` → **最后**：insights 是跨全域读模型（12 张表），engagement 卡在 `pets`/`redemption_tickets` 的所有权决定（注意 engagement 写的 `pets` 现在是 **pet 插件的表**，所以它还多了一个"必须走 pet 端口"的约束）
10. `platform` 的支付三条路由 → 未定归宿（内核侧 vs `tier: "infrastructure"` 插件），见 §8.9

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
| `insights` | 3 条路由但**跨域读 12 张表**。P4.3b.5b 之后这 12 张表的归属更清楚了：`exams`/`student_exams`/`student_assignments`/`assignments` 现属 `plugins/assignments`，其余 `students`/`classes`/`records`/`praises`/`leave_requests`/`attendance_records` 属 classroom，`parent_students` 仍无主。classroom 与 assignments **都没有报表类端口** | 正确解法是**先迁 learning**（提供考试成绩），再迁 `insights`：它的每条 SQL 都跨 2–3 个域，靠 `data.reads` 硬堆是 12 张表的隐式耦合。上一轮实测后的结论：**insights 不是可以单独搬的域，它是一个跨全域的读模型**，应该在 learning 与 classroom 都发布报表端口之后再动 |
| `engagement` | ① **写 `pets` 表**（:96 `UPDATE pets SET ... mood = ?`）——`pets` 属 pet 域；② 写 `redemption_tickets`（与 marketplace **双写**，已被 G10 的 `SHARED_WRITE_TABLES` 显式记录）；③ 读 `shop_items` | pet 需发布一个"宠物经验/等级"端口；`redemption_tickets` 需要一个真正的端口（marketplace 拥有？engagement 拥有？）——**这是必须先决定的所有权问题** |
| `platform` | **已拆开（P4.3b.5d）**：`POST /api/parent-buff` → `plugins/parent-buff` ✅。剩下 `POST /api/payment/create`、`GET /api/payment/status/:orderNo`、`POST /api/payment/notify`，依赖 `api/services/paymentService.ts`（Prisma 驱动 `payment_orders`/`payment_transactions`）与 `api/services/paymentProviders/**`，并经 `activationService` 开通用户 | **注意：它不是功能域，是基础设施。**把 `api/services/**` 一起搬进 feature 插件就是"把基础设施当业务迁"。未定的问题是归宿：内核侧（kernel 会因此认识支付概念，与 G5 的"零业务知识"张力最大）还是 `tier: "infrastructure"` 的非 feature 插件。**决定权留给下一轮**，先不动 —— 三条路由现在能正常工作（P4.3b.5c 补表之后实测 200） |
| `learning` | **已切走一半**：`assignments`/`exams` 14 条路由变成 `plugins/assignments`（P4.3b.5b）。剩下的是 papers/knowledge/wrong-questions/study-plans，10 文件 / 1433 行 / 28 张表，**全 Prisma** | 剩下这部分单独一轮，不要和别的域混。注意 `learning.errors.ts` / `learning.module.ts` 仍在 `api/modules/learning/` |
| `admin`/`auth`/`classroom`/`pet` | 见 §8.4 与 §8.3.1 | `auth`→`identity`；`pet`/`classroom` 的 HTTP 面。（`settings` ✅ P5.3c 并入内核；`system` ✅ P4.3b.5a 迁成插件，见下） |

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
- **`teacher_id INTEGER REFERENCES users(id)`**：`users` 是空的引导表，所以不带用户的探针里插入会 `FOREIGN KEY constraint failed`。这**不是**插件 bug —— 探针漏了 seed 一个 user。踩过一次，记在这里省下一次。
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
**收尾时一并解决**：`.env` 的 `DATABASE_URL` 与 `DATABASE_FILE` 两个独立设置指向同一个库这件事（见上文 P4.3b.5c 发现 #1），
应该收敛成一个来源，否则"内核单独部署"永远无法配出一个 Prisma 与应用都对的库。
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
| `api/schema/appMigrations.ts` | **两套组装共用的唯一迁移清单**（P4.3c.3a） |
| `api/schema/legacyCompatColumns.ts` | 53 个兼容列的函数迁移（含 checksum 陷阱说明） |
| `api/schema/legacyCompatIndexes.ts` | 19 个兼容索引（2 个是 UNIQUE 完整性约束） |
| `scripts/migration/lib/analysis.mjs` | 所有度量的单一实现 |
| `tests/guardrails/` | 已实现的护栏（G1–G17）+ 棘轮额度 |
| `tests/guardrails/schema-lives-in-migrations.test.ts` | **G17**：`api/db.ts` 不得再带 schema DDL |
| `tests/plugins/pet-service.test.ts` | pet 域的语义（死亡时钟/等级上限/端口边界），替代 `api/modules/pet/pet.service.test.ts` |
| `tests/plugins/pet-controllers.test.ts` | 17 条旧路由的**逐条信封**断言 + 插件自有别名的权限门 |
| `scripts/migration/spikes/nest-dynamic-controllers.mjs` | R10 证据（判断 Nest 能否动态装配时先跑它） |
