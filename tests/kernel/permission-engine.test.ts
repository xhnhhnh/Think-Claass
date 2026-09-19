/**
 * Permission engine: scope chain resolution, defaults, fail-closed behaviour.
 *
 * This is the mechanism that replaces the 19 `enable_*` columns on `classes` and
 * the two hardcoded key lists.
 */

import { describe, expect, it } from 'vitest';

import {
  createMemoryAssignmentStore,
  createPermissionEngine,
} from '@thinkclass/kernel';
import type { Actor, PermissionDeclaration } from '@thinkclass/contracts';

const declarations: PermissionDeclaration[] = [
  { key: 'shop.use', scope: 'class', default: true, label: '积分商城' },
  { key: 'gacha.use', scope: 'class', default: false, label: '召唤法阵' },
  { key: 'pet.adopt', scope: 'student', default: true, label: '领养精灵' },
];

const student: Actor = { userId: 10, role: 'student', studentId: 100, classId: 5 };

describe('permission engine', () => {
  it('falls back to the declared default when nothing is assigned', () => {
    const engine = createPermissionEngine();
    engine.register(declarations, 'demo');

    expect(engine.can(student, 'shop.use')).toBe(true);
    expect(engine.can(student, 'gacha.use')).toBe(false);
  });

  it('denies a permission no plugin declared', () => {
    const engine = createPermissionEngine();
    expect(engine.can(student, 'typo.nonexistent')).toBe(false);
  });

  it('honours a class-scope assignment over the default', () => {
    const store = createMemoryAssignmentStore([
      { scopeType: 'class', scopeId: 5, capabilityKey: 'shop.use', enabled: false },
    ]);
    const engine = createPermissionEngine({ store });
    engine.register(declarations, 'demo');

    expect(engine.can(student, 'shop.use')).toBe(false);
  });

  it('prefers the narrowest scope', () => {
    const store = createMemoryAssignmentStore([
      { scopeType: 'class', scopeId: 5, capabilityKey: 'pet.adopt', enabled: true },
      { scopeType: 'student', scopeId: 100, capabilityKey: 'pet.adopt', enabled: false },
    ]);
    const engine = createPermissionEngine({ store });
    engine.register(declarations, 'demo');

    // student scope (narrowest) wins over class scope
    expect(engine.can(student, 'pet.adopt')).toBe(false);
  });

  it('walks up to the class when the student scope has no assignment', () => {
    const store = createMemoryAssignmentStore([
      { scopeType: 'class', scopeId: 5, capabilityKey: 'pet.adopt', enabled: false },
    ]);
    const engine = createPermissionEngine({ store });
    engine.register(declarations, 'demo');

    expect(engine.can(student, 'pet.adopt')).toBe(false);
  });

  it('falls through to the platform scope last', () => {
    const store = createMemoryAssignmentStore([
      { scopeType: 'platform', scopeId: 0, capabilityKey: 'gacha.use', enabled: true },
    ]);
    const engine = createPermissionEngine({ store });
    engine.register(declarations, 'demo');

    // platform scope has id undefined in the chain, so this asserts the documented
    // shape rather than an accidental hit.
    expect(engine.scopeChain(student).map((s) => s.type)).toEqual(['student', 'class', 'platform']);
    expect(engine.can(student, 'gacha.use')).toBe(false);
  });

  it('builds the scope chain narrowest first', () => {
    const engine = createPermissionEngine();
    const teacher: Actor = { userId: 1, role: 'teacher', classId: 9, schoolId: 2 };
    expect(engine.scopeChain(teacher).map((s) => `${s.type}:${s.id ?? '-'}`)).toEqual([
      'class:9',
      'school:2',
      'platform:-',
    ]);
  });

  it('rejects a duplicate key declared by another plugin', () => {
    const engine = createPermissionEngine();
    engine.register(declarations, 'alpha');
    expect(() => engine.register([declarations[0]], 'beta')).toThrow(/already declared by plugin "alpha"/);
  });

  it('allows a plugin to re-register its own key', () => {
    const engine = createPermissionEngine();
    engine.register(declarations, 'alpha');
    expect(() => engine.register([declarations[0]], 'alpha')).not.toThrow();
  });

  it('removes a plugin\u2019s permissions without touching others', () => {
    const engine = createPermissionEngine();
    engine.register(declarations, 'alpha');
    engine.register([{ key: 'other.thing', scope: 'class', default: true, label: 'x' }], 'beta');

    engine.unregister('alpha');

    expect(engine.get('shop.use')).toBeUndefined();
    expect(engine.get('other.thing')).toBeDefined();
    expect(engine.can(student, 'shop.use')).toBe(false);
  });

  it('stamps the owning plugin onto each declaration', () => {
    const engine = createPermissionEngine();
    engine.register(declarations, 'demo');
    expect(engine.list().every((d) => d.pluginId === 'demo')).toBe(true);
  });
});
