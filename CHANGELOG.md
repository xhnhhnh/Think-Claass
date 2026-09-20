# Changelog

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
