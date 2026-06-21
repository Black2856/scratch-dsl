# CONTRACT.md — 実装の正本（Single Source of Truth）

このファイルは「Scratch互換 ランタイムサブセット」の全モジュールが従う契約を定義する。
すべてのサブエージェント実装はこの契約に厳密に従うこと。DSL の形・モジュール公開API・
sb3 opcode 対応表をここで固定する。**勝手に名前や引数を変えない。**

- 内部座標系: Scratch互換 480x360 固定。中心 (0,0)、x ∈ [-240,240]、y ∈ [-180,180]。
- 言語: 素の ES Modules（ブラウザ）。ビルド不要。各ファイルは `export` を使う。
- Node 向けツール（tools/, tests/）も ES Modules（`"type":"module"`、`.mjs` 不要、package.json で指定）。
- 時刻基準: BGM/譜面の真の時刻 = `AudioContext.currentTime`、描画/入力ログ = `performance.now()`。

---

## 1. DSL（中間表現）— scratch-rhythm.dsl.json

トップレベル:

```json
{
  "meta": { "name": "string", "dslVersion": "1.0" },
  "stage": Target,
  "sprites": [ Target, ... ],
  "broadcasts": ["msgName", ...]
}
```

### Target
```json
{
  "name": "string",
  "isStage": false,
  "x": 0, "y": 0, "size": 100, "direction": 90,
  "visible": true, "draggable": false, "rotationStyle": "all around",
  "currentCostume": 0,
  "costumes": [ Costume, ... ],
  "sounds": [ Sound, ... ],
  "variables": { "varName": initialValue, ... },
  "lists": { "listName": [initialItems], ... },
  "scripts": [ Script, ... ],
  "procedures": [ Procedure, ... ]
}
```
Stage の Target は `isStage:true`、x/y/size/direction/draggable/rotationStyle を持たない（あっても無視）。
Stage は追加で `tempo`(60), `videoTransparency`(50), `videoState`("on"), `textToSpeechLanguage`(null) を持てる。

### Costume
```json
{ "name":"string", "file":"assets/...", "dataFormat":"png|svg|...",
  "bitmapResolution":1, "rotationCenterX":0, "rotationCenterY":0,
  "assetId":"optional-md5", "md5ext":"optional-md5.png" }
```
assetId/md5ext が無ければ生成器がプレースホルダを割り当てる。

### Sound
```json
{ "name":"string", "file":"assets/...", "dataFormat":"wav|mp3",
  "rate":44100, "sampleCount":0, "format":"",
  "assetId":"optional", "md5ext":"optional" }
```

### Script
```json
{ "event": Hat, "steps": [ Step, ... ] }
```

### Hat（イベント型）
| event.type | 意味 | 追加キー |
|---|---|---|
| `green_flag` | 緑の旗 | — |
| `key_pressed` | キー押下 | `key`（"space","a".."z","0".."9","up arrow"等） |
| `sprite_clicked` | スプライトクリック | — |
| `backdrop_switches` | 背景切替 | `name` |
| `receive` | broadcast受信 | `name` |
| `clone_start` | クローン開始時 | — |

### Procedure（カスタムブロック定義）
```json
{ "name":"judge", "params":[ {"name":"noteTime","type":"number"},
                             {"name":"lane","type":"number"},
                             {"name":"auto","type":"boolean"} ],
  "warp": false,
  "steps":[ Step, ... ] }
```
proccode は `name` + 各 param 型に応じて ` %s`(string) / ` %n`(number) / ` %b`(boolean) を連結して生成
（例: `"judge %n %n %b"`）。number/string はどちらも `%s` でも可だが本実装では number→`%n`, string→`%s`, boolean→`%b`。

---

## 2. DSL Step 一覧（type と引数）

値が必要な引数には **Reporter**（後述）を入れられる。リテラルは数値/文字列/真偽値そのまま。

### 動き(motion)
| type | 引数 | 動作 |
|---|---|---|
| `setX` | `x` | x座標を x にする |
| `setY` | `y` | y座標を y にする |
| `changeX` | `value` | x座標を value ずつ変える |
| `changeY` | `value` | y座標を value ずつ変える |
| `pointInDirection` | `direction` | 向きを設定 |
| `glideTo` | `secs`,`x`,`y` | secs秒で x,y へ補間移動（yieldしながら） |
| `ifOnEdgeBounce` | — | 端で跳ね返る |

