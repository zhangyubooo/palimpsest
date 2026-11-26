/**
 * Parameter sweep: runs the engine headless over a grid of settings and
 * reports which ones keep a population alive without pinning it at the cap.
 *
 *   npm run sweep            default grid, 10 000 ticks, 2 seeds each
 *   npm run sweep -- 20000   longer runs
 */
import { DEFAULT_CONFIG, createStepper, createWorld, type SimConfig } from '../src/sim';

const ticks = Number(process.argv[2] ?? 10_000);
const seeds = [1, 2];

const grid: Partial<SimConfig>[] = [];
for (const foodRegrow of [0.003, 0.004, 0.005]) {
  for (const foodEnergy of [0.36, 0.4, 0.44]) {
    grid.push({ foodRegrow, foodEnergy });
  }
}

console.log(`ticks=${ticks} seeds=${seeds.join(',')}`);
console.log('regrow  foodEnergy   min   mean   max   gen  verdict');

for (const overrides of grid) {
  const config: SimConfig = { ...DEFAULT_CONFIG, ...overrides };
  let min = Infinity;
  let max = 0;
  let sum = 0;
  let samples = 0;
  let gen = 0;
  let extinct = false;

  for (const seed of seeds) {
    const world = createWorld(seed, config);
    const step = createStepper(config);
    for (let t = 0; t < ticks; t++) {
      step(world);
      if (t > ticks / 5 && t % 50 === 0) {
        const n = world.organisms.length;
        min = Math.min(min, n);
        max = Math.max(max, n);
        sum += n;
        samples++;
      }
      if (world.organisms.length === 0) {
        extinct = true;
        min = 0;
        break;
      }
    }
    gen = Math.max(gen, world.maxGeneration);
  }

  const mean = samples ? sum / samples : 0;
  const verdict = extinct ? 'EXTINCT' : max >= config.hardCap ? 'at cap' : min < 15 ? 'fragile' : 'stable';
  console.log(
    [
      String(overrides.foodRegrow).padEnd(7),
      String(overrides.foodEnergy).padEnd(10),
      String(min).padStart(4),
      mean.toFixed(0).padStart(6),
      String(max).padStart(5),
      String(gen).padStart(5),
      ' ' + verdict,
    ].join(' '),
  );
}
