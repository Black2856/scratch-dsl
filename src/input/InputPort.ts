/**
 * Input-reading seam between the headless Runtime/blocks layer and a
 * concrete input source (e.g. DomInputManager). Runtime depends only on
 * this interface, never on any DOM implementation, per Phase 3's
 * architecture constraint. All coordinates are in Scratch stage space
 * (origin center, y-up; see src/render/coordinates.ts).
 */
/**
 * One mouse button edge in Scratch stage space. `wasDragged` is true when the
 * pointer moved enough between down and up to count as a drag (so a draggable
 * sprite's click hat does not fire). `insideStage` is false for edges that
 * began/ended outside the stage rectangle.
 */
export interface PointerTransition {
    kind: 'down' | 'up';
    x: number;
    y: number;
    wasDragged: boolean;
    insideStage: boolean;
}

export interface InputPort {
    getMouseX(): number;
    getMouseY(): number;
    isMouseDown(): boolean;
    isKeyDown(key: string): boolean;
    /**
     * Drains and returns the Scratch key names pressed (keydown edge, not
     * auto-repeat) since the previous call, so the Runtime can fire
     * `event_whenkeypressed` hats once per physical press. Optional: a source
     * that does not emit edges simply omits it and no key hats fire.
     */
    consumeKeyPresses?(): string[];
    /**
     * Drains and returns mouse button edges since the previous call, so the
     * Runtime can fire click hats. Optional: a source without pointer edges
     * omits it and no click hats fire.
     */
    consumePointerTransitions?(): PointerTransition[];
}
