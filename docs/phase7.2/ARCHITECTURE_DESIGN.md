# Phase 7.2 Architecture Design

## 維持する不変条件

```text
validated DSL
  ├─ Project/Runtime → ports → preview
  └─ SB3 serializer → project.json/assets
```

- Runtime stateからSB3を生成しない。
- model/validation/RuntimeはDOM、Canvas、Web Audio、MediaDevicesへ依存しない。
- cloneはexportしない。
- browser機能はoptional portとadapterへ隔離する。

## Model拡張

### Target

追加するlive state:

```ts
interface GraphicEffects {
    color: number;
    fisheye: number;
    whirl: number;
    pixelate: number;
    mosaic: number;
    brightness: number;
    ghost: number;
}

interface SoundEffects {
    pitch: number;
    pan: number;
}
```

- Targetはgraphic effectsとsound effectsをtarget単位で持つ。
- Spriteの`draggable`をreadonlyからmutableへ変更し`setDraggable`を追加する。
- clone生成時はeffects、draggable、bubble無し、sound effectを公式規則でコピーする。
- green flag/stop時のreset対象をmanager単位で明示する。

### DrawableState

`graphicEffects`を追加する。rendererはmodelを直接参照せずsnapshotだけで描画する。

## Runtime manager

### ProjectTimer

- `Runtime.start()`またはgreen flagで基準時刻を設定する。
- `sensing_timer`は`(clock.now() - resetAt)/1000`。
- `sensing_resettimer`は`resetAt = clock.now()`。
- testではFakeClockを使う。

### HatManager拡張

metadataに次を追加:

```ts
interface HatPolicy {
    restartExistingThreads: boolean;
    edgeActivated?: boolean;
}
```

Runtime.tickのthread step前にedge hat predicateを評価し、前回false・今回trueの時だけ
threadを開始する。前回値は`targetId + topBlockId`で保持し、clone削除時に破棄する。

### BubbleManager

targetごとに次を保持:

- `type: 'say' | 'think'`
- formatted text
- usage generation
- right/left preference

`say/think for seconds`はRuntimeのclockを使うdeadline方式を第一案とし、実時間
`setTimeout`をRuntimeへ持ち込まない。同じtargetのbubbleが後続blockで更新された場合、
古いdeadlineは新しいbubbleを消さない。

RendererPortには`renderBubbles(BubbleView[])`を追加する。CanvasRendererはSpriteの
transformed boundsから左右配置し、stage外へはみ出さないようclampする。

### QuestionManager

FIFO queueをRuntime内で管理する。各entry:

- question text
- target
- ask開始時のvisible/isStage
- resolve callback

新port:

```ts
interface QuestionUiPort {
    showQuestion(text: string): void;
    clearQuestion(): void;
}
```

Preview UIは回答送信時に`runtime.submitAnswer(text)`を呼ぶ。visible Spriteの場合は
BubbleManagerへquestionを表示し、QuestionUiPortには空文字を渡す。stop all、
target停止、clone削除で該当queueを除去し、待機threadを永久停止させない。

### Environment ports

```ts
interface WallClockPort {
    nowDate(): Date;
}

interface UserEnvironmentPort {
    getUsername(): string;
    isOnline(): boolean | '';
}

interface LoudnessPort {
    getLoudness(): number;
}
```

- default usernameは空文字。
- browser online adapterは`navigator.onLine`、headless defaultは空文字。
- loudness port無しは公式audioEngine無し相当の`-1`。
- loudnessは1 tickにつき一度だけ取得してcacheする。

## Inputとclick

InputPortへpointer edgeを追加:

```ts
interface PointerTransition {
    kind: 'down' | 'up';
    x: number;
    y: number;
    wasDragged: boolean;
    insideStage: boolean;
}

consumePointerTransitions?(): PointerTransition[];
```

RendererPortへ`pickTarget(x, y, scene): string | null`を追加する。

