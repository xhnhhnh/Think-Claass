[English](AGENTS.md) | 简体中文

# AGENTS.md

本文是 AGENTS.md 的中文译本，与英文版同步维护；如有冲突，以英文版为准。

这份文件是 AI 代理（Codex、Claude Code、Cursor、Copilot 等）以及按同样方式工作的维护者的工作约定。它刻意只针对 Think-Class 写具体规则。[`CONTRIBUTING.md`](CONTRIBUTING.md)（[简体中文](CONTRIBUTING.zh-CN.md)）面向人类贡献者的工作流；本文说明怎样在改动时不破坏架构、数据与发布链路。安全问题按 [`SECURITY.md`](SECURITY.md)（[简体中文](SECURITY.zh-CN.md)）上报；参与本项目受 [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)（[简体中文](CODE_OF_CONDUCT.zh-CN.md)）约束。

## 1. 怎样使用这份文件

### 1.1 优先级

当几个来源互相矛盾时，按下面的顺序采信：

1. 工作区、`git` 与命令输出。
2. 这份文件。
3. [`README.md`](README.md)（[简体中文](README.zh-CN.md)）：产品、环境搭建、配置与部署。
4. [`docs/README.md`](docs/README.md)（[简体中文](docs/README.zh-CN.md)）：文档地图，以及被指向的那份文档本身。

文档说的事如果工作区并不支持，以工作区为准。在同一次改动里把文档改对，并在提交信息里说明。不要为了迁就过时文档去「修」代码。

### 1.2 每次会话先核对状态

开始规划前先跑：

```bash
git status --short
git log --oneline -5
git rev-parse --abbrev-ref HEAD
```

如果 `git status` 不干净，先判断这是「已经做完但没提交」还是「改坏了」；不要因为上一轮的总结说它停在哪里就直接往下做。架构重构的历史看 [`docs/migration/HANDOFF.md`](docs/migration/HANDOFF.md)，长期重构的提示词看 [`docs/migration/BOOTSTRAP_PROMPT.md`](docs/migration/BOOTSTRAP_PROMPT.md)，但把它们的「状态」部分当作历史记录。文档里的数字（插件数、端点数、用例数、棘轮额度、HEAD）都会过期；当前值一律用命令取。

### 1.3 没验证过的事不要声称完成

没有在本次会话里实际跑过的测试、类型检查、构建或端点，绝不能说它通过。如果命令跑不动（沙箱、网络、缺依赖），贴出准确的命令与报错。不要为了把门弄绿去改测试、快照或配置。

## 2. 仓库形状

这是一个全栈课堂游戏化平台。一个 API、一份数据库同时服务四个控制台（超管、教师、学生、家长）和微信小程序。小程序客户端就在本仓库的 `miniprogram/` 里；所有客户端与后端都从唯一的 `main` 主干发布。

```text
api/                    组装根：server.ts、app.ts、app.module.ts、db.ts、maintenance.ts
packages/
  kernel/               存储与迁移、设置、审计、HTTP 外壳、认证原语
  plugin-runtime/       发现 manifest 并启动插件
  plugin-sdk/           插件编译所依赖的 API（ctx.db、ctx.audit、ctx.cleanup、端口）
  contracts/            纯共享类型（没有运行时代码）
plugins/<slug>/         一个业务域：plugin.json 加 src/、public.ts 与 index.ts
src/
  features/<domain>/    前端业务模块
  components/           共享 UI 与设计系统套件
  app/routing/          路由表与生成的模块映射
tests/                  app、backend、e2e、guardrails、miniprogram、plugins
docs/                   设计记录、规范、迁移档案与微信指南
miniprogram/            微信小程序源码（独立的 TypeScript 项目）
wechat/                 微信开发者工具的工作副本，被 git 忽略；从 miniprogram/ 同步，不要把它当源码改
scripts/                发布、迁移棘轮、安全审计与验证脚本
```

搭建、环境变量与部署看 [`README.md`](README.md)（[简体中文](README.zh-CN.md)）。改 UI 前先读 [`docs/design-system.md`](docs/design-system.md)。在假设仓库怎么分线之前先读 [`docs/branch-strategy.md`](docs/branch-strategy.md)：`main` 是唯一长期分支，Web 端、共享后端与 `miniprogram/` 里的小程序客户端都在它上面；短期特性分支合回后删除。

