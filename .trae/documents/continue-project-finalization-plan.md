# 项目继续收尾计划

## Summary

- 目标：在现有“班级功能开关”基础上完成真正闭环，优先补齐学生/家长前端导航与路由守卫、教师端快捷控制入口、后端业务接口强制校验，并同步把支付 provider 边界收口到可继续上线接入的状态。
- 成功标准：
  - 教师可在独立功能页、主控台、课堂大屏三个入口查看并调整当前班级功能开关。
  - 学生端与家长端只展示已开启功能；直接访问被关闭功能路由时会被统一拦截并跳转到可用页面或显示禁用态。
  - 后端对应业务接口对班级功能做兜底校验，不再仅依赖前端隐藏入口。
  - 支付域继续保留 mock 实现，但 provider 工厂、环境判断、回调校验边界收口一致，不引入仓库中不存在的真实 SDK。
  - 变更通过类型检查、测试、Lint 与至少一轮本地冒烟验证。

## Current State Analysis

### 已完成基础设施

- 后端已集中定义 19 项班级功能键与读取/断言工具：`api/utils/classFeatures.ts`。
- 班级功能开关读取/写入接口已接入：`api/routes/class.ts` 的 `GET /:id/features` 与 `PUT /:id/settings|features`。
- 学生/家长登录已回传 `class_id` 与 `classFeatures`：`api/routes/auth.ts`。
- 前端 store 已能保存 `classFeatures`：`src/store/useStore.ts`。
- 前端统一功能键、默认值、文案、路由映射已存在：`src/lib/classFeatures.ts`。
- 教师独立功能页与真实配置面板已存在：`src/pages/Teacher/Features.tsx`、`src/pages/Teacher/components/ClassFeaturePanel.tsx`。

### 当前主要缺口

- 学生端导航仍是静态菜单：`src/components/Layout/StudentLayout.tsx` 未消费 `user.classFeatures`。
- 家长端导航也仍是静态菜单：`src/components/Layout/ParentLayout.tsx` 中 `/parent/tasks` 未与 `enable_family_tasks` 联动。
- 全局路由守卫仅校验登录/角色/激活态：`src/App.tsx` 未按班级功能拦截学生/家长功能页。
- 教师主控台与大屏尚未复用现有面板：`src/pages/Teacher/Dashboard.tsx`、`src/pages/Teacher/Bigscreen.tsx` 仍缺功能开关快捷入口。
- 后端虽然已有 `assertClassFeatureEnabled`，但业务路由基本未接入；多数接口仍可绕过前端直接访问。
- 支付已抽象出 provider 接口，但 `wechat`/`alipay` 当前仅继承 mock provider；`paymentService.ts` 与 `payment.ts` 仍存在 provider 选择与回调校验分散的问题。

## Proposed Changes

### 1. 前端统一功能守卫层

#### `src/lib/classFeatures.ts`

- 保持 19 项功能键为单一真相源。
- 扩展可复用的路由/菜单映射辅助数据：
  - 学生菜单项与功能键对应关系。
  - 家长菜单项与功能键对应关系（至少覆盖 `enable_family_tasks`）。
  - 默认回退路由策略，避免命中关闭页面后无处可去。
- 明确保留特殊语义：
  - `enable_world_boss` 依赖挑战页承载，但与 `enable_challenge` 分别判定。
  - `enable_parent_buff` 为机制开关，不新增独立导航入口。

#### 新增 `src/components/FeatureRouteGuard.tsx`

- 提供统一的班级功能路由守卫组件，读取 `useStore().user.classFeatures`。
- 用于学生端与家长端功能页拦截：
  - 功能关闭时统一跳转到当前角色首个可用页面，或渲染统一禁用态。
  - 功能缺失时回退到默认开启集合，兼容旧登录态。
- 统一处理“菜单隐藏”和“直接输入 URL”两种入口，避免逻辑分散到各页面。

#### 新增 `src/components/FeatureDisabledState.tsx`

- 提供统一禁用提示 UI，供路由守卫或需要空态提示的页面复用。
- 统一文案来源于 `classFeatureLabels`，避免各页自写提示文本。

### 2. 学生/家长导航与路由闭环

#### `src/components/Layout/StudentLayout.tsx`

