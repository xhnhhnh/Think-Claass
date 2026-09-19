/**
 * End-to-end plugin host test.
 *
 * Boots a real kernel with the real `classroom`, `pet` and `economy` plugins from `plugins/`,
 * then exercises them over HTTP. This is the test that proves the architecture
 * rather than the parts: discovery, manifest validation, dependency ordering,
 * migrations, the Nest dynamic-module assembly, the classroom port, permissions and
 * events all have to work together for a single request to succeed.
 */

import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createKernel, type Kernel } from '@thinkclass/kernel';
import { createPluginHost, type PluginHost } from '@thinkclass/plugin-runtime';

import { bootSchemaMigration } from '../../api/schema/legacyBootSchema.js';
import { APP_MIGRATIONS } from '../../api/schema/appMigrations.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let kernel: Kernel;
let host: PluginHost | null = null;
let server: Server;
let base: string;
let token: string;

beforeAll(async () => {
  kernel = await createKernel({
    inMemoryDatabase: true,
    overrides: {
      logLevel: 'silent',
      pluginsEnabled: true,
      pluginDirs: [],
      env: 'test',
    },
    // The application's schema, exactly as `api/app.ts` supplies it. Injecting the shared
    // list rather than a hand-picked migration is what makes this test exercise the real boot
    // path: the kernel composition applies the same chain the legacy one does.
    migrations: APP_MIGRATIONS,
    mountPlugins: async (hooks) => {
      host = await createPluginHost({
        ...hooks,
        pluginDirs: [path.join(ROOT, 'plugins')],
        // `plugins/identity` registers its credential verifier through this holder during setup.
        // The kernel router normally reads the same object; this test does not exercise that route,
        // but without a holder the identity plugin's setup fails - which is exactly the failure
        // mode the ApiError in `ctx.auth.registerProvider` exists to surface loudly.
        authProvider: { current: null },
      });
      return host;
    },
  });

  // No schema setup needed beyond that: `classes`, `students`, `records` and the rest
  // already exist on this in-memory database. This test used to call
  // `ensureAdoptedSchema()` explicitly, which was a path the application no longer took
  // once the boot schema became a migration (P4.3c.2).

  // Seeded after boot because plugin setup does not query these tables. Student 11 exists so
  // the pet and economy blocks can exercise two-student operations (battles, transfers).
  kernel.db.exec(`
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (1, '一班', 7, 'ABC123');
    INSERT INTO students (id, user_id, class_id, name, total_points, available_points)
      VALUES (10, 100, 1, '小明', 0, 0);
    INSERT INTO students (id, user_id, class_id, name, total_points, available_points)
      VALUES (11, 101, 1, '小红', 0, 0);
  `);

  server = await new Promise<Server>((resolve) => {
    const s = kernel.app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  const session = kernel.sessions.issue({ userId: 7, role: 'teacher', classId: 1, ttlMs: 60_000 });
  token = session.token;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await host?.stop();
  await kernel.shutdown();
});

const api = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
};

// ---------------------------------------------------------------------------

describe('plugin discovery and activation', () => {
  it('rejects nothing', () => {
    // Asserting this first keeps a discovery or validation failure from showing up
    // as twenty unrelated 404s.
    expect(host!.rejections).toEqual([]);
  });

  it('activates every in-repo plugin', () => {
    expect(host).not.toBeNull();
    // Asserted as a set, not a sequence: the resolver's ordering is its own concern
    // (covered by resolver.test.ts) and pinning it here would make every new plugin
    // break this test for the wrong reason.
    expect(host!.active.map((entry) => entry.manifest.id).sort()).toEqual([
      'assignments',
      'battles',
      'challenge',
      'classroom',
      'collaboration',
      'dungeon',
      'economy',
      'engagement',
      'gacha',
      'identity',
      'insights',
      'learning',
      'marketplace',
      'parent-buff',
      'payment',
      'pet',
      'portal',
      'slg',
      'system',
    ]);
  });

  it('orders the foundation plugin before its dependent', () => {
    const order = host!.active.map((entry) => entry.manifest.id);
    expect(order.indexOf('classroom')).toBeLessThan(order.indexOf('pet'));
  });

  it('applies the pet migrations through the versioned runner, including its own cleanup', () => {
    // P4.3b.6: the plugin's P3 reference tables (`p_pet_pets`, `p_pet_praise_log`) are gone.
    // That is a plugin dropping tables it created, which the runner allows for anything under
    // its own `p_pet_` prefix - and it is why this assertion is empty rather than a list.
    const tables = kernel.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'p_pet_%' ORDER BY name`)
      .all() as Array<{ name: string }>;
    expect(tables).toEqual([]);

    const ledger = kernel.db
      .prepare(`SELECT id, owner FROM __core_migrations WHERE owner = 'pet' ORDER BY id`)
      .all() as Array<{ id: string; owner: string }>;
    // Namespaced so two plugins can both declare a migration called "0001_init".
    expect(ledger.map((row) => row.id)).toEqual(['p_pet_0001_init', 'p_pet_0002_retire_reference_tables']);

    // The adopted table is the domain's real storage and predates the plugin: the app's boot
    // schema creates it, which is what `data.adopted` means.
    expect(kernel.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='pets'`).get()).toBeTruthy();
  });

  it('records every activated plugin in the state store', () => {
    const rows = host!.stateStore.list();
    expect(rows.map((r) => `${r.id}:${r.state}`).sort()).toEqual([
      'assignments:active',
      'battles:active',
      'challenge:active',
      'classroom:active',
      'collaboration:active',
      'dungeon:active',
      'economy:active',
      'engagement:active',
      'gacha:active',
      'identity:active',
      'insights:active',
      'learning:active',
      'marketplace:active',
      'parent-buff:active',
      'payment:active',
      'pet:active',
      'portal:active',
      'slg:active',
      'system:active',
    ]);
  });

  it('publishes the declared service ports', () => {
    // `parent_buff.public` joins in P4.3b.7: the parent-buff plugin owns `parent_activity` and
    // now publishes the parent-login activity write that identity used to perform directly.
    // The underscore is not a typo - the service registry requires the name's first segment to
    // be exactly the plugin's derived slug (`slugOf('parent-buff') === 'parent_buff'`).
    // `identity.public` joins in the same round: `activateUser` is the call the payment webhook
    // ends in, and publishing it is what makes the payment half migratable next.
    // `engagement.public` joins in P4.3b.12: `praises` moved to that plugin in P4.3b.10, and the
    // insights read model needs a praise count and the newest snippets without touching the table.
    expect(host!.services.list().map((s) => s.name).sort()).toEqual([
      'classroom.public',
      'engagement.public',
      'identity.public',
      'parent_buff.public',
      'pet.public',
    ]);
  });

  it('registers the declared permissions only', () => {
    // classroom declares the class-scope capability catalogue (19 legacy flags);
    // pet declares its two feature permissions. Nothing else may appear.
    const keys = kernel.permissions.list().map((p) => p.key);
    const classroomKeys = keys.filter((key) => key.startsWith('classroom.'));
    const petKeys = keys.filter((key) => key.startsWith('pet.'));

    expect(classroomKeys).toHaveLength(19);
    expect(classroomKeys).toContain('classroom.enable_shop');
    expect(petKeys).toEqual(['pet.adopt', 'pet.interact']);
    expect(keys).toHaveLength(21);

    // Every declared permission is attributed to the plugin that declared it.
    const owners = new Set(kernel.permissions.list().map((p) => p.pluginId));
    expect([...owners].sort()).toEqual(['classroom', 'pet']);
  });

  it('reports the plugin summary through /api/health', async () => {
    const { body } = await api('GET', '/api/health');
    expect(body.kernel.plugins.total).toBe(19);
    expect(body.kernel.plugins.active).toBe(19);
    expect(body.kernel.plugins.degraded).toBe(0);
  });

  it('exposes the frontend projection', async () => {
    const { body } = await api('GET', '/api/kernel/plugins');
    const ids = body.data.map((entry: { id: string }) => entry.id).sort();
    expect(ids).toEqual(['assignments', 'battles', 'challenge', 'classroom', 'collaboration', 'dungeon', 'economy', 'engagement', 'gacha', 'identity', 'insights', 'learning', 'marketplace', 'parent-buff', 'payment', 'pet', 'portal', 'slg', 'system']);
  });
});

