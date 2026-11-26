import './style.css';
import { WorldRenderer } from './render/renderer';
import {
  DEFAULT_CONFIG,
  createStepper,
  createWorld,
  descendsFrom,
  spawn,
  type Genome,
  type Remains,
  type World,
} from './sim';
import { createGenesisPanel } from './ui/genesis';

const config = DEFAULT_CONFIG;

const wrapEl = document.querySelector<HTMLDivElement>('#world-wrap')!;
const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
const markersEl = document.querySelector<HTMLDivElement>('#markers')!;
const hud = document.querySelector<HTMLDivElement>('#hud')!;
const createButton = document.querySelector<HTMLButtonElement>('#create')!;
const renderer = new WorldRenderer(canvas, config);

let seed = Number(new URLSearchParams(location.search).get('seed') ?? 1);
let world: World = createWorld(seed, config);
let step = createStepper(config);
let paused = false;
let ticksPerFrame = 2;
let showLife = true;

/** A genome waiting for the visitor to choose its place, or null. */
let pending: Genome | null = null;
/** Lifeforms this visitor has released into the current world. */
const mine: { id: number; el: HTMLDivElement; label: HTMLSpanElement }[] = [];

const number = (id: number) => `No. ${String(id).padStart(4, '0')}`;

const genesis = createGenesisPanel(document.querySelector<HTMLDivElement>('#genesis')!, {
  onChoosePlace(genome) {
    pending = genome;
    wrapEl.classList.add('placing');
  },
  onCancel() {
    pending = null;
    wrapEl.classList.remove('placing');
    createButton.hidden = genesis.isOpen();
  },
});

function openGenesis(): void {
  genesis.open();
  createButton.hidden = true;
}
createButton.addEventListener('click', openGenesis);

function reset(newSeed: number): void {
  seed = newSeed;
  world = createWorld(seed, config);
  step = createStepper(config);
  for (const m of mine) m.el.remove();
  mine.length = 0;
}

addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.code === 'Space') {
    paused = !paused;
    e.preventDefault();
  } else if (e.code === 'ArrowRight') ticksPerFrame = Math.min(32, ticksPerFrame * 2);
  else if (e.code === 'ArrowLeft') ticksPerFrame = Math.max(1, ticksPerFrame / 2);
  else if (e.code === 'KeyR') reset(seed + 1);
  else if (e.code === 'KeyM') showLife = !showLife;
  else if (e.code === 'KeyG' && !genesis.isOpen()) openGenesis();
});

/** Mouse position in world units. */
function toWorld(e: MouseEvent): [number, number] {
  const rect = canvas.getBoundingClientRect();
  return [((e.clientX - rect.left) / rect.width) * config.size, ((e.clientY - rect.top) / rect.height) * config.size];
}

/** The remains that would pull a birth at (x, y) hardest: the nearest within reach. */
function remainsUnder(x: number, y: number): Remains | null {
  let best: Remains | null = null;
  let bestDist = config.remainsRadius;
  for (const r of world.remains) {
    let dx = Math.abs(r.x - x);
    let dy = Math.abs(r.y - y);
    if (dx > config.size / 2) dx = config.size - dx;
    if (dy > config.size / 2) dy = config.size - dy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = r;
    }
  }
  return best;
}

wrapEl.addEventListener('mousemove', (e) => {
  if (!pending) return;
  const r = remainsUnder(...toWorld(e));
  genesis.setGroundInfo(
    r
      ? `BENEATH THIS PLACE\n${number(r.id)} · generation ${r.generation}\nrewrote ${r.influence} strangers, ${r.kinInfluence} of its own line`
      : 'BENEATH THIS PLACE\nNo one has died here yet.',
  );
});

wrapEl.addEventListener('click', (e) => {
  if (!pending) return;
  const [x, y] = toWorld(e);
  const organism = spawn(world, config, pending, x, y, null, 0, config.startEnergy);

  const el = document.createElement('div');
  el.className = 'marker';
  const label = document.createElement('span');
  el.append(label);
  markersEl.append(el);
  mine.push({ id: organism.id, el, label });

  pending = null;
  wrapEl.classList.remove('placing');
  genesis.close();
  createButton.hidden = false;
  showLife = true;
});

function countDescendants(id: number): number {
  let count = 0;
  for (let other = id + 1; other < world.parents.length; other++) {
    if (descendsFrom(world, other, id)) count++;
  }
  return count;
}

function updateMarkers(): void {
  for (const m of mine) {
    const alive = world.organisms.find((o) => o.id === m.id);
    const dead = alive ? undefined : world.remains.find((r) => r.id === m.id);
    const at = alive ?? dead;
    if (!at) continue;
    m.el.style.left = `${(at.x / config.size) * 100}%`;
    m.el.style.top = `${(at.y / config.size) * 100}%`;
    m.el.classList.toggle('dead', !alive);
    // Near the right edge the label goes on the left, so it is not cut off.
    m.el.classList.toggle('left', at.x > config.size * 0.55);
    // Counting descendants walks the family tree, so only do it now and then.
    if (world.tick % 30 === 0 || m.label.textContent === '') {
      const descendants = countDescendants(m.id);
      m.label.textContent = alive
        ? `${number(m.id)} · yours · energy ${Math.round(alive.energy)} · ${descendants} descendants`
        : `${number(m.id)} · died · ${descendants} descendants · rewrote ${dead!.influence} strangers`;
    }
  }
}

function frame(now: number): void {
  if (!paused) for (let i = 0; i < ticksPerFrame; i++) step(world);

  // While choosing a place the visitor sees only the ground.
  renderer.draw(world, { showLife: showLife && !pending });
  updateMarkers();
  genesis.animate(now / 1000);

  let rewritten = 0;
  for (const r of world.remains) rewritten += r.influence;
  const view = pending ? 'CHOOSING A PLACE' : showLife ? 'LIVING' : 'MEMORY';
  hud.textContent =
    `${view}   SEED ${seed}   TICK ${world.tick}   x${ticksPerFrame}${paused ? '   PAUSED' : ''}\n` +
    `POPULATION ${world.organisms.length}   GENERATION ${world.maxGeneration}   EXTINCT ${world.totalDeaths}   REWRITTEN ${rewritten}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
