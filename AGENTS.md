# Repository Guidelines

## Project Status and Direction

This repository implements a staged Scratch 3-compatible DSL foundation. It is
a compatibility subset, not a complete Scratch clone.

Phases 0–6 are complete:

- Phase 0: DSL schema, stable IDs, Scratch-compatible casts, opcode metadata, and validation.
- Phase 1: Project/Stage/Sprite/Target domain model, block containers, and stores.
- Phase 2: DOM-free Runtime, scheduler, threads, block runner, events, and data primitives.
- Phase 3: Canvas 2D rendering and DOM keyboard/mouse input.
- Phase 4: asset management, MD5 validation, and simple Web Audio.
- Phase 5: clone, custom procedure/warp, pen, and monitor minimum support.
- Phase 6: validated DSL → project.json serialization, SB3 ZIP packaging, and `scratch-parser` compatibility checks.

Phase 7 has been redefined as AI authoring operations, sample-fixture work, and
real-editor verification. It is not a Scratch GUI/editor implementation.
Phase 8 is reserved for SB3 import and round-trip work. Phase 9 is optional
compatibility work such as pitch/pan and collision improvements. Do not
implement a later phase unless explicitly requested.

The current roadmap is `docs/main_design/NEXT_PHASE_ROADMAP.md`. The older
`docs/IMPLEMENTATION_ROADMAP.md` remains useful for the Phase 0–6 history, but
its Phase 7+ definitions are superseded.

## Sources of Truth

Use this priority when documentation disagrees:

1. The current implementation and tests.
2. `schemas/project.schema.json` plus the handwritten validators.
3. Current specifications under `docs/main_design/`.
4. This file.
5. Historical roadmap text and `CLAUDE.md`.

Important current documents:

- `docs/main_design/POST_PHASE6_STATUS.md`: implemented capabilities and limitations.
- `docs/main_design/NEXT_PHASE_ROADMAP.md`: Phase 7–9 scope.
- `docs/main_design/DSL_AUTHORING_GUIDE_FOR_AI.md`: rules for generating DSL projects.
- `docs/main_design/AI_GENERATION_WORKFLOW_SPEC.md`: generation and diagnosis workflow.
- `docs/main_design/SAMPLE_PROJECT_FIXTURE_PLAN.md`: planned sample coverage.
- `docs/main_design/SB3_REAL_EDITOR_VERIFICATION_SPEC.md`: manual Scratch/TurboWarp checks.
- `docs/main_design/SB3_IMPORT_DESIGN_DRAFT.md`: Phase 8 design only.
- `docs/main_design/OPTIONAL_FEATURES_DESIGN_DRAFT.md`: deferred compatibility work.

`scratch-editor/` (tag `v14.1.0`) and `scratch-audio/` (tag `v2.0.268`) are
pinned upstream research checkouts and nested Git repositories. Treat them as
read-only unless a task explicitly targets them.

## Architecture and Invariants

The Scratch-compatible DSL is the single persistent source of truth:

```text
DSL
  ├─ validate → Project/Runtime → headless/browser execution
  └─ validate → SB3 serializer → project.json + assets → .sb3
```

Preserve these invariants:

- Never generate SB3 from mutable Runtime state.
- SB3 serialization accepts a validated `DslProject`; Runtime-only clones are never exported.
- Do not hand-edit generated `project.json` or ZIP entries as the primary workflow. Edit DSL and regenerate.
- IDs are project-wide stable identifiers. Never renumber them on each save.
- Stage owns broadcast declarations. Stage variables/lists are global; Sprite variables/lists are local.
- Unknown opcodes are retained with diagnostics rather than silently discarded. AI-authored new projects should not introduce unknown opcodes.
- Validation, domain model, and Runtime stay independent of DOM, Canvas, Web Audio, and ZIP implementations.
- Runtime imports only `RendererPort`, `InputPort`, and `RuntimeAudioPort`-style interfaces, not browser implementations.
- Future SB3 import must preserve unknown blocks, mutation data, extensions, comments, monitors, and metadata through an opaque representation. Phase 8 code does not exist yet.

## Project Structure

- `src/blocks/`: opcode metadata. P0 plus Phase 5 clone/procedure/pen/monitor opcodes are registered.
- `src/cast/`: Scratch-compatible value conversion.
- `src/model/`: stable IDs and Project/Target domain model.
- `src/validation/`: structural, semantic, scope, and block-graph validation.
- `src/runtime/`: scheduler, threads, block execution, clone/procedure/pen/monitor managers.
- `src/render/`: renderer port, Canvas 2D implementation, skins, and coordinates.
- `src/input/`: input port, DOM input manager, and key normalization.
- `src/assets/`: asset records, loading, MD5, and reference/byte validation.
- `src/audio/`: audio ports, sound manager/bank/player, and Web Audio adapter.
- `src/sb3/`: project serializer, block normalization, asset/extension collection, ZIP writer, and packager.
- `schemas/project.schema.json`: normative DSL JSON Schema.
- `tests/fixtures/`: valid, invalid, runtime, render, Phase 5, and SB3 fixtures.
- `tests/{validation,model,runtime,render,input,assets,audio,sb3,compatibility}/`: DOM-free Node tests.
- `tests/e2e/`: Playwright tests and local browser harness.
- `docs/main_design/`: current architecture, operation, roadmap, and future-design documents.

