# 前后端对接 - Axios 全局重构计划

## 1. 目标与总结
将项目中散落在各个页面的 154 处原生 `fetch` 调用，全部替换为基于 `axios` 的统一请求封装（`src/lib/api.ts`）。引入 `axios` 以提供更强大的拦截器机制，同时保持向下兼容，确保替换过程不破坏现有的组件状态（如 `setError` 和 `toast`）。

## 2. 现状分析
- **目前状态**：在 `src/pages` 和 `src/components` 目录下，约有 56 个文件直接使用了 `fetch()`。
- **现有的错误处理**：组件中普遍使用 `const res = await fetch(...)` -> `const data = await res.json()` -> `if (data.success) { ... } else { setError(data.message) }` 的模式。由于原生 `fetch` 在遇到 400/500 状态码时不会抛出异常，组件能够顺利拿到后端的错误提示并显示。
- **依赖状态**：项目中目前未安装 `axios`。

## 3. 具体修改方案

### 步骤 1：安装依赖
- 在 `package.json` 中安装 `axios`。

### 步骤 2：重构 `src/lib/api.ts`
- 引入 `axios`，创建全局单例 `api`。
- **请求拦截器**：预留 Auth Token 注入位置，统一设置请求头。
- **响应拦截器**：处理全局网络错误。
- **兼容性封装**：导出 `apiGet`, `apiPost`, `apiPut`, `apiDelete` 方法。
  - **关键设计**：为了兼容现有组件中 `if (data.success)` 的逻辑，这些方法将在内部捕获 `axios` 抛出的 HTTP 异常（4xx/5xx），并返回 `error.response.data`。这样组件无需修改现有的 `try-catch` 结构即可无缝迁移。

### 步骤 3：全局替换原生 `fetch`
- 编写 Node.js 脚本（基于正则或 AST），自动扫描 `src/pages` 和 `src/components` 下的所有 `.tsx` 文件。
- 自动将以下模式：
  ```typescript
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(payload), ... });
  const data = await res.json();
  ```
  替换为：
  ```typescript
  import { apiPost } from '@/lib/api';
  const data = await apiPost(url, payload);
  ```
- 对于 `GET` 请求同样处理。
- 脚本执行后，通过 TypeScript 检查（`npm run check`）来修复个别遗漏或特殊的请求格式。

## 4. 假设与决策
- **决策**：不强行移除组件内的 `if (data.success)` 逻辑。因为每个组件对 `success === false` 的处理方式不同（有的用 `setError`，有的用 `toast`，有的要清空状态），全局强行提炼到拦截器中容易引发 UI 交互 Bug。
- **假设**：后端接口返回的统一格式均为 `{ success: boolean, message?: string, ...data }`。

## 5. 验证与验收
- 运行 `npm run check` 确保所有替换后的类型和语法正确。
- 启动前后端服务（`npm run dev`）。
- 手动测试关键流程：登录（Login）、添加学生（AddStudent）、获取列表等，确保 Axios 请求正常发送，且错误提示（如密码错误）能正常显示在 UI 上。
