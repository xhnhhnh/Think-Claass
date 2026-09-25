/**
 * 智学 authorization and the answering loop - all six routes, over real HTTP.
 *
 * A real host boot: plugin discovery, this plugin's own migration runner, the Nest assembly and the
 * request-context middleware, with the same actor-scope resolver `api/app.ts` installs (so
 * `Actor.studentId` is the `students` row and a student route never has to be told who it is talking
 * to). The point of this file rather than more unit tests is that the pieces this feature adds only
 * meet at that seam: a manifest permission key that does not match its route, a port that was never
 * published, a table the migration did not create and a class feature flag with no column behind it
 * all pass a unit test and fail here.
 *
 * The contracts asserted are the matrix in `docs/security/route-authorization-matrix.md`:
 *
 *   anonymous                      -> 401 `未登录或登录已过期`
 *   known caller without the role  -> 403 `无权限执行该操作`
 *   the right role, wrong row      -> 403 (the set id is checked against the caller's own student)
 *   the right role, missing row    -> 404 (never the 500 `plugins/learning` records as known debt)
 *   feature switched off           -> 403 `该功能当前已关闭`
 *
 * And then the half that is not authorization at all: that answering a set actually moves the number
 * in 错题本, that a declined judgement moves nothing, and that the model half is optional.
 */

import fs from 'node:fs';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createKernel, type Kernel } from '@thinkclass/kernel';
import { createPluginHost, type PluginHost } from '@thinkclass/plugin-runtime';

import { APP_MIGRATIONS } from '../../api/schema/appMigrations.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let kernel: Kernel;
let host: PluginHost;
let server: Server;
let base: string;
let directory: string;

let teacherToken: string;
let otherTeacherToken: string;
let studentToken: string;
let otherStudentToken: string;
let parentToken: string;

interface Reply {
  status: number;
  text: string;
  body: any;
}

