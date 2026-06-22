/**
 * Input-reading seam between the headless Runtime/blocks layer and a
 * concrete input source (e.g. DomInputManager). Runtime depends only on
 * this interface, never on any DOM implementation, per Phase 3's
 * architecture constraint. All coordinates are in Scratch stage space
 * (origin center, y-up; see src/render/coordinates.ts).
 */
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
}
