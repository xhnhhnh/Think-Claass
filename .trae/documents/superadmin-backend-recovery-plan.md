# 修复超级后台导入后整体失效的实施计划

## Summary
- 目标：修复“超级后台在执行数据库导入后，后台功能和依赖旧 SQLite 连接的全站接口一起失效”的问题，并把系统恢复到“导入失败不致命、导入成功后后台与全站均可继续使用”的状态。
- 这次按“后台 + 全站稳定”范围处理，不额外扩大到完整管理员鉴权重构。

## Current State Analysis
- 超级后台后端核心在 [api/routes/admin.ts](file:///D:/ThinkClass/Think-Claass-main/api/routes/admin.ts#L99-L161)，数据库导入流程会先执行 `prisma.$disconnect()` 与 `closeDb()`，再用 `npx prisma db push --accept-data-loss` 做结构同步。
- 当前开发日志已经复现关键故障链：
  - `/api/admin/data/import` 执行后出现 Prisma Windows 文件锁错误：`EPERM ... query_engine-windows.dll.node`。
  - 随后 `/api/settings`、`/api/admin/codes`、`/api/openapi/keys`、`/api/announcements`、`/api/classes` 等接口继续报 `The database connection is not open`。
- 这些报错和代码结构一致：
  - [api/db.ts](file:///D:/ThinkClass/Think-Claass-main/api/db.ts#L47-L60) 允许关闭并重建 `better-sqlite3` 连接。
  - 但多数业务路由通过默认导出直接持有旧连接，例如 [api/routes/settings.ts](file:///D:/ThinkClass/Think-Claass-main/api/routes/settings.ts#L1-L18)、[api/routes/openapi.ts](file:///D:/ThinkClass/Think-Claass-main/api/routes/openapi.ts)、[api/routes/website.ts](file:///D:/ThinkClass/Think-Claass-main/api/routes/website.ts)。
  - 一旦导入流程中关闭旧连接后失败，旧连接会持续处于 closed 状态，影响超级后台和教师/学生/家长端大量接口。
- 超级后台页面本身也依赖这些接口：
  - [src/pages/Admin/Settings.tsx](file:///D:/ThinkClass/Think-Claass-main/src/pages/Admin/Settings.tsx#L23-L94) 依赖 `/api/settings` 和 `/api/admin/system/update/*`
  - [src/pages/Admin/Codes.tsx](file:///D:/ThinkClass/Think-Claass-main/src/pages/Admin/Codes.tsx#L17-L42) 依赖 `/api/admin/codes`
  - [src/pages/Admin/OpenApi.tsx](file:///D:/ThinkClass/Think-Claass-main/src/pages/Admin/OpenApi.tsx#L50-L131) 依赖 `/api/openapi/*`
- 当前导入失败的直接高风险点有两个：
  1. `prisma db push` 在运行中的 Windows 环境会尝试生成 Prisma Client，触发 DLL 重命名锁冲突。
  2. 导入流程在失败分支没有保证 Prisma 与 `better-sqlite3` 一定恢复连接。

## Proposed Changes

### 1. 改造数据库连接导出为“可热切换连接”
- 文件：`api/db.ts`
- 改动：
  - 将当前直接默认导出 `db` 的方式改为“始终转发到最新连接实例”的稳定导出方案。
  - 保留 `closeDb()` / `reopenDb()`，并补充连接状态保护，避免重复关闭或重建后旧引用失效。
- 原因：
  - 目前大量路由文件都直接 `import db from '../db.js'`，如果只重建局部变量而不修正导出语义，这些路由会继续引用已关闭连接。
- 实现方式：
  - 优先在 `api/db.ts` 内提供对当前活动连接的透明代理，尽量不批量改动 30+ 路由文件。
  - 如代理方案在类型或运行时上不可行，再退回为 `getDb()` 并同步改造所有直接依赖的路由；但第一选择仍是兼容现有导入方式的最小改动。

### 2. 修复导入流程的失败恢复与成功恢复
- 文件：`api/routes/admin.ts`
- 改动：
  - 重写 `/data/import` 的异常处理和清理流程，确保无论成功还是失败，都能重新建立 Prisma 与 `better-sqlite3` 连接。
  - 为导入前的数据库文件创建临时备份；若导入或结构同步失败，自动回滚到原数据库。
  - 清理上传临时文件，避免残留。
- 原因：
  - 当前逻辑在 `db push` 抛错后直接 `throw`，导致整个进程进入“部分数据库层已断开”的半失效状态。
- 实现方式：
  - 用 `try/catch/finally` 包住“关闭连接 -> 替换数据库 -> 结构同步 -> 恢复连接”全过程。
  - 将“恢复连接”放进 `finally`，将“回滚数据库文件”放进失败分支，避免再次出现“一次导入失败拖垮全站”的结果。

### 3. 规避 Windows 下 Prisma Client 生成锁冲突
- 文件：`api/routes/admin.ts`
- 改动：
  - 将导入中的结构同步命令调整为不生成 Prisma Client 的安全形式，例如保留 `db push` 但跳过 generate。
- 原因：
  - 当前日志中的 `EPERM ... query_engine-windows.dll.node` 说明失败并非 schema 本身，而是运行时尝试改写 Prisma 客户端二进制文件。
  - 导入时目标只是同步数据库结构，不需要在运行中的服务进程里重新生成客户端。
- 实现方式：
  - 调整 `execSync` 命令参数，避免运行时改写 `.prisma/client`。
  - 保留现有 Prisma 5.x 方案，不在本次修复中升级 Prisma 版本。

### 4. 增加回归验证，覆盖后台与全站受影响接口
- 文件：`api/routes/admin.ts` 相关验证；必要时新增测试文件
- 改动：
  - 为“导入失败后系统仍可继续服务”补充最小可执行验证。
  - 优先增加后端层验证，覆盖至少一个后台接口和一个全站旧 SQLite 接口。
- 原因：
  - 这次故障的核心不是单页面 UI，而是底层连接状态污染；必须用接口级验证防止回归。
- 实现方式：
  - 若现有测试框架便于接入，则增加针对导入恢复逻辑的测试。
  - 若自动化测试成本过高，则至少补充脚本化验证步骤，并在实施阶段执行实际接口检查。

## Assumptions & Decisions
- 已确认本次主要问题是“导入后全坏”，且修复范围包含后台与全站稳定性。
- 本次不扩展到完整管理员鉴权重构；只处理与本故障直接相关的可用性与恢复能力问题。
- 采用“最小侵入、优先兼容现有路由”的方案：优先修 `api/db.ts` 的连接导出语义，而不是一次性大改全部路由。
- 以 Windows 开发环境复现到的 Prisma 锁文件错误作为主要修复目标，同时保证 Linux/生产环境仍兼容。

## Verification Steps
1. 启动服务后先检查基础接口恢复：
   - `GET /api/settings`
   - `GET /api/admin/codes`
   - `GET /api/openapi/keys`
   - `GET /api/website/home`
2. 在超级后台执行一次数据库导入失败路径验证：
   - 模拟结构同步失败或使用受控异常路径。
   - 确认返回错误后，上述接口仍然可访问，不再出现 `The database connection is not open`。
3. 执行一次数据库导入成功路径验证：
   - 确认导入后后台“设置、激活码、开放平台”等页面对应接口恢复正常。
   - 确认全站至少一个教师/学生/公共接口仍正常。
4. 复查日志，确认不再出现 Prisma DLL 重命名 `EPERM` 导致的导入链路中断。
