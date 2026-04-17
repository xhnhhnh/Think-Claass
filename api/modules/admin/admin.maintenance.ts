import fs from 'fs';
import os from 'os';
import path from 'path';

import db, { closeDb, initDb, reopenDb } from '../../db.js';
import { prisma } from '../../prismaClient.js';
import { ApiError } from '../../utils/asyncHandler.js';
import type { AdminMaintenanceService } from './admin.types.js';

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

export class SqliteAdminMaintenanceService implements AdminMaintenanceService {
  private readonly databasePath = path.join(process.cwd(), 'database.sqlite');

  async exportDatabase() {
    if (!fs.existsSync(this.databasePath)) {
      throw new ApiError(404, '数据库文件不存在');
    }

    return {
      filePath: this.databasePath,
      fileName: `backup-${Date.now()}.sqlite`,
    };
  }

  async importDatabase(uploadedFilePath: string) {
    const walPath = `${this.databasePath}-wal`;
    const shmPath = `${this.databasePath}-shm`;
    const backupPath = path.join(os.tmpdir(), `database-import-backup-${Date.now()}.sqlite`);
    let importError: ApiError | null = null;
    let shouldRestoreBackup = false;
    let didDisconnectPrisma = false;
    let didCloseSqlite = false;

    try {
      assertSqliteFile(uploadedFilePath);

      await prisma.$disconnect();
      didDisconnectPrisma = true;
      closeDb();
      didCloseSqlite = true;

      removeFileIfExists(walPath);
      removeFileIfExists(shmPath);

      if (fs.existsSync(this.databasePath)) {
        fs.copyFileSync(this.databasePath, backupPath);
        shouldRestoreBackup = true;
      }

      fs.copyFileSync(uploadedFilePath, this.databasePath);

      removeFileIfExists(walPath);
      removeFileIfExists(shmPath);

      reopenDb();
      didCloseSqlite = false;

      await prisma.$connect();
      didDisconnectPrisma = false;

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
          fs.copyFileSync(backupPath, this.databasePath);
          if (importError.statusCode >= 500) {
            importError = new ApiError(importError.statusCode, '数据库导入失败，已自动回滚到导入前状态');
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

      if (didDisconnectPrisma) {
        try {
          await prisma.$connect();
        } catch (prismaError) {
          console.error('Error reconnecting Prisma:', prismaError);
          if (!importError) {
            importError = new ApiError(500, '数据库导入完成，但 Prisma 连接恢复失败');
          } else {
            importError = new ApiError(500, `${importError.message}，且 Prisma 连接恢复失败`);
          }
        }
      }

      removeFileIfExists(backupPath);
    }
  }

  async resetDatabase() {
    await prisma.$disconnect();

    try {
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
    } finally {
      await prisma.$connect();
    }
  }
}
