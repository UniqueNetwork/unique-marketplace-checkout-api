type NonFunctional<T> = T extends Function ? never : T;

/**
 * Helper to produce an array of enum values.
 * @param enumeration Enumeration object.
 */
export function enumToArray<T>(enumeration: T): NonFunctional<T[keyof T]>[] {
  return Object.keys(enumeration)
    .filter((key) => isNaN(Number(key)))
    .map((key) => enumeration[key])
    .filter((val) => typeof val === 'number' || typeof val === 'string');
}

export const convertPriceToMoney = (price: number) => price * 1000000000000;
