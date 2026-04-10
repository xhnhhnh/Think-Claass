# 后端重构与旧数据库导入优化计划

## 1. 目标摘要 (Summary)
对包含 37 个路由模块的后端系统进行深度重构。主要目标包括：引入 **Prisma** 作为核心 ORM 框架，将庞大的 `db.ts` 拆解为基于 Service/Repository 的模块化数据访问层；在所有路由中全面推广并应用现有的 `asyncHandler` 与全局错误拦截机制；最后，深度优化现有的数据库导入逻辑，实现安全替换、自动执行结构迁移（兼容旧数据）以及“热加载”数据库（免除强杀进程重启）。

## 2. 当前状态分析 (Current State Analysis)
- **数据层耦合严重**：现有的 `api/db.ts` 高达 900+ 行代码，包含了建表语句、硬编码的动态列检查（`addColumnIfNotExists`）以及加解密逻辑。
- **无状态类型安全**：当前使用了 `better-sqlite3` 执行原始 SQL 语句，缺乏 TypeScript 类型推导，难以维护复杂的表关联（如学生、班级、宠物、作业等）。
- **错误处理冗余**：虽然 `api/utils/asyncHandler.ts` 和 `errorHandler.ts` 已存在，但多达 37 个路由模块（如 `admin.ts`, `student.ts` 等）仍然在大量使用 `try/catch` 捕获异常并手动返回 `{ success: false, message: ... }`。
- **导入机制缺陷**：`/api/admin/data/import` 接口的实现仅仅是暴力的文件替换。由于 SQLite 启用了 WAL 模式，直接替换主文件而遗留的 `-wal` 和 `-shm` 文件极易导致数据库损坏。同时，导入后强行调用 `process.exit(0)` 重启服务器的做法在生产环境中极为脆弱。

## 3. 具体优化方案 (Proposed Changes)

### 阶段一：引入 Prisma 与模块化架构设计
1. **初始化 Prisma**
   - 运行 `npx prisma init --datasource-provider sqlite`。
   - 根据当前的 `initDb()` SQL 结构，逆向或手动编写 `schema.prisma`，完整定义 `users`, `classes`, `students`, `pets`, `shop_items` 等核心实体及其关系（1:1, 1:N, M:N）。
2. **建立数据服务层 (Service/Repository)**
   - 在 `api/services/` 目录下创建按业务划分的服务类（如 `UserService.ts`, `ClassService.ts`, `StudentService.ts`）。
   - 将原有 `db.ts` 中的加密解密逻辑（`encrypt/decrypt`）通过 Prisma 的 Client Extensions (中间件) 进行无缝拦截，保证业务层读写的透明性。
3. **逐步替换路由逻辑**
   - 由于路由多达 37 个，将分批次进行替换（先核心模块：Auth、Admin、Student，后周边模块：Economy、Slg、Dungeon 等）。

### 阶段二：统一错误处理与拦截
1. **重构路由层**
   - 移除所有路由中的 `try/catch` 模板代码。
   - 使用 `asyncHandler` 包装所有 Express 异步回调。
   - 将原有的 `res.status(500).json(...)` 替换为抛出自定义 `ApiError`。
2. **完善全局拦截器**
   - 确保 `api/utils/errorHandler.ts` 被正确挂载到 Express 应用的最末端。
   - 统一 API 返回格式为 `{ success: false, message: string, error?: any }`。

### 阶段三：优化旧数据库导入机制 (核心诉求)
彻底改造 `api/routes/admin.ts` 中的 `/data/import` 接口，流程如下：
1. **断开现有连接**：调用 `await prisma.$disconnect()` 确保没有未完成的写入。
2. **清理缓存文件**：安全删除现有的 `database.sqlite-wal` 和 `database.sqlite-shm` 文件，避免数据损坏。
3. **替换数据库文件**：将上传的旧版本 `.sqlite` 文件覆盖当前的主数据库文件。
4. **执行自动迁移**：利用 Node.js `child_process.execSync` 调用 `npx prisma migrate deploy`（或 `prisma db push`），自动比对新代码的 Schema 与旧数据库结构，并补充缺失的表和字段，实现旧数据的平滑兼容。
5. **热加载恢复服务**：调用 `await prisma.$connect()` 重新建立连接。
6. **响应前端**：直接返回成功响应，**移除** `process.exit(0)` 强杀逻辑。

## 4. 假设与决策 (Assumptions & Decisions)
- **迁移阵痛期**：由于从 Raw SQL 迁移到 Prisma 是一项大规模重构，我们计划采取“增量替换”的策略。部分尚未迁移的模块可以暂时保留对 `better-sqlite3` 的访问，直到 Prisma 服务层覆盖率达到 100%。
- **Prisma 迁移管理**：将采用 Prisma Migrate 生成标准的 `.sql` 迁移脚本记录，取代原来在 `db.ts` 内部手工写的 `addColumnIfNotExists`。
- **性能折衷**：虽然 Prisma 在某些极端的批量查询上略慢于手写的 `better-sqlite3`，但换来的是极大的代码可维护性、强类型和自动化的表结构升级能力。

## 5. 验证步骤 (Verification Steps)
1. **Schema 验证**：成功运行 `npx prisma generate` 且无报错，表明模型定义正确。
2. **全局异常验证**：人为触发一个异常（例如抛出 `new ApiError(400, '测试异常')`），观察接口是否正常拦截并返回预期的 JSON 结构。
3. **数据库导入热加载验证**：
   - 准备一个只有部分旧表结构的 `.sqlite` 文件。
   - 在后台管理界面上传该文件。
   - 观察控制台日志：确认断开连接 -> 清理 WAL -> 替换文件 -> 触发 Prisma Migrate -> 重新连接。
   - 验证服务是否在未重启的情况下，正常读取新导入的数据并且表结构已自动升级。
4. **加密兼容性验证**：查询旧库中的加密学生姓名，验证 Prisma Extension 层的解密是否与原来的 `decrypt()` 函数完全一致。