import type { Genome } from '../sim';

/**
 * Draws one lifeform as a 2D line figure: a core, radial limbs, and fibres
 * branching off the limbs. The figure is a pure function of the genome, so
 * the same genome always draws the same body.
 *
 * Which gene shows up where:
 *   symmetry      number of limbs
 *   extension     limb length
 *   fiberDensity  fibres per limb
 *   resilience    size and weight of the core
 *   metabolism    breathing rate
 */
export interface DrawOptions {
  /** Radius, in canvas pixels, that the longest possible limb would reach. */
  radius: number;
  /** Seconds, for breathing. Pass 0 for a still specimen. */
  time?: number;
  color?: string;
  alpha?: number;
}

/** Small local PRNG so drawing never touches the simulation's random stream. */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function limbCount(genome: Genome): number {
  return 3 + Math.round(genome.symmetry * 6);
}

export function drawLifeform(
  ctx: CanvasRenderingContext2D,
  genome: Genome,
  cx: number,
  cy: number,
  options: DrawOptions,
): void {
  const random = seeded(genome.seed);
  const time = options.time ?? 0;
  const breath = 1 + 0.045 * Math.sin(time * (0.8 + 2.4 * genome.metabolism));
  const reach = options.radius * (0.38 + 0.62 * genome.extension) * breath;
  const limbs = limbCount(genome);
  const fibres = Math.round(genome.fiberDensity * 5);
  const coreRadius = options.radius * (0.07 + 0.09 * genome.resilience);
  const turn = random() * Math.PI * 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = options.color ?? '#e3e2d8';
  ctx.fillStyle = options.color ?? '#e3e2d8';
  ctx.lineCap = 'round';
  const alpha = options.alpha ?? 1;

  // Membrane: a faint boundary the limbs reach just past.
  ctx.globalAlpha = 0.14 * alpha;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, reach * 0.62, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < limbs; i++) {
    const angle = turn + (i / limbs) * Math.PI * 2 + (random() - 0.5) * 0.12;
    const bend = (random() - 0.5) * 0.9;
    const length = reach * (0.82 + random() * 0.18);

    // A limb is a quadratic curve: straight out, bent once.
    const ex = Math.cos(angle) * length;
    const ey = Math.sin(angle) * length;
    const mx = Math.cos(angle + bend * 0.5) * length * 0.55;
    const my = Math.sin(angle + bend * 0.5) * length * 0.55;
    const sx = Math.cos(angle) * coreRadius;
    const sy = Math.sin(angle) * coreRadius;

    ctx.globalAlpha = 0.85 * alpha;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();

    // Fibres leave the limb at intervals, alternating sides.
    ctx.globalAlpha = 0.5 * alpha;
    ctx.lineWidth = 0.8;
    for (let f = 0; f < fibres; f++) {
      const t = (f + 1) / (fibres + 1);
      // Point on the quadratic curve at t.
      const px = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * ex;
      const py = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * my + t * t * ey;
      const side = f % 2 === 0 ? 1 : -1;
      const fibreAngle = angle + side * (0.9 + random() * 0.4);
      const fibreLength = length * (0.14 + 0.14 * (1 - t));
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(fibreAngle) * fibreLength, py + Math.sin(fibreAngle) * fibreLength);
      ctx.stroke();
    }

    // Tip.
    ctx.globalAlpha = 0.9 * alpha;
    ctx.beginPath();
    ctx.arc(ex, ey, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Core: a ring, heavier in resilient bodies, with a solid centre.
  ctx.globalAlpha = 0.9 * alpha;
  ctx.lineWidth = 1 + 1.4 * genome.resilience;
  ctx.beginPath();
  ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, coreRadius * 0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
