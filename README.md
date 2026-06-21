# htmlJs2sb3

Scratch-compatible DSLを正本として、検証、HTML/JavaScript Runtimeでの実行確認、`.sb3`出力を行う段階的な互換基盤です。Scratch完全互換や公式GUIの再現は目的としていません。

## 現在の状態

Phase 0〜6が完了し、Phase 7としてAI生成用fixture、検証フロー、実エディタ手動確認準備を整備しています。Phase 7.1では、ローカル作品を`workspace/projects/`に置き、同じDSLをmanual previewとSB3 exportへ渡すフローを追加しています。

```text
DSL
  ├─ validate → Runtime → Node / Playwright確認
  └─ validate → project.json + assets → .sb3 → scratch-parser
```

`scratch-parser`通過はSB3形式の妥当性確認です。Scratch公式エディタやTurboWarpでの完全な動作保証ではありません。

## セットアップとテスト

Node.js 22以上を使用します。

```powershell
npm install
npm test
npm run test:e2e
```

PowerShellの実行ポリシーで`npm.ps1`が拒否される場合は`npm.cmd`、`npx.ps1`の場合は`npx.cmd`を使います。

## Workspace project

作品固有のDSL、asset manifest、生成SB3は次の構成で`workspace/`へ置きます。`workspace/`はローカル作品用でGit追跡対象外です。

```text
workspace/projects/<project-name>/
  project.ts
  assets.json
  output/
```

`project.ts`のdefault exportをDSL正本として、previewとSB3 exportの両方で使用します。`assets.json`の`source`は作品ディレクトリからの相対パスです。

手動preview:

```powershell
npm run preview -- full-feature-minimal
```

ブラウザに480×360 Canvas、緑の旗、Stop、thread/clone/asset/audio状態、diagnosticsが表示されます。緑の旗のクリック内でAudioContextを開始します。

SB3出力:

```powershell
npm run sb3 -- full-feature-minimal
```

出力先は`workspace/projects/full-feature-minimal/output/full-feature-minimal.sb3`です。DSL validation、asset MD5検査、packaging、`scratch-parser`検証のいずれかが失敗した場合は出力処理が失敗します。

## Phase 7 sample fixtures

`tests/fixtures/phase7SampleProjects.ts`に次のfixtureがあります。

- hello-world
- motion-basic
- variable-score
- broadcast-basic
- list-basic
- keyboard-control
- procedure-basic
- clone-basic
- pen-basic
- sound-basic
- full-feature-minimal

各fixtureはvalidator、Runtime境界、SB3 packaging、scratch-parserで確認します。Canvas、DOM input、penはPlaywrightでも確認します。

## Test assets

Phase 7 fixture用素材は`workspace/test-project/`を唯一の素材置き場として扱います。外部素材を追加せず、必要なassetはこの配下から選びます。

現在使用する素材:

- `workspace/test-project/sprite/font/determination/glyphs/c0041.png`
- `workspace/test-project/sound_effect/カーソル移動6.mp3`

assetIdは実bytesのMD5、`md5ext`は`assetId.dataFormat`として一致させます。

## Authoring rules

- DSLを編集し、生成済み`project.json`やSB3 ZIPを直接編集しない。
- Runtime状態からSB3を生成しない。
- IDを保存ごとに再採番しない。
- 新規作品では登録・実装済みopcodeだけを使う。
- asset追加時はbytes、MD5、assetId、md5extを同時に確認する。

詳細:

- `docs/main_design/AI_GENERATION_WORKFLOW_SPEC.md`
- `docs/main_design/DSL_AUTHORING_GUIDE_FOR_AI.md`
- `docs/main_design/SB3_REAL_EDITOR_VERIFICATION_SPEC.md`
- `docs/templates/`

## Scope

Phase 7では新Runtime/Renderer機能、SB3 import、editor shell、外部Scratch/TurboWarpサイト操作の自動化を行いません。Phase 8/9の対象は`docs/NEXT_PHASE_ROADMAP(7~9).md`を参照してください。
