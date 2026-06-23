import {Cast, LIST_ALL, LIST_INVALID} from '../cast/Cast.ts';
import {MathUtil} from '../cast/MathUtil.ts';
import {keepInFence} from './fencing.ts';
import {parseHexColor} from './penColor.ts';
import {BUBBLE_TEXT_LIMIT} from './BubbleManager.ts';
import {Clone} from '../model/Clone.ts';
import type {Stage} from '../model/Stage.ts';
import type {Sprite} from '../model/Sprite.ts';
import {resolveTargetXY, type Point} from './TargetResolver.ts';
import type {Thread} from './Thread.ts';
import type {BlockUtil, PrimitiveValue} from './BlockRunner.ts';
import {STAGE_WIDTH, STAGE_HEIGHT} from './coordinates.ts';

export type CommandPrimitive = (util: BlockUtil) => void | PromiseLike<unknown>;
export type ReporterPrimitive = (util: BlockUtil) => PrimitiveValue;

// ---------------------------------------------------------------------------
// motion
// ---------------------------------------------------------------------------

const motionMoveSteps: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    const steps = Cast.toNumber(util.getInput('STEPS'));
    const radians = util.target.direction * Math.PI / 180;
    // setXY applies fencing and draws the pen segment (when pen is down) at the
    // fenced landing position, so the mark matches where the sprite ends up.
    util.setXY(
        util.target.x + (steps * Math.sin(radians)),
        util.target.y + (steps * Math.cos(radians))
    );
};

const motionGotoXY: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    util.setXY(Cast.toNumber(util.getInput('X')), Cast.toNumber(util.getInput('Y')));
};

const motionSetX: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    util.setXY(Cast.toNumber(util.getInput('X')), util.target.y);
};

const motionSetY: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    util.setXY(util.target.x, Cast.toNumber(util.getInput('Y')));
};

const motionChangeXBy: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    util.setXY(util.target.x + Cast.toNumber(util.getInput('DX')), util.target.y);
};

const motionChangeYBy: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    util.setXY(util.target.x, util.target.y + Cast.toNumber(util.getInput('DY')));
};

const motionTurnRight: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    util.target.setDirection(util.target.direction + Cast.toNumber(util.getInput('DEGREES')));
};

const motionTurnLeft: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    util.target.setDirection(util.target.direction - Cast.toNumber(util.getInput('DEGREES')));
};

const motionPointInDirection: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    util.target.setDirection(Cast.toNumber(util.getInput('DIRECTION')));
};

const motionSetRotationStyle: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    const style = Cast.toString(util.field('STYLE')?.value ?? '');
    if (style === 'all around' || style === 'left-right' || style === "don't rotate") {
        util.target.setRotationStyle(style);
    }
};

const motionXPosition: ReporterPrimitive = (util) =>
    util.target.isStage ? 0 : util.target.x;

const motionYPosition: ReporterPrimitive = (util) =>
    util.target.isStage ? 0 : util.target.y;

const motionDirection: ReporterPrimitive = (util) =>
    util.target.isStage ? 90 : util.target.direction;

// ---------------------------------------------------------------------------
// looks
// ---------------------------------------------------------------------------

const looksShow: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    util.target.setVisible(true);
};

const looksHide: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    util.target.setVisible(false);
};

const looksSetSizeTo: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    util.target.setSize(Cast.toNumber(util.getInput('SIZE')));
};

const looksChangeSizeBy: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    util.target.setSize(util.target.size + Cast.toNumber(util.getInput('CHANGE')));
};

const looksSwitchCostumeTo: CommandPrimitive = (util) => {
    const costumes = util.target.costumes;
    if (costumes.length === 0) return;
    const requested = util.getInput('COSTUME');
    if (typeof requested === 'string') {
        const byName = costumes.findIndex(costume => costume.name === requested);
        if (byName !== -1) {
            util.target.setCostume(byName);
            return;
        }
        if (requested === 'next costume') {
            util.target.setCostume(util.target.currentCostume + 1);
            return;
        }
        if (requested === 'previous costume') {
            util.target.setCostume(util.target.currentCostume - 1);
            return;
        }
        const numeric = Number(requested);
        if (!Number.isNaN(numeric)) util.target.setCostume(Math.floor(numeric) - 1);
        return;
    }
    util.target.setCostume(Math.floor(Cast.toNumber(requested)) - 1);
};

const looksNextCostume: CommandPrimitive = (util) => {
    util.target.setCostume(util.target.currentCostume + 1);
};

/**
 * Reorders the non-stage draw targets (sprites + live clones) so `util.target`
 * moves by `delta` layers (clamped to the ends), then renumbers layerOrder
 * 1..n with the Stage implicitly at 0. Positive delta moves toward the front.
 */
const moveLayer = (util: BlockUtil, delta: number): void => {
    const target = util.target;
    if (target.isStage) return;
    const ordered: Sprite[] = [...util.runtime.project.sprites, ...util.runtime.clones]
        .slice()
        .sort((a, b) => a.layerOrder - b.layerOrder);
    const current = ordered.indexOf(target);
    if (current === -1) return;
    let next = current + delta;
    if (next < 0) next = 0;
    if (next > ordered.length - 1) next = ordered.length - 1;
    ordered.splice(current, 1);
    ordered.splice(next, 0, target);
    ordered.forEach((entry, index) => entry.setLayerOrder(index + 1));
};

const looksGoToFrontBack: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    const where = Cast.toString(util.field('FRONT_BACK')?.value ?? 'front');
    const span = util.runtime.project.sprites.length + util.runtime.clones.length;
    moveLayer(util, where === 'back' ? -span : span);
};

const looksGoForwardBackwardLayers: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    const amount = Math.round(Cast.toNumber(util.getInput('NUM')));
    const direction = Cast.toString(util.field('FORWARD_BACKWARD')?.value ?? 'forward');
    moveLayer(util, direction === 'backward' ? -amount : amount);
};

/**
 * Resolves the broadcast id referenced by an `event_broadcast`/
 * `event_broadcastandwait` block's BROADCAST_INPUT, given the menu shadow's
 * field value/id pair (`{value: name, id}` on `event_broadcast_menu`).
 */
const resolveBroadcastId = (util: BlockUtil): string | null => {
    // BROADCAST_INPUT's shadow is an `event_broadcast_menu` block whose sole
    // field (BROADCAST_OPTION) carries both the broadcast name (`value`) and
    // its id. getInput() on a shadow returns the field's `value`, i.e. the
    // name, which we resolve by name (id is the preferred match per spec,
    // but the shadow's field id is read directly here for precision).
    const name = Cast.toString(util.getInput('BROADCAST_INPUT'));
    const broadcast = util.runtime.project.broadcasts.getByName(name);
    return broadcast ? broadcast.id : null;
};

// ---------------------------------------------------------------------------
// control
// ---------------------------------------------------------------------------

