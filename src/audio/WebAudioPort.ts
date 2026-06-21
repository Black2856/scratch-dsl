import type {AudioPort} from './AudioPort.ts';

export interface WebAudioPlayback {
    readonly source: AudioBufferSourceNode;
    readonly gain: GainNode;
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
        const playback: WebAudioPlayback = {source, gain, stopped: false};
        source.buffer = decoded;
        source.connect(gain);
        gain.connect(this.context.destination);
        source.onended = () => {
            source.disconnect();
            gain.disconnect();
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
}
