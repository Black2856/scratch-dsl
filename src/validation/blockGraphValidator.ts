import {
    getOpcodeMetadata,
    type FieldReference,
    type OpcodeMetadata
} from '../blocks/opcodeMetadata.ts';

export type DiagnosticSeverity = 'error' | 'warning';

export interface Diagnostic {
    code: string;
    severity: DiagnosticSeverity;
    path: string;
    entityId: string | null;
    opcode: string | null;
    message: string;
}

export interface DslField {
    value: string | number | boolean;
    id?: string | null;
}

export interface DslInput {
    block: string | null;
    shadow: string | null;
}

export interface DslBlock {
    id: string;
    opcode: string;
    next: string | null;
    parent: string | null;
    inputs: Record<string, DslInput>;
    fields: Record<string, DslField>;
    shadow: boolean;
    topLevel: boolean;
    x?: number;
    y?: number;
    mutation?: Record<string, unknown>;
    comment?: string;
    /**
     * Unknown SB3 block fields preserved verbatim by import (Phase 8) so they
     * can be re-emitted on export. Not interpreted by validation or Runtime;
     * the serializer merges these back into the block.
     */
    opaque?: Record<string, unknown>;
}

export interface ValidationScope {
    variables: ReadonlySet<string>;
    lists: ReadonlySet<string>;
    broadcasts: ReadonlySet<string>;
}

export interface BlockGraphTarget {
    id: string;
    isStage: boolean;
    blocks: Record<string, DslBlock>;
    scripts: string[];
}

const diagnostic = (
    code: string,
    severity: DiagnosticSeverity,
    path: string,
    block: DslBlock | null,
    message: string,
    entityId?: string
): Diagnostic => ({
    code,
    severity,
    path,
    entityId: entityId ?? block?.id ?? null,
    opcode: block?.opcode ?? null,
    message
});

const referencesForBlock = (block: DslBlock): Array<{id: string; path: string}> => {
    const references: Array<{id: string; path: string}> = [];
    if (block.next) references.push({id: block.next, path: 'next'});
    for (const [inputName, input] of Object.entries(block.inputs)) {
        if (input.block) references.push({id: input.block, path: `inputs.${inputName}.block`});
        if (input.shadow && input.shadow !== input.block) {
            references.push({id: input.shadow, path: `inputs.${inputName}.shadow`});
        }
    }
    return references;
};

const scopeForReference = (
    reference: FieldReference,
    scope: ValidationScope
): ReadonlySet<string> => {
    if (reference === 'variable') return scope.variables;
    if (reference === 'list') return scope.lists;
    return scope.broadcasts;
};

const parseStringArray = (value: unknown): string[] | null => {
    if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
        return value;
    }
    if (typeof value !== 'string') return null;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) && parsed.every(item => typeof item === 'string') ?
            parsed :
            null;
    } catch {
        return null;
    }
};

const validateProcedureMutations = (
    target: BlockGraphTarget,
    targetPath: string
): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    const prototypes = new Map<string, {block: DslBlock; argumentIds: string[]}>();

    for (const block of Object.values(target.blocks)) {
        if (block.opcode !== 'procedures_prototype') continue;
        const mutation = block.mutation ?? {};
        const proccode = mutation.proccode;
        const argumentIds = parseStringArray(mutation.argumentids);
        const argumentNames = parseStringArray(mutation.argumentnames);

        if (typeof proccode !== 'string' || proccode.length === 0) {
            diagnostics.push(diagnostic(
                'procedure.invalid-proccode',
                'error',
                `${targetPath}.blocks.${block.id}.mutation.proccode`,
                block,
                'Procedure prototype requires a non-empty proccode.'
            ));
            continue;
        }
        // The real invariant Scratch maintains is argument ids ↔ names parity
        // (each parameter has both). `argumentdefaults` is editor-only default
        // input values, and real projects ship prototypes whose defaults array
        // length differs from the argument count; Scratch tolerates that, so we
        // do not gate on it.
        if (!argumentIds || !argumentNames || argumentIds.length !== argumentNames.length) {
            diagnostics.push(diagnostic(
                'procedure.invalid-arguments',
                'error',
                `${targetPath}.blocks.${block.id}.mutation`,
                block,
                'Procedure argument IDs and names must be arrays of equal length.'
            ));
            continue;
        }
        prototypes.set(proccode, {block, argumentIds});
    }

    for (const block of Object.values(target.blocks)) {
        if (block.opcode !== 'procedures_call') continue;
        const mutation = block.mutation ?? {};
        const proccode = mutation.proccode;
        const argumentIds = parseStringArray(mutation.argumentids);
        const prototype = typeof proccode === 'string' ? prototypes.get(proccode) : undefined;
        if (!prototype) {
            diagnostics.push(diagnostic(
                'procedure.definition-missing',
                'error',
                `${targetPath}.blocks.${block.id}.mutation.proccode`,
                block,
                'Procedure call does not resolve to a prototype in the same target.'
            ));
            continue;
        }
        if (!argumentIds ||
            argumentIds.length !== prototype.argumentIds.length ||
            argumentIds.some((id, index) => id !== prototype.argumentIds[index])) {
            diagnostics.push(diagnostic(
                'procedure.argument-ids-mismatch',
                'error',
                `${targetPath}.blocks.${block.id}.mutation.argumentids`,
                block,
                'Procedure call argument IDs must match the prototype argument IDs.'
            ));
        }
    }

    return diagnostics;
};

