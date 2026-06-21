import type {DslBlock, DslProject} from '../../src/validation/projectValidator.ts';
import {createMinimalProject} from './minimalProject.ts';
import {
    createCloneProject,
    createPenProject,
    createProcedureArgProject
} from './phase5Projects.ts';
import {createFullFeatureProject} from './sb3Projects.ts';
import {
    SAMPLE_COSTUME_ASSET_ID,
    SAMPLE_COSTUME_MD5EXT,
    SAMPLE_COSTUME_SOURCE,
    SAMPLE_SOUND_ASSET_ID,
    SAMPLE_SOUND_MD5EXT,
    SAMPLE_SOUND_SOURCE
} from './phase7SampleAssets.ts';

export const PHASE7_FIXTURE_NAMES = [
    'hello-world',
    'motion-basic',
    'variable-score',
    'broadcast-basic',
    'list-basic',
    'keyboard-control',
    'procedure-basic',
    'clone-basic',
    'pen-basic',
    'sound-basic',
    'full-feature-minimal'
] as const;

export type Phase7FixtureName = typeof PHASE7_FIXTURE_NAMES[number];

type Blocks = Record<string, DslBlock>;

const block = (
    id: string,
    opcode: string,
    next: string | null,
    parent: string | null,
    inputs: DslBlock['inputs'] = {},
    fields: DslBlock['fields'] = {},
    topLevel = false,
    shadow = false
): DslBlock => ({id, opcode, next, parent, inputs, fields, topLevel, shadow});

const shadow = (
    id: string,
    opcode: string,
    parent: string,
    field: string,
    value: string | number | boolean
): DslBlock => block(id, opcode, null, parent, {}, {[field]: {value}}, false, true);

const cleanProject = (
    id: string,
    name: string,
    withSprite = false
): DslProject => {
    const project = createMinimalProject();
    project.project = {id, name};
    project.stage.variables = [];
    project.stage.lists = [];
    project.stage.broadcasts = [];
    project.stage.blocks = {};
    project.stage.scripts = [];
    project.stage.costumes = [];
    project.stage.sounds = [];
    project.sprites = withSprite ? [project.sprites[0]] : [];
    if (withSprite) {
        const sprite = project.sprites[0];
        sprite.id = `${id}-sprite`;
        sprite.name = 'Sprite';
        sprite.variables = [];
        sprite.lists = [];
        sprite.blocks = {};
        sprite.scripts = [];
        sprite.costumes = [];
        sprite.sounds = [];
        sprite.x = 0;
        sprite.y = 0;
    }
    project.assets = [];
    project.monitors = [];
    project.extensions = [];
    project.meta = {source: `phase-7:${id}`};
    return project;
};

const addWorkspaceCostume = (project: DslProject): void => {
    const sprite = project.sprites[0];
    sprite.costumes = [{
        id: `${project.project.id}-costume-a`,
        name: 'Determination A',
        assetId: SAMPLE_COSTUME_ASSET_ID,
        dataFormat: 'png',
        md5ext: SAMPLE_COSTUME_MD5EXT,
        bitmapResolution: 1,
        rotationCenterX: 9,
        rotationCenterY: 14
    }];
    project.assets.push({
        id: SAMPLE_COSTUME_ASSET_ID,
        kind: 'costume',
        dataFormat: 'png',
        md5ext: SAMPLE_COSTUME_MD5EXT,
        source: SAMPLE_COSTUME_SOURCE
    });
};

const addWorkspaceSound = (project: DslProject): void => {
    const sprite = project.sprites[0];
    sprite.sounds = [{
        id: `${project.project.id}-sound-effect`,
        name: 'Cursor Move 6',
        assetId: SAMPLE_SOUND_ASSET_ID,
        dataFormat: 'mp3',
        md5ext: SAMPLE_SOUND_MD5EXT,
        format: '',
        rate: 44100,
        sampleCount: 1
    }];
    project.assets.push({
        id: SAMPLE_SOUND_ASSET_ID,
        kind: 'sound',
        dataFormat: 'mp3',
        md5ext: SAMPLE_SOUND_MD5EXT,
        source: SAMPLE_SOUND_SOURCE
    });
};

