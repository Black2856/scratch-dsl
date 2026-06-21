import assert from 'node:assert/strict';
import test from 'node:test';

import type {RuntimeAudioPort, RuntimeSoundPlayback} from '../../src/audio/AudioPort.ts';
import {createProject} from '../../src/model/ProjectFactory.ts';
import {Runtime} from '../../src/runtime/Runtime.ts';
import type {DslBlock, DslProject} from '../../src/validation/projectValidator.ts';
import {createMinimalProject} from '../fixtures/minimalProject.ts';

class DeferredPlayback implements RuntimeSoundPlayback {
    readonly finished: Promise<void>;
    private resolveFinished!: () => void;

    constructor() {
        this.finished = new Promise(resolve => {
            this.resolveFinished = resolve;
        });
    }

    stop(): void {
        this.resolveFinished();
    }

    finish(): void {
        this.resolveFinished();
    }
}

class FakeRuntimeAudio implements RuntimeAudioPort {
    readonly plays: Array<{targetId: string; soundId: string; playback: DeferredPlayback}> = [];
    readonly volumes: Array<{targetId: string; volume: number}> = [];
    stopAllCalls = 0;

    play(targetId: string, soundId: string): DeferredPlayback {
        const playback = new DeferredPlayback();
        this.plays.push({targetId, soundId, playback});
        return playback;
    }

    setTargetVolume(targetId: string, volume: number): void {
        this.volumes.push({targetId, volume});
    }

    stopTarget(targetId: string): void {
        for (const item of this.plays) {
            if (item.targetId === targetId) item.playback.stop();
        }
    }

    stopAll(): void {
        this.stopAllCalls++;
        for (const item of this.plays) item.playback.stop();
    }
}

const block = (
    id: string,
    opcode: string,
    next: string | null,
    parent: string | null,
    inputs: DslBlock['inputs'] = {},
    fields: DslBlock['fields'] = {},
    topLevel = false,
    shadow = false
): DslBlock => ({id, opcode, next, parent, inputs, fields, topLevel, shadow});

const createSoundProject = (body: Record<string, DslBlock>): DslProject => {
    const dsl = createMinimalProject();
    dsl.stage.variables.push({
        id: 'var-sound-result',
        name: 'sound result',
        value: 0,
        isCloud: false
    });
    const sprite = dsl.sprites[0];
    sprite.blocks = body;
    sprite.scripts = ['sound-flag'];
    sprite.sounds = [{
        id: 'sound-pop',
        name: 'Pop',
        assetId: 'asset-pop',
        dataFormat: 'wav',
        md5ext: 'asset-pop.wav',
        format: '',
        rate: 44100,
        sampleCount: 1
    }];
    dsl.assets = [{
        id: 'asset-pop',
        kind: 'sound',
        dataFormat: 'wav',
        md5ext: 'asset-pop.wav'
    }];
    return dsl;
};

const menuBlocks = (commandId: string): Record<string, DslBlock> => ({
    'sound-menu': block(
        'sound-menu',
        'sound_sounds_menu',
        null,
        commandId,
        {},
        {SOUND_MENU: {value: 'Pop'}},
        false,
        true
    )
});

const resultSetter = (parent: string, valueBlock: string): Record<string, DslBlock> => ({
    'set-result': block(
        'set-result',
        'data_setvariableto',
        null,
        parent,
        {VALUE: {block: valueBlock, shadow: valueBlock}},
        {VARIABLE: {value: 'sound result', id: 'var-sound-result'}}
    ),
    [valueBlock]: block(
        valueBlock,
        'text',
        null,
        'set-result',
        {},
        {TEXT: {value: 1}},
        false,
        true
    )
});

