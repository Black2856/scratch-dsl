# TurboWarp 差分監査 (Scratch v14.1.0 を主正本とする)

## 目的とスコープ

本書は、取得した **TurboWarp/scratch-vm v2.1.46**(リポジトリ直下 `scratch-vm/`)を
**Scratch 公式 `@scratch/scratch-vm` v14.1.0**(`scratch-editor/packages/scratch-vm/`)
からの **差分** として監査したものである。

- **主正本は Scratch v14.1.0。** TurboWarp は派生実装としてのみ扱う。
- **次点正本としての TurboWarp**: ユーザーが実機検証し、本プロジェクトの挙動が Scratch 仕様と
  異なると確認できた場合に限り、TurboWarp `scratch-vm/` を **次点の正本** として参照しアルゴリズムを
  調査する。採用前に必ず公式 v14.1.0 と突き合わせ、結論と差分を本書へ追記する。
- 本書は調査記録であり、**実装変更・テスト変更は行わない**。
- 「本プロジェクト」とは、DSL → 検証 → (Runtime 実行 / SB3 シリアライズ) を行う本リポジトリの
  `src/` 実装を指す。Runtime は `RendererPort` / `InputPort` / `RuntimeAudioPort` に依存し、
  ステージは 480×360 固定、クローン上限 300、フェンシング常時 ON という Scratch 既定挙動に揃えている。

### 採用判断の凡例

| 値 | 意味 |
|----|------|
| `default` | Scratch v14.1.0 挙動として本プロジェクトに既に採用済み / 採用すべき既定 |
| `option` | 将来オプションとして検討余地あり(既定では無効) |
| `preserve-only` | 実行時には解釈しないが、SB3 import/export 時にデータとして保全すべき(Phase 8 範囲) |
| `unsupported` | TurboWarp 専用。本プロジェクトでは非対応とし、Scratch で開けないため採用しない |

### 確認した基本構図

| 比較対象 | パス | バージョン |
|----------|------|-----------|
| 主正本 (公式) | `scratch-editor/packages/scratch-vm/` | `@scratch/scratch-vm` 14.1.0 |
| 差分対象 (TW) | `scratch-vm/` | `scratch-vm` 2.1.46 (TurboWarp fork) |

TW 固有の追加: `src/compiler/`(JIT)全体、`src/engine/tw-frame-loop.js`、`tw-interpolate.js`、
`tw-font-manager.js`、`tw-monitor-state.js`、`tw-platform.js`、`@turbowarp/json`(拡張 JSON)、
`tw-compress-sb3.js`。

---

## 1. Target / RenderedTarget / setXY / fencing

| 項目 | Scratch v14.1.0挙動 | TurboWarp挙動 | 本プロジェクトへの影響 | 採用判断 | 参照ファイルと関数名 |
|------|--------------------|---------------|----------------------|----------|---------------------|
| `setXY` のフェンシング | 常に `renderer.getFencedPositionOfDrawable` を通してフェンスする | `runtimeOptions.fencing` が真のときのみフェンス。偽なら `[x, y]` をそのまま採用 | 本プロジェクトは常時フェンス(`fencePosition`)で公式と一致。トグルは持たない | `default` (公式挙動採用)<br>フェンス OFF は `option` | 公式 `sprites/rendered-target.js:265 setXY`<br>TW `scratch-vm/src/sprites/rendered-target.js:265 setXY`<br>本: `src/render/fencing.ts fencePosition` |
| 移動/可視通知の seam | `this.emit(EVENT_TARGET_MOVED)` / `emit(EVENT_TARGET_VISUAL_CHANGE)` | コールバック `onTargetMoved` と `emitVisualChange()` に置換(性能最適化) | 内部 seam の違いのみ。観測挙動は同一 | `default` | TW `rendered-target.js:284 onTargetMoved`, `emitVisualChange` |
| `keepInFence`(goto random / bounce 用の緩いフェンス) | フェンス境界に固定定数(ステージ半寸)を使用 | 同ロジックだが境界に `runtime.stageWidth/Height`(カスタムステージ対応)を使用 | カスタムステージ非対応なので 480×360 固定で等価 | `default` | 公式/TW `rendered-target.js:924 keepInFence`(TW は `runtime.stageWidth`) |
| `keepInFence` の戻り値 | 同一(`[newX+dx, newY+dy]`) | 同一 | 影響なし | `default` | 上記 |
| `goToBack` の追加引数 | `setDrawableOrder(..., SPRITE_LAYER)` | `setDrawableOrder(..., SPRITE_LAYER, false)`(TW renderer 拡張シグネチャ) | TW renderer 固有。本プロジェクト renderer には不要 | `default`(差分は内部) | TW `rendered-target.js:872 goToBack` |

