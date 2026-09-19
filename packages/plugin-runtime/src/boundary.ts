/**
 * Plugin fault isolation.
 *
 * A plugin is third-party code running in the host process, so the host must
 * assume it will misbehave. Everything a plugin contributes - route handlers,
 * event handlers, lifecycle hooks - is executed through this boundary, which:
 *
 *   - never lets a plugin exception escape into the caller or the express stack
 *   - abandons a plugin call that exceeds its time budget
 *   - tracks a sliding window of outcomes and marks a plugin `degraded` once its
 *     error rate crosses a threshold, so the rest of the system stays up
 *
 * Honest limitation: this is fault isolation, not a security sandbox. In-process
 * plugin code can still reach anything the process can; real confinement requires
 * the `worker` isolation level (P6).
 */

import type { Logger } from '@thinkclass/kernel';

export interface PluginHealthSnapshot {
  pluginId: string;
  state: string;
  /** Total calls observed. */
  calls: number;
  /** Total errors observed. */
  errors: number;
  degraded: boolean;
  lastError: string | null;
  lastErrorAt: string | null;
  /** Errors within the current sliding window. */
  windowErrors: number;
  windowSize: number;
}

export interface BoundaryOptions {
  logger?: Logger;
  /** Errors within the window that trigger degradation. Default 10. */
  errorThreshold?: number;
  /** Sliding window size. Default 50. */
  windowSize?: number;
  /** Default per-call budget in milliseconds. Default 15000. */
  timeoutMs?: number;
  /** Called once when a plugin becomes degraded. */
  onDegrade?: (snapshot: PluginHealthSnapshot) => void;
  /** Called for every recorded error. */
  onError?: (pluginId: string, label: string, error: unknown) => void;
}

/**
 * Outcome of a bounded call.
 *
 * An explicit result rather than `T | undefined`: a hook that legitimately returns
 * nothing is indistinguishable from one that threw if failure is signalled by
 * `undefined`, which made every `setup()` look like a failure the first time this
 * ran.
 *
 * Each branch declares the other's fields as optional so that reading `.error` or
 * `.value` never depends on the narrowing working for an instantiated generic.
 */
export type RunOutcome<T> =
  | { ok: true; value: T; error?: undefined; degraded?: undefined }
  | { ok: false; error: string; degraded: boolean; value?: undefined };

export interface PluginBoundary {
  /** Record the plugin's lifecycle state for reporting. */
  setState(pluginId: string, state: string): void;
  /**
   * Run `fn` under the boundary. Never throws; failures and timeouts come back as
   * `{ ok: false }`.
   */
  run<T>(pluginId: string, label: string, fn: () => T | Promise<T>, timeoutMs?: number): Promise<RunOutcome<T>>;
  /** Wrap a function (an event handler, a route handler) in the boundary. */
  guard<A extends unknown[], R>(
    pluginId: string,
    label: string,
    fn: (...args: A) => R | Promise<R>,
    timeoutMs?: number,
  ): (...args: A) => Promise<R | undefined>;
  /** Record an error observed outside `run`. */
  recordError(pluginId: string, label: string, error: unknown): void;
  isDegraded(pluginId: string): boolean;
  /** Force a plugin back to healthy; used by an explicit restart. */
  clear(pluginId: string): void;
  snapshot(): PluginHealthSnapshot[];
  summary(): { total: number; active: number; degraded: number };
}

interface PluginStats {
  pluginId: string;
  state: string;
  calls: number;
  errors: number;
  /** 1 = success, 0 = failure. Most recent last. */
  window: number[];
  degraded: boolean;
  lastError: string | null;
  lastErrorAt: string | null;
}

export function createPluginBoundary(options: BoundaryOptions = {}): PluginBoundary {
  const logger = options.logger;
  const errorThreshold = options.errorThreshold ?? 10;
  const windowSize = options.windowSize ?? 50;
  const defaultTimeoutMs = options.timeoutMs ?? 15_000;

  const stats = new Map<string, PluginStats>();

  function ensure(pluginId: string): PluginStats {
    let entry = stats.get(pluginId);
    if (!entry) {
      entry = {
        pluginId,
        state: 'discovered',
        calls: 0,
        errors: 0,
        window: [],
        degraded: false,
        lastError: null,
        lastErrorAt: null,
      };
      stats.set(pluginId, entry);
    }
    return entry;
  }

  function record(pluginId: string, ok: boolean, label: string, error?: unknown): void {
    const entry = ensure(pluginId);
    entry.calls += 1;
    entry.window.push(ok ? 1 : 0);
    if (entry.window.length > windowSize) entry.window.shift();

    if (ok) return;

    entry.errors += 1;
    entry.lastError = error instanceof Error ? error.message : String(error);
    entry.lastErrorAt = new Date().toISOString();

    options.onError?.(pluginId, label, error);
    logger?.warn('plugin call failed', { pluginId, label, error: entry.lastError });

    const windowErrors = entry.window.filter((v) => v === 0).length;
    if (!entry.degraded && windowErrors >= errorThreshold) {
      entry.degraded = true;
      entry.state = 'degraded';
      const snapshot = toSnapshot(entry);
      logger?.error('plugin degraded', {
        pluginId,
        windowErrors,
        windowSize,
        lastError: entry.lastError,
      });
      options.onDegrade?.(snapshot);
    }
  }

  function toSnapshot(entry: PluginStats): PluginHealthSnapshot {
    return {
      pluginId: entry.pluginId,
      state: entry.state,
      calls: entry.calls,
      errors: entry.errors,
      degraded: entry.degraded,
      lastError: entry.lastError,
      lastErrorAt: entry.lastErrorAt,
      windowErrors: entry.window.filter((v) => v === 0).length,
      windowSize: entry.window.length,
    };
  }

  async function run<T>(
    pluginId: string,
    label: string,
    fn: () => T | Promise<T>,
    timeoutMs?: number,
  ): Promise<RunOutcome<T>> {
    const entry = ensure(pluginId);
    if (entry.degraded) {
      logger?.debug('skipping call to degraded plugin', { pluginId, label });
      return { ok: false, error: 'plugin is degraded', degraded: true };
    }

    let timer: NodeJS.Timeout | undefined;
    try {
      const value = await Promise.race([
        Promise.resolve().then(fn),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`plugin call "${label}" exceeded ${timeoutMs ?? defaultTimeoutMs}ms`)),
            timeoutMs ?? defaultTimeoutMs,
          );
        }),
      ]);
      record(pluginId, true, label);
      return { ok: true, value: value as T };
    } catch (error) {
      record(pluginId, false, label, error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        degraded: ensure(pluginId).degraded,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    setState(pluginId, state) {
      ensure(pluginId).state = state;
    },

    run,

    guard(pluginId, label, fn, timeoutMs) {
      return async (...args) => {
        const outcome = await run(pluginId, label, () => fn(...args), timeoutMs);
        return outcome.ok ? outcome.value : undefined;
      };
    },

    recordError(pluginId, label, error) {
      record(pluginId, false, label, error);
    },

    isDegraded(pluginId) {
      return ensure(pluginId).degraded;
    },

    clear(pluginId) {
      const entry = ensure(pluginId);
      entry.degraded = false;
      entry.window = [];
      if (entry.state === 'degraded') entry.state = 'active';
    },

    snapshot() {
      return [...stats.values()].map(toSnapshot).sort((a, b) => a.pluginId.localeCompare(b.pluginId));
    },

    summary() {
      const all = [...stats.values()];
      return {
        total: all.length,
        active: all.filter((s) => s.state === 'active').length,
        degraded: all.filter((s) => s.degraded).length,
      };
    },
  };
}
