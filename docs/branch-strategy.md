# 分支分工方案 · Think-Class

> **状态**：已定稿并落地（「小程序与主应用分线」轮）
> **适用**：`xhnhhnh/Think-Claass`、微信云托管的构建分支选择、`install.sh` / `update.sh` 部署链路
> **结论**：Web 与小程序是**两个交互界面**，但共用**同一个后端、同一份数据**。所以后端能力放在
> 两条分支共享的 `main` 上，`feat/wechat-miniprogram` 只多带小程序**客户端**与它自己的文档。

---

## 1. 一张图看清分工

```
                 ┌──────────────────────────────┐
   Web 浏览器 ───┤                              │
                 │   共享后端（main）            │─── SQLite：同一份数据
   微信小程序 ───┤   /api/** 同一个 API          │     班级 / 学生 / 作业 / 积分
  （客户端在      │   plugins/wechat 也在里面     │
   另一条分支）   └──────────────────────────────┘
```

两个界面看到的是**同一批班级、同一批作业、同一个积分账户**。因此不存在"Web 的后端"与
"小程序的后端"两套，也不存在两份数据库。

## 2. 两条线

| | `main` | `feat/wechat-miniprogram` |
| --- | --- | --- |
| 负责 | Web 端 + **共享后端**（API、内核、全部业务插件、部署资产） | 小程序的**客户端** `miniprogram/`，以及小程序自己的文档 `docs/wechat/` |
| 部署 | `install.sh` + `update.sh`（PM2）、GitHub Release 压缩包 | 客户端在微信开发者工具上传审核；**不单独部署后端** |
| 微信云托管从哪构建 | **`main`**（这也是"两个界面共用一个后端"的落地方式） | 不用它构建；这里没有后端可部署 |
| 插件数 | **23**（含 `plugins/wechat`） | **23**（与 `main` 相同） |
| 端点快照 `tests/guardrails/snapshots/api-surface.json` | **332** | **332**（与 `main` 相同） |

`main` 上有 `plugins/wechat`、`deploy/Dockerfile`、`scripts/wechat/`、`DATABASE_SKIP_WAL`，
**没有** `miniprogram/`、没有 `docs/wechat/`。

## 3. 代码边界

| 路径 | 在哪条线上 | 说明 |
| --- | --- | --- |
| `api/`、`src/`、`packages/`、`plugins/`（含 `plugins/wechat`）、`deploy/`、`scripts/`、`tests/` | `main`（两条线共享） | 共享后端与它的部署资产。小程序要读作业、交作业、加分，走的就是这里的 API |
| `miniprogram/**` | `feat/wechat-miniprogram` | 原生小程序 + TypeScript。不引用 `@thinkclass/*`，不在 pnpm workspace 里，不参与仓库构建与打包；唯一的平台依赖是 `wx` 全局，测试用 `tests/miniprogram/helpers/fake-wx.ts` 假造 |
| `tests/miniprogram/**` | `feat/wechat-miniprogram` | 客户端测试直接 `import('../../miniprogram/utils/*')`，所以跟客户端走同一条线。`main` 的 `vitest.backend.config.ts` 仍然写着这个 include，在没有该目录的分支上它匹配不到任何文件、不会失败 |
| `docs/wechat/**` | `feat/wechat-miniprogram` | 小程序的部署、发布、竞赛清单、排错、提报材料 |
| 其余文档（`README*.md`、`docs/*.md` 除 `docs/wechat/`） | `main` | 记录共享后端的事实；两条线内容相同 |

**分界规则（唯一一条要记的）**：**后端与服务端代码走 `main`，小程序客户端走 `feat/wechat-miniprogram`。**
只改了客户端，就只动小程序线；改了 API、插件、数据库或部署，就动 `main`。

## 4. 同步规则

- **小程序线定期合并 `main`**：`git merge main`。方向永远是 `main → feat/wechat-miniprogram`，
  所以 `main` 始终是小程序线的祖先，两条线不会永久分叉。
- **共享后端的修复只进 `main`**：修在 `main` 上，再由下一次合并带进小程序线。反向把后端代码
  从小程序线提回 `main` 会产生两条不同的历史，不要这么做。
- **何时同步**：后端有值得带上线的修复之后，以及每次小程序提审之前。
- 客户端改动**不**需要回 `main`（`main` 上没有客户端）。

## 5. 部署

### 共享后端（`main`）

- **Track A（微信云托管）**：绑定仓库、分支选 **`main`**，Dockerfile 填 `deploy/Dockerfile`，
  目标目录留空，容器端口 3001，最小/最大副本数都是 1。
- **Track B（自有服务器）**：`install.sh` 装最新 Release，或按
  [docs/wechat/20-deploy-selfhosted.md](wechat/20-deploy-selfhosted.md) 第 8 节手工部署。
- 环境变量里必须齐全的是 `WECHAT_APPID` / `WECHAT_SECRET`；库放在网络挂载（CFS）上时还要
  `DATABASE_SKIP_WAL=1`。两处细节见 [README.md](../README.md) 的环境变量表。

### 小程序客户端（`feat/wechat-miniprogram`）

用微信开发者工具打开本分支的 `miniprogram/` 目录，改 `miniprogram/config/index.ts` 里的部署坐标
（`BASE_URL` / `TRANSPORT` / `CLOUD_ENV` / `CLOUD_SERVICE`），然后按
[docs/wechat/30-release-miniprogram.md](wechat/30-release-miniprogram.md) 上传提交审核。

> 后端与客户端分在两条分支，但**指向同一个服务**：客户端不打包任何后端代码，它只是调用
> `/api/**`。所以"共用一个后端"不需要两条分支合并成一条。

### Web 版发布（`main`）

`npm run release --push` 在 `main` 上打 tag，`.github/workflows/release.yml` 由 tag 触发产出
Release 压缩包。push 到 `main` 本身**不触发**任何发布，tag 才是发布事件（见 [versioning.md](versioning.md)）。

## 6. 护栏

- `tests/guardrails/snapshots/api-surface.json` 在两条线上都是 **332**，因为共享后端在 `main` 上。
  数字变化时在 `main` 上更新，再合并进小程序线。
- `README.md` / `README.zh-CN.md` 的插件数（23）与端点数按共享后端的事实写，两条线一致。
- 小程序线的 `npm run test:backend` 会**一并**跑 `tests/miniprogram/**`（信封、401 静默重登、
  tab 门控），因为 `vitest.backend.config.ts` 把该目录收进了 `backend` 项目。
- 一条容易踩的坑：`plugins/wechat` 的 `required: false`，所以缺 `WECHAT_APPID` / `WECHAT_SECRET`
  时应用照常启动、只有两条登录路由回 503 —— 部署后如果小程序登录失败，先查这两个变量。