test('sound_play starts playback and advances immediately', () => {
    const audio = new FakeRuntimeAudio();
    const body = {
        'sound-flag': block('sound-flag', 'event_whenflagclicked', 'play', null, {}, {}, true),
        play: block(
            'play',
            'sound_play',
            'set-result',
            'sound-flag',
            {SOUND_MENU: {block: 'sound-menu', shadow: 'sound-menu'}}
        ),
        ...menuBlocks('play'),
        ...resultSetter('play', 'one')
    };
    const runtime = new Runtime({audio});
    runtime.load(createProject(createSoundProject(body)));
    runtime.start();
    runtime.greenFlag();
    runtime.tick();

    assert.equal(audio.plays.length, 1);
    assert.equal(audio.plays[0].soundId, 'sound-pop');
    assert.equal(runtime.project.stage.variables.get('var-sound-result'), 1);
});

test('sound_playuntildone waits once, then advances after playback finishes', async () => {
    const audio = new FakeRuntimeAudio();
    const body = {
        'sound-flag': block('sound-flag', 'event_whenflagclicked', 'play-wait', null, {}, {}, true),
        'play-wait': block(
            'play-wait',
            'sound_playuntildone',
            'set-result',
            'sound-flag',
            {SOUND_MENU: {block: 'sound-menu', shadow: 'sound-menu'}}
        ),
        ...menuBlocks('play-wait'),
        ...resultSetter('play-wait', 'one')
    };
    const runtime = new Runtime({audio});
    runtime.load(createProject(createSoundProject(body)));
    runtime.start();
    runtime.greenFlag();
    runtime.tick();

    assert.equal(runtime.project.stage.variables.get('var-sound-result'), 0);
    assert.equal(audio.plays.length, 1);

    audio.plays[0].playback.finish();
    await Promise.resolve();
    await Promise.resolve();
    runtime.tick();

    assert.equal(runtime.project.stage.variables.get('var-sound-result'), 1);
    assert.equal(audio.plays.length, 1);
});

test('sound_stopallsounds invokes the audio port and Runtime.stopAll also stops audio', () => {
    const audio = new FakeRuntimeAudio();
    const body = {
        'sound-flag': block('sound-flag', 'event_whenflagclicked', 'stop-sounds', null, {}, {}, true),
        'stop-sounds': block('stop-sounds', 'sound_stopallsounds', null, 'sound-flag')
    };
    const runtime = new Runtime({audio});
    runtime.load(createProject(createSoundProject(body)));
    runtime.start();
    runtime.greenFlag();
    const afterGreenFlag = audio.stopAllCalls;
    runtime.tick();
    assert.equal(audio.stopAllCalls, afterGreenFlag + 1);
    runtime.stopAll();
    assert.equal(audio.stopAllCalls, afterGreenFlag + 2);
});

test('sound volume commands clamp target volume and reporter returns it', () => {
    const audio = new FakeRuntimeAudio();
    const body = {
        'sound-flag': block('sound-flag', 'event_whenflagclicked', 'set-volume', null, {}, {}, true),
        'set-volume': block(
            'set-volume',
            'sound_setvolumeto',
            'change-volume',
            'sound-flag',
            {VOLUME: {block: 'volume-150', shadow: 'volume-150'}}
        ),
        'volume-150': block(
            'volume-150', 'math_number', null, 'set-volume', {}, {NUM: {value: 150}}, false, true
        ),
        'change-volume': block(
            'change-volume',
            'sound_changevolumeby',
            'set-result',
            'set-volume',
            {VOLUME: {block: 'volume-minus-25', shadow: 'volume-minus-25'}}
        ),
        'volume-minus-25': block(
            'volume-minus-25', 'math_number', null, 'change-volume', {}, {NUM: {value: -25}}, false, true
        ),
        'set-result': block(
            'set-result',
            'data_setvariableto',
            null,
            'change-volume',
            {VALUE: {block: 'volume-reporter', shadow: null}},
            {VARIABLE: {value: 'sound result', id: 'var-sound-result'}}
        ),
        'volume-reporter': block('volume-reporter', 'sound_volume', null, 'set-result')
    };
    const runtime = new Runtime({audio});
    runtime.load(createProject(createSoundProject(body)));
    runtime.start();
    runtime.greenFlag();
    runtime.tick();

    assert.equal(runtime.project.sprites[0].volume, 75);
    assert.equal(runtime.project.stage.variables.get('var-sound-result'), 75);
    assert.deepEqual(audio.volumes.map(item => item.volume), [100, 75]);
});