## 3. 不可协商的红线

### 3.1 密钥与个人信息

- 绝不提交 `.env`、API Key、密码、AppSecret、私钥或真实学生数据。[`.env.example`](.env.example) 是唯一被跟踪的配置模板；真实值放在部署环境里。
- `ENCRYPTION_KEY` 是必填项，任何地方都没有默认值（护栏 G18）。它必须恰好 32 字节、同一部署的所有实例一致，并且有备份。丢失它会让加密后的学生姓名永久不可读。轮换只能走 [`scripts/rotate-encryption-key.mjs`](scripts/rotate-encryption-key.mjs)，绝不能就地生成一把新密钥。
- 不要在日志、测试、Issue 或总结里打印密钥。姓名、ID、令牌以及能定位某个部署的文件路径都要脱敏。
- 测试夹具用合成数据。不要把生产数据库拷进仓库或测试。

### 3.2 数据库与迁移

- 迁移只前进、带校验和。已经应用过的迁移一个字都不能改；要变更就新增一条迁移。
- schema 变更只住在迁移里。不要在 [`api/db.ts`](api/db.ts) 里加 `ADD COLUMN`、`CREATE INDEX` 或等价的 DDL（护栏 G17）。
- 启动时的 schema 必须满足关于它的每一项声明：表与手写列清单，以及反方向（SQLite 有而 Prisma 未建模的列）—— 护栏 G13。
- 不要为了省事重置、重新初始化或删除数据库。`npm run local:reinitialize` 是破坏性操作，只适用于已完成备份、尚未上线的本地实例；先问用户。

### 3.3 架构边界

- 内核不包含任何业务知识 —— 没有业务表名，也没有功能位 key。护栏 G5。
- 插件之间绝不直接 import。一个域用 `ctx.provide('<slug>.public', ...)` 发布端口；另一个域用 `ctx.use(...)` 或 `ctx.tryUse(...)` 消费它。跨插件只允许通过对方的 `public.ts` 直接 import。
- [`packages/contracts`](packages/contracts) 只放类型（护栏 G6）。
- 新的后端域是带合规 `plugin.json` 的 `plugins/<slug>`，不是 `api/` 下新开一个目录。不要在前端路由入口里静态挂插件路由（护栏 G4）。
- 复用内核与运行时已有的服务 —— 密码处理、学生查询、积分、功能门、审计、清理 —— 而不是重新实现。

### 3.4 HTTP 面与授权

- 公开 HTTP 路径是契约。不要随手改名或改形状。如果确实要改，在同一次改动里用 `npm run api:surface:update` 更新快照，并预期 [`tests/guardrails/snapshots/api-surface.json`](tests/guardrails/snapshots/api-surface.json) 发生变化。
- 每个新端点都必须有客户端调用方，否则护栏 G22 会红。补角色/权限测试；e2e 项目是专门抓客户端与服务端不一致的那一层。
- 碰过路由或授权后跑 `npm run auth:audit`。[`docs/security/route-authorization-matrix.md`](docs/security/route-authorization-matrix.md) 是清单不是证明：它自己承认可能滞后，以命令为准。
- 路由碰撞必须保持 0（护栏 G11）。一个域不能同时在 `api/` 与 `plugins/` 里注册。

### 3.5 版本与发布

- `package.json` 的 `version` 是唯一事实源。不要在别的地方再写一遍版本号。规范规则 —— tag、插件版本、`KERNEL_API_VERSION` 与发布顺序 —— 见 [`VERSIONING.md`](VERSIONING.md)（[简体中文](VERSIONING.zh-CN.md)）；[`docs/versioning.md`](docs/versioning.md) 是设计记录。
- 只用 `npm run release -- patch|minor|major` 切版本（除非传 `--push`，否则不会推送）。绝不手改版本号、CHANGELOG 顶部小节或 tag。护栏 G19 强制 manifest、CHANGELOG 与 tag 三者一致。
- 不要给 [`CHANGELOG.md`](CHANGELOG.md) 加 `## [Unreleased]` 小节：那会破坏 G19。发布提交由脚本更新 CHANGELOG。
- 除非用户明确要求，不要推 tag、创建 GitHub Release 或运行发布脚本。推送 tag 就是发布；按正常工作流它不可逆。

