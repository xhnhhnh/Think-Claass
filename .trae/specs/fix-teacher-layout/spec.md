# 修复教师端所有功能无法使用及界面优化

## Why
用户反馈“教师端的所有功能无法使用”。经过检查，最近合入的“refactor global layouts and theme to gemini style” PR 在修改 `TeacherLayout.tsx` 时引入了布局和路由链接的错误。具体包括重复的导航按钮（如“跨班大乱斗”）、缺失的导航项（如“多维任务树管理”），以及可能导致界面点击失效的层级（z-index）和渲染异常。需要应用 `frontend-design` 的理念重新梳理并修复教师端的侧边栏及整体布局结构，确保所有功能模块都可以正常访问且视觉效果出众。

## What Changes
- **修复导航链接**：在 `TeacherLayout.tsx` 的侧边栏中补充缺失的 `/teacher/task-tree` 路由入口。
- **清理冗余代码**：移除侧边栏中重复的 `/teacher/brawl` 按钮，清理其他可能存在的重复或无用的冗余代码。
- **重构界面层级与交互**：应用 `frontend-design` 技能中的高品质 UI 设计原则（如毛玻璃特效、合理的空间构图、精准的动画），修复可能遮挡内容的 z-index 或布局嵌套错误。
- **优化代码结构**：确保 React Router 的 `Outlet` 和外部包裹 `div` 闭合标签完全正确，保证子路由组件能够被正确挂载和交互。

## Impact
- Affected specs: 教师端侧边栏导航、教师端整体布局、路由访问能力
- Affected code: `src/components/Layout/TeacherLayout.tsx`

## ADDED Requirements
### Requirement: 恢复并优化所有导航入口
系统必须在教师端侧边栏提供完整且不重复的功能入口，允许教师无缝切换管理模块。

#### Scenario: Success case
- **WHEN** 教师登录并进入 `/teacher` 页面
- **THEN** 侧边栏应展示所有可用功能模块（包含班级与学生管理、作业、考试、多维任务树、跨班大乱斗等）且点击可正确加载对应页面。

## MODIFIED Requirements
### Requirement: 优化 Gemini 风格的 Teacher Layout
重构 `TeacherLayout` 的视觉效果，消除点击事件被遮挡或布局崩溃的问题，使其在提供精美外观的同时兼顾稳定性和可用性。
