# Repository Guidelines

## Project Structure & Module Organization

This repository is implementing a staged Scratch-compatible DSL foundation.

- `src/`: Phase 0 TypeScript modules.
  - `blocks/`: opcode metadata.
  - `cast/`: Scratch-compatible value conversion.
  - `model/`: stable ID generation and validation.
  - `validation/`: project and block-graph validators.
- `schemas/`: JSON Schema definitions, currently `project.schema.json`.
- `tests/fixtures/`: valid and intentionally invalid DSL projects.
- `tests/validation/`: Node test suites named `*.test.ts`.
- `docs/`: architecture, runtime, block, asset, SB3, and roadmap specifications.
- `scratch-editor/` and `scratch-audio/`: pinned upstream reference checkouts. Treat these as read-only research sources unless a task explicitly targets them.

Follow `docs/IMPLEMENTATION_ROADMAP.md`. Do not implement later phases unless requested.

## Build, Test, and Development Commands

There is currently no package build step or root `package.json`. Node.js 22+ runs TypeScript through type stripping:

```powershell
node --no-warnings --experimental-strip-types --test tests/validation/*.test.ts
```

Run a syntax check over a file with:

```powershell
node --experimental-strip-types --check src/validation/projectValidator.ts
```

Validate the JSON Schema and fixtures when changing DSL structure. Phase 0 must remain independent of DOM, Canvas, Web Audio, and ZIP libraries.

## Coding Style & Naming Conventions

Use TypeScript, ES modules, four-space indentation, semicolons, and single quotes. Prefer explicit exported interfaces and pure functions. Use:

- `camelCase` for functions and variables.
- `PascalCase` for classes and interfaces.
- `UPPER_SNAKE_CASE` for immutable registries and constants.
- Diagnostic codes in dotted lowercase form, such as `block.reference-dangling`.

Every validation diagnostic must provide `path`, `entityId`, and `opcode`, using `null` when unavailable.

## Testing Guidelines

Use the built-in `node:test` framework and `node:assert/strict`. Add focused tests for every validation rule. Fixtures should be constructed from `createMinimalProject()` and mutate only the property under test. Required rejection coverage includes dangling references, duplicate IDs, scope violations, graph cycles, malformed schema data, and unsupported versions.

## Commit & Pull Request Guidelines

History follows Conventional Commits, for example `feat: ...` and `refactor: ...`. Keep commits scoped and imperative.

Pull requests should include a concise summary, affected phase, test command and result, linked issue when applicable, and screenshots only for future visual changes. Call out schema or diagnostic compatibility changes explicitly.
