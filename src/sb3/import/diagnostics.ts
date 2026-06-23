/**
 * Import diagnostics. Reuses the repo-wide {@link Diagnostic} shape (code,
 * severity, path, entityId, opcode, message) so import findings are
 * machine-readable like validation findings. Codes are dotted lowercase under
 * the `sb3.` namespace.
 *
 * Two modes (draft §project.json parse):
 *   - strict:        a preservable inconsistency is an error (stops the import).
 *   - compatibility: a preservable inconsistency is a warning (import continues,
 *                    keeping the information). Only unrecoverable problems error.
 */

import type {Diagnostic, DiagnosticSeverity} from '../../validation/blockGraphValidator.ts';

export type {Diagnostic, DiagnosticSeverity};

export type ImportMode = 'strict' | 'compatibility';

export interface DiagnosticInit {
    code: string;
    path: string;
    message: string;
    entityId?: string | null;
    opcode?: string | null;
}

/** Accumulates import diagnostics and applies the mode's severity policy. */
export class ImportDiagnostics {
    readonly mode: ImportMode;
    private readonly items: Diagnostic[] = [];

    constructor(mode: ImportMode = 'compatibility') {
        this.mode = mode;
    }

    private push(severity: DiagnosticSeverity, init: DiagnosticInit): void {
        this.items.push({
            code: init.code,
            severity,
            path: init.path,
            entityId: init.entityId ?? null,
            opcode: init.opcode ?? null,
            message: init.message
        });
    }

    /** Unrecoverable problem; always an error regardless of mode. */
    error(init: DiagnosticInit): void {
        this.push('error', init);
    }

    /** Informational; always a warning regardless of mode. */
    warn(init: DiagnosticInit): void {
        this.push('warning', init);
    }

    /**
     * A structural inconsistency whose information can still be preserved:
     * error in strict mode, warning in compatibility mode.
     */
    preservable(init: DiagnosticInit): void {
        this.push(this.mode === 'strict' ? 'error' : 'warning', init);
    }

    list(): Diagnostic[] {
        return this.items.slice();
    }

    hasErrors(): boolean {
        return this.items.some(item => item.severity === 'error');
    }
}
