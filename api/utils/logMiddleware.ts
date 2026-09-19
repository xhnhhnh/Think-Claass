/**
 * Audit middleware.
 *
 * The baseline version wrapped `res.json` and matched four hardcoded paths inline,
 * attributing every entry to teacher id `1` because it read `req.body.teacherId`
 * with a literal fallback. Anything else was silently unaudited.
 *
 * This version is generic: it consults the kernel's audit registry of declarative
 * descriptors and writes through the kernel's audit log. Attribution comes from the
 * verified request context, so an entry names the authenticated caller rather than
 * whatever the request body claimed - the body was attacker-controlled.
 *
 * The middleware is built once, on first request, because the kernel is created
 * during `createApp()` and this module is imported before that.
 */

import type { NextFunction, Request, Response } from 'express';

import { createAuditMiddleware, getActiveKernel, getRequestContext, type AuditRegistry, type AuditLog } from '@thinkclass/kernel';

interface AuditMiddleware {
  (req: Request, res: Response, next: NextFunction): void;
  /** Set by `registerAuditDescriptors` so callers can inspect coverage. */
  registry?: AuditRegistry;
}

let middleware: AuditMiddleware | null = null;

function build(): AuditMiddleware | null {
  const kernel = getActiveKernel();
  if (!kernel) return null;

  const mw = createAuditMiddleware({
    registry: kernel.auditRegistry,
    auditLog: kernel.audit,
    getContext: (request) => {
      const context = getRequestContext(request as unknown as Request);
      return {
        actorId: context.actor?.userId ?? null,
        role: context.actor?.role ?? null,
        requestId: context.requestId,
      };
    },
  }) as AuditMiddleware;

  mw.registry = kernel.auditRegistry;
  return mw;
}

/**
 * The middleware. Resolves the kernel lazily and caches the result, so a request
 * that arrives before boot is a no-op rather than an error.
 */
export function operationLogger(req: Request, res: Response, next: NextFunction): void {
  if (!middleware) middleware = build();
  if (!middleware) return next();
  middleware(req, res, next);
}

/** Register descriptors declared by the core. Safe to call more than once. */
export function registerAuditDescriptors(
  registry: AuditRegistry,
  descriptors: Parameters<AuditRegistry['register']>[0],
  owner: string,
): void {
  registry.register(descriptors, owner);
}

/** The audit log, for callers that want to record an entry directly. */
export function getAuditLog(): AuditLog | null {
  return getActiveKernel()?.audit ?? null;
}
