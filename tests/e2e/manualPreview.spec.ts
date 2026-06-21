import {expect, test} from '@playwright/test';

test.describe('Phase 7.1 workspace manual preview', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('http://localhost:3211/manual-preview.html');
        await page.waitForFunction(() =>
            (window as any).ManualPreview?.getStatus() === 'ready'
        );
    });

    test('loads workspace assets and renders a 480x360 initial frame', async ({page}) => {
        await expect(page.locator('#project-name')).toHaveText('full-feature-minimal');
        await expect(page.locator('#asset-state')).toContainText('2/2 ready');
        const canvas = page.locator('#stage');
        await expect(canvas).toHaveAttribute('width', '480');
        await expect(canvas).toHaveAttribute('height', '360');

        const opaquePixels = await page.evaluate(() => {
            const context = (document.getElementById('stage') as HTMLCanvasElement)
                .getContext('2d')!;
            const pixels = context.getImageData(0, 0, 480, 360).data;
            let opaque = 0;
            for (let index = 3; index < pixels.length; index += 4) {
                if (pixels[index] > 0) opaque++;
            }
            return opaque;
        });
        expect(opaquePixels).toBeGreaterThan(0);
    });

    test('green flag ticks Runtime, waits for sound completion, and Stop clears execution', async ({page}) => {
        await page.click('#green-flag');
        await expect.poll(() => page.evaluate(
            () => (window as any).ManualPreview.getStatus()
        )).toBe('running');
        await expect.poll(() => page.evaluate(
            () => (window as any).ManualPreview.getActiveSoundCount()
        )).toBeGreaterThan(0);
        await expect(page.locator('#audio-state')).toHaveText('running');

        await expect.poll(() => page.evaluate(
            () => (window as any).ManualPreview.getCloneCount()
        ), {timeout: 10000}).toBe(1);
        await expect.poll(() => page.evaluate(
            () => (window as any).ManualPreview.getActiveSoundCount()
        )).toBe(0);

        await page.click('#stop');
        await expect.poll(() => page.evaluate(
            () => (window as any).ManualPreview.getStatus()
        )).toBe('stopped');
        await expect.poll(() => page.evaluate(
            () => (window as any).ManualPreview.getCloneCount()
        )).toBe(0);
        await expect.poll(() => page.evaluate(
            () => (window as any).ManualPreview.getActiveSoundCount()
        )).toBe(0);
    });
});
