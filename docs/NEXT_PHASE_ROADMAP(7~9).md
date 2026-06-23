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

fixture素材は各作品の`assets/`（共有プールは持たない）から使用し、外部素材を
無断で追加しない。

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

### Phase 7.1: workspace作品実行・SB3出力

ローカル作品固有のDSL、asset manifest、素材、生成物を`workspace/<name>/`
（作品ごとに1ディレクトリ、`workspace/`直下）へ集約する。素材は各作品の
`assets/`に同梱し、共有プールは持たない。共通Runtime、Renderer、
AssetManager、SoundManager、serializer、preview、CLIは本体側へ置く。

```text
workspace/<name>/project.ts
  ├─ validate → 実Scratch VM + scratch-render（視覚・音声・collisionの確認）
  └─ validate → serializer/packager → output/<name>.sb3 → scratch-parser
```

標準操作:

```powershell
npm run new -- <name>
npm run preview -- <name>
npm run sb3 -- <name>
```

previewはEditor shellではない。`.sb3`をオンデマンド生成し、実Scratch VM +
scratch-renderを読むプレイヤーで実行する開発用ツールである（緑の旗、Stop、
キーボード/マウス入力をVMへ渡す）。自作Canvas rendererは持たず、視覚・音声・
collisionはすべて実VMが担う。SB3は常に`project.ts`のDSLから生成し、Runtime
snapshotや生成済み`project.json`を入力にしない。

### Phase 7.2: manual verification向けScratch互換ブロック拡張

`workspace/manual-verification`でunsupportedと判定された46項目を、公式Scratch
v14.1.0を正本、TurboWarpを次点の調査資料として段階的に実装する。

対象はoperators/controlの純粋処理から、motion/backdrop/event、bubble/question、
collision/effects、pen HSV、pitch/pan、loudnessまでを含む。browser依存機能はportへ
隔離し、DSL正本、headless Runtime、SB3 exportの既存境界を維持する。

設計正本は[`main_design/SCRATCH_COMPAT_OPCODE_DESIGN.md`](./main_design/SCRATCH_COMPAT_OPCODE_DESIGN.md)、
[`SCRATCH_COMPAT_FEATURE_MATRIX.md`](./main_design/SCRATCH_COMPAT_FEATURE_MATRIX.md)、
[`SCRATCH_COMPAT_SOURCE_AUDIT.md`](./main_design/SCRATCH_COMPAT_SOURCE_AUDIT.md)とする
（Phase 7.2はWave A〜Dとも実装済み。これらは実装済みopcodeの設計正本）。Phase 8 importには着手しない。

### README、AGENTS.md、CLAUDE.md更新方針

- READMEは利用者向けに、対応範囲、DSL→validate→Runtime→SB3の基本手順、非完全互換、実エディタ確認状況を記載する。
- AGENTS.mdは作業者向けに、Phase 7の対象範囲、fixture追加規則、実エディタ確認をコードテストと混同しない規則を記載する。
- CLAUDE.mdはAI作業向けに、DSL authoring guideへの導線、SB3/project.json直接編集禁止、unknown opcode生成禁止、診断順序を記載する。
- 3文書のPhase表記、テストコマンド、対象外事項を同期する。
- 今回は方針だけを定義し、既存3ファイルは変更しない。

## Phase 8: 既存SB3 importとround-trip

Phase 8ではZIP、project.json、asset、block graphをDSLへ変換するimport境界を実装する。Phase 7中は[SB3_IMPORT_DESIGN_DRAFT.md](./main_design/SB3_IMPORT_DESIGN_DRAFT.md)の設計だけを維持し、実装しない。

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

## Phase 9: Phase 7.2後の選択的な互換性強化

候補は次のとおり。

- Phase 7.2で残ったpitch/pan、collision、color touchingの精度・性能改善。
- SB3 import：実プロジェクト互換は達成済み。FNF（89.7MiB）が 0 検証エラーでロードし、
  import→export→re-import が成立（25,286 blocks 保存）。検証を Scratch の受理範囲に合わせた
  （id 文字種/スコープ、procedure 引数、comment、control_stop、standalone shadow）。Phase 9 に
  残るのは DSL 表現の限界：cloud 変数（`isCloud` 固定）、meta の再 export 保持、opcode metadata の
  網羅（`opcode.input-unknown` warning の解消）。内訳は
  [`SB3_IMPORT_IMPLEMENTATION_PLAN.md`](./main_design/SB3_IMPORT_IMPLEMENTATION_PLAN.md) §10。
- unknown block preservationの強化（target/project レベルの未知フィールド・meta の再 export 保持）。
- round-trip corpusの拡充。
- TurboWarp互換確認。
- Scratch公式との差分テスト。

Phase 9は一括実装せず、効果と影響範囲を評価して個別タスク化する。[OPTIONAL_FEATURES_DESIGN_DRAFT.md](./main_design/OPTIONAL_FEATURES_DESIGN_DRAFT.md)を判断材料とする。

## P4または対象外

- Scratch公式GUI完全再現。
- block editor、paint editor、sound editor。
- Scratchサイト共有、アカウント、オンライン保存。
- cloud variable runtime。
- 汎用microphone API。Phase 7.2ではScratch `loudness`用の限定portだけを扱う。
- 全extensionの実行互換。

cloud指定や未知extension情報をデータとして保持することと、それらをRuntimeで実行することは分離する。

## 依存関係

```text
Phase 6 export基盤
  → Phase 7 安全な生成運用・fixture・実環境確認
  → Phase 7.2 manual verification向け互換拡張
  → Phase 8 lossless志向のimport/round-trip
  → Phase 9 実測に基づく互換性強化
```

後続Phaseは、前段で見つかった差分を根拠に進める。推測だけでRuntimeやSB3表現を拡張しない。

## 現在の成果物境界

Phase 7 fixture、template、workspace preview/exportフローは実装済みである。
Phase 7.2（46項目のScratch互換ブロックとその依存）も実装済みで、視覚・音声・
collisionの確認は実Scratch VM（`npm run preview` / `npm run shot`）で行う。
Scratch/TurboWarpの確認は手動記録として扱う。
Phase 8 importとPhase 9互換性強化は未実装であり、別タスクまで着手しない。
