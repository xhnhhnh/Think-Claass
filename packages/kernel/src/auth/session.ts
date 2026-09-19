/**
 * Session tokens.
 *
 * The baseline system has no session at all: the client asserts its own identity
 * with `x-user-role` / `x-user-id` headers (`src/lib/api.ts:62-67`) and the server
 * trusts them (`api/utils/requestAuth.ts:11-18`), so any client can become a
 * superadmin by editing a header.
 *
 * This module issues opaque random tokens and stores only their SHA-256 digest, so
 * a database leak does not yield usable tokens. Verification is constant time.
 */

import crypto from 'node:crypto';

import type { Actor, Role } from '@thinkclass/contracts';

import type { Logger } from '../logging/logger.js';
import { type Database } from '../storage/connection.js';

const TOKEN_BYTES = 32;

export interface SessionRow {
  id: number;
  user_id: number;
  token_hash: string;
  role: string;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  user_agent: string | null;
  ip: string | null;
}

export interface IssuedSession {
  token: string;
  expiresAt: string;
}

export interface IssueSessionInput {
  userId: number;
  role: Role;
  ttlMs: number;
  userAgent?: string | null;
  ip?: string | null;
}

export interface SessionService {
  issue(input: IssueSessionInput): IssuedSession;
  /** Resolve a raw token to an actor, or null when invalid/expired/revoked. */
  verify(token: string, now?: Date): Actor | null;
  revoke(token: string): boolean;
  revokeAllForUser(userId: number): number;
  /** Delete expired and long-revoked rows. */
  prune(now?: Date): number;
}

export interface SessionServiceOptions {
  db: Database;
  logger?: Logger;
}

export const SESSIONS_MIGRATION_ID = '0002_kernel_sessions';

/** Kernel-owned migration creating the session table. */
export const sessionsMigration = {
  id: SESSIONS_MIGRATION_ID,
  owner: 'kernel',
  up: `
    CREATE TABLE IF NOT EXISTS sessions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      token_hash  TEXT NOT NULL UNIQUE,
      role        TEXT NOT NULL,
      issued_at   TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      revoked_at  TEXT,
      user_agent  TEXT,
      ip          TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
  `,
  down: `DROP TABLE IF EXISTS sessions;`,
} as const;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSessionService(options: SessionServiceOptions): SessionService {
  const { db, logger } = options;

  const insert = () =>
    db.prepare(
      `INSERT INTO sessions (user_id, token_hash, role, issued_at, expires_at, user_agent, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

  return {
    issue({ userId, role, ttlMs, userAgent, ip }) {
      const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
      const issuedAt = new Date();
      const expiresAt = new Date(issuedAt.getTime() + ttlMs);
      insert().run(
        userId,
        hashToken(token),
        role,
        issuedAt.toISOString(),
        expiresAt.toISOString(),
        userAgent ?? null,
        ip ?? null,
      );
      logger?.debug('session issued', { userId, role });
      return { token, expiresAt: expiresAt.toISOString() };
    },

    verify(token, now = new Date()) {
      if (!token) return null;
      const row = db
        .prepare(`SELECT * FROM sessions WHERE token_hash = ?`)
        .get(hashToken(token)) as SessionRow | undefined;
      if (!row) return null;
      if (row.revoked_at) return null;
      if (new Date(row.expires_at).getTime() <= now.getTime()) return null;
      return { userId: row.user_id, role: row.role as Role };
    },

    revoke(token) {
      const result = db
        .prepare(`UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`)
        .run(new Date().toISOString(), hashToken(token));
      return result.changes > 0;
    },

    revokeAllForUser(userId) {
      const result = db
        .prepare(`UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`)
        .run(new Date().toISOString(), userId);
      return result.changes;
    },

    prune(now = new Date()) {
      const result = db
        .prepare(`DELETE FROM sessions WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)`)
        .run(now.toISOString(), new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());
      return result.changes;
    },
  };
}
