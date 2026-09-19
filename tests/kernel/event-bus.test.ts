/**
 * Event bus: fault isolation, timeout, deterministic ordering, wildcards.
 *
 * These properties are what let independently written plugins coexist. Without
 * them one bad plugin can take down the process or silently reorder another
 * plugin's side effects.
 */

import { describe, expect, it, vi } from 'vitest';

import { createEventBus } from '@thinkclass/kernel';

describe('event bus', () => {
  it('delivers a payload with metadata', async () => {
    const bus = createEventBus({ synchronous: true });
    const seen: unknown[] = [];
    bus.on('kernel.config.changed', (payload, meta) => {
      seen.push({ payload, meta });
    });

    bus.emit('kernel.config.changed', { key: 'site_title', previous: 'a', next: 'b' }, { source: 'test' });
    await bus.drain();

    expect(seen).toHaveLength(1);
    const { payload, meta } = seen[0] as any;
    expect(payload.key).toBe('site_title');
    expect(meta.source).toBe('test');
    expect(meta.topic).toBe('kernel.config.changed');
    expect(meta.id).toBe(1);
  });

  it('isolates a throwing handler from the others', async () => {
    const onHandlerError = vi.fn();
    const bus = createEventBus({ synchronous: true, onHandlerError });
    const good = vi.fn();

    bus.on('kernel.config.changed', () => {
      throw new Error('plugin A exploded');
    }, { owner: 'pluginA', order: 0 });
    bus.on('kernel.config.changed', good, { owner: 'pluginB', order: 1 });

    bus.emit('kernel.config.changed', { key: 'k', previous: null, next: null });
    await bus.drain();

    expect(good).toHaveBeenCalledTimes(1);
    expect(onHandlerError).toHaveBeenCalledTimes(1);
    expect(onHandlerError.mock.calls[0][1]).toBe('pluginA');
    expect(bus.stats().failed).toBe(1);
    expect(bus.stats().delivered).toBe(1);
  });

  it('isolates a rejected async handler', async () => {
    const bus = createEventBus({ synchronous: true });
    const good = vi.fn();
    bus.on('kernel.config.changed', async () => {
      throw new Error('async failure');
    }, { owner: 'pluginA' });
    bus.on('kernel.config.changed', good, { owner: 'pluginB' });

    bus.emit('kernel.config.changed', { key: 'k', previous: null, next: null });
    await bus.drain();

    expect(good).toHaveBeenCalledTimes(1);
    expect(bus.stats().failed).toBe(1);
  });

  it('abandons a handler that exceeds its budget', async () => {
    const onHandlerError = vi.fn();
    const bus = createEventBus({ synchronous: true, handlerTimeoutMs: 20, onHandlerError });
    const after = vi.fn();

    bus.on('kernel.config.changed', () => new Promise<void>(() => {}), { owner: 'hang', order: 0 });
    bus.on('kernel.config.changed', after, { owner: 'ok', order: 1 });

    bus.emit('kernel.config.changed', { key: 'k', previous: null, next: null });
    await bus.drain();

    expect(after).toHaveBeenCalledTimes(1);
    expect(bus.stats().timedOut).toBe(1);
  });

  it('delivers in explicit order then by owner id', async () => {
    const bus = createEventBus({ synchronous: true });
    const order: string[] = [];

    bus.on('kernel.config.changed', () => void order.push('zeta'), { owner: 'zeta', order: 5 });
    bus.on('kernel.config.changed', () => void order.push('alpha'), { owner: 'alpha', order: 5 });
    bus.on('kernel.config.changed', () => void order.push('first'), { owner: 'zzz', order: 1 });

    bus.emit('kernel.config.changed', { key: 'k', previous: null, next: null });
    await bus.drain();

    expect(order).toEqual(['first', 'alpha', 'zeta']);
  });

  it('supports prefix wildcards and catch-all', async () => {
    const bus = createEventBus({ synchronous: true });
    const prefix = vi.fn();
    const all = vi.fn();
    bus.on('kernel.plugin.*', prefix);
    bus.on('*', all);

    bus.emit('kernel.plugin.degraded', { pluginId: 'p', errorCount: 1, windowSize: 10, lastError: 'x' });
    await bus.drain();

    expect(prefix).toHaveBeenCalledTimes(1);
    expect(all).toHaveBeenCalledTimes(1);
  });

  it('stops delivering after unsubscribe', async () => {
    const bus = createEventBus({ synchronous: true });
    const handler = vi.fn();
    const sub = bus.on('kernel.config.changed', handler);

    bus.emit('kernel.config.changed', { key: 'a', previous: null, next: null });
    await bus.drain();
    sub.dispose();
    bus.emit('kernel.config.changed', { key: 'b', previous: null, next: null });
    await bus.drain();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('delivers events emitted by a handler', async () => {
    const bus = createEventBus({ synchronous: true });
    const second = vi.fn();
    bus.on('kernel.config.changed', () => {
      bus.emit('kernel.plugin.state.changed', { pluginId: 'p', from: 'enabled', to: 'active' });
    });
    bus.on('kernel.plugin.state.changed', second);

    bus.emit('kernel.config.changed', { key: 'k', previous: null, next: null });
    await bus.drain();

    expect(second).toHaveBeenCalledTimes(1);
  });
});
