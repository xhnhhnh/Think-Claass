<!--
PR 标题请使用 Conventional Commits（例如 feat(pet): ...、fix(wechat): ...）；类型与 scope 的说明见 CONTRIBUTING.md。
The PR title should follow Conventional Commits (e.g. feat(pet): ..., fix(wechat): ...); see CONTRIBUTING.md for the types and scopes.

删除不适合本次改动的段落即可，但验证部分请保留实际跑过的命令与结果。
Delete the sections that genuinely do not apply, but keep the real commands and results under Verification.
-->

## 变更摘要 / Summary

<!-- 改了什么，一两句话即可。 / What changed, in one or two sentences. -->

## 关联 Issue / Related issue

<!-- 有 issue 就写 Closes #123；没有就写「无 / none」。 / Use Closes #123, or write "none". -->

Closes #

## 为什么 / Why

<!-- 为什么要改：修的问题、必须满足的约束、刻意不做的部分。 / Why it is needed, the constraints, and what this deliberately does not do. -->

## 变更类型 / Type

- [ ] feat — 新功能 / new feature
- [ ] fix — 缺陷修复 / bug fix
- [ ] refactor — 重构 / refactor
- [ ] docs — 文档 / documentation
- [ ] test — 测试 / tests
- [ ] chore — 构建、依赖、杂项 / build, dependencies, chores

## 验证 / Verification

<!-- 勾选实际跑过的命令，并把输出或摘要粘贴在下方。「能跑」不算验证。 / Tick what you actually ran and paste the output or a summary below. "It works" is not verification. -->

- [ ] `npm run check`
- [ ] `npm run guard`
- [ ] 相关测试项目 / targeted tests（写明哪个 / which one）：
- [ ] `npm test`
- [ ] `npm run api:surface:check`（改了 HTTP 接口 / API changes）
- [ ] `npm run auth:audit`（改了路由或授权 / auth changes）
- [ ] `npm run lint`
- [ ] `npm run miniprogram:check`（改了小程序 / miniprogram changes）
- [ ] `npm run test:e2e`（改了路由或认证 / route or auth changes）

```
命令与结果 / Commands and results:
```

## 影响面 / Impact

- [ ] HTTP 接口面有变更，且已更新快照（`npm run api:surface:update`）/ HTTP surface changed and its snapshot is updated
- [ ] 新增数据库迁移，且没有编辑已应用的迁移 / New DB migration added, and no applied migration was edited
- [ ] 没有手动改版本号（发版走 `npm run release`）/ Version untouched (releases go through `npm run release`)
- [ ] 英文/中文文档成对更新，且 `docs/README.md` 索引已补 / Bilingual doc pairs and the `docs/README.md` index are updated

## 检查清单 / Checklist

- [ ] 没有提交密钥、`.env`、token 或真实学生个人信息 / No secrets, `.env`, tokens, or real student personal data
- [ ] 只包含与本变更相关的改动，没有顺手修别的问题 / Only related changes, no unrelated fixes
- [ ] 新增端点都有调用方（G22）以及角色/权限测试 / New endpoints have clients (G22) and role/permission tests
- [ ] UI 只使用设计令牌，没有 `!important` / UI uses design tokens and no `!important`
- [ ] UI 变更附截图 / Screenshots attached for UI changes