### 見た目(looks)
| type | 引数 | 動作 |
|---|---|---|
| `show` | — | 表示 |
| `hide` | — | 隠す |
| `switchCostume` | `name` | コスチューム切替（名前/番号） |
| `nextCostume` | — | 次のコスチューム |
| `switchBackdrop` | `name` | 背景切替（Stage対象、`backdrop_switches`を発火） |
| `setSize` | `size` | 大きさ%絶対 |
| `changeSize` | `value` | 大きさ相対 |
| `goToFrontBack` | `where`("front"\|"back") | 最前/最背面へ |
| `goForwardBackward` | `direction`("forward"\|"backward"),`n` | n層前/後 |
| `say` | `message` | 吹き出し（デバッグ可視化） |

### 音(sound)
| type | 引数 | 動作 |
|---|---|---|
| `playSound` | `sound` | 非同期再生 |
| `playSoundUntilDone` | `sound` | 再生完了まで待機（yield） |
| `stopAllSounds` | — | 全停止 |
| `setVolume` | `value` | 音量%（0-100クランプ） |
| `changeVolume` | `value` | 音量相対 |

### イベント(event)
| type | 引数 | 動作 |
|---|---|---|
| `broadcast` | `name` | 送信（待たない） |
| `broadcastAndWait` | `name` | 送って受信スレッド全終了まで待つ |

### 制御(control)
| type | 引数 | 動作 |
|---|---|---|
| `wait` | `secs` | 秒待つ |
| `repeat` | `times`,`steps`[] | times回ループ |
| `forever` | `steps`[] | 無限ループ（毎反復で最低1回yield） |
| `if` | `condition`,`then`[] | 条件分岐 |
| `ifElse` | `condition`,`then`[],`else`[] | 二分岐 |
| `waitUntil` | `condition` | 真until yield |
| `repeatUntil` | `condition`,`steps`[] | 真までループ |
| `stop` | `target`("all"\|"this"\|"others") | 停止 |
| `createClone` | `target`("myself" or sprite名) | クローン作成 |
| `deleteClone` | — | このクローン削除 |

### 調べる(sensing)
| type | 引数 | 動作 |
|---|---|---|
| `resetTimer` | — | タイマーリセット |
| `askAndWait` | `question` | 質問して回答待ち（answerに格納） |

### 変数(data)
| type | 引数 | 動作 |
|---|---|---|
| `set` | `var`,`value` | 代入 |
| `change` | `var`,`value` | 数値加算 |
| `showVar` | `var` | モニタ表示 |
| `hideVar` | `var` | モニタ非表示 |

### リスト(data list, 全て1-indexed)
| type | 引数 | 動作 |
|---|---|---|
| `listAdd` | `list`,`item` | 末尾追加 |
| `listDeleteAt` | `list`,`index` | 削除 |
| `listDeleteAll` | `list` | 全消去 |
| `listInsertAt` | `list`,`index`,`item` | 挿入 |
| `listReplaceAt` | `list`,`index`,`item` | 置換 |
| `showList` | `list` | モニタ表示 |
| `hideList` | `list` | モニタ非表示 |

### ブロック定義(procedures)
| type | 引数 | 動作 |
|---|---|---|
| `call` | `proc`(名前),`args`({paramName:value,...}) | 定義済み手続き呼出 |

### ペン(pen・追加機能)
pen レイヤ（480x360 オフスクリーン）へ描画。Renderer が背景の上・スプライトの下に合成する。
| type | 引数 | 動作 |
|---|---|---|
| `penClear` | — | pen レイヤを全消去 |
| `penStamp` | — | 現在のコスチューム画像をその位置・サイズ・向きで pen レイヤに焼き付ける（表示/非表示問わず） |
| `penDown` | — | ペンを下ろす（以後の移動で軌跡を線描画） |
| `penUp` | — | ペンを上げる |
| `penSetColor` | `color`(文字列 `#rrggbb`) | ペン色を設定 |
| `penSetSize` | `size` | ペン太さを設定 |
| `penChangeSize` | `value` | ペン太さを相対変更 |

