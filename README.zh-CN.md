<h1 align="center">Think-Class</h1>

<p align="center">
  面向教师、学生、家长与管理员的班级游戏化全栈平台。
</p>

<p align="center">
  <a href="README.md">English</a> | <b>简体中文</b>
</p>

Think-Class 把日常的班级管理事务和 RPG 式的激励绑在一起：积分、宠物、任务、拍卖、银行、挑战、
领地建设、试卷、数据分析、消息、证书，以及学校的门户站点管理。

代码库跑在**最小内核 + 无限插件**的架构上。一个小内核拥有存储、迁移、设置、审计、认证原语和
HTTP 外壳；每一个业务域都以插件形式交付，由插件自己声明它**拥有**的表、路由、权限与端口。内核里
不出现任何业务表名，插件之间也从不直接 import 彼此。

## Status

| | |
| --- | --- |
| 版本 | [`package.json`](package.json) → `version` 是唯一事实源，[CHANGELOG.md](CHANGELOG.md) 顶部条目必须与它一致。见 [docs/versioning.md](docs/versioning.md) |
| 运行时 | Node.js >= 24（[`engines`](package.json)） |
| 前端 | React 18、TypeScript、Vite 6、Tailwind CSS 3、TanStack Query 5、Zustand |
| 后端 | NestJS 11 + Express 4、TypeScript，通过 `tsx` 运行 |
| 数据库 | SQLite（`better-sqlite3`）；迁移只前进且带校验和 |
| 插件 | [`plugins/`](plugins) 下 22 个 —— 见下方列表 |

README 刻意不重复版本号：项目已经往前走了两个大版本，它还在写着 `1.6.7`。那是 `package.json` 的职责。

## Architecture

```text
packages/
  kernel/           内核：存储 + 迁移、设置、审计、HTTP 外壳、认证原语
  plugin-runtime/   从 manifest 发现插件并启动它们
  plugin-sdk/       插件编译所依赖的 API（ctx.db、ctx.audit、ctx.cleanup……）
  contracts/        跨插件边界共享的纯类型（无运行时代码）

plugins/
  <slug>/           一个业务域：plugin.json manifest 加 src/ —— 控制器、
                    service/repository、支撑文件，以及 index.ts（插件在其中注册
                    自己的路由、端口（ctx.provide）与跨域清理规则）。

api/                组装根：server.ts、app.ts、app.module.ts、db.ts、maintenance.ts
src/
  features/         前端领域模块（API 客户端、hooks、页面导出）
  components/       共享 UI，含 BrandMark / WebsiteIcon
  pages/            面向路由的旧页面位置
  hooks/ lib/ store/ mocks/ app/    横切前端基础设施
tests/              Vitest 套件：app、backend、guardrails
docs/              设计记录与迁移档案
```

22 个插件域：

```text
admin  ai-study  assignments  battles  challenge  classroom  collaboration  dungeon  economy
engagement  gacha  homework  identity  insights  learning  marketplace  parent-buff  payment
pet  portal  slg  system
```

`api/modules/` 已不存在 —— 现在每个域都是插件。

`ai-study`（AI 智学）是个性化引擎：一条确定性规则从题库里选出该学生的练习组，并说明每道题为什么
在那里；学生在页面内作答，交卷后通过 `learning.public` 把掌握度写回。已配置的模型可以重排规则的
选择并改写理由；默认部署没有模型，规则独当一面。

### The rules the architecture is held to

这些由护栏套件（[`tests/guardrails/`](tests/guardrails)）强制，而不是靠约定：

- **插件之间只通过已发布的端口通信。** 一个域用 `ctx.provide('<slug>.public', ...)` 发布端口，
  另一个域用 `ctx.use(...)` 消费它 —— 可选依赖则用 `ctx.tryUse(...)`，让它降级而不是失败。跨插件的
  裸 import 只允许经由该插件的 `public.ts`；目前没有任何地方需要这么做。
- **内核从不 import 插件**，也不含任何业务知识 —— 一个表名、一个功能键都没有。
- **`packages/contracts` 只有类型。**
- **Schema 只存在于迁移里。** `api/db.ts` 不得出现 `ADD COLUMN` / `CREATE INDEX`。
- **HTTP 面由快照冻结。** `npm run api:surface:check` 会在出现意外漂移时失败，因此重构可以换掉一条
  路由的实现者而不改动这条路由。
