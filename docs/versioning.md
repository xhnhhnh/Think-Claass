# 版本管理方案 · Think-Class

> **状态**：已定稿并落地（P4.3b.15 之后的「版本管理」轮）
> **适用**：`xhnhhnh/Think-Claass`（公开仓库）、`install.sh` / `update.sh` 部署链路、管理端「网站更新」页面
> **取代**：此前"手工改 package.json + 手工打 tag + 手工建 Release"的流程 —— 那套流程的三个断点见 §9

---

## 1. 原则

1. **一个事实源**：`package.json` 的 `version`。**其它任何地方都不许再写一遍版本号**（历史遗留的 `release-notes-vX.Y.md` 只作为存档，不再驱动任何东西）。
2. **发布是一次原子事件**：`git tag vX.Y.Z` 就是"这一版发布了"。tag 一旦推送即不可变；改版本 = 发新版本。
3. **产物可校验**：Release 必须同时带 `think-class-release.zip` 与 `SHA256SUMS`；客户端**校验失败就拒绝更新**（部署脚本以 root 运行解压出来的脚本，裸 zip 是不可接受的）。
4. **版本与数据库迁移绑定**：迁移只能前进、已应用的迁移一个字都不能改（这是 `runMigrations` 的 checksum 契约，见 `docs/migration/HANDOFF.md` §9）。
5. **自动化优先于纪律**：能机器检查的就不写进规范。见 §8 的 G19。

---

## 2. 版本号规则

### 2.1 应用版本（`package.json` / tag / Release）

| 段位 | 什么时候 +1 | 本仓实例 |
|---|---|---|
| **MAJOR** | 部署方式或运行前提发生**不兼容变化**：需要人工改配置/迁移数据、环境变量变必填、HTTP 面被移除或改语义 | `2.0.0`：`ENCRYPTION_KEY` 变成必填（缺了就报错）、`api/modules/**` 被清空、全部域改为插件装配 |
| **MINOR** | 新增功能、新增路由、新增插件，旧部署可以不改配置直接升级 | 例：新增 `plugins/insights`、`api:surface` 从 292 → 297 |
| **PATCH** | 修 bug、内部重构，对外行为与部署方式不变 | 例：`fix: make both data paths open the same SQLite file` |
| **预发布** | `vX.Y.Z-rc.N`：要上线验证但还不算发布 | 给灰度机器用；`releases/latest` **不会**指向预发布 |

判定口诀：**"老机器不改任何东西能不能直接升？"** 能 → MINOR/PATCH；要动配置或数据 → MAJOR。

### 2.2 内核 API 版本（`KERNEL_API_VERSION`）

与 app 版本**解耦**。它只描述"插件能用到的那套 SDK/上下文"是否兼容：

- 只增不改（例如 P4.3b.14 新增 `ctx.cleanup`/`ctx.audit`/`ctx.maintenance`）→ **不动**，仍是 `1`；
- 删方法、改语义、改 manifest 必填字段 → `+1`，此时所有插件的 `kernel` 范围要跟着改，`npm run check` 与运行时解析器都会拒绝不匹配的插件。

### 2.3 插件版本（各 `plugins/<slug>/plugin.json`）

插件有自己的 semver，与 app 版本无关：

- **MAJOR**：它对外发布的端口（`<slug>.public`）发生不兼容变化；
- **MINOR**：新增路由/端口方法/权限键；
- **PATCH**：实现内改动。

`dependsOn` 里写的是**范围**（`"classroom": "^1.0.0"`），所以 MINOR/PATCH 升级不会打断依赖者。当前所有插件都是 `1.0.0` —— 这是重构期的起点，不是目标；第一个真正改端口的插件应当把版本提上去。

---

## 3. 事实源与各自的角色