const controlWait: CommandPrimitive = (util) => {
    const ctx = util.stackFrame as {deadline?: number};
    if (ctx.deadline === undefined) {
        const durationMs = Cast.toNumber(util.getInput('DURATION')) * 1000;
        ctx.deadline = util.runtime.currentMSecs + durationMs;
        util.yieldTick();
        return;
    }
    if (util.runtime.currentMSecs < ctx.deadline) {
        util.yieldTick();
    }
};

const controlRepeat: CommandPrimitive = (util) => {
    const ctx = util.stackFrame as {count?: number};
    if (ctx.count === undefined) {
        ctx.count = Math.round(Cast.toNumber(util.getInput('TIMES')));
    }
    ctx.count--;
    if (ctx.count >= 0) {
        util.startBranch('SUBSTACK', true);
    }
};

const controlForever: CommandPrimitive = (util) => {
    util.startBranch('SUBSTACK', true);
};

const controlIf: CommandPrimitive = (util) => {
    if (Cast.toBoolean(util.getInput('CONDITION'))) {
        util.startBranch('SUBSTACK', false);
    }
};

const controlIfElse: CommandPrimitive = (util) => {
    if (Cast.toBoolean(util.getInput('CONDITION'))) {
        util.startBranch('SUBSTACK', false);
    } else {
        util.startBranch('SUBSTACK2', false);
    }
};

const controlStop: CommandPrimitive = (util) => {
    const option = util.field('STOP_OPTION')?.value;
    if (option === 'all') {
        util.runtime.stopAll();
        return;
    }
    if (option === 'this script') {
        util.thread.stackFrames.length = 0;
        util.thread.status = 'DONE';
        return;
    }
    if (option === 'other scripts in sprite' || option === 'other scripts in stage') {
        for (const other of util.runtime.threads) {
            if (other !== util.thread && other.target === util.target) {
                other.stackFrames.length = 0;
                other.status = 'DONE';
            }
        }
    }
};

// ---------------------------------------------------------------------------
// data: variables
// ---------------------------------------------------------------------------

const dataSetVariableTo: CommandPrimitive = (util) => {
    const id = util.field('VARIABLE')?.id;
    if (!id) return;
    util.setVariableValue(id, util.getInput('VALUE'));
};

const dataChangeVariableBy: CommandPrimitive = (util) => {
    const id = util.field('VARIABLE')?.id;
    if (!id) return;
    util.changeVariableBy(id, Cast.toNumber(util.getInput('VALUE')));
};

const dataVariable: ReporterPrimitive = (util) => {
    const id = util.field('VARIABLE')?.id;
    if (!id) return '';
    return util.getVariableValue(id);
};

// ---------------------------------------------------------------------------
// data: lists
// ---------------------------------------------------------------------------

const getListValues = (util: BlockUtil, listId: string): PrimitiveValue[] | null => {
    const owner = util.getListOwner(listId);
    if (!owner) return null;
    return owner.lists.get(listId) as PrimitiveValue[];
};

const dataAddToList: CommandPrimitive = (util) => {
    const id = util.field('LIST')?.id;
    if (!id) return;
    const owner = util.getListOwner(id);
    const values = owner ? owner.lists.get(id) : undefined;
    if (!owner || !values) return;
    owner.lists.setValues(id, [...values, util.getInput('ITEM')]);
};

const dataDeleteOfList: CommandPrimitive = (util) => {
    const id = util.field('LIST')?.id;
    if (!id) return;
    const owner = util.getListOwner(id);
    const values = owner ? owner.lists.get(id) : undefined;
    if (!owner || !values) return;
    const index = Cast.toListIndex(
        util.getInput('INDEX'),
        values.length,
        true,
        () => util.runtime.random.random()
    );
    if (index === LIST_INVALID) return;
    if (index === LIST_ALL) {
        owner.lists.setValues(id, []);
        return;
    }
    const next = [...values];
    next.splice(index - 1, 1);
    owner.lists.setValues(id, next);
};

const dataDeleteAllOfList: CommandPrimitive = (util) => {
    const id = util.field('LIST')?.id;
    if (!id) return;
    const owner = util.getListOwner(id);
    if (!owner) return;
    owner.lists.setValues(id, []);
};

const dataInsertAtList: CommandPrimitive = (util) => {
    const id = util.field('LIST')?.id;
    if (!id) return;
    const owner = util.getListOwner(id);
    const values = owner ? owner.lists.get(id) : undefined;
    if (!owner || !values) return;
    const index = Cast.toListIndex(
        util.getInput('INDEX'),
        values.length + 1,
        false,
        () => util.runtime.random.random()
    );
    if (index === LIST_INVALID || index === LIST_ALL) return;
    const next = [...values];
    next.splice(index - 1, 0, util.getInput('ITEM'));
    owner.lists.setValues(id, next);
};

const dataReplaceItemOfList: CommandPrimitive = (util) => {
    const id = util.field('LIST')?.id;
    if (!id) return;
    const owner = util.getListOwner(id);
    const values = owner ? owner.lists.get(id) : undefined;
    if (!owner || !values) return;
    const index = Cast.toListIndex(
        util.getInput('INDEX'),
        values.length,
        false,
        () => util.runtime.random.random()
    );
    if (index === LIST_INVALID || index === LIST_ALL) return;
    const next = [...values];
    next[index - 1] = util.getInput('ITEM');
    owner.lists.setValues(id, next);
};

const dataItemOfList: ReporterPrimitive = (util) => {
    const id = util.field('LIST')?.id;
    if (!id) return '';
    const values = getListValues(util, id);
    if (!values) return '';
    const index = Cast.toListIndex(
        util.getInput('INDEX'),
        values.length,
        false,
        () => util.runtime.random.random()
    );
    if (index === LIST_INVALID || index === LIST_ALL) return '';
    return values[index - 1];
};

const dataItemNumOfList: ReporterPrimitive = (util) => {
    const id = util.field('LIST')?.id;
    if (!id) return 0;
    const values = getListValues(util, id);
    if (!values) return 0;
    const item = util.getInput('ITEM');
    for (let i = 0; i < values.length; i++) {
        if (Cast.compare(values[i], item) === 0) return i + 1;
    }
    return 0;
};

const dataLengthOfList: ReporterPrimitive = (util) => {
    const id = util.field('LIST')?.id;
    if (!id) return 0;
    const values = getListValues(util, id);
    return values ? values.length : 0;
};

const dataListContainsItem: ReporterPrimitive = (util) => {
    const id = util.field('LIST')?.id;
    if (!id) return false;
    const values = getListValues(util, id);
    if (!values) return false;
    const item = util.getInput('ITEM');
    return values.some(value => Cast.compare(value, item) === 0);
};

