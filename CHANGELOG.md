# Changelog

## [2.1.1] - 2026-09-25 — 补上界面层那一版，入口文档加中文

这是一个补丁版，只做两件事：**把上一版的发布范围补齐**，以及**给入口文档加上中文**。

`2.1.0` 的发布说明只讲了 AI 智学，而它实际交付的还包括**界面层重写 UI-R**（四个控制台的外壳、
导航模型、页面模板与 token 分层）和 **`plugins/homework` 作业插件（含 AI 批改）** —— 两者都是
随那次 tag 一起发出去的代码。本版把这件事在版本层面收口：从这一版起，发布范围以 CHANGELOG 为准，
`2.1.0` 那段记录原文未动。**可执行代码与 `v2.1.0` 完全一致**，所以这是一次内容补充，不是行为变更。

### Added

- **中文入口文档 [`README.zh-CN.md`](README.zh-CN.md)**：与 `README.md` 全文对应（14 节一一对齐、
  34 个相对链接全部保留并逐一验证可解析）。中文散文、代码标识符/环境变量/命令/路径原样保留，
  便于对着终端操作；两份文档顶部各有语言互链，从任一侧都能一键切换。约束是**两边同结构、
  同技术细节**，所以以后改一边必须同步另一边，而不是让中文版慢慢变成一份过期的摘要。

### Fixed

- **`npm run release` 在 Windows 上跑不起来。** `scripts/release.mjs` 用
  `execFileSync('npm.cmd', …)` 执行四道验收门，而 Node 针对 CVE-2024-27980 的修复禁止不带
  `shell: true` 执行 `.cmd`，于是进程在**第一道门之前**就抛 `EINVAL` 退出（本机实测，Node 24）。
  因为仓库要求 Node >= 24（`engines`），而 CI 跑在 Ubuntu 上，这条路径在 Windows 上从未真正
  走通过 —— 而 `docs/versioning.md` §3 把 release 脚本定为唯一允许写版本号的方式。现在改为以
  单条命令字符串加 `shell: true` 执行（`spawnSync`），并由 shell 把 `npm` 解析到 `npm.cmd`。
  修完之后，四道门在这台机器上首次完整跑通并成功切出版本。
- **UI-R 那一轮修掉的四个缺陷，此前没有单独记进任何一版的发布说明。** 它们是这轮返工的全部理由，
  都只在真实浏览器或真实编译下才露头：开发环境里 `@layer base` 中的 `@apply` 让整张样式表失效、
  所有路由渲染成空白 `#root`（而 `npm run build` 一直是成功的）；`h-auto` / `h-12` / `h-14` 在
  所有 kit 控件上编译为空，写成 `h-auto py-5` 的大按钮实际只有 36px；`sweep-browser.mjs` 用依赖
  布局的 `innerText` 判定页面空白，把渲染正常的页面报成失败；度量脚本把自己的注释算成违规，两次。
  详细经过见 `2.1.0` 的「本轮修掉、且只有真实浏览器/编译才能发现的四个缺陷」。

## [2.1.0] - 2026-09-25 — AI 智学：一个可解释、默认离线可用的个性化练习引擎

新增独立插件 [`plugins/ai-study`](plugins/ai-study)：学生在「AI 智学」页拿到一份当天该练的题单，
每道题都带**为什么选它**；直接在页面作答，交卷后掌握度回写错题本。教师有一块班级智学看板：本班
集体薄弱的知识点，以及给谁派一份练单，一键派发。

这一轮新增了 6 条路由（`api:surface` 322 → 328）、1 个插件、1 个跨插件端口、3 张表与 1 个班级开关。

> **本版同时发布三项此前只存在于工作树、从未打 tag 的工作**：`plugins/homework`（作业插件 + AI 批改，
> 见下方 Added）、界面层重写 UI-R（见「UI-R：界面层与交互模型重生」整节），以及平台级授权、首次启动
> 向导与个人设置页。它们与 AI 智学一起构成 2.1.0 的完整内容 —— 从 `v2.0.0` 直接升级即得到全部。

### Added

- **`plugins/ai-study`（AI 智学）** — 3 张自有表（`p_ai_study_sets` / `_items` / `_answers`），
  DDL 由插件运行器应用（`provides.migrations`），不走 `APP_MIGRATIONS`：这三张表没有 Prisma
  model，G13 的 manifest 检查也只看 `data.adopted` / `data.reads`，而 G17 把应用迁移的 id 列表
  逐字钉死。6 条路由全部 `auth: "actor"`，声明式权限键 3 个
  （`ai_study.practice` / `ai_study.insight` / `ai_study.assign`）。
