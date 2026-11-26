import { drawLifeform, limbCount } from '../render/morphology';
import { descendsFrom, type Genome, type SimConfig, type World } from '../sim';

/**
 * The archive page of one lifeform, living or dead, laid out like a specimen
 * card: its body, its line, the ground it covered, and what it left behind.
 */

export const specimenNumber = (id: number) => `No. ${String(id).padStart(4, '0')}`;

/** Everything the page shows, gathered from the world. */
interface Record {
  id: number;
  alive: boolean;
  genome: Genome;
  generation: number;
  parentId: number | null;
  birthTick: number;
  deathTick: number | null;
  cause: string | null;
  energy: number | null;
  path: number[];
  influence: number;
  kinInfluence: number;
}

function findRecord(world: World, id: number): Record | null {
  const o = world.organisms.find((x) => x.id === id);
  if (o) {
    return {
      id,
      alive: true,
      genome: o.genome,
      generation: o.generation,
      parentId: o.parentId,
      birthTick: o.birthTick,
      deathTick: null,
      cause: null,
      energy: o.energy,
      path: [...o.path, o.x, o.y],
      influence: 0,
      kinInfluence: 0,
    };
  }
  const r = world.remains.find((x) => x.id === id);
  if (r) {
    return {
      id,
      alive: false,
      genome: r.genome,
      generation: r.generation,
      parentId: r.parentId,
      birthTick: r.birthTick,
      deathTick: r.deathTick,
      cause: r.cause === 'starvation' ? 'Energy depletion' : 'Old age',
      energy: null,
      path: r.path,
      influence: r.influence,
      kinInfluence: r.kinInfluence,
    };
  }
  return null;
}

function family(genome: Genome): string {
  const limbs = limbCount(genome);
  const kind = genome.fiberDensity > 0.6 ? 'Fibrous' : genome.extension > 0.6 ? 'Radial' : 'Orbiform';
  return `${kind} · ${limbs} limbs`;
}

export interface SpecimenPanel {
  open(id: number): void;
  close(): void;
  /** Id of the specimen on show, or null. */
  current(): number | null;
  /** Called every frame; refreshes the live numbers now and then. */
  update(world: World): void;
}

