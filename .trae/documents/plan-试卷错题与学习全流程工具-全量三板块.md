## Summary

将你列出的“三大板块”能力按可落地的工程边界拆成一套可持续迭代的系统：以“试卷/题目/知识点图谱/错题本/学习计划”为数据底座，先跑通从试卷录入→作答/录分→题目级学情画像→提分路径/冲刺计划→错题专练→知识点图解/笔记工具的全链路，再逐步接入 OCR/STT/LLM 等外部 AI 能力（通过 Provider 抽象，默认先用 Mock/手工校对工作流）。

## Current State Analysis（基于仓库现状）

- 已有“考试”仅支持考试元信息+学生分数与评语，不包含题目结构与题目级作答数据：[exams.ts](file:///d:/ThinkClass/Think-Claass-main/api/routes/exams.ts)、[schema.prisma](file:///d:/ThinkClass/Think-Claass-main/prisma/schema.prisma#L248-L262)
- 已有“题库 question_bank”字段非常少（题干/选项/答案/解析），没有知识点/难度/题型细分等元数据：[schema.prisma](file:///d:/ThinkClass/Think-Claass-main/prisma/schema.prisma#L446-L456)
- 已有 Analytics 以班级/学生维度做聚合，但没有“试卷题目级学情/错题本/考点覆盖”的数据源：[analytics.ts](file:///d:/ThinkClass/Think-Claass-main/api/routes/analytics.ts)
- 路由挂载与错误处理模式：全局 errorHandler + asyncHandler/ApiError，角色来自请求头 `x-user-role/x-user-id`：[app.ts](file:///d:/ThinkClass/Think-Claass-main/api/app.ts)、[requestAuth.ts](file:///d:/ThinkClass/Think-Claass-main/api/utils/requestAuth.ts)
- 前端请求与状态模式：`src/api/*` + `src/hooks/queries/*`（React Query），页面在 `src/pages/*`：[App.tsx](file:///d:/ThinkClass/Think-Claass-main/src/App.tsx)

## Assumptions & Decisions（已由本次对话锁定）

- 规划范围：覆盖“三大板块”全量功能，但实现拆为多期迭代（先打通底座与闭环，再做高级 AI/图解/协作等）。
- 试卷输入：同时支持“教师手工组卷”和“上传 PDF/图片”，上传侧允许“先存档 + 人工校对结构化结果”，OCR 解析通过 Provider 预留接口分期接入。
- 知识点能力：采用“层级图谱 + 前置依赖”模型；后续所有提分路径/覆盖率/举一反三均基于该图谱计算。

## Proposed Changes（按迭代期拆解，决策已完备）

### Milestone 0：数据底座与通用能力（所有后续功能的前置）

1) 数据模型（Prisma + initDb 同步）
- 目标：新增“试卷结构、题目元数据、知识点图谱、作答明细、错题本、学习计划、笔记/图解产物”等表，使功能不依赖 LLM 也能闭环。
- 修改文件
  - 扩展 Prisma 模型：[schema.prisma](file:///d:/ThinkClass/Think-Claass-main/prisma/schema.prisma)
  - 同步 SQLite 建表/索引：[db.ts](file:///d:/ThinkClass/Think-Claass-main/api/db.ts)
- 新增/调整的核心模型（命名建议为 snake_case，贴合现有 schema）
  - `subjects`：学科字典（避免字符串散落；允许按年级/学段区分）
  - `knowledge_nodes`：知识点节点（`id, subject_id, name, code?, parent_id, level, importance?, created_at`）
  - `knowledge_edges`：知识点边（`from_node_id, to_node_id, edge_type(prerequisite|related), weight?`）
  - `questions`：题目主表（用于通用题目，不与现有 `question_bank` 强耦合；也可以迁移/对齐其字段）
    - 字段：`stem, type, options_json?, answer_json?, explanation?, difficulty(1-5), is_subjective, default_points`
  - `question_knowledge`：题目-知识点关联（`question_id, node_id, weight`）
  - `papers`：试卷（`teacher_id, class_id?, subject_id, title, source(manual|upload), total_points, exam_date?, created_at`）
  - `paper_assets`：试卷原始文件（`paper_id, kind(pdf|image|audio), storage_path, mime, size, sha256, created_at`）
  - `paper_sections`：试卷分区（大题/模块）（`paper_id, title, order_no`）
  - `paper_items`：试卷题目实例（支持同题多次出现与分值覆盖）
    - `paper_id, section_id?, question_id, order_no, points_override?, difficulty_override?, rubric_json?`
  - `paper_submissions`：学生作答记录（`paper_id, student_id, started_at, submitted_at, total_time_sec`）
  - `paper_answers`：题目级答案与判分（`submission_id, paper_item_id, answer_json, score, is_correct, time_spent_sec, error_type?, created_at`）
  - `rubric_points`：大题采分点（`paper_item_id, label, points, keywords_json?, step_order`）
  - `rubric_point_scores`：采分点得分（`answer_id, rubric_point_id, score, reason?`）
  - `wrong_questions`：错题主表（`student_id, question_id, first_wrong_at, last_wrong_at, wrong_count, mastery_score, cleared_at?`）
  - `wrong_question_attempts`：错题训练记录（`wrong_question_id, practice_source(similar|variant|paper), is_correct, spent_sec, created_at`）
  - `study_plans`：学习/冲刺计划（`student_id, target_exam_date?, target_score?, status, created_at, updated_at`）
  - `study_plan_items`：计划任务（`plan_id, kind(learn|practice|review|mock), knowledge_node_id?, question_id?, due_date?, estimated_min, status`）
  - `notes`：课堂笔记（`student_id/teacher_id, class_id?, subject_id?, source(audio|text|image), raw_asset_id?, content_text, created_at`）
  - `note_products`：笔记增强产物（`note_id, kind(summary|mindmap|cards|timeline|compare_table|flowchart), payload_json`）
  - `knowledge_products`：知识点图解产物（`knowledge_node_id, kind(mindmap|flowchart|compare_table|timeline|tree), payload_json`）

2) Provider 抽象（为 OCR / STT / LLM 留扩展点）
- 目标：不把外部 AI 能力硬编码到业务逻辑；默认实现为 Mock/禁用提示 + 人工校对流。
- 新增目录（建议）
  - `api/services/aiProviders/*`（LLM：路径规划、笔记润色、模板生成等）
  - `api/services/ocrProviders/*`（试卷 PDF/图片结构化）
  - `api/services/sttProviders/*`（课堂音频转文字）
- 配置入口：复用 `settings`（管理员可开关/选择 provider），同时允许 env 指定密钥（不入库、不日志输出）。

3) 文件存储与访问
- 目标：支持 PDF/图片/音频上传存档，后续 OCR/STT 从存档文件异步处理。
- 后端：新增 `uploads/` 目录规则与静态服务（如 `app.use('/uploads', express.static(...))`），并限制 MIME/大小（与现有 `express.json` 10mb 上限协调）。
- 安全：只允许已登录且有权限用户访问与其关联的资源（如试卷仅教师/班级可见）。

### Milestone 1：试卷系统（结构化试卷 + 题目级数据）

1) 教师端：试卷管理与组卷
- 新增页面
  - `src/pages/Teacher/Papers.tsx`：试卷列表、创建、导入、发布
  - `src/pages/Teacher/PaperEditor.tsx`：手工组卷（分区/题目/分值/难度/知识点绑定/采分点编辑）
  - `src/pages/Teacher/KnowledgeGraph.tsx`：知识点图谱管理（层级 + 依赖边）
- 新增路由：在 [App.tsx](file:///d:/ThinkClass/Think-Claass-main/src/App.tsx) 的 `/teacher/*` 下挂载 `papers/*`、`knowledge/*`。
- 前端 API 与 Query
  - `src/api/papers.ts`、`src/hooks/queries/usePapers.ts`
  - `src/api/knowledge.ts`、`src/hooks/queries/useKnowledge.ts`

2) 学生端：试卷练习/作答（可先做“录入答案+计时”，不必一开始就 OCR）
- 新增页面
  - `src/pages/Student/Papers.tsx`：可练习试卷列表（按班级/学科）
  - `src/pages/Student/PaperAttempt.tsx`：按题作答、计时、提交
- 与现有 FeatureRouteGuard 接入：新增 feature key（如 `enable_paper_practice`）。

3) 后端 API
- 新增路由（按现有模式挂载到 [app.ts](file:///d:/ThinkClass/Think-Claass-main/api/app.ts)）
  - `/api/papers`：CRUD、上传资产、发布状态、试卷详情（含 section/item/rubric）
  - `/api/knowledge`：图谱 CRUD（node/edge）、查询（按 subject/grade）
  - `/api/paper-submissions`：开始作答、保存草稿、提交、读取解析结果
- 权限：教师仅管理自己/自己班级的试卷；学生仅访问自己班级公开的试卷；管理员可全局读写。
- 统一错误：使用 [asyncHandler/ApiError](file:///d:/ThinkClass/Think-Claass-main/api/utils/asyncHandler.ts)（沿用现有约定）。

### Milestone 2：试卷分析与提分方案（对应“一-1”全链路）

1) 全维度学情画像（题目级→知识点级→学科级）
- 计算输入：`paper_answers`（正确率、耗时、错误类型、难度层级）、`question_knowledge`（映射到知识点）
- 输出结构（建议保存到 `analysis_snapshots` 或按需实时计算）
  - 知识点掌握度：Bayesian/EMA 更新（考虑对错与时间衰减）
  - 答题时长画像：题型/难度分布 + 相对班级分位
  - 错误类型画像：知识型/能力型/习惯型/心态型（先规则映射：如耗时过长+低分→时间管理；主观题采分点缺失→规范性）

2) 提分潜力评估
- 目标分数差距→分摊到知识板块
- 公式建议：`潜力 = (重要性权重 * (1 - 掌握度)) * 分值贡献`，输出优先级队列
- 需要的数据：知识点重要性（`knowledge_nodes.importance`）、试卷分值映射（`paper_items`）

3) 个性化提分路径（“先学什么、后练什么”）
- 在“图谱+前置依赖”的约束下进行排序：
  - 先补前置节点，再补当前弱项节点，再安排练习/复盘
  - 产出落库到 `study_plans/study_plan_items`

4) 考点覆盖率诊断
- 基于 `paper_items` 关联的知识点集合，统计覆盖率与盲区
- 支持“已掌握/未掌握/未覆盖”三态（未覆盖：从未在任何 paper_items 或练习中出现）

