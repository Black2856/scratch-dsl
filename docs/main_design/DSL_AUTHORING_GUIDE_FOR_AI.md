# AI向けDSL作成ガイド

## 基本原則

AIはScratch作品の正本としてDSLを編集する。生成後のproject.jsonやSB3 ZIPを直接編集してはならない。DSLをvalidatorへ通し、その同じDSLをRuntimeとserializerへ渡す。

## Projectの基本形

トップレベルは次を持つ。

```text
schemaVersion, project, stage, sprites, assets, monitors, extensions, meta
```

- `schemaVersion`は現在`1.0.0`。
- Stageは1つで`isStage: true`。
- Spriteは`sprites`に置き、`isStage: false`。
- broadcast宣言はStageが所有する。
- `blocks`はID辞書、`scripts`はtop-level block ID配列。

新規fixtureは可能な限り`createMinimalProject()`を基点にし、必要な項目だけを変更する。

## StageとSprite

共通項目はID、name、variable、list、broadcast、block、script、comment、costume、sound、volume、layerOrderである。

Stage固有項目はtempo、videoTransparency、videoState、textToSpeechLanguage。Sprite固有項目はvisible、x、y、size、direction、draggable、rotationStyleである。Stage名はDSL上に存在するが、SB3出力では公式形式に合わせて`Stage`へ正規化される。

## ID

- project内で一意にする。
- block、target、variable、list、broadcast、comment、asset参照間の衝突を避ける。
- 意味の分かる固定IDをfixtureで使ってよいが、保存のたびに再生成しない。
- clone個体のRuntime IDをDSLへ保存しない。

## costume、sound、asset

costume/sound参照は`assetId`、`dataFormat`、`md5ext`を持ち、project-level `assets`の宣言と一致させる。

```text
assetId = MD5(bytes)
md5ext = assetId + "." + dataFormat
```

costumeにはbitmapResolutionとrotation center、soundにはformat、rate、sampleCountを指定する。実bytesはDSL本体へ埋め込まず、packagerへ`md5ext → Uint8Array`として渡す。

## variables、lists、broadcasts

- Stage variable/listはglobal、Sprite variable/listはlocal。
- field参照は`value`に表示名、`id`に宣言IDを設定する。
- list値はstring、number、booleanの配列。
- broadcastはStageで宣言し、menu shadowと受信hatで同じIDを使う。
- cloud指定はDSL/SB3上で保持する将来候補であり、cloud runtimeは対象外。

## blockの基本形

```text
id, opcode, next, parent, inputs, fields, shadow, topLevel
```

top-level blockだけがx/yを持つ。必要なblockだけmutationとcomment参照を持つ。

### nextとparent

command chain `A → B → C`では、`A.next=B`、`B.parent=A`、`B.next=C`、`C.parent=B`とする。末尾は`next:null`。top-levelの`parent`は`null`。

SUBSTACKの先頭やinput childの`parent`は、それを所有するblock IDである。見た目の直前blockではない場合があるためmetadataと既存fixtureを確認する。

### inputs

各inputは`block`と`shadow`を持つ。

- shadowのみ: `block`と`shadow`に同じshadow IDを設定する既存DSL表現を基本とする。
- 実blockのみ: `block=実block ID`, `shadow=null`。
- 実blockと隠れshadow: 両方のIDを保持する。
- SUBSTACK: command block先頭IDを`block`へ設定し、通常shadowは持たない。

input名はopcode metadataに存在する正確な名前を使う。

### fields

fieldは`value`と必要時の`id`を持つ。variable/list/broadcastなど参照型fieldではIDを省略しない。field名を推測せずmetadataを確認する。

### shadow

literal入力は`math_number`、`text`、`colour_picker`など対応するshadow blockで表現する。shadowは`shadow:true`、`topLevel:false`で、親inputの所有blockを`parent`にする。

## top-level script

- hatまたはprocedure definitionをtop-levelとする。
- `parent:null`、`topLevel:true`、x/yを設定する。
- IDをtargetの`scripts`へ一度だけ登録する。
- script途中のblockを`scripts`へ追加しない。

## procedure mutation

prototypeでは少なくとも次を整合させる。

- `proccode`
- `argumentids`
- `argumentnames`
- `argumentdefaults`
- `warp`

definitionの`custom_block` inputはprototypeを参照する。callは同じproccodeとargument ID列を持ち、各argument IDをinput keyとして使う。argument reporterの表示名もargument nameと一致させる。

## clone

- `control_create_clone_of`のmenu shadowを正しく接続する。
- `control_start_as_clone`はtop-level hat。
- clone内で不要になった個体は`control_delete_this_clone`で削除する。
- cloneはSB3へ個体保存されないため、生成前のoriginal Spriteに必要な定義を置く。

## pen

- project `extensions`へ`pen`を含める。serializerは使用opcodeからも収集するが、明示宣言を維持する。
- pen操作はSpriteを基本対象とする。
- pen down、移動、pen upの状態遷移をscriptで明確にする。
- 初期化時に必要なら`pen_clear`を実行する。

## unknown opcode

import互換性ではunknown opcode保持が必要になるが、AIによる新規作品生成ではunknown opcodeを使用しない。要求に必要なopcodeが未登録・未実装なら、既知blockで代替するか、機能追加が必要として停止する。

## 必須検証

生成後は必ず`validateProject()`を通す。型が`DslProject`であることだけでは検証済みとはみなさない。validator errorを修正した後、Runtime test、必要なE2E、SB3 export testを順に実行する。

## 完成前チェック

- DSL以外を正本として編集していない。
- IDを再採番していない。
- block graphとscopeがvalid。
- procedure、shadow、asset参照が整合。
- Runtimeの期待結果を記述できる。
- SB3内の全assetに実bytesがある。
- 未対応・未確認事項を明記した。
