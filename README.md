# PALIMPSEST

**An Ecology of Memory.** A persistent 2D artificial-life world: visitors write a
lifeform into it, the lifeform moves, breeds and dies, and its death is printed
into the ground, where it keeps changing the lives that come after.

15-113 Project 3, Fall 2026. Yubo Zhang.

> If life disappears, does its existence still shape the world?

## Status

| Step | What | State |
| --- | --- | --- |
| 1 | Engine skeleton: organisms, food field, energy, death, seeded determinism | done |
| 2 | Reproduction and mutation, population tuned to stay stable | done |
| 3 | Trail field (deposit, diffuse, decay) drawn with a shader | done |
| 4 | Remains: death records, gene pull, fertile ground | done |
| 5 | Genesis: create a lifeform and choose where it lands | done |
| 6 | Archive: specimen pages, lineage, remains-influence count | next |
| 7 | Line-drawn morphology and the death animation | |
| 8 | Tests, CI, deploy | |

## Run it

```bash
npm install
npm run dev      # open the printed URL; add ?seed=7 to pick a world
npm test         # engine tests
npm run sweep    # headless parameter sweep
npm run control  # experiment: remains pull on vs off
npm run stranger # experiment: does it matter where a lifeform lands?
```

Keys: `space` pause, `←` / `→` speed, `M` memory view (ground only), `G` genesis, `R` next seed.

## How it is built

- `src/sim/` is the engine. It is plain TypeScript with no DOM or renderer
  imports, so the same code runs in the browser, in tests and in the sweep
  script. Same seed and same config always give the same world.
- `src/render/` draws the world with WebGL2 and hand-written GLSL, no
  framework. Three draw calls: the ground (food, trail and fertility packed
  into one texture), the remains, and the organisms as point sprites. It only
  reads the world.
- `src/render/morphology.ts` draws a lifeform as a line figure from its genome.
- `src/ui/genesis.ts` is the Genesis panel: five traits, a live body preview,
  then a click on the ground to choose where the lifeform begins.
- `scripts/sweep.ts` runs the engine over a grid of settings and reports which
  ones keep a population alive without pinning it at the cap.
- `tests/` checks determinism, invariants (energy, position and gene ranges,
  the dead stay dead), the trail field (bounded, conserves mass without decay,
  wraps, fades), remains (one per death, exact pull, influence bookkeeping,
  no effect at zero pull) and that the default world survives 10 000 ticks.

## A note on the food model

The first version stored a lot of food in the ground and regrew it slowly.
Every setting either filled the world to the cap or swung between 3 and 300
organisms. The fix was to make food a fast-turnover resource: little is stored,
it regrows quickly, and an organism eats most of what its cell holds. With that,
the default world settles between roughly 80 and 200 organisms and average
efficiency rises over generations, because genes affect survival.

## A note on the trail field

Living organisms write a trail that diffuses and fades:
`M' = (1 - decay) * M + diffusion * laplacian(M) + deposits`. This is the same
mechanism as Physarum (slime-mould) simulations and is used here as a known
building block, not as the project's idea. Each organism senses the trail at
three points ahead of it and, depending on its `traceAffinity` gene, steers
towards or away from it.

Adding trails made foraging so much more efficient that the population hit the
cap, and it exposed that `resilience` was a free advantage: every lineage
evolved towards maximum resilience. Resilient bodies now also eat more slowly,
and different runs settle on different strategies.

## Remains, and what the control experiment says

When an organism dies it does three things: its body feeds the cell it died
on, the ground around it becomes fertile, and its genome stays there as
remains. Any organism later born within reach of those remains has its genes
pulled towards the dead one's, whether or not it is a descendant:

`child = clamp(parent + mutation + kappa * strength * (remains - parent))`

Each remains record counts the births it changed that were not its own
descendants. That number is the project's answer to its question.

Two experiments test whether this mechanism does anything.

### 1. Control: pull on vs pull off

`npm run control` runs every seed twice, identical except that the pull is on
(kappa = 0.15) or off (kappa = 0), and measures the living population after
30 000 ticks.

- **Diversity** falls from about 0.27 to about 0.20 (mean standard deviation
  of the genes). The dead make the living more alike.
- At kappa = 0.35 diversity fell much further and populations shrank, so the
  default is 0.15.

### 2. Making place matter

The first version of this experiment found no regions at all: neighbours were
no more alike than random pairs (ratio 0.98, where 1 means place says nothing
about genes). The cause was not the pull but mobility. Organisms crossed the
whole world several times in a lifetime.

Slowing them down killed the population, because they could no longer find
food. What worked was giving every organism a home: a pull back towards its
birthplace that grows with distance. With that, the neighbour ratio drops to
about 0.7 and the world has regions with their own character.

### 3. The stranger: does it matter where you land?

`npm run stranger` settles a world for 20 000 ticks, then takes a healthy
genome from the far side of the world and releases eight copies at one point.
After 5 000 more ticks it measures how far the living descendants' genes are
from the local dead (the mean genome of the remains around the landing point).

| | pull on | pull off |
| --- | --- | --- |
| distance to the local dead, at landing | 0.863 | 0.955 |
| the same, 5 000 ticks later | 0.796 | 0.960 |
| change | -7.8% | +0.5% |

With the pull on, every surviving line moved towards the local dead (4 of 4).
With it off, the lines did not move. The effect is real but modest: two or
three generations close about 8% of the gap. One of the five lines died out
entirely, which is the normal fate of a newcomer in a settled world.

If the population falls below a floor, the world restarts one genome from its
remains, so a world with a history never stays dead.