export const createHelloWorldProject = (): DslProject => {
    const project = cleanProject('hello-world', 'Hello world');
    project.stage.variables = [{
        id: 'hello-message',
        name: 'message',
        value: '',
        isCloud: false
    }];
    project.stage.blocks = {
        flag: block('flag', 'event_whenflagclicked', 'set-message', null, {}, {}, true),
        'set-message': block(
            'set-message',
            'data_setvariableto',
            'show-message',
            'flag',
            {VALUE: {block: 'hello-text', shadow: 'hello-text'}},
            {VARIABLE: {value: 'message', id: 'hello-message'}}
        ),
        'hello-text': shadow('hello-text', 'text', 'set-message', 'TEXT', 'Hello, world!'),
        'show-message': block(
            'show-message',
            'data_showvariable',
            null,
            'set-message',
            {},
            {VARIABLE: {value: 'message', id: 'hello-message'}}
        )
    };
    project.stage.scripts = ['flag'];
    project.monitors = [{
        id: 'hello-monitor',
        opcode: 'data_variable',
        visible: false,
        mode: 'default',
        params: {VARIABLE: 'message'},
        spriteName: null,
        value: '',
        width: 0,
        height: 0,
        x: 5,
        y: 5,
        sliderMin: 0,
        sliderMax: 100,
        isDiscrete: true
    }];
    return project;
};

export const createMotionBasicProject = (): DslProject => {
    const project = cleanProject('motion-basic', 'Motion basic', true);
    const sprite = project.sprites[0];
    sprite.x = -40;
    sprite.y = 20;
    sprite.blocks = {
        flag: block('flag', 'event_whenflagclicked', 'go-xy', null, {}, {}, true),
        'go-xy': block(
            'go-xy',
            'motion_gotoxy',
            'move-steps',
            'flag',
            {
                X: {block: 'x-value', shadow: 'x-value'},
                Y: {block: 'y-value', shadow: 'y-value'}
            }
        ),
        'x-value': shadow('x-value', 'math_number', 'go-xy', 'NUM', 40),
        'y-value': shadow('y-value', 'math_number', 'go-xy', 'NUM', 20),
        'move-steps': block(
            'move-steps',
            'motion_movesteps',
            null,
            'go-xy',
            {STEPS: {block: 'steps-value', shadow: 'steps-value'}}
        ),
        'steps-value': shadow('steps-value', 'math_number', 'move-steps', 'NUM', 10)
    };
    sprite.scripts = ['flag'];
    addWorkspaceCostume(project);
    return project;
};

export const createVariableScoreProject = (): DslProject => {
    const project = cleanProject('variable-score', 'Variable score');
    project.stage.variables = [{
        id: 'score',
        name: 'score',
        value: 0,
        isCloud: false
    }];
    project.stage.blocks = {
        flag: block('flag', 'event_whenflagclicked', 'set-score', null, {}, {}, true),
        'set-score': block(
            'set-score',
            'data_setvariableto',
            'change-score',
            'flag',
            {VALUE: {block: 'ten', shadow: 'ten'}},
            {VARIABLE: {value: 'score', id: 'score'}}
        ),
        ten: shadow('ten', 'text', 'set-score', 'TEXT', 10),
        'change-score': block(
            'change-score',
            'data_changevariableby',
            null,
            'set-score',
            {VALUE: {block: 'five', shadow: 'five'}},
            {VARIABLE: {value: 'score', id: 'score'}}
        ),
        five: shadow('five', 'math_number', 'change-score', 'NUM', 5)
    };
    project.stage.scripts = ['flag'];
    return project;
};

