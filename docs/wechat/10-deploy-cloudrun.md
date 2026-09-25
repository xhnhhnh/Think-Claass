# 10 · Track A：微信云托管部署（推荐）

**这条路解决的问题**：小程序要求 HTTPS，而 HTTPS 要求域名，域名要求 ICP 备案 ——
备案的时间不由你控制。云托管把这一段全部省掉：小程序用 `wx.cloud.callContainer` 直连你的服务，
不需要域名、不需要证书、不需要备案。

代价只有一个，而且是硬性的：**你必须挂一块持久化存储（CFS），并且只能跑单副本**。
挂不上就立刻改走 [Track B](20-deploy-selfhosted.md)，不要用"定时导出数据库"这种办法参赛。

适用对象：还没有已备案域名、或想在半天内先把全链路跑通的队伍。
决策依据见 [README 的决策表](README.md#决策表track-a云托管-vs-track-b自有服务器)。

---

## 0. 前置条件

| 项 | 说明 |
| --- | --- |
| 小程序主体 | 已注册小程序并拿到 AppID。**个人主体也可以走这条路**：官方 FAQ 明确「微信云托管面向全用户，业务项目有前后端分离场景需求，都可以使用」，同时「必须先有微信小程序/公众号才可以开通微信云托管」——所以注册小程序账号是这条路的第一步（[云托管常见问题](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/info/faq.html)）。注意主体影响的是**类目**而不是云托管：个人主体可选类目更窄，见 [00 竞赛清单](00-competition-checklist.md) |
| 微信云托管 | 用同一个微信账号/主体开通云托管，创建（或复用）一个**环境**。开通这一步要求小程序**已绑定手机号**，否则报 `-601009` —— 补填路径见 [40 文档 0.1](40-troubleshooting.md#01-云托管开不了-601009-该小程序没有绑定手机号) |
| 本地 Docker | **不是必须的**：没有本地 Docker 就走「绑定 Git 仓库」，见步骤 1 的 5 种来源对比 |
| `ENCRYPTION_KEY` | 32 字节，先生成并**离线备份**：`node -e "process.stdout.write(require('node:crypto').randomBytes(16).toString('hex'))"` |
| 超管账号 | `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD`：应用没有默认账号，缺一个就拒绝启动 |
| 预算 | 首个环境有 3 个月免费额度，比赛窗口（到 10.17，22 天）内的用量基本落在额度里 —— 数字见下方「要花多少钱」 |

### 要花多少钱（官方刊例价，2026 年页面）

来源：[产品定价](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/Billing/price.html)。
云托管是**按量付费、先用后付、每日结算**；**首个环境赠送免费额度，有效期 3 个月**：

| 计费项 | 刊例价 | 首个环境免费额度（3 个月） |
| --- | --- | --- |
| CPU | 0.055 元 /（核·小时） | 720 核·小时 |
| 内存 | 0.032 元 /（GB·小时） | 1440 GB·小时 |
| 构建时长 | 0.05 元 / 分钟 | 600 分钟 |
| 公网流量 | 0.8 元 / GB | 5 GB |

常见规格：`0.25 核 0.5G` = 0.02975 元/小时，`0.5 核 1G` = 0.0595 元/小时，`1 核 1G` = 0.087 元/小时。

按本项目算一遍（1 核 1G 常开 22 天 = 528 小时）：

- CPU `528 核·小时` < 720 ✅，内存 `528 GB·小时` < 1440 ✅ → **在免费额度内，实付 0 元**。
- **流量几乎为 0**：官方计费参数写明「只通过 callcontainer 访问服务不产生用量」——小程序走
  `wx.cloud.callContainer`（见第 8 节），所以那 5 GB 免费额度也基本用不到。
- 构建：一次 3–6 分钟，600 分钟免费 ≈ 能构建 100 次以上。
- 超出免费额度后的参考：1 核 1G 常开约 `0.087 × 24 × 30 ≈ 62.6 元/月`。
- 挂载 CFS 的存储费用不在这一页（按腾讯云文件存储计费，一个 SQLite 库加几张作业照片远小于 1 GB）。
  想再省钱可以把**最小副本设为 0**（缩容到 0，只在有请求时计费），代价是第一个请求要等冷启动几秒；
  比赛演示前先自己点一次唤醒即可。

> 数字都来自上面那页官方刊例价；**以控制台价格页与你的实际账单为准**。本仓库不承诺任何金额。

> 后端插件 `plugins/wechat` 提供 `/api/wechat/login`、`/bind`、`/me`、`/unbind`，
> 需要 `WECHAT_APPID` / `WECHAT_SECRET`。两个凭据是**每次登录时**读取的（不是启动时校验），
> 所以没配也不影响应用启动；没配时 `/api/wechat/login` 返回
> **503**「微信小程序未配置：请设置 WECHAT_APPID / WECHAT_SECRET」——没有默认值，也不该有。

---

## 1. 构建镜像

在**仓库根目录**执行（注意 `-f` 指向 `deploy/Dockerfile`，上下文是仓库根）：

```bash
# Linux / macOS
docker build -f deploy/Dockerfile -t think-class:1.0.0 .
```

```powershell
# Windows PowerShell
docker build -f deploy/Dockerfile -t think-class:1.0.0 .
```

镜像里做了什么（每一步都有理由，见 [`deploy/Dockerfile`](../../deploy/Dockerfile) 的注释）：

1. `node:24-slim` + `python3 make g++`（`better-sqlite3` 是原生模块；预编译包拿不到时 npm 会现场编译）。
2. `npm ci --include=dev` —— **不能省 devDependencies**：`npm run start` 就是 `tsx api/server.ts`，
   而 `tsx` 与 `prisma` 都在 devDependencies 里。用 `--omit=dev` 装出来的镜像启动即报 `tsx: not found`。
3. `npx prisma generate --schema prisma/schema.prisma`（与 [`scripts/deploy-common.sh`](../../scripts/deploy-common.sh) 的安装步骤一致）。
4. `npm run build` 生成 `dist/`（`api/app.ts` 从 `../dist` 提供前端，没有它首页是 404）。
5. `EXPOSE 3001` + `CMD ["npm","run","start"]` + 一个打 `GET /api/health` 的 `HEALTHCHECK`。

先把镜像在本地跑一次，比在云上排查便宜得多：

```bash
# 本地冒烟：不挂卷也能起，数据写在容器可写层（仅用于验证启动）
docker run --rm -p 3001:3001 \
  -e SUPERADMIN_USERNAME=admin -e SUPERADMIN_PASSWORD='换成你自己的强密码' \
  -e ENCRYPTION_KEY="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(16).toString("hex"))')" \
  think-class:1.0.0

# 另一个终端
curl -s http://127.0.0.1:3001/api/health
```

期望看到 `{"success":true,...}`，并且 `kernel.plugins.total` / `active` **不为 0**
（等于 `plugins/` 下的插件数；为 0 时 [`api/app.ts`](../../api/app.ts) 的 `assertUsableComposition()` 会直接拒绝启动，
所以真跑到 200 就说明插件已经加载了）。

### 代码怎么进云托管（**没有本地 Docker 也能做**）

官方「部署发布」文档里，选择代码的来源有 **5 种**：绑定 GitHub 仓库、绑定 GitLab 仓库、绑定 Gitee 仓库、
手动上传代码包、拉取镜像。前 4 种由云托管把代码构建成镜像，第 5 种直接部署现成镜像
（[部署发布](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/guide/service/online.html)）。

对**没有本地 Docker** 的人，按优先级选：

1. **绑定 GitHub / Gitee 仓库（推荐）**：把分支推到远端，云托管绑定仓库。
   首次发布时填两项：
   - **DockerFile 文件**：指定路径与文件名 —— 本仓库的 Dockerfile 在 **`deploy/Dockerfile`**，
     不在根目录，所以这里必须显式指定（官方原文：有文件则可以指定 Dockerfile 路径和名称）。
   - **目标目录**：留空（根目录）。构建上下文必须是仓库根，`COPY package.json …` 才找得到。
2. **拉取镜像**：如果你（或队友）本地有 Docker，`docker build` 后推到镜像仓库再拉取。
   注意：这一路**不产生构建用量**，但要在本地编译，镜像约几百 MB。
3. **手动上传代码包**：**不要选**。官方限制「大小不能超过 2 MiB」，而本仓库的源码包远超这个数
   （只算 `changes.patch` 就 445 KB，加上 `miniprogram/`、`docs/`、`后端接口说明/` 轻松过 10 MB）。

> 官方建议先在本地 Docker 跑通再上线。没有本地 Docker 时，第一次云端构建就是你的调试环节 ——
> 构建日志会实时显示在控制台，失败时先看日志里最后几行（最常见是 `npm ci` 或 `tsx: not found`）。
> 构建时长按 0.05 元/分钟计费，前 600 分钟免费，所以反复构建的代价可以忽略。

---

## 2. 创建服务（容器端口 3001、单副本、健康检查 `/api/health`）

在云托管环境里新建服务，按下表配置。控制台字段名可能随版本调整，**以实际界面为准**，
这里给出的是必须落到实处的值：

| 配置项 | 值 | 为什么 |
| --- | --- | --- |
| 服务名称 | 例如 `think-class` | 小程序侧 `X-WX-SERVICE` 要填这个名字 |
| 镜像 / 版本 | 上一步构建的 `think-class:1.0.0` | — |
| 容器端口 | **3001** | 必须与应用监听的端口一致（`PORT=3001`） |
| 最大副本数 | **1** | **硬要求**：SQLite 只能有一个写者 |
| 最小副本数 | **1**（预算紧可设 0） | 设 1 = 不会缩容到 0，第一个请求不撞冷启动；设 0 = 只在有请求时计费，代价是冷启动几秒。免费额度够 22 天常开，所以默认建议 1 |
| 健康检查 | HTTP `GET /api/health` | 这是 kernel 路由，两种组合下都提供；返回 200 才算实例可用 |
| 实例规格 | 最小档即可（1 核 1G 起，以控制台可选为准） | 一个班的并发量用不到更多；内存要够 SQLite 页缓存 |
| 公网访问 | 可选开启 | 只为了让你能 `curl` 自测；小程序侧不需要它。开启后控制台会给一个 HTTPS 测试域名 |

**为什么最大副本必须是 1**：SQLite 是单写者数据库。两个实例同时打开同一个库文件，会出现
`SQLITE_BUSY` / `database is locked`，严重时写丢失。数据库文件在 CFS 上并不会把这件事变好 ——
锁仍然不跨实例。

**最小副本是费用与冷启动的取舍，不是正确性问题**：1 表示常驻（免费额度够本项目 22 天），
0 表示缩容到 0 只在有流量时计费。无论选哪个，最大副本都必须是 1。

> 镜像里的 `HEALTHCHECK` 是 Docker 层的指令，平台通常不读它 —— **以控制台里的健康检查配置为准**。
> 两处都指向 `/api/health`，不会互相矛盾。

---

## 3. 挂载持久化存储（CFS → `/data`）

容器可写层在发布/重启后就没了。**必须**挂一块 CFS 文件存储：

1. 在云托管的存储挂载配置里新增一条：CFS 文件系统 → 挂载路径 **`/data`**。
2. 挂载后目录属主由平台决定；镜像以 root 运行（`node:24-slim` 默认用户），不需要额外 chown。
3. 数据库落在 `/data/database.sqlite`（`DATABASE_FILE` 指定），照片落在 `/data/uploads`
   （镜像里 `/app/uploads` 是指向 `/data/uploads` 的符号链接，见下）。

### 关于 `UPLOADS_DIR` 与照片路径（一个必须说清的坑）

当前默认组合（`KERNEL_ENABLED` 未设）里，上传文件的**写入**和**静态服务**都固定用
`<工作目录>/uploads`，`UPLOADS_DIR` 在这条路径上**不生效**：

- 静态服务：[`api/app.ts`](../../api/app.ts#L86) 用 `path.join(process.cwd(), 'uploads')`；
- 拍照题写入：`plugins/homework` 用 `path.join(process.cwd(), 'uploads', 'homework')`；
- 试卷文件：`plugins/learning` 用 `path.join(process.cwd(), 'uploads', 'papers')`。

[`deploy/Dockerfile`](../../deploy/Dockerfile) 因此把 `/app/uploads` 做成指向 `/data/uploads` 的符号链接，
于是"只挂一个 `/data`"就同时覆盖了数据库和照片。两种做法都可行：

- **推荐**：CFS → `/data`，`DATABASE_FILE=/data/database.sqlite`，照片经由符号链接落到 `/data/uploads`。
- **或者**：直接再挂一条 CFS → `/app/uploads`（挂载会覆盖那个符号链接，同样能用），
  此时 `DATABASE_FILE` 仍然指向 `/data/...`，所以两条挂载都要配。

**不要**设 `UPLOADS_DIR=/data/uploads` 就以为照片会跟着走：它被忽略，而 `/app/uploads` 的符号链接才是
真正生效的那一环。设了也不会出错（值恰好一致），但别把它当机制。

---

## 4. 环境变量清单

在服务的环境变量里配置（有"密钥/加密变量"类型就用它，尤其是 `ENCRYPTION_KEY` 与 `WECHAT_SECRET`）。
镜像本身**不含** `.env`（[`deploy/.dockerignore`](../../deploy/.dockerignore) 已排除），所以环境变量是唯一的配置来源。

| 变量 | 值 | 说明 |
| --- | --- | --- |
| `PORT` | `3001` | 必须与控制台填的容器端口一致（镜像里已有默认值，显式写一份更清楚） |
| `NODE_ENV` | `production` | 镜像里已设；平台若注入别的值，以 `production` 为准 |
| `DATABASE_FILE` | `/data/database.sqlite` | **运行时的数据库开关**，绝对路径 |
| `DATABASE_URL` | `file:/data/database.sqlite` | 只给 Prisma CLI 用，应用运行时不用它；写成一致的值避免以后困惑 |
| `DATABASE_SKIP_WAL` | `1` | **CFS 上必须**：WAL 依赖文件锁与共享内存，在网络挂载上不安全。本分支引入 —— 落地前源码里读不到它，所以请按第 6.2 节的 `PRAGMA journal_mode` 验证，仍是 `wal` 就不要把库放在 CFS 上 |
| `ENCRYPTION_KEY` | 32 字节，生成一次 | 丢了 = 已加密的学生姓名永久不可读；同一部署的所有实例必须一致 |
| `SUPERADMIN_USERNAME` | 你的超管账号 | 首次启动创建；数据库里已有超管行时，两个变量都设置会覆盖账号与密码 |
| `SUPERADMIN_PASSWORD` | 强密码 | 同上。不要用任何仓库里出现过的字符串 |
| `WECHAT_APPID` | 小程序 AppID | `plugins/wechat` 在每次登录时读取（不是启动时校验） |
| `WECHAT_SECRET` | 小程序 AppSecret | **只能留在服务端**；未设置时 `/api/wechat/login` 返回 503 |
| `UPLOADS_DIR` | `/data/uploads`（可选） | 当前组合不读它，见第 3 节；留着是为了以后切到内核组合时语义一致 |
| `TZ` | `Asia/Shanghai`（可选） | 容器默认 UTC，不设时页面上的时间会少 8 小时 |
| `LOG_LEVEL` | `info`（可选） | 排障时临时改 `debug`，然后重新发布 |
| `WECHAT_ALLOW_DEV_LOGIN` | **不要设** | 开发旁路（请求体带 `devOpenid`）：`NODE_ENV=production` 时一律 403，否则还要这个变量才生效。生产上等于任何人可拿会话 |

**不要设 `PLUGINS_ENABLED=0`**：所有业务域都是插件，关掉之后传统组合没有任何业务路由，
启动会被 `assertUsableComposition()` 拒绝。默认值（`true`）就是部署值。
**不要设 `THINK_CLASS_ROOT`**：默认的 `process.cwd()`（= `/app`）与上传目录的解析规则一致，
指到别处会出现"照片写进去了但访问 404"。

---

## 5. 首次启动：创建超管

第一次启动时，应用用 `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD` 创建 superadmin 行
（[`api/db.ts`](../../api/db.ts)）。这是**唯一**的来源：仓库里没有默认账号，
数据库里没有 superadmin 行又缺这两个变量时，进程会带着变量名报错退出。

验证：

```bash
# 云托管开了公网访问时，用它给的 HTTPS 测试域名
curl -s https://<控制台给的测试域名>/api/health

# 登录（超管后台路径默认 /beiadmin，可用 ADMIN_PATH 改；改了要重启才生效）
# 注意 role 必填：登录按 (username, role) 查库，少了这个字段一定登录失败
curl -s -X POST https://<控制台给的测试域名>/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"<SUPERADMIN_USERNAME>","password":"<SUPERADMIN_PASSWORD>","role":"superadmin"}'
```

登录返回里的 `token` 是后续请求的凭据（`Authorization: Bearer <token>`）；
超管后台页面本身走的是 `POST /api/admin/session`（[`src/features/auth/api/authApi.ts`](../../src/features/auth/api/authApi.ts)），
`/api/auth/login` 更合适做命令行验证。
拿到浏览器地址后，先在电脑上把班级/学生建好、发布一次作业，再去做小程序侧的联调 ——
审核员看到的也是这一套数据。

> 应用启动时会跑数据库迁移建表，首次启动比之后慢，健康检查的 `start-period` 已按这个留了余量。
> 实例一直不健康时先看服务日志（多半是环境变量缺失，日志里会点名是哪一个）。

---

## 6. 数据持久化验证（**上线前必须做**）

这一步是 Track A 的全部风险所在。做两次验证，都要通过：

### 6.1 重启后数据还在、姓名还能读懂

1. 在控制台**重启服务**（或发布一个新版本让实例重建）。
2. 打开站点/小程序，进入班级列表看学生姓名：
   - 正常 = 可读中文；
   - 异常 = 原样的 `iv:cipherhex` 形式或乱码 → 说明 `ENCRYPTION_KEY` 与写入时用的不是同一个，
     或数据库没在 CFS 上（见 [40-troubleshooting.md](40-troubleshooting.md)）。
3. 断掉一次不是"故障演练"：**云托管的发布、扩缩容、平台维护都会重建实例**，
   没挂持久化的话，提报期内一定会丢数据。

### 6.2 数据库本身是完整的，且没有开 WAL

如果控制台提供容器 WebShell/远程登录，直接在容器里跑；否则用本地镜像挂着同一份数据文件跑
（把 CFS 数据取到本地，或直接对本地副本执行）：

```bash
# 容器内（工作目录是 /app，node_modules 里有 better-sqlite3）
cd /app && node -e "const D=require('better-sqlite3');const db=new D('/data/database.sqlite',{readonly:true});console.log('integrity:',db.pragma('integrity_check'));console.log('journal:',db.pragma('journal_mode'));console.log('students:',db.prepare('select count(*) c from students').get());"
```

```bash
# 本机用同一个镜像检查（Linux/macOS；把 <本地数据目录> 换成 CFS 数据的副本）
docker run --rm -v "$PWD/<本地数据目录>":/data think-class:1.0.0 \
  node -e "const D=require('better-sqlite3');const db=new D('/data/database.sqlite',{readonly:true});console.log('integrity:',db.pragma('integrity_check'));console.log('journal:',db.pragma('journal_mode'));"
```

期望输出：

- `integrity: [ { integrity_check: 'ok' } ]` —— 不是 `ok` 就说明存储层已经损坏，先恢复备份；
- `journal: [ { journal_mode: 'delete' } ]` —— 说明 `DATABASE_SKIP_WAL=1` 生效了。
  **如果这里仍是 `wal`**：要么该开关在你的构建里还没生效（本分支新增），要么变量没传到容器。
  在它生效之前，不要把数据库放在 CFS 上 —— 这属于第 7 节的回退条件。

---

## 7. 失败回退：挂不上持久化存储就立刻改走 Track B

出现下面任意一条，**当天**切到 [Track B](20-deploy-selfhosted.md)，不要在云托管上硬撑：

- 云托管环境不支持挂载 CFS，或挂载后数据库仍在容器可写层（重启一次数据就回退到旧状态）；
- `DATABASE_SKIP_WAL=1` 在你的构建里不生效，`journal_mode` 仍是 `wal`（网络存储上不安全）；
- 平台限制最大副本数为 1 之外的配置，或强制多副本（SQLite 会锁冲突）。

切换的成本很小：数据库文件与 `uploads/` 目录都能从 `/data` 导出后放进 Track B 的部署目录
（`/class/database.sqlite`、`/class/uploads/`），`ENCRYPTION_KEY` 保持不变即可继续读旧数据。
**唯一的前提是 Track B 那边有已备案域名** —— 没有就先去备案，同时用云托管当联调环境。
`wx.cloud.callContainer` 与 `wx.request` 的差别只在小程序侧的网络调用方式，后端接口本身完全一样；
切换就是 [`miniprogram/config/index.ts`](../../miniprogram/config/index.ts) 里的一行（第 8 节），
不需要改服务端代码。

---

## 8. 小程序侧：`wx.cloud.callContainer`（无需配置通讯域名）

云托管的服务通过微信的通道被小程序调用，**不需要**在公众平台的「开发管理 → 开发设置 → 服务器域名」
里填任何东西，因此也不需要备案域名和证书。

小程序侧的开关就一个文件：[`miniprogram/config/index.ts`](../../miniprogram/config/index.ts)。
把这三行改成你的云托管坐标即可（`TRANSPORT` 是二选一的开关，`utils/request.ts` 对两种传输
共用同一套信封解析与 401 恢复逻辑，所以切换不会改变失败行为）：

```ts
// miniprogram/config/index.ts
export const BASE_URL = 'http://localhost:3001'          // container 模式下不被使用
export const TRANSPORT: 'request' | 'container' = 'container'
export const CLOUD_ENV = 'prod-xxxxxxxx'                // 云托管环境 ID
export const CLOUD_SERVICE = 'think-class'              // 第 2 步填的服务名称，作为 X-WX-SERVICE 发送
```

不必自己写 `wx.cloud.callContainer`：[`miniprogram/utils/request.ts`](../../miniprogram/utils/request.ts)
已经按上面的配置发请求，并且处理了两件容易踩的事 ——
`callContainer` 是基础库能力，缺失时报「当前微信基础库不支持云托管调用，请升级微信后重试」；
`CLOUD_ENV` / `CLOUD_SERVICE` 为空时报「云托管未配置：请在 config/index.ts 填写 CLOUD_ENV 与 CLOUD_SERVICE」。

要点：

- 云托管服务必须与小程序在**同一个环境/账号**下，`CLOUD_ENV` 用环境 ID（形如 `prod-xxxxxxxx`），不是服务名。
- `wx.login()` 拿到的 code 只负责换会话：**code2session 必须在服务端做**
  （`POST /api/wechat/login`），因为 `WECHAT_SECRET` 不能进小程序包 —— 这一点在
  [`plugins/wechat/src/wechat.gateway.ts`](../../plugins/wechat/src/wechat.gateway.ts) 里也是这么写的：
  官方明确 `api.weixin.qq.com` 不允许被配置成小程序的服务器域名。
- `wx.request` 的那套限制（域名白名单、HTTPS、不能是 IP/localhost）对 `callContainer` 不适用；
  平台文档见
  [调用云托管服务](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/development/call/)
  与
  [网络能力](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)。
- `miniprogram/config/index.ts` 里的 `MOCK.enabled` 保持 `false`：它是给没有后端时的 UI 评审用的，
  打开之后所有请求都会返回假数据（"后端挂了"会看起来像一切正常）。
- 真机必须验证一次：`callContainer` 在开发者工具里的行为与真机不完全等价。
- 用不了 `callContainer`（基础库过旧或环境不在同一账号下）就回退到 Track B 的域名方案：
  把 `TRANSPORT` 改回 `'request'`，`BASE_URL` 填 `https://<你的域名>`。

后续的上传、体验版、提交审核见 [30-release-miniprogram.md](30-release-miniprogram.md)。

---

## 9. 以后怎么更新

后端代码变了（例如 `plugins/wechat` 的修改）就走一次：

```bash
docker build -f deploy/Dockerfile -t think-class:1.0.1 .
# 推送到 TCR，然后在云托管新建版本并发布
```

发布会让实例重建，但 **CFS 挂载卷不动**，所以数据库和学生照片都保留。
发布后重复第 6.1 节的验证（登录一次、看姓名是否仍可读）——这一步花两分钟，
能立刻发现"环境变量在控制台里被改坏了"这类事故。

**备份**：`/data/database.sqlite`（连同 `-wal`/`-shm`，如果存在）与 `/data/uploads/` 是最不能丢的两样，
另外还有 `ENCRYPTION_KEY` 本身。导出的办法取决于控制台能力；导出的数据库副本要放在仓库之外。

## 10. 已知限制汇总（Track A）

| 限制 | 后果 | 绕法 |
| --- | --- | --- |
| SQLite 单写者 | 不能多副本 | 最小=最大=1 |
| WAL 在网络存储上不安全 | 数据库可能损坏 | `DATABASE_SKIP_WAL=1`，并验证 `journal_mode` 为 `delete` |
| `UPLOADS_DIR` 在默认组合不生效 | 只设它会导致照片"写进去但访问不到" | 挂载 `/data`，依赖镜像里的 `/app/uploads` 符号链接 |
| 应用没有 `trust proxy` | 审计/登录日志里的 IP 是 127.0.0.1 | 无（本仓库范围内不可修） |
| 仓库没有 TLS | 自建服务器必须自己加 | Track A 由平台终止 TLS，所以不受影响 |
| `DATABASE_SKIP_WAL` 在本分支之前的构建里不存在 | 数据库放在 CFS 上时仍是 WAL（网络存储上不安全） | 用本分支的代码构建镜像，并按第 6.2 节确认 `journal_mode` 为 `delete`；不是就改走 Track B |
| 小程序客户端没有照片上传 | 作业照片只能在 Web 端传 | 需要就在小程序里补 `wx.uploadFile`（字段名 `file`） |