| 位置 | 角色 | 谁写 | 能否手改 |
|---|---|---|---|
| `package.json` → `version` | **唯一版本源** | `npm run release` | 只能通过 release 脚本 |
| `git tag vX.Y.Z` | **发布事件**（不可变） | `npm run release --push` | 不能改；错了就发下一版 |
| `CHANGELOG.md` | 面向人的变更说明（保留"为什么"） | release 脚本生成骨架 + 人工补内容 | 可以，但**顶部条目必须等于 package.json 版本**（G19 检查） |
| GitHub Release | 分发载体：`think-class-release.zip` + `SHA256SUMS` | CI（tag 推送触发） | 只由 CI 写 |
| `release-notes-vX.Y.md` | 历史存档（v1.5–v1.7 时代的手写说明） | 冻结 | 不再新增 |
| `.env` → `CURRENT_VERSION` | **现场状态**（"这台机器现在跑哪一版"） | `install.sh` / `update.sh` | 是运行时数据，**不入库**（G19 会拦住把版本号写进被跟踪文件） |

---

## 4. 一次发布做什么

```bash
npm run release -- patch|minor|major|2.1.0   # 默认 dry-run，加 --push 才推
```

脚本（`scripts/release.mjs`）按顺序做 6 件事，任何一步失败就整体停止：

1. 工作区必须干净（`git status --porcelain` 为空）；
2. 跑验收门：`npm run check`、`npm test`、`npm run api:surface -- --check`、`npm run guard`；
3. 计算新版本号，写回 `package.json`；
4. 在 `CHANGELOG.md` 顶部插入 `## [X.Y.Z] - YYYY-MM-DD` 骨架（Added/Changed/Fixed + "为什么"）；
5. `git commit -m "release: vX.Y.Z"`；
6. `git tag -a vX.Y.Z -m ...`，并在 `--push` 时 `git push origin HEAD:main --follow-tags`。

**然后交给 CI**（`.github/workflows/release.yml`，tag 触发）：

1. `npm ci` → `npm run check` → `npm test` → `API_SURFACE_CHECK`；
2. `bash pack.sh` 打出 `think-class-release.zip`；
3. `sha256sum think-class-release.zip > SHA256SUMS`；
4. 创建/更新该 tag 的 Release，附上两个文件，正文取 CHANGELOG 对应段落。

**CI 的价值不是省事，而是"发布产物=通过验收的那棵树"**：手工打包时没有任何东西保证你打的包和测试过的代码是同一份。

---

## 5. 发布产物必须包含什么

`pack.sh` 现在打的是**运行期**需要的东西（P4.3b.15 修过一次：此前它漏了 `packages/` 与 `plugins/`，
按那个清单发出来的包**没有内核、没有插件**，部署起来等于空壳）：

```
dist/            前端构建产物
api/             应用侧：server、db、schema/迁移链、maintenance、app.module
packages/        kernel / plugin-sdk / plugin-runtime / contracts  ← 插件架构的运行时
plugins/         全部插件（含各自 plugin.json 与迁移）            ← 运行时按目录发现
prisma/          引擎与 schema（G13 的漂移检查依赖它）
scripts/deploy-common.sh
package.json / package-lock.json / tsconfig.json
install.sh / update.sh
（可选）ecosystem.config.cjs —— PM2 配置
```

**不包含**：`src/`（前端源码，已构建进 `dist/`）、`tests/`、`.tmp/`、`node_modules/`。
G19 会断言 `pack.sh` 的清单里出现 `packages` 与 `plugins` —— 这条断言就是防止"重构完把插件漏在包外"再发生一次。

---

## 6. 客户端更新链路（发现 → 校验 → 应用）

```
GET /repos/xhnhhnh/Think-Claass/releases/latest      → tag_name、assets[]
比较 tag > .env:CURRENT_VERSION（semver 比较，见 plugins/admin/src/admin.update.ts）
GET  .../releases/latest/download/think-class-release.zip
GET  .../releases/latest/download/SHA256SUMS         → 必须存在
sha256sum -c                                         → 不匹配就 die，不覆盖现场
解压 → 保留上一版目录 → 重启 PM2 → 写回 .env:CURRENT_VERSION
```

四条硬规则：

