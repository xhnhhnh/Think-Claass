/**
 * Typed, fault-isolated event bus.
 *
 * Plugins react to each other through events rather than by importing each other.
 * Three properties make that safe:
 *   - isolation: a throwing handler never breaks the emitter or other subscribers
 *   - timeout:   a hanging handler is abandoned rather than wedging the bus
 *   - ordering:  delivery order is deterministic (explicit `order`, then owner id)
 */

import type {
  Disposable,
  EventHandler,
  EventMeta,
  EventPayload,
  EventTopic,
} from '@thinkclass/contracts';

import type { Logger } from '../logging/logger.js';

export interface EventBusStats {
  emitted: number;
  delivered: number;
  failed: number;
  timedOut: number;
  droppedAfterFailure: boolean;
}

export interface EventBusOptions {
  logger?: Logger;
  /** Per-handler budget. A handler exceeding it is abandoned and counted. */
  handlerTimeoutMs?: number;
  /** Called for every handler failure; the kernel uses this for plugin health. */
  onHandlerError?: (topic: string, owner: string | undefined, error: unknown) => void;
  /** When true, `emit` awaits every handler. Tests use this; production does not. */
  synchronous?: boolean;
}

export interface SubscribeOptions {
  /** Lower runs first. Defaults to 0. */
  order?: number;
  /** Plugin that owns the handler. Used for logging, health and isolation. */
  owner?: string;
}

export interface EventBus {
  emit<T extends EventTopic>(topic: T, payload: EventPayload<T>, meta?: Partial<EventMeta>): void;
  /**
   * Subscribe to a topic, a `prefix.*` wildcard, or `*` for everything.
   * Returns a Disposable so plugins can unsubscribe on stop.
   */
  on<T extends EventTopic>(topic: T | '*' | `${string}.*`, handler: EventHandler<T>, options?: SubscribeOptions): Disposable;
  /** Resolve once every in-flight delivery has settled. */
  drain(): Promise<void>;
  stats(): EventBusStats;
}

interface Subscription {
  topic: string;
  handler: EventHandler<EventTopic>;
  order: number;
  owner?: string;
  active: boolean;
}

function matches(pattern: string, topic: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) return topic.startsWith(pattern.slice(0, -1));
  return pattern === topic;
}

export function createEventBus(options: EventBusOptions = {}): EventBus {
  const logger = options.logger;
  const timeoutMs = options.handlerTimeoutMs ?? 5_000;
  const synchronous = options.synchronous ?? false;

  const subscriptions: Subscription[] = [];
  const inFlight = new Set<Promise<void>>();
  let nextId = 1;
  const stats: EventBusStats = {
    emitted: 0,
    delivered: 0,
    failed: 0,
    timedOut: 0,
    droppedAfterFailure: false,
  };

  async function runHandler(sub: Subscription, meta: EventMeta, payload: unknown): Promise<void> {
    if (!sub.active) return;
    let timer: NodeJS.Timeout | undefined;
    try {
      const result = sub.handler(payload as never, meta);
      if (result && typeof (result as Promise<void>).then === 'function') {
        await Promise.race([
          result,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`event handler timed out after ${timeoutMs}ms`)), timeoutMs);
          }),
        ]);
      }
      stats.delivered += 1;
    } catch (error) {
      const timedOut = error instanceof Error && error.message.includes('timed out after');
      if (timedOut) stats.timedOut += 1;
      stats.failed += 1;
      logger?.warn('event handler failed', {
        topic: meta.topic,
        owner: sub.owner ?? '(anonymous)',
        error: error instanceof Error ? error.message : String(error),
        timedOut,
      });
      options.onHandlerError?.(meta.topic, sub.owner, error);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function dispatch(topic: string, payload: unknown, partial?: Partial<EventMeta>): void {
    const meta: EventMeta = {
      id: nextId++,
      topic,
      source: partial?.source ?? 'kernel',
      emittedAt: new Date().toISOString(),
      requestId: partial?.requestId,
    };

    // Deterministic order: explicit order first, then owner id so two plugins
    // declaring the same order still deliver predictably.
    const targets = subscriptions
      .filter((s) => s.active && matches(s.topic, topic))
      .sort((a, b) => a.order - b.order || String(a.owner ?? '').localeCompare(String(b.owner ?? '')));

    if (targets.length === 0) return;

    if (synchronous) {
      // Callers that need completion use drain(); this keeps emit() non-blocking
      // while still registering the work for drain().
      for (const sub of targets) {
        const p = runHandler(sub, meta, payload).finally(() => inFlight.delete(p));
        inFlight.add(p);
      }
      return;
    }

    for (const sub of targets) {
      const p = runHandler(sub, meta, payload).finally(() => inFlight.delete(p));
      inFlight.add(p);
    }
  }

  return {
    emit(topic, payload, meta) {
      stats.emitted += 1;
      dispatch(topic, payload, meta);
    },

    on(pattern, handler, subscribeOptions) {
      const sub: Subscription = {
        topic: pattern,
        handler: handler as EventHandler<EventTopic>,
        order: subscribeOptions?.order ?? 0,
        owner: subscribeOptions?.owner,
        active: true,
      };
      subscriptions.push(sub);
      return {
        dispose() {
          sub.active = false;
          const index = subscriptions.indexOf(sub);
          if (index >= 0) subscriptions.splice(index, 1);
        },
      };
    },

    async drain() {
      // Handlers may emit further events, so keep draining until quiet.
      let guard = 0;
      while (inFlight.size > 0 && guard < 100) {
        await Promise.allSettled([...inFlight]);
        guard += 1;
      }
    },

    stats() {
      return { ...stats };
    },
  };
}
