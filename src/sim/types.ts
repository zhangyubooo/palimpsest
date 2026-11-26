/**
 * Core data types for the simulation.
 *
 * Nothing in src/sim may import from the DOM, the renderer or the UI.
 * The engine has to run unchanged in Node (tests, parameter sweeps).
 */

/** Every gene is normalised to 0..1. `seed` only drives the drawn shape. */
export interface Genome {
  seed: number;

  // Morphology
  symmetry: number; // number of limbs
  extension: number; // limb length
  fiberDensity: number; // branching density

  // Behaviour
  curiosity: number; // wander weight, sensing radius
  resilience: number; // low basal cost, but slow
  sociality: number; // cohesion weight
  metabolism: number; // eats and breeds fast, burns fast

  // Relationship to memory
  traceAffinity: number; // 0 avoids trails, 1 follows them
}

/** Genes that mutate. `seed` is re-rolled for every child instead. */
export const GENE_KEYS = [
  'symmetry',
  'extension',
  'fiberDensity',
  'curiosity',
  'resilience',
  'sociality',
  'metabolism',
  'traceAffinity',
] as const;
export type GeneKey = (typeof GENE_KEYS)[number];

export interface Organism {
  id: number;
  genome: Genome;

  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Where it was born. Organisms range around this point rather than across the world. */
  homeX: number;
  homeY: number;
  /** Wander direction in radians, random-walked every tick. */
  heading: number;

  energy: number; // 0..config.maxEnergy
  age: number; // ticks lived
  generation: number;
  parentId: number | null;
  birthTick: number;
  alive: boolean;
  /** Where it has been: x, y pairs sampled every config.pathInterval ticks. */
  path: number[];
}

/**
 * What a death leaves behind: the long memory of the world. Remains do not
 * move or spread, and they fade so slowly that they are close to permanent.
 */
export interface Remains {
  /** Id of the organism that died here. */
  id: number;
  x: number;
  y: number;
  genome: Genome;
  generation: number;
  parentId: number | null;
  birthTick: number;
  deathTick: number;
  cause: DeathCause;
  /** The path it walked in life, as x, y pairs. */
  path: number[];
  /** Births pulled by these remains whose line does not descend from the dead. */
  influence: number;
  /** Births pulled by these remains that do descend from the dead. */
  kinInfluence: number;
}

export type DeathCause = 'starvation' | 'old-age';

export interface BirthEvent {
  type: 'birth';
  tick: number;
  id: number;
  parentId: number | null;
  generation: number;
  /** Id of the dead organism whose remains pulled this child's genes, if any. */
  pulledBy: number | null;
  /** True when a dying world was restarted from a genome found in the ground. */
  revived: boolean;
}

export interface DeathEvent {
  type: 'death';
  tick: number;
  id: number;
  cause: DeathCause;
  x: number;
  y: number;
  age: number;
  generation: number;
  genome: Genome;
}

export type WorldEvent = BirthEvent | DeathEvent;

export interface World {
  seed: number;
  tick: number;
  /** Internal state of the PRNG. Part of the world so a snapshot resumes exactly. */
  rngState: number;
  nextId: number;

  /** Food per grid cell, row-major, config.size * config.size. */
  food: Float32Array;
  /**
   * Trail per grid cell: the short memory of the world. Living organisms
   * write to it as they move; it diffuses and fades within a few hundred ticks.
   */
  trail: Float32Array;
  /**
   * Fertility per grid cell. Every death raises it around the body, and food
   * regrows towards a higher level there. It fades far more slowly than trail.
   */
  fertility: Float32Array;
  organisms: Organism[];
  remains: Remains[];
  /** parents[id] is the parent's id, or 0 for none. Never pruned: it is the family tree. */
  parents: number[];

  totalBirths: number;
  totalDeaths: number;
  maxGeneration: number;
}
