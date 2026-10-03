# 50 · 上线坐标与 AI 能力（部署前必读）

本文档解决两件在提报期最容易卡住的事：

1. **小程序到底要填哪几个坐标才能连上线上后端**，这些值在控制台的哪一页。
2. **本项目的 AI 能力是什么、怎么打开、以及"接入微信 AI 生态"这条路现在能不能走**。

其余技术步骤在 [10 云托管](10-deploy-cloudrun.md) / [20 自有服务器](20-deploy-selfhosted.md) /
[30 发布](30-release-miniprogram.md)；竞赛约束在 [00 清单](00-competition-checklist.md)；
逐步操作在 [05 行动手册](05-action-plan.md)。

> 一句话结论（先看这条，能省一天）：**微信 AI 开发模式目前不接受代码提审，官方明确要求不要合入正式版。
> 所以它不能用来冲 10.17 的上线，本项目本轮不接。** 详见第 4 节。

---

## 1. 上线坐标速查（Track A 云托管）

小程序连后端只认 [`miniprogram/config/index.ts`](../../miniprogram/config/index.ts) 里的四个常量。
其中三个只在 `TRANSPORT === 'container'` 时被读取：

| 常量 | 取值 | 在哪拿到 |
| --- | --- | --- |
| `TRANSPORT` | `'container'` | 固定值，改字面量 |
| `CLOUD_ENV` | 环境 ID，形如 `prod-xxxxxxxx` | [微信云托管控制台](https://cloud.weixin.qq.com/) → 选中小程序 → **环境**列表 / 环境概览页 |
| `CLOUD_SERVICE` | 服务名称，部署时填的那个（本文按 `think-class`） | 同一环境下的**服务列表** → 服务名 |
| `BASE_URL` | 仅 `TRANSPORT === 'request'` 时生效（本机联调用） | 不改 |

`CLOUD_SERVICE` 会被放进 `X-WX-SERVICE` 请求头：一个环境可以挂多个服务，平台靠它决定 `/api` 由谁应答
（[`miniprogram/utils/request.ts:131`](../../miniprogram/utils/request.ts)）。

### 改完长这样

```ts
// miniprogram/config/index.ts
export const TRANSPORT: 'request' | 'container' = 'container'
export const CLOUD_ENV = 'prod-xxxxxxxx'      // ← 控制台里的环境 ID
export const CLOUD_SERVICE = 'think-class'    // ← 控制台里的服务名
```

### 改完必须同时满足（否则真机一定失败）

- [ ] `DEV_LOGIN_OPENID = ''` —— 非空值是一个**绕过微信的身份断言**，生产环境必须为空。
- [ ] `MOCK.enabled === false` —— 打开后 `utils/request.ts` 会改问假数据，界面正常但后端是错的。
- [ ] 云托管环境的**环境变量**里**不要**设 `WECHAT_ALLOW_DEV_LOGIN`（服务端在
      `NODE_ENV=production` 下也会拒绝开发登录，这是双保险）。
- [ ] 云托管服务**单副本**（最小 = 最大 = 1）：SQLite 只有一个写者。
- [ ] 已挂 CFS 到 `/data`，`DATABASE_FILE=/data/database.sqlite`、`DATABASE_SKIP_WAL=1`、
      `UPLOADS_DIR=/data/uploads`。

### 自检顺序（从后往前排障，别跳步）

```bash
# 1) 后端自己活着吗（本地/自建域名时）
curl -s https://<域名>/api/health          # 期望 200 且 success: true、plugins.total > 0

# 2) 容器里数据库在哪、是不是回滚日志模式（云托管控制台 → 服务 → 终端）
ls -l /data/database.sqlite
sqlite3 /data/database.sqlite "PRAGMA journal_mode; PRAGMA integrity_check;"   # delete / ok

# 3) 小程序侧：开发者工具编译，控制台里不应再出现「云托管未配置：请在 config/index.ts 填写
#    CLOUD_ENV 与 CLOUD_SERVICE」——这条提示就是坐标没填全时的守卫。
```

> 坐标没填全时**不会崩**：[`request.ts:125`](../../miniprogram/utils/request.ts) 会明确告诉你缺哪两个值。
> 这是刻意设计 —— 一个静默失败的请求，比一条指名道姓的错误难查得多。

---

## 2. 本项目的 AI 能力：三件事，都有实现

竞赛评审里「AI 应用创新」计入 **30 分的产品创新性**，所以这一节也是提报材料的弹药库。
三件事都能在仓库里找到出处，写材料时可以逐条对应：

| 能力 | 它到底做什么 | 边界（这是创新点，不是限制） | 出处 |
| --- | --- | --- | --- |
| **AI 判分** | 客观题由确定性函数判分；主观题、简答题在有参考答案时才交给模型 | 模型**不可用时降级为 mock 并在 200 响应里说明原因**，绝不编造分数；`score` 可为 `null`，表示"这道题需要老师" | [`plugins/homework/src/homework.ai.ts`](../../plugins/homework/src/homework.ai.ts) |
| **AI 智学（个性化练单）** | 规则引擎按 `masteryGap / repeatMiss / weakNode / difficultyFit / freshness` 五个整数权重挑出"今天该练哪几题"，每题带**为什么选它** | 模型**只被允许重排顺序和改写理由**，永远不能往里加题；没有模型时规则引擎独立成立，不是"降级版" | [`plugins/ai-study/src/ai-study.engine.ts`](../../plugins/ai-study/src/ai-study.engine.ts)、[`ai-study.ai.ts`](../../plugins/ai-study/src/ai-study.ai.ts) |
| **教师智学看板** | 按班级汇总集体薄弱知识点，勾选学生一键派单 | 汇总由本地规则完成，**不调用模型**，所以永远可用 | [`src/features/ai-study/pages/TeacherAiStudyPage.tsx`](../../src/features/ai-study/pages/TeacherAiStudyPage.tsx) |

一句话卖点（可直接进介绍文档）：**"模型可选、规则兜底、模型不能凭空造题"——
一个默认离线可用、可解释、可复现的 AI 教学闭环，而不是给大模型套一层壳。**

---

## 3. 怎么把 AI 真的打开

配置有**三层，按此优先级**（[`resolveHomeworkProvider`](../../plugins/homework/src/homework.ai.ts)）：

```
环境变量  >  系统设置（超管后台）  >  内置默认值（mock）
```

默认值就是 `mock`，所以**一个没配任何东西的部署，AI 是关着的**——这一条必须在上线前处理掉，
否则评委看到的是一个"有 AI 页面但没有 AI"的作品。

### 路线 A（推荐）：环境变量

在云托管控制台的**环境变量**里加（或服务器 `.env`）：

```text
AI_PROVIDER=http
AI_BASE_URL=https://api.deepseek.com/v1     # 或任何 OpenAI 兼容端点
AI_API_KEY=<你的密钥>
AI_MODEL=deepseek-chat
AI_TIMEOUT_MS=20000
```

- 密钥**只填在服务端**，不要贴进聊天、issue、仓库或小程序端。
- 空值会被忽略（`AI_PROVIDER=` 不会把已配置的部署弄坏）。
- 接口是 **OpenAI 兼容**的 `POST {AI_BASE_URL}/chat/completions`，所以任何兼容端点都行。

#### 已实测通过的组合（LongCat）

```text
AI_PROVIDER=http
AI_BASE_URL=https://api.longcat.chat/openai/v1
AI_API_KEY=<longcat 的 ak_... 密钥>
AI_MODEL=LongCat-2.5-Preview
AI_TIMEOUT_MS=60000
```

实测证据：`POST /api/homework/:id/ai-grade` 单题 3.9–5.4 秒返回，`ai.source=http`、
`message` 为"已接入模型 LongCat-2.5-Preview"，简答题拿到 5/10 与 7/10 两次评分并给出了具体评语
（"缺少对'为什么相等'的具体解释，即分子分母同乘 2"）。

两个**必须照做**的注意点（否则会"看起来接上了、实际判不了分"）：

1. **模型名必须与 `GET /v1/models` 返回的 id 逐字一致**。写 `LongCat-2.5` 会被拒
   （`HTTP 400 Unsupported model`），而当前是 `LongCat-2.5-Preview` / `LongCat-2.0`。
   名字写错时**不是"AI 关着"，是每道题都判分失败**，界面上表现为一堆 `score: null` 加失败原因。
2. **推理模型会吃掉输出预算**。LongCat-2.5-Preview 是推理模型，实测一次简单改写用掉
   247 个 completion token，其中 **228 个是 reasoning token**。所以：
   - `AI_TIMEOUT_MS` 给足（60 秒），别用默认 20 秒；
   - 判分是**按题**逐次请求（`homework.ai.ts:755` 的循环），一份 5 题的作业就是 5 次调用，
     整体可能到半分钟量级 —— 演示时别以为卡死了。
   - 返回体里 `content` 与 `reasoning_content` 是分开的两个字段；本项目只读 `content`
     （`homework.ai.ts:732`），所以推理过程不会污染评分 JSON。

### 路线 B：超管后台

网页端 `/beiadmin` → **系统设置 → AI 判分与问答** → `AI 判分服务` 选
「OpenAI 兼容接口（需填写地址与密钥）」，填地址、密钥、模型名。密钥在读取时被打码，
后台不会把明文回显到浏览器。

### 打开后怎么确认它真的生效（别只看开关）

1. 后台那一栏会显示**解析后的实际来源**和降级原因。显示 `mock` + 一行原因 = 没配好
   （最常见的就是 `AI 服务未配置：缺少 ai_base_url`）。
2. 教师端打开一份含主观题的作业 → 用「AI 判分」→ 分数旁边应显示来源为模型。
3. 学生端「AI 智学」生成一份练单，题目理由应带模型改写过的措辞（规则引擎的理由是模板句，
   两者的差别可以直接看出来）。

---

## 4. 微信 AI 生态：现状与本项目的判断

竞赛规程第 2 页明确写着"**鼓励小程序作品接入微信 AI 生态，接入后小程序将有机会被微信 AI 推荐和调用**"，
所以这是一条真实的加分项。它对应的官方能力叫**小程序 AI 开发模式（beta）**。

### 现状（官方原文）

来自[《小程序 AI 开发模式（beta）接入指南》](https://developers.weixin.qq.com/miniprogram/dev/ai/guide.html)：

> 当前处于内测阶段，**暂未开放小程序 AI 开发模式的代码提审**，提审时间将另行通知。
> **请勿将此模式相关代码合入正式版本提交审核**，以免影响正常版本发布。

来自[《评测指南》](https://developers.weixin.qq.com/miniprogram/dev/ai/evaluation-guide.html)：

> **向微信团队提交提审评测暂未开放。**（开发者自测已支持，在微信开发者工具里跑）

### 这意味着什么

本项目的硬约束是"**10.17 前必须通过微信公众平台正式上线**"。把 AI 开发模式的代码（`agent` 字段、
独立分包 SKILL）合进正式版，等于拿整个作品的参赛资格去换一个还打不开的功能。
**所以本轮不接，这是判断，不是遗漏。**

### 接入路径（等平台开放提审后照这个做）

先申请：**微信公众平台 → 基础功能 → AI 能力 → 接入模式选「开发模式」**
（或小程序「微信开发者助手 → 管理 → 微信AI管理」）。

技术要求（现在就可以核对，`miniprogram/app.json` 已经满足前提之一）：

| 要求 | 本项目现状 |
| --- | --- |
| 全局开启按需注入 `lazyCodeLoading` | ✅ `miniprogram/app.json` 已是 `"requiredComponents"` |
| 一个 SKILL 一个独立分包（`independent: true`） | ⬜ 待做 |
| `SKILL.md`（≤16000 字节）+ `mcp.json`（≤24000 字节）+ `index.js` + `components/` | ⬜ 待做 |
| 调试基础库 ≥ 3.16.1（评测用 3.16.2+）、开发者工具 Nightly、iOS 微信 ≥ 8.0.74（安卓待上线） | ⬜ 环境准备 |

结构示意（按官方接入文档，**不要**在正式版提审前提交）：

```jsonc
// app.json —— 只在 AI 开发模式的分支/版本里出现
{
  "lazyCodeLoading": "requiredComponents",
  "subPackages": [
    { "root": "ai/skills/practice", "independent": true, "pages": [] }
  ],
  "agent": {
    "instruction": "ai/AGENTS.md",          // 可选，≤10000 字节，全局提示词
    "skills": [
      {
        "name": "practiceSkill",
        "description": "按学生的错题与薄弱知识点生成一份可作答的练习单",
        "path": "ai/skills/practice/practiceSkill"
      }
    ]
  }
}
```

本项目最适合包装成 SKILL 的能力（都能只用小程序已有接口实现）：

| SKILL | 学生会怎么问 | 对应已有能力 |
| --- | --- | --- |
| `practiceSkill` | "帮我练一下分数加减法" | `services/aiStudy.ts` → 智学练单，含"为什么选这题" |
| `homeworkSkill` | "我今天还有什么作业没交" | `services/homework.ts` → 作业列表与截止状态 |
| `pointsSkill` | "我还差多少积分能换那个奖品" | `services/shop.ts` → 积分与兑换目录 |

**提审评测的硬门槛提前记下**：提交微信团队评测时，评测集的 Intent 数量需 **≥50 且 ≤100**，
且格式规范、原子接口覆盖度、用例复杂度与多样性**任一检测不过就不能继续**。这是将来的一件事，
不是今天的事 —— 但 SKILL 的设计要从一开始就为"能被 50 条真实意图打中"留余地。

### 相关的其它微信 AI 能力

- **智能对话（AI 语音）**：<https://developers.weixin.qq.com/doc/aispeech/platform/INTRODUCTION.html>
  —— 小程序内的语音交互能力，与本项目无冲突，可作为二期。
- 关键提醒：**没有任何一条是"今天申请今天就能进正式版"**。凡是需要新代码提审的，都要额外预留
  1–3 天审核，并且可能被驳回。倒排时间线时按 [00 清单第 1 节](00-competition-checklist.md#1-硬约束做不到就直接出局) 的算法留缓冲。

---

## 5. 提报前 AI 部分检查清单

- [ ] `AI_PROVIDER` / `AI_BASE_URL` / `AI_API_KEY` 已在服务端配置，且后台显示实际来源**不是** `mock`。
- [ ] 密钥**没有**出现在仓库、issue、聊天或小程序端（提交前 `git grep` 自查一遍）。
- [ ] 对一个真实班级打开 `enable_ai_study`（默认全关，见 [05 阶段 E](05-action-plan.md)），
      否则学生端和教师端的 AI tab **根本不出现**，演示时等于没有这个功能。
- [ ] 介绍文档里 AI 部分**用第 2 节的表格与边界表述**，不要写成"我们用了大模型"这种空话 ——
      "模型只能重排、不能加题"才是评委没见过的设计。
- [ ] 微信 AI 生态的那条：材料里如提及，只能写**已申请/规划中**，不要声称已接入（官方尚未开放提审，
      声称已接入属于与事实不符）。