const dataListContents: ReporterPrimitive = (util) => {
    const id = util.field('LIST')?.id;
    if (!id) return '';
    const values = getListValues(util, id);
    if (!values) return '';
    const allSingleCharacters = values.every(value => Cast.toString(value).length === 1);
    return values.map(value => Cast.toString(value)).join(allSingleCharacters ? '' : ' ');
};

// ---------------------------------------------------------------------------
// event / broadcast
// ---------------------------------------------------------------------------

const eventBroadcast: CommandPrimitive = (util) => {
    const id = resolveBroadcastId(util);
    if (!id) return;
    util.runtime.startHats('event_whenbroadcastreceived', {broadcastId: id}, true);
};

interface BroadcastAndWaitContext {
    started?: import('./Thread.ts').Thread[];
}

const eventBroadcastAndWait: CommandPrimitive = (util) => {
    const ctx = util.stackFrame as BroadcastAndWaitContext;
    if (ctx.started === undefined) {
        const id = resolveBroadcastId(util);
        ctx.started = id ?
            util.runtime.startHats('event_whenbroadcastreceived', {broadcastId: id}, true) :
            [];
        if (ctx.started.length === 0) return;
        util.yieldTick();
        return;
    }
    const stillRunning = ctx.started.some(t => util.runtime.threads.includes(t) && t.status !== 'DONE');
    if (stillRunning) {
        util.yieldTick();
    }
};

// ---------------------------------------------------------------------------
// sound
// ---------------------------------------------------------------------------

const resolveSoundId = (util: BlockUtil): string | null => {
    const sounds = util.target.sounds;
    if (sounds.length === 0) return null;
    const requested = util.getInput('SOUND_MENU');
    if (typeof requested === 'string') {
        const byName = sounds.find(sound => sound.name === requested);
        if (byName) return byName.id;
    }
    const numeric = Math.floor(Cast.toNumber(requested));
    if (!Number.isFinite(numeric)) return null;
    const index = ((numeric - 1) % sounds.length + sounds.length) % sounds.length;
    return sounds[index].id;
};

const soundPlay: CommandPrimitive = (util) => {
    const soundId = resolveSoundId(util);
    if (soundId) util.runtime.audio?.play(util.target.id, soundId);
};

const soundPlayUntilDone: CommandPrimitive = (util) => {
    const soundId = resolveSoundId(util);
    if (!soundId) return;
    return util.runtime.audio?.play(util.target.id, soundId)?.finished;
};

const soundStopAll: CommandPrimitive = (util) => {
    util.runtime.audio?.stopAll();
};

const soundSetVolume: CommandPrimitive = (util) => {
    util.target.setVolume(Cast.toNumber(util.getInput('VOLUME')));
    util.runtime.audio?.setTargetVolume(util.target.id, util.target.volume);
};

const soundChangeVolume: CommandPrimitive = (util) => {
    util.target.changeVolume(Cast.toNumber(util.getInput('VOLUME')));
    util.runtime.audio?.setTargetVolume(util.target.id, util.target.volume);
};

const soundVolume: ReporterPrimitive = (util) => util.target.volume;

/** Shared pitch/pan effect update; applies the new state to the audio port. */
const updateSoundEffect = (util: BlockUtil, change: boolean): void => {
    const effect = Cast.toString(util.getInput('EFFECT')).toLowerCase();
    util.target.setSoundEffect(effect, Cast.toNumber(util.getInput('VALUE')), change);
    util.runtime.audio?.setTargetEffects?.(util.target.id, {...util.target.soundEffects});
};

const soundChangeEffect: CommandPrimitive = (util) => updateSoundEffect(util, true);
const soundSetEffect: CommandPrimitive = (util) => updateSoundEffect(util, false);

const soundClearEffects: CommandPrimitive = (util) => {
    util.target.clearSoundEffects();
    util.runtime.audio?.setTargetEffects?.(util.target.id, {...util.target.soundEffects});
};

const sensingLoudness: ReporterPrimitive = (util) => util.runtime.getLoudness();

// ---------------------------------------------------------------------------
// control: clones
// ---------------------------------------------------------------------------

/** Resolves a `create clone of` menu value to the sprite/clone to clone from. */
const resolveCloneSource = (util: BlockUtil, name: string): Sprite | undefined => {
    if (name === '_myself_' || name === '') {
        const target = util.target;
        return target.isStage ? undefined : target;
    }
    return util.runtime.project.sprites.find(sprite => sprite.name === name);
};

const controlCreateCloneOf: CommandPrimitive = (util) => {
    const source = resolveCloneSource(util, Cast.toString(util.getInput('CLONE_OPTION')));
    if (source) util.runtime.cloneManager.createClone(source);
};

const controlDeleteThisClone: CommandPrimitive = (util) => {
    const target = util.target;
    if (!(target instanceof Clone)) return;
    util.runtime.cloneManager.deleteClone(target);
    util.thread.stackFrames.length = 0;
    util.thread.status = 'DONE';
};

// ---------------------------------------------------------------------------
// control: custom procedures
// ---------------------------------------------------------------------------

const proceduresCall: CommandPrimitive = (util) => {
    const proccode = util.mutation?.proccode;
    if (typeof proccode !== 'string') return;
    const resolved = util.runtime.procedures.resolve(util.target, proccode);
    if (!resolved) return;

    // Evaluate arguments in the caller's context (keyed by argument id) before
    // pushing the procedure frame, then bind them by argument name.
    const params: Record<string, PrimitiveValue> = {};
    for (let index = 0; index < resolved.paramIds.length; index++) {
        const name = resolved.paramNames[index];
        if (name === undefined) continue;
        params[name] = util.getInput(resolved.paramIds[index]);
    }

    const warpMode = resolved.warp || util.thread.inWarpMode;
    util.thread.pushFrame(resolved.bodyId, false);
    const frame = util.thread.peekFrame();
    if (frame) {
        frame.params = params;
        frame.warpMode = warpMode;
    }
};

const argumentReporterStringNumber: ReporterPrimitive = (util) => {
    const name = Cast.toString(util.field('VALUE')?.value ?? '');
    const value = util.thread.getParam(name);
    return value === undefined ? '' : value;
};

const argumentReporterBoolean: ReporterPrimitive = (util) => {
    const name = Cast.toString(util.field('VALUE')?.value ?? '');
    const value = util.thread.getParam(name);
    return value === undefined ? false : Cast.toBoolean(value);
};

// ---------------------------------------------------------------------------
// pen
// ---------------------------------------------------------------------------

const penClear: CommandPrimitive = (util) => {
    util.runtime.renderer?.penClear?.();
};

const penPenDown: CommandPrimitive = (util) => {
    const target = util.target;
    if (target.isStage) return;
    const state = util.runtime.pen.getState(target.id);
    state.down = true;
    util.runtime.renderer?.penPoint?.(
        {x: target.x, y: target.y},
        {color: state.color, size: state.size}
    );
};

