import {AssetManager} from '../src/assets/AssetManager.ts';
import type {AssetRecord} from '../src/assets/types.ts';
import type {AudioPort} from '../src/audio/AudioPort.ts';
import {loadProjectSounds} from '../src/audio/SoundAssetLoader.ts';
import {SoundManager} from '../src/audio/SoundManager.ts';
import {WebAudioPort, type WebAudioPlayback} from '../src/audio/WebAudioPort.ts';
import {
    createProjectDiagnostic,
    fromValidationDiagnostic,
    type ProjectDiagnostic
} from '../src/diagnostics/ProjectDiagnostic.ts';
import {DomInputManager} from '../src/input/DomInputManager.ts';
import {clientToScratch} from '../src/render/coordinates.ts';
import type {QuestionUiPort} from '../src/runtime/QuestionManager.ts';
import type {Sprite} from '../src/model/Sprite.ts';
import {createProject} from '../src/model/ProjectFactory.ts';
import type {Project} from '../src/model/Project.ts';
import {CanvasRenderer} from '../src/render/CanvasRenderer.ts';
import {
    BrowserImageDecoder,
    loadAllCostumeSkins
} from '../src/render/CostumeSkinLoader.ts';
import {Runtime} from '../src/runtime/Runtime.ts';
import {
    validateProject,
    type DslProject
} from '../src/validation/projectValidator.ts';

interface PreviewAsset {
    assetId: string;
    md5ext: string;
    dataFormat: string;
    kind: 'costume' | 'sound';
    mimeType: string;
    source: string;
    url: string;
}

interface PreviewPayload {
    ok: boolean;
    name: string;
    project?: DslProject;
    assets?: PreviewAsset[];
    diagnostics: ProjectDiagnostic[];
}

interface PreviewApi {
    getStatus(): string;
    getThreadCount(): number;
    getCloneCount(): number;
    getActiveSoundCount(): number;
    getDiagnostics(): ProjectDiagnostic[];
    start(): Promise<void>;
    stop(): Promise<void>;
}

class TrackingAudioPort implements AudioPort<AudioBuffer, WebAudioPlayback> {
    private readonly port: WebAudioPort;
    activeCount = 0;

    constructor(context: AudioContext) {
        this.port = new WebAudioPort(context);
    }

    start(): Promise<void> {
        return this.port.start();
    }

    decode(bytes: Uint8Array): Promise<AudioBuffer> {
        return this.port.decode(bytes);
    }

    play(decoded: AudioBuffer, onEnded: () => void): WebAudioPlayback {
        this.activeCount++;
        return this.port.play(decoded, () => {
            this.activeCount = Math.max(0, this.activeCount - 1);
            onEnded();
        });
    }

    stop(playback: WebAudioPlayback): void {
        this.port.stop(playback);
    }

    setVolume(playback: WebAudioPlayback, volume: number): void {
        this.port.setVolume(playback, volume);
    }

    setPitch(playback: WebAudioPlayback, pitch: number): void {
        this.port.setPitch(playback, pitch);
    }

    setPan(playback: WebAudioPlayback, pan: number): void {
        this.port.setPan(playback, pan);
    }
}

const required = <T extends HTMLElement>(id: string): T => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing preview element #${id}.`);
    return element as T;
};

const projectName = required<HTMLElement>('project-name');
const projectPath = required<HTMLElement>('project-path');
const greenFlag = required<HTMLButtonElement>('green-flag');
const stopButton = required<HTMLButtonElement>('stop');
const statusElement = required<HTMLElement>('status');
const threadCount = required<HTMLElement>('thread-count');
const cloneCount = required<HTMLElement>('clone-count');
const currentBlocks = required<HTMLElement>('current-blocks');
const assetState = required<HTMLElement>('asset-state');
const audioState = required<HTMLElement>('audio-state');
const activeSounds = required<HTMLElement>('active-sounds');
const frameCount = required<HTMLElement>('frame-count');
const diagnosticsElement = required<HTMLElement>('diagnostics');
const canvas = required<HTMLCanvasElement>('stage');
const askBar = required<HTMLElement>('ask-bar');
const askText = required<HTMLElement>('ask-text');
const askInput = required<HTMLInputElement>('ask-input');
const askSubmit = required<HTMLButtonElement>('ask-submit');

// Question UI for `ask and wait`: shows the input bar and submits the answer.
const questionUi: QuestionUiPort = {
    showQuestion(text: string): void {
        askText.textContent = text || '答えを入力:';
        askBar.style.display = 'flex';
        askInput.value = '';
        askInput.focus();
    },
    clearQuestion(): void {
        askBar.style.display = 'none';
    }
};
const submitAnswer = (): void => {
    if (askBar.style.display === 'none') return;
    runtime?.submitAnswer(askInput.value);
    askBar.style.display = 'none';
    canvas.focus();
};
askSubmit.addEventListener('click', submitAnswer);
askInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault();
        submitAnswer();
    }
});

