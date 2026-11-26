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
import { createSpecimenPanel, specimenNumber } from './ui/specimen';
import { clearWorld, loadWorld, saveWorld } from './ui/storage';

const config = DEFAULT_CONFIG;

/** Simulation speed at x2, used to work out how much happened while the page was closed. */
const TICKS_PER_SECOND = 120;
/** The most a returning visitor's world is fast-forwarded. */
const MAX_CATCH_UP = 30_000;
const CATCH_UP_PER_FRAME = 500;
const SAVE_EVERY_MS = 10_000;

const wrapEl = document.querySelector<HTMLDivElement>('#world-wrap')!;
const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
const markersEl = document.querySelector<HTMLDivElement>('#markers')!;
const hud = document.querySelector<HTMLDivElement>('#hud')!;
const createButton = document.querySelector<HTMLButtonElement>('#create')!;
const renderer = new WorldRenderer(canvas, config);

const seedParam = new URLSearchParams(location.search).get('seed');
let world: World = createWorld(Number(seedParam ?? 1), config);
let step = createStepper(config);
let paused = false;
let ticksPerFrame = 2;
let showLife = true;
/** Ticks still to run, without drawing, to catch up on time away. */
let catchUp = 0;
let lastSave = performance.now();

/** A genome waiting for the visitor to choose its place, or null. */
let pending: Genome | null = null;

// --- Markers: rings over the canvas that follow particular lifeforms ---------

interface Marker {
  id: number;
  el: HTMLDivElement;
  label: HTMLSpanElement;
}
/** Lifeforms this visitor has released into the current world. */
const mine: Marker[] = [];

function makeMarker(id: number, className = ''): Marker {
  const el = document.createElement('div');
  el.className = `marker ${className}`;
  const label = document.createElement('span');
  el.append(label);
  markersEl.append(el);
  return { id, el, label };
}
/** The ring around whichever specimen is open in the archive. */
const selected = makeMarker(0, 'selected');
selected.el.hidden = true;

function countDescendants(id: number): number {
  let count = 0;
  for (let other = id + 1; other < world.parents.length; other++) {
    if (descendsFrom(world, other, id)) count++;
  }
  return count;
}

function placeMarker(m: Marker, describe: boolean): void {
  const alive = world.organisms.find((o) => o.id === m.id);
  const dead = alive ? undefined : world.remains.find((r) => r.id === m.id);
  const at = alive ?? dead;
  m.el.hidden = !at;
  if (!at) return;
  m.el.style.left = `${(at.x / config.size) * 100}%`;
  m.el.style.top = `${(at.y / config.size) * 100}%`;
  m.el.classList.toggle('dead', !alive);
  // Near the right edge the label goes on the left, so it is not cut off.
  m.el.classList.toggle('left', at.x > config.size * 0.55);
  if (!describe) return;
  // Counting descendants walks the family tree, so only do it now and then.
  if (world.tick % 30 === 0 || m.label.textContent === '') {
    const descendants = countDescendants(m.id);
    m.label.textContent = alive
      ? `${specimenNumber(m.id)} · yours · energy ${Math.round(alive.energy)} · ${descendants} descendants`
      : `${specimenNumber(m.id)} · died · ${descendants} descendants · rewrote ${dead!.influence} strangers`;
  }
}

// --- Archive -------------------------------------------------------------------

const specimen = createSpecimenPanel(
  document.querySelector<HTMLDivElement>('#specimen')!,
  config,
  () => world,
  (id) => {
    // The address bar is the source of truth, so a specimen has a link.
    location.hash = id === null ? '' : `#/specimen/${id}`;
  },
);

function route(): void {
  const match = location.hash.match(/^#\/specimen\/(\d+)$/);
  if (match) {
    selected.id = Number(match[1]);
    selected.label.textContent = specimenNumber(selected.id);
    specimen.open(selected.id);
  } else {
    specimen.close();
    selected.el.hidden = true;
  }
}
addEventListener('hashchange', route);

// --- Genesis -------------------------------------------------------------------

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

// --- World lifecycle -------------------------------------------------------------

function save(): void {
  lastSave = performance.now();
  void saveWorld({ world, mine: mine.map((m) => m.id), savedAt: Date.now() }).catch(() => undefined);
}

function reset(newSeed: number): void {
  world = createWorld(newSeed, config);
  step = createStepper(config);
  for (const m of mine) m.el.remove();
  mine.length = 0;
  catchUp = 0;
  location.hash = '';
  void clearWorld();
}

// A world saved earlier is picked up again, unless the address asks for a particular seed.
if (seedParam === null) {
  void loadWorld().then((saved) => {
    if (!saved || saved.world.food.length !== config.size * config.size) return;
    world = saved.world;
    step = createStepper(config);
    for (const id of saved.mine) mine.push(makeMarker(id));
    const away = Math.max(0, Date.now() - saved.savedAt) / 1000;
    catchUp = Math.min(MAX_CATCH_UP, Math.floor(away * TICKS_PER_SECOND));
    route();
  });
}
addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});
addEventListener('pagehide', save);

