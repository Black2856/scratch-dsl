import type {AssetDecoder, AssetRecord} from '../assets/types.ts';
import {AssetManager} from '../assets/AssetManager.ts';
import type {DslCostume} from '../validation/projectValidator.ts';
import type {Project} from '../model/Project.ts';
import {BitmapSkin} from './BitmapSkin.ts';
import type {CanvasRenderer} from './CanvasRenderer.ts';

export type DecodedImage = HTMLImageElement | ImageBitmap;

export class BrowserImageDecoder implements AssetDecoder<DecodedImage> {
    async decode(record: AssetRecord): Promise<DecodedImage> {
        if (record.bytes === null) {
            throw new Error(`Asset ${record.assetId} has no bytes.`);
        }
        const blob = new Blob([record.bytes], {type: record.mimeType});
        const url = URL.createObjectURL(blob);
        try {
            const image = new Image();
            image.src = url;
            await image.decode();
            return image;
        } finally {
            URL.revokeObjectURL(url);
        }
    }
}

export const createCostumeSkin = async (
    assets: AssetManager<DecodedImage, unknown>,
    costume: DslCostume
): Promise<BitmapSkin> => {
    const image = await assets.decodeImage(costume.assetId);
    const resolution = costume.bitmapResolution || 1;
    return new BitmapSkin(
        image,
        costume.rotationCenterX / resolution,
        costume.rotationCenterY / resolution,
        1 / resolution
    );
};

/**
 * Resolves each target's current costume through AssetManager and registers
 * the resulting Skin with CanvasRenderer.
 */
export const loadCurrentCostumeSkins = async (
    project: Project,
    assets: AssetManager<DecodedImage, unknown>,
    renderer: CanvasRenderer
): Promise<void> => {
    const targets = [project.stage, ...project.sprites];
    await Promise.all(targets.map(async target => {
        const costume = target.costumes[target.currentCostume];
        if (!costume) return;
        renderer.registerSkin(target.id, await createCostumeSkin(assets, costume));
    }));
};

/**
 * Decodes and registers *every* costume Skin for each target, so `next costume`
 * / `switch backdrop` blocks repaint with the correct image (the per-frame
 * costume index selects the skin). Costume-less targets are skipped.
 */
export const loadAllCostumeSkins = async (
    project: Project,
    assets: AssetManager<DecodedImage, unknown>,
    renderer: CanvasRenderer
): Promise<void> => {
    const targets = [project.stage, ...project.sprites];
    await Promise.all(targets.map(async target => {
        if (target.costumes.length === 0) return;
        const skins = await Promise.all(target.costumes.map(costume => createCostumeSkin(assets, costume)));
        renderer.registerCostumeSkins(target.id, skins);
    }));
};
