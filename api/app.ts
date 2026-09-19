/**
 * API server bootstrap.
 *
 * Two compositions coexist during the migration:
 *
 *   KERNEL_ENABLED=1  ->  the minimal kernel serves /api/health + /api/kernel/*
 *   otherwise         ->  the legacy Nest composition (19 static modules)
 *
 * In BOTH cases a kernel instance is created first, because it owns the
 * infrastructure the legacy app now depends on: configuration, logging, the event
 * bus, the permission engine and session tokens. The legacy composition mounts the
 * kernel's request-context middleware and its auth routes onto its own express
 * app, which is what turns `x-user-role` / `x-user-id` from trusted assertions into
 * a bridge that `ALLOW_LEGACY_HEADER_AUTH=0` switches off.
 *
 * Plugins are also loaded in BOTH compositions (`PLUGINS_ENABLED=1`), which is what
 * makes the P4.3b domain migration possible: a domain can move out of
 * `api/modules/**` into `plugins/**` without disappearing from the legacy
 * composition. See `mountPlugins()` below for how the two mounting paths differ.
 */

import 'reflect-metadata';
import { Module, type ArgumentsHost, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import {
  createKernel,
  createKernelRouter,
  createRequestContextMiddleware,
  renderError,
  type AuthProvider,
  type Kernel,
  type KernelRuntimeHooks,
  type PluginHostView,
} from '@thinkclass/kernel';
import { createPluginHost } from '@thinkclass/plugin-runtime';
import { initDb, decrypt } from './db.js'
import { APP_MIGRATIONS } from './schema/appMigrations.js'
import { operationLogger } from './utils/logMiddleware.js'
import { AppModule } from './app.module.js';
import { CORE_AUDIT_DESCRIPTORS, CORE_AUDIT_OWNER } from './audit/descriptors.js';

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function registerStaticAssets(server: Express) {
  const distPath = path.join(__dirname, '../dist')

  server.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))
  server.use(express.static(distPath))

  server.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      next()
      return
    }

    res.sendFile(path.join(distPath, 'index.html'))
  })
}

/** True when the minimal kernel composition should be used. */
export function isKernelEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(1|true|yes|on)$/i.test(String(env.KERNEL_ENABLED ?? '').trim())
}

/** The kernel instance created for this process. */
let bootedKernel: Kernel | null = null;

/** The plugin host, when plugins were mounted. */
let pluginHost: Awaited<ReturnType<typeof createPluginHost>> | null = null;

export function getKernel(): Kernel | null {
  return bootedKernel;
}

export function getPluginHost(): typeof pluginHost {
  return pluginHost;
}

/**
 * Mount the kernel-owned infrastructure that the legacy composition relies on.
 *
 * Identity resolution must run before any route so that `getRequestActor()` sees a
 * verified actor rather than raw headers.
 */
function mountKernelInfrastructure(server: Express, kernel: Kernel): void {
  server.use(
    createRequestContextMiddleware({
      config: kernel.config,
      sessions: kernel.sessions,
      logger: kernel.logger.child('auth'),
    }),
  );
  server.use(
    createKernelRouter({
      config: kernel.config,
      startedAt: kernel.startedAt,
      plugins: kernel.plugins,
      events: kernel.events,
      permissions: kernel.permissions,
      sessions: kernel.sessions,
      settings: kernel.settings,
      authProvider: authProviderHolder,
    }),
  );
}

/**
 * Where the identity plugin registers its credential verifier.
 *
 * The kernel router needs an `AuthProvider`, the kernel cannot import a plugin (G2), and the
 * plugin is mounted *after* the router is built - so the verifier travels through this holder:
 * `createKernel` reads `current` per request, the plugin host hands the same object to
 * `createPluginContext`, and `plugins/identity` fills it during `setup`.
 *
 * Before P4.3b.7 this slot held `createLegacyAuthProvider()` - a temporary adapter in
 * `api/modules/auth/` whose entire purpose was to bridge the gap until identity moved into a
 * plugin. The plugin is that bridge's replacement, so the adapter is gone; with no identity
 * plugin active, `POST /api/kernel/auth/login` answers 503 again, which is the honest state of
 * "nothing owns authentication in this composition".
 */
const authProviderHolder: { current: AuthProvider | null } = { current: null };

/**
 * The Nest root for the legacy composition.
 *
 * Since P4.3b the legacy composition hosts plugin controllers too: a domain that has
 * migrated into `plugins/**` must keep serving in *both* compositions, because the
 * legacy one is the default and the rollback target. The plugin modules are imported
 * into this same root rather than mounted on a separate Nest instance - a second
 * instance would install a second catch-all not-found handler, and whichever one
 * registered first would make the other's routes unreachable.
 *
 * `Module()` is side-effecting and returns `undefined`, so the decorated class is
 * held in a variable (spike R10).
 */
function createLegacyRootModule(pluginModules: Type<unknown>[]): Type<unknown> {
  if (pluginModules.length === 0) return AppModule;

  const Root = class {};
  Object.defineProperty(Root, 'name', { value: 'thinkclass_legacy_root' });
  Module({ imports: [AppModule, ...pluginModules] })(Root); // side effect only
  return Root;
}

/**
 * Legacy composition: Nest assembled from statically imported modules, reading
 * the raw better-sqlite3 layer in `api/db.ts`.
 */
