/**
 * Per-target say/think bubble state behind `looks_say` / `looks_think` and
 * their timed variants. Mirrors the official VM's bubble state: each target has
 * at most one bubble, and every update bumps a `usageId` generation counter so
 * a `say for secs` timeout only clears the bubble it created (a later say/think
 * supersedes it and must not be wiped by the earlier deadline).
 *
 * Text is stored already formatted (numbers stringified, capped at the Scratch
 * 330-char bubble limit). An empty text hides the bubble. No DOM/Canvas here —
 * the RendererPort paints bubbles from a per-tick snapshot.
 */
export type BubbleType = 'say' | 'think';

export interface BubbleState {
    type: BubbleType;
    text: string;
    usageId: number;
}

/** Scratch's say/think bubble text limit. */
export const BUBBLE_TEXT_LIMIT = 330;

export class BubbleManager {
    private readonly bubbles = new Map<string, BubbleState>();
    private nextUsageId = 1;

    /**
     * Sets (or updates) a target's bubble. An empty string hides the bubble but
     * still bumps the generation, so a pending timed-clear sees the change.
     * Returns the new usageId so timed say/think can detect later overrides.
     */
    set(targetId: string, type: BubbleType, text: string): number {
        const usageId = this.nextUsageId++;
        this.bubbles.set(targetId, {type, text, usageId});
        return usageId;
    }

    /** Current bubble state for a target, or undefined if none. */
    get(targetId: string): BubbleState | undefined {
        return this.bubbles.get(targetId);
    }

    /** The current generation id for a target's bubble, or 0 if none. */
    usageId(targetId: string): number {
        return this.bubbles.get(targetId)?.usageId ?? 0;
    }

    /** Removes a target's bubble entirely (clone delete / target stop). */
    delete(targetId: string): void {
        this.bubbles.delete(targetId);
    }

    /** Clears every bubble (stop all). */
    clear(): void {
        this.bubbles.clear();
    }

    /** Live, non-empty bubbles, in insertion order. */
    active(): Array<{targetId: string} & BubbleState> {
        const result: Array<{targetId: string} & BubbleState> = [];
        for (const [targetId, state] of this.bubbles) {
            if (state.text !== '') result.push({targetId, ...state});
        }
        return result;
    }
}