---

## 3. Reporter 一覧（`{op, ...}` 形式）

Reporter はリテラル（number/string/boolean）または `{ "op": "<name>", ...inputs }`。

### 演算(operator)
| op | inputs | 戻り |
|---|---|---|
| `add` | `a`,`b` | a+b |
| `sub` | `a`,`b` | a-b |
| `mul` | `a`,`b` | a*b |
| `div` | `a`,`b` | a/b |
| `mod` | `a`,`b` | a mod b |
| `lt` | `a`,`b` | a<b (bool) |
| `eq` | `a`,`b` | a=b (Scratch比較; 数値文字列は数値比較, 大小文字無視) |
| `gt` | `a`,`b` | a>b |
| `and` | `a`,`b` | 論理積 |
| `or` | `a`,`b` | 論理和 |
| `not` | `a` | 否定 |
| `random` | `from`,`to` | 乱数(両端含む。両方整数なら整数) |
| `join` | `a`,`b` | 連結 |
| `letterOf` | `text`,`index` | 1-based 文字 |
| `lengthOf` | `text` | 長さ |
| `contains` | `text`,`sub` | 包含(bool) |
| `round` | `n` | 四捨五入 |
| `mathop` | `fn`("abs"\|"floor"\|"ceiling"\|"sqrt"\|"sin"\|"cos"\|"tan"\|"asin"\|"acos"\|"atan"\|"ln"\|"log"\|"e ^"\|"10 ^"),`n` | 数学関数(三角は度) |

### 変数/リスト(data)
| op | inputs | 戻り |
|---|---|---|
| `var` | `name` | 変数値 |
| `listGet` | `list`,`index` | 1-based 要素 |
| `listIndexOf` | `list`,`item` | 最初の位置(なし=0) |
| `listLength` | `list` | 長さ |
| `listContains` | `list`,`item` | 包含(bool) |

### 動き/見た目/音 reporter
| op | 戻り |
|---|---|
| `xPos` | x座標 |
| `yPos` | y座標 |
| `direction` | 向き |
| `costumeNumber` | コスチューム番号 |
| `costumeName` | コスチューム名 |
| `size` | サイズ |
| `volume` | 音量 |

### 調べる(sensing)
| op | inputs | 戻り |
|---|---|---|
| `mouseX` | — | マウスx(Scratch座標) |
| `mouseY` | — | マウスy |
| `mouseDown` | — | 押下(bool) |
| `keyPressed` | `key` | キー押下(bool) |
| `timer` | — | タイマー秒 |
| `distanceTo` | `target`("_mouse_" or sprite名) | 距離 |
| `touching` | `target`("_mouse_","_edge_" or sprite名) | 接触(bool) |
| `answer` | — | 直近回答 |

### 手続き引数
| op | inputs | 戻り |
|---|---|---|
| `arg` | `name` | 呼出時引数値 |

---

## 4. モジュール公開API（engine/）

すべて ES Module。クラスは named export。

### VariableStore.js
```
class VariableStore {
  constructor()
  define(name, value=0)          // 変数定義（初期値）
  has(name) -> bool
  get(name) -> value
  set(name, value)
  change(name, delta)            // Number(get)+Number(delta)
  showMonitor(name); hideMonitor(name); isMonitorVisible(name)->bool
  names() -> string[]
  snapshot() -> { name: value }  // sb3/デバッグ用
}
```

### ListStore.js（全て1-indexed, 範囲外は無視/空）
```
class ListStore {
  constructor()
  define(name, items=[])
  has(name)->bool
  get(name) -> array(参照ではなくコピー禁止; 内部配列を返す)
  add(name, item)
  deleteAt(name, index1)         // 1-based; "all"でも可
  deleteAll(name)
  insertAt(name, index1, item)
  replaceAt(name, index1, item)
  itemAt(name, index1) -> item|""// 範囲外は ""
  indexOf(name, item) -> int     // 1-based, 無し=0, Scratch等価比較
  length(name) -> int
  contains(name, item) -> bool
  showMonitor(name); hideMonitor(name); isMonitorVisible(name)->bool
  names()->string[]
  snapshot() -> { name: array }
}
```

