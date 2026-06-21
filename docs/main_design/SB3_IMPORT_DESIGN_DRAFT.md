# SB3 import設計ドラフト

## 目的

既存SB3を読み込み、DSLとして編集し、情報を可能な限り失わず再保存する将来のPhase 8設計を定義する。本書はドラフトであり、importは未実装である。

## exportより危険な理由

exportは本プロジェクトが理解する検証済みDSLから既知形式を生成する。一方importは、未知opcode、extension、mutation、旧形式由来データ、壊れた参照、実装差を含む外部入力を受ける。黙った補正や破棄は、再保存時の作品破損につながる。

したがってimportでは「実行できること」より「入力情報を失わないこと」を優先する。

## import境界

```text
SB3 bytes
  → 安全なZIP検査・展開
  → raw project.json parse
  → SB3構造診断
  → known情報のDSL変換 + unknown情報のopaque保持
  → DSL validation
  → 一括commit
```

途中で失敗した場合、既存ProjectやRuntimeを部分更新しない。

## ZIP展開

- entry数、総展開サイズ、単一entryサイズに上限を設ける。
- path traversal、絶対path、重複entryを拒否する。
- `project.json`の存在とUTF-8 JSON parseを確認する。
- asset entryは必要になるまでdecodeせずbytesとして保持する。
- compression method対応範囲は実装前に決定する。現在の自作readerはSTORE専用であり、一般SB3 importへそのまま使える保証はない。

## project.json parse

raw JSONを直ちに`DslProject`へcastしない。SB3専用raw型とdiagnosticを用意し、target順、Stage数、ID辞書、参照、asset metadataを確認する。

strict modeでは破損をerror、compatibility modeでは保持可能な不整合をwarningとして扱う案を検討する。具体的な境界は未確認。

## targetとasset

- Stageとoriginal SpriteをDSL targetへ変換する。
- SB3 targetにDSL固有IDがない場合のtarget ID生成規則を安定化する。
- variables、lists、broadcastsのSB3 map keyをDSL IDとして保持する。
- costume/sound metadataとZIP bytesをasset registryへ登録する。
- assetIdとbytesのMD5不一致を診断し、元値と実測値を双方保持できる方針を検討する。

## blockとprimitive input

SB3 block辞書を一度raw graphとして保持し、input descriptor 1/2/3を解析する。compact primitive 4〜13は、DSLのshadow blockまたはreporter blockへ展開する。

生成する展開block IDは決定的で衝突しない規則を使う。再export時に元のcompact表現へ戻せるよう、primitive codeと元配列をopaque metadataへ保持する案を検討する。

## shadow復元

- shadow only、block only、block + obscured shadowを区別する。
- primitiveから生成したshadowのopcode、field、parentをmetadataに従って構築する。
- metadataにないshadowや未知primitive形式を推測で変換しない。
- 復元不能なinputはraw descriptorをopaque保持し、diagnosticを出す。

## mutation

mutationはknown procedure情報を解釈しつつ、raw object全体も保持する。`argumentids`等のJSON文字列が不正でも黙って空配列へしない。未知key、children、extension固有mutationを再保存可能にする。

## unknown opcodeとextension

- unknown opcode blockをblock graphから削除しない。
- next、parent、inputs、fields、shadow、topLevel、mutation、comment、未知keyを保持する。
- Runtimeは未対応opcodeを実行しないが、import/exportは情報を保存する。
- project `extensions`の未知IDを保持する。
- opcode prefixだけからextension IDを断定できないケースはraw declarationを優先する。

## monitor、comments、meta

- variable/list monitor IDを変数/list IDと関連付ける。
- extension monitorや未知monitorはraw paramsを保持する。
- commentsのblockId、位置、サイズ、minimized、textを保持する。
- project metaの既知fieldを読む一方、未知fieldも保存する。
- editor固有情報がDSLで表現できない場合はopaque領域へ置く。

## opaque保持モデル

候補は、project/target/block/monitor/asset各階層に名前空間付きraw dataを持たせる方式である。

```text
opaque.sb3 = {
  original: unknown,
  unknownFields: Record<string, unknown>,
  conversionHints: ...
}
```

ただしDSL schema変更が必要になるため、schema、validator、snapshot、serializerを同時に設計する。opaque dataをRuntimeへ渡して実行意味に混入させない。

## DSLへ変換できない情報

変換不能情報は、次の優先順位で扱う。

1. losslessなopaque保持。
2. raw block/target単位での保持。
3. 明示的diagnostic付きのimport中止。

黙った削除、既定値への置換、未知mutationの空object化は禁止する。

## 再保存

serializerはknown DSL情報を正規化しつつ、opaque情報を元の場所へmergeする。known fieldをユーザーが編集した場合の優先順位、削除操作、衝突時diagnosticを事前に定義する。

byte-for-byte一致は必須ではないが、意味情報と未知情報の消失を検出する。

## round-trip test

- 最小official SB3。
- variable/list/broadcast/monitor。
- procedure mutation。
- shadowとobscured shadow。
- costume/sound。
- penと未知extension。
- unknown opcode、unknown field、unknown mutation。
- malformedだが保持可能なfixture。

比較はZIP順やJSON key順を正規化し、target、block graph、ID、asset bytes、opaque dataの保持を検証する。公式・第三者corpusの利用条件は未確認であり、採用前に確認する。

## 未確認事項

- 一般SB3で必要なZIP compression method。
- scratch-vmが受理する不正・legacy形状の境界。
- TurboWarp固有project.json情報。
- extension URLやcustom extension情報の保存形状。
- target IDの安定した復元方法。
- opaque schemaの最適な配置。

これらを確認するまでPhase 8実装へ入らない。