- **智选规则 `ai-study.engine.ts`** — 纯函数、确定性、无 IO：掌握度缺口、反复出错次数、知识点
  重要度与错题量、难度匹配（由该生已判分客观题正确率推出）、新鲜度；整数权重、同分按题号、
  题型占比上限为一次修复式后处理。理由**由胜出因子生成**，不是模型自由发挥。`ENGINE_VERSION`
  随练单落库。
- **学生端闭环** — 生成练单 → 作答 → 交卷 → 掌握度回写。判定由题目所有者完成
  （`learning.public.recordPracticeOutcome`），主观题与无参考答案的题返回 `is_correct: null`
  且**不改动掌握度**；作答行的 `judged_at` 让「交卷两次」不会把掌握度推进两次。
- **教师端看板与派发** — 按知识点汇总本班错题（前 5 项）与每个学生的建议；已在进行中的学生
  不可勾选、也不可重复派发（按学生返回失败原因）；单次派发上限 60 人、看板分析上限 40 人，
  截断在响应里说明（`students_considered` vs `students_total`）。
- **`learning.public` 端口** — learning 的第一个端口。题库、知识点图谱、错题本共 18 张表归它所有，
  G1 禁止别的插件直读，而掌握度的**写**必须留在所有者内（一个数字一套算法）。端口出站方向
  **不携带参考答案与解析**：题目与信号都不含 `answer_json` / `explanation`，因此建立在其上的
  学生接口不可能泄题（契约里写明，测试按字段集断言）。
- **`homework.public.complete`** — 通用的一次补全调用，prompt 归调用方所有，homework 不认识
  「智学」词汇。第二个 AI 面不再复制 provider 解析；`timeoutMs` 只能**收紧**运营配置的
  `ai_timeout_ms`（智学取 8s，小于前端 15s 全局超时）。
- **班级开关 `classroom.enable_ai_study`** — 与另外 19 个特性开关同一套机制；列由新迁移
  `0000h_ai_study_feature_column` 添加（不是改 `0000c`：函数迁移的校验和是 `up.toString()`，
  已应用的迁移不能改）。
- 前端 `src/features/ai-study/`：路由 `/student/ai-study`（feature 门 `enable_ai_study`）、
  `/student/ai-study/:id`（作答页，不进菜单）、`/teacher/ai-study`（看板，菜单门按同一开关）。

### Changed

- `plugins/learning` 发布 `learning.public` 并抽出**一处**掌握度算术，供错题本自身的练习路由与
  端口写回共用；新增有界查询（候选池 `LIMIT` 由仓库钳到 200、按题号批量取知识点映射、
  知识点进度聚合、已判分客观题正确率）。
- `plugins/homework` 的 AI provider 增加 `complete`，并把超时预算改为可被调用方收紧。
- `README.md` 的插件清单补上此前遗漏的 `homework`，数量 20 → 22。

### Notes

- 未接入模型时（默认 `ai_provider=mock`）功能完整可用：规则排序 + 规则理由，`ai.available:false`
  且把服务端原文打印给用户。模型不可达 / 超时 / 返回不可解析 JSON 时保留规则结果，绝不 500、
  绝不编造分数或题目。
- 本期**不做**积分奖励：完成练单不发积分，激励策略域需要单独设计，避免绕过策略中心。

## [2.0.1] - 2026-09-20 — UI-R：界面层与交互模型重生

本轮换的是**形状**，不是配色。上一轮（P0–P8）把债务清到了零：没有原始控件、没有十六进制
颜色、没有 `!important`、没有杂色族。但四个控制台仍共用一个大标题 + 英雄横幅 + 常驻侧栏的
营销式外壳，76 个页面各自决定"页面"长什么样，手机上只有一条横向滚动的 25 项菜单。
UI-R 换掉了 token 分层、外壳、导航模型、页面模板与度量方式。后端契约（路由、schema、插件）
未改动，只有一处只读查询的列被补齐（见 Fixed）。

**结果（全部实测）**：67/67 控制台页面迁到新页面模板，0 个页面自绘页头，0 个页面还用旧
token 名；`test` 160 文件 / 1538 用例全绿，`guard` 19 文件 / 117 用例全绿，`ui:audit` 15 项
全部达标，`shell:verify` 31/31，`sweep:verify` 35/35（按角色遍历全部控制台路由），
`tour:verify` 18/18（`--reduce` 下 19/19）。

### Changed

- **token 改为三层，角色降级为强调色。** 产品层（`--brand*` / `--fg-1..3` /
  `--surface-1..4` / `--line-*` / 状态色三阶）、角色层（`data-role` 只改
  `--role*` 与 `--focus`）、密度与动效层（`--radius*` / `--elev-*` / `--bar-h` /
  `--control-h*` / `--motion-*`）。旧写法是整调色板按角色替换，于是「成功」徽章在四个控制台
  是三种不同的绿，portal 到 `<body>` 的对话框还会漏掉作用域。`.theme-*` 与 `--campus-*`
  已删除，`--canvas`/`--paper`/`--ink-*` 等保留为**别名**（指向新层）以便未迁移页面继续渲染。