- **每个 `plugin.json` 都合规** —— 必填字段齐全、不自依赖、`dependsOn` 使用 semver 范围。
- **`ENCRYPTION_KEY` 在源码里任何地方都没有默认值。**

迁移一个域意味着在**一个**提交里把它的路由、表和端口搬进 `plugins/<slug>`，这样端点快照和路由冲突
护栏都不会看到中间状态。

## Quick Start

要求：Node.js >= 24 与 npm。不需要任何全局工具。

```bash
npm install
```

在仓库根目录创建 `.env`：

```env
# 打开哪个 SQLite 文件，相对仓库根目录。
DATABASE_URL="file:./database.sqlite"

# 首次启动必需：它们用来创建超管账号，且没有默认值。
# 请选择唯一的值；启动前必须替换掉下面的占位内容。
SUPERADMIN_USERNAME="<your-admin-name>"
SUPERADMIN_PASSWORD="<unique-strong-password>"

# 必需。恰好 32 字节，且本部署的每个实例都必须使用同一个值。
ENCRYPTION_KEY="<32 characters>"
```

生成密钥：

```bash
node -e "console.log(require('node:crypto').randomBytes(16).toString('hex'))"
```

要在经过校验的备份之后重建一个尚未上线的本地实例，请用
[`docs/local-reinitialize.md`](docs/local-reinitialize.md)。该命令可以交互式输入新凭据，也可以生成
唯一的随机凭据并写入一个仅当前用户可读的本地文件。

> **`ENCRYPTION_KEY` 不是可选项。** 学生姓名是加密落盘的，而自 2.0.0 起应用拒绝回落到默认值 ——
> 密钥缺失或长度不对，会在第一个真正需要它的值上直接报错（护栏 G18）。密钥丢失会让已有的加密姓名
> 无法读取；轮换密钥意味着先重新加密既有行，做法见
> [`scripts/rotate-encryption-key.mjs`](scripts/rotate-encryption-key.mjs) 的文件头。
>
> 密钥是**惰性读取**的，所以没有它服务仍能启动 —— 它在你真的加密或解密一个姓名时才失败，而不是在
> import 时。

启动完整的开发栈：

```bash
npm run dev
```

这会同时跑起 Vite 和 API。前端在 `http://localhost:5173`，并把 `/api` 代理到
`http://localhost:3001` 的 API（[`vite.config.ts`](vite.config.ts)）。超管控制台在 `/beiadmin`。

想让两半各占一个终端时，分开跑：

```bash
npm run client:dev   # 只有 Vite
npm run start        # 只有 API
```

> **改动 `plugins/**` 或 `packages/**` 不会重启 API。** `npm run dev` 通过 `nodemon` 启动服务，
> 而它的监听列表是 `["api"]`（[`nodemon.json`](nodemon.json)）—— 这是每个域还住在 `api/` 下时留下
> 的痕迹。在插件里工作时，请手动重启，或在你自己的 watcher 下跑 `npm run start`。

超管账号在首次启动时由 `SUPERADMIN_USERNAME` 与 `SUPERADMIN_PASSWORD` 创建，且只由它们创建 ——
一个既没有超管行、也没有这两个变量的数据库会拒绝启动，而不是回落到某个已公开的默认值
（[`api/db.ts`](api/db.ts)）。其他账号都在应用内创建：教师自行注册（或由管理员在控制台创建），
学生与家长由他们的教师添加。启动过程不写入任何示例教师、班级、商品或积分预设，也不存在固定的学生
密码或家长密码。

### Configuration

