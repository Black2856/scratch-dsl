# Editor基盤仕様

## 初期範囲

公式GUIの完全再現は行わない。P0はproject/target/asset選択、Stage preview、DSL load/save、green flag/stop、診断表示までとする。ビジュアルblocks workspace、paint、sound editorは後続。

## 公式GUIから採用する境界

| 領域 | 公式参照 | 本設計 |
|---|---|---|
| Stage | `containers/stage.jsx`, `components/stage` | Renderer canvasのhost |
| Code | `containers/blocks.jsx`, `lib/make-toolbox-xml.js` | 将来BlockEditorAdapter |
| Costume | `containers/costume-tab.jsx` | Asset/Costume commands |
| Sound | `containers/sound-tab.jsx` | Sound commands |
| Sprite pane | sprite selector/info components | target選択と属性編集 |
| Monitor | monitor reducers/containers | MonitorManagerのview |
| Load/save | project fetcher/saver HOC | ProjectLoader/Saver |
| Extension | extension library | ExtensionRegistry |

## 状態管理

EditorStateとRuntimeStateを分離する。編集はcommand (`addTarget`, `setField`, `connectBlock`, `replaceAsset`) としてDSLへ適用し、undo/redo可能にする。runtimeは実行用snapshotを再構築または差分同期する。

## 将来のBlockEditorAdapter

toolbox category、block XML/JSON、workspace event、mutation、variable/list IDをDSL block graphへ変換する。UI固有の座標やselectionをproject意味論へ混入させない。

## Project操作

- load: JSON/SB3識別 → parse → validate/migrate → asset decode → commit。
- save DSL: 正規化JSON。
- export SB3: serializer → asset検査 → ZIP。
- server saveを将来実装する場合、先にproject JSON snapshotを固定し、`clean=false` assetをuploadしてからprojectを保存する。
- autosave、オンライン共有、アカウント連携、翻訳UIはP4。