// Sprite dragging for `set drag mode draggable`: pick a draggable target on
// mouse-down and move it with the pointer until release.
let dragTarget: Sprite | null = null;
let dragDX = 0;
let dragDY = 0;
canvas.addEventListener('mousedown', event => {
    if (!renderer || !project || status !== 'running') return;
    const point = clientToScratch(event.clientX, event.clientY, canvas.getBoundingClientRect());
    const hitId = renderer.pickTarget?.(point.x, point.y) ?? null;
    if (!hitId) return;
    const sprite = [...project.sprites, ...(runtime?.clones ?? [])].find(s => s.id === hitId);
    if (sprite && sprite.draggable) {
        dragTarget = sprite;
        dragDX = sprite.x - point.x;
        dragDY = sprite.y - point.y;
    }
});
canvas.addEventListener('mousemove', event => {
    if (!dragTarget) return;
    const point = clientToScratch(event.clientX, event.clientY, canvas.getBoundingClientRect());
    dragTarget.setPosition(point.x + dragDX, point.y + dragDY);
});
window.addEventListener('mouseup', () => {
    dragTarget = null;
});

let dsl: DslProject | null = null;
let project: Project | null = null;
let assets: AssetManager<HTMLImageElement | ImageBitmap, unknown> | null = null;
let renderer: CanvasRenderer | null = null;
let input: DomInputManager | null = null;
let runtime: Runtime | null = null;
let soundManager: SoundManager<AudioBuffer, WebAudioPlayback> | null = null;
let audioContext: AudioContext | null = null;
let trackingAudio: TrackingAudioPort | null = null;
let animationFrame: number | null = null;
let frames = 0;
let status = 'loading';
let diagnostics: ProjectDiagnostic[] = [];

const mergeDiagnostics = (...groups: ProjectDiagnostic[][]): ProjectDiagnostic[] => {
    const seen = new Set<string>();
    const merged: ProjectDiagnostic[] = [];
    for (const diagnostic of groups.flat()) {
        const key = [
            diagnostic.code,
            diagnostic.severity,
            diagnostic.path,
            diagnostic.opcode,
            diagnostic.assetId,
            diagnostic.message
        ].join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(diagnostic);
    }
    return merged;
};

const setStatus = (next: string): void => {
    status = next;
    statusElement.textContent = next;
    statusElement.dataset.state = next;
};

const renderDiagnostics = (): void => {
    diagnosticsElement.replaceChildren();
    if (diagnostics.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No diagnostics.';
        diagnosticsElement.append(empty);
        return;
    }
    for (const diagnostic of diagnostics) {
        const item = document.createElement('div');
        item.className = `diagnostic ${diagnostic.severity}`;
        const context = [
            diagnostic.projectId && `project=${diagnostic.projectId}`,
            diagnostic.targetId && `target=${diagnostic.targetId}`,
            diagnostic.threadId && `thread=${diagnostic.threadId}`,
            diagnostic.blockId && `block=${diagnostic.blockId}`,
            diagnostic.opcode && `opcode=${diagnostic.opcode}`,
            diagnostic.assetId && `asset=${diagnostic.assetId}`,
            diagnostic.path && `path=${diagnostic.path}`
        ].filter(Boolean).join(' · ');
        item.innerHTML =
            `<strong>${diagnostic.severity.toUpperCase()}</strong> ` +
            `<code>${diagnostic.code}</code><br>` +
            `${diagnostic.message}` +
            (context ? `<br><code>${context}</code>` : '');
        diagnosticsElement.append(item);
    }
};

const runtimeDiagnostic = (error: unknown): ProjectDiagnostic => {
    const thread = runtime?.threads[0];
    const blockId = thread?.peekBlockId() ?? null;
    const block = blockId ? thread?.target.blocks.getBlock(blockId) : undefined;
    return createProjectDiagnostic(
        'preview.runtime',
        'error',
        error instanceof Error ? error.message : String(error),
        {
            projectId: dsl?.project.id ?? null,
            targetId: thread?.target.id ?? null,
            threadId: thread ? String(thread.seq) : null,
            blockId,
            opcode: block?.opcode ?? null
        }
    );
};

const updateState = (): void => {
    threadCount.textContent = String(runtime?.threads.length ?? 0);
    cloneCount.textContent = String(runtime?.clones.length ?? 0);
    activeSounds.textContent = String(trackingAudio?.activeCount ?? 0);
    audioState.textContent = audioContext?.state ?? 'not started';
    frameCount.textContent = String(frames);
    const blocks = runtime?.threads.map(thread => {
        const blockId = thread.peekBlockId();
        const block = blockId ? thread.target.blocks.getBlock(blockId) : undefined;
        return `${thread.target.id}#${thread.seq}: ${blockId ?? 'done'}${block ? ` (${block.opcode})` : ''}`;
    }) ?? [];
    currentBlocks.textContent = blocks.length > 0 ? blocks.join(', ') : '—';
};

