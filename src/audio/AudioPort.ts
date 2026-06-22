/**
 * DOM- and Web Audio-independent seam for decoding and playing audio.
 * Concrete browser adapters may wrap AudioBuffer and AudioBufferSourceNode;
 * tests can use plain objects as decoded buffers and playback handles.
 */
export interface AudioPort<TDecoded = unknown, TPlayback = unknown> {
    decode(bytes: Uint8Array): Promise<TDecoded>;
    play(decoded: TDecoded, onEnded: () => void): TPlayback;
    stop(playback: TPlayback): void;
    setVolume(playback: TPlayback, volume: number): void;
}

export interface RuntimeSoundPlayback {
    readonly finished: Promise<void>;
    stop(): void;
}

/**
 * High-level, DOM-free audio seam consumed by Runtime primitives.
 * SoundManager satisfies this interface; browser-specific Web Audio objects
 * remain behind the lower-level AudioPort above.
 */
export interface RuntimeAudioPort {
    play(targetId: string, soundId: string): RuntimeSoundPlayback | undefined;
    setTargetVolume(targetId: string, volume: number): void;
    stopTarget(targetId: string): void;
    stopAll(): void;
    /**
     * Clones the source target's sound bank onto a new clone id so the clone
     * can play the source sprite's sounds. Optional: a headless Runtime with no
     * audio simply skips it (clones stay silent).
     */
    cloneTarget?(sourceId: string, cloneId: string): void;
}

export const clampVolume = (volume: number): number => {
    if (Number.isNaN(volume)) {
        return 0;
    }
    return Math.min(100, Math.max(0, volume));
};
