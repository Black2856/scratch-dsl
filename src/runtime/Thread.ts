import type {Stage} from '../model/Stage.ts';
import type {Sprite} from '../model/Sprite.ts';

export type ThreadStatus = 'RUNNING' | 'YIELD' | 'YIELD_TICK' | 'PROMISE_WAIT' | 'DONE';

/**
 * One level of the thread's call stack. `blockId` is the block currently
 * being executed at this level (null once the level has been exhausted and
 * is waiting to be popped). `isLoop` marks frames pushed for repeat/forever
 * *bodies* (via `BlockUtil.startBranch(name, true)`): when such a frame is
 * exhausted and popped, the Sequencer yields at the tick boundary instead of
 * advancing the parent frame past the loop block, so the loop primitive
 * re-evaluates (and re-pushes the body) on the next tick. `executionContext`
 * is per-block scratch space (loop counters, wait deadlines,
 * broadcast-and-wait handles) that is reset whenever the frame's current
 * block changes.
 *
 * `params` marks a procedure-call boundary: a non-null map holds the custom
 * block's argument values (keyed by argument name) for `argument_reporter_*`
 * reporters to read via Thread.getParam. `warpMode` propagates a warp
 * procedure's "run without screen refresh" flag down its frames so the
 * Sequencer skips the per-loop tick-boundary yield.
 */
export interface StackFrame {
    blockId: string | null;
    isLoop: boolean;
    executionContext: Record<string, unknown>;
    params?: Record<string, string | number | boolean> | null;
    warpMode?: boolean;
}

let nextThreadSeq = 0;

/**
 * A single script execution context: a topBlock, the target it runs on, a
 * stack of frames (last element = innermost/topmost), and a status the
 * Sequencer/Runtime use to decide whether to step it further this tick.
 */
export class Thread {
    readonly topBlockId: string;
    readonly target: Stage | Sprite;
    readonly stackFrames: StackFrame[];
    status: ThreadStatus;
    /** Stable creation-order sequence number, used to keep tick order deterministic. */
    readonly seq: number;

    constructor(topBlockId: string, target: Stage | Sprite) {
        this.topBlockId = topBlockId;
        this.target = target;
        this.stackFrames = [{blockId: topBlockId, isLoop: false, executionContext: {}}];
        this.status = 'RUNNING';
        this.seq = nextThreadSeq++;
    }

    pushFrame(blockId: string | null, isLoop: boolean): void {
        this.stackFrames.push({blockId, isLoop, executionContext: {}});
    }

    popFrame(): StackFrame | undefined {
        return this.stackFrames.pop();
    }

    peekFrame(): StackFrame | undefined {
        return this.stackFrames[this.stackFrames.length - 1];
    }

    peekBlockId(): string | null {
        const frame = this.peekFrame();
        return frame ? frame.blockId : null;
    }

    /** Replaces the top frame's current block and resets its scratch context. */
    setCurrentBlock(blockId: string | null): void {
        const frame = this.peekFrame();
        if (!frame) return;
        frame.blockId = blockId;
        frame.executionContext = {};
    }

    /**
     * Resolves a custom-block argument by name, walking frames from innermost
     * out. Stops at the first procedure boundary (the first frame carrying a
     * non-null `params` map), mirroring the official VM's Thread.getParam so
     * an inner procedure's arguments shadow an outer one's. Returns undefined
     * when no enclosing procedure declares the argument.
     */
    getParam(name: string): string | number | boolean | undefined {
        for (let index = this.stackFrames.length - 1; index >= 0; index--) {
            const params = this.stackFrames[index].params;
            if (params == null) continue;
            if (Object.prototype.hasOwnProperty.call(params, name)) return params[name];
            return undefined;
        }
        return undefined;
    }

    /** True when any active frame is in warp mode (inside a warp procedure). */
    get inWarpMode(): boolean {
        return this.stackFrames.some(frame => frame.warpMode === true);
    }

    /** Resets this thread back to its top block, RUNNING, with a clean stack. */
    restart(): void {
        this.stackFrames.length = 0;
        this.stackFrames.push({blockId: this.topBlockId, isLoop: false, executionContext: {}});
        this.status = 'RUNNING';
    }
}