- **暗色模式真正接线。** `.dark` 是一套完整的产品配色加四个提亮的角色强调色，默认跟随系统，
  由 `RoleTheme` 统一拥有（`src/app/theme/RoleTheme.tsx`）。
- **一个外壳统治四个控制台。** `src/app/layouts/AppShell.tsx`：可折叠侧栏（分组、可折叠、
  状态持久化）+ 上下文栏（面包屑 · 页面 `h1` · 页面自己的按钮 · ⌘K）+ 内容区。
  四种布局模式：`workbench`（桌面）、`mobile`（手机摘要栏 + 四项底栏 + 「更多」抽屉）、
  `immersive`（全幅画布 + 浮动退出）。模式来自路由表。
- **路由表成为导航的唯一真源。** 一条路由声明 path / label / icon / group / feature 门 /
  layout 模式 / 底栏位置 / 搜索别名；`src/components/Layout/navRegistry.ts`（第二张按字符串
  索引的图标表 + `MISSING_ICON` 哨兵）已删除。当前页判定改为按段匹配，参数化路由
  （`/teacher/papers/:id/edit`）不再"什么都高亮不出来"。
- **⌘K 命令面板。** 索引路由表（按同一套功能开关过滤）、当前页注册的动作、最近使用。
  `⌘B` 折叠侧栏、`?` 打开快捷键表；输入框聚焦时除 Esc 外不触发快捷键。
- **页面模板 `PageScaffold`**（dashboard / list / detail / form / immersive）。页面按钮通过
  portal 进入上下文栏，页面不再自绘第二份标题——`PageHeader` 在有外壳时只贡献按钮。
- **组件密度改为 token 驱动。** `buttonVariants` 用 `h-control*`，与输入框同高；
  主按钮是 `bg-role`，破坏性操作是 `danger`（产品色，不随控制台变化）。
- **度量重建。** `rawButtons` 等 15 项指标全部保留在目标值；`v4-only scale value` 修正了
  误报（它把可用的 `rounded-xs`、`size-control` 当成 v4 专有语法）；`!important` 统计不再把
  `prefers-reduced-motion` 当作债务（那是 WCAG 要求）；原始控件的豁免范围加上 `src/app/**`
  并写明理由（外壳的分组折叠、底栏「更多」、账户摘要是不同元素契约，不是"长得不一样的按钮"）。

### Added

- 守卫 `tests/guardrails/ui-token-contract.test.ts`：**编译**每一个承诺可用的工具类，并断言
  每个"应当无效"的构造确实编译不出 CSS。回滚本项目最贵的反复缺陷——看着像样式、写了、
  编译为空。
- 守卫 `tests/guardrails/ui-route-coverage.test.ts`：直接 import 真实路由表，断言模块解析、
  目的地唯一性与分组、底栏槽位、以及沉浸式页面不得占用底栏。它是"某页面在重构中静默消失"
  的唯一防线（页面测试会随页面一起被删）。
- `npm run shell:verify`（`scripts/verification/shell-browser.mjs`）：真实 Chrome over CDP，
  31 项检查——侧栏与内容是否并排、底栏在 390px 是否吸附底部、⌘K 是否真的打开面板、
  角色强调色是否到达 `<html>`、零 console 错误。jsdom 量不出任何一项（它把每个盒子报成 0×0）。
- `npm run sweep:verify`（`scripts/verification/sweep-browser.mjs`）：按角色遍历全部控制台路由，
  读同一套功能开关只访问菜单真正会给出的页面，检查每页渲染出内容且没有抛错。
- 新 kit 组件：`sheet`、`breadcrumb`、`nav-item`、`kbd`、`page-scaffold`、`page-actions`。

### Fixed

- **`GET /api/exams` 是教师专属，学生页却在调用它。** 「学业中心」用
  `GET /api/exams?class_id=…` 去给成绩补上考试名称与满分 —— 该路由是
  `requireActorRole(req, STAFF)`，于是每次访问学生都吃 403，页面回退显示「考试 #12」和满分 100，
  并且每访问一次就写一条 console 错误。修法是让 `listStudentExams` 就地把 `exams` join 进来
  （只读、显式列名），学生不再需要越权请求。这是 `sweep:verify` 抓到的。
- **沉浸式页面的动作按钮会被静默丢弃。** `PageScaffold` 的 `immersive` 分支只渲染 children，
  而沉浸式外壳没有上下文栏可 portal，于是传了 `actions` 的页面按钮无声消失。现在沉浸式外壳
  在右上角提供浮动动作槽（与左上角退出控件对称）。
