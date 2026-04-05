# 修复超级后台更新与移除 TRAE SOLO Spec

## Why
用户反馈超级后台的“一键更新”功能无法正常执行，且要求移除项目中所有与 TRAE SOLO 相关的内容（特别是 `vite-plugin-trae-solo-badge`）。同时需要结合 `frontend-design` 的理念，优化更新面板的 UI 视觉效果。

## What Changes
- **移除 TRAE SOLO**：
  - 从 `vite.config.ts` 中删除 `vite-plugin-trae-solo-badge` 的引入和配置。
  - 从 `package.json` 中移除依赖并执行卸载。
- **修复系统更新**：
  - 在 `api/routes/admin.ts` 中，修复 Node.js 原生 `fetch` 请求 GitHub API 时缺少 `User-Agent` 的问题。
  - 修复执行 `update.sh` 时，直接在当前目录执行导致 `unzip` 覆盖运行中脚本而崩溃的问题，改为拷贝到 `/tmp` 后独立执行。
- **前端设计优化**：
  - 运用 `frontend-design` 技能的理念，重新设计 `src/pages/Admin/Settings.tsx` 中的“系统升级”面板，使用更大胆的配色、光影层次和精致的排版，提升视觉品质。

## Impact
- Affected code:
  - `vite.config.ts`
  - `package.json`
  - `api/routes/admin.ts`
  - `src/pages/Admin/Settings.tsx`

## ADDED Requirements
无新增系统功能要求。

## MODIFIED Requirements
### Requirement: 系统更新执行逻辑
- **WHEN** 管理员点击“一键更新并重启”
- **THEN** 后端应将 `update.sh` 拷贝至系统的临时目录执行，确保更新包解压时不会干扰正在运行的更新脚本本身，同时 GitHub API 请求需携带 `User-Agent` 以防被拦截。

## REMOVED Requirements
### Requirement: TRAE SOLO Badge
**Reason**: 用户要求移除所有相关内容。
**Migration**: 移除相应的 Vite 插件。
