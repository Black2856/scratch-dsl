# htmlJs2sb3

Scratch互換のDSL（`project.ts`）を正本に、検証して `.sb3` を出力し、その `.sb3` を
**本物のScratch VM + renderer**（`@scratch/scratch-vm` + `scratch-render`）で実行・確認
するためのツールです。Scratch完全互換や公式GUIの再現は目的にしていません。

```text
DSL (project.ts)
  ├─ validate → project.json + assets → .sb3   （Scratchで開ける成果物）
  └─ validate → headless Runtime               （決定的ロジックの即時確認）
            .sb3 → 実Scratch VM + scratch-render（視覚・音・最終挙動の確認）
```

`scratch-parser` 通過はSB3形式の妥当性確認です。最終的な見た目・音・挙動の正本は
実Scratch VM（`npm run preview` / `npm run shot`）で確認します。

---

# 1. 作品をつくる（このツールで Scratch 作品を開発する人向け）

DSL（`project.ts`）を書き、`.sb3` を出力して、本物のScratchで実行確認する、という流れです。

> **vibe coding で作品をつくるときは [`VIBE_CODING_REFERENCE.md`](./VIBE_CODING_REFERENCE.md) を
> プロンプトとして AI に読み込ませる。** DSLの形、ブロック生成ビルダー、大きい作品の
> コード分割方針（`workspace/<name>/src/`）、opcode一覧、落とし穴を含む。

## クイックスタート

```powershell
npm run new -- my-project        # 雛形を workspace/my-project/ に作成
# workspace/my-project/project.ts を編集（素材は assets/ + assets.json）
npm run preview -- my-project    # 実Scratch VMで実行（初回は依存を自動install）
npm run sb3 -- my-project        # .sb3 を出力（scratch-parser検証つき）
```

`npm run preview` の1コマンドだけで、初回は必要な依存（`@scratch/scratch-vm` +
`scratch-render` ほか）が未取得なら自動で `npm install` し、`.sb3` を生成して、
ローカルで本物のScratch VM + rendererを起動しブラウザを開きます。

## ワークスペース構成

各作品は `workspace/` 直下に1作品1ディレクトリで並べます。素材は各作品の `assets/`
に同梱し、共有プールは持ちません。`workspace/` はローカル作業用でGit追跡対象外です。

```text
workspace/
  <project-name>/
    project.ts     DSL正本（default export、または named export "project"）。組み立て役のmain
    src/           大きい作品はスプライト/機能をここへ分割（project.ts肥大化の抑制）
    assets.json    asset manifest（assets配列）
    assets/        この作品の costume / sound 素材
      sprite/ sound_effect/ music/
    output/        npm run sb3 の出力先（自動生成）
```

- `<project-name>` は英数字始まり、英数字・ハイフン・アンダースコアのみ。
- `project.ts` のDSLが preview と SB3 export の唯一の正本です。
- `assets.json` と `project.ts` の `source` はリポジトリルート基準のパス（例:
  `workspace/<name>/assets/sprite/foo.png`）。`assetId` は実bytesのMD5、`md5ext` は
  `assetId.dataFormat` として一致させます。

読み込み時（`tools/workspaceProject.ts`）に次を検証し、errorが1件でもあれば
preview/SB3 とも処理を中止します: DSL validation、manifest形状と `assetId` 重複、
`md5ext` 一致、素材bytesのMD5一致、DSLとmanifestの参照整合。

## preview（実Scratch VMで実行）

```powershell
npm run preview -- <name>            # 初期化(依存install)→.sb3生成→実VM起動
npm run preview -- <name> --update   # 依存を再installして更新
```

`.sb3` をオンデマンドで生成し、`@scratch/scratch-vm` + `scratch-render` を読む
プレイヤーページで実行します。視覚・音声・collision・fencing・touching などはすべて
本物のVMが担います。緑の旗 / Stop / キーボード / マウス入力もVMへ渡ります。
依存はnpm経由なのでgit cloneは不要です。`Ctrl+C` でサーバ停止。

## shot（スクリーンショット + 状態の取得）

```powershell
npm run shot -- <name> [--keys 2,space] [--wait 3000]
```

Playwrightで同じプレイヤーを駆動し、stageのスクリーンショットを
`workspace/<name>/output/<name>-shot.png` に保存し、VMの状態（変数・スプライト座標）を
JSONで出力します。AIや自動確認で「描画結果」を取得する用途に使えます。

## .sb3 出力

```powershell
npm run sb3 -- <name>
```

検証済みDSLからSB3（`project.json` + assets のZIP）を生成し、`scratch-parser` で
形式検証してから `workspace/<name>/output/<name>.sb3` へ出力します。SB3はRuntimeの
可変状態からではなく、検証済みDSLからのみ生成します。生成された `project.json` や
ZIPは編集せず、変更はDSLを編集して再生成します。

## 新しい作品を追加する手順