5) 同类试卷推荐（分期）
- 近期阶段先做“结构相似推荐”的检索式推荐：
  - 相似度 = 题型分布 + 难度分布 + 知识点集合 Jaccard
  - 数据源：平台内已有试卷库（`papers`）
- 后续可接入外部真题/名校卷（需要版权与内容导入机制）。

6) 成绩趋势分析 / 班级横向对比 / 动态计划 / 效果追踪
- 趋势：复用现有 `exams/student_exams` 作为“总分趋势”，并把新 `paper_submissions` 作为“题目级趋势”补充曲线。
- 横向对比：默认以“同班匿名分位数”实现；年级对比需要补“年级”数据模型（后续在 `classes` 或 `schools` 维度扩展）。
- 动态计划：每次提交新试卷/练习后触发“掌握度更新→重算 plan_items”。
- 报告：新增教师/学生/家长报告卡片（可先 JSON 输出，前端渲染；PDF 导出后续加）。

### Milestone 3：大题得分点拆解器（对应“一-2”）

1) 采分点标注与步骤拆解
- 教师在 `PaperEditor` 为主观题维护 `rubric_points`（步骤/分值/关键词）
- 系统在学生提交后：
  - 自动做关键词命中检测（基于 `keywords_json` 与简单分词/包含匹配）
  - 输出阅卷视角解析（规则模板：命中/缺失哪些关键词、哪些步骤得分）
