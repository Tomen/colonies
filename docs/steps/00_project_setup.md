# Step 0: Project Setup

Establish the base project structure and tooling required for future milestones.

## Tasks
- Initialize Node/TypeScript project (`npm init -y`, `tsconfig.json`).
- Add development tools: ESLint, Prettier, Vitest (or Jest) for testing.
- Scaffold source tree with stub modules:
  - `types.ts`
  - `worldgen.ts`
  - `transport.ts`
  - `growth.ts`
  - `render.ts`
  - `export_gif.ts`
- Provide build and test scripts in `package.json`.
- Create initial test suite verifying stubs compile.
- Commit initial architecture overview in [`docs/architecture.md`](../architecture.md).

## Testing & Acceptance
- `npm test` runs and passes placeholder tests.
- `npm run lint` reports no issues.
- Repository builds without TypeScript errors.
- All items in [Definition of Done](../definition_of_done.md) are satisfied.
