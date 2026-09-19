/**
 * Authentication provider port.
 *
 * The kernel owns the session mechanism, but it does not know where credentials
 * live: `users` is a domain table that belongs to the identity plugin. The port
 * keeps that boundary intact - the kernel asks "are these credentials valid?", and
 * whoever owns identity answers.
 *
 * In P3 the `identity` foundation plugin implements this against the `users` table.
 * Until then the legacy application supplies an adapter backed by the existing
 * credential verification, so real sessions can be issued now rather than after the
 * plugin migration.
 */

import type { Actor } from '@thinkclass/contracts';

export interface AuthCredentials {
  username: string;
  password: string;
  /** Optional role hint; the baseline login resolves the user by username + role. */
  role?: string;
}

export interface AuthenticatedIdentity {
  actor: Actor;
  /**
   * Extra data the client needs to render immediately after login (display name,
   * class features, ...). Opaque to the kernel.
   */
  profile?: Record<string, unknown>;
}

export interface AuthProvider {
  /** Resolve credentials to an identity, or null when they are invalid. */
  authenticate(credentials: AuthCredentials): Promise<AuthenticatedIdentity | null>;
}
