# Workspace Project Flow

## 目的

Scratch作品固有のDSL、素材参照、生成SB3をローカル`workspace/`へ集約し、
共通実行・表示・変換機構を本体側へ維持する。

## ディレクトリ

```text
workspace/
  projects/
    <name>/
      project.ts
      assets.json
      output/
preview/
  manual-preview.html
  manual-preview.ts
tools/
  workspaceProject.ts
  previewProject.ts
  exportSb3.ts
```

`workspace/`はGit追跡対象外である。再利用可能なfixtureは
`tests/fixtures/`へ置く。

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
      "source": "../../test-project/path/to/file.png"
    }
  ]
}
```

loaderはDSL validation、manifest shape、参照整合、実bytesのMD5を検査する。
errorが1件でもあればRuntime起動とSB3生成へ進まない。

## Manual preview

```powershell
npm run preview -- <name>
```

preview serverは作品をNode側で読み、DSL JSONと検証済みasset bytesだけを
browserへ配信する。browserは再度validatorを実行し、AssetManager、
CanvasRenderer、DomInputManager、SoundManager、Runtimeを接続する。

緑の旗クリック内でAudioContextをresumeし、sound decode完了後に
`Runtime.greenFlag()`を呼ぶ。`requestAnimationFrame`ごとに`tick()`を実行する。
StopはRuntime thread、clone、soundを停止する。

表示diagnosticはproject、target、thread、block、opcode、asset、pathを
可能な範囲で保持する。

## SB3 export

```powershell
npm run sb3 -- <name>
```

CLIは検証済みDSLとasset bytesを`packageSb3()`へ渡し、
`workspace/projects/<name>/output/<name>.sb3`へ保存する。保存後に
`scratch-parser`へ通す。

Runtime内部状態、生成済み`project.json`、SB3 ZIP内部は入力・編集対象にしない。

## 対象外

- 新Runtime/Renderer primitive。
- SB3 import。
- Scratch公式GUI、block editor、paint editor、sound editor。
- Scratch/TurboWarpサイト操作の自動化。
