/**
 * The control experiment. Does the genome left in the ground actually change
 * the world, or is the remains pull just decoration?
 *
 * Each seed is run twice, identical except for one number:
 *   pull ON   remainsPull = default
 *   pull OFF  remainsPull = 0   (remains still exist and still fertilise)
 *
 * Measured on the living population at the end:
 *   diversity   mean standard deviation of the genes across the population
 *   locality    gene distance between neighbours / between random pairs.
 *               1 means where you live says nothing about your genes;
 *               lower means the world has regions with their own character.
 *
 *   npm run control            4 seeds, 30 000 ticks
 *   npm run control -- 60000   longer runs
 */
import {
  DEFAULT_CONFIG,
  GENE_KEYS,
  createStepper,
  createWorld,
  type Organism,
  type SimConfig,
  type World,
} from '../src/sim';

const ticks = Number(process.argv[2] ?? 30_000);
const seeds = [1, 2, 3, 4];
const NEIGHBOUR_RADIUS = 14;

function geneDistance(a: Organism, b: Organism): number {
  let sum = 0;
  for (const key of GENE_KEYS) sum += (a.genome[key] - b.genome[key]) ** 2;
  return Math.sqrt(sum);
}

function measure(world: World, size: number) {
  const pop = world.organisms;
  let diversity = 0;
  for (const key of GENE_KEYS) {
    const mean = pop.reduce((acc, o) => acc + o.genome[key], 0) / pop.length;
    diversity += Math.sqrt(pop.reduce((acc, o) => acc + (o.genome[key] - mean) ** 2, 0) / pop.length);
  }
  diversity /= GENE_KEYS.length;

  let near = 0;
  let nearCount = 0;
  let all = 0;
  let allCount = 0;
  for (let i = 0; i < pop.length; i++) {
    for (let j = i + 1; j < pop.length; j++) {
      let dx = Math.abs(pop[i].x - pop[j].x);
      let dy = Math.abs(pop[i].y - pop[j].y);
      if (dx > size / 2) dx = size - dx;
      if (dy > size / 2) dy = size - dy;
      const d = geneDistance(pop[i], pop[j]);
      all += d;
      allCount++;
      if (dx * dx + dy * dy < NEIGHBOUR_RADIUS * NEIGHBOUR_RADIUS) {
        near += d;
        nearCount++;
      }
    }
  }
  const locality = nearCount && allCount ? near / nearCount / (all / allCount) : NaN;
  const influence = world.remains.reduce((acc, r) => acc + r.influence, 0);
  return { population: pop.length, diversity, locality, influence, remains: world.remains.length };
}

function runOnce(seed: number, config: SimConfig) {
  const world = createWorld(seed, config);
  const step = createStepper(config);
  for (let t = 0; t < ticks; t++) step(world);
  return measure(world, config.size);
}

console.log(`ticks=${ticks}  neighbour radius=${NEIGHBOUR_RADIUS}`);
console.log('seed  pull  population  diversity  locality  remains  influenced');

const rows: { seed: number; on: ReturnType<typeof runOnce>; off: ReturnType<typeof runOnce> }[] = [];
for (const seed of seeds) {
  const on = runOnce(seed, DEFAULT_CONFIG);
  const off = runOnce(seed, { ...DEFAULT_CONFIG, remainsPull: 0 });
  rows.push({ seed, on, off });
  for (const [label, m] of [['on ', on], ['off', off]] as const) {
    console.log(
      [
        String(seed).padEnd(5),
        label.padEnd(5),
        String(m.population).padStart(10),
        m.diversity.toFixed(3).padStart(10),
        m.locality.toFixed(3).padStart(9),
        String(m.remains).padStart(8),
        String(m.influence).padStart(11),
      ].join(' '),
    );
  }
}

const mean = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((acc, r) => acc + pick(r), 0) / rows.length;
console.log('');
console.log(`mean diversity   on ${mean((r) => r.on.diversity).toFixed(3)}   off ${mean((r) => r.off.diversity).toFixed(3)}`);
console.log(`mean locality    on ${mean((r) => r.on.locality).toFixed(3)}   off ${mean((r) => r.off.locality).toFixed(3)}`);
