/**
 * Offline fixtures for `MOCK.enabled` in `config/index.ts`.
 *
 * Reviewing a UI change in 微信开发者工具 without a running kernel is a real workflow, and the
 * alternative - every page carrying its own `if (MOCK)` branch - spreads fixtures through the
 * pages. Instead this module answers the *same* wire shapes the real routes answer, behind the
 * same envelope rules, so `utils/request.ts` treats it as one more transport and nothing above
 * it knows the difference.
 *
 * Deliberately self-contained: it declares its own request/response types rather than importing
 * them from `request.ts`, because `request.ts` imports this file - a typed cycle would compile
 * but makes the mock the thing that defines the transport's types.
 */

const MOCK_USER = {
  id: 7,
  username: 'xiaoming',
  role: 'student',
  name: '小明',
  studentId: 7,
  classId: 1,
  is_activated: true,
}

const MOCK_FEATURES: Record<string, boolean> = {
  enable_shop: true,
  enable_ai_study: true,
  enable_achievements: true,
  enable_lucky_draw: false,
  enable_challenge: true,
}

const MOCK_QUESTIONS = [
  {
    id: 11,
    assignment_id: 3,
    order_no: 1,
    type: 'single',
    stem: '下面哪一个是偶数？',
    options: [
      { id: 'A', text: '3' },
      { id: 'B', text: '7' },
      { id: 'C', text: '8' },
      { id: 'D', text: '9' },
    ],
    reference: { choice: ['C'] },
    explanation: null,
    points: 5,
    created_at: '2024-05-01 09:00:00',
  },
  {
    id: 12,
    assignment_id: 3,
    order_no: 2,
    type: 'blank',
    stem: '12 + 15 = ____',
    options: [],
    reference: { accept: ['27'] },
    explanation: null,
    points: 5,
    created_at: '2024-05-01 09:00:00',
  },
]

const MOCK_HOMEWORK = {
  id: 3,
  class_id: 1,
  teacher_id: 2,
  title: '第五单元 · 分数的意义',
  description: '做完课本 P42 的练习题，把过程写清楚。',
  due_at: '2024-05-20 20:00:00',
  status: 'published',
  total_points: 10,
  reward_points: 5,
  created_at: '2024-05-01 09:00:00',
  updated_at: '2024-05-01 09:00:00',
}

const MOCK_SUBMISSION = {
  id: 21,
  assignment_id: 3,
  student_id: 7,
  status: 'draft',
  submitted_at: null,
  score: null,
  total_points: 10,
  teacher_feedback: null,
  ai_feedback: null,
  ai_confidence: null,
  graded_by: null,
  created_at: '2024-05-02 19:00:00',
  updated_at: '2024-05-02 19:00:00',
}

const MOCK_SET = {
  id: 5,
  student_id: 7,
  class_id: 1,
  subject_id: null,
  source: 'self',
  status: 'open',
  engine_version: 1,
  created_at: '2024-05-02 19:00:00',
  updated_at: '2024-05-02 19:00:00',
  items: [
    {
      id: 31,
      question_id: 101,
      order_no: 1,
      reason: '上次这一类型的题目错了两次，今天再来一遍。',
      score: 12,
      factors: { wrong_recently: 6, weak_node: 4, level_fit: 2 },
      ai_ranked: false,
      question: {
        id: 101,
        type: 'single',
        stem: '把 3/4 化成小数，结果是？',
        options: [
          { id: 'A', text: '0.34' },
          { id: 'B', text: '0.75' },
          { id: 'C', text: '1.33' },
        ],
        points: 5,
        difficulty: 2,
      },
      answer: null,
    },
    {
      id: 32,
      question_id: 102,
      order_no: 2,
      reason: '这道题和你昨天的错题是同一个知识点。',
      score: 9,
      factors: { wrong_recently: 4, weak_node: 3, level_fit: 2 },
      ai_ranked: false,
      question: {
        id: 102,
        type: 'blank',
        stem: '一个正方形的边长是 5cm，它的周长是 ____ cm。',
        options: [],
        points: 5,
        difficulty: 1,
      },
      answer: null,
    },
  ],
}

const MOCK_AI_OUTCOME = {
  source: 'mock',
  available: false,
  confidence: null,
  message: '当前部署未配置模型，已使用规则结果。',
}

export interface MockRequestInput {
  method: string
  /** Path *with* the query string, exactly as the caller passed it. */
  path: string
  data?: any
  hasToken: boolean
}

export interface MockResult {
  statusCode: number
  data: any
}

function ok(data: any): MockResult {
  return { statusCode: 200, data }
}

