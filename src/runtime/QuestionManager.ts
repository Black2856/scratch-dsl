import type {BubbleManager} from './BubbleManager.ts';

/**
 * UI seam for the answer prompt (`sensing_askandwait`). The preview shows the
 * question text and an input box; on submit it calls `Runtime.submitAnswer`.
 * Headless Runtimes leave this unset and drive answers directly via
 * submitAnswer in tests.
 */
export interface QuestionUiPort {
    /** Shows the question prompt. Empty string = visible-sprite case (bubble carries the text). */
    showQuestion(text: string): void;
    /** Hides the prompt (queue drained / cleared). */
    clearQuestion(): void;
}

interface PendingQuestion {
    question: string;
    resolve: () => void;
    targetId: string;
    wasVisible: boolean;
    wasStage: boolean;
}

/**
 * FIFO question queue behind `sensing_askandwait` / `sensing_answer`, mirroring
 * the official VM's Scratch3SensingBlocks queue:
 *  - questions are answered in order;
 *  - a visible sprite shows the question in its say bubble and the prompt text
 *    is blank; the Stage or a hidden sprite shows the prompt text;
 *  - stop-all and per-target stop release waiting threads (resolve + dequeue)
 *    so a pending `ask and wait` never hangs forever.
 */
export class QuestionManager {
    private queue: PendingQuestion[] = [];
    private answer = '';
    private readonly bubbles: BubbleManager;
    private ui?: QuestionUiPort;

    constructor(bubbles: BubbleManager, ui?: QuestionUiPort) {
        this.bubbles = bubbles;
        this.ui = ui;
    }

    setUi(ui: QuestionUiPort | undefined): void {
        this.ui = ui;
    }

    /** The latest submitted answer (`sensing_answer`). */
    getAnswer(): string {
        return this.answer;
    }

    /**
     * Enqueues a question and returns a Promise that resolves when answered (or
     * released). Shows the prompt immediately if the queue was empty.
     */
    ask(question: string, targetId: string, wasVisible: boolean, wasStage: boolean): Promise<void> {
        return new Promise<void>(resolve => {
            const wasAsking = this.queue.length > 0;
            this.queue.push({question, resolve, targetId, wasVisible, wasStage});
            if (!wasAsking) this.showHead();
        });
    }

    /** Submits an answer for the head question and advances the queue. */
    submitAnswer(answer: string): void {
        this.answer = answer;
        const head = this.queue.shift();
        if (!head) return;
        if (head.wasVisible && !head.wasStage) {
            this.bubbles.set(head.targetId, 'say', '');
        }
        head.resolve();
        this.showHead();
    }

    /** Releases the whole queue (stop all): resolve every waiter, clear prompt. */
    clearAll(): void {
        const pending = this.queue;
        this.queue = [];
        this.ui?.clearQuestion();
        for (const entry of pending) entry.resolve();
    }

    /** Releases questions owned by a stopped/deleted target. */
    clearForTarget(targetId: string): void {
        const wasAskingHead = this.queue.length > 0 && this.queue[0].targetId === targetId;
        const removed = this.queue.filter(q => q.targetId === targetId);
        this.queue = this.queue.filter(q => q.targetId !== targetId);
        for (const entry of removed) entry.resolve();
        if (wasAskingHead) {
            if (this.queue.length > 0) this.showHead();
            else this.ui?.clearQuestion();
        }
    }

    /** Shows the current head question via bubble (visible sprite) or prompt. */
    private showHead(): void {
        const head = this.queue[0];
        if (!head) {
            this.ui?.clearQuestion();
            return;
        }
        if (head.wasVisible && !head.wasStage) {
            this.bubbles.set(head.targetId, 'say', head.question);
            this.ui?.showQuestion('');
        } else {
            this.ui?.showQuestion(head.question);
        }
    }
}
