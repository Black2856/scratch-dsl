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

export interface OpcodeMetadata {
    opcode: string;
    shape: BlockShape;
    target: TargetConstraint;
    priority: Priority;
    inputs: Readonly<Record<string, InputMetadata>>;
    fields: Readonly<Record<string, FieldMetadata>>;
    allowNext: boolean;
}

const define = (
    opcode: string,
    shape: BlockShape,
    priority: Priority,
    inputs: Record<string, InputMetadata> = {},
    fields: Record<string, FieldMetadata> = {},
    target: TargetConstraint = 'any'
): OpcodeMetadata => ({
    opcode,
    shape,
    target,
    priority,
    inputs,
    fields,
    allowNext: shape === 'stack' || shape === 'hat'
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

    define('math_number', 'shadow', 'P0', {}, {NUM: FIELD()}),
    define('math_positive_number', 'shadow', 'P0', {}, {NUM: FIELD()}),
    define('math_whole_number', 'shadow', 'P0', {}, {NUM: FIELD()}),
    define('math_integer', 'shadow', 'P0', {}, {NUM: FIELD()}),
    define('math_angle', 'shadow', 'P0', {}, {NUM: FIELD()}),
    define('text', 'shadow', 'P0', {}, {TEXT: FIELD()}),
    define('event_broadcast_menu', 'shadow', 'P0', {}, {BROADCAST_OPTION: FIELD('broadcast')}),
    define('looks_costume', 'shadow', 'P0', {}, {COSTUME: FIELD()}),
    define('sound_sounds_menu', 'shadow', 'P0', {}, {SOUND_MENU: FIELD()}),
    define('sensing_keyoptions', 'shadow', 'P0', {}, {KEY_OPTION: FIELD()}),

    // P1 shadows / menus
    define('control_create_clone_of_menu', 'shadow', 'P1', {}, {CLONE_OPTION: FIELD()}),
    define('procedures_prototype', 'shadow', 'P1'),
    define('colour_picker', 'shadow', 'P1', {}, {COLOUR: FIELD()})
];

export const OPCODE_METADATA: Readonly<Record<string, OpcodeMetadata>> =
    Object.freeze(Object.fromEntries(entries.map(entry => [entry.opcode, Object.freeze(entry)])));

export const getOpcodeMetadata = (opcode: string): OpcodeMetadata | undefined =>
    OPCODE_METADATA[opcode];

export const P0_OPCODES = Object.freeze(
    entries.filter(entry => entry.priority === 'P0').map(entry => entry.opcode)
);

