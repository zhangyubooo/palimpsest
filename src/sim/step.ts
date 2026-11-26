import type { SimConfig } from './config';
import { mutate } from './genome';
import { nextRandom, randomSigned } from './rng';
import { SpatialHash } from './spatialHash';
import type { DeathCause, Organism, Remains, World, WorldEvent } from './types';
import { cellIndex, descendsFrom, remainsStrength, spawn, wrap } from './world';

export type Stepper = (world: World) => WorldEvent[];

/**
 * Builds the function that advances a world by one tick.
 *
 * One tick, for every living organism in array order:
 *   1. sense    food gradient, neighbours, and the trail ahead
 *   2. steer    weighted sum of food, separation, social, wander and trail forces
 *   3. move     settle the energy account (intake minus costs), leave a trail
 *   4. breed    split when energy is high enough; the child's genes are
 *               pulled towards the strongest remains under the birth
 *   5. die      of starvation or old age: the body feeds the ground, makes
 *               it fertile, and leaves its genome there as remains
 * then the food field regrows and the trail field diffuses and decays.
 *
 * Same seed and same config always give the same world.
 */
export function createStepper(config: SimConfig): Stepper {
  const { size } = config;
  const hash = new SpatialHash(size, Math.max(config.socialRadius, 4));
  // Scratch buffer for the trail update. Not world state: it is fully
  // overwritten every tick, so it never affects determinism.
  const scratch = new Float32Array(size * size);
  const SENSE_ANGLES = [-0.7, 0, 0.7]; // left, ahead, right, in radians

  // Lookup grid for remains. Derived from world.remains (which only ever
  // grows), so it is caught up at the start of each tick, never saved.
  const bucketSize = Math.max(config.remainsRadius, 4);
  const bucketCols = Math.ceil(size / bucketSize);
  let buckets: Remains[][] = [];
  let indexedWorld: World | null = null;
  let indexedCount = 0;

  function bucketOf(x: number, y: number): number {
    const bx = Math.min(bucketCols - 1, Math.floor(x / bucketSize));
    const by = Math.min(bucketCols - 1, Math.floor(y / bucketSize));
    return by * bucketCols + bx;
  }

  function indexRemains(world: World): void {
    if (world !== indexedWorld || world.remains.length < indexedCount) {
      buckets = Array.from({ length: bucketCols * bucketCols }, () => []);
      indexedWorld = world;
      indexedCount = 0;
    }
    for (; indexedCount < world.remains.length; indexedCount++) {
      const r = world.remains[indexedCount];
      buckets[bucketOf(r.x, r.y)].push(r);
    }
  }

  /** The remains with the most pull on a birth at (x, y), and how much pull that is (0..1). */
  function strongestRemains(world: World, x: number, y: number): [Remains | null, number] {
    const radius = config.remainsRadius;
    const half = size / 2;
    const cx = Math.floor(x / bucketSize);
    const cy = Math.floor(y / bucketSize);
    let best: Remains | null = null;
    let bestWeight = 0;
    for (let oy = -1; oy <= 1; oy++) {
      const by = (((cy + oy) % bucketCols) + bucketCols) % bucketCols;
      for (let ox = -1; ox <= 1; ox++) {
        const bx = (((cx + ox) % bucketCols) + bucketCols) % bucketCols;
        for (const r of buckets[by * bucketCols + bx]) {
          let dx = Math.abs(r.x - x);
          let dy = Math.abs(r.y - y);
          if (dx > half) dx = size - dx;
          if (dy > half) dy = size - dy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist >= radius) continue;
          // Closer and fresher remains pull harder.
          const weight = remainsStrength(r, world.tick, config) * (1 - dist / radius);
          if (weight > bestWeight) {
            bestWeight = weight;
            best = r;
          }
        }
      }
    }
    return [best, bestWeight];
  }

  return function step(world: World): WorldEvent[] {
    const events: WorldEvent[] = [];
    hash.rebuild(world.organisms);
    indexRemains(world);

    // Births are appended while we iterate; only step those alive at the start.
    const count = world.organisms.length;
    let living = count;

    for (let i = 0; i < count; i++) {
      const o = world.organisms[i];
      const g = o.genome;

      // 1. Sense -------------------------------------------------------------
      const reach = 2 + 10 * g.curiosity;
      const fx =
        world.food[cellIndex(wrap(o.x + reach, size), o.y, size)] -
        world.food[cellIndex(wrap(o.x - reach, size), o.y, size)];
      const fy =
        world.food[cellIndex(o.x, wrap(o.y + reach, size), size)] -
        world.food[cellIndex(o.x, wrap(o.y - reach, size), size)];

      let sepX = 0;
      let sepY = 0;
      let cohX = 0;
      let cohY = 0;
      let near = 0;
      const sepSq = config.separationRadius * config.separationRadius;
      hash.query(o.x, o.y, config.socialRadius, (other, dx, dy, distSq) => {
        if (other === o || !other.alive) return;
        if (distSq < sepSq && distSq > 0) {
          const d = Math.sqrt(distSq);
          sepX -= dx / d;
          sepY -= dy / d;
        }
        cohX += dx;
        cohY += dy;
        near++;
      });

      // Trail: three samples ahead, like a slime-mould agent. Looking only
      // ahead keeps an organism from being pulled back onto its own wake.
      const speedNow = Math.sqrt(o.vx * o.vx + o.vy * o.vy);
      const facing = speedNow > 1e-4 ? Math.atan2(o.vy, o.vx) : o.heading;
      const liking = 2 * g.traceAffinity - 1; // -1 avoids, +1 follows
      let t0 = 0;
      let t1 = 0;
      let t2 = 0;
      let tMax = 0;
      for (let k = 0; k < 3; k++) {
        const a = facing + SENSE_ANGLES[k];
        const v =
          world.trail[
            cellIndex(
              wrap(o.x + Math.cos(a) * config.trailReach, size),
              wrap(o.y + Math.sin(a) * config.trailReach, size),
              size,
            )
          ];
        if (k === 0) t0 = v;
        else if (k === 1) t1 = v;
        else t2 = v;
        if (v > tMax) tMax = v;
      }
      // Followers weight each direction by its trail; avoiders by its lack of trail.
      const w0 = liking >= 0 ? t0 : tMax - t0;
      const w1 = liking >= 0 ? t1 : tMax - t1;
      const w2 = liking >= 0 ? t2 : tMax - t2;
      const [ntx, nty] = normalise(
        w0 * Math.cos(facing + SENSE_ANGLES[0]) + w1 * Math.cos(facing) + w2 * Math.cos(facing + SENSE_ANGLES[2]),
        w0 * Math.sin(facing + SENSE_ANGLES[0]) + w1 * Math.sin(facing) + w2 * Math.sin(facing + SENSE_ANGLES[2]),
      );

      // 2. Steer -------------------------------------------------------------
      o.heading += randomSigned(world) * config.wanderJitter;
      const hunger = 1 - o.energy / config.maxEnergy;

      const [nfx, nfy] = normalise(fx, fy);
      const [ncx, ncy] = near > 0 ? normalise(cohX, cohY) : [0, 0];

      const wFood = 0.4 + 1.6 * hunger;
      const wWander = 0.3 + g.curiosity;
      const wSocial = 0.8 * g.sociality;
      const wSeparate = 1.5;
      const wTrail = config.trailWeight * Math.abs(liking);

      // Home: the further from its birthplace, the harder it is pulled back.
      let homeX = 0;
      let homeY = 0;
      if (config.homeWeight > 0) {
        let hx = o.homeX - o.x;
        let hy = o.homeY - o.y;
        if (hx > size / 2) hx -= size;
        else if (hx < -size / 2) hx += size;
        if (hy > size / 2) hy -= size;
        else if (hy < -size / 2) hy += size;
        const away = Math.sqrt(hx * hx + hy * hy);
        if (away > 1e-6) {
          const strength = config.homeWeight * (away / config.homeRadius);
          homeX = (hx / away) * strength;
          homeY = (hy / away) * strength;
        }
      }

      const [dirX, dirY] = normalise(
        wFood * nfx + wWander * Math.cos(o.heading) + wSocial * ncx + wSeparate * sepX + wTrail * ntx + homeX,
        wFood * nfy + wWander * Math.sin(o.heading) + wSocial * ncy + wSeparate * sepY + wTrail * nty + homeY,
      );

      // Fast metabolism moves faster; resilience trades speed for endurance.
      const topSpeed = config.baseSpeed * (0.6 + 0.6 * g.metabolism) * (1 - 0.4 * g.resilience);
      o.vx += (dirX * topSpeed - o.vx) * config.turnRate;
      o.vy += (dirY * topSpeed - o.vy) * config.turnRate;

      // 3. Move and settle energy -------------------------------------------
      o.x = wrap(o.x + o.vx, size);
      o.y = wrap(o.y + o.vy, size);

      const cell = cellIndex(o.x, o.y, size);
      // Resilience is paid for at the table: tough bodies eat slowly.
      const bite = Math.min(
        world.food[cell],
        config.eatRate * (0.5 + g.metabolism) * (1 - 0.35 * g.resilience),
      );
      world.food[cell] -= bite;
      world.trail[cell] += config.trailDeposit;

      const speedSq = o.vx * o.vx + o.vy * o.vy;
      const cost =
        config.basalCost * (0.5 + g.metabolism) * (1 - 0.35 * g.resilience) +
        config.moveCost * speedSq +
        config.senseCost * g.curiosity;

      o.energy = Math.min(config.maxEnergy, o.energy + bite * config.foodEnergy - cost);
      o.age++;
      if (o.age % config.pathInterval === 0) o.path.push(o.x, o.y);

      // 4. Breed -------------------------------------------------------------
      if (o.energy >= config.reproduceAt && o.age >= config.maturity && living < config.hardCap) {
        const share = (o.energy - config.birthCost) / 2;
        o.energy = share;
        const angle = nextRandom(world) * Math.PI * 2;

        let puller: Remains | null = null;
        let pull = 0;
        if (config.remainsPull > 0) {
          const [found, weight] = strongestRemains(world, o.x, o.y);
          puller = found;
          pull = config.remainsPull * weight;
        }

        const child = spawn(
          world,
          config,
          mutate(world, g, config.mutationRate, puller?.genome, pull),
          o.x + Math.cos(angle) * 2,
          o.y + Math.sin(angle) * 2,
          o.id,
          o.generation + 1,
          share,
        );
        living++;
        if (puller) {
          // The count that answers the project's question: how many lives
          // did this death change that were not its own descendants?
          if (descendsFrom(world, child.id, puller.id)) puller.kinInfluence++;
          else puller.influence++;
        }
        events.push({
          type: 'birth',
          tick: world.tick,
          id: child.id,
          parentId: o.id,
          generation: child.generation,
          pulledBy: puller ? puller.id : null,
          revived: false,
        });
      }

      // 5. Die ---------------------------------------------------------------
      const lifespan = config.baseLifespan * (0.7 + 0.6 * g.resilience);
      let cause: DeathCause | null = null;
      if (o.energy <= 0) cause = 'starvation';
      else if (o.age >= lifespan) cause = 'old-age';

      if (cause) {
        kill(world, config, o, cell, cause);
        living--;
        events.push({
          type: 'death',
          tick: world.tick,
          id: o.id,
          cause,
          x: o.x,
          y: o.y,
          age: o.age,
          generation: o.generation,
          genome: { ...g },
        });
      }
    }

    if (living !== world.organisms.length) {
      world.organisms = world.organisms.filter((o) => o.alive);
    }

    // A world that has almost died out restarts from its own ground: one
    // genome is picked from the remains and lives again where it fell.
    if (
      world.organisms.length < config.revivalFloor &&
      world.remains.length > 0 &&
      world.tick % config.revivalInterval === 0
    ) {
      const r = world.remains[Math.floor(nextRandom(world) * world.remains.length)];
      const revived = spawn(world, config, { ...r.genome }, r.x, r.y, null, r.generation + 1, config.startEnergy);
      events.push({
        type: 'birth',
        tick: world.tick,
        id: revived.id,
        parentId: null,
        generation: revived.generation,
        pulledBy: r.id,
        revived: true,
      });
    }

    // Food regrows towards capacity; the closer to full, the slower.
    // Fertile ground, where bodies have fallen, regrows towards a higher level.
    const food = world.food;
    const fertility = world.fertility;
    const cap = config.foodCapacity;
    const fertilityKeep = 1 - config.fertilityDecay;
    for (let i = 0; i < food.length; i++) {
      food[i] += config.foodRegrow * (cap * (1 + fertility[i]) - food[i]);
      fertility[i] *= fertilityKeep;
    }

    // Trail: diffuse to the four neighbours and fade. Edges wrap.
    const trail = world.trail;
    const keep = 1 - config.trailDecay;
    const d = config.trailDiffusion;
    for (let y = 0; y < size; y++) {
      const row = y * size;
      const up = (y === 0 ? size - 1 : y - 1) * size;
      const down = (y === size - 1 ? 0 : y + 1) * size;
      for (let x = 0; x < size; x++) {
        const left = x === 0 ? size - 1 : x - 1;
        const right = x === size - 1 ? 0 : x + 1;
        const m = trail[row + x];
        const lap = trail[row + left] + trail[row + right] + trail[up + x] + trail[down + x] - 4 * m;
        scratch[row + x] = keep * m + d * lap;
      }
    }
    trail.set(scratch);

    world.tick++;
    return events;
  };
}

