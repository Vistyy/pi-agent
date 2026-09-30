---
name: blast-radius
description: >-
  Use for "blast radius of X", "what could this break", or reviewing a change
  whose effects beyond the diff are uncertain. Trace downstream contracts,
  lifecycle timing, and pinned dependencies, then test the safety-critical
  assumptions against real code. Report confirmed, cleared, and unproven risks.
---

# Blast radius

Find what a change could break somewhere else, before it ships. Investigate directly in the main agent; this is change-impact analysis, not an independent second opinion or a mandatory phase of every edit.

How explains current behavior; Why investigates historical rationale. Blast Radius investigates unintended effects. Listing callers is not the job: look for breakage that a symbol search cannot reveal.

Do not apply fixes or publish findings as part of the investigation. Scratch scripts or tests may be written to prove behavior without changing product code.

## 1. Read the change

Read the diff, the symbols it adds, changes, or deletes, and what now behaves differently, including effects the diff does not spell out. Establish the intended behavior and constraints from the task and surrounding code.

For commit and review context, use the code-anchor step in [Why](../why/SKILL.md). A full historical-rationale investigation is only needed when that question matters to the change.

## 2. Find the safety-critical assumptions

Find the one or two facts the main risks depend on, such as "this call only drops already-dead cache entries and does nothing else." If that fact holds, it may clear several risky cases at once. Spend time proving it rather than writing a long list of maybes.

Do not force unrelated risks under one assumption. A proven fact clears only the failure paths it actually rules out, not the whole change.

## 3. Look where grep stops

Read the source of the library being called, check its pinned version and any local patch, and trace the actual behavior rather than trusting the API name.

Work out when things run: microtasks, unmount, teardown, and framework-specific lifecycle behavior. Follow contracts a symbol search misses: JSON returned by an API, a database column, a wire format, another language reading the same bytes, a feature flag, or code several hops downstream.

## 4. Check and classify risks

For each risk, trace how the failure could happen, its prerequisites, its likelihood, and its cost. Ground that assessment in actual consumers and behavior; say when likelihood or impact is unknown rather than inventing precision.

Keep confirmed risks and checked-and-cleared risks separate. Mark plausible but unproven concerns as unproven, not confirmed defects. Cite real `file:line` locations or dependency source. A search that returned nothing is evidence about that search, not proof that no consumer exists. Never invent a caller or API.

## 5. Prove the important facts

A convincing writeup is not proof. Write a script or test that exercises the real code, run it, and show what happened. Usually this is a small script importing the same pinned library the app ships and calling the exact function under question. Use the project's verification rules for affected user workflows; do not substitute a library-only check for required app-level evidence.

For each safety-critical fact, state how far the evidence got:

1. **Claimed.** You said so. Worthless on its own.
2. **Located.** A real `file:line`, or the library's own source.
3. **Traced.** You walked the failure path and showed why it cannot reach the bad case.
4. **Executed.** A script or test calls the real code and fails loudly if the assumption is wrong.
5. **Observed in the app.** You reproduced the relevant behavior in the running application.

Report where verification stopped and why. If you could not prove a fact, write **unproven**. Do not present your own reassessment as an independent review.

## What to hand back

- **What changed.** Include the effects that are not obvious from the diff.
- **Safety-critical facts.** State each assumption, its evidence level, the actual proof and result, or **unproven**.
- **Confirmed risks.** Failure mechanism, source location, grounded likelihood and impact, and the check or reproduction.
- **Cleared risks.** What was checked and which evidence rules it out.
- **Unresolved concerns.** Missing evidence, access limits, untested paths, and what would resolve them.
- **Before merging.** The cheapest checks that catch the material failure cases, including runnable proof artifacts.

Keep the report plain and focused. Strip private information before any public use; this skill does not authorize publication.
