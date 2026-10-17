# 文档索引

[English](README.md) | 简体中文

> 本文是 docs/README.md 的中文译本，与英文版同步维护；如有冲突，以英文版为准。

本文是仓库文档的完整索引。[README.md](../README.md) 是产品、环境搭建、配置与部署的入口文档；
本索引覆盖其余部分：仓库根目录的入口文档、`docs/` 下的每一份文档、部署资产与历史记录。

## 权威顺序

两份来源冲突时，按以下顺序采信：

1. 工作区、`git` 与命令输出。
2. [AGENTS.md](../AGENTS.md) —— AI 智能体与维护者的工作约定。
3. [README](../README.md) 文档对 —— 产品、环境搭建、配置与部署。
4. 本索引与它所链接的文档。

所有会变化的数字 —— 端点数、插件数、用例数、棘轮额度、HEAD —— 都以命令输出为准，而不是文档：

```bash
npm run auth:audit     # 逐端点授权清单
npm run api:surface    # 当前 HTTP 面
npm test               # 完整测试套件及其用例数
npm run guard          # 护栏与棘轮数字
```

文档与其中任何一条命令的输出冲突时，以命令为准：在同一个改动里把文档改对。

本索引里有两份入口文档，它们的"状态"会滞后于工作区，而且文档自己也这么声明：

- [docs/migration/HANDOFF.md](migration/HANDOFF.md) 是架构重构的权威入口。它的"当前状态"、
  阶段进度与数字是写它的那次会话留下的快照；依赖它们之前，先用工作区、`git` 与上面的命令核对。
  它的规则、护栏与已知债务几节才是耐久的部分。
- [docs/security/route-authorization-matrix.md](security/route-authorization-matrix.md) 自己承认滞后于
  路由快照。`npm run auth:audit` 才是权威清单；矩阵是一份检查表，不是证明。

## 双语约定

- 长文档成对存在：同一路径下的 `X.md`（英文，权威）与 `X.zh-CN.md`（中文译本）。两份在同一个
  改动里一起编辑；两者冲突时，以英文文件为准。
- 一对文档保持相同的标题层级、相同的相对链接目标（对等的语言切换链接除外）与相同的代码围栏，
  这样结构可以机器比对。
- 仅一种语言的文档会在下表中标注。仅中文：迁移档案里的操作性文档、微信小程序文档、路由鉴权矩阵、
  版本管理设计记录与分支分工文档、更早的接口对接笔记与本地重新初始化指南。仅英文：P0–P4 阶段记录与若干
  更早的工程笔记。
- [LICENSE](../LICENSE) 只有英文。具有法律效力的是英文文本，不要翻译它。

## 入口文档

| 文档 | 它是什么 |
| --- | --- |
| [README.md](../README.md) ([简体中文](../README.zh-CN.md)) | 入口文档：产品概览、状态、架构、快速开始、配置、脚本、验收与部署 |
| [VERSIONING.md](../VERSIONING.md)（[简体中文](../VERSIONING.zh-CN.md)） | 版本序列号与发布规范：semver 规则、tag、插件与内核版本、唯一事实源 |
| [AGENTS.md](../AGENTS.md) ([简体中文](../AGENTS.zh-CN.md)) | AI 智能体与维护者的工作约定：权威顺序、红线、命令、改动流程、完成定义 |
| [CONTRIBUTING.md](../CONTRIBUTING.md) ([简体中文](../CONTRIBUTING.zh-CN.md)) | 本地环境、工作流、测试命令与 PR 流程 |
| [SECURITY.md](../SECURITY.md) ([简体中文](../SECURITY.zh-CN.md)) | 如何非公开地报告漏洞，以及部署方如何加固 |
| [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) ([简体中文](../CODE_OF_CONDUCT.zh-CN.md)) | 社区行为期望与执行方式 |
| [CHANGELOG.md](../CHANGELOG.md) | 面向用户的变更，每个版本一节（仅英文） |
| [LICENSE](../LICENSE) | MIT 许可证文本（仅英文；具有法律效力的是英文版） |

## 架构与重构

