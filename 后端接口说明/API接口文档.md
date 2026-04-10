# 后端 API 接口对接说明文档

本文档旨在为前端或第三方客户端提供与本系统后端 API 进行对接的指南。

## 1. 基础说明

### 1.1 接口 Base URL
本地开发环境：`http://localhost:3001/api`
生产环境：请使用您的实际域名，如 `https://api.yourdomain.com/api`

### 1.2 数据交互格式
- **请求格式 (Request)**：所有 POST/PUT 请求的主体数据必须使用 `application/json` 格式，部分文件上传接口（如导入数据库）使用 `multipart/form-data`。
- **响应格式 (Response)**：所有接口均返回 JSON 格式数据。

### 1.3 统一响应结构
后端所有接口遵循以下统一的 JSON 响应格式：

**成功响应 (HTTP 200 OK)**
```json
{
  "success": true,
  "message": "操作成功的提示信息（可选）",
  "data": { 
    // 实际返回的业务数据，键名可能会根据具体接口变化（如 user, students 等）
  }
}
```

**失败响应 (HTTP 400/401/404/500 等)**
```json
{
  "success": false,
  "message": "错误详细描述信息",
  "error": "..." // 仅在开发环境下可能包含详细堆栈信息
}
```

---

## 2. 核心模块接口列表

### 2.1 认证与账号 (Auth)
**Base Path**: `/api/auth`

| 接口名称 | Method | 路径 | 参数说明 (Body) | 返回说明 |
|---|---|---|---|---|
| **用户登录** | POST | `/login` | `username` (string), `password` (string), `role` (string: student/parent/teacher/superadmin) | 返回用户信息 `user` 及所在班级的功能开关 `classFeatures`。 |
| **用户注册** | POST | `/register` | `username`, `password`, `role`, `name` (可选), `invite_code` (学生/家长必填), `student_id` (必填) | 学生和家长注册需提供班级邀请码并绑定已有学生ID。 |
| **账号激活** | POST | `/activate` | `code` (string, 激活码), `userId` (number) | 使用后台发放的激活码激活当前账号。 |

### 2.2 学生操作 (Student)
**Base Path**: `/api/students`

| 接口名称 | Method | 路径 | 参数说明 | 返回说明 |
|---|---|---|---|---|
| **获取学生列表** | GET | `/` | Query: `classId` (可选) | 返回对应班级的所有学生列表。 |
| **获取单个学生** | GET | `/:id` | Path: `id` (学生ID) | 返回学生的详细信息及积分等数据。 |
| **每日签到** | POST | `/checkin` | Body: `{ studentId }` | 记录签到并奖励积分。 |
| **赠送积分** | POST | `/gift` | Body: `{ senderId, receiverId, points, message }` | 学生间互赠积分。 |
| **同伴互评** | POST | `/:id/peer-reviews` | Body: `{ reviewee_id, score, comment, is_anonymous }` | 提交对同伴的评价和打分。 |
| **查询积分记录** | GET | `/records` | Query: `studentId` 或 `teacherId` | 获取积分的变动流水。 |

### 2.3 教师管理操作 (Teacher/Class)
教师相关的管理操作通常位于 `/api/classes` 或 `/api/students`。

| 接口名称 | Method | 路径 | 参数说明 | 返回说明 |
|---|---|---|---|---|
| **批量导入学生** | POST | `/api/students/batch-import` | Body: `{ students: [{name, username}], class_id }` | 批量创建学生记录，系统会自动处理用户名冲突。 |
| **批量修改积分** | POST | `/api/students/batch-points` | Body: `{ studentIds: [], amount, reason }` | 批量为选中的学生增加或扣除积分。 |
| **批量编辑学生** | POST | `/api/students/batch-edit` | Body: `{ studentIds: [], action, value }` | 支持批量修改密码或转移班级。 |

### 2.4 超级管理员 (Admin)
**Base Path**: `/api/admin`

> **注意**：管理员接口属于高危操作，前端通常只能在 Admin Dashboard 面板中调用。

| 接口名称 | Method | 路径 | 参数说明 | 返回说明 |
|---|---|---|---|---|
| **获取系统状态** | GET | `/stats` | 无 | 返回服务器 CPU、内存以及数据库总量统计。 |
| **导出数据库** | GET | `/data/export` | 无 | 直接下载 `database.sqlite` 备份文件。 |
| **导入数据库** | POST | `/data/import` | FormData: `file` (文件) | **高危**：上传旧版 `.sqlite` 文件。系统会自动热加载并执行数据结构迁移。 |
| **重置数据库** | POST | `/reset-database`| 无 | **高危**：清空所有业务数据（保留超级管理员账号）。 |
| **教师列表管理** | GET/POST/PUT/DELETE | `/users` | - | 获取/创建/修改/删除教师账号。 |
| **激活码生成** | POST | `/codes` | Body: `{ count }` | 批量生成用于激活账号的随机码。 |

---

## 3. 对接注意事项

1. **加解密机制**：后端在数据库层面针对学生姓名等敏感信息使用了 AES-256-CBC 加解密，但**对前端透明**。前端通过接口获取到的 `name` 均已经是明文，前端传给后端的也应是明文。
2. **错误处理**：前端请求应统一拦截 HTTP 状态码（非 200 即视为失败），并读取响应体中的 `message` 字段作为 Toast 提示展示给用户。
3. **角色权限**：大多数接口尚未做强制的 JWT Token 校验，主要依赖前端传递的 `role` 或业务 ID 进行逻辑隔离，请在前端路由守卫中做好角色拦截。
