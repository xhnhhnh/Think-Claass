# 启动提示词 · 复制粘贴到全新对话即可

> 用途：在**完全空白的对话**里接续 ThinkClass 重构。
> 不依赖任何历史对话上下文 —— 下面代码块里的内容就是全部所需。

---

```
【任务】ThinkClass「最小 Core 内核 + 无限 Plugins」架构重构（长期目标）

请先调用 create_goal 创建一个长期目标，然后自动持续执行、每轮交付一个可验证的
完整片段，直到 P7 全部完成，中途不要停下来问我是否继续。

目标一句话：把现有前端、后端、数据库与整体架构重构为真正的
Core → Plugin Runtime → Plugin API/SDK → Plugins。

────────────────────────────────────────
【工作区】
  D:\think-class        分支：refactor/plugin-kernel
  原始仓库 D:\ThinkClass\Think-Claass-main 是只读参照，不要动它。

【唯一权威入口】
  D:\think-class\docs\migration\HANDOFF.md     ← 先完整读它，再动手
  同目录下还有逐阶段详细记录：
    00-baseline.md（基线度量）        01-kernel.md（内核 + 一项技术验证的结论）
    02-contracts-and-auth.md（契约与认证）  03-plugin-runtime.md（插件运行时）
    04-capabilities-and-domains.md（能力系统 / 审计 / game 拆分）

【开工前必做：三条核对命令】
  cd D:\think-class
  git log --oneline -3
  git status --short
  npm test
用输出核对 HANDOFF.md 里的「现状」和「验证状态」两节。
⚠️ 工作区是事实，文档只是叙述。文档与事实冲突时以事实为准，并顺手把文档改对。
⚠️ 如果 git status 不干净，说明上一轮被中断在半途：先判断是「已完成但未提交」
   还是「改坏了」，再决定继续还是回退。不要按"它应该做到哪一步"往下做。

【每轮硬性要求】
  提交前必须全部通过：
    npm run check
    npm test
    npm run api:surface -- --check     ← 端点数必须是 288，不能变
    npm run guard
  完成后提交，提交信息写清「为什么」，尤其是与直觉相反的设计约束。

────────────────────────────────────────
【已完成，不要重做】
  P0  基线冻结 + 8 条防伪护栏
  P1  最小内核（packages/kernel）+ 工作区骨架 + 动态装配控制器可行性验证
  P2  契约收口（src/shared → packages/contracts）+ 真实会话认证（替换可伪造的请求头）
  P3  插件运行时（packages/plugin-runtime）+ SDK + 两个参考插件
  P4.1 能力系统：19 个硬编码 enable_* 列 → 按作用域寻址的 capability_assignments
  P4.2 审计下沉：四条硬编码路径的匹配器 → 描述符注册表 + 内核 sink
  P4.3a 拆掉 game 上帝模块（741 行 6 个域 → 六个独立域模块）

【剩余工作，按顺序】
  P4.3b 把六个域及其余后端域真正迁成插件（plugins/<domain>/）
        —— HANDOFF.md §8 有详细步骤、两个必须先解决的结构问题、推荐迁移顺序
  P4.3c api/db.ts 的 78 条启动期 DDL 收编为编号迁移
  P5    前端插件化（注册表驱动路由/菜单/插槽，删 62 个一行 shim）
  P6    运行期安装/升级/第三方隔离（worker）
  P7    清理（31 个死文件、7 个死 repository、19 个 enable_* 列、兼容层）

────────────────────────────────────────
【环境约束（很重要）】
  · 网络完全不可用（npm registry / github 均 TLS 失败）
    → 不能加任何依赖，不能 pnpm install。只能用现有 node_modules。
  · node v24 / npm 12 / pnpm 11
  · 测试直接跑即可（此前沙箱受限需要提权，现在文件策略是 full-access）

【容易踩的坑（HANDOFF.md §10 有完整列表）】
  · 前端不能 import @thinkclass/kernel（会把 express/better-sqlite3 打进浏览器包）
  · 端点快照目前只扫 api/**；域迁进 plugins/** 后若不扩展扫描范围，
    端点数会「假性减少」—— 那是陷阱不是进展
  · 迁移期间 deadCode 和 adoptedTables 会上升，这是预期的；全部迁完才归零
  · 插件集合是启动的输入：启停/装卸一律重启（有技术验证结论支撑，别试图热插拔）
  · 内核不得含业务知识；contracts 包不得含运行时代码（都有护栏强制）

【已知的真实缺陷模式（前几轮都是这样抓到的，请继续这么做）】
  测试失败或类型检查报错时，优先怀疑是真 bug，而不是改测试。
  前几轮 10+ 个真实缺陷全部由「跑起来」暴露：凭据降级、审计表外键、
  边界包装器分不清「返回空」与「抛异常」、语义化版本 ^1 解析失败、
  插件目录被扫两遍、六个控制器共用的 helper 没跟着拆分走。
```

---

## 使用说明

1. **整段代码块**复制粘进新对话的第一条消息。
2. 如果它没有自动创建目标，补一句「请调用 create_goal 创建长期目标再开始」。
3. 如果它没跑那三条核对命令就开始改代码，把那段再发一次 ——
   这三条命令是上一轮一次真实事故换来的（叙述说"还没删目录"，实际早删了，
   而真正的问题叙述里一个字都没提）。
