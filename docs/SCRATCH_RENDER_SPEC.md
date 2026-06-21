# 描画仕様

## 方針

公式 `scratch-render` はWebGL、Drawable、Skin、Silhouette、shader effectsを使う。本実装P0はCanvas 2Dで同等の外部契約を作り、将来WebGL backendへ交換可能にする。

## 座標

| 項目 | 値 |
|---|---|
| native Stage | 480×360 |
| Scratch原点 | 中央 `(0,0)` |
| 範囲 | x `-240..240`, y `-180..180` |
| Canvas変換 | `canvasX=x+240`, `canvasY=180-y` |
| 表示拡大 | CSSのみ。pointer座標はnativeへ逆変換 |

公式Drawableはpositionを整数へ丸める。互換モードでは同様に丸める。direction 90の内部回転は `(270 - direction)` 度である。

## 描画順

公式group順は background → video → pen → sprite（後ほど前面）。bubble/overlayはGUI層で合成する。`layerOrder`はsprite group内の安定順とする。

## Drawable

`id`, `targetId`, `skinId`, `position`, `direction`, `scale`, `visible`, `rotationStyle`, `effects`, `layerOrder`。direction 90を右向きとし、all-aroundではCanvas回転角へ変換する。left-rightは左右反転、don't-rotateは無回転。

## Skin

- BitmapSkin: decoded image、bitmapResolution、rotation center。
- SVGSkin: sanitized SVGをImageBitmap等へrasterizeしcache。
- PenSkin: Stage native sizeの独立offscreen canvas。
- assetのnatural sizeとrotation centerから描画原点を算出する。

## effects

P1: ghost、brightness。P2: color、fisheye、whirl、pixelate、mosaic。公式はshader/EffectTransformで実装するため、Canvas 2Dで一致しない効果は近似と明記する。

## hit test

- P0: transformed bounding box。
- P1: AABB候補絞込後、alpha maskによるsprite/sprite、mouse touching。
- P2: color touching/color touching color。
- invisible drawableはhit対象外。公式pickではghost 100%も対象外。

## render loop

runtime tick後にdirty drawableのみ状態同期し、requestAnimationFrameで描画する。runtime更新回数と表示fpsを分離可能にし、CSS resizeでnative canvasを変更しない。
