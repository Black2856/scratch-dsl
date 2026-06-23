// Alphabet used to GENERATE our ids (mirrors Scratch's block-id "soup"). Id
// *generation* stays within this set so authored ids are clean; id *validation*
// is deliberately broader (below) so imported real-Scratch ids are accepted.
const ID_CHARACTERS =
    '!#%()*+,-./:;=?@[]^_`{|}~ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Real Scratch projects use ids beyond the generator alphabet: cloud-variable
// ids are `☁ Name` (space + U+2601), and some variable/list ids are the raw
// name (unicode, spaces, longer than the soup length). SB3 ids are arbitrary
// JSON strings, so validation only requires a non-empty, bounded string; the
// real invariants are uniqueness and consistent references, checked elsewhere.
const MAX_ID_LENGTH = 1024;

export type EntityId = string;

export interface DuplicateId {
    id: EntityId;
    firstPath: string;
    duplicatePath: string;
}

export const isValidId = (value: unknown): value is EntityId =>
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= MAX_ID_LENGTH;

export const generateId = (
    length = 20,
    random: () => number = Math.random
): EntityId => {
    if (!Number.isInteger(length) || length < 1 || length > 64) {
        throw new RangeError('ID length must be an integer between 1 and 64.');
    }

    let result = '';
    for (let index = 0; index < length; index++) {
        const value = random();
        if (!Number.isFinite(value) || value < 0 || value >= 1) {
            throw new RangeError('ID random source must return a value in [0, 1).');
        }
        result += ID_CHARACTERS[Math.floor(value * ID_CHARACTERS.length)];
    }
    return result;
};

export const findDuplicateIds = (
    entries: Iterable<{id: EntityId; path: string}>
): DuplicateId[] => {
    const firstPaths = new Map<EntityId, string>();
    const duplicates: DuplicateId[] = [];

    for (const entry of entries) {
        const firstPath = firstPaths.get(entry.id);
        if (firstPath === undefined) {
            firstPaths.set(entry.id, entry.path);
        } else {
            duplicates.push({
                id: entry.id,
                firstPath,
                duplicatePath: entry.path
            });
        }
    }
    return duplicates;
};

export const ID_ALPHABET = ID_CHARACTERS;
