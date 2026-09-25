# 微信小程序：部署与发布文档

这套文档只解决一件事：**把 Think-Class 变成一个小程序能正常访问的、合规上线的后端，并把它发布出去**。
它不是"微信小程序入门"，也不重复仓库里的开发文档（那些在 [`docs/`](../) 与 [README.md](../../README.md)）。

## 文档索引

| 文档 | 用途 | 什么时候读 |
| --- | --- | --- |
| 本文档 | 两条部署路线的决策、共同前置条件 | 动手之前 |
| [00-competition-checklist.md](00-competition-checklist.md) | 竞赛硬约束、时间线、需要准备的材料（主体/类目/隐私指引） | 决定参赛的第一天 |
| [10-deploy-cloudrun.md](10-deploy-cloudrun.md) | **Track A（推荐）**：微信云托管部署，无服务器、无域名、免备案 | 没有已备案域名，或想最快跑通 |
| [20-deploy-selfhosted.md](20-deploy-selfhosted.md) | **Track B**：自有服务器（`install.sh` + Nginx + certbot HTTPS） | 已有服务器和备案域名 |
| [30-release-miniprogram.md](30-release-miniprogram.md) | 小程序后台配置、真机预览、上传、提交审核、发布、回滚 | 后端已经能被小程序访问之后 |
| [40-troubleshooting.md](40-troubleshooting.md) | 排错清单：域名/证书/TLS/并发/会话/存储，每条给症状→原因→命令 | 出问题的时候 |

部署资产（本分支新增）：

| 文件 | 用途 |
| --- | --- |
| [`deploy/Dockerfile`](../../deploy/Dockerfile) | 生产镜像：`node:24-slim` + 原生模块编译链 + `npm ci` + Prisma 生成 + 前端构建 |
| [`deploy/.dockerignore`](../../deploy/.dockerignore)、[`deploy/Dockerfile.dockerignore`](../../deploy/Dockerfile.dockerignore) | 构建上下文排除清单（内容相同，生效的是后者，原因见文件头注释） |
| [`deploy/nginx/think-class-https.conf`](../../deploy/nginx/think-class-https.conf) | 443 + HTTP→HTTPS 跳转 + HSTS 的反代模板（Track B） |
| [`.env.example`](../../.env.example) | 全部环境变量与注释，无任何真实密钥 |
| [`scripts/wechat/upload.mjs`](../../scripts/wechat/upload.mjs) | 用 `miniprogram-ci` 上传小程序代码，供重复发布与 CI 使用 |

小程序客户端在 [`miniprogram/`](../../miniprogram)（原生小程序 + TypeScript）：
部署坐标写在 [`miniprogram/config/index.ts`](../../miniprogram/config/index.ts)，
传输层在 [`miniprogram/utils/request.ts`](../../miniprogram/utils/request.ts)（`wx.request` 与
`wx.cloud.callContainer` 共用同一套信封与 401 恢复）。

## 决策表：Track A（云托管） vs Track B（自有服务器）

小程序要访问后端，只有这两条路。差别不在技术偏好，而在**你有没有一个已备案的域名**。

| 维度 | Track A：微信云托管 | Track B：自有服务器 |
| --- | --- | --- |
| 需要域名吗 | 不需要。小程序用 `wx.cloud.callContainer` 直连服务，无需在公众平台配置通讯域名 | 需要。`wx.request` 只能打 `https://` 域名，且必须写进「服务器域名」白名单 |
| 需要 ICP 备案吗 | 不需要（流量走微信自己的通道，不经过你自己的域名） | **需要**。境内主体的域名必须备案，否则无法作为服务器域名；备案周期由各省管局决定，不可控 |
| 需要自己管 HTTPS 证书吗 | 不需要（平台入口本身是 HTTPS）。但要保证容器内应用是 HTTP，让平台终止 TLS | 需要。仓库里**没有任何 TLS 配置**（[`install.sh`](../../install.sh) 只写 HTTP/80，[`api/server.ts`](../../api/server.ts) 只 `app.listen`），必须自己上 certbot + [`deploy/nginx/think-class-https.conf`](../../deploy/nginx/think-class-https.conf) |
| 需要服务器吗 | 不需要 | 需要：Ubuntu/Debian/CentOS 系、root、根分区 ≥1GB 可用空间、Node.js 24 |
| 成本 | 云托管按量计费（CPU/内存/流量）+ CFS 存储费，具体价格以云托管控制台价格页为准；不产生服务器闲置费 | 已有服务器时增量为 0；新购服务器按云厂商价格。没有额外平台费 |
| 首次部署耗时（估计） | 半天以内：建环境与服务、构建/推送镜像、挂载 CFS、验证持久化 | 1–2 小时：`install.sh` 全流程 + 证书签发 + 白名单配置；**不含**备案与 DNS 生效的等待 |
| 数据持久化 | 必须挂 CFS 到 `/data`，否则重启即丢库（见下方回退条款） | 本地磁盘，`/class/database.sqlite` 与 `/class/uploads` |
| 并发/副本 | 必须**单副本**（最小=最大=1）：SQLite 只有一个写者 | PM2 单进程，同样是单写者 |
| 适用主体 | 不涉及备案主体资质：注册小程序拿到 AppID 即可（**个人主体能否开通云托管以控制台实际选项为准**，个人主体在类目与能力上另有受限项，见 00 文档） | 需要能备案的主体（个人备案可行，但用途与类目受限，见 00 文档） |
| 代码从哪来 | 你本地的分支源码 → `docker build` → 镜像。**本分支的新代码可以直接上** | `install.sh` 下载的是**最新 GitHub Release**，不是当前分支。本分支未发版前，Track B 装不到 `plugins/wechat`（见下） |
| 更新方式 | 重新构建镜像 → 控制台发布新版本（容器重建，挂载卷不动） | `bash update.sh` 或超管后台一键更新（校验 SHA256SUMS、失败自动回滚） |
| 主要风险 | 挂不上持久化存储 → 数据每次重启归零 | 备案、证书链、TLS 版本、安全组任一处出错，小程序请求全部失败 |
| 推荐场景 | 竞赛提报期的默认选择：**没有备案域名时的唯一快速路径** | 已经有服务器 + 已备案域名，或需要完全掌控数据落盘位置 |

