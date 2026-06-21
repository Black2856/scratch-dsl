import type {Runtime} from './Runtime.ts';
import {Thread} from './Thread.ts';

/** Safety valve against pathological infinite loops within a single thread step. */
export const MAX_STEPS_PER_TICK = 100000;

/**
 * Advances `thread` to the next block at its current stack level
 * (`target.blocks.getNext`), resetting the per-block execution context.
 * If there is no next block, the frame's blockId becomes null so the next
 * stepThread() iteration pops the frame (loop-yield or fall-through).
 */
const advanceToNext = (thread: Thread): void => {
    const blockId = thread.peekBlockId();
    if (blockId === null) return;
    const next = thread.target.blocks.getNext(blockId);
    thread.setCurrentBlock(next ?? null);
};

/**
 * Runs one thread until it yields, waits, finishes, or exhausts its tick
 * budget. Mirrors the official Scratch Sequencer's single-thread step loop:
 * loop bodies (`isLoop` frames) yield at the tick boundary when exhausted so
 * `forever`/`repeat` never block the event loop; non-loop frames (e.g. an
 * `if` branch) simply fall through to whatever follows the parent block.
 */
export const stepThread = (runtime: Runtime, thread: Thread): void => {
    if (thread.stackFrames.length === 0) {
        thread.status = 'DONE';
        return;
    }

    let guard = 0;
    while (true) {
        if (++guard > MAX_STEPS_PER_TICK) {
            thread.status = 'YIELD_TICK';
            return;
        }

        const blockId = thread.peekBlockId();
        if (blockId === null) {
            const finishedFrame = thread.popFrame();
            if (thread.stackFrames.length === 0) {
                thread.status = 'DONE';
                return;
            }
            if (finishedFrame && finishedFrame.isLoop) {
                // The loop body frame is exhausted. Leave the parent frame's
                // blockId untouched (still pointing at the repeat/forever
                // block itself) so the loop primitive re-evaluates and
                // re-pushes the branch on the next tick. This guarantees a
                // tick-boundary yield for every loop pass per
                // SCRATCH_THREAD_SPEC ("forever guarantees a yield at the
                // tick boundary").
                //
                // Inside a warp procedure we skip that yield and re-evaluate
                // the loop immediately, so warp runs to completion within one
                // tick. The MAX_STEPS_PER_TICK guard above still caps a warp
                // `forever`, and wait/promise-wait yields are unaffected (they
                // set the status directly and return below), so warp never
                // swallows an explicit time wait.
                if (thread.inWarpMode) continue;
                thread.status = 'YIELD_TICK';
                return;
            }
            advanceToNext(thread);
            continue;
        }

        const block = thread.target.blocks.getBlock(blockId);
        if (!block) {
            advanceToNext(thread);
            continue;
        }

        runtime.blockRunner.execute(thread, block);

        if (thread.status === 'DONE' || thread.status === 'YIELD_TICK' || thread.status === 'PROMISE_WAIT') {
            return;
        }
        if (thread.status === 'YIELD') {
            thread.status = 'RUNNING';
        }

        if (thread.peekBlockId() === blockId) {
            advanceToNext(thread);
        }
        // else: a branch was pushed onto the stack; continue executing at
        // the branch's first block without advancing the parent.
    }
};