備考: `setXY` が呼ぶ `getFencedPositionOfDrawable` は **renderer 側**のフェンス(描画境界)で、
両 VM 共通。`keepInFence` は **VM 側**の別ロジック(motion の random/bounce 用)で緩い。
本プロジェクトの `src/render/fencing.ts` は前者(renderer フェンス)を純関数で再現している。

---

## 2. motion block

| 項目 | Scratch v14.1.0挙動 | TurboWarp挙動 | 本プロジェクトへの影響 | 採用判断 | 参照ファイルと関数名 |
|------|--------------------|---------------|----------------------|----------|---------------------|
| ステージ寸法の参照 | `this.runtime.constructor.STAGE_WIDTH/HEIGHT`(480/360 定数) | `this.runtime.stageWidth/stageHeight`(可変インスタンス値) | カスタムステージ非対応なので結果は等価 | `default` | 公式 `blocks/scratch3_motion.js:85,194`<br>TW `scratch-vm/src/blocks/scratch3_motion.js:88,200` |
| `goto random position` | `Math.round(STAGE_WIDTH * (rand-0.5))` | 同式だが `runtime.stageWidth` 使用 | 等価 | `default` | 同上 `getRandomPosition` 系(`scratch3_motion.js:85-91`) |
| `if on edge, bounce` | `_ifOnEdgeBounce`、境界は STAGE 定数、`keepInFence` で最終固定 | 同ロジック、境界のみ `runtime.stageWidth/Height` | 等価。`_ifOnEdgeBounce` の数式は同一 | `default` | 公式 `scratch3_motion.js:186 ifOnEdgeBounce`<br>TW `scratch3_motion.js:189 _ifOnEdgeBounce:192` |
| `move steps` のフェンス | `setXY` 経由で常にフェンス | `setXY` 経由、`runtimeOptions.fencing` に従う | 本プロジェクトは常時フェンス + pen セグメントを引く(invariant) | `default` | TW/公式 `setXY`、本 `src/runtime/primitives.ts`(`motion_movesteps`) |
| `// used by compiler` 注釈 | なし | motion 各 API に付与(コンパイラ呼出し対象を示す) | 本プロジェクトはコンパイラ非搭載のため無関係 | `unsupported`(コンパイラ依存) | TW `scratch3_motion.js` 各メソッド |

結論: motion ブロックのアルゴリズムは **同一**。差分は「ステージ寸法定数 vs 可変値」「フェンストグル」
「コンパイラ注釈」のみで、いずれもステージ固定・フェンス常時 ON・コンパイラ無の本プロジェクトでは公式と等価。

---

## 3. runtime options

| 項目 | Scratch v14.1.0挙動 | TurboWarp挙動 | 本プロジェクトへの影響 | 採用判断 | 参照ファイルと関数名 |
|------|--------------------|---------------|----------------------|----------|---------------------|
| `runtimeOptions` の存在 | なし(オプション機構自体が無い) | `{maxClones, miscLimits, fencing}` を保持し動的変更可 | 本プロジェクトに対応概念なし。各値は固定(300 / 有効相当 / 常時) | `option`(将来) / 既定は `default` 固定値 | TW `engine/runtime.js:456-460`、`setRuntimeOptions:2681` |
| `maxClones` | 定数 300(`MAX_CLONES`) | `runtimeOptions.maxClones`(`Infinity` で無制限可) | 後述 §5 | `default`(300) | TW `runtime.js:457`、公式 `runtime.js:738 MAX_CLONES` |
| `miscLimits` | 概念なし(各種制限は常にハードコード) | 偽にすると pitch/pen サイズ/マウス精度等の制限を緩和 | 本プロジェクトは公式の固定制限に従う | `default`(制限有効) | TW `runtime.js:458`、各ブロック(§5/§6/§7) |
| `fencing` | 概念なし(常時 ON) | 偽でフェンス無効化、`renderer.offscreenTouching` を反転 | 常時 ON で一致 | `default`(ON) | TW `runtime.js:459`, `1946`, `2685` |
| `compilerOptions` | なし | `{enabled, warpTimer}` | コンパイラ非搭載のため無関係 | `unsupported` | TW `runtime.js:462-465`, `setCompilerOptions:2693` |
| `isPackaged`(packaged runtime) | なし | コスチューム/音声の原データを破棄して高速化するモード | 本プロジェクトはエクスポート前提のため不採用 | `unsupported` | TW `runtime.js:474-485` |
| `enforcePrivacy` / `externalCommunicationMethods` | なし | クラウド変数/カスタム拡張使用時にカメラ等を制限 | クラウド/カメラ非対応のため無関係 | `unsupported` | TW `runtime.js:492-512` |