### 3.6 依赖与工具链

- 包管理器是 `npm`（跟踪 `package-lock.json`）。不要换成 pnpm/yarn，也不要把重新生成 lockfile 当作顺带动作。
- 除非用户要求，不要新增、升级或删除依赖。优先用仓库、内核或插件 SDK 里已有的工具。
- 不要为了让目录看起来完整就 `npm install`。如果某条命令真的缺依赖，停下来报告。
- 保持 TypeScript 配置与 lint 规则不变。本仓库刻意把 `strict` 设为 false；不要把它当作无关清理顺手打开。

### 3.7 破坏性操作

以下操作必须先获得明确同意：删库或重新初始化数据库、删除 `uploads/` 或 `logs/`、force push、改写历史、删除分支、推 tag，或对真实部署运行安装/更新脚本。不要运行目标路径尚未核实的命令。

### 3.8 UI 契约

- 页面里绝不写颜色字面量或 `!important`。用 [`docs/design-system.md`](docs/design-system.md) 里的设计 token 与组件套件。
- 用页面脚手架与共享套件，不要发明局部布局。页面必须处理加载、空、失败与禁用四态；空态不能替代读取失败（护栏 G24）。
- 生成文件保持生成：路由与班级功能位目录来自 `npm run route-modules` 与 `npm run class-features`，不要手改。

### 3.9 文档

- 仓库的长文档用英文加一份 `.zh-CN.md` 译本。同一次改动里两版一起更新。两者冲突时以英文版为准。
- 新增的每个 `docs/**/*.md` 都要加进 [`docs/README.md`](docs/README.md)（[简体中文](docs/README.zh-CN.md)）的两份索引。索引、链接或配对不同步时，文档标准护栏会失败。
- 不要在文档里写易变的计数或哈希。写明产生这个数字的命令。
- 如果文档过时，在同一次改动里修掉，不要留下已知错误的说法。如果修复规模超出当前改动，说明并记录下来。

## 4. 命令

### 4.1 开发

```bash
npm install
npm run dev
npm run client:dev
npm run start
npm run build
npm run preview
```

`npm run dev` 同时启动 Vite 和 API —— 前端在 `http://localhost:5173`，API 在 `http://localhost:3001`，`/api` 走代理。超管控制台在 `/beiadmin`。`nodemon` 只盯 `api/`；改 `plugins/` 或 `packages/` 不会重启 API，需要自己重启，或者在你自己的 watcher 下跑 `npm run start`。

首次启动需要 `.env` 里的 `SUPERADMIN_USERNAME`、`SUPERADMIN_PASSWORD` 和 32 字节的 `ENCRYPTION_KEY`。没有默认账号、没有预置师生账号、也没有固定密码。其余配置都是可选的，见 [`README.md`](README.md) 与 [`.env.example`](.env.example)。

### 4.2 检查与测试

```bash
npm run check
npm run lint
npm run guard
npm run api:surface:check
npm run auth:audit
npm run miniprogram:check
npm test
npm run test:app
npm run test:backend
npm run test:e2e
```

- `check` 是不产出文件的 TypeScript 检查；`lint` 是 ESLint。
- `guard` 是静态护栏套件 —— 迁移棘轮、架构边界、UI 契约、版本一致性与文档标准。它很快，应该经常跑。
- `api:surface:check` 在 HTTP 面发生非预期漂移时失败。
- `auth:audit` 打印逐控制器的授权清单，并在任何端点无法被这棵树归因时失败。
- `miniprogram:check` 对独立的小程序项目做类型检查。
- `test` 跑全部四个 Vitest 项目：`app`、`backend`、`e2e` 与 `guard`。它是验收门；针对具体改动可以先跑相关项目，声称完成前再跑完整套件。

发布工作流（[`.github/workflows/release.yml`](.github/workflows/release.yml)）只在 `v*` tag 与手动触发时运行：类型检查、API 面、小程序类型检查、护栏、测试、打包、校验和与发布。目前没有 pull request 工作流，所以 PR 必须附上本地门的结果。

### 4.3 发布与打包

