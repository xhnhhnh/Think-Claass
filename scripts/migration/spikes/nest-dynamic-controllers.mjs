#!/usr/bin/env node
/**
 * Spike R10 - can NestJS host plugin controllers that are only known at runtime?
 *
 * This is the highest-risk unknown of the backend plugin architecture.
 * `api/app.module.ts` declares its 14 modules statically today; a plugin system
 * needs the controller set assembled at boot from the resolved plugin graph, and
 * ideally extended while the process is running.
 *
 * NestJS decorators are plain functions, so this spike applies them
 * programmatically - the same mechanism the plugin runtime will use to wrap
 * third-party controller classes.
 *
 * IMPORTANT pitfall this spike documents: Nest's `Module()` decorator is
 * side-effecting and returns `undefined`. Applied as a plain function call,
 * `Module({...})(Ctor)` evaluates to `undefined`, so the class must be kept in a
 * variable and returned explicitly.
 *
 * Scenarios:
 *   A. boot time  - dynamic module built from a runtime-discovered controller
 *   B. runtime    - module added AFTER init() via container.addModule()
 *   C. isolation  - two independent plugin modules stay separate
 *   D. removal    - whether a plugin can be unmounted without a restart
 *
 * Run: node scripts/migration/spikes/nest-dynamic-controllers.mjs
 */

import 'reflect-metadata';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Controller, Get, Injectable, Module } from '@nestjs/common';

// ---------------------------------------------------------------------------
// runtime decorator application (proves what the plugin runtime must do)
// ---------------------------------------------------------------------------

/**
 * Build a controller class at runtime from a plain definition.
 * Decorators are applied as side-effecting calls; the class is returned explicitly
 * because decorators do not return their target in plain-call form.
 */
function defineController({ path, routes, deps = [], name }) {
  const Ctor = class RuntimeController {
    constructor(...injected) {
      this.deps = injected;
    }
  };
  Object.defineProperty(Ctor, 'name', { value: name ?? `${path.replace(/\W/g, '_')}_Controller` });

  if (deps.length > 0) {
    // Mirrors what `emitDecoratorMetadata` produces for `design:paramtypes`.
    Reflect.defineMetadata('design:paramtypes', deps, Ctor);
  }

  for (const [methodName, { httpPath, handler }] of Object.entries(routes)) {
    Object.defineProperty(Ctor.prototype, methodName, {
      value: handler,
      writable: true,
      configurable: true,
    });
    Get(httpPath)(Ctor.prototype, methodName, Object.getOwnPropertyDescriptor(Ctor.prototype, methodName));
  }

  Controller(path)(Ctor);
  return Ctor;
}

/** Build a @Module class at runtime. */
function defineModule({ controllers = [], providers = [], imports = [], name = 'RuntimeModule' }) {
  const Ctor = class {};
  Object.defineProperty(Ctor, 'name', { value: name });
  Module({ controllers, providers, imports })(Ctor); // side effect only - returns undefined
  return Ctor;
}

/** Define a class carrying an @Injectable() marker. */
function defineInjectable(name, impl) {
  const Ctor = class {};
  Object.defineProperty(Ctor, 'name', { value: name });
  Object.assign(Ctor.prototype, impl);
  Injectable()(Ctor);
  return Ctor;
}

/** Boot an express + nest host and return handles. */
async function boot(rootModule) {
  const server = express();
  const app = await NestFactory.create(rootModule, new ExpressAdapter(server), {
    bodyParser: false,
    logger: false,
    abortOnError: false,
  });
  server.use(express.json());
  await app.init();
  const httpServer = await new Promise((resolve) => {
    const s = server.listen(0, '127.0.0.1', () => resolve(s));
  });
  return {
    server,
    app,
    url: `http://127.0.0.1:${httpServer.address().port}`,
    close: () => new Promise((resolve) => httpServer.close(resolve)),
  };
}