1. `npm run new -- <name>` で雛形生成（手動なら同じ構成を用意）。
2. `project.ts` のDSLを編集する（登録・実装済みopcodeのみ使用）。
3. 素材を `assets/` へ置き、`assets.json` に `assetId`(=実bytesのMD5)・`md5ext`・
   `dataFormat`・`kind`・`mimeType`・`source` を記述する。
4. `npm run preview -- <name>` で実行確認する。
5. `npm run sb3 -- <name>` でSB3を出力し、`scratch-parser` 通過を確認する。

## 作品オーサリングのルール

- DSLを編集し、生成済み `project.json` や SB3 ZIP を直接編集しない。
- Runtime状態からSB3を生成しない。
- IDを保存ごとに再採番しない（プロジェクト全体で一意かつ安定）。
- 新規作品では登録・実装済みopcodeだけを使う。
- asset追加時は bytes・MD5・assetId・md5ext を同時に確認する。

詳細: `docs/main_design/{AI_GENERATION_WORKFLOW_SPEC, DSL_AUTHORING_GUIDE_FOR_AI,
WORKSPACE_PROJECT_FLOW, SB3_REAL_EDITOR_VERIFICATION_SPEC}.md`, `docs/templates/`。

---

# 2. リポジトリを開発する（このツール自体の開発者向け）

## アーキテクチャ

```text
DSL（唯一の正本）
  ├─ validate → Project / Runtime（headless・決定的ロジック）
  └─ validate → SB3 serializer → project.json + assets → .sb3
```

- **視覚・音声・collision の正本は実Scratch VM**（`@scratch/scratch-vm` +
  `scratch-render`）。本リポジトリに自作のCanvas rendererは持たない。`npm run preview`
  / `npm run shot` が `.sb3` を実VMで実行して確認する。
- **headless Runtime** は control / event / clone / 変数 / リスト / operator / procedure
  などの決定的ロジックを `node:test` で検証する高速な内ループ。`RendererPort` は
  テスト用 fake port のための seam として残す（本番では未接続=no-op）。
- 検証・model・Runtime は DOM / Web Audio / ZIP の具体実装に依存しない。

## リポジトリ構成

```text
src/
  validation/   validateProject（検証の入口）, blockGraphValidator
  blocks/       opcodeMetadata（opcode定義の正本）
  model/        Project / Stage / Sprite / Target / Clone / Stores
  runtime/      Runtime / Thread / Sequencer / 各Manager / primitives /
                RendererPort・coordinates・fencing・penColor（Runtime支援）
  cast/         Cast / MathUtil（Scratch互換の型変換・数値）
  audio/        SoundManager / WebAudioPort / AudioPort
  input/        InputPort
  sb3/          sb3Packager（.sb3生成）, serializer, extension/asset collector
  assets/       AssetManager / MD5 / validation
preview/turbowarp/  実Scratch VM + scratch-render を読むプレイヤーページ
tools/          turbowarpPreview.ts（previewサーバ）, turbowarpShot.ts（screenshot+状態）,
                exportSb3.ts, workspaceProject.ts, newProject.ts
schemas/        project.schema.json
tests/          ユニットテスト（node:test）, fixtures/, smoke/（実VM Playwright）
docs/           設計ドキュメント（main_design/ が中心）
workspace/      ローカル作品（Git追跡対象外）
scratch-*/      上流Scratch公式リポジトリの固定checkout（read-only / 意味論調査用）
```

## セットアップとテスト

Node.js 22以上（type stripping でTypeScriptを直接実行）。相対ESM importは `.ts` を付ける。

```powershell
npm install
npm test            # ユニットテスト（node:test, DOM非依存）
npm run test:smoke  # 実Scratch VMで .sb3 をload→状態確認（Playwright, ブラウザ要）
npm run sb3 -- full-feature-minimal
npm run preview -- full-feature-minimal
node --experimental-strip-types --check src/validation/projectValidator.ts
```

- 挙動の自動回帰は `node:test`（renderer非依存、fake portで fencing/touching 等も検証）。
- `npm run test:smoke` は本物のVMでプレビュー経路を確認するスモーク（`workspace/` に
  対象作品が必要。無ければスキップ）。
- 外部Scratch/TurboWarpサイトの自動操作は常用テスト依存にしない（プレビューはローカル実行）。
- PowerShellで `npm.ps1` / `npx.ps1` が拒否される場合は `npm.cmd` / `npx.cmd`。

## DSLを変更するとき

- `schemas/project.schema.json` と手書きvalidatorの両方を更新する。
- focused fixtureとテストを追加する。
- input / field / shadow / shape / target のルールは `src/blocks/opcodeMetadata.ts`
  または検証済み上流ソースから取得し、推測しない。

## スコープ

- Phase 0〜7.2 まで実装済み（検証・model・Runtime・asset/audio・clone/procedure/pen/
  monitor・DSL→SB3、Phase 7.2 の互換opcode拡張）。
- Phase 8（既存SB3 import）以降は未実装。
- 詳細は `AGENTS.md` と `docs/NEXT_PHASE_ROADMAP(7~9).md`。
