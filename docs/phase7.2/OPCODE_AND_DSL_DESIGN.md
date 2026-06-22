# Phase 7.2 Opcode and DSL Design

## 共通規則

- metadata追加時は公式GUI、公式VM、公式fixtureのinput/field名を一致させる。
- menuは可能な限り公式と同じshadow blockとして表現する。
- target制約はStage/Spriteを公式に合わせる。
- 全opcodeをSB3 serializerでそのまま保持する。
- extension opcodeは`pen_` prefixと`extensions: ['pen']`を維持する。
- unknown opcode warningで代用しない。

## 追加metadata

### Motion

| opcode | shape | inputs | target |
|---|---|---|---|
| `motion_goto` | stack | `TO: motion_goto_menu` | Sprite |
| `motion_glideto` | stack | `SECS: math_number`, `TO: motion_glideto_menu` | Sprite |
| `motion_glidesecstoxy` | stack | `SECS/X/Y: math_number` | Sprite |
| `motion_pointtowards` | stack | `TOWARDS: motion_pointtowards_menu` | Sprite |
| `motion_ifonedgebounce` | stack | なし | Sprite |

menu値:

- goto/glide: `_random_`, `_mouse_`, Sprite名。
- point towards: `_mouse_`, Sprite名。Runtime互換のため`_random_`も受理する。

### Looks

| opcode | shape | inputs/fields | target |
|---|---|---|---|
| `looks_sayforsecs` | stack | `MESSAGE: text`, `SECS: math_number` | Sprite |
| `looks_say` | stack | `MESSAGE: text` | Sprite |
| `looks_thinkforsecs` | stack | `MESSAGE: text`, `SECS: math_number` | Sprite |
| `looks_think` | stack | `MESSAGE: text` | Sprite |
| `looks_switchbackdropto` | stack | `BACKDROP: looks_backdrops` | any |
| `looks_switchbackdroptoandwait` | stack | `BACKDROP: looks_backdrops` | any |
| `looks_nextbackdrop` | stack | なし | any |
| `looks_changeeffectby` | stack | `EFFECT: looks_effectmenu`, `CHANGE: math_number` | any |
| `looks_seteffectto` | stack | `EFFECT: looks_effectmenu`, `VALUE: math_number` | any |
| `looks_cleargraphiceffects` | stack | なし | any |
| `looks_costumenumbername` | reporter | field `NUMBER_NAME` | Sprite |
| `looks_backdropnumbername` | reporter | field `NUMBER_NAME` | any |
| `looks_size` | reporter | なし | Sprite |

effect menuは`color`, `fisheye`, `whirl`, `pixelate`, `mosaic`, `brightness`,
`ghost`を受理する。v2の必須目視項目は`color`だが、stateとserializerは全値を扱う。

> 実装時の訂正 (公式 sb3 準拠): `looks_changeeffectby` / `looks_seteffectto` の
> `EFFECT` は menu shadow (`looks_effectmenu`) ではなく **インライン field** である
> (`sb2_specmap.js` / 公式 sb3 で `type: 'field', fieldName: 'EFFECT'`)。本実装は
> `EFFECT` を field、`CHANGE`/`VALUE` を `math_number` input として登録した。
> ghost は 0..100、brightness は -100..100 に clamp、他 effect は無制限
> (`scratch3_looks.js:clampEffect`)。同様に `event_whengreaterthan` の loudness 分岐は
> Wave D の `LoudnessPort` で有効化済み (port 無しは -1)。

### Events and control

| opcode | shape | inputs/fields |
|---|---|---|
| `event_whenthisspriteclicked` | hat | なし |
| `event_whenstageclicked` | hat | なし |
| `event_whenbackdropswitchesto` | hat | field `BACKDROP` |
| `event_whengreaterthan` | hat | field `WHENGREATERTHANMENU`, `VALUE: math_number` |
| `control_wait_until` | stack | boolean `CONDITION` |
| `control_repeat_until` | stack | boolean `CONDITION`, `SUBSTACK` |
| `control_while` | stack | boolean `CONDITION`, `SUBSTACK` |

`event_whengreaterthan`のfield値は`LOUDNESS`/`TIMER`をcase-insensitiveに解釈する。
metadataではhatの`restartExistingThreads=false`と`edgeActivated=true`を表現できる
よう、既存metadataへhat policyを追加する。

### Operators

| opcode | shape | inputs/fields |
|---|---|---|
| `operator_mod` | reporter | `NUM1/NUM2: math_number` |
| `operator_round` | reporter | `NUM: math_number` |
| `operator_mathop` | reporter | field `OPERATOR`, `NUM: math_number` |

### Sensing

| opcode | shape | inputs/fields | target |
|---|---|---|---|
| `sensing_touchingobject` | boolean | `TOUCHINGOBJECTMENU: sensing_touchingobjectmenu` | Sprite |
| `sensing_touchingcolor` | boolean | `COLOR: colour_picker` | Sprite |
| `sensing_coloristouchingcolor` | boolean | `COLOR/COLOR2: colour_picker` | Sprite |
| `sensing_distanceto` | reporter | `DISTANCETOMENU: sensing_distancetomenu` | Sprite |
| `sensing_askandwait` | stack | `QUESTION: text` | any |
| `sensing_answer` | reporter | なし | any |
| `sensing_setdragmode` | stack | field `DRAG_MODE` | Sprite |
| `sensing_loudness` | reporter | なし | any |
| `sensing_timer` | reporter | なし | any |
| `sensing_resettimer` | stack | なし | any |
| `sensing_of` | reporter | field `PROPERTY`, `OBJECT: sensing_of_object_menu` | any |
| `sensing_current` | reporter | field `CURRENTMENU` | any |
| `sensing_dayssince2000` | reporter | なし | any |
| `sensing_online` | boolean | なし | any |
| `sensing_username` | reporter | なし | any |

touching menuは`_mouse_`, `_edge_`, Sprite名。distance menuは`_mouse_`, Sprite名。
object menuは`_stage_`, Sprite名。

### Sound

| opcode | shape | inputs |
|---|---|---|
| `sound_changeeffectby` | stack | `EFFECT: sound_effects_menu`, `VALUE: math_number` |
| `sound_seteffectto` | stack | `EFFECT: sound_effects_menu`, `VALUE: math_number` |
| `sound_cleareffects` | stack | なし |

effect値は`PITCH`/`PAN`をcase-insensitiveに扱う。

### Pen

| opcode | shape | inputs |
|---|---|---|
| `pen_changePenColorParamBy` | stack | `COLOR_PARAM: pen_menu_colorParam`, `VALUE: math_number` |
| `pen_setPenColorParamTo` | stack | `COLOR_PARAM: pen_menu_colorParam`, `VALUE: math_number` |

menu値は`color`, `saturation`, `brightness`, `transparency`。

## Validator変更

- metadataにhat policyとmenu shadowを追加する。
- Stage/Sprite target制約を追加する。
- menu field値は構造検証ではstringとして受け、意味検証で既知値をwarningにする。
- `procedures_call`と同様の可変input例外を増やさない。
- reporter monitorを追加する場合、monitor opcodeとtarget/spriteNameの整合性を検証する。

## Serializer変更

通常blockは既存generic serializerを使う。追加作業は主に:

- 新menu shadowのcompact primitive化対象を確認する。
- extension collectorがpen opcodeを`pen`へ集約することを確認する。
- hat field、reporter field、effect menuが公式project.json形状になるfixtureを追加する。
- metadata追加前後で既存block IDを変更しない。

