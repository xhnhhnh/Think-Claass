# 分支策略：单主干 · Think-Class

> **现状（2026-10-17）**：仓库只有一条长期分支 **`main`**。Web 端（`src/`）、共享后端
> （`api/`、`packages/`、`plugins/`）、微信小程序客户端（`miniprogram/`）、文档与部署资产
> 都在同一个提交上。小程序客户端集中在一个文件夹里：`miniprogram/`。
>
> **历史**：曾经并行使用 `main`（Web 发版线 + 共享后端）与 `feat/wechat-miniprogram`
> （小程序客户端 + 微信文档）。两条线在 v2.2.0 之前已经汇合；之后该分支又追加了两批文档提交。
> 2026-10-17 经 GitHub PR #1 合并进 `main`（merge commit，合并结果与分支树一致），随后删除
> 远端与本地分支。**不要恢复长期的小程序分支。**

---

## 1. 一条主干上的目录

| 内容 | 位置 |
| --- | --- |
| Web 控制台（超管、教师、学生、家长） | `src/` |
| 共享后端（API、内核、插件运行时、业务插件） | `api/`、`packages/`、`plugins/` |
| 小程序客户端 | `miniprogram/` |
| 小程序测试 | `tests/miniprogram/` |
| 小程序部署与发布文档 | `docs/wechat/` |
| 微信开发者工具工作副本 | `wechat/`（被 git 忽略；从 `miniprogram/` 同步） |
| 部署与发布资产 | `deploy/`、`install.sh`、`update.sh`、`pack.sh` |

`miniprogram/` 是自包含的独立 TypeScript 项目：它有自己的 `tsconfig.json`、
`project.config.json`、页面、组件与服务。它**不在** pnpm workspace 里，**不参与**根目录的
`npm run build`，唯一的平台依赖是微信的 `wx` 全局；测试用
[`tests/miniprogram/helpers/fake-wx.ts`](../tests/miniprogram/helpers/fake-wx.ts) 假造。

## 2. 小程序客户端

- **同一个后端、同一份数据**：小程序调用 `/api/**`，与 Web 端共用鉴权、班级功能开关和领域数据。
  不存在"小程序后端"或第二份数据库。
- **检查方式**：`npm run miniprogram:check`（独立类型检查）；`tests/miniprogram/**` 被
  `vitest.backend.config.ts` 的 backend 项目收进去，所以 `npm run test:backend` 会一并跑小程序测试。
- **上传方式**：用微信开发者工具打开 `miniprogram/`（或同步出来的 `wechat/`），按
  [30-release-miniprogram.md](wechat/30-release-miniprogram.md) 上传、审核、发布。
- **云托管（Track A）**：仍然从 **`main`** 构建镜像。`deploy/Dockerfile` 的 `COPY . .` 会把
  `miniprogram/` 一起带进镜像，但服务端不加载它（它只是仓库里的一个目录）；这不影响镜像行为。
- **自有服务器（Track B）**：`install.sh` 装的是最新 GitHub Release。Release 压缩包是**服务端
  分发物**，由 `pack.sh` 组装，不含 `miniprogram/`；客户端始终从仓库上传，不走 Release。

## 3. 日常改动

- `main` 是**唯一长期分支**。需要隔离时从 `main` 切短期特性分支，合回 `main` 后删除；
  不要新建长期的小程序分支。
- 小程序改动与后端/Web 改动在同一个提交树上。改完按 [AGENTS.md](../AGENTS.md) §5 选检查；
  只动小程序时至少跑 `npm run miniprogram:check` 与 `npm run guard`。
- 发布仍是 **tag 事件**（见 [VERSIONING.md](../VERSIONING.md)）：推 `main` 本身不发布，
  `npm run release --push` 打的 tag 才触发 Release 压缩包。云托管在需要上线新后端时重新构建 `main`。

## 4. 为什么不再分线

- 两个界面共用一个后端、一份数据库。分线不会产生两套服务，只会让文档、构建配置和依赖版本漂移：
  这次合并之前，`main` 缺 AGENTS/VERSIONING 等标准文档，而小程序分支又落后于 `main` 的后端修复。
- 部署时不必再选分支：云托管绑定 `main`，小程序客户端也取自同一个提交，坐标天然一致。
- 如果将来确实需要并行开发（例如一次较大的客户端改版），用短期分支，保持 `main` 为祖先、
  只向 `main` 合并，并在合并后删除分支。

## 5. 护栏

- `npm run miniprogram:check` 必须通过；它不在根 `tsconfig.json` 的 include 里，别以为
  `npm run check` 顺带检查了它。
- `tests/miniprogram/**` 跟随后端测试项目跑。
- `docs/**` 的变更要同时更新中英索引与配对文档，`npm run guard` 会检查。
- **不要移动 `miniprogram/`**，也不要新建平行目录：移动会同时改 `miniprogram/tsconfig.json`、
  `vitest.backend.config.ts` 的 include、文档链接和微信开发者工具的目录约定。
- 根目录的 `wechat/` 是给微信开发者工具打开的、被 git 忽略的工作副本，不是源码。用
  [`scripts/wechat/sync-miniprogram.mjs`](../scripts/wechat/sync-miniprogram.mjs) 从
  `miniprogram/` 同步，不要直接改副本。
