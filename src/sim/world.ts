import type { SimConfig } from './config';
import { randomGenome } from './genome';
import { nextRandom } from './rng';
import type { Genome, Organism, Remains, World } from './types';

export function createWorld(seed: number, config: SimConfig): World {
  const world: World = {
    seed,
    tick: 0,
    rngState: seed | 0,
    nextId: 1,
    food: new Float32Array(config.size * config.size),
    trail: new Float32Array(config.size * config.size),
    fertility: new Float32Array(config.size * config.size),
    organisms: [],
    remains: [],
    parents: [0],
    totalBirths: 0,
    totalDeaths: 0,
    maxGeneration: 0,
  };

  // Uneven starting food, so there are gradients to follow from tick 0.
  for (let i = 0; i < world.food.length; i++) {
    world.food[i] = config.foodCapacity * config.initialFood * (0.5 + nextRandom(world));
  }

  for (let i = 0; i < config.initialPopulation; i++) {
    const x = nextRandom(world) * config.size;
    const y = nextRandom(world) * config.size;
    spawn(world, config, randomGenome(world), x, y, null, 0, config.startEnergy);
  }
  return world;
}

/** Adds an organism to the world. Used for the first population, for births and for visitors. */
export function spawn(
  world: World,
  config: SimConfig,
  genome: Genome,
  x: number,
  y: number,
  parentId: number | null,
  generation: number,
  energy: number,
): Organism {
  const organism: Organism = {
    id: world.nextId++,
    genome,
    x: wrap(x, config.size),
    y: wrap(y, config.size),
    vx: 0,
    vy: 0,
    heading: nextRandom(world) * Math.PI * 2,
    energy,
    age: 0,
    generation,
    parentId,
    birthTick: world.tick,
    alive: true,
  };
  world.organisms.push(organism);
  world.parents[organism.id] = parentId ?? 0;
  world.totalBirths++;
  if (generation > world.maxGeneration) world.maxGeneration = generation;
  return organism;
}

export function wrap(v: number, size: number): number {
  const r = v % size;
  return r < 0 ? r + size : r;
}

/** Grid cell index for a position. Positions are always kept inside [0, size). */
export function cellIndex(x: number, y: number, size: number): number {
  const cx = Math.min(size - 1, Math.floor(x));
  const cy = Math.min(size - 1, Math.floor(y));
  return cy * size + cx;
}

/** Deep copy. Used by tests and later by save/load. */
export function cloneWorld(world: World): World {
  return {
    ...world,
    food: new Float32Array(world.food),
    trail: new Float32Array(world.trail),
    fertility: new Float32Array(world.fertility),
    remains: world.remains.map((r) => ({ ...r, genome: { ...r.genome } })),
    parents: world.parents.slice(),
    organisms: world.organisms.map((o) => ({ ...o, genome: { ...o.genome } })),
  };
}

/** True when `ancestorId` is somewhere up the family tree of `id`. Ids only grow, so the walk can stop early. */
export function descendsFrom(world: World, id: number, ancestorId: number): boolean {
  let current = id;
  while (current > ancestorId) current = world.parents[current] ?? 0;
  return current === ancestorId && ancestorId !== 0;
}

/** How much of a dead organism's pull is left. 1 at death, fading very slowly. */
export function remainsStrength(remains: Remains, tick: number, config: SimConfig): number {
  return Math.exp(-config.remainsDecay * (tick - remains.deathTick));
}