const penPenUp: CommandPrimitive = (util) => {
    util.runtime.pen.setDown(util.target.id, false);
};

const penStamp: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    // Stamp at the sprite's *current* position/costume (not the last rendered
    // frame), so a stamp right after a move lands where the sprite now is.
    util.runtime.renderer?.penStamp?.(
        util.target.id,
        util.runtime.spriteDrawableState(util.target)
    );
};

const penSetColorToColor: CommandPrimitive = (util) => {
    util.runtime.pen.setColor(util.target.id, Cast.toString(util.getInput('COLOR')));
};

const penChangeSizeBy: CommandPrimitive = (util) => {
    util.runtime.pen.changeSize(util.target.id, Cast.toNumber(util.getInput('SIZE')));
};

const penSetSizeTo: CommandPrimitive = (util) => {
    util.runtime.pen.setSize(util.target.id, Cast.toNumber(util.getInput('SIZE')));
};

const penChangeColorParamBy: CommandPrimitive = (util) => {
    const param = Cast.toString(util.getInput('COLOR_PARAM')).toLowerCase();
    util.runtime.pen.setColorParam(util.target.id, param, Cast.toNumber(util.getInput('VALUE')), true);
};

const penSetColorParamTo: CommandPrimitive = (util) => {
    const param = Cast.toString(util.getInput('COLOR_PARAM')).toLowerCase();
    util.runtime.pen.setColorParam(util.target.id, param, Cast.toNumber(util.getInput('VALUE')), false);
};

// ---------------------------------------------------------------------------
// operators
// ---------------------------------------------------------------------------

const operatorAdd: ReporterPrimitive = (util) =>
    Cast.toNumber(util.getInput('NUM1')) + Cast.toNumber(util.getInput('NUM2'));

const operatorSubtract: ReporterPrimitive = (util) =>
    Cast.toNumber(util.getInput('NUM1')) - Cast.toNumber(util.getInput('NUM2'));

const operatorMultiply: ReporterPrimitive = (util) =>
    Cast.toNumber(util.getInput('NUM1')) * Cast.toNumber(util.getInput('NUM2'));

const operatorDivide: ReporterPrimitive = (util) =>
    Cast.toNumber(util.getInput('NUM1')) / Cast.toNumber(util.getInput('NUM2'));

/**
 * Random in [FROM, TO]. Matches the official VM: when both operands read as
 * integers the result is an inclusive integer, otherwise a uniform float.
 * Operand order is normalised so FROM > TO still works.
 */
const operatorRandom: ReporterPrimitive = (util) => {
    const fromRaw = util.getInput('FROM');
    const toRaw = util.getInput('TO');
    const nFrom = Cast.toNumber(fromRaw);
    const nTo = Cast.toNumber(toRaw);
    const low = Math.min(nFrom, nTo);
    const high = Math.max(nFrom, nTo);
    if (low === high) return low;
    const next = util.runtime.random.random();
    if (Cast.isInt(fromRaw) && Cast.isInt(toRaw)) {
        return low + Math.floor(next * (high - low + 1));
    }
    return (next * (high - low)) + low;
};

const operatorLt: ReporterPrimitive = (util) =>
    Cast.compare(util.getInput('OPERAND1'), util.getInput('OPERAND2')) < 0;

const operatorEquals: ReporterPrimitive = (util) =>
    Cast.compare(util.getInput('OPERAND1'), util.getInput('OPERAND2')) === 0;

const operatorGt: ReporterPrimitive = (util) =>
    Cast.compare(util.getInput('OPERAND1'), util.getInput('OPERAND2')) > 0;

const operatorAnd: ReporterPrimitive = (util) =>
    Cast.toBoolean(util.getInput('OPERAND1')) && Cast.toBoolean(util.getInput('OPERAND2'));

const operatorOr: ReporterPrimitive = (util) =>
    Cast.toBoolean(util.getInput('OPERAND1')) || Cast.toBoolean(util.getInput('OPERAND2'));

const operatorNot: ReporterPrimitive = (util) =>
    !Cast.toBoolean(util.getInput('OPERAND'));

const operatorJoin: ReporterPrimitive = (util) =>
    Cast.toString(util.getInput('STRING1')) + Cast.toString(util.getInput('STRING2'));

const operatorLetterOf: ReporterPrimitive = (util) => {
    const text = Cast.toString(util.getInput('STRING'));
    const index = Cast.toNumber(util.getInput('LETTER'));
    if (index < 1 || index > text.length) return '';
    return text.charAt(index - 1);
};

const operatorLength: ReporterPrimitive = (util) =>
    Cast.toString(util.getInput('STRING')).length;

const operatorContains: ReporterPrimitive = (util) => {
    const haystack = Cast.toString(util.getInput('STRING1')).toLowerCase();
    const needle = Cast.toString(util.getInput('STRING2')).toLowerCase();
    return haystack.includes(needle);
};

// ---------------------------------------------------------------------------
// sensing
// ---------------------------------------------------------------------------

const sensingMouseX: ReporterPrimitive = (util) => util.runtime.input?.getMouseX() ?? 0;

const sensingMouseY: ReporterPrimitive = (util) => util.runtime.input?.getMouseY() ?? 0;

const sensingMouseDown: ReporterPrimitive = (util) => util.runtime.input?.isMouseDown() ?? false;

const sensingKeyPressed: ReporterPrimitive = (util) => {
    const key = Cast.toString(util.getInput('KEY_OPTION'));
    return util.runtime.input?.isKeyDown(key) ?? false;
};

// ---------------------------------------------------------------------------
// data: variable/list monitors
// ---------------------------------------------------------------------------

const dataShowVariable: CommandPrimitive = (util) => {
    const id = util.field('VARIABLE')?.id;
    if (id) util.runtime.monitors.setVisible(id, true, 'data_variable');
};

const dataHideVariable: CommandPrimitive = (util) => {
    const id = util.field('VARIABLE')?.id;
    if (id) util.runtime.monitors.setVisible(id, false, 'data_variable');
};

const dataShowList: CommandPrimitive = (util) => {
    const id = util.field('LIST')?.id;
    if (id) util.runtime.monitors.setVisible(id, true, 'data_listcontents');
};

const dataHideList: CommandPrimitive = (util) => {
    const id = util.field('LIST')?.id;
    if (id) util.runtime.monitors.setVisible(id, false, 'data_listcontents');
};

// ---------------------------------------------------------------------------
// Phase 7.2 Wave A: operators
// ---------------------------------------------------------------------------

const operatorMod: ReporterPrimitive = (util) => {
    const n = Cast.toNumber(util.getInput('NUM1'));
    const modulus = Cast.toNumber(util.getInput('NUM2'));
    let result = n % modulus;
    // Scratch mod uses floored division instead of truncated division.
    if (result / modulus < 0) result += modulus;
    return result;
};

