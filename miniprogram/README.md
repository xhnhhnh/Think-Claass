# Think-Class 微信小程序客户端

原生微信小程序 + TypeScript，**不含任何 npm 运行时依赖**（没有 `miniprogram_npm`、没有
`miniprogram-api-typings`，`wx.*` 的类型在 `typings/wx.d.ts` 手写维护）。它对接的是 Think-Class
后端内核的 HTTP 接口，与 Web 端共用同一套鉴权、班级功能开关和领域数据。

---

## 1. 在微信开发者工具里打开

1. 打开「微信开发者工具」→ **导入项目**。
2. **目录**选择本仓库的 `miniprogram/` 目录（不是仓库根目录）。
3. AppID：工程里已经填好本项目的 AppID（`project.config.json` 的 `"appid": "wx73e483f48fcae045"`）。
   - 只想看界面/本地联调：直接用即可；也可以换成**测试号**，但测试号的 openid 与正式 AppID 是两套。
   - 要真机预览或上传：用这个 AppID 登录开发者工具，并把服务端环境变量 `WECHAT_APPID` 设为同一个
     AppID、`WECHAT_SECRET` 设为它的 AppSecret。**AppSecret 是密钥**：只填在云托管环境变量或服务器
     `.env` 里，不要贴进聊天、issue、文档或仓库（AppID 本身不是密钥，可以入库）。
4. 工具会自动读取 `project.config.json`（`miniprogramRoot: "./"`、`libVersion: latest`）。
   TS 由开发者工具内置的编译插件处理（`setting.useCompilerPlugins: ["typescript"]`），不需要
   额外跑构建。

> 类型检查不在工具里做。改完代码请在本仓库根目录执行：
> ```bash
> npx tsc --noEmit -p miniprogram/tsconfig.json
> ```
> `tsconfig.json` 里**没有**写 `"noEmit": true`：开发者工具内置的 TypeScript 编译插件会读取这份
> 配置来产出 `.js`（也就是小程序真正运行的代码），在配置里关掉 emit 会让工具拒绝编译，表现为
> 「找不到 app.js」。所以 `--noEmit` 只在命令行上传入；请**不要**执行不带 `--noEmit` 的
> `tsc -p miniprogram`，那会把 `.js` 落到源码旁边，和 `.ts` 混在一起。

### 本地联调（BASE_URL = http://localhost:3001）

1. 在仓库根目录启动后端（`npm run dev` 或项目文档里的启动方式），确认
   <http://localhost:3001/api/...> 可以访问。
2. 打开 `miniprogram/config/index.ts`，确认：
   ```ts
   export const BASE_URL = 'http://localhost:3001'
   export const TRANSPORT = 'request'
   ```
3. 在开发者工具里勾选 **详情 → 本地设置 → 不校验合法域名、web-view（业务域名）、TLS 版本以及
   HTTPS 证书**。
   小程序默认拒绝向未加入「服务器域名白名单」的域名发请求，也不允许明文 HTTP；本地调试必须
   打开这个开关，否则 `wx.request` 会直接失败（现象是「网络连接失败」）。
4. 真机预览时该开关无效，必须使用 HTTPS 域名并在小程序后台配置 request 合法域名，或改用下面的
   云托管通道。

### 切换到微信云托管（TRANSPORT = 'container'）

云托管不需要配置服务器域名白名单，也不需要公网 HTTPS 证书 —— 调用走微信内网。改三个常量即可：

```ts
// miniprogram/config/index.ts
export const TRANSPORT = 'container'   // 由 wx.request 切到 wx.cloud.callContainer
export const CLOUD_ENV = 'prod-xxxxxxxx'   // 微信云托管的环境 ID
export const CLOUD_SERVICE = 'think-class' // 服务名称，作为 X-WX-SERVICE 请求头发出
```

`utils/request.ts` 只有一处分支：信封判定（非 2xx 或 `success: false` 均为失败）、`401` 静默重登、
错误提示全部共用，所以切换通道不会改变 App 的失败行为。若基础库不支持
`wx.cloud.callContainer`，会得到一条明确的提示，而不是崩溃。

### 关于 WECHAT_ALLOW_DEV_LOGIN

服务端默认只认真实的 `wx.login` 凭证。没有小程序 AppID/Secret（例如本地只跑后端、或用测试号、
AppID 还没审批下来）时，可以走服务端内置的**开发登录**通道：

