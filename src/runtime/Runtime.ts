import type {Project} from '../model/Project.ts';
import type {Stage} from '../model/Stage.ts';
import type {Sprite} from '../model/Sprite.ts';
import type {Clone} from '../model/Clone.ts';
import type {ClockPort, RandomPort} from './ports.ts';
import {SystemClockPort, SystemRandomPort} from './ports.ts';
import {Thread} from './Thread.ts';
import {stepThread} from './Sequencer.ts';
import {BlockRunner} from './BlockRunner.ts';
import {CloneManager, MAX_CLONES} from './CloneManager.ts';
import {ProcedureManager} from './ProcedureManager.ts';
import {PenManager} from './PenManager.ts';
import {MonitorManager} from './MonitorManager.ts';
import {startHats, type HatMatch} from './EventBus.ts';
import type {RendererPort, DrawableState, MonitorView} from '../render/RendererPort.ts';
import type {InputPort} from '../input/InputPort.ts';
import type {RuntimeAudioPort} from '../audio/AudioPort.ts';

/** Safety valve against pathological cross-thread cascades within one tick. */
export const MAX_TICK_PASSES = 1000;

/** Fixed placement state used for the Stage's own DrawableState (per SCRATCH_RENDER_SPEC: Stage has no coordinate/direction fields). */
const STAGE_DRAWABLE_DEFAULTS = Object.freeze({
    x: 0,
    y: 0,
    size: 100,
    direction: 90,
    rotationStyle: 'all around' as const
});

export interface RuntimeOptions {
    clock?: ClockPort;
    random?: RandomPort;
    renderer?: RendererPort;
    input?: InputPort;
    audio?: RuntimeAudioPort;
}

/**
 * Headless execution engine: owns the live thread list and drives them
 * through Sequencer.stepThread once per Runtime.tick(). No rendering, audio,
 * or DOM I/O — purely project model + thread scheduling, per Phase 2 scope.
 */
export class Runtime {
    /** Hard ceiling on live clones across the whole project (official VM parity). */
    static readonly MAX_CLONES = MAX_CLONES;

    project!: Project;
    readonly clock: ClockPort;
    readonly random: RandomPort;
    readonly blockRunner: BlockRunner;
    readonly cloneManager: CloneManager;
    readonly procedures: ProcedureManager;
    readonly pen: PenManager;
    monitors: MonitorManager;
    readonly renderer?: RendererPort;
    readonly input?: InputPort;
    readonly audio?: RuntimeAudioPort;
    threads: Thread[] = [];
    /** Live clones, kept separate from the immutable Project.sprites list. */
    clones: Clone[] = [];
    currentMSecs = 0;

    constructor(options: RuntimeOptions = {}) {
        this.clock = options.clock ?? new SystemClockPort();
        this.random = options.random ?? new SystemRandomPort();
        this.blockRunner = new BlockRunner(this);
        this.cloneManager = new CloneManager(this);
        this.procedures = new ProcedureManager();
        this.pen = new PenManager();
        this.monitors = new MonitorManager();
        this.renderer = options.renderer;
        this.input = options.input;
        this.audio = options.audio;
    }

    /**
     * Attaches the project model. Block indices already live on
     * BlockContainer, so this is a direct assignment; monitor visibility is
     * seeded from the project's declared monitors.
     */
    load(project: Project): void {
        this.project = project;
        this.monitors = new MonitorManager(project.monitors);
    }

    /** Initializes the scheduler clock. Headless: no input/audio devices to start. */
    start(): void {
        this.currentMSecs = this.clock.now();
    }

    createThread(topBlockId: string, target: Stage | Sprite): Thread {
        const thread = new Thread(topBlockId, target);
        this.threads.push(thread);
        return thread;
    }

    removeThread(thread: Thread): void {
        const index = this.threads.indexOf(thread);
        if (index !== -1) this.threads.splice(index, 1);
    }

    /**
     * Stops every thread immediately, clears the thread list, and deletes all
     * clones (releasing their drawables/sounds/pen state), matching the
     * official VM's stop-all / green-flag behaviour. The pen layer canvas is
     * intentionally left intact (green flag does not clear pen marks).
     */
    stopAll(): void {
        this.audio?.stopAll();
        for (const thread of this.threads) {
            thread.stackFrames.length = 0;
            thread.status = 'DONE';
        }
        this.threads = [];
        this.cloneManager.deleteAllClones();
    }

    /** Stops existing execution and starts all `event_whenflagclicked` hats. */
    greenFlag(): void {
        this.stopAll();
        this.startHats('event_whenflagclicked', undefined, true);
    }

    /**
     * Starts (or restarts) hat threads for `opcode` matching `match`. See
     * EventBus.startHats for ordering/restart semantics.
     */
    startHats(opcode: string, match: HatMatch | undefined, restartExisting: boolean): Thread[] {
        return startHats(this, opcode, match, restartExisting);
    }