const operatorRound: ReporterPrimitive = (util) =>
    Math.round(Cast.toNumber(util.getInput('NUM')));

const operatorMathop: ReporterPrimitive = (util) => {
    const operator = Cast.toString(util.field('OPERATOR')?.value ?? '').toLowerCase();
    const n = Cast.toNumber(util.getInput('NUM'));
    switch (operator) {
    case 'abs': return Math.abs(n);
    case 'floor': return Math.floor(n);
    case 'ceiling': return Math.ceil(n);
    case 'sqrt': return Math.sqrt(n);
    case 'sin': return parseFloat(Math.sin((Math.PI * n) / 180).toFixed(10));
    case 'cos': return parseFloat(Math.cos((Math.PI * n) / 180).toFixed(10));
    case 'tan': return MathUtil.tan(n);
    case 'asin': return (Math.asin(n) * 180) / Math.PI;
    case 'acos': return (Math.acos(n) * 180) / Math.PI;
    case 'atan': return (Math.atan(n) * 180) / Math.PI;
    case 'ln': return Math.log(n);
    case 'log': return Math.log(n) / Math.LN10;
    case 'e ^': return Math.exp(n);
    case '10 ^': return Math.pow(10, n);
    }
    return 0;
};

// ---------------------------------------------------------------------------
// Phase 7.2 Wave A: control loops/waits
// ---------------------------------------------------------------------------

const controlWaitUntil: CommandPrimitive = (util) => {
    // Re-evaluate the predicate once per tick: yield to the next Runtime.tick
    // while false, fall through when true. Matches the official VM's per-frame
    // re-check (util.yield) without busy-spinning within a single tick.
    if (!Cast.toBoolean(util.getInput('CONDITION'))) {
        util.yieldTick();
    }
};

const controlRepeatUntil: CommandPrimitive = (util) => {
    // Repeat UNTIL: run the body while the condition is false. The loop frame
    // (isLoop=true) yields at the tick boundary when exhausted, so this is a
    // re-evaluating per-frame loop just like forever/repeat.
    if (!Cast.toBoolean(util.getInput('CONDITION'))) {
        util.startBranch('SUBSTACK', true);
    }
};

const controlWhile: CommandPrimitive = (util) => {
    // Repeat WHILE: run the body while the condition is true. Internal-compat
    // block (no Scratch 3 palette entry) but executes and serializes normally.
    if (Cast.toBoolean(util.getInput('CONDITION'))) {
        util.startBranch('SUBSTACK', true);
    }
};

// ---------------------------------------------------------------------------
// Phase 7.2 Wave A: looks reporters
// ---------------------------------------------------------------------------

const looksCostumeNumberName: ReporterPrimitive = (util) => {
    if (util.field('NUMBER_NAME')?.value === 'number') {
        return util.target.currentCostume + 1;
    }
    const costume = util.target.costumes[util.target.currentCostume];
    return costume ? costume.name : '';
};

const looksBackdropNumberName: ReporterPrimitive = (util) => {
    const stage = util.runtime.project.stage;
    if (util.field('NUMBER_NAME')?.value === 'number') {
        return stage.currentCostume + 1;
    }
    const costume = stage.costumes[stage.currentCostume];
    return costume ? costume.name : '';
};

const looksSize: ReporterPrimitive = (util) =>
    util.target.isStage ? 100 : Math.round(util.target.size);

// ---------------------------------------------------------------------------
// Phase 7.2 Wave A: sensing (timer / environment / target property)
// ---------------------------------------------------------------------------

/**
 * Resolves a `sensing_of` OBJECT menu value to the Stage or a named Sprite
 * original (clones are never addressable by name), matching the official VM's
 * getTargetForStage / getSpriteTargetByName.
 */
const resolveOfTarget = (util: BlockUtil, name: string): Stage | Sprite | undefined => {
    if (name === '_stage_') return util.runtime.project.stage;
    return util.runtime.project.sprites.find(sprite => sprite.name === name);
};

const sensingTimer: ReporterPrimitive = (util) => util.runtime.timer.seconds;

const sensingResetTimer: CommandPrimitive = (util) => {
    util.runtime.timer.reset();
};

const sensingCurrent: ReporterPrimitive = (util) => {
    const menu = Cast.toString(util.field('CURRENTMENU')?.value ?? '').toLowerCase();
    const date = util.runtime.wallClock.nowDate();
    switch (menu) {
    case 'year': return date.getFullYear();
    case 'month': return date.getMonth() + 1; // getMonth is zero-based
    case 'date': return date.getDate();
    case 'dayofweek': return date.getDay() + 1; // getDay is zero-based, Sun=0
    case 'hour': return date.getHours();
    case 'minute': return date.getMinutes();
    case 'second': return date.getSeconds();
    }
    return 0;
};

const sensingDaysSince2000: ReporterPrimitive = (util) => {
    const msPerDay = 24 * 60 * 60 * 1000;
    const start = new Date(2000, 0, 1); // Months are 0-indexed.
    const today = util.runtime.wallClock.nowDate();
    const dstAdjust = today.getTimezoneOffset() - start.getTimezoneOffset();
    let mSecsSinceStart = today.valueOf() - start.valueOf();
    mSecsSinceStart += ((today.getTimezoneOffset() - dstAdjust) * 60 * 1000);
    return mSecsSinceStart / msPerDay;
};

const sensingOnline: ReporterPrimitive = (util) => util.runtime.userEnv.isOnline();

const sensingUsername: ReporterPrimitive = (util) => util.runtime.userEnv.getUsername();

const sensingDistanceTo: ReporterPrimitive = (util) => {
    if (util.target.isStage) return 10000;
    const menu = Cast.toString(util.getInput('DISTANCETOMENU'));
    let targetX = 0;
    let targetY = 0;
    if (menu === '_mouse_') {
        targetX = util.runtime.input?.getMouseX() ?? 0;
        targetY = util.runtime.input?.getMouseY() ?? 0;
    } else {
        const distTarget = util.runtime.project.sprites.find(sprite => sprite.name === menu);
        if (!distTarget) return 10000;
        targetX = distTarget.x;
        targetY = distTarget.y;
    }
    const dx = util.target.x - targetX;
    const dy = util.target.y - targetY;
    return Math.sqrt((dx * dx) + (dy * dy));
};

const sensingSetDragMode: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    util.target.setDraggable(util.field('DRAG_MODE')?.value === 'draggable');
};

