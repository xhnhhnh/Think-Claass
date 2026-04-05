# 教师端侧边栏随功能开关动态变化 Spec

## Why
目前在教师端的“功能开关”页面（`/teacher/features`）可以控制商品兑换、宠物系统和兑换记录的开启和关闭。但是这些开关仅对学生端生效，教师端主控台的侧边栏（`TeacherLayout.tsx`）中的对应管理菜单并未随之隐藏，导致即使功能关闭，教师依然可以看到相关管理入口。

## What Changes
- **TeacherLayout.tsx**: 引入对当前教师所有班级功能开关状态的拉取和聚合逻辑。若所有班级都关闭了某项功能（如：商品兑换），则在教师端侧边栏隐藏对应的菜单项。
- **TeacherFeatures.tsx**: 在教师保存功能开关配置后，触发一个全局事件（如 `featuresUpdated`），通知 `TeacherLayout.tsx` 重新拉取功能开关状态，从而实现侧边栏的实时更新。

## Impact
- Affected specs: 教师端主控台侧边栏渲染
- Affected code: 
  - `src/components/Layout/TeacherLayout.tsx`
  - `src/pages/Teacher/Features.tsx`

## MODIFIED Requirements
### Requirement: 教师端侧边栏动态渲染
侧边栏的“商品管理”、“精灵管理”、“积分与兑换记录”三个菜单项将根据当前教师所管理的班级的配置状态动态显示。只要有一个班级开启了对应功能，该菜单项就显示；如果所有班级都关闭了该功能，则隐藏。
