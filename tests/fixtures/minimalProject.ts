import type {DslProject} from '../../src/validation/projectValidator.ts';

export const createMinimalProject = (): DslProject => ({
    schemaVersion: '1.0.0',
    project: {
        id: 'project-main',
        name: 'Minimal valid project'
    },
    stage: {
        id: 'target-stage',
        isStage: true,
        name: 'Stage',
        variables: [
            {
                id: 'var-global-score',
                name: 'score',
                value: 0,
                isCloud: false
            }
        ],
        lists: [],
        broadcasts: [
            {
                id: 'broadcast-start',
                name: 'start'
            }
        ],
        blocks: {
            'block-stage-flag': {
                id: 'block-stage-flag',
                opcode: 'event_whenflagclicked',
                next: 'block-stage-set',
                parent: null,
                inputs: {},
                fields: {},
                shadow: false,
                topLevel: true,
                x: 20,
                y: 20
            },
            'block-stage-set': {
                id: 'block-stage-set',
                opcode: 'data_setvariableto',
                next: null,
                parent: 'block-stage-flag',
                inputs: {
                    VALUE: {
                        block: 'shadow-stage-zero',
                        shadow: 'shadow-stage-zero'
                    }
                },
                fields: {
                    VARIABLE: {
                        value: 'score',
                        id: 'var-global-score'
                    }
                },
                shadow: false,
                topLevel: false
            },
            'shadow-stage-zero': {
                id: 'shadow-stage-zero',
                opcode: 'text',
                next: null,
                parent: 'block-stage-set',
                inputs: {},
                fields: {
                    TEXT: {
                        value: '0'
                    }
                },
                shadow: true,
                topLevel: false
            }
        },
        scripts: ['block-stage-flag'],
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
    sprites: [
        {
            id: 'target-sprite-one',
            isStage: false,
            name: 'Sprite1',
            variables: [],
            lists: [
                {
                    id: 'list-sprite-items',
                    name: 'items',
                    values: []
                }
            ],
            broadcasts: [],
            blocks: {
                'block-sprite-flag': {
                    id: 'block-sprite-flag',
                    opcode: 'event_whenflagclicked',
                    next: 'block-sprite-move',
                    parent: null,
                    inputs: {},
                    fields: {},
                    shadow: false,
                    topLevel: true,
                    x: 20,
                    y: 20
                },
                'block-sprite-move': {
                    id: 'block-sprite-move',
                    opcode: 'motion_movesteps',
                    next: null,
                    parent: 'block-sprite-flag',
                    inputs: {
                        STEPS: {
                            block: 'shadow-sprite-ten',
                            shadow: 'shadow-sprite-ten'
                        }
                    },
                    fields: {},
                    shadow: false,
                    topLevel: false
                },
                'shadow-sprite-ten': {
                    id: 'shadow-sprite-ten',
                    opcode: 'math_number',
                    next: null,
                    parent: 'block-sprite-move',
                    inputs: {},
                    fields: {
                        NUM: {
                            value: 10
                        }
                    },
                    shadow: true,
                    topLevel: false
                }
            },
            scripts: ['block-sprite-flag'],
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
            rotationStyle: 'all around'
        }
    ],
    assets: [],
    monitors: [],
    extensions: [],
    meta: {
        source: 'phase-0-test'
    }
});

