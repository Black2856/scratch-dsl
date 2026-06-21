import type {DslBlock, DslProject} from '../../src/validation/projectValidator.ts';

/**
 * Phase 5 fixtures: valid DSL projects exercising clone, custom procedure,
 * pen, and monitor opcodes. Each builder returns a project that passes
 * validateProject (warnings such as procedures_call's dynamic argument inputs
 * are allowed) so createProject() can build a live model from it.
 */

type Blocks = Record<string, DslBlock>;

const stageScaffold = (
    overrides: {
        blocks: Blocks;
        scripts: string[];
        variables?: DslProject['stage']['variables'];
        lists?: DslProject['stage']['lists'];
        monitors?: DslProject['monitors'];
        sprites?: DslProject['sprites'];
    }
): DslProject => ({
    schemaVersion: '1.0.0',
    project: {id: 'phase5-project', name: 'Phase 5 fixture'},
    stage: {
        id: 'target-stage',
        isStage: true,
        name: 'Stage',
        variables: overrides.variables ?? [],
        lists: overrides.lists ?? [],
        broadcasts: [],
        blocks: overrides.blocks,
        scripts: overrides.scripts,
        comments: [],
        currentCostume: 0,
        costumes: [],
        sounds: [],
        volume: 100,
        layerOrder: 0,
        tempo: 60,
        videoTransparency: 50,
        videoState: 'on',
        textToSpeechLanguage: null
    },
    sprites: overrides.sprites ?? [],
    assets: [],
    monitors: overrides.monitors ?? [],
    extensions: [],
    meta: {source: 'phase-5-test'}
});

const spriteScaffold = (
    id: string,
    name: string,
    blocks: Blocks,
    scripts: string[],
    extra: Partial<DslProject['sprites'][number]> = {}
): DslProject['sprites'][number] => ({
    id,
    isStage: false,
    name,
    variables: [],
    lists: [],
    broadcasts: [],
    blocks,
    scripts,
    comments: [],
    currentCostume: 0,
    costumes: [],
    sounds: [],
    volume: 100,
    layerOrder: 1,
    visible: true,
    x: 0,
    y: 0,
    size: 100,
    direction: 90,
    draggable: false,
    rotationStyle: 'all around',
    ...extra
});

const numberShadow = (id: string, parent: string, value: number): DslBlock => ({
    id,
    opcode: 'math_number',
    next: null,
    parent,
    inputs: {},
    fields: {NUM: {value}},
    shadow: true,
    topLevel: false
});

const wholeNumberShadow = (id: string, parent: string, value: number): DslBlock => ({
    id,
    opcode: 'math_whole_number',
    next: null,
    parent,
    inputs: {},
    fields: {NUM: {value}},
    shadow: true,
    topLevel: false
});

const textShadow = (id: string, parent: string, value: string): DslBlock => ({
    id,
    opcode: 'text',
    next: null,
    parent,
    inputs: {},
    fields: {TEXT: {value}},
    shadow: true,
    topLevel: false
});

// ---------------------------------------------------------------------------
// Clones
// ---------------------------------------------------------------------------

/**
 * Sprite "Hero": on green flag, clones itself once; every clone's
 * `start as clone` hat increments the stage-global `cloneCount` and stores
 * its own clone-local `localTag`. A second flag script proves the original
 * sprite never runs the clone hat (cloneCount only moves once per clone).
 */
