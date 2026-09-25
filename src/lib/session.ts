import { useStore } from '@/store/useStore';

/**
 * Tell the server this session is over, then let the caller forget it.
 *
 * ## Why this exists
 *
 * `logout()` used to clear the store and nothing else. The kernel session stayed valid on the
 * server until it expired - seven days by default (`SESSION_TTL_MS`) - so a token captured before
 * a logout (from a shared classroom machine, a browser profile, a log line) still authenticated.
 * Clearing local state is what the *user* sees; revoking the token is what actually ends the
 * session, and only the second one is a security boundary.
 *
 * ## Why plain `fetch` instead of the API client
 *
 * Two reasons, both structural:
 *
 *   - **No import cycle.** `src/lib/api.ts` reads the store on every request, so the store cannot
 *     import the client back. This module is the small piece both can depend on.
 *   - **It must not be derailed by its own failure.** Logging out is local-first: the user is
 *     signed out whether or not the network cooperates. Routing this through the shared client
 *     would apply its error handling - a toast, and on a 401 a redirect - to the one request whose
 *     whole purpose is "I am already gone".
 *
 * `keepalive` lets the request finish if the caller navigates immediately afterwards, which the
 * logout buttons do.
 */
export async function revokeSession(): Promise<void> {
  const { token } = useStore.getState();
  if (!token) return;

  try {
    await fetch('/api/kernel/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    });
  } catch {
    // Offline, or the server is down. The local sign-out proceeds; the token expires on its own.
  }
}