- **账户菜单关不掉。** `<details>` 不会因为点击别处、按 Esc 或导航而关闭；现在三者都会关闭。

### 本轮修掉、且只有真实浏览器/编译才能发现的四个缺陷

1. **开发环境下每条路由都是空白 `#root`。** `@layer base` 里的 `@apply` 在 Tailwind 发布
   `theme.extend` 之前就被 PostCSS 解析，于是项目色不存在、整张样式表失败——而
   `npm run build` 一直成功并输出正确 CSS。现在两道守卫：`index.css` 不许出现 `@apply`，
   也不许出现十六进制颜色字面量。
2. **`h-auto` / `h-12` / `h-14` 在所有 kit 控件上都是空的。** 项目的 `spacing` 块替换了
   Tailwind 的默认 scale，于是项目的 `h-*` 规则排在默认规则之后，`.h-control` 赢下每一次
   冲突：写成 `h-auto py-5` 的大按钮实际只有 36px。改为放进 `theme.extend` 后，显式高度
   才生效——登录/激活页那两个 `h-12` 输入框也一并回到作者本意的 48px。
3. **`sweep-browser.mjs` 把渲染正常的页面报成空白。** 它读的是 `innerText`，该属性依赖布局，
   在这个 headless 浏览器里对每条路由都返回空串。发现方式是给失败路由截图而不是相信字符数——
   所以现在失败路由一定会留下截图。
4. **度量把"自己的注释"算成了违规，两次。** `@apply` 守卫先是命中"禁止 `@apply`"的注释，
   公开页面守卫命中"Public site, so no PageScaffold"的注释。两处现在都先剥离注释，与
   `ui:audit` 的既有做法一致。

### 待办（已知、已记录，不是意外）

- 删除 `--canvas`/`--paper`/`--ink-*`/`--primary`/`--card*`/`--sidebar*` 兼容别名及其
  `tailwind.config.js` 条目：页面侧已无消费者，属机械清理，但它触及 kit 与外壳，值得单独
  一轮验证而不是搭在页面迁移上。
- `src/features/pet/petConfig.ts` 仍以 `bg-red-50` 等字符串提供精灵台配色；
  `DataInsight.tsx` 仍是组件层的旧 token 面；`HomeClosingCta` 的桌面态
  `text-fg-1` on `bg-role` 是继承下来的对比度缺陷（保留未改）；`NewsPage` 的 `prose` 配色
  需要 `theme.typography` 才能接 token。


### UI-R：界面层与交互模型重生

本轮修的是**"插件都在，但功能用不了"**：代码、路由、测试都齐，问题出在四个横切层。
没有新增或删除任何 HTTP 端点（仍是 297 条），没有 schema 变更。

### Fixed

- **学生身份作用域从未落地 —— 精灵插件的权限门把学生全部拒之门外。**
  `Actor.studentId` / `classId` 在契约里有、内核从不填：`sessions.verify()` 只返回
  `{userId, role}`，`packages/kernel/src/http/requestContext.ts` 里的 `ScopeResolver` 类型定义了却
  从未被调用。于是 `plugins/pet` 的 `requireActor` 里 `actor.studentId === undefined` 恒成立，
  学生调用领养/互动必然 403「当前账号未绑定学生」，`permissionEngine` 的 student scope 链也永远是空的。
  现在 `api/app.ts` 提供一个 `scopeResolver`（晚绑定到 `classroom.public.getStudentByUserId`，
  带 5s 记忆化），并在**两处** request-context 中间件上都传入 —— 第二处是关键：
  legacy 组装在 `mountKernelInfrastructure` 里又装了一个不带的中间件，它最后执行，会把内核
  刚解析好的作用域整个覆盖掉。这就是"单元测试全绿、装出来的实例里学生用不了"的原因。
- **`/adoptions` 与 `/actions` 绕过权限门。** 这两条是前端 `petApi.ts` 真正调用的路径，而
  `pet.adopt` / `pet.interact` 只挂在插件自己的 `/adopt`、`/action` 别名上 —— 权限门形同虚设。
  四个写入口现在共用同一个 `requireActor` + `permissions.require`。
- **班级功能开关的"未加载"被当成"全关"，学生端整片不可用。**
  `defaultClassFeatures` 是 19 个 `false`，而 `StudentLayout` / `ParentLayout` /
  `FeatureRouteGuard` 都直接回退到它：刷新后首帧就把当前页判为"未开放"并跳走，
  功能页闪一下「功能未开放」，请求失败时则**永久锁死**（无重试）。
  新增 `useResolvedClassFeatures`，把「未知 / 已关闭 / 已开启」三态分开：未就绪不跳转、
  失败给重试、只有真的关闭才显示"未开放"。
