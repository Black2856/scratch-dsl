export type BlockShape = 'hat' | 'stack' | 'reporter' | 'boolean' | 'cap' | 'shadow';
export type TargetConstraint = 'any' | 'stage' | 'sprite';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
export type FieldReference = 'variable' | 'list' | 'broadcast';

export interface InputMetadata {
    required: boolean;
    shadow?: string;
    kind?: 'value' | 'boolean' | 'substack';
}

export interface FieldMetadata {
    required: boolean;
    reference?: FieldReference;
}

/**
 * Hat scheduling policy, taken from the official VM's `getHats()` plus the
 * engine's edge-activated handling. `restartExistingThreads` controls whether
 * starting the hat restarts a thread already running for the same
 * target/topBlock; `edgeActivated` marks predicate hats (e.g.
 * `event_whengreaterthan`) that the Runtime evaluates every tick and fires only
 * on a false→true transition.
 */
export interface HatPolicy {
    restartExistingThreads: boolean;
    edgeActivated?: boolean;
}

export interface OpcodeMetadata {
    opcode: string;
    shape: BlockShape;
    target: TargetConstraint;
    priority: Priority;
    inputs: Readonly<Record<string, InputMetadata>>;
    fields: Readonly<Record<string, FieldMetadata>>;
    allowNext: boolean;
    hat?: HatPolicy;
}

const define = (
    opcode: string,
    shape: BlockShape,
    priority: Priority,
    inputs: Record<string, InputMetadata> = {},
    fields: Record<string, FieldMetadata> = {},
    target: TargetConstraint = 'any',
    hat?: HatPolicy
): OpcodeMetadata => ({
    opcode,
    shape,
    target,
    priority,
    inputs,
    fields,
    allowNext: shape === 'stack' || shape === 'hat',
    hat
});

const VALUE = (shadow?: string): InputMetadata => ({required: true, kind: 'value', shadow});
const BOOLEAN: InputMetadata = {required: true, kind: 'boolean'};
const SUBSTACK: InputMetadata = {required: true, kind: 'substack'};
const FIELD = (reference?: FieldReference): FieldMetadata => ({required: true, reference});

