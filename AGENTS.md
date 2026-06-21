# Repository Guidelines

## Knowledge Management

- Keep `AGENTS.md` limited to high-level rules, constraints, and workflows.
- Put detailed architecture and design in `docs/`; current design documents live mainly in `docs/main_design/`.
- Before work, read only the documents relevant to the task.
- After material changes, update the relevant document when behavior or design has changed.
- In the final response, include a short `docs Update Proposal` when documentation should be added or revised. Include an `AGENTS.md Update Proposal` only when repository-wide guidance must change.

## Task and Model Optimization

- Decompose complex tasks into independently verifiable parts.
- Use sub-agents only when parallel work materially improves speed or review quality; give each a narrow, non-overlapping scope.
- Match reasoning depth and available model capability to risk: stronger reasoning for architecture and compatibility, faster execution for bounded mechanical work.
- Prefer targeted reads and focused tests; do not trade correctness for token savings.

## Current Status and Roadmap

This is a Scratch 3-compatible DSL foundation, not a complete Scratch clone.
Phases 0–6 are complete: validation, domain model, Runtime, Canvas/input,
asset/audio, clone/procedure/pen/monitor, and DSL-to-SB3 export.

- Phase 7: AI authoring workflow, sample fixtures, and real-editor verification.
- Phase 7.1: local `workspace/projects/` preview and SB3 export workflow.
- Phase 8: existing SB3 import and round-trip preservation.
- Phase 9: optional compatibility improvements.

Use:

- `docs/IMPLEMENTATION_ROADMAP(1~6).md` for completed phase history.
- `docs/NEXT_PHASE_ROADMAP(7~9).md` for current priorities.
- `docs/main_design/POST_PHASE6_STATUS.md` for capabilities and limits.
- `docs/main_design/DSL_AUTHORING_GUIDE_FOR_AI.md` for DSL generation.
- `docs/main_design/SB3_REAL_EDITOR_VERIFICATION_SPEC.md` for manual Scratch/TurboWarp checks.
- `docs/main_design/SB3_IMPORT_DESIGN_DRAFT.md` for Phase 8 design only.

Do not implement a later phase unless explicitly requested.

## Workspace and Test Assets

- At task start, inspect `workspace/` and confirm the actual repository root before editing.
- Local Scratch works live under `workspace/projects/<name>/`; keep their `project.ts`, `assets.json`, and generated `output/` there.
- Use the same validated `project.ts` DSL for both `npm run preview -- <name>` and `npm run sb3 -- <name>`.
- Keep reusable preview/CLI mechanisms in `preview/`, `tools/`, and `src/`; do not move common Runtime/Renderer/SB3 code into a workspace project.
- `workspace/` is intentionally gitignored. Keep CI and regression fixtures under `tests/fixtures/`.
- Phase 7 test assets live under `workspace/test-project/`.
- Use `music/`, `sound_effect/`, and `sprite/` assets from that directory for fixtures and SB3 tests.
- Do not add external assets without explicit approval.
- Asset-backed fixtures must derive `assetId` from bytes and keep `md5ext = assetId.dataFormat`.
- Keep filesystem reads in Node-only helpers so reusable DSL fixtures remain browser-safe.

## Sources of Truth

When information conflicts, use this order:

1. Current implementation and tests.
2. `schemas/project.schema.json` and handwritten validators.
3. Current documents under `docs/`.
4. `AGENTS.md`.
5. `CLAUDE.md` and historical notes.

`scratch-editor/` and `scratch-audio/` are pinned, nested upstream research
checkouts. Treat them as read-only unless a task explicitly targets them.

## Core Architecture Invariants

The Scratch-compatible DSL is the persistent source of truth:

```text
DSL
  ├─ validate → Project/Runtime → execution
  └─ validate → SB3 serializer → project.json + assets → .sb3
```

- Never generate SB3 from mutable Runtime state.
- Serialize only validated `DslProject` data; Runtime-only clones are not exported.
- Edit DSL and regenerate. Do not treat generated `project.json` or ZIP contents as the authoring source.
- Keep IDs stable and project-wide unique; never renumber on save.
- Stage owns broadcast declarations. Stage variables/lists are global; Sprite variables/lists are local.
- Preserve unknown opcodes with diagnostics; do not silently discard them. New AI-authored projects should use only registered, implemented opcodes.
- Validation, model, and Runtime must remain independent of DOM, Canvas, Web Audio, and ZIP implementations.
- Runtime depends on ports (`RendererPort`, `InputPort`, `RuntimeAudioPort`), not browser implementations.
- Future SB3 import must preserve unknown blocks, mutations, extensions, comments, monitors, and metadata. Phase 8 is not implemented.

## Validation and DSL Changes

`validateProject(value)` in `src/validation/projectValidator.ts` is the
validation entry point. Structural errors stop semantic validation.

When changing the DSL:

- Update both `schemas/project.schema.json` and the handwritten validator.
- Add focused fixtures and tests.
- Keep every diagnostic machine-readable with `code`, `severity`, `path`, `entityId`, `opcode`, and `message`; use `null` when unavailable.
- Use dotted lowercase diagnostic codes, for example `block.reference-dangling`.
- Take input, field, shadow, shape, and target rules from `src/blocks/opcodeMetadata.ts` or verified upstream sources. Do not infer them.

For AI-generated projects:

- Start from `createMinimalProject()` where practical.
- Keep `next`, `parent`, `inputs`, `fields`, `shadow`, `topLevel`, and `scripts` consistent.
- Keep procedure mutation and call argument IDs consistent.
- Compute `assetId` from bytes and use `md5ext = assetId.dataFormat`.
- Validate before Runtime execution or SB3 packaging.

## SB3 Compatibility Boundary

Phase 6 verifies packaging, asset/hash consistency, block normalization, and
acceptance by `scratch-parser`.

`scratch-parser` acceptance checks ZIP extraction and SB3 schema validity. It
does not prove correct behavior in Scratch, TurboWarp, or
`scratch-vm.loadProject`. Treat real-editor checks as separate manual evidence.

## Build and Test

Node.js 22+ runs TypeScript through type stripping. Relative ESM imports must
include `.ts`.

```powershell
npm install
npm test
npm run test:e2e
npm run preview -- full-feature-minimal
npm run sb3 -- full-feature-minimal
node --experimental-strip-types --check src/validation/projectValidator.ts
```

If PowerShell blocks `npm.ps1` or `npx.ps1`, use `npm.cmd` / `npx.cmd`.

- Use `node:test` and `node:assert/strict` for DOM-free behavior.
- Use Playwright only for browser, Canvas, DOM event, image decode, or Web Audio behavior.
- Run focused tests while iterating and the relevant full suite before handoff.
- Do not make external Scratch/TurboWarp site automation a normal test dependency.

## Coding and Change Scope

- TypeScript, ES modules, four-space indentation, semicolons, single quotes.
- Prefer explicit exported interfaces and pure functions.
- Use `camelCase`, `PascalCase`, and `UPPER_SNAKE_CASE` conventionally.
- Preserve unrelated user changes in a dirty worktree.
- Keep each requested phase or feature as a scoped change.

Unless explicitly requested, do not implement:

- Scratch-style block editor or complete official GUI;
- paint or sound editors;
- account, online sharing, or cloud Runtime;
- loudness or microphone;
- complete extension compatibility;
- Phase 8 import or Phase 9 compatibility features.

## Git

Use scoped Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`).
PRs should state the affected phase, compatibility impact, and exact test
commands/results. Include screenshots only for visual changes.