export const createBroadcastBasicProject = (): DslProject => {
    const project = cleanProject('broadcast-basic', 'Broadcast basic');
    project.stage.variables = [{
        id: 'received',
        name: 'received',
        value: '',
        isCloud: false
    }];
    project.stage.broadcasts = [{id: 'message-start', name: 'start'}];
    project.stage.blocks = {
        flag: block('flag', 'event_whenflagclicked', 'broadcast', null, {}, {}, true),
        broadcast: block(
            'broadcast',
            'event_broadcast',
            null,
            'flag',
            {BROADCAST_INPUT: {block: 'broadcast-menu', shadow: 'broadcast-menu'}}
        ),
        'broadcast-menu': block(
            'broadcast-menu',
            'event_broadcast_menu',
            null,
            'broadcast',
            {},
            {BROADCAST_OPTION: {value: 'start', id: 'message-start'}},
            false,
            true
        ),
        receive: block(
            'receive',
            'event_whenbroadcastreceived',
            'set-received',
            null,
            {},
            {BROADCAST_OPTION: {value: 'start', id: 'message-start'}},
            true
        ),
        'set-received': block(
            'set-received',
            'data_setvariableto',
            null,
            'receive',
            {VALUE: {block: 'yes', shadow: 'yes'}},
            {VARIABLE: {value: 'received', id: 'received'}}
        ),
        yes: shadow('yes', 'text', 'set-received', 'TEXT', 'yes')
    };
    project.stage.scripts = ['flag', 'receive'];
    return project;
};

export const createListBasicProject = (): DslProject => {
    const project = cleanProject('list-basic', 'List basic');
    project.stage.lists = [{id: 'items', name: 'items', values: []}];
    project.stage.blocks = {
        flag: block('flag', 'event_whenflagclicked', 'add-alpha', null, {}, {}, true),
        'add-alpha': block(
            'add-alpha',
            'data_addtolist',
            'add-beta',
            'flag',
            {ITEM: {block: 'alpha', shadow: 'alpha'}},
            {LIST: {value: 'items', id: 'items'}}
        ),
        alpha: shadow('alpha', 'text', 'add-alpha', 'TEXT', 'alpha'),
        'add-beta': block(
            'add-beta',
            'data_addtolist',
            null,
            'add-alpha',
            {ITEM: {block: 'beta', shadow: 'beta'}},
            {LIST: {value: 'items', id: 'items'}}
        ),
        beta: shadow('beta', 'text', 'add-beta', 'TEXT', 'beta')
    };
    project.stage.scripts = ['flag'];
    return project;
};

export const createKeyboardControlProject = (): DslProject => {
    const project = cleanProject('keyboard-control', 'Keyboard control', true);
    const sprite = project.sprites[0];
    sprite.variables = [{
        id: 'key-state',
        name: 'key state',
        value: '',
        isCloud: false
    }];
    sprite.blocks = {
        'key-hat': block(
            'key-hat',
            'event_whenkeypressed',
            'set-key-state',
            null,
            {},
            {KEY_OPTION: {value: 'right arrow'}},
            true
        ),
        'set-key-state': block(
            'set-key-state',
            'data_setvariableto',
            null,
            'key-hat',
            {VALUE: {block: 'pressed', shadow: 'pressed'}},
            {VARIABLE: {value: 'key state', id: 'key-state'}}
        ),
        pressed: shadow('pressed', 'text', 'set-key-state', 'TEXT', 'pressed')
    };
    sprite.scripts = ['key-hat'];
    addWorkspaceCostume(project);
    return project;
};

export const createProcedureBasicProject = (): DslProject => {
    const project = createProcedureArgProject();
    project.project = {id: 'procedure-basic', name: 'Procedure basic'};
    project.meta = {source: 'phase-7:procedure-basic'};
    return project;
};

export const createCloneBasicProject = (): DslProject => {
    const project = createCloneProject();
    project.project = {id: 'clone-basic', name: 'Clone basic'};
    project.meta = {source: 'phase-7:clone-basic'};
    addWorkspaceCostume(project);
    return project;
};

