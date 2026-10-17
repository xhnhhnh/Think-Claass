[English](CONTRIBUTING.md) | 简体中文

# 为 Think-Class 贡献代码

感谢你愿意花时间让 Think-Class 变得更好。本项目是一个班级游戏化全栈平台：React/Vite 前端、基于 SQLite 的 NestJS/Express 后端、一个最小的内核加插件体系，以及一个微信小程序。任何规模的贡献都受欢迎 —— 代码、文档、翻译修正、缺陷报告与设计反馈。

> 本文是 CONTRIBUTING.md 的中文译本，与英文版同步维护；如有冲突，以英文版为准。

## 我们欢迎什么

- **代码**：前端功能、后端行为、插件、内核与运行时的改进，以及配套的测试。
- **文档**：修正英文文档及其中文译本。翻译修正同样是一份真正的贡献，不是次要的工作。
- **报告**：可复现的缺陷、无障碍问题、令人困惑的报错信息与过时的文档。
- **评审与设计反馈**：在开放的 issue 与 pull request 上。

参加本项目即表示你同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)（[简体中文](CODE_OF_CONDUCT.zh-CN.md)）。请勿公开报告安全问题，而应遵循 [SECURITY.md](SECURITY.md)（[简体中文](SECURITY.zh-CN.md)）。

## 开始之前

先读下面这些；每一份回答的是不同的问题：

- [README.md](README.md)（[简体中文](README.zh-CN.md)）—— 安装、配置、脚本、验证与部署。
- [AGENTS.md](AGENTS.md)（[简体中文](AGENTS.zh-CN.md)）—— 工作约定：架构边界、红线，以及一项改动需要跑哪些检查。它写给 AI 代理使用，同样适用于按同样方式工作的人类维护者。
- [docs/README.md](docs/README.md)（[简体中文](docs/README.zh-CN.md)）—— 仓库里每一份文档的地图。
- [docs/migration/HANDOFF.md](docs/migration/HANDOFF.md) —— 在改动内核、插件边界或迁移之前必读；它是架构重构的权威入口。
- [.env.example](.env.example) —— 被纳入版本管理的配置模板。

**工作区、`git` 和命令输出才是事实源。** 文档由人撰写，可能滞后；当文档与代码树冲突时，相信代码树，并在同一次改动里把文档改对，同时在提交信息中说明。不要为了迁就过时文档而修改可用的代码。

## 环境要求与首次运行

### 环境要求

- Node.js >= 24（见 [`engines`](package.json) 字段）与 npm。不需要任何全局工具。
- `npm` 是唯一的包管理器，`package-lock.json` 是唯一的锁文件。不要切换到 pnpm 或 yarn，也不要因为其他改动而顺带重新生成锁文件。
- Windows 是受支持的开发环境。Shell 脚本（`install.sh`、`update.sh`、`pack.sh`）是 Bash 脚本：请通过 Git Bash 或 WSL 运行。Windows 部署另提供 `update.ps1`。

安装依赖：

```bash
npm install
```

### 配置环境变量

从纳入版本管理的模板创建本地配置：

```bash
cp .env.example .env
```

有三个值必须提供，且它们都没有默认值：

```env
SUPERADMIN_USERNAME="<your-admin-name>"
SUPERADMIN_PASSWORD="<unique-strong-password>"
ENCRYPTION_KEY="<32 characters>"
```

- `SUPERADMIN_USERNAME` 与 `SUPERADMIN_PASSWORD` 用于创建超管账号。没有默认账号，也没有固定密码；数据库里没有超管行、环境变量也没设时，应用会拒绝启动。
- `ENCRYPTION_KEY` 必须**恰好 32 字节**，且源码里任何地方都没有默认值（护栏 G18）。它用于静态加密学生姓名，同一部署的每个实例都必须使用同一个值。请用 README 里的一行命令生成一次：

```bash
node -e "console.log(require('node:crypto').randomBytes(16).toString('hex'))"
```

不要随意重新生成密钥：丢失它会让已加密的学生姓名永久不可读。确需轮换时，先把已有的行重新加密，具体做法见 [`scripts/rotate-encryption-key.mjs`](scripts/rotate-encryption-key.mjs) 头部的说明。

`.env` 保存密钥，**绝不能提交**。`database.sqlite*`、`uploads/`、`logs/`、`dist/` 等本地状态同样被 git 忽略。

