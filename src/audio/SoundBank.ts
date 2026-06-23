import type {AudioPort} from './AudioPort.ts';
import {clampVolume} from './AudioPort.ts';
import {SoundPlayer} from './SoundPlayer.ts';

/**
 * Per-target collection of sounds. Each target owns an independent bank,
 * volume, and set of active playback handles.
 */
export class SoundBank<TDecoded = unknown, TPlayback = unknown> {
    readonly targetId: string;

    private readonly audio: AudioPort<TDecoded, TPlayback>;
    private readonly players = new Map<string, SoundPlayer<TDecoded, TPlayback>>();
    private volume = 100;
    private pitch = 0;
    private pan = 0;

    constructor(targetId: string, audio: AudioPort<TDecoded, TPlayback>) {
        this.targetId = targetId;
        this.audio = audio;
    }

    getVolume(): number {
        return this.volume;
    }

    setVolume(volume: number): void {
        this.volume = clampVolume(volume);
        for (const player of this.players.values()) {
            player.setVolume(this.volume);
        }
    }

    /** Sets this target's pitch/pan and applies them to every (active) player. */
    setEffects(pitch: number, pan: number): void {
        this.pitch = pitch;
        this.pan = pan;
        for (const player of this.players.values()) {
            player.setEffects(pitch, pan);
        }
    }

    add(soundId: string, decoded: TDecoded): SoundPlayer<TDecoded, TPlayback> {
        const previous = this.players.get(soundId);
        previous?.stop();

        const player = new SoundPlayer(this.audio, decoded);
        player.setVolume(this.volume);
        player.setEffects(this.pitch, this.pan);
        this.players.set(soundId, player);
        return player;
    }

    get(soundId: string): SoundPlayer<TDecoded, TPlayback> | undefined {
        return this.players.get(soundId);
    }

    play(soundId: string): SoundPlayer<TDecoded, TPlayback> | undefined {
        const player = this.players.get(soundId);
        player?.play(this.volume);
        return player;
    }

    stopAll(): void {
        for (const player of this.players.values()) {
            player.stop();
        }
    }

    /**
     * Builds an independent bank for `targetId` that shares this bank's decoded
     * buffers but has its own (idle) SoundPlayers and volume, so a clone can
     * play the source sprite's sounds concurrently with the original.
     */
    cloneInto(targetId: string): SoundBank<TDecoded, TPlayback> {
        const clone = new SoundBank<TDecoded, TPlayback>(targetId, this.audio);
        clone.volume = this.volume;
        clone.pitch = this.pitch;
        clone.pan = this.pan;
        for (const [soundId, player] of this.players) {
            clone.add(soundId, player.decodedBuffer);
        }
        return clone;
    }
}
