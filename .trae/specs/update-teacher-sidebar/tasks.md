# Tasks
- [x] Task 1: 修改 TeacherLayout.tsx 以支持动态侧边栏
  - [x] SubTask 1.1: 增加状态 `features`，包含 `enableShop`、`enablePets`、`enableRecords`，默认值为 true。
  - [x] SubTask 1.2: 添加 `fetchFeatures` 函数，请求 `/api/classes`，解析所有班级的 `settings`，只要有一个班级开启则为 true。
  - [x] SubTask 1.3: 在 `useEffect` 中调用 `fetchFeatures`，并监听 `featuresUpdated` 全局事件。
  - [x] SubTask 1.4: 根据 `features` 状态条件渲染“商品管理”、“精灵管理”和“积分与兑换记录”按钮。
- [x] Task 2: 修改 TeacherFeatures.tsx 触发全局更新事件
  - [x] SubTask 2.1: 在 `handleSave` 成功后，添加 `window.dispatchEvent(new Event('featuresUpdated'))` 触发全局事件。

# Task Dependencies
- 无