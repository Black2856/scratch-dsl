# AIによるScratch作品生成ワークフロー

## 目的と範囲

AIがユーザー要求を検証可能なDSLへ変換し、HTMLJS Runtimeで確認してSB3を生成する標準手順を定義する。Phase 7.1ではローカル作品を`workspace/projects/<name>/`へ置くpreview/exportフローを提供するが、生成UIや新Runtime機能は実装しない。

## 標準フロー

```text
ユーザー要求
  → 作品仕様へ分解
  → 対応可能性と未対応機能を確認
  → Scratch互換DSLを作成・編集
  → validate
  → headless unit test
  → 必要時のみRenderer/Playwright確認
  → SB3 export
  → scratch-parser検証
  → Scratch公式エディタ/TurboWarpの手動確認候補へ渡す
```

各段階が失敗した場合は後段へ進まない。

## AIが編集してよい対象

- `workspace/projects/<name>/project.ts`の作品DSL。
- 同作品の`assets.json`とローカル`output/`。
- 承認された作品用DSL fixture。
- 作品専用のcostume/sound assetと参照情報。
- 作品の期待結果を記述するテストfixture。
- Phase 7で承認された生成作品・診断テンプレート。

## AIが直接触らない対象

- `.sb3` ZIP内部と生成済み`project.json`。
- Runtime内部のtarget、thread、clone、monitor状態。
- `scratch-editor/`、`scratch-audio/`の上流checkout。
- schema、validator、opcode metadata、Runtime機能。作品要求を満たすために変更が必要なら、作品生成を止めて機能追加タスクとして分離する。
- Scratch公式サイト、TurboWarpへのアップロード。現段階では手動手順の提示だけとする。

## 要求の分解

生成前に、要求を次へ分解する。

1. Stage、Sprite、costume、sound。
2. 操作方法と開始条件。
3. variable、list、broadcast。
4. scriptごとのhat、処理、終了条件。
5. clone、procedure、penの必要性。
6. 画面上またはheadlessで観測できる期待結果。
7. 対応外または未確認の要求。

対応opcodeがmetadataとRuntimeに存在するかを確認し、未知opcodeで要求を埋めない。

## DSL編集時の禁止事項

- dangling reference、循環、複数parentを作らない。
- IDを名前や配列indexから毎回作り直さない。
- Stage以外へbroadcast宣言を置かない。
- sprite local variable/listを別spriteから参照しない。
- shadow blockを実blockと同じ感覚でtop-levelへ置かない。
- procedure mutationとcall inputのargument IDを不一致にしない。
- assetId、md5ext、dataFormatとbytesを不整合にしない。
- validator warningを無条件で成功扱いしない。

## asset追加規則

Phase 7のfixtureとSB3出力テストでは、素材を
`workspace/test-project/`から選ぶ。外部素材を無断で追加しない。

1. bytesを先に確定する。
2. bytesのMD5をassetIdとする。
3. `md5ext`を`assetId.dataFormat`にする。
4. project assets、costume/sound参照、packager入力を同時に揃える。
5. 同一bytesは原則として重複登録しない。
6. ライセンス、出所、生成方法を作品メタデータまたは作業記録に残す。

workspace作品の`assets.json`は、`assetId`、`md5ext`、`dataFormat`、
`kind`、`mimeType`、`source`を持つ。`source`は作品ディレクトリからの
相対パスとし、previewとSB3 CLIが同じmanifestを読む。

## workspace作品の実行と出力

```powershell
npm run preview -- <project-name>
npm run sb3 -- <project-name>
```

previewは`project.ts`と`assets.json`を読み、validatorとMD5検査後に
既存Runtime/Renderer/Audioへ接続する。SB3 CLIも同じDSLとasset bytesを
serializerへ渡す。preview実行後のtarget、thread、clone状態をserializerへ
渡してはならない。

## block追加規則

- `opcodeMetadata.ts`で登録済みのinput/field名を使う。
- top-level blockを`target.scripts`へ登録する。
- command chainは`next`と次blockの`parent`を一致させる。
- reporter、boolean、shadowは所有inputの親blockを`parent`にする。
- literalは適切なshadow opcodeで表す。
- variable/list/broadcast fieldは表示名だけでなくIDを持たせる。

詳細は[DSL_AUTHORING_GUIDE_FOR_AI.md](./DSL_AUTHORING_GUIDE_FOR_AI.md)に従う。

## procedure、clone、pen

- procedureは重複処理の抽出またはwarpが必要な計算に限定する。明示的waitを含む処理を速度目的でwarp化しない。
- cloneは一時的な実行個体として使い、永続Spriteの代替にしない。生成数と削除経路を設計する。
- penは`extensions`へ`pen`を保持し、pen down後の移動、pen up、clearの順序を明示する。

## 検証レベル

| レベル | 目的 | 必須条件 |
|---|---|---|
| Validator | DSL破損防止 | 全作品で必須 |
| Headless | 状態遷移と主要ロジック | 実行blockを持つ作品で必須 |
| Renderer/E2E | Canvas、DOM input、audio gesture | 視覚・ブラウザ依存時のみ |
| SB3 export | serializer、asset、ZIP | 配布する作品で必須 |
| 実エディタ | 外部環境での実用確認 | 代表fixtureを対象に別途手動実施 |

## SB3出力前チェックリスト

- validator errorが0件。
- warningの内容をレビュー済み。
- 全IDが一意で安定。
- 全top-level scriptが`scripts`に登録済み。
- asset bytesとMD5が一致。
- headless期待値が通過。
- 必要なE2Eが通過。
- serializer入力がDSLでありRuntime snapshotではない。
- scratch-parser検証が通過。
- 未確認事項を成果物記録へ明記。

## 失敗診断フロー

1. validator失敗: 最初の構造errorから修正し、意味検証へ進む。
2. Runtime失敗: target、thread、block ID、opcode、frameを特定する。
3. 描画失敗: model state、RendererPortへのstate、Canvas出力を順に分離する。
4. asset失敗: 宣言、参照、bytes、MD5、decodeを順に確認する。
5. SB3失敗: serializer JSON、ZIP entry、scratch-parser結果を分離する。
6. 実エディタ失敗: [SB3_REAL_EDITOR_VERIFICATION_SPEC.md](./SB3_REAL_EDITOR_VERIFICATION_SPEC.md)の分類で記録し、推測でserializerを変更しない。

同じ失敗を再現する最小fixtureを作るまでは、広範な互換性変更へ進まない。

記録には`docs/templates/FAILURE_DIAGNOSIS_TEMPLATE.md`を使う。
