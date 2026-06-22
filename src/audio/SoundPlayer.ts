import type {AudioPort} from './AudioPort.ts';
import {clampVolume} from './AudioPort.ts';

/**
 * Plays one decoded sound and exposes a Promise for the current playback.
 * The decoded value is runtime-only derived data and is never serialized.
 */
export class SoundPlayer<TDecoded = unknown, TPlayback = unknown> {
    finished: Promise<void> = Promise.resolve();

    private readonly audio: AudioPort<TDecoded, TPlayback>;
    private readonly decoded: TDecoded;
    private playback: TPlayback | null = null;
    private finishPlayback: (() => void) | null = null;
    private playbackGeneration = 0;
    private volume = 100;

    constructor(audio: AudioPort<TDecoded, TPlayback>, decoded: TDecoded) {
        this.audio = audio;
        this.decoded = decoded;
    }

    get isPlaying(): boolean {
        return this.playback !== null;
    }

    /** The decoded buffer this player wraps, for sharing with cloned banks. */
    get decodedBuffer(): TDecoded {
        return this.decoded;
    }

    play(volume = this.volume): void {
        this.stop();
        this.volume = clampVolume(volume);

        const generation = ++this.playbackGeneration;
        let endedBeforePlayReturned = false;
        this.finished = new Promise(resolve => {
            this.finishPlayback = resolve;
        });

        try {
            const playback = this.audio.play(this.decoded, () => {
                if (this.playback === null) {
                    endedBeforePlayReturned = true;
                    return;
                }
                this.handleEnded(generation);
            });
            this.playback = playback;
            this.audio.setVolume(playback, this.volume);
            if (endedBeforePlayReturned) {
                this.handleEnded(generation);
            }
        } catch (error) {
            this.completePlayback();
            throw error;
        }
    }

    stop(): void {
        if (this.playback !== null) {
            const playback = this.playback;
            this.playback = null;
            try {
                this.audio.stop(playback);
            } finally {
                this.completePlayback();
            }
            return;
        }
        this.completePlayback();
    }

    setVolume(volume: number): void {
        this.volume = clampVolume(volume);
        if (this.playback !== null) {
            this.audio.setVolume(this.playback, this.volume);
        }
    }

    private handleEnded(generation: number): void {
        if (generation !== this.playbackGeneration) {
            return;
        }
        this.playback = null;
        this.completePlayback();
    }

    private completePlayback(): void {
        const finish = this.finishPlayback;
        this.finishPlayback = null;
        finish?.();
    }
}
