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

  // -- classroom (foundation plugin) ----------------------------------------
  'classroom.student.points.changed': {
    studentId: number;
    classId: number;
    delta: number;
    reason: string;
    actorId: number;
  };

  // -- pet (feature plugin) -------------------------------------------------
  //
  // Reshaped in P4.3b.6 alongside `PetPort`: the payloads used to describe the reference
  // implementation's invented model (`element`/`stage`, actions limited to feed|play|train).
  // These are projections of a real `pets` row and of what the route actually received.
  'pet.adopted': {
    petId: number;
    studentId: number;
    classId: number;
    /** Stored `pets.element_type`; free-form text, not a fixed enum. */
    element: string;
    actorId: number;
  };
  'pet.action.performed': {
    petId: number;
    studentId: number;
    /** Whatever the caller sent as `actionType` (e.g. 训练) - free-form, so not an enum. */
    actionType: string;
    /** Points spent; the ledger records the negated amount. */
    cost: number;
    experienceGained: number;
    leveledUp: boolean;
    actorId: number;
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
