# Workspace Project Flow

## 目的

Scratch作品固有のDSL、素材参照、生成SB3をローカル`workspace/`へ集約し、
共通実行・表示・変換機構を本体側へ維持する。

## ディレクトリ

```text
workspace/
  <name>/              作品（workspace/直下に1作品1ディレクトリで並ぶ）
    project.ts
    assets.json
    assets/            この作品のcostume/sound素材
      sprite/ sound_effect/ music/
    output/
preview/
  turbowarp/player.html   実Scratch VM + scratch-render を読むプレイヤー
tools/
  workspaceProject.ts
  turbowarpPreview.ts     .sb3 を実Scratch VMで実行するpreviewサーバ
  turbowarpShot.ts        Playwrightでscreenshot + 状態JSONを返す
  exportSb3.ts
  newProject.ts
```

作品は`workspace/`直下に並べ、素材は各作品の`assets/`に同梱する。共有素材
プールは持たない。`workspace/`はGit追跡対象外である。再利用可能なfixtureは
`tests/fixtures/`へ置く。

## 新規作品のscaffold

```powershell
npm run new -- <name>
```

`workspace/<name>/`に最小の有効なDSL（`project.ts`：緑の旗→10歩動く）、
空の`assets.json`、空の`assets/`、`output/`を生成する。既存ディレクトリが
ある名前は上書きせず中止する。名前は英数字始まりで英数字・ハイフン・
アンダースコアのみ許可する。

## project.ts

default exportまたは`project` named exportで`DslProject`を返す。
このDSLがpreviewとSB3 exportの唯一の正本である。

## assets.json

```json
{
  "assets": [
    {
      "assetId": "<MD5>",
      "md5ext": "<MD5>.<format>",
      "dataFormat": "png",
      "kind": "costume",
      "mimeType": "image/png",
      "source": "workspace/<name>/assets/path/to/file.png"
    }
  ]
}
```

`source`はリポジトリルート基準のパスで、`meta.source`・DSLの`assets[].source`と
同じ基準で揃える。loaderはこれをリポジトリルートから解決し、DSL validation、
manifest shape、参照整合、実bytesのMD5を検査する。errorが1件でもあれば
Runtime起動とSB3生成へ進まない。

## Manual preview

```powershell
npm run preview -- <name>
```

preview serverは作品の `.sb3` をオンデマンドで生成し、実Scratch VM
（`@scratch/scratch-vm` + `scratch-render`）を読むプレイヤーページとともに配信する。
browserは `vm.loadProject(.sb3)` して実行し、視覚・音声・collisionはすべて実VMが担う。
緑の旗・stop・キーボード/マウス入力もVMへ渡す。`window.vm` で状態を参照できる。

`npm run shot -- <name>` はPlaywrightで同じページを駆動し、stageのscreenshotと
VM状態（変数・座標）のJSONを返す。AIによる描画確認はこれを使う。

表示diagnosticはproject、target、thread、block、opcode、asset、pathを
可能な範囲で保持する。

座標クランプ（fencing）やcollision等のScratch挙動の最終的な正本は実VMであり、
headless Runtimeは決定的ロジックの検証に用いる。挙動はSCRATCH_RUNTIME_SPECに従う。

## SB3 export

```powershell
npm run sb3 -- <name>
```

CLIは検証済みDSLとasset bytesを`packageSb3()`へ渡し、
`workspace/<name>/output/<name>.sb3`へ保存する。保存後に
`scratch-parser`へ通す。

Runtime内部状態、生成済み`project.json`、SB3 ZIP内部は入力・編集対象にしない。

## 対象外

- 新Runtime primitive。
- SB3 import。
- Scratch公式GUI、block editor、paint editor、sound editor。
- Scratch/TurboWarpサイト操作の自動化。
