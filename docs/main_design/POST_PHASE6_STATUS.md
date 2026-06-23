# Phase 6 完了時点の現状

> **現状更新 (render方針変更):** 自作の Canvas 2D Renderer / Skin / Drawable と
> その preview・E2E は削除した。視覚・音声・collision の正本は **実 Scratch VM
> (`@scratch/scratch-vm` + `scratch-render`)** で、`npm run preview`（ブラウザ）/
> `npm run shot`（Playwright screenshot + 状態JSON）が `.sb3` を実行して検証する。
> 本リポジトリの Runtime は決定的ロジック中心で、`RendererPort` は fake port 用の
> seam として残す。本書の Phase 3「Canvas Renderer」等の記述は歴史的経緯として残置。

## 目的

Phase 0〜6で成立した機能、責務境界、保証範囲を固定する。本書はScratch完全互換を宣言するものではなく、次フェーズの判断基準である。

## 完了済み

| Phase | 完了内容 |
|---|---|
| 0 | DSL schema、ID、Cast、opcode metadata、validator |
| 1 | Project、Stage、Sprite、Target、BlockContainer、Stores |
| 2 | Runtime、Scheduler、Thread、BlockRunner |
| 3 | 座標変換、DOM入力 *(旧: 自作Canvas 2D Renderer は削除済み)* |
| 4 | AssetManager、MD5、簡易Web Audio |
| 5 | clone、procedure、pen、monitorの最小実装 |
| 6 | DSLからproject.jsonへの変換、SB3 ZIP packaging、scratch-parser検証 |

現在成立している処理系は次のとおり。

```text
Scratch互換DSL（唯一の正本）
  ├─ validate → Project/Runtime → headless・audioで実行確認（視覚確認は実Scratch VMで行う）
  └─ validate → SB3 serializer → project.json + assets → .sb3
```

## できること

- DSLの構造、ID、scope、block graph、asset参照を検証する。
- Stageとoriginal SpriteをRuntimeへ構築し、対応済みopcodeを実行する。
- keyboard、mouse、costume、simple soundを利用する。
- clone、custom procedure、warp、simple pen、variable/list monitor visibilityを扱う。
- 検証済みDSLをScratch 3形式のproject.jsonへ変換する。
- project.jsonと参照assetを含むSB3を生成する。
- scratch-parserへ生成SB3を渡し、ZIP展開と公式SB3 schema検証を通す。
- 既存SB3（実Scratch/TurboWarp保存物を含む）をimportしてDSL化する（Phase 8、`npm run import`）。
  `--out <name>` でeditable workspace作品を生成でき、import → 編集 → 再exportが成立する。

## まだできないこと

- cloud変数のDSL表現とproject `meta`の再export保持（importでは通常変数化/警告）。Phase 9候補。
- 未対応opcodeの入力metadata網羅（importは情報保持するが`opcode.input-unknown`警告が出る）。
- Scratch公式エディタまたはTurboWarp上での実動作保証。
- scratch-vm `loadProject` 相当によるtarget、asset、monitorの完全な復元確認。
- Scratchと同一のthread競合順、描画、collision、音声効果の保証。
- 未対応opcodeやpen以外のextensionの実行。
- 公式GUI、block editor、paint editor、sound editor、サイト共有。

## 設計上の制約

1. DSLを唯一の正本とする。
2. Runtime内部状態からSB3を生成しない。
3. SB3 serializerは検証済みDSLだけを受け取る。
4. Runtimeにのみ存在するclone個体は保存しない。
5. IDを保存ごとに再採番しない。
6. validation、model、runtimeをDOM、Canvas、Web Audio、ZIP具体実装へ依存させない。
7. 未知情報を扱う将来のimportでは、黙って破棄しない。

## Scratch互換性の位置づけ

本プロジェクトはScratch 3の主要なデータ形状と挙動を段階的に採用する互換subsetであり、完全互換実装ではない。対応済みopcodeでも、描画精度、実行順、edge caseがScratch公式実装と異なる可能性がある。

TurboWarpについても同様であり、開けることや主要動作が近いことを目標にするが、TurboWarp固有機能への全面対応は行わない。

## Phase 6の最小完成ライン

- Stageを先頭にしたoriginal targetのみのproject.jsonを生成できる。
- block ID、variable/list/broadcast IDを安定して保持できる。
- compact primitive、shadow、procedure mutationをSB3形式へ変換できる。
- 全参照assetをZIPへ同梱し、asset bytesのMD5不整合を拒否できる。
- variable/list monitorを対象IDへ関連付けられる。
- scratch-parserが代表SB3を受理する。

## テスト状況

2026年6月21日のPhase 6完了確認では、次を実行した。

- `npm test`: 131件成功。
- `npx playwright test`: Chromium 9件成功。

これはその時点の実績であり、将来の変更後は再実行が必要である。

## Phase 7.1追記

Phase 7.1でworkspace作品preview/exportフローを追加し、次の既存機構接続を
確認した。

- `motion_movesteps`によるSprite座標更新。
- workspace DSLからのpreviewとSB3 export。

2026年6月22日の確認では`npm test` 179件、
`npx playwright test` 17件が成功した。これはPhase 6完了時点の実績を
置き換えるものではなく、その後の追加実装に対する確認記録である。

## scratch-parser検証と実エディタ検証

scratch-parser検証は、生成物がZIPとして展開でき、project.jsonが公式SB3 schemaに適合することを確認する。これは重要な形式検証だが、次を保証しない。

- Scratch公式エディタで表示・実行できること。
- assetが実際にdecode・描画・再生されること。
- block、monitor、extensionがVM内部へ期待どおり復元されること。
- green flag実行結果がHTMLJS Runtimeと一致すること。
- エディタから再保存したSB3が情報を保持すること。

Scratch公式エディタ、TurboWarp、scratch-vm `loadProject` 相当の確認は未実施であり、[SB3_REAL_EDITOR_VERIFICATION_SPEC.md](./SB3_REAL_EDITOR_VERIFICATION_SPEC.md)に手順だけを定義する。
