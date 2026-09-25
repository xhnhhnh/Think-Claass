# 30 · 小程序：后台配置、上传、审核、发布、回滚

前提：后端已经能被小程序访问（[Track A](10-deploy-cloudrun.md) 或 [Track B](20-deploy-selfhosted.md) 完成），
并且已经真机验证过一次。本文只讲小程序这一侧。

小程序代码在 `miniprogram/`（原生小程序 + TypeScript，无 npm 运行时依赖）。
它与本文档同期落地；**页面与能力以工程里实际存在的为准**，下面凡是有出入的地方都标注了。

---

## 0. 小程序侧要先改的四处配置

部署坐标不在构建期注入，而是写死在两个文件里（小程序没有 `import.meta.env` 那套机制）：

### 0.1 `miniprogram/config/index.ts` —— 后端地址与传输方式

```ts
// Track B（自有服务器 + 已备案域名）
export const BASE_URL = 'https://<你的域名>'
export const TRANSPORT: 'request' | 'container' = 'request'

// Track A（微信云托管）
export const TRANSPORT: 'request' | 'container' = 'container'
export const CLOUD_ENV = 'prod-xxxxxxxx'     // 云托管环境 ID
export const CLOUD_SERVICE = 'think-class'   // 服务名称，作为 X-WX-SERVICE 发送
```

- `TRANSPORT` 是唯一的传输开关，两种传输共用 [`utils/request.ts`](../../miniprogram/utils/request.ts)
  的信封解析与 401 恢复，所以切换不会改变失败行为。
- `MOCK.enabled` 必须保持 `false`。它是"没有后端时做 UI 评审"用的，打开后所有请求返回假数据，
  会让"后端挂了"看起来像一切正常。