const sensingOf: ReporterPrimitive = (util) => {
    const objectName = Cast.toString(util.getInput('OBJECT'));
    const attrTarget = resolveOfTarget(util, objectName);
    if (!attrTarget) return 0;
    const property = Cast.toString(util.field('PROPERTY')?.value ?? '');

    if (attrTarget.isStage) {
        switch (property) {
        case 'background #': // Scratch 1.4 support
        case 'backdrop #': return attrTarget.currentCostume + 1;
        case 'backdrop name': {
            const costume = attrTarget.costumes[attrTarget.currentCostume];
            return costume ? costume.name : '';
        }
        case 'volume': return attrTarget.volume;
        }
    } else {
        const sprite = attrTarget as Sprite;
        switch (property) {
        case 'x position': return sprite.x;
        case 'y position': return sprite.y;
        case 'direction': return sprite.direction;
        case 'costume #': return sprite.currentCostume + 1;
        case 'costume name': {
            const costume = sprite.costumes[sprite.currentCostume];
            return costume ? costume.name : '';
        }
        case 'size': return sprite.size;
        case 'volume': return sprite.volume;
        }
    }

    const variable = attrTarget.variables.getByName(property);
    return variable ? variable.value : 0;
};

// ---------------------------------------------------------------------------
// Phase 7.2 Wave B: motion target / glide / point / bounce
// ---------------------------------------------------------------------------

const motionGoto: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    const xy = resolveTargetXY(util.runtime, Cast.toString(util.getInput('TO')));
    if (xy) util.setXY(xy.x, xy.y);
};

interface GlideContext {
    startMSecs?: number;
    durationMSecs?: number;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
}

/**
 * Shared glide engine for `motion_glideto` / `motion_glidesecstoxy`. Uses the
 * scheduler clock (`runtime.currentMSecs`) and a per-block stack frame — never
 * setTimeout — so it is deterministic and yields once per tick. The end
 * position is resolved once on the first execution (via `resolveEnd`). Mid-
 * glide positions go through `util.setXY`, so fencing and pen drawing run on
 * the existing path.
 */
const runGlide = (util: BlockUtil, secs: number, resolveEnd: () => Point | null): void => {
    const ctx = util.stackFrame as GlideContext;
    if (ctx.startMSecs === undefined) {
        const end = resolveEnd();
        if (!end) return; // missing target: official getTargetXY undefined -> no glide
        ctx.startMSecs = util.runtime.currentMSecs;
        ctx.durationMSecs = secs * 1000;
        ctx.startX = util.target.x;
        ctx.startY = util.target.y;
        ctx.endX = end.x;
        ctx.endY = end.y;
        if (ctx.durationMSecs <= 0) {
            util.setXY(end.x, end.y);
            return;
        }
        util.yieldTick();
        return;
    }
    const elapsed = util.runtime.currentMSecs - ctx.startMSecs;
    if (elapsed < (ctx.durationMSecs ?? 0)) {
        const frac = elapsed / (ctx.durationMSecs ?? 1);
        util.setXY(
            (ctx.startX ?? 0) + frac * ((ctx.endX ?? 0) - (ctx.startX ?? 0)),
            (ctx.startY ?? 0) + frac * ((ctx.endY ?? 0) - (ctx.startY ?? 0))
        );
        util.yieldTick();
    } else {
        util.setXY(ctx.endX ?? 0, ctx.endY ?? 0);
    }
};

const motionGlideSecsToXY: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    const secs = Cast.toNumber(util.getInput('SECS'));
    runGlide(util, secs, () => ({
        x: Cast.toNumber(util.getInput('X')),
        y: Cast.toNumber(util.getInput('Y'))
    }));
};

const motionGlideTo: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    const secs = Cast.toNumber(util.getInput('SECS'));
    runGlide(util, secs, () => resolveTargetXY(util.runtime, Cast.toString(util.getInput('TO'))));
};

const motionPointTowards: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    const towards = Cast.toString(util.getInput('TOWARDS'));
    if (towards === '_random_') {
        util.target.setDirection(Math.round(util.runtime.random.random() * 360) - 180);
        return;
    }
    const xy = resolveTargetXY(util.runtime, towards);
    if (!xy) return;
    const dx = xy.x - util.target.x;
    const dy = xy.y - util.target.y;
    util.target.setDirection(90 - MathUtil.radToDeg(Math.atan2(dy, dx)));
};

const motionIfOnEdgeBounce: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    const sprite = util.target;
    const bounds = util.runtime.renderer?.getBounds?.(sprite.id, {
        x: sprite.x, y: sprite.y, size: sprite.size,
        direction: sprite.direction, rotationStyle: sprite.rotationStyle
    });
    if (!bounds) return; // headless / no skin: no-op, matching official guard.

    const distLeft = Math.max(0, (STAGE_WIDTH / 2) + bounds.left);
    const distTop = Math.max(0, (STAGE_HEIGHT / 2) - bounds.top);
    const distRight = Math.max(0, (STAGE_WIDTH / 2) - bounds.right);
    const distBottom = Math.max(0, (STAGE_HEIGHT / 2) + bounds.bottom);
    let nearestEdge = '';
    let minDist = Infinity;
    if (distLeft < minDist) {
        minDist = distLeft;
        nearestEdge = 'left';
    }
    if (distTop < minDist) {
        minDist = distTop;
        nearestEdge = 'top';
    }
    if (distRight < minDist) {
        minDist = distRight;
        nearestEdge = 'right';
    }
    if (distBottom < minDist) {
        minDist = distBottom;
        nearestEdge = 'bottom';
    }
    if (minDist > 0) return; // Not touching any edge.

    const radians = MathUtil.degToRad(90 - sprite.direction);
    let dx = Math.cos(radians);
    let dy = -Math.sin(radians);
    if (nearestEdge === 'left') {
        dx = Math.max(0.2, Math.abs(dx));
    } else if (nearestEdge === 'top') {
        dy = Math.max(0.2, Math.abs(dy));
    } else if (nearestEdge === 'right') {
        dx = 0 - Math.max(0.2, Math.abs(dx));
    } else if (nearestEdge === 'bottom') {
        dy = 0 - Math.max(0.2, Math.abs(dy));
    }
    sprite.setDirection(MathUtil.radToDeg(Math.atan2(dy, dx)) + 90);

    const fenced = keepInFence(sprite.x, sprite.y, bounds);
    util.setXY(fenced[0], fenced[1]);
};

// ---------------------------------------------------------------------------
// Phase 7.2 Wave B: backdrop
// ---------------------------------------------------------------------------

/**
 * Switches the Stage backdrop using the official `_setBackdrop` resolution
 * (name → index, `next`/`previous`/`random backdrop`, or numeric string/index)
 * and fires `event_whenbackdropswitchesto` hats matching the new backdrop name.
 * Returns the started hat threads so switch-and-wait can track completion.
 */
