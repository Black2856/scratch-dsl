# 実装ロードマップ

## 初期スコープ

480×360 Stage、Sprite/Costume、x/y/direction/size/visible/layer、green flag、forever/wait/if、keyboard/mouse、broadcast、variable/list、clone、simple sound、simple pen、minimal project.json生成までを対象とする。

| Phase | 成果 | 完了条件 |
|---|---|---|
| 0 | 壊れない互換DSL基盤 | schema・ID・Cast・metadata・validatorの全test通過 |
| 1 | Project/Stage/Sprite/Target/BlockContainer/Stores | scope・保存test |
| 2 | Runtime/Scheduler/Thread/BlockRunner | headless block test |
| 3 | Canvas 2D、costume、layers、keyboard/mouse | 座標・pointer test |
| 4 | AssetManager、simple Web Audio | load/play/stop test |
| 5 | clone、procedure、pen、monitor最小 | lifecycle/warp test |
| 6 | project.json serializer、SB3 packager | 公式VM再読込test |
| 7 | minimal editor shell | DSL編集・実行・保存 |
| 8 | SB3 importと互換性拡張 | corpus round-trip |

## 推奨構成

```text
src/
  model/ runtime/ blocks/ events/ data/
  render/ audio/ assets/ io/
  sb3/ editor/ diagnostics/
schemas/
tests/{unit,integration,fixtures,compatibility}/
```

## 実装順

1. Phase 0: DSL schema、ID、Cast、opcode metadata、block graph validator。
2. Phase 1: Project/Stage/Sprite/Target、Variable/List、BlockContainer。
3. Phase 2: wait/repeat/forever/if、thread状態遷移、events。
4. Phase 3: coordinate transform、rotation center、layer、pointer逆変換。
5. Phase 4-5: asset/audio、clone/procedure/pen。
6. Phase 6: DSL→project.json、ZIP、公式VM再読込。

## Phase 0 実装契約

Phase 0では「実行できるScratch風システム」ではなく、「壊れた参照や曖昧な型を後段へ渡さない互換DSL」を完成させる。

### 作成対象

| パス | 責務 |
|---|---|
| `schemas/project.schema.json` | DSLトップレベル、Project、Target、Asset、Block等の構造検証 |
| `src/blocks/opcodeMetadata.ts` | opcodeごとのshape、inputs、fields、shadow、target制約、優先度 |
| `src/model/id.ts` | ID生成、形式検証、project内一意性検査 |
| `src/cast/Cast.ts` | Scratch互換のnumber/string/boolean/compare/list index変換 |
| `src/validation/blockGraphValidator.ts` | block graphと参照整合性検査 |
| `src/validation/projectValidator.ts` | schema検証と意味検証の統合入口 |
| `tests/fixtures/` | 最小正常DSL、異常DSL、公式project.json由来fixture |
| `tests/validation/` | schema、ID、Cast、metadata、graph validatorのテスト |

### 必須仕様

- `schemaVersion`を必須とし、未知versionを黙って受理しない。
- migrationは `fromVersion → toVersion` の純粋変換として別管理する。Phase 0では枠組みと同一versionのno-opのみでよい。
- target、block、variable、list、broadcast、comment、asset IDの重複を検出する。
- `next`, `parent`, `inputs.block`, `inputs.shadow`, top-level script参照の存在を検証する。
- `next` chainの循環、parent循環、到達不能block、複数parentを検出する。
- Stageは1個、`isStage=true`、target順の先頭であることを検証する。
- variable/list/broadcast fieldのIDとscopeを検証する。
- procedureの`proccode`, argument IDs/names/defaults、call inputの対応を検証する。
- shadow inputと実blockの組合せがopcode metadataに適合することを検証する。
- asset参照の`assetId`, `md5ext`, `dataFormat`整合性を検証する。
- unknown opcodeはエラーで破棄せず、opaque metadataとして保持できる診断モードを設ける。

### Phase 0で実装しないもの

- Runtime、Scheduler、Thread、BlockRunner
- Canvas/WebGL描画、collision
- Web Audio、sound decode/playback
- Editor UI、Blockly接続
- SB3 ZIP生成とasset packaging
- clone、procedure、penの実行
- monitor表示、extension実行

### 完了条件

1. 正常な最小DSLがvalidationを通過する。
2. dangling reference、ID重複、scope違反、block循環を個別testで拒否する。
3. Castの境界値を公式VM由来fixtureと比較する。
4. core P0 opcode metadataにinput/field/shadow/shapeの欠落がない。
5. validatorがpath、entity ID、opcodeを含む機械可読diagnosticを返す。
6. Phase 0 packageはDOM、Canvas、Web Audio、ZIPライブラリへ依存しない。

## 後回し

- P2: SB3 import、ask UI、monitor詳細、alpha collision、pitch/pan。
- P3: color touching、loudness、全effects、paint/sound editor、主要拡張。
- P4: cloud、account、online share、公式GUI完全再現、翻訳UI、全extension互換。

## 実装開始前の追加確認

- core block metadataを機械可読なopcode/input/field/shadow表として実装入力へ固定。
- procedure mutation、monitor、assetを含む公式SB3 fixtureの採取。
- READMEに「v14.1.0を参照した段階的互換subset」であることを明記。

## リスク

| リスク | 対策 |
|---|---|
| JavaScript暗黙変換との差 | Cast層と公式fixture比較 |
| thread飢餓 | 75% budget、loop yield、warp上限 |
| 生成SB3の潜在破損 | 公式VMで再読込・実行 |
| SVG/rotation center差 | 元bytes保持、golden image |
| Editor/Runtimeの二重正本 | DSL command経由に限定 |
| 未知block消失 | opaque field/mutation保持 |