export const createCloneProject = (): DslProject => {
    const heroBlocks: Blocks = {
        'flag-create': {
            id: 'flag-create',
            opcode: 'event_whenflagclicked',
            next: 'create-clone',
            parent: null,
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: true
        },
        'create-clone': {
            id: 'create-clone',
            opcode: 'control_create_clone_of',
            next: null,
            parent: 'flag-create',
            inputs: {CLONE_OPTION: {block: 'clone-menu', shadow: 'clone-menu'}},
            fields: {},
            shadow: false,
            topLevel: false
        },
        'clone-menu': {
            id: 'clone-menu',
            opcode: 'control_create_clone_of_menu',
            next: null,
            parent: 'create-clone',
            inputs: {},
            fields: {CLONE_OPTION: {value: '_myself_'}},
            shadow: true,
            topLevel: false
        },
        'start-clone': {
            id: 'start-clone',
            opcode: 'control_start_as_clone',
            next: 'count-clone',
            parent: null,
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: true
        },
        'count-clone': {
            id: 'count-clone',
            opcode: 'data_changevariableby',
            next: 'tag-clone',
            parent: 'start-clone',
            inputs: {VALUE: {block: 'count-one', shadow: 'count-one'}},
            fields: {VARIABLE: {value: 'cloneCount', id: 'var-clone-count'}},
            shadow: false,
            topLevel: false
        },
        'count-one': numberShadow('count-one', 'count-clone', 1),
        'tag-clone': {
            id: 'tag-clone',
            opcode: 'data_setvariableto',
            next: null,
            parent: 'count-clone',
            inputs: {VALUE: {block: 'tag-value', shadow: 'tag-value'}},
            fields: {VARIABLE: {value: 'localTag', id: 'var-local-tag'}},
            shadow: false,
            topLevel: false
        },
        'tag-value': textShadow('tag-value', 'tag-clone', 'clone')
    };

    return stageScaffold({
        blocks: {},
        scripts: [],
        variables: [{id: 'var-clone-count', name: 'cloneCount', value: 0, isCloud: false}],
        sprites: [
            spriteScaffold('sprite-hero', 'Hero', heroBlocks, ['flag-create', 'start-clone'], {
                variables: [{id: 'var-local-tag', name: 'localTag', value: '', isCloud: false}]
            })
        ]
    });
};

/** Bare sprite project (no scripts) used to drive CloneManager directly. */
export const createBareSpriteProject = (): DslProject =>
    stageScaffold({
        blocks: {},
        scripts: [],
        sprites: [spriteScaffold('sprite-bare', 'Bare', {}, [])]
    });

// ---------------------------------------------------------------------------
// Procedures
// ---------------------------------------------------------------------------

interface ProcedureOptions {
    proccode: string;
    argumentIds: string[];
    argumentNames: string[];
    argumentDefaults: string[];
    warp: boolean;
    body: Blocks;
    bodyFirstId: string | null;
    callInputs: Record<string, DslBlock['inputs'][string]>;
    callArgBlocks: Blocks;
    variables: DslProject['stage']['variables'];
}

/**
 * Generic single-definition procedure project on the stage. A green-flag
 * script calls the custom block; the definition's body is supplied by the
 * caller. Used for argument-passing and warp tests.
 */
const procedureProject = (options: ProcedureOptions): DslProject => {
    const blocks: Blocks = {
        'proc-def': {
            id: 'proc-def',
            opcode: 'procedures_definition',
            next: options.bodyFirstId,
            parent: null,
            inputs: {custom_block: {block: 'proc-proto', shadow: 'proc-proto'}},
            fields: {},
            shadow: false,
            topLevel: true
        },
        'proc-proto': {
            id: 'proc-proto',
            opcode: 'procedures_prototype',
            next: null,
            parent: 'proc-def',
            inputs: {},
            fields: {},
            shadow: true,
            topLevel: false,
            mutation: {
                tagName: 'mutation',
                children: [],
                proccode: options.proccode,
                argumentids: JSON.stringify(options.argumentIds),
                argumentnames: JSON.stringify(options.argumentNames),
                argumentdefaults: JSON.stringify(options.argumentDefaults),
                warp: options.warp ? 'true' : 'false'
            }
        },
        'flag-call': {
            id: 'flag-call',
            opcode: 'event_whenflagclicked',
            next: 'call-proc',
            parent: null,
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: true
        },
        'call-proc': {
            id: 'call-proc',
            opcode: 'procedures_call',
            next: null,
            parent: 'flag-call',
            inputs: options.callInputs,
            fields: {},
            shadow: false,
            topLevel: false,
            mutation: {
                tagName: 'mutation',
                children: [],
                proccode: options.proccode,
                argumentids: JSON.stringify(options.argumentIds),
                warp: options.warp ? 'true' : 'false'
            }
        },
        ...options.body,
        ...options.callArgBlocks
    };

    return stageScaffold({
        blocks,
        scripts: ['proc-def', 'flag-call'],
        variables: options.variables
    });
};

/**
 * `store %s`: stores its single string argument `n` into the stage variable
 * `result` via an argument reporter, proving the call binds arguments into the
 * procedure frame.
 */