### 启动开发栈

```bash
npm run dev
```

这会同时跑起 Vite 和 API：前端在 `http://localhost:5173`，并把 `/api` 代理到 `http://localhost:3001` 的 API。超管后台在 `/beiadmin`。若要把两部分放在各自的终端里运行，请用 `npm run client:dev` 与 `npm run start`。

首次启动只会用环境变量创建超管账号，不会做别的初始化。不会播种任何教师、学生或家长账号：教师自行注册（或由管理员在后台创建），学生与家长由他们的教师添加。数据库是本地 SQLite 文件；其余配置都是可选的，见 [README.md](README.md)（[简体中文](README.zh-CN.md)）。

> **编辑 `plugins/**` 或 `packages/**` 不会重启 API。** `npm run dev` 通过 `nodemon` 启动服务端，而后者的监听列表只有 `api/`（[`nodemon.json`](nodemon.json)）。在插件里工作时，请手动重启，或在你自己的监听器下运行 `npm run start`。

## 60 秒了解架构

- `packages/kernel` 拥有存储与迁移、设置、审计、HTTP 外壳与认证原语。它不含任何业务知识 —— 没有一个业务表名，也没有一个功能键。
- `packages/plugin-runtime`、`packages/plugin-sdk` 与 `packages/contracts` 分别是插件宿主、插件编译所依赖的 API，以及纯共享类型。
- 每一个业务域都是 `plugins/<slug>/` 下的插件，带一份 `plugin.json` manifest。插件之间只通过已发布的端口通信（`ctx.provide` / `ctx.use` / `ctx.tryUse`）。
- 前端功能位于 `src/features/<domain>/`；`api/` 是组装根，负责挂载内核与插件。
- 测试位于 `tests/`，分为 `app`、`backend`、`e2e`、`guardrails` 与 `miniprogram` 项目。其中 `backend` 项目会启动真实的插件宿主与真实数据库。

架构重构看 [docs/migration/HANDOFF.md](docs/migration/HANDOFF.md)，改 UI 前看 [docs/design-system.md](docs/design-system.md)，在假设哪条分支拥有什么之前看 [docs/branch-strategy.md](docs/branch-strategy.md)。

## 改动应该放在哪里

| 改动 | 应该放的位置 |
| --- | --- |
| 新的后端域或路由 | `plugins/<slug>/`，并带一份合规的 `plugin.json`；在 `src/index.ts` 注册路由、端口与清理规则。绝不要在 `api/` 下新增模块。 |
| 前端功能 | `src/features/<domain>/`（API 客户端、hooks、页面导出），共享 UI 取自 `src/components/`。 |
| 路由、页面注册或设计系统改动 | 在 `src/app/routing/` 注册路由，并用 `npm run route-modules` 重新生成模块映射；改 UI 前先读 [docs/design-system.md](docs/design-system.md)。 |
| 内核、插件运行时、插件 SDK 或契约 | `packages/kernel`、`packages/plugin-runtime`、`packages/plugin-sdk` 与 `packages/contracts`。`packages/contracts` 只有类型，没有运行时代码。 |
| 生成文件、快照与棘轮基线 | 用拥有它们的 npm 脚本重新生成 —— `npm run route-modules`、`npm run class-features`、`npm run api:surface:update`、`npm run ui:audit`、`npm run baseline`。绝不手工编辑。 |
| 文档 | 英文文件与它的 `.zh-CN.md` 译本必须一起改；每新增一份 `docs/**/*.md`，都要同时加进 `docs/README.md` 与 `docs/README.zh-CN.md` 两个索引。 |

如果一项改动似乎需要让内核知道业务名称，那说明设计错了：改为发布一个端口，或新增一个基础设施层插件。

## 按改动类型选择验证

挑能真正覆盖这项改动的最小集合，然后在声称完成前跑完整验收门。

| 改动 | 本地最少要跑的检查 |
| --- | --- |
| 文档、README 或翻译 | `npm run guard`（文档规范与链接） |
| 前端 UI 或客户端代码 | `npm run check`、`npm run test:app`、`npm run lint`、`npm run guard` |
| 后端或插件行为 | `npm run check`、`npm run test:backend`、`npm run test:e2e`、`npm run guard` |
| 新增或改动 HTTP 路由 | 后端那一组，外加 `npm run api:surface:check` 与 `npm run auth:audit` |
| Schema 或迁移 | `npm run check`、`npm run test:backend`、`npm run test:e2e`、`npm run guard` |
| 插件 manifest 或端口 | `npm run guard`、`npm run test:backend` |
| 微信小程序 | `npm run miniprogram:check`，以及 `tests/miniprogram` 下的小程序测试 |
| 版本或发布 | `npm run release`（它会跑验收门）；绝不手工改版本号 |

