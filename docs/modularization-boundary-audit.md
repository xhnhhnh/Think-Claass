# Modularization Boundary Audit

## Current Module Boundary

- Frontend business calls should enter through `src/features/*/api` and `src/features/*/hooks`.
- `src/api/*` files are compatibility facades for old imports and tests; new page or component code should not add direct calls there.
- Shared contracts live under `src/shared/*`; feature APIs own DTO normalization for their domain.

## Compatibility Surface

- Legacy backend routes remain registered as fallback after module registration in `api/routes/registerModules.ts`.
- `api/modules/auth` and `api/modules/marketplace` currently wrap the legacy auth and shop routes to preserve behavior while marking the module boundary.
- Existing public HTTP paths remain stable; this audit does not remove or version any endpoint.

## Cleanup Completed

- Public announcement and danmaku component polling now route through `features/engagement`.
- UI component variant constants and rank-tier helpers have moved out of component files to satisfy fast-refresh boundaries.
- `canvas-confetti` is loaded through `src/lib/confetti.ts` so feature pages do not statically bundle the effect library.

## Known Non-Blocking Follow-Up

- Vite may still report the main application chunk above 500 kB. Route-level code splitting is a separate performance project and was intentionally left out of this cleanup.
