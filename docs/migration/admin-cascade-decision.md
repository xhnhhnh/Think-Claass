# 跨域级联删除的裁决 · `DELETE /api/admin/users/:id`

> **状态**：已裁决（第 9 轮 / P4.3b.14）
> **用途**：HANDOFF §1.1 的第一个交付物。它回答的是**一个架构分叉**，不是一个实现细节：
> `deleteTeacherCascade` 要如何在「一张表一个写者」的模型下继续存在。
> **结论**：**方案 B（插件注册自己的清理规则，由运行时在一个事务里执行）**，但 B 的原始表述里
> 「内核要按名字执行业务表的删除」这一条**被否决并被更弱的边界取代** —— 见 §4 与 §5。

---

## 1. 事实（先量，再判）

| 实测事实 | 出处 |
|---|---|
| 级联涉及 **58 张表 / 79 条语句**（63 写 16 读），全部在**一个** `prisma.$transaction` 里 | `scripts/migration/probes/admin-cascade-inventory.mjs`（本轮用容忍换行的复算修正了它的 65/2 计数，见 §8） |
| 它是**唯一**绕过 `DbApi` 所有权检查的写路径 | `api/modules/admin/admin.repository.ts:183-595` |
| 它删的行横跨 **18 个已迁插件域 + 内核** | `scripts/migration/probes/admin-cascade-fk-coverage.mjs` + 逐表 ownership 清单 |
| 级联要删的 58 张表里，**50 张有主、8 张无主**（其中 `operation_logs` 属内核，另 7 张没有任何插件） | `plugins/*/plugin.json` 的 `data.adopted` 全表投影 |
| 这 58 张表之间的外键图：**84 条边、0 个环、没有孤立表** | `.tmp/cascade-fk-graph.mts`（一次性探针，本轮的判据依据） |
| `users` 被 61 张表引用，级联唯一漏掉的是 `blind_boxes.teacher_id` | `admin-cascade-fk-coverage.mjs` |
| 插件连接与 Prisma 连接**不是同一条连接**；`DbApi.tx()` 是 better-sqlite3 的同步事务，嵌套即 savepoint | `packages/plugin-runtime/src/dbApi.ts:145`、`packages/kernel/src/storage/connection.ts:33` |

**判据（HANDOFF §1.1 指定）**：`half-deleted account` 这个状态能不能接受。

**不能接受**，理由不是审美：删一半的账号会留下**引用已删 `users` 行的学生/班级行**，
而 `PRAGMA foreign_keys` 在插件连接上是 **ON** 的 —— 那意味着下一次任何触碰这些行的写入都会
以 `FOREIGN KEY constraint failed` 失败，而且失败点离根因很远（一个删了一半的教师会让
某个班再也加不了学生）。所以裁决的前提是：**保留原子性**。

---

## 2. 三个方案与结论

| 方案 | 得到什么 | 付出什么 | 裁决 |
|---|---|---|---|
| A. 各域发布级联删除端口 | 所有权 100% 成立 | 要给约 15 个域各设计删除方法；**端口是 async 的，65 次调用 = 65 个独立事务**（better-sqlite3 的事务函数不能返回 Promise，见 §3） | ❌ 否决 |
| B. 插件按脚本注册清理规则，运行时按序执行 | 保留原子性；每张表只有一个清理者；表名仍然只在拥有者手里 | 需要一个新的 SDK 面 + 运行时执行器；**必须给 G5 一个正式边界** | ✅ **采用** |
| C. 暂不迁，只收窄债务 | 不动现状 | `admin` 继续是唯一绕过所有权模型的写者；P7 的表改名被它堵死 | ❌ 否决（A 的代价可以避免，C 的代价不能） |

**A 被否决的真实原因不是"要写 15 个方法"，而是它救不回原子性**：
契约里的端口方法都是 `async`，而 `DbApi.tx()` 包的是 better-sqlite3 的**同步**事务
（`db.transaction(fn)`，回调返回 thenable 会直接抛 `Transaction function cannot return a promise`）。
一个 `async` 端口方法在第一个 `await` 之前的语句确实落在调用方的事务里，之后的就不在了 ——
**这正好是最坏的一种失败：看起来事务包住了，实际没有**。要让 A 成立，得把十几个端口方法全部
改成同步签名并禁止内部 await，那是一条只能靠约定维持的边界。

