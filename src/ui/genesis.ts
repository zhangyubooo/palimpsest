import { drawLifeform } from '../render/morphology';
import type { Genome } from '../sim';

/**
 * The Genesis panel: a visitor sets five traits, watches the body change,
 * and then chooses where in the world the lifeform begins.
 */

interface Trait {
  key: 'curiosity' | 'resilience' | 'sociality' | 'metabolism' | 'traceAffinity';
  name: string;
  gain: string;
  cost: string;
  /** Word used in the summary when this trait is one of the strongest. */
  word: string;
}

const TRAITS: Trait[] = [
  { key: 'curiosity', name: 'Curiosity', gain: 'senses food from further away', cost: 'wanders, and sensing costs energy', word: 'Explorer' },
  { key: 'resilience', name: 'Resilience', gain: 'burns less, lives longer', cost: 'moves and eats slowly', word: 'Enduring' },
  { key: 'sociality', name: 'Sociality', gain: 'stays close to others', cost: 'shares the same ground', word: 'Collective' },
  { key: 'metabolism', name: 'Metabolism', gain: 'eats, moves and breeds fast', cost: 'starves fast', word: 'Voracious' },
  { key: 'traceAffinity', name: 'Memory', gain: 'follows the paths of others', cost: 'low: avoids them instead', word: 'Follower' },
];

export interface GenesisPanel {
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** Text shown while the visitor hovers the world to choose a place. */
  setGroundInfo(text: string): void;
  /** Called every frame so the preview breathes. */
  animate(seconds: number): void;
}

export interface GenesisCallbacks {
  /** The visitor has finished the body and wants to choose a place. */
  onChoosePlace(genome: Genome): void;
  onCancel(): void;
}

export function createGenesisPanel(root: HTMLElement, callbacks: GenesisCallbacks): GenesisPanel {
  const values: Record<Trait['key'], number> = {
    curiosity: 0.65,
    resilience: 0.45,
    sociality: 0.75,
    metabolism: 0.35,
    traceAffinity: 0.5,
  };
  let seed = Math.floor(Math.random() * 0xffffffff); // UI only: the engine never sees Math.random
  let symmetry = Math.random();
  let placing = false;

  root.innerHTML = `
    <div class="panel-title">GENESIS <span>/ CREATE A LIFEFORM</span></div>
    <canvas class="preview" width="560" height="440"></canvas>
    <div class="summary"></div>
    <div class="traits"></div>
    <div class="actions">
      <button class="ghost" data-action="reroll">ANOTHER BODY</button>
      <button class="primary" data-action="place">CHOOSE WHERE IT BEGINS</button>
    </div>
    <div class="placing" hidden>
      <div class="placing-title">CHOOSE WHERE IT BEGINS</div>
      <p>The world now shows only its ground. Every ring is a death. Whoever lies under a birth rewrites the newborn's genes.</p>
      <div class="ground-info">Move over the world.</div>
      <button class="ghost" data-action="back">BACK</button>
    </div>
    <button class="close" data-action="close" aria-label="Close">×</button>
  `;

  const preview = root.querySelector<HTMLCanvasElement>('.preview')!;
  const ctx = preview.getContext('2d')!;
  const summary = root.querySelector<HTMLDivElement>('.summary')!;
  const traitsEl = root.querySelector<HTMLDivElement>('.traits')!;
  const editing = [preview, summary, traitsEl, root.querySelector<HTMLDivElement>('.actions')!];
  const placingEl = root.querySelector<HTMLDivElement>('.placing')!;
  const groundInfo = root.querySelector<HTMLDivElement>('.ground-info')!;

  for (const trait of TRAITS) {
    const row = document.createElement('label');
    row.className = 'trait';
    row.innerHTML = `
      <div class="trait-head"><span>${trait.name}</span><span class="trait-value"></span></div>
      <input type="range" min="0" max="100" value="${Math.round(values[trait.key] * 100)}" />
      <div class="trait-note">${trait.gain} <span>· ${trait.cost}</span></div>
    `;
    const input = row.querySelector('input')!;
    const valueEl = row.querySelector<HTMLSpanElement>('.trait-value')!;
    valueEl.textContent = input.value;
    input.addEventListener('input', () => {
      values[trait.key] = Number(input.value) / 100;
      valueEl.textContent = input.value;
      updateSummary();
    });
    traitsEl.append(row);
  }

  /** The body is not set separately: it follows the traits. */
  function genome(): Genome {
    return {
      seed,
      symmetry,
      extension: values.curiosity,
      fiberDensity: values.sociality,
      curiosity: values.curiosity,
      resilience: values.resilience,
      sociality: values.sociality,
      metabolism: values.metabolism,
      traceAffinity: values.traceAffinity,
    };
  }

  function updateSummary(): void {
    const ranked = TRAITS.filter((t) => t.key !== 'traceAffinity')
      .map((t) => ({ word: t.word, value: values[t.key] }))
      .sort((a, b) => b.value - a.value);
    const words = [ranked[0].word, ranked[1].word];
    if (values.traceAffinity > 0.75) words.push('Follower');
    else if (values.traceAffinity < 0.25) words.push('Solitary');
    summary.textContent = words.join(' / ');
  }

  function setPlacing(on: boolean): void {
    placing = on;
    for (const el of editing) el.hidden = on;
    placingEl.hidden = !on;
  }

  root.addEventListener('click', (e) => {
    const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'reroll') {
      seed = Math.floor(Math.random() * 0xffffffff);
      symmetry = Math.random();
    } else if (action === 'place') {
      setPlacing(true);
      callbacks.onChoosePlace(genome());
    } else if (action === 'back') {
      setPlacing(false);
      callbacks.onCancel();
    } else if (action === 'close') {
      panel.close();
      callbacks.onCancel();
    }
  });

  const panel: GenesisPanel = {
    open() {
      setPlacing(false);
      root.hidden = false;
      updateSummary();
    },
    close() {
      root.hidden = true;
      setPlacing(false);
    },
    isOpen: () => !root.hidden,
    setGroundInfo(text) {
      groundInfo.textContent = text;
    },
    animate(seconds) {
      if (root.hidden || placing) return;
      ctx.clearRect(0, 0, preview.width, preview.height);
      drawLifeform(ctx, genome(), preview.width / 2, preview.height / 2, {
        radius: preview.height * 0.44,
        time: seconds,
      });
    },
  };
  return panel;
}
