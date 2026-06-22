import type {Stage} from '../model/Stage.ts';
import type {Sprite} from '../model/Sprite.ts';
import type {Runtime} from './Runtime.ts';
import {Thread} from './Thread.ts';

/** Optional match constraints for startHats: broadcast id (receive hats) or key name (when-key-pressed hats). */
export interface HatMatch {
    broadcastId?: string;
    keyOption?: string;
}

const hatMatches = (
    block: {opcode: string; fields: Record<string, {value?: unknown; id?: string | null}>},
    match?: HatMatch
): boolean => {
    if (!match) return true;
    if (match.broadcastId !== undefined) {
        const field = block.fields.BROADCAST_OPTION;
        return Boolean(field && field.id === match.broadcastId);
    }
    if (match.keyOption !== undefined) {
        // when-key-pressed hats carry the chosen key in KEY_OPTION.value; an
        // 'any' hat fires for every key, mirroring the official VM.
        const option = block.fields.KEY_OPTION?.value;
        return option === match.keyOption || option === 'any';
    }
    return true;
};

/**
 * Finds all hat blocks of `opcode` across the project's targets (Stage, then
 * Sprites, then live clones, in array order; each target's scripts in
 * declaration order) that satisfy `match`, and starts (or, if `restartExisting`
 * and one is already running for that target/topBlock, restarts) a Thread for
 * each. Returns the threads that were started/restarted, in the same
 * deterministic order, so callers like broadcast-and-wait can track completion.
 *
 * Live clones run their own copies of `event_whenbroadcastreceived` and
 * `event_whenkeypressed` hats (they share the source sprite's block graph), per
 * official Scratch v14.1.0. `event_whenflagclicked` is excluded for clones:
 * the green flag deletes all clones before starting flag hats, and clones never
 * own a flag thread.
 */
export const startHats = (
    runtime: Runtime,
    opcode: string,
    match: HatMatch | undefined,
    restartExisting: boolean
): Thread[] => {
    const started: Thread[] = [];
    const targets: Array<Stage | Sprite> = [runtime.project.stage, ...runtime.project.sprites];
    if (opcode !== 'event_whenflagclicked') {
        targets.push(...runtime.clones);
    }

    for (const target of targets) {
        for (const scriptId of target.blocks.getScripts()) {
            const block = target.blocks.getBlock(scriptId);
            if (!block || block.opcode !== opcode) continue;
            if (!hatMatches(block, match)) continue;

            const existing = restartExisting ?
                runtime.threads.find(t => t.target === target && t.topBlockId === scriptId) :
                undefined;

            if (existing) {
                existing.restart();
                started.push(existing);
            } else {
                const thread = runtime.createThread(scriptId, target);
                started.push(thread);
            }
        }
    }

    return started;
};
