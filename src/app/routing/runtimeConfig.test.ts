/**
 * The admin path is a runtime setting.
 *
 * It used to be baked into the bundle: `ADMIN_PATH = import.meta.env.VITE_ADMIN_PATH || '/beiadmin'`
 * is evaluated at build time, so pointing an existing deployment at a different path meant
 * rewriting the built assets with `sed` - which also rewrote the literal `/beiadmin` anywhere
 * else it appeared, and could not be undone.
 *
 * The server already injects `window.__TC_CONFIG__.adminPath`, so these tests pin the three
 * things that make the fix real: the injected value wins, the build-time value remains the
 * fallback, and the admin route actually moves with it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { adminPath, runtimeConfig } from '@/constants';
import { flatRoutesWithAdmin, layoutRoutes } from '@/app/routing/routeTable';

afterEach(() => {
  delete window.__TC_CONFIG__;
});

describe('the injection contract with the server', () => {
  /**
   * The kernel injects the config by replacing this exact marker in the served HTML, and
   * `express.static` must not answer `/` itself or the replacement never runs. Both halves
   * were broken: the marker was missing from `index.html`, so the injection was dead code for
   * its entire life, and the frontend had no reader at all.
   *
   * The `index: false` half is asserted where it lives (the kernel's static branch); this
   * checks the template half, which is the one that can vanish in an unrelated edit.
   */
  it('index.html still carries the marker the kernel replaces', () => {
    const template = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    expect(template).toContain('<!--__TC_CONFIG__-->');
  });
});

describe('runtime configuration', () => {
  it('reads what the server injected', () => {
    window.__TC_CONFIG__ = { adminPath: '/custom-admin', apiBase: '/api', pluginRuntime: true, env: 'production' };

    expect(runtimeConfig().adminPath).toBe('/custom-admin');
    expect(adminPath()).toBe('/custom-admin');
  });

  it('falls back to the build-time value when nothing was injected', () => {
    // A static preview or a test run has no injection; the app must still work.
    expect(runtimeConfig()).toEqual({});
    expect(typeof adminPath()).toBe('string');
    expect(adminPath().trim()).not.toBe('');
  });

  it('ignores a blank injected value', () => {
    window.__TC_CONFIG__ = { adminPath: '   ' };
    expect(adminPath().trim()).not.toBe('');
  });

  it('moves the admin routes with the injected path', () => {
    window.__TC_CONFIG__ = { adminPath: '/control-room' };

    const routes = layoutRoutes();
    const admin = routes.find((route) => route.path === '/control-room');
    expect(admin, 'the admin layout route should use the injected path').toBeDefined();
    expect(admin!.allowedRoles).toEqual(['admin', 'superadmin']);

    // And the login route that sits outside the layout. Found by component rather than by
    // `endsWith('/login')`, which also matches the unrelated `/login` route.
    const login = flatRoutesWithAdmin().find((route) => route.component === '@/pages/Admin/Login');
    expect(login?.path).toBe('/control-room/login');
  });

  it('keeps the non-admin routes independent of the injected path', () => {
    window.__TC_CONFIG__ = { adminPath: '/control-room' };

    expect(layoutRoutes().map((route) => route.path)).toEqual([
      '/teacher',
      '/student',
      '/parent',
      '/control-room',
    ]);
  });

  it('still produces the full route count for a custom path', () => {
    // The route table is built per call now, so a custom path must not drop or duplicate routes.
    window.__TC_CONFIG__ = { adminPath: '/control-room' };

    const flat = flatRoutesWithAdmin();
    const layouts = layoutRoutes();
    const children = layouts.reduce((total, layout) => total + layout.children.length, 0);

    expect(flat).toHaveLength(9);
    expect(layouts).toHaveLength(4);
    expect(flat.length + layouts.length + children).toBe(80);
  });
});