const setBackdrop = (util: BlockUtil, requested: PrimitiveValue, zeroIndex = false): Thread[] => {
    const stage = util.runtime.project.stage;
    if (typeof requested === 'number') {
        stage.setCostume(zeroIndex ? requested : requested - 1);
    } else {
        const name = Cast.toString(requested);
        const index = stage.getCostumeIndexByName(name);
        if (index !== -1) {
            stage.setCostume(index);
        } else if (name === 'next backdrop') {
            stage.setCostume(stage.currentCostume + 1);
        } else if (name === 'previous backdrop') {
            stage.setCostume(stage.currentCostume - 1);
        } else if (name === 'random backdrop') {
            const numCostumes = stage.costumes.length;
            if (numCostumes > 1) {
                const exclude = stage.currentCostume;
                let pick = Math.floor(util.runtime.random.random() * (numCostumes - 1));
                if (pick >= exclude) pick += 1;
                stage.setCostume(pick);
            }
        } else if (!(Number.isNaN(Number(name)) || Cast.isWhiteSpace(name))) {
            stage.setCostume(zeroIndex ? Number(name) : Number(name) - 1);
        }
    }
    const costume = stage.costumes[stage.currentCostume];
    const newName = costume ? costume.name : '';
    return util.runtime.startHats('event_whenbackdropswitchesto', {backdrop: newName}, true);
};

const looksSwitchBackdropTo: CommandPrimitive = (util) => {
    setBackdrop(util, util.getInput('BACKDROP'));
};

const looksNextBackdrop: CommandPrimitive = (util) => {
    const stage = util.runtime.project.stage;
    setBackdrop(util, stage.currentCostume + 1, true);
};

interface BackdropWaitContext {
    started?: Thread[];
}

const looksSwitchBackdropToAndWait: CommandPrimitive = (util) => {
    const ctx = util.stackFrame as BackdropWaitContext;
    if (ctx.started === undefined) {
        ctx.started = setBackdrop(util, util.getInput('BACKDROP'));
        if (ctx.started.length === 0) return;
        util.yieldTick();
        return;
    }
    const stillRunning = ctx.started.some(t => util.runtime.threads.includes(t) && t.status !== 'DONE');
    if (stillRunning) {
        util.yieldTick();
    }
};

// ---------------------------------------------------------------------------
// Phase 7.2 Wave C: say/think bubbles, ask/answer
// ---------------------------------------------------------------------------

/** Stringifies a bubble message and caps it at the Scratch 330-char limit. */
const formatBubbleText = (value: PrimitiveValue): string => {
    const text = Cast.toString(value);
    return text.length > BUBBLE_TEXT_LIMIT ? text.slice(0, BUBBLE_TEXT_LIMIT) : text;
};

const looksSay: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    util.runtime.bubbles.set(util.target.id, 'say', formatBubbleText(util.getInput('MESSAGE')));
};

const looksThink: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    util.runtime.bubbles.set(util.target.id, 'think', formatBubbleText(util.getInput('MESSAGE')));
};

interface BubbleTimedContext {
    deadline?: number;
    usageId?: number;
}

/** Shared timed say/think: shows the bubble, then clears it only if not superseded. */
const sayOrThinkForSecs = (util: BlockUtil, type: 'say' | 'think'): void => {
    if (util.target.isStage) return;
    const ctx = util.stackFrame as BubbleTimedContext;
    if (ctx.deadline === undefined) {
        ctx.usageId = util.runtime.bubbles.set(util.target.id, type, formatBubbleText(util.getInput('MESSAGE')));
        ctx.deadline = util.runtime.currentMSecs + Cast.toNumber(util.getInput('SECS')) * 1000;
        util.yieldTick();
        return;
    }
    if (util.runtime.currentMSecs < ctx.deadline) {
        util.yieldTick();
        return;
    }
    // Deadline reached: clear only if a later say/think hasn't replaced it.
    if (util.runtime.bubbles.usageId(util.target.id) === ctx.usageId) {
        util.runtime.bubbles.set(util.target.id, type, '');
    }
};

const looksSayForSecs: CommandPrimitive = (util) => sayOrThinkForSecs(util, 'say');
const looksThinkForSecs: CommandPrimitive = (util) => sayOrThinkForSecs(util, 'think');

const sensingAskAndWait: CommandPrimitive = (util) => {
    const target = util.target;
    const question = Cast.toString(util.getInput('QUESTION'));
    const wasVisible = target.isStage ? true : (target as Sprite).visible;
    return util.runtime.questions.ask(question, target.id, wasVisible, target.isStage);
};

const sensingAnswer: ReporterPrimitive = (util) => util.runtime.questions.getAnswer();

// ---------------------------------------------------------------------------
// Phase 7.2 Wave C: graphic effects + object touching
// ---------------------------------------------------------------------------

/** Clamps ghost/brightness to their official ranges; other effects are unbounded. */
const clampEffect = (effect: string, value: number): number => {
    if (effect === 'ghost') return Math.min(100, Math.max(0, value));
    if (effect === 'brightness') return Math.min(100, Math.max(-100, value));
    return value;
};

const looksChangeEffectBy: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    const effect = Cast.toString(util.field('EFFECT')?.value ?? '').toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(util.target.effects, effect)) return;
    const current = util.target.effects[effect as keyof typeof util.target.effects];
    util.target.setEffect(effect, clampEffect(effect, current + Cast.toNumber(util.getInput('CHANGE'))));
};

const looksSetEffectTo: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    const effect = Cast.toString(util.field('EFFECT')?.value ?? '').toLowerCase();
    util.target.setEffect(effect, clampEffect(effect, Cast.toNumber(util.getInput('VALUE'))));
};

const looksClearGraphicEffects: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    util.target.clearEffects();
};

const sensingTouchingObject: ReporterPrimitive = (util) => {
    if (util.target.isStage) return false;
    const menu = Cast.toString(util.getInput('TOUCHINGOBJECTMENU'));
    const renderer = util.runtime.renderer;
    if (menu === '_mouse_') {
        const x = util.runtime.input?.getMouseX() ?? 0;
        const y = util.runtime.input?.getMouseY() ?? 0;
        return renderer?.isTouchingPoint?.(util.target.id, x, y) ?? false;
    }
    if (menu === '_edge_') {
        return renderer?.isTouchingEdge?.(util.target.id) ?? false;
    }
    // Sprite name: candidates are the named sprite's visible original + clones,
    // excluding the judging target itself.
    const candidates: string[] = [];
    for (const sprite of [...util.runtime.project.sprites, ...util.runtime.clones]) {
        if (sprite.name === menu && sprite.visible && sprite !== util.target) {
            candidates.push(sprite.id);
        }
    }
    if (candidates.length === 0) return false;
    return renderer?.isTouchingTargets?.(util.target.id, candidates) ?? false;
};

