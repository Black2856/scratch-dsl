# Scratch 公式ソース調査マップ

## 調査基準

- 正本: `scratchfoundation/scratch-editor` tag `v14.1.0`
- commit: `7c172e469eb3c21c1e6326ea6cccea60bc14e3a8`
- ローカル調査元: `scratch-editor/`
- 先に確認した文書: ルート `AGENTS.md`, `README.md`
- 本文の「確認済み」は上記タグのソースで確認した事項を指す。
- `scratch-paint`, `scratch-storage`, `scratch-blocks` はこのタグのモノレポに含まれない。`packages/scratch-gui/package.json` / `packages/scratch-vm/package.json` が固定する公開パッケージを補助正本とする。

| 対象 | v14.1.0での所在・版 | 主な調査ファイル |
|---|---|---|
| VM | `packages/scratch-vm` 14.1.0 | `src/engine/{runtime,target,blocks,thread,sequencer,execute,variable}.js`, `src/sprites/{sprite,rendered-target}.js` |
| Core blocks | VM内 | `src/blocks/scratch3_{motion,looks,sound,event,control,sensing,operators,data,procedures}.js` |
| Built-in extensions | VM内 | `src/extensions/`, `src/extension-support/extension-manager.js` |
| SB3 | VM内 | `src/serialization/{sb3,serialize-assets,deserialize-assets}.js`, `src/virtual-machine.js` |
| Input | VM内 | `src/io/{keyboard,mouse,clock,userData,video}.js` |
| Render | `packages/scratch-render` 14.1.0 | `src/{RenderWebGL,Drawable,Skin,BitmapSkin,SVGSkin,PenSkin,ShaderManager,EffectTransform}.js` |
| SVG | `packages/scratch-svg-renderer` 14.1.0 | `src/{svg-renderer,load-svg-string,sanitize-svg,fixup-svg-string,bitmap-adapter}.js` |
| GUI | `packages/scratch-gui` 14.1.0 | `src/containers/{stage,blocks,costume-tab,sound-tab,monitor-list}.jsx`, `src/lib/{make-toolbox-xml,project-fetcher-hoc,project-saver-hoc}.jsx` |
| Paint | npm `scratch-paint` 4.2.3 | 公式tagの外部依存。Paper.js座標とexport境界を確認 |
| Storage | npm `scratch-storage` 6.2.1 | 公式tagの外部依存。Asset/Helper/MD5生成を確認 |
| Blocks | npm `scratch-blocks` 2.1.19 | 公式tagの外部依存。block/procedure定義を確認 |
| Audio | `scratch-audio/` tag `v2.0.268`, commit `f81ee34ac23465bd63d88313c94e173af2a0cb99` | `src/{AudioEngine,SoundBank,SoundPlayer,Loudness}.js`, `src/effects/` |

## 読み取る構造

1. `Runtime` が targets、threads、sequencer、I/O、renderer、audio engine、monitor stateを統括する。
2. `Sprite` は共有定義、`RenderedTarget` はStage・オリジナル・cloneを含む実行個体である。
3. `Blocks` はIDをキーにしたブロックグラフを保持し、`Thread` と `Sequencer` が実行する。
4. core opcodeは `scratch3_*.js` の `getPrimitives()` が実装関数へ割り当てる。
5. SB3 serializerはoriginal targetsのみを対象にし、block inputを圧縮表現へ変換する。
6. RenderはWebGL実装である。本プロジェクトのCanvas 2D採用は互換インターフェースを模倣する独自判断であり、公式実装の複製ではない。
7. built-in extensionは起動時に全てロードされず、projectが使うextension IDに応じて`ExtensionManager`がロードする。

## 未確認事項

- Scratchサイト側のサーバー保存・共有API。
- pen以外の非core拡張の完全なopcode一覧。
