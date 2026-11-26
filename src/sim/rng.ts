import type { World } from './types';

/**
 * mulberry32. The state lives on the world, never in a closure, so that
 * saving a world and loading it again continues the exact same sequence.
 * The engine must never call Math.random().
 */
export function nextRandom(world: World): number {
  world.rngState = (world.rngState + 0x6d2b79f5) | 0;
  let t = world.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Uniform in [-1, 1). */
export function randomSigned(world: World): number {
  return nextRandom(world) * 2 - 1;
}