## Validation Boundary

`src/validation/projectValidator.ts::validateProject(value)` is the validation
entry point:

1. Validate top-level structure and supported `schemaVersion` (`1.0.0`).
2. Validate Stage/Sprite/block dictionary shapes.
3. Stop before semantic validation if structural errors exist.
4. Validate IDs, asset references, scope, comments, procedure mutation, and block graph semantics.

The JSON Schema is not loaded by the handwritten Runtime validator. When the
DSL shape changes, update both `schemas/project.schema.json` and the handwritten
validator, plus focused fixtures/tests.

Every diagnostic must include `code`, `severity`, `path`, `entityId`, `opcode`,
and `message`; use `null` when entity ID or opcode is unavailable. Diagnostic
codes use dotted lowercase form, for example `block.reference-dangling`.

Opcode input/field/shadow names must come from
`src/blocks/opcodeMetadata.ts` or verified upstream sources. Do not infer them.
Most advanced sensing and non-pen extension opcodes remain unsupported.

## SB3 Compatibility Boundary

Phase 6 guarantees that representative generated archives:

- contain `project.json` and every referenced costume/sound entry;
- use stable block/variable/list/broadcast IDs;
- normalize compact primitives, shadows, and procedure mutation;
- reject missing assets and MD5 mismatches;
- are accepted by `scratch-parser`.

`scratch-parser` acceptance verifies ZIP extraction and official SB3 schema
validity. It does not prove that Scratch's editor, TurboWarp, or
`scratch-vm.loadProject` will display and execute the project correctly.
Scratch/TurboWarp upload and execution have not yet been performed by the
automated suite. Follow
`docs/main_design/SB3_REAL_EDITOR_VERIFICATION_SPEC.md` and report such checks
as manual evidence, not automated test results.

## AI DSL Authoring Rules

For AI-generated projects, follow
`docs/main_design/DSL_AUTHORING_GUIDE_FOR_AI.md`:

- Start from `createMinimalProject()` where practical and mutate only what the project requires.
- Edit DSL, not generated project.json/SB3.
- Use only registered and implemented opcodes. Stop and split out a feature task if a required opcode is unavailable.
- Keep `next`, `parent`, `inputs`, `fields`, `shadow`, `topLevel`, and `scripts` mutually consistent.
- Keep procedure `proccode`, argument IDs/names/defaults, call input keys, and warp mutation consistent.
- Compute `assetId` from bytes, use `md5ext = assetId.dataFormat`, and supply matching bytes to the packager.
- Run validator, focused Runtime tests, browser tests when required, and SB3 checks in that order.

Phase 7 fixture names and intended coverage are planned in
`docs/main_design/SAMPLE_PROJECT_FIXTURE_PLAN.md`. The plan is not proof that
those fixtures have been implemented.

## Build and Test Commands

Node.js 22+ runs TypeScript directly through type stripping. Relative ES module
imports must include the `.ts` extension.

Install dependencies:

```powershell
npm install
```

Run all DOM-free tests:

```powershell
npm test
```

If PowerShell blocks `npm.ps1`, use:

```powershell
npm.cmd test
```

Run browser integration tests:

```powershell
npm run test:e2e
```

Equivalent direct Playwright invocation:

```powershell
npx playwright test
```

Under PowerShell execution-policy restrictions use `npm.cmd`/`npx.cmd`.

Check one TypeScript file:

```powershell
node --experimental-strip-types --check src/validation/projectValidator.ts
```

The Phase 6 completion run on June 21, 2026 passed 131 Node tests and 9
Playwright/Chromium tests. Treat this as historical evidence; rerun relevant
checks after changes.

## Testing Guidelines

Use `node:test` and `node:assert/strict`. Add focused tests for every validation
rule and DOM-free behavior. Keep coordinate conversion, key normalization,
scheduler, serializer, and ZIP logic in Node tests.

Use Playwright only for real browser, Canvas, DOM event, image decode, or Web
Audio behavior. Do not make external Scratch/TurboWarp site automation a normal
test dependency.

Required rejection coverage includes dangling references, duplicate IDs, scope
violations, graph cycles, malformed structures, unsupported versions, missing
asset bytes, and asset hash mismatches.

## Coding Style

Use TypeScript, ES modules, four-space indentation, semicolons, and single
quotes. Prefer explicit exported interfaces and pure functions.

- `camelCase`: functions and variables.
- `PascalCase`: classes and interfaces.
- `UPPER_SNAKE_CASE`: immutable registries and constants.

## Scope Exclusions

Unless explicitly requested, do not implement:

- a Scratch-style block editor or full official GUI;
- paint or sound editors;
- Scratch account, cloud Runtime, online save, or sharing;
- loudness or microphone support;
- complete extension compatibility;
- Phase 8 SB3 import;
- Phase 9 pitch/pan, alpha collision, color touching, or corpus expansion.

Keeping cloud flags or unknown extension data for serialization is separate
from implementing their Runtime behavior.

## Commit and Pull Request Guidelines

History follows Conventional Commits, such as `feat:`, `docs:`, and
`refactor:`. Keep commits scoped and imperative.

Pull requests should state the affected phase, summary, compatibility changes,
and exact test commands/results. Include screenshots only for visual changes.
