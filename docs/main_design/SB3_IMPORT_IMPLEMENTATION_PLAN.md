# SB3 import 実装計画（Phase 8 着手準備）

設計根拠は [`SB3_IMPORT_DESIGN_DRAFT.md`](./SB3_IMPORT_DESIGN_DRAFT.md)。本書はそれを
**実装可能な手順・モジュール・着手ゲートの決定案**へ落としたもの。ブランチ
`feature/phase8-sb3-import` で進める。実装はまだ着手しておらず、本書は計画である。

import は「実行できること」より「入力情報を失わないこと」を優先する（draft §7）。
DSL は引き続き唯一の正本で、import は外部 SB3 → `DslProject` への一方向変換 +
opaque 保持。round-trip は「再 export で意味情報と未知情報が消えていないこと」を検証する。

## 1. 現状の到達点と最大の前提ギャップ

import は export（`src/sb3/`）の逆変換。export 実装は読めているので逆写像は定義済み:

| export の事実（根拠） | import 側でやる逆変換 |
|---|---|
| ZIP は **STORE 専用** reader/writer（`zip.ts:148` が method≠0 を reject） | **DEFLATE inflate が必須前提。** 実 Scratch GUI 保存 SB3 は deflate 圧縮。これが無いと一般 SB3 を展開できない |
| compact primitive 4..13（`blockSerializer.ts:24` `PRIMITIVE_OPCODES`） | 4..13 を DSL の shadow/reporter block へ展開、生成 ID は決定的・衝突回避 |
| input descriptor 1/2/3（shadow-only / block-only / block+obscured shadow） | descriptor を `{block, shadow}` へ復元 |
| field `[value]` / `[value, id]` | `DslField {value, id?}` へ復元 |
| mutation 正規化（array を JSON 文字列化、warp を文字列化、unknown key 保持） | JSON 文字列を array へ parse、raw object 全体も opaque 保持 |
| primitive 化された block は辞書から除去 | 展開で復元するため逆に再生成 |

> **結論:** Phase 8 の技術的クリティカルパスは ZIP inflate と「raw SB3 → DSL の可逆写像」。
> primitive/descriptor/mutation の写像は export 実装が仕様の正本になっている。

## 2. モジュール構成案

export の `src/sb3/` を鏡像にした `src/sb3/import/` を新設する（既存 export には触らない）:

```text
src/sb3/import/
  inflate.ts          # DEFLATE 展開（依存レス。RFC 1951。STORE はそのまま）
  unzipSafe.ts        # 安全な ZIP 検査・展開（entry数/サイズ上限、path traversal 拒否）
  rawTypes.ts         # SB3 専用 raw 型（DslProject へ即 cast しない）
  parseProject.ts     # raw project.json → 検証付き raw 構造 + 診断
  rawToDsl.ts         # known→DSL 変換 + unknown→opaque 保持
  primitiveExpand.ts  # compact primitive 4..13 → shadow/reporter block 復元
  inputRestore.ts     # descriptor 1/2/3 → {block, shadow}
  mutationParse.ts    # mutation 文字列 array → 値、raw 全体 opaque 保持
  importProject.ts    # 境界の入口（bytes → DslProject | 診断、一括 commit）
  diagnostics.ts      # import 診断コード（dotted lowercase）
```

`importProject(bytes, {mode}) → {project?, diagnostics, assets}`。途中失敗で既存
Project を部分更新しない（draft §import境界）。

## 3. 着手ゲートの決定案（roadmap の4ゲート）

### G1. opaque 保持の DSL 表現 — 決定案
`DslProject` の各階層（project / target / block / monitor / asset）に名前空間付き
オプショナル領域 `opaque?: {sb3?: {original?, unknownFields?, conversionHints?}}` を追加する。
- schema(`schemas/project.schema.json`) と手書き validator を**同時**に拡張（AGENTS 規約）。
- `opaque` は Runtime へ渡さない（実行意味へ混入させない）。serializer は再 export 時に
  元の場所へ merge。
- 影響範囲: snapshot / serializer / validator。export 側は opaque を「あれば出す」だけに留め、
  既存 DSL（opaque 無し）は完全後方互換。

