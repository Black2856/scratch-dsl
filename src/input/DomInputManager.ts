import type {InputPort, PointerTransition} from './InputPort.ts';
import {clientToScratch, STAGE_WIDTH, STAGE_HEIGHT} from '../render/coordinates.ts';
import {normalizeKey} from './keyNames.ts';

const DRAG_THRESHOLD = 3; // px in stage space before a press counts as a drag

/**
 * Browser-only InputPort implementation. Subscribes to mouse/keyboard DOM
 * events on the given canvas/event target and normalizes them into Scratch
 * stage space (per SCRATCH_EVENT_SPEC.md "Key / mouse"): CSS display scaling
 * is undone via clientToScratch so the reported mouse position always
 * matches the fixed 480x360 internal stage regardless of canvas CSS size.
 */
export class DomInputManager implements InputPort {
    private readonly canvas: HTMLCanvasElement;
    private readonly target: EventTarget;
    private mouseX = 0;
    private mouseY = 0;
    private mouseDown = false;
    private readonly keysDown = new Set<string>();
    /** Keydown edges (not auto-repeat) awaiting consumeKeyPresses(). */
    private pendingPresses: string[] = [];
    /** Mouse button edges awaiting consumePointerTransitions(). */
    private pendingTransitions: PointerTransition[] = [];
    private downX = 0;
    private downY = 0;
    private dragged = false;

    private readonly insideStage = (x: number, y: number): boolean =>
        Math.abs(x) <= STAGE_WIDTH / 2 && Math.abs(y) <= STAGE_HEIGHT / 2;

    private readonly pointAt = (event: MouseEvent): {x: number; y: number} =>
        clientToScratch(event.clientX, event.clientY, this.canvas.getBoundingClientRect());

    private readonly onMouseMove = (event: MouseEvent): void => {
        const point = this.pointAt(event);
        this.mouseX = point.x;
        this.mouseY = point.y;
        if (this.mouseDown && (Math.abs(point.x - this.downX) > DRAG_THRESHOLD ||
            Math.abs(point.y - this.downY) > DRAG_THRESHOLD)) {
            this.dragged = true;
        }
    };

    private readonly onMouseDown = (event: MouseEvent): void => {
        this.mouseDown = true;
        const point = this.pointAt(event);
        this.downX = point.x;
        this.downY = point.y;
        this.dragged = false;
        this.pendingTransitions.push({
            kind: 'down', x: point.x, y: point.y, wasDragged: false, insideStage: this.insideStage(point.x, point.y)
        });
    };

    private readonly onMouseUp = (event: MouseEvent): void => {
        this.mouseDown = false;
        const point = this.pointAt(event);
        this.pendingTransitions.push({
            kind: 'up', x: point.x, y: point.y, wasDragged: this.dragged, insideStage: this.insideStage(point.x, point.y)
        });
    };

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        const key = normalizeKey(event.key);
        // Only queue a press on the not-down → down transition so OS key
        // auto-repeat does not fire `when key pressed` hats repeatedly.
        if (!this.keysDown.has(key)) this.pendingPresses.push(key);
        this.keysDown.add(key);
    };

    private readonly onKeyUp = (event: KeyboardEvent): void => {
        this.keysDown.delete(normalizeKey(event.key));
    };

    constructor(canvas: HTMLCanvasElement, eventTarget: EventTarget = window) {
        this.canvas = canvas;
        this.target = eventTarget;

        this.target.addEventListener('mousemove', this.onMouseMove as EventListener);
        this.target.addEventListener('mousedown', this.onMouseDown as EventListener);
        this.target.addEventListener('mouseup', this.onMouseUp as EventListener);
        this.target.addEventListener('keydown', this.onKeyDown as EventListener);
        this.target.addEventListener('keyup', this.onKeyUp as EventListener);
    }

    getMouseX(): number {
        return this.mouseX;
    }

    getMouseY(): number {
        return this.mouseY;
    }

    isMouseDown(): boolean {
        return this.mouseDown;
    }

    isKeyDown(key: string): boolean {
        return this.keysDown.has(key);
    }

    consumeKeyPresses(): string[] {
        if (this.pendingPresses.length === 0) return [];
        const drained = this.pendingPresses;
        this.pendingPresses = [];
        return drained;
    }

    consumePointerTransitions(): PointerTransition[] {
        if (this.pendingTransitions.length === 0) return [];
        const drained = this.pendingTransitions;
        this.pendingTransitions = [];
        return drained;
    }

    /** Removes all DOM event listeners registered by this instance. */
    dispose(): void {
        this.target.removeEventListener('mousemove', this.onMouseMove as EventListener);
        this.target.removeEventListener('mousedown', this.onMouseDown as EventListener);
        this.target.removeEventListener('mouseup', this.onMouseUp as EventListener);
        this.target.removeEventListener('keydown', this.onKeyDown as EventListener);
        this.target.removeEventListener('keyup', this.onKeyUp as EventListener);
    }
}