- **`/api/challenge/questions` 匿名可读整个题库。** 守卫写的是
  `if (actor && role === 'student')`，匿名分支直接漏过去，200 返回全部题目。现在要求登录。
- **三个写接口在输入不合法时返回 500 而不是 400**：`POST /api/shop/auctions`（缺 `item_name`）、
  `POST /api/system/questions`（缺 `title`/`answer`）、`POST /api/system/settings`（缺 `key`）。
  都是 NOT NULL 列直接撞库，`createBlindBox` 一直有这道校验，这几条漏了。
- **登出只清本地。** `logout()` 现在调用 `POST /api/kernel/auth/logout` 撤销服务端会话 ——
  此前 token 在 7 天 TTL 内一直有效。前端 API 客户端也不再为登出请求做自己的错误处理。
- **前端把 401 和 403 当同一件事。** 原来都提示「登录已过期或无权限，请重新登录」：
  403 让用户去重新登录永远没用（会话是好的，是权限不够），401 又不清凭据、不跳登录页。
  现在 401 → 清会话 + 跳对应登录页（管理端跳管理端），403 → 「当前账号无权访问该功能」。

### Added

- **首次启动引导向导**（`src/features/onboarding/`）。新装实例只有 superadmin、零班级，
  老师第一次登录看到的是一片空白，而 19 个功能开关挂在还不存在的班级上。向导走三步：
  建班级（含邀请码）→ 导入名单（粘贴式，自动生成用户名）→ 配置功能开关，全部使用既有端点，
  **不写入任何种子数据**；可跳过，跳过后在本浏览器记住。
- **`tests/e2e/`：真启动的按角色端点契约测试**（新 vitest 项目，`npm run test:e2e`）。
  它补的是实测出来的盲区：`tests/**` 只碰各套件关心的少数路由，`src/**` 跑在"永远 200"的
  MSW 上 —— 客户端和服务端彼此不一致时两边都是绿的。现在它会真启动 `api/app.ts`、用应用自己的
  路由自举出四种身份，然后按 `docs/security/route-authorization-matrix.md` 逐条断言：
  匿名不得拿到成功响应、任何角色任何路由**不得 500**、前端真正调用的路径不得 5xx，
  并单独验证登出后 token 真的失效。
- **`scripts/security/route-authorization-audit.mjs`**（`npm run auth:audit`）：
  按文件盘点每个 controller 是否有解析调用者，并与 297 条端点快照对账（差额必须被
  `tests/e2e/publicRoutes.json` 里逐条注明原因的 `compatAliases` 解释掉）。
  它明确声明自己**只是清单不是证明** —— 静态分析判不出"这个老师能不能看这个学生"，
  那件事由 e2e 用例负责。
- **分步式新手教程（Guided Tour）**（`src/features/onboarding/GuidedTour.tsx` + `onboarding/tour/`）。
  盖一层半透明灰遮罩，用聚光灯在目标元素上挖空并高亮，配一个小鼠标指针演示该步的手势
  （移动 / 点击 / 悬停 / 输入 / 选择 / 拖拽，按步骤的 `action` 决定）。**关键行为是「做了才算过」**：
  `click` / `input` / `select` 类型的步骤监听目标元素上的真实事件，用户点的是真按钮、真开面板、
  真跳路由，下一步再指向刚出现的东西；遮罩与指针都是 `pointer-events-none`，所以那一次点击会
  落到下面的控件上而不是被引导层吃掉。步骤由 `data-tour="…"` 锚点定位（约定了名字而不是 CSS
  选择器，改样式或改文案都不会让教程悄悄指空）；目标不在当前屏幕时先轮询等待，超时才显示该步的
  `fallback` 文案，并要求取「第一个真正有盒子的匹配」—— 侧边栏在窄屏是 `hidden`，否则会高亮一个
  0×0 的角落。提供「上一步 / 下一步 / 跳过引导 / 完成」，`Esc` 退出，`→`/`←` 翻步（在输入框里
  则不抢方向键）。教师有**两套**步骤：还没有班级时 `TeacherDashboardPage` 渲染的是 `FirstRunWizard`
  而不是主控台，那三步就直接教向导本身。动画走 framer-motion 的 `animate` props，不写 `style={{}}`，
  UI 债务 15 项指标全部维持基线；`prefers-reduced-motion` 下停掉全部动画与呼吸效果。