export const createProcedureArgProject = (): DslProject =>
    procedureProject({
        proccode: 'store %s',
        argumentIds: ['arg-n'],
        argumentNames: ['n'],
        argumentDefaults: [''],
        warp: false,
        bodyFirstId: 'set-result',
        body: {
            'set-result': {
                id: 'set-result',
                opcode: 'data_setvariableto',
                next: null,
                parent: 'proc-def',
                inputs: {VALUE: {block: 'read-n', shadow: null}},
                fields: {VARIABLE: {value: 'result', id: 'var-result'}},
                shadow: false,
                topLevel: false
            },
            'read-n': {
                id: 'read-n',
                opcode: 'argument_reporter_string_number',
                next: null,
                parent: 'set-result',
                inputs: {},
                fields: {VALUE: {value: 'n'}},
                shadow: false,
                topLevel: false
            }
        },
        callInputs: {'arg-n': {block: 'call-text', shadow: 'call-text'}},
        callArgBlocks: {'call-text': textShadow('call-text', 'call-proc', 'hello')},
        variables: [{id: 'var-result', name: 'result', value: '', isCloud: false}]
    });

/**
 * Warp `countUp`: `repeat 5 { change warpCounter by 1 }`. Under warp the whole
 * loop finishes in a single tick.
 */
export const createWarpLoopProject = (warp: boolean): DslProject =>
    procedureProject({
        proccode: 'countUp',
        argumentIds: [],
        argumentNames: [],
        argumentDefaults: [],
        warp,
        bodyFirstId: 'warp-repeat',
        body: {
            'warp-repeat': {
                id: 'warp-repeat',
                opcode: 'control_repeat',
                next: null,
                parent: 'proc-def',
                inputs: {
                    TIMES: {block: 'warp-times', shadow: 'warp-times'},
                    SUBSTACK: {block: 'warp-change', shadow: null}
                },
                fields: {},
                shadow: false,
                topLevel: false
            },
            'warp-times': wholeNumberShadow('warp-times', 'warp-repeat', 5),
            'warp-change': {
                id: 'warp-change',
                opcode: 'data_changevariableby',
                next: null,
                parent: 'warp-repeat',
                inputs: {VALUE: {block: 'warp-one', shadow: 'warp-one'}},
                fields: {VARIABLE: {value: 'warpCounter', id: 'var-warp-counter'}},
                shadow: false,
                topLevel: false
            },
            'warp-one': numberShadow('warp-one', 'warp-change', 1)
        },
        callInputs: {},
        callArgBlocks: {},
        variables: [{id: 'var-warp-counter', name: 'warpCounter', value: 0, isCloud: false}]
    });

/**
 * Warp `gatedWait`: `change beforeWait by 1; wait 1s; change afterWait by 1`.
 * Proves warp still honours an explicit time wait (afterWait stays 0 until the
 * wait elapses across ticks).
 */
export const createWarpWaitProject = (): DslProject =>
    procedureProject({
        proccode: 'gatedWait',
        argumentIds: [],
        argumentNames: [],
        argumentDefaults: [],
        warp: true,
        bodyFirstId: 'before-wait',
        body: {
            'before-wait': {
                id: 'before-wait',
                opcode: 'data_changevariableby',
                next: 'the-wait',
                parent: 'proc-def',
                inputs: {VALUE: {block: 'before-one', shadow: 'before-one'}},
                fields: {VARIABLE: {value: 'beforeWait', id: 'var-before-wait'}},
                shadow: false,
                topLevel: false
            },
            'before-one': numberShadow('before-one', 'before-wait', 1),
            'the-wait': {
                id: 'the-wait',
                opcode: 'control_wait',
                next: 'after-wait',
                parent: 'before-wait',
                inputs: {DURATION: {block: 'wait-secs', shadow: 'wait-secs'}},
                fields: {},
                shadow: false,
                topLevel: false
            },
            'wait-secs': {
                id: 'wait-secs',
                opcode: 'math_positive_number',
                next: null,
                parent: 'the-wait',
                inputs: {},
                fields: {NUM: {value: 1}},
                shadow: true,
                topLevel: false
            },
            'after-wait': {
                id: 'after-wait',
                opcode: 'data_changevariableby',
                next: null,
                parent: 'the-wait',
                inputs: {VALUE: {block: 'after-one', shadow: 'after-one'}},
                fields: {VARIABLE: {value: 'afterWait', id: 'var-after-wait'}},
                shadow: false,
                topLevel: false
            },
            'after-one': numberShadow('after-one', 'after-wait', 1)
        },
        callInputs: {},
        callArgBlocks: {},
        variables: [
            {id: 'var-before-wait', name: 'beforeWait', value: 0, isCloud: false},
            {id: 'var-after-wait', name: 'afterWait', value: 0, isCloud: false}
        ]
    });