- 分层赋分模拟：同一题输出“基础/进阶/满分”模板
  - 初期可由教师在编辑端录入 3 个模板；后续再接入 LLM 自动生成

2) 常见失分预警 + 时间优化
- 汇总班级维度 `rubric_point_scores`（缺失最多的步骤即常见失分点）
- 时间建议：按分值权重×历史耗时分布给出建议时间比例

### Milestone 4：失分原因分析器 + 错题专练（对应“一-3/一-4/一-5”）

1) 失分类型分类（知识/能力/习惯/心态）
- 规则优先：
  - 知识型：同知识点连续多次错误
  - 能力型：主观题采分点缺失集中在“方法/推导”类步骤
  - 习惯型：审题/格式类错误（教师可选标签 + 系统规则触发）
  - 心态型：时间压力下错误率显著上升（后半题耗时异常、正确率异常）
- 允许教师/学生在错题条目上二次确认标签（作为训练数据沉淀）

2) 错题本与举一反三
- 错题落库：每次 `paper_answers` 产生错误时 upsert `wrong_questions`
- 同考点相似题推荐
  - 先用平台内 `questions`：同知识点节点、同题型、难度相近
- 变式题生成（分期）
  - 初期：教师可配置“数值替换规则/条件变换模版”（结构化生成）
  - 后续：LLM Provider 生成变式并进入“教师审核后发布”