### EventBus.js（汎用pub/sub。入力やシステムイベント用）
```
class EventBus {
  constructor()
  on(type, handler) -> unsubscribe()
  off(type, handler)
  emit(type, payload)            // 同期fan-out
}
```

### SpriteRuntime.js
```
class SpriteRuntime {
  constructor(def, runtime)      // def=Target DSL, runtime=Runtime
  // 状態:
  name, isStage, x, y, size, direction, visible, draggable, rotationStyle
  currentCostume(int), costumes[], sounds[], volume(0-100)
  isClone(bool), isOriginal(bool)
  variables(VariableStore), lists(ListStore)
  layerOrder(int)
  sayText(string|null)
  // メソッド:
  setX(v); setY(v); changeX(d); changeY(d)
  pointInDirection(d)
  *glideTo(secs, x, y)           // generator: yieldしながら補間（ThreadRunnerが駆動）
  ifOnEdgeBounce()
  show(); hide()
  switchCostume(nameOrNum); nextCostume()
  setSize(v); changeSize(d)
  getCostumeNumber()->int; getCostumeName()->string
  say(msg)
  distanceTo(targetName)->number
  touching(targetName)->bool
  clampToStage()                 // 端処理補助
  createCloneData() -> def       // 自身の状態を複製したdefを返す（CloneManager用）
  snapshotForSb3() -> {...}      // sb3 target用プロパティ
}
```
Stage は SpriteRuntime を `isStage:true` で流用（x/y等は無視、backdrop=costume）。

### StageRuntime.js
```
class StageRuntime extends SpriteRuntime {  // または委譲
  constructor(def, runtime)
  // 追加: tempo, videoTransparency, videoState, textToSpeechLanguage
  switchBackdrop(nameOrNum)      // currentCostume変更 + backdrop_switches発火をruntimeに依頼
  getBackdropName()->string
}
```

### Input.js
```
class Input {
  constructor(canvas, runtime)
  // 内部でcanvasのpointer/keyイベントを購読、Scratch座標へ変換
  isKeyDown(key)->bool           // keyは"space","a","left arrow",...(Scratchキー名)
  isMouseDown()->bool
  mouseX()->number; mouseY()->number  // Scratch座標
  onKeyDown(cb); onMouseDown(cb)
  // 物理キー→Scratchキー名変換テーブルを内蔵
}
```

### SoundBridge.js（Web Audio）
```
class SoundBridge {
  constructor()
  get audioContext() -> AudioContext
  now() -> number                // audioContext.currentTime
  async loadSound(name, url) -> AudioBuffer   // decode + cache
  async loadAll(list)            // [{name,url}]
  play(name, {volume, when, rate, onended}) -> handle  // 非同期再生
  playUntilDone(name, opts) -> Promise          // playSoundUntilDone用
  stopAll()
  setMasterVolume(0-1)
  // BGM専用: 正確な開始時刻管理
  scheduleBgm(name, whenAtContextTime) -> { startContextTime }
  // performance.now ⇔ audioContext.currentTime 対応
  getOutputTimestamp() -> { contextTime, performanceTime }
  audioTimeToPerf(audioTime)->number
}
```

### ThreadRunner.js（協調マルチタスクの心臓）
```
class Thread {
  constructor(target, generator, {topScript})
  status: "running"|"done"|"yielded"
  target
}
class ThreadRunner {
  constructor(runtime)
  startScript(target, script) -> Thread   // hatのstepsをgenerator化して登録
  startProcedure(target, proc, args) -> Thread
  startSteps(target, steps, ctx) -> Thread
  stepThreads()              // 1フレーム分、全threadをyieldまで進める
  stopAll()
  stopThread(thread)
  stopOtherScriptsOf(target, exceptThread)
  threadsForTarget(target) -> Thread[]
  hasThreadsForBroadcast(name) -> bool    // broadcastAndWait判定用
  isEmpty()->bool
}
```
**インタプリタ規約**:
- ステップ実行は generator。各 step は同期実行が基本だが、以下は yield する:
  `wait`,`glideTo`,`playSoundUntilDone`,`broadcastAndWait`,`waitUntil`,`askAndWait`,
  `forever`/`repeat`/`repeatUntil`（各反復末で1回yield）。
