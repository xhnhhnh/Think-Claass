# Changelog

## [1.6.7] - 2026-05-10

这版主要是在“能不能顺手用起来”上补课。前面很多页面已经接上真实后端了，但有些地方失败时只会冷冰冰地说“网络错误”，老师和学生都不知道自己错在哪一步。这次把这些细节收回来：该告诉你用户名重复就告诉你重复，该告诉你积分不够就别装作网络坏了。

### Added
- 新增 `activation_events` 表，用来记录激活来源、激活码、订单等关键线索，后续排查账号激活问题不用再靠猜。
- 新增部署脚本公共工具 `scripts/deploy-common.sh`，把 Node 检查、依赖安装、Prisma 生成、Release 下载、PM2 重启等重复逻辑集中管理。

### Changed
- 学生添加链路更稳了：创建学生会同步创建登录账号，默认密码为 `123456`，用户名重复和班级缺失都会给出明确提示。
- 教师端作业、商城、拍卖、盲盒、沟通页，以及学生端商城、拍卖、同伴互评、家长请假页，现在会展示后端返回的真实失败原因。
- 一键部署/更新脚本重构：安装脚本不再删除 lockfile，更新脚本复用公共部署工具，Windows 更新脚本会备份 `.env`、数据库和 data 目录。
- 打包脚本会先确保依赖和 Prisma Client 就绪，再构建发布包，减少“本地能跑、包里缺东西”的尴尬。

### Fixed
- 修复教师商城“库存 -1 表示无限”但后端拒绝 `-1` 的问题。
- 修复 `/api/students/progress-star` 被 `/api/students/:id` 动态路由吞掉，导致进步之星接口加载失败的问题。
- 修复添加学生失败时页面只显示通用请求失败、不展示后端中文原因的问题。

## [1.1.0] - 2026-04-10

### Added
- **Testing**: 引入了 `Vitest` 和 `MSW` 作为前端单元测试与接口 Mock 框架。
- **API Encapsulation**: 在 `src/api/` 下建立了结构化的 API 请求模块 (`auth.ts`, `students.ts`, `teacher.ts`, `admin.ts`)，映射了后端 `API接口文档.md` 中定义的核心接口。
- **Unit Tests**: 编写了 `src/api/__tests__/` 下针对 `auth`, `students`, `teacher`, `admin` 的基础单元测试用例。
- **Documentation**: 新增 `docs/api-integration-checklist.md`，记录接口对接情况。

### Changed
- **API Caller**: 重构了 `src/hooks/queries/` (如 `useClasses.ts`, `useStudents.ts`, `useStudentMutations.ts`)，从直接使用散落的 `apiGet/apiPost` 迁移到调用 `src/api/` 下的新模块。
- **Auth Flow**: 更新了 `src/pages/Login.tsx`, `src/pages/Admin/Login.tsx`, `src/pages/Activate.tsx` 中的登录、注册、激活接口调用，替换为封装好的 `authApi`。
- **Linting**: 优化了 `.eslint.config.js`，通过过滤 `.tmp` 和部分旧有 `any` 规则，使得 `npm run lint` 能够顺利通过。
