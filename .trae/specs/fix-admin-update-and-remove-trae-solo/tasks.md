# Tasks
- [x] Task 1: 移除 TRAE SOLO 相关内容
  - [x] SubTask 1.1: 从 `vite.config.ts` 中移除 `vite-plugin-trae-solo-badge`
  - [x] SubTask 1.2: 从 `package.json` 卸载对应的 npm 依赖
- [x] Task 2: 修复超级后台更新接口
  - [x] SubTask 2.1: 在 `api/routes/admin.ts` 的 `fetch` 请求中添加 `User-Agent`
  - [x] SubTask 2.2: 将 `update.sh` 的执行路径改为临时目录中的副本，避免文件覆盖导致脚本崩溃
- [x] Task 3: 优化系统升级界面的 UI 设计
  - [x] SubTask 3.1: 在 `src/pages/Admin/Settings.tsx` 中，应用 `frontend-design` 的高级设计语言，美化升级面板的视觉效果（如渐变、阴影、微交互等）