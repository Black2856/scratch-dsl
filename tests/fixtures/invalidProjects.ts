import type {DslProject} from '../../src/validation/projectValidator.ts';
import {createMinimalProject} from './minimalProject.ts';

export const createDanglingReferenceProject = (): DslProject => {
    const project = createMinimalProject();
    project.stage.blocks['block-stage-flag'].next = 'block-does-not-exist';
    return project;
};

export const createDuplicateIdProject = (): DslProject => {
    const project = createMinimalProject();
    project.sprites[0].variables.push({
        id: 'var-global-score',
        name: 'duplicate',
        value: 0,
        isCloud: false
    });
    return project;
};

export const createScopeViolationProject = (): DslProject => {
    const project = createMinimalProject();
    project.stage.blocks['block-stage-set'].fields.VARIABLE = {
        value: 'sprite-only',
        id: 'var-sprite-only'
    };
    project.sprites[0].variables.push({
        id: 'var-sprite-only',
        name: 'sprite-only',
        value: 1,
        isCloud: false
    });
    return project;
};

export const createBlockCycleProject = (): DslProject => {
    const project = createMinimalProject();
    project.stage.blocks['block-stage-set'].next = 'block-stage-flag';
    return project;
};