1. 在**后端**环境变量中设置 `WECHAT_ALLOW_DEV_LOGIN=1`（服务端在 `NODE_ENV=production` 下会直接
   拒绝开发登录，属于刻意的双保险）。
2. 在 `miniprogram/config/index.ts` 里填一个非空的 `DEV_LOGIN_OPENID`，例如：
   ```ts
   export const DEV_LOGIN_OPENID = 'dev-openid-alice'
   ```
   打开后，`POST /api/wechat/login` 的请求体会带上 `devOpenid`（同时仍会尝试带上 `wx.login` 的
   `code`）；服务端优先使用 `devOpenid`，因此不需要真实 AppID 也能走完
   「登录 → 绑定 → 进入小程序」的完整链路。
3. 这个 openid 是**身份断言**：任何一个值都代表一个独立的微信身份，第一次进入会要求用账号密码绑定。
   生产环境请保持为空字符串。登录页的「账号密码登录」也走同一条通道：它先用这个 openid 换一张 ticket，
   再用账号密码完成绑定，因此本地不必依赖 `wx.login` 的 `code` 也能进 App。

其它相关提示：

- 若登录页提示「微信小程序未配置：请设置 WECHAT_APPID / WECHAT_SECRET」，说明服务端没有配
  AppID/Secret，且没有打开开发登录 —— 属于部署配置问题，重试按钮不会有帮助。
- 若提示「开发登录未启用：请在服务端设置 WECHAT_ALLOW_DEV_LOGIN=1」或「生产环境不允许使用开发
  登录」，说明客户端发了 `devOpenid` 但服务端那一侧没开（或跑在生产模式）。
- 绑定页与登录页需要选择身份（学生 / 家长 / 老师 / 超管）：服务端按 `(账号, 角色)` 这一对校验
  密码，缺少 `role` 会直接被拒（`400 绑定参数不完整`）；选错角色则得到 `401 账号或密码错误`
  —— 服务端刻意不区分"角色不对"与"密码错"，免得成为账号探测接口。
  > 选择器**不提供 `admin`**：内核认这个角色、管理端端点也认，但本产品不创建这种账号（管理账号就是
  > 超管）。把它列出来只会让人选到一个必然 401 的选项，而错误信息读起来像"密码错了"。

---

## 2. 目录结构

```
miniprogram/
  app.json app.ts app.wxss sitemap.json project.config.json tsconfig.json README.md
  typings/wx.d.ts                 手写的最小 wx API 类型（只覆盖用到的接口）
  config/index.ts                 BASE_URL / TRANSPORT / 云托管坐标
  utils/
    request.ts                    唯一出口：信封判定、Bearer、401 静默重登、两种通道 + 多部分上传
    storage.ts                    会话、功能开关缓存与教师选中的班级（thinkclass-mp-auth / -features / -class）
    feature.ts                    班级功能开关解析链 + 动态 tabBar 的可见集合
    classContext.ts               教师的工作班级（记住的选择 → GET /api/classes → 第一个班）
    format.ts                     日期（兼容 iOS）、截止时间、状态文案
    toast.ts                      toast / modal / 错误文案
  services/                       auth admin parent student homework aiStudy shop teacher
  components/                     feature-guard / empty-state / loading-block
  custom-tab-bar/                 自定义 tabBar（按角色 + 功能开关动态渲染）
  pages/
    login/ bind/
    student/ home homework homework-detail ai-study shop me
    teacher/ class homework ai-insight
    admin/ manage                  管理页（仅 admin / superadmin 可见）
    parent/ dashboard report tasks leave-request communication   家长端五个页面
```

## 3. 鉴权与会话

- 全部请求使用 `Authorization: Bearer <token>`，**没有 Cookie**，也不发送
  `x-user-role` / `x-user-id`。
- 会话（token + 用户 + 登录时的 `classFeatures` 快照）保存在 `wx.setStorageSync`，key 为
  `thinkclass-mp-auth`；服务端签发的最短有效期是 7 天。
- 启动流程（`app.ts`）：读到 token → `GET /api/wechat/me` 校验 → 解析班级功能开关 → `reLaunch`
  到该角色的首页；校验失败则清空并回到登录页。
- **401 静默续期**：任何带鉴权请求返回 401 时，`utils/request.ts` 会自动重跑
  `wx.login` → `POST /api/wechat/login`。已绑定的用户拿到新 token 后**原请求自动重试一次**，
  全程无 UI；只有续期也失败（账号已解绑、微信凭证被拒）才清空会话并跳到登录页。
  并发的多个 401 共用同一次续期，不会连发多个 `wx.login`。