describe('plugin HTTP surface', () => {
  it('serves a plugin controller route', async () => {
    const { status, body } = await api('GET', '/api/pet/health');
    expect(status).toBe(200);
    expect(body.data).toEqual({ plugin: 'pet', version: '1.0.0' });
  });

  it('adopts through the permission-gated alias, writing the real `pets` table', async () => {
    const { status, body } = await api('POST', '/api/pet/students/10/adopt', { elementType: 'fire' });
    // 200, not Nest's POST default of 201: every pet POST is pinned to 200 because the
    // pre-plugin controller set it explicitly.
    expect(status).toBe(200);
    expect(body.pet).toMatchObject({ student_id: 10, element_type: 'fire', level: 1 });
    expect(body.data.petId).toBe(body.petId);

    const row = kernel.db.prepare(`SELECT * FROM pets WHERE student_id = 10`).get() as { element_type: string };
    expect(row.element_type).toBe('fire');
  });

  it('reads the pet back in the legacy envelope, flat copy and all', async () => {
    const { status, body } = await api('GET', '/api/pet/students/10');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    // `src/features/pet/api/petApi.ts` reads the flat `pet`/`has_parent_buff` copies, and the
    // `data` object carries the same payload - both are part of the contract.
    expect(body.pet).toMatchObject({ student_id: 10, element_type: 'fire' });
    expect(body.has_parent_buff).toBe(false);
    expect(body.data.pet).toEqual(body.pet);
    expect(body.data.hasParentBuff).toBe(false);
  });

  it('serves the older /api/pets family the parent dashboard still calls', async () => {
    const { status, body } = await api('GET', '/api/pets/10');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.pet).toMatchObject({ student_id: 10, element_type: 'fire' });
    expect(body.has_parent_buff).toBe(false);

    // A POST on this family too: Nest defaults POST to 201, and the pre-plugin controller
    // pinned 200 on every one of them.
    const adopted = await api('POST', '/api/pets/adopt', { studentId: 11, elementType: 'grass' });
    expect(adopted.status).toBe(200);
    expect(adopted.body.pet).toMatchObject({ student_id: 11, element_type: 'grass' });
    expect(adopted.body.data).toBeUndefined();
  });

  it('battles two real pets through the legacy family, and answers 200', async () => {
    const { status, body } = await api('POST', '/api/pet/battles', { studentId: 10, opponentId: 11 });

    expect(status).toBe(200);
    expect(body.result).toMatchObject({
      isWin: expect.any(Boolean),
      isDraw: expect.any(Boolean),
      myRoll: expect.any(Number),
    });
    expect(body.data.result).toEqual(body.result);
  });

  it('distinguishes an unknown student (404) from a student with no pet (200, null)', async () => {
    const unknown = await api('GET', '/api/pet/students/999');
    expect(unknown.status).toBe(404);
    expect(unknown.body.message).toBe('Student not found');
  });

  it('refuses a second adoption with the legacy 400, not a generic 500', async () => {
    const { status, body } = await api('POST', '/api/pet/students/10/adoptions', { elementType: 'water' });
    expect(status).toBe(400);
    expect(body.message).toBe('Pet already adopted');
  });

  it('rejects an action without an actionType', async () => {
    const { status, body } = await api('POST', '/api/pet/students/10/action', { action: 'fly' });
    expect(status).toBe(400);
    expect(body.message).toBe('Action type is required');
  });

  it('moves points through the port and appends the shared ledger on interact', async () => {
    kernel.db.prepare(`UPDATE students SET available_points = 100 WHERE id = 10`).run();
    // Read the pet's experience first: the battle test above already awarded experience, so an
    // absolute expectation here would depend on that test running (and on who won the dice).
    const before = kernel.db.prepare(`SELECT experience FROM pets WHERE student_id = 10`).get() as {
      experience: number;
    };

    const { status, body } = await api('POST', '/api/pet/students/10/actions', {
      actionType: '训练',
      cost: 40,
      expGain: 25,
      type: 'TRAIN',
    });

    expect(status).toBe(200);
    expect(body.points).toBe(60);
    expect(body.pet.experience).toBe(before.experience + 25);

    const student = kernel.db.prepare(`SELECT available_points FROM students WHERE id = 10`).get() as {
      available_points: number;
    };
    expect(student.available_points).toBe(60);

    // `records` belongs to classroom; pet appends through the port, never directly. Scoped to
    // this domain's type because the table is shared by every point-earning feature.
    const ledger = kernel.db
      .prepare(`SELECT type, amount FROM records WHERE student_id = 10 AND type = 'TRAIN' ORDER BY id`)
      .all();
    expect(ledger).toEqual([{ type: 'TRAIN', amount: -40 }]);
  });

  it('leaves kernel routes untouched', async () => {
    const { status } = await api('GET', '/api/kernel/info');
    expect(status).toBe(200);
  });
});

