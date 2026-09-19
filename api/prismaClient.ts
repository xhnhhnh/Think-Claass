/**
 * The Prisma client, pinned to the same SQLite file the rest of the application opens.
 *
 * ## Why the datasource is passed explicitly instead of read from `.env`
 *
 * There are two data paths in this repository and they used to be configured by two independent
 * settings:
 *
 *   - `ctx.db` / the kernel / `api/db.ts`  ->  `DATABASE_FILE`, resolved against the repo root
 *   - `@prisma/client` (admin, UserService) ->  `DATABASE_URL`, a `file:` URL from `.env`
 *
 * HANDOFF section 9 recorded that setting `DATABASE_FILE` makes them diverge. That was measured
 * again in P4.3b.9 and it is worse than a documentation problem, because **tests and probes set
 * `DATABASE_FILE` all the time**:
 *
 *   as shipped (.env only)      app -> <root>/database.sqlite        prisma -> <root>/database.sqlite   aligned
 *   DATABASE_FILE overridden    app -> <tmp>/app-only.sqlite         prisma -> <root>/database.sqlite   DIVERGENT
 *   both overridden, same file  app -> <tmp>/together.sqlite         prisma -> <tmp>/together.sqlite     aligned
 *
 * A divergent pair is not merely inconsistent: Prisma inserts a `users` row into the real database
 * while the request reads it back through `better-sqlite3` from a temp copy, so the answer is "not
 * found" and the row exists. `plugins/payment` documented the same trap from the other side.
 *
 * So the file is resolved *once*, by the same rule `loadConfig` uses, and handed to Prisma as the
 * datasource URL, which takes precedence over `.env`. `DATABASE_URL` therefore no longer decides
 * anything at runtime - an override cannot desynchronise the two paths, which is the property the
 * deploy scripts' `DATABASE_URL` line was never able to guarantee.
 *
 * `prisma migrate` / `prisma db push` are separate CLI processes and still read `DATABASE_URL`;
 * that is correct, because a schema command has to be told its target explicitly.
 */

import path from 'node:path';

import { PrismaClient } from '@prisma/client';

/**
 * The SQLite file both data paths open, as an absolute path.
 *
 * Deliberately the same expression as `loadConfig`'s `databaseFile`
 * (`packages/kernel/src/config/loadConfig.ts`): `DATABASE_FILE` resolved against the working
 * directory, defaulting to `database.sqlite`. A second rule would be a second way to drift.
 */
export function applicationDatabaseFile(): string {
  return path.resolve(process.cwd(), process.env.DATABASE_FILE ?? 'database.sqlite');
}

/** The `file:` URL Prisma needs for that path. */
export function applicationDatabaseUrl(): string {
  return `file:${applicationDatabaseFile()}`;
}

export const prisma = new PrismaClient({
  datasources: { db: { url: applicationDatabaseUrl() } },
});