const validateMetadata = (
    block: DslBlock,
    metadata: OpcodeMetadata,
    target: BlockGraphTarget,
    targetPath: string,
    scope: ValidationScope
): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    const blockPath = `${targetPath}.blocks.${block.id}`;

    if (
        (metadata.target === 'stage' && !target.isStage) ||
        (metadata.target === 'sprite' && target.isStage)
    ) {
        diagnostics.push(diagnostic(
            'opcode.target-invalid',
            'error',
            `${blockPath}.opcode`,
            block,
            `Opcode ${block.opcode} is not valid for this target type.`
        ));
    }

    // `control_stop` is a cap only for "all"/"this script"; the "other scripts"
    // variants continue running, so Scratch lets them carry a next block.
    const stopOption = block.opcode === 'control_stop' ? block.fields.STOP_OPTION?.value : undefined;
    const stopContinues = stopOption === 'other scripts in sprite' || stopOption === 'other scripts in stage';
    if (block.next && !metadata.allowNext && !stopContinues) {
        diagnostics.push(diagnostic(
            'block.next-not-allowed',
            'error',
            `${blockPath}.next`,
            block,
            `Block shape ${metadata.shape} cannot have a next block.`
        ));
    }

    if (metadata.shape === 'shadow' && !block.shadow) {
        diagnostics.push(diagnostic(
            'block.shadow-flag-required',
            'error',
            `${blockPath}.shadow`,
            block,
            'Shadow opcode must have shadow=true.'
        ));
    }

    for (const [inputName, input] of Object.entries(block.inputs)) {
        const inputMetadata = metadata.inputs[inputName];
        if (!inputMetadata) {
            diagnostics.push(diagnostic(
                'opcode.input-unknown',
                'warning',
                `${blockPath}.inputs.${inputName}`,
                block,
                `Input ${inputName} is not declared by opcode metadata.`
            ));
            continue;
        }
        if (input.shadow && !input.block) {
            diagnostics.push(diagnostic(
                'block.input-descriptor-invalid',
                'error',
                `${blockPath}.inputs.${inputName}`,
                block,
                'An input with a shadow reference must also have a block reference.'
            ));
        }
        if (input.block) {
            const child = target.blocks[input.block];
            const childMetadata = child ? getOpcodeMetadata(child.opcode) : undefined;
            if (child && childMetadata) {
                const compatible =
                    inputMetadata.kind === 'substack' ?
                        ['stack', 'cap'].includes(childMetadata.shape) :
                        inputMetadata.kind === 'boolean' ?
                            childMetadata.shape === 'boolean' :
                            ['reporter', 'boolean', 'shadow'].includes(childMetadata.shape);
                if (!compatible) {
                    diagnostics.push(diagnostic(
                        'opcode.input-shape-invalid',
                        'error',
                        `${blockPath}.inputs.${inputName}.block`,
                        block,
                        `Input ${inputName} cannot accept block shape ${childMetadata.shape}.`,
                        child.id
                    ));
                }
            }
        }
        if (input.shadow && inputMetadata.shadow) {
            const shadow = target.blocks[input.shadow];
            if (shadow && shadow.opcode !== inputMetadata.shadow) {
                diagnostics.push(diagnostic(
                    'opcode.shadow-invalid',
                    'error',
                    `${blockPath}.inputs.${inputName}.shadow`,
                    block,
                    `Input ${inputName} expects shadow opcode ${inputMetadata.shadow}.`,
                    input.shadow
                ));
            }
            if (shadow && !shadow.shadow) {
                diagnostics.push(diagnostic(
                    'block.input-shadow-flag',
                    'error',
                    `${blockPath}.inputs.${inputName}.shadow`,
                    block,
                    'Input shadow reference must point to a block with shadow=true.',
                    shadow.id
                ));
            }
        }
    }

    for (const [fieldName, fieldMetadata] of Object.entries(metadata.fields)) {
        const field = block.fields[fieldName];
        if (fieldMetadata.required && !field) {
            diagnostics.push(diagnostic(
                'opcode.field-missing',
                'error',
                `${blockPath}.fields.${fieldName}`,
                block,
                `Required field ${fieldName} is missing.`
            ));
            continue;
        }
        if (!fieldMetadata.reference || !field) continue;
        const referenceSet = scopeForReference(fieldMetadata.reference, scope);
        if (!field.id || !referenceSet.has(field.id)) {
            diagnostics.push(diagnostic(
                'scope.reference-invalid',
                'error',
                `${blockPath}.fields.${fieldName}.id`,
                block,
                `${fieldMetadata.reference} reference is missing or outside the target scope.`,
                field.id ?? block.id
            ));
        }
    }

    return diagnostics;
};