function failure(statusCode: number, message: string): MockResult {
  return { statusCode, data: { success: false, message } }
}

/** One route table, checked in order; the first `match` wins. */
const ROUTES: Array<{ method: string; pattern: RegExp; answer: (input: MockRequestInput, match: RegExpExecArray) => MockResult }> = [
  {
    method: 'POST',
    pattern: /^\/api\/wechat\/login$/,
    answer: () =>
      ok({
        bound: true,
        token: 'mock-token-0001',
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        user: MOCK_USER,
        classFeatures: MOCK_FEATURES,
      }),
  },
  {
    method: 'POST',
    pattern: /^\/api\/wechat\/bind$/,
    answer: () =>
      ok({
        bound: true,
        token: 'mock-token-0001',
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        user: MOCK_USER,
        classFeatures: MOCK_FEATURES,
      }),
  },
  {
    method: 'GET',
    pattern: /^\/api\/wechat\/me$/,
    answer: (input) => (input.hasToken ? ok({ bound: true, user: MOCK_USER, classFeatures: MOCK_FEATURES }) : failure(401, '登录已过期，请重新登录')),
  },
  { method: 'POST', pattern: /^\/api\/wechat\/unbind$/, answer: () => ok({ unbound: true }) },
  { method: 'GET', pattern: /^\/api\/classes\/(\d+)\/features$/, answer: () => ok({ success: true, classId: 1, features: MOCK_FEATURES, pet_selection_mode: 'auto' }) },
  {
    method: 'GET',
    pattern: /^\/api\/students\/(\d+)\/summary$/,
    answer: () =>
      ok({
        success: true,
        summary: {
          studentId: 7,
          growth: 68,
          collaboration: 42,
          competition: 30,
          participation: 55,
          availableCredits: 120,
          level: '进阶学者',
          schoolStage: 'primary',
          parentBonusPercent: 10,
          parentBlessingActive: true,
        },
      }),
  },
  { method: 'GET', pattern: /^\/api\/students\/(\d+)$/, answer: () => ok({ success: true, student: { id: 7, class_id: 1, name: '小明', total_points: 260, available_points: 120 } }) },
  { method: 'GET', pattern: /^\/api\/students$/, answer: () => ok({ success: true, students: [
    { id: 7, class_id: 1, name: '小明', total_points: 260, available_points: 120 },
    { id: 8, class_id: 1, name: '小红', total_points: 310, available_points: 180 },
  ] }) },
  { method: 'POST', pattern: /^\/api\/students\/batch-points$/, answer: () => ok({ success: true, message: '已为 2 名学生加分', results: [] }) },
  {
    method: 'GET',
    pattern: /^\/api\/announcements\/active$/,
    answer: () => ok({ success: true, announcement: { id: 1, title: '本周五运动会', content: '请同学们穿好运动服，8:00 到操场集合。' } }),
  },
  { method: 'GET', pattern: /^\/api\/certificates$/, answer: () => ok({ success: true, certificates: [
    { id: 1, student_id: 7, student_name: '小明', title: '阅读之星', description: '本月共读 4 本书', created_at: '2024-04-28 10:00:00' },
  ] }) },
  { method: 'GET', pattern: /^\/api\/redemption\/my$/, answer: () => ok({ success: true, tickets: [
    { id: 1, item_name: '免写券', code: 'TC-8F2K', status: 'pending', created_at: '2024-05-01 12:00:00', used_at: null },
  ] }) },
  { method: 'GET', pattern: /^\/api\/shop\/items$/, answer: () => ok({ success: true, items: [
    { id: 1, name: '免写券', description: '可以免写一次作业', price: 50, stock: 10, is_active: 1 },
    { id: 2, name: '自习优先选座', description: '下周自习课优先选座位', price: 30, stock: 5, is_active: 1 },
  ] }) },
  { method: 'POST', pattern: /^\/api\/shop\/buy$/, answer: () => ok({ success: true, message: '兑换成功' }) },
  { method: 'GET', pattern: /^\/api\/homework\/my$/, answer: () => ok({ success: true, data: [
    { homework: MOCK_HOMEWORK, submission: MOCK_SUBMISSION, question_count: 2 },
    { homework: { ...MOCK_HOMEWORK, id: 4, title: '古诗背诵 · 静夜思', status: 'closed', due_at: '2024-04-20 20:00:00' }, submission: { ...MOCK_SUBMISSION, id: 22, assignment_id: 4, status: 'graded', score: 9 }, question_count: 3 },
  ] }) },
  { method: 'GET', pattern: /^\/api\/homework$/, answer: () => ok({ success: true, data: [{ ...MOCK_HOMEWORK, question_count: 2 }] }) },
  { method: 'POST', pattern: /^\/api\/homework$/, answer: () => ok({ success: true, data: { ...MOCK_HOMEWORK, questions: MOCK_QUESTIONS } }) },
  { method: 'GET', pattern: /^\/api\/homework\/(\d+)\/submissions$/, answer: () => ok({ success: true, data: [
    { submission: { ...MOCK_SUBMISSION, status: 'submitted' }, student_name: '小明' },
    { submission: { ...MOCK_SUBMISSION, id: 23, student_id: 8, status: 'graded', score: 10 }, student_name: '小红' },
  ] }) },
  { method: 'GET', pattern: /^\/api\/homework\/(\d+)$/, answer: () => ok({ success: true, data: { ...MOCK_HOMEWORK, questions: MOCK_QUESTIONS } }) },
  { method: 'POST', pattern: /^\/api\/homework\/(\d+)\/attempt$/, answer: () => ok({ success: true, data: { homework: { ...MOCK_HOMEWORK, questions: MOCK_QUESTIONS }, submission: MOCK_SUBMISSION, answers: [], photos: [] } }) },
  { method: 'PUT', pattern: /^\/api\/homework\/submissions\/(\d+)\/answers$/, answer: () => ok({ success: true, data: { homework: { ...MOCK_HOMEWORK, questions: MOCK_QUESTIONS }, submission: MOCK_SUBMISSION, answers: [], photos: [] } }) },
  { method: 'POST', pattern: /^\/api\/homework\/submissions\/(\d+)\/submit$/, answer: () => ok({ success: true, data: { homework: { ...MOCK_HOMEWORK, questions: MOCK_QUESTIONS }, submission: { ...MOCK_SUBMISSION, status: 'submitted', submitted_at: '2024-05-02 19:30:00' }, answers: [], photos: [] } }) },
  { method: 'GET', pattern: /^\/api\/ai-study\/my\/sets\/current$/, answer: () => ok({ success: true, data: { set: MOCK_SET, ai: MOCK_AI_OUTCOME } }) },
  { method: 'POST', pattern: /^\/api\/ai-study\/my\/sets$/, answer: () => ok({ success: true, data: { set: MOCK_SET, ai: MOCK_AI_OUTCOME } }) },
  { method: 'PUT', pattern: /^\/api\/ai-study\/sets\/(\d+)\/answers$/, answer: () => ok({ success: true, data: { set: MOCK_SET, ai: MOCK_AI_OUTCOME } }) },
  { method: 'POST', pattern: /^\/api\/ai-study\/sets\/(\d+)\/submit$/, answer: () => ok({ success: true, data: { set_id: 5, total: 2, correct: 1, pending: 1, items: [], ai: MOCK_AI_OUTCOME } }) },
  { method: 'GET', pattern: /^\/api\/ai-study\/classes\/(\d+)\/insight$/, answer: () => ok({ success: true, data: {
    class_id: 1,
    students_considered: 2,
    students_total: 2,
    weak_nodes: [{ node_id: 9, name: '分数的意义', importance: 3, wrong_count: 6, student_count: 2 }],
    suggestions: [{ student_id: 7, name: '小明', top_node_id: 9, top_node_name: '分数的意义', wrong_count: 3, open_set_id: null, reason: '近两次错题集中在这一节。' }],
    ai: MOCK_AI_OUTCOME,
  } }) },
  { method: 'POST', pattern: /^\/api\/ai-study\/classes\/(\d+)\/assign$/, answer: () => ok({ success: true, data: { class_id: 1, created: [{ student_id: 7, set_id: 9 }], failed: [], ai: MOCK_AI_OUTCOME } }) },
  { method: 'PUT', pattern: /^\/api\/auth\/profile$/, answer: () => ok({ success: true, user: MOCK_USER }) },
  { method: 'POST', pattern: /^\/api\/kernel\/auth\/logout$/, answer: () => ok({ success: true }) },
]

const FALLBACK: MockResult = { statusCode: 404, data: { success: false, message: '本地模拟数据里没有这个接口' } }

export function mockRequest(input: MockRequestInput, delayMs: number, failRate: number): Promise<MockResult> {
  const route = input.path.split('?')[0]
  let result = FALLBACK
  for (const entry of ROUTES) {
    if (entry.method !== input.method) {
      continue
    }
    const match = entry.pattern.exec(route)
    if (match) {
      result = entry.answer(input, match)
      break
    }
  }
  if (failRate > 0 && Math.random() < failRate) {
    result = failure(500, '模拟的服务端错误')
  }
  return new Promise((resolve) => {
    setTimeout(() => resolve(result), delayMs)
  })
}
