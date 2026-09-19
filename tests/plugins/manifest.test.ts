/**
 * Manifest validation.
 *
 * The manifest is what the runtime trusts to build the dependency graph, the
 * permission catalogue and the frontend route table *without executing plugin
 * code*, so a manifest that overstates or understates its contents is the most
 * consequential thing a plugin can get wrong.
 */

import { describe, expect, it } from 'vitest';

import { slugOf, tablePrefixOf, validateManifest } from '@thinkclass/plugin-sdk';

/** Smallest manifest that should validate. */
function baseManifest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'demo',
    name: 'Demo',
    version: '1.0.0',
    kernel: '^1',
    tier: 'feature',
    ...overrides,
  };
}

const errorsOf = (manifest: unknown) => validateManifest(manifest).errors.map((e) => `${e.path}: ${e.message}`);

describe('manifest validation', () => {
  it('accepts a minimal manifest and fills defaults', () => {
    const result = validateManifest(baseManifest());
    expect(result.ok).toBe(true);
    expect(result.manifest).toMatchObject({
      id: 'demo',
      slug: 'demo',
      required: false,
      isolation: 'restricted',
      data: { tables: [], adopted: [], reads: [], capabilities: [] },
    });
  });

  it('derives table-namespace helpers from the id', () => {
    expect(slugOf('acme.quiz')).toBe('acme_quiz');
    expect(slugOf('pet')).toBe('pet');
    expect(tablePrefixOf('acme.quiz')).toBe('p_acme_quiz_');
  });

  it('rejects a non-object', () => {
    expect(validateManifest(null).ok).toBe(false);
    expect(validateManifest([]).errors[0].message).toContain('JSON object');
  });

  it('rejects a malformed id', () => {
    expect(errorsOf(baseManifest({ id: 'Demo Plugin' })).join()).toContain('lowercase');
  });

  it('rejects a slug that is not derived from the id', () => {
    expect(errorsOf(baseManifest({ slug: 'something-else' })).join()).toContain('must be derived from id');
  });

  it('rejects a non-semver version', () => {
    expect(errorsOf(baseManifest({ version: '1.0' })).join()).toContain('not a semantic version');
  });

  it('accepts partial versions inside ranges', () => {
    // `^1` is idiomatic and must not be treated as malformed.
    expect(validateManifest(baseManifest({ kernel: '^1' })).ok).toBe(true);
    expect(validateManifest(baseManifest({ kernel: '>=1.2 <2' })).ok).toBe(true);
    expect(validateManifest(baseManifest({ kernel: 'not-a-range' })).ok).toBe(false);
  });

  it('rejects an unsupported kernel API level', () => {
    const result = validateManifest(baseManifest({ kernel: '^2' }), { kernelApiVersion: 1 });
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain('this kernel provides API 1');
  });

  it('requires foundation plugins to be required, and feature plugins not to be', () => {
    expect(errorsOf(baseManifest({ tier: 'foundation' })).join()).toContain('must set "required": true');
    expect(errorsOf(baseManifest({ tier: 'feature', required: true })).join()).toContain('only foundation-tier');
    expect(validateManifest(baseManifest({ tier: 'foundation', required: true })).ok).toBe(true);
  });

  it('rejects a backend entry that escapes the plugin directory', () => {
    expect(errorsOf(baseManifest({ entry: { backend: '../../etc/passwd' } })).join()).toContain('relative path');
    expect(errorsOf(baseManifest({ entry: { backend: '/abs/path.ts' } })).join()).toContain('relative path');
  });

  it('rejects a self-dependency and an unparsable range', () => {
    expect(errorsOf(baseManifest({ dependsOn: { demo: '^1' } })).join()).toContain('cannot depend on itself');
    expect(errorsOf(baseManifest({ dependsOn: { other: 'banana' } })).join()).toContain('unparsable');
  });

  it('namespaces owned tables but tolerates adopted legacy ones', () => {
    expect(
      validateManifest(baseManifest({ data: { tables: ['p_demo_things'] } })).ok,
    ).toBe(true);

    const wrongPrefix = errorsOf(baseManifest({ data: { tables: ['things'] } }));
    expect(wrongPrefix.join()).toContain('must start with "p_demo_"');

    // Adopted tables are legacy-named by definition; they are allowed but warned about.
    const adopted = validateManifest(baseManifest({ tier: 'foundation', required: true, data: { adopted: ['students'] } }));
    expect(adopted.ok).toBe(true);
    expect(adopted.warnings.some((w) => w.path === 'data.adopted')).toBe(true);

    // A table that already follows the convention must not use the adopted escape hatch.
    expect(errorsOf(baseManifest({ data: { adopted: ['p_demo_things'] } })).join()).toContain('already follows');
  });

  it('validates permission declarations', () => {
    const ok = validateManifest(
      baseManifest({
        provides: { permissions: [{ key: 'demo.act', scope: 'class', default: true, label: '动作' }] },
      }),
    );
    expect(ok.ok).toBe(true);

    expect(errorsOf(baseManifest({ provides: { permissions: [{ key: 'act', scope: 'class', default: true, label: 'x' }] } })).join()).toContain(
      'must be namespaced',
    );
    expect(
      errorsOf(baseManifest({ provides: { permissions: [{ key: 'demo.act', scope: 'galaxy', default: true, label: 'x' }] } })).join(),
    ).toContain('must be one of');
    expect(
      errorsOf(
        baseManifest({
          provides: {
            permissions: [
              { key: 'demo.act', scope: 'class', default: true, label: 'x' },
              { key: 'demo.act', scope: 'class', default: true, label: 'x' },
            ],
          },
        }),
      ).join(),
    ).toContain('duplicate permission key');
  });

  it('rejects a route requiring a permission the manifest does not declare', () => {
    const result = validateManifest(
      baseManifest({
        provides: {
          routes: [{ method: 'POST', base: '/api/demo', handler: 'c.x', auth: 'actor', permissions: ['demo.missing'] }],
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes('not declared in provides.permissions'))).toBe(true);
  });

  it('warns when a route is not namespaced under the plugin', () => {
    const result = validateManifest(
      baseManifest({ provides: { routes: [{ method: 'GET', base: '/api/somewhere', handler: 'c.x', auth: 'actor' }] } }),
    );
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('not namespaced'))).toBe(true);
  });

  it('rejects an invalid HTTP method and a relative route base', () => {
    const bad = errorsOf(
      baseManifest({ provides: { routes: [{ method: 'FETCH', base: 'api/demo', handler: 'c.x', auth: 'actor' }] } }),
    ).join();
    expect(bad).toContain('must be one of GET');
    expect(bad).toContain('must be an absolute path');
  });

  it('requires migrations to point at .sql files inside the plugin', () => {
    expect(
      validateManifest(baseManifest({ provides: { migrations: [{ id: '0001', up: 'migrations/0001.sql' }] } })).ok,
    ).toBe(true);
    expect(
      errorsOf(baseManifest({ provides: { migrations: [{ id: '0001', up: '../outside.sql' }] } })).join(),
    ).toContain('relative path to a .sql file');
    expect(
      errorsOf(baseManifest({ provides: { migrations: [{ id: '0001', up: 'migrations/0001.txt' }] } })).join(),
    ).toContain('.sql');
  });

  it('rejects an unknown capability', () => {
    expect(errorsOf(baseManifest({ data: { capabilities: ['telepathy'] } })).join()).toContain('must be one of fs');
    expect(validateManifest(baseManifest({ data: { capabilities: ['fs', 'net'] } })).ok).toBe(true);
  });

  it('collects every problem rather than stopping at the first', () => {
    const result = validateManifest({ id: 'Bad Id', version: 'x', tier: 'nope' });
    expect(result.errors.length).toBeGreaterThan(3);
    expect(result.manifest).toBeNull();
  });
});
