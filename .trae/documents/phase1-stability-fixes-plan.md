# 一期技术债治理计划：坏功能修复

## Summary

- 目标：在不扩张范围的前提下，优先修复当前已确认的 3 个高影响失配问题，使对应页面恢复可用，并补上最小必要的验证。
- 本期范围：
  - 修复教师端任务树新增/编辑提交失效
  - 修复管理员系统重置调用路径与 HTTP 方法错误
  - 修复教师端九宫格抽奖配置接口路径错误
- 本期不包含：
  - 完整登录鉴权重构
  - 支付模块落地
  - 全量接口契约统一
  - 全仓库散落 `fetch` 的全面收敛

## Current State Analysis

### 1. 教师任务树页面提交逻辑失效

- 文件：[TaskTree.tsx](file:///D:/ThinkClass/Think-Claass-main/src/pages/Teacher/TaskTree.tsx#L60-L79)
- 现状：
  - `handleSubmit` 中虽然计算了 `method` 和 `url`，但实际调用的是 `apiGet(url)`。
  - 当前没有把表单数据提交给后端，因此“新建节点/编辑节点”实际上不会写入任何数据。
- 后端真实接口：
  - 创建：[taskTree.ts](file:///D:/ThinkClass/Think-Claass-main/api/routes/taskTree.ts#L21-L52) `POST /api/task-tree/teacher`
  - 更新：[taskTree.ts](file:///D:/ThinkClass/Think-Claass-main/api/routes/taskTree.ts#L54-L69) `PUT /api/task-tree/teacher/:id`

### 2. 管理员系统重置页面调用契约错误

- 页面文件：[SystemReset.tsx](file:///D:/ThinkClass/Think-Claass-main/src/pages/Admin/SystemReset.tsx#L23-L40)
- 前端 API 封装：[admin.ts](file:///D:/ThinkClass/Think-Claass-main/src/api/admin.ts#L3-L18)
- 后端真实接口：[admin.ts](file:///D:/ThinkClass/Think-Claass-main/api/routes/admin.ts#L163-L198)
- 现状：
  - 页面与封装都在调用 `GET /api/admin/system/reset-database`
  - 后端实际只提供 `POST /api/admin/reset-database`
- 影响：
  - 当前页面即使触发也无法命中真实重置逻辑
  - 高危操作前后端契约漂移，风险较高

### 3. 教师端九宫格抽奖配置接口路径错误

- 页面文件：[LuckyDrawConfig.tsx](file:///D:/ThinkClass/Think-Claass-main/src/pages/Teacher/LuckyDrawConfig.tsx#L46-L69) 和 [LuckyDrawConfig.tsx](file:///D:/ThinkClass/Think-Claass-main/src/pages/Teacher/LuckyDrawConfig.tsx#L101-L120)
- 后端挂载位置：[app.ts](file:///D:/ThinkClass/Think-Claass-main/api/app.ts#L94-L94)
- 路由实现：[lucky_draw.ts](file:///D:/ThinkClass/Think-Claass-main/api/routes/lucky_draw.ts#L6-L54)
- 现状：
  - 前端使用 `/api/lucky_draw/config`
  - 服务端真实挂载基路径为 `/api/lucky-draw`
- 影响：
  - 配置读取与保存都可能失败

### 4. 测试与 mock 当前无法覆盖这些真实契约问题

- 现有管理端测试：[admin.test.ts](file:///D:/ThinkClass/Think-Claass-main/src/api/__tests__/admin.test.ts#L1-L10)
- 现有 MSW mock：[handlers.ts](file:///D:/ThinkClass/Think-Claass-main/src/mocks/handlers.ts#L51-L58)
- 现状：
  - 测试只覆盖极少数 API wrapper
  - 现有 mock 与真实后端返回结构已存在漂移
- 结论：
  - 本期需要至少补充针对坏功能修复点的最小验证，避免再次回归

## Proposed Changes

### A. 修复任务树提交链路

#### 目标文件

- `src/pages/Teacher/TaskTree.tsx`
- 如需配合验证，可新增或补充与该页面相关的前端测试文件

#### 变更内容

- 将 `handleSubmit` 从错误的 `apiGet` 调用改为与真实后端契约一致的写操作：
  - 新建使用 `apiPost('/api/task-tree/teacher', payload)`
  - 编辑使用 `apiPut('/api/task-tree/teacher/:id', payload)`
- 补齐提交 payload，至少包含：
  - `class_id`
  - `title`
  - `description`
  - `points_reward`
  - `parent_node_id`
  - `x_pos`
  - `y_pos`
- 保持当前 UI 交互不变：
  - 成功后 toast 提示
  - 关闭弹窗
  - 重新拉取节点列表

#### 原因

- 当前页面属于明显坏功能，修复后可直接恢复教师核心配置能力。

#### 实施要点

- 使用现有 `@/lib/api` 中的 `apiPost`、`apiPut`
- 维持现有组件风格与状态结构，避免本期顺带重构整页数据流
- 对 `parent_node_id` 做空值与数字转换，保证后端收到的值符合预期

### B. 修复系统重置调用契约

#### 目标文件

- `src/pages/Admin/SystemReset.tsx`
- `src/api/admin.ts`

#### 变更内容

- 将系统重置从错误的 GET 调用改为真实的 POST 调用
- 统一页面和 API 封装使用同一路径：
  - `POST /api/admin/reset-database`
- 优先让页面复用 `adminApi.resetDatabase()`，减少重复写接口路径

#### 原因

- 这是管理后台高危操作，路径与方法必须与后端完全一致，不能继续分叉。

#### 实施要点

- 页面按钮状态、确认逻辑、成功后退出登录与跳转逻辑保持不变
- 只修正契约，不在本期改动更大的鉴权和权限校验方案

### C. 修复九宫格抽奖配置路径

#### 目标文件

- `src/pages/Teacher/LuckyDrawConfig.tsx`

#### 变更内容

- 将读取配置与保存配置的接口路径统一改为：
  - `GET /api/lucky-draw/config`
  - `POST /api/lucky-draw/config`

#### 原因

- 服务端当前真实挂载是连字符命名，前端下划线写法会直接导致配置功能不可用。

#### 实施要点

- 保持当前表单结构、校验和 toast 逻辑不变
- 不在本期扩展抽奖功能本身的数据结构或概率算法

### D. 为本期修复补最小回归验证

#### 目标文件

- `src/api/__tests__/admin.test.ts`
- `src/mocks/handlers.ts`
- 视实现情况新增与坏功能相关的测试文件

#### 变更内容

- 更新管理端 mock 与测试，使其符合真实后端契约
- 至少覆盖以下内容中的适当子集：
  - 系统重置调用使用 POST 且路径正确
  - 管理统计接口测试与真实返回结构一致
  - 如测试成本可控，补充任务树或抽奖配置的接口调用契约测试

#### 原因

- 当前测试无法发现“路径对不上/方法错了/返回结构漂移”这类问题
- 本期修复如果没有回归验证，后续极易再次破坏

#### 实施要点

- 优先复用现有 Vitest + MSW 体系
- 测试只聚焦本期修改点，避免扩张为全量重构

## Assumptions & Decisions

- 决策：本期按“先修坏功能”执行，不扩展为综合一期。
- 决策：登录稳定性本轮不纳入实施范围；如后续扩展，仅做“持久化现状”而不做完整鉴权重构。
- 假设：后端现有真实契约优先级高于前端现状，因此以前端对齐后端为本期原则。
- 假设：本期不修改数据库 schema，不引入新依赖，不调整现有页面布局和视觉设计。
- 假设：`.tmp/` 下的副本目录不是本次实施目标，避免误改非主线代码。

## Verification Steps

### 静态与类型验证

- 运行与本期变更相关的类型检查，确认前端 API 调用签名无错误
- 检查修改后的页面引用是否仍符合现有导入风格

### 自动化验证

- 运行现有前端测试，重点确认修改过的 API wrapper / mock / 测试文件通过
- 如新增测试，验证以下场景：
  - 系统重置调用走 `POST /api/admin/reset-database`
  - 管理统计测试断言匹配真实返回结构
  - 任务树提交与抽奖配置至少有一项契约级验证

### 手工联调验证

- 管理员系统重置页：
  - 输入 `CONFIRM` 后触发请求
  - 请求方法与路径命中真实后端接口
  - 成功后显示提示并执行登出/跳转
- 教师任务树页：
  - 新建节点后列表刷新并显示新节点
  - 编辑节点后数据更新成功
- 教师抽奖配置页：
  - 能正常读取配置
  - 修改后能保存并再次拉取到最新内容

## Implementation Order

1. 修复系统重置前端契约
2. 修复任务树提交链路
3. 修复抽奖配置路径
4. 更新 mock 与测试，补最小回归验证
5. 执行类型检查 / 测试 / 联调验证