---

## 3. 为什么 "65 次调用 = 65 个事务" 这句话对 A 成立、对 B 不成立

- 级联今天跑在 **Prisma 的** 连接上（`prisma.$transaction`），而 `DbApi` 跑在 **内核的**
  better-sqlite3 连接上。**两者之间不可能共享事务**。所以"照抄成端口调用"必然散成多条事务。
- 方案 B 的执行器与插件规则跑在**同一条连接**上（`ctx.db` 就是内核那条连接），
  所以一个 `db.transaction` 能包住全部 18 个域、58 张表的删除 —— 这是 B 保留原子性的**机制**，
  不是承诺。
- 规则函数**必须同步**：执行器会检查返回值是不是 thenable，是就抛错。这条检查是下面 §6 护栏的一部分。

---

## 4. 采用的机制（B 的具体形状）

### 4.1 SDK 面（`packages/plugin-sdk`）

```ts
export interface CleanupSubject {
  teacherIds: number[];
  classIds: number[];
  studentIds: number[];
  userIds: number[];
}
export interface CleanupRule {
  /** 本规则会删除的表。每一张都必须已在本插件 manifest 的 data.tables/adopted 里声明。 */
  tables: string[];
  /** 同步执行；`tx` 是本插件自己的、受所有权检查的 DbApi。 */
  run(tx: DbApi, subject: CleanupSubject): void;
}
export interface CleanupApi {
  register(rule: CleanupRule): void;
  /** 在一个事务里执行全部已注册规则。 */
  run(subject: CleanupSubject): void;
}
```

### 4.2 运行时执行器（`packages/plugin-runtime/src/cleanupRegistry.ts`）

1. **注册期校验（fail-closed，与"声明即许可"一致）**：
   - `tables` 必须非空，且每张表都在本插件的 `ownedTables`（`data.tables ∪ data.adopted`）里；
   - **同一张表不得被两个插件认领**（`redemption_tickets` 的双写例外因此也必须指定唯一的清理者）；
   - `run` 的返回值不得是 thenable。
   违反任一条 → `setup()` 失败 → 插件被拒绝启动（不是运行时静默降级）。
2. **排序**：从 `PRAGMA foreign_key_list` 读**真实的外键图**，把规则按"子表先于父表"拓扑排序。
   这样做的原因不是洁癖：`peer_reviews` 的删除要用 `SELECT id FROM assignments ...` 里派生出来的
   id，而 `assignments` 的删除也在同一批规则里 —— 顺序错了，派生集合就是空的，
   结果是**留下孤儿行**（有外键时在 COMMIT 抛错，没外键时静默）。排序由 schema 决定，
   不由人手维护一张顺序表。同级用 slug 字典序做确定性 tie-break；出现环则抛错（当前图为 0 环）。
3. **执行**：`db.transaction(() => { for (const rule of ordered) rule.run(rule.api, subject) })()`。
   FK 检查保持**立即**（不用 `defer_foreign_keys`）：顺序错了就当场失败并整体回滚 —— 失败要响。

### 4.3 内核自己的表（`operation_logs`）

`operation_logs` 是内核的存储（`0005_kernel_operation_logs`），不是任何插件的。
它的清理与写入走**内核自己的 API**，而不是注册表：

```ts
export interface AuditApi {
  /** 与调用方的写入同事务地记一条审计行（旧的 logAdminMutation 就是这样的单元）。 */
  record(entry: { action; detail?; actorId?; teacherId?; role?; ip? }): void;
  /** 删除归属于这些 user/teacher 的审计行（账号删除的一部分）。 */
  purgeFor(ids: { teacherIds: number[]; userIds: number[] }): number;
}
```

`ctx.audit.record` 同时补上了一个一直缺的能力：目前插件想记审计只能 `emit('kernel.request.audit')`，
那是**脱离事务**的，而"删掉账号"和"记录这次删除"在旧实现里是**一个单元**（`tests/plugins/admin-cascade.test.ts:172-176`
专门记下了这件事）。

### 4.4 无主表的归属（8 张里除内核外 7 张）

