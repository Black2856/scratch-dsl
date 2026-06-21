export const LIST_INVALID = 'INVALID';
export const LIST_ALL = 'ALL';

export type ListIndex = number | typeof LIST_INVALID | typeof LIST_ALL;

export class Cast {
    static toNumber (value: unknown): number {
        if (typeof value === 'number') {
            return Number.isNaN(value) ? 0 : value;
        }
        const numberValue = Number(value);
        return Number.isNaN(numberValue) ? 0 : numberValue;
    }

    static toBoolean (value: unknown): boolean {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            return value !== '' && value !== '0' && value.toLowerCase() !== 'false';
        }
        return Boolean(value);
    }

    static toString (value: unknown): string {
        return String(value);
    }

    static isWhiteSpace (value: unknown): boolean {
        return value === null ||
            (typeof value === 'string' && value.trim().length === 0);
    }

    static compare (left: unknown, right: unknown): number {
        let leftNumber = Number(left);
        let rightNumber = Number(right);

        if (leftNumber === 0 && Cast.isWhiteSpace(left)) {
            leftNumber = Number.NaN;
        } else if (rightNumber === 0 && Cast.isWhiteSpace(right)) {
            rightNumber = Number.NaN;
        }

        if (Number.isNaN(leftNumber) || Number.isNaN(rightNumber)) {
            const leftString = String(left).toLowerCase();
            const rightString = String(right).toLowerCase();
            if (leftString < rightString) return -1;
            if (leftString > rightString) return 1;
            return 0;
        }

        if (
            (leftNumber === Number.POSITIVE_INFINITY &&
                rightNumber === Number.POSITIVE_INFINITY) ||
            (leftNumber === Number.NEGATIVE_INFINITY &&
                rightNumber === Number.NEGATIVE_INFINITY)
        ) {
            return 0;
        }

        return leftNumber - rightNumber;
    }

    static isInt (value: unknown): boolean {
        if (typeof value === 'number') {
            if (Number.isNaN(value)) return true;
            return value === parseInt(String(value), 10);
        }
        if (typeof value === 'boolean') return true;
        if (typeof value === 'string') return !value.includes('.');
        return false;
    }

    static toListIndex (
        index: unknown,
        length: number,
        acceptAll: boolean,
        random: () => number = Math.random
    ): ListIndex {
        if (typeof index !== 'number') {
            if (index === 'all') {
                return acceptAll ? LIST_ALL : LIST_INVALID;
            }
            if (index === 'last') {
                return length > 0 ? length : LIST_INVALID;
            }
            if (index === 'random' || index === 'any') {
                if (length < 1) return LIST_INVALID;
                return 1 + Math.floor(random() * length);
            }
        }

        const numericIndex = Math.floor(Cast.toNumber(index));
        if (numericIndex < 1 || numericIndex > length) return LIST_INVALID;
        return numericIndex;
    }
}

