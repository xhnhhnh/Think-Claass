# 计划：教师端功能开关默认全关 + 侧边栏联动

## Summary
- 目标：将课堂功能开关改为“默认全关”，并让教师端侧边栏随功能开关动态显示/隐藏（采用“仅隐藏强关联菜单”策略）。
- 范围：后端数据库默认值与一次性迁移、前端教师端侧边栏过滤与受限路由回退。
- 非目标：不改动学生端/家长端现有路由守卫逻辑，不新增或删除功能开关项。

## Current State Analysis
- `api/db.ts`
  - `classes` 表建表时 19 个 `enable_*` 字段默认值均为 `1`。
  - `addColumnIfNotExists` 对同类字段补列时默认值也为 `1`。
  - 现有启动迁移没有“仅执行一次”的全量特性位重置逻辑；若直接每次启动强制更新会覆盖老师后续手动配置。
- `src/lib/classFeatures.ts`
  - `defaultClassFeatures` 全为 `true`，会作为前端兜底值（`useStore`、`useClassFeatures` 等处复用）。
- `src/components/Layout/TeacherLayout.tsx`
  - 侧边栏 `navItems` 为静态数组，不读取班级功能开关。
  - 无“当前路由已被关闭时的自动回退”逻辑。
- `src/components/Layout/StudentLayout.tsx` / `src/components/Layout/ParentLayout.tsx`
  - 已存在“按 feature requirement 过滤菜单 + fallback 跳转”的实现模式，可复用思路到教师端。

## Proposed Changes

### 1) 后端：默认值改为全关 + 存量班级一次性全关迁移
- 文件：`api/db.ts`
- 变更内容：
  - 将 `classes` 表中 19 个 `enable_*` 字段在 `CREATE TABLE` 里的默认值由 `1` 改为 `0`。
  - 将 `addColumnIfNotExists('classes', 'enable_*', 'INTEGER DEFAULT 1')` 统一改为 `INTEGER DEFAULT 0`。
  - 新增“一次性迁移标记”机制（使用 `settings` 表存储标记键），在未迁移时执行：
    - 将 `classes` 表现有所有 19 个 `enable_*` 字段批量更新为 `0`；
    - 写入迁移完成标记，避免后续重启重复覆盖老师手动开启结果。
- 原因：
  - 满足“新旧班级都默认全关”的要求；
  - 避免每次启动都重置配置造成行为回退。

### 2) 前端共享默认：兜底状态改为全关
- 文件：`src/lib/classFeatures.ts`
- 变更内容：
  - 将 `defaultClassFeatures` 中全部键值改为 `false`。
- 原因：
  - 保证前端在未拿到班级真实配置前的默认呈现与后端语义一致（默认全关）。

### 3) 教师端侧边栏联动：仅隐藏强关联菜单
- 文件：`src/components/Layout/TeacherLayout.tsx`
- 变更内容：
  - 引入教师端特性需求映射（就地定义，避免扩大改动面），并使用 `isFeatureRequirementEnabled` 过滤菜单项。
  - 使用 `useClasses` + `useClassFeatures` 获取当前教师班级（默认首个班级）的功能开关数据。
  - 增加教师端 fallback 路由逻辑：
    - 若访问 `/teacher`，跳到首个可用菜单；
    - 若当前路由对应功能被关闭，自动重定向到首个可用菜单。
  - 保留始终可见的基础菜单：`/teacher`（班级与学生管理）、`/teacher/attendance`、`/teacher/assignments`、`/teacher/exams`、`/teacher/papers`、`/teacher/knowledge`、`/teacher/features`、`/teacher/settings`。
  - 强关联联动菜单（按你的选择）：
    - `enable_shop` -> `/teacher/shop`
    - `enable_lucky_draw` -> `/teacher/lucky-draw-config`、`/teacher/verification`
    - `enable_class_brawl` -> `/teacher/brawl`
    - `enable_slg` -> `/teacher/territory`
    - `enable_task_tree` -> `/teacher/task-tree`
    - `enable_world_boss` -> `/teacher/world-boss`
    - `enable_auction_blind_box` -> `/teacher/auction`、`/teacher/blind-box`
    - `enable_achievements` -> `/teacher/certificates`
    - `anyOf(enable_tree_hole, enable_chat_bubble, enable_peer_review, enable_danmaku, enable_family_tasks, enable_parent_buff)` -> `/teacher/communication`
- 原因：
  - 满足“侧边栏随功能开关变化”；
  - 在不破坏基础教务导航的前提下，按功能域做最小且明确的联动。

## Assumptions & Decisions
- 已确认决策：
  - 侧边栏采用“仅隐藏强关联菜单”。
  - 默认全关同时作用于新旧班级（旧班级通过一次性迁移处理）。
- 关键实现决策：
  - 一次性迁移必须带持久化标记，避免每次启动覆盖教师手动开关。
  - 教师端联动只影响侧边栏入口与路径回退，不额外新增教师路由级 `FeatureRouteGuard`（保持改动聚焦）。

## Verification Steps
1. 初始化验证（新库）
  - 启动后创建新班级，读取 `/api/classes/:id/features`，确认 19 项均为 `false`。
2. 迁移验证（旧库）
  - 准备含旧班级且开关为 `1` 的数据，首次启动后确认被批量置为 `0`；
  - 手动开启部分开关后重启，确认不会再次被重置（迁移标记生效）。
3. 教师侧边栏联动验证
  - 进入教师端，关闭 `enable_shop`、`enable_task_tree`、`enable_class_brawl` 等后，对应菜单即时消失；
  - 手动访问已关闭功能路径时，自动回退到可用页面；
  - 开启对应开关后菜单恢复显示。
4. 回归验证
  - 学生端/家长端功能守卫行为保持既有预期（未引入新的禁用路径异常）。
