import assert from 'node:assert/strict';
import test from 'node:test';

import type {AudioPort} from '../../src/audio/AudioPort.ts';
import {clampVolume} from '../../src/audio/AudioPort.ts';
import {SoundManager} from '../../src/audio/SoundManager.ts';
import {loadProjectSounds} from '../../src/audio/SoundAssetLoader.ts';
import {AssetManager} from '../../src/assets/AssetManager.ts';
import {createProject} from '../../src/model/ProjectFactory.ts';
import {createMinimalProject} from '../fixtures/minimalProject.ts';

interface FakeDecoded {
    bytes: number[];
}

interface FakePlayback {
    id: number;
    decoded: FakeDecoded;
    onEnded: () => void;
    stopped: boolean;
    volume: number;
}

class FakeAudioPort implements AudioPort<FakeDecoded, FakePlayback> {
    decodeCalls: Uint8Array[] = [];
    playbacks: FakePlayback[] = [];

    async decode(bytes: Uint8Array): Promise<FakeDecoded> {
        this.decodeCalls.push(bytes);
        return {bytes: [...bytes]};
    }

    play(decoded: FakeDecoded, onEnded: () => void): FakePlayback {
        const playback = {
            id: this.playbacks.length,
            decoded,
            onEnded,
            stopped: false,
            volume: -1
        };
        this.playbacks.push(playback);
        return playback;
    }

    stop(playback: FakePlayback): void {
        playback.stopped = true;
    }

    setVolume(playback: FakePlayback, volume: number): void {
        playback.volume = volume;
    }

    end(playback: FakePlayback): void {
        playback.onEnded();
    }
}

test('clampVolume constrains finite values to the Scratch 0..100 range', () => {
    assert.equal(clampVolume(-1), 0);
    assert.equal(clampVolume(25.5), 25.5);
    assert.equal(clampVolume(101), 100);
    assert.equal(clampVolume(Number.NaN), 0);
    assert.equal(clampVolume(Number.POSITIVE_INFINITY), 100);
    assert.equal(clampVolume(Number.NEGATIVE_INFINITY), 0);
});

test('SoundManager creates one independent SoundBank per target', () => {
    const manager = new SoundManager(new FakeAudioPort());

    const first = manager.getBank('target-a');
    assert.equal(manager.getBank('target-a'), first);
    assert.notEqual(manager.getBank('target-b'), first);
});

test('loadSound caches derived decoded data by asset ID', async () => {
    const audio = new FakeAudioPort();
    const manager = new SoundManager(audio);

    await manager.loadSound('target-a', 'sound-a', 'asset-shared', new Uint8Array([1, 2]));
    await manager.loadSound('target-b', 'sound-b', 'asset-shared', new Uint8Array([9, 9]));

    assert.equal(audio.decodeCalls.length, 1);
});

test('SoundPlayer.finished resolves when playback ends naturally', async () => {
    const audio = new FakeAudioPort();
    const manager = new SoundManager(audio);
    const player = await manager.loadSound(
        'target-a',
        'sound-a',
        'asset-a',
        new Uint8Array([1])
    );

    player.play();
    assert.equal(player.isPlaying, true);

    const finished = player.finished;
    audio.end(audio.playbacks[0]);
    await finished;

    assert.equal(player.isPlaying, false);
});

test('bank volume is clamped and applied to current and future playback', async () => {
    const audio = new FakeAudioPort();
    const manager = new SoundManager(audio);
    const bank = manager.getBank('target-a');
    const player = await manager.loadSound(
        'target-a',
        'sound-a',
        'asset-a',
        new Uint8Array([1])
    );

    manager.setTargetVolume('target-a', 150);
    manager.play('target-a', 'sound-a');
    assert.equal(bank.getVolume(), 100);
    assert.equal(audio.playbacks[0].volume, 100);

    manager.setTargetVolume('target-a', -20);
    assert.equal(bank.getVolume(), 0);
    assert.equal(audio.playbacks[0].volume, 0);
});

test('stopAll stops playback in every target and resolves finished Promises', async () => {
    const audio = new FakeAudioPort();
    const manager = new SoundManager(audio);
    const first = await manager.loadSound(
        'target-a',
        'sound-a',
        'asset-a',
        new Uint8Array([1])
    );
    const second = await manager.loadSound(
        'target-b',
        'sound-b',
        'asset-b',
        new Uint8Array([2])
    );

    first.play();
    second.play();
    const finished = Promise.all([first.finished, second.finished]);

    manager.stopAll();
    await finished;

    assert.equal(audio.playbacks.every(playback => playback.stopped), true);
    assert.equal(first.isPlaying, false);
    assert.equal(second.isPlaying, false);
});

test('replaying a SoundPlayer stops and completes the previous playback', async () => {
    const audio = new FakeAudioPort();
    const manager = new SoundManager(audio);
    const player = await manager.loadSound(
        'target-a',
        'sound-a',
        'asset-a',
        new Uint8Array([1])
    );

    player.play();
    const firstFinished = player.finished;
    player.play();
    await firstFinished;

    assert.equal(audio.playbacks[0].stopped, true);
    assert.equal(player.isPlaying, true);
    assert.equal(audio.playbacks.length, 2);
});

test('loadProjectSounds resolves AssetManager bytes into target SoundBanks', async () => {
    const dsl = createMinimalProject();
    dsl.sprites[0].sounds = [{
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
    const project = createProject(dsl);
    const assets = new AssetManager([{
        assetId: 'asset-pop',
        md5ext: 'asset-pop.wav',
        dataFormat: 'wav',
        kind: 'sound',
        mimeType: 'audio/wav',
        status: 'ready',
        source: 'test',
        bytes: new Uint8Array([7, 8])
    }]);
    const audio = new FakeAudioPort();
    const manager = new SoundManager(audio);

    await loadProjectSounds(project, assets, manager);
    assert.ok(manager.play(dsl.sprites[0].id, 'sound-pop'));
    assert.deepEqual(audio.decodeCalls[0], new Uint8Array([7, 8]));
});