- **`GET /api/wechat/me` 可能返回 `{ bound: false }`**：token 有效，但这个微信还没绑定任何账号
  （例如先在电脑端登录、再打开小程序）。这不是失败，但也没有 `user` 可用，客户端会清空本地会话
  回到登录页，由登录页重新 `wx.login` 拿到 ticket 后进入绑定页。
- 绑定需要**角色**：`POST /api/wechat/bind` 的请求体是 `{ ticket, username, password, role }`，
  服务端按 `(账号, 角色)` 校验密码。路由本身接受任意角色串，但**客户端选择器只提供四类**：
  `student` / `parent` / `teacher` / `superadmin`（默认选中学生）。`admin` 不在其中，原因见上。
- **两条登录入口，同一套会话**：登录页既有「微信一键登录」，也有「账号密码登录」（正式版同样显示）。
  后者调用的仍是上面这两个路由、顺序也相同（`services/auth.ts#loginWithAccount`）：先
  `/api/wechat/login` 判断这个微信是否已绑定，未绑定就再用账号密码调 `/api/wechat/bind`。因此
  **首次使用无论走哪条路都必须先绑定**——服务端对未绑定的微信只发 ticket、不发 token，这条规则不由
  客户端自觉。
- **每次提交都取新 ticket**：`/api/wechat/bind` 先消费 ticket 再验密码（防爆破），所以密码打错后
  旧票即死；账号登录每次提交都会重新取票，重试不会被"绑定已过期"卡住。
- `classId` 同时兼容 `classId` 与旧拼写 `class_id`（`utils/storage.ts` 的 `classIdOf`）：只读前者
  会让这部分账号静默失去实时班级功能位查询，而这种问题在界面上表现为「tab 少了一个」，很难被发现。

## 4. 动态 tabBar 与功能开关

`app.json` 里声明了 `"tabBar": { "custom": true, "list": [...] }`，可见条目由
`custom-tab-bar/index.ts` 计算：

- 学生：成长总览 / 我的作业 / 积分商城 / 我的；教师：班级 / 作业 / 智学看板 / 我的。
- `admin` / `superadmin` 在教师那一组之后**多一个「管理」**（`utils/feature.ts#MANAGEMENT_TAB`），
  页面是 `pages/admin/manage`：系统概览（`GET /api/admin/system/stats`）、教师列表
  （`GET /api/admin/users`）、AI 设置（`GET`/`PUT /api/admin/system/settings`）。它**不是 tab 页**
  ——`app.json` 的 `tabBar.list` 已被学生那四个占满（微信上限 5 条），所以它和三个教师页一样，
  由页面自己渲染同一个自定义 tabBar。教师角色看不到这个入口。
- **家长有自己的那一组**（`utils/feature.ts#PARENT_TABS`）：温馨家园 / 家校信箱 / 成长足迹 /
  家庭时光 / 请假假条 —— 与 Web 端家长控制台给手机端定的 `mobileTab 1..4` 一致。在这之前家长
  看的是孩子那套页面去掉积分商城，等于把孩子的地盘当成了家长端：**每天要做的那个「祝福」根本
  没有入口**，而它正是 `enable_parent_buff` 的家长侧。家庭时光由 `enable_family_tasks` 门控，
  其余入口不门控（家长总该能看到孩子的报告、信箱和请假表）。
- 每个条目声明自己由哪个班级功能位控制，或声明 **不受任何功能位控制**：

  | 条目 | 功能位 |
  | --- | --- |
  | 积分商城（学生） | `enable_shop` |
  | 智学看板（教师） | `enable_ai_study` |
  | 我的奖状（「我的」页内） | `enable_achievements` |
  | 家庭时光（家长） | `enable_family_tasks` |
  | 成长总览 / 我的作业 / 我的 / 班级 / 作业 / 管理 / 温馨家园 / 家校信箱 / 成长足迹 / 请假假条 | 无（服务端本就没有对应开关） |

  映射与 Web 端 `src/lib/featureRoutes.ts` 保持一致。

