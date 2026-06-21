const ID_CHARACTERS =
    '!#%()*+,-./:;=?@[]^_`{|}~ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const ID_CHARACTER_SET = new Set(ID_CHARACTERS);

export type EntityId = string;

export interface DuplicateId {
    id: EntityId;
    firstPath: string;
    duplicatePath: string;
}

export const isValidId = (value: unknown): value is EntityId =>
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 64 &&
    [...value].every(character => ID_CHARACTER_SET.has(character));

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