其余全部可选，从环境变量读取：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `PORT` | `3001` | API 端口 |
| `DATABASE_FILE` | `database.sqlite` | SQLite 文件，相对仓库根目录解析 |
| `UPLOADS_DIR` | `uploads` | 上传文件目录 |
| `STATIC_DIR` | `dist` | 构建后的前端，存在时会被托管 |
| `ADMIN_PATH` / `VITE_ADMIN_PATH` | `/beiadmin` | 超管控制台的基础路径 |
| `LOG_LEVEL` | `info`（`NODE_ENV=test` 下为 `silent`） | 根日志级别 |
| `KERNEL_ENABLED` | 未设置 | 未设置时启动 legacy Nest 根；`1` 则改为以内核作为组装根（[`api/app.ts`](api/app.ts) 里的 `isKernelEnabled()`）。两种情况下插件都会挂载 —— 见下一行 |
| `PLUGINS_ENABLED` | `true` | 映射到 `pluginsEnabled`。没有宿主时 legacy 根一个模块都没有 —— 每个域都是插件，而 [`api/app.module.ts`](api/app.module.ts) 声明的是 `imports: []` —— 所以这是默认组装里业务路由的**唯一**来源。设为 `0` 只在配合 `KERNEL_ENABLED=1`（纯内核）时才有意义；在 legacy 根下，`PLUGINS_ENABLED=0` 过去会让 `/api/students`、`/api/classes`、`/api/auth/login` 及其所有同类路由回 404，而 `/api/health` 仍然回 200，现在这种情况会在启动时被 `assertUsableComposition()` 拒绝（[`api/app.ts`](api/app.ts)） |
| `PLUGIN_DIRS` | `plugins,plugins-ext` | 扫描插件 manifest 的目录 |
| `SESSION_TTL_MS` | 7 天 | 会话有效期 |
| `ALLOW_LEGACY_HEADER_AUTH` | `false` | 接受 `x-user-role` / `x-user-id` 作为身份。这两个头由客户端提供、无法验证，所以打开它之后任何调用者都能变成任何用户 —— 包括 `superadmin` —— 每个端点的授权检查都退化成建议。默认关闭；只有确实仍需要这座桥的部署才设 `1`（每一次经桥的请求都会被记录）。见 [`packages/kernel/src/auth`](packages/kernel/src/auth) |
| `THINK_CLASS_ROOT` | `process.cwd()` | 部署根目录 |

本仓库里没有任何东西设置这两个组装开关：`install.sh`、`update.sh`、`update.ps1`、`pack.sh`、
`nodemon.json` 与 `package.json` 都没设置，PM2 启动器也是按原样带着环境跑 `npm run start`
（[`scripts/deploy-common.sh:325`](scripts/deploy-common.sh)）。因此上面的默认值**同时就是**部署
配置 —— 这也是 `PLUGINS_ENABLED` 默认 `true` 属于承重结构、而不是个人偏好的原因。

`assertUsableComposition()`（[`api/app.ts`](api/app.ts)）的两个分支都是 fail-closed：`PLUGINS_ENABLED=0`
的 legacy 根，以及宿主已启用却一个插件都没激活的情况，两者都**在启动时抛错**而不是照常启动。这都
不是假设 —— 前者是默认值改掉之前每个启动器都在跑的状态，而它唯一的症状只出现在业务面上：
`/api/health` 回 200 并带着 `plugins: { total: 0, active: 0 }`，而 `/api/students`、`/api/classes`、
`/api/auth/login`、`/api/pet/health` 和 `/api/website/home` 全都回 404。[`api/index.ts`](api/index.ts)
（Vercel 入口）走的是同一个 `createApp()`，所以无服务器部署当时暴露在完全相同的问题下。

`DATABASE_URL` **不是**运行时开关。Prisma CLI 从 `.env` 读它；应用解析的是 `DATABASE_FILE`
（[`packages/kernel/src/config/loadConfig.ts`](packages/kernel/src/config/loadConfig.ts)），而
`api/prismaClient.ts` 把同一个文件显式传给 Prisma，好让两者无法分叉。

## Scripts

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | Vite + API 一起跑 |
| `npm run client:dev` | 只有 Vite |
| `npm run start` | 只有 API（`tsx api/server.ts`） |
| `npm run server:dev` | API 跑在 `nodemon` 下 |
| `npm run build` | `tsc -b` 并把前端构建进 `dist/` |
| `npm run preview` | 托管构建后的前端 |
| `npm run check` | TypeScript 类型检查，不产出文件 |
| `npm run lint` | ESLint |
| `npm test` | 完整 Vitest 套件：app + backend + guardrails + e2e |
| `npm run test:app` | 前端与 legacy `api/**` 套件（jsdom + MSW） |
| `npm run test:backend` | 内核与服务端套件（node），含一个真实的插件宿主 |
| `npm run test:e2e` | 组装后的应用跑在真实 HTTP 上：按角色遍历每个端点 |
| `npm run guard` | 只跑护栏套件 |
| `npm run auth:audit` | 逐控制器的授权清单，并与端点快照对账 |
| `npm run api:surface:check` | HTTP 面发生漂移就失败 |
| `npm run measure` | 迁移棘轮：端点、死代码、已接管表 |
| `npm run release` | 切一个版本 —— 除非 `--push`，否则是 dry-run |
| `bash pack.sh` | 构建生产 zip |