`npm test` 会跑全部四个测试项目：`app`、`backend`、`e2e` 与 `guard`。迭代时可以用 `npm run test:app`、`npm run test:backend` 或 `npm run test:e2e` 单跑一个项目，但开 pull request 前仍须跑完整验收门。

CI 按顺序强制的验收门是：

```bash
npm run check
npm run api:surface:check
npm run miniprogram:check
npm run guard
npm test
npm run lint            # local only; not part of the release workflow
```

目前仓库里唯一的 GitHub 工作流只在发布 tag（`v*`）与手动触发时运行，没有 pull request 工作流。**pull request 必须附上本地验收门的输出** —— 命令及其结果 —— 写在验证部分。没有证据的勾选清单不算验证。

## 提交与 PR 规范

仓库使用 Conventional Commits：类型取自 `feat`、`fix`、`refactor`、`docs`、`test`、`chore`、`release`、`ci` 或 `style`，可带一个 scope，主题可以用中文或英文。

```text
type(scope): summary in one line

Why this change is needed, what it deliberately does not do, and any trap
that the next reader would otherwise fall into.

Verification: the commands that were run and their result.
```

- **一个 pull request 只做一件事。** 不要把重构、修复和新功能捆在一起；没人能评审的 diff 等于没被评审。
- **不要顺手做无关的修复。** 迁移期间，记录缺陷及其修法，而不是在你正好路过的地方改行为 —— 一个没被要求的行为变更不会让测试变红。
- 填写 [pull request 模板](.github/PULL_REQUEST_TEMPLATE.md)，包含验证证据；有对应 issue 时请链接它。
- 若改动主要由 AI 生成，请如实披露，并确保你能解释并测试它。

## 文档与翻译

- 长文档同时保留英文版与 `.zh-CN.md` 中文译本。**两者必须在同一次改动里一起更新**；出现冲突时以英文文件为准。
- 每新增一份 `docs/**/*.md`，都要同时加进两个索引：[docs/README.md](docs/README.md)（[简体中文](docs/README.zh-CN.md)）。
- 配对的中文文件在顶部声明它是英文文件的译本、且以英文版为准；请保持该声明准确。
- 不要在文档里写死容易过期的数字或哈希（插件数、端点数、测试数、版本号、分支名、HEAD）。要写数字时给出产生它的命令，以命令输出为准。
- 文档过时就顺手在同一次提交里改对，而不是继续引用它；若修正太大、当前改动装不下，请明确说明并记录。

## 发布流程（仅维护者）

一次发布是一个原子事件：一个 tag。只有维护者可以发版。

```bash
npm run release -- patch        # also: minor | major
npm run release -- minor --push # cut it, then push the commit and the tag
```

脚本会跑验收门、把版本号写在唯一的地方（`package.json`）、更新 changelog，并给通过验收的那个提交打 tag。它从不发布。**推送 tag 才是发布**：CI 会重跑验收门，从干净检出构建归档，写出 `SHA256SUMS` 并创建 GitHub Release，部署端会在更新前校验它。

绝不手工修改版本号、CHANGELOG 顶部条目或 tag。详细规则见 [docs/versioning.md](docs/versioning.md)。

## 许可证

Think-Class 以 MIT 许可证发布；见 [LICENSE](LICENSE)。贡献按同一许可证接受：入站即出站（inbound = outbound），均为 MIT。

## 寻求帮助

- 缺陷、文档问题与功能建议请开 GitHub issue。合适时请使用 issue 模板。
- 在询问某样东西在哪里之前，先读 [docs/README.md](docs/README.md)（[简体中文](docs/README.zh-CN.md)）；它索引了整套文档。
- 安全问题请遵循 [SECURITY.md](SECURITY.md)（[简体中文](SECURITY.zh-CN.md)），绝不要公开提交。
- 本项目不承诺响应时间或 SLA。一份附带复现步骤和你运行过的命令的清晰报告，是获得帮助最快的方式。
