# Phase 7.2 Source Audit

## 調査ルール

- 実行意味論は公式Scratch v14.1.0を採用する。
- GUIのblock形状、menu、shadowは公式
  `scratch-editor/packages/scratch-gui/src/lib/`を採用する。
- Runtime primitiveは公式
  `scratch-editor/packages/scratch-vm/src/blocks/`を採用する。
- collision/effect/bubbleの描画意味論は公式
  `scratch-editor/packages/scratch-render/src/`を採用する。
- penは公式
  `scratch-editor/packages/scratch-vm/src/extensions/scratch3_pen/index.js`を採用する。
- TurboWarpとの差は、公式互換を壊さない範囲だけ参考にする。

## 公式ソース対応

| 領域 | 正本 |
|---|---|
| motion target/glide/bounce | `scratch3_motion.js:getTargetXY`, `pointTowards`, `glide`, `ifOnEdgeBounce` |
| backdrop/effects/reporters | `scratch3_looks.js:_setBackdrop`, `switchBackdropAndWait`, `changeEffect`, reporter群 |
| say/think bubble | `scratch3_looks.js:_getBubbleState`, `_renderBubble`, `_updateBubble` |
| click hat | `io/mouse.js:_pickTarget`, `_activateClickHats`, `postData` |
| backdrop/greater-than hats | `scratch3_event.js:getHats`, `hatGreaterThanPredicate` |
| edge-activated hats | `engine/runtime.js:_step`, `startHats` |
| wait/repeat-until/while | `scratch3_control.js:waitUntil`, `repeatUntil`, `repeatWhile` |
| operators | `scratch3_operators.js:mod`, `round`, `mathop` |
| sensing | `scratch3_sensing.js`のquestion、collision、timer、date、user処理 |
| object/color collision | `rendered-target.js:isTouching*`, `RenderWebGL.js:isTouchingColor/isTouchingDrawables` |
| sound effects | `scratch3_sound.js:_updateEffect`, `_syncEffectsForTarget` |
| pen color params | `scratch3_pen/index.js:_setOrChangeColorParam`, `_updatePenColor` |
| question UI | `scratch-gui/src/containers/stage.jsx`, `components/question/question.jsx` |
| GUI block shape | `scratch-gui/src/lib/make-toolbox-xml.js`, `blocks.js` |

## 重要な公式意味論

### Edge-activated hat

`event_whengreaterthan`は毎tick predicateを評価し、falseからtrueへ変化したedgeで
起動する。同じtop blockのthreadが既に動作中なら、hat metadataの
`restartExistingThreads: false`に従い重複起動しない。

### Click hat

- rendererのpick結果で最前面のtargetを選ぶ。
- 非draggable targetはmouse downで起動する。
- draggable targetはdragではなかったmouse upで起動する。
- targetがなければStageを選ぶ。
- v2対象はSprite clickだが、基盤は`event_whenstageclicked`にも対応可能にする。

### Glide

- 最初の実行で開始時刻、開始位置、終了位置、durationをstack frameへ保存する。
- durationが0以下なら即座に終了位置へ移動する。
- 途中は経過割合で線形補間しyieldする。
- target指定glideの終了位置は開始時に一度解決する。

### Backdrop

- Stage costumeを変更後、新しいbackdrop名に一致する
  `event_whenbackdropswitchesto`を開始する。
- `switch backdrop and wait`は開始したthreadがRuntimeから消えるまで待つ。
- 数値、名前、`next backdrop`、`previous backdrop`、`random backdrop`の
  解釈規則を公式に合わせる。

### Question queue

- 質問はFIFOで処理する。
- visibleなSpriteからの質問はSprite bubbleを使い、入力欄側のquestion文字列は空にする。
- Stageまたはhidden Spriteは入力欄側へquestionを表示する。
- stop allとtarget停止で待機中質問を解放・除去する。

### Collision

- touching Spriteは対象Spriteのoriginalとclonesを候補とする。
- dragging中のtargetは他targetからの候補から除外される。
- invisibleな候補Spriteとはtouchしない。
- touching colorは判定元Spriteがhiddenでも判定する。
- color touching colorのmask側ではghost effectを無視する。
- background、pen layer、描画順、graphic effectsをscene色へ反映する。

### Sound effect

- targetごとに`pitch=0`、`pan=0`を持つ。
- pitchは`-360..360`、panは`-100..100`へclampする。
- green flagとstop allでeffectを0へ戻す。
- cloneは生成時のeffect stateをコピーし、以後独立する。

### Pen color parameter

- `color`は0以上100未満へwrapする。
- saturation、brightness、transparencyは0..100へclampする。
- HSVからRGBを再計算し、alphaは`1 - transparency/100`とする。
- direct color指定はHSV stateを更新しtransparencyを0へ戻す。

## TurboWarp差分と判断

| 領域 | TurboWarp差分 | Phase 7.2判断 |
|---|---|---|
| motion | compiler helper、可変stage size | 公式480×360を採用 |
| looks | compiler向けhelper、listener実装差 | 公式意味論を採用 |
| sensing online | browser外で`true` fallback | 注入portで明示し、隠れた環境判定を避ける |
| sound pitch | limits無効時にpitch範囲を拡大可能 | 公式`-360..360`を採用 |
| sound scheduling | compiler向けredraw/yield調整 | interpreterの公式意味論を採用 |
| collision | performance改善やcompiler連携 | 結果互換だけを参照 |

TurboWarp由来の実装を採用する場合も、公式fixtureまたは公式コードで同じ結果になる
ことを先に確認する。

