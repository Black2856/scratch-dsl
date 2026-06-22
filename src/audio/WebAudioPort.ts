import type {AudioPort} from './AudioPort.ts';

export interface WebAudioPlayback {
    readonly source: AudioBufferSourceNode;
    readonly gain: GainNode;
    readonly panner: StereoPannerNode;
    stopped: boolean;
}

/**
 * Browser adapter for the DOM-free AudioPort. AudioContext is injected so
 * creation/resume can happen from an application-controlled user gesture.
 */
export class WebAudioPort implements AudioPort<AudioBuffer, WebAudioPlayback> {
    private readonly context: AudioContext;

    constructor(context: AudioContext) {
        this.context = context;
    }

    async start(): Promise<void> {
        if (this.context.state === 'suspended') {
            await this.context.resume();
        }
    }

    async decode(bytes: Uint8Array): Promise<AudioBuffer> {
        const copy = bytes.slice();
        return this.context.decodeAudioData(copy.buffer);
    }

    play(decoded: AudioBuffer, onEnded: () => void): WebAudioPlayback {
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        const panner = this.context.createStereoPanner();
        const playback: WebAudioPlayback = {source, gain, panner, stopped: false};
        source.buffer = decoded;
        // source -> gain -> panner -> destination (pitch via source.playbackRate).
        source.connect(gain);
        gain.connect(panner);
        panner.connect(this.context.destination);
        source.onended = () => {
            source.disconnect();
            gain.disconnect();
            panner.disconnect();
            onEnded();
        };
        source.start();
        return playback;
    }

    stop(playback: WebAudioPlayback): void {
        if (playback.stopped) return;
        playback.stopped = true;
        playback.source.stop();
    }

    setVolume(playback: WebAudioPlayback, volume: number): void {
        const normalized = Math.min(100, Math.max(0, volume)) / 100;
        playback.gain.gain.setValueAtTime(normalized, this.context.currentTime);
    }

    setPitch(playback: WebAudioPlayback, pitch: number): void {
        // Scratch pitch effect: 120 units = one octave. Clamp to ±360 (±3 oct).
        const clamped = Math.min(360, Math.max(-360, pitch));
        playback.source.playbackRate.setValueAtTime(2 ** (clamped / 120), this.context.currentTime);
    }

    setPan(playback: WebAudioPlayback, pan: number): void {
        const normalized = Math.min(100, Math.max(-100, pan)) / 100;
        playback.panner.pan.setValueAtTime(normalized, this.context.currentTime);
    }
}
