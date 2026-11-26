/**
 * The stranger experiment. Does it matter where a lifeform lands?
 *
 * A world runs for 20 000 ticks. Then a healthy genome is taken from the far
 * side of the world and eight copies of it are released at one point, among
 * strangers. 5 000 ticks later we look at the living descendants of those
 * eight and ask how far their genes are from
 *   - the founder they descend from, and
 *   - the local dead: the mean genome of the remains around the landing point.
 *
 * Run twice per seed, with the remains pull on and off. If the ground rewrites
 * newcomers, the "to local dead" distance should shrink only when it is on.
 *
 *   npm run stranger
 */
import {
  DEFAULT_CONFIG,
  GENE_KEYS,
  createStepper,
  createWorld,
  descendsFrom,
  spawn,
  type Genome,
} from '../src/sim';

const SETTLE = 20_000;
const AFTER = 5_000;
const SEEDS = [1, 2, 3, 4, 5];
const [PX, PY] = [64, 64];
const SIZE = DEFAULT_CONFIG.size;

const geneDistance = (a: Genome, b: Genome) =>
  Math.sqrt(GENE_KEYS.reduce((sum, key) => sum + (a[key] - b[key]) ** 2, 0));
const torus = (d: number) => Math.min(Math.abs(d), SIZE - Math.abs(d));
const fromPoint = (o: { x: number; y: number }) => Math.hypot(torus(o.x - PX), torus(o.y - PY));

for (const pull of [DEFAULT_CONFIG.remainsPull, 0]) {
  console.log(`\nremains pull ${pull === 0 ? 'OFF' : 'ON'}`);
  let before = 0;
  let after = 0;
  let lines = 0;

  for (const seed of SEEDS) {
    const config = { ...DEFAULT_CONFIG, remainsPull: pull };
    const world = createWorld(seed, config);
    const step = createStepper(config);
    for (let t = 0; t < SETTLE; t++) step(world);

    const nearby = world.remains.filter((r) => fromPoint(r) < 25);
    if (nearby.length === 0 || world.organisms.length === 0) {
      console.log(`  seed ${seed}: nothing has died near the landing point`);
      continue;
    }
    const local = { seed: 0 } as Genome;
    for (const key of GENE_KEYS) local[key] = nearby.reduce((sum, r) => sum + r.genome[key], 0) / nearby.length;

    const far = world.organisms.reduce((best, o) => (fromPoint(o) > fromPoint(best) ? o : best));
    const founder: Genome = { ...far.genome, seed: 123 };
    const ids: number[] = [];
    for (let i = 0; i < 8; i++) {
      ids.push(spawn(world, config, { ...founder }, PX + (i % 3) * 2, PY + Math.floor(i / 3) * 2, null, 0, 70).id);
    }
    for (let t = 0; t < AFTER; t++) step(world);

    const ofLine = (id: number) => ids.some((founderId) => id === founderId || descendsFrom(world, id, founderId));
    const living = world.organisms.filter((o) => ofLine(o.id));
    const rewrote = world.remains.filter((r) => ofLine(r.id)).reduce((sum, r) => sum + r.influence, 0);
    const start = geneDistance(founder, local);

    if (living.length === 0) {
      console.log(`  seed ${seed}: the line died out; its remains rewrote ${rewrote} strangers`);
      continue;
    }
    const end = living.reduce((sum, o) => sum + geneDistance(o.genome, local), 0) / living.length;
    console.log(
      `  seed ${seed}: ${String(living.length).padStart(3)} living descendants; distance to the local dead ` +
        `${start.toFixed(3)} -> ${end.toFixed(3)}; its remains rewrote ${rewrote} strangers`,
    );
    before += start;
    after += end;
    lines++;
  }
  if (lines > 0) {
    const change = ((after - before) / before) * 100;
    console.log(`  mean over ${lines} surviving lines: ${(before / lines).toFixed(3)} -> ${(after / lines).toFixed(3)} (${change >= 0 ? '+' : ''}${change.toFixed(1)}%)`);
  }
}