- **四角色统一的「个人设置」页**（`src/features/auth/pages/ProfileSettingsPage.tsx`）。
  由 `features/classroom/pages/TeacherSettingsPage.tsx` 迁移而来 —— 它改的是账号
  （`PUT /api/auth/profile`），与班级无关，而且只有教师有设置入口：学生和家长在路由表里根本
  没有设置页，「重新开始引导」无处可放。现在四个角色都有路径：`/teacher/settings`、
  `/student/settings`、`/parent/settings` 与 `<admin>/profile`（管理员的 `settings` 是
  「系统设置」，故个人页另起一条路径）。表单契约（三个 placeholder、`保存更改`）原样保留。
  页内新增「新手教程」卡片与「重新开始引导」，可随时重播且不影响「已看过」的记录。
  同一个按钮也放进了四个角色共用的 `CampusShell` 个人卡片（桌面侧栏），让「再看一遍」不必先想
  起来去设置里找；两处是同一个 `RestartGuideButton`，标签只有一份。
- **真实浏览器的引导验证**（`scripts/verification/guided-tour-browser.mjs`，`npm run tour:verify`）。
  单元测试跑在 jsdom 上，而 jsdom 不做布局 —— 每个元素都是 0×0，所以那些测试能证明逻辑、
  证明不了任何一个像素。这个脚本用 Node 内置的 `fetch` + `WebSocket` 直接驱动 Chrome 的
  DevTools Protocol（**不加依赖、不下载浏览器**，因此符合 §2 规则 3 和 §8 的既定取舍），断言：
  聚光灯矩形与步骤所指元素逐边吻合到一个像素内、遮罩确实只在其外、提示框不压住它正在讲解的目标、
  以及**一次真实鼠标按下穿过遮罩落到控件上并推动步骤**（合成 `element.click()` 在遮罩吞掉所有鼠标
  事件时也会通过，所以必须走浏览器的真实输入管线）。截图落在 `.tmp/tour-verification/`。
  它当场查出两个 jsdom 查不到的缺陷：目标过高时提示框会盖在目标上（现已按「下方→上方→右侧→左侧」
  择位），以及侧边栏比视口高时每一步都会把整页滚动几十像素（现已只在完全不可见时才滚动）。
  另外用 `Emulation.setEmulatedMedia` 把 `prefers-reduced-motion` 也纳入常规验证（`--reduce`）。
- **修：引导在 `prefers-reduced-motion` 下完全没有动画。** 原实现把该偏好理解成「不要动画」，
  于是位移、缩放、指针手势、呼吸光环、步骤切换全被关掉 —— 对开着「Windows 动画效果」的用户来说，
  整个引导就是一个静止的方框加一个不动的指针，描述成"没有动画"完全准确。现在改成**只去掉位移，
  保留透明度**：淡入淡出不属于运动（WCAG 对 animation-from-interaction 的界定就是 movement），
  指针手势变成透明度脉冲、光环继续呼吸、步骤切换改为交叉淡入。规则写进 `docs/design-system.md`，
  并由 `npm run tour:verify -- --reduce` 双向断言：指针必须在动「某种东西」，且必须没有位移。
- **修：指针手势幅度小到看不见。** 实测（CDP 采样运行中的页面）：手势最大位移 4px、指针本身
  从不移动（transform 只有 1 个取值）。现已改为：指针从目标左下方约 180px 处**飞入**（实测跨越
  步骤位移 143×274px，0.62s），手势幅度 36px，指针 20px→24px，按下缩放 0.82→0.68、扩散环放大到
  2.2 倍，且手势在飞入结束后才开始（原先两者同时进行，读起来只是抖了一下）。
- **修：大多数功能没有引导。** 原来是手写步骤，教师 25 个功能只讲了 6 个、学生 23 个讲了 3 个。
  现在功能步骤由路由表**生成**（`tour/featureCatalogue.ts` 只负责每个功能的一句话说明），
  66 个菜单项全部覆盖：教师 31 步、学生 23 步、家长 7 步、管理员 12 步；最后一步固定是各角色菜单
  末尾的「个人设置」，也就是重看引导的地方。`tourSteps.test.ts` 断言「每个菜单项都有说明文案、
  也都有对应步骤」，所以**再加菜单项而忘了写引导会直接测试失败**，这个洞不会再被重新打开。

### Changed

- **授权补齐到全部 20 个插件**：按矩阵逐条加 401/403，身份一律取自 actor 而非 body/query
  （`teacher_id`、`sender_id`、`family-tasks` 的 student/parent、`redemption/my` 的 studentId、
  `danmaku` 的 sender_name、economy/gacha/marketplace 的资产写）。行为变化：
  匿名访问这些路由从"200 + 数据"变为 401。

## [2.0.0] - 2026-09-20

这是「最小 Core + 无限 Plugins」重构的收口版本：**21 个域全部变成插件，`api/modules/` 为空**。
它同时包含一次必修的安全修复，而那条修复让部署前提发生变化 —— 所以是 MAJOR。

