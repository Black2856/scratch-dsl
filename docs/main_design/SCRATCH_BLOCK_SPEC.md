# Block仕様

## Block graph

各blockは `id, opcode, next, parent, inputs, fields, shadow, topLevel, x, y, mutation` を持つ。inputsは実ブロックとshadowを区別し、fieldsは値と参照IDを保持する。topLevelのみx/yを必須とする。型変換はScratch互換Cast層で行う。

表の記号: `S`=stack、`H`=hat、`R`=reporter、`B`=boolean、`C`=cap。shadowは数値/文字列/色/menu入力に原則あり、SUBSTACKにはない。個別のshadow primitive番号はSB3仕様で扱う。

## 動き

| opcode | 入力/field | 型 | 概要 | SB3 | 優先度 |
|---|---|---|---|---|---|
| `motion_movesteps` | STEPS | S | Scratch directionから座標差分を計算して移動。pen down中は旧座標から新座標へ線描画 | 同opcode | P0（実装済み） |
| `motion_gotoxy` / `motion_glidesecstoxy` | X,Y / SECS,X,Y | S | 座標設定/時間補間 | 同opcode | P0/P1 |
| `motion_goto` / `motion_glideto` | TO | S | mouse/random/spriteへ | menu shadow | P1 |
| `motion_turnright/turnleft` | DEGREES | S | direction変更 | 同opcode | P0 |
| `motion_pointindirection/pointtowards` | DIRECTION/TOWARDS | S | 向き設定 | 同opcode | P0/P1 |
| `motion_change/set{x,y}` | DX/X/DY/Y | S | 軸更新 | 同opcode | P0 |
| `motion_ifonedgebounce` | - | S | Stage端で反射 | 同opcode | P1 |
| `motion_setrotationstyle` | STYLE field | S | 3方式 | 同opcode | P0 |
| `motion_{xposition,yposition,direction}` | - | R | 状態取得 | 同opcode | P0 |

## 見た目

| opcode群 | 入力/field | 型 | 概要 | 優先度 |
|---|---|---|---|---|
| `looks_show/hide` | - | S | visible | P0 |
| `looks_switchcostumeto/nextcostume` | COSTUME | S | costume選択 | P0 |
| `looks_switchbackdropto/nextbackdrop` | BACKDROP | S | Stage costume変更 | P1 |
| `looks_switchbackdroptoandwait` | BACKDROP | S | backdrop hats完了待ち | P2 |
| `looks_change/setsize` | CHANGE/SIZE | S | size更新 | P0 |
| `looks_change/seteffect`, `looks_cleargraphiceffects` | EFFECT field, CHANGE/VALUE | S | graphic effects | P1/P2 |
| `looks_gotofrontback`, `looks_goforwardbackwardlayers` | fields/NUM | S | layer順 | P0 |
| `looks_say/think`, `*forsecs` | MESSAGE,SECS | S | bubble | P2 |
| `looks_size`, costume/backdrop number/name | NUMBER_NAME field | R | 状態取得 | P1 |

## 音

| opcode | 入力/field | 型 | 実行 | 優先度 |
|---|---|---|---|---|
| `sound_play` | SOUND | S | 開始して継続 | P0 |
| `sound_playuntildone` | SOUND | S | 完了までwait | P0 |
| `sound_stopallsounds` | - | S | 全停止 | P0 |
| `sound_setvolumeto/changevolumeby` | VOLUME | S | target volume | P0 |
| `sound_volume` | - | R | 0..100 | P0 |
| `sound_seteffectto/changeeffectby/cleareffects` | EFFECT,VALUE | S | pitch/pan等 | P2 |

## イベント

| opcode | field/input | 型 | 実行 | 優先度 |
|---|---|---|---|---|
| `event_whenflagclicked` | - | H | green flag | P0 |
| `event_whenkeypressed` | KEY_OPTION field | H | key edge | P0 |
| `event_whenthisspriteclicked` | - | H | hit click | P1 |
| `event_whenbackdropswitchesto` | BACKDROP field | H | backdrop変更 | P1 |
| `event_whengreaterthan` | WHENGREATERTHANMENU field, VALUE | H | threshold edge | P2 |
| `event_whenbroadcastreceived` | BROADCAST_OPTION field+id | H | message受信 | P0 |
| `event_broadcast/event_broadcastandwait` | BROADCAST_INPUT | S | hats起動/完了待ち | P0 |

## 制御

| opcode | 入力/field | 型 | 実行 | 優先度 |
|---|---|---|---|---|
| `control_wait` | DURATION | S | timer待ち | P0 |
| `control_repeat/forever` | TIMES,SUBSTACK | S | 反復 | P0 |
| `control_if/if_else` | CONDITION,SUBSTACK(2) | S | 分岐 | P0 |
| `control_wait_until/repeat_until` | CONDITION | S | predicate待ち/反復 | P1 |
| `control_stop` | STOP_OPTION field | C/S | thread集合停止 | P0 |
| `control_create_clone_of` | CLONE_OPTION | S | clone生成 | P1 |
| `control_delete_this_clone` | - | C | clone破棄 | P1 |
| `control_start_as_clone` | - | H | clone hat | P1 |