- `yield` の意味: 次フレームまで中断。`yield {until: fn}` で条件待ち。`yield {seconds: s}` で秒待ち。
  実装は自由だが ThreadRunner と Interpreter で一貫させること（同一ファイル群内で閉じる）。
- Reporter 評価は同期関数 `evalReporter(target, node, ctx)`。

### Runtime.js（全体オーケストレータ。engine/Runtime.js）
```
class Runtime {
  constructor({ canvas, soundBridge })
  loadProject(dsl)               // DSL→StageRuntime/SpriteRuntime群を構築
  greenFlag()                    // green_flag hat起動
  broadcast(name)                // receive hat起動（待たない）
  *broadcastAndWait(name)        // generator: 全受信スレッド終了まで
  switchBackdropNotify(name)     // backdrop_switches hat起動
  pressKey(key)                  // key_pressed hat起動
  clickSprite(target)            // sprite_clicked hat起動
  startTick(); stop()            // requestAnimationFrameループ開始/停止
  // tick: timer更新 → input → stepThreads → render
  getTargetByName(name) -> SpriteRuntime
  targets[] (stage + sprites + clones)
  threads (ThreadRunner)
  events (EventBus)
  input (Input)
  sound (SoundBridge)
  renderer (Renderer)
  clones (CloneManager)
  timerStart(performance基準)
  getTimer()->秒
  answer(string)
}
```

### CloneManager.js
```
class CloneManager {
  constructor(runtime)
  createClone(sourceTarget) -> SpriteRuntime   // cloneを生成しruntime.targetsに追加, clone_start hat起動
  deleteClone(cloneTarget)                      // targetsから除去, threads停止
  countFor(name)->int
  total()->int
  // object pooling: deleteされたcloneを再利用するpoolを内部管理してよい
}
```

### Renderer.js（Canvas 480x360）
```
class Renderer {
  constructor(canvas)            // canvas.width=480, height=360
  render(runtime)                // stage背景→layerOrder昇順でsprite/clone描画→say吹き出し→モニタ
  // 画像未ロード時はプレースホルダ矩形（色はname由来）を描く＝アセット無しでも動作
  drawMonitors(runtime)          // 表示中の変数/リストモニタ
}
```

### PenCompat.js（追加機能・デバッグ描画）
```
class PenCompat {
  constructor()
  penDown(target); penUp(target)
  setColor(target, color); setSize(target,n)
  clear()
  stamp(target)
  // Rendererがpenレイヤを最初に合成する
  getLayerCanvas() -> offscreen
}
```

---

## 5. tools/（Node, ES Modules）

### generate-web.js      DSLを読み web/ 用に検証（ランタイムはDSLを直接消費するので主に検証/コピー）
### generate-sb3.js      DSL → sb3 project.json（targets/blocks/...）を構築。`Sb3Generator` をexport
### pack-sb3.js          project.json + assets を zip 化して .sb3 出力（依存: 同梱の最小zip or jszip）

`Sb3Generator` 公開API:
```
class Sb3Generator {
  constructor(dsl)
  build() -> projectJson(object)         // {targets, monitors, extensions, meta}
  // DSL step/reporter → sb3 blocks（§6対応表）
}
```

---

## 6. sb3 opcode 対応表（DSL → Scratch VM opcode）

### blocks の形（Scratch VM 互換）
```
"<id>": {
  "opcode": "<opcode>",
  "next": "<id>|null",
  "parent": "<id>|null",
  "inputs": { INPUT_NAME: <inputDesc> },
  "fields": { FIELD_NAME: [value, id|null] },
  "shadow": bool,
  "topLevel": bool,
  ("x":num,"y":num は topLevelのみ)
  ("mutation": {...} は procedures_call/definition/control_stop)
}
```
inputDesc:
- 影付き数値: `[1, [4, "10"]]`（4=math_number, 5=positive,6=whole,7=integer,8=angle,10=text）
- ブロック入力（bool/reporter）: `[2, "<blockId>"]`
- ブロック+影: `[3, "<blockId>", [4,"0"]]`
- 変数primitive: `[3, [12,"name","varId"], [10,""]]`（reporter差込時）/ 単独field使用時は fields
- broadcast input: `[1, [11, "msgName", "msgId"]]`

