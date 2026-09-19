/**
 * Schema-absolute fixture for the database-path alignment test.
 *
 * This file is tracked rather than living under `.tmp/`, and that is deliberate. The test needs a
 * *child process* to prove that a freshly constructed Prisma client opens the file `DATABASE_FILE`
 * names: the client is built at module load, so an in-process test would either reuse a client from
 * an earlier import (measuring nothing) or need two imports of the same module in one process
 * (impossible).
 *
 * The first version of that test pointed at `.tmp/prisma-override-check.mts`, which is gitignored -
 * so it passed here and would have failed on a fresh clone: `existsSync` false, no child. A test
 * fixture that only exists on the machine that wrote it is not a test. It lives here instead, and
 * the report it prints is the assertion's input.
 *
 * Run it by hand when you want the numbers:
 *   DATABASE_FILE=<path> npx tsx tests/kernel/fixtures/database-path-probe.mts
 */

import { applicationDatabaseFile, applicationDatabaseUrl, prisma } from '../../../api/prismaClient.js';

const rows = await prisma.$queryRawUnsafe<Array<{ name: string; file: string }>>('PRAGMA database_list');
const opened = rows.find((row) => row.name === 'main')?.file ?? '(unknown)';
const honoured = opened.toLowerCase() === applicationDatabaseFile().toLowerCase();

console.log('DATABASE_FILE          :', process.env.DATABASE_FILE ?? '(unset)');
console.log('applicationDatabaseFile:', applicationDatabaseFile());
console.log('client datasource url  :', applicationDatabaseUrl());
console.log('prisma actually opened :', opened);
console.log('VERDICT                :', honoured ? 'override honoured' : 'override IGNORED');

await prisma.$disconnect();
