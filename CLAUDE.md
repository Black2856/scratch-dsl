# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクトの目的

HTML/CSS/JavaScript 上に「疑似 Scratch 3.0 基盤」(Runtime / Editor shell / Asset 管理 / `.sb3` 生成) を、Scratch の完全コピーではなく構造的に近い形で段階的に構築する。仕様の出所は `req.txt`(製品要件)と `docs/IMPLEMENTATION_ROADMAP.md`(Phase 0〜8 のロードマップ)。

**Phase 0〜3 が完了済み(次は Phase 4)。** Phase 0=検証専用 DSL 基盤(`src/validation`・`src/blocks`・`src/cast`・`src/model/id.ts`)、Phase 1=ドメインモデル層(`src/model/`)、Phase 2=headless 実行エンジン(`src/runtime/`)、Phase 3=Canvas 2D 描画と DOM 入力(`src/render/`・`src/input/`)。`docs/IMPLEMENTATION_ROADMAP.md` に従い、**依頼されない限り後続 Phase を先取り実装しない**(1リクエスト=1 Phase が運用ルール)。各 Phase の詳細仕様は `docs/SCRATCH_*_SPEC.md`。

## ビルド・テスト・開発コマンド

ソース本体にビルド工程は無く、Node.js 22+ が type stripping で TypeScript を直接実行する(検証時の実機: v22.17.0)。Phase 3 で `package.json` を導入(`devDependencies` は Playwright/esbuild のみ。`node_modules` は gitignore 済み、`npm install` が必要)。

```powershell
# unit テスト一式 (node:test、DOM 非依存。validation/model/runtime/render/input)
npm test

# 単一テストファイル
node --no-warnings --experimental-strip-types --test tests/validation/cast.test.ts

# 1 ファイルの構文チェック
node --experimental-strip-types --check src/validation/projectValidator.ts

# ブラウザ統合テスト (Playwright + esbuild。Canvas/DOM が要るものだけ)
npx playwright test
```

unit テスト(`npm test`)は type stripping で直接実行され、ビルド不要。**Playwright テストだけ**は esbuild が `tests/e2e/entry.ts` をブラウザ用 IIFE にバンドルし(`tests/e2e/serve.mjs` が webServer 兼バンドラ)、Chromium で実行する。ブラウザ実行が要らない純粋ロジック(座標変換・key 正規化等)は必ず node:test 側に切り出すこと。

ES モジュール内の相対 import は **明示的に `.ts` 拡張子を付ける**(type stripping の制約。例: `import {isValidId} from '../model/id.ts';`)。

DSL 構造を変えるときは **`schemas/project.schema.json` と手書き validator の両方** を更新する(両者は二重管理。後述「スキーマと検証の関係」)。fixtures も併せて更新する。**検証層・Project model・Runtime は DOM/Canvas/Web Audio/ZIP に依存させない。** 描画は `RendererPort`、入力は `InputPort` という型のみの interface 越しに `CanvasRenderer`/`DomInputManager`(`src/render/`・`src/input/`)を接続する。Runtime はこれらの port interface のみを import し、具体実装は import しない(port 境界の維持は Phase 3 の完了条件)。

## アーキテクチャ

### 上流リファレンス(読み取り専用)

`scratch-editor/`(tag `v14.1.0`)と `scratch-audio/`(tag `v2.0.268`)は公式リポジトリを固定 checkout したもの。**それぞれ独立した入れ子 git リポジトリ**で、調査用の read-only ソースとして扱う(タスクが明示的に対象としない限り変更しない)。正本は `scratch-editor` モノレポの `packages/scratch-vm`。公式ソースのどこに何があるかは `docs/SCRATCH_SOURCE_MAP.md` が対応表として一次情報。

### Phase 0 の検証パイプライン

中心は「検証専用」のデータ層。実行エンジンは持たない。`src/validation/projectValidator.ts` の `validateProject(value)` が唯一の入口で、順序が重要:

1. `validateShape` — トップレベル構造と `schemaVersion`(現在 `1.0.0` のみ受理、未知 version は拒否)。
2. `validateTargetShape` — stage / 各 sprite と blocks 辞書の型・必須キー。
3. **構造エラーが 1 件でもあれば意味検証へ進まず early return**(後段が型を前提にするため)。
4. `validateSemantics` — ID 重複/形式、asset 参照整合、scope、block graph、comment。