```bash
npm run release -- patch
npm run release -- minor --push
bash pack.sh
npm run local:reinitialize
```

`release` 会跑验收门、把版本号写在唯一的地方、更新 CHANGELOG 并给通过验收的提交打 tag；它从不发布。推送 tag 才是发布。`pack.sh` 构建 `think-class-release.zip`；CI 在旁边生成 `SHA256SUMS`。`local:reinitialize` 是破坏性操作，见 §3.7。

### 4.4 环境注意事项

- 需要 Node.js >= 24（[`package.json`](package.json)）。
- Windows 是受支持的开发环境。Shell 脚本是 Bash；通过 Git Bash/WSL 运行。Windows 部署有 `update.ps1`。
- `uploads/`、`logs/`、`dist/`、`.tmp/` 与 `database.sqlite*` 是本地状态，不能提交。
- 小程序源码是 [`miniprogram/`](miniprogram)；[`wechat/`](wechat) 是给微信开发者工具用的、被 git 忽略的副本。用 [`scripts/wechat/sync-miniprogram.mjs`](scripts/wechat/sync-miniprogram.mjs) 重新生成，不要直接改副本。

## 5. 什么改动跑什么检查

选真正覆盖该改动的最小集合，报告完成前再跑完整验收门。

| 改动 | 最低检查 |
| --- | --- |
| 只改文档 | `npm run guard`（文档标准 + 链接） |
| 前端 UI 或客户端代码 | `npm run check`、`npm run test:app`、`npm run guard`、`npm run lint` |
| 后端或插件行为 | `npm run check`、`npm run test:backend`、`npm run test:e2e`、`npm run guard` |
| 新增或修改 HTTP 路由 | 上面再加 `npm run api:surface:check` 与 `npm run auth:audit` |
| 迁移或 schema | `npm run check`、`npm run test:backend`、`npm run test:e2e`、`npm run guard`（G13/G17） |
| 插件 manifest 或端口 | `npm run guard`、`npm run test:backend` |
| 小程序 | `npm run miniprogram:check`、`tests/miniprogram` 下的小程序测试 |
| 版本或发布 | `npm run release`（它会跑验收门）；不要手改 |
| 依赖或构建变更 | `npm run check`、`npm run build`、相关测试项目 |

## 6. 代码与文档放在哪

### 6.1 后端

新的域是 `plugins/<slug>/`：

```text
plugins/<slug>/
  plugin.json           manifest：name、version、kernel 范围、dependsOn、tables、功能位、路由
  src/                  控制器、service/repository、支撑 helper
  src/index.ts          注册路由、端口与清理规则
  src/public.ts         允许其他插件 import 的唯一表面
```

内核与运行时保持通用。如果一项改动要求内核认识某个业务名字，说明设计错了：改为发布端口，或新增一个 infrastructure tier 的插件。

### 6.2 前端

新的业务代码从 `src/features/<domain>/` 进入（API 客户端、hooks、页面导出）。共享 UI 在 `src/components/` 与设计系统套件里。面向路由的页面注册在路由表里；生成文件由脚本产出，不能手改。

### 6.3 测试

- `tests/app/` —— jsdom 里的 React 页面，对接 MSW。
- `tests/backend/` —— 内核、运行时与插件，跑在真实数据库上。
- `tests/e2e/` —— 组装后的应用跑在真实 HTTP 上，按角色遍历。
- `tests/guardrails/` —— 静态的架构与文档契约。
- `tests/miniprogram/` —— 小程序逻辑。

优先把测试加到真的会因为这个缺陷而失败的项目里。护栏应当是机械的，并说明它为什么存在；棘轮只能降不能升。

### 6.4 文档

