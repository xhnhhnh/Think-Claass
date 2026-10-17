[English](VERSIONING.md) | 简体中文

# 版本序列号规范

本文是 Think-Class 的版本序列号与发布规范。它刻意写得短：[`docs/versioning.md`](docs/versioning.md) 是设计记录，解释每条规则为什么存在，以及催生它的那些事故。两者冲突时，以工作区与命令为准，并在同一个改动里把过时的那份改对。

英文版是权威版本；中文译本与它同步维护，并在顶部注明这一点。

## 1. 适用范围与权威性

本规范适用于：

- [`package.json`](package.json) 里的应用版本、git tag 与 GitHub Release；
- [`CHANGELOG.md`](CHANGELOG.md) 的最新条目；
- 每个插件 `plugin.json` 里的版本；
- [`packages/kernel/src/config/loadConfig.ts`](packages/kernel/src/config/loadConfig.ts) 里的内核 API 版本；
- [`install.sh`](install.sh) 与 [`update.sh`](update.sh) 写入 `.env` 的已安装版本标记 `CURRENT_VERSION`。

发布机制是 [`scripts/release.mjs`](scripts/release.mjs)，CI 流水线是 [`.github/workflows/release.yml`](.github/workflows/release.yml)，机器检查是 [`tests/guardrails/version-consistency.test.ts`](tests/guardrails/version-consistency.test.ts)（护栏 G19）与文档标准护栏。

## 2. 版本号格式

### 2.1 应用版本

应用版本使用语义化版本：`MAJOR.MINOR.PATCH`（例如 `X.Y.Z`，manifest 里绝不带前导 `v`）。git tag 在前面加 `v`：`vX.Y.Z`。

- 三个数字段，不许有前导零。
- 不许有构建元数据（`+...`）；发布脚本与 G19 都会拒绝。
- 一个版本号只分配一次。已经有 tag 的版本永不复用；发错了就用下一个 PATCH 修，而不是移动或删除 tag。
- 版本号单调递增。tag 不得高于 `package.json` 里的版本（G19）。

### 2.2 预发布版本

预发布版使用 `X.Y.Z-rc.N`（例如 `2.1.0-rc.1`）。它的用途是在正式发布前验证部署链路。

- 用显式版本切出：`npm run release -- 2.1.0-rc.1`。
- 在 GitHub 上标记为 prerelease；`releases/latest` 不会指向它，更新检查也会忽略它。
- 它不是安全修复支持范围内的正式版本；最终的 `X.Y.Z` 是一个新版本，不是对候选版的重打包。
- 不要发明其他后缀，也不要使用构建元数据。本项目只使用 `-rc.N` 这一种预发布形式。

### 2.3 插件版本

每个插件在 `plugins/<slug>/plugin.json` 里有自己的语义化版本。它与应用版本相互独立。

- MAJOR：插件对外发布的端口（`<slug>.public`）发生不兼容变化。
- MINOR：新增路由、端口方法或权限键。
- PATCH：只改内部实现。
- `dependsOn` 范围与插件的 `kernel` 范围都使用语义化版本范围；兼容的插件升级不得打断依赖者。
- 插件版本不从应用版本复制，也不与发布 tag 绑定。

manifest 规则由插件 manifest 护栏强制；`plugins/pet/plugin.json` 展示了形状。

### 2.4 内核 API 版本

`KERNEL_API_VERSION` 描述插件编译所依赖的 SDK 与上下文。它与应用版本解耦。

- 只增不改（新增可选的上下文字段、新增不改变既有语义的 SDK 辅助方法）不升它。
- 删除方法、改变语义，或修改 manifest 必填字段时，它加 1。
- 它升级时，所有插件的 `kernel` 范围都要跟着改；`npm run check` 与运行时解析器会拒绝不匹配的插件。
- 这个常量住在 [`packages/kernel/src/config/loadConfig.ts`](packages/kernel/src/config/loadConfig.ts)；它的值绝不抄进文档。

## 3. 唯一事实源

| 位置 | 角色 | 谁写 | 能否手改 |
| --- | --- | --- | --- |
| [`package.json`](package.json) 的 `version` | 唯一应用版本 | `npm run release` | 不能 |
| [`package-lock.json`](package-lock.json) | 在两处镜像根版本号 | `npm run release` 在同一次提交里写 | 不能 |
| git tag `vX.Y.Z` | 不可变的发布事件 | `npm run release`（带 `--push` 时推送） | 永不移动或删除 |
| [`CHANGELOG.md`](CHANGELOG.md) 最新小节 | 面向人的变更记录 | `npm run release` 生成骨架；维护者填写 | 可以，但顶部必须等于 `package.json` |
| GitHub Release | 分发载体与发布说明 | 推送 tag 后由 CI 写 | 不能 |
| `.env` 的 `CURRENT_VERSION` | 已安装的运行时状态 | [`install.sh`](install.sh) / [`update.sh`](update.sh) | 运行期数据，永不入库 |
| `plugins/<slug>/plugin.json` 的 `version` | 插件兼容性 | 插件所有者 | 不是应用版本 |
| `KERNEL_API_VERSION` | 内核兼容性 | 内核维护者 | 不是应用版本 |

`package-lock.json` 是镜像，不是第二个事实源：通过发布脚本切版本，让两处一起走。

## 4. 什么时候升哪一位

先问：现有安装能不能不改配置、不动数据就升级？能 → MINOR 或 PATCH；不能 → MAJOR。

