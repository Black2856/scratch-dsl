# Phase 7.2 Verification Plan

## 検証層

| 層 | 目的 |
|---|---|
| metadata/validator | input、field、shadow、target、diagnostic |
| pure unit | Cast、math、timer、HSV、effect clamp、target resolver |
| Runtime | scheduling、yield、hat edge、clone、question queue |
| renderer E2E | pick、bounds、bubble、effects、collision |
| audio | node wiring、effect state、clone、reset |
| SB3 | project.json形状、extension、scratch-parser |
| real editor | Scratch/TurboWarpのユーザー可視挙動 |

## Official fixture strategy

公式sourceのunit testとfixtureから境界値を抽出し、本リポジトリの小さいfixtureへ
再構成する。公式fixtureファイルをそのままコピーせず、意味論と期待値を移植する。

重点:

- negative modulo。
- degree trigとtanの特異点。
- zero/negative glide duration。
- missing target。
- backdrop name/number/random。
- edge hat false→true→true→false→true。
- bubble generation race。
- question FIFOとstop cleanup。
- clone sound/effect independence。
- collision visibility/dragging/ghost rules。

## Test matrix

### Wave A

- FakeClockでtimer/reset/current。
- FakeWallClockでtimezoneとdays-since-2000。
- FakeUserEnvironmentでonline/username。
- reporter monitorの値。
- control loopの通常/warp。

### Wave B

- FakeInput pointer down/up/drag。
- FakeRenderer pick/bounds。
- click hat target限定起動。
- backdrop-and-waitの複数thread。
- glide中間値と最終値。
- edge bounce directionとfenced position。

### Wave C

- bubble format: number、小数、空文字、330文字上限。
- say/think timed clearと上書き保護。
- question FIFO、Sprite/Stage/hidden差。
- alpha touching、mouse point、edge、clone候補。
- effect clamp: ghost 0..100、brightness -100..100。

### Wave D

- pen color wrap、param clamp、RGBA。
- pitch -360..360、pan -100..100。
- active playback更新、clone copy、green flag reset。
- loudness one-read-per-tick cache。
- color collisionにbackdrop、pen、layer、effectを含める。

## SB3 verification

カテゴリごとに小さいfixtureを作り:

- block opcode。
- input/shadow ID。
- field値。
- parent/next/topLevel。
- pen extension。
- monitor opcode/params。

をassertする。最後に`manual-verification`全体をscratch-parserへ通す。

## 実エディタ確認

対象:

1. Scratch公式エディタ。
2. TurboWarp、既定設定。

記録:

```text
fixture:
source commit:
sb3 sha256:
official source revision: v14.1.0 / 7c172e...
TurboWarp reference revision: 43f13e...
browser / OS:
verification date:
load:
execution:
visual:
audio:
resave/reload:
differences:
evidence:
```

比較時はTurbo mode、interpolation、custom stage size、limits解除を有効にしない。

## 判定

| 判定 | 条件 |
|---|---|
| pass | 最終値、thread完了、ユーザー可視結果が公式と一致 |
| minor-diff | pixel/AA/audio聴感など最終意味論に影響しない差 |
| partial | port/device不足時fallbackは定義済みだが実機能力がない |
| fail | block欠落、停止、値不一致、再保存後欠落 |

`scratch-parser: pass`だけで実行互換をpassにしない。

## 差分処理

1. 本実装と公式が違う場合、公式sourceを再確認する。
2. ユーザー実機結果が公式sourceの想定と違う場合、TurboWarpを調査する。
3. 採用解決を`docs/TURBOWARP_DIFF_AUDIT.md`へ記録する。
4. manual verificationのexpected値を実装に合わせて変更せず、先に原因を確定する。

