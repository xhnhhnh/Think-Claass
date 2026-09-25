# 路由鉴权矩阵（基线 297 端点；当前快照 332）

> **本表已滞后于快照，权威口径是 `npm run auth:audit`。** 下面的 297 行是 2026-09-20 侦察批次的基线，
> 其后的新增路由只做了增量补录（AI 智学轮补了 `/api/homework/ai/questions` 与
> `/api/admin/system/ai/test`，微信小程序轮补了 `plugins/wechat` 的 4 条）。当前
> `tests/guardrails/snapshots/api-surface.json` 是 **332 条端点**，`npm run auth:audit` 最近一次运行：
> 320 条已归属、21 条「公开（设计）」、**OPEN 0**。完整重生成需要 `.tmp/build-matrix.mjs`，该脚本从未
> 纳入版本管理，所以本表按轮次增量维护，而不是假装它还是全量。

> 只读侦察产物。**未修改任何业务代码**（本文件之外的写入仅限 `.tmp/**`）。

| 项 | 值 |
| --- | --- |
| 生成时刻 | 2026-09-20 15:47:08（本地） |
| 基线 revision | `8e447d9`（`git rev-parse HEAD`；声明位置与「鉴权现状」均取自该 revision） |
| 端点快照 | `tests/guardrails/snapshots/api-surface.json`（count=297，generatedAt=2026-09-19T09:10:41.123Z） |
| 判定方法 | 静态解析全部 `plugins/*/src/*.controller(s).ts`、`plugins/admin/src/admin.update.ts` 与 `packages/kernel/src/http/kernelRoutes.ts` 的每个 handler 及其委托 service；矩阵 297/297 行有判定，无「未检查」行 |
| 并发修复 | 侦察期间有队友正在修复同一批漏洞（15:32–15:35 落地）。第 3 列是**基线**状态；备注里的「已被并发修复」来自写入时刻工作区的重新解析 |

**列说明**

**如何刷新**：`node .tmp/build-matrix.mjs` 会重新解析当前工作区并重写本文件（297 行全量重生成，「仍敞开 / 已关闭」随之更新）。基线副本在 `.tmp/baseline/`（`pwsh -File .tmp/dump-baseline.ps1` 从 HEAD 重新导出）。后续修复批次可以直接靠它维护本表的第 3 列。

- **鉴权现状**：`公开（设计）`＝有意匿名；`受控：…`＝基线上已有门；`无鉴权`＝整个 handler 与 service 没有任何 actor 读取；`半受控`＝只在个别分支校验（匿名仍放行）。
- **应属角色**：建议的最小角色集合；括号里注明**结果集过滤**要求（只拒匿名往往不够）。
- **备注**：以 `P0..P3` 开头表示该行是漏点及其优先级；`—` 表示不是漏点。

## 0. 统计

| 分类 | 条数 |
| --- | --- |
| 端点总数 | 297 |
| 公开（设计如此） | 20 |
| 受控（基线上已有鉴权/actor 判定） | 59 |
| 漏点合计（基线「无鉴权」+「半受控」） | 218 |
| ↳ 其中写入时已被并发修复关闭 | 51 |
| ↳ **仍敞开（写入时刻）** | **167** |

按优先级：

| 级别 | 基线漏点 | 已关闭 | 仍敞开 |
| --- | --- | --- | --- |
| P0 | 9 | 9 | 0 |
| P1 | 79 | 23 | 56 |
| P2 | 125 | 19 | 106 |
| P3 | 5 | 0 | 5 |

按插件（基线漏点数 / 其中已关闭）：

| 插件文件 | 端点数 | 漏点 | 已关闭 |
| --- | --- | --- | --- |
| `packages/kernel/src/http/kernelRoutes.ts` | 8 | 0 | 0 |
| `plugins/admin/src/admin.controllers.ts` | 25 | 8 | 8 |
| `plugins/admin/src/admin.update.ts` | 3 | 0 | 0 |
| `plugins/system/src/system.controller.ts` | 8 | 8 | 8 |
| `plugins/classroom/src/classroom.controllers.ts` | 47 | 35 | 35 |
| `plugins/identity/src/identity.controllers.ts` | 4 | 0 | 0 |
| `plugins/insights/src/insights.controllers.ts` | 3 | 0 | 0 |
| `plugins/learning/src/learning.controllers.ts` | 24 | 3 | 0 |
| `plugins/assignments/src/assignments.controllers.ts` | 14 | 14 | 0 |
| `plugins/engagement/src/engagement.controllers.ts` | 24 | 23 | 0 |
| `plugins/collaboration/src/collaboration.controllers.ts` | 16 | 16 | 0 |
| `plugins/battles/src/battles.controllers.ts` | 13 | 13 | 0 |
| `plugins/challenge/src/challenge.controllers.ts` | 14 | 14 | 0 |
| `plugins/dungeon/src/dungeon.controllers.ts` | 8 | 8 | 0 |
| `plugins/economy/src/economy.controllers.ts` | 20 | 20 | 0 |
| `plugins/gacha/src/gacha.controllers.ts` | 10 | 10 | 0 |
| `plugins/marketplace/src/marketplace.controllers.ts` | 16 | 16 | 0 |
| `plugins/parent-buff/src/parentBuff.controller.ts` | 1 | 1 | 0 |
| `plugins/payment/src/payment.controllers.ts` | 3 | 0 | 0 |
| `plugins/pet/src/pet.controllers.ts` | 20 | 17 | 0 |
| `plugins/portal/src/portal.controllers.ts` | 8 | 4 | 0 |
| `plugins/slg/src/slg.controllers.ts` | 8 | 8 | 0 |

## 1. 完整矩阵（297 行）

按插件/文件分组，组内按声明顺序（= 文件内行号顺序）。由内核用 `router.get(...)` 直接注册的 8 条（`kernelRoutes.ts`）同样逐条覆盖，其「声明位置」指向 `kernelRoutes.ts`，不是装饰器。

### `packages/kernel/src/http/kernelRoutes.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `POST /api/kernel/auth/login` | `packages/kernel/src/http/kernelRoutes.ts:86` | 公开（设计） | 任何人（登录入口） | 签发 session token；必须匿名可调。 |
| `GET /api/settings` | `packages/kernel/src/http/kernelRoutes.ts:129` | 公开（设计） | 任何人 | SPA 登录前读取站点标题/支付开关（SiteSettingsBootstrap、PrivateRoute）；只有平台设置，无用户数据。 |
| `GET /api/health` | `packages/kernel/src/http/kernelRoutes.ts:133` | 公开（设计） | 任何人 | 存活探针；只返回版本与插件计数。 |
| `GET /api/kernel/info` | `packages/kernel/src/http/kernelRoutes.ts:147` | 公开（设计） | 任何人（建议收紧到 admin） | `P3`｜内核基础设施面；当前暴露 env、pluginDirs、pluginsEnabled。建议裁剪字段或限 admin。 |
| `GET /api/kernel/plugins` | `packages/kernel/src/http/kernelRoutes.ts:161` | 公开（设计） | 任何人 | 前端插件清单（公开描述符），无用户数据。 |
| `GET /api/kernel/permissions` | `packages/kernel/src/http/kernelRoutes.ts:165` | 公开（设计） | 任何人 | 权限目录（声明清单），无用户数据。 |
| `GET /api/kernel/auth/me` | `packages/kernel/src/http/kernelRoutes.ts:169` | 受控：无 actor 即 401 | 已登录 | 匿名被 401 拒绝（kernelRoutes.ts:173）。 |
| `POST /api/kernel/auth/logout` | `packages/kernel/src/http/kernelRoutes.ts:178` | 公开（设计） | 任何人 | 只撤销本次请求携带的 token，无 actor 时 revoked:false。 |

### `plugins/admin/src/admin.controllers.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `POST /api/admin/session` | `plugins/admin/src/admin.controllers.ts:60` | 公开（设计） | 任何人（管理员登录入口） | 管理员控制台登录，签发 token（authApi.adminLogin 在登录页调用）。 |
| `GET /api/admin/system/stats` | `plugins/admin/src/admin.controllers.ts:81` | 受控：requireAdmin | admin/superadmin | 每方法首行 requireAdmin（401 匿名 / 403 非管理员）。 |
| `GET /api/admin/system/settings` | `plugins/admin/src/admin.controllers.ts:91` | 受控：requireAdmin | admin/superadmin | 每方法首行 requireAdmin（401 匿名 / 403 非管理员）。 |
| `PUT /api/admin/system/settings` | `plugins/admin/src/admin.controllers.ts:101` | 受控：requireAdmin | admin/superadmin | 每方法首行 requireAdmin（401 匿名 / 403 非管理员）。 |
| `POST /api/admin/system/ai/test` | `plugins/admin/src/admin.controllers.ts:129` | 受控：requireAdmin | admin/superadmin | AI 判分/问答的「测试连接」：每方法首行 requireAdmin（401 匿名 / 403 非管理员）。**这是本轮唯一新增的路由**，模型调用经 `homework.public` 端口转发到 `plugins/homework`，作业插件未启用时仍返回 200 + 说明文案。 |
| `POST /api/homework/ai/questions` | `plugins/homework/src/homework.controllers.ts:154` | 受控：requireActorRole(TEACHER_WRITER) | teacher/admin/superadmin | AI 出题。作业插件 17 条路由中唯一没有 `:id` 的一条：生成不读也不写任何行，候选题只回给对话框，保存仍走原有的发布/编辑接口。服务层另有一道「只有老师可以出题」的 403（学生/家长即使越权到达控制器也会被拒）。 |
| `GET /api/admin/system/database/export` | `plugins/admin/src/admin.controllers.ts:111` | 受控：requireAdmin | admin/superadmin | 每方法首行 requireAdmin（401 匿名 / 403 非管理员）。 |
| `POST /api/admin/system/database/import` | `plugins/admin/src/admin.controllers.ts:122` | 受控：requireAdmin | admin/superadmin | 每方法首行 requireAdmin（401 匿名 / 403 非管理员）。 |
| `POST /api/admin/system/database/reset` | `plugins/admin/src/admin.controllers.ts:136` | 受控：requireAdmin | admin/superadmin | 每方法首行 requireAdmin（401 匿名 / 403 非管理员）。 |
| `GET /api/admin/users` | `plugins/admin/src/admin.controllers.ts:148` | 受控：requireAdmin | admin/superadmin | 每方法首行 requireAdmin（401 匿名 / 403 非管理员）。 |
| `POST /api/admin/users` | `plugins/admin/src/admin.controllers.ts:159` | 受控：requireAdmin | admin/superadmin | 每方法首行 requireAdmin（401 匿名 / 403 非管理员）。 |
| `PUT /api/admin/users/:id` | `plugins/admin/src/admin.controllers.ts:170` | 受控：requireAdmin | admin/superadmin | 每方法首行 requireAdmin（401 匿名 / 403 非管理员）。 |
| `DELETE /api/admin/users/:id` | `plugins/admin/src/admin.controllers.ts:183` | 受控：requireAdmin | admin/superadmin | 每方法首行 requireAdmin（401 匿名 / 403 非管理员）。 |
| `GET /api/admin/codes` | `plugins/admin/src/admin.controllers.ts:194` | 受控：requireAdmin | admin/superadmin | 每方法首行 requireAdmin（401 匿名 / 403 非管理员）。 |
| `POST /api/admin/codes` | `plugins/admin/src/admin.controllers.ts:205` | 受控：requireAdmin | admin/superadmin | 每方法首行 requireAdmin（401 匿名 / 403 非管理员）。 |
| `GET /api/admin/announcements` | `plugins/admin/src/admin.controllers.ts:217` | 受控：requireAdmin | admin/superadmin | 每方法首行 requireAdmin（401 匿名 / 403 非管理员）。 |
| `POST /api/admin/announcements` | `plugins/admin/src/admin.controllers.ts:228` | 受控：requireAdmin | admin/superadmin | 每方法首行 requireAdmin（401 匿名 / 403 非管理员）。 |
| `PUT /api/admin/announcements/:id` | `plugins/admin/src/admin.controllers.ts:239` | 受控：requireAdmin | admin/superadmin | 每方法首行 requireAdmin（401 匿名 / 403 非管理员）。 |
| `DELETE /api/admin/announcements/:id` | `plugins/admin/src/admin.controllers.ts:252` | 受控：requireAdmin | admin/superadmin | 每方法首行 requireAdmin（401 匿名 / 403 非管理员）。 |
| `GET /api/openapi/keys` | `plugins/admin/src/admin.controllers.ts:268` | 无鉴权 | admin/superadmin | `P0`(已关闭)｜**【写入时已被并发修复：新增 requireAdmin】** 基线匿名返回 API Key 明文（sk_…）＝凭据级泄漏。 |
| `POST /api/openapi/keys` | `plugins/admin/src/admin.controllers.ts:278` | 无鉴权 | admin/superadmin | `P0`(已关闭)｜**【写入时已被并发修复：新增 requireAdmin】** 基线匿名可铸造新 Key（可持久化后门）。 |
| `DELETE /api/openapi/keys/:id` | `plugins/admin/src/admin.controllers.ts:289` | 无鉴权 | admin/superadmin | `P0`(已关闭)｜**【写入时已被并发修复：新增 requireAdmin】** 基线匿名可吊销任意 Key。 |
| `GET /api/openapi/schools` | `plugins/admin/src/admin.controllers.ts:300` | 无鉴权 | admin/superadmin | `P2`(已关闭)｜**【写入时已被并发修复：新增 requireAdmin】** 校园/租户名录（非秘密但非公开）。 |
| `POST /api/openapi/schools` | `plugins/admin/src/admin.controllers.ts:310` | 无鉴权 | admin/superadmin | `P2`(已关闭)｜**【写入时已被并发修复：新增 requireAdmin】** 匿名可新建校园记录。 |
| `PUT /api/openapi/schools/:id` | `plugins/admin/src/admin.controllers.ts:321` | 无鉴权 | admin/superadmin | `P2`(已关闭)｜**【写入时已被并发修复：新增 requireAdmin】** 匿名可篡改校园记录。 |
| `DELETE /api/openapi/schools/:id` | `plugins/admin/src/admin.controllers.ts:331` | 无鉴权 | admin/superadmin | `P2`(已关闭)｜**【写入时已被并发修复：新增 requireAdmin】** 匿名可删除校园记录。 |
| `GET /api/audit-logs` | `plugins/admin/src/admin.controllers.ts:347` | 无鉴权 | admin/superadmin | `P1`(已关闭)｜**【写入时已被并发修复：新增 requireAdmin】** 基线匿名返回 operation_logs（操作者 id/IP/动作）。 |

### `plugins/admin/src/admin.update.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `GET /api/admin/system/update/status` | `plugins/admin/src/admin.update.ts:350` | 受控：requireActorRole(superadmin) | superadmin | admin.update.ts:353/363/374，401 匿名 / 403 非 superadmin。 |
| `GET /api/admin/system/update/check` | `plugins/admin/src/admin.update.ts:360` | 受控：requireActorRole(superadmin) | superadmin | admin.update.ts:353/363/374，401 匿名 / 403 非 superadmin。 |
| `POST /api/admin/system/update` | `plugins/admin/src/admin.update.ts:370` | 受控：requireActorRole(superadmin) | superadmin | admin.update.ts:353/363/374，401 匿名 / 403 非 superadmin。 |

### `plugins/system/src/system.controller.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `GET /api/system/questions` | `plugins/system/src/system.controller.ts:34` | 无鉴权 | teacher/admin | `P2`(已关闭)｜**【写入时已被并发修复：新增 requireAdmin】** 题库。 |
| `POST /api/system/questions` | `plugins/system/src/system.controller.ts:39` | 无鉴权 | teacher/admin | `P2`(已关闭)｜**【写入时已被并发修复：新增 requireAdmin】** 匿名可写题库。 |
| `PUT /api/system/questions/:id` | `plugins/system/src/system.controller.ts:44` | 无鉴权 | teacher/admin | `P2`(已关闭)｜**【写入时已被并发修复：新增 requireAdmin】** 匿名可改题目。 |
| `DELETE /api/system/questions/:id` | `plugins/system/src/system.controller.ts:50` | 无鉴权 | teacher/admin | `P2`(已关闭)｜**【写入时已被并发修复：新增 requireAdmin】** 匿名可删题目。 |
| `GET /api/system/settings` | `plugins/system/src/system.controller.ts:56` | 无鉴权 | admin/superadmin | `P2`(已关闭)｜**【写入时已被并发修复：新增 requireAdmin】** 平台设置表（可能与 /api/settings 的公开投影不同）。 |
| `POST /api/system/settings` | `plugins/system/src/system.controller.ts:61` | 无鉴权 | admin/superadmin | `P1`(已关闭)｜**【写入时已被并发修复：新增 requireAdmin】** 匿名可写平台设置（可持久化后门，如支付/门禁开关）。 |
| `GET /api/system/logs` | `plugins/system/src/system.controller.ts:67` | 无鉴权 | admin/superadmin | `P1`(已关闭)｜**【写入时已被并发修复：新增 requireAdmin】** 内部日志（操作流水）。 |
| `GET /api/system/backup/export` | `plugins/system/src/system.controller.ts:77` | 无鉴权 | admin/superadmin（superadmin 更合适） | `P0`(已关闭)｜**【写入时已被并发修复：新增 requireAdmin】** 整库 JSON 下载，含 users.password_hash（BACKUP_TABLES 首项即 users）；基线匿名可下载，写入时已被并发修复为 requireAdmin。 |