---

## 4. scheduler / FPS / turbo / compiler 影響

| 項目 | Scratch v14.1.0挙動 | TurboWarp挙動 | 本プロジェクトへの影響 | 採用判断 | 参照ファイルと関数名 |
|------|--------------------|---------------|----------------------|----------|---------------------|
| ステップ間隔 / FPS | `THREAD_STEP_INTERVAL = 1000/60`、互換モードで `1000/30`。任意 FPS 不可 | `FrameLoop` が任意 framerate(0〜250、0=画面リフレッシュ rAF)対応 | 本プロジェクトは固定ステップ。任意 FPS の概念なし | `default`(30/60 のみ)<br>任意 FPS は `option` | 公式 `runtime.js:723 THREAD_STEP_INTERVAL`, `:2237 setCompatibilityMode`<br>TW `engine/tw-frame-loop.js`, `runtime.js:2656 setFramerate` |
| `setCompatibilityMode` | フラグを保持し間隔を切替 | 互換のため残存するが内部は `setFramerate(30/60)` に委譲 | 観測上は等価(30/60) | `default` | TW `runtime.js:2642 setCompatibilityMode` |
| WORK_TIME(1 step の処理時間) | `0.75 * currentStepTime` | 同一 | 等価 | `default` | 公式/TW `engine/sequencer.js:73` |
| WARP_TIME(warp 内ループ上限) | 既定 500ms | 同一(warpTimer は compilerOptions で挙動差) | 等価 | `default` | TW `sequencer.js:199-269 stepThread` |
| turbo mode | `turboMode` フラグ、画面更新間も yield せず連続実行 | 同一フラグ。`storeProjectOptions` で SB3 に保存される点が追加 | turbo フラグ自体は Scratch 互換。保存方式が TW 固有(§8) | `default`(フラグ)<br>保存は `preserve-only` | TW `runtime.js:332 turboMode`, `:2870`(load) |
| 補間 (interpolation) | なし | フレーム間でスプライト位置を補間描画 | 描画専用最適化。本プロジェクト未対応 | `unsupported` | TW `engine/tw-interpolate.js`, `runtime.js:2671 setInterpolation` |
| JIT コンパイラ | なし(全スレッド `execute.js` インタプリタ) | `thread.isCompiled` なら `compilerExecute(thread)` に分岐 | 本プロジェクトはインタプリタのみ。**意味論は一致させるべき正本は公式** | `unsupported` | TW `sequencer.js:4,180 stepThread`、`src/compiler/*`(jsexecute/irgen/jsgen 等) |

注意: コンパイラは本来「公式インタプリタと同じ結果」を狙うが、エッジケース(数値変換・yield 境界)で
微差が出ることがある。本プロジェクトの実行意味論は **公式インタプリタ(`execute.js`)を正** とする。

---

## 5. clone limit / misc limits

| 項目 | Scratch v14.1.0挙動 | TurboWarp挙動 | 本プロジェクトへの影響 | 採用判断 | 参照ファイルと関数名 |
|------|--------------------|---------------|----------------------|----------|---------------------|
| クローン上限 | `MAX_CLONES = 300` 定数、`clonesAvailable` が定数比較 | 既定 300 だが `runtimeOptions.maxClones` で変更可(`Infinity` で無制限) | 本プロジェクトは 300 固定で公式一致 | `default`(300) | 公式 `runtime.js:738 MAX_CLONES`, `:2519 clonesAvailable`<br>TW `runtime.js:951`(コメント: 初期値のみ), `:3229 clonesAvailable`<br>本: `src/runtime/CloneManager.ts:7 MAX_CLONES=300` |
| sound pitch/pan 範囲 | 常に `EFFECT_RANGE`(pitch ±360, pan ±100) | `miscLimits` 偽で `LARGER_EFFECT_RANGE`(pitch ±1000) | 本プロジェクトは公式の ±360/±100 を採用 | `default` | 公式 `blocks/scratch3_sound.js:88 EFFECT_RANGE`<br>TW `scratch3_sound.js:86 EFFECT_RANGE`, `:94 LARGER_EFFECT_RANGE`, `:289` |
| effect/volume 変更後の yield | 常に `Promise.resolve()`(次 tick まで yield) | `miscLimits` 偽なら yield せず `requestRedraw` のみ | 本プロジェクトは公式どおり yield | `default` | 公式 `scratch3_sound.js:285,332`<br>TW `scratch3_sound.js:296-303,349-353` |
| マウス座標精度 | 整数丸め(`Math.round`) | `miscLimits` 偽で小数 3 桁精度 | 整数丸めで一致 | `default` | TW `io/mouse.js:142 getScratchX`, `:153 getScratchY` |
| music ブロックの制限 | 常に制限あり | `miscLimits` で緩和分岐 | 公式制限に従う | `default` | TW `extensions/scratch3_music/index.js:930` |

