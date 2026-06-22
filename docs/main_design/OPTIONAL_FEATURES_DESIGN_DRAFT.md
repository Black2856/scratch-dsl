# Optional機能設計ドラフト

## Phase 7.2への昇格

本書でPhase 9候補としていたpitch/pan、alpha collision、color touchingは、
`manual-verification`のunsupported解消要件によりPhase 7.2へ昇格した。
実装設計の正本は[`../phase7.2/README.md`](../phase7.2/README.md)以下とする。

本書はPhase 7.2完了後の精度・性能改善と、Phase 8/9候補の履歴資料として維持する。

## 評価基準

各候補を、必要性、難度、影響範囲、互換性上の効果、テスト可能性で評価する。
Phase 7.2へ昇格した項目以外はPhase 9候補であり、現時点では実装しない。

## 比較表

| 項目 | 必要性 | 難度 | Runtime | Renderer | SB3 export/import | 優先度 |
|---|---|---:|---|---|---|---|
| pitch / pan | 音作品で有用 | 中 | effect state、再生中更新 | なし | sound effect block保持 | P2 |
| alpha collision | touching精度向上 | 高 | sensing primitive | alpha mask、transform | block保持中心 | P2 |
| color touching | Scratch作品で使用 | 非常に高 | sensing primitive | pixel readback、色比較 | block保持中心 | P3 |
| cloud指定保持 | import/export保全 | 低〜中 | cloud通信は不要 | なし | variable tuple/DSL | P2 |
| pen以外のextension保持 | round-trip保全 | 中 | 実行は別課題 | extension依存 | opaque保持が重要 | P2 |
| TurboWarp互換確認 | 実用性確認 | 中 | 差分調査 | 差分調査 | load/resave確認 | P2 |
| Scratchとの差分テスト | 品質改善 | 高 | oracle比較 | image/audio比較 | corpus比較 | P2〜P3 |

## pitch / pan

必要性は比較的高く、simple soundの次の自然な拡張である。Runtimeにはtarget単位effect state、再生中SoundPlayerへの反映、clone時の状態方針が必要になる。Rendererへの影響はない。SB3では対応blockと値の保持、import時のopcode/mutation確認が必要。

Phase 7.2 Wave Dで実装する。Phase 9では聴感差、performance、追加audio edge caseを扱う。

## alpha collision

bounding boxよりScratchに近いtouching判定を可能にする。Rendererまたは専用collision portに、transform後のalpha mask、候補絞込、pixel queryが必要になる。Runtimeのsensing primitiveとheadless test用fakeも必要。

Phase 7.2 Wave Cで実装する。Phase 9では大規模作品でのperformanceと精度改善を扱う。

## color touching

Stage合成結果とSprite色の比較が必要で、alpha collisionより影響が広い。描画順、pen layer、effects、色空間、pixel readback performanceを扱う。headless Runtimeだけでは検証できず、browser golden testが必要になる。

Phase 7.2 Wave Dで実装する。Phase 9ではGPU化やreadback削減などの最適化を扱う。

## cloud variable指定保持

cloud runtime、認証、server同期は実装しない。ただしDSLとSB3で`isCloud`指定を保持することはround-trip上有用である。

現行DSL型・validatorがcloudをどこまで受理するかを実装前に再確認する必要がある。保持のみと実行を明確に分離し、Runtimeでは通常variableとして扱うか、診断するかを決める。

## pen以外のextension保持

未知extension IDとblock/mutationをimport/exportで保持する必要がある。実行互換は要求しない。影響は主にPhase 8のopaque model、serializer merge、diagnosticであり、Runtimeはunsupportedとして扱う。

新規AI作品では未知extensionを生成しない。既存作品の情報保全としてimport設計後に扱う。

## TurboWarp互換確認

代表fixtureをTurboWarpでload、run、resaveし、Scratch公式との差を記録する。TurboWarp固有機能を正本へ取り込むことは目的ではない。

外部editorのversion変動と手動確認コストがあるため、まず[SB3_REAL_EDITOR_VERIFICATION_SPEC.md](./SB3_REAL_EDITOR_VERIFICATION_SPEC.md)の共通記録形式を確立する。

## Scratchとの差分テスト

同一作品をHTMLJS RuntimeとScratch系VMで実行し、variable/list、target state、描画、audioイベントを比較する構想である。公式側の決定性、clock、random、renderer/audio環境を制御できる範囲は未確認。

導入する場合は、まず純粋なCast、block state、serializer形状から始め、pixel/audioの完全一致を要求しない。

## 実装する場合の共通原則

- 1機能を1スコープとして追加する。
- opcode metadata、validator、Runtime、serializer/import、テストへの影響を同時に列挙する。
- DSLを唯一の正本とし、Runtime stateからSB3を生成しない。
- 公式またはTurboWarpとの差を実測してから仕様化する。
- optional機能のためにPhase 7/8の情報保全を後退させない。

## 残る延期理由

Phase 7.2対象外のoptional機能は、まずPhase 7.2と実エディタ確認で得た差分を測る。
未計測の機能を先行実装してRuntime・Renderer・SB3 importの複数境界を同時に
不安定化させない。