### `plugins/classroom/src/classroom.controllers.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `GET /api/students` | `plugins/classroom/src/classroom.controllers.ts:53` | 无鉴权 | teacher（限本班）/admin；student（本人）/parent（孩子） | `P0`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 学生 PII：姓名（解密后）、班级、积分、生日；基线匿名可整表导出。 |
| `GET /api/students/records` | `plugins/classroom/src/classroom.controllers.ts:62` | 无鉴权 | teacher（本班）/admin；student（本人）/parent（孩子） | `P0`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 积分流水含 student_name。 |
| `GET /api/students/progress-star` | `plugins/classroom/src/classroom.controllers.ts:71` | 无鉴权 | teacher（本班）/admin；student（本人）/parent（孩子） | `P0`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 进步之星榜单（姓名+积分）。与 `/api/students`、`/api/students/:id`、`/api/students/records` 同族，但那三条已被并发修复关闭，**这一条仍是匿名可读**（getProgressStar 未加 actor）。 |
| `POST /api/students/checkin` | `plugins/classroom/src/classroom.controllers.ts:80` | 无鉴权 | student（本人） | `P2`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可代任意 studentId 签到刷分。 |
| `POST /api/students/gift` | `plugins/classroom/src/classroom.controllers.ts:90` | 无鉴权 | student（本人，senderId 由 actor 派生） | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可用 senderId/receiverId 任意转移积分（资金操作）。 |
| `POST /api/students/batch-import` | `plugins/classroom/src/classroom.controllers.ts:100` | 无鉴权 | teacher/admin | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可批量创建学生账号（含初始密码）。 |
| `POST /api/students` | `plugins/classroom/src/classroom.controllers.ts:110` | 无鉴权 | teacher/admin | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可创建学生账号。 |
| `POST /api/students/batch-points` | `plugins/classroom/src/classroom.controllers.ts:120` | 无鉴权 | teacher（本班） | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可给任意学生批量加减积分。 |
| `POST /api/students/batch-edit` | `plugins/classroom/src/classroom.controllers.ts:130` | 无鉴权 | teacher（本班） | `P0`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 最严重的一条：action=reset_password 时匿名可把任意学生密码重置为指定值/123456＝账号接管；同接口还能 change_class/change_group。必须与 PUT /:id/password 同级鉴权，并逐条校验 actor 对本班/本学生的管辖权。 |
| `GET /api/students/:id` | `plugins/classroom/src/classroom.controllers.ts:140` | 无鉴权 | teacher（本班）/admin；student（本人）/parent（孩子） | `P0`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 单个学生完整档案。 |
| `PUT /api/students/:id/class` | `plugins/classroom/src/classroom.controllers.ts:149` | 受控：teacher 本班校验 | teacher（本班）/admin | ensureTeacherCanManageStudent 已 403 匿名。 |
| `PUT /api/students/:id/group` | `plugins/classroom/src/classroom.controllers.ts:159` | 受控：teacher 本班校验 | teacher（本班）/admin | ensureTeacherCanManageStudent 已 403 匿名。 |
| `PUT /api/students/:id/password` | `plugins/classroom/src/classroom.controllers.ts:169` | 受控：teacher 本班校验 | teacher（本班）/admin | ensureTeacherCanManageStudent 已 403 匿名（对照：batch-edit 绕过了它）。 |
| `POST /api/students/:id/points` | `plugins/classroom/src/classroom.controllers.ts:178` | 无鉴权 | teacher（本班）/admin | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可给任意学生加减积分。 |
| `PUT /api/students/:id/birthday` | `plugins/classroom/src/classroom.controllers.ts:188` | 无鉴权 | teacher（本班） | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可改学生生日（生日属 PII）。 |
| `GET /api/students/:id/achievements` | `plugins/classroom/src/classroom.controllers.ts:197` | 无鉴权 | student（本人）/parent（孩子）/teacher（本班） | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 可读任意学生成就；注意该 GET 还会写入 achievements（有副作用）。 |
| `GET /api/students/:id/peer-reviews/pending` | `plugins/classroom/src/classroom.controllers.ts:206` | 无鉴权 | student（本人） | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 返回同组/同班待评同学姓名列表。 |
| `POST /api/students/:id/peer-reviews` | `plugins/classroom/src/classroom.controllers.ts:215` | 无鉴权 | student（本人） | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可代任意学生提交互评并触发双向加分。 |
| `GET /api/class` | `plugins/classroom/src/classroom.controllers.ts:230` | 受控：actor 过滤 | teacher/student/parent/admin | listClasses 按 actor 角色返回其可见班级，匿名 403「无权限查看班级」（classroom.service.ts:585）。 |
| `GET /api/classes` | `plugins/classroom/src/classroom.controllers.ts:230` | 受控：actor 过滤 | teacher/student/parent/admin | listClasses 按 actor 角色返回其可见班级，匿名 403「无权限查看班级」（classroom.service.ts:585）。 |
| `GET /api/class/invite/:code` | `plugins/classroom/src/classroom.controllers.ts:239` | 公开（设计） | 任何人（邀请码即凭据） | 注册前校验邀请码：LoginPage.tsx:60 → authApi.verifyInviteCode → authApi.ts:30。注意 GET 返回班级学生姓名列表，role=parent 时收窄。 |
| `GET /api/classes/invite/:code` | `plugins/classroom/src/classroom.controllers.ts:239` | 公开（设计） | 任何人（邀请码即凭据） | 注册前校验邀请码：LoginPage.tsx:60 → authApi.verifyInviteCode → authApi.ts:30。注意 GET 返回班级学生姓名列表，role=parent 时收窄。 |
| `POST /api/class` | `plugins/classroom/src/classroom.controllers.ts:248` | 受控：角色门 | teacher/admin/superadmin | createClass 的 actor 判定（classroom.service.ts:606-608）。 |
| `POST /api/classes` | `plugins/classroom/src/classroom.controllers.ts:248` | 受控：角色门 | teacher/admin/superadmin | createClass 的 actor 判定（classroom.service.ts:606-608）。 |
| `GET /api/class/:id` | `plugins/classroom/src/classroom.controllers.ts:258` | 无鉴权 | teacher（本班）/admin | `P2`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可读任意班级基本信息（含邀请码 invite_code，可据此自行加入）。 |
| `GET /api/classes/:id` | `plugins/classroom/src/classroom.controllers.ts:258` | 无鉴权 | teacher（本班）/admin | `P2`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可读任意班级基本信息（含邀请码 invite_code，可据此自行加入）。 |
| `GET /api/class/:id/features` | `plugins/classroom/src/classroom.controllers.ts:267` | 无鉴权 | teacher（本班）/admin | `P2`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可读任意班级功能开关。 |
| `GET /api/classes/:id/features` | `plugins/classroom/src/classroom.controllers.ts:267` | 无鉴权 | teacher（本班）/admin | `P2`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可读任意班级功能开关。 |
| `GET /api/class/:id/bigscreen` | `plugins/classroom/src/classroom.controllers.ts:276` | 无鉴权 | teacher（本班）/admin | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 大屏数据：学生姓名、表扬内容、积分流水；匿名可读任意班级。 |
| `GET /api/classes/:id/bigscreen` | `plugins/classroom/src/classroom.controllers.ts:276` | 无鉴权 | teacher（本班）/admin | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 大屏数据：学生姓名、表扬内容、积分流水；匿名可读任意班级。 |
| `GET /api/class/:id/guild-ranking` | `plugins/classroom/src/classroom.controllers.ts:285` | 无鉴权 | teacher（本班）/student（本班） | `P2`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可读任意班级公会榜（姓名+积分）。 |
| `GET /api/classes/:id/guild-ranking` | `plugins/classroom/src/classroom.controllers.ts:285` | 无鉴权 | teacher（本班）/student（本班） | `P2`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可读任意班级公会榜（姓名+积分）。 |
| `PUT /api/class/:id/features` | `plugins/classroom/src/classroom.controllers.ts:294` | 无鉴权 | teacher（本班，owner）/admin | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 一条 handler 挂 4 条路径；匿名可开关任意班级功能（含 danmaku/shop/parent_buff 等），直接影响其它域的门禁。 |
| `PUT /api/class/:id/settings` | `plugins/classroom/src/classroom.controllers.ts:294` | 无鉴权 | teacher（本班，owner）/admin | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 一条 handler 挂 4 条路径；匿名可开关任意班级功能（含 danmaku/shop/parent_buff 等），直接影响其它域的门禁。 |
| `PUT /api/classes/:id/features` | `plugins/classroom/src/classroom.controllers.ts:294` | 无鉴权 | teacher（本班，owner）/admin | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 一条 handler 挂 4 条路径；匿名可开关任意班级功能（含 danmaku/shop/parent_buff 等），直接影响其它域的门禁。 |
| `PUT /api/classes/:id/settings` | `plugins/classroom/src/classroom.controllers.ts:294` | 无鉴权 | teacher（本班，owner）/admin | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 一条 handler 挂 4 条路径；匿名可开关任意班级功能（含 danmaku/shop/parent_buff 等），直接影响其它域的门禁。 |
| `GET /api/groups` | `plugins/classroom/src/classroom.controllers.ts:308` | 受控：teacher 本班校验 | teacher（本班）/admin | listGroups/createGroup/assignStudent 均走 ensureTeacherCanManage*。 |
| `POST /api/groups` | `plugins/classroom/src/classroom.controllers.ts:317` | 受控：teacher 本班校验 | teacher（本班）/admin | listGroups/createGroup/assignStudent 均走 ensureTeacherCanManage*。 |
| `POST /api/groups/assign` | `plugins/classroom/src/classroom.controllers.ts:327` | 受控：teacher 本班校验 | teacher（本班）/admin | listGroups/createGroup/assignStudent 均走 ensureTeacherCanManage*。 |
| `GET /api/presets` | `plugins/classroom/src/classroom.controllers.ts:342` | 无鉴权 | teacher（本人）/admin | `P2`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可按 teacherId 读任意教师积分预设。 |
| `POST /api/presets` | `plugins/classroom/src/classroom.controllers.ts:351` | 无鉴权 | teacher/admin | `P2`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可创建预设（teacher_id 缺省时自动挂到库中第一个教师）。 |
| `DELETE /api/presets/:id` | `plugins/classroom/src/classroom.controllers.ts:361` | 无鉴权 | teacher（本人）/admin | `P2`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可删任意预设。 |
| `GET /api/attendance` | `plugins/classroom/src/classroom.controllers.ts:375` | 无鉴权 | teacher（本班）/admin；student（本人）/parent（孩子） | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 出勤记录属学生 PII；query 可指定任意班级/学生，须按 actor 过滤。 |
| `POST /api/attendance` | `plugins/classroom/src/classroom.controllers.ts:384` | 无鉴权 | teacher（本班） | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可改写任意班级考勤。 |
| `GET /api/leaves` | `plugins/classroom/src/classroom.controllers.ts:400` | 无鉴权 | parent（本人孩子）/student（本人）/teacher（本班） | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 请假事由属 PII；须按 actor 过滤结果集。 |
| `POST /api/leaves` | `plugins/classroom/src/classroom.controllers.ts:409` | 无鉴权 | parent（本人孩子） | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可代任意家长提交请假。 |
| `PUT /api/leaves/:id` | `plugins/classroom/src/classroom.controllers.ts:419` | 无鉴权 | teacher（本班，审批） | `P1`(已关闭)｜**【写入时已被并发修复：新增 service(req)】** 匿名可审批任意请假。 |

### `plugins/identity/src/identity.controllers.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `POST /api/auth/login` | `plugins/identity/src/identity.controllers.ts:45` | 公开（设计） | 任何人（登录入口） | authApi.login ← LoginPage（公开路由 /login），签发 session token。 |
| `PUT /api/auth/profile` | `plugins/identity/src/identity.controllers.ts:67` | 受控：actor 校验 | 已登录本人 | identity.service.ts:183-196，无 actor 即 403。 |
| `POST /api/auth/register` | `plugins/identity/src/identity.controllers.ts:76` | 公开（设计） | 任何人（需邀请码/学生绑定，受 allow_teacher_registration 限制） | authApi.register ← 注册页；服务端在 identity.service.ts:245 拒绝未开放的教师注册。 |
| `POST /api/auth/activate` | `plugins/identity/src/identity.controllers.ts:86` | 公开（设计） | 任何人（激活码即凭据） | authApi.activate ← ActivatePage（公开路由 /activate）。 |

### `plugins/insights/src/insights.controllers.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `GET /api/analytics/classes/:classId/overview` | `plugins/insights/src/insights.controllers.ts:38` | 受控：actor 判定 | admin 任意；teacher 本班；parent 孩子；student 本人 | insights.service.ts assertStudentAccess / 班级 owner 判定，匿名 403。 |
| `GET /api/analytics/students/:studentId/report` | `plugins/insights/src/insights.controllers.ts:47` | 受控：actor 判定 | admin 任意；teacher 本班；parent 孩子；student 本人 | insights.service.ts assertStudentAccess / 班级 owner 判定，匿名 403。 |
| `GET /api/analytics/students/:studentId/radar` | `plugins/insights/src/insights.controllers.ts:56` | 受控：actor 判定 | admin 任意；teacher 本班；parent 孩子；student 本人 | insights.service.ts assertStudentAccess / 班级 owner 判定，匿名 403。 |

### `plugins/ai-study/src/ai-study.controllers.ts`

AI 智学（本轮新增的 6 条路由）。两层门：控制器先做角色门（401 未登录或登录已过期 / 403 无权限执行该操作，在任何校验之前），随后以 `ctx.permissions.require` 施加清单里声明的能力键（`ai_study.practice` / `ai_study.insight` / `ai_study.assign`）。服务层再做归属收窄：学生路由**不带 `:studentId`**，学生行由 `classroom.public.getStudentByUserId(actor.userId)` 解析，因此没有可伪造的路径参数；`sets/:id` 是学生唯一能提供的 id，服务比对练单的 `student_id`。教师路由经 `assertClassAccess`（admin/superadmin 任意，teacher 限 `listClassIdsByTeacher` 的班级，其他角色 403），派发时再逐生 `assertStudentInClass`。班级开关 `enable_ai_study` 关闭时统一 403 该功能当前已关闭。

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `POST /api/ai-study/my/sets` | `plugins/ai-study/src/ai-study.controllers.ts:68` | 受控：requireActorRole(student) | student（本人） | 生成智学练单。控制器角色门 + `ai_study.practice` + `assertStudentFeature`；已有进行中练单时幂等返回原练单，不新建。 |
| `GET /api/ai-study/my/sets/current` | `plugins/ai-study/src/ai-study.controllers.ts:76` | 受控：requireActorRole(student) | student（本人） | 读取本人当前练单；无练单时 200 + `set: null`（不是 404）。 |
| `PUT /api/ai-study/sets/:id/answers` | `plugins/ai-study/src/ai-study.controllers.ts:84` | 受控：requireActorRole(student) | student（本人） | 保存作答。练单不属于本人 403；练单不存在 404；已提交 400。 |
| `POST /api/ai-study/sets/:id/submit` | `plugins/ai-study/src/ai-study.controllers.ts:97` | 受控：requireActorRole(student) | student（本人） | 交卷并回写掌握度。判定在题目所有者 `learning.public.recordPracticeOutcome` 内完成；主观题/无参考答案返回 `is_correct: null` 且不动掌握度。 |
| `GET /api/ai-study/classes/:classId/insight` | `plugins/ai-study/src/ai-study.controllers.ts:113` | 受控：requireActorRole(teacher/admin/superadmin) | teacher（本班）/admin/superadmin | 班级智学看板。仅汇总本班学生信号，学生数上限 40 并在响应里说明截断。 |
| `POST /api/ai-study/classes/:classId/assign` | `plugins/ai-study/src/ai-study.controllers.ts:121` | 受控：requireActorRole(teacher/admin/superadmin) | teacher（本班）/admin/superadmin | 派发练单。缺 `student_ids` 400；逐个校验学生属于本班；单次上限 60 人，失败按学生返回原因。 |

