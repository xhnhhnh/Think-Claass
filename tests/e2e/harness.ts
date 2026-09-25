/**
 * Boot the composed application once, seed it through its own HTTP surface, and hand the tests an
 * HTTP client per role.
 *
 * ## Why it boots `api/app.ts`
 *
 * `api/app.ts` is the composition that actually ships: the legacy Nest root, the kernel's routes,
 * the plugin host mounted in `'external'` mode, the global error filter and the actor-scope
 * resolver. Suites that assemble a host by hand (as `tests/plugins/host.test.ts` does) deliberately
 * exercise the runtime in isolation - this one exercises the *application*, so a route that is
 * reachable in a test host but not in production (or the reverse) is caught here.
 *
 * ## Why the database file is chosen before any import
 *
 * `api/app.ts` runs `createApp()` at module load, and `dotenv.config()` does not override variables
 * that are already set. So this module writes `DATABASE_FILE` into the environment first and imports
 * the application dynamically in `boot()`. Nothing else about the boot is faked: the schema is the
 * real boot schema, the plugins are the real 20, and everything the tests then read is written by
 * real requests.
 *
 * ## Why the seed goes through HTTP
 *
 * Inserting rows directly would let the tests pass against a shape the application cannot actually
 * produce - an account with no `students` row, a parent with no link, a class with no invite code.
 * Creating each actor through the route a real one uses is what makes "role X gets this answer"
 * mean something. It also produces the prerequisite chain the routes need: a student cannot be
 * created before a class, and a parent cannot register before a student exists.
 *
 * No fabricated data is shipped in the application; every row here exists only in this test's
 * temporary database and is deleted with it.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const ROOT_DIR = ROOT;

/**
 * The temporary database and bootstrap credentials, set before the application is imported.
 *
 * `SUPERADMIN_*` are required for a fresh database - `api/db.ts` refuses to invent a credential -
 * and these values are test-only, written down nowhere else.
 */
export const SUPERADMIN = { username: 'e2e-root', password: 'e2e-root-secret' };
export const TEACHER = { username: 'e2e-teacher', password: 'e2e-teacher-secret', name: '测试老师' };
export const PARENT = { username: 'e2e-parent', password: 'e2e-parent-secret' };
/** The initial password the student-creation routes set; every seeded student uses it. */
export const STUDENT_PASSWORD = '123456';
export const STUDENTS = [
  { name: '张三', username: 'e2e-student-1' },
  { name: '李四', username: 'e2e-student-2' },
  { name: '王五', username: 'e2e-student-3' },
];

export type Role = 'superadmin' | 'teacher' | 'student' | 'parent';

export interface Seeded {
  base: string;
  classId: number;
  inviteCode: string;
  /** `students.id`, in `STUDENTS` order - the ids the routes take, not the login ids. */
  studentIds: number[];
  /** The login row of the first student (`users.id`), which is *not* `studentIds[0]`. */
  studentUserId: number;
  parentUserId: number;
  tokens: Record<Role, string>;
  close: () => Promise<void>;
}

export interface Response {
  status: number;
  body: any;
  text: string;
}

export class HttpError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly response: Response,
  ) {
    super(`${method} ${path} -> ${response.status} ${response.text.slice(0, 200)}`);
  }
}

/**
 * One HTTP call.
 *
 * Returns the status and the parsed body rather than throwing on non-2xx, because "which status"
 * is the thing most of these tests assert. `HttpError` exists for the seeding calls, where a
 * non-2xx means the fixture is broken and every later assertion would be misleading.
 */
export async function call(
  base: string,
  method: string,
  pathname: string,
  options: { token?: string; body?: unknown; raw?: boolean } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined && !options.raw) headers['content-type'] = 'application/json';

  const response = await fetch(base + pathname, {
    method,
    headers,
    ...(options.body === undefined
      ? {}
      : { body: options.raw ? (options.body as string) : JSON.stringify(options.body) }),
    redirect: 'manual',
  });

  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: response.status, body, text };
}

/** One HTTP call that must succeed; used only while seeding. */
async function must(
  base: string,
  method: string,
  pathname: string,
  options: { token?: string; body?: unknown } = {},
): Promise<Response> {
  const response = await call(base, method, pathname, options);
  if (response.status >= 400) throw new HttpError(method, pathname, response);
  return response;
}

async function login(
  base: string,
  username: string,
  password: string,
  role?: string,
): Promise<{ token: string; userId: number }> {
  // Teacher and superadmin log in through the identity route; the admin console has its own
  // (`/api/admin/session`), and this picks whichever accepts the account.
  const attempts: Array<{ path: string; body: Record<string, unknown> }> = role
    ? [{ path: '/api/auth/login', body: { username, password, role } }]
    : [
        { path: '/api/admin/session', body: { username, password } },
        { path: '/api/auth/login', body: { username, password } },
      ];

  for (const attempt of attempts) {
    const response = await call(base, 'POST', attempt.path, { body: attempt.body });
    const payload = response.body?.data ?? response.body;
    const token = payload?.token;
    if (response.status < 400 && typeof token === 'string') {
      return { token, userId: Number(payload?.user?.id ?? 0) };
    }
  }
  throw new Error(`login failed for ${username} (role ${role ?? 'any'})`);
}

/**
 * Boot the application, seed the four roles, and return an HTTP client per role.
 *
 * Call this once per test file (`beforeAll`); Vitest gives each file its own module registry, so
 * each file gets its own database and its own port - which also means files can run in parallel
 * without sharing state.
 */
