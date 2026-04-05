# Tasks
- [x] Task 1: 分析并修复 `TeacherLayout.tsx` 的 DOM 结构：检查外层 `div` 闭合以及 z-index 堆叠上下文，确保 `Outlet` 区域不被透明层遮挡，使得页面内容可以正常点击和交互。
- [x] Task 2: 修复侧边栏导航路由：删除重复的 `/teacher/brawl` (跨班大乱斗) 按钮。
- [x] Task 3: 补充缺失的功能入口：在侧边栏中加入 `/teacher/task-tree` (多维任务树管理) 导航按钮，并配置对应的图标（如 `GitBranch`）和高亮状态逻辑。
- [x] Task 4: 应用前端设计优化：利用 `frontend-design` 的高级理念，调整侧边栏样式（背景透明度、毛玻璃模糊度、悬停动画等），使得布局干净、现代且不显得杂乱。
- [x] Task 5: 增加动态标题逻辑：在页面头部的 `<h1>` 中补充 `/teacher/task-tree` 对应的页面标题（如 "多维任务树管理"），以保持页面切换时标题的准确性。