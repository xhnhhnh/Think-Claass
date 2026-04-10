# Changelog

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
