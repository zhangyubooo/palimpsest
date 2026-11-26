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
npm run control  # the control experiment: remains pull on vs off
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

`npm run control` runs every seed twice, identical except that the pull is on
(kappa = 0.15) or off (kappa = 0). After 30 000 ticks, four seeds:

| | pull on | pull off |
| --- | --- | --- |
| gene diversity (mean std of genes) | 0.143 | 0.251 |
| locality (neighbours vs random pairs) | 0.982 | 0.980 |

Two findings. First, the pull is real and large: it removes about 40% of the
population's genetic diversity. The dead make the living more alike. Second,
it does not create regions with their own character, which is what I expected:
locality stays near 1 either way, because organisms range across the whole
world. Making place matter more is an open design question.

At kappa = 0.35 diversity fell to 0.096 and populations shrank, so the default
was lowered to 0.15.

If the population falls below a floor, the world restarts one genome from its
remains, so a world with a history never stays dead.