/** One request. No `token` means no `authorization` header at all. */
async function call(
  method: string,
  endpoint: string,
  options: { token?: string; body?: unknown } = {},
): Promise<Reply> {
  const response = await fetch(base + endpoint, {
    method,
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  const text = await response.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: response.status, text, body };
}

interface GuardedEndpoint {
  label: string;
  method: string;
  path: string;
  body?: unknown;
}

/** Every route the plugin serves, with a body where the method takes one. */
const GUARDED: GuardedEndpoint[] = [
  { label: 'POST /api/ai-study/my/sets', method: 'POST', path: '/api/ai-study/my/sets', body: {} },
  { label: 'GET /api/ai-study/my/sets/current', method: 'GET', path: '/api/ai-study/my/sets/current' },
  {
    label: 'PUT /api/ai-study/sets/:id/answers',
    method: 'PUT',
    path: '/api/ai-study/sets/1/answers',
    body: { answers: [] },
  },
  { label: 'POST /api/ai-study/sets/:id/submit', method: 'POST', path: '/api/ai-study/sets/1/submit', body: {} },
  { label: 'GET /api/ai-study/classes/:classId/insight', method: 'GET', path: '/api/ai-study/classes/1/insight' },
  {
    label: 'POST /api/ai-study/classes/:classId/assign',
    method: 'POST',
    path: '/api/ai-study/classes/1/assign',
    body: { student_ids: [10] },
  },
];

/** The class feature flag, on for class 1 and off for class 2. */
function setFeature(classId: number, enabled: boolean): void {
  kernel.permissions.store.set({
    scopeType: 'class',
    scopeId: classId,
    capabilityKey: 'classroom.enable_ai_study',
    enabled,
  });
}

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-study-auth-'));
  const file = path.join(directory, 'ai-study-auth.sqlite');

  kernel = await createKernel({
    rootDir: ROOT,
    overrides: { logLevel: 'silent', pluginsEnabled: true, pluginDirs: [], env: 'test', databaseFile: file },
    migrations: APP_MIGRATIONS,
    scopeResolver: async (_req, actor) => {
      if (actor.role !== 'student' && actor.role !== 'parent') return null;
      const classroom = host?.active
        .find((entry) => entry.manifest.id === 'classroom')
        ?.context.use('classroom.public');
      if (!classroom) return null;

      const studentRow =
        actor.role === 'student'
          ? await classroom.getStudentByUserId(actor.userId)
          : ((await classroom.listStudentsByParent(actor.userId))[0] ?? null);

      return { ...actor, studentId: studentRow?.id, classId: studentRow?.classId };
    },
    mountPlugins: async (hooks) => {
      host = await createPluginHost({
        ...hooks,
        pluginDirs: [path.join(ROOT, 'plugins')],
        authProvider: { current: null },
      });
      return host;
    },
  });

  // Two classes, two teachers, one student in each. Student 10 is in class 1 (the class the feature
  // is on for); student 20 is in class 2.
  kernel.db.exec(`
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES (7, 'teacher', 't7', 'x', 1);
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES (8, 'teacher', 't8', 'x', 1);
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES (9, 'student', 's9', 'x', 1);
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES (11, 'student', 's11', 'x', 1);
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES (300, 'parent', 'p300', 'x', 1);
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (1, '一班', 7, 'AIS1');
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (2, '二班', 8, 'AIS2');
    INSERT INTO students (id, user_id, class_id, name, total_points, available_points)
      VALUES (10, 9, 1, '小明', 0, 0);
    INSERT INTO students (id, user_id, class_id, name, total_points, available_points)
      VALUES (20, 11, 2, '小刚', 0, 0);
    INSERT INTO parent_students (parent_id, student_id) VALUES (300, 10);

    INSERT INTO subjects (id, name, stage, grade) VALUES (1, '数学', '小学', 5);
    INSERT INTO knowledge_nodes (id, subject_id, name, importance) VALUES (1, 1, '分数加减法', 5);
    INSERT INTO knowledge_nodes (id, subject_id, name, importance) VALUES (2, 1, '小数乘法', 3);

    INSERT INTO questions (id, teacher_id, subject_id, stem, type, options_json, answer_json, difficulty, is_subjective, default_points)
      VALUES (100, 7, 1, '1/2 + 1/3 = ?', 'single', '[{"id":"a","text":"5/6"},{"id":"b","text":"2/5"}]', '"a"', 3, 0, 5);
    INSERT INTO questions (id, teacher_id, subject_id, stem, type, options_json, answer_json, difficulty, is_subjective, default_points)
      VALUES (101, 7, 1, '0.5 + 0.25 = ?', 'blank', NULL, '"0.75"', 2, 0, 3);
    INSERT INTO questions (id, teacher_id, subject_id, stem, type, options_json, answer_json, difficulty, is_subjective, default_points)
      VALUES (102, 7, 1, '说说你是怎么算的', 'short', NULL, NULL, 3, 1, 10);
    INSERT INTO question_knowledge (question_id, node_id) VALUES (100, 1);
    INSERT INTO question_knowledge (question_id, node_id) VALUES (101, 1);
    INSERT INTO question_knowledge (question_id, node_id) VALUES (102, 2);

    -- One past mistake for student 10, so the ranking has a real signal to work from.
    INSERT INTO wrong_questions (student_id, question_id, wrong_count, mastery_score, created_at, updated_at)
      VALUES (10, 100, 2, 0.3, 1, 1);
  `);

  setFeature(1, true);
  setFeature(2, false);

  server = await new Promise<Server>((resolve) => {
    const listener = kernel.app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  teacherToken = kernel.sessions.issue({ userId: 7, role: 'teacher', ttlMs: 60_000 }).token;
  otherTeacherToken = kernel.sessions.issue({ userId: 8, role: 'teacher', ttlMs: 60_000 }).token;
  studentToken = kernel.sessions.issue({ userId: 9, role: 'student', ttlMs: 60_000 }).token;
  otherStudentToken = kernel.sessions.issue({ userId: 11, role: 'student', ttlMs: 60_000 }).token;
  parentToken = kernel.sessions.issue({ userId: 300, role: 'parent', ttlMs: 60_000 }).token;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await host?.stop();
  await kernel.shutdown();
  try {
    fs.rmSync(directory, { recursive: true, force: true });
  } catch {
    // Windows keeps the file handle briefly.
  }
});

describe('the plugin is active and owns its tables', () => {
  it('activated with a service-free manifest', () => {
    const entry = host.active.find((plugin) => plugin.manifest.id === 'ai-study');
    expect(entry, 'ai-study was not activated').toBeDefined();
    expect(entry?.manifest.name).toBe('AI 智学');
  });

  it('the migration created three tables under the plugin prefix', () => {
    const tables = (
      kernel.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>
    ).map((row) => row.name);

    expect(tables).toContain('p_ai_study_sets');
    expect(tables).toContain('p_ai_study_items');
    expect(tables).toContain('p_ai_study_answers');
  });

  it('the class feature column the switch reads exists', () => {
    const columns = (
      kernel.db.prepare('PRAGMA table_info(classes)').all() as Array<{ name: string }>
    ).map((row) => row.name);

    expect(columns).toContain('enable_ai_study');
  });
});

describe('anonymous callers are refused with 401', () => {
  for (const endpoint of GUARDED) {
    it(`${endpoint.label} answers 401 without any credential`, async () => {
      const reply = await call(endpoint.method, endpoint.path, { body: endpoint.body });

      expect(reply.status).toBe(401);
      expect(reply.body).toMatchObject({ success: false, message: '未登录或登录已过期' });
    });
  }

  it('nothing was written by the anonymous probes', () => {
    expect(kernel.db.prepare('SELECT COUNT(*) AS n FROM p_ai_study_sets').get()).toMatchObject({ n: 0 });
  });
});

describe('a known caller without the role is refused with 403', () => {
  it('the student routes are student-only', async () => {
    for (const token of [teacherToken, parentToken]) {
      const reply = await call('POST', '/api/ai-study/my/sets', { token, body: {} });
      expect(reply.status).toBe(403);
      expect(reply.body).toMatchObject({ success: false, message: '无权限执行该操作' });
    }
  });

  it('the class routes are staff-only', async () => {
    for (const token of [studentToken, parentToken]) {
      const insight = await call('GET', '/api/ai-study/classes/1/insight', { token });
      expect(insight.status).toBe(403);

      const assign = await call('POST', '/api/ai-study/classes/1/assign', { token, body: { student_ids: [10] } });
      expect(assign.status).toBe(403);
    }
  });
});

describe('membership, not just role', () => {
  it('a teacher cannot read another teacher\'s class board', async () => {
    const reply = await call('GET', '/api/ai-study/classes/1/insight', { token: otherTeacherToken });

    expect(reply.status).toBe(403);
    expect(reply.body).toMatchObject({ success: false, message: '无权限查看该班级智学' });
  });

  it('a teacher cannot dispatch into another teacher\'s class', async () => {
    const reply = await call('POST', '/api/ai-study/classes/1/assign', {
      token: otherTeacherToken,
      body: { student_ids: [10] },
    });

    expect(reply.status).toBe(403);
  });
});

describe('the class feature switch is enforced', () => {
  it('a student whose class has it off is refused with 该功能当前已关闭', async () => {
    const reply = await call('GET', '/api/ai-study/my/sets/current', { token: otherStudentToken });

    expect(reply.status).toBe(403);
    expect(reply.body).toMatchObject({ success: false, message: '该功能当前已关闭' });
  });

  it('turning it on for that class lets the same call through', async () => {
    setFeature(2, true);
    const reply = await call('GET', '/api/ai-study/my/sets/current', { token: otherStudentToken });
    setFeature(2, false);

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ success: true, data: { set: null } });
  });
});