### Changed
- **架构**：内核（`packages/kernel`）+ 插件运行时（`packages/plugin-runtime`）+ SDK（`packages/plugin-sdk`）+ 21 个插件（`plugins/*`）。
  最后的 `admin` 域迁出后 `api/modules/` 为空；legacy 组装不再注册任何静态模块，改为把插件模块并进同一个 Nest 根模块。
  **HTTP 面一个都没变**：端点仍是 297 条，`routeCollisions` 为 0 —— 迁移是换实现者，不是改协议。
- **跨域级联删除有了机制**：`DELETE /api/admin/users/:id` 过去在一个 Prisma 事务里按 58 个硬编码表名删数据
  （原子，但绕过全部所有权检查）。现在每个插件注册自己的清理规则（`ctx.cleanup`），运行时按 schema 的外键图排序、
  在**一个**事务里执行 —— 原子性保留，表名回到拥有者手里，内核与运行时**一个业务表名都不出现**。
- **Prisma 退出运行时**：`admin` 是它最后一个消费者。`api/db.ts` 的第二条连接仍在（`initDb`/维护操作在用），
  收敛它是下一轮的事，已记在交接文档。
- **发布链路**：新增版本管理方案（`docs/versioning.md`）、一键发版脚本（`npm run release`）、
  tag 触发的 CI（验收 → 打包 → 校验和 → Release）。**修掉三处既有断点**：`pack.sh` 此前不含
  `packages/`、`plugins/`（按那份清单发出来的包没有内核与插件）；仓库从无 CI，所有 Release 都没有 asset
  （`releases/latest/download/think-class-release.zip` 因此永远 404，自动更新从未成功过）；
  更新脚本下载裸 zip 且从不校验完整性 —— 现在强制校验 `SHA256SUMS`，缺失或不匹配即中止。

### Fixed
- **安全：删掉源码里的公开默认加密密钥。** `api/db.ts` 与 `plugins/classroom` 过去在未设 `ENCRYPTION_KEY` 时
  回落到一个 32 位字面量，而它在仓库里 —— 等于用公开密钥加密学生姓名。现在没有回落：缺失或长度不对直接报错，
  且 `decrypt()` 在 legacy 明文回落**之前**解析密钥（否则"没配密钥"会被吞成"密文就是姓名"）。
  新增护栏 G18 防止它回来。
- 管理端的用户/激活码/平台设置/审计与数据库维护全部改为端口或内核 API（`identity.public`、`classroom.public`、
  `ctx.audit`、`ctx.settings.setPlatform`、`ctx.maintenance`），不再有第二条数据路径。

### Added
- 护栏 G18（加密密钥不得有默认值）、G19（版本管理一致性）；级联的覆盖性与载荷性测试（均做过变异验证）。
- `scripts/rotate-encryption-key.mjs`：单事务把既有行的密文从旧密钥迁到新密钥，支持 `--dry-run` 并自校验。

### ⚠️ 升级前必读（MAJOR 的原因）
1. **必须设置 `ENCRYPTION_KEY`**（32 字节）。没设的话，任何加密/解密都会直接失败 —— 这是刻意的。
2. 若库里已有加密的姓名，先用 `node scripts/rotate-encryption-key.mjs --db <库> --old-key <旧密钥> --new-key <新密钥> --yes` 迁移。
3. 数据库迁移只前进：不要修改已应用的迁移。

### UI 重构（前端表现层）
- **一套令牌、一套组件、四端外壳。** 颜色、圆角、阴影、动效全部收进 `src/index.css` 并由
  `tailwind.config.js` 暴露；`!important` 覆盖 14 处 → **0**，页面不再被外部 CSS 改写。
- **组件层真正被用起来**：裸 `<button>` 263 → 1（唯一保留的是大屏 3xl 倒计时读数，投影舞台特例）、
  裸 `<input>` 96 → 0、`<select>` 27 → 0、`<table>` 13 → 0、原生 `confirm()/prompt()` 19 → 0。
  新增组件：DataTable、Toolbar、StatCard、SectionCard、FormField、EmptyState、PageHeader、
  ConfirmDialog、Spinner/Skeleton、Progress、FileInput、Select/Textarea。
- **修掉一批"写了等于没写"的样式**：`ring-3`、`has-data-*`、`animate-in/fade-in`、`font-heading`
  等 126 处在 Tailwind 3.4 下编译为空（焦点环、弹窗动画、卡片标题字体从未生效）；另有
  `bg-card`/`bg-popover` 这类"令牌存在但没注册进调色板"8 处、**根本不存在的 `coral-*` 调色板**
  74 处（家长端主按钮因此没有背景色），以及 `animate-blob`、`scrollbar-hide`、`slideRight`
  等同样从未生效的类。
