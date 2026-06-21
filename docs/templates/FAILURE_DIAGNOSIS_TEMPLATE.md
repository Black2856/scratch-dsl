# Failure Diagnosis Template

fixture:
source commit:
failing command:
environment:

## Failure Layer

- [ ] DSL shape
- [ ] Validator semantics
- [ ] Runtime/thread
- [ ] Renderer/input/audio
- [ ] Asset/MD5/decode
- [ ] SB3 serializer/package
- [ ] scratch-parser
- [ ] Scratch/TurboWarp manual verification

## Evidence

diagnostic code:
path:
entityId:
opcode:
expected:
actual:
reproduction steps:
logs/screenshots:

## Isolation

smallest failing fixture:
last known passing stage:
unrelated features removed:

## Resolution

root cause:
changed files:
tests added:
remaining uncertainty:
Phase 8/9 follow-up:

