import type {Diagnostic as ValidationDiagnostic} from '../validation/blockGraphValidator.ts';

export type ProjectDiagnosticSeverity = 'error' | 'warning' | 'info';

export interface ProjectDiagnostic {
    code: string;
    severity: ProjectDiagnosticSeverity;
    message: string;
    path: string | null;
    projectId: string | null;
    targetId: string | null;
    threadId: string | null;
    blockId: string | null;
    opcode: string | null;
    assetId: string | null;
}

export interface ProjectDiagnosticContext {
    projectId?: string | null;
    targetId?: string | null;
    threadId?: string | null;
    blockId?: string | null;
    opcode?: string | null;
    assetId?: string | null;
    path?: string | null;
}

export const createProjectDiagnostic = (
    code: string,
    severity: ProjectDiagnosticSeverity,
    message: string,
    context: ProjectDiagnosticContext = {}
): ProjectDiagnostic => ({
    code,
    severity,
    message,
    path: context.path ?? null,
    projectId: context.projectId ?? null,
    targetId: context.targetId ?? null,
    threadId: context.threadId ?? null,
    blockId: context.blockId ?? null,
    opcode: context.opcode ?? null,
    assetId: context.assetId ?? null
});

export const fromValidationDiagnostic = (
    diagnostic: ValidationDiagnostic,
    projectId: string | null,
    targetId: string | null = null
): ProjectDiagnostic => createProjectDiagnostic(
    diagnostic.code,
    diagnostic.severity,
    diagnostic.message,
    {
        path: diagnostic.path,
        projectId,
        targetId,
        blockId: diagnostic.entityId,
        opcode: diagnostic.opcode
    }
);