- 入口：[`README.md`](README.md)（[简体中文](README.zh-CN.md)）、[`AGENTS.md`](AGENTS.md)（[简体中文](AGENTS.zh-CN.md)）与 [`docs/README.md`](docs/README.md)（[简体中文](docs/README.zh-CN.md)）。
- 架构/重构：[`docs/migration/HANDOFF.md`](docs/migration/HANDOFF.md)、[`docs/migration/BOOTSTRAP_PROMPT.md`](docs/migration/BOOTSTRAP_PROMPT.md)，以及它们旁边的各阶段记录。
- 工程规范：[`docs/versioning.md`](docs/versioning.md)、[`docs/branch-strategy.md`](docs/branch-strategy.md)、[`docs/design-system.md`](docs/design-system.md) 与 [`docs/security/route-authorization-matrix.md`](docs/security/route-authorization-matrix.md)。
- 微信小程序：[`docs/wechat/README.md`](docs/wechat/README.md)。这些指南实际上只有中文。
- `.trae/documents/` 是更早 AI 会话留下的历史计划。它们不是当前指令；不要拿它们当状态。

## 7. 改动工作流

### 7.1 计划与范围

- 改代码前先读代码。写新 helper 前先搜已有实现。
- 一次只做一件事。不要把重构、修复与功能捆在一起。
- 迁移期间不要「顺手把它修了」。一个没被要求的行为变更不会让测试变红；请记录缺陷与修法。
- 让 diff 可评审。不要重排无关文件，也不要改任务没要求的名字。

### 7.2 提交

仓库用 Conventional Commits，标题用中文或英文；正文说明为什么，包括 diff 里看不出来的约束。

```text
type(scope): 一行摘要

为什么需要这个改动、刻意不做什么，以及下一位读者否则会踩的坑。

验证：跑过的命令与结果。
```

类型从 `feat`、`fix`、`refactor`、`docs`、`test`、`chore`、`release`、`ci`、`style` 里选。作用域通常是域或工具（`pet`、`wechat`、`release`、`guardrails`、`readme`）。

### 7.3 Pull Request

用 [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md)。在验证部分写清命令与结果；没有证据的检查清单不算验证。有 Issue 就关联。主要由 AI 生成的改动请披露，并且要能解释与测试它。

### 7.4 发布

只有维护者切版本。规范性规则在 [`VERSIONING.md`](VERSIONING.md)（[简体中文](VERSIONING.zh-CN.md)）；[`docs/versioning.md`](docs/versioning.md) 是设计记录。发布是一个原子事件：tag。不要在脏工作区上创建发布，也不要在发布后移动 tag。

## 8. 部署与运维安全

部署资产是 [`install.sh`](install.sh)、[`update.sh`](update.sh) 与 [`scripts/deploy-common.sh`](scripts/deploy-common.sh)；更新器会校验 `SHA256SUMS`，缺失就拒绝更新。完整流程见 [`README.md`](README.md)，小程序部署路径见 [`docs/wechat/`](docs/wechat/README.md)。

生产红线：

- `ENCRYPTION_KEY` 已设置、已备份，且永不重新生成。
- `ALLOW_LEGACY_HEADER_AUTH` 不设置。header 桥信任客户端自报身份；打开它，任何调用方都能变成任何用户。
- 生产环境不设置 `WECHAT_ALLOW_DEV_LOGIN`。`NODE_ENV=production` 时这条开发登录路径会被拒绝，但不要只依赖这一点。
- 更新前校验发布包的校验和。
- SQLite 数据库、`uploads/` 与 `.env` 不对外提供，也不进版本库。
- 超管使用唯一密码，存进密码管理器，不要写在文档里。

如果密钥泄露，当作已泄露处理：轮换受影响凭据；`ENCRYPTION_KEY` 要先按脚本头部说明重加密数据。

## 9. 完成的定义

一项改动算完成，当且仅当：

- 前面相关章节的要求都满足，选定的检查全绿。
- 新行为有「没有这个改动就会失败」的测试。
- 改动影响文档时，双语配对与 [`docs/README.md`](docs/README.md)（[简体中文](docs/README.zh-CN.md)）已更新。
- 没有密钥、`.env`、学生数据或本地状态被暂存。
- 除非本次就是发布，否则版本号与 CHANGELOG 未被改动。
- 提交信息说明了为什么；最终总结区分「已验证」与「未验证」。

## 10. 有疑问时怎么办

先自己查：读代码、测试、脚本或命令输出。只把仓库回答不了的决定交给用户 —— 产品范围、破坏性操作、凭据、法务或公开发布选择。提问时给出选项与每个选项的后果。

如果当前环境跑不了某条必需命令，直说，并继续跑能跑的检查。被阻塞的检查不等于通过的检查。