- 用 `user.classFeatures` 过滤学生菜单。
- 顶部 Logo 点击与首次进入时，自动跳到首个可用学生功能页，而非硬编码 `/student/pet`。
- 对双键控制的页面做明确规则：
  - `/student/interactive-wall` 需要 `enable_chat_bubble` 或 `enable_tree_hole` 至少一个开启。
  - `/student/challenge` 与挑战主玩法走 `enable_challenge`；世界 Boss 区块在页内继续按 `enable_world_boss` 决定是否展示。
  - `/student/auction` 由 `enable_auction_blind_box` 控制。
  - `/student/bank` 由 `enable_economy` 控制。

#### `src/components/Layout/ParentLayout.tsx`

- 仅对 `/parent/tasks` 菜单项接入 `enable_family_tasks`。
- 若家长当前位于已关闭页面，自动回退到 `/parent/dashboard` 或首个可用家长路由。

#### `src/App.tsx`

- 在现有 `PrivateRoute` 之上，引入班级功能级守卫：
  - 学生路由：`shop`、`auction`、`challenge`、`lucky-draw`、`certificates/achievements` 中仅对真实存在功能键的页面做拦截。
  - 家长路由：`tasks` 按 `enable_family_tasks` 拦截。
- 保持原有激活校验逻辑不变，避免影响支付/激活主链。
- 不把教师/管理员页面纳入该守卫；教师端继续通过控制台管理功能，而不是被自身开关隐藏。

### 3. 教师端快捷入口与课堂展示联动

#### `src/pages/Teacher/Dashboard.tsx`

- 在当前 `selectedClassId` 已存在的前提下接入 `ClassFeaturePanel` 的紧凑版入口。
- 让教师在主控台切班时直接查看/调整当前班级 19 项能力，无需跳转独立设置页。
- 保持现有学生分组、积分、AI 摘要流程不改，只新增“快捷功能控制”区块。

#### `src/pages/Teacher/Bigscreen.tsx`

- 非全屏状态下接入当前班级的紧凑功能面板或功能摘要区。
- 使用现有 `GET /api/classes/:id/features` 结果控制大屏前端展示：
  - `enable_danmaku` 关闭时不挂载 `DanmakuOverlay`。
  - `enable_world_boss` 关闭时不展示世界 Boss 区块，即使接口返回也前端兜底隐藏。
- 保持全屏展示简洁；全屏模式不展开配置面板，仅消费已选班级配置。

### 4. 后端功能兜底校验

#### `api/utils/classFeatures.ts`

- 在现有 `getClassFeaturesByClassId` / `assertClassFeatureEnabled` 基础上补齐面向业务路由的辅助方法，减少每个路由重复查询：
  - 根据 `studentId` 解析 `class_id` 并断言功能开启。
  - 根据 `classId` 直接断言。
  - 必要时支持“多功能键满足其一”的判定，覆盖互动墙场景。

#### `api/routes/messages.ts`

- 对读取/发送消息增加功能开关判断：
  - `TREE_HOLE` 读写受 `enable_tree_hole` 控制。
  - 聊天气泡/互动聊天相关读写受 `enable_chat_bubble` 控制。
  - 若当前查询混合类型，则仅返回允许功能的数据或显式拒绝受限类型写入。

#### `api/routes/student.ts`

- 对同伴互评接口接入 `enable_peer_review`：
  - `GET /:id/peer-reviews/pending`
  - `POST /:id/peer-reviews`
- 对成就接口 `GET /:id/achievements` 接入 `enable_achievements`。
- 保留 `enable_parent_buff` 的既有积分加成判定，并收口到统一 helper，避免路由内散落 SQL 判断。

#### `api/routes/shop.ts`

- 学生商城能力：
  - `GET /items`、`POST /buy` 受 `enable_shop` 控制。
- 拍卖/盲盒能力：
  - `/auctions*`、`/blind_box`、`/blind_boxes*` 受 `enable_auction_blind_box` 控制。
- 教师管理端仍可保留配置入口，但学生消费接口必须强制校验。

#### `api/routes/challenge.ts`

- 普通挑战题目与提交受 `enable_challenge` 控制。
- 世界 Boss 查询/攻击受 `enable_world_boss` 控制。
- 保持现有 Boss 逻辑与记录表结构不变，只增加统一前置校验。

#### `api/routes/familyTasks.ts`

- 家长家庭任务读写统一受 `enable_family_tasks` 控制。

#### `api/routes/taskTree.ts`

- 教师端与学生端技能树接口统一受 `enable_task_tree` 控制。

#### `api/routes/danmaku.ts`

- 按 `classId` 读取/发送弹幕时统一受 `enable_danmaku` 控制。
- 与前端大屏隐藏形成前后端双保险。

#### `api/routes/battles.ts`