### `plugins/learning/src/learning.controllers.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `GET /api/papers` | `plugins/learning/src/learning.controllers.ts:87` | 受控：actor 判定 | teacher（本人）/admin；student（本班已发布） | learning.service.ts:114-130，匿名 403。 |
| `POST /api/papers` | `plugins/learning/src/learning.controllers.ts:92` | 受控：requireActorRole(STAFF) | teacher/admin/superadmin | 控制器 401/403 门（learning.controllers.ts:94）。 |
| `GET /api/papers/:id` | `plugins/learning/src/learning.controllers.ts:98` | 受控：actor 判定 | teacher（归属者）/student（本班已发布） | learning.service.ts:158-170，匿名 403。 |
| `PUT /api/papers/:id` | `plugins/learning/src/learning.controllers.ts:103` | 受控：requireActorRole(STAFF) | teacher/admin/superadmin | 控制器门 + service 内 teacher_id 归属校验。 |
| `PUT /api/papers/:id/structure` | `plugins/learning/src/learning.controllers.ts:109` | 受控：requireActorRole(STAFF) | teacher/admin/superadmin | 同上。 |
| `POST /api/papers/:id/assets` | `plugins/learning/src/learning.controllers.ts:115` | 受控：requireActorRole(STAFF) | teacher/admin/superadmin | 同上（文件上传）。 |
| `POST /api/paper-submissions/start` | `plugins/learning/src/learning.controllers.ts:131` | 受控：requireActorRole(student) | student（本人） | 控制器门 + service 内 student_id 归属校验。 |
| `PUT /api/paper-submissions/:id/answers` | `plugins/learning/src/learning.controllers.ts:137` | 受控：requireActorRole(student) | student（本人） | 控制器门 + service 内 student_id 归属校验。 |
| `POST /api/paper-submissions/:id/submit` | `plugins/learning/src/learning.controllers.ts:144` | 受控：requireActorRole(student) | student（本人） | 控制器门 + service 内 student_id 归属校验。 |
| `GET /api/knowledge/subjects` | `plugins/learning/src/learning.controllers.ts:155` | 无鉴权 | 登录用户（teacher/student/admin） | `P3`｜知识点图谱＝课程内容，无用户数据；建议至少要求登录，避免被批量爬取。 |
| `POST /api/knowledge/subjects` | `plugins/learning/src/learning.controllers.ts:160` | 受控：requireActorRole(STAFF) | teacher/admin/superadmin | 控制器 401/403 门。 |
| `GET /api/knowledge/nodes` | `plugins/learning/src/learning.controllers.ts:166` | 无鉴权 | 登录用户（teacher/student/admin） | `P3`｜知识点图谱＝课程内容，无用户数据；建议至少要求登录，避免被批量爬取。 |
| `POST /api/knowledge/nodes` | `plugins/learning/src/learning.controllers.ts:171` | 受控：requireActorRole(STAFF) | teacher/admin/superadmin | 控制器 401/403 门。 |
| `PUT /api/knowledge/nodes/:id` | `plugins/learning/src/learning.controllers.ts:177` | 受控：requireActorRole(STAFF) | teacher/admin/superadmin | 控制器 401/403 门。 |
| `DELETE /api/knowledge/nodes/:id` | `plugins/learning/src/learning.controllers.ts:183` | 受控：requireActorRole(STAFF) | teacher/admin/superadmin | 控制器 401/403 门。 |
| `GET /api/knowledge/edges` | `plugins/learning/src/learning.controllers.ts:190` | 无鉴权 | 登录用户（teacher/student/admin） | `P3`｜知识点图谱＝课程内容，无用户数据；建议至少要求登录，避免被批量爬取。 |
| `POST /api/knowledge/edges` | `plugins/learning/src/learning.controllers.ts:195` | 受控：requireActorRole(STAFF) | teacher/admin/superadmin | 控制器 401/403 门。 |
| `DELETE /api/knowledge/edges/:id` | `plugins/learning/src/learning.controllers.ts:201` | 受控：requireActorRole(STAFF) | teacher/admin/superadmin | 控制器 401/403 门。 |
| `GET /api/wrong-questions/my` | `plugins/learning/src/learning.controllers.ts:213` | 受控：requireActorRole(student) | student（本人） | 控制器门 + service 内 student_id 归属校验。 |
| `POST /api/wrong-questions/:id/attempt` | `plugins/learning/src/learning.controllers.ts:219` | 受控：requireActorRole(student) | student（本人） | 控制器门 + service 内 student_id 归属校验。 |
| `POST /api/wrong-questions/:id/generate` | `plugins/learning/src/learning.controllers.ts:226` | 受控：requireActorRole(student) | student（本人） | 控制器门 + service 内 student_id 归属校验。 |
| `GET /api/study-plans/my` | `plugins/learning/src/learning.controllers.ts:237` | 受控：requireActorRole(student) | student（本人） | 控制器门。 |
| `POST /api/study-plans` | `plugins/learning/src/learning.controllers.ts:243` | 受控：requireActorRole(student) | student（本人） | 控制器门。 |
| `PUT /api/study-plans/items/:id` | `plugins/learning/src/learning.controllers.ts:249` | 受控：requireActorRole(student) | student（本人） | 控制器门 + service 内归属校验。 |

### `plugins/assignments/src/assignments.controllers.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `GET /api/assignments` | `plugins/assignments/src/assignments.controllers.ts:33` | 无鉴权 | teacher/admin（限本班）；student 限本班已发布 | `P2`｜按 class_id 查询任意班级作业；须按 actor 所属班级过滤结果集，而非仅拒匿名。 |
| `POST /api/assignments` | `plugins/assignments/src/assignments.controllers.ts:38` | 无鉴权 | teacher/admin | `P2`｜匿名可给任意班级布置作业；teacher_id 应由 actor 派生。 |
| `GET /api/assignments/student-assignments` | `plugins/assignments/src/assignments.controllers.ts:44` | 无鉴权 | teacher（本班）/student（本人）/parent（孩子） | `P2`｜query 里的 student_id/assignment_id 可任意指定，须与 actor 比对后再过滤。 |
| `PUT /api/assignments/student-assignments/:id` | `plugins/assignments/src/assignments.controllers.ts:49` | 无鉴权 | teacher（本班） | `P2`｜匿名可改写学生作业提交状态/得分。 |
| `PUT /api/assignments/:id` | `plugins/assignments/src/assignments.controllers.ts:54` | 无鉴权 | teacher（作业归属者）/admin | `P2`｜匿名可改任意作业。 |
| `DELETE /api/assignments/:id` | `plugins/assignments/src/assignments.controllers.ts:59` | 无鉴权 | teacher（作业归属者）/admin | `P2`｜匿名可删任意作业。 |
| `GET /api/exams` | `plugins/assignments/src/assignments.controllers.ts:69` | 无鉴权 | teacher/admin（本班） | `P1`｜匿名可按 class_id 读任意班级考试。 |
| `POST /api/exams` | `plugins/assignments/src/assignments.controllers.ts:74` | 无鉴权 | teacher/admin | `P1`｜匿名可创建考试。 |
| `GET /api/exams/student-exams` | `plugins/assignments/src/assignments.controllers.ts:80` | 无鉴权 | teacher（本班）/student（本人）/parent（孩子） | `P1`｜成绩属学生 PII；query 可任意指定学生，须按 actor 过滤结果集。 |
| `PUT /api/exams/student-exams/:id` | `plugins/assignments/src/assignments.controllers.ts:85` | 无鉴权 | teacher（本班） | `P1`｜匿名可改写任意学生成绩与评语。 |
| `GET /api/exams/:id/grades` | `plugins/assignments/src/assignments.controllers.ts:90` | 无鉴权 | teacher（试卷归属者）/admin | `P1`｜匿名可拉全班成绩单。 |
| `PUT /api/exams/:id/grades` | `plugins/assignments/src/assignments.controllers.ts:96` | 无鉴权 | teacher（试卷归属者） | `P1`｜匿名可批量改写全班成绩。 |
| `PUT /api/exams/:id` | `plugins/assignments/src/assignments.controllers.ts:101` | 无鉴权 | teacher（归属者）/admin | `P1`｜匿名可改考试。 |
| `DELETE /api/exams/:id` | `plugins/assignments/src/assignments.controllers.ts:106` | 无鉴权 | teacher（归属者）/admin | `P1`｜匿名可删考试。 |

### `plugins/engagement/src/engagement.controllers.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `GET /api/announcements/active` | `plugins/engagement/src/engagement.controllers.ts:66` | 公开（设计） | 任何人 | 站点级公告横幅文本；前端只在登录后的 CampusShell 调用（AnnouncementBanner.tsx ← CampusShell.tsx:105），若要收紧为登录可读也不影响匿名页面。 |
| `GET /api/class-announcements` | `plugins/engagement/src/engagement.controllers.ts:80` | 无鉴权 | teacher（本班）/student（本班） | `P2`｜匿名可按 classId 读任意班级公告。 |
| `POST /api/class-announcements` | `plugins/engagement/src/engagement.controllers.ts:91` | 无鉴权 | teacher（本班） | `P2`｜匿名可冒名发布班级公告（teacher_id 取自 body，应改为 actor 派生）。 |
| `DELETE /api/class-announcements/:id` | `plugins/engagement/src/engagement.controllers.ts:106` | 无鉴权 | teacher（作者）/admin | `P2`｜匿名可删任意公告。 |
| `GET /api/praises` | `plugins/engagement/src/engagement.controllers.ts:121` | 无鉴权 | teacher（本班）/student（本班）/parent（孩子） | `P1`｜表扬内容+学生姓名；按 classId 任意读取。 |
| `GET /api/praises/student/:id` | `plugins/engagement/src/engagement.controllers.ts:132` | 无鉴权 | student（本人）/parent（孩子）/teacher（本班） | `P1`｜匿名可读任意学生全部表扬。 |
| `POST /api/praises` | `plugins/engagement/src/engagement.controllers.ts:141` | 无鉴权 | teacher | `P2`｜匿名可冒名写表扬并联动宠物经验（teacher_id 应取自 actor）。 |
| `DELETE /api/praises/:id` | `plugins/engagement/src/engagement.controllers.ts:156` | 无鉴权 | teacher（作者）/admin | `P2`｜匿名可删任意表扬。 |
| `GET /api/certificates` | `plugins/engagement/src/engagement.controllers.ts:171` | 无鉴权 | teacher（本班）/student（本人）/parent（孩子） | `P1`｜证书含学生姓名与奖项；studentId 为可省略的 query，匿名可全量拉取。 |
| `POST /api/certificates` | `plugins/engagement/src/engagement.controllers.ts:180` | 无鉴权 | teacher/admin | `P2`｜匿名可发证书。 |
| `GET /api/redemption/my` | `plugins/engagement/src/engagement.controllers.ts:200` | 无鉴权 | student（本人，actor 派生） | `P1`｜兑换券＝资产；当前 studentId 来自 query，匿名可枚举任意学生券码。 |
| `POST /api/redemption/verify` | `plugins/engagement/src/engagement.controllers.ts:209` | 无鉴权 | teacher/admin | `P1`｜核销写操作：匿名可核销已知券码，且该 handler 用 @Res() 绕过全局过滤器。 |
| `GET /api/messages` | `plugins/engagement/src/engagement.controllers.ts:230` | 无鉴权 | teacher（本班）/student（本人）/parent（孩子） | `P1`｜树洞/家校消息正文，匿名可按 query 任意读取（含 sender_id 维度）。 |
| `POST /api/messages` | `plugins/engagement/src/engagement.controllers.ts:239` | 无鉴权 | student（本人，sender_id 由 actor 派生） | `P1`｜匿名可冒名发消息。 |
| `GET /api/family-tasks` | `plugins/engagement/src/engagement.controllers.ts:288` | 无鉴权 | parent（本人）/student（本人） | `P1`｜家庭任务含学生与家长 id；query 的 studentId/parentId 不可信，须与 actor 绑定。 |
| `POST /api/family-tasks` | `plugins/engagement/src/engagement.controllers.ts:301` | 无鉴权 | parent（本人） | `P1`｜匿名可创建家庭任务并关联任意学生（影响积分加成）。 |
| `PUT /api/family-tasks/:id` | `plugins/engagement/src/engagement.controllers.ts:317` | 无鉴权 | parent（本人）/teacher（本班） | `P1`｜匿名可改任意任务状态。 |
| `DELETE /api/family-tasks/:id` | `plugins/engagement/src/engagement.controllers.ts:330` | 无鉴权 | parent（本人）/admin | `P1`｜匿名可删任意任务。 |
| `GET /api/lucky-draw/config` | `plugins/engagement/src/engagement.controllers.ts:348` | 无鉴权 | teacher（本人）/admin | `P2`｜匿名可按 teacherId 读抽奖概率配置。 |
| `POST /api/lucky-draw/config` | `plugins/engagement/src/engagement.controllers.ts:358` | 无鉴权 | teacher（本人）/admin | `P2`｜匿名可篡改抽奖概率（9 项配置）。 |
| `POST /api/lucky-draw/draw` | `plugins/engagement/src/engagement.controllers.ts:374` | 无鉴权 | student（本人） | `P1`｜匿名可代任意学生抽奖（消耗积分+发奖），@Res() 绕过过滤器。 |
| `GET /api/danmaku` | `plugins/engagement/src/engagement.controllers.ts:395` | 无鉴权 | 登录用户（本班） | `P3`｜候选公开：大屏弹幕展示；但前端两个调用点都在登录后页面（TeacherBigscreenPage.tsx:156、StudentPetPage.tsx:227），若要匿名大屏需显式豁免并只读本班。 |
| `POST /api/danmaku` | `plugins/engagement/src/engagement.controllers.ts:406` | 无鉴权 | student（本人）/teacher（本班） | `P1`｜sender_name 取自 body，匿名可冒名任意身份发言（大屏可见）。 |
| `DELETE /api/danmaku/cleanup` | `plugins/engagement/src/engagement.controllers.ts:421` | 无鉴权 | teacher/admin | `P1`｜匿名可清空全班弹幕历史。 |

### `plugins/collaboration/src/collaboration.controllers.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `GET /api/task-tree/teacher/:classId` | `plugins/collaboration/src/collaboration.controllers.ts:41` | 无鉴权 | teacher（本班）/admin | `P2`｜匿名可读任意班级任务树。 |
| `POST /api/task-tree/teacher` | `plugins/collaboration/src/collaboration.controllers.ts:46` | 无鉴权 | teacher（本班）/student（本人） | `P2`｜写接口整族无鉴权（collaboration.controllers.ts 全文 0 处 actor 调用）。 |
| `PUT /api/task-tree/teacher/:id` | `plugins/collaboration/src/collaboration.controllers.ts:51` | 无鉴权 | teacher（本班）/student（本人） | `P2`｜写接口整族无鉴权（collaboration.controllers.ts 全文 0 处 actor 调用）。 |
| `DELETE /api/task-tree/teacher/:id` | `plugins/collaboration/src/collaboration.controllers.ts:57` | 无鉴权 | teacher（本班）/student（本人） | `P2`｜写接口整族无鉴权（collaboration.controllers.ts 全文 0 处 actor 调用）。 |
| `GET /api/task-tree/student/:studentId` | `plugins/collaboration/src/collaboration.controllers.ts:63` | 无鉴权 | student（本人）/parent（孩子）/teacher（本班） | `P2`｜匿名可读任意学生任务树。 |
| `POST /api/task-tree/student/:studentId/complete/:nodeId` | `plugins/collaboration/src/collaboration.controllers.ts:68` | 无鉴权 | teacher（本班）/student（本人） | `P2`｜写接口整族无鉴权（collaboration.controllers.ts 全文 0 处 actor 调用）。 |
| `GET /api/team-quests` | `plugins/collaboration/src/collaboration.controllers.ts:79` | 无鉴权 | teacher（本班）/student（本班） | `P2`｜匿名可按 query 读任意班级/小组进度。 |
| `POST /api/team-quests` | `plugins/collaboration/src/collaboration.controllers.ts:84` | 无鉴权 | teacher（本班）/student（本人） | `P2`｜匿名可建/改/删团队任务与进度。 |
| `PUT /api/team-quests/:id` | `plugins/collaboration/src/collaboration.controllers.ts:89` | 无鉴权 | teacher（本班）/student（本人） | `P2`｜匿名可建/改/删团队任务与进度。 |
| `DELETE /api/team-quests/:id` | `plugins/collaboration/src/collaboration.controllers.ts:95` | 无鉴权 | teacher（本班）/student（本人） | `P2`｜匿名可建/改/删团队任务与进度。 |
| `GET /api/team-quests/progress/groups` | `plugins/collaboration/src/collaboration.controllers.ts:101` | 无鉴权 | teacher（本班）/student（本班） | `P2`｜匿名可按 query 读任意班级/小组进度。 |
| `GET /api/team-quests/student/current` | `plugins/collaboration/src/collaboration.controllers.ts:106` | 无鉴权 | teacher（本班）/student（本班） | `P2`｜匿名可按 query 读任意班级/小组进度。 |
| `GET /api/team-quests/progress` | `plugins/collaboration/src/collaboration.controllers.ts:111` | 无鉴权 | teacher（本班）/student（本班） | `P2`｜匿名可按 query 读任意班级/小组进度。 |
| `POST /api/team-quests/progress` | `plugins/collaboration/src/collaboration.controllers.ts:116` | 无鉴权 | teacher（本班）/student（本人） | `P2`｜匿名可建/改/删团队任务与进度。 |
| `GET /api/peer-reviews` | `plugins/collaboration/src/collaboration.controllers.ts:126` | 无鉴权 | teacher（本班）/student（本人相关） | `P2`｜匿名可按 query 读互评记录。 |
| `POST /api/peer-reviews` | `plugins/collaboration/src/collaboration.controllers.ts:131` | 无鉴权 | student（本人） | `P2`｜匿名可代任意学生提交互评。 |