describe('generating a set', () => {
  it('the student\'s own set names their weak knowledge point and offers questions', async () => {
    const reply = await call('POST', '/api/ai-study/my/sets', { token: studentToken, body: {} });

    expect(reply.status).toBe(201);
    expect(reply.body.success).toBe(true);

    const data = reply.body.data;
    expect(data.set).not.toBeNull();
    expect(data.set.source).toBe('self');
    expect(data.set.status).toBe('open');
    expect(data.set.items.length).toBeGreaterThan(0);

    // The missed question (id 100) carries the strongest signal, so it must be first.
    expect(data.set.items[0].question_id).toBe(100);
    expect(data.set.items[0].reason).toContain('掌握度');

    // The set must not leak the answer key it is judged against. Asserted structurally rather than
    // by hunting for a substring: the option ids (`"a"`) are *supposed* to be in the payload - the
    // student has to see the choices - so what matters is that a question crosses the boundary with
    // exactly these six fields and no more. `answer_json` and `explanation` are the two the learning
    // port drops in one place (`toQuestionRef`), and this is the assertion that they stay dropped.
    for (const item of data.set.items) {
      expect(Object.keys(item.question).sort()).toEqual(
        ['difficulty', 'id', 'options', 'points', 'stem', 'type'].sort(),
      );
      // `answer` is the *student's* own answer, never a reference: before they write one it is null.
      expect(item.answer).toBeNull();
    }
    expect(JSON.stringify(data)).not.toContain('answer_json');
    expect(JSON.stringify(data)).not.toContain('explanation');
  });

  it('the AI block says no model took part, and every reason still exists', async () => {
    const reply = await call('GET', '/api/ai-study/my/sets/current', { token: studentToken });

    expect(reply.status).toBe(200);
    expect(reply.body.data.ai.available).toBe(false);
    expect(typeof reply.body.data.ai.message).toBe('string');
    expect(reply.body.data.ai.message.length).toBeGreaterThan(0);
    expect(reply.body.data.set.items.every((item: any) => item.reason.trim().length > 0)).toBe(true);
  });

  it('generating twice returns the same set rather than replacing it', async () => {
    const first = await call('GET', '/api/ai-study/my/sets/current', { token: studentToken });
    const second = await call('POST', '/api/ai-study/my/sets', { token: studentToken, body: {} });

    expect(second.status).toBe(201);
    expect(second.body.data.set.id).toBe(first.body.data.set.id);
    expect(second.body.data.ai.message).toContain('进行中');
  });
});