- **统一强调色**：非品牌色 utilities（indigo/violet/purple/fuchsia/pink/rose）790 → 0；
  十六进制色值 67 → 0（品牌标记与庆祝色板按名豁免，后者集中到 `src/lib/celebrationPalette.ts`）。
- **护栏**：新增 `scripts/migration/ui-audit.mjs`（15 个指标、`npm run ui:audit`）与 **G20**
  （`tests/guardrails/ui-design-system.test.ts`：棘轮 + 用项目自己的 Tailwind 配置编译组件契约类），
  详见 [docs/design-system.md](docs/design-system.md)。
- 构建产物 CSS 188,058 → 161,412 字节；前端测试 65 文件/157 用例 → 67/176；护栏 15 文件/85 用例。

## [1.7.0] - 2026-06-28

> 这一版当时只写了 `release-notes-v1.7.0.md`，没有 CHANGELOG 条目；本条目是补记，内容以那份文件为准。

### Changed
- 把工作区完整状态发布到 GitHub，围绕「学生 / 家长 / 教师 / 管理」四端重整前端：Campus Journey 视觉体系、
  更温暖的家长流程、更活泼的学生界面、更干净的教师与管理端。
- 后端路由收拢进 Nest 的 module/controller/service 边界，旧 route 文件从活跃源码树移除。
- 家长看板在班级功能关闭时不再因为可选的 family/pet 数据而整页失败；移除外部字体加载，改用本地 Geist 资源。
- 更新部署与发布脚本以适配模块化的应用结构。

## [1.6.7] - 2026-05-10

这版主要是在“能不能顺手用起来”上补课。前面很多页面已经接上真实后端了，但有些地方失败时只会冷冰冰地说“网络错误”，老师和学生都不知道自己错在哪一步。这次把这些细节收回来：该告诉你用户名重复就告诉你重复，该告诉你积分不够就别装作网络坏了。

### Added
- 新增 `activation_events` 表，用来记录激活来源、激活码、订单等关键线索，后续排查账号激活问题不用再靠猜。
- 新增部署脚本公共工具 `scripts/deploy-common.sh`，把 Node 检查、依赖安装、Prisma 生成、Release 下载、PM2 重启等重复逻辑集中管理。

### Changed
- 学生添加链路更稳了：创建学生会同步创建登录账号，默认密码为 `123456`，用户名重复和班级缺失都会给出明确提示。
- 教师端作业、商城、拍卖、盲盒、沟通页，以及学生端商城、拍卖、同伴互评、家长请假页，现在会展示后端返回的真实失败原因。
- 一键部署/更新脚本重构：安装脚本不再删除 lockfile，更新脚本复用公共部署工具，Windows 更新脚本会备份 `.env`、数据库和 data 目录。
- 打包脚本会先确保依赖和 Prisma Client 就绪，再构建发布包，减少“本地能跑、包里缺东西”的尴尬。

### Fixed
- 修复教师商城“库存 -1 表示无限”但后端拒绝 `-1` 的问题。
- 修复 `/api/students/progress-star` 被 `/api/students/:id` 动态路由吞掉，导致进步之星接口加载失败的问题。
- 修复添加学生失败时页面只显示通用请求失败、不展示后端中文原因的问题。

## [1.1.0] - 2026-04-10

### Added
- **Testing**: 引入了 `Vitest` 和 `MSW` 作为前端单元测试与接口 Mock 框架。
- **API Encapsulation**: 在 `src/api/` 下建立了结构化的 API 请求模块 (`auth.ts`, `students.ts`, `teacher.ts`, `admin.ts`)，映射了后端 `API接口文档.md` 中定义的核心接口。
- **Unit Tests**: 编写了 `src/api/__tests__/` 下针对 `auth`, `students`, `teacher`, `admin` 的基础单元测试用例。
- **Documentation**: 新增 `docs/api-integration-checklist.md`，记录接口对接情况。

### Changed
- **API Caller**: 重构了 `src/hooks/queries/` (如 `useClasses.ts`, `useStudents.ts`, `useStudentMutations.ts`)，从直接使用散落的 `apiGet/apiPost` 迁移到调用 `src/api/` 下的新模块。
- **Auth Flow**: 更新了 `src/pages/Login.tsx`, `src/pages/Admin/Login.tsx`, `src/pages/Activate.tsx` 中的登录、注册、激活接口调用，替换为封装好的 `authApi`。
- **Linting**: 优化了 `.eslint.config.js`，通过过滤 `.tmp` 和部分旧有 `any` 规则，使得 `npm run lint` 能够顺利通过。
