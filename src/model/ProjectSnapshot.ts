import type {DslProject, DslTarget} from '../validation/projectValidator.ts';
import type {Project} from './Project.ts';
import type {Stage} from './Stage.ts';
import type {Sprite} from './Sprite.ts';
import type {Target} from './Target.ts';

const targetToDsl = (target: Target): DslTarget => ({
    id: target.id,
    isStage: target.isStage,
    name: target.name,
    variables: target.variables.toArray(),
    lists: target.lists.toArray(),
    broadcasts: [],
    blocks: target.blocks.toRecord(),
    scripts: target.blocks.getScripts(),
    comments: [...target.comments],
    currentCostume: target.currentCostume,
    costumes: [...target.costumes],
    sounds: [...target.sounds],
    volume: target.volume,
    layerOrder: target.layerOrder
});

const stageToDsl = (stage: Stage, broadcasts: DslProject['stage']['broadcasts']): DslProject['stage'] => ({
    ...targetToDsl(stage),
    isStage: true,
    broadcasts,
    tempo: stage.tempo,
    videoTransparency: stage.videoTransparency,
    videoState: stage.videoState,
    textToSpeechLanguage: stage.textToSpeechLanguage
});

const spriteToDsl = (sprite: Sprite): DslProject['sprites'][number] => ({
    ...targetToDsl(sprite),
    isStage: false,
    broadcasts: [],
    visible: sprite.visible,
    x: sprite.x,
    y: sprite.y,
    size: sprite.size,
    direction: sprite.direction,
    draggable: sprite.draggable,
    rotationStyle: sprite.rotationStyle
});

/**
 * Converts a Project domain model back into a plain DSL document. No IDs
 * are ever regenerated: every id/blockId/variableId/etc. is copied verbatim
 * from the model, which itself copied them verbatim from the DSL that
 * ProjectFactory.createProject consumed. This makes
 * toSnapshot(createProject(dsl)) round-trip to a structure that is
 * deep-equal to the original dsl.
 */
export const toSnapshot = (project: Project): DslProject => ({
    schemaVersion: '1.0.0',
    project: {
        id: project.id,
        name: project.name
    },
    stage: stageToDsl(project.stage, project.broadcasts.toArray()),
    sprites: project.sprites.map(spriteToDsl),
    assets: [...project.assets],
    monitors: [...project.monitors],
    extensions: [...project.extensions],
    meta: project.meta
});