/** Count mounted express route layers (detects double-mounting). */
function countRouteLayers(server) {
  let n = 0;
  const walk = (stack) => {
    for (const layer of stack ?? []) {
      if (layer.route) n += 1;
      else if (layer.handle?.stack) walk(layer.handle.stack);
    }
  };
  walk(server._router?.stack);
  return n;
}

const results = [];
function record(scenario, ok, detail) {
  results.push({ scenario, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${scenario}\n      ${detail}`);
}
const get = async (url) => {
  try {
    const res = await fetch(url);
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch (error) {
    return { status: 0, body: String(error) };
  }
};

// ---------------------------------------------------------------------------
console.log('\n--- A: boot-time dynamic controller ---');
{
  const Service = defineInjectable('RuntimeService', { value: () => 'service-injected-ok' });

  const SpikeController = defineController({
    path: 'api/spike',
    deps: [Service],
    routes: {
      list: { httpPath: '', handler: () => ({ success: true, data: 'boot-time-ok' }) },
      injected: {
        httpPath: 'injected',
        handler: function () {
          return { success: true, data: this.deps[0].value() };
        },
      },
    },
  });

  const Root = defineModule({
    imports: [defineModule({ controllers: [SpikeController], providers: [Service], name: 'SpikeModule' })],
    name: 'RootModule',
  });

  const host = await boot(Root);
  try {
    const plain = await get(`${host.url}/api/spike`);
    const injected = await get(`${host.url}/api/spike/injected`);
    record('A1 runtime-decorated controller is routable', plain.body?.data === 'boot-time-ok', `GET /api/spike -> ${JSON.stringify(plain.body)}`);
    record('A2 constructor DI works with manual design:paramtypes', injected.body?.data === 'service-injected-ok', `GET /api/spike/injected -> ${JSON.stringify(injected.body)}`);
  } finally {
    await host.close();
  }
}

// ---------------------------------------------------------------------------
console.log('\n--- B: changing the plugin set (the supported model) ---');
{
  const plugin = (name, path, value) =>
    defineModule({
      controllers: [
        defineController({
          path,
          routes: { list: { httpPath: '', handler: () => ({ success: true, data: value }) } },
        }),
      ],
      name,
    });

  // Boot #1 - only "alpha" enabled.
  const host1 = await boot(defineModule({ imports: [plugin('PluginAModule', 'api/p/alpha', 'alpha')], name: 'Root' }));
  try {
    const a = await get(`${host1.url}/api/p/alpha`);
    const b = await get(`${host1.url}/api/p/beta`);
    record(
      'B1 a disabled plugin contributes no routes',
      a.body?.data === 'alpha' && b.status === 404,
      `alpha -> ${JSON.stringify(a.body?.data)}, beta -> HTTP ${b.status} (beta not in the graph)`,
    );
  } finally {
    await host1.close();
  }

  // Boot #2 - "beta" now enabled. This is exactly how enable/disable works.
  const host2 = await boot(
    defineModule({ imports: [plugin('PluginAModule', 'api/p/alpha', 'alpha'), plugin('PluginBModule', 'api/p/beta', 'beta')], name: 'Root' }),
  );
  try {
    const a = await get(`${host2.url}/api/p/alpha`);
    const b = await get(`${host2.url}/api/p/beta`);
    record(
      'B2 enabling a plugin = re-resolve the graph and boot',
      a.body?.data === 'alpha' && b.body?.data === 'beta',
      `after reboot both live: alpha -> ${a.body?.data}, beta -> ${b.body?.data}`,
    );
  } finally {
    await host2.close();
  }
}

// ---------------------------------------------------------------------------
console.log('\n--- B3: why hot-ADD is not used ---');
{
  const BaseController = defineController({
    path: 'api/base',
    routes: { list: { httpPath: '', handler: () => ({ success: true, data: 'base' }) } },
  });
  const Root = defineModule({ controllers: [BaseController], name: 'RootModule' });

  const host = await boot(Root);
  try {
    const layersBefore = countRouteLayers(host.server);

    const LateModule = defineModule({
      controllers: [defineController({ path: 'api/late', routes: { list: { httpPath: '', handler: () => ({ success: true, data: 'late' }) } } })],
      name: 'LatePluginModule',
    });

    const container = host.app.container;
    const { moduleRef, inserted } = (await container.addModule(LateModule, [Root])) ?? {};

    record(
      'B3 container.addModule() registers no controllers (documented limitation)',
      inserted === true && moduleRef?.controllers?.size === 0,
      `addModule inserted=${inserted} but moduleRef.controllers.size=${moduleRef?.controllers?.size}. ` +
        `Controllers are only registered by DependenciesScanner, which container.addModule() bypasses; ` +
        `registerRouter() therefore mounts nothing (express layers ${layersBefore} -> ${countRouteLayers(host.server)}), ` +
        `and GET /api/late -> HTTP ${(await get(`${host.url}/api/late`)).status}.`,
    );
  } catch (error) {
    record('B3 hot-add limitation probe', false, String(error?.stack ?? error));
  } finally {
    await host.close();
  }
}

// ---------------------------------------------------------------------------
console.log('\n--- C: two independent plugin modules ---');
{
  const plugin = (name, path, value) =>
    defineModule({
      controllers: [defineController({ path, routes: { list: { httpPath: '', handler: () => ({ success: true, data: value }) } } })],
      name,
    });

  const Root = defineModule({
    imports: [plugin('PluginAModule', 'api/p/alpha', 'alpha'), plugin('PluginBModule', 'api/p/beta', 'beta')],
    name: 'RootModule',
  });

  const host = await boot(Root);
  try {
    const a = await get(`${host.url}/api/p/alpha`);
    const b = await get(`${host.url}/api/p/beta`);
    const cross = await get(`${host.url}/api/p/alpha/beta`);
    record('C1 two plugin namespaces coexist', a.body?.data === 'alpha' && b.body?.data === 'beta', `/api/p/alpha -> ${a.body?.data}, /api/p/beta -> ${b.body?.data}`);
    record('C2 namespaces do not bleed', cross.status === 404, `GET /api/p/alpha/beta -> HTTP ${cross.status}`);
  } finally {
    await host.close();
  }
}

// ---------------------------------------------------------------------------
console.log('\n--- D: runtime removal (finding, not a gate) ---');
{
  const host = await boot(defineModule({ name: 'RootModule' }));
  try {
    const c = host.app.container;
    const hasRemove = typeof c.removeModule === 'function';
    const hasReplace = typeof c.replaceModule === 'function';
    record(
      'D1 runtime removal capability',
      true,
      `container.removeModule=${hasRemove}, container.replaceModule=${hasReplace}. Combined with B3 ` +
        `(addModule registers no controllers), there is no public path to add or remove plugin routes ` +
        `in a running process. The supported model is therefore: the plugin set is an input to boot, and ` +
        `install/enable/disable/uninstall re-resolve the graph and restart the process.`,
    );
  } finally {
    await host.close();
  }
}

// ---------------------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} spike checks passed ===`);
console.log(
  JSON.stringify(
    {
      spike: 'R10',
      question: 'Can NestJS host plugin controllers known only at runtime?',
      answer: failed.length === 0 ? 'YES' : 'NO',
      mechanism:
        'Apply Controller()/Get()/@Module() programmatically to build the module graph from the ' +
        'resolved plugin set before NestFactory.create(). Verified with constructor DI.',
      constraint:
        'Runtime add/remove of controllers is not supported (container.addModule bypasses the ' +
        'scanner, so the module gets zero controllers). Plugin set changes require a restart.',
      pitfall:
        "Nest's Module() decorator returns undefined; Module({...})(Ctor) as a plain call yields " +
        'undefined and must not be used as an expression.',
      results,
    },
    null,
    2,
  ),
);
process.exit(failed.length === 0 ? 0 : 1);