### `plugins/battles/src/battles.controllers.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `GET /api/battles/classes/search` | `plugins/battles/src/battles.controllers.ts:44` | 无鉴权 | teacher/admin | `P2`｜匿名可枚举全部班级（名称/教师），是 PII 的面状泄漏入口。 |
| `GET /api/battles/teacher/:classId` | `plugins/battles/src/battles.controllers.ts:50` | 无鉴权 | teacher（本班）/student（本班） | `P2`｜匿名可读任意班级对战列表。 |
| `POST /api/battles/teacher/initiate` | `plugins/battles/src/battles.controllers.ts:55` | 无鉴权 | teacher（发起/参与班级的教师） | `P2`｜整族写接口无鉴权：匿名可发起、接受、结束任意班级对战（battles.controllers.ts 全文 0 处 actor 调用）。 |
| `PUT /api/battles/teacher/accept/:battleId` | `plugins/battles/src/battles.controllers.ts:60` | 无鉴权 | teacher（发起/参与班级的教师） | `P2`｜整族写接口无鉴权：匿名可发起、接受、结束任意班级对战（battles.controllers.ts 全文 0 处 actor 调用）。 |
| `PUT /api/battles/teacher/reject/:battleId` | `plugins/battles/src/battles.controllers.ts:66` | 无鉴权 | teacher（发起/参与班级的教师） | `P2`｜整族写接口无鉴权：匿名可发起、接受、结束任意班级对战（battles.controllers.ts 全文 0 处 actor 调用）。 |
| `PUT /api/battles/teacher/end/:battleId` | `plugins/battles/src/battles.controllers.ts:72` | 无鉴权 | teacher（发起/参与班级的教师） | `P2`｜整族写接口无鉴权：匿名可发起、接受、结束任意班级对战（battles.controllers.ts 全文 0 处 actor 调用）。 |
| `GET /api/battles/stats/:battleId` | `plugins/battles/src/battles.controllers.ts:78` | 无鉴权 | teacher/student（参与班级）/admin | `P2`｜匿名可读任意对战统计（含学生名次）。 |
| `GET /api/battles/classes/:classId` | `plugins/battles/src/battles.controllers.ts:83` | 无鉴权 | teacher（本班）/student（本班） | `P2`｜匿名可读任意班级对战列表。 |
| `GET /api/battles/:battleId/stats` | `plugins/battles/src/battles.controllers.ts:89` | 无鉴权 | teacher/student（参与班级）/admin | `P2`｜匿名可读任意对战统计（含学生名次）。 |
| `POST /api/battles` | `plugins/battles/src/battles.controllers.ts:95` | 无鉴权 | teacher（发起/参与班级的教师） | `P2`｜整族写接口无鉴权：匿名可发起、接受、结束任意班级对战（battles.controllers.ts 全文 0 处 actor 调用）。 |
| `PUT /api/battles/:battleId/accept` | `plugins/battles/src/battles.controllers.ts:101` | 无鉴权 | teacher（发起/参与班级的教师） | `P2`｜整族写接口无鉴权：匿名可发起、接受、结束任意班级对战（battles.controllers.ts 全文 0 处 actor 调用）。 |
| `PUT /api/battles/:battleId/reject` | `plugins/battles/src/battles.controllers.ts:106` | 无鉴权 | teacher（发起/参与班级的教师） | `P2`｜整族写接口无鉴权：匿名可发起、接受、结束任意班级对战（battles.controllers.ts 全文 0 处 actor 调用）。 |
| `PUT /api/battles/:battleId/end` | `plugins/battles/src/battles.controllers.ts:111` | 无鉴权 | teacher（发起/参与班级的教师） | `P2`｜整族写接口无鉴权：匿名可发起、接受、结束任意班级对战（battles.controllers.ts 全文 0 处 actor 调用）。 |

### `plugins/challenge/src/challenge.controllers.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `GET /api/challenge/questions` | `plugins/challenge/src/challenge.controllers.ts:63` | 半受控 | teacher/admin（全部）；student（本班开关开启时） | `P2`｜仅当 actor.role==="student" 才校验班级开关（challenge.controllers.ts:65-68）；匿名与其它角色直接放行题库。 |
| `POST /api/challenge/submit` | `plugins/challenge/src/challenge.controllers.ts:72` | 无鉴权 | teacher/admin（出题/删题）；student（本人作答、本班 Boss） | `P2`｜匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `GET /api/challenge/boss/active/:classId` | `plugins/challenge/src/challenge.controllers.ts:77` | 无鉴权 | teacher/admin（出题/删题）；student（本人作答、本班 Boss） | `P2`｜匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `POST /api/challenge/boss/:id/attack` | `plugins/challenge/src/challenge.controllers.ts:82` | 无鉴权 | teacher/admin（出题/删题）；student（本人作答、本班 Boss） | `P2`｜匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `GET /api/challenge/boss` | `plugins/challenge/src/challenge.controllers.ts:87` | 无鉴权 | teacher/admin（出题/删题）；student（本人作答、本班 Boss） | `P2`｜匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `POST /api/challenge/boss` | `plugins/challenge/src/challenge.controllers.ts:92` | 无鉴权 | teacher/admin（出题/删题）；student（本人作答、本班 Boss） | `P2`｜匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `DELETE /api/challenge/boss/:id` | `plugins/challenge/src/challenge.controllers.ts:97` | 无鉴权 | teacher/admin（出题/删题）；student（本人作答、本班 Boss） | `P2`｜匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `GET /api/challenge/students/:studentId/questions` | `plugins/challenge/src/challenge.controllers.ts:103` | 无鉴权 | teacher/admin（出题/删题）；student（本人作答、本班 Boss） | `P2`｜匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `POST /api/challenge/students/:studentId/submissions` | `plugins/challenge/src/challenge.controllers.ts:109` | 无鉴权 | teacher/admin（出题/删题）；student（本人作答、本班 Boss） | `P2`｜匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `GET /api/challenge/classes/:classId/bosses/active` | `plugins/challenge/src/challenge.controllers.ts:115` | 无鉴权 | teacher/admin（出题/删题）；student（本人作答、本班 Boss） | `P2`｜匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `GET /api/challenge/bosses` | `plugins/challenge/src/challenge.controllers.ts:121` | 无鉴权 | teacher/admin（出题/删题）；student（本人作答、本班 Boss） | `P2`｜匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `POST /api/challenge/bosses` | `plugins/challenge/src/challenge.controllers.ts:127` | 无鉴权 | teacher/admin（出题/删题）；student（本人作答、本班 Boss） | `P2`｜匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `DELETE /api/challenge/bosses/:id` | `plugins/challenge/src/challenge.controllers.ts:132` | 无鉴权 | teacher/admin（出题/删题）；student（本人作答、本班 Boss） | `P2`｜匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `POST /api/challenge/bosses/:id/attacks` | `plugins/challenge/src/challenge.controllers.ts:137` | 无鉴权 | teacher/admin（出题/删题）；student（本人作答、本班 Boss） | `P2`｜匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |

### `plugins/dungeon/src/dungeon.controllers.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `GET /api/dungeon/students/:studentId/run` | `plugins/dungeon/src/dungeon.controllers.ts:41` | 无鉴权 | student（本人）/teacher（本班，只读） | `P2`｜整族无鉴权：匿名可开始/推进/放弃任意学生的副本并结算奖励。 |
| `POST /api/dungeon/students/:studentId/start` | `plugins/dungeon/src/dungeon.controllers.ts:47` | 无鉴权 | student（本人）/teacher（本班，只读） | `P2`｜整族无鉴权：匿名可开始/推进/放弃任意学生的副本并结算奖励。 |
| `POST /api/dungeon/students/:studentId/choices` | `plugins/dungeon/src/dungeon.controllers.ts:53` | 无鉴权 | student（本人）/teacher（本班，只读） | `P2`｜整族无鉴权：匿名可开始/推进/放弃任意学生的副本并结算奖励。 |
| `POST /api/dungeon/students/:studentId/abandon` | `plugins/dungeon/src/dungeon.controllers.ts:59` | 无鉴权 | student（本人）/teacher（本班，只读） | `P2`｜整族无鉴权：匿名可开始/推进/放弃任意学生的副本并结算奖励。 |
| `GET /api/dungeon/:studentId` | `plugins/dungeon/src/dungeon.controllers.ts:64` | 无鉴权 | student（本人）/teacher（本班，只读） | `P2`｜整族无鉴权：匿名可开始/推进/放弃任意学生的副本并结算奖励。 |
| `POST /api/dungeon/start/:studentId` | `plugins/dungeon/src/dungeon.controllers.ts:70` | 无鉴权 | student（本人）/teacher（本班，只读） | `P2`｜整族无鉴权：匿名可开始/推进/放弃任意学生的副本并结算奖励。 |
| `POST /api/dungeon/choice/:studentId` | `plugins/dungeon/src/dungeon.controllers.ts:76` | 无鉴权 | student（本人）/teacher（本班，只读） | `P2`｜整族无鉴权：匿名可开始/推进/放弃任意学生的副本并结算奖励。 |
| `POST /api/dungeon/abandon/:studentId` | `plugins/dungeon/src/dungeon.controllers.ts:82` | 无鉴权 | student（本人）/teacher（本班，只读） | `P2`｜整族无鉴权：匿名可开始/推进/放弃任意学生的副本并结算奖励。 |

### `plugins/economy/src/economy.controllers.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `POST /api/economy/bank/trigger-interest` | `plugins/economy/src/economy.controllers.ts:37` | 无鉴权 | admin/superadmin（或系统定时任务） | `P2`｜匿名可触发全班利息结算（批量改余额）。 |
| `GET /api/economy/bank/:studentId` | `plugins/economy/src/economy.controllers.ts:43` | 无鉴权 | student（本人）/parent（孩子）/teacher（本班） | `P1`｜余额与持仓属资产/行为数据；须按 actor 过滤，不能只靠 URL 里的 studentId。 |
| `POST /api/economy/bank/deposit/:studentId` | `plugins/economy/src/economy.controllers.ts:48` | 无鉴权 | student（本人） | `P1`｜旧别名族，同上。 |
| `POST /api/economy/bank/withdraw/:studentId` | `plugins/economy/src/economy.controllers.ts:54` | 无鉴权 | student（本人） | `P1`｜旧别名族，同上。 |
| `GET /api/economy/stocks/:classId` | `plugins/economy/src/economy.controllers.ts:60` | 无鉴权 | teacher（本班）/student（本班） | `P2`｜匿名可读任意班级股票盘面。 |
| `GET /api/economy/portfolio/:studentId` | `plugins/economy/src/economy.controllers.ts:65` | 无鉴权 | student（本人）/parent（孩子）/teacher（本班） | `P1`｜余额与持仓属资产/行为数据；须按 actor 过滤，不能只靠 URL 里的 studentId。 |
| `POST /api/economy/stocks/buy/:studentId` | `plugins/economy/src/economy.controllers.ts:70` | 无鉴权 | student（本人） | `P1`｜旧别名族，同上。 |
| `POST /api/economy/stocks/sell/:studentId` | `plugins/economy/src/economy.controllers.ts:76` | 无鉴权 | student（本人） | `P1`｜旧别名族，同上。 |
| `GET /api/economy/students/:studentId/overview` | `plugins/economy/src/economy.controllers.ts:82` | 无鉴权 | student（本人）/parent（孩子）/teacher（本班） | `P1`｜余额与持仓属资产/行为数据；须按 actor 过滤，不能只靠 URL 里的 studentId。 |
| `GET /api/economy/students/:studentId/bank` | `plugins/economy/src/economy.controllers.ts:87` | 无鉴权 | student（本人）/parent（孩子）/teacher（本班） | `P1`｜余额与持仓属资产/行为数据；须按 actor 过滤，不能只靠 URL 里的 studentId。 |
| `POST /api/economy/students/:studentId/bank/deposits` | `plugins/economy/src/economy.controllers.ts:93` | 无鉴权 | student（本人） | `P1`｜整族资产写接口：匿名可以任意 studentId 存取/买卖。 |
| `POST /api/economy/students/:studentId/bank/withdrawals` | `plugins/economy/src/economy.controllers.ts:98` | 无鉴权 | student（本人） | `P1`｜整族资产写接口：匿名可以任意 studentId 存取/买卖。 |
| `GET /api/economy/classes/:classId/stocks` | `plugins/economy/src/economy.controllers.ts:103` | 无鉴权 | teacher（本班）/student（本班） | `P2`｜匿名可读任意班级股票盘面。 |
| `GET /api/economy/students/:studentId/portfolio` | `plugins/economy/src/economy.controllers.ts:109` | 无鉴权 | student（本人）/parent（孩子）/teacher（本班） | `P1`｜余额与持仓属资产/行为数据；须按 actor 过滤，不能只靠 URL 里的 studentId。 |
| `POST /api/economy/students/:studentId/stocks/buy` | `plugins/economy/src/economy.controllers.ts:115` | 无鉴权 | student（本人） | `P1`｜整族资产写接口：匿名可以任意 studentId 存取/买卖。 |
| `POST /api/economy/students/:studentId/stocks/sell` | `plugins/economy/src/economy.controllers.ts:120` | 无鉴权 | student（本人） | `P1`｜整族资产写接口：匿名可以任意 studentId 存取/买卖。 |
| `POST /api/economy/bank/interest` | `plugins/economy/src/economy.controllers.ts:125` | 无鉴权 | admin/superadmin（或系统定时任务） | `P2`｜匿名可触发全班利息结算（批量改余额）。 |
| `POST /api/economy/teacher/stocks` | `plugins/economy/src/economy.controllers.ts:130` | 无鉴权 | teacher（本人）/admin | `P2`｜匿名可增删改股票标的。 |
| `PUT /api/economy/teacher/stocks/:id` | `plugins/economy/src/economy.controllers.ts:135` | 无鉴权 | teacher（本人）/admin | `P2`｜匿名可增删改股票标的。 |
| `DELETE /api/economy/teacher/stocks/:id` | `plugins/economy/src/economy.controllers.ts:140` | 无鉴权 | teacher（本人）/admin | `P2`｜匿名可增删改股票标的。 |

### `plugins/gacha/src/gacha.controllers.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `GET /api/gacha/dictionary` | `plugins/gacha/src/gacha.controllers.ts:46` | 无鉴权 | 任何人（图鉴为公开内容）或登录用户 | `P3`｜宠物图鉴，无用户数据；建议至少要求登录或明确列为公开。 |
| `POST /api/gacha/dictionary` | `plugins/gacha/src/gacha.controllers.ts:52` | 无鉴权 | teacher/admin | `P2`｜匿名可新增图鉴条目（影响全站抽奖池）。 |
| `GET /api/gacha/pools/:classId` | `plugins/gacha/src/gacha.controllers.ts:57` | 无鉴权 | teacher（本班）/student（本班） | `P2`｜匿名可读任意班级抽奖池（含概率）。 |
| `POST /api/gacha/draw/:studentId` | `plugins/gacha/src/gacha.controllers.ts:62` | 无鉴权 | student（本人） | `P1`｜匿名可代任意学生抽卡（消耗积分、产出收藏）。 |
| `GET /api/gacha/collection/:studentId` | `plugins/gacha/src/gacha.controllers.ts:67` | 无鉴权 | student（本人）/parent（孩子）/teacher（本班） | `P2`｜匿名可读任意学生收藏。 |
| `PUT /api/gacha/active/:studentId/:instanceId` | `plugins/gacha/src/gacha.controllers.ts:72` | 无鉴权 | student（本人） | `P2`｜匿名可改任意学生的出战宠物。 |
| `GET /api/gacha/classes/:classId/pools` | `plugins/gacha/src/gacha.controllers.ts:78` | 无鉴权 | teacher（本班）/student（本班） | `P2`｜匿名可读任意班级抽奖池（含概率）。 |
| `POST /api/gacha/students/:studentId/draws` | `plugins/gacha/src/gacha.controllers.ts:84` | 无鉴权 | student（本人） | `P1`｜匿名可代任意学生抽卡（消耗积分、产出收藏）。 |
| `GET /api/gacha/students/:studentId/collection` | `plugins/gacha/src/gacha.controllers.ts:90` | 无鉴权 | student（本人）/parent（孩子）/teacher（本班） | `P2`｜匿名可读任意学生收藏。 |
| `PUT /api/gacha/students/:studentId/active-pet/:instanceId` | `plugins/gacha/src/gacha.controllers.ts:96` | 无鉴权 | student（本人） | `P2`｜匿名可改任意学生的出战宠物。 |

### `plugins/marketplace/src/marketplace.controllers.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `GET /api/shop/items` | `plugins/marketplace/src/marketplace.controllers.ts:47` | 无鉴权 | student（本人）/teacher（本班）/admin | `P2`｜匿名无 studentId 时返回全部上架商品（含价格/库存/教师）。 |
| `GET /api/shop/all` | `plugins/marketplace/src/marketplace.controllers.ts:53` | 无鉴权 | teacher/admin | `P2`｜管理视角全量商品（含下架），匿名可按 teacherId 任意读取。 |
| `POST /api/shop` | `plugins/marketplace/src/marketplace.controllers.ts:58` | 无鉴权 | teacher/admin | `P2`｜匿名可建商品（teacher_id 缺省时挂到库中第一个教师）。 |
| `PUT /api/shop/:id/status` | `plugins/marketplace/src/marketplace.controllers.ts:64` | 无鉴权 | teacher（商品归属者）/admin | `P2`｜匿名可上下架任意商品。 |
| `PUT /api/shop/:id` | `plugins/marketplace/src/marketplace.controllers.ts:70` | 无鉴权 | teacher（商品归属者）/admin | `P2`｜匿名可改任意商品。 |
| `POST /api/shop/buy` | `plugins/marketplace/src/marketplace.controllers.ts:76` | 无鉴权 | student（本人） | `P1`｜消费写操作：匿名可用 body 里的 studentId 花别人积分（金额由服务端核算，但仍可刷单/清空库存）。 |
| `GET /api/shop/auctions` | `plugins/marketplace/src/marketplace.controllers.ts:82` | 无鉴权 | student/teacher（本班） | `P2`｜匿名可读全部拍卖。 |
| `POST /api/shop/auctions/:id/bid` | `plugins/marketplace/src/marketplace.controllers.ts:88` | 无鉴权 | student（本人） | `P1`｜匿名可以任意 studentId 出价（资产操作）。 |
| `POST /api/shop/blind_box` | `plugins/marketplace/src/marketplace.controllers.ts:94` | 无鉴权 | student（本人） | `P1`｜匿名可代任意学生买盲盒（消费）。 |
| `POST /api/shop/auctions` | `plugins/marketplace/src/marketplace.controllers.ts:100` | 无鉴权 | teacher/admin | `P2`｜匿名可增删改拍卖/盲盒（含已结束记录）。 |
| `PUT /api/shop/auctions/:id` | `plugins/marketplace/src/marketplace.controllers.ts:106` | 无鉴权 | teacher/admin | `P2`｜匿名可改拍卖/盲盒。 |
| `DELETE /api/shop/auctions/:id` | `plugins/marketplace/src/marketplace.controllers.ts:112` | 无鉴权 | teacher/admin | `P2`｜匿名可删拍卖/盲盒。 |
| `GET /api/shop/blind_boxes` | `plugins/marketplace/src/marketplace.controllers.ts:118` | 无鉴权 | teacher/admin | `P2`｜匿名可增删改拍卖/盲盒（含已结束记录）。 |
| `POST /api/shop/blind_boxes` | `plugins/marketplace/src/marketplace.controllers.ts:124` | 无鉴权 | teacher/admin | `P2`｜匿名可增删改拍卖/盲盒（含已结束记录）。 |
| `PUT /api/shop/blind_boxes/:id` | `plugins/marketplace/src/marketplace.controllers.ts:130` | 无鉴权 | teacher/admin | `P2`｜匿名可改拍卖/盲盒。 |
| `DELETE /api/shop/blind_boxes/:id` | `plugins/marketplace/src/marketplace.controllers.ts:136` | 无鉴权 | teacher/admin | `P2`｜匿名可删拍卖/盲盒。 |

