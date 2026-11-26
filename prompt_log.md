# Prompt log

Prompts are the author's, translated from Chinese. Tool: Claude.

## 2026-11-24 — concept and plan

1. (With a written proposal attached: "PALIMPSEST — An Ecology of Memory".)
   "We're starting Project 3 now. This is my current idea, evaluate it."
2. "No spec needed. First explain in detail how you'd suggest doing it — write
   the proposal you would recommend and show me."
3. "The course has no hard requirements, Project 3 is fully open. What is the
   difference between 2D and 3D, and what do you mean by the submission version
   having to cut the archive or Genesis?"
4. "Submission is next Wednesday 12/2 in the evening. Let's do 2D first, as you
   said."
5. "Just create it the way we normally set up a 114 project. At the end it also
   needs a project card on my website."

Outcome: revised proposal (2D first, remains and archive as the core, eight
build steps), then steps 1 and 2 of the engine: organisms, food, energy, death,
reproduction, mutation, a seeded PRNG, tests and a parameter sweep.

## 2026-11-24 — step 3

6. "Write it straight onto my computer."
7. "Where is the picture?"
8. "I see it, no problems, continue."

Outcome: trail field in the engine (deposit, diffusion, decay, forward
sensing), a WebGL2 renderer with hand-written shaders replacing the Canvas
debug view, a memory view toggle, and five new tests.

## 2026-11-24 — step 4

9. "Continue."

Outcome: remains (one record per death), gene pull towards nearby remains with
an influence count that separates kin from strangers, fertile ground, revival
from remains, remains drawn in the ground, eight new tests and the control
experiment script.

## 2026-11-25 — step 5

10. "It should connect now, go ahead."

Outcome: step 4 written to disk and checked in the browser; Genesis panel
(five traits with trade-offs, live line-drawn body preview), placement on the
ground with a readout of who lies beneath, and markers that follow the
visitor's own lifeforms through life and death.

## 2026-11-25 — making place matter

11. "Create it." (the git repository)
12. "And that round of experiments can be done."

Outcome: first commit. Then the experiment: found that mobility, not the pull,
was why the world had no regions; added a home pull so organisms range around
their birthplace; added the stranger experiment showing that descendants of a
transplanted genome move towards the local dead only when the pull is on.

## 2026-11-25 — step 6

13. "Continue."

Outcome: every organism records its path; remains keep parent, birth, cause
and path; archive specimen page with its own address, lineage links and a
range map; the world is saved in the browser and catches up on return.
