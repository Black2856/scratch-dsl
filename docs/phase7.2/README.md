# Phase 7.2 Scratch互換ブロック拡張

## 目的

Phase 7.2は、`manual-verification`で実装不可能と判定された46項目を、推測した
no-opではなくScratch互換の実装として解消するための設計・実装フェーズである。
対象一覧は
[`IMPLEMENTABILITY_MATRIX.md`](../../workspace/manual-verification/ultra-test/IMPLEMENTABILITY_MATRIX.md)
を参照する。

正本と参照順:

1. `scratch-editor`の公式Scratch v14.1.0。
2. `scratch-vm`のTurboWarp fork。
3. 本リポジトリの既存実装とテスト。

調査時の固定revision:

- 公式: `scratch-editor` tag `v14.1.0`,
  commit `7c172e469eb3c21c1e6326ea6cccea60bc14e3a8`。
- TurboWarp: `scratch-vm`
  commit `43f13efd1883eeef8f82616faf69380ff75ab068`。

TurboWarpは公式挙動を理解する補助と実装上の差分確認にのみ使う。TurboWarp固有の
compiler、可変ステージサイズ、制限解除、独自extension挙動は採用しない。

## 成果物

Phase 7.2の実装完了時には次を満たす。

- 対象opcodeがmetadata、validator、Runtime、SB3 serializerで一貫して扱われる。
- browser依存機能はportの背後へ隔離され、headless Runtimeを維持する。
- `manual-verification`の46項目が、`supported`、環境依存の`manual-only`、または
  明示したfallback付きの`partial`へ移行する。
- Scratch公式エディタとTurboWarpで同一SB3を手動比較できる。
- 公式との差分を発見した場合は`docs/TURBOWARP_DIFF_AUDIT.md`へ記録する。

## 非目標

- Scratchブロックエディタ、paint editor、sound editorの実装。
- Scratchアカウント認証、共有、cloud runtime。
- TurboWarp固有機能の実行。
- Phase 8のSB3 import。
- pixel/audioの完全なビット一致。意味論とユーザー可視結果の互換を目標とする。

`sensing_username`は注入されたユーザー名、未注入時は空文字を返す。
`sensing_online`は注入された接続状態、browserでは`navigator.onLine`、headlessでは
既定値を返す。これらはScratchサイトへのログインや通信を追加しない。

## 文書構成

- [SOURCE_AUDIT.md](./SOURCE_AUDIT.md): 公式/TurboWarpの根拠と採用判断。
- [FEATURE_MATRIX.md](./FEATURE_MATRIX.md): 46項目のopcode対応と実装wave。
- [OPCODE_AND_DSL_DESIGN.md](./OPCODE_AND_DSL_DESIGN.md):
  metadata、input、field、shadow、target制約。
- [ARCHITECTURE_DESIGN.md](./ARCHITECTURE_DESIGN.md):
  Runtime、model、renderer、input、audio、UIの変更設計。
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md):
  実装順、変更ファイル、完了ゲート。
- [VERIFICATION_PLAN.md](./VERIFICATION_PLAN.md):
  unit、Runtime、browser、SB3、実エディタ検証。

## 実装wave

| Wave | 主対象 | 性質 |
|---|---|---|
| A | operators、control、timer/date、reporter、distance、drag | DOM非依存で決定的 |
| B | motion target/glide/bounce、backdrop、click/edge hats | scheduler、input、bounds |
| C | say/think、ask/answer、looks effects、object touching | UI・renderer連携 |
| D | color touching、pen HSV、pitch/pan、loudness | pixel/audio device依存 |

各waveは単独でvalidator、Runtime、SB3、関連E2Eを通してから次へ進む。
