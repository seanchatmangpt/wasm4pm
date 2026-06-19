/**
 * Deterministic seeded PRNG (mulberry32) + helpers.
 *
 * DETERMINISM IS LAW: never use Math.random(). Every stochastic decision in the
 * evolutionary engine flows through a SeededRng constructed from an integer seed,
 * so the same (inputs, seed) produces a byte-identical result.
 */

export interface SeededRng {
  /** next float in [0, 1) */
  next(): number;
  /** integer in [min, max) */
  randInt(min: number, max: number): number;
  /** pick one element (deterministic); throws on empty */
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates shuffle returning a new array (input untouched) */
  shuffle<T>(items: readonly T[]): T[];
}

/**
 * mulberry32: a fast 32-bit seeded PRNG with good distribution for our purposes.
 * The seed is normalized to an unsigned 32-bit integer so any number works.
 */
export function mulberry32(seed: number): SeededRng {
  // Normalize seed to uint32. Non-integers / negatives are folded deterministically.
  let state = (Math.trunc(seed) >>> 0) || 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const randInt = (min: number, max: number): number => {
    if (max <= min) return min;
    return min + Math.floor(next() * (max - min));
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new Error('rng.pick: cannot pick from an empty array');
    }
    return items[randInt(0, items.length)];
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = randInt(0, i + 1);
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  };

  return { next, randInt, pick, shuffle };
}
