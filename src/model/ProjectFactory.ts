import {validateProject, type DslProject, type DslTarget} from '../validation/projectValidator.ts';
import {BlockContainer} from './BlockContainer.ts';
import {VariableStore} from './VariableStore.ts';
import {ListStore} from './ListStore.ts';
import {BroadcastStore} from './BroadcastStore.ts';
import {Target} from './Target.ts';
import {Stage} from './Stage.ts';
import {Sprite, SPRITE_DEFAULTS} from './Sprite.ts';
import {Project} from './Project.ts';

const buildCommonOptions = (target: DslTarget, isStage: boolean) => ({
    id: target.id,
    name: target.name,
    isStage,
    blocks: new BlockContainer(target.blocks, target.scripts),
    variables: new VariableStore(target.variables),
    lists: new ListStore(target.lists),
    comments: target.comments,
    currentCostume: target.currentCostume,
    costumes: target.costumes,
    sounds: target.sounds,
    volume: target.volume,
    layerOrder: target.layerOrder
});

const buildStage = (dsl: DslProject['stage']): Stage =>
    new Stage({
        ...buildCommonOptions(dsl, true),
        isStage: true,
        tempo: dsl.tempo,
        videoTransparency: dsl.videoTransparency,
        videoState: dsl.videoState,
        textToSpeechLanguage: dsl.textToSpeechLanguage
    });

const buildSprite = (dsl: DslProject['sprites'][number]): Sprite =>
    new Sprite({
        ...buildCommonOptions(dsl, false),
        isStage: false,
        visible: dsl.visible ?? SPRITE_DEFAULTS.visible,
        x: dsl.x ?? SPRITE_DEFAULTS.x,
        y: dsl.y ?? SPRITE_DEFAULTS.y,
        size: dsl.size ?? SPRITE_DEFAULTS.size,
        direction: dsl.direction ?? SPRITE_DEFAULTS.direction,
        draggable: dsl.draggable ?? SPRITE_DEFAULTS.draggable,
        rotationStyle: dsl.rotationStyle ?? SPRITE_DEFAULTS.rotationStyle
    });

/**
 * Builds a Project domain model from a DSL document. Always runs
 * validateProject first; an invalid DSL throws with the validator's
 * diagnostics attached so callers get a machine-readable failure reason
 * instead of a partially constructed model.
 */
export const createProject = (dsl: DslProject): Project => {
    const result = validateProject(dsl);
    if (!result.valid) {
        const error = new Error(
            `Cannot create Project: DSL failed validation.\n${
                result.diagnostics.map(d => `[${d.code}] ${d.path}: ${d.message}`).join('\n')
            }`
        );
        (error as Error & {diagnostics: typeof result.diagnostics}).diagnostics = result.diagnostics;
        throw error;
    }

    const project = result.project as DslProject;
    const stage = buildStage(project.stage);
    const sprites = project.sprites.map(buildSprite);
    const broadcasts = new BroadcastStore(project.stage.broadcasts);

    return new Project({
        id: project.project.id,
        name: project.project.name,
        stage,
        sprites,
        broadcasts,
        assets: project.assets,
        monitors: project.monitors,
        extensions: project.extensions,
        meta: project.meta
    });
};

export type {Target};