## Validation

发布改动前跑这些。前四条是 CI 强制的验收门，顺序一致
（[`.github/workflows/release.yml`](.github/workflows/release.yml)）：

```bash
npm run check
npm run api:surface:check
npm run guard
npm test                # 现在包含 e2e 项目
npm run lint            # 仅本地；不在发布工作流里
```

### The four test projects

`npm test` 会跑全部四个；每个也都能单独运行。

| 项目 | 覆盖什么 | 它为之存在的盲区 |
| --- | --- | --- |
| `test:app` | jsdom 里的 React 页面，对接 MSW | — |
| `test:backend` | 内核、运行时与每个插件，跑在真实数据库上 | 只碰某个套件关心的那些路由 |
| `guard` | 迁移棘轮与设计系统审计 | — |
| `test:e2e` | 组装后的应用（`api/app.ts`），跑在真实 HTTP 上 | **唯一检查另外两层之间契约的那一层** |

最后一条不是双保险。`test:app` 让真实页面去对接**对一切都回 200** 的 MSW handler，而
`test:backend` 启动真实内核、但每个套件只碰少数几条路由 —— 于是客户端和服务端在一个角色、一个状态码
或一个数据结构上互相不一致时，两层都是绿的。e2e 项目启动真正交付的那套组装，通过应用自己的路由播种
四种角色，然后逐端点断言：匿名拿不到任何成功状态、任何角色任何路由都不得 500，且前端真正调用的路径
不得回 5xx。

它立刻就证明了自己的价值：第一次运行就发现，legacy 组装里 actor 作用域**从未**被解析
（`mountKernelInfrastructure` 又装了一个不带 resolver 的 request-context 中间件，而它最后执行）——
这就是为什么在一个已部署实例里学生从宠物路由那里一律拿到 403，而 1128 个用例的套件一直全绿。

`npm run auth:audit` 打印 [`docs/security/route-authorization-matrix.md`](docs/security/route-authorization-matrix.md)
背后的逐控制器清单，并在任何端点无法被这棵树归因时失败。它把自己的性质说得很直白：一份清单，不是
证明 —— 逐路由、逐角色的断言在 `tests/e2e/authorization/routes.test.ts` 里。

默认组装（不设置任何组装变量）必须提供业务路由。仓库里没有任何东西设置 `PLUGINS_ENABLED`，所以默认值
就是实际交付的东西，而它出错时的失败方式是静默的：`/api/health` 仍然回 200 并带着
`plugins: { total: 0, active: 0 }`，而整个业务面 404。
[`tests/plugins/legacy-default-composition.test.ts`](tests/plugins/legacy-default-composition.test.ts)
被 `backend` 项目收集（[`vitest.backend.config.ts:29`](vitest.backend.config.ts)），因此受 `npm test`
强制；它会启动一个真实子进程来钉住默认值**以及它的两个边界**：在子进程环境里同时删掉
`KERNEL_ENABLED` 与 `PLUGINS_ENABLED` 时，`/api/kernel/info` 必须报告 `pluginsEnabled: true`、
`/api/kernel/plugins` 必须列出 20 个插件、`/api/website/home` 必须回 200，且 `/api/pets/999` 必须走到
宠物控制器自己的 `Student not found` 而不是 Nest 的 `Cannot GET` 兜底；legacy + `PLUGINS_ENABLED=0`
必须**启动失败**，并在消息里点名该变量；而 `KERNEL_ENABLED=1 PLUGINS_ENABLED=0`（纯内核）仍须启动，
用 `kernel.plugins.total === 0` 回应 `/api/health`，且 `/api/students` 回的是内核自己的 `NOT_FOUND`
信封，而不是某个插件路由。

`tests/plugins/legacy-boot-probe.test.ts` 覆盖同一套组装，但显式钉住 `PLUGINS_ENABLED=1` —— 那恰恰是
没有任何部署在用的配置。

发布打包方面，`bash pack.sh` 构建出 `think-class-release.zip`，内含构建后的前端、API 服务、内核与
运行时包、全部插件、部署脚本以及包清单文件。

## Releases and versioning