- 错题组卷：从 `wrong_questions` 选择 + 派生题合成 `papers`（source=generated）
- 掌握度动态监测：错题训练正确后提升 mastery_score，达标降低推送频率

3) 题感训练
- 新增训练模式（学生端）：
  - 限时秒杀：从指定知识点集合抽题，短时间阈值
  - 直觉判断：选择题/数值范围题（需要题目支持范围答案）
  - 干扰项辨识：选择题专用（需要 `options_json` 标注干扰项类型，分期）
- 题感评分：`题感 = 速度分位 * 正确率加权`，并做曲线追踪

### Milestone 5：学习全流程效率工具（对应“二”）

1) 考前冲刺计划器
- 输入：考试日期、目标分数、当前掌握度（知识点图谱）、每日可用时间
- 输出：`study_plans/study_plan_items`（按四阶段：基础巩固→专项突破→模拟实战→考前调整）
- 前端：新增 `src/pages/Student/Plan.tsx`（日历/进度条），家长端只读摘要（可选）
- 导出 PDF（分期）：引入前端 PDF 生成库或后端渲染（待选型后落地）

2) 课堂笔记生成器（STT 分期）
- MVP：支持上传音频/图片/文本，先存 `notes` + `paper_assets`
- STT Provider 接入后：异步生成 transcript，自动识别重点段落（规则：重复词/教师强调词，或 LLM）

3) 学习笔记增强器
- MVP：基于模板/规则输出：
  - 速览版：按段落长度压缩 + 关键词高亮（规则）
  - 知识卡片：按知识点节点拆卡（从 notes 里匹配关键词/节点别名）
- LLM Provider：用于润色、补全、跨学科关联（走“生成→人工确认→入库”）

4) 课文预习单生成、费曼学习法工具
- 作为“内容生成类工具”统一接到 `aiProviders`：
  - 预习单：输入文本→输出目标/背景/问题链/自测题/打印版
  - 费曼：多轮对话记录到 `study_sessions`（需新增表），输出掌握度评分与漏洞点
- MVP 不依赖 LLM：提供结构化表单 + 规则化追问流程

