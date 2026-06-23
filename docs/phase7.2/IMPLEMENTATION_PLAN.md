# Phase 7.2 Implementation Plan

## 共通実装手順

各feature sliceで次を同時に行う。

1. 公式sourceとGUI形状を再確認する。
2. opcode metadataとvalidatorを追加する。
3. model/port/managerを必要最小限追加する。
4. primitiveとhat policyを実装する。
5. focused unit/Runtime testを追加する。
6. SB3 serializer fixtureを追加する。
7. browser依存ならPlaywright testを追加する。
8. `manual-verification`へ対応stepを追加する。
9. Scratch/TurboWarp手動結果を記録する。

## Wave A: DOM非依存

### A1 operators

- `operator_mod`, `operator_round`, `operator_mathop`。
- `MathUtil.tan`相当を追加する。
- NaN、Infinity、負mod、degree trigを公式fixtureで固定する。

### A2 control

- `control_wait_until`, `control_repeat_until`, `control_while`。
- loop frameとwarp時のyield規則を確認する。

### A3 timer/environment/reporters

- ProjectTimer、WallClockPort、UserEnvironmentPort。
- `sensing_timer/resettimer/current/dayssince2000/online/username/of`。
- `looks_*numbername`, `looks_size`, `sensing_distanceto`, `setdragmode`。
- Sprite.draggableをmutable化しclone copy testを追加する。

完了ゲート:

- Node unit/Runtime testだけで決定的に検証可能。
- renderer/audio/UI無しで全テストが通る。

## Wave B: motion/backdrop/event

### B1 target resolver and motion

- motion/sensing共通TargetResolver。
- goto、point towards、2種類のglide。
- transformed boundsを使うedge bounce。
- glide中pen線、fencing、0秒、missing targetを検証する。

### B2 backdrop

- Stage costume変更helper。
- switch/next/switch-and-wait。
- backdrop hat field matchとthread待機。
- Stageがcostume無しの場合のno-opを明示する。

### B3 click and edge hats

- HatPolicy、edge state。
- InputPort pointer transitions。
- RendererPort pick。
- draggable/non-draggable click timing。
- greater-thanのtimer分岐を先に実装し、loudness分岐はWave Dで有効化する。

完了ゲート:

- Fake renderer/inputでRuntime test。
- RendererPortのpick/bounds Playwright test（実Scratch VM経由）。
- backdrop SB3を公式/TurboWarpでload可能。

## Wave C: UI and visual

### C1 bubble

- BubbleManager、BubbleView、bubble描画（視覚確認は実Scratch VM経由）。
- say/think、秒数付き、後続bubbleによるgeneration保護。
- hidden target、clone削除、stop all。

### C2 question

- QuestionManager、QuestionUiPort、preview input。
- FIFO、visible Sprite bubble、Stage/hidden question label。
- stop/clone delete時のcleanup。

### C3 object touching and effects

- alpha-aware point/Sprite/edge collision。
- graphic effect state全7種。
- 最初にcolor/brightness/ghost、続いて残りeffect。
- collisionとeffectの相互作用をtestする。

完了ゲート:

- Canvas E2Eでclick、bubble、question、touchingを確認。
- color effectのchange/set/clearがScratchと目視一致。

## Wave D: pixel/audio/device

### D1 pen HSV

- PenState拡張、HSV/RGB変換。
- change/set param。
- transparencyをpen line/stampへ反映する。

### D2 sound effects

- AudioPort/WebAudioPortのpitch/pan。
- target state、clone state、green flag/stop reset。
- active soundへの即時反映。

### D3 loudness

- LoudnessPortとbrowser microphone adapter。
- 1 tick cache。
- `sensing_loudness`とgreater-than loudness。
- permission無しの`-1` fallback。

### D4 color collision

- scene query surface。
- touching color、color touching color。
- backdrop、pen、layer、visibility、ghost mask。
- query bounds最適化。

完了ゲート:

- permissionを必要としないfake loudness Runtime test。
- Web Audio node wiring test。
- browser pixel test。
- Scratch/TurboWarp実機比較。

## 主な変更予定ファイル

| 領域 | ファイル |
|---|---|
| metadata/validation | `src/blocks/opcodeMetadata.ts`, `src/validation/*` |
| model | `src/model/Target.ts`, `Sprite.ts`, `Clone.ts` |
| Runtime | `src/runtime/Runtime.ts`, `BlockRunner.ts`, `EventBus.ts`, `primitives.ts` |
| new managers | `src/runtime/{ProjectTimer,BubbleManager,QuestionManager,TargetResolver}.ts` |
| ports | `src/runtime/ports.ts`, `src/input/InputPort.ts`, `src/runtime/RendererPort.ts`, `src/audio/AudioPort.ts` |
| input/UI | `src/input/InputPort.ts`, `preview/turbowarp/*`（実Scratch VMプレイヤー） |
| audio | `src/audio/WebAudioPort.ts`, `SoundManager.ts`, `SoundBank.ts`, `SoundPlayer.ts` |
| pen | `src/runtime/PenManager.ts` |
| SB3/tests | `src/sb3/*`, `tests/fixtures/*`, focused tests |

ファイル名は実装時に既存構成へ合わせて調整してよいが、責務境界は維持する。

## リスクと対策

| リスク | 対策 |
|---|---|
| 46項目を一括変更し回帰原因が不明になる | waveとfeature sliceで分割 |
| renderer queryが前frame stateを見る | current scene snapshotをqueryへ渡す |
| Canvas filterで誤ったeffects互換を主張 | 公式shader式を基準にeffect別test |
| question Promiseがstop後も待ち続ける | cleanup時にresolveしてqueue除去 |
| microphone testがCI不安定 | fake LoudnessPortを主、実機はmanual |
| online/usernameが環境依存 | injected portと明示fallback |
| sound effectがcloneで共有される | 値をcopyしbank/playbackは独立 |
| color queryが遅い | AABB候補絞込、交差領域だけreadback |

## Phase 7.2完了条件

- 46項目すべてに登録opcodeと意図したprimitive/hatが存在する。
- [`IMPLEMENTABILITY_MATRIX.md`](../../workspace/manual-verification/ultra-test/IMPLEMENTABILITY_MATRIX.md)
  で46項目がunsupportedではなくなる。
- `npm test`と関連`npm run test:e2e`が通る。
- `npm run preview -- manual-verification`で全項目を操作できる。
- `npm run sb3 -- manual-verification`がscratch-parserを通る。
- Scratch公式/TurboWarpでload、実行、再保存、再読込を記録済み。
- 残差があれば`partial`の理由と次タスクを文書化する。