一次发布是一个原子事件：一个 tag。流程写在 [docs/versioning.md](docs/versioning.md)，并由护栏 G19 强制。

```bash
npm run release -- patch        # 也可：minor | major | 2.1.0 | 2.1.0-rc.1
npm run release -- minor --push # 切版本，然后推送提交与 tag
```

脚本会跑验收门、把版本号写在唯一的地方、更新 changelog，并给那个通过验收的提交打 tag —— 它从不发布。
**推送 tag 才是发布**：CI 会重跑验收门，从该提交的干净检出构建归档，写出 `SHA256SUMS`，并创建 GitHub
Release。

部署端会校验该校验和，缺失或不对就拒绝更新，所以一个 Release **永远**带着 `think-class-release.zip`
与 `SHA256SUMS` —— 空 Release 被当作失败，而不是"下载慢"。

## Deployment

在 Linux 服务器上：

```bash
wget -O install.sh https://raw.githubusercontent.com/xhnhhnh/Think-Claass/main/install.sh && bash install.sh
```

如果目标机器访问 GitHub 慢或不可达，用镜像：

```bash
wget -O install.sh https://ghproxy.net/https://raw.githubusercontent.com/xhnhhnh/Think-Claass/main/install.sh && bash install.sh
```

`install.sh` 与 `update.sh` 共用 `scripts/deploy-common.sh` 里的辅助函数，负责依赖、Prisma 生成、
包下载与 PM2 重启。实例也可以从超管设置页自我更新：更新器检查最新的 GitHub Release、下载归档、校验
校验和、重启 PM2 服务，并把进度追加到 `logs/update.log`，机器可读状态写在
`logs/update-status.json`。

> 升级一个早于插件架构的部署不是一步到位的事：在每个实例上设置 `ENCRYPTION_KEY`，如果数据库里已经
> 存有加密姓名，先重新加密这些行。升级说明在 [CHANGELOG.md](CHANGELOG.md) 顶部。

## Documentation

| 文档 | 它是什么 |
| --- | --- |
| [docs/migration/HANDOFF.md](docs/migration/HANDOFF.md) | 架构重构的权威入口：当前状态、作为验收标准的下一轮目标、护栏、已知债务 |
| [docs/migration/BOOTSTRAP_PROMPT.md](docs/migration/BOOTSTRAP_PROMPT.md) | 粘进新会话以继续该重构的提示词 |
| [docs/migration/00-baseline.md](docs/migration/00-baseline.md) – [04](docs/migration/04-capabilities-and-domains.md) | 逐阶段记录：基线冻结、内核、契约与认证、插件运行时、能力与域 |
| [docs/migration/admin-cascade-decision.md](docs/migration/admin-cascade-decision.md) | 跨域级联删除由谁拥有、按什么顺序执行 |
| [docs/versioning.md](docs/versioning.md) | 版本规则、发布流水线，以及它修掉的三个断点 |
| [CHANGELOG.md](CHANGELOG.md) | 每个版本面向用户的变更 |
| [docs/architecture-refactor.md](docs/architecture-refactor.md) | 更早的重构笔记 |
| [后端接口说明/API接口文档.md](后端接口说明/API接口文档.md) | 接口参考笔记 |

## Development guidelines

- 新的前端业务代码从 `src/features/<domain>` 进入。legacy `src/api/*` 文件保留为兼容门面。
- 新的后端域是带 manifest 的 `plugins/<slug>`，不是 `api/` 下新开一个目录。
- 跨域访问保持走已发布的端口（`ctx.use` / `ctx.tryUse`），并保持公开 HTTP 路径稳定。
- 复用共享的内核与运行时服务 —— 密码处理、学生查询、积分、功能门、审计、清理 —— 而不是重新实现。
- 不要把 schema 变更塞进一次纯粹的边界重构，也永远不要编辑已经应用过的迁移：迁移带校验和且只前进。
- 迁移期间不要"顺手把它修了"。一个没被要求的行为变更不会让测试变红；请记录该缺陷与修法，而不是当场改。

## Compatibility notes

- legacy 后端路径继续作为回落可用，前端经 `src/api/*` 的旧 import 也继续工作。
- 支付流程与既有服务商及 mock 行为保持兼容。
- 已知的非阻塞构建警告是 Vite 的大 chunk 警告；路由级代码分割刻意留给单独的性能项目。

## License

MIT
