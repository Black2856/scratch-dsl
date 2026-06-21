/**
 * Tracks variable/list monitor visibility. Monitors are addressed by the id
 * the official VM uses for data monitors: a variable/list monitor's id is the
 * variable/list id itself, so `show variable`/`hide list` resolve their field
 * id straight to a monitor record. State is upserted on first show/hide so a
 * project that ships no `monitors` array still tracks visibility correctly.
 *
 * Only the display *state* lives here; rendering a monitor as a DOM overlay is
 * a GUI concern outside the runtime, so this manager stays DOM-free.
 */
export interface MonitorRecord {
    id: string;
    opcode: string;
    visible: boolean;
}

type MonitorSeed = Record<string, unknown> & {id: string; opcode: string; visible: boolean};

export class MonitorManager {
    private readonly monitors = new Map<string, MonitorRecord>();

    constructor(initial: MonitorSeed[] = []) {
        for (const seed of initial) {
            this.monitors.set(seed.id, {id: seed.id, opcode: seed.opcode, visible: seed.visible});
        }
    }

    /** Upserts a monitor's visibility, keeping (or seeding) its opcode. */
    setVisible(id: string, visible: boolean, opcode = 'data_variable'): void {
        const existing = this.monitors.get(id);
        if (existing) {
            existing.visible = visible;
        } else {
            this.monitors.set(id, {id, opcode, visible});
        }
    }

    isVisible(id: string): boolean {
        return this.monitors.get(id)?.visible ?? false;
    }

    getState(id: string): MonitorRecord | undefined {
        return this.monitors.get(id);
    }

    list(): MonitorRecord[] {
        return [...this.monitors.values()];
    }
}
