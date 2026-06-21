#!/usr/bin/env node
/**
 * generate-sb3.js
 * Converts a DSL JSON file to Scratch 3 project.json format.
 * No external dependencies.
 * CLI: node tools/generate-sb3.js <dsl.json> <out project.json>
 * Export: Sb3Generator class
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Deterministic ID generation ──────────────────────────────────────────────

function safeId(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function varId(targetName, varName) {
  return `var-${safeId(targetName)}-${safeId(varName)}`;
}

function listId(targetName, listName) {
  return `list-${safeId(targetName)}-${safeId(listName)}`;
}

function bcId(name) {
  return `bc-${safeId(name)}`;
}

function argId(procName, paramName) {
  return `arg-${safeId(procName)}-${safeId(paramName)}`;
}

// Placeholder assetId: md5 of a fixed string per name
// We just use a deterministic hex string derived from the name
function placeholderAssetId(name) {
  // Simple deterministic hash → 32 hex chars
  let h = 0x12345678;
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(h ^ name.charCodeAt(i), 0x9e3779b9);
    h = ((h << 13) | (h >>> 19)) >>> 0;
  }
  // produce 32 hex chars by repeating
  const part = h.toString(16).padStart(8, '0');
  return (part + part + part + part).slice(0, 32);
}

// ── Block counter ─────────────────────────────────────────────────────────────

class BlockCounter {
  constructor() { this._n = 0; }
  next() { return `blk-${++this._n}`; }
}

// ── Sb3Generator ──────────────────────────────────────────────────────────────

export class Sb3Generator {
  constructor(dsl) {
    this.dsl = dsl;
    this._counter = new BlockCounter();
    // Global broadcast registry (Stage owns them)
    this._broadcasts = {}; // bcId -> bcName
  }

  build() {
    const dsl = this.dsl;

    // Register all broadcasts
    for (const name of (dsl.broadcasts || [])) {
      this._broadcasts[bcId(name)] = name;
    }

    const targets = [];

    this._usesPen = false;

    // Stage
    const stageTarget = this._buildTarget(dsl.stage, true);
    // Attach broadcasts to stage
    stageTarget.broadcasts = { ...this._broadcasts };
    targets.push(stageTarget);

    // Sprites
    for (const sprite of (dsl.sprites || [])) {
      targets.push(this._buildTarget(sprite, false));
    }

    return {
      targets,
      monitors: [],
      extensions: this._usesPen ? ['pen'] : [],
      meta: { semver: '3.0.0', vm: '2.3.4', agent: 'htmlJs2sb3' }
    };
  }

  _buildTarget(tDsl, isStage) {
    const targetName = tDsl.name;

    // Variables map: varName -> varId
    this._currentVarMap = {};
    this._currentListMap = {};

    const variables = {};
    for (const [name, initVal] of Object.entries(tDsl.variables || {})) {
      const id = varId(targetName, name);
      this._currentVarMap[name] = id;
      variables[id] = [name, initVal];
    }

    const lists = {};
    for (const [name, initVal] of Object.entries(tDsl.lists || {})) {
      const id = listId(targetName, name);
      this._currentListMap[name] = id;
      lists[id] = [name, Array.isArray(initVal) ? initVal : []];
    }

    // Build blocks
    const blocks = {};
    this._blocks = blocks;
    this._targetName = targetName;

    // Track stage variable/list maps for global lookup
    if (isStage) {
      this._stageVarMap = this._currentVarMap;
      this._stageListMap = this._currentListMap;
    }

    // y offset for top-level scripts
    let scriptY = 0;

    // Procedures first (to register proccode)
    this._procDefs = {}; // procName -> { proccode, argIds, argNames, argTypes, warp }
    for (const proc of (tDsl.procedures || [])) {
      this._registerProc(proc);
    }
    for (const proc of (tDsl.procedures || [])) {
      this._buildProcDef(proc, 0, scriptY);
      scriptY += 200;
    }

    // Scripts
    for (const script of (tDsl.scripts || [])) {
      this._buildScript(script, 0, scriptY);
      scriptY += 200;
    }

    // Costumes
    const costumes = (tDsl.costumes || []).map(c => this._buildCostume(c));
    // Sounds
    const sounds = (tDsl.sounds || []).map(s => this._buildSound(s));

    const target = {
      isStage,
      name: targetName,
      variables,
      lists,
      blocks,
      comments: {},
      currentCostume: tDsl.currentCostume ?? 0,
      costumes,
      sounds,
      volume: 100,
      layerOrder: isStage ? 0 : 1,
    };

    if (isStage) {
      target.tempo = tDsl.tempo ?? 60;
      target.videoTransparency = tDsl.videoTransparency ?? 50;
      target.videoState = tDsl.videoState ?? 'on';
      target.textToSpeechLanguage = tDsl.textToSpeechLanguage ?? null;
    } else {
      target.visible = tDsl.visible ?? true;
      target.x = tDsl.x ?? 0;
      target.y = tDsl.y ?? 0;
      target.size = tDsl.size ?? 100;
      target.direction = tDsl.direction ?? 90;
      target.draggable = tDsl.draggable ?? false;
      target.rotationStyle = tDsl.rotationStyle ?? 'all around';
    }

    return target;
  }

  _buildCostume(c) {
    const ext = c.dataFormat || 'png';
    const assetId = placeholderAssetId(c.file || c.name);
    return {
      assetId,
      name: c.name,
      md5ext: `${assetId}.${ext}`,
      dataFormat: ext,
      bitmapResolution: c.bitmapResolution ?? 1,
      rotationCenterX: c.rotationCenterX ?? 0,
      rotationCenterY: c.rotationCenterY ?? 0,
    };
  }

  _buildSound(s) {
    const ext = s.dataFormat || 'wav';
    const assetId = placeholderAssetId(s.file || s.name);
    return {
      assetId,
      name: s.name,
      dataFormat: ext,
      format: s.format ?? '',
      rate: s.rate ?? 44100,
      sampleCount: s.sampleCount ?? 0,
      md5ext: `${assetId}.${ext}`,
    };
  }

  // ── Variable / List ID resolution ─────────────────────────────────────────

  _resolveVarId(name) {
    if (this._currentVarMap[name]) return this._currentVarMap[name];
    if (this._stageVarMap && this._stageVarMap[name]) return this._stageVarMap[name];
    // fallback
    return varId(this._targetName, name);
  }

  _resolveListId(name) {
    if (this._currentListMap[name]) return this._currentListMap[name];
    if (this._stageListMap && this._stageListMap[name]) return this._stageListMap[name];
    return listId(this._targetName, name);
  }

  // ── Procedure registration ─────────────────────────────────────────────────

  _registerProc(proc) {
    const argTypes = (proc.params || []).map(p => p.type);
    const suffixes = argTypes.map(t => t === 'number' ? '%n' : t === 'boolean' ? '%b' : '%s');
    const proccode = proc.name + (suffixes.length ? ' ' + suffixes.join(' ') : '');
    const argNames = (proc.params || []).map(p => p.name);
    const argIds = (proc.params || []).map(p => argId(proc.name, p.name));
    this._procDefs[proc.name] = { proccode, argIds, argNames, argTypes, warp: proc.warp ?? false };
  }

  // ── Proc definition blocks ─────────────────────────────────────────────────

  _buildProcDef(proc, x, y) {
    const def = this._procDefs[proc.name];
    const defId = this._counter.next();
    const protoId = this._counter.next();

    // prototype shadow block
    const argDefaults = def.argTypes.map(t => t === 'boolean' ? 'false' : '');
    const protoInputs = {};
    def.argIds.forEach((aId, i) => {
      const reporterId = this._counter.next();
      const isBoolean = def.argTypes[i] === 'boolean';
      protoInputs[aId] = [1, reporterId];
      this._blocks[reporterId] = {
        opcode: isBoolean ? 'argument_reporter_boolean' : 'argument_reporter_string_number',
        next: null,
        parent: protoId,
        inputs: {},
        fields: { VALUE: [def.argNames[i], null] },
        shadow: true,
        topLevel: false,
      };
    });

    this._blocks[protoId] = {
      opcode: 'procedures_prototype',
      next: null,
      parent: defId,
      inputs: protoInputs,
      fields: {},
      shadow: true,
      topLevel: false,
      mutation: {
        tagName: 'mutation',
        children: [],
        proccode: def.proccode,
        argumentids: JSON.stringify(def.argIds),
        argumentnames: JSON.stringify(def.argNames),
        argumentdefaults: JSON.stringify(argDefaults),
        warp: def.warp ? 'true' : 'false',
      },
    };

    this._blocks[defId] = {
      opcode: 'procedures_definition',
      next: null,
      parent: null,
      inputs: { custom_block: [1, protoId] },
      fields: {},
      shadow: false,
      topLevel: true,
      x,
      y,
    };

    // Build body steps
    this._buildStepChain(proc.steps || [], defId);
    // Set next of defId to first step
    // Already handled in _buildStepChain
  }

  // ── Script building ────────────────────────────────────────────────────────

  _buildScript(script, x, y) {
    const hatId = this._counter.next();
    const hatBlock = this._buildHat(script.event, hatId, x, y);
    this._blocks[hatId] = hatBlock;

    const firstChildId = this._buildStepChain(script.steps || [], hatId);
    if (firstChildId) {
      hatBlock.next = firstChildId;
    }
  }

  _buildHat(event, id, x, y) {
    const base = { next: null, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x, y };
    switch (event.type) {
      case 'green_flag':
        return { ...base, opcode: 'event_whenflagclicked' };
      case 'key_pressed':
        return { ...base, opcode: 'event_whenkeypressed', fields: { KEY_OPTION: [event.key, null] } };
      case 'sprite_clicked':
        return { ...base, opcode: 'event_whenthisspriteclicked' };
      case 'backdrop_switches':
        return { ...base, opcode: 'event_whenbackdropswitchesto', fields: { BACKDROP: [event.name, null] } };
      case 'receive': {
        const id2 = bcId(event.name);
        return { ...base, opcode: 'event_whenbroadcastreceived', fields: { BROADCAST_OPTION: [event.name, id2] } };
      }
      case 'clone_start':
        return { ...base, opcode: 'control_start_as_clone' };
      default:
        return { ...base, opcode: `event_unknown_${event.type}` };
    }
  }

  // ── Step chain: returns ID of first block ──────────────────────────────────

  _buildStepChain(steps, parentId) {
    if (!steps || steps.length === 0) return null;

    const ids = steps.map(() => this._counter.next());

    for (let i = 0; i < steps.length; i++) {
      const id = ids[i];
      const nextId = i + 1 < ids.length ? ids[i + 1] : null;
      const prevId = i === 0 ? parentId : ids[i - 1];
      this._buildStep(steps[i], id, nextId, prevId);
    }

    return ids[0];
  }

  // ── Single step ────────────────────────────────────────────────────────────

  _buildStep(step, id, nextId, parentId) {
    const type = step.type;
    let block;

    switch (type) {
      // ── Variables ──
      case 'set':
        block = this._blockSet(step, id, nextId, parentId);
        break;
      case 'change':
        block = this._blockChange(step, id, nextId, parentId);
        break;
      case 'showVar':
        block = {
          opcode: 'data_showvariable',
          next: nextId, parent: parentId, inputs: {}, shadow: false, topLevel: false,
          fields: { VARIABLE: [step.var, this._resolveVarId(step.var)] },
        };
        break;
      case 'hideVar':
        block = {
          opcode: 'data_hidevariable',
          next: nextId, parent: parentId, inputs: {}, shadow: false, topLevel: false,
          fields: { VARIABLE: [step.var, this._resolveVarId(step.var)] },
        };
        break;

      // ── Lists ──
      case 'listAdd':
        block = {
          opcode: 'data_addtolist',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { ITEM: this._valInput(step.item, 'string') },
          fields: { LIST: [step.list, this._resolveListId(step.list)] },
        };
        break;
      case 'listDeleteAt':
        block = {
          opcode: 'data_deleteoflist',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { INDEX: this._valInput(step.index, 'number') },
          fields: { LIST: [step.list, this._resolveListId(step.list)] },
        };
        break;
      case 'listDeleteAll':
        block = {
          opcode: 'data_deletealloflist',
          next: nextId, parent: parentId, inputs: {}, shadow: false, topLevel: false,
          fields: { LIST: [step.list, this._resolveListId(step.list)] },
        };
        break;
      case 'listInsertAt':
        block = {
          opcode: 'data_insertatlist',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { ITEM: this._valInput(step.item, 'string'), INDEX: this._valInput(step.index, 'number') },
          fields: { LIST: [step.list, this._resolveListId(step.list)] },
        };
        break;
      case 'listReplaceAt':
        block = {
          opcode: 'data_replaceitemoflist',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { INDEX: this._valInput(step.index, 'number'), ITEM: this._valInput(step.item, 'string') },
          fields: { LIST: [step.list, this._resolveListId(step.list)] },
        };
        break;
      case 'showList':
        block = {
          opcode: 'data_showlist',
          next: nextId, parent: parentId, inputs: {}, shadow: false, topLevel: false,
          fields: { LIST: [step.list, this._resolveListId(step.list)] },
        };
        break;
      case 'hideList':
        block = {
          opcode: 'data_hidelist',
          next: nextId, parent: parentId, inputs: {}, shadow: false, topLevel: false,
          fields: { LIST: [step.list, this._resolveListId(step.list)] },
        };
        break;

      // ── Motion ──
      case 'setX':
        block = {
          opcode: 'motion_setx',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { X: this._valInput(step.x, 'number') },
          fields: {},
        };
        break;
      case 'setY':
        block = {
          opcode: 'motion_sety',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { Y: this._valInput(step.y, 'number') },
          fields: {},
        };
        break;
      case 'changeX':
        block = {
          opcode: 'motion_changexby',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { DX: this._valInput(step.value, 'number') },
          fields: {},
        };
        break;
      case 'changeY':
        block = {
          opcode: 'motion_changeyby',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { DY: this._valInput(step.value, 'number') },
          fields: {},
        };
        break;
      case 'pointInDirection':
        block = {
          opcode: 'motion_pointindirection',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { DIRECTION: this._valInput(step.direction, 'angle') },
          fields: {},
        };
        break;
      case 'glideTo':
        block = {
          opcode: 'motion_glidesecstoxy',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { SECS: this._valInput(step.secs, 'number'), X: this._valInput(step.x, 'number'), Y: this._valInput(step.y, 'number') },
          fields: {},
        };
        break;
      case 'ifOnEdgeBounce':
        block = {
          opcode: 'motion_ifonedgebounce',
          next: nextId, parent: parentId, inputs: {}, fields: {}, shadow: false, topLevel: false,
        };
        break;

      // ── Looks ──
      case 'show':
        block = { opcode: 'looks_show', next: nextId, parent: parentId, inputs: {}, fields: {}, shadow: false, topLevel: false };
        break;
      case 'hide':
        block = { opcode: 'looks_hide', next: nextId, parent: parentId, inputs: {}, fields: {}, shadow: false, topLevel: false };
        break;
      case 'nextCostume':
        block = { opcode: 'looks_nextcostume', next: nextId, parent: parentId, inputs: {}, fields: {}, shadow: false, topLevel: false };
        break;
      case 'switchCostume': {
        const menuId = this._counter.next();
        this._blocks[menuId] = {
          opcode: 'looks_costume',
          next: null, parent: id, inputs: {}, shadow: true, topLevel: false,
          fields: { COSTUME: [step.name ?? step.costume, null] },
        };
        block = {
          opcode: 'looks_switchcostumeto',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { COSTUME: [3, menuId, [10, '']] },
          fields: {},
        };
        break;
      }
      case 'switchBackdrop': {
        const menuId = this._counter.next();
        this._blocks[menuId] = {
          opcode: 'looks_backdrops',
          next: null, parent: id, inputs: {}, shadow: true, topLevel: false,
          fields: { BACKDROP: [step.name ?? step.backdrop, null] },
        };
        block = {
          opcode: 'looks_switchbackdropto',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { BACKDROP: [3, menuId] },
          fields: {},
        };
        break;
      }
      case 'setSize':
        block = {
          opcode: 'looks_setsizeto',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { SIZE: this._valInput(step.size, 'number') },
          fields: {},
        };
        break;
      case 'changeSize':
        block = {
          opcode: 'looks_changesizeby',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { CHANGE: this._valInput(step.value, 'number') },
          fields: {},
        };
        break;
      case 'goToFrontBack':
        block = {
          opcode: 'looks_gotofrontback',
          next: nextId, parent: parentId, inputs: {}, shadow: false, topLevel: false,
          fields: { FRONT_BACK: [step.value, null] },
        };
        break;
      case 'goForwardBackward':
        block = {
          opcode: 'looks_goforwardbackwardlayers',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { NUM: this._valInput(step.num, 'number') },
          fields: { FORWARD_BACKWARD: [step.direction, null] },
        };
        break;
      case 'say':
        block = {
          opcode: 'looks_say',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { MESSAGE: this._valInput(step.message, 'string') },
          fields: {},
        };
        break;

      // ── Sound ──
      case 'playSound': {
        const menuId = this._counter.next();
        this._blocks[menuId] = {
          opcode: 'sound_sounds_menu',
          next: null, parent: id, inputs: {}, shadow: true, topLevel: false,
          fields: { SOUND_MENU: [step.sound, null] },
        };
        block = {
          opcode: 'sound_play',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { SOUND_MENU: [3, menuId] },
          fields: {},
        };
        break;
      }
      case 'playSoundUntilDone': {
        const menuId = this._counter.next();
        this._blocks[menuId] = {
          opcode: 'sound_sounds_menu',
          next: null, parent: id, inputs: {}, shadow: true, topLevel: false,
          fields: { SOUND_MENU: [step.sound, null] },
        };
        block = {
          opcode: 'sound_playuntildone',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { SOUND_MENU: [3, menuId] },
          fields: {},
        };
        break;
      }
      case 'stopAllSounds':
        block = { opcode: 'sound_stopallsounds', next: nextId, parent: parentId, inputs: {}, fields: {}, shadow: false, topLevel: false };
        break;
      case 'setVolume':
        block = {
          opcode: 'sound_setvolumeto',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { VOLUME: this._valInput(step.volume, 'number') },
          fields: {},
        };
        break;
      case 'changeVolume':
        block = {
          opcode: 'sound_changevolumeby',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { VOLUME: this._valInput(step.volume, 'number') },
          fields: {},
        };
        break;

      // ── Events ──
      case 'broadcast': {
        const bId = bcId(step.name);
        block = {
          opcode: 'event_broadcast',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { BROADCAST_INPUT: [1, [11, step.name, bId]] },
          fields: {},
        };
        break;
      }
      case 'broadcastAndWait': {
        const bId = bcId(step.name);
        block = {
          opcode: 'event_broadcastandwait',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { BROADCAST_INPUT: [1, [11, step.name, bId]] },
          fields: {},
        };
        break;
      }

      // ── Control ──
      case 'wait':
        block = {
          opcode: 'control_wait',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { DURATION: this._valInput(step.secs, 'number') },
          fields: {},
        };
        break;
      case 'repeat': {
        const firstChild = this._buildSubstack(step.steps || [], id);
        block = {
          opcode: 'control_repeat',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: {
            TIMES: this._valInput(step.times, 'number'),
            ...(firstChild ? { SUBSTACK: [2, firstChild] } : {}),
          },
          fields: {},
        };
        break;
      }
      case 'forever': {
        const firstChild = this._buildSubstack(step.steps || [], id);
        block = {
          opcode: 'control_forever',
          next: null, parent: parentId, shadow: false, topLevel: false,
          inputs: {
            ...(firstChild ? { SUBSTACK: [2, firstChild] } : {}),
          },
          fields: {},
        };
        break;
      }
      case 'if': {
        const condInput = this._buildConditionInput(step.condition, id);
        const firstChild = this._buildSubstack(step.then || [], id);
        const inputs = {};
        if (condInput) inputs.CONDITION = condInput;
        if (firstChild) inputs.SUBSTACK = [2, firstChild];
        block = {
          opcode: 'control_if',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs,
          fields: {},
        };
        break;
      }
      case 'ifElse': {
        const condInput = this._buildConditionInput(step.condition, id);
        const firstThen = this._buildSubstack(step.then || [], id);
        const firstElse = this._buildSubstack(step.else || [], id);
        const inputs = {};
        if (condInput) inputs.CONDITION = condInput;
        if (firstThen) inputs.SUBSTACK = [2, firstThen];
        if (firstElse) inputs.SUBSTACK2 = [2, firstElse];
        block = {
          opcode: 'control_if_else',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs,
          fields: {},
        };
        break;
      }
      case 'waitUntil': {
        const condInput = this._buildConditionInput(step.condition, id);
        const inputs = {};
        if (condInput) inputs.CONDITION = condInput;
        block = {
          opcode: 'control_wait_until',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs,
          fields: {},
        };
        break;
      }
      case 'repeatUntil': {
        const condInput = this._buildConditionInput(step.condition, id);
        const firstChild = this._buildSubstack(step.steps || [], id);
        const inputs = {};
        if (condInput) inputs.CONDITION = condInput;
        if (firstChild) inputs.SUBSTACK = [2, firstChild];
        block = {
          opcode: 'control_repeat_until',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs,
          fields: {},
        };
        break;
      }
      case 'stop':
        block = {
          opcode: 'control_stop',
          next: null, parent: parentId, inputs: {}, shadow: false, topLevel: false,
          fields: { STOP_OPTION: [step.target || 'all', null] },
          mutation: { tagName: 'mutation', children: [], hasnext: 'false' },
        };
        break;
      case 'createClone': {
        const menuId = this._counter.next();
        this._blocks[menuId] = {
          opcode: 'control_create_clone_of_menu',
          next: null, parent: id, inputs: {}, shadow: true, topLevel: false,
          fields: { CLONE_OPTION: [step.target || 'myself', null] },
        };
        block = {
          opcode: 'control_create_clone_of',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { CLONE_OPTION: [1, menuId] },
          fields: {},
        };
        break;
      }
      case 'deleteClone':
        block = { opcode: 'control_delete_this_clone', next: null, parent: parentId, inputs: {}, fields: {}, shadow: false, topLevel: false };
        break;

      // ── Sensing ──
      case 'resetTimer':
        block = { opcode: 'sensing_resettimer', next: nextId, parent: parentId, inputs: {}, fields: {}, shadow: false, topLevel: false };
        break;
      case 'askAndWait':
        block = {
          opcode: 'sensing_askandwait',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { QUESTION: this._valInput(step.question, 'string') },
          fields: {},
        };
        break;

      // ── Pen (extension) ──
      case 'penClear':
        block = { opcode: 'pen_clear', next: nextId, parent: parentId, inputs: {}, fields: {}, shadow: false, topLevel: false };
        this._usesPen = true;
        break;
      case 'penStamp':
        block = { opcode: 'pen_stamp', next: nextId, parent: parentId, inputs: {}, fields: {}, shadow: false, topLevel: false };
        this._usesPen = true;
        break;
      case 'penDown':
        block = { opcode: 'pen_penDown', next: nextId, parent: parentId, inputs: {}, fields: {}, shadow: false, topLevel: false };
        this._usesPen = true;
        break;
      case 'penUp':
        block = { opcode: 'pen_penUp', next: nextId, parent: parentId, inputs: {}, fields: {}, shadow: false, topLevel: false };
        this._usesPen = true;
        break;
      case 'penSetColor': {
        const hex = String(step.color ?? '#000000').replace('#', '').padStart(6, '0').slice(0, 6);
        block = {
          opcode: 'pen_setPenColorToColor',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { COLOR: [1, [9, `#${hex}`]] },
          fields: {},
        };
        this._usesPen = true;
        break;
      }
      case 'penSetSize':
        block = {
          opcode: 'pen_setPenSizeTo',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { SIZE: this._valInput(step.size, 'number') },
          fields: {},
        };
        this._usesPen = true;
        break;
      case 'penChangeSize':
        block = {
          opcode: 'pen_changePenSizeBy',
          next: nextId, parent: parentId, shadow: false, topLevel: false,
          inputs: { SIZE: this._valInput(step.value, 'number') },
          fields: {},
        };
        this._usesPen = true;
        break;

      // ── Procedure call ──
      case 'call':
        block = this._blockProcCall(step, id, nextId, parentId);
        break;

      default:
        block = {
          opcode: `unknown_${type}`,
          next: nextId, parent: parentId, inputs: {}, fields: {}, shadow: false, topLevel: false,
        };
    }

    this._blocks[id] = block;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _blockSet(step, id, nextId, parentId) {
    const vId = this._resolveVarId(step.var);
    return {
      opcode: 'data_setvariableto',
      next: nextId, parent: parentId, shadow: false, topLevel: false,
      inputs: { VALUE: this._valInput(step.value, 'string') },
      fields: { VARIABLE: [step.var, vId] },
    };
  }

  _blockChange(step, id, nextId, parentId) {
    const vId = this._resolveVarId(step.var);
    return {
      opcode: 'data_changevariableby',
      next: nextId, parent: parentId, shadow: false, topLevel: false,
      inputs: { VALUE: this._valInput(step.value, 'number') },
      fields: { VARIABLE: [step.var, vId] },
    };
  }

  _blockProcCall(step, id, nextId, parentId) {
    const def = this._procDefs[step.proc];
    if (!def) throw new Error(`Unknown procedure: ${step.proc}`);
    const inputs = {};
    for (let i = 0; i < def.argIds.length; i++) {
      const aName = def.argNames[i];
      const aType = def.argTypes[i];
      const val = step.args ? step.args[aName] : undefined;
      inputs[def.argIds[i]] = this._valInput(val, aType === 'boolean' ? 'boolean' : aType === 'number' ? 'number' : 'string');
    }
    return {
      opcode: 'procedures_call',
      next: nextId, parent: parentId, shadow: false, topLevel: false,
      inputs,
      fields: {},
      mutation: {
        tagName: 'mutation',
        children: [],
        proccode: def.proccode,
        argumentids: JSON.stringify(def.argIds),
        warp: def.warp ? 'true' : 'false',
      },
    };
  }

  // Build a substack: returns firstChildId or null
  _buildSubstack(steps, controlBlockId) {
    if (!steps || steps.length === 0) return null;
    const ids = steps.map(() => this._counter.next());
    for (let i = 0; i < steps.length; i++) {
      const id = ids[i];
      const nextId = i + 1 < ids.length ? ids[i + 1] : null;
      const prevId = i === 0 ? controlBlockId : ids[i - 1];
      this._buildStep(steps[i], id, nextId, prevId);
    }
    return ids[0];
  }

  // Build condition input: returns [2, blockId] or null
  _buildConditionInput(cond, parentId) {
    if (cond == null) return null;
    const condId = this._counter.next();
    this._buildExprBlock(cond, condId, null, parentId);
    return [2, condId];
  }

  // ── Value input builder ────────────────────────────────────────────────────
  // Returns an inputDesc array

  _valInput(val, hint) {
    if (val === null || val === undefined) {
      // Default primitive
      if (hint === 'boolean') return null; // no default for booleans
      if (hint === 'string') return [1, [10, '']];
      return [1, [4, '0']];
    }

    // DSL expression object
    if (typeof val === 'object' && !Array.isArray(val)) {
      return this._exprInput(val, hint);
    }

    // Literal value
    if (hint === 'string') {
      return [1, [10, String(val)]];
    }
    if (hint === 'angle') {
      return [1, [8, String(val)]];
    }
    // number, positive, etc.
    return [1, [4, String(val)]];
  }

  // Build an expression as an input (may create blocks)
  _exprInput(expr, hint) {
    const op = expr.op;

    // Variable primitive (inline, no block needed for data_variable in input position)
    if (op === 'var') {
      const vId = this._resolveVarId(expr.name);
      if (hint === 'boolean') {
        // treat as block
        const bId = this._counter.next();
        this._blocks[bId] = {
          opcode: 'data_variable',
          next: null, parent: null, inputs: {}, shadow: false, topLevel: false,
          fields: { VARIABLE: [expr.name, vId] },
        };
        return [2, bId];
      }
      // For number/string positions, use primitive [12, name, id]
      return [3, [12, expr.name, vId], [10, '']];
    }

    // arg reporter
    if (op === 'arg') {
      // Find the proc this arg belongs to – we'll build the reporter block
      const bId = this._counter.next();
      // Determine type from proc defs
      let isBoolean = false;
      for (const pd of Object.values(this._procDefs)) {
        const idx = pd.argNames.indexOf(expr.name);
        if (idx !== -1 && pd.argTypes[idx] === 'boolean') { isBoolean = true; break; }
      }
      this._blocks[bId] = {
        opcode: isBoolean ? 'argument_reporter_boolean' : 'argument_reporter_string_number',
        next: null, parent: null, inputs: {}, shadow: false, topLevel: false,
        fields: { VALUE: [expr.name, null] },
      };
      if (hint === 'boolean') return [2, bId];
      return [3, bId, [4, '0']];
    }

    // Reporter block
    const bId = this._counter.next();
    // We'll fill in parent after; for now set null
    this._buildExprBlock(expr, bId, null, null);
    if (hint === 'boolean') return [2, bId];
    return [3, bId, [4, '0']];
  }

  // Build an expression block (reporter/boolean) and add to this._blocks
  _buildExprBlock(expr, id, next, parent) {
    const op = expr.op;

    const mkNumInput = (val, slot) => {
      const inp = this._valInput(val, 'number');
      // Set parent for any reporter blocks created
      if (Array.isArray(inp) && inp[0] === 3 && typeof inp[1] === 'string') {
        this._setParent(inp[1], id);
      }
      return inp;
    };

    const mkBoolInput = (val) => {
      const inp = this._valInput(val, 'boolean');
      if (Array.isArray(inp) && inp[0] === 2 && typeof inp[1] === 'string') {
        this._setParent(inp[1], id);
      }
      return inp;
    };

    const mkStrInput = (val) => {
      const inp = this._valInput(val, 'string');
      if (Array.isArray(inp) && inp[0] === 3 && typeof inp[1] === 'string') {
        this._setParent(inp[1], id);
      }
      return inp;
    };

    let block;

    switch (op) {
      // ── Operator blocks ──
      case 'add':
        block = { opcode: 'operator_add', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { NUM1: mkNumInput(expr.a, 'NUM1'), NUM2: mkNumInput(expr.b, 'NUM2') } };
        break;
      case 'sub':
        block = { opcode: 'operator_subtract', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { NUM1: mkNumInput(expr.a), NUM2: mkNumInput(expr.b) } };
        break;
      case 'mul':
        block = { opcode: 'operator_multiply', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { NUM1: mkNumInput(expr.a), NUM2: mkNumInput(expr.b) } };
        break;
      case 'div':
        block = { opcode: 'operator_divide', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { NUM1: mkNumInput(expr.a), NUM2: mkNumInput(expr.b) } };
        break;
      case 'mod':
        block = { opcode: 'operator_mod', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { NUM1: mkNumInput(expr.a), NUM2: mkNumInput(expr.b) } };
        break;
      case 'lt':
        block = { opcode: 'operator_lt', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { OPERAND1: mkStrInput(expr.a), OPERAND2: mkStrInput(expr.b) } };
        break;
      case 'eq':
        block = { opcode: 'operator_equals', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { OPERAND1: mkStrInput(expr.a), OPERAND2: mkStrInput(expr.b) } };
        break;
      case 'gt':
        block = { opcode: 'operator_gt', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { OPERAND1: mkStrInput(expr.a), OPERAND2: mkStrInput(expr.b) } };
        break;
      case 'and':
        block = { opcode: 'operator_and', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { OPERAND1: mkBoolInput(expr.a), OPERAND2: mkBoolInput(expr.b) } };
        break;
      case 'or':
        block = { opcode: 'operator_or', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { OPERAND1: mkBoolInput(expr.a), OPERAND2: mkBoolInput(expr.b) } };
        break;
      case 'not':
        block = { opcode: 'operator_not', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { OPERAND: mkBoolInput(expr.a) } };
        break;
      case 'random':
        block = { opcode: 'operator_random', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { FROM: mkNumInput(expr.from), TO: mkNumInput(expr.to) } };
        break;
      case 'join':
        block = { opcode: 'operator_join', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { STRING1: mkStrInput(expr.a), STRING2: mkStrInput(expr.b) } };
        break;
      case 'letterOf':
        block = { opcode: 'operator_letter_of', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { LETTER: mkNumInput(expr.index), STRING: mkStrInput(expr.str) } };
        break;
      case 'lengthOf':
        block = { opcode: 'operator_length', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { STRING: mkStrInput(expr.str) } };
        break;
      case 'contains':
        block = { opcode: 'operator_contains', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { STRING1: mkStrInput(expr.a), STRING2: mkStrInput(expr.b) } };
        break;
      case 'round':
        block = { opcode: 'operator_round', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { NUM: mkNumInput(expr.value) } };
        break;
      case 'mathop':
        block = { opcode: 'operator_mathop', next, parent, shadow: false, topLevel: false,
          inputs: { NUM: mkNumInput(expr.value) },
          fields: { OPERATOR: [expr.fn, null] } };
        break;

      // ── Motion reporters ──
      case 'xPos':
        block = { opcode: 'motion_xposition', next, parent, inputs: {}, fields: {}, shadow: false, topLevel: false };
        break;
      case 'yPos':
        block = { opcode: 'motion_yposition', next, parent, inputs: {}, fields: {}, shadow: false, topLevel: false };
        break;
      case 'direction':
        block = { opcode: 'motion_direction', next, parent, inputs: {}, fields: {}, shadow: false, topLevel: false };
        break;

      // ── Looks reporters ──
      case 'costumeNumber':
        block = { opcode: 'looks_costumenumbername', next, parent, inputs: {}, shadow: false, topLevel: false,
          fields: { NUMBER_NAME: ['number', null] } };
        break;
      case 'costumeName':
        block = { opcode: 'looks_costumenumbername', next, parent, inputs: {}, shadow: false, topLevel: false,
          fields: { NUMBER_NAME: ['name', null] } };
        break;
      case 'size':
        block = { opcode: 'looks_size', next, parent, inputs: {}, fields: {}, shadow: false, topLevel: false };
        break;

      // ── Sound reporters ──
      case 'volume':
        block = { opcode: 'sound_volume', next, parent, inputs: {}, fields: {}, shadow: false, topLevel: false };
        break;

      // ── Sensing reporters ──
      case 'mouseX':
        block = { opcode: 'sensing_mousex', next, parent, inputs: {}, fields: {}, shadow: false, topLevel: false };
        break;
      case 'mouseY':
        block = { opcode: 'sensing_mousey', next, parent, inputs: {}, fields: {}, shadow: false, topLevel: false };
        break;
      case 'mouseDown':
        block = { opcode: 'sensing_mousedown', next, parent, inputs: {}, fields: {}, shadow: false, topLevel: false };
        break;
      case 'timer':
        block = { opcode: 'sensing_timer', next, parent, inputs: {}, fields: {}, shadow: false, topLevel: false };
        break;
      case 'answer':
        block = { opcode: 'sensing_answer', next, parent, inputs: {}, fields: {}, shadow: false, topLevel: false };
        break;
      case 'keyPressed': {
        const menuId = this._counter.next();
        this._blocks[menuId] = {
          opcode: 'sensing_keyoptions',
          next: null, parent: id, inputs: {}, shadow: true, topLevel: false,
          fields: { KEY_OPTION: [expr.key, null] },
        };
        block = { opcode: 'sensing_keypressed', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { KEY_OPTION: [1, menuId] } };
        break;
      }
      case 'distanceTo': {
        const menuId = this._counter.next();
        this._blocks[menuId] = {
          opcode: 'sensing_distancetomenu',
          next: null, parent: id, inputs: {}, shadow: true, topLevel: false,
          fields: { DISTANCETOMENU: [expr.target, null] },
        };
        block = { opcode: 'sensing_distanceto', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { DISTANCETOMENU: [1, menuId] } };
        break;
      }
      case 'touching': {
        const menuId = this._counter.next();
        this._blocks[menuId] = {
          opcode: 'sensing_touchingobjectmenu',
          next: null, parent: id, inputs: {}, shadow: true, topLevel: false,
          fields: { TOUCHINGOBJECTMENU: [expr.target, null] },
        };
        block = { opcode: 'sensing_touchingobject', next, parent, shadow: false, topLevel: false, fields: {},
          inputs: { TOUCHINGOBJECTMENU: [1, menuId] } };
        break;
      }

      // ── Variable / List reporters ──
      case 'var': {
        const vId = this._resolveVarId(expr.name);
        block = { opcode: 'data_variable', next, parent, inputs: {}, shadow: false, topLevel: false,
          fields: { VARIABLE: [expr.name, vId] } };
        break;
      }
      case 'listGet': {
        const lId = this._resolveListId(expr.list);
        block = { opcode: 'data_itemoflist', next, parent, shadow: false, topLevel: false,
          fields: { LIST: [expr.list, lId] },
          inputs: { INDEX: mkNumInput(expr.index) } };
        break;
      }
      case 'listIndexOf': {
        const lId = this._resolveListId(expr.list);
        block = { opcode: 'data_itemnumoflist', next, parent, shadow: false, topLevel: false,
          fields: { LIST: [expr.list, lId] },
          inputs: { ITEM: mkStrInput(expr.item) } };
        break;
      }
      case 'listLength': {
        const lId = this._resolveListId(expr.list);
        block = { opcode: 'data_lengthoflist', next, parent, inputs: {}, shadow: false, topLevel: false,
          fields: { LIST: [expr.list, lId] } };
        break;
      }
      case 'listContains': {
        const lId = this._resolveListId(expr.list);
        block = { opcode: 'data_listcontainsitem', next, parent, shadow: false, topLevel: false,
          fields: { LIST: [expr.list, lId] },
          inputs: { ITEM: mkStrInput(expr.item) } };
        break;
      }

      // ── Procedure argument reporters ──
      case 'arg': {
        let isBoolean = false;
        for (const pd of Object.values(this._procDefs)) {
          const idx = pd.argNames.indexOf(expr.name);
          if (idx !== -1 && pd.argTypes[idx] === 'boolean') { isBoolean = true; break; }
        }
        block = {
          opcode: isBoolean ? 'argument_reporter_boolean' : 'argument_reporter_string_number',
          next, parent, inputs: {}, shadow: false, topLevel: false,
          fields: { VALUE: [expr.name, null] },
        };
        break;
      }

      default:
        block = { opcode: `unknown_op_${op}`, next, parent, inputs: {}, fields: {}, shadow: false, topLevel: false };
    }

    this._blocks[id] = block;
  }

  _setParent(blockId, parentId) {
    if (this._blocks[blockId]) {
      this._blocks[blockId].parent = parentId;
    }
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node tools/generate-sb3.js <dsl.json> <out project.json>');
    process.exit(1);
  }
  const dslPath = resolve(args[0]);
  const outPath = resolve(args[1]);
  let dsl;
  try {
    dsl = JSON.parse(readFileSync(dslPath, 'utf8'));
  } catch (e) {
    console.error(`Failed to read/parse ${dslPath}: ${e.message}`);
    process.exit(1);
  }
  const gen = new Sb3Generator(dsl);
  const project = gen.build();
  writeFileSync(outPath, JSON.stringify(project, null, 2), 'utf8');
  console.log(`Written: ${outPath}`);
}
