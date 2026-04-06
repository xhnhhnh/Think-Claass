# Gemini 视觉风格 UI 重构计划

## 1. 概述 (Summary)
本项目旨在将现有的 React 应用 UI 整体视觉风格重构为类似 Google Gemini 的现代 AI 风格（极简、发光渐变、磨砂玻璃质感、大留白）。考虑到项目包含数十个页面，本次重构将**优先从全局布局（Layout）与基础主题色变量（Theme）入手**，统一整体视觉骨架。重构过程将结合 `frontend-design` 技能的审美规范，并全程使用 `gh-cli`（GitHub CLI）进行分支管理和代码审查（PR）。

## 2. 当前状态分析 (Current State Analysis)
- **技术栈**：React 18 + Vite + Tailwind CSS + Framer Motion + React Router v7。
- **主题系统**：在 `src/index.css` 中基于 CSS 变量（HSL 格式）定义了基础色系，并通过 `.theme-student`、`.theme-admin` 等类名实现基于角色的多主题切换。
- **布局架构**：核心布局组件位于 `src/components/Layout/` 目录下，包含 `TeacherLayout.tsx`、`StudentLayout.tsx`、`ParentLayout.tsx` 和 `AdminLayout.tsx`，各自维护独立的导航和侧边栏。
- **UI 现状**：目前包含较多高饱和度色彩、粗边框和传统后台布局，缺乏 Gemini 风格的呼吸感、细腻的光影过渡和磨砂玻璃（Glassmorphism）效果。

## 3. 拟定变更 (Proposed Changes)

### 步骤 1：初始化 GitHub 协作流程
- **操作**：使用 `gh-cli` 创建并切换到新分支 `feature/gemini-ui-refactor`。

### 步骤 2：重构全局主题 CSS 变量 (`src/index.css`)
- **操作**：重新定义全局 HSL 颜色变量。
- **设计方向**：
  - **基础色**：引入极其干净的背景色（如纯白或深空灰/纯黑的极简暗黑模式），加大文字与背景的对比度。
  - **品牌色/强调色**：将 `--primary` 等变量调整为 Gemini 标志性的冷色调（如星空蓝、紫罗兰渐变）。
  - **阴影与边框**：定义新的 utility class 或调整现有变量，使用极其细腻的柔和阴影（soft shadow）和 1px 的半透明边框（hairline borders）。

### 步骤 3：重构教师端布局 (`src/components/Layout/TeacherLayout.tsx`)
- **操作**：重新设计侧边栏（Sidebar）和顶部导航（Header）。
- **设计方向**：
  - 将传统的通栏侧边栏改为**悬浮式/胶囊式侧边栏**（Floating Sidebar），配合 `backdrop-blur-xl` 磨砂玻璃效果。
  - 增加导航项的 Hover 动画（利用 Framer Motion），提供微小但精致的背景色渐变反馈。
  - 扩大主内容区的留白（Padding），使其像一张干净的白纸。

### 步骤 4：重构学生端布局 (`src/components/Layout/StudentLayout.tsx`)
- **操作**：优化现有的“游戏化”布局，使其更符合现代极简审美。
- **设计方向**：
  - 移除原有的粗边框（`border-b-8` 等）和过于厚重的阴影，改为轻盈的弥散光晕（Glowing Gradients）和发光卡片效果。
  - 顶部导航栏采用高度透明的毛玻璃材质，使滚动内容若隐若现。

### 步骤 5：重构家长/管理员端布局 (`ParentLayout.tsx` & `AdminLayout.tsx`)
- **操作**：同步 Gemini 极简风格。
- **设计方向**：
  - 简化顶部条和侧边栏的视觉层级，去除不必要的分割线，使用背景色差来区分不同区域。
  - 优化移动端适配下的抽屉式菜单（Drawer）的弹出动画和遮罩透明度。

### 步骤 6：提交代码并创建 Pull Request
- **操作**：使用 Git 提交所有变更，并使用 `gh pr create` 自动生成包含重构详情的 PR，请求代码审查。

## 4. 假设与决策 (Assumptions & Decisions)
- **范围控制**：第一阶段仅重构 `Layout` 布局骨架和 `index.css` 全局主题变量。由于各子页面（如 Dashboard 内部卡片）使用了 Tailwind 的内联类名（如 `bg-white`），它们会自动继承新的背景和排版规则，但具体的业务卡片内部样式将在后续阶段或由开发者自行逐步替换，以防单次 PR 规模过大导致冲突。
- **组件复用**：暂不引入庞大的第三方组件库（如 shadcn/ui），而是继续发挥 Tailwind CSS 和 Framer Motion 的优势，这有助于保持项目的轻量化并精准复刻 Gemini 风格的微交互。

## 5. 验证步骤 (Verification Steps)
1. 运行本地开发服务器 `npm run dev`。
2. 依次访问教师 (`/teacher`)、学生 (`/student`)、家长 (`/parent`) 和管理员 (`/admin`) 路由，检查布局重构是否生效且无样式错乱。
3. 切换明暗模式（Light/Dark Mode），确保 Gemini 风格的发光渐变和毛玻璃在暗色模式下依然清晰且美观。
4. 运行 `gh pr view --web` 验证 Pull Request 是否成功创建并包含正确的变更清单。