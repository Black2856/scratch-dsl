import {Cast, LIST_ALL, LIST_INVALID} from '../cast/Cast.ts';
import {Clone} from '../model/Clone.ts';
import type {Sprite} from '../model/Sprite.ts';
import type {BlockUtil, PrimitiveValue} from './BlockRunner.ts';

export type CommandPrimitive = (util: BlockUtil) => void | PromiseLike<unknown>;
export type ReporterPrimitive = (util: BlockUtil) => PrimitiveValue;

// ---------------------------------------------------------------------------
// motion
// ---------------------------------------------------------------------------

const motionMoveSteps: CommandPrimitive = (util) => {
    if (util.target.isStage) return;
    const steps = Cast.toNumber(util.getInput('STEPS'));
    const radians = util.target.direction * Math.PI / 180;
    const from = {x: util.target.x, y: util.target.y};
    // setXY applies Scratch fencing; the pen segment ends at the fenced
    // position so the mark matches where the sprite actually lands.
    util.setXY(from.x + (steps * Math.sin(radians)), from.y + (steps * Math.cos(radians)));
    const to = {x: util.target.x, y: util.target.y};

    const pen = util.runtime.pen.getState(util.target.id);
    if (pen.down) {
        util.runtime.renderer?.penLine?.(
            from,
            to,
            {color: pen.color, size: pen.size}
        );
    }
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
    util.runtime.renderer?.penStamp?.(util.target.id);
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
    sound_changevolumeby: soundChangeVolume
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
    sensing_keypressed: sensingKeyPressed
};
