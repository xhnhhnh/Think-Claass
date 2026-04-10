# 修复超级后台修改数据导致系统报错的计划

## 1. 总结 (Summary)
用户反馈“超级后台改的任何数据都不可用，每个端在使用时都会报错”。经过排查，该问题通常是由于前后端数据类型不匹配、JSON 解析错误或 `better-sqlite3` 的隐式类型转换/绑定错误导致的。本计划将全面加固超级后台的数据修改接口，确保数据保存和读取的绝对稳定。

## 2. 当前状态分析 (Current State Analysis)
- **超级后台接口 (`api/routes/admin.ts`)**：目前在处理 `PUT /settings`、`PUT /announcements/:id` 等请求时，直接从 `req.body` 解构变量并传入 SQLite 执行更新。
- **潜在隐患**：
  1. 如果前端意外传入了对象或非标准类型，SQLite 会将其隐式转为字符串（如 `"[object Object]"`），导致客户端在读取和解析时崩溃。
  2. 布尔值（如 `is_active`）在部分接口中缺乏严格的 `1/0` 转换，可能会导致数据库类型混乱。
  3. `req.body` 的解析可能在某些特殊请求头下失效，导致字段为 `undefined`，进而导致更新逻辑异常。

## 3. 建议修改与实现细节 (Proposed Changes)

### 3.1 强化超级后台 API 的数据校验与类型转换
- **文件**: `api/routes/admin.ts`
- **改动**:
  - 为所有修改数据的接口（`PUT /settings`, `PUT /users/:id`, `PUT /announcements/:id`, `POST /announcements` 等）增加严格的数据类型校验。
  - 确保布尔值被严格转换为 `1` 或 `0`：`const isActiveNum = is_active ? 1 : 0;`。
  - 确保字符串字段被严格转换为 `String(value)`，避免对象或数组被存入数据库。
  - 对于 Settings 更新，确保如果传入的是对象或数组，必须被正确处理或拒绝，防止存入 `[object Object]`。

### 3.2 增加独立的 JSON 解析中间件防御
- **文件**: `api/routes/admin.ts`
- **改动**:
  - 在 `adminRoutes` 内部显式引入 `express.json()`，以防止全局中间件在某些边界情况下（如请求头不规范）失效导致 `req.body` 未被正确解析。

### 3.3 前端请求头与参数加固
- **文件**: `src/pages/Admin/Settings.tsx`, `src/pages/Admin/Announcements.tsx` 等
- **改动**:
  - 确保所有的 `fetch` 请求都严格设置 `Content-Type: application/json`。
  - 在发送 `formData` 前，确保所有字段的值类型（尤其是布尔值和字符串）完全符合后端的预期。

### 3.4 错误捕获与日志记录优化
- **文件**: `api/routes/admin.ts`
- **改动**:
  - 在 `catch` 块中增加详细的错误日志打印（包含 `req.body` 和具体的错误堆栈），以便后续能够精准追踪任何异常的数据修改。

## 4. 假设与决策 (Assumptions & Decisions)
- **核心假设**：报错的根本原因是脏数据（Dirty Data）被存入了 SQLite 数据库（例如意外存入了非预期的字符串或对象），导致客户端在渲染或逻辑判断（如 `JSON.parse` 或全等判断）时崩溃。
- **决策**：不改变现有的数据库表结构，而是通过在写入层（Backend API）增加“数据清洗”和“严格类型约束”来彻底阻断脏数据的产生。

## 5. 验证步骤 (Verification Steps)
1. 应用上述修改并重启服务。
2. 登录超级后台，对系统设置、公告、教师信息等进行修改。
3. 检查数据库中实际存储的值是否为标准的字符串或数字，确保没有 `[object Object]` 或 `undefined`。
4. 分别以学生、教师、家长身份登录客户端，验证各个端是否能够正常读取并使用这些数据，且无任何报错。