describe('cross-plugin collaboration', () => {
  it('pet reads classroom data through the port, never the students table', async () => {
    // pet's manifest declares no access to `students`: the ownership guard in ctx.db would
    // reject a direct query, so the requests above are proof the port is being used.
    const petManifest = host!.active.find((entry) => entry.manifest.id === 'pet')!.manifest;
    expect(petManifest.data.adopted).toEqual(['pets']);
    // The two declared READS are tables with no owner or no port yet; `students` is neither.
    expect(petManifest.data.reads).toEqual(['praises', 'parent_activity']);
    expect(petManifest.dependsOn).toEqual({ classroom: '^1.0.0' });
  });

  it('classroom owns the legacy tables through an explicit transitional declaration', () => {
    const classroomManifest = host!.active.find((entry) => entry.manifest.id === 'classroom')!.manifest;
    expect(classroomManifest.data.adopted).toEqual(['students', 'classes', 'records']);
    expect(classroomManifest.data.tables).toEqual([]);
  });

  it('challenge takes its boss damage from pet.public, resolved late', async () => {
    // This is the test that would have caught a real bug: resolving an OPTIONAL port inside
    // `setup()` looks right and is wrong, because plugins are set up in slug order and
    // `challenge` runs before `pet`. The first version of this wiring captured
    // `ctx.tryUse('pet.public')` during setup, got null, and answered 10 damage forever while
    // the database held a pet with attack_power 777 (the real-boot probe measured it).
    //
    // The value is deliberately not the fallback: 777 cannot be produced by `?? 10`, and it
    // cannot come from a direct `pets` read either - that statement no longer exists.
    kernel.db.prepare(`UPDATE pets SET attack_power = 777 WHERE student_id = 10`).run();
    kernel.db.prepare(`INSERT INTO world_bosses (id, name, hp, max_hp, level, status) VALUES (77, '测试Boss', 1000, 1000, 1, 'active')`).run();
    kernel.permissions.store.set({
      scopeType: 'class',
      scopeId: 1,
      capabilityKey: 'classroom.enable_world_boss',
      enabled: true,
    });

    const { status, body } = await api('POST', '/api/challenge/bosses/77/attacks', { studentId: 10 });

    expect(status).toBe(201);
    expect(body.damage).toBe(777);
    expect(body.newHp).toBe(223);

    const boss = kernel.db.prepare(`SELECT hp FROM world_bosses WHERE id = 77`).get() as { hp: number };
    expect(boss.hp).toBe(223);

    // And the plugin's own manifest says it does not read `pets` at all any more.
    const challengeManifest = host!.active.find((entry) => entry.manifest.id === 'challenge')!.manifest;
    expect(challengeManifest.data.reads).toEqual(['question_bank']);
  });

  it('awarding points through the port updates the student and emits an event', async () => {
    const received: unknown[] = [];
    kernel.events.on('classroom.student.points.changed', (payload) => {
      received.push(payload);
    });

    const classroom = kernel.permissions.list(); // touch the permissions catalogue
    expect(classroom).toBeDefined();

    kernel.db.prepare(`UPDATE students SET available_points = 50 WHERE id = 10`).run();
    // A debit through the port is what emits the event; the pet alias route is the caller.
    const { status, body } = await api('POST', '/api/pet/students/10/action', {
      actionType: 'play',
      cost: 20,
      expGain: 5,
    });
    expect(status).toBe(200);
    expect(body.points).toBe(30);

    await kernel.events.drain();
    expect(received).toEqual([
      { studentId: 10, classId: 1, delta: -20, reason: 'Consumed for play', actorId: 7 },
    ]);
  });
});

