import type {DslBlock, DslField} from '../validation/blockGraphValidator.ts';
import {getOpcodeMetadata} from '../blocks/opcodeMetadata.ts';
import {Cast} from '../cast/Cast.ts';
import type {Stage} from '../model/Stage.ts';
import type {Sprite} from '../model/Sprite.ts';
import type {Runtime} from './Runtime.ts';
import {Thread} from './Thread.ts';
import {commandPrimitives, reporterPrimitives} from './primitives.ts';

/**
 * Reduced view of a DSL field's value, returned by getInputValue/field
 * lookups. Reporters return Cast-friendly primitives; commands ignore the
 * return value.
 */
export type PrimitiveValue = string | number | boolean;

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
    typeof value === 'object' && value !== null && typeof (value as {then?: unknown}).then === 'function';

interface PendingCommand {
    blockId: string;
    state: 'pending' | 'settled';
}

const PENDING_COMMAND = '__pendingCommand';

/**
 * Per-call helper surface passed to primitives as `util`. Bundles the
 * current thread/target/runtime plus convenience accessors so individual
 * primitive functions stay short and don't reach into Thread internals
 * directly.
 */
export class BlockUtil {
    readonly thread: Thread;
    readonly target: Stage | Sprite;
    readonly runtime: Runtime;
    private readonly block: DslBlock;

    constructor(runtime: Runtime, thread: Thread, block: DslBlock) {
        this.runtime = runtime;
        this.thread = thread;
        this.target = thread.target;
        this.block = block;
    }

    /** Per-block scratch space for the current stack frame (loop counters, deadlines, etc). */
    get stackFrame(): Record<string, unknown> {
        const frame = this.thread.peekFrame();
        if (!frame) {
            throw new Error('BlockUtil used outside of an active stack frame.');
        }
        return frame.executionContext;
    }

    getInput(inputName: string): PrimitiveValue {
        return getInputValue(this.runtime, this.thread, this.block, inputName);
    }

    field(fieldName: string): DslField | undefined {
        return this.block.fields[fieldName];
    }

    /** The current block's mutation record (custom-block proccode/args/warp, etc.), if any. */
    get mutation(): Record<string, unknown> | undefined {
        return this.block.mutation;
    }

    /**
     * Pushes the given SUBSTACK input's first block as a new stack frame, so
     * the Sequencer executes the branch next. No-op if the branch is empty
     * (Scratch allows empty C-blocks).
     */
    startBranch(branchInputName: string, isLoop: boolean): void {
        const sub = this.block.inputs[branchInputName]?.block;
        if (sub) {
            this.thread.pushFrame(sub, isLoop);
        }
    }

    /** Yields for the remainder of this tick only; resumes next stepThread() within the same tick pass. */
    yield(): void {
        this.thread.status = 'YIELD';
    }

    /** Yields until the next Runtime.tick(). */
    yieldTick(): void {
        this.thread.status = 'YIELD_TICK';
    }

    getVariableValue(id: string): PrimitiveValue {
        // Resolve through the live target object (not Project.getTarget by id)
        // so clones — which are not registered on Project.sprites — read their
        // own variable copies, while normal targets keep local→stage scope.
        const owner = resolveVariableOwner(this.runtime, this.target, id);
        return owner ? (owner.variables.get(id) ?? '') : '';
    }

    setVariableValue(id: string, value: PrimitiveValue): void {
        const owner = resolveVariableOwner(this.runtime, this.target, id);
        if (owner) owner.variables.set(id, value);
    }

    changeVariableBy(id: string, delta: number): void {
        const owner = resolveVariableOwner(this.runtime, this.target, id);
        if (!owner) return;
        const current = owner.variables.get(id);
        owner.variables.set(id, Cast.toNumber(current) + delta);
    }

    getListOwner(id: string): Stage | Sprite | undefined {
        return resolveListOwner(this.runtime, this.target, id);
    }
}

