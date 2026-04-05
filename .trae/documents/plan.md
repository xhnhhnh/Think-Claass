# 项目升级与部署方案计划书 (Plan)

## 1. 总结 (Summary)
本次升级旨在全面优化项目的自动化部署与更新流程，并打通超级后台的一键在线升级能力。主要目标包括：
1. **重构部署脚本**：支持自定义安装目录，支持在线拉取 GitHub Releases 的最新部署包。
2. **自定义后台路径**：将硬编码的 `/beiadmin` 路径抽取为环境变量，部署时可自定义。
3. **安全更新与容错**：为所有 Shell 脚本增加严格的错误捕获（`trap ERR`），并在更新前自动备份 SQLite 数据库。
4. **后台一键更新**：在超级后台增加系统版本检测及异步一键更新功能。

## 2. 当前状态分析 (Current State Analysis)
- **部署脚本 (`install.sh`, `update.sh`)**：目前是本地脚本，直接在当前目录安装依赖和构建，缺乏在线拉取能力和错误中断提示；无法指定安装目录。
- **后台路由**：前端大量硬编码了 `/beiadmin` 路径（如 `App.tsx`, `AdminLayout.tsx` 等），无法通过环境变量动态修改。
- **系统更新**：目前只能通过服务器终端手动执行 `update.sh`，超级后台无版本检测与更新入口。版本号亦未持久化记录。

## 3. 建议修改与实现细节 (Proposed Changes)

### 3.1 环境变量与前端路由动态化
- **文件**: `.env` (由脚本生成), `src/App.tsx`, `src/components/Layout/AdminLayout.tsx`, `src/components/ThemeWrapper.tsx`, `src/pages/Admin/Login.tsx`
- **改动**:
  - 在前端代码中统一定义常量 `const ADMIN_PATH = import.meta.env.VITE_ADMIN_PATH || '/beiadmin';`。
  - 将所有硬编码的 `/beiadmin` 替换为 `ADMIN_PATH` 变量，支持自定义后台访问地址。

### 3.2 自动化部署脚本升级 (`install.sh`)
- **文件**: `install.sh`
- **改动**:
  - 增加错误捕获：`set -e` 和 `trap 'echo "[错误] 脚本在第 $LINENO 行执行失败！" >&2' ERR`。
  - 询问用户目标安装目录（默认 `/class`），如果不存在则创建并进入该目录。
  - 询问超级后台路径，并在生成 `.env` 时写入 `VITE_ADMIN_PATH`。
  - 通过 `curl` 调用 GitHub API (`https://api.github.com/repos/xhnhhnh/Think-Claass/releases/latest`) 获取最新的 `think-class-release.zip` 并下载解压。
  - 提取最新 Release 的 Tag 名称，并写入 `.env` 文件作为 `CURRENT_VERSION`。
  - 解压后继续执行 Node/PM2 安装及启动流程。

### 3.3 自动化更新脚本升级 (`update.sh`)
- **文件**: `update.sh`
- **改动**:
  - 增加严格的错误捕获和中文报错反馈。
  - 在更新前，将现有的 `data/` 目录复制备份为 `data_backup_YYYYMMDD_HHMMSS/`。
  - 调用 GitHub API 获取最新的 `think-class-release.zip` 并下载解压覆盖（自动覆盖除了 `.env` 和 `data/` 之外的文件）。
  - 更新 `.env` 中的 `CURRENT_VERSION`。
  - 执行 `npm install` 更新依赖，然后平滑重启 PM2 服务。

### 3.4 后端：一键更新 API
- **文件**: `api/routes/admin.ts`
- **改动**:
  - 新增 `GET /api/admin/system/update/check`：请求 GitHub API 获取最新 Release 版本号，对比本地 `process.env.CURRENT_VERSION`。
  - 新增 `POST /api/admin/system/update/execute`：触发异步更新。通过 Node.js 的 `child_process.spawn` 异步执行 `./update.sh`。API 立即返回成功状态，提示前端“系统正在后台更新并重启，请稍后刷新页面”。

### 3.5 前端：后台一键更新 UI
- **文件**: `src/pages/Admin/Settings.tsx` (或 Dashboard)
- **改动**:
  - 增加一个“系统更新”卡片模块。
  - 组件挂载时调用 `/api/admin/system/update/check`，显示当前版本、最新版本以及更新日志。
  - 若有新版本，展示“立即更新”按钮；点击后调用 execute 接口并展示全屏 loading 或提示用户稍后手动刷新。

## 4. 假设与决策 (Assumptions & Decisions)
- **下载源**：根据用户选择，统一使用 GitHub Releases 提供的 `think-class-release.zip` 作为部署和更新包，而不是拉取源码重新构建（这可以大幅降低部署服务器的负担和网络延迟）。
- **执行方式**：后台触发更新采用异步执行，避免因为 Node 服务被 PM2 强制重启而导致前端收到 502/超时 报错。
- **数据安全**：更新脚本强制备份 `data/`（SQLite 数据库文件所在目录），保障数据安全。

## 5. 验证步骤 (Verification Steps)
1. 运行修改后的 `install.sh`，检查是否正确询问安装路径和后台路径，并能成功从 GitHub 下载包并启动。
2. 检查生成的 `.env` 是否包含 `VITE_ADMIN_PATH` 和 `CURRENT_VERSION`。
3. 访问前端自定义的后台路径，确认路由和静态资源加载正常。
4. 在超级后台点击“检查更新”，验证能否正确识别版本差异，并异步触发 `update.sh` 重启服务。
5. 检查 `data_backup_*` 文件夹是否在更新过程中成功生成。