function kill(world: World, config: SimConfig, o: Organism, cell: number, cause: DeathCause): void {
  const { size } = config;
  o.alive = false;
  o.energy = 0;
  // The body goes back into the ground it died on.
  world.food[cell] = Math.min(config.foodCapacity * 8, world.food[cell] + config.corpseFood);
  world.totalDeaths++;

  // The ground around it becomes fertile, most at the centre.
  const reach = config.fertilityRadius;
  const cx = Math.floor(o.x);
  const cy = Math.floor(o.y);
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const falloff = 1 - Math.sqrt(dx * dx + dy * dy) / (reach + 1);
      if (falloff <= 0) continue;
      const i = wrap(cy + dy, size) * size + wrap(cx + dx, size);
      world.fertility[i] = Math.min(config.fertilityMax, world.fertility[i] + config.fertilityGain * falloff);
    }
  }

  // And its genome stays where it fell.
  world.remains.push({
    id: o.id,
    x: o.x,
    y: o.y,
    genome: { ...o.genome },
    generation: o.generation,
    parentId: o.parentId,
    birthTick: o.birthTick,
    deathTick: world.tick,
    cause,
    path: [...o.path, o.x, o.y],
    influence: 0,
    kinInfluence: 0,
  });
}

function normalise(x: number, y: number): [number, number] {
  const len = Math.sqrt(x * x + y * y);
  return len > 1e-9 ? [x / len, y / len] : [0, 0];
}
