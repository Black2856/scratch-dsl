import {Target, type TargetOptions} from './Target.ts';

export type VideoState = 'on' | 'off' | 'on-flipped';

export interface StageOptions extends TargetOptions {
    isStage: true;
    tempo: number;
    videoTransparency: number;
    videoState: VideoState;
    textToSpeechLanguage: string | null;
}

/**
 * The single Stage target of a Project. Adds stage-only fields (tempo,
 * video transparency/state, text-to-speech language) on top of the common
 * Target base. Per SCRATCH_TARGET_SPEC, the Stage never has
 * coordinate/direction/draggable fields.
 */
export class Stage extends Target {
    readonly isStage: true = true;
    readonly tempo: number;
    readonly videoTransparency: number;
    readonly videoState: VideoState;
    readonly textToSpeechLanguage: string | null;

    constructor(options: StageOptions) {
        super(options);
        this.tempo = options.tempo;
        this.videoTransparency = options.videoTransparency;
        this.videoState = options.videoState;
        this.textToSpeechLanguage = options.textToSpeechLanguage;
    }
}