    /**
     * Runs one deterministic scheduling tick: re-arms threads that yielded
     * at the previous tick boundary, then repeatedly walks all RUNNING/
     * YIELD threads (in stable creation order) until a full pass makes no
     * progress, removing DONE threads as they finish. A bounded number of
     * passes guards against pathological cross-thread cascades (e.g. a
     * broadcast chain that keeps spawning runnable work in the same tick).
     */
    tick(): void {
        this.currentMSecs = this.clock.now();

        // Fire `when key pressed` hats once per physical keydown edge drained
        // from the input port, before stepping, so the new hat threads run in
        // this same tick. 'any' hats are matched inside EventBus.hatMatches.
        const presses = this.input?.consumeKeyPresses?.() ?? [];
        for (const key of presses) {
            this.startHats('event_whenkeypressed', {keyOption: key}, true);
        }

        for (const thread of this.threads) {
            if (thread.status === 'YIELD_TICK') {
                thread.status = 'RUNNING';
            }
        }

        let passes = 0;
        let stepped = true;
        while (stepped && passes++ < MAX_TICK_PASSES) {
            stepped = false;
            for (const thread of this.threads.slice()) {
                if (thread.status === 'RUNNING' || thread.status === 'YIELD') {
                    thread.status = 'RUNNING';
                    stepThread(this, thread);
                    stepped = true;
                }
            }
            this.threads = this.threads.filter(thread => thread.status !== 'DONE');
        }

        if (this.renderer) {
            this.renderer.renderDrawables(this.collectDrawableStates());
            this.renderer.renderMonitors?.(this.collectMonitorViews());
        }
    }

    /**
     * Resolves a variable's current value by name (the form a monitor's
     * `params.VARIABLE` carries). When `spriteName` is given the local sprite
     * is searched first; otherwise the Stage (global) then every Sprite is
     * scanned. Returns undefined when no target declares the name.
     */
    private resolveVariableValueByName(
        name: string,
        spriteName: string | null
    ): string | number | boolean | undefined {
        if (spriteName) {
            const sprite = this.project.sprites.find(candidate => candidate.name === spriteName);
            const entry = sprite?.variables.getByName(name);
            if (entry) return entry.value;
        }
        const stageEntry = this.project.stage.variables.getByName(name);
        if (stageEntry) return stageEntry.value;
        for (const sprite of this.project.sprites) {
            const entry = sprite.variables.getByName(name);
            if (entry) return entry.value;
        }
        return undefined;
    }

    /**
     * Builds the visible variable-monitor overlay for the current frame from
     * the project's declared `monitors` and live MonitorManager visibility
     * (keyed by the monitor's own id). Only `data_variable` monitors are
     * painted; list monitors are out of scope for the canvas overlay.
     */
    private collectMonitorViews(): MonitorView[] {
        const views: MonitorView[] = [];
        for (const monitor of this.project.monitors) {
            if (monitor.opcode !== 'data_variable') continue;
            if (!this.monitors.isVisible(monitor.id)) continue;
            const params = monitor.params as Record<string, unknown> | undefined;
            const name = typeof params?.VARIABLE === 'string' ? params.VARIABLE : null;
            if (!name) continue;
            const spriteName = typeof monitor.spriteName === 'string' ? monitor.spriteName : null;
            const value = this.resolveVariableValueByName(name, spriteName);
            if (value === undefined) continue;
            const x = typeof monitor.x === 'number' ? monitor.x : 0;
            const y = typeof monitor.y === 'number' ? monitor.y : 0;
            views.push({id: monitor.id, label: name, value: String(value), x, y});
        }
        return views;
    }

    /** Builds the per-tick DrawableState snapshot (stage + every sprite) handed to the RendererPort, if any. */
    private collectDrawableStates(): DrawableState[] {
        const states: DrawableState[] = [
            {
                targetId: this.project.stage.id,
                isStage: true,
                x: STAGE_DRAWABLE_DEFAULTS.x,
                y: STAGE_DRAWABLE_DEFAULTS.y,
                size: STAGE_DRAWABLE_DEFAULTS.size,
                direction: STAGE_DRAWABLE_DEFAULTS.direction,
                visible: true,
                rotationStyle: STAGE_DRAWABLE_DEFAULTS.rotationStyle,
                layerOrder: this.project.stage.layerOrder,
                costumeIndex: this.project.stage.currentCostume
            }
        ];

        for (const sprite of [...this.project.sprites, ...this.clones]) {
            states.push({
                targetId: sprite.id,
                isStage: false,
                x: sprite.x,
                y: sprite.y,
                size: sprite.size,
                direction: sprite.direction,
                visible: sprite.visible,
                rotationStyle: sprite.rotationStyle,
                layerOrder: sprite.layerOrder,
                costumeIndex: sprite.currentCostume
            });
        }

        return states;
    }
}
