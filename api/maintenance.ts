/**
 * Database file maintenance, injected into the admin plugin as `ctx.maintenance`.
 *
 * Moved out of `api/modules/admin/admin.maintenance.ts` (P4.3b.14). The *logic* is unchanged - it is
 * about the SQLite file and the application's connection lifecycle, which is precisely what a plugin
 * may not own:
 *
 *   export  - hand back the live database path for `res.download`
 *   import  - validate the upload, close the connection, swap the file (backing the old one up),
 *             re-open and re-apply the schema; restore the backup when anything fails
 *   reset   - drop every table and re-run the boot schema and its seed
 *
 * What changed is the last runtime consumer of Prisma: this file used to call
 * `prisma.$disconnect()` / `prisma.$connect()` around the swap. That client was the second data path
 * into the same SQLite file, and after `plugins/admin` moved its queries onto `ctx.db` nothing in the
 * request path uses it, so it is gone from here as well. (The module itself, and the dead
 * `api/services/UserService.ts`, are P7's removal list; the guardrail that pinned the two data paths
 * together still passes because the file it guards is the one this application opens.)
 *
 * ## Known limitation, unchanged by this move
 *
 * The maintenance operations rotate this module's connection, not every connection in the process.
 * A running server also has the kernel's own handle (`createKernel` opens it) and, in the legacy
 * composition, whatever the plugin runtime built on top of it. Replacing the file under those handles
 * is why the operation is documented as "hot reload" and why the reset path drops tables *through*
 * the shared handle instead of replacing the file. Making it fully correct means a reopenable
 * connection holder in the kernel - a round of its own, not something to smuggle into a domain
 * migration.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { ApiError } from '@thinkclass/kernel';
import type { DatabaseMaintenanceApi } from '@thinkclass/plugin-sdk';

import db, { closeDb, initDb, reopenDb } from './db.js';

function removeFileIfExists(filePath: string) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function assertSqliteFile(filePath: string) {
  const buffer = Buffer.alloc(16);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, 16, 0);
  fs.closeSync(fd);

  const magic = buffer.toString('utf8', 0, 15);
  if (magic !== 'SQLite format 3') {
    throw new ApiError(400, '无效的 SQLite 文件');
  }
}

export function createDatabaseMaintenance(): DatabaseMaintenanceApi {
  const databasePath = path.join(process.cwd(), 'database.sqlite');

  return {
    async exportDatabase() {
      if (!fs.existsSync(databasePath)) {
        throw new ApiError(404, '数据库文件不存在');
      }

      return {
        filePath: databasePath,
        fileName: `backup-${Date.now()}.sqlite`,
      };
    },

    async importDatabase(uploadedFilePath: string) {
      const walPath = `${databasePath}-wal`;
      const shmPath = `${databasePath}-shm`;
      const backupPath = path.join(os.tmpdir(), `database-import-backup-${Date.now()}.sqlite`);
      let importError: ApiError | null = null;
      let shouldRestoreBackup = false;
      let didCloseSqlite = false;

      try {
        assertSqliteFile(uploadedFilePath);

        closeDb();
        didCloseSqlite = true;

        removeFileIfExists(walPath);
        removeFileIfExists(shmPath);

        if (fs.existsSync(databasePath)) {
          fs.copyFileSync(databasePath, backupPath);
          shouldRestoreBackup = true;
        }

        fs.copyFileSync(uploadedFilePath, databasePath);

        removeFileIfExists(walPath);
        removeFileIfExists(shmPath);

        reopenDb();
        didCloseSqlite = false;

        return {
          message: '导入成功，数据结构已自动升级并热加载完成！',
          reloaded: true,
          backupRestored: false,
        };
      } catch (error) {
        if (error instanceof ApiError) {
          importError = error;
        } else {
          console.error('Database import failed:', error);
          importError = new ApiError(500, '数据库升级失败');
        }

        if (shouldRestoreBackup) {
          try {
            removeFileIfExists(walPath);
            removeFileIfExists(shmPath);
            fs.copyFileSync(backupPath, databasePath);
            if (importError.status >= 500) {
              importError = new ApiError(importError.status, '数据库导入失败，已自动回滚到导入前状态');
            }
          } catch (restoreError) {
            console.error('Database rollback failed:', restoreError);
            importError = new ApiError(500, '数据库导入失败，且自动回滚失败，请检查服务日志');
          }
        }

        throw importError;
      } finally {
        removeFileIfExists(uploadedFilePath);

        if (didCloseSqlite) {
          removeFileIfExists(walPath);
          removeFileIfExists(shmPath);

          try {
            reopenDb();
          } catch (dbError) {
            console.error('Error reopening better-sqlite3 db:', dbError);
            if (!importError) {
              importError = new ApiError(500, '数据库导入完成，但 SQLite 连接恢复失败');
            } else {
              importError = new ApiError(500, `${importError.message}，且 SQLite 连接恢复失败`);
            }
          }
        }

        removeFileIfExists(backupPath);
      }
    },

    async resetDatabase() {
      db.prepare('PRAGMA foreign_keys = OFF').run();
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      ).all() as Array<{ name: string }>;

      const dropTables = db.transaction(() => {
        for (const table of tables) {
          db.prepare(`DROP TABLE IF EXISTS ${table.name}`).run();
        }
      });

      dropTables();
      db.prepare('PRAGMA foreign_keys = ON').run();
      initDb();
    },
  };
}