### `plugins/parent-buff/src/parentBuff.controller.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `POST /api/parent-buff` | `plugins/parent-buff/src/parentBuff.controller.ts:26` | 无鉴权 | parent（本人孩子）/teacher | `P1`｜写操作：匿名可伪造家长参与记录，触发 20% 积分加成（classroom.service.ts:430-438）。 |

### `plugins/payment/src/payment.controllers.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `POST /api/payment/create` | `plugins/payment/src/payment.controllers.ts:37` | 受控：无 actor 即 403 | 已登录用户 | payment.controllers.ts:41。 |
| `GET /api/payment/status/:orderNo` | `plugins/payment/src/payment.controllers.ts:51` | 受控：无 actor 即 403 + 订单归属校验 | 订单本人 | payment.controllers.ts:54 + payment.service.ts:219。 |
| `POST /api/payment/notify` | `plugins/payment/src/payment.controllers.ts:60` | 公开（设计） | 任何人（渠道回调，签名校验） | 支付渠道服务器回调，无法携带用户会话；用 provider.verifyWebhookSignature 验签，失败 401。 |

### `plugins/pet/src/pet.controllers.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `GET /api/pet/students/:studentId` | `plugins/pet/src/pet.controllers.ts:71` | 无鉴权 | student（本人）/parent（孩子）/teacher（本班） | `P2`｜匿名可读任意学生宠物与同班同学宠物列表。 |
| `GET /api/pet/students/:studentId/dashboard` | `plugins/pet/src/pet.controllers.ts:77` | 无鉴权 | student（本人）/parent（孩子）/teacher（本班） | `P2`｜匿名可读任意学生宠物与同班同学宠物列表。 |
| `GET /api/pet/students/:studentId/classmates` | `plugins/pet/src/pet.controllers.ts:82` | 无鉴权 | student（本人）/parent（孩子）/teacher（本班） | `P2`｜匿名可读任意学生宠物与同班同学宠物列表。 |
| `POST /api/pet/students/:studentId/adoptions` | `plugins/pet/src/pet.controllers.ts:88` | 无鉴权 | student（本人）+ pet.adopt/pet.interact 权限 | `P1`｜与受控的 /adopt、/action 是同一 service 方法的双胞胎，却没有 actor/permission 门 —— 权限门可被别名绕过。 |
| `POST /api/pet/students/:studentId/actions` | `plugins/pet/src/pet.controllers.ts:95` | 无鉴权 | student（本人）+ pet.adopt/pet.interact 权限 | `P1`｜与受控的 /adopt、/action 是同一 service 方法的双胞胎，却没有 actor/permission 门 —— 权限门可被别名绕过。 |
| `PUT /api/pet/students/:studentId` | `plugins/pet/src/pet.controllers.ts:102` | 无鉴权 | teacher（本班）/admin | `P2`｜匿名可改任意学生的宠物属性。 |
| `GET /api/pet/classes/:classId` | `plugins/pet/src/pet.controllers.ts:108` | 无鉴权 | teacher（本班）/student（本班） | `P2`｜匿名可读任意班级宠物榜（学生姓名）。 |
| `GET /api/pet/classes/:classId/leaderboard` | `plugins/pet/src/pet.controllers.ts:114` | 无鉴权 | teacher（本班）/student（本班） | `P2`｜匿名可读任意班级宠物榜（学生姓名）。 |
| `POST /api/pet/battles` | `plugins/pet/src/pet.controllers.ts:120` | 无鉴权 | student（本人）/teacher | `P2`｜匿名可触发宠物对战并结算。 |
| `POST /api/pet/students/:studentId/adopt` | `plugins/pet/src/pet.controllers.ts:134` | 受控：actor + permission | student（本人）/teacher/admin | 插件自有别名：requireActor + permissions.require(pet.adopt/pet.interact)。 |
| `POST /api/pet/students/:studentId/action` | `plugins/pet/src/pet.controllers.ts:147` | 受控：actor + permission | student（本人）/teacher/admin | 插件自有别名：requireActor + permissions.require(pet.adopt/pet.interact)。 |
| `GET /api/pet/health` | `plugins/pet/src/pet.controllers.ts:160` | 公开（设计） | 任何人 | 只返回 plugin id/version。 |
| `GET /api/pets/admin/class/:classId` | `plugins/pet/src/pet.controllers.ts:170` | 无鉴权 | student（本人）/parent/teacher（本班） | `P2`｜旧别名族（parentDashboardApi 仍在调用）：与 /api/pet 对应路由同样无鉴权，修一处必须修两处。 |
| `GET /api/pets/classmates/:studentId` | `plugins/pet/src/pet.controllers.ts:175` | 无鉴权 | student（本人）/parent/teacher（本班） | `P2`｜旧别名族（parentDashboardApi 仍在调用）：与 /api/pet 对应路由同样无鉴权，修一处必须修两处。 |
| `POST /api/pets/battle` | `plugins/pet/src/pet.controllers.ts:180` | 无鉴权 | student（本人）+ pet.adopt/pet.interact 权限 | `P1`｜旧别名族：绕过插件权限门的第三条通路。 |
| `GET /api/pets/leaderboard/:classId` | `plugins/pet/src/pet.controllers.ts:186` | 无鉴权 | student（本人）/parent/teacher（本班） | `P2`｜旧别名族（parentDashboardApi 仍在调用）：与 /api/pet 对应路由同样无鉴权，修一处必须修两处。 |
| `POST /api/pets/adopt` | `plugins/pet/src/pet.controllers.ts:191` | 无鉴权 | student（本人）+ pet.adopt/pet.interact 权限 | `P1`｜旧别名族：绕过插件权限门的第三条通路。 |
| `POST /api/pets/interact` | `plugins/pet/src/pet.controllers.ts:202` | 无鉴权 | student（本人）+ pet.adopt/pet.interact 权限 | `P1`｜旧别名族：绕过插件权限门的第三条通路。 |
| `GET /api/pets/:studentId` | `plugins/pet/src/pet.controllers.ts:209` | 无鉴权 | student（本人）/parent/teacher（本班） | `P2`｜旧别名族（parentDashboardApi 仍在调用）：与 /api/pet 对应路由同样无鉴权，修一处必须修两处。 |
| `PUT /api/pets/:studentId` | `plugins/pet/src/pet.controllers.ts:215` | 无鉴权 | teacher（本班）/admin | `P2`｜匿名可改任意学生宠物。 |

### `plugins/portal/src/portal.controllers.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `GET /api/website/home` | `plugins/portal/src/portal.controllers.ts:30` | 公开（设计） | 任何人 | 门户站（公开路由 /、/news、/about）：HomePage.tsx:35、NewsPage.tsx:49/63 在登录前调用。 |
| `PUT /api/website/home` | `plugins/portal/src/portal.controllers.ts:35` | 无鉴权 | admin/superadmin | `P1`｜匿名可整站改首页内容（AdminWebsitePage 是唯一调用者）。 |
| `GET /api/website/articles` | `plugins/portal/src/portal.controllers.ts:41` | 公开（设计） | 任何人 | 门户站（公开路由 /、/news、/about）：HomePage.tsx:35、NewsPage.tsx:49/63 在登录前调用。 |
| `GET /api/website/articles/:id` | `plugins/portal/src/portal.controllers.ts:46` | 公开（设计） | 任何人 | 门户站（公开路由 /、/news、/about）：HomePage.tsx:35、NewsPage.tsx:49/63 在登录前调用。 |
| `POST /api/website/articles` | `plugins/portal/src/portal.controllers.ts:51` | 无鉴权 | admin/superadmin | `P1`｜匿名可发布文章（AdminArticlesPage）。 |
| `PUT /api/website/articles/:id` | `plugins/portal/src/portal.controllers.ts:57` | 无鉴权 | admin/superadmin | `P1`｜匿名可改任意文章。 |
| `DELETE /api/website/articles/:id` | `plugins/portal/src/portal.controllers.ts:63` | 无鉴权 | admin/superadmin | `P1`｜匿名可删任意文章。 |
| `POST /api/website/contact` | `plugins/portal/src/portal.controllers.ts:69` | 公开（设计） | 任何人（留言表单，建议限流） | `P3`｜ContactPage.tsx:40 匿名提交；无鉴权是产品要求，但应加频率限制/验证码防灌水。 |

### `plugins/slg/src/slg.controllers.ts`

| METHOD /path | 声明位置 | 鉴权现状（基线） | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `GET /api/slg/map/:classId` | `plugins/slg/src/slg.controllers.ts:43` | 无鉴权 | teacher（本班）/student（本班） | `P2`｜匿名可读任意班级地图与占领状态。 |
| `POST /api/slg/student/:studentId/contribute/:territoryId` | `plugins/slg/src/slg.controllers.ts:48` | 无鉴权 | student（本人） | `P1`｜旧别名，同上。 |
| `POST /api/slg/teacher` | `plugins/slg/src/slg.controllers.ts:58` | 无鉴权 | teacher（本班）/admin | `P1`｜匿名可建领地、结算全班产出（改变全班资源）。 |
| `POST /api/slg/teacher/yield/:classId` | `plugins/slg/src/slg.controllers.ts:65` | 无鉴权 | teacher（本班）/admin | `P1`｜匿名可建领地、结算全班产出（改变全班资源）。 |
| `GET /api/slg/classes/:classId/map` | `plugins/slg/src/slg.controllers.ts:71` | 无鉴权 | teacher（本班）/student（本班） | `P2`｜匿名可读任意班级地图与占领状态。 |
| `POST /api/slg/students/:studentId/territories/:territoryId/contributions` | `plugins/slg/src/slg.controllers.ts:77` | 无鉴权 | student（本人） | `P1`｜匿名可代任意学生贡献资源/结算奖励。 |
| `POST /api/slg/classes/:classId/territories` | `plugins/slg/src/slg.controllers.ts:86` | 无鉴权 | teacher（本班）/admin | `P1`｜匿名可建领地、结算全班产出（改变全班资源）。 |
| `POST /api/slg/classes/:classId/yield` | `plugins/slg/src/slg.controllers.ts:91` | 无鉴权 | teacher（本班）/admin | `P1`｜匿名可建领地、结算全班产出（改变全班资源）。 |

### `plugins/wechat/src/wechat.controllers.ts`（微信小程序接入，本轮新增）

| METHOD /path | 声明位置 | 鉴权现状 | 应属角色 | 备注 |
| --- | --- | --- | --- | --- |
| `POST /api/wechat/login` | `plugins/wechat/src/wechat.controllers.ts:52` | 公开（设计） | 任何人（小程序登录入口） | 收 `wx.login` 的一次性 code，服务端换 openid：已绑定直接签发会话，未绑定返回 10 分钟一次性 ticket。此时尚无会话，必须匿名可调；`tests/e2e/publicRoutes.json` 有对应豁免条目。 |
| `POST /api/wechat/bind` | `plugins/wechat/src/wechat.controllers.ts:62` | 公开（设计） | 任何人（小程序绑定入口） | 凭 ticket + 账号密码 + 角色完成绑定。ticket 一次性、只存 SHA-256 摘要、消费即失效（错误密码也作废，防止对同一 ticket 反复试密码）；凭据校验走 `identity.public.loginWithCredentials`。 |
| `GET /api/wechat/me` | `plugins/wechat/src/wechat.controllers.ts:72` | 受控：requireActor | 已登录（任意角色） | 只读调用者自己的绑定状态与登录载荷；匿名 401 `未登录或登录已过期`。 |
| `POST /api/wechat/unbind` | `plugins/wechat/src/wechat.controllers.ts:82` | 受控：requireActor | 已登录（任意角色） | 只删除调用者自己的绑定行（`WHERE user_id = actor.id`），并记 `WECHAT_UNBIND` 审计；不接受请求体里的任何 id。 |

## 2. 「故意公开」清单及依据

判定标准：能在**没有会话**的情况下被前端公开页面调用，或本身就是登录/回调入口，且不返回私有数据。

| 端点 | 为什么必须公开（依据） |
| --- | --- |
| `POST /api/auth/login` | 登录入口：`src/features/auth/api/authApi.ts:12`；公开路由 `/login`（`src/app/routing/routeTable.ts` flatRoutes）。 |
| `POST /api/auth/register` | 注册入口：`authApi.ts:23`；邀请码/学生绑定在服务端校验，教师注册另受 `allow_teacher_registration` 平台开关限制（`identity.service.ts:245`）。 |
| `POST /api/auth/activate` | 激活码入口：`authApi.ts:25`；公开路由 `/activate`。 |
| `POST /api/admin/session` | 管理员控制台登录：`authApi.ts:14 adminLogin`，在控制台登录页调用，此时尚无 token。 |
| `GET /api/classes/invite/:code`（含 `/api/class/invite/:code`） | 注册前验证邀请码：`LoginPage.tsx:60` → `authApi.verifyInviteCode` → `authApi.ts:30`。邀请码本身即凭据；`?role=parent` 会收窄返回的学生姓名列表。 |
| `GET /api/settings` | SPA 在任何身份前读取站点标题/图标/支付开关：`SiteSettingsBootstrap.tsx:7`（应用根）、`PrivateRoute.tsx:16`、`WebsiteIcon.tsx:30` —— 全部在登录判定之前。只有平台设置投影，无用户数据。 |
| `GET /api/health` | 存活探针：只返回版本、API 版本与插件计数，供部署/监控匿名探测。 |
| `GET /api/kernel/info` / `plugins` / `permissions` | 内核基础设施面（`kernelRoutes.ts` 头注释显式声明为公开）：info=版本/环境，plugins=公开插件描述符，permissions=权限目录，均无用户数据。`info` 暴露 `env` 与 `pluginDirs`，建议裁剪或限 admin（见 P3）。 |
| `POST /api/kernel/auth/logout` | 只撤销本次请求携带的 bearer token；无 token 时返回 `revoked:false`，无副作用。 |
| `GET /api/website/home` / `articles` / `articles/:id` | 门户站公开页面：`HomePage.tsx:35`（路由 `/`）、`NewsPage.tsx:49/63`（`/news`）、`AboutPage.tsx:23`。 |
| `POST /api/website/contact` | 留言表单：`ContactPage.tsx:40`（`/contact`）匿名提交；无鉴权是产品要求，但应加限流/验证码（P3）。 |
| `POST /api/payment/notify` | 支付渠道服务器回调，无法携带用户会话；由 `provider.verifyWebhookSignature` 验签，失败 401。 |
| `GET /api/pet/health` | 插件健康检查，只返回 plugin id/version。 |
| `GET /api/announcements/active` | 站点公告横幅文本；**证据较弱**：当前唯一调用点在登录后的 `CampusShell.tsx:105`（`AnnouncementBanner`）。若产品不需要匿名公告，可收紧为「登录可读」。 |
| `GET /api/danmaku`（仅读） | 课堂大屏弹幕展示的候选公开项；**证据较弱**：两个调用点都在登录后页面（`TeacherBigscreenPage.tsx:156`、`StudentPetPage.tsx:227`）。建议至少要求登录，或显式豁免且只允许本班。 |
| `GET /api/gacha/dictionary` | 宠物图鉴（静态内容，无用户数据）；当前无前端匿名调用点，列为「可公开候选」，需产品确认。 |
| `POST /api/wechat/login` | 微信小程序登录入口：`wx.login` 的一次性 code 此时还没有任何会话可带（`plugins/wechat/src/wechat.controllers.ts:52`）。返回的 openid 结果只体现为「已绑定 → 会话」或「未绑定 → ticket」，响应体里从不出现 openid。 |
| `POST /api/wechat/bind` | 小程序绑定入口：凭一次性 ticket + 账号密码换取会话（`wechat.controllers.ts:62`）。ticket 是不透明的 32 字节随机串、只存摘要、10 分钟过期、单次使用；密码错误同样作废 ticket，因此不能对同一 ticket 反复试密码。 |

**不建议**列入公开清单的相邻端点：`GET /api/classes/:id`（会带出 `invite_code`，等于把加入班级的凭据公开）、`GET /api/knowledge/*`（课程题库/图谱，建议登录可读）、`GET /api/battles/classes/search`（可枚举全部班级）。

## 3. 漏点名单

### 3.0 相对 Lead 已确认的 4 组，本轮新增定位了哪些

Lead 已实测确认的 17 条：`/api/system/*`（8）、`GET /api/audit-logs`、`GET /api/openapi/keys`、`GET /api/students`、`GET /api/students/:id`、`GET /api/students/records`、`GET /api/messages`、`GET /api/presets`、`GET /api/shop/items`、`GET /api/shop/all`。

其余 **201 条基线漏点**为本轮静态定位，分布如下（「其中已知」只统计上面 17 条）：