Runtimeはtransitionを消費し:

- 非draggable target: downでclick hat。
- draggable target: dragでないupでclick hat。
- hit無し: Stage click。

dragの移動操作そのものはPhase 7.2の必須範囲外。`set drag mode`は状態変更とclick
timingへ反映する。実ドラッグを追加する場合は別の入力タスクとして扱う。

## Motion query

共通`TargetResolver`を追加し、名前、`_mouse_`, `_random_`, `_stage_`を解決する。
random positionは固定480×360を使い、Runtime.randomを通す。

glideはblock executionContextへ次を保持:

- startMSecs
- durationMSecs
- startX/startY
- endX/endY

途中位置にも`BlockUtil.setXY`を使い、fencingとpen移動を既存経路へ通す。

edge bounce用にRendererPortへtransformed bounds queryを追加する。

```ts
getBounds?(targetId: string, transform: DrawableState): Bounds | null;
```

nearest edgeと0.2 minimum componentは公式アルゴリズムを採用し、最後に既存fencingを
通す。

## Renderer query

### stale snapshotを避ける

Runtime primitiveは同じtick内で複数回target stateを変更するため、queryが前frameの
`lastStates`だけを見る設計は禁止する。query APIへRuntimeが現在のscene snapshotを
渡す。

```ts
interface RenderQueryScene {
    drawables: DrawableState[];
    penIncluded: boolean;
}
```

候補API:

- `pickTarget(x, y, scene)`
- `isTouchingPoint(targetId, x, y, scene)`
- `isTouchingTargets(targetId, candidateIds, scene)`
- `isTouchingColor(targetId, targetColor, maskColor, scene)`
- `getBounds(targetId, scene)`

renderer無しでは公式VMのguardと同様にfalse/nullを返す。

### Object collision

Wave Cではalpha-aware hit testを実装する。AABBは候補絞込にのみ使い、最終判定は
costume alpha、rotation center、size、direction、rotation style、visibilityを考慮する。

### Color collision

Wave Dでは専用offscreen query surfaceへ次を公式描画順で合成する:

1. Stage backdrop/background。
2. pen layer。
3. visible Sprite/clones。

判定元maskはvisibilityを無視し、ghostだけmaskから除外する。scene側はgraphic
effectsを含む。pixel readbackは交差boundsへ限定し、browser E2Eで検証する。

## Looks effects

effects stateは全7種を保持する。実装順:

1. `color`, `brightness`, `ghost`。
2. `pixelate`, `mosaic`。
3. `fisheye`, `whirl`。

Canvas 2Dの`filter`だけでScratch互換を主張しない。offscreen bitmap処理または
scratch-render shader式をCPUへ移植し、effectごとのgolden testを用意する。
v2の最低ゲートは`color`のchange/set/clearだが、未実装effect選択時はno-opにせず
diagnosticまたはwave未完了として扱う。

## Sound effectsとloudness

### AudioPort

playback chainを:

```text
AudioBufferSourceNode → GainNode → StereoPannerNode → destination
```

へ拡張する。pitchは`playbackRate = 2 ** (pitch / 120)`、panは`-1..1`へ変換する。
AudioPortへ`setPitch`、`setPan`を追加し、active playbackへ即時反映する。

target単位effectはSoundBankが保持し、clone時に値をコピーする。

### Loudness

再生音ではなくmicrophone inputを測定する。browser adapterは
`getUserMedia({audio:true})`とAnalyserNodeを使う。permission拒否、device無し、
adapter無しは`-1`。previewは明示したユーザー操作後にのみpermissionを要求する。

## Pen HSV state

PenStateをCSS colorだけでなく次へ拡張:

- color 0..100 wrap。
- saturation/brightness/transparency 0..100 clamp。
- derived RGBA/CSS color。
- size/down。

direct RGB指定時もHSVへ逆変換しstateを同期する。cloneは全stateをコピーする。