### 一句话结论

- 手上没有已备案域名 → **Track A**，并且先做「挂 CFS + 单副本 + 重启后数据还在」这一步的验证。
- 已有服务器和备案域名 → **Track B**，照 [20-deploy-selfhosted.md](20-deploy-selfhosted.md) 走，HTTPS 用模板里的 certbot 路径。
- 两条都不是"装完就完"：无论哪条，**下一步都是** [30-release-miniprogram.md](30-release-miniprogram.md)。

## 两条路线的共同前置条件

无论选哪条，下面四件事都一样，先做完再动手：

1. **小程序主体与 AppID**：在微信公众平台注册小程序（个人主体也可以），拿到 AppID。
   服务类目与隐私保护指引直接决定审核能不能过，见 [00-competition-checklist.md](00-competition-checklist.md)。
2. **`ENCRYPTION_KEY` 生成一次并立刻备份**：32 字节，用于加密学生姓名。
   丢了不是"重新登录"那么简单 —— 已加密的姓名会永久不可读（[`api/db.ts`](../../api/db.ts) 的 `encryptionKey()`，guardrail G18）。
   ```bash
   node -e "process.stdout.write(require('node:crypto').randomBytes(16).toString('hex'))"
   ```
3. **超管账号**：`SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD` 必须在首次启动前设好。
   安装器与镜像都不提供默认账号；数据库里没有 superadmin 行又没有这两个变量时，应用**拒绝启动**。
4. **微信登录的两个密钥**：`WECHAT_APPID` / `WECHAT_SECRET`（后端插件 `plugins/wechat`）。
   没配时 `/api/wechat/login` 返回 **503**，这是刻意的：没有内置默认值，
   也绝不能让 AppSecret 落到小程序端。小程序侧的部署坐标在
   [`miniprogram/config/index.ts`](../../miniprogram/config/index.ts)（`BASE_URL` / `TRANSPORT` / `CLOUD_ENV` / `CLOUD_SERVICE`）。

> **Track B 的一个硬约束**：`install.sh` 是"下载最新 GitHub Release 并解包"的安装器
> （[`install.sh`](../../install.sh) 的 `download_latest_release()`）。也就是说它装的是**已发版的代码**，
> 不是当前分支。要用本分支尚未发版的小程序后端，只有两种做法：
> ① 先把后端代码走一次发版流程（tag → CI → Release），再 `install.sh`；
> ② 不走 `install.sh`，在服务器上直接 `npm ci && npx prisma generate --schema prisma/schema.prisma && npm run build`
> 然后 `pm2 start npm --name think-class -- run start`。
> **Track A 没有这个问题** —— `docker build` 直接构建你手上的源码。

## 已知限制（写在最前面，避免踩到才发现）

- 仓库里没有 TLS：HTTPS 只能由 Nginx（Track B）或平台（Track A）提供。
- `install.sh` 生成的 Nginx 配置是 HTTP/80，且**没有** `client_max_body_size`；
  nginx 默认上限 1MB，而拍照题的应用侧上限是 10MB（`MAX_PHOTO_BYTES`）—— 不换模板，稍大的手机照片会 413。
- `install.sh` / `update.sh` 都不设置 `NODE_ENV`，PM2 起的进程实际是 development 模式（只有 `nodemon.json` 设了 development，那是本机开发用的）。
  这不只是日志级别问题：`plugins/wechat` 拒用开发登录的第一道闸就是 `NODE_ENV=production`。
- 小程序客户端目前**没有照片上传**（[`miniprogram/services/homework.ts`](../../miniprogram/services/homework.ts)
  只有作业读取/作答/保存/提交），拍照上传是 Web 端流程；要把作业照片做进小程序，需要补 `wx.uploadFile`
  与 `uploadFile` 合法域名。
- `UPLOADS_DIR` 在当前默认组合里**不生效**：上传文件的写入与静态服务都用 `<工作目录>/uploads`
  （[`api/app.ts`](../../api/app.ts#L86)、`plugins/homework`、`plugins/learning`）。容器里要持久化照片，挂载点必须落在工作目录下的 `uploads`。
- 应用没有开启 Express `trust proxy`，所以在 Nginx 后面 `req.ip` 记录的是 `127.0.0.1`（代理自身），
  登录与审计日志里的 IP 不可用。
- SQLite 目前以 WAL 打开（[`packages/kernel/src/storage/connection.ts`](../../packages/kernel/src/storage/connection.ts)，
  以及默认组合里的 [`api/db.ts`](../../api/db.ts#L22)）。WAL 依赖文件锁与共享内存，**不能放在网络/共享存储上**。
  `DATABASE_SKIP_WAL=1` 是本分支引入的关闭开关 —— 在它落地之前，源码里读不到这个变量，
  所以**不要把数据库放在网络挂载（CFS/NFS）上**；落地后按 [10 文档第 6.2 节](10-deploy-cloudrun.md#62-数据库本身是完整的且没有开-wal)
  的 `PRAGMA journal_mode` 验证确认它生效。