| 表 | 新主人 | 理由 |
|---|---|---|
| `attendance_records` `leave_requests` `parent_students` `point_presets` `student_groups` | `classroom` | 它已经在读这 5 张表，其中 5 张它**已经在用 `ctx.rawDb` 写**（其 `_known_debt` 逐条记着）；考勤/请假/家长绑定/积分预设本来就是班级域 |
| `notes` `rubric_point_scores` | `learning` | 与它已拥有的 `papers`/`rubric_points` 同簇；`rubric_point_scores → rubric_points` 是外键 |
| `operation_logs` | 内核（§4.3，不进注册表） | 内核存储，`G5` 白名单里本来就有它 |
| `api_keys` `schools` | `admin` 自己 | 全仓唯一读写者就是 admin |
| `announcements` | **从 `engagement` 移到 `admin`** | admin 是**唯一写者**，engagement 只 `SELECT ... WHERE is_active = 1`；迁移所有权比新增一个只服务一个消费者的端口更诚实 |

净效果：`adoptedTables` 65 → **74** —— classroom +5 = 70、learning +2 = 72、admin +3（`api_keys`/`schools` 无主，
以及从 engagement 移来的 `announcements`）= 75、engagement -1 = 74。
棘轮上升按 HANDOFF §6 的规矩逐表写进 `allowances.json` 的注释 —— 这不是"迁域带来的增量"，
而是**给无主表找到主人**，P4.3b.7 的 `users`/`activation_*` 是同一类先例。

---

## 5. G5 的正式边界（HANDOFF 要求"一个正式的说法"）

HANDOFF 给方案 B 记的代价是：「内核要**按名字执行**业务表的删除，与 G5（内核零业务知识）的张力
需要一个正式的说法」。**本裁决不接受那个形状**，理由是 G5 的实现是可执行的
（`tests/guardrails/kernel-has-no-domain-knowledge.test.ts:131-136` 会扫
`packages/kernel/**` 与 `packages/plugin-runtime/**` 里的 `FROM|INTO|UPDATE|JOIN <表名>`，
白名单只有内核自己的表）。把 58 个表名放进运行时，G5 会当场变红 —— 而且它是对的。

**采纳的边界**：

> **机制在运行时，知识在插件。**
> 运行时知道「有一批规则、每张表只有一个认领者、按外键图排序、在一个事务里跑」——
> 这些都与业务无关；它**一个业务表名都不出现**。
> 表名只出现在**拥有那张表的插件**自己的代码里（`plugins/<slug>/src/<slug>.cleanup.ts`），
> 并且注册时被校验为该插件已声明的表。

**这条边界是可以被测试钉住的**（不是文档承诺）：
- G5 继续扫运行时目录，任何表名回流到 `packages/**` 都会红；
- 新增护栏要求**注册表里的表集合精确等于**旧级联删过的 58 张（见 §6），
  少了哪张表就直接点名 —— 于是"把表名集中到一处"这个 B 的好处被换成了更好的东西：
  **每张表都有唯一的主人，而覆盖性是机器检查的。**

---

## 6. 护栏（必须能变红；HANDOFF §1.1 的硬性要求）

1. **覆盖性**（`tests/plugins/cascade-coverage.test.ts`）：
   真启动一个插件宿主，取注册表里全部规则的 `tables`，断言它**精确等于**
   `admin-cascade-inventory.mjs` 量出的 58 张表减去内核自理的 `operation_logs`（**57 张**）。
   多一张（认领了表却没清理）或少一张（漏了清理）都报错并点名。
   **变异验证（已做）**：注释掉 `plugins/pet` 的 `ctx.cleanup.register(...)` →
   断言立刻报 `expected [ 'pets' ] to deeply equal []`。
2. **机制的载荷性 / 不许静默退化**（`tests/plugins/admin-cascade.test.ts` 的真库用例）：
   在**禁用 `pet` 插件**的宿主上执行同一个删除，断言它**整体失败**（500）且**一行都没被删**。
   **变异验证（已做）**：在 `plugins/admin` 的删除流程里插一句硬编码的
   `DELETE FROM pets WHERE student_id IN (…)`（即"绕过注册表自己删"）→ 该断言报
   `expected 200 to be 500`。这正是"机制失效时必须报错，而不是静默退化成逐条删除"。
   互补用例也在同一文件里：同一个禁用宿主上，只要**没有行引用**这个账号，删除**照样成功** ——
   否则"禁用一个 feature 插件"就变成不可部署的配置。
