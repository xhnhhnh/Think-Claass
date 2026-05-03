# ThinkClass Refactor Architecture

This branch establishes a vertical-domain migration pattern. Pet is the first full sample and later domains should follow the same shape.

## Core

- Shared contracts live under `src/shared/{domain}` and may be imported by frontend and backend TypeScript.
- Generic response contracts live under `src/shared/core`.
- Domain query keys live beside feature hooks, not inside pages.

## Backend

- New backend domains live under `api/modules/{domain}`.
- Each domain owns routes, service, repository interface, SQLite repository implementation, mappers, and module assembly.
- Legacy `api/routes/*` files should become compatibility adapters while clients move to new `/api/{domain}` paths.

## Frontend

- New frontend domains live under `src/features/{domain}`.
- A feature owns its API client, hooks, components, pages, and view-specific types.
- Existing `src/pages/**` files can re-export feature pages while route imports are migrated gradually.

## Migration Map

| Domain | Legacy Backend | New Backend | Legacy Frontend | New Frontend |
| --- | --- | --- | --- | --- |
| Pet | `api/routes/pet.ts` at `/api/pets/*` | `api/modules/pet` at `/api/pet/*` | `src/api/pet.ts`, `src/hooks/queries/usePet.ts`, `src/pages/Student/Pet.tsx`, `src/pages/Teacher/Pets.tsx` | `src/features/pet` |

