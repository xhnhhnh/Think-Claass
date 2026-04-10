# 仪表盘前端界面重构 (Dashboard Redesign) Spec

## Why
当前系统仪表盘界面设计较为平庸、缺乏视觉吸引力（用户反馈“不好看”）。需要利用现代前端设计理念重构界面，提升视觉层次、空间排版、色彩对比度以及交互动画体验，打造具有独特美感和生产环境级别的后台管理系统。我们将引入一种极致的暗色美学（Editorial Dark Mode），通过精心挑选的排版、毛玻璃质感、悬浮动效与非凡的交互细节，让仪表盘焕然一新。

## What Changes
- 重构全局配色与质感：采用极致深色主题（Dark Theme），利用半透明毛玻璃材质（Glassmorphism）、细微发光边框（Glowing Borders）和高饱和度强调色（如荧光蓝/青色），取代目前扁平单调的色块。
- 升级排版与字体（Typography）：引入极具个性的字体家族设定（例如系统非衬线字体与特定的等宽字体结合），优化数字展示、标题层级与字重，增强数据的可读性和视觉高级感。
- 优化卡片布局与留白（Spatial Composition）：重塑数据统计卡片（总用户数、教师人数等）和图表/状态面板区域的排版，打破常规死板的网格，增加精致的内边距和间距。
- 引入动效与微交互（Motion）：基于 `framer-motion` 和 CSS transitions 为数据加载、卡片悬浮（Hover）和页面切换添加平滑优雅的过渡动画，例如错位入场动画（Staggered reveals）。
- 改进侧边栏（Sidebar）：优化侧边栏背景材质、导航图标（Lucide Icons）、激活状态的高光/渐变效果以及整体视觉层次。

## Impact
- Affected specs: 仪表盘视图（Dashboard）、侧边栏导航（Sidebar）、全局样式配置
- Affected code: `src/` 下相关的组件（如 Sidebar, StatsCards, Dashboard 页面组件），`tailwind.config.js` 扩展（如果需要添加自定义动画或颜色），以及 `index.css` 全局样式。

## MODIFIED Requirements
### Requirement: 仪表盘视觉升级
系统仪表盘和侧边栏需要呈现出高级、独特的视觉风格，通过毛玻璃、渐变、发光边框和优雅动效等设计手段，打破传统后台的平庸感。

#### Scenario: 页面加载与交互
- **WHEN** 用户进入系统仪表盘页面
- **THEN** 页面元素应以优雅的错位动画（Staggered reveals）依次显现，数据卡片在鼠标悬浮时应有微妙的深度抬升或边框发光反馈。

#### Scenario: 侧边栏导航切换
- **WHEN** 用户在侧边栏切换不同菜单
- **THEN** 当前选中的菜单项应具有高对比度的视觉提示（如高光背景或霓虹渐变指示条），且切换过程过渡平滑。