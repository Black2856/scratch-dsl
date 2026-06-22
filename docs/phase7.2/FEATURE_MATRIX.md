# Phase 7.2 Feature Matrix

## 46項目の対応

| カテゴリ | ユーザー確認項目 | opcode | Wave | 主依存 |
|---|---|---|---|---|
| events | Sprite click | `event_whenthisspriteclicked` | B | pointer edge、renderer pick |
| events | backdrop changed hat | `event_whenbackdropswitchesto` | B | backdrop変更、hat field match |
| events | loudness > value | `event_whengreaterthan` | D | edge hat、loudness port |
| pen | change color param | `pen_changePenColorParamBy` | D | HSV pen state |
| pen | set color param | `pen_setPenColorParamTo` | D | HSV pen state |
| control | wait until | `control_wait_until` | A | predicate再評価、yield |
| control | repeat until | `control_repeat_until` | A | loop branch |
| control | repeat while | `control_while` | A | legacy/internal compatibility |
| motion | go to target | `motion_goto` | B | target menu resolver |
| motion | glide to target | `motion_glideto` | B | target resolver、timer |
| motion | glide to x/y | `motion_glidesecstoxy` | B | timer、linear interpolation |
| motion | point towards | `motion_pointtowards` | B | target resolver |
| motion | edge bounce | `motion_ifonedgebounce` | B | transformed bounds、fencing |
| operators | modulo | `operator_mod` | A | Scratch floored modulo |
| operators | round | `operator_round` | A | Cast |
| operators | math operation | `operator_mathop` | A | degree trig、MathUtil.tan |
| looks | say for seconds | `looks_sayforsecs` | C | bubble、promise wait |
| looks | say | `looks_say` | C | bubble |
| looks | think for seconds | `looks_thinkforsecs` | C | bubble、promise wait |
| looks | think | `looks_think` | C | bubble |
| looks | switch backdrop | `looks_switchbackdropto` | B | Stage costume、hat |
| looks | next backdrop | `looks_nextbackdrop` | B | Stage costume、hat |
| looks | change effect | `looks_changeeffectby` | C | effect state、renderer |
| looks | set effect | `looks_seteffectto` | C | effect state、renderer |
| looks | clear effects | `looks_cleargraphiceffects` | C | effect state、renderer |
| looks | costume number/name | `looks_costumenumbername` | A | target reporter |
| looks | backdrop number/name | `looks_backdropnumbername` | A | Stage reporter |
| looks | size | `looks_size` | A | rounded target size |
| sensing | touching object | `sensing_touchingobject` | C | collision query |
| sensing | touching color | `sensing_touchingcolor` | D | scene pixel query |
| sensing | color touching color | `sensing_coloristouchingcolor` | D | mask + scene pixel query |
| sensing | distance to | `sensing_distanceto` | A | target resolver |
| sensing | ask and wait | `sensing_askandwait` | C | question queue/UI |
| sensing | answer | `sensing_answer` | C | question state |
| sensing | set drag mode | `sensing_setdragmode` | A | mutable draggable |
| sensing | loudness | `sensing_loudness` | D | microphone/loudness port |
| sensing | timer | `sensing_timer` | A | project timer |
| sensing | reset timer | `sensing_resettimer` | A | project timer |
| sensing | property of target | `sensing_of` | A | target/variable lookup |
| sensing | current date part | `sensing_current` | A | wall-clock port |
| sensing | days since 2000 | `sensing_dayssince2000` | A | wall-clock/timezone |
| sensing | online | `sensing_online` | A | user-environment port |
| sensing | username | `sensing_username` | A | user-environment port |
| sound | change pitch/pan | `sound_changeeffectby` | D | audio effect state |
| sound | set pitch/pan | `sound_seteffectto` | D | audio effect state |
| sound | clear effects | `sound_cleareffects` | D | audio effect state |

## 依存として同時追加する機能

46項目に直接数えないが、正しい実装に必要:

- `looks_switchbackdroptoandwait`。
- `event_whenstageclicked`。
- menu/shadow opcode群。
- renderer bounds、pick、collision query。
- bubble view、question UI、answer submission。
- project timer、wall clock、user environment、loudnessのport。
- monitor可能reporterの値解決拡張。

## 完了後の分類目標

| 種別 | 目標 |
|---|---|
| deterministic Runtime | `supported` |
| renderer/UI目視項目 | 実装は`supported`、判定手段は`manual-only`併用 |
| loudness | browser実機は`supported`、device/permission無しは定義済みfallback |
| online/username | 注入値またはbrowser adapterで`supported`、Scratch account接続は非目標 |
| color collision | browser rendererで`supported`、renderer無しheadlessはfalse fallback |

## 対応外のまま残すもの

- `control_while`のpalette表示。opcode実行とSB3保持は対応するが、独自editorを
  実装しないため本プロジェクト内にpaletteは存在しない。
- Scratchサイト認証・ユーザー取得。
- microphone permission UIのScratch GUI完全再現。
- TurboWarpのlimits解除時の拡張pitch範囲。

