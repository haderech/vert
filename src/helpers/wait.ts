/**
 * Wait using Promise
 * @param {number} ms - timeout period
 * @example
 *
 * async wait(500);
 * //=> setTimeout using 500ms
 */
export const wait = (ms: number) => new Promise(resolve => setTimeout(() => resolve(0), ms));
