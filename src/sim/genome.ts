import { nextRandom, randomSigned } from './rng';
import { GENE_KEYS, type Genome, type World } from './types';

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function randomGenome(world: World): Genome {
  const g = { seed: Math.floor(nextRandom(world) * 0xffffffff) } as Genome;
  for (const key of GENE_KEYS) g[key] = nextRandom(world);
  return g;
}

/**
 * Inheritance: each gene drifts by a small symmetric amount, and is then
 * pulled towards the genome of nearby remains, if there are any.
 * The sum of two uniforms gives a triangular distribution, so small
 * changes are common and large ones rare, without needing a gaussian.
 */
export function mutate(
  world: World,
  parent: Genome,
  rate: number,
  remains?: Genome,
  pull = 0,
): Genome {
  const child = { seed: Math.floor(nextRandom(world) * 0xffffffff) } as Genome;
  for (const key of GENE_KEYS) {
    const drift = (randomSigned(world) + randomSigned(world)) * rate;
    // Inheritance without kinship: the genome lying in the ground under a
    // birth drags the child towards itself, whoever the child's parent is.
    const drag = remains ? pull * (remains[key] - parent[key]) : 0;
    child[key] = clamp01(parent[key] + drift + drag);
  }
  return child;
}
