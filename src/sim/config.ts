/**
 * Every tunable number of the simulation lives here, so a parameter sweep
 * can override any of them and a test can pin them.
 */
export interface SimConfig {
  /** World is a torus of size x size units; one unit = one grid cell. */
  size: number;
  initialPopulation: number;
  /** Safety cap. Food is the real limiter; this only stops a runaway. */
  hardCap: number;

  // Food field
  /**
   * Food is a fast-turnover resource: little is stored in the ground and it
   * regrows quickly. A large standing stock makes the population boom and
   * crash in sync; a small one keeps it steady.
   */
  foodCapacity: number; // food a cell regrows towards
  foodRegrow: number; // regrowth per tick towards capacity
  initialFood: number; // starting fill, as a fraction of capacity

  // Energy
  maxEnergy: number;
  startEnergy: number;
  eatRate: number; // food taken per tick at metabolism 0.5
  foodEnergy: number; // energy per unit of food
  basalCost: number; // energy per tick at metabolism 0.5, resilience 0
  moveCost: number; // energy per tick per speed^2
  senseCost: number; // energy per tick at curiosity 1

  // Movement
  baseSpeed: number;
  turnRate: number; // 0..1, how fast velocity follows the desired direction
  wanderJitter: number; // radians of random walk per tick
  /**
   * Pull back towards the birthplace. It grows with distance and reaches
   * homeWeight at homeRadius. 0 lets organisms roam the whole world.
   */
  homeWeight: number;
  homeRadius: number;
  separationRadius: number;
  socialRadius: number;

  // Trail field: M' = (1 - decay) * M + diffusion * laplacian(M) + deposits
  trailDeposit: number; // written per organism per tick
  /** Must stay <= 0.25 with a 4-neighbour laplacian, or the field blows up. */
  trailDiffusion: number;
  trailDecay: number; // fraction lost per tick
  trailWeight: number; // steering weight at traceAffinity 0 or 1
  trailReach: number; // how far ahead an organism senses the trail

  // Remains: what the dead do to the living
  /** kappa. 0 turns the pull off, which is the control for the experiment. */
  remainsPull: number;
  remainsRadius: number; // how far from a birth remains can reach
  remainsDecay: number; // strength lost per tick, exponential
  fertilityGain: number; // fertility added at the centre of a death
  fertilityRadius: number; // cells
  fertilityMax: number; // cap, keeps the positive feedback bounded
  fertilityDecay: number; // fraction lost per tick
  /** Below this many living, the world restarts a genome from its remains. */
  revivalFloor: number;
  revivalInterval: number; // ticks between revivals

  // Life cycle
  reproduceAt: number; // energy threshold
  maturity: number; // minimum age in ticks
  birthCost: number; // energy lost in the split
  baseLifespan: number; // ticks, scaled by resilience
  mutationRate: number; // std-dev-like spread of a gene mutation
  corpseFood: number; // food returned to the cell on death
  /** Ticks between samples of an organism's position, kept for its archive page. */
  pathInterval: number;
}

export const DEFAULT_CONFIG: SimConfig = {
  size: 256,
  initialPopulation: 60,
  hardCap: 300,

  foodCapacity: 1,
  foodRegrow: 0.004,
  initialFood: 0.6,

  maxEnergy: 100,
  startEnergy: 50,
  eatRate: 0.6,
  foodEnergy: 0.4,
  basalCost: 0.11,
  moveCost: 0.12,
  senseCost: 0.012,

  baseSpeed: 0.8,
  turnRate: 0.15,
  wanderJitter: 0.35,
  homeWeight: 0.8,
  homeRadius: 20,
  separationRadius: 3,
  socialRadius: 12,

  trailDeposit: 0.08,
  trailDiffusion: 0.03,
  trailDecay: 0.002,
  trailWeight: 0.9,
  trailReach: 5,

  remainsPull: 0.15,
  remainsRadius: 10,
  remainsDecay: 0.00002,
  fertilityGain: 0.5,
  fertilityRadius: 3,
  fertilityMax: 1.5,
  fertilityDecay: 0.0001,
  revivalFloor: 8,
  revivalInterval: 200,

  reproduceAt: 72,
  maturity: 150,
  birthCost: 6,
  baseLifespan: 2600,
  mutationRate: 0.05,
  corpseFood: 5,
  pathInterval: 50,
};
