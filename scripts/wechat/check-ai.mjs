#!/usr/bin/env node
/**
 * 自检：AI 判分是否真的走了模型（而不是停留在"配置看起来对"）。
 *
 * 为什么需要它：`ai_provider=mock` 与 `AI_PROVIDER=http` 在界面上都只能看到"AI 判分"按钮，
 * 差别只体现在返回里的 `ai.source`。提报材料里要写"AI 真的开着"，就需要一条可重复、
 * 能贴出输出的证据 —— 这个脚本就是那条证据。
 *
 * 它走的是**真实 HTTP 路由**（登录 → 建班 → 建学生 → 发作业 → 作答 → 提交 → AI 判分），
 * 不是绕过服务直接调 provider，所以顺带把鉴权、角色、班级作用域一起验了。
 *
 * ## 用法
 *
 *   # 需要后端已在跑（npm start / node api/server.ts），并且该部署已配好 AI_* 环境变量
 *   TEACHER_USERNAME=thinkclass_teacher TEACHER_PASSWORD='...' node scripts/wechat/check-ai.mjs
 *
 * ## 会产生数据
 *
 * 每跑一次会建 1 个班级 + 1 名学生 + 1 份作业 + 1 次提交，名字都带 `E2E AI 自检` 前缀，
 * 方便在演示数据里一眼认出并删掉。**不要在准备提报演示数据的库上跑第二次。**
 *
 * ## 退出码
 *
 * 0 = 模型参与并给出了分数；1 = 模型没参与（含 mock、模型名写错、超时、密钥无效）。
 */

const BASE = process.env.THINK_CLASS_BASE_URL?.trim() || 'http://localhost:3001';
const username = process.env.TEACHER_USERNAME?.trim();
const password = process.env.TEACHER_PASSWORD;
const STUDENT_PASSWORD = 'e2e-student-pass-1234';

if (!username || !password) {
  console.error(
    '缺少凭据。用法：\n' +
      "  TEACHER_USERNAME=thinkclass_teacher TEACHER_PASSWORD='...' node scripts/wechat/check-ai.mjs\n" +
      '（需要一个 teacher 角色的账号：发布作业与 AI 判分都要求教师身份。）',
  );
  process.exit(2);
}

let token = '';
const log = (...args) => console.log(...args);

async function api(method, path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(180000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 保留原文给报错用 */
  }
  return { status: response.status, json, text };
}

function expectOk(label, result) {
  const ok = result.status >= 200 && result.status < 300;
  log(`  ${ok ? 'OK ' : 'ERR'} ${label} -> HTTP ${result.status}`);
  if (!ok) {
    log('       ', result.text.slice(0, 400));
    process.exit(1);
  }
  return result.json;
}

// 1) 教师登录
const login = await api('POST', '/api/auth/login', { username, password, role: 'teacher' });
expectOk('POST /api/auth/login (teacher)', login);
token = login.json.token;

// 2) 建班
const classJson = expectOk('POST /api/classes', await api('POST', '/api/classes', { name: 'E2E AI 自检班' }));
const classId = classJson.class?.id;
log(`        classId=${classId}`);

// 3) 建学生（同时创建可登录账号）
const studentJson = expectOk(
  'POST /api/students',
  await api('POST', '/api/students', {
    username: `e2e_ai_check_${Date.now()}`,
    name: 'E2E AI 自检学生',
    class_id: classId,
  }),
);
const studentUsername = studentJson.student?.username;
const studentRowId = studentJson.student?.id;
log(`        学生=${studentUsername}`);

// `createStudent` 只读 username/name/class_id，密码固定默认值，这里显式改成已知值
expectOk(
  'PUT /api/students/:id/password',
  await api('PUT', `/api/students/${studentRowId}/password`, { password: STUDENT_PASSWORD }),
);

// 4) 发一份带参考答案的简答题作业
const homeworkJson = expectOk(
  'POST /api/homework',
  await api('POST', '/api/homework', {
    class_id: classId,
    title: 'E2E AI 自检作业',
    status: 'published',
    reward_points: 5,
    questions: [
      {
        type: 'short',
        stem: '请用一句话说明：分数 1/2 与 2/4 为什么相等？',
        reference: { text: '它们表示同一个数值，2/4 是 1/2 的等值分数（分子分母同乘 2）。' },
        points: 10,
      },
    ],
  }),
);
const homeworkId = homeworkJson.data?.id ?? homeworkJson.id;
const teacherToken = token;

// 5) 学生作答并提交
const studentLogin = await api('POST', '/api/auth/login', {
  username: studentUsername,
  password: STUDENT_PASSWORD,
  role: 'student',
});
expectOk('POST /api/auth/login (student)', studentLogin);
token = studentLogin.json.token;

const attemptJson = expectOk(
  'POST /api/homework/:id/attempt',
  await api('POST', `/api/homework/${homeworkId}/attempt`),
);
const submissionId = attemptJson.data?.submission?.id;
const questionId = attemptJson.data?.homework?.questions?.[0]?.id;

expectOk(
  'PUT /api/homework/submissions/:id/answers',
  await api('PUT', `/api/homework/submissions/${submissionId}/answers`, {
    answers: [{ question_id: questionId, value: { text: '因为是等值分数，大小一样。' } }],
  }),
);
expectOk(
  'POST /api/homework/submissions/:id/submit',
  await api('POST', `/api/homework/submissions/${submissionId}/submit`),
);

// 6) 教师触发 AI 判分 —— 被测对象
token = teacherToken;
log('\n[AI 判分] POST /api/homework/:id/ai-grade（真的会请求模型，可能耗时数十秒）...');
const startedAt = Date.now();
const gradedJson = expectOk(
  'POST /api/homework/:id/ai-grade',
  await api('POST', `/api/homework/${homeworkId}/ai-grade`, {
    submission_ids: [submissionId],
    overwrite_teacher: true,
  }),
);
const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

const entry = Array.isArray(gradedJson.data) ? gradedJson.data[0] : gradedJson.data;
const ai = entry?.ai ?? {};
const answers = entry?.answers ?? [];

log('\n=== 判定 ===');
log(`  耗时: ${elapsed}s`);
log(`  submission.score=${entry?.submission?.score}/${entry?.submission?.total_points}  graded_by=${entry?.submission?.graded_by}`);
log(`  ai.source=${ai.source}  available=${ai.available}  confidence=${ai.confidence}`);
log(`  ai.message=${ai.message ?? '(无)'}`);
for (const line of answers) {
  log(`    ai_score=${line.ai_score} confidence=${line.ai_confidence} comment=${String(line.ai_comment ?? '').slice(0, 160)}`);
}

if (ai.source !== 'http') {
  log('\n[失败] 分数不是从模型来的（ai.source 不是 http）—— AI 没有真正参与。');
  log('       最常见原因：AI_* 环境变量没配 / 模型名与 GET /v1/models 不一致 / 密钥无效 / 超时。');
  log('       排查顺序见 docs/wechat/50-ai-capability.md 第 3 节。');
  process.exit(1);
}
if (!answers.some((line) => (line.ai_score ?? null) !== null)) {
  log('\n[失败] 模型已接通但没有给出任何分数（题目可能没有它敢判的依据）。');
  process.exit(1);
}
log('\n[通过] 模型真的参与并给出了分数。把上面这几行连同 ai.message 一起贴进提报材料即可。');
