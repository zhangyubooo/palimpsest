import type { Organism } from './types';

/**
 * Uniform grid over the torus. Rebuilt every tick; with a few hundred
 * organisms that is cheaper and simpler than updating it incrementally.
 * Neighbour queries visit buckets in a fixed order, which keeps the
 * simulation deterministic.
 */
export class SpatialHash {
  private readonly cols: number;
  private readonly buckets: Organism[][];

  constructor(
    private readonly worldSize: number,
    private readonly cellSize: number,
  ) {
    this.cols = Math.ceil(worldSize / cellSize);
    this.buckets = Array.from({ length: this.cols * this.cols }, () => []);
  }

  rebuild(organisms: readonly Organism[]): void {
    for (const b of this.buckets) b.length = 0;
    for (const o of organisms) {
      if (o.alive) this.buckets[this.index(o.x, o.y)].push(o);
    }
  }

  /** Calls `visit` for every organism within `radius` of (x, y), wrapping around the edges. */
  query(
    x: number,
    y: number,
    radius: number,
    visit: (other: Organism, dx: number, dy: number, distSq: number) => void,
  ): void {
    const reach = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const rSq = radius * radius;
    const half = this.worldSize / 2;

    for (let oy = -reach; oy <= reach; oy++) {
      const by = (((cy + oy) % this.cols) + this.cols) % this.cols;
      for (let ox = -reach; ox <= reach; ox++) {
        const bx = (((cx + ox) % this.cols) + this.cols) % this.cols;
        for (const other of this.buckets[by * this.cols + bx]) {
          let dx = other.x - x;
          let dy = other.y - y;
          if (dx > half) dx -= this.worldSize;
          else if (dx < -half) dx += this.worldSize;
          if (dy > half) dy -= this.worldSize;
          else if (dy < -half) dy += this.worldSize;
          const distSq = dx * dx + dy * dy;
          if (distSq <= rSq) visit(other, dx, dy, distSq);
        }
      }
    }
  }

  private index(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.floor(x / this.cellSize));
    const cy = Math.min(this.cols - 1, Math.floor(y / this.cellSize));
    return cy * this.cols + cx;
  }
}