- 开关解析顺序（`utils/feature.ts`，每次启动都跑）：
  **实时 `GET /api/classes/:id/features` → 上次实时结果缓存 → 登录时的 `classFeatures` 快照 → unknown**。
  `unknown`（谁都没答上来）时，**受开关控制的条目一律隐藏**，`feature-guard` 也会渲染关闭态并
  说明「暂时没能确认班级的功能开关」。方向是刻意的：让用户点到一个必然 403 的入口，比少显示一个
  入口糟糕得多。
- `components/feature-guard` 包裹所有可能被关闭的功能：AI 智学整页、积分商城整页、奖状区块。
  菜单类入口（首页快捷入口）直接隐藏，页面类入口用 guard 兜底。

### 为什么只有学生会话里有 tab 页

微信规定 `tabBar.list` **最多 5 条**，而两套 tab 加起来是 8 个页面，无法同时声明。因此
`app.json` 只声明学生那 4 个（这是本客户端的主要用户），教师页由同一个 `custom-tab-bar` 组件
渲染，但用 `wx.redirectTo` 在页面之间切换（`utils/feature.ts` 的 `DECLARED_TAB_PAGES` 是唯一
判定依据）。代价是教师页需要自己 `usingComponents` 引入该组件并调用 `syncTabBar(this)`；
`pages/student/me`（我的）是两边共用的 tab 页，所以教师点「我的」走 `wx.switchTab`。

## 5. 关于"离线预览"（已移除）

这里曾经有一个 `MOCK.enabled` 开关：打开后 `utils/request.ts` 会改问 `utils/mock.ts` 里的一套假数据
（假用户、假班级、假作业），好在没有后端时审阅界面。**它被删掉了，不再回来**，原因不是它不好用，而是
它让这个仓库同时存在两套"事实"：界面上一眼看不出哪一行来自真实服务端，而这正是提报前最不能出错的地方
——演示数据、截图、材料里的数字都必须能追到一次真实请求。没有后端时请起本地后端（`npm start`），
不要用假数据代替它。

## 6. 已知边界

- **拍照上传已支持，但需要域名配置**：整卷照片走 `POST /api/homework/submissions/:id/photos`
  （multipart，字段名 `file`，由 `utils/request.ts#upload` 发送，带 Bearer 与 401 静默续期），
  提交时以 `photo_ids` 回传；回显用 `<image src>` 指向 `/uploads/homework/...`（`<image>` 不受
  request 域名限制，但需要绝对地址，由 `services/homework.ts#photoUrl` 拼好）。**真机/正式版**必须把后端
  域名加入小程序后台的 **uploadFile 合法域名**；云托管通道（`TRANSPORT='container'`）没有 multipart
  上传，此时把 `BASE_URL` 设为云托管的公网域名并改回 `TRANSPORT='request'`（`request.ts` 会给出这条
  提示而不是静默失败）。
- **不写题目**：教师端可以发布「标题 + 说明 + 截止时间 + 奖励学分」的作业，题目编辑（选项、
  参考答案、AI 出题）留在电脑端。没有题目的作业照样可以被提交 —— 前提是学生上传了照片，这条规则
  在服务端（`homework.service.ts#submitAttempt`）与小程序提交前的校验里各有一份。
- **教师批改仍在电脑端**：小程序展示成绩单（谁交了、状态、得分），打分/退回/评语留在 Web。
- **家长角色**：与学生共用页面，但按角色过滤了学生专属入口（积分商城、AI 智学）。家长打开作业时
  走只读路径 `GET /api/homework/submissions/:id`（学生的 `POST .../attempt` 对家长是 403），
  孩子还没开始作答时会明确提示"还没有开始"，而不是报错。
- **功能开关未知时不显示**：解析链（实时 → 缓存 → 登录快照 → unknown）拿不到答案时，受开关控制的
  tab 与入口一律隐藏（方向是刻意选的：少一个入口好过点进去必然 403）。
- **覆盖面**：小程序只覆盖 登录/绑定、成长总览、作业（学生作答 + 教师发布与成绩单）、AI 智学、
  积分商城、我的 这几块；宠物、副本、挑战、抽卡、版图、股市、公会 PK、互动墙、错题本、学习计划等
  玩法与学业模块仍在电脑端，不在小程序里。

## 7. 常用检查

```bash
# 类型检查（本仓库根目录；也已接入 npm run miniprogram:check 与 release.yml）
npx tsc --noEmit -p miniprogram/tsconfig.json

# 所有 json 是否能解析
Get-ChildItem miniprogram -Recurse -Filter *.json | ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json | Out-Null }
```