export const createPenBasicProject = (): DslProject => {
    const project = createPenProject();
    project.project = {id: 'pen-basic', name: 'Pen basic'};
    project.meta = {source: 'phase-7:pen-basic'};
    project.extensions = ['pen'];
    return project;
};

export const createSoundBasicProject = (): DslProject => {
    const project = cleanProject('sound-basic', 'Sound basic', true);
    const sprite = project.sprites[0];
    sprite.blocks = {
        flag: block('flag', 'event_whenflagclicked', 'play-sound', null, {}, {}, true),
        'play-sound': block(
            'play-sound',
            'sound_play',
            null,
            'flag',
            {SOUND_MENU: {block: 'sound-menu', shadow: 'sound-menu'}}
        ),
        'sound-menu': block(
            'sound-menu',
            'sound_sounds_menu',
            null,
            'play-sound',
            {},
            {SOUND_MENU: {value: 'Cursor Move 6'}},
            false,
            true
        )
    };
    sprite.scripts = ['flag'];
    addWorkspaceSound(project);
    return project;
};

export const createFullFeatureMinimalProject = (): DslProject => {
    const project = createFullFeatureProject();
    project.project = {id: 'full-feature-minimal', name: 'Full feature minimal'};
    project.meta = {source: 'phase-7:full-feature-minimal'};
    project.assets = [];
    const sprite = project.sprites[0];
    sprite.costumes = [];
    sprite.sounds = [];
    addWorkspaceCostume(project);
    addWorkspaceSound(project);

    sprite.blocks['pen-down-cat'].next = 'play-sound';
    sprite.blocks['play-sound'] = block(
        'play-sound',
        'sound_play',
        'create-clone',
        'pen-down-cat',
        {SOUND_MENU: {block: 'sound-menu', shadow: 'sound-menu'}}
    );
    sprite.blocks['sound-menu'] = block(
        'sound-menu',
        'sound_sounds_menu',
        null,
        'play-sound',
        {},
        {SOUND_MENU: {value: 'Cursor Move 6'}},
        false,
        true
    );
    sprite.blocks['create-clone'] = block(
        'create-clone',
        'control_create_clone_of',
        null,
        'play-sound',
        {CLONE_OPTION: {block: 'clone-menu', shadow: 'clone-menu'}}
    );
    sprite.blocks['clone-menu'] = block(
        'clone-menu',
        'control_create_clone_of_menu',
        null,
        'create-clone',
        {},
        {CLONE_OPTION: {value: '_myself_'}},
        false,
        true
    );
    sprite.blocks['start-clone'] = block(
        'start-clone',
        'control_start_as_clone',
        'clone-score',
        null,
        {},
        {},
        true
    );
    sprite.blocks['clone-score'] = block(
        'clone-score',
        'data_changevariableby',
        null,
        'start-clone',
        {VALUE: {block: 'clone-one', shadow: 'clone-one'}},
        {VARIABLE: {value: 'score', id: 'var-score'}}
    );
    sprite.blocks['clone-one'] = shadow(
        'clone-one',
        'math_number',
        'clone-score',
        'NUM',
        1
    );
    sprite.scripts.push('start-clone');
    return project;
};

export const PHASE7_FIXTURE_BUILDERS: Record<Phase7FixtureName, () => DslProject> = {
    'hello-world': createHelloWorldProject,
    'motion-basic': createMotionBasicProject,
    'variable-score': createVariableScoreProject,
    'broadcast-basic': createBroadcastBasicProject,
    'list-basic': createListBasicProject,
    'keyboard-control': createKeyboardControlProject,
    'procedure-basic': createProcedureBasicProject,
    'clone-basic': createCloneBasicProject,
    'pen-basic': createPenBasicProject,
    'sound-basic': createSoundBasicProject,
    'full-feature-minimal': createFullFeatureMinimalProject
};

export const createPhase7Fixture = (name: Phase7FixtureName): DslProject =>
    PHASE7_FIXTURE_BUILDERS[name]();