export async function bootAndSeed(): Promise<Seeded> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-e2e-'));
  process.env.DATABASE_FILE = path.join(tempDir, 'e2e.sqlite');
  process.env.SUPERADMIN_USERNAME = SUPERADMIN.username;
  process.env.SUPERADMIN_PASSWORD = SUPERADMIN.password;
  process.env.PLUGINS_ENABLED = '1';
  // The kernel's own log level. `silent` keeps the test output readable, but the scope resolver
  // warns on every failure it swallows (see `resolveActorScope`), and that warning is the only
  // evidence when an actor arrives without its scope - so it is opt-in through `E2E_LOG=1`
  // rather than always off.
  process.env.LOG_LEVEL = process.env.E2E_LOG === '1' ? 'debug' : 'silent';
  process.env.NODE_ENV = 'test';

  // Imported here, not at the top of the file: the module boots on import and the environment
  // above has to be in place first. See the header.
  //
  // It is imported for its *default export* rather than for its `createApp` and called again: the
  // module already runs `createApp()` at load, and calling it a second time builds a second
  // application - two plugin hosts, two listening servers' worth of state. The composition keeps its
  // plugin host in a module-level holder (`let pluginHost`) that the actor-scope resolver reads per
  // request, and the second boot overwrote the first app's holder, so the first app's routes ran
  // with `pluginHost === null` and answered 403「当前账号未绑定学生」. One boot, one holder.
  const application = await import('../../api/app.js');
  const app = application.default;

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  const close = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Close the kernel before removing the directory. `better-sqlite3` holds the database file
    // open for the life of the process, and on Windows an open handle makes the directory
    // undeletable - which surfaced as an `EPERM` from `rmSync` and failed the suite *after* all
    // its tests had passed.
    const { getKernel } = await import('../../api/app.js');
    await getKernel()?.shutdown();

    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // The temp directory is cleaned by the OS if this still fails; leaking it must not turn a
      // green suite red, and there is nothing left to assert about it.
    }
  };

  try {
    const superadmin = (await login(base, SUPERADMIN.username, SUPERADMIN.password)).token;

    // A teacher, created by an admin - the only way one comes into existence on a fresh instance
    // besides self-registration, which `allow_teacher_registration` defaults off.
    await must(base, 'POST', '/api/admin/users', {
      token: superadmin,
      body: { username: TEACHER.username, password: TEACHER.password, name: TEACHER.name, role: 'teacher' },
    });

    const teacher = (await login(base, TEACHER.username, TEACHER.password, 'teacher')).token;

    const created = await must(base, 'POST', '/api/classes', {
      token: teacher,
      body: { name: 'E2E 班级' },
    });
    const classId: number = created.body.class.id;
    const inviteCode: string = created.body.class.invite_code;

    const imported = await must(base, 'POST', '/api/students/batch-import', {
      token: teacher,
      body: { class_id: classId, students: STUDENTS },
    });
    const studentIds: number[] = imported.body.students.map((student: { id: number }) => student.id);

    // A parent registers against the class invite code and binds to the first student - the same
    // flow the login page drives.
    await must(base, 'POST', '/api/auth/register', {
      body: {
        username: PARENT.username,
        password: PARENT.password,
        role: 'parent',
        name: '测试家长',
        invite_code: inviteCode,
        student_id: studentIds[0],
      },
    });
    const parentLogin = await login(base, PARENT.username, PARENT.password, 'parent');

    const student = (await login(base, STUDENTS[0].username, STUDENT_PASSWORD, 'student')).token;

    // The student's *login* row, which several routes take as `studentId`. Read from the roster the
    // teacher sees rather than guessed, so the two id spaces cannot be confused.
    const roster = await must(base, 'GET', `/api/students?classId=${classId}`, { token: teacher });
    const first = roster.body.students.find((row: { id: number }) => row.id === studentIds[0]);

    return {
      base,
      classId,
      inviteCode,
      studentIds,
      studentUserId: first.user_id,
      // The parent's own `users.id`, which the family-task routes take. It is not the student's.
      parentUserId: parentLogin.userId,
      tokens: { superadmin, teacher, student, parent: parentLogin.token },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

/**
 * Run `worker` over `items` with bounded concurrency, collecting the results in order.
 *
 * The probes are ~1,200 independent HTTP calls; run one at a time they take minutes (measured: a
 * single-role, single-pass walk of the 297 endpoints took over nine minutes), and unbounded they
 * swamp a single-process SQLite server. Six in flight is enough to make the walk short without
 * turning "the route answered 500" into "the route timed out".
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}

/** The endpoints the frontend actually calls, extracted from its API clients. */
export function frontendEndpoints(): string[] {
  const dirs = [path.join(ROOT, 'src', 'features'), path.join(ROOT, 'src', 'api')];
  const found = new Set<string>();

  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) continue;

      const source = fs.readFileSync(full, 'utf8');
      for (const match of source.matchAll(
        /api(?:Get|Post|Put|Delete|Patch)\s*(?:<[^>]*>)?\s*\(\s*[`'"]([^`'"]+)/g,
      )) {
        const raw = match[1]
          .replace(/\$\{[^}]*\}/g, ':id')
          .split('?')[0]
          .replace(/\/+$/, '');
        if (raw.startsWith('/api/')) found.add(raw.replace(/:id/g, '1'));
      }
    }
  };

  for (const dir of dirs) walk(dir);
  return [...found].sort();
}