協調するモジュール:

- `src/blocks/opcodeMetadata.ts` — opcode ごとの `shape`/`target`/`inputs`/`fields`/`shadow`/`priority`(P0〜P4)。`getOpcodeMetadata(opcode)` が正本のメタデータ表。新 opcode 対応はここから。
- `src/model/id.ts` — Scratch 互換 ID 文字集合 (`isValidId`)、生成 (`generateId`)、project 内重複検出 (`findDuplicateIds`)。
- `src/cast/Cast.ts` — Scratch 互換の number/boolean/string/compare/list-index 変換。JS の暗黙変換との差異を吸収する層なので、挙動は公式 VM 由来 fixture と一致させる(推測で変えない)。
- `src/validation/blockGraphValidator.ts` — block graph と参照整合。dangling 参照・循環・複数 parent・到達不能・parent 不整合・top-level/`scripts` 整合・opcode メタデータ適合(input の shape、shadow opcode、必須 field)・procedure mutation(`procedures_prototype`/`procedures_call` の argumentids 対応)・変数/リスト/broadcast の scope を検査。

### 設計上の不変条件

- **未知 opcode はエラーで破棄せず warning として opaque 保持**(`opcode.unknown`)。後続 Phase での round-trip 保全のため。
- broadcast 宣言は stage が所有する(sprite 側にあると `scope.broadcast-declaration`)。
- 全 diagnostic は機械可読: `code`/`severity`/`path`/`entityId`/`opcode`/`message`。**`entityId` と `opcode` は不明でも省略せず `null` を入れる。**

### スキーマと検証の関係(同期が必要)

- `schemas/project.schema.json` は **実行時検証に使われていない**。`projectValidator.ts` は schema を import せず、構造検証を TypeScript で手書きしている(Phase 0 の外部ライブラリ依存禁止のため)。schema は規範ドキュメント兼 SB3 import 境界の位置づけで、`tests/validation/schema.test.ts` も schema が valid JSON で version/required を固定していることだけを確認する。
- したがって **DSL 構造を変えたら schema と手書き validator(`validateShape`/`validateTargetShape`)を手動で同期させる**。片方だけ直すと齟齬が残る。
- `src/blocks/opcodeMetadata.ts` は現状ほぼ **P0 opcode のみ**。clone(`control_create_clone_of` 等)・procedure(`procedures_*`)・pen(`pen_*`)・大半の sensing は `docs/SCRATCH_BLOCK_SPEC.md` に P1 以降として設計済みだが metadata 未登録で、現時点ではこれらを含む block は `opcode.unknown` warning になる(設計どおり)。Phase 1 以降で追加する。

## コーディング規約

TypeScript / ESM / 4-space インデント / セミコロン / シングルクォート。`camelCase`(関数・変数)、`PascalCase`(クラス・interface)、`UPPER_SNAKE_CASE`(不変レジストリ・定数)。diagnostic コードは dotted lowercase(例 `block.reference-dangling`)。純粋関数と明示的な export interface を優先。

## テスト方針

`node:test` + `node:assert/strict`。検証ルールごとに焦点を絞ったテストを追加する。fixture は `tests/fixtures/minimalProject.ts` の `createMinimalProject()` を基点にし、**検証対象のプロパティだけを変異させる**(異常系は `tests/fixtures/invalidProjects.ts`)。最低限カバーすべき拒否: dangling 参照・ID 重複・scope 違反・graph 循環・schema 不正・未対応 version。

## Git

History は Conventional Commits(`feat:`, `refactor:` 等)。コミットは scope を絞り命令形で。

注意: 旧実装(Scratch 音ゲー: `engine/`・`web/`・`tools/` など)は `main` 上で削除途中の状態にあり、`rhythm-game` ブランチに保存されている。現行の DSL 基盤(`src/`・`schemas/`・`tests/`・`docs/`)とは別系統。

## 補足

`AGENTS.md` にもコントリビューションガイドがある(本ファイルと内容が重複)。両者を更新する際は齟齬が出ないようにする。