substack: `inputs.SUBSTACK = [2, "<最初の子blockId>"]`、ifElseは `SUBSTACK2`。

### モーション
| DSL | opcode | inputs / fields |
|---|---|---|
| setX | motion_setx | X |
| setY | motion_sety | Y |
| changeX | motion_changexby | DX |
| changeY | motion_changeyby | DY |
| pointInDirection | motion_pointindirection | DIRECTION(angle) |
| glideTo | motion_glidesecstoxy | SECS,X,Y |
| ifOnEdgeBounce | motion_ifonedgebounce | — |
| xPos(rep) | motion_xposition | — |
| yPos(rep) | motion_yposition | — |
| direction(rep) | motion_direction | — |

### 見た目
| DSL | opcode | inputs / fields |
|---|---|---|
| show | looks_show | — |
| hide | looks_hide | — |
| switchCostume | looks_switchcostumeto | COSTUME←(影 looks_costume, fields.COSTUME) |
| nextCostume | looks_nextcostume | — |
| switchBackdrop | looks_switchbackdropto | BACKDROP←(影 looks_backdrops) |
| setSize | looks_setsizeto | SIZE |
| changeSize | looks_changesizeby | CHANGE |
| goToFrontBack | looks_gotofrontback | fields.FRONT_BACK |
| goForwardBackward | looks_goforwardbackwardlayers | NUM, fields.FORWARD_BACKWARD |
| say | looks_say | MESSAGE |
| costumeNumber/Name(rep) | looks_costumenumbername | fields.NUMBER_NAME |
| size(rep) | looks_size | — |

### 音
| DSL | opcode | inputs/fields |
|---|---|---|
| playSound | sound_play | SOUND_MENU←(影 sound_sounds_menu, fields.SOUND_MENU) |
| playSoundUntilDone | sound_playuntildone | 同上 |
| stopAllSounds | sound_stopallsounds | — |
| setVolume | sound_setvolumeto | VOLUME |
| changeVolume | sound_changevolumeby | VOLUME |
| volume(rep) | sound_volume | — |

### イベント
| DSL | opcode | inputs/fields |
|---|---|---|
| green_flag(hat) | event_whenflagclicked | — |
| key_pressed(hat) | event_whenkeypressed | fields.KEY_OPTION |
| sprite_clicked(hat) | event_whenthisspriteclicked | — |
| backdrop_switches(hat) | event_whenbackdropswitchesto | fields.BACKDROP |
| receive(hat) | event_whenbroadcastreceived | fields.BROADCAST_OPTION=[name,id] |
| broadcast | event_broadcast | BROADCAST_INPUT=[1,[11,name,id]] |
| broadcastAndWait | event_broadcastandwait | BROADCAST_INPUT |

### 制御
| DSL | opcode | inputs/fields/mutation |
|---|---|---|
| wait | control_wait | DURATION |
| repeat | control_repeat | TIMES, SUBSTACK |
| forever | control_forever | SUBSTACK |
| if | control_if | CONDITION, SUBSTACK |
| ifElse | control_if_else | CONDITION, SUBSTACK, SUBSTACK2 |
| waitUntil | control_wait_until | CONDITION |
| repeatUntil | control_repeat_until | CONDITION, SUBSTACK |
| stop | control_stop | fields.STOP_OPTION, mutation{hasnext} |
| createClone | control_create_clone_of | CLONE_OPTION←(影 control_create_clone_of_menu, fields.CLONE_OPTION) |
| clone_start(hat) | control_start_as_clone | — |
| deleteClone | control_delete_this_clone | — |

### 調べる
| DSL | opcode | inputs/fields |
|---|---|---|
| mouseX(rep) | sensing_mousex | — |
| mouseY(rep) | sensing_mousey | — |
| mouseDown(rep) | sensing_mousedown | — |
| keyPressed(rep) | sensing_keypressed | KEY_OPTION←(影 sensing_keyoptions) |
| timer(rep) | sensing_timer | — |
| resetTimer | sensing_resettimer | — |
| distanceTo(rep) | sensing_distanceto | DISTANCETOMENU←(影 sensing_distancetomenu) |
| touching(rep) | sensing_touchingobject | TOUCHINGOBJECTMENU←(影 sensing_touchingobjectmenu) |
| askAndWait | sensing_askandwait | QUESTION |
| answer(rep) | sensing_answer | — |