3. **同步性**：规则返回 thenable 直接抛错（§3），由 `tests/plugins/cleanup-registry.test.ts` 覆盖
   （同时覆盖"越权声明被拒""一张表两个认领者被拒""环被拒""失败整笔回滚""subject 归一化"）。

### 6.1 一处**新量出来的既有隐患**（本轮不修，写明）

`shop_items` 按 `teacher_id` 删、而 `redemption_tickets` 只按 `student_id` 匹配（两条语句与旧实现逐字相同）。
于是一张 `student_id` 为 NULL 或不在范围内、却指向该教师商品的兑换券，会让整笔删除因
`redemption_tickets.item_id -> shop_items.id` 失败。它是**既有设计**（旧谓词一模一样），
且可达（`engagement` 的幸运抽奖 ITEM 奖品会把 `prize_value` 写成 item id）。
修它意味着按 `item_id` 也删一遍 —— 那是**改哪些行会死**，不是重构，所以留给拥有该决定的一轮。
记录在 `plugins/marketplace/src/marketplace.cleanup.ts` 的注释与 §8。

---

## 7. 代价（诚实记账）

1. **新增一个 SDK 面**（`ctx.cleanup`、`ctx.audit`）与一个运行时执行器 —— 这是本裁决真正付出的东西，
   换来的是"所有权成立 + 原子性保留 + 表名不过界"三者同时成立。
2. **18 个插件各多一个文件**（`<slug>.cleanup.ts`）与 `setup()` 里一次注册。
   每条的 SQL 都从 `admin.repository.ts` 的对应语句**逐字搬**，不重写语义。
3. **外键图排序是隐式契约**：某张表将来去掉外键、而派生 id 依赖它时，顺序会失去保证。
   缓解：§6.1 的覆盖性 + §6.2 的载荷性两条护栏；`peer_reviews → assignments` 这条依赖在代码注释里点名。
4. **`ctx.audit.purgeFor` 仍让内核知道"账号删除要带走审计行"**。这是内核自己的表与语义，
   但值得记下来：如果将来决定"审计历史应当比它描述的记录活得更久"（内核 `auditLog.ts:64-79` 的注释倾向于此），
   那这里的一句话就该删掉 —— 那是产品决定，不是重构。
5. **`blind_boxes.teacher_id` 仍不被清理**（61 张引用 `users` 的表里唯一一张）。
   它是 P7 的 schema 漂移项（该列永远是 NULL，没有任何代码写它），本轮**不动**，也不假装它被覆盖。

---

## 8. 顺带修正的事实（文档与事实冲突时以事实为准）

1. `admin-cascade-inventory.mjs` 的正则要求 `tx.<table>.<op>` 在同一行，
   而 13 处调用写成 `tx.assignments\n  .findMany(`，所以它报的 **"65 条语句 / 2 读"是格式产物**：
   容忍换行的复算是 **79 条语句 / 16 读 / 63 写**。**58 张表这个数字是对的**，各处引用不必改，
   但"65"这个数只应出现在它自己的输出里。
2. `plugins/system/plugin.json:32` 写着 admin 的 `GET|PUT /api/admin/system/settings`
   "writes the same table"（`system_settings`）—— **不成立**：admin 走 `prisma.settings`（表 `settings`），
   `plugins/system` 用的是另一张 `system_settings`。两表不同，HANDOFF §9 的 P5.3c 记录也是这么说的。
   本轮不改 `system_settings` 的归属（删路由是端点变更），但把这条错记改正。
3. HANDOFF §8.3.1 写 `praises` 表无主 —— 它已由 `plugins/engagement` adopt（P4.3b.10）。
4. `api/modules/admin/admin.repository.ts` 是 **1046 行**，不是文档里的 940 行。

---

## 9. 本轮范围声明

**在范围内**：本裁决、`ctx.cleanup` / `ctx.audit` 机制与护栏、18 条清理规则、7 张无主表的归属、
`plugins/admin`（14 个文件的迁移，其中用户/激活码/设置/审计/维护各自走端口或内核 API）、
删除 `api/modules/admin/**`（`api/modules/` 随之为空）、`api:surface` 保持 297、两套组装真启动。

**不在范围内**（各自一轮）：P4.3c.3、P5 前端收尾、P6 运行期安装、P7 清理
（`blind_boxes.teacher_id`、`api/services/UserService.ts`、19 个 `enable_*` 列、`src/api/*` 死文件）。
