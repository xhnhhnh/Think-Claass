# Tasks
- [x] Task 1: 确立设计系统与基础样式设置
  - [x] SubTask 1.1: 在 `tailwind.config.js` / `index.css` 中配置全局 CSS 变量（极简暗黑主题色彩、霓虹高光色、排版字体、毛玻璃模糊滤镜效果）。
  - [x] SubTask 1.2: 引入现代、极具个性的开源字体设置（例如通过 Google Fonts 引入 Space Grotesk / Inter 或组合本地系统字体栈）。
- [x] Task 2: 重构侧边栏（Sidebar）与顶部导航
  - [x] SubTask 2.1: 为侧边栏增加半透明背景与边框高光，优化激活菜单项的视觉反馈（发光/渐变条），优化 Lucide 图标的显示效果。
  - [x] SubTask 2.2: 重新设计顶部操作按钮（如：导出、导入、刷新数据），采用现代幽灵按钮或渐变按钮样式。
- [x] Task 3: 重构数据统计卡片网格 (Dashboard Stats)
  - [x] SubTask 3.1: 设计具有视觉深度的卡片组件（背景噪点纹理、毛玻璃发光边框或细致的内阴影）。
  - [x] SubTask 3.2: 优化卡片内图标与数字的排版对比度（利用大字号、粗体展示数据，并使用彩色背景包裹图标）。
- [x] Task 4: 重构服务器状态与系统活跃度面板
  - [x] SubTask 4.1: 美化服务器进度条组件（CPU、内存使用率），增加流动的渐变与发光效果，重塑面板内的排版对齐。
  - [x] SubTask 4.2: 优化空状态（如“系统活跃度 0”）的视觉表现（例如居中的空心数字、柔和的辅助文字）。
- [x] Task 5: 增加交互动效（Motion）
  - [x] SubTask 5.1: 结合 `framer-motion` 实现页面初次加载的入场动画（Fade-in, slide-up, Staggered reveals）。
  - [x] SubTask 5.2: 添加全局卡片、按钮的 Hover 微交互效果（如悬浮时边框高亮、轻微上浮）。

# Task Dependencies
- Task 2, Task 3, Task 4 depends on Task 1
- Task 5 depends on Task 2, Task 3, Task 4
