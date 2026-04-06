# 需求实现计划

## Summary (总结)
根据您的需求，我们将执行以下三个主要任务：
1. **移除 TRAE SOLO 徽章**：从前端构建配置中移除相关插件，删除右下角图标。
2. **新增独立重置菜单**：在超级后台侧边栏新增“系统重置”独立页面，并调用已有的重置数据库接口。
3. **完善付费功能（真实第三方支付框架）**：修复当前直接付费模式下的路由拦截漏洞，提供完整的第三方支付（微信/支付宝）前后端代码框架（包含支付页面、订单创建接口、状态轮询以及异步回调 Webhook 接口）。

## Current State Analysis (当前状态分析)
1. 项目的 `vite.config.ts` 和 `package.json` 中配置了 `vite-plugin-trae-solo-badge` 插件。
2. 后端 `api/routes/admin.ts` 中已具备 `/reset-database` 路由接口，但前端 `AdminLayout` 缺少入口菜单及对应的前端页面。
3. 全局路由守卫 `src/App.tsx` 中的付费墙拦截逻辑（`needsActivation`）存在缺陷：当计费模式为 `direct_payment`（直接付费）时未做拦截拦截，导致可免费使用系统。同时，系统缺失真实的支付页面与后端支付对接逻辑。

## Proposed Changes (具体修改方案)

### 1. 移除相关徽章内容
- **文件**: `vite.config.ts`、`package.json`
- **操作**: 
  - 在 `vite.config.ts` 中移除 `import { traeBadgePlugin }` 及 `plugins` 数组中的相关配置。
  - 在 `package.json` 中删除 `vite-plugin-trae-solo-badge` 依赖项。

### 2. 增加超级后台独立重置菜单
- **文件**: `src/pages/Admin/SystemReset.tsx` (新建)
  - **操作**: 编写包含严重警告 UI 的重置页面，点击确认后调用 `POST /api/admin/system/reset-database` 接口。
- **文件**: `src/components/Layout/AdminLayout.tsx`
  - **操作**: 在侧边栏菜单配置中新增“系统重置”入口。
- **文件**: `src/App.tsx`
  - **操作**: 引入 `AdminSystemReset` 并在后台路由组中添加 `/admin/reset` 的路由配置。

### 3. 修复付费功能并提供真实第三方支付框架
- **文件**: `src/App.tsx`
  - **操作**: 修复 `needsActivation` 漏洞：只要 `revenue_enabled === '1'` 且用户未激活（且非管理员/教师），就进行拦截。如果是激活码模式重定向至 `/activate`，如果是直接付费模式则重定向至 `/payment`。并添加 `/payment` 路由。
- **文件**: `src/pages/Payment.tsx` (新建)
  - **操作**: 开发支付页面，提供微信/支付宝选择界面，调用后端生成支付二维码，并轮询查询支付状态。
- **文件**: `api/routes/payment.ts` (新建)
  - **操作**: 提供完整的支付接口框架：
    - `POST /create`: 统一下单接口（返回支付链接或二维码参数）。
    - `GET /status/:orderId`: 订单状态查询接口。
    - `POST /notify`: 支付成功异步回调接口（Webhook），验证签名后更新对应用户的 `is_activated = 1`。
- **文件**: `api/index.ts`
  - **操作**: 注册 `/api/payment` 路由。

## Assumptions & Decisions (假设与决定)
- **关于支付接口**：我将编写结构完整、可直接填入实际商户参数的微信/支付宝对接框架。因为暂无真实的 APPID 和商户私钥，默认状态下使用 Mock 数据返回占位二维码以便您测试前后台流程，后续您只需在代码中填入密钥即可切换至真实支付。
- **关于重置操作**：由于重置操作会清除所有非管理员数据并自动重启服务器，前端将增加严格的二次确认弹窗，以防误触。

## Verification Steps (验证步骤)
1. 检查前端页面右下角是否不再显示 TRAE SOLO 徽标。
2. 以超级管理员身份登录，验证左侧菜单是否出现“系统重置”项，且能够正常渲染页面。
3. 以学生身份登录并开启直接付费模式，验证系统是否成功拦截并重定向到 `/payment` 页面。
4. 验证在 `/payment` 页面能否正常走通模拟支付流程并激活账号进入系统。