---

## 6. renderer bounds / hit test / pen

注: レンダラ本体(`scratch-render`)は TW では `@turbowarp/scratch-render` 外部依存で **本リポジトリに同梱されていない**。
本プロジェクトは独自 `RendererPort` / `CanvasRenderer` を持つ。ここでは **VM↔renderer の seam** に限定して比較する。

| 項目 | Scratch v14.1.0挙動 | TurboWarp挙動 | 本プロジェクトへの影響 | 採用判断 | 参照ファイルと関数名 |
|------|--------------------|---------------|----------------------|----------|---------------------|
| 画面外 touching 判定 | renderer 既定(画面内のみ) | `offscreenTouching = !runtimeOptions.fencing`。フェンス OFF 時は画面外でも当たり判定 | フェンス常時 ON なので公式と等価 | `default` | TW `runtime.js:1946,2685`(seam) |
| pen サイズ clamp | 常に `PEN_SIZE_RANGE`(1〜1200)へ clamp | `miscLimits` 偽 **または** 高画質描画時は上限なし(`max(0, size)`) | 本プロジェクトは公式範囲で clamp | `default` | 公式 `extensions/scratch3_pen/index.js _clampPenSize`<br>TW `scratch3_pen/index.js:119 _clampPenSize` |
| 高画質描画 (`useHighQualityRender`) | なし | renderer に高解像度モード。SB3 設定 `hq` で復元 | renderer 拡張。本プロジェクト未対応 | `unsupported` | TW `runtime.js:2880-2882,2896`、`setUseHighQualityRender`(TW renderer) |
| getFencedPositionOfDrawable | renderer 共通(setXY 用) | 同一(VM 側は §1 のトグルで呼出制御) | 本プロジェクトは `fencing.ts` で再現済み | `default` | 本 `src/render/fencing.ts`、§1 参照 |
| bounds 計算(fast/tight) | renderer の getFastBounds/getBounds | TW renderer は同等 API(本書範囲外の最適化差あり) | 本プロジェクトは fast(矩形 AABB)を `computeLocalBounds` で再現 | `default` | 本 `src/render/fencing.ts computeLocalBounds` |

---

## 7. sound effect

| 項目 | Scratch v14.1.0挙動 | TurboWarp挙動 | 本プロジェクトへの影響 | 採用判断 | 参照ファイルと関数名 |
|------|--------------------|---------------|----------------------|----------|---------------------|
| pitch 範囲 | ±360(±3 オクターブ) | 既定 ±360、`miscLimits` 偽で ±1000 | 公式 ±360 を採用 | `default` | 公式/TW `scratch3_sound.js EFFECT_RANGE` / `LARGER_EFFECT_RANGE` |
| pan 範囲 | ±100 | 両モードとも ±100(差なし) | 等価 | `default` | TW `scratch3_sound.js:89,100` |
| volume clamp | 0〜100 | 同一 | 等価 | `default` | 公式 `:327` / TW `:345 _updateVolume` |
| 効果変更時の yield | 常に yield | `miscLimits` 依存(§5) | 公式どおり yield | `default` | §5 参照 |
| 効果同期 seam | `soundBank.setEffects` | 同一 | 等価 | `default` | TW `scratch3_sound.js:306 _syncEffectsForTarget` |

---

## 8. SB3 load/save / metadata / extensions

| 項目 | Scratch v14.1.0挙動 | TurboWarp挙動 | 本プロジェクトへの影響 | 採用判断 | 参照ファイルと関数名 |
|------|--------------------|---------------|----------------------|----------|---------------------|
| `meta.vm` | パッケージ実バージョン(例 `14.1.0`) | 固定 `0.2.0`(意図的に実バージョンを書かない) | 本プロジェクトの SB3 シリアライザは公式に倣う方針 | `default`(公式形式) | 公式 `serialization/sb3.js:659`<br>TW `scratch-vm/src/serialization/sb3.js:753` |
| `meta.agent` | `navigator.userAgent` | 常に空文字(プライバシー配慮) | UA を埋めない方針なら TW に近いが、Scratch 互換重視で公式準拠 | `default` | 公式 `sb3.js:665-666`<br>TW `sb3.js:759-761` |
| `meta.platform` | **なし** | `{name:'TurboWarp', url:'https://turbowarp.org/'}` を付与 | Scratch では未知フィールド。import 時は保全のみ | `preserve-only` | TW `sb3.js:763-764`、`engine/tw-platform.js` |
| `meta.origin` | あり(CSFirst 等の出自)を保存/復元 | 同一(あれば保存) | import/export で保全 | `default` / `preserve-only` | 公式・TW `sb3.js`(`meta.origin`)、TW load `:1537-1543` |
| platform 不一致検出 | なし | load 時に `PLATFORM_MISMATCH` を emit(別プラットフォーム製の警告) | 本プロジェクトは UI なし。無視で可 | `unsupported` | TW `sb3.js:1495 checkPlatformCompatibility`, `:1511` |
| `extensionURLs`(カスタム拡張 URL) | フィールド自体は存在(ID→URL マップ) | 同一機構だが TW は任意 URL からの拡張ロードを許容 | 未知拡張は **保全**し実行はしない | `preserve-only` | 公式/TW `sb3.js:301 getExtensionURLsToSave`, load `:1546` |
| プロジェクト設定の格納 | なし | ステージコメントに `// _twconfig_` マジック付き JSON で framerate/turbo/interpolation/runtimeOptions/hq/width/height を保存 | Scratch では単なるコメント。**コメントとして保全**し解釈しない | `preserve-only` | TW `runtime.js:58 COMMENT_CONFIG_MAGIC`, `:2835 findProjectOptionsComment`, `:2846 parseProjectOptions`, `:2922 storeProjectOptions`, `:2890 _generateAllProjectOptions` |
| 拡張 JSON 値 | 標準 JSON のみ(NaN/Infinity 不可) | `@turbowarp/json` で `Infinity`/`NaN` 等を JSON 化 | **Scratch では壊れる**。本プロジェクトは標準 JSON 厳守 | `unsupported` | TW `runtime.js:2`, `sb3.js`(ExtendedJSON 使用箇所) |
| `customFonts` | なし | カスタムフォントを SB3 に埋込/復元 | Scratch 非対応。保全のみ可 | `preserve-only` | TW `sb3.js:745-747 customFonts`, `engine/tw-font-manager.js` |
| SB3 圧縮 | 標準 | `tw-compress-sb3.js` で JSON を最適化圧縮 | 出力互換性に影響しうる最適化。本プロジェクトは標準出力 | `unsupported`(最適化) | TW `sb3.js:19`, `serialization/tw-compress-sb3.js` |

---

## 9. custom stage size

| 項目 | Scratch v14.1.0挙動 | TurboWarp挙動 | 本プロジェクトへの影響 | 採用判断 | 参照ファイルと関数名 |
|------|--------------------|---------------|----------------------|----------|---------------------|
| ステージ寸法 | 480×360 固定(`STAGE_WIDTH`/`STAGE_HEIGHT` 定数のみ) | `runtime.stageWidth/stageHeight` インスタンス値、`setStageSize(w,h)` で変更可 | 本プロジェクトは 480×360 固定(`coordinates.ts`)。可変化は大規模変更 | `default`(480×360 固定) | 公式 `runtime.js:418 STAGE_WIDTH`(=480)<br>TW `runtime.js:453-454, 2704 setStageSize`<br>本 `src/render/coordinates.ts:8-9` |
| ステージサイズ変更時のモニタ移動 | なし | 中心基準でモニタ位置を補正 | 可変化しないため無関係 | `unsupported` | TW `runtime.js:2710-2722 setStageSize` |
| renderer への伝播 | 固定 | `renderer.setStageSize(±w/2, ±h/2)` | 本プロジェクト renderer は固定境界 | `unsupported` | TW `runtime.js:2726-2733` |
| 寸法の SB3 保存 | なし | `_twconfig_` コメントに `width`/`height` を保存(§8) | コメントとして保全のみ | `preserve-only` | TW `runtime.js:2883-2887, 2897-2898` |
| ステージ寸法を参照するブロック | STAGE 定数 | `runtime.stageWidth` 経由(§2 の motion 等) | 480×360 で等価 | `default` | §2 参照 |

カスタムステージは **Scratch で開けない非標準機能**。480×360 を前提に多数のフェンス/座標/random 計算が組まれており、
本プロジェクトでは固定とする。保存された `width/height` は `_twconfig_` コメントとして破棄せず保全する(Phase 8)。

---

## 10. Scratch で開けない TurboWarp 専用要素(総覧)

下記はいずれも **`unsupported`(実行非対応)** が原則。SB3 に埋め込まれて届いた場合は
**破棄せず `preserve-only`** とする(AGENTS.md「未知ブロック/拡張/コメント/メタデータを保全」invariant に従う)。

| 項目 | Scratch v14.1.0挙動 | TurboWarp挙動 | 本プロジェクトへの影響 | 採用判断 | 参照ファイルと関数名 |
|------|--------------------|---------------|----------------------|----------|---------------------|
| JIT コンパイラ | なし | `src/compiler/` 一式(IR 生成・最適化・JS 生成・実行) | 実行意味論は公式インタプリタを正とする | `unsupported` | TW `src/compiler/{compile,irgen,iroptimizer,jsgen,jsexecute}.js` |
| 任意 framerate / 補間 | 30/60 のみ | 0〜250 FPS、フレーム補間 | 描画/速度仕様が非互換 | `unsupported`(任意FPSは将来 `option`) | TW `tw-frame-loop.js`, `tw-interpolate.js`, `runtime.js:2656,2671` |
| カスタムステージサイズ | 480×360 固定 | 任意 w×h | §9。座標系全体に波及 | `unsupported` / 設定は `preserve-only` | TW `runtime.js:2704 setStageSize` |
| 無制限クローン / 制限解除 | 300 / 固定制限 | `maxClones=Infinity`, `miscLimits=false` | §5。挙動が発散 | `unsupported` / 既定は `default` | TW `runtime.js:457-458` |
| `_twconfig_` 設定コメント | 通常コメント扱い | 起動時に解釈し runtime 設定へ反映 | コメントとして保全のみ | `preserve-only` | TW `runtime.js:58,2846,2922` |
| `meta.platform` / platform 不一致警告 | フィールド無し | TW 製マーカーと load 時警告 | メタデータとして保全のみ | `preserve-only` | TW `sb3.js:763,1495`, `tw-platform.js` |
| カスタム拡張(任意 URL ロード) | サンドボックス前提の限定対応 | 任意 URL から拡張 JS をロード可 | セキュリティ上ロードしない。URL は保全 | `preserve-only`(URL)/ `unsupported`(実行) | TW `sb3.js:301,1546`, `extension-support/`, `dispatch/` |
| 拡張 JSON(Infinity/NaN) | 不可 | `@turbowarp/json` で表現 | **Scratch で破損**。標準 JSON 厳守 | `unsupported` | TW `runtime.js:2`, `sb3.js` ExtendedJSON 箇所 |
| カスタムフォント埋込 | なし | `customFonts` + FontManager | 描画非互換。データ保全のみ | `preserve-only` | TW `sb3.js:745`, `tw-font-manager.js` |
| 高画質描画 (`hq`) | なし | renderer 高解像度 + `hq` 設定 | renderer 非対応 | `unsupported` | TW `runtime.js:2880,2896` |
| packaged runtime | なし | 原データ破棄の高速モード | エクスポート前提と矛盾 | `unsupported` | TW `runtime.js:474-485` |
| プライバシー強制 / 外部通信検出 | なし | クラウド/カメラ等の自動制限 | クラウド/カメラ非対応 | `unsupported` | TW `runtime.js:492-512` |
| addonBlocks | なし | TurboWarp Addons 用のブロック注入機構 | 非対応 | `unsupported` | TW `runtime.js:451 addonBlocks` |

---

## 11. broadcast / key ハットのクローン起動 (実機検証で確認・修正済み)

ユーザーが `manual-verification`(ultra-test)を Scratch と HTMLJS preview で
比較し、clone-procedure step3(`repeat 3 → create clone`)後の表示が
**Scratch=7 個 / HTMLJS=4 個** と食い違うことを実機確認した。

- **原因(本プロジェクトの差分):** `src/runtime/EventBus.ts startHats` が
  `[stage, ...project.sprites]` のみを走査し、**ライブクローンを除外**していた。
  そのため broadcast(`event_whenbroadcastreceived`)と
  `event_whenkeypressed` のハットがクローン上で起動せず、クローンが
  `when I receive refresh` を再実行しないぶん clone 生成がカスケードしなかった。
- **正本(Scratch v14.1.0):** `runtime.startHats` は `this.targets`
  (= stage + sprites + **clones**)全体を走査し、各ターゲットの該当ハット
  topBlock からスレッドを起動する。クローンは元スプライトの block graph を
  共有するため、broadcast / key ハットを各自実行する
  (`event_whenflagclicked` はクローン非対象。緑の旗は先にクローンを全削除する)。
  本リポジトリの `Clone.fromSource` も `source.blocks` を共有しており構造は同型。

| 項目 | Scratch v14.1.0挙動 | 本プロジェクト(修正前) | 採用判断 | 参照 |
|----|----|----|----|----|
| broadcast / key ハットのクローン起動 | clones を含む全 target で起動 | clones を除外していた | `default`(公式挙動を採用・**修正済み**) | 公式 `engine/runtime.js startHats`(targets 全走査)<br>本: `src/runtime/EventBus.ts startHats` |
| `event_whenflagclicked` のクローン起動 | 起動しない(緑の旗が clones を先に削除) | 同左 | `default` | 同上 |

- **採用した解決:** `startHats` の走査対象に `runtime.clones` を追加
  (`event_whenflagclicked` のみ除外)。回帰テスト
  `tests/runtime/operatorsSensingInput.test.ts`「broadcast and key hats fire on
  live clones」で original + clone の二重起動を固定。修正後は HTMLJS でも
  step3 後のクローンが 7 個となり Scratch と一致することをヘッドレス再現で確認した。

## 12. クローンのサウンド再生 (実機検証で確認・修正済み)

§11 の修正後、ユーザーが full-feature-smoke(key 9)を確認し、クローンが
存在しても**音が重ならない(音量が増えない)**ことを実機確認した。

- **原因(本プロジェクトの差分):** サウンドは `SoundManager` が **target id 毎の
  `SoundBank`** で管理し、`play(targetId)` は `banks.get(targetId)` が無いと
  `undefined` を返す。バンクは `loadProjectSounds` が元 target(stage + sprites)
  にのみ生成しており、**新しい id を持つクローンにはバンクが無い**ため発音
  されなかった(renderer skin / pen state にはクローン seam があるのに、音声には
  無かった)。
- **正本(Scratch v14.1.0):** クローンは元スプライトのサウンドを継承し、各
  ターゲットが独立に再生する。複数クローンが同じ音を同時再生すると重なって
  大きくなる(同一ターゲット上の同一音は再スタートで重ならない、という点も一致)。
- **採用した解決:** 音声にもクローン seam を追加。
  `RuntimeAudioPort.cloneTarget?(sourceId, cloneId)`(任意)を定義し、
  `SoundManager.cloneTarget` が元バンクの decoded バッファを共有する独立バンクを
  clone id 用に生成(`SoundBank.cloneInto`)。`CloneManager.createClone` で
  renderer/pen seam と並べて `runtime.audio?.cloneTarget?.(source.id, clone.id)`
  を呼ぶ。回帰テスト `tests/audio/audio.test.ts`「cloneTarget gives a clone its
  own bank ...」で、クローンが同一 decoded を共有しつつ元と同時再生(重なり)する
  ことを固定。修正後はクローン存在時の smoke で target 数ぶん `play` が走ることを
  ヘッドレス再現で確認した。

| 項目 | Scratch v14.1.0挙動 | 本プロジェクト(修正前) | 採用判断 | 参照 |
|----|----|----|----|----|
| クローンのサウンド再生 | 元スプライトの音を各クローンが独立再生(重なる) | クローンにバンクが無く発音不可 | `default`(公式挙動を採用・**修正済み**) | 公式 audio engine(target 毎 SoundBank)<br>本: `src/audio/SoundManager.ts cloneTarget`, `SoundBank.cloneInto`, `src/runtime/CloneManager.ts` |

## 13. fencing の y 軸エッジ選択バグ (実機検証で確認・修正済み)

§11/§12 後、ユーザーが mode 1(direction を 135 に変更)→ mode 6(pen, move)で
**斜め移動時の y クランプ範囲がおかしい**ことを実機確認した。

- **原因(本プロジェクトの差分):** `src/render/fencing.ts fencePosition` の y 軸
  条件で `top`/`bottom` が入れ替わっていた。x 軸は公式 scratch-render と一致
  (左へ行き過ぎ→`right`、右へ→`left`)していたが、y 軸は
  「下へ→`bottom` / 上へ→`top`」と実装され、正しくは
  「下へ→`top` / 上へ→`bottom`」。対称 AABB でも式が `sy - top` と `sy - bottom`
  で**スプライト高さぶん**ずれる(例: GLYPH で set y 300 が 109 になっていたが
  正しくは 221)。direction が常に 90 だった頃は y 移動が小さく顕在化しなかったが、
  §looks/motion 実装で実行時に direction が変わり回転 + y 移動で露見した。
- **正本(Scratch v14.1.0 / scratch-render `getFencedPositionOfDrawable`):**
  x と同型。`if (top + dy < -sy) dy = ceil(-sy - top)` /
  `else if (bottom + dy > sy) dy = floor(sy - bottom)`。検証済みの x 値
  「set x 300 → 261 = sx - left」と整合する y は「set y 300 → sy - bottom = 221」。
- **採用した解決:** y 条件を公式と同じ `top`/`bottom` に修正。
  `tests/render/fencing.test.ts` の y 期待値をバグ値 ±109 から正値 ±221 へ訂正し、
  非対称 AABB が正しいエッジでクランプする回帰ケースを追加。x の挙動・headless
  パススルー・`motion_movesteps` の fencing 連携は不変(全テスト通過)。

