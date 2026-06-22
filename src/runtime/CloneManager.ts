import type {Runtime} from './Runtime.ts';
import type {Sprite} from '../model/Sprite.ts';
import {Clone} from '../model/Clone.ts';
import {generateId} from '../model/id.ts';

/** Hard ceiling on live clones across the whole project (official VM parity). */
export const MAX_CLONES = 300;

const START_AS_CLONE = 'control_start_as_clone';

/**
 * Owns the clone lifecycle: creation (bounded by Runtime.MAX_CLONES, with the
 * source target's variable/list/pen state duplicated and its
 * `control_start_as_clone` hats launched on the new clone) and deletion
 * (releasing the clone's threads, drawable, sound playback, and pen state).
 * Clones live on Runtime.clones; this manager never touches the immutable
 * Project.sprites list, so green-flag/broadcast hat scans stay deterministic.
 */
export class CloneManager {
    private readonly runtime: Runtime;

    constructor(runtime: Runtime) {
        this.runtime = runtime;
    }

    /** Number of live clones across the whole project. */
    get count(): number {
        return this.runtime.clones.length;
    }

    /**
     * Creates a clone of `source` (a sprite or another clone) unless the
     * project is already at Runtime.MAX_CLONES, in which case it is a no-op
     * returning undefined. Pen state is copied and the clone's start-as-clone
     * hats are started immediately.
     */
    createClone(source: Sprite): Clone | undefined {
        if (this.runtime.clones.length >= MAX_CLONES) return undefined;

        const clone = Clone.fromSource(source, generateId(20, () => this.runtime.random.random()));
        this.runtime.clones.push(clone);
        this.runtime.renderer?.cloneTargetSkin?.(source.id, clone.id);
        this.runtime.pen.cloneState(source.id, clone.id);
        this.runtime.audio?.cloneTarget?.(source.id, clone.id);
        this.startCloneHats(clone);
        return clone;
    }

    private startCloneHats(clone: Clone): void {
        for (const scriptId of clone.blocks.getScripts()) {
            const block = clone.blocks.getBlock(scriptId);
            if (block && block.opcode === START_AS_CLONE) {
                this.runtime.createThread(scriptId, clone);
            }
        }
    }

    /**
     * Deletes a single clone: stops and removes every thread running on it,
     * releases its renderer drawable, stops its sounds, drops its pen state,
     * and removes it from the live clone list.
     */
    deleteClone(clone: Clone): void {
        for (const thread of this.runtime.threads) {
            if (thread.target === clone) {
                thread.stackFrames.length = 0;
                thread.status = 'DONE';
            }
        }
        this.runtime.threads = this.runtime.threads.filter(thread => thread.target !== clone);
        this.runtime.renderer?.releaseTarget?.(clone.id);
        this.runtime.audio?.stopTarget(clone.id);
        this.runtime.pen.releaseTarget(clone.id);
        this.runtime.clones = this.runtime.clones.filter(existing => existing !== clone);
    }

    /** Deletes every clone (e.g. on green flag / stop all). */
    deleteAllClones(): void {
        for (const clone of [...this.runtime.clones]) {
            this.deleteClone(clone);
        }
    }
}