- 详细说明见 [10-deploy-cloudrun.md 第 8 节](10-deploy-cloudrun.md#8-小程序侧wxcloudcallcontainer无需配置通讯域名)（Track A）
  或 [20-deploy-selfhosted.md](20-deploy-selfhosted.md)（Track B）。

### 0.2 `miniprogram/project.config.json` —— AppID

仓库里的值是占位符：

```json
"appid": "touristappid"
```

导入开发者工具时填你自己的 AppID，或直接把这一行改掉。用「游客 AppID」跑不出真实登录
（`wx.login` 拿不到有意义的 code）。

同一个文件里还有 `"urlCheck": false`：它和工具里那个「不校验合法域名」勾选是同一件事，
**只影响开发者工具**，真机与线上版本一律按真实规则校验（见
[40 文档第 5 节](40-troubleshooting.md#5-打开调试能请求关闭就失败)）。

### 0.3 登录方式：先微信、再绑定账号

后端**没有**"微信一键登录即用"这回事，流程是：

1. `wx.login()` 拿 code → `POST /api/wechat/login`；
2. 已绑定过 → 直接返回 `{ bound: true, token, user, classFeatures }`，无界面进入；
3. 没绑定过 → 返回 `{ bound: false, ticket }`，跳到绑定页 `pages/bind/bind`，
   让用户填**已有的 Think-Class 账号 + 密码**完成绑定（`POST /api/wechat/bind`）。

这条对审核很关键：**审核员的微信一定没有绑定过**，所以必须给他可用的账号密码（见第 5 节）。

### 0.4 开发者登录开关（只在本地用）

后端支持一个开发旁路：请求体里带 `devOpenid` 时跳过 `code2session` 直接按该 openid 登录。
它有两道闸：`NODE_ENV=production` 时直接 403「生产环境不允许使用开发登录」；
否则还需要服务端设 `WECHAT_ALLOW_DEV_LOGIN=1`，没设时报 403「开发登录未启用」。

> **生产部署不要设 `WECHAT_ALLOW_DEV_LOGIN`**，同时确认 `NODE_ENV=production` ——
> `install.sh` / `update.sh` **都不设置 `NODE_ENV`**（[`nodemon.json`](../../nodemon.json) 设的那个只用于本机开发），
> 所以第一道闸默认是开的。见 [20 文档第 3.2 节](20-deploy-selfhosted.md#32-补上生产模式可选但建议)。

---

## 1. 公众平台后台配置

顺序建议：**先配好这些，再上传代码** —— 域名/类目/隐私没配好，提交审核一定被驳回。

### 1.1 服务器域名（只有 Track B 需要）

路径：公众平台 → 开发管理 → 开发设置 → 服务器域名。

| 域名类型 | 什么时候要配 | 值 |
| --- | --- | --- |
| `request` 合法域名 | 用 `wx.request` 调后端（Track B，必须配） | `https://<你的域名>` |
| `uploadFile` 合法域名 | 小程序里用 `wx.uploadFile` 上传文件时才需要 | 通常同一个 `https://<你的域名>` |
| `downloadFile` 合法域名 | 小程序里用 `wx.downloadFile` 下载文件时才需要 | 同上 |

三个都要写 `https://` + 域名，规则：

- 只能是域名：**不能是 IP、不能是 localhost、不能带端口**；
- 必须 HTTPS，且域名必须已 ICP 备案（境内主体）；
- 一个月内可修改的次数有限（以后台提示为准），所以先把域名定下来。

> **当前小程序客户端不发上传请求**：[`miniprogram/services/homework.ts`](../../miniprogram/services/homework.ts)
> 只有作业读取、作答、保存、提交四条路径，工程里没有 `wx.uploadFile` / `wx.chooseMedia` 调用。
> 也就是说**拍照上传目前是 Web 端的流程**。如果你打算在小程序里补上它，注意两点：
> 后端要求 multipart 字段名是 **`file`**（`FileInterceptor('file')`，
> [`plugins/homework/src/homework.controllers.ts`](../../plugins/homework/src/homework.controllers.ts)），
> 且只接受 `image/jpeg` / `image/png` / `image/webp` / `image/heic` / `image/heif`，单张上限 10MB；
> 补上之后 `uploadFile` 合法域名就必须一起配（只配 `request` 会出现"页面能开、上传必失败"）。

> **Track A（云托管）不需要在这里配任何东西**：`wx.cloud.callContainer` 走的是微信的通道，
> 不经过域名白名单，因此也不需要备案域名。见 [10-deploy-cloudrun.md 第 8 节](10-deploy-cloudrun.md#8-小程序侧wxcloudcallcontainer无需配置通讯域名)。

> **不要试图把 `api.weixin.qq.com` 配成服务器域名**：白名单里填不了它，而且真这么做就意味着
> 小程序里要放 `WECHAT_SECRET`。`code2session` 必须在服务端做（`POST /api/wechat/login`）。

### 1.2 隐私保护指引

路径：设置 → 服务内容声明 → 用户隐私保护指引。逐项对照
[00-competition-checklist.md 第 3.3 节](00-competition-checklist.md#33-隐私保护指引必须做且必须与事实一致)
填写，**声明与实现必须一致**。至少覆盖：微信登录标识、学生姓名、上传的照片。

### 1.3 服务类目

按 [00-competition-checklist.md 第 3.1 节](00-competition-checklist.md#31-主体资质) 的策略选。
没有办学资质就走「工具」类目，并检查后台没有"需补充资质"的提示。

### 1.4 成员管理

路径：管理 → 成员管理。上传代码的微信号必须有开发权限（开发者/体验者），
否则 [`scripts/wechat/upload.mjs`](../../scripts/wechat/upload.mjs) 会报权限错误。

---

## 2. 微信开发者工具

1. **导入项目**：目录选仓库里的 `miniprogram/`，AppID 填你自己的（工程里现在是占位符 `touristappid`，
   见第 0.2 节）。工程用 TypeScript 编译插件（`useCompilerPlugins: ["typescript"]`），
   首次编译会慢一点，属于正常。
2. **本地调试**：详情 → 本地设置里可以勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。
   这个勾**只对开发者工具有效**，真机与线上版本一律按真实规则校验 —— 这也是"打开调试能请求、关掉就失败"的原因，
   见 [40-troubleshooting.md](40-troubleshooting.md)。
3. **真机预览**：点「预览」，用**有开发权限的微信**扫码。真机上：
   - 域名白名单、HTTPS、证书链、TLS 版本全部生效；
   - `wx.cloud.callContainer` 必须在真机上验证一次（工具里的行为不完全等价）。
4. **走通关键流程**（提报前必做，评审也看这些）：微信登录 → 首次绑定账号 → 学生主页/我的作业 →
   打开一次作业并提交，教师端能看到；如果拍照上传只做在 Web 端，就在提报材料里把这一点写清楚。

---

## 3. 上传代码（两种方式）

### 方式 A：开发者工具里点「上传」

填版本号与备注即可。适合人工发布，也是第一次跑通时最省事的方式。

### 方式 B：命令行上传（可重复、可进 CI）

用本分支新增的 [`scripts/wechat/upload.mjs`](../../scripts/wechat/upload.mjs)，它封装了 `miniprogram-ci`。

**第一步：拿上传密钥。** 公众平台 → 开发管理 → 开发设置 → 小程序代码上传 → 生成并下载密钥，
得到形如 `private.<appid>.key` 的文件。**只能下载一次**，丢了必须在同一页面重置（旧文件立即失效）。
这是凭据：`.gitignore` **没有**忽略 `*.key`，所以请把它放在仓库之外（例如 `~/.keys/`），
别指望不被提交。

**第二步：装 `miniprogram-ci`。** 它**不是**本仓库的依赖（刻意没有写进根 `package.json`，
免得每次部署都多装一份只在发布时用的东西）：

```bash
# A. 临时装进仓库（--no-save 不改 package.json）
npm install --no-save miniprogram-ci

# B. 装到仓库外，再用 MINIPROGRAM_CI_DIR 指过去（推荐，完全不碰仓库）
mkdir -p ~/.think-class-ci && cd ~/.think-class-ci && npm init -y && npm install miniprogram-ci
```

**第三步：上传。**

```bash
# Linux / macOS（bash）
MINIPROGRAM_APPID=wx1234567890abcdef \
MINIPROGRAM_PRIVATE_KEY_PATH=~/.keys/private.wx1234567890abcdef.key \
MINIPROGRAM_VERSION=1.0.0 \
MINIPROGRAM_DESC='竞赛提报版本：作业与课堂' \
MINIPROGRAM_CI_DIR=~/.think-class-ci \
node scripts/wechat/upload.mjs
```

```powershell
# Windows PowerShell
$env:MINIPROGRAM_APPID='wx1234567890abcdef'
$env:MINIPROGRAM_PRIVATE_KEY_PATH='C:\keys\private.wx1234567890abcdef.key'
$env:MINIPROGRAM_VERSION='1.0.0'
$env:MINIPROGRAM_DESC='竞赛提报版本：作业与课堂'
$env:MINIPROGRAM_CI_DIR='C:\think-class-ci'
node scripts\wechat\upload.mjs
```

脚本的环境变量：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `MINIPROGRAM_APPID` | 是 | 小程序 AppID（`wx` 开头） |
| `MINIPROGRAM_PRIVATE_KEY_PATH` | 是 | 上传密钥文件路径 |
| `MINIPROGRAM_VERSION` | 是 | 版本号，例如 `1.0.0` |
| `MINIPROGRAM_DESC` | 是 | 版本描述（审核员会看到这一行） |
| `MINIPROGRAM_PROJECT_PATH` | 否 | 小程序目录，默认 `<仓库根>/miniprogram` |
| `MINIPROGRAM_ROBOT` | 否 | 上传机器人编号 1–30，默认 1 |
| `MINIPROGRAM_CI_DIR` | 否 | 装了 `miniprogram-ci` 的目录（见上面的装法 B） |

四个必填变量只要缺一个，脚本就**直接失败并打印中文说明**（不猜默认值：猜错的 AppID 或版本号
会污染开发版本列表）。上传结果会打印出来；失败时按提示排查（密钥不匹配、无开发权限、目录选错、网络出口受限）。

> 上传 ≠ 发布。上传只是让"开发版本"多一个版本，离竞赛要求的"正式上线"还差审核与发布两步。

---

## 4. 体验版

1. 公众平台 → 管理 → 版本管理 → **开发版本**，确认刚上传的版本在列表里。
2. 「选为体验版」，然后在「成员管理 → 体验成员」里加上要试用的微信号。
3. 真机扫码，把第 2.4 节的流程完整走一遍，**包括拍照上传**。
4. 有问题就改代码、重新上传、重新选为体验版 —— 这一步随便迭代，不消耗审核次数。

建议在这一步就用**预置数据**：建一个班、几个学生、一次作业、一条拍照提交。
审核员看到的也是这套数据，见 [00 文档第 3.4 节](00-competition-checklist.md#34-提报审核材料)。

---

## 5. 提交审核

路径：版本管理 → 开发版本 → 提交审核。要准备：

| 项 | 内容 |
| --- | --- |
| 功能页面 | 至少填首页与一个关键功能页（作业列表 / 作业作答 / 积分商城） |
| 功能页说明 | 写清"点哪里、看到什么"：审核员看不到你的服务器，也拿不到你的上下文 |
| 截图 | 关键页面截图，与线上实际一致（不要用设计稿） |
| 测试账号 | **必填**：一个教师账号 + 一个学生账号，**账号与密码都要给**（原因见下） |
| 隐私指引 | 已在第 1.2 节配置并通过 |
| 类目 | 已在第 1.3 节确认，无需补充资质 |

要点：

- **审核员必须能用微信登录进来**：小程序的登录是"微信 → 绑定已有账号"两步
  （第 0.3 节）。审核员的微信没有绑定过任何账号，所以流程一定是：
  扫码进入 → 落在绑定页 → 填你给的账号密码 → 进入功能页。
  因此审核备注里要写清"**首次进入请用以下账号密码完成绑定**"，并给出账号密码。
- 测试账号请单独建（不要交 `SUPERADMIN_*`），并确保登录后能看到数据 —— 空数据的账号等于"无法体验"。
  建议预置一个班、几名学生、一次已发布的作业。
- 同一微信号只能绑一个账号，如果审核员的微信已经绑过别的测试账号，
  换一个账号要在应用内先解绑（`POST /api/wechat/unbind`，教师/管理员端或后台功能页）。
- **审核需要预留 3 天**：驳回要整改后重新提交，一来一回按两个 3 天算。
  截止日前 3 天才第一次提交，风险极高，见 [00 的倒排时间线](00-competition-checklist.md#2-倒排时间线建议)。

---

## 6. 发布

审核通过后，在版本管理里点「发布」（全量发布）。**只有点了发布，作品才算"正式上线"**，
竞赛要求作品在提报期内处于正式上线状态。

发布后立刻做一次线上自检：

```bash
curl -s https://<你的域名>/api/health        # Track B
# Track A 用云托管控制台给的测试域名，或用小程序真机走一遍
```

再用**微信里正式版**（不是体验版）走一遍登录与作业流程。

---

## 7. 回滚

### 7.1 小程序回滚（版本回退）

公众平台 → 管理 → 版本管理 → **线上版本** → 「恢复旧版本」，选上一个正式版本。
它把线上版本切回旧版，用于"新版有严重问题、需要立刻止损"。
旧版本的代码仍在，不需要重新上传。

**注意**：回滚的是小程序端。如果问题出在后端（接口改了），要同时回滚后端，否则旧版小程序会打新版接口。

### 7.2 后端回滚

| 路线 | 怎么回滚 |
| --- | --- |
| Track B | `update.sh` 失败会自动从 `backups/backup_<时间戳>.tar.gz` 回滚；手工回滚就按 [20 文档第 7 节](20-deploy-selfhosted.md#7-备份与恢复) 的备份恢复 `database.sqlite` + `.env` + `uploads/`，再 `pm2 restart think-class --update-env`。日志看 `logs/update.log`，状态看 `logs/update-status.json` |
| Track A | 云托管控制台把上一个镜像版本**重新发布**（挂载卷不动，数据不丢） |

回滚后务必确认学生姓名仍可读 —— 只要 `ENCRYPTION_KEY` 没被换过，就不会有问题；
如果回滚时把 `.env` 也换成了更早的版本，先确认里面的密钥是同一把（见 [40](40-troubleshooting.md)）。

---

## 8. 发布清单（每次发布照抄）

- [ ] 后端 `/api/health` 正常，且重启后数据仍在（[10](10-deploy-cloudrun.md) / [20](20-deploy-selfhosted.md) 的验证步骤）
- [ ] `miniprogram/config/index.ts` 的 `BASE_URL` / `TRANSPORT` / `CLOUD_ENV` / `CLOUD_SERVICE` 指向正确的后端，`MOCK.enabled` 为 `false`
- [ ] `project.config.json` 的 `appid` 是自己的 AppID（不是 `touristappid`）
- [ ] 服务器域名（Track B）已包含 `request`，或已改用 `callContainer`（Track A）
- [ ] 生产环境已设 `NODE_ENV=production`，且**没有**设 `WECHAT_ALLOW_DEV_LOGIN`
- [ ] 隐私保护指引与类目已就绪
- [ ] 真机走通：微信登录 → 绑定账号 → 打开作业 → 提交 → 教师端可见
- [ ] 版本号与描述有意义（审核员看描述）
- [ ] 测试账号可用、登录后有数据，审核备注里写清了绑定步骤
- [ ] 距提报截止 ≥ 3 天
- [ ] 审核通过后**点了发布**，并用正式版再走一遍
