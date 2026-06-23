/**
 * The project timer behind `sensing_timer` / `sensing_resettimer`. Mirrors the
 * official VM's clock io device: elapsed seconds are measured against the
 * scheduler clock (`runtime.currentMSecs`), so the value is constant within a
 * tick and deterministic under a FakeClock. The green flag resets it (per
 * official `greenFlag` → `resetProjectTimer`).
 */
export class ProjectTimer {
    private readonly now: () => number;
    private startMSecs: number;

    constructor(now: () => number) {
        this.now = now;
        this.startMSecs = now();
    }

    /** Resets the elapsed-time origin to the current scheduler time. */
    reset(): void {
        this.startMSecs = this.now();
    }

    /** Elapsed time in seconds since the last reset. */
    get seconds(): number {
        return (this.now() - this.startMSecs) / 1000;
    }
}