### G2. import 診断と strict / compatibility mode — 決定案
- `strict`: 保持可能でも構造不整合は **error**（停止）。CI / 回帰用。
- `compatibility`（既定）: 保持可能な不整合は **warning** で継続、不能なものだけ error。
- 診断は machine-readable（`code, severity, path, entityId, opcode, message`、無い項目は null）。
  コードは dotted lowercase（例 `sb3.zip.method-unsupported`, `sb3.block.primitive-unknown`,
  `sb3.asset.md5-mismatch`, `sb3.mutation.malformed-json`）。
- error 時は `project` を返さず診断のみ。

### G3. corpus のライセンスと保管方針 — **要ユーザー確認**
外部素材・第三者 SB3 の無断追加は禁止（AGENTS 規約）。提案:
- 一次 corpus は**自前 export 出力**から作る（既存 `full-feature-minimal` 等を export → import →
  re-export の self round-trip）。ライセンス問題なし、`tests/fixtures/sb3-import/` に格納。
- 公式/第三者 SB3 を corpus に足すかはライセンス確認後に別途決定（本ゲートのブロッカー）。

### G4. round-trip 比較の正規化ルール — 決定案
- ZIP entry 順、JSON object key 順を正規化してから比較。
- 比較対象: target 順、block graph（next/parent/inputs/fields/shadow/topLevel/mutation）、
  ID 集合、asset bytes の MD5、opaque data の保持。
- byte 一致は**非必須**。「意味情報 + 未知情報の消失検出」を合否基準にする。
- 正規化器は import/export 双方が使えるよう `tests/fixtures/` 側のヘルパに置く。

## 4. round-trip テスト fixture（draft §round-trip）

W4 までに揃える（まず self round-trip、外部 corpus は G3 後）:
最小 SB3 / variable・list・broadcast・monitor / procedure mutation / shadow・obscured shadow /
costume・sound / pen・未知 extension / unknown opcode・field・mutation / malformed だが保持可能。

## 5. 実装 Wave 分割（各 Wave 完了ゲートで検証してから次へ）

| Wave | 内容 | 完了ゲート |
|---|---|---|
| W1 | `inflate.ts` + `unzipSafe.ts`（STORE/DEFLATE 展開、安全検査） | 実 GUI 保存 SB3 を展開できる unit test。path traversal/サイズ上限の拒否 test |
| W2 | `rawTypes.ts` + `parseProject.ts` + `diagnostics.ts`（raw parse と診断、まだ DSL 化しない） | 最小公式 SB3 を raw 構造へ。strict/compatibility 診断の分岐 test |
| W3 | `primitiveExpand` / `inputRestore` / `mutationParse` / `rawToDsl` + opaque schema(G1) | 自前 export → import で `DslProject` 復元、validateProject 通過。primitive/descriptor/mutation の往復 unit |
| W4 | `importProject` + 再 export merge + round-trip 正規化比較 + fixtures(§4) | self round-trip で意味情報・opaque の無損失。`npm test` 緑 |

## 6. 実装前に潰す未確認事項（draft §未確認事項）

- 一般 SB3 が使う ZIP compression method の範囲（→ W1 で DEFLATE 確定、他は診断で拒否）。
- scratch-vm が受理する legacy/不正形状の境界（→ W2 で compatibility mode の許容線を fixture 化）。
- TurboWarp 固有 project.json 情報の保存形状（→ opaque で保持、解釈しない）。
- extension URL / custom extension 情報の保存形状（→ opaque、prefix から断定しない）。
- target ID の安定復元規則（→ W3 で決定的 ID 生成、SB3 の map key は DSL ID として保持）。
- opaque schema の最適配置（→ G1 案を W3 で確定）。

## 7. スコープ外（このフェーズで作らない）
- Scratch GUI / paint / sound editor、アカウント・共有・cloud runtime。
- 未対応 opcode の**実行**（import/export は情報保存のみ。Runtime は実行しない）。
- byte-for-byte 完全一致の再 export。
- Phase 9 の精度・性能改善。

## 8. 検証コマンド（実装中）
```powershell
npm test                                   # import unit / round-trip（node:test）
node --experimental-strip-types --check src/sb3/import/importProject.ts
npm run sb3 -- full-feature-minimal        # export 側の非回帰（import は export を壊さない）
```

## 次の一手
W1（`inflate.ts` + `unzipSafe.ts`）から着手するのが妥当。ただし **G3（corpus のライセンス/
保管）はユーザー判断待ち**で、これが決まるまで外部 SB3 を test 依存に加えない。