1. **校验失败即中止**（fail-closed）。`SHA256SUMS` 缺失也中止 —— 这正是 P4.3b.15 之前的漏洞：`download_release_zip` 只 curl 一个裸 zip，而部署机上跑的就是它解出来的脚本。
2. **先落盘再替换**：解压到临时目录，迁移/构建步骤成功后才切换；失败保留旧版本。
3. **预发布不参与"最新版"**：`releases/latest` 天然忽略 prerelease；`admin.update.ts` 已有 `hasUpdate` 比较，保持只认正式版。
4. **没有 Release 时状态要诚实**：仓库刚重建，v1.7.0 的 tag 存在但没有 Release —— 管理端显示 `hasUpdate: null` 并说明原因，而不是报"已是最新"（这一条已写进 `admin.update.ts` 的语义）。

---

## 7. 回滚

- **应用回滚**：保留上一版目录 + `.env` 里的 `CURRENT_VERSION`；回滚 = 切回目录 + 改回版本号 + 重启，**不碰数据库**。
- **数据库不可回滚**：迁移只前进。所以任何带 schema 变更的版本都必须**向后兼容一个版本**（加列可空、加表、双写），删列/改类型留到再下一个 MAJOR。
- **发布错误**：tag 不可变，因此"撤回"= 发一个 PATCH 修回去；GitHub Release 可以标 `--prerelease` 或删除，但**不要删 tag**（客户端可能已经装上了）。

---

## 8. 护栏 G19（`tests/guardrails/version-consistency.test.ts`）

规范里能机器检查的部分全部变成断言，任何一条红都说明版本管理已经漂移：

1. `package.json.version` 是合法 semver；
2. `CHANGELOG.md` 顶部条目 == `package.json.version`（**本轮之前是 1.6.7 vs 1.7.0，已在补 2.0.0 条目时一并修正**）；
3. 不存在版本**高于** `package.json` 的 `vX.Y.Z` tag（tag 领先 = 有东西发布了却没改版本）；
4. 发布产物名在所有地方一致：`scripts/deploy-common.sh`、`pack.sh`、`update.sh`、`plugins/admin` 的 `DEFAULT_ASSET_NAME`、CI workflow；
5. `pack.sh` 的清单包含 `packages` 与 `plugins`；
6. 被跟踪文件里不出现 `CURRENT_VERSION=<版本号>` 字面量（那是现场状态，不该入库）。

---

## 9. 旧流程的三个断点（为什么换掉它）

| 断点 | 事实 | 后果 |
|---|---|---|
| 产物打错 | `pack.sh` 不含 `packages/`、`plugins/` | 插件化之后发出来的包**没有内核与插件**，装上去是空壳 |
| 没有发布动作 | 仓库从无 `.github/workflows`，Release 全部无 asset（实测 `assets: []`） | `releases/latest/download/think-class-release.zip` 永远 404 → **自动更新从来没通过** |
| 没有一致性检查 | `package.json`=1.7.0 而 CHANGELOG 顶部=1.6.7；版本号散落在 tag、release-notes、`.env` | 漂移无人发现，直到上线才暴露 |

---

## 10. 落地清单（本轮已做）

- `scripts/release.mjs` —— 一条命令发版（含四道验收门）；
- `.github/workflows/release.yml` —— tag → 验收 → 打包 → 校验和 → Release；
- `pack.sh` —— 补齐 `packages/`、`plugins/`（**这是最重要的修复**）；
- `scripts/deploy-common.sh` —— `download_release_zip` 强制校验 `SHA256SUMS`；
- `tests/guardrails/version-consistency.test.ts` —— G19 六条断言；
- `CHANGELOG.md` —— 补 `2.0.0` 条目，版本号升到 `2.0.0` 并打 tag。

**不做的事**：不引入 semantic-release / release-please（需要一个额外的机器人账号与依赖），
不把版本号写进前端构建产物（`window.__TC_CONFIG__` 只下发运行时配置），
不在 CI 里做 `npm publish`（本项目不分发 npm 包）。