这些文档记录从单体 `api/` 到"最小内核 + 插件"架构的重构。
[docs/migration/HANDOFF.md](migration/HANDOFF.md) 是权威入口；阶段记录是它如何落地的证据，
不是对现状的陈述。

| 文档 | 它是什么 |
| --- | --- |
| [migration/HANDOFF.md](migration/HANDOFF.md) | 架构重构的权威入口：状态、作为验收标准的下一轮目标、护栏、已知债务。仅中文；状态会滞后 —— 用工作区、`git` 与上面的命令核对 |
| [migration/BOOTSTRAP_PROMPT.md](migration/BOOTSTRAP_PROMPT.md) | 粘进新会话以继续重构的提示词；刻意只写规则，不写状态。仅中文 |
| [migration/00-baseline.md](migration/00-baseline.md) | P0 —— 基线冻结：冻结的全绿基线、机器生成的度量与 HTTP 面快照 |
| [migration/01-kernel.md](migration/01-kernel.md) | P1 —— 内核与工作区骨架：一个零插件即可启动并提供基础设施端点的最小内核 |
| [migration/02-contracts-and-auth.md](migration/02-contracts-and-auth.md) | P2 —— 契约收拢与认证加固：契约只有一个家，身份来自真实会话 |
| [migration/03-plugin-runtime.md](migration/03-plugin-runtime.md) | P3 —— 插件运行时与参考插件：发现、manifest 校验、依赖解析、端口 |
| [migration/04-capabilities-and-domains.md](migration/04-capabilities-and-domains.md) | P4 —— 能力系统、审计下沉、`game` 拆分与"域迁成插件" |
| [migration/admin-cascade-decision.md](migration/admin-cascade-decision.md) | 跨域级联删除的裁决：由谁拥有、按什么顺序执行，以及为什么保留原子性。仅中文 |
| [architecture-refactor.md](architecture-refactor.md) | 更早的垂直分域重构笔记，早于内核/插件架构 |
| [modularization-boundary-audit.md](modularization-boundary-audit.md) | 模块边界审计，以及它留下的兼容面 |

## 工程规范

| 文档 | 它是什么 |
| --- | --- |
| [versioning.md](versioning.md) | 版本规则背后的设计记录：原因、发布流水线，以及历史断点。规范性摘要见仓库根目录的 `VERSIONING.md`。仅中文 |
| [branch-strategy.md](branch-strategy.md) | 分支策略：单主干（`main`）同时承载 Web 端、共享后端与 `miniprogram/` 里的小程序客户端；记录旧两条线如何汇合。仅中文 |
| [design-system.md](design-system.md) | 前端表现层：设计 token、UI-R 外壳契约、交互模型，以及把它们钉住的命令 |
| [security/route-authorization-matrix.md](security/route-authorization-matrix.md) | 逐端点鉴权矩阵。它自己承认滞后于路由快照 —— `npm run auth:audit` 才是权威。仅中文 |
| [api-integration-checklist.md](api-integration-checklist.md) | 历史的前端接口对接与测试清单。仅中文 |
| [four-end-feature-completion-matrix.md](four-end-feature-completion-matrix.md) | 四端功能完成度矩阵：超管、教师、家长与学生 |
| [second-batch-integration-matrix.md](second-batch-integration-matrix.md) | 第二批页面对接矩阵。仅中文 |
| [second-batch-integration-report.md](second-batch-integration-report.md) | 第二批页面对接报告。仅中文 |

## 运维

| 文档 | 它是什么 |
| --- | --- |
| [local-reinitialize.md](local-reinitialize.md) | 对尚未上线的本地实例做破坏性重新初始化：先校验备份，再生成新超管凭据与新加密密钥。仅中文 |

部署资产本身位于仓库根目录，不在 `docs/` 下：[deploy/](../deploy/)（微信云托管路线用的
Dockerfile 与 Nginx HTTPS 模板）、[install.sh](../install.sh)、[update.sh](../update.sh)
与 [pack.sh](../pack.sh)。操作步骤写在 [README.md](../README.md) 与
[docs/wechat/](wechat/README.md) 里。

## 微信小程序

