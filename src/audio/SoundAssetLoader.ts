import type {AssetManager} from '../assets/AssetManager.ts';
import type {Project} from '../model/Project.ts';
import type {SoundManager} from './SoundManager.ts';

/**
 * Connects validated Project sound references to AssetManager bytes and
 * populates the target-specific SoundBanks.
 */
export const loadProjectSounds = async <TDecoded, TPlayback>(
    project: Project,
    assets: AssetManager<unknown, unknown>,
    sounds: SoundManager<TDecoded, TPlayback>
): Promise<void> => {
    const targets = [project.stage, ...project.sprites];
    await Promise.all(targets.flatMap(target => target.sounds.map(async sound => {
        const asset = assets.get(sound.assetId);
        if (!asset || asset.kind !== 'sound' || asset.status !== 'ready' || asset.bytes === null) {
            throw new Error(`Sound asset ${sound.assetId} is not ready.`);
        }
        await sounds.loadSound(target.id, sound.id, sound.assetId, asset.bytes);
        sounds.setTargetVolume(target.id, target.volume);
    })));
};