const resolveVariableOwner = (
    runtime: Runtime,
    target: Stage | Sprite,
    variableId: string
): Stage | Sprite | undefined => {
    if (target.variables.has(variableId)) return target;
    if (target !== runtime.project.stage && runtime.project.stage.variables.has(variableId)) {
        return runtime.project.stage;
    }
    return undefined;
};

const resolveListOwner = (
    runtime: Runtime,
    target: Stage | Sprite,
    listId: string
): Stage | Sprite | undefined => {
    if (target.lists.has(listId)) return target;
    if (target !== runtime.project.stage && runtime.project.stage.lists.has(listId)) {
        return runtime.project.stage;
    }
    return undefined;
};

/**
 * Resolves the value of `block`'s named input. Shadow-shape children (math
 * literals, text, menus) resolve to their single field's value directly;
 * reporter/boolean children are evaluated recursively. Missing inputs/blocks
 * resolve to '' rather than throwing, matching the "never block on malformed
 * data" runtime error policy.
 */
export const getInputValue = (
    runtime: Runtime,
    thread: Thread,
    block: DslBlock,
    inputName: string
): PrimitiveValue => {
    const input = block.inputs[inputName];
    if (!input) return '';
    const id = input.block ?? input.shadow;
    if (!id) return '';
    const child = thread.target.blocks.getBlock(id);
    if (!child) return '';
    const meta = getOpcodeMetadata(child.opcode);
    if (meta && meta.shape === 'shadow') {
        const firstField = Object.values(child.fields)[0];
        return firstField ? firstField.value : '';
    }
    return evaluateReporter(runtime, thread, child);
};

/** Evaluates a reporter/boolean block to a primitive value. Unknown opcodes resolve to ''. */
export const evaluateReporter = (runtime: Runtime, thread: Thread, block: DslBlock): PrimitiveValue => {
    const reporter = reporterPrimitives[block.opcode];
    if (!reporter) return '';
    const util = new BlockUtil(runtime, thread, block);
    return reporter(util);
};

/**
 * Executes a single command block. Unknown/hat opcodes are no-ops (hats are
 * thread entry points, never re-executed as the thread body). Primitives
 * that return a thenable move the thread into PROMISE_WAIT until it settles.
 */
export const execute = (runtime: Runtime, thread: Thread, block: DslBlock): void => {
    const frame = thread.peekFrame();
    if (!frame) return;
    const pending = frame.executionContext[PENDING_COMMAND] as PendingCommand | undefined;
    if (pending?.blockId === block.id) {
        if (pending.state === 'pending') {
            thread.status = 'PROMISE_WAIT';
            return;
        }
        delete frame.executionContext[PENDING_COMMAND];
        return;
    }

    const command = commandPrimitives[block.opcode];
    if (!command) return;
    const util = new BlockUtil(runtime, thread, block);
    const result = command(util);
    if (isThenable(result)) {
        const nextPending: PendingCommand = {blockId: block.id, state: 'pending'};
        frame.executionContext[PENDING_COMMAND] = nextPending;
        thread.status = 'PROMISE_WAIT';
        Promise.resolve(result).then(
            () => {
                nextPending.state = 'settled';
            },
            () => {
                nextPending.state = 'settled';
            }
        ).then(() => {
            const current = thread.peekFrame()?.executionContext[PENDING_COMMAND];
            if (current === nextPending && thread.status === 'PROMISE_WAIT') {
                thread.status = 'RUNNING';
            }
        });
    }
};

export class BlockRunner {
    private readonly runtime: Runtime;

    constructor(runtime: Runtime) {
        this.runtime = runtime;
    }

    execute(thread: Thread, block: DslBlock): void {
        execute(this.runtime, thread, block);
    }

    evaluateReporter(thread: Thread, block: DslBlock): PrimitiveValue {
        return evaluateReporter(this.runtime, thread, block);
    }

    getInputValue(thread: Thread, block: DslBlock, inputName: string): PrimitiveValue {
        return getInputValue(this.runtime, thread, block, inputName);
    }
}