| 插件/文件 | 基线漏点 | 其中已知 | 本轮新增 | 新增部分的性质 |
| --- | --- | --- | --- | --- |
| `plugins/admin/src/admin.controllers.ts` | 8 | 2 | 6 | openapi 写接口（铸造/吊销 Key、校园 CRUD） |
| `plugins/system/src/system.controller.ts` | 8 | 8 | 0 | （已全部确认） |
| `plugins/classroom/src/classroom.controllers.ts` | 35 | 4 | 31 | 学生写的整族（batch-edit 重置密码、batch-points、gift、考勤、请假、班级设置、大屏、进步之星…） |
| `plugins/learning/src/learning.controllers.ts` | 3 | 0 | 3 | 知识点图谱读（3 条） |
| `plugins/assignments/src/assignments.controllers.ts` | 14 | 0 | 14 | 作业与考试全族，含成绩单读写 |
| `plugins/engagement/src/engagement.controllers.ts` | 23 | 1 | 22 | 表扬/证书/兑换券/家庭任务/抽奖/弹幕 全族（含写接口） |
| `plugins/collaboration/src/collaboration.controllers.ts` | 16 | 0 | 16 | 任务树/团队任务/互评 全族（16 条全部） |
| `plugins/battles/src/battles.controllers.ts` | 13 | 0 | 13 | 对战全族（13 条全部），含班级枚举 |
| `plugins/challenge/src/challenge.controllers.ts` | 14 | 0 | 14 | 题库读 + 出题/删题 + 以任意 studentId 提交 |
| `plugins/dungeon/src/dungeon.controllers.ts` | 8 | 0 | 8 | 副本全族（8 条全部） |
| `plugins/economy/src/economy.controllers.ts` | 20 | 0 | 20 | 银行/股票读写全族（20 条全部） |
| `plugins/gacha/src/gacha.controllers.ts` | 10 | 0 | 10 | 图鉴写 + 抽卡 + 收藏（10 条全部） |
| `plugins/marketplace/src/marketplace.controllers.ts` | 16 | 2 | 14 | shop 写侧与拍卖/盲盒全族（16 条全部） |
| `plugins/parent-buff/src/parentBuff.controller.ts` | 1 | 0 | 1 | 家长增益写（可伪造，触发积分加成） |
| `plugins/pet/src/pet.controllers.ts` | 17 | 0 | 17 | 宠物读写 + **绕过权限门的别名族**（/adoptions、/actions、/api/pets/*） |
| `plugins/portal/src/portal.controllers.ts` | 4 | 0 | 4 | 网站内容写（首页/文章 CRUD） |
| `plugins/slg/src/slg.controllers.ts` | 8 | 0 | 8 | 地图读 + 领地/产出结算（8 条全部） |

### 3.1 仍敞开（写入时刻，167 条）

按优先级分组，组内按端点名的字母序；同一行的建议角色见矩阵。

#### P0（0 条）

基线上的 P0 漏点已全部被并发修复关闭（见 3.2）。

#### P1（56 条）

| METHOD /path | 位置 | 现状 | 泄漏/影响 |
| --- | --- | --- | --- |
| `DELETE /api/danmaku/cleanup` | `plugins/engagement/src/engagement.controllers.ts:421` | 无鉴权 | 匿名可清空全班弹幕历史。 |
| `DELETE /api/exams/:id` | `plugins/assignments/src/assignments.controllers.ts:106` | 无鉴权 | 匿名可删考试。 |
| `DELETE /api/family-tasks/:id` | `plugins/engagement/src/engagement.controllers.ts:330` | 无鉴权 | 匿名可删任意任务。 |
| `DELETE /api/website/articles/:id` | `plugins/portal/src/portal.controllers.ts:63` | 无鉴权 | 匿名可删任意文章。 |
| `GET /api/certificates` | `plugins/engagement/src/engagement.controllers.ts:171` | 无鉴权 | 证书含学生姓名与奖项；studentId 为可省略的 query，匿名可全量拉取。 |
| `GET /api/economy/bank/:studentId` | `plugins/economy/src/economy.controllers.ts:43` | 无鉴权 | 余额与持仓属资产/行为数据；须按 actor 过滤，不能只靠 URL 里的 studentId。 |
| `GET /api/economy/portfolio/:studentId` | `plugins/economy/src/economy.controllers.ts:65` | 无鉴权 | 余额与持仓属资产/行为数据；须按 actor 过滤，不能只靠 URL 里的 studentId。 |
| `GET /api/economy/students/:studentId/bank` | `plugins/economy/src/economy.controllers.ts:87` | 无鉴权 | 余额与持仓属资产/行为数据；须按 actor 过滤，不能只靠 URL 里的 studentId。 |
| `GET /api/economy/students/:studentId/overview` | `plugins/economy/src/economy.controllers.ts:82` | 无鉴权 | 余额与持仓属资产/行为数据；须按 actor 过滤，不能只靠 URL 里的 studentId。 |
| `GET /api/economy/students/:studentId/portfolio` | `plugins/economy/src/economy.controllers.ts:109` | 无鉴权 | 余额与持仓属资产/行为数据；须按 actor 过滤，不能只靠 URL 里的 studentId。 |
| `GET /api/exams` | `plugins/assignments/src/assignments.controllers.ts:69` | 无鉴权 | 匿名可按 class_id 读任意班级考试。 |
| `GET /api/exams/:id/grades` | `plugins/assignments/src/assignments.controllers.ts:90` | 无鉴权 | 匿名可拉全班成绩单。 |
| `GET /api/exams/student-exams` | `plugins/assignments/src/assignments.controllers.ts:80` | 无鉴权 | 成绩属学生 PII；query 可任意指定学生，须按 actor 过滤结果集。 |
| `GET /api/family-tasks` | `plugins/engagement/src/engagement.controllers.ts:288` | 无鉴权 | 家庭任务含学生与家长 id；query 的 studentId/parentId 不可信，须与 actor 绑定。 |
| `GET /api/messages` | `plugins/engagement/src/engagement.controllers.ts:230` | 无鉴权 | 树洞/家校消息正文，匿名可按 query 任意读取（含 sender_id 维度）。 |
| `GET /api/praises` | `plugins/engagement/src/engagement.controllers.ts:121` | 无鉴权 | 表扬内容+学生姓名；按 classId 任意读取。 |
| `GET /api/praises/student/:id` | `plugins/engagement/src/engagement.controllers.ts:132` | 无鉴权 | 匿名可读任意学生全部表扬。 |
| `GET /api/redemption/my` | `plugins/engagement/src/engagement.controllers.ts:200` | 无鉴权 | 兑换券＝资产；当前 studentId 来自 query，匿名可枚举任意学生券码。 |
| `POST /api/danmaku` | `plugins/engagement/src/engagement.controllers.ts:406` | 无鉴权 | sender_name 取自 body，匿名可冒名任意身份发言（大屏可见）。 |
| `POST /api/economy/bank/deposit/:studentId` | `plugins/economy/src/economy.controllers.ts:48` | 无鉴权 | 旧别名族，同上。 |
| `POST /api/economy/bank/withdraw/:studentId` | `plugins/economy/src/economy.controllers.ts:54` | 无鉴权 | 旧别名族，同上。 |
| `POST /api/economy/stocks/buy/:studentId` | `plugins/economy/src/economy.controllers.ts:70` | 无鉴权 | 旧别名族，同上。 |
| `POST /api/economy/stocks/sell/:studentId` | `plugins/economy/src/economy.controllers.ts:76` | 无鉴权 | 旧别名族，同上。 |
| `POST /api/economy/students/:studentId/bank/deposits` | `plugins/economy/src/economy.controllers.ts:93` | 无鉴权 | 整族资产写接口：匿名可以任意 studentId 存取/买卖。 |
| `POST /api/economy/students/:studentId/bank/withdrawals` | `plugins/economy/src/economy.controllers.ts:98` | 无鉴权 | 整族资产写接口：匿名可以任意 studentId 存取/买卖。 |
| `POST /api/economy/students/:studentId/stocks/buy` | `plugins/economy/src/economy.controllers.ts:115` | 无鉴权 | 整族资产写接口：匿名可以任意 studentId 存取/买卖。 |
| `POST /api/economy/students/:studentId/stocks/sell` | `plugins/economy/src/economy.controllers.ts:120` | 无鉴权 | 整族资产写接口：匿名可以任意 studentId 存取/买卖。 |
| `POST /api/exams` | `plugins/assignments/src/assignments.controllers.ts:74` | 无鉴权 | 匿名可创建考试。 |
| `POST /api/family-tasks` | `plugins/engagement/src/engagement.controllers.ts:301` | 无鉴权 | 匿名可创建家庭任务并关联任意学生（影响积分加成）。 |
| `POST /api/gacha/draw/:studentId` | `plugins/gacha/src/gacha.controllers.ts:62` | 无鉴权 | 匿名可代任意学生抽卡（消耗积分、产出收藏）。 |
| `POST /api/gacha/students/:studentId/draws` | `plugins/gacha/src/gacha.controllers.ts:84` | 无鉴权 | 匿名可代任意学生抽卡（消耗积分、产出收藏）。 |
| `POST /api/lucky-draw/draw` | `plugins/engagement/src/engagement.controllers.ts:374` | 无鉴权 | 匿名可代任意学生抽奖（消耗积分+发奖），@Res() 绕过过滤器。 |
| `POST /api/messages` | `plugins/engagement/src/engagement.controllers.ts:239` | 无鉴权 | 匿名可冒名发消息。 |
| `POST /api/parent-buff` | `plugins/parent-buff/src/parentBuff.controller.ts:26` | 无鉴权 | 写操作：匿名可伪造家长参与记录，触发 20% 积分加成（classroom.service.ts:430-438）。 |
| `POST /api/pet/students/:studentId/actions` | `plugins/pet/src/pet.controllers.ts:95` | 无鉴权 | 与受控的 /adopt、/action 是同一 service 方法的双胞胎，却没有 actor/permission 门 —— 权限门可被别名绕过。 |
| `POST /api/pet/students/:studentId/adoptions` | `plugins/pet/src/pet.controllers.ts:88` | 无鉴权 | 与受控的 /adopt、/action 是同一 service 方法的双胞胎，却没有 actor/permission 门 —— 权限门可被别名绕过。 |
| `POST /api/pets/adopt` | `plugins/pet/src/pet.controllers.ts:191` | 无鉴权 | 旧别名族：绕过插件权限门的第三条通路。 |
| `POST /api/pets/battle` | `plugins/pet/src/pet.controllers.ts:180` | 无鉴权 | 旧别名族：绕过插件权限门的第三条通路。 |
| `POST /api/pets/interact` | `plugins/pet/src/pet.controllers.ts:202` | 无鉴权 | 旧别名族：绕过插件权限门的第三条通路。 |
| `POST /api/redemption/verify` | `plugins/engagement/src/engagement.controllers.ts:209` | 无鉴权 | 核销写操作：匿名可核销已知券码，且该 handler 用 @Res() 绕过全局过滤器。 |
| `POST /api/shop/auctions/:id/bid` | `plugins/marketplace/src/marketplace.controllers.ts:88` | 无鉴权 | 匿名可以任意 studentId 出价（资产操作）。 |
| `POST /api/shop/blind_box` | `plugins/marketplace/src/marketplace.controllers.ts:94` | 无鉴权 | 匿名可代任意学生买盲盒（消费）。 |
| `POST /api/shop/buy` | `plugins/marketplace/src/marketplace.controllers.ts:76` | 无鉴权 | 消费写操作：匿名可用 body 里的 studentId 花别人积分（金额由服务端核算，但仍可刷单/清空库存）。 |
| `POST /api/slg/classes/:classId/territories` | `plugins/slg/src/slg.controllers.ts:86` | 无鉴权 | 匿名可建领地、结算全班产出（改变全班资源）。 |
| `POST /api/slg/classes/:classId/yield` | `plugins/slg/src/slg.controllers.ts:91` | 无鉴权 | 匿名可建领地、结算全班产出（改变全班资源）。 |
| `POST /api/slg/student/:studentId/contribute/:territoryId` | `plugins/slg/src/slg.controllers.ts:48` | 无鉴权 | 旧别名，同上。 |
| `POST /api/slg/students/:studentId/territories/:territoryId/contributions` | `plugins/slg/src/slg.controllers.ts:77` | 无鉴权 | 匿名可代任意学生贡献资源/结算奖励。 |
| `POST /api/slg/teacher` | `plugins/slg/src/slg.controllers.ts:58` | 无鉴权 | 匿名可建领地、结算全班产出（改变全班资源）。 |
| `POST /api/slg/teacher/yield/:classId` | `plugins/slg/src/slg.controllers.ts:65` | 无鉴权 | 匿名可建领地、结算全班产出（改变全班资源）。 |
| `POST /api/website/articles` | `plugins/portal/src/portal.controllers.ts:51` | 无鉴权 | 匿名可发布文章（AdminArticlesPage）。 |
| `PUT /api/exams/:id` | `plugins/assignments/src/assignments.controllers.ts:101` | 无鉴权 | 匿名可改考试。 |
| `PUT /api/exams/:id/grades` | `plugins/assignments/src/assignments.controllers.ts:96` | 无鉴权 | 匿名可批量改写全班成绩。 |
| `PUT /api/exams/student-exams/:id` | `plugins/assignments/src/assignments.controllers.ts:85` | 无鉴权 | 匿名可改写任意学生成绩与评语。 |
| `PUT /api/family-tasks/:id` | `plugins/engagement/src/engagement.controllers.ts:317` | 无鉴权 | 匿名可改任意任务状态。 |
| `PUT /api/website/articles/:id` | `plugins/portal/src/portal.controllers.ts:57` | 无鉴权 | 匿名可改任意文章。 |
| `PUT /api/website/home` | `plugins/portal/src/portal.controllers.ts:35` | 无鉴权 | 匿名可整站改首页内容（AdminWebsitePage 是唯一调用者）。 |

#### P2（106 条）

| METHOD /path | 位置 | 现状 | 泄漏/影响 |
| --- | --- | --- | --- |
| `DELETE /api/assignments/:id` | `plugins/assignments/src/assignments.controllers.ts:59` | 无鉴权 | 匿名可删任意作业。 |
| `DELETE /api/challenge/boss/:id` | `plugins/challenge/src/challenge.controllers.ts:97` | 无鉴权 | 匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `DELETE /api/challenge/bosses/:id` | `plugins/challenge/src/challenge.controllers.ts:132` | 无鉴权 | 匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `DELETE /api/class-announcements/:id` | `plugins/engagement/src/engagement.controllers.ts:106` | 无鉴权 | 匿名可删任意公告。 |
| `DELETE /api/economy/teacher/stocks/:id` | `plugins/economy/src/economy.controllers.ts:140` | 无鉴权 | 匿名可增删改股票标的。 |
| `DELETE /api/praises/:id` | `plugins/engagement/src/engagement.controllers.ts:156` | 无鉴权 | 匿名可删任意表扬。 |
| `DELETE /api/shop/auctions/:id` | `plugins/marketplace/src/marketplace.controllers.ts:112` | 无鉴权 | 匿名可删拍卖/盲盒。 |
| `DELETE /api/shop/blind_boxes/:id` | `plugins/marketplace/src/marketplace.controllers.ts:136` | 无鉴权 | 匿名可删拍卖/盲盒。 |
| `DELETE /api/task-tree/teacher/:id` | `plugins/collaboration/src/collaboration.controllers.ts:57` | 无鉴权 | 写接口整族无鉴权（collaboration.controllers.ts 全文 0 处 actor 调用）。 |
| `DELETE /api/team-quests/:id` | `plugins/collaboration/src/collaboration.controllers.ts:95` | 无鉴权 | 匿名可建/改/删团队任务与进度。 |
| `GET /api/assignments` | `plugins/assignments/src/assignments.controllers.ts:33` | 无鉴权 | 按 class_id 查询任意班级作业；须按 actor 所属班级过滤结果集，而非仅拒匿名。 |
| `GET /api/assignments/student-assignments` | `plugins/assignments/src/assignments.controllers.ts:44` | 无鉴权 | query 里的 student_id/assignment_id 可任意指定，须与 actor 比对后再过滤。 |
| `GET /api/battles/:battleId/stats` | `plugins/battles/src/battles.controllers.ts:89` | 无鉴权 | 匿名可读任意对战统计（含学生名次）。 |
| `GET /api/battles/classes/:classId` | `plugins/battles/src/battles.controllers.ts:83` | 无鉴权 | 匿名可读任意班级对战列表。 |
| `GET /api/battles/classes/search` | `plugins/battles/src/battles.controllers.ts:44` | 无鉴权 | 匿名可枚举全部班级（名称/教师），是 PII 的面状泄漏入口。 |
| `GET /api/battles/stats/:battleId` | `plugins/battles/src/battles.controllers.ts:78` | 无鉴权 | 匿名可读任意对战统计（含学生名次）。 |
| `GET /api/battles/teacher/:classId` | `plugins/battles/src/battles.controllers.ts:50` | 无鉴权 | 匿名可读任意班级对战列表。 |
| `GET /api/challenge/boss` | `plugins/challenge/src/challenge.controllers.ts:87` | 无鉴权 | 匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `GET /api/challenge/boss/active/:classId` | `plugins/challenge/src/challenge.controllers.ts:77` | 无鉴权 | 匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `GET /api/challenge/bosses` | `plugins/challenge/src/challenge.controllers.ts:121` | 无鉴权 | 匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `GET /api/challenge/classes/:classId/bosses/active` | `plugins/challenge/src/challenge.controllers.ts:115` | 无鉴权 | 匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `GET /api/challenge/questions` | `plugins/challenge/src/challenge.controllers.ts:63` | 半受控 | 仅当 actor.role==="student" 才校验班级开关（challenge.controllers.ts:65-68）；匿名与其它角色直接放行题库。 |
| `GET /api/challenge/students/:studentId/questions` | `plugins/challenge/src/challenge.controllers.ts:103` | 无鉴权 | 匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `GET /api/class-announcements` | `plugins/engagement/src/engagement.controllers.ts:80` | 无鉴权 | 匿名可按 classId 读任意班级公告。 |
| `GET /api/dungeon/:studentId` | `plugins/dungeon/src/dungeon.controllers.ts:64` | 无鉴权 | 整族无鉴权：匿名可开始/推进/放弃任意学生的副本并结算奖励。 |
| `GET /api/dungeon/students/:studentId/run` | `plugins/dungeon/src/dungeon.controllers.ts:41` | 无鉴权 | 整族无鉴权：匿名可开始/推进/放弃任意学生的副本并结算奖励。 |
| `GET /api/economy/classes/:classId/stocks` | `plugins/economy/src/economy.controllers.ts:103` | 无鉴权 | 匿名可读任意班级股票盘面。 |
| `GET /api/economy/stocks/:classId` | `plugins/economy/src/economy.controllers.ts:60` | 无鉴权 | 匿名可读任意班级股票盘面。 |
| `GET /api/gacha/classes/:classId/pools` | `plugins/gacha/src/gacha.controllers.ts:78` | 无鉴权 | 匿名可读任意班级抽奖池（含概率）。 |
| `GET /api/gacha/collection/:studentId` | `plugins/gacha/src/gacha.controllers.ts:67` | 无鉴权 | 匿名可读任意学生收藏。 |
| `GET /api/gacha/pools/:classId` | `plugins/gacha/src/gacha.controllers.ts:57` | 无鉴权 | 匿名可读任意班级抽奖池（含概率）。 |
| `GET /api/gacha/students/:studentId/collection` | `plugins/gacha/src/gacha.controllers.ts:90` | 无鉴权 | 匿名可读任意学生收藏。 |
| `GET /api/lucky-draw/config` | `plugins/engagement/src/engagement.controllers.ts:348` | 无鉴权 | 匿名可按 teacherId 读抽奖概率配置。 |
| `GET /api/peer-reviews` | `plugins/collaboration/src/collaboration.controllers.ts:126` | 无鉴权 | 匿名可按 query 读互评记录。 |
| `GET /api/pet/classes/:classId` | `plugins/pet/src/pet.controllers.ts:108` | 无鉴权 | 匿名可读任意班级宠物榜（学生姓名）。 |
| `GET /api/pet/classes/:classId/leaderboard` | `plugins/pet/src/pet.controllers.ts:114` | 无鉴权 | 匿名可读任意班级宠物榜（学生姓名）。 |
| `GET /api/pet/students/:studentId` | `plugins/pet/src/pet.controllers.ts:71` | 无鉴权 | 匿名可读任意学生宠物与同班同学宠物列表。 |
| `GET /api/pet/students/:studentId/classmates` | `plugins/pet/src/pet.controllers.ts:82` | 无鉴权 | 匿名可读任意学生宠物与同班同学宠物列表。 |
| `GET /api/pet/students/:studentId/dashboard` | `plugins/pet/src/pet.controllers.ts:77` | 无鉴权 | 匿名可读任意学生宠物与同班同学宠物列表。 |
| `GET /api/pets/:studentId` | `plugins/pet/src/pet.controllers.ts:209` | 无鉴权 | 旧别名族（parentDashboardApi 仍在调用）：与 /api/pet 对应路由同样无鉴权，修一处必须修两处。 |
| `GET /api/pets/admin/class/:classId` | `plugins/pet/src/pet.controllers.ts:170` | 无鉴权 | 旧别名族（parentDashboardApi 仍在调用）：与 /api/pet 对应路由同样无鉴权，修一处必须修两处。 |
| `GET /api/pets/classmates/:studentId` | `plugins/pet/src/pet.controllers.ts:175` | 无鉴权 | 旧别名族（parentDashboardApi 仍在调用）：与 /api/pet 对应路由同样无鉴权，修一处必须修两处。 |
| `GET /api/pets/leaderboard/:classId` | `plugins/pet/src/pet.controllers.ts:186` | 无鉴权 | 旧别名族（parentDashboardApi 仍在调用）：与 /api/pet 对应路由同样无鉴权，修一处必须修两处。 |
| `GET /api/shop/all` | `plugins/marketplace/src/marketplace.controllers.ts:53` | 无鉴权 | 管理视角全量商品（含下架），匿名可按 teacherId 任意读取。 |
| `GET /api/shop/auctions` | `plugins/marketplace/src/marketplace.controllers.ts:82` | 无鉴权 | 匿名可读全部拍卖。 |
| `GET /api/shop/blind_boxes` | `plugins/marketplace/src/marketplace.controllers.ts:118` | 无鉴权 | 匿名可增删改拍卖/盲盒（含已结束记录）。 |
| `GET /api/shop/items` | `plugins/marketplace/src/marketplace.controllers.ts:47` | 无鉴权 | 匿名无 studentId 时返回全部上架商品（含价格/库存/教师）。 |
| `GET /api/slg/classes/:classId/map` | `plugins/slg/src/slg.controllers.ts:71` | 无鉴权 | 匿名可读任意班级地图与占领状态。 |
| `GET /api/slg/map/:classId` | `plugins/slg/src/slg.controllers.ts:43` | 无鉴权 | 匿名可读任意班级地图与占领状态。 |
| `GET /api/task-tree/student/:studentId` | `plugins/collaboration/src/collaboration.controllers.ts:63` | 无鉴权 | 匿名可读任意学生任务树。 |
| `GET /api/task-tree/teacher/:classId` | `plugins/collaboration/src/collaboration.controllers.ts:41` | 无鉴权 | 匿名可读任意班级任务树。 |
| `GET /api/team-quests` | `plugins/collaboration/src/collaboration.controllers.ts:79` | 无鉴权 | 匿名可按 query 读任意班级/小组进度。 |
| `GET /api/team-quests/progress` | `plugins/collaboration/src/collaboration.controllers.ts:111` | 无鉴权 | 匿名可按 query 读任意班级/小组进度。 |
| `GET /api/team-quests/progress/groups` | `plugins/collaboration/src/collaboration.controllers.ts:101` | 无鉴权 | 匿名可按 query 读任意班级/小组进度。 |
| `GET /api/team-quests/student/current` | `plugins/collaboration/src/collaboration.controllers.ts:106` | 无鉴权 | 匿名可按 query 读任意班级/小组进度。 |
| `POST /api/assignments` | `plugins/assignments/src/assignments.controllers.ts:38` | 无鉴权 | 匿名可给任意班级布置作业；teacher_id 应由 actor 派生。 |
| `POST /api/battles` | `plugins/battles/src/battles.controllers.ts:95` | 无鉴权 | 整族写接口无鉴权：匿名可发起、接受、结束任意班级对战（battles.controllers.ts 全文 0 处 actor 调用）。 |
| `POST /api/battles/teacher/initiate` | `plugins/battles/src/battles.controllers.ts:55` | 无鉴权 | 整族写接口无鉴权：匿名可发起、接受、结束任意班级对战（battles.controllers.ts 全文 0 处 actor 调用）。 |
| `POST /api/certificates` | `plugins/engagement/src/engagement.controllers.ts:180` | 无鉴权 | 匿名可发证书。 |
| `POST /api/challenge/boss` | `plugins/challenge/src/challenge.controllers.ts:92` | 无鉴权 | 匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `POST /api/challenge/boss/:id/attack` | `plugins/challenge/src/challenge.controllers.ts:82` | 无鉴权 | 匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `POST /api/challenge/bosses` | `plugins/challenge/src/challenge.controllers.ts:127` | 无鉴权 | 匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `POST /api/challenge/bosses/:id/attacks` | `plugins/challenge/src/challenge.controllers.ts:137` | 无鉴权 | 匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `POST /api/challenge/students/:studentId/submissions` | `plugins/challenge/src/challenge.controllers.ts:109` | 无鉴权 | 匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `POST /api/challenge/submit` | `plugins/challenge/src/challenge.controllers.ts:72` | 无鉴权 | 匿名可出题/删题、以任意 studentId 提交答案、攻击 Boss。 |
| `POST /api/class-announcements` | `plugins/engagement/src/engagement.controllers.ts:91` | 无鉴权 | 匿名可冒名发布班级公告（teacher_id 取自 body，应改为 actor 派生）。 |
| `POST /api/dungeon/abandon/:studentId` | `plugins/dungeon/src/dungeon.controllers.ts:82` | 无鉴权 | 整族无鉴权：匿名可开始/推进/放弃任意学生的副本并结算奖励。 |
| `POST /api/dungeon/choice/:studentId` | `plugins/dungeon/src/dungeon.controllers.ts:76` | 无鉴权 | 整族无鉴权：匿名可开始/推进/放弃任意学生的副本并结算奖励。 |
| `POST /api/dungeon/start/:studentId` | `plugins/dungeon/src/dungeon.controllers.ts:70` | 无鉴权 | 整族无鉴权：匿名可开始/推进/放弃任意学生的副本并结算奖励。 |
| `POST /api/dungeon/students/:studentId/abandon` | `plugins/dungeon/src/dungeon.controllers.ts:59` | 无鉴权 | 整族无鉴权：匿名可开始/推进/放弃任意学生的副本并结算奖励。 |
| `POST /api/dungeon/students/:studentId/choices` | `plugins/dungeon/src/dungeon.controllers.ts:53` | 无鉴权 | 整族无鉴权：匿名可开始/推进/放弃任意学生的副本并结算奖励。 |
| `POST /api/dungeon/students/:studentId/start` | `plugins/dungeon/src/dungeon.controllers.ts:47` | 无鉴权 | 整族无鉴权：匿名可开始/推进/放弃任意学生的副本并结算奖励。 |
| `POST /api/economy/bank/interest` | `plugins/economy/src/economy.controllers.ts:125` | 无鉴权 | 匿名可触发全班利息结算（批量改余额）。 |
| `POST /api/economy/bank/trigger-interest` | `plugins/economy/src/economy.controllers.ts:37` | 无鉴权 | 匿名可触发全班利息结算（批量改余额）。 |
| `POST /api/economy/teacher/stocks` | `plugins/economy/src/economy.controllers.ts:130` | 无鉴权 | 匿名可增删改股票标的。 |
| `POST /api/gacha/dictionary` | `plugins/gacha/src/gacha.controllers.ts:52` | 无鉴权 | 匿名可新增图鉴条目（影响全站抽奖池）。 |
| `POST /api/lucky-draw/config` | `plugins/engagement/src/engagement.controllers.ts:358` | 无鉴权 | 匿名可篡改抽奖概率（9 项配置）。 |
| `POST /api/peer-reviews` | `plugins/collaboration/src/collaboration.controllers.ts:131` | 无鉴权 | 匿名可代任意学生提交互评。 |
| `POST /api/pet/battles` | `plugins/pet/src/pet.controllers.ts:120` | 无鉴权 | 匿名可触发宠物对战并结算。 |
| `POST /api/praises` | `plugins/engagement/src/engagement.controllers.ts:141` | 无鉴权 | 匿名可冒名写表扬并联动宠物经验（teacher_id 应取自 actor）。 |
| `POST /api/shop` | `plugins/marketplace/src/marketplace.controllers.ts:58` | 无鉴权 | 匿名可建商品（teacher_id 缺省时挂到库中第一个教师）。 |
| `POST /api/shop/auctions` | `plugins/marketplace/src/marketplace.controllers.ts:100` | 无鉴权 | 匿名可增删改拍卖/盲盒（含已结束记录）。 |
| `POST /api/shop/blind_boxes` | `plugins/marketplace/src/marketplace.controllers.ts:124` | 无鉴权 | 匿名可增删改拍卖/盲盒（含已结束记录）。 |
| `POST /api/task-tree/student/:studentId/complete/:nodeId` | `plugins/collaboration/src/collaboration.controllers.ts:68` | 无鉴权 | 写接口整族无鉴权（collaboration.controllers.ts 全文 0 处 actor 调用）。 |
| `POST /api/task-tree/teacher` | `plugins/collaboration/src/collaboration.controllers.ts:46` | 无鉴权 | 写接口整族无鉴权（collaboration.controllers.ts 全文 0 处 actor 调用）。 |
| `POST /api/team-quests` | `plugins/collaboration/src/collaboration.controllers.ts:84` | 无鉴权 | 匿名可建/改/删团队任务与进度。 |
| `POST /api/team-quests/progress` | `plugins/collaboration/src/collaboration.controllers.ts:116` | 无鉴权 | 匿名可建/改/删团队任务与进度。 |
| `PUT /api/assignments/:id` | `plugins/assignments/src/assignments.controllers.ts:54` | 无鉴权 | 匿名可改任意作业。 |
| `PUT /api/assignments/student-assignments/:id` | `plugins/assignments/src/assignments.controllers.ts:49` | 无鉴权 | 匿名可改写学生作业提交状态/得分。 |
| `PUT /api/battles/:battleId/accept` | `plugins/battles/src/battles.controllers.ts:101` | 无鉴权 | 整族写接口无鉴权：匿名可发起、接受、结束任意班级对战（battles.controllers.ts 全文 0 处 actor 调用）。 |
| `PUT /api/battles/:battleId/end` | `plugins/battles/src/battles.controllers.ts:111` | 无鉴权 | 整族写接口无鉴权：匿名可发起、接受、结束任意班级对战（battles.controllers.ts 全文 0 处 actor 调用）。 |
| `PUT /api/battles/:battleId/reject` | `plugins/battles/src/battles.controllers.ts:106` | 无鉴权 | 整族写接口无鉴权：匿名可发起、接受、结束任意班级对战（battles.controllers.ts 全文 0 处 actor 调用）。 |
| `PUT /api/battles/teacher/accept/:battleId` | `plugins/battles/src/battles.controllers.ts:60` | 无鉴权 | 整族写接口无鉴权：匿名可发起、接受、结束任意班级对战（battles.controllers.ts 全文 0 处 actor 调用）。 |
| `PUT /api/battles/teacher/end/:battleId` | `plugins/battles/src/battles.controllers.ts:72` | 无鉴权 | 整族写接口无鉴权：匿名可发起、接受、结束任意班级对战（battles.controllers.ts 全文 0 处 actor 调用）。 |
| `PUT /api/battles/teacher/reject/:battleId` | `plugins/battles/src/battles.controllers.ts:66` | 无鉴权 | 整族写接口无鉴权：匿名可发起、接受、结束任意班级对战（battles.controllers.ts 全文 0 处 actor 调用）。 |
| `PUT /api/economy/teacher/stocks/:id` | `plugins/economy/src/economy.controllers.ts:135` | 无鉴权 | 匿名可增删改股票标的。 |
| `PUT /api/gacha/active/:studentId/:instanceId` | `plugins/gacha/src/gacha.controllers.ts:72` | 无鉴权 | 匿名可改任意学生的出战宠物。 |
| `PUT /api/gacha/students/:studentId/active-pet/:instanceId` | `plugins/gacha/src/gacha.controllers.ts:96` | 无鉴权 | 匿名可改任意学生的出战宠物。 |
| `PUT /api/pet/students/:studentId` | `plugins/pet/src/pet.controllers.ts:102` | 无鉴权 | 匿名可改任意学生的宠物属性。 |
| `PUT /api/pets/:studentId` | `plugins/pet/src/pet.controllers.ts:215` | 无鉴权 | 匿名可改任意学生宠物。 |
| `PUT /api/shop/:id` | `plugins/marketplace/src/marketplace.controllers.ts:70` | 无鉴权 | 匿名可改任意商品。 |
| `PUT /api/shop/:id/status` | `plugins/marketplace/src/marketplace.controllers.ts:64` | 无鉴权 | 匿名可上下架任意商品。 |
| `PUT /api/shop/auctions/:id` | `plugins/marketplace/src/marketplace.controllers.ts:106` | 无鉴权 | 匿名可改拍卖/盲盒。 |
| `PUT /api/shop/blind_boxes/:id` | `plugins/marketplace/src/marketplace.controllers.ts:130` | 无鉴权 | 匿名可改拍卖/盲盒。 |
| `PUT /api/task-tree/teacher/:id` | `plugins/collaboration/src/collaboration.controllers.ts:51` | 无鉴权 | 写接口整族无鉴权（collaboration.controllers.ts 全文 0 处 actor 调用）。 |
| `PUT /api/team-quests/:id` | `plugins/collaboration/src/collaboration.controllers.ts:89` | 无鉴权 | 匿名可建/改/删团队任务与进度。 |

#### P3（5 条）

| METHOD /path | 位置 | 现状 | 泄漏/影响 |
| --- | --- | --- | --- |
| `GET /api/danmaku` | `plugins/engagement/src/engagement.controllers.ts:395` | 无鉴权 | 候选公开：大屏弹幕展示；但前端两个调用点都在登录后页面（TeacherBigscreenPage.tsx:156、StudentPetPage.tsx:227），若要匿名大屏需显式豁免并只读本班。 |
| `GET /api/gacha/dictionary` | `plugins/gacha/src/gacha.controllers.ts:46` | 无鉴权 | 宠物图鉴，无用户数据；建议至少要求登录或明确列为公开。 |
| `GET /api/knowledge/edges` | `plugins/learning/src/learning.controllers.ts:190` | 无鉴权 | 知识点图谱＝课程内容，无用户数据；建议至少要求登录，避免被批量爬取。 |
| `GET /api/knowledge/nodes` | `plugins/learning/src/learning.controllers.ts:166` | 无鉴权 | 知识点图谱＝课程内容，无用户数据；建议至少要求登录，避免被批量爬取。 |
| `GET /api/knowledge/subjects` | `plugins/learning/src/learning.controllers.ts:155` | 无鉴权 | 知识点图谱＝课程内容，无用户数据；建议至少要求登录，避免被批量爬取。 |

### 3.2 基线漏点、但写入时刻已被并发修复关闭（51 条）

这些行在基线 `8e447d9` 上确实匿名可访问；侦察期间队友已加门。列在此处是为了让「基线漏点总数」自洽，避免误判为漏检。

| METHOD /path | 位置 | 新增的门 |
| --- | --- | --- |
| `DELETE /api/openapi/keys/:id` | `plugins/admin/src/admin.controllers.ts:289` | requireAdmin |
| `DELETE /api/openapi/schools/:id` | `plugins/admin/src/admin.controllers.ts:331` | requireAdmin |
| `DELETE /api/presets/:id` | `plugins/classroom/src/classroom.controllers.ts:361` | service(req) |
| `DELETE /api/system/questions/:id` | `plugins/system/src/system.controller.ts:50` | requireAdmin |
| `GET /api/attendance` | `plugins/classroom/src/classroom.controllers.ts:375` | service(req) |
| `GET /api/audit-logs` | `plugins/admin/src/admin.controllers.ts:347` | requireAdmin |
| `GET /api/class/:id` | `plugins/classroom/src/classroom.controllers.ts:258` | service(req) |
| `GET /api/class/:id/bigscreen` | `plugins/classroom/src/classroom.controllers.ts:276` | service(req) |
| `GET /api/class/:id/features` | `plugins/classroom/src/classroom.controllers.ts:267` | service(req) |
| `GET /api/class/:id/guild-ranking` | `plugins/classroom/src/classroom.controllers.ts:285` | service(req) |
| `GET /api/classes/:id` | `plugins/classroom/src/classroom.controllers.ts:258` | service(req) |
| `GET /api/classes/:id/bigscreen` | `plugins/classroom/src/classroom.controllers.ts:276` | service(req) |
| `GET /api/classes/:id/features` | `plugins/classroom/src/classroom.controllers.ts:267` | service(req) |
| `GET /api/classes/:id/guild-ranking` | `plugins/classroom/src/classroom.controllers.ts:285` | service(req) |
| `GET /api/leaves` | `plugins/classroom/src/classroom.controllers.ts:400` | service(req) |
| `GET /api/openapi/keys` | `plugins/admin/src/admin.controllers.ts:268` | requireAdmin |
| `GET /api/openapi/schools` | `plugins/admin/src/admin.controllers.ts:300` | requireAdmin |
| `GET /api/presets` | `plugins/classroom/src/classroom.controllers.ts:342` | service(req) |
| `GET /api/students` | `plugins/classroom/src/classroom.controllers.ts:53` | service(req) |
| `GET /api/students/:id` | `plugins/classroom/src/classroom.controllers.ts:140` | service(req) |
| `GET /api/students/:id/achievements` | `plugins/classroom/src/classroom.controllers.ts:197` | service(req) |
| `GET /api/students/:id/peer-reviews/pending` | `plugins/classroom/src/classroom.controllers.ts:206` | service(req) |
| `GET /api/students/progress-star` | `plugins/classroom/src/classroom.controllers.ts:71` | service(req) |
| `GET /api/students/records` | `plugins/classroom/src/classroom.controllers.ts:62` | service(req) |
| `GET /api/system/backup/export` | `plugins/system/src/system.controller.ts:77` | requireAdmin |
| `GET /api/system/logs` | `plugins/system/src/system.controller.ts:67` | requireAdmin |
| `GET /api/system/questions` | `plugins/system/src/system.controller.ts:34` | requireAdmin |
| `GET /api/system/settings` | `plugins/system/src/system.controller.ts:56` | requireAdmin |
| `POST /api/attendance` | `plugins/classroom/src/classroom.controllers.ts:384` | service(req) |
| `POST /api/leaves` | `plugins/classroom/src/classroom.controllers.ts:409` | service(req) |
| `POST /api/openapi/keys` | `plugins/admin/src/admin.controllers.ts:278` | requireAdmin |
| `POST /api/openapi/schools` | `plugins/admin/src/admin.controllers.ts:310` | requireAdmin |
| `POST /api/presets` | `plugins/classroom/src/classroom.controllers.ts:351` | service(req) |
| `POST /api/students` | `plugins/classroom/src/classroom.controllers.ts:110` | service(req) |
| `POST /api/students/:id/peer-reviews` | `plugins/classroom/src/classroom.controllers.ts:215` | service(req) |
| `POST /api/students/:id/points` | `plugins/classroom/src/classroom.controllers.ts:178` | service(req) |
| `POST /api/students/batch-edit` | `plugins/classroom/src/classroom.controllers.ts:130` | service(req) |
| `POST /api/students/batch-import` | `plugins/classroom/src/classroom.controllers.ts:100` | service(req) |
| `POST /api/students/batch-points` | `plugins/classroom/src/classroom.controllers.ts:120` | service(req) |
| `POST /api/students/checkin` | `plugins/classroom/src/classroom.controllers.ts:80` | service(req) |
| `POST /api/students/gift` | `plugins/classroom/src/classroom.controllers.ts:90` | service(req) |
| `POST /api/system/questions` | `plugins/system/src/system.controller.ts:39` | requireAdmin |
| `POST /api/system/settings` | `plugins/system/src/system.controller.ts:61` | requireAdmin |
| `PUT /api/class/:id/features` | `plugins/classroom/src/classroom.controllers.ts:294` | service(req) |
| `PUT /api/class/:id/settings` | `plugins/classroom/src/classroom.controllers.ts:294` | service(req) |
| `PUT /api/classes/:id/features` | `plugins/classroom/src/classroom.controllers.ts:294` | service(req) |
| `PUT /api/classes/:id/settings` | `plugins/classroom/src/classroom.controllers.ts:294` | service(req) |
| `PUT /api/leaves/:id` | `plugins/classroom/src/classroom.controllers.ts:419` | service(req) |
| `PUT /api/openapi/schools/:id` | `plugins/admin/src/admin.controllers.ts:321` | requireAdmin |
| `PUT /api/students/:id/birthday` | `plugins/classroom/src/classroom.controllers.ts:188` | service(req) |
| `PUT /api/system/questions/:id` | `plugins/system/src/system.controller.ts:44` | requireAdmin |

## 4. 修复建议（系统性）

### 4.1 只拒匿名不够：三类必须「按 actor 过滤结果集」的接口

1. **以 URL/query 指定主体**（`/api/students/:id`、`/api/parent-buff`、`/api/economy/students/:studentId/*`、`/api/gacha/*/:studentId`、`/api/dungeon/*/:studentId`、`/api/praises/student/:id`、`/api/redemption/my?studentId=`、`/api/family-tasks?studentId=&parentId=`、`/api/messages?userId=&role=`、`/api/attendance?classId=`、`/api/leaves?student_id=`）：主体参数必须与 actor 的归属关系比对（student→本人、parent→孩子、teacher→本班、admin→任意），**不能**只校验「已登录」。
2. **以 `classId` 指定范围**（`/api/classes/:id/*`、`/api/attendance`、`/api/groups`、`/api/battles/classes/:classId`、`/api/slg/*/:classId`、`/api/economy/classes/:classId/stocks`、`/api/gacha/classes/:classId/pools`、`/api/pet/classes/:classId`、`/api/analytics/classes/:classId/overview`）：teacher 只能读自己拥有的班级（`ensureTeacherCanManageClass` 已有实现，可直接复用），student 只能读自己班级。
3. **列表接口的 `?teacherId=` / 无过滤全量查询**（`/api/presets`、`/api/shop/all`、`/api/lucky-draw/config`、`/api/certificates`、`/api/students/records`）：teacher 的过滤条件必须来自 actor，而不是 query；admin 才允许跨教师。

### 4.2 已知的「双胞胎路由绕过权限」模式（本仓库独有，必须成对修）

- `POST /api/pet/students/:id/adopt|action` **有** actor + permission 门；同功能的 `POST /api/pet/students/:id/adoptions|actions` 与 `POST /api/pets/adopt|interact` **没有** —— 加门只加在别名上等于没加。
- `PUT /api/students/:id/password` 有 teacher 归属校验，但 `POST /api/students/batch-edit`（`action=reset_password`）没有 —— 匿名可用后者重置任意学生密码，绕过前者。
- `PUT /api/classes/:id/features`（受控路径不存在）与 `PUT /api/class/:id/features` 是同一个 handler；`/api/class` 与 `/api/classes` 全族互为别名，任何修复都要覆盖两组 base。
- 旧别名族 `/api/economy/bank/* | stocks/* | portfolio/*` 与 `/api/economy/students/*`、`/api/gacha/*/:studentId` 与 `/api/gacha/students/:studentId/*`、`/api/battles/teacher/* | stats/*` 与 `/api/battles/classes/* | :id/stats` 同理。

### 4.3 handler 内取 actor 而非信任 body

`teacher_id` / `sender_id` / `student_id` / `parent_id` / `reviewer_id` 一律从 `getRequestContext(req).actor` 派生（现有 `PET` 的 `requireActor`、`learning` 的 `actorOf` 即模板），body 里的同名参数只作为「目标对象」并再次校验归属。

### 4.4 有副作用与绕过全局过滤器的路由

- `GET /api/students/:id/achievements` 会写入 `achievements`；`GET /api/website/articles/:id` 会 `incrementArticleViews`。凡 GET 有写副作用的，必须鉴权（否则匿名请求可直接改库）。
- `POST /api/redemption/verify`、`POST /api/lucky-draw/draw` 用 `@Res()` 直接写响应，异常不会被全局过滤器渲染 —— 加门时要保证抛出的是 `ApiError` 且不会被 `@Res()` 吞掉（这两个 handler 目前把一切异常转成 500 JSON）。

### 4.5 结构性建议

- 仓库内 15 个域完全是「逐个方法漏加」，且多处注释把现状写成「Authorization is intentionally NOT added here … lands with plugin permission declarations」（`battles/dungeon/economy/gacha/marketplace/slg/pet` 控制器头注释、`HANDOFF §10`）。**该批次应作为一次独立的安全变更统一落地**，而不是混在迁移里逐域补。
- **仍有两条「伪造请求头即可自证身份」的潜在通路**（静态发现，非本轮队友修复范围）：`plugins/admin/src/admin.support.ts:37 actorOf()` 与 `plugins/classroom/src/classroom.support.ts:99 requestActor()` 在 `req.context` 缺失时会回退到原始 `x-user-role`/`x-user-id`。两个组合都会安装 context 中间件，所以当前不可达；但任何「不装中间件的组装方式」（例如自建 host、直接 import controller 的测试）都会让伪造头通过 `requireAdmin`。收口时应删除该回退，统一改用 `plugins/system/src/system.authorization.ts` 的「缺 context 即 fail closed」写法。
- 建议在插件宿主层提供统一门禁（声明式 `routes[].auth` 或每插件 `requireActorFor(route)` 中间件），使「新增路由默认需要登录」成为默认值 —— 当前默认值是「默认公开」。
- `ALLOW_LEGACY_HEADER_AUTH` 在基线里默认 `true`（`loadConfig.ts`）：`x-user-role`/`x-user-id` 可自证身份，等于所有 `actorOf`/`requestActor` 门在迁移桥打开时可被伪造头绕过。**写入时刻队友已把默认值翻成 `false`**；部署脚本若显式设了 `ALLOW_LEGACY_HEADER_AUTH=1`（或 `.env` 里留着旧值），仍需逐个环境确认。这一条比逐个补鉴权更前置：桥开着时，上面任何修复都可被两个请求头绕过。

## 5. 优先级排序（按泄漏了什么）

排序口径：凭据/密码哈希 > 学生 PII > 内部日志 > 普通业务数据。

| 级别 | 定义 | 基线代表端点 | 状态 |
| --- | --- | --- | --- |
| P0 | 凭据与账号接管：密码哈希、API Key 明文、任意学生密码重置 | `GET /api/system/backup/export`（全库含 `users.password_hash`）、`GET /api/openapi/keys`（明文 `sk_…`）、`POST /api/students/batch-edit`（`reset_password`） | 备份导出与 API Key 已被并发修复；batch-edit 仍敞开 |
| P0 | 学生 PII 批量导出：姓名/生日/积分/流水 | `GET /api/students`、`/api/students/:id`、`/api/students/records`、`/api/students/progress-star` | 其中 3 条已被并发修复；**`/api/students/progress-star` 仍敞开** |
| P1 | 内部日志与运维面 | `GET /api/audit-logs`、`GET /api/system/logs`、`POST /api/system/settings` | 已被并发修复（写入时） |
| P1 | 学生 PII 的次级面：成绩/出勤/请假/证书/表扬/消息/大屏 | `GET /api/exams/:id/grades`、`GET /api/attendance`、`/api/leaves`、`/api/certificates`、`/api/praises*`、`GET /api/messages`、`GET /api/classes/:id/bigscreen` | 仍敞开 |
| P1 | 资产与积分完整性（可被匿名改动） | `POST /api/students/gift`、`/api/students/:id/points`、`/api/students/batch-points`、`/api/economy/students/*/bank`·`stocks`、`/api/shop/buy`、`/api/shop/auctions/:id/bid`、`/api/shop/blind_box`、`/api/gacha/*/draws`、`/api/lucky-draw/draw`、`/api/parent-buff`、`/api/slg/*/contributions`·`yield` | 仍敞开 |
| P1 | 站点内容与配置篡改（可持久化的公开面） | `PUT /api/website/home`、`/api/website/articles*`、`POST /api/lucky-draw/config`、`PUT /api/classes/:id/features`、`POST /api/danmaku`、`DELETE /api/danmaku/cleanup`、`POST /api/redemption/verify` | 仍敞开 |
| P2 | 普通业务数据与写接口：作业/考试列表、对战、任务树、团队任务、副本、宠物、商品管理、题库、预设、分组、邀请码 | `/api/assignments*`、`/api/battles*`、`/api/challenge/*`、`/api/task-tree/*`、`/api/team-quests*`、`/api/dungeon/*`、`/api/pet*`、`/api/pets*`、`/api/shop`（管理侧）、`/api/system/questions`、`/api/presets`、`/api/groups`（已受控） | 仍敞开 |
| P3 | 低敏只读/内容型 | `GET /api/knowledge/*`（图谱）、`GET /api/gacha/dictionary`、`GET /api/kernel/info`（env/pluginDirs 披露）、`POST /api/website/contact`（应限流）、`GET /api/danmaku` | 仍敞开/建议收紧 |
| 前置项 | 鉴权桥：`ALLOW_LEGACY_HEADER_AUTH=true` 时 `x-user-role`/`x-user-id` 可自证身份，使所有 actor 门形同虚设 | `packages/kernel/src/config/loadConfig.ts`（基线默认 true） | **写入时刻已被并发改为默认 false**（15:38 落地）；若部署显式设了 `ALLOW_LEGACY_HEADER_AUTH=1` 仍需关闭 |

## 6. 方法与局限

- **解析方式**：正则解析每个 `@Controller(base)` + `@Get/@Post/@Put/@Delete` 装饰器（含数组 base，如 `@Controller(["api/students"])`、`@Put([":id/settings", ":id/features"])`），逐一取其 handler body 与其委托的 service 方法；「无鉴权」＝该 handler 与其 service 路径上不存在任何 `requireAdmin`/`requireActorRole`/`getRequestContext`/`requestActor`/`actorOf`/`permissions.require`/`ensureTeacherCanManage*`/`assertCanReadStudent` 调用。
- **覆盖率**：`tests/guardrails/snapshots/api-surface.json` 的 297 条与解析结果 297/297 精确对齐（`MISSING 0 / EXTRA 0`），内核 `router.get(...)` 注册的 8 条单独覆盖。
- **无法起临时实例**：本会话沙箱下 `npx tsx api/server.ts` 因 `esbuild` 需要 spawn 服务进程而报 `spawn EPERM`（已按已知边界确认，非命令写法问题）；本会话不允许提权，因此**没有做动态探测**。判定全部来自静态证据，并与 Lead 已实测的 4 组匿名读结果一致（system backup / audit-logs / openapi keys / students 全族）。
- **并发修复**：侦察开始时工作区是干净的 HEAD `8e447d9`；15:32–15:38 期间队友改动了 `plugins/system/**`、`plugins/admin/src/admin.controllers.ts`、`plugins/classroom/**`，并把 `ALLOW_LEGACY_HEADER_AUTH` 的默认值从 `true` 翻成 `false`（另有与鉴权无关的 `api/app.ts`、`loadConfig.ts` 组合校验）。矩阵第 3 列与行号取自基线，备注中的「已被并发修复」来自写入时刻工作区重解析。若后续继续修复，请以再次运行本脚本文档为准（脚本：`.tmp/build-matrix.mjs`）。
- **可重跑**：`node .tmp/build-matrix.mjs` 会重新解析当前工作区并重写本文件；基线副本在 `.tmp/baseline/`，由 `.tmp/dump-baseline.ps1` 从 HEAD 导出。
- **非路由类加固不在矩阵里**：`ALLOW_LEGACY_HEADER_AUTH` 默认值、CORS/限流、密码哈希参数等不在这 297 行内，本表只覆盖 HTTP 端点的鉴权。
- **行号漂移**：写入时已被队友改动的文件，行号与基线不同：`plugins/system/src/system.controller.ts`（+20）、`plugins/admin/src/admin.controllers.ts`（openapi 段 +7 起）、`plugins/classroom/src/classroom.controllers.ts`（+8 起）、`plugins/classroom/src/classroom.service.ts`（791→923 行）。矩阵中的「声明位置」是**基线**行号，定位时请以 handler 名（矩阵同行的端点）为准。
