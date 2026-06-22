import type {AudioPort} from './AudioPort.ts';
import {SoundBank} from './SoundBank.ts';
import type {SoundPlayer} from './SoundPlayer.ts';

/**
 * Coordinates per-target SoundBanks and a derived decoded-audio cache.
 * The cache is keyed by asset ID and deliberately has no serialization API.
 */
export class SoundManager<TDecoded = unknown, TPlayback = unknown> {
    private readonly audio: AudioPort<TDecoded, TPlayback>;
    private readonly banks = new Map<string, SoundBank<TDecoded, TPlayback>>();
    private readonly decodedCache = new Map<string, Promise<TDecoded>>();

    constructor(audio: AudioPort<TDecoded, TPlayback>) {
        this.audio = audio;
    }

    getBank(targetId: string): SoundBank<TDecoded, TPlayback> {
        let bank = this.banks.get(targetId);
        if (!bank) {
            bank = new SoundBank(targetId, this.audio);
            this.banks.set(targetId, bank);
        }
        return bank;
    }

    async loadSound(
        targetId: string,
        soundId: string,
        assetId: string,
        bytes: Uint8Array
    ): Promise<SoundPlayer<TDecoded, TPlayback>> {
        let decoded = this.decodedCache.get(assetId);
        if (!decoded) {
            decoded = this.audio.decode(bytes);
            this.decodedCache.set(assetId, decoded);
            decoded.catch(() => {
                if (this.decodedCache.get(assetId) === decoded) {
                    this.decodedCache.delete(assetId);
                }
            });
        }

        return this.getBank(targetId).add(soundId, await decoded);
    }

    play(targetId: string, soundId: string): SoundPlayer<TDecoded, TPlayback> | undefined {
        return this.banks.get(targetId)?.play(soundId);
    }

    /**
     * Gives `cloneId` its own bank sharing `sourceId`'s decoded sounds, so a
     * runtime clone can play the source sprite's sounds (and overlap with the
     * original and sibling clones). No-op if the source has no bank yet.
     */
    cloneTarget(sourceId: string, cloneId: string): void {
        const source = this.banks.get(sourceId);
        if (source) this.banks.set(cloneId, source.cloneInto(cloneId));
    }

    setTargetVolume(targetId: string, volume: number): void {
        this.getBank(targetId).setVolume(volume);
    }

    stopTarget(targetId: string): void {
        this.banks.get(targetId)?.stopAll();
    }

    stopAll(): void {
        for (const bank of this.banks.values()) {
            bank.stopAll();
        }
    }
}