// --- Input -------------------------------------------------------------------------

addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.code === 'Space') {
    paused = !paused;
    e.preventDefault();
  } else if (e.code === 'ArrowRight') ticksPerFrame = Math.min(32, ticksPerFrame * 2);
  else if (e.code === 'ArrowLeft') ticksPerFrame = Math.max(1, ticksPerFrame / 2);
  else if (e.code === 'KeyR') reset(world.seed + 1);
  else if (e.code === 'KeyM') showLife = !showLife;
  else if (e.code === 'KeyG' && !genesis.isOpen()) openGenesis();
  else if (e.code === 'Escape') location.hash = '';
});

/** Mouse position in world units. */
function toWorld(e: MouseEvent): [number, number] {
  const rect = canvas.getBoundingClientRect();
  return [((e.clientX - rect.left) / rect.width) * config.size, ((e.clientY - rect.top) / rect.height) * config.size];
}

/** The nearest of `things` to (x, y) within `reach`, measured around the world's edges. */
function nearest<T extends { x: number; y: number }>(things: readonly T[], x: number, y: number, reach: number): T | null {
  let best: T | null = null;
  let bestDist = reach;
  for (const thing of things) {
    let dx = Math.abs(thing.x - x);
    let dy = Math.abs(thing.y - y);
    if (dx > config.size / 2) dx = config.size - dx;
    if (dy > config.size / 2) dy = config.size - dy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = thing;
    }
  }
  return best;
}

wrapEl.addEventListener('mousemove', (e) => {
  const [x, y] = toWorld(e);
  if (!pending) {
    // Show that a lifeform or a grave under the pointer can be opened.
    const hit = (showLife && nearest(world.organisms, x, y, 4)) || nearest(world.remains, x, y, 3);
    wrapEl.classList.toggle('pickable', !!hit);
    return;
  }
  const r: Remains | null = nearest(world.remains, x, y, config.remainsRadius);
  genesis.setGroundInfo(
    r
      ? `BENEATH THIS PLACE\n${specimenNumber(r.id)} · generation ${r.generation}\nrewrote ${r.influence} strangers, ${r.kinInfluence} of its own line`
      : 'BENEATH THIS PLACE\nNo one has died here yet.',
  );
});

wrapEl.addEventListener('click', (e) => {
  const [x, y] = toWorld(e);
  if (!pending) {
    // The living are picked first; in memory view, or where no one is, the dead.
    const hit = (showLife && nearest(world.organisms, x, y, 4)) || nearest(world.remains, x, y, 3);
    if (hit) location.hash = `#/specimen/${hit.id}`;
    return;
  }
  const organism = spawn(world, config, pending, x, y, null, 0, config.startEnergy);
  mine.push(makeMarker(organism.id));

  pending = null;
  wrapEl.classList.remove('placing');
  genesis.close();
  createButton.hidden = false;
  showLife = true;
  save();
});

// --- Frame ---------------------------------------------------------------------------

function frame(now: number): void {
  if (catchUp > 0) {
    const batch = Math.min(CATCH_UP_PER_FRAME, catchUp);
    for (let i = 0; i < batch; i++) step(world);
    catchUp -= batch;
  } else if (!paused) {
    for (let i = 0; i < ticksPerFrame; i++) step(world);
  }

  // While choosing a place the visitor sees only the ground.
  renderer.draw(world, { showLife: showLife && !pending });
  for (const m of mine) placeMarker(m, true);
  if (specimen.current() !== null) placeMarker(selected, false);
  specimen.update(world);
  genesis.animate(now / 1000);

  if (now - lastSave > SAVE_EVERY_MS && catchUp === 0) save();

  let rewritten = 0;
  for (const r of world.remains) rewritten += r.influence;
  const view = catchUp > 0 ? `CATCHING UP ${catchUp}` : pending ? 'CHOOSING A PLACE' : showLife ? 'LIVING' : 'MEMORY';
  hud.textContent =
    `${view}   SEED ${world.seed}   TICK ${world.tick}   x${ticksPerFrame}${paused ? '   PAUSED' : ''}\n` +
    `POPULATION ${world.organisms.length}   GENERATION ${world.maxGeneration}   EXTINCT ${world.totalDeaths}   REWRITTEN ${rewritten}`;
  requestAnimationFrame(frame);
}
route();
requestAnimationFrame(frame);