/** Parses a colour_picker value (hex string or 24-bit number) to an [r,g,b] list. */
const toRgbList = (value: PrimitiveValue): [number, number, number] => {
    const rgb = parseHexColor(Cast.toString(value));
    if (rgb) return [rgb.r, rgb.g, rgb.b];
    const n = Math.floor(Cast.toNumber(value));
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const sensingTouchingColor: ReporterPrimitive = (util) => {
    if (util.target.isStage) return false;
    const color = toRgbList(util.getInput('COLOR'));
    return util.runtime.renderer?.isTouchingColor?.(util.target.id, color) ?? false;
};

const sensingColorIsTouchingColor: ReporterPrimitive = (util) => {
    if (util.target.isStage) return false;
    // COLOR is the sprite's own colour (mask); COLOR2 is the scene colour.
    const mask = toRgbList(util.getInput('COLOR'));
    const color = toRgbList(util.getInput('COLOR2'));
    return util.runtime.renderer?.isColorTouchingColor?.(util.target.id, color, mask) ?? false;
};

// ---------------------------------------------------------------------------
// registries
// ---------------------------------------------------------------------------

export const commandPrimitives: Record<string, CommandPrimitive> = {
    motion_movesteps: motionMoveSteps,
    motion_gotoxy: motionGotoXY,
    motion_setx: motionSetX,
    motion_sety: motionSetY,
    motion_changexby: motionChangeXBy,
    motion_changeyby: motionChangeYBy,
    motion_turnright: motionTurnRight,
    motion_turnleft: motionTurnLeft,
    motion_pointindirection: motionPointInDirection,
    motion_setrotationstyle: motionSetRotationStyle,
    looks_show: looksShow,
    looks_hide: looksHide,
    looks_setsizeto: looksSetSizeTo,
    looks_changesizeby: looksChangeSizeBy,
    looks_switchcostumeto: looksSwitchCostumeTo,
    looks_nextcostume: looksNextCostume,
    looks_gotofrontback: looksGoToFrontBack,
    looks_goforwardbackwardlayers: looksGoForwardBackwardLayers,
    control_wait: controlWait,
    control_repeat: controlRepeat,
    control_forever: controlForever,
    control_if: controlIf,
    control_if_else: controlIfElse,
    control_stop: controlStop,
    control_wait_until: controlWaitUntil,
    control_repeat_until: controlRepeatUntil,
    control_while: controlWhile,
    control_create_clone_of: controlCreateCloneOf,
    control_delete_this_clone: controlDeleteThisClone,
    procedures_call: proceduresCall,
    pen_clear: penClear,
    pen_penDown: penPenDown,
    pen_penUp: penPenUp,
    pen_stamp: penStamp,
    pen_setPenColorToColor: penSetColorToColor,
    pen_changePenSizeBy: penChangeSizeBy,
    pen_setPenSizeTo: penSetSizeTo,
    pen_changePenColorParamBy: penChangeColorParamBy,
    pen_setPenColorParamTo: penSetColorParamTo,
    data_showvariable: dataShowVariable,
    data_hidevariable: dataHideVariable,
    data_showlist: dataShowList,
    data_hidelist: dataHideList,
    data_setvariableto: dataSetVariableTo,
    data_changevariableby: dataChangeVariableBy,
    data_addtolist: dataAddToList,
    data_deleteoflist: dataDeleteOfList,
    data_deletealloflist: dataDeleteAllOfList,
    data_insertatlist: dataInsertAtList,
    data_replaceitemoflist: dataReplaceItemOfList,
    event_broadcast: eventBroadcast,
    event_broadcastandwait: eventBroadcastAndWait,
    sound_play: soundPlay,
    sound_playuntildone: soundPlayUntilDone,
    sound_stopallsounds: soundStopAll,
    sound_setvolumeto: soundSetVolume,
    sound_changevolumeby: soundChangeVolume,
    sound_changeeffectby: soundChangeEffect,
    sound_seteffectto: soundSetEffect,
    sound_cleareffects: soundClearEffects,
    sensing_resettimer: sensingResetTimer,
    sensing_setdragmode: sensingSetDragMode,
    motion_goto: motionGoto,
    motion_glideto: motionGlideTo,
    motion_glidesecstoxy: motionGlideSecsToXY,
    motion_pointtowards: motionPointTowards,
    motion_ifonedgebounce: motionIfOnEdgeBounce,
    looks_switchbackdropto: looksSwitchBackdropTo,
    looks_switchbackdroptoandwait: looksSwitchBackdropToAndWait,
    looks_nextbackdrop: looksNextBackdrop,
    looks_say: looksSay,
    looks_think: looksThink,
    looks_sayforsecs: looksSayForSecs,
    looks_thinkforsecs: looksThinkForSecs,
    looks_changeeffectby: looksChangeEffectBy,
    looks_seteffectto: looksSetEffectTo,
    looks_cleargraphiceffects: looksClearGraphicEffects,
    sensing_askandwait: sensingAskAndWait
};

export const reporterPrimitives: Record<string, ReporterPrimitive> = {
    motion_xposition: motionXPosition,
    motion_yposition: motionYPosition,
    motion_direction: motionDirection,
    argument_reporter_string_number: argumentReporterStringNumber,
    argument_reporter_boolean: argumentReporterBoolean,
    data_variable: dataVariable,
    data_itemoflist: dataItemOfList,
    data_itemnumoflist: dataItemNumOfList,
    data_lengthoflist: dataLengthOfList,
    data_listcontainsitem: dataListContainsItem,
    data_listcontents: dataListContents,
    sound_volume: soundVolume,
    operator_add: operatorAdd,
    operator_subtract: operatorSubtract,
    operator_multiply: operatorMultiply,
    operator_divide: operatorDivide,
    operator_random: operatorRandom,
    operator_lt: operatorLt,
    operator_equals: operatorEquals,
    operator_gt: operatorGt,
    operator_and: operatorAnd,
    operator_or: operatorOr,
    operator_not: operatorNot,
    operator_join: operatorJoin,
    operator_letter_of: operatorLetterOf,
    operator_length: operatorLength,
    operator_contains: operatorContains,
    sensing_mousex: sensingMouseX,
    sensing_mousey: sensingMouseY,
    sensing_mousedown: sensingMouseDown,
    sensing_keypressed: sensingKeyPressed,
    operator_mod: operatorMod,
    operator_round: operatorRound,
    operator_mathop: operatorMathop,
    looks_costumenumbername: looksCostumeNumberName,
    looks_backdropnumbername: looksBackdropNumberName,
    looks_size: looksSize,
    sensing_timer: sensingTimer,
    sensing_current: sensingCurrent,
    sensing_dayssince2000: sensingDaysSince2000,
    sensing_online: sensingOnline,
    sensing_username: sensingUsername,
    sensing_distanceto: sensingDistanceTo,
    sensing_of: sensingOf,
    sensing_answer: sensingAnswer,
    sensing_touchingobject: sensingTouchingObject,
    sensing_touchingcolor: sensingTouchingColor,
    sensing_coloristouchingcolor: sensingColorIsTouchingColor,
    sensing_loudness: sensingLoudness
};
