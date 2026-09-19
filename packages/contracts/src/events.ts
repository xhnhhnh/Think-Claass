/**
 * Cross-plugin event contracts.
 *
 * Plugins communicate state changes through events rather than by calling each
 * other. Each topic is declared here so both producer and consumer are type
 * checked, and so the runtime can verify that a plugin only emits or subscribes to
 * topics its manifest declares.
 *
 * Topic naming: `<pluginId>.<entity>.<action>`, plus the reserved `kernel.*`
 * namespace owned by the kernel.
 */

export interface EventMeta {
  /** Monotonic id assigned by the bus, useful for tracing and dedup. */
  id: number;
  topic: string;
  /** Plugin that emitted the event. */
  source: string;
  emittedAt: string;
  /** Correlation id of the originating HTTP request, when there was one. */
  requestId?: string;
}

/**
 * Augment this interface from `packages/contracts` as plugins are added:
 *
 *   export interface EventContracts {
 *     'classroom.student.points.changed': { studentId: number; delta: number };
 *   }
 */
export interface EventContracts {
  // -- kernel namespace ------------------------------------------------------
  'kernel.plugin.state.changed': {
    pluginId: string;
    from: string;
    to: string;
    reason?: string;
  };
  'kernel.plugin.degraded': {
    pluginId: string;
    errorCount: number;
    windowSize: number;
    lastError: string;
  };
  'kernel.config.changed': {
    key: string;
    previous: unknown;
    next: unknown;
  };
  'kernel.request.audit': {
    actorId: number | null;
    role: string | null;
    action: string;
    target?: string;
    detail?: string;
    ip?: string;
    requestId?: string;
  };
}

export type EventTopic = keyof EventContracts & string;

export type EventPayload<T extends EventTopic> = EventContracts[T];

/** A handler may return a promise; the bus does not await it unless configured. */
export type EventHandler<T extends EventTopic> = (
  payload: EventPayload<T>,
  meta: EventMeta,
) => void | Promise<void>;

export interface Disposable {
  dispose(): void;
}