- 班级对战相关接口统一受 `enable_class_brawl` 控制。

#### `api/routes/slg.ts`

- 版图玩法相关接口统一受 `enable_slg` 控制。

#### `api/routes/gacha.ts`

- 召唤法阵相关接口统一受 `enable_gacha` 控制。

#### `api/routes/economy.ts`

- 银行/股票相关接口统一受 `enable_economy` 控制。

#### `api/routes/dungeon.ts`

- 无尽塔相关接口统一受 `enable_dungeon` 控制。

#### `api/routes/class.ts`

- 保留现有 `guild-ranking` 开关逻辑。
- 对大屏聚合返回补充当前班级 features 或继续在前端通过独立 features API 获取，但二者选其一并保持单一来源，避免同一页面双重拼装。

### 5. 支付 provider 边界收口

#### `api/services/paymentProviders/index.ts`

- 明确 provider 工厂入口与可用渠道选择逻辑，避免服务层与路由层各自实例化 provider。
- 继续保持当前无真实 SDK 依赖的实现前提，不新增仓库未使用的支付库。

#### `api/services/paymentService.ts`

- 将渠道实例获取统一收口到 provider 工厂。
- 让 `payment_environment`、渠道开关与 mock 行为在同一层决策，避免“表面是微信/支付宝，内部始终 mock”的状态继续散落。
- 明确订单创建、查单、支付完成的状态流转边界，保留现有 Prisma 订单/交易表结构。

#### `api/routes/payment.ts`

- 回调校验复用统一 provider 工厂，不再直接 new 具体 provider。
- 对 mock 环境和真实环境的 webhook 判定入口保持一致，减少后续替换真实渠道时的改动面。

#### `src/pages/Payment.tsx`、`src/pages/Admin/Settings.tsx`

- 支付页明确展示当前渠道可用性与 mock/real 环境状态，避免用户误以为已接入真实支付。
- 后台设置页继续承载环境、渠道开关与支付说明，不新增真实密钥录入表单，避免引入未落地的配置契约。

### 6. 测试与验证补齐

#### 前端测试

- 新增或补充以下测试：
  - `src/components/Layout/StudentLayout.test.tsx`：验证菜单按功能开关过滤与关闭功能后的回退行为。
  - `src/components/Layout/ParentLayout.test.tsx`：验证 `enable_family_tasks` 对家长菜单与回退的影响。
  - `src/pages/Teacher/Features.test.tsx` 或 `src/pages/Teacher/Dashboard.test.tsx`：验证主控台/独立功能页接入真实面板。
  - `src/pages/Payment.test.tsx`：补充 mock/渠道可用状态展示断言。

#### 后端/接口验证

- 以现有仓库验证模式为主，不额外引入新测试框架。
- 对关键接口补最小化验证覆盖：
  - 功能开启时正常返回。
  - 功能关闭时返回空数据或 403（按最终接口契约统一）。
  - 重点覆盖 `messages`、`shop`、`challenge`、`student peer reviews`、`familyTasks`、`taskTree`、`danmaku`。

## Assumptions & Decisions

- 不引入真实微信/支付宝 SDK，因为当前仓库未包含相关依赖，也没有可用密钥/证书配置；本轮只把 provider 边界收口到可接入状态。
- 班级功能开关优先作用于学生/家长消费侧；教师端管理页面不随开关隐藏。
- `enable_parent_buff` 继续作为机制开关，不新增独立前端入口。
- `enable_world_boss` 与 `enable_challenge` 分层处理：挑战页入口由 `enable_challenge` 控制，世界 Boss 区块由 `enable_world_boss` 单独控制。
- 对于关闭功能后的接口行为，优先统一为“写操作拒绝、读操作按场景返回 403 或空结果”，执行时以现有前端最小改动为准统一一套契约。
- 不在本轮推进全站 Prisma 替换；继续在现有 `better-sqlite3` 路由上补 feature enforcement，避免扩大改动面。

## Verification

- 运行静态校验：
  - `npm run check`
  - `npm run lint`
- 运行测试：
  - `npm test`
- 本地冒烟：
  - `npm start`
  - 使用教师账号切换班级并在功能页、主控台、大屏验证功能开关同步。
  - 使用学生/家长账号验证菜单隐藏、直接访问关闭路由被拦截、开启后恢复可用。
  - 对受控接口做至少一轮请求验证，确认关闭功能后后端拒绝绕过访问。
  - 验证支付页与后台设置页能正确反映 mock 环境与渠道开关状态。