// ---------------------------------------------------------------------------
// Pen
// ---------------------------------------------------------------------------

/**
 * Sprite that on green flag sets pen colour + size and puts the pen down, then
 * stamps. Drives the pen primitives and the renderer pen port.
 */
export const createPenProject = (): DslProject => {
    const penBlocks: Blocks = {
        'flag-pen': {
            id: 'flag-pen',
            opcode: 'event_whenflagclicked',
            next: 'pen-clear',
            parent: null,
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: true
        },
        'pen-clear': {
            id: 'pen-clear',
            opcode: 'pen_clear',
            next: 'pen-color',
            parent: 'flag-pen',
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: false
        },
        'pen-color': {
            id: 'pen-color',
            opcode: 'pen_setPenColorToColor',
            next: 'pen-size',
            parent: 'pen-clear',
            inputs: {COLOR: {block: 'color-shadow', shadow: 'color-shadow'}},
            fields: {},
            shadow: false,
            topLevel: false
        },
        'color-shadow': {
            id: 'color-shadow',
            opcode: 'colour_picker',
            next: null,
            parent: 'pen-color',
            inputs: {},
            fields: {COLOUR: {value: '#ff0000'}},
            shadow: true,
            topLevel: false
        },
        'pen-size': {
            id: 'pen-size',
            opcode: 'pen_setPenSizeTo',
            next: 'pen-down',
            parent: 'pen-color',
            inputs: {SIZE: {block: 'size-shadow', shadow: 'size-shadow'}},
            fields: {},
            shadow: false,
            topLevel: false
        },
        'size-shadow': numberShadow('size-shadow', 'pen-size', 10),
        'pen-down': {
            id: 'pen-down',
            opcode: 'pen_penDown',
            next: 'pen-stamp',
            parent: 'pen-size',
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: false
        },
        'pen-stamp': {
            id: 'pen-stamp',
            opcode: 'pen_stamp',
            next: null,
            parent: 'pen-down',
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: false
        }
    };

    return stageScaffold({
        blocks: {},
        scripts: [],
        sprites: [spriteScaffold('sprite-pen', 'Pen', penBlocks, ['flag-pen'], {x: 0, y: 0})]
    });
};

// ---------------------------------------------------------------------------
// Monitors
// ---------------------------------------------------------------------------

/**
 * Stage script: show variable `a`, show list `c`, hide variable `b`. Verifies
 * monitor visibility upserts for both shown and hidden monitors.
 */
export const createMonitorProject = (): DslProject => {
    const blocks: Blocks = {
        'flag-monitor': {
            id: 'flag-monitor',
            opcode: 'event_whenflagclicked',
            next: 'show-a',
            parent: null,
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: true
        },
        'show-a': {
            id: 'show-a',
            opcode: 'data_showvariable',
            next: 'show-c',
            parent: 'flag-monitor',
            inputs: {},
            fields: {VARIABLE: {value: 'a', id: 'var-a'}},
            shadow: false,
            topLevel: false
        },
        'show-c': {
            id: 'show-c',
            opcode: 'data_showlist',
            next: 'hide-b',
            parent: 'show-a',
            inputs: {},
            fields: {LIST: {value: 'c', id: 'list-c'}},
            shadow: false,
            topLevel: false
        },
        'hide-b': {
            id: 'hide-b',
            opcode: 'data_hidevariable',
            next: null,
            parent: 'show-c',
            inputs: {},
            fields: {VARIABLE: {value: 'b', id: 'var-b'}},
            shadow: false,
            topLevel: false
        }
    };

    return stageScaffold({
        blocks,
        scripts: ['flag-monitor'],
        variables: [
            {id: 'var-a', name: 'a', value: 0, isCloud: false},
            {id: 'var-b', name: 'b', value: 0, isCloud: false}
        ],
        lists: [{id: 'list-c', name: 'c', values: []}]
    });
};
