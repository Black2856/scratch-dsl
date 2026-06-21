# Phase 7以降のロードマップ

## 再定義の背景

Phase 6でDSLからSB3を生成する最小パイプラインが成立した。次の優先事項は新しいEditor UIではなく、AIが安全に作品を作る運用、代表fixture、実エディタでの確認、将来importの情報保全である。

## Phase 7: AI生成運用・fixture・実エディタ確認

### 対象

- README、AGENTS.md、CLAUDE.mdの更新方針と、別途承認後の更新。
- AI生成ワークフローとDSL authoring guide。
- sample fixtureの実体とテスト。ただし本設計タスクでは計画のみ。
- 生成作品テンプレート。
- 失敗診断テンプレート。
- Scratch公式エディタとTurboWarpの手動確認フロー。
- 代表SB3の確認結果記録。

### 対象外

- 新Runtime/Renderer機能。
- SB3 import。
- Scratch GUIを模倣するeditor shell。
- 外部サイト操作の必須自動化。

### 実装着手後の完了条件案

1. authoring guideに従った主要fixtureがvalidatorを通る。
2. 各fixtureに必要なRuntime/E2E/SB3 testがある。
3. 代表fixtureをScratch公式エディタとTurboWarpで手動確認し、環境と差分を記録する。
4. 生成作品テンプレートと失敗診断テンプレートを利用できる。
5. README、AGENTS.md、CLAUDE.mdがPhase 7運用と矛盾しない。

### README、AGENTS.md、CLAUDE.md更新方針

- READMEは利用者向けに、対応範囲、DSL→validate→Runtime→SB3の基本手順、非完全互換、実エディタ確認状況を記載する。
- AGENTS.mdは作業者向けに、Phase 7の対象範囲、fixture追加規則、実エディタ確認をコードテストと混同しない規則を記載する。
- CLAUDE.mdはAI作業向けに、DSL authoring guideへの導線、SB3/project.json直接編集禁止、unknown opcode生成禁止、診断順序を記載する。
- 3文書のPhase表記、テストコマンド、対象外事項を同期する。
- 今回は方針だけを定義し、既存3ファイルは変更しない。

## Phase 8: 既存SB3 importとround-trip

Phase 8ではZIP、project.json、asset、block graphをDSLへ変換するimport境界を実装する。Phase 7中は[SB3_IMPORT_DESIGN_DRAFT.md](./SB3_IMPORT_DESIGN_DRAFT.md)の設計だけを維持し、実装しない。

### 重点

- primitive inputとshadowの可逆復元。
- mutation、comments、monitors、metaの保持。
- unknown opcode、field、extensionのopaque保持。
- import失敗時に既存Projectを部分更新しない。
- `SB3 → DSL → SB3` corpusによる情報損失検出。

### 着手ゲート

- opaque保持のDSL表現を決定済み。
- import診断とstrict/compatibility modeを決定済み。
- corpusのライセンスと保管方針を決定済み。
- round-trip比較の正規化ルールを決定済み。

## Phase 9: 選択的な互換性強化

候補は次のとおり。

- pitch、pan。
- alpha collision。
- color touching。
- SB3 import対応範囲の拡大。
- unknown block preservationの強化。
- round-trip corpusの拡充。
- TurboWarp互換確認。
- Scratch公式との差分テスト。

Phase 9は一括実装せず、効果と影響範囲を評価して個別タスク化する。[OPTIONAL_FEATURES_DESIGN_DRAFT.md](./OPTIONAL_FEATURES_DESIGN_DRAFT.md)を判断材料とする。

## P4または対象外

- Scratch公式GUI完全再現。
- block editor、paint editor、sound editor。
- Scratchサイト共有、アカウント、オンライン保存。
- cloud variable runtime。
- loudness、microphone。
- 全extensionの実行互換。

cloud指定や未知extension情報をデータとして保持することと、それらをRuntimeで実行することは分離する。

## 依存関係

```text
Phase 6 export基盤
  → Phase 7 安全な生成運用・fixture・実環境確認
  → Phase 8 lossless志向のimport/round-trip
  → Phase 9 実測に基づく互換性強化
```

後続Phaseは、前段で見つかった差分を根拠に進める。推測だけでRuntimeやSB3表現を拡張しない。

## 今回の成果物と非成果物

今回作成するのは設計書のみである。fixture、template、README更新、実エディタ確認、Phase 8/9コードは別指示後に行う。