| 項目 | Scratch v14.1.0挙動 | 本プロジェクト(修正前) | 採用判断 | 参照 |
|----|----|----|----|----|
| fencing の y エッジ選択 | 下→`top` / 上→`bottom`(x と同型) | top/bottom が逆 | `default`(公式挙動を採用・**修正済み**) | 公式 `scratch-render getFencedPositionOfDrawable`<br>本: `src/render/fencing.ts fencePosition` |

## 14. pen の解像度・フィルタリング (実機検証で確認・DPR 対応で解決)

ユーザーが Scratch と比較し pen の見た目差を確認した。調査の結論:

- **正本(Scratch / scratch-render):** pen レイヤ(`PenSkin`)のテクスチャは
  `gl.NEAREST` サンプリングだが、サイズは native size(stage × devicePixelRatio)
  で確保される。つまり Scratch は **device 解像度**で pen を描くため、拡大表示でも
  鮮明かつ細かく、半透明エッジ(AA)も保たれる。スプライトは LINEAR 描画。
- **本プロジェクトの差分:** `CanvasRenderer` は固定 480×360 の 1 枚 canvas で、
  devicePixelRatio 非対応。HiDPI/ズーム時はブラウザが canvas を引き伸ばすため、
  既定(smooth)では滑らかすぎ、`image-rendering: pixelated` を当てると pen の
  半透明 AA エッジまで角ばって「透明度がくっきり」してしまう。どちらも Scratch の
  device 解像度描画とは一致しない。pen の描画ロジック自体は等倍では実線＋AA で正常。
- **採用した解決(ユーザー指定):** main canvas を **DPR 対応**にし
  (バックストア = 480×360×devicePixelRatio、context を DPR スケール)、sprite /
  クローン / monitor は device 解像度で鮮明に描く。pen レイヤは**固定 480×360 のまま**
  保持し、合成時に `imageSmoothingEnabled=false`(nearest)で拡大するため、
  **pen と stamp のみ低解像度(粗い)**になる。これによりユーザー要望
  「低解像度になるのは pen とスタンプのみ」を満たしつつ、Scratch の
  「pen は粗い / sprite は鮮明」という見た目方向に合わせた。座標系は 480×360 論理を維持。
  検証: deviceScaleFactor=2 で main backing=960×720、1px pen 線が device 上 ~4px
  (2×2 ブロック)で粗く合成されることを確認。DPR=1 では従来同一(e2e 不変)。
  一度試した「pen レイヤ NEAREST 表示(CSS pixelated)」は半透明 AA エッジまで硬化し
  「透明度がくっきり」する副作用があったため撤回した。

| 項目 | Scratch v14.1.0挙動 | 本プロジェクト(対応後) | 採用判断 | 参照 |
|----|----|----|----|----|
| 描画解像度 | device 解像度(stage × DPR) | main=device 解像度、pen/stamp=固定 480×360 を nearest 合成 | `default`(DPR 対応・pen/stamp のみ低解像度) | 公式 `scratch-render/src/PenSkin.js`, `RenderWebGL.js`(`pixelRatio`)<br>本: `src/render/CanvasRenderer.ts`(`dpr`, `compositePen`) |

## 全体結論

- **motion / fencing / sound / clone / pen のアルゴリズム本体は公式と TW で同一**であり、TW の差は
  (a) ステージ寸法を定数→可変に置換、(b) `runtimeOptions`(fencing / miscLimits / maxClones)トグル、
  (c) コンパイラ・補間・任意 FPS の追加、(d) SB3 メタデータ/設定コメントの拡張、に集約される。
- 本プロジェクトは「ステージ 480×360 固定・フェンス常時 ON・上限 300・公式制限値・インタプリタのみ」で
  すでに **Scratch v14.1.0 と整合** しており、TW 固有差分は基本的に採用不要。
- 唯一注意すべきは **SB3 import/export での保全**:`_twconfig_` コメント、`meta.platform`/`meta.origin`、
  `extensionURLs`、`customFonts`、拡張 JSON 由来の非有限数は、**破棄せず保全**(Phase 8 設計)しつつ、
  **実行時には解釈しない**方針が妥当(`preserve-only`)。
- TW を主正本に引き上げる要素は無い。実装意味論の正本は公式 `execute.js` インタプリタを維持する。

## docs Update Proposal

- 本書 `docs/TURBOWARP_DIFF_AUDIT.md` を新規追加した。Phase 8(SB3 import)着手時に、本書の `preserve-only`
  行(`_twconfig_` / `meta.platform` / `extensionURLs` / `customFonts` / 拡張 JSON)を
  `docs/main_design/SB3_IMPORT_DESIGN_DRAFT.md` の保全対象チェックリストへ反映することを提案する。