const entries: OpcodeMetadata[] = [
    define('event_whenflagclicked', 'hat', 'P0'),
    define('event_whenkeypressed', 'hat', 'P0', {}, {KEY_OPTION: FIELD()}),
    define('event_whenbroadcastreceived', 'hat', 'P0', {}, {BROADCAST_OPTION: FIELD('broadcast')}),
    define('event_broadcast', 'stack', 'P0', {BROADCAST_INPUT: VALUE('event_broadcast_menu')}),
    define('event_broadcastandwait', 'stack', 'P0', {BROADCAST_INPUT: VALUE('event_broadcast_menu')}),

    define('motion_movesteps', 'stack', 'P0', {STEPS: VALUE('math_number')}, {}, 'sprite'),
    define('motion_turnright', 'stack', 'P0', {DEGREES: VALUE('math_number')}, {}, 'sprite'),
    define('motion_turnleft', 'stack', 'P0', {DEGREES: VALUE('math_number')}, {}, 'sprite'),
    define('motion_gotoxy', 'stack', 'P0', {
        X: VALUE('math_number'),
        Y: VALUE('math_number')
    }, {}, 'sprite'),
    define('motion_pointindirection', 'stack', 'P0', {DIRECTION: VALUE('math_angle')}, {}, 'sprite'),
    define('motion_changexby', 'stack', 'P0', {DX: VALUE('math_number')}, {}, 'sprite'),
    define('motion_setx', 'stack', 'P0', {X: VALUE('math_number')}, {}, 'sprite'),
    define('motion_changeyby', 'stack', 'P0', {DY: VALUE('math_number')}, {}, 'sprite'),
    define('motion_sety', 'stack', 'P0', {Y: VALUE('math_number')}, {}, 'sprite'),
    define('motion_setrotationstyle', 'stack', 'P0', {}, {STYLE: FIELD()}, 'sprite'),
    define('motion_xposition', 'reporter', 'P0', {}, {}, 'sprite'),
    define('motion_yposition', 'reporter', 'P0', {}, {}, 'sprite'),
    define('motion_direction', 'reporter', 'P0', {}, {}, 'sprite'),

    define('looks_show', 'stack', 'P0', {}, {}, 'sprite'),
    define('looks_hide', 'stack', 'P0', {}, {}, 'sprite'),
    define('looks_switchcostumeto', 'stack', 'P0', {COSTUME: VALUE('looks_costume')}),
    define('looks_nextcostume', 'stack', 'P0'),
    define('looks_changesizeby', 'stack', 'P0', {CHANGE: VALUE('math_number')}, {}, 'sprite'),
    define('looks_setsizeto', 'stack', 'P0', {SIZE: VALUE('math_number')}, {}, 'sprite'),
    define('looks_gotofrontback', 'stack', 'P0', {}, {FRONT_BACK: FIELD()}, 'sprite'),
    define('looks_goforwardbackwardlayers', 'stack', 'P0', {
        NUM: VALUE('math_integer')
    }, {FORWARD_BACKWARD: FIELD()}, 'sprite'),

    define('sound_play', 'stack', 'P0', {SOUND_MENU: VALUE('sound_sounds_menu')}),
    define('sound_playuntildone', 'stack', 'P0', {SOUND_MENU: VALUE('sound_sounds_menu')}),
    define('sound_stopallsounds', 'stack', 'P0'),
    define('sound_changevolumeby', 'stack', 'P0', {VOLUME: VALUE('math_number')}),
    define('sound_setvolumeto', 'stack', 'P0', {VOLUME: VALUE('math_number')}),
    define('sound_volume', 'reporter', 'P0'),
    // Phase 7.2 Wave D: sound pitch/pan effects
    define('sound_changeeffectby', 'stack', 'P2', {
        EFFECT: VALUE('sound_effects_menu'),
        VALUE: VALUE('math_number')
    }),
    define('sound_seteffectto', 'stack', 'P2', {
        EFFECT: VALUE('sound_effects_menu'),
        VALUE: VALUE('math_number')
    }),
    define('sound_cleareffects', 'stack', 'P2'),

    define('control_wait', 'stack', 'P0', {DURATION: VALUE('math_positive_number')}),
    define('control_repeat', 'stack', 'P0', {TIMES: VALUE('math_whole_number'), SUBSTACK}),
    define('control_forever', 'cap', 'P0', {SUBSTACK}),
    define('control_if', 'stack', 'P0', {CONDITION: BOOLEAN, SUBSTACK}),
    define('control_if_else', 'stack', 'P0', {
        CONDITION: BOOLEAN,
        SUBSTACK,
        SUBSTACK2: SUBSTACK
    }),
    define('control_stop', 'cap', 'P0', {}, {STOP_OPTION: FIELD()}),

    // --- P1: clones ---------------------------------------------------------
    define('control_create_clone_of', 'stack', 'P1', {
        CLONE_OPTION: VALUE('control_create_clone_of_menu')
    }),
    define('control_delete_this_clone', 'cap', 'P1', {}, {}, 'sprite'),
    define('control_start_as_clone', 'hat', 'P1', {}, {}, 'sprite'),

    // --- P1: custom procedures ---------------------------------------------
    define('procedures_definition', 'hat', 'P1', {custom_block: VALUE('procedures_prototype')}),
    define('procedures_call', 'stack', 'P1'),
    define('argument_reporter_string_number', 'reporter', 'P1', {}, {VALUE: FIELD()}),
    define('argument_reporter_boolean', 'boolean', 'P1', {}, {VALUE: FIELD()}),

    // --- P1: pen extension --------------------------------------------------
    define('pen_clear', 'stack', 'P1'),
    define('pen_stamp', 'stack', 'P1', {}, {}, 'sprite'),
    define('pen_penDown', 'stack', 'P1', {}, {}, 'sprite'),
    define('pen_penUp', 'stack', 'P1', {}, {}, 'sprite'),
    define('pen_setPenColorToColor', 'stack', 'P1', {COLOR: VALUE('colour_picker')}),
    define('pen_changePenSizeBy', 'stack', 'P1', {SIZE: VALUE('math_number')}),
    define('pen_setPenSizeTo', 'stack', 'P1', {SIZE: VALUE('math_number')}),
    // Phase 7.2 Wave D: pen colour params (HSV)
    define('pen_changePenColorParamBy', 'stack', 'P2', {
        COLOR_PARAM: VALUE('pen_menu_colorParam'),
        VALUE: VALUE('math_number')
    }, {}, 'sprite'),
    define('pen_setPenColorParamTo', 'stack', 'P2', {
        COLOR_PARAM: VALUE('pen_menu_colorParam'),
        VALUE: VALUE('math_number')
    }, {}, 'sprite'),

    // --- P1: variable/list monitors ----------------------------------------
    define('data_showvariable', 'stack', 'P1', {}, {VARIABLE: FIELD('variable')}),
    define('data_hidevariable', 'stack', 'P1', {}, {VARIABLE: FIELD('variable')}),
    define('data_showlist', 'stack', 'P1', {}, {LIST: FIELD('list')}),
    define('data_hidelist', 'stack', 'P1', {}, {LIST: FIELD('list')}),

    define('sensing_keypressed', 'boolean', 'P0', {KEY_OPTION: VALUE('sensing_keyoptions')}),
    define('sensing_mousedown', 'boolean', 'P0'),
    define('sensing_mousex', 'reporter', 'P0'),
    define('sensing_mousey', 'reporter', 'P0'),

    define('operator_add', 'reporter', 'P0', {NUM1: VALUE('math_number'), NUM2: VALUE('math_number')}),
    define('operator_subtract', 'reporter', 'P0', {NUM1: VALUE('math_number'), NUM2: VALUE('math_number')}),
    define('operator_multiply', 'reporter', 'P0', {NUM1: VALUE('math_number'), NUM2: VALUE('math_number')}),
    define('operator_divide', 'reporter', 'P0', {NUM1: VALUE('math_number'), NUM2: VALUE('math_number')}),
    define('operator_random', 'reporter', 'P0', {FROM: VALUE('math_number'), TO: VALUE('math_number')}),
    define('operator_lt', 'boolean', 'P0', {OPERAND1: VALUE('text'), OPERAND2: VALUE('text')}),
    define('operator_equals', 'boolean', 'P0', {OPERAND1: VALUE('text'), OPERAND2: VALUE('text')}),
    define('operator_gt', 'boolean', 'P0', {OPERAND1: VALUE('text'), OPERAND2: VALUE('text')}),
    define('operator_and', 'boolean', 'P0', {OPERAND1: BOOLEAN, OPERAND2: BOOLEAN}),
    define('operator_or', 'boolean', 'P0', {OPERAND1: BOOLEAN, OPERAND2: BOOLEAN}),
    define('operator_not', 'boolean', 'P0', {OPERAND: BOOLEAN}),
    define('operator_join', 'reporter', 'P0', {STRING1: VALUE('text'), STRING2: VALUE('text')}),
    define('operator_letter_of', 'reporter', 'P0', {
        LETTER: VALUE('math_whole_number'),
        STRING: VALUE('text')
    }),
    define('operator_length', 'reporter', 'P0', {STRING: VALUE('text')}),
    define('operator_contains', 'boolean', 'P0', {STRING1: VALUE('text'), STRING2: VALUE('text')}),

    define('data_variable', 'reporter', 'P0', {}, {VARIABLE: FIELD('variable')}),
    define('data_setvariableto', 'stack', 'P0', {VALUE: VALUE('text')}, {VARIABLE: FIELD('variable')}),
    define('data_changevariableby', 'stack', 'P0', {
        VALUE: VALUE('math_number')
    }, {VARIABLE: FIELD('variable')}),
    define('data_listcontents', 'reporter', 'P0', {}, {LIST: FIELD('list')}),
    define('data_addtolist', 'stack', 'P0', {ITEM: VALUE('text')}, {LIST: FIELD('list')}),
    define('data_deleteoflist', 'stack', 'P0', {
        INDEX: VALUE('math_integer')
    }, {LIST: FIELD('list')}),
    define('data_deletealloflist', 'stack', 'P0', {}, {LIST: FIELD('list')}),
    define('data_insertatlist', 'stack', 'P0', {
        INDEX: VALUE('math_integer'),
        ITEM: VALUE('text')
    }, {LIST: FIELD('list')}),
    define('data_replaceitemoflist', 'stack', 'P0', {
        INDEX: VALUE('math_integer'),
        ITEM: VALUE('text')
    }, {LIST: FIELD('list')}),
    define('data_itemoflist', 'reporter', 'P0', {
        INDEX: VALUE('math_integer')
    }, {LIST: FIELD('list')}),
    define('data_itemnumoflist', 'reporter', 'P0', {ITEM: VALUE('text')}, {LIST: FIELD('list')}),
    define('data_lengthoflist', 'reporter', 'P0', {}, {LIST: FIELD('list')}),
    define('data_listcontainsitem', 'boolean', 'P0', {ITEM: VALUE('text')}, {LIST: FIELD('list')}),

    // --- Phase 7.2 Wave A: DOM-independent opcodes -------------------------
    define('operator_mod', 'reporter', 'P2', {NUM1: VALUE('math_number'), NUM2: VALUE('math_number')}),
    define('operator_round', 'reporter', 'P2', {NUM: VALUE('math_number')}),
    define('operator_mathop', 'reporter', 'P2', {NUM: VALUE('math_number')}, {OPERATOR: FIELD()}),

    define('control_wait_until', 'stack', 'P2', {CONDITION: BOOLEAN}),
    define('control_repeat_until', 'stack', 'P2', {CONDITION: BOOLEAN, SUBSTACK}),
    define('control_while', 'stack', 'P2', {CONDITION: BOOLEAN, SUBSTACK}),

    define('looks_costumenumbername', 'reporter', 'P2', {}, {NUMBER_NAME: FIELD()}, 'sprite'),
    define('looks_backdropnumbername', 'reporter', 'P2', {}, {NUMBER_NAME: FIELD()}),
    define('looks_size', 'reporter', 'P2', {}, {}, 'sprite'),

    define('sensing_timer', 'reporter', 'P2'),
    define('sensing_resettimer', 'stack', 'P2'),
    define('sensing_current', 'reporter', 'P2', {}, {CURRENTMENU: FIELD()}),
    define('sensing_dayssince2000', 'reporter', 'P2'),
    define('sensing_online', 'boolean', 'P2'),
    define('sensing_username', 'reporter', 'P2'),
    define('sensing_of', 'reporter', 'P2', {
        OBJECT: VALUE('sensing_of_object_menu')
    }, {PROPERTY: FIELD()}),
    define('sensing_distanceto', 'reporter', 'P2', {
        DISTANCETOMENU: VALUE('sensing_distancetomenu')
    }, {}, 'sprite'),
    define('sensing_setdragmode', 'stack', 'P2', {}, {DRAG_MODE: FIELD()}, 'sprite'),

    // --- Phase 7.2 Wave B: motion target/glide/bounce ----------------------
    define('motion_goto', 'stack', 'P2', {TO: VALUE('motion_goto_menu')}, {}, 'sprite'),
    define('motion_glideto', 'stack', 'P2', {
        SECS: VALUE('math_number'),
        TO: VALUE('motion_glideto_menu')
    }, {}, 'sprite'),
    define('motion_glidesecstoxy', 'stack', 'P2', {
        SECS: VALUE('math_number'),
        X: VALUE('math_number'),
        Y: VALUE('math_number')
    }, {}, 'sprite'),
    define('motion_pointtowards', 'stack', 'P2', {TOWARDS: VALUE('motion_pointtowards_menu')}, {}, 'sprite'),
    define('motion_ifonedgebounce', 'stack', 'P2', {}, {}, 'sprite'),

    // --- Phase 7.2 Wave C: say/think bubbles, ask/answer -------------------
    define('looks_say', 'stack', 'P2', {MESSAGE: VALUE('text')}, {}, 'sprite'),
    define('looks_sayforsecs', 'stack', 'P2', {
        MESSAGE: VALUE('text'),
        SECS: VALUE('math_number')
    }, {}, 'sprite'),
    define('looks_think', 'stack', 'P2', {MESSAGE: VALUE('text')}, {}, 'sprite'),
    define('looks_thinkforsecs', 'stack', 'P2', {
        MESSAGE: VALUE('text'),
        SECS: VALUE('math_number')
    }, {}, 'sprite'),
    define('sensing_askandwait', 'stack', 'P2', {QUESTION: VALUE('text')}),
    define('sensing_answer', 'reporter', 'P2'),

    // graphic effects: EFFECT is an inline field (no menu shadow), per official sb3.
    define('looks_changeeffectby', 'stack', 'P2', {CHANGE: VALUE('math_number')}, {EFFECT: FIELD()}, 'sprite'),
    define('looks_seteffectto', 'stack', 'P2', {VALUE: VALUE('math_number')}, {EFFECT: FIELD()}, 'sprite'),
    define('looks_cleargraphiceffects', 'stack', 'P2', {}, {}, 'sprite'),

    // object touching: TOUCHINGOBJECTMENU menu shadow.
    define('sensing_touchingobject', 'boolean', 'P2', {
        TOUCHINGOBJECTMENU: VALUE('sensing_touchingobjectmenu')
    }, {}, 'sprite'),

    // Phase 7.2 Wave D: loudness + colour touching
    define('sensing_loudness', 'reporter', 'P2'),
    define('sensing_touchingcolor', 'boolean', 'P2', {COLOR: VALUE('colour_picker')}, {}, 'sprite'),
    define('sensing_coloristouchingcolor', 'boolean', 'P2', {
        COLOR: VALUE('colour_picker'),
        COLOR2: VALUE('colour_picker')
    }, {}, 'sprite'),

    // --- Phase 7.2 Wave B: backdrop ----------------------------------------
    define('looks_switchbackdropto', 'stack', 'P2', {BACKDROP: VALUE('looks_backdrops')}),
    define('looks_switchbackdroptoandwait', 'stack', 'P2', {BACKDROP: VALUE('looks_backdrops')}),
    define('looks_nextbackdrop', 'stack', 'P2'),

    // --- Phase 7.2 Wave B: click / backdrop / edge hats --------------------
    define('event_whenthisspriteclicked', 'hat', 'P2', {}, {}, 'sprite',
        {restartExistingThreads: true}),
    define('event_whenstageclicked', 'hat', 'P2', {}, {}, 'stage',
        {restartExistingThreads: true}),
    define('event_whenbackdropswitchesto', 'hat', 'P2', {}, {BACKDROP: FIELD()}, 'any',
        {restartExistingThreads: true}),
    define('event_whengreaterthan', 'hat', 'P2', {VALUE: VALUE('math_number')},
        {WHENGREATERTHANMENU: FIELD()}, 'any', {restartExistingThreads: false, edgeActivated: true}),

    define('math_number', 'shadow', 'P0', {}, {NUM: FIELD()}),
    define('math_positive_number', 'shadow', 'P0', {}, {NUM: FIELD()}),
    define('math_whole_number', 'shadow', 'P0', {}, {NUM: FIELD()}),
    define('math_integer', 'shadow', 'P0', {}, {NUM: FIELD()}),
    define('math_angle', 'shadow', 'P0', {}, {NUM: FIELD()}),
    define('text', 'shadow', 'P0', {}, {TEXT: FIELD()}),
    define('event_broadcast_menu', 'shadow', 'P0', {}, {BROADCAST_OPTION: FIELD('broadcast')}),
    define('looks_costume', 'shadow', 'P0', {}, {COSTUME: FIELD()}),
    define('sound_sounds_menu', 'shadow', 'P0', {}, {SOUND_MENU: FIELD()}),
    define('sound_effects_menu', 'shadow', 'P2', {}, {EFFECT: FIELD()}),
    define('sensing_keyoptions', 'shadow', 'P0', {}, {KEY_OPTION: FIELD()}),

    // Phase 7.2 Wave A menus
    define('sensing_of_object_menu', 'shadow', 'P2', {}, {OBJECT: FIELD()}),
    define('sensing_distancetomenu', 'shadow', 'P2', {}, {DISTANCETOMENU: FIELD()}),

    // Phase 7.2 Wave B menus
    define('motion_goto_menu', 'shadow', 'P2', {}, {TO: FIELD()}),
    define('motion_glideto_menu', 'shadow', 'P2', {}, {TO: FIELD()}),
    define('motion_pointtowards_menu', 'shadow', 'P2', {}, {TOWARDS: FIELD()}),
    define('looks_backdrops', 'shadow', 'P2', {}, {BACKDROP: FIELD()}),

    // Phase 7.2 Wave C menu
    define('sensing_touchingobjectmenu', 'shadow', 'P2', {}, {TOUCHINGOBJECTMENU: FIELD()}),

    // P1 shadows / menus
    define('control_create_clone_of_menu', 'shadow', 'P1', {}, {CLONE_OPTION: FIELD()}),
    define('procedures_prototype', 'shadow', 'P1'),
    define('colour_picker', 'shadow', 'P1', {}, {COLOUR: FIELD()}),
    define('pen_menu_colorParam', 'shadow', 'P2', {}, {colorParam: FIELD()})
];

export const OPCODE_METADATA: Readonly<Record<string, OpcodeMetadata>> =
    Object.freeze(Object.fromEntries(entries.map(entry => [entry.opcode, Object.freeze(entry)])));

export const getOpcodeMetadata = (opcode: string): OpcodeMetadata | undefined =>
    OPCODE_METADATA[opcode];

export const P0_OPCODES = Object.freeze(
    entries.filter(entry => entry.priority === 'P0').map(entry => entry.opcode)
);

