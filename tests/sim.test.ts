import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  GENE_KEYS,
  cloneWorld,
  descendsFrom,
  createStepper,
  createWorld,
  mutate,
  randomGenome,
  type SimConfig,
  type World,
  type WorldEvent,
} from '../src/sim';

function run(world: World, config: SimConfig, ticks: number): WorldEvent[] {
  const step = createStepper(config);
  const events: WorldEvent[] = [];
  for (let t = 0; t < ticks; t++) events.push(...step(world));
  return events;
}

/** A compact fingerprint of everything that matters in a world. */
function fingerprint(world: World): string {
  let foodSum = 0;
  for (const f of world.food) foodSum += f;
  let trailSum = 0;
  for (const m of world.trail) trailSum += m;
  return JSON.stringify({
    tick: world.tick,
    rng: world.rngState,
    nextId: world.nextId,
    foodSum,
    trailSum,
    fertilitySum: world.fertility.reduce((acc, v) => acc + v, 0),
    remains: world.remains.map((r) => [r.id, r.influence, r.kinInfluence]),
    organisms: world.organisms.map((o) => [o.id, o.x, o.y, o.energy, o.age, o.generation]),
  });
}

describe('determinism', () => {
  it('gives the same world for the same seed', () => {
    const a = createWorld(42, DEFAULT_CONFIG);
    const b = createWorld(42, DEFAULT_CONFIG);
    run(a, DEFAULT_CONFIG, 2000);
    run(b, DEFAULT_CONFIG, 2000);
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('gives a different world for a different seed', () => {
    const a = createWorld(1, DEFAULT_CONFIG);
    const b = createWorld(2, DEFAULT_CONFIG);
    run(a, DEFAULT_CONFIG, 200);
    run(b, DEFAULT_CONFIG, 200);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it('continues identically from a copied world', () => {
    const straight = createWorld(7, DEFAULT_CONFIG);
    run(straight, DEFAULT_CONFIG, 1500);

    const first = createWorld(7, DEFAULT_CONFIG);
    run(first, DEFAULT_CONFIG, 700);
    const resumed = cloneWorld(first);
    run(resumed, DEFAULT_CONFIG, 800);

    expect(fingerprint(resumed)).toBe(fingerprint(straight));
  });
});

describe('invariants', () => {
  const world = createWorld(3, DEFAULT_CONFIG);
  const step = createStepper(DEFAULT_CONFIG);
  const dead = new Set<number>();
  const born = new Set<number>(world.organisms.map((o) => o.id));
  let violations: string[] = [];

  for (let t = 0; t < 4000; t++) {
    for (const e of step(world)) {
      if (e.type === 'death') {
        if (dead.has(e.id)) violations.push(`organism ${e.id} died twice`);
        dead.add(e.id);
      } else {
        if (e.parentId !== null && dead.has(e.parentId)) {
          violations.push(`dead organism ${e.parentId} gave birth`);
        }
        born.add(e.id);
      }
    }
    for (const o of world.organisms) {
      if (!o.alive) violations.push(`dead organism ${o.id} still in the world`);
      if (dead.has(o.id)) violations.push(`organism ${o.id} is listed after dying`);
      if (!(o.energy > 0 && o.energy <= DEFAULT_CONFIG.maxEnergy)) {
        violations.push(`energy ${o.energy} out of range`);
      }
      if (!(o.x >= 0 && o.x < DEFAULT_CONFIG.size && o.y >= 0 && o.y < DEFAULT_CONFIG.size)) {
        violations.push(`position ${o.x},${o.y} outside the world`);
      }
      for (const key of GENE_KEYS) {
        if (!(o.genome[key] >= 0 && o.genome[key] <= 1)) violations.push(`gene ${key} out of range`);
      }
    }
    if (violations.length > 5) break;
  }

  it('keeps energy, position and genes in range and never revives the dead', () => {
    expect(violations).toEqual([]);
  });

  it('actually exercises births and deaths', () => {
    expect(dead.size).toBeGreaterThan(20);
    expect(world.maxGeneration).toBeGreaterThan(1);
  });

  it('keeps the books: births minus deaths equals the living', () => {
    expect(world.totalBirths - world.totalDeaths).toBe(world.organisms.length);
    expect(world.totalDeaths).toBe(dead.size);
  });

  it('keeps the food field finite and non-negative', () => {
    for (const f of world.food) {
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(0);
    }
  });

  it('never exceeds the hard cap', () => {
    const config = { ...DEFAULT_CONFIG, foodRegrow: 0.05, hardCap: 80 };
    const crowded = createWorld(5, config);
    const stepCrowded = createStepper(config);
    let peak = 0;
    for (let t = 0; t < 3000; t++) {
      stepCrowded(crowded);
      peak = Math.max(peak, crowded.organisms.length);
    }
    expect(peak).toBe(80);
  });
});

describe('trail field', () => {
  const sum = (a: Float32Array) => a.reduce((acc, v) => acc + v, 0);

  it('stays finite, non-negative and bounded while organisms write to it', () => {
    const world = createWorld(4, DEFAULT_CONFIG);
    const step = createStepper(DEFAULT_CONFIG);
    // If every organism deposited forever, the total would settle at deposit / decay each.
    const bound = (DEFAULT_CONFIG.hardCap * DEFAULT_CONFIG.trailDeposit) / DEFAULT_CONFIG.trailDecay;
    for (let t = 0; t < 3000; t++) step(world);
    let total = 0;
    for (const m of world.trail) {
      expect(Number.isFinite(m)).toBe(true);
      expect(m).toBeGreaterThanOrEqual(0);
      total += m;
    }
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(bound);
  });

  it('only spreads when decay is off: diffusion conserves the total', () => {
    const config = { ...DEFAULT_CONFIG, initialPopulation: 0, trailDecay: 0 };
    const world = createWorld(1, config);
    world.trail[128 * config.size + 128] = 100;
    run(world, config, 500);
    expect(sum(world.trail)).toBeCloseTo(100, 1);
    expect(world.trail[128 * config.size + 128]).toBeLessThan(5);
    expect(world.trail[128 * config.size + 140]).toBeGreaterThan(0);
  });

  it('wraps around the edges', () => {
    const config = { ...DEFAULT_CONFIG, initialPopulation: 0, trailDecay: 0 };
    const world = createWorld(1, config);
    world.trail[0] = 100; // top-left corner
    run(world, config, 5);
    expect(world.trail[config.size - 1]).toBeGreaterThan(0); // top-right
    expect(world.trail[(config.size - 1) * config.size]).toBeGreaterThan(0); // bottom-left
  });

  it('fades away once nothing writes to it', () => {
    const config = { ...DEFAULT_CONFIG, initialPopulation: 0, trailDecay: 0.004 };
    const world = createWorld(1, config);
    world.trail.fill(1);
    run(world, config, 3000);
    expect(sum(world.trail)).toBeLessThan(1);
  });

  it('changes where organisms go: followers and avoiders end up in different worlds', () => {
    const on = createWorld(6, DEFAULT_CONFIG);
    const offConfig = { ...DEFAULT_CONFIG, trailWeight: 0 };
    const off = createWorld(6, offConfig);
    run(on, DEFAULT_CONFIG, 300);
    run(off, offConfig, 300);
    expect(fingerprint(on)).not.toBe(fingerprint(off));
  });
});

describe('remains', () => {
  it('leaves exactly one record per death, where the body fell', () => {
    const world = createWorld(8, DEFAULT_CONFIG);
    const events = run(world, DEFAULT_CONFIG, 3000);
    const deaths = events.filter((e) => e.type === 'death');
    expect(deaths.length).toBeGreaterThan(10);
    expect(world.remains.length).toBe(deaths.length);
    deaths.forEach((e, i) => {
      if (e.type !== 'death') return;
      expect(world.remains[i].id).toBe(e.id);
      expect(world.remains[i].x).toBe(e.x);
      expect(world.remains[i].y).toBe(e.y);
      expect(world.remains[i].genome).toEqual(e.genome);
    });
  });

  it('pulls a child gene towards the remains by exactly the pull', () => {
    const world = createWorld(9, { ...DEFAULT_CONFIG, initialPopulation: 0 });
    const parent = randomGenome(world);
    const remains = randomGenome(world);
    const child = mutate(world, parent, 0, remains, 0.5);
    for (const key of GENE_KEYS) {
      expect(child[key]).toBeCloseTo((parent[key] + remains[key]) / 2, 10);
    }
  });

  it('counts every pulled birth once, as kin or as a stranger', () => {
    const world = createWorld(8, DEFAULT_CONFIG);
    const events = run(world, DEFAULT_CONFIG, 6000);
    const pulled = events.filter((e) => e.type === 'birth' && e.pulledBy !== null && !e.revived).length;
    const counted = world.remains.reduce((acc, r) => acc + r.influence + r.kinInfluence, 0);
    expect(pulled).toBeGreaterThan(20);
    expect(counted).toBe(pulled);
  });

  it('does nothing when the pull is zero, whatever the radius', () => {
    const near = { ...DEFAULT_CONFIG, remainsPull: 0, remainsRadius: 10 };
    const far = { ...DEFAULT_CONFIG, remainsPull: 0, remainsRadius: 40 };
    const a = createWorld(11, near);
    const b = createWorld(11, far);
    const events = run(a, near, 3000);
    run(b, far, 3000);
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(events.some((e) => e.type === 'birth' && e.pulledBy !== null)).toBe(false);
    expect(a.remains.every((r) => r.influence === 0 && r.kinInfluence === 0)).toBe(true);
  });

  it('changes the world when the pull is on', () => {
    const off = { ...DEFAULT_CONFIG, remainsPull: 0 };
    const a = createWorld(11, DEFAULT_CONFIG);
    const b = createWorld(11, off);
    run(a, DEFAULT_CONFIG, 3000);
    run(b, off, 3000);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it('knows who descends from whom', () => {
    const world = createWorld(8, DEFAULT_CONFIG);
    const events = run(world, DEFAULT_CONFIG, 3000);
    const births = events.filter((e) => e.type === 'birth' && e.parentId !== null);
    expect(births.length).toBeGreaterThan(10);
    for (const e of births) {
      if (e.type !== 'birth' || e.parentId === null) continue;
      expect(descendsFrom(world, e.id, e.parentId)).toBe(true);
      expect(descendsFrom(world, e.parentId, e.id)).toBe(false);
      const grandparent = world.parents[e.parentId];
      if (grandparent) expect(descendsFrom(world, e.id, grandparent)).toBe(true);
    }
    expect(descendsFrom(world, 5, 5)).toBe(true);
    expect(descendsFrom(world, 5, 0)).toBe(false);
  });

  it('keeps fertility between zero and its cap', () => {
    const world = createWorld(8, DEFAULT_CONFIG);
    run(world, DEFAULT_CONFIG, 4000);
    let peak = 0;
    for (const f of world.fertility) {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(DEFAULT_CONFIG.fertilityMax);
      peak = Math.max(peak, f);
    }
    expect(peak).toBeGreaterThan(0);
  });
});

describe('genome', () => {
  it('stays within 0..1 through many generations of mutation', () => {
    const world = createWorld(9, { ...DEFAULT_CONFIG, initialPopulation: 0 });
    let g = randomGenome(world);
    for (let i = 0; i < 5000; i++) {
      g = mutate(world, g, 0.3);
      for (const key of GENE_KEYS) {
        expect(g[key]).toBeGreaterThanOrEqual(0);
        expect(g[key]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('copies genes unchanged when the mutation rate is zero', () => {
    const world = createWorld(9, { ...DEFAULT_CONFIG, initialPopulation: 0 });
    const parent = randomGenome(world);
    const child = mutate(world, parent, 0);
    for (const key of GENE_KEYS) expect(child[key]).toBe(parent[key]);
  });
});

describe('ecology', () => {
  it('stays alive and below the cap for 10 000 ticks with default settings', () => {
    for (const seed of [1, 2, 3]) {
      const world = createWorld(seed, DEFAULT_CONFIG);
      const step = createStepper(DEFAULT_CONFIG);
      let min = Infinity;
      let max = 0;
      for (let t = 0; t < 10_000; t++) {
        step(world);
        min = Math.min(min, world.organisms.length);
        max = Math.max(max, world.organisms.length);
      }
      expect(min, `seed ${seed} went extinct or nearly`).toBeGreaterThan(5);
      expect(max, `seed ${seed} hit the cap`).toBeLessThan(DEFAULT_CONFIG.hardCap);
    }
  }, 120_000);

  it('dies out when there is no food', () => {
    const config = { ...DEFAULT_CONFIG, foodRegrow: 0, initialFood: 0, corpseFood: 0, revivalFloor: 0 };
    const world = createWorld(1, config);
    run(world, config, 3000);
    expect(world.organisms.length).toBe(0);
  });

  it('restarts from its remains instead of staying dead', () => {
    const config = { ...DEFAULT_CONFIG, foodRegrow: 0, initialFood: 0, corpseFood: 0 };
    const world = createWorld(1, config);
    const events = run(world, config, 4000);
    const revivals = events.filter((e) => e.type === 'birth' && e.revived);
    expect(revivals.length).toBeGreaterThan(0);
    const dead = new Set(world.remains.map((r) => r.id));
    for (const e of revivals) {
      if (e.type === 'birth') expect(dead.has(e.pulledBy!)).toBe(true);
    }
  });
});
