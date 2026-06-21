# SB3 / 中間DSL仕様

## container

`.sb3` はZIPで、rootに `project.json` と参照されるcostume/sound filesを置く。出力前に全`md5ext`がZIP entryとして存在することを検査する。

## project.json

```text
{
  targets: Target[],
  monitors: Monitor[],
  extensions: string[],
  meta: {semver: "3.0.0", vm: string, agent: string, ...}
}
```

公式v14.1.0 serializerはoriginal targetsのみを保存し、Stageを先頭に並べる。cloneは保存しない。

## target

共通: `isStage,name,variables,lists,broadcasts,blocks,comments,currentCostume,costumes,sounds,volume,layerOrder`。Stageはtempo/video設定等、Spriteはvisible/x/y/size/direction/draggable/rotationStyleを追加する。

変数は `id: [name,value]`、cloudは第3要素true。listは `id: [name,values]`、broadcastは `id: name`。

## block

通常blockは `opcode,next,parent,inputs,fields,shadow,topLevel` と、top-level時の`x,y`、必要時の`mutation`。`next:null`も省略しない。inputsは「shadowのみ」「blockのみ」「block+obscured shadow」を区別する1/2/3 descriptorで、literal/variable/list等はprimitive配列へ圧縮される。

compact primitive codeは4:number、5:positive number、6:whole number、7:integer、8:angle、9:colour、10:text、11:broadcast menu、12:variable、13:listである。

custom procedure mutationでは少なくとも `proccode`, `argumentids`, `argumentnames`, `argumentdefaults`, `warp` の文字列化表現を保持する。

## costume / sound

- costume: `name,assetId,dataFormat,md5ext,bitmapResolution,rotationCenterX,rotationCenterY`
- sound: `name,assetId,dataFormat,format,rate,sampleCount,md5ext`

## DSLからの変換

1. schema validateとID重複検査。
2. Stage/global参照とSprite/local参照を解決。
3. script AST/graphをSB3のID辞書、parent/next/inputへ正規化。
4. input shadowをblock metadataから生成。
5.使用opcodeからextensionsを収集。
6. assetsのID、拡張子、bytesを検査。
7. project.jsonをUTF-8で生成しZIP化。
8. VMで再読込できることをround-trip test。

Phase 0ではZIP生成を実装しないが、公式VMが生成した`project.json`をfixtureとして保持し、DSLのID、block graph、scope、primitive/shadow表現を検証する。fixtureをそのまま内部DSLと見なさず、明示的なimport boundaryを設ける。

## 注意点

- `assetId`, `md5ext`, `dataFormat`の不整合。
- block IDとvariable/list/broadcast IDの衝突・不安定な再採番。
- shadow block、mutation JSON文字列、topLevel座標の欠落。
- Stage/global variable参照をSprite localへ誤変換しない。
- unsupported extensionを黙って除去しない。
- JSON生成だけを「SB3対応完了」としない。asset同梱と再読込検証が必要。

## 読込

P2でZIP展開、project.json parse、primitive input展開、target生成、asset cache登録を行う。未知field/mutation/metaは可能な限り保持する。
