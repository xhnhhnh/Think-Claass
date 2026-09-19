/**
 * Audit registry, detail renderer, sink and middleware.
 *
 * The behaviour being replaced was an if/else chain over four hardcoded paths that
 * attributed every entry to teacher id `1`. These tests pin what the replacement
 * guarantees: declarative matching, correct attribution from the request context
 * rather than the request body, and no audit entry for failed requests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  auditLogsMigration,
  createAuditLog,
  createAuditMiddleware,
  createAuditRegistry,
  openDatabase,
  renderDetail,
  runMigrations,
  type Database,
  type RequestLike,
  type ResponseLike,
} from '@thinkclass/kernel';

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

describe('audit registry', () => {
  const registry = () => {
    const r = createAuditRegistry();
    r.register(
      [
        { method: 'POST', pattern: '/api/students/:id/points', action: '单个加/扣分', detail: '学生ID: {{id}}' },
        { method: 'POST', pattern: '/api/students/batch-points', action: '批量加/扣分' },
        { method: 'GET', pattern: '/api/anything', action: '不应匹配 GET' },
        { method: '*', pattern: '/api/wild', action: '任意方法' },
      ],
      'core',
    );
    return r;
  };

  it('matches a parameterised path and extracts params', () => {
    const match = registry().match('POST', '/api/students/42/points');
    expect(match?.descriptor.action).toBe('单个加/扣分');
    expect(match?.params).toEqual({ id: '42' });
  });

  it('prefers the exact path over a parameterised one', () => {
    // `/api/students/batch-points` must not be read as `/api/students/:id/points`.
    const match = registry().match('POST', '/api/students/batch-points');
    expect(match?.descriptor.action).toBe('批量加/扣分');
  });

  it('respects the method', () => {
    expect(registry().match('GET', '/api/students/42/points')).toBeNull();
    expect(registry().match('PUT', '/api/students/42/points')).toBeNull();
  });

  it('matches any method for a wildcard descriptor', () => {
    expect(registry().match('PATCH', '/api/wild')?.descriptor.action).toBe('任意方法');
  });

  it('returns null for an undescribed route', () => {
    expect(registry().match('POST', '/api/something/else')).toBeNull();
  });

  it('tolerates a trailing slash', () => {
    expect(registry().match('POST', '/api/wild/')).not.toBeNull();
  });

  it('stamps the declaring owner onto descriptors', () => {
    expect(registry().list().every((d) => d.owner === 'core')).toBe(true);
  });

  it('unregisters by owner', () => {
    const r = registry();
    r.register([{ method: 'POST', pattern: '/api/plugin', action: 'x' }], 'pet');
    expect(r.list()).toHaveLength(5);

    r.unregister('pet');
    expect(r.list()).toHaveLength(4);
    expect(r.match('POST', '/api/plugin')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// detail rendering
// ---------------------------------------------------------------------------

describe('audit detail rendering', () => {
  it('substitutes from the request body', () => {
    expect(renderDetail('分数: {{amount}}, 理由: {{reason}}', {}, { amount: 5, reason: '作业' })).toBe(
      '分数: 5, 理由: 作业',
    );
  });

  it('prefers route params over the body', () => {
    expect(renderDetail('学生ID: {{id}}', { id: '42' }, { id: 99 })).toBe('学生ID: 42');
  });

  it('renders an array as its length', () => {
    expect(renderDetail('操作人数: {{studentIds}}', {}, { studentIds: [1, 2, 3] })).toBe('操作人数: 3');
  });

  it('renders a missing value as empty rather than "undefined"', () => {
    expect(renderDetail('理由: {{reason}}', {}, {})).toBe('理由: ');
  });

  it('renders a boolean as a word with the ternary form', () => {
    // The `is_active` status label: no per-descriptor code needed.
    expect(renderDetail('状态: {{is_active?上架:下架}}', {}, { is_active: true })).toBe('状态: 上架');
    expect(renderDetail('状态: {{is_active?上架:下架}}', {}, { is_active: false })).toBe('状态: 下架');
    expect(renderDetail('状态: {{is_active?上架:下架}}', {}, { is_active: 0 })).toBe('状态: 下架');
    expect(renderDetail('状态: {{is_active?上架:下架}}', {}, { is_active: '0' })).toBe('状态: 下架');
    expect(renderDetail('状态: {{is_active?上架:下架}}', {}, {})).toBe('状态: 下架');
  });
});

// ---------------------------------------------------------------------------
// sink
// ---------------------------------------------------------------------------

describe('audit sink', () => {
  let db: Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
    runMigrations(db, [auditLogsMigration]);
  });
  afterEach(() => db.close());

  it('creates the table with every column the model expects', () => {
    const columns = (db.prepare(`PRAGMA table_info(operation_logs)`).all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns).toEqual(
      expect.arrayContaining(['id', 'teacher_id', 'user_id', 'role', 'action', 'details', 'ip_address', 'created_at']),
    );
  });

  it('repairs a legacy table that has foreign keys and lacks the role columns', () => {
    // Reproduces the real drift exactly: the baseline DDL created operation_logs
    // without user_id/role, and `ALTER TABLE ... ADD COLUMN x INTEGER REFERENCES
    // users(id)` left both attribution columns constrained - so an entry for a user
    // that does not exist was rejected and silently swallowed.
    const legacy = openDatabase(':memory:');
    legacy.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY);
      INSERT INTO users (id) VALUES (1);
      CREATE TABLE operation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER REFERENCES users(id),
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO operation_logs (teacher_id, action, details) VALUES (1, '旧记录', '保留我');
    `);
    legacy.exec(`ALTER TABLE operation_logs ADD COLUMN user_id INTEGER REFERENCES users(id)`);
    legacy.exec(`ALTER TABLE operation_logs ADD COLUMN role TEXT`);

    const result = runMigrations(legacy, [auditLogsMigration]);
    expect(result.applied).toEqual(['0005_kernel_operation_logs']);

    const columns = (legacy.prepare(`PRAGMA table_info(operation_logs)`).all() as Array<{ name: string }>).map(
      (c) => c.name,
    );
    expect(columns).toEqual(expect.arrayContaining(['user_id', 'role']));

    // The constraints are gone, so an unknown actor no longer blocks the write.
    expect(legacy.prepare(`PRAGMA foreign_key_list(operation_logs)`).all()).toEqual([]);

    // Existing history survives the rebuild.
    const rows = legacy.prepare(`SELECT action, details FROM operation_logs`).all();
    expect(rows).toEqual([{ action: '旧记录', details: '保留我' }]);

    const log = createAuditLog({ db: legacy });
    expect(() => log.record({ action: '未知用户操作', actorId: 999 })).not.toThrow();
    expect(log.count()).toBe(2);

    legacy.close();
  });

  it('records an entry with the actor in both attribution columns', () => {
    const log = createAuditLog({ db });
    log.record({ action: '创建班级', detail: '班级名称: 一班', actorId: 7, role: 'teacher', ip: '127.0.0.1' });

    const [row] = log.list();
    expect(row).toMatchObject({
      action: '创建班级',
      details: '班级名称: 一班',
      teacher_id: 7,
      user_id: 7,
      role: 'teacher',
      ip_address: '127.0.0.1',
    });
    expect(log.count()).toBe(1);
  });

  it('records an entry with no actor without inventing one', () => {
    // The baseline defaulted the teacher to 1, which made every unattributed action
    // look like it was performed by that user.
    const log = createAuditLog({ db });
    log.record({ action: '未知操作' });
    const [row] = log.list();
    expect(row.teacher_id).toBeNull();
    expect(row.user_id).toBeNull();
  });

  it('never throws when the table is missing', () => {
    const empty = openDatabase(':memory:');
    const log = createAuditLog({ db: empty });
    expect(() => log.record({ action: 'x' })).not.toThrow();
    empty.close();
  });
});

// ---------------------------------------------------------------------------
// middleware
// ---------------------------------------------------------------------------

describe('audit middleware', () => {
  let db: Database;
  let registry: ReturnType<typeof createAuditRegistry>;
  let auditLog: ReturnType<typeof createAuditLog>;

  const makeRes = () => {
    const listeners: Array<() => void> = [];
    const res: ResponseLike = {
      statusCode: 200,
      on: (_event, listener) => {
        listeners.push(listener);
        return res;
      },
      removeListener: (_event, listener) => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
        return res;
      },
    };
    return { res, finish: () => listeners.slice().forEach((l) => l()) };
  };

  const build = (getContext = () => ({ actorId: 5, role: 'teacher', requestId: 'r1' })) =>
    createAuditMiddleware({
      registry,
      auditLog,
      getContext: getContext as never,
    });

  beforeEach(() => {
    db = openDatabase(':memory:');
    runMigrations(db, [auditLogsMigration]);
    registry = createAuditRegistry();
    registry.register(
      [{ method: 'POST', pattern: '/api/shop', action: '添加商品', detail: '商品名称: {{name}}' }],
      'core',
    );
    auditLog = createAuditLog({ db });
  });
  afterEach(() => db.close());

  it('records a matching mutating request', () => {
    const { res, finish } = makeRes();
    const req: RequestLike = { method: 'POST', path: '/api/shop', body: { name: '铅笔' } };

    let called = false;
    build()(req, res, () => {
      called = true;
    });
    expect(called).toBe(true);

    finish();
    expect(auditLog.list()[0]).toMatchObject({
      action: '添加商品',
      details: '商品名称: 铅笔',
      teacher_id: 5,
      role: 'teacher',
    });
  });

  it('ignores GET requests', () => {
    const { res, finish } = makeRes();
    let called = false;
    build()({ method: 'GET', path: '/api/shop' }, res, () => {
      called = true;
    });
    finish();
    expect(called).toBe(true);
    expect(auditLog.count()).toBe(0);
  });

  it('ignores an undescribed route', () => {
    const { res, finish } = makeRes();
    build()({ method: 'POST', path: '/api/other' }, res, () => {});
    finish();
    expect(auditLog.count()).toBe(0);
  });

  it('does not record a failed request', () => {
    const { res, finish } = makeRes();
    res.statusCode = 400;
    build()({ method: 'POST', path: '/api/shop', body: {} }, res, () => {});
    finish();
    expect(auditLog.count()).toBe(0);
  });

  it('takes attribution from the context, not the request body', () => {
    const { res, finish } = makeRes();
    // A caller claiming to be teacher 1 must not be believed; the verified context
    // is the only source.
    build(() => ({ actorId: 42, role: 'admin', requestId: 'r2' }))(
      { method: 'POST', path: '/api/shop', body: { name: 'x', teacherId: 1 } },
      res,
      () => {},
    );
    finish();
    expect(auditLog.list()[0]).toMatchObject({ teacher_id: 42, user_id: 42, role: 'admin' });
  });

  it('does not double-record when finish fires more than once', () => {
    const { res, finish } = makeRes();
    build()({ method: 'POST', path: '/api/shop', body: { name: 'x' } }, res, () => {});
    finish();
    finish();
    expect(auditLog.count()).toBe(1);
  });

  it('passes the request through when auditing throws', () => {
    const { res } = makeRes();
    const broken = createAuditMiddleware({
      registry,
      auditLog: {
        record: () => {
          throw new Error('disk full');
        },
        list: () => [],
        count: () => 0,
      },
      getContext: () => ({ actorId: 1, role: 'teacher' }),
    });
    let called = false;
    expect(() => broken({ method: 'POST', path: '/api/shop', body: {} }, res, () => {
      called = true;
    })).not.toThrow();
    expect(called).toBe(true);
  });
});