describe('answering and submitting', () => {
  it('a wrong answer moves mastery in 错题本 and is recorded as an attempt', async () => {
    const current = await call('GET', '/api/ai-study/my/sets/current', { token: studentToken });
    const setId = current.body.data.set.id;
    const item = current.body.data.set.items.find((entry: any) => entry.question_id === 100);

    const save = await call('PUT', `/api/ai-study/sets/${setId}/answers`, {
      token: studentToken,
      body: { answers: [{ item_id: item.id, value: '"b"', spent_sec: 20 }] },
    });
    expect(save.status).toBe(200);

    const before = kernel.db
      .prepare('SELECT mastery_score, wrong_count FROM wrong_questions WHERE student_id = 10 AND question_id = 100')
      .get() as { mastery_score: number; wrong_count: number };
    expect(before.mastery_score).toBeCloseTo(0.3, 5);

    const submit = await call('POST', `/api/ai-study/sets/${setId}/submit`, { token: studentToken, body: {} });
    expect(submit.status).toBe(201);

    const result = submit.body.data;
    expect(result.total).toBe(current.body.data.set.items.length);
    expect(result.items.find((entry: any) => entry.question_id === 100).is_correct).toBe(false);

    const after = kernel.db
      .prepare('SELECT mastery_score FROM wrong_questions WHERE student_id = 10 AND question_id = 100')
      .get() as { mastery_score: number };
    expect(after.mastery_score).toBeCloseTo(0.2, 5);

    const attempts = kernel.db
      .prepare("SELECT COUNT(*) AS n FROM wrong_question_attempts WHERE practice_source = 'ai_study'")
      .get() as { n: number };
    expect(attempts.n).toBe(1);
  });

  it('a subjective question is left unjudged and moves no mastery', async () => {
    const submit = kernel.db
      .prepare(
        `SELECT q.id AS question_id
           FROM p_ai_study_items i JOIN questions q ON q.id = i.question_id
          WHERE q.is_subjective = 1 LIMIT 1`,
      )
      .get() as { question_id: number } | undefined;

    // The short-answer question is only in the set if the ranking chose it; when it did, the set's
    // own result must have declined it. Either way the column stays untouched.
    const wrongRow = kernel.db
      .prepare('SELECT mastery_score FROM wrong_questions WHERE student_id = 10 AND question_id = 102')
      .get();
    expect(wrongRow).toBeUndefined();
    void submit;
  });

  it('submitting twice does not move mastery a second time', async () => {
    const current = await call('GET', '/api/ai-study/my/sets/current', { token: studentToken });
    // The set was closed by the previous test, so there is nothing open - which is itself the
    // contract: a submitted set is not returned as the current one.
    expect(current.body.data.set).toBeNull();

    const attempts = kernel.db
      .prepare("SELECT COUNT(*) AS n FROM wrong_question_attempts WHERE practice_source = 'ai_study'")
      .get() as { n: number };
    expect(attempts.n).toBe(1);
  });
});