这一组全部只有中文：微信小程序的部署、发布与竞赛提报文档。推荐 Track A（微信云托管）；
Track B（用 `install.sh` + Nginx + certbot 自建服务器）适用于已有服务器和已备案域名的情况。
客户端源码在本仓库的 `miniprogram/`，与 Web/后端同在 `main` 上。

| 文档 | 它是什么 |
| --- | --- |
| [wechat/README.md](wechat/README.md) | 小程序文档索引：Track A 与 Track B 的决策表、共同前置条件与文档地图 |
| [wechat/00-competition-checklist.md](wechat/00-competition-checklist.md) | 竞赛硬约束、时间线与材料清单 |
| [wechat/05-action-plan.md](wechat/05-action-plan.md) | 个人主体、无服务器、云托管路线的行动手册：一页速查与红线 |
| [wechat/10-deploy-cloudrun.md](wechat/10-deploy-cloudrun.md) | Track A —— 部署到微信云托管：不需要服务器、域名与域名备案 |
| [wechat/20-deploy-selfhosted.md](wechat/20-deploy-selfhosted.md) | Track B —— 自有服务器：`install.sh`、Nginx 与 certbot HTTPS |
| [wechat/30-release-miniprogram.md](wechat/30-release-miniprogram.md) | 小程序后台配置、真机预览、上传、审核、发布与回滚 |
| [wechat/40-troubleshooting.md](wechat/40-troubleshooting.md) | 排错清单：域名、证书、TLS、并发、会话与存储 |
| [wechat/50-ai-capability.md](wechat/50-ai-capability.md) | 上线坐标速查与本项目 AI 能力清单，含哪些能力本轮没有接 |
| [wechat/60-teacher-account-and-filing.md](wechat/60-teacher-account-and-filing.md) | 给非技术读者（老师）的分步说明：小程序注册与备案 |
| [wechat/submission/01-作品介绍文档-PDF源.md](wechat/submission/01-作品介绍文档-PDF源.md) | 提报材料 —— 作品介绍文档，PDF 源稿 |
| [wechat/submission/02-提审文案与测试账号清单.md](wechat/submission/02-提审文案与测试账号清单.md) | 提报材料 —— 提审文案、测试账号清单、截图与预置数据 |
| [wechat/submission/03-演示数据种子清单.md](wechat/submission/03-演示数据种子清单.md) | 提报材料 —— 演示与审核用的预置数据种子清单 |

## 接口参考

| 文档 | 它是什么 |
| --- | --- |
| [后端接口说明/API接口文档.md](../后端接口说明/API接口文档.md) | 接口参考笔记（仅中文）。HTTP 面本身由端点快照冻结；`npm run api:surface` 打印当前集合 |

## 历史记录

这些内容留作背景，不是当前指令；永远不要把它们当作状态引用。

- `.trae/documents/` —— 更早的 AI 会话写的计划。它们记录的是意图，不是工作区最后的样子。
- 仓库根目录的 `release-notes-v*.md` —— 发布脚本出现之前冻结的发布说明；已被
  [CHANGELOG.md](../CHANGELOG.md) 取代，不再驱动任何东西。
- `docs/migration/` 下的阶段记录（00–04，上面已链接）—— 重构如何落地的证据，不是当下的快照。

## 维护约定

- 每一份新增的 `docs/**/*.md` 都必须在同一个改动里加进本索引的两个语言版本。悄悄漏掉文件的索引
  比没有索引更糟。
- 成对的文档要一起编辑。只改英文会让 `.zh-CN.md` 副本失去同步，而 docs-standards 护栏会把这种
  情况当作失败。
- 生成物来自命令，不是手工编辑：路由模块、班级功能目录与端点快照分别由 `npm run route-modules`、
  `npm run class-features` 与 `npm run api:surface:update` 生成。文档描述输出，不生成输出。
- 过时的文档就是缺陷。在触及该区域的同一个改动里把它修对；如果修复不该属于这次改动，就说明并
  记录下来。
- 不要在文档里写会变化的数字 —— 插件数、端点数、用例数、棘轮额度、HEAD 哈希。改为写出产生该数字
  的命令；"权威顺序"一节里的命令就是事实。
- 文档与工作区冲突时，以工作区为准：把文档改对，并在提交信息里说明。