export const validateBlockGraph = (
    target: BlockGraphTarget,
    targetPath: string,
    scope: ValidationScope
): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    const blocks = target.blocks;
    const scriptSet = new Set(target.scripts);
    const incoming = new Map<string, Set<string>>();

    for (const [key, block] of Object.entries(blocks)) {
        const blockPath = `${targetPath}.blocks.${key}`;
        if (key !== block.id) {
            diagnostics.push(diagnostic(
                'block.key-id-mismatch',
                'error',
                `${blockPath}.id`,
                block,
                `Block dictionary key ${key} does not match block.id ${block.id}.`
            ));
        }

        const metadata = getOpcodeMetadata(block.opcode);
        if (!metadata) {
            diagnostics.push(diagnostic(
                'opcode.unknown',
                'warning',
                `${blockPath}.opcode`,
                block,
                'Unknown opcode is preserved as opaque block data.'
            ));
        } else {
            diagnostics.push(...validateMetadata(block, metadata, target, targetPath, scope));
        }

        for (const reference of referencesForBlock(block)) {
            if (!blocks[reference.id]) {
                diagnostics.push(diagnostic(
                    'block.reference-dangling',
                    'error',
                    `${blockPath}.${reference.path}`,
                    block,
                    `Block reference ${reference.id} does not exist.`,
                    reference.id
                ));
                continue;
            }
            const parents = incoming.get(reference.id) ?? new Set<string>();
            parents.add(block.id);
            incoming.set(reference.id, parents);
        }
    }

    for (const [index, scriptId] of target.scripts.entries()) {
        const block = blocks[scriptId];
        if (!block) {
            diagnostics.push(diagnostic(
                'script.reference-dangling',
                'error',
                `${targetPath}.scripts.${index}`,
                null,
                `Top-level script ${scriptId} does not exist.`,
                scriptId
            ));
            continue;
        }
        if (!block.topLevel || block.parent !== null || block.shadow) {
            diagnostics.push(diagnostic(
                'script.root-invalid',
                'error',
                `${targetPath}.scripts.${index}`,
                block,
                'Script root must be a non-shadow top-level block with parent=null.'
            ));
        }
    }

    for (const block of Object.values(blocks)) {
        const blockPath = `${targetPath}.blocks.${block.id}`;
        const parents = incoming.get(block.id) ?? new Set<string>();
        if (parents.size > 1) {
            diagnostics.push(diagnostic(
                'block.multiple-parents',
                'error',
                `${blockPath}.parent`,
                block,
                `Block is referenced by multiple parents: ${[...parents].join(', ')}.`
            ));
        }
        if (block.topLevel) {
            // Standalone top-level shadow blocks (orphaned menus, custom-arg
            // reporters) are top-level but are not runnable script roots, so
            // they are intentionally absent from target.scripts.
            if (!block.shadow && !scriptSet.has(block.id)) {
                diagnostics.push(diagnostic(
                    'script.root-unlisted',
                    'error',
                    `${blockPath}.topLevel`,
                    block,
                    'Top-level block is not listed in target.scripts.'
                ));
            }
            if (block.parent !== null) {
                diagnostics.push(diagnostic(
                    'block.parent-top-level',
                    'error',
                    `${blockPath}.parent`,
                    block,
                    'Top-level block must have parent=null.'
                ));
            }
        } else {
            const expectedParent = parents.size === 1 ? [...parents][0] : null;
            if (!expectedParent) {
                diagnostics.push(diagnostic(
                    'block.unreachable',
                    'error',
                    blockPath,
                    block,
                    'Non-top-level block is not reachable from another block.'
                ));
            } else if (block.parent !== expectedParent) {
                diagnostics.push(diagnostic(
                    'block.parent-mismatch',
                    'error',
                    `${blockPath}.parent`,
                    block,
                    `Block parent must be ${expectedParent}.`
                ));
            }
        }
    }

    const states = new Map<string, 'visiting' | 'visited'>();
    const visit = (blockId: string, trail: string[]): void => {
        const state = states.get(blockId);
        const block = blocks[blockId];
        if (!block) return;
        if (state === 'visiting') {
            diagnostics.push(diagnostic(
                'block.cycle',
                'error',
                `${targetPath}.blocks.${blockId}`,
                block,
                `Block graph cycle detected: ${[...trail, blockId].join(' -> ')}.`
            ));
            return;
        }
        if (state === 'visited') return;
        states.set(blockId, 'visiting');
        for (const reference of referencesForBlock(block)) {
            visit(reference.id, [...trail, blockId]);
        }
        states.set(blockId, 'visited');
    };

    for (const blockId of Object.keys(blocks)) visit(blockId, []);
    diagnostics.push(...validateProcedureMutations(target, targetPath));
    return diagnostics;
};
