# 数据库优化计划 (Database Optimization Plan)

## 1. 目标分析 (Summary)
当前系统的 SQLite 数据库配置较为基础，随着数据量和并发量的增长（特别是重度游戏化模块的加入），容易出现性能瓶颈和 `SQLITE_BUSY` 锁库问题。此外，`api/db.ts` 中的数据库表更新依赖于大量的 `try-catch` 捕获异常来实现，既不优雅也不利于维护，且缺失了关键外键和高频查询字段的索引。
本计划旨在通过优化 SQLite 的 PRAGMA 参数、添加关键索引、规范化表结构迁移脚本，并最终使用 `gh-cli` 创建 PR，全面提升数据库性能与代码可维护性。

## 2. 当前状态分析 (Current State Analysis)
- **参数配置**：当前启用了 WAL 模式，但未开启 `synchronous = NORMAL`，且 `cache_size` 仅为 2MB，未配置 `busy_timeout`。
- **索引缺失**：绝大多数外键（如 `student_id`, `class_id`, `teacher_id` 等）未建立索引，在执行 `JOIN` 和过滤时会导致全表扫描。
- **迁移机制**：`api/db.ts` 尾部有近 40 个通过 `try/catch` 包裹的 `ALTER TABLE` 语句，执行时若出错仅被静默吞掉，存在潜在风险。

## 3. 拟定变更 (Proposed Changes)

### 3.1 优化 SQLite PRAGMA 参数
**文件**: `api/db.ts`
- 增加 `db.pragma('synchronous = NORMAL');`：在 WAL 模式下安全地提升写入性能。
- 修改 `db.pragma('cache_size = -20000');`：将内存缓存从 2MB 提升至 20MB。
- 增加 `db.pragma('busy_timeout = 5000');`：设置 5 秒的超时等待，避免高并发时的 `database is locked` 错误。
- 增加 `db.pragma('temp_store = MEMORY');`：将临时表和索引存储在内存中，加快复杂查询速度。
- 确保 `reopenDb` 和全局初始化处均应用上述配置。

### 3.2 规范化数据库迁移脚本 (Idempotent Migrations)
**文件**: `api/db.ts`
- 引入无状态的列检查辅助函数 `addColumnIfNotExists(tableName, columnName, columnDef)`，其内部使用 `PRAGMA table_info(tableName)` 检查列是否存在。
- 移除所有用 `try/catch` 强行拦截错误的 `ALTER TABLE` 语句，替换为调用 `addColumnIfNotExists` 函数，使迁移过程幂等、清晰且不会隐藏真正的异常。

### 3.3 添加关键表的外键与查询索引 (Indexes)
**文件**: `api/db.ts`
在 `initDb()` 的结尾，使用 `CREATE INDEX IF NOT EXISTS` 为以下高频查询列创建索引：
- **用户与班级**：`students(class_id)`, `students(user_id)`, `classes(teacher_id)`
- **游戏化系统**：`pets(student_id)`, `shop_items(teacher_id)`, `records(student_id)`
- **学习与教务**：`assignments(class_id)`, `exams(class_id)`, `attendance_records(class_id, student_id)`, `messages(class_id, receiver_id)`, `operation_logs(teacher_id)`
- **SLG及其他**：`territories(class_id)`, `student_pets(student_id)`, `dungeon_runs(student_id)`

### 3.4 使用 gh-cli 提交 PR
- 创建新分支 `feature/db-optimization`。
- 将上述修改提交 (Commit)。
- 调用 `gh pr create` 命令，自动提交 Pull Request，并在描述中列出具体的优化点。

## 4. 假设与决策 (Assumptions & Decisions)
- **无状态迁移方案**：考虑到当前系统已经处于运行状态且未采用统一的版本控制迁移表（如 `schema_migrations`），为了不破坏已有数据库，决定采用基于 `PRAGMA table_info` 的无状态辅助函数来替代现有的 `try-catch` 机制，这种方式最安全且平滑。
- **缓存大小**：设定 `-20000` (20MB) 作为默认缓存大小，这对于典型的 Node.js 单实例后台是合理且安全的。
- **gh-cli 工具就绪**：假设运行环境已安装并正确登录授权了 `gh-cli`，且当前仓库已绑定远程 Git 仓库。

## 5. 验证步骤 (Verification Steps)
1. 运行应用（如 `npm run dev` 或对应启动命令），确保应用能够正常启动且控制台无报错。
2. 验证 `database.sqlite` 能被正常读写，API 路由（例如拉取学生列表、查询积分日志等）能够极速响应，验证索引是否生效。
3. 执行 `git status` 与 `git log`，确认修改已成功提交。
4. 使用 `gh pr list` 或直接查看返回的 URL，确认 Pull Request 已经成功在 GitHub 上创建。