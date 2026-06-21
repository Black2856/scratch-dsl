# SB3実エディタ確認仕様

## 目的と保証範囲

生成SB3をScratch公式エディタとTurboWarpで開き、形式検証だけでは確認できない表示、実行、再保存を確認する。本書は手順定義であり、現時点ではサイトアクセス、アップロード、実確認を行っていない。

## 対象

1. Scratch公式エディタ。
2. TurboWarp editor。
3. scratch-vm `loadProject`相当は将来の自動化調査候補。

対象バージョン、URL、ブラウザ、OS、確認日は実施記録へ必ず残す。環境は更新され得るため、設計書へ固定値として断定しない。

## 前提

- 対象fixtureのvalidator、Runtime test、SB3 export test、scratch-parser検証が通過済み。
- SB3のhashまたはcommit IDを記録済み。
- 外部へ送信してよいassetだけを含む。
- Scratchアカウント、共有、公開は不要。

## 共通確認項目

- SB3をエラーなく開ける。
- Stageと全original Spriteが表示される。
- Sprite名、位置、向き、サイズ、表示、layerが大きく崩れない。
- costumeとsoundが欠落しない。
- block stack、shadow、procedure definition/callが消えない。
- variable、list、broadcast、monitorが保持される。
- green flagで代表動作が開始する。
- clone、procedure、pen、monitorがfixture期待どおり動く。
- editorからローカルへ再保存できる。
- 再保存SB3を再度開いて主要情報が失われない。

## Scratch公式エディタ手順

1. 新しいブラウザセッションを開く。
2. editorの「コンピューターから読み込む」相当の操作でSB3を選ぶ。
3. load error、警告、欠落targetを記録する。
4. code、costume、sound、variable/list monitorを目視する。
5. green flagとfixture固有操作を実行する。
6.期待結果と差分を記録する。
7. ローカルへ保存し直す。共有やアカウント連携は行わない。
8. 再保存物を新しいeditor sessionで開き直す。

UI文言は変更される可能性があるため、実施時に確認し、手順記録へスクリーンショットまたは実際の操作名を残す。

## TurboWarp手順

Scratch公式エディタと同じfixture、期待結果、記録項目を使う。TurboWarp固有設定は初期値を基本とし、turbo mode、補間、独自extensionなどを有効にした場合は別ケースとして記録する。

## scratch-vm loadProject相当

現時点では未実施であり、Phase 6完了条件には含めない。将来調査する場合は、公式VMの`loadProject`へ生成SB3を渡し、次を機械的に確認する候補とする。

- target数とStage。
- costume/sound asset decode。
- block、procedure、monitor復元。
- extension load。
- green flag後の基本状態。

導入にはVM依存の規模、DOM/renderer/audio stub、ライセンス、実行時間を評価する。

## 自動化可能な範囲

- SB3生成とhash記録。
- scratch-parser検証。
- ローカルharnessでのRuntime/Renderer E2E。
- 将来、安定したローカルeditor harnessが用意できた場合のfile inputと基本load確認。

外部サイトUIをPlaywrightで直接操作する自動化は、利用規約、認証、UI変動、network依存があるためPhase 7の必須条件にしない。

## 手動確認が必要な範囲

- Scratch公式エディタとTurboWarpでの実際のload。
- code workspace上のblock欠落・mutation表示。
- sound再生の聴感。
- pen、clone、layer、monitorの見た目。
- 再保存後の再load。

## 結果記録

```text
fixture:
source commit:
sb3 sha256:
environment:
editor:
verification date:
load: pass/fail
structure: pass/fail
execution: pass/fail
resave/reload: pass/fail
differences:
evidence:
```

記録ファイルの作成時は
`docs/templates/REAL_EDITOR_VERIFICATION_TEMPLATE.md`を複製して使う。

## 失敗分類

| 分類 | 例 | 最初に確認する層 |
|---|---|---|
| Package | ZIPを開けない、asset entry不足 | packager |
| Schema | project.json拒否 | serializer/schema |
| Deserialize | block/monitor欠落 | SB3表現、mutation、ID |
| Asset | costume/sound欠落 | MD5、format、decode |
| Runtime | green flag後の挙動差 | opcode意味論 |
| Render |位置、回転、pen差 | renderer/asset metadata |
| Resave | 再保存で情報消失 | editor差、import/round-trip設計 |

## 対象外

- Scratchサイトへの共有・公開。
- アカウント、cloud runtime、オンラインAPI。
- 外部editorの完全な自動操作。
- ScratchとTurboWarpの全設定・全extension組合せ。