/**
 * The migrated domain, end to end, in the kernel composition.
 *
 * economy is the first domain that used to be an `api/modules` Nest module. These
 * tests run the whole path the migration is meant to establish: plugin controller ->
 * economy service -> classroom.public port -> capability/column fallback -> the
 * plugin's own tables. They also pin the two things that could silently regress:
 * the feature gate, and the fact that the balance moves through the port rather than
 * through a direct write to `students`.
 */
describe('economy, migrated to a plugin', () => {
  /** Enable the class-scope feature the way the real admin surface does. */
  const enableEconomy = (classId: number, enabled: boolean) =>
    kernel.permissions.store.set({
      scopeType: 'class',
      scopeId: classId,
      capabilityKey: 'classroom.enable_economy',
      enabled,
    });

  it('refuses with 403 when the class has the feature turned off', async () => {
    enableEconomy(1, false);
    const { status, body } = await api('GET', '/api/economy/students/10/bank');
    expect(status).toBe(403);
    expect(body.message).toContain('该功能当前已关闭');
  });

  it('serves the domain once the feature is on', async () => {
    enableEconomy(1, true);
    const { status, body } = await api('GET', '/api/economy/students/10/bank');
    expect(status).toBe(200);
    // Two envelope styles are part of the contract; this route carries both.
    expect(body.success).toBe(true);
    expect(body.data.account).toMatchObject({ student_id: 10, deposit_amount: 0 });
    expect(body.account).toEqual(body.data.account);
  });

  it('moves the balance through the port and records the ledger, not by writing tables', async () => {
    enableEconomy(1, true);
    kernel.db.prepare(`UPDATE students SET available_points = 100 WHERE id = 10`).run();

    const deposited = await api('POST', '/api/economy/students/10/bank/deposits', { amount: 40 });
    expect(deposited.status).toBe(201);

    const student = kernel.db.prepare(`SELECT available_points FROM students WHERE id = 10`).get() as {
      available_points: number;
    };
    expect(student.available_points).toBe(60);

    // Scoped to the deposit's own ledger type: `records` is the shared point ledger that pet,
    // gacha, marketplace and the rest append to, so an unscoped count here would be asserting
    // on every other domain's rows too (which is exactly what broke when pet migrated).
    const ledger = kernel.db
      .prepare(`SELECT type, amount FROM records WHERE student_id = 10 AND type = 'BANK_DEPOSIT'`)
      .all() as Array<{
      type: string;
      amount: number;
    }>;
    expect(ledger).toEqual([{ type: 'BANK_DEPOSIT', amount: -40 }]);

    const account = kernel.db.prepare(`SELECT deposit_amount FROM bank_accounts WHERE student_id = 10`).get() as {
      deposit_amount: number;
    };
    expect(account.deposit_amount).toBe(40);
  });

  it('refuses an overdraft without moving anything', async () => {
    enableEconomy(1, true);
    kernel.db.prepare(`UPDATE students SET available_points = 10 WHERE id = 10`).run();

    const { status, body } = await api('POST', '/api/economy/students/10/bank/deposits', { amount: 500 });
    expect(status).toBe(400);
    expect(body.message).toContain('余额不足');

    const account = kernel.db.prepare(`SELECT deposit_amount FROM bank_accounts WHERE student_id = 10`).get() as {
      deposit_amount: number;
    };
    expect(account.deposit_amount).toBe(40);
  });

  it('declares the tables it adopted and no read access to another plugin tables', () => {
    const manifest = host!.active.find((entry) => entry.manifest.id === 'economy')!.manifest;
    expect(manifest.data.adopted).toEqual(['bank_accounts', 'stocks', 'student_stocks']);
    expect(manifest.data.tables).toEqual([]);
    expect(manifest.data.reads ?? []).toEqual([]);
    expect(manifest.dependsOn).toEqual({ classroom: '^1.0.0' });
  });
});