### 演算
| DSL | opcode | inputs/fields |
|---|---|---|
| add | operator_add | NUM1,NUM2 |
| sub | operator_subtract | NUM1,NUM2 |
| mul | operator_multiply | NUM1,NUM2 |
| div | operator_divide | NUM1,NUM2 |
| mod | operator_mod | NUM1,NUM2 |
| lt | operator_lt | OPERAND1,OPERAND2 |
| eq | operator_equals | OPERAND1,OPERAND2 |
| gt | operator_gt | OPERAND1,OPERAND2 |
| and | operator_and | OPERAND1,OPERAND2 |
| or | operator_or | OPERAND1,OPERAND2 |
| not | operator_not | OPERAND |
| random | operator_random | FROM,TO |
| join | operator_join | STRING1,STRING2 |
| letterOf | operator_letter_of | LETTER,STRING |
| lengthOf | operator_length | STRING |
| contains | operator_contains | STRING1,STRING2 |
| round | operator_round | NUM |
| mathop | operator_mathop | NUM, fields.OPERATOR |

### 変数/リスト
| DSL | opcode | inputs/fields |
|---|---|---|
| set | data_setvariableto | VALUE, fields.VARIABLE=[name,id] |
| change | data_changevariableby | VALUE, fields.VARIABLE |
| var(rep) | data_variable | fields.VARIABLE （入力差込時は primitive [12,name,id]） |
| showVar | data_showvariable | fields.VARIABLE |
| hideVar | data_hidevariable | fields.VARIABLE |
| listAdd | data_addtolist | ITEM, fields.LIST=[name,id] |
| listDeleteAt | data_deleteoflist | INDEX, fields.LIST |
| listDeleteAll | data_deletealloflist | fields.LIST |
| listInsertAt | data_insertatlist | ITEM,INDEX, fields.LIST |
| listReplaceAt | data_replaceitemoflist | INDEX,ITEM, fields.LIST |
| listGet(rep) | data_itemoflist | INDEX, fields.LIST |
| listIndexOf(rep) | data_itemnumoflist | ITEM, fields.LIST |
| listLength(rep) | data_lengthoflist | fields.LIST |
| listContains(rep) | data_listcontainsitem | ITEM, fields.LIST |
| showList | data_showlist | fields.LIST |
| hideList | data_hidelist | fields.LIST |

### 手続き
| DSL | opcode | 詳細 |
|---|---|---|
| procedure def | procedures_definition | inputs.custom_block=[1,"<prototypeId>"]; prototype= procedures_prototype with mutation{proccode,argumentids,argumentnames,argumentdefaults,warp} |
| call | procedures_call | mutation{proccode,argumentids,warp}; inputs= argumentid→value |
| arg(rep) string/number | argument_reporter_string_number | fields.VALUE=[name,null] |
| arg(rep) boolean | argument_reporter_boolean | fields.VALUE=[name,null] |

mutation 文字列値はJSON文字列としてエスケープ（argumentids等は JSON.stringify した配列文字列）。

### ペン(pen 拡張)
pen ブロックを含む場合、project.json の `extensions` に `"pen"` を加える。
| DSL | opcode | inputs/fields |
|---|---|---|
| penClear | pen_clear | — |
| penStamp | pen_stamp | — |
| penDown | pen_penDown | — |
| penUp | pen_penUp | — |
| penSetColor | pen_setPenColorToColor | COLOR=[1,[9,"#rrggbb"]] |
| penSetSize | pen_setPenSizeTo | SIZE |
| penChangeSize | pen_changePenSizeBy | SIZE |

---

## 7. 命名・テスト
- ファイル: engine/*.js は PascalCase。tools/*.js, tests/*.js は kebab/camel。
- テストは tests/ に置き、`node --test`（Node組込テストランナー）で実行可能にする。
- アセットが無くても全機能が動く（Renderer はプレースホルダ描画、SoundBridge は無音バッファfallback）。