const stop = async (): Promise<void> => {
    if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
    runtime?.stopAll();
    soundManager?.stopAll();
    runtime?.tick();
    if (audioContext?.state === 'running') {
        await audioContext.suspend();
    }
    setStatus(dsl ? 'stopped' : 'error');
    updateState();
    stopButton.disabled = true;
};

const tick = (): void => {
    if (!runtime || status !== 'running') return;
    try {
        runtime.tick();
        frames++;
        updateState();
        animationFrame = requestAnimationFrame(tick);
    } catch (error) {
        diagnostics.push(runtimeDiagnostic(error));
        renderDiagnostics();
        void stop();
        setStatus('error');
    }
};

const ensureAudio = async (): Promise<void> => {
    if (!audioContext) {
        audioContext = new AudioContext();
        trackingAudio = new TrackingAudioPort(audioContext);
        soundManager = new SoundManager(trackingAudio);
    }
    await trackingAudio!.start();
};

const start = async (): Promise<void> => {
    if (!dsl || !assets || !renderer || !project) return;
    greenFlag.disabled = true;
    try {
        await stop();
        await ensureAudio();
        await loadProjectSounds(project, assets, soundManager!);
        runtime = new Runtime({
            renderer,
            input: input ?? undefined,
            audio: soundManager!,
            questionUi
        });
        runtime.load(project);
        runtime.start();
        runtime.greenFlag();
        frames = 0;
        setStatus('running');
        stopButton.disabled = false;
        canvas.focus();
        tick();
    } catch (error) {
        diagnostics.push(runtimeDiagnostic(error));
        renderDiagnostics();
        setStatus('error');
    } finally {
        greenFlag.disabled = false;
        updateState();
    }
};

const load = async (): Promise<void> => {
    try {
        const response = await fetch('/api/project');
        const payload = await response.json() as PreviewPayload;
        diagnostics = [...payload.diagnostics];
        projectName.textContent = payload.name || 'Workspace project';
        projectPath.textContent = `workspace/${payload.name}/project.ts`;
        if (!payload.ok || !payload.project || !payload.assets) {
            setStatus('error');
            renderDiagnostics();
            return;
        }

        dsl = payload.project;
        const validation = validateProject(dsl);
        diagnostics = mergeDiagnostics(
            diagnostics,
            validation.diagnostics.map(item =>
                fromValidationDiagnostic(item, dsl!.project.id)
            )
        );
        if (!validation.valid) {
            setStatus('error');
            renderDiagnostics();
            return;
        }

        const records = await Promise.all(payload.assets.map(async asset => {
            const assetResponse = await fetch(asset.url);
            if (!assetResponse.ok) {
                throw new Error(`Asset request failed: ${asset.assetId} (${assetResponse.status})`);
            }
            return {
                ...asset,
                source: asset.source,
                status: 'ready',
                bytes: new Uint8Array(await assetResponse.arrayBuffer())
            } satisfies AssetRecord;
        }));
        assets = new AssetManager(records, {image: new BrowserImageDecoder()});
        renderer = new CanvasRenderer(canvas);
        input = new DomInputManager(canvas, window);
        project = createProject(dsl);
        await loadAllCostumeSkins(project, assets, renderer);
        runtime = new Runtime({renderer, input, questionUi});
        runtime.load(project);
        runtime.start();
        runtime.tick();

        assetState.textContent = `${records.length}/${records.length} ready; images decoded`;
        setStatus('ready');
        greenFlag.disabled = false;
        renderDiagnostics();
        updateState();
    } catch (error) {
        diagnostics.push(createProjectDiagnostic(
            'preview.load',
            'error',
            error instanceof Error ? error.message : String(error),
            {projectId: dsl?.project.id ?? null}
        ));
        assetState.textContent = 'error';
        setStatus('error');
        renderDiagnostics();
    }
};

greenFlag.addEventListener('click', () => void start());
stopButton.addEventListener('click', () => void stop());
window.addEventListener('beforeunload', () => {
    input?.dispose();
    runtime?.stopAll();
    soundManager?.stopAll();
    void audioContext?.close();
});

const api: PreviewApi = {
    getStatus: () => status,
    getThreadCount: () => runtime?.threads.length ?? 0,
    getCloneCount: () => runtime?.clones.length ?? 0,
    getActiveSoundCount: () => trackingAudio?.activeCount ?? 0,
    getDiagnostics: () => [...diagnostics],
    start,
    stop
};
(window as unknown as {ManualPreview: PreviewApi}).ManualPreview = api;

void load();