### Milestone 6：知识点深度学习与思维拓展工具（对应“三”，含“融入系统”）

1) 知识点讲解助手（分层讲解）
- MVP：基于知识点节点的教师维护内容（`knowledge_node_notes`）输出三档版本
- LLM Provider：自动生成“三档讲解 + 生活化类比 + 误区预警 + 互动问答”

2) 图解知识点（概念图/流程图/对比表/时间轴/树）
- 统一产物格式：`payload_json`（包含 `mermaid` 文本或图结构 JSON）
- 前端：新增通用渲染组件 `src/components/KnowledgeDiagram/*`
  - Mindmap/Tree：可选用 mermaid mindmap 或自研 SVG 树
  - Flowchart/Timeline：优先用 mermaid（需要新增依赖 `mermaid`）
  - Compare Table：直接用表格渲染（无需依赖）
- 编辑能力（分期）：先只读渲染；后续支持在 UI 上拖拽调整并回写 payload

## API & Data Flow（关键接口定义）

- `POST /api/papers`：创建试卷（manual/upload）
- `POST /api/papers/:id/assets`：上传 PDF/图片/音频（返回 assetId）
- `POST /api/papers/:id/structure`：保存结构化结果（sections/items/rubric/knowledge links）
- `POST /api/paper-submissions/start`：创建 submission（返回 submissionId）
- `PUT /api/paper-submissions/:id/answers`：保存作答草稿（支持逐题保存）
- `POST /api/paper-submissions/:id/submit`：提交并触发分析（同步基础判分，异步 OCR/LLM）
- `GET /api/analysis/students/:studentId/papers/:paperId`：试卷分析报告（画像/潜力/路径/覆盖）
- `GET /api/wrong-questions/students/:studentId`：错题本列表（支持按知识点/题型/时间筛选）
- `POST /api/practice/wrong-questions/:id/generate`：生成相似/变式题（MVP 可返回题库相似题）

## Frontend Integration（页面与入口）

- Teacher
  - `/teacher/papers`：试卷库与导入
  - `/teacher/papers/:id/edit`：组卷/采分点/知识点绑定
  - `/teacher/knowledge`：知识图谱管理
  - `/teacher/analysis/papers`：新增“试卷分析”入口（与现有 `/teacher/analysis` 并存）
- Student
  - `/student/papers`、`/student/papers/:id`：练习与提交
  - `/student/wrong-questions`：错题本与举一反三
  - `/student/plan`：冲刺计划/每日任务
  - `/student/notes`：笔记与图解（分期）
- Parent
  - `/parent/report`：增加“试卷维度”摘要卡片（仅读）

## Verification（实施后如何验收）

1) 数据与迁移
- 运行初始化后新表可创建，旧功能（考试/挑战/分析）不受影响。
- 新增 Prisma 模型与 [db.ts](file:///d:/ThinkClass/Think-Claass-main/api/db.ts) 建表语句一致（字段/索引）。

2) 核心闭环（M1 + M2 最小可用）
- 教师能创建试卷→手工录入题目/绑定知识点/设置分值与采分点→发布。
- 学生能进入试卷→逐题作答（含计时）→提交后能看到分数与基础解析。
- 系统生成：知识点掌握度、盲区列表、提分优先级、学习计划（可在学生端查看任务列表）。

3) 错题闭环（M4 最小可用）
- 错题自动进入错题本；能基于同知识点推荐相似题；训练记录能反哺掌握度与推送频率。

4) 图解能力（M6 MVP）
- 知识点页面可生成/展示至少两种图解（树状图 + 流程图或概念图），并可关联到笔记/计划。

## Rollout Strategy（上线策略）

- 通过 `settings` 增加独立开关（如 `enable_paper_system`, `enable_wrong_questions`, `enable_notes_tools`），默认关闭，逐步对班级/角色放量。
- 先灰度给教师端（数据录入与结构校对）再开放学生端练习入口，降低脏数据风险。