## 調べる

| opcode群 | 型 | 実行 | 優先度 |
|---|---|---|---|
| `sensing_touchingobject` | B | sprite/mouse/edge接触 | P1 |
| `sensing_touchingcolor`, `sensing_coloristouchingcolor` | B | pixel色判定 | P3 |
| `sensing_distanceto` | R | targetまでの距離 | P1 |
| `sensing_askandwait`, `sensing_answer` | S/R | UI質問キュー | P2 |
| `sensing_keypressed`, `sensing_mousedown` | B | input snapshot | P0 |
| `sensing_mousex/mousey` | R | Stage座標 | P0 |
| `sensing_setdragmode` | S | draggable設定 | P2 |
| `sensing_loudness` | R | audio input | P3 |
| `sensing_timer/resettimer` | R/S | runtime timer | P1 |
| `sensing_current`, `sensing_dayssince2000` | R | wall clock | P2 |
| `sensing_username` | R | localでは空文字 | P4 |

## 演算

| opcode群 | 型 | 仕様 | 優先度 |
|---|---|---|---|
| `operator_add/subtract/multiply/divide/mod/round/mathop` | R | Cast.toNumber後に演算 | P0/P1 |
| `operator_lt/equals/gt` | B | Scratch比較規則 | P0 |
| `operator_and/or/not` | B | boolean cast | P0 |
| `operator_random` | R | 整数境界時は包含整数、それ以外は実数 | P0 |
| `operator_join/letter_of/length/contains` | R/B | 文字列処理、letterは1-origin | P0 |

## 変数・リスト

| opcode群 | 型 | 仕様 | 優先度 |
|---|---|---|---|
| `data_variable`, set/change variable | R/S | field IDでglobal/local解決 | P0 |
| show/hide variable | S | monitor visibility | P1 |
| `data_listcontents` | R | list表示文字列 | P1 |
| add/delete/delete-all/insert/replace | S | 1-origin、`last`/`random`対応 | P0 |
| item/item-number/length/contains | R/B | 範囲外はScratch規則で空値等 | P0 |
| show/hide list | S | monitor visibility | P1 |

listは最大200,000要素を上限とする。

## ブロック定義

| opcode | 型 | 仕様 | 優先度 |
|---|---|---|---|
| `procedures_definition` | H相当 | prototypeを参照 | P1 |
| `procedures_prototype` | shadow | mutationにproccode/argument ids/names/defaults/warp | P1 |
| `procedures_call` | S | mutationのproccodeで定義解決 | P1 |
| `argument_reporter_string_number` | R | procedure frame引数 | P1 |
| `argument_reporter_boolean` | B | procedure frame引数 | P1 |

## ペン・拡張

penはVM内蔵extension ID `pen` であり、SB3 opcodeは `pen_<opcode>` になる。

| opcode | input | 種別 | 実行仕様 | 優先度 |
|---|---|---|---|---|
| `pen_clear` | - | stack | pen layer全消去 | P1 |
| `pen_stamp` | - | stack | 現在のdrawableをpen layerへstamp。Sprite限定 | P1 |
| `pen_penDown` | - | stack | 現在位置へ点を描き、以後の非強制移動を線描画 | P1 |
| `pen_penUp` | - | stack | 移動listenerを解除 | P1 |
| `pen_setPenColorToColor` | COLOR: color | stack | RGB(A)からHSV/透明度へ変換 | P1 |
| `pen_changePenColorParamBy` | COLOR_PARAM: menu, VALUE: number=10 | stack | colorは0..100 wrap、他は0..100 clamp | P2 |
| `pen_setPenColorParamTo` | COLOR_PARAM: menu, VALUE: number=50 | stack | color/saturation/brightness/transparency設定 | P2 |
| `pen_changePenSizeBy` | SIZE: number=1 | stack | 直径を加算し1..1200へclamp | P1 |
| `pen_setPenSizeTo` | SIZE: number=1 | stack | 直径を1..1200へclamp | P1 |

legacyのshade/hue 4 opcodeもロード互換のため保持するがpaletteには表示しない。pen stateはtarget custom state `Scratch.pen` に置かれ、clone時に複製される。

現在のRuntimeで移動とpen lineが接続されているmotion opcodeは
`motion_movesteps`である。他のmotion opcodeはmetadata/SB3表現が存在しても、
Runtime実装済みとはみなさない。

`ExtensionManager`がbuilt-inとして登録する主要extension IDは `pen`, `music`, `videoSensing`, `text2speech`, `translate`, `faceSensing`, `wedo2`, `microbit`, `ev3`, `makeymakey`, `boost`, `gdxfor` である。初期実装はpenのみP1、music/video sensing/text-to-speech等はP3/P4とし、未知extension blockはDSL/SB3 round-trip時に保持する。

## 調査方針

core実行意味はVM `scratch3_*.js`、UI shape/input/shadowは`make-toolbox-xml.js`と`scratch-blocks`、保存形状は`serialization/sb3.js`を突合する。入力名やshadowを推測で追加しない。
