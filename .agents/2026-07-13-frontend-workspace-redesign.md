# Frontend workspace redesign

## Scope

- Refined the application shell and responsive navigation.
- Promoted AI Q&A, AI planning, and AI knowledge extraction as primary course actions.
- Simplified course cards, statistics, tabs, empty states, and planning controls.
- Added Vite vendor chunk splitting to remove the oversized bundle warning.

No backend, database schema, uploaded material, or existing business data was changed.

## Verification

- `pnpm exec tsc -b`
- `pnpm lint`
- `pnpm build`
- Desktop and 390 x 844 mobile browser regression
- Browser console: no errors or warnings
- Mobile page: no document-level horizontal overflow
