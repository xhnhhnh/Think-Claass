# Modularization Boundary Audit

## Current Module Boundary

- Frontend business calls enter through `src/features/*/api` and `src/features/*/hooks`.
- The legacy `src/api/*` compatibility facades were removed in P7; there is no second client layer.
- Shared contracts live under `src/shared/*`; feature APIs own DTO normalization for their domain.

## Compatibility Surface

- The legacy backend fallback registrar (`api/routes/registerModules.ts`) was retired with the plugin migration; there is no second registration path.
- The former `api/modules/auth` and `api/modules/marketplace` wrappers are also gone; those routes are plugin-owned now.
- Existing public HTTP paths remain stable; this audit does not remove or version any endpoint.

## Cleanup Completed

- Public announcement and danmaku component polling now route through `features/engagement`.
- UI component variant constants and rank-tier helpers have moved out of component files to satisfy fast-refresh boundaries.
- `canvas-confetti` is loaded through `src/lib/confetti.ts` so feature pages do not statically bundle the effect library.

## Known Non-Blocking Follow-Up

- Vite may still report the main application chunk above 500 kB. Route-level code splitting is a separate performance project and was intentionally left out of this cleanup.