export function createSpecimenPanel(
  root: HTMLElement,
  config: SimConfig,
  getWorld: () => World,
  onNavigate: (id: number | null) => void,
): SpecimenPanel {
  let currentId: number | null = null;
  let lastRefresh = -Infinity;

  root.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-id], [data-action]');
    if (!target) return;
    if (target.dataset.action === 'close') onNavigate(null);
    else if (target.dataset.id) onNavigate(Number(target.dataset.id));
  });

  function link(id: number, world: World): string {
    const alive = world.organisms.some((o) => o.id === id);
    return `<a data-id="${id}" class="${alive ? 'living' : 'dead'}">${specimenNumber(id)}</a>`;
  }

  function render(world: World): void {
    if (currentId === null) return;
    const record = findRecord(world, currentId);
    if (!record) {
      root.innerHTML = `
        <button class="close" data-action="close" aria-label="Close">×</button>
        <div class="panel-title">ARCHIVE</div>
        <p class="missing">${specimenNumber(currentId)} is not in this world.</p>`;
      return;
    }

    const children: number[] = [];
    let descendants = 0;
    for (let other = record.id + 1; other < world.parents.length; other++) {
      if (world.parents[other] === record.id) children.push(other);
      if (descendsFrom(world, other, record.id)) descendants++;
    }
    const lifespan = (record.deathTick ?? world.tick) - record.birthTick;
    const shownChildren = children.slice(0, 12).map((id) => link(id, world)).join(' ');
    const more = children.length > 12 ? ` <span class="dim">+${children.length - 12}</span>` : '';

    root.innerHTML = `
      <button class="close" data-action="close" aria-label="Close">×</button>
      <div class="panel-title">ARCHIVE <span>/ ${record.alive ? 'LIVING SPECIMEN' : 'EXTINCT SPECIMEN'}</span></div>
      <div class="specimen-number">${specimenNumber(record.id)}</div>
      <div class="specimen-family">${family(record.genome)} / Generation ${String(record.generation).padStart(2, '0')}</div>
      <canvas class="specimen-body" width="560" height="380"></canvas>

      <dl class="facts">
        <div><dt>${record.alive ? 'Age' : 'Lifespan'}</dt><dd>${lifespan.toLocaleString('en-US')} ticks</dd></div>
        <div><dt>${record.alive ? 'Energy' : 'Cause of death'}</dt><dd>${record.alive ? Math.round(record.energy!) : record.cause}</dd></div>
        <div><dt>Descendants</dt><dd>${descendants}</dd></div>
        <div class="${record.alive ? 'dim' : 'memory'}"><dt>Strangers rewritten</dt><dd>${record.alive ? 'not yet' : record.influence}</dd></div>
      </dl>
      <p class="answer">${
        record.alive
          ? 'Still alive. What it leaves in the ground is counted after it dies.'
          : `By blood it reached ${descendants}. Through the ground it changed ${record.influence} that were never its own${
              record.kinInfluence ? `, and ${record.kinInfluence} of its own line` : ''
            }.`
      }</p>

      <div class="section">RANGE</div>
      <canvas class="specimen-range" width="560" height="560"></canvas>

      <div class="section">LINEAGE</div>
      <div class="lineage">
        <div><span class="dim">Parent</span> ${record.parentId ? link(record.parentId, world) : '<span class="dim">none — written by a visitor or by the world</span>'}</div>
        <div><span class="dim">Children</span> ${children.length ? shownChildren + more : '<span class="dim">none</span>'}</div>
      </div>
    `;

    const body = root.querySelector<HTMLCanvasElement>('.specimen-body')!;
    drawLifeform(body.getContext('2d')!, record.genome, body.width / 2, body.height / 2, {
      radius: body.height * 0.44,
      color: record.alive ? '#e3e2d8' : '#c7ac77',
    });

    drawRange(root.querySelector<HTMLCanvasElement>('.specimen-range')!, record, config);
  }

  return {
    open(id) {
      currentId = id;
      root.hidden = false;
      lastRefresh = -Infinity;
      render(getWorld());
      root.scrollTop = 0;
    },
    close() {
      currentId = null;
      root.hidden = true;
    },
    current: () => currentId,
    update(world) {
      // A living specimen's numbers move; redraw about once a second.
      if (currentId === null) return;
      const now = performance.now();
      if (now - lastRefresh < 1000) return;
      lastRefresh = now;
      if (world.organisms.some((o) => o.id === currentId) || !root.querySelector('.specimen-number')) {
        const scroll = root.scrollTop;
        render(world);
        root.scrollTop = scroll;
      }
    },
  };
}

/** The path it walked, on a map of the whole world. */
function drawRange(canvas: HTMLCanvasElement, record: Record, config: SimConfig): void {
  const ctx = canvas.getContext('2d')!;
  const scale = canvas.width / config.size;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#222824';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const p = (canvas.width / 4) * i;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, canvas.height);
    ctx.moveTo(0, p);
    ctx.lineTo(canvas.width, p);
    ctx.stroke();
  }

  const path = record.path;
  ctx.strokeStyle = record.alive ? '#b8c6bc' : '#c7ac77';
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  for (let i = 0; i < path.length; i += 2) {
    const x = path[i] * scale;
    const y = path[i + 1] * scale;
    // The world wraps: a jump of more than half the world is an edge crossing, not a line.
    const wrapped =
      i > 0 &&
      (Math.abs(path[i] - path[i - 2]) > config.size / 2 || Math.abs(path[i + 1] - path[i - 1]) > config.size / 2);
    if (i === 0 || wrapped) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Birth: a small open circle. Death (or now): a filled one.
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.arc(path[0] * scale, path[1] * scale, 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(path[path.length - 2] * scale, path[path.length - 1] * scale, 5, 0, Math.PI * 2);
  ctx.fill();
}