| 改动 | 升哪一位 |
| --- | --- |
| 新增必填环境变量、需要手工迁移数据、移除或改变 HTTP 面、新增部署前提 | MAJOR |
| 新功能、新路由、新插件；旧安装不改配置即可升级 | MINOR |
| 修缺陷或内部重构；对外行为与部署方式不变 | PATCH |
| 正式发布前的验证 | 预发布 `-rc.N` |
| 插件端口的不兼容变化 | 插件 MAJOR |
| 新增插件路由、端口方法或权限键 | 插件 MINOR |
| 插件内部实现 | 插件 PATCH |
| 内核 SDK 或上下文的不兼容变化 | `KERNEL_API_VERSION` +1 |

schema 规则与版本相互作用：

- 迁移只前进；已经应用过的迁移一个字都不能改。
- 破坏性 schema 变更（删列、删表、没有兼容路径地改类型）必须是 MAJOR，并带迁移路径；不能塞进 MINOR 或 PATCH。
- MINOR 或 PATCH 里的 schema 变更必须至少向后兼容上一个版本：加可空列或表，或双写。

## 5. 发布流程

一次发布是一个原子事件：tag。

1. 从发布线上的干净工作区开始。`git status --porcelain` 必须为空。
2. 按第 4 节选下一个版本。不要手改 `package.json`。
3. 运行发布脚本（dry-run 只打印计划，不写文件）：

```bash
npm run release -- patch
npm run release -- minor
npm run release -- 2.1.0-rc.1
npm run release -- patch --dry-run
```

4. 脚本会拒绝脏工作区、与 manifest 相同的版本，以及 tag 已存在的版本。它跑验收门（`check`、`test`、`api:surface:check`、`guard`），写回 `package.json` 与 `package-lock.json`，插入 CHANGELOG 骨架，提交 `release: vX.Y.Z`，并创建 annotated tag。除非传 `--push`，否则它不推送。
5. 填写 CHANGELOG 小节 —— 改了什么、为什么 —— 必要时用 amend 补进发布提交。
6. 推送提交与 tag（`git push origin HEAD:main --follow-tags`，或使用 `--push`）。推送 tag 才是发布。
7. CI 跑验收门（类型检查、API 面、小程序类型检查、护栏、测试），用 `bash pack.sh` 构建归档，写出 `SHA256SUMS`，并创建或更新 GitHub Release，正文取该版本的 CHANGELOG 小节。

除非维护者明确要求，不要运行发布脚本、推 tag 或发布 Release。

## 6. 一次发布产出什么

- `think-class-release.zip` 加 `SHA256SUMS`。两者都必需；缺校验和就是发布失败。
- 产物文件名里不含版本号；tag 是序列号，GitHub Release 是承载版本的容器。
- 发布说明来自该版本的 CHANGELOG 小节。
- 预发布 tag 在 GitHub 上标记为 prerelease；`releases/latest` 与更新检查都会跳过它们。
- 本项目不发布 npm 包，不使用 semantic-release 或 release-please，也不把版本号写进前端构建产物。

部署端会校验校验和，缺失就拒绝更新。已安装版本是 `.env` 里的 `CURRENT_VERSION`，不是被跟踪的源码文件。

## 7. CHANGELOG 规则

- 最新小节以 `## [X.Y.Z] - YYYY-MM-DD` 开头，并且必须与 `package.json` 一致（G19）。不许出现 `## [Unreleased]` 小节：那会破坏检查。
- 使用 `### Added`、`### Changed` 与 `### Fixed`；写「为什么」，而不只是「改了什么」。
- 发布脚本插入骨架，人来填写。GitHub Release 正文从这个小节提取。
- 名为 `release-notes-vX.Y.md` 的文件是发布脚本出现之前的历史存档。不要新增这种文件。

## 8. 禁止的做法

- 手改 `package.json` 或 `package-lock.json` 里的版本号。
- 移动、删除或复用 tag；给 manifest 里不存在的版本打 tag。
- 修改 CHANGELOG 顶部让它与 `package.json` 不一致，或增加 `[Unreleased]` 小节。
- 在脏工作区上发布，或发布 manifest 里已有的版本。
- 把 `CURRENT_VERSION=<版本号>` 写进被跟踪文件；它是运行时状态。
- 把当前应用版本抄进文档。写「读 `package.json`」或给出命令。
- 使用构建元数据或任意后缀代替 `-rc.N`。
- 发布 npm 包或引入发布机器人。
- 在 MINOR 或 PATCH 里做破坏性 schema 变更。

## 9. 强制与检查

[`tests/guardrails/version-consistency.test.ts`](tests/guardrails/version-consistency.test.ts) 里的护栏 G19 检查：

1. `package.json.version` 是合法 semver。
2. CHANGELOG 顶部小节等于 `package.json.version`。
3. 没有 tag 高于 `package.json`。
4. 发布产物名在部署脚本、`pack.sh`、更新器与 CI 里完全一致。
5. `pack.sh` 仍然打包 `packages/` 与 `plugins/`。
6. 被跟踪文件里没有 `CURRENT_VERSION=<版本号>` 字面量。

另外：

- [`scripts/release.mjs`](scripts/release.mjs) 会拒绝脏工作区、相同版本与已存在的 tag。
- 发布工作流在打包前跑验收门。
- 文档标准护栏检查本规范与它的中文译本存在、结构同步，并且进了索引。

## 10. 回滚与补救

- 应用回滚：保留上一版目录与 `CURRENT_VERSION`；切回目录、恢复版本标记并重启。不要碰数据库。
- 数据库不支持回滚：迁移只前进。schema 变更必须至少兼容上一个版本；破坏性变更等到 MAJOR。
- 发错了用下一个 PATCH 修。tag 不可变：不要删除或移动它。GitHub Release 可以标为 prerelease 或删除，但部署端可能已经装上了，所以修复仍然是一个新版本。