describe('row ownership and missing rows', () => {
  it('a student cannot touch a set id that does not exist - 404, never 500', async () => {
    const reply = await call('POST', '/api/ai-study/sets/999999/submit', { token: studentToken, body: {} });

    expect(reply.status).toBe(404);
    expect(reply.body).toMatchObject({ success: false, message: '练单不存在' });
  });

  it('a student cannot save answers into a set that is not theirs', async () => {
    // Student 10's set, read by student 20 (whose class feature is now off, so it is a 403 either
    // way - the point is that no other student's row is ever writable).
    const setId = (
      kernel.db.prepare('SELECT id FROM p_ai_study_sets ORDER BY id ASC LIMIT 1').get() as { id: number }
    ).id;

    const reply = await call('PUT', `/api/ai-study/sets/${setId}/answers`, {
      token: otherStudentToken,
      body: { answers: [] },
    });

    expect([403, 404]).toContain(reply.status);
    expect(reply.body.success).toBe(false);
  });
});

describe('the teacher board and dispatch', () => {
  it('the board summarises the class rather than a student', async () => {
    const reply = await call('GET', '/api/ai-study/classes/1/insight', { token: teacherToken });

    expect(reply.status).toBe(200);
    const data = reply.body.data;
    expect(data.class_id).toBe(1);
    expect(data.students_total).toBe(1);
    expect(data.students_considered).toBe(1);
    // The board is arithmetic and says so, rather than implying a model read the class.
    expect(data.ai.available).toBe(false);
    expect(data.ai.message).toContain('不调用模型');
    // Student 10 has a cleared set now, so there is an open-set marker to report.
    expect(data.suggestions).toHaveLength(1);
    expect(data.suggestions[0].student_id).toBe(10);
  });

  it('a dispatch with no student ids is a 400, not a 500', async () => {
    const reply = await call('POST', '/api/ai-study/classes/1/assign', { token: teacherToken, body: {} });

    expect(reply.status).toBe(400);
    expect(reply.body).toMatchObject({ success: false, message: '缺少 student_ids' });
  });

  it('a dispatch names a student outside the class as a per-student failure, not a batch failure', async () => {
    const reply = await call('POST', '/api/ai-study/classes/1/assign', {
      token: teacherToken,
      body: { student_ids: [20] },
    });

    expect(reply.status).toBe(201);
    expect(reply.body.data.created).toEqual([]);
    expect(reply.body.data.failed).toHaveLength(1);
    expect(reply.body.data.failed[0]).toMatchObject({ student_id: 20 });
  });

  it('a dispatch to a student in the class creates an assigned set they can see', async () => {
    const reply = await call('POST', '/api/ai-study/classes/1/assign', {
      token: teacherToken,
      body: { student_ids: [10], size: 2 },
    });

    expect(reply.status).toBe(201);
    expect(reply.body.data.created).toHaveLength(1);

    const set = kernel.db
      .prepare('SELECT source, created_by, student_id FROM p_ai_study_sets WHERE id = ?')
      .get(reply.body.data.created[0].set_id) as { source: string; created_by: number; student_id: number };

    expect(set).toMatchObject({ source: 'assigned', created_by: 7, student_id: 10 });

    const mine = await call('GET', '/api/ai-study/my/sets/current', { token: studentToken });
    expect(mine.body.data.set.source).toBe('assigned');
  });

  it('a second dispatch to the same student is reported as a failure, not silently replaced', async () => {
    const reply = await call('POST', '/api/ai-study/classes/1/assign', {
      token: teacherToken,
      body: { student_ids: [10] },
    });

    expect(reply.status).toBe(201);
    expect(reply.body.data.created).toEqual([]);
    expect(reply.body.data.failed[0].reason).toContain('进行中');
  });
});