export async function createLegacyApp(kernel: Kernel): Promise<Express> {
  // Initialise the legacy schema (business tables) via the historical boot DDL.
  initDb()

  const server: Express = express()
  const pluginModules = pluginHost?.modules ?? [];
  const rootModule = createLegacyRootModule(pluginModules as Type<unknown>[]);

  const nest = await NestFactory.create<NestExpressApplication>(
    rootModule,
    new ExpressAdapter(server),
    {
      bodyParser: false,
      // Nest otherwise calls process.exit(1) on a boot failure, which hides the
      // cause entirely (spike R10, finding 3).
      abortOnError: false,
    },
  )

  nest.enableCors()

  /**
   * Render errors through the kernel envelope.
   *
   * This matters more since plugins are mounted here: a plugin throws the kernel's
   * `ApiError`, and without a global filter Nest's default one answers 500 (it only
   * recognises its own `HttpException`). Plugin routes would then return 500 for
   * every 400/403/404, in the default and rollback composition.
   *
   * Legacy `api/utils/apiError.ts` throws a different class, but `renderError`
   * duck-types `statusCode` as well, so both render into the same envelope this
   * composition already relied on.
   */
  nest.useGlobalFilters({
    catch(exception: unknown, host: ArgumentsHost) {
      const response = host.switchToHttp().getResponse<Response>();
      const { status, body } = renderError(exception);
      if (response.headersSent) return;
      response.status(status).json(body);
    },
  })

  server.use(express.json({ limit: '10mb' }))
  server.use(express.urlencoded({ extended: true, limit: '10mb' }))

  mountKernelInfrastructure(server, kernel)

  // 注入操作日志中间件
  server.use(operationLogger)

  registerStaticAssets(server)

  await nest.init()

  return server
}

/**
 * Mount plugins through the kernel's `mountPlugins` hook, in both compositions.
 *
 * The hook runs at the correct point either way:
 *
 *   kernel composition - after the kernel's own routes, before its catch-all. The
 *     runtime creates its own Nest instance here, so `mountControllers` stays at
 *     its default.
 *   legacy composition - before `createLegacyApp()` builds its Nest root. The
 *     runtime must NOT stand up a Nest instance of its own in that case; it collects
 *     the modules and `createLegacyRootModule()` imports them into the legacy root,
 *     giving one Nest instance and one not-found handler.
 *
 * This is what keeps a migrated domain reachable in the legacy composition, which is
 * the precondition for moving any domain out of `api/modules/**` at all.
 */
async function mountPlugins(hooks: KernelRuntimeHooks): Promise<PluginHostView | null> {
  const legacyComposition = !isKernelEnabled();
  if (!hooks.config.pluginsEnabled) return null;

  pluginHost = await createPluginHost({
    ...hooks,
    // The same holder the kernel router reads, so `plugins/identity` can register its verifier
    // during setup and `/api/kernel/auth/login` starts working once it has.
    authProvider: authProviderHolder,
    // Always include the in-repo plugin directory, so `plugins/*` works even when
    // PLUGIN_DIRS points at an external deployment location.
    pluginDirs: [path.join(hooks.config.rootDir, 'plugins')],
    ...(legacyComposition ? { mountControllers: 'external' as const } : {}),
  });

  for (const rejection of pluginHost.rejections) {
    hooks.logger.warn('plugin not activated', { ...rejection });
  }
  for (const outcome of pluginHost.migrationOutcomes) {
    if (outcome.error) hooks.logger.error('plugin migration error', { id: outcome.pluginId, error: outcome.error });
  }

  return pluginHost;
}

export async function createApp(): Promise<Express> {
  dotenv.config()

  const kernelEnabled = isKernelEnabled();

  // One kernel per process, whichever composition is selected. The plugin host runs
  // in both: the legacy composition is the default and the rollback target, so a
  // domain that has moved into a plugin must keep serving there.
  bootedKernel = await createKernel({
    // The holder `plugins/identity` fills during setup. See its declaration for why this is not
    // a plain value: the kernel is built before any plugin is mounted.
    authProvider: authProviderHolder,
    mountPlugins,
    // The application's schema, supplied as a migration chain. Both compositions apply the
    // same list: the legacy one through `initDb()` and this one through the ledger. It is
    // injected rather than registered inside the kernel because the kernel must stay
    // domain-free (guardrail G5) - `enable_economy`, `pets` and `dungeon_runs` are not
    // kernel concepts. See api/schema/appMigrations.ts.
    //
    // The compatibility columns and indexes are separate migrations rather than folded into
    // the boot schema: its SQL is already applied in the wild, and a string migration's
    // checksum IS its SQL, so appending to it would make the runner refuse to start. They
    // must still come through here, because this composition never calls `initDb()` - that
    // omission is what left it without `parent_activity.last_active_date` and 19 indexes.
    migrations: APP_MIGRATIONS,
    // Student names are AES-encrypted at rest and the key belongs to the application,
    // not the kernel. Handing the decryptor over lets `classroom.public` publish
    // readable names without any plugin importing `api/**`.
    overrides: { decryptName: decrypt },
  })

  // Audit coverage is data, not a branch chain: the descriptors say which operations
  // are recorded and how they read. Registering them in both compositions means the
  // legacy app keeps exactly the coverage it had.
  bootedKernel.auditRegistry.register(CORE_AUDIT_DESCRIPTORS, CORE_AUDIT_OWNER)

  if (kernelEnabled) {
    return bootedKernel.app
  }
  return createLegacyApp(bootedKernel)
}

/**
 * Keep the historical default export as an Express-compatible request handler.
 */
const app = await createApp()

export default app
