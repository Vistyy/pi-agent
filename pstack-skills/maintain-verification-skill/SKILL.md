---
name: maintain-verification-skill
description: >-
  Use for "audit the verify skill", /skill:maintain-verification-skill, or keeping
  a project's verification skill and feature map current. Trace every mapped
  feature from source, exercise every feature live, and correct only proven
  documentation or harness drift. Report product regressions without changing
  product code, and make blocked coverage explicit.
---

# Maintain a verification skill

Keep an existing project's verification skill and feature map honest as the app changes. Conduct the source inspection, live driving, and corrections directly in the main agent.

The unit of rigor is the feature, not every sentence: cover every feature file from source and exercise every feature live, without turning each documentation bullet into a separate verification task.

## Edit scope

Only edit the target verification skill's own directory: its `SKILL.md`, feature map, and harness scripts it owns. Never edit product code during this pass. Distinguish documentation drift from a product regression; do not rewrite the map to make broken behavior look correct.

## 1. Locate the target

Find the existing project-local verification skill with launch and drive instructions and a feature map, usually `.pi/skills/verify-*/`. If several candidates remain ambiguous, ask which one. If none exists, stop and point to [Create Verification Skill](../create-verification-skill/SKILL.md), invoked with `/skill:create-verification-skill`; do not invent a maintenance target.

Read its instructions and feature-map index before inspecting or driving the app. The target skill supplies the app-specific launch, health-check, drive, evidence, and cleanup recipes; do not replace those with generic assumptions.

## 2. Check index hygiene

Read the feature-map README and list its sibling files. Correct missing, extra, duplicate, or dead index entries. Keep this lightweight; a second generated inventory is not needed.

## 3. Trace each feature from source

Work through every feature file sequentially. For each, record:

- What the user-facing feature does.
- Its concrete source entry points.
- Likely documentation drift with source citations, or none found.
- One concise live-verification recipe.

Inspect source before treating a documentation discrepancy as proven. Source inspection alone does not replace the live pass.

## 4. Reconcile the coverage and recipes

Confirm every feature file has a source summary. Merge overlapping recipes into as few app states as practical. Spot-check cited drift; do not re-prove clean source claims unnecessarily.

Sweep recent changes for user-facing surfaces missing from the map. Require a concrete source path before calling a feature missing. Add proven missing features under the edit scope and include them in source and live coverage; do not silently leave newly added entries untested.

## 5. Drive every feature live

This pass is required even when source inspection found no drift. Follow the target skill's launch model: one long-lived instance driven serially for servers and UIs, or a fresh isolated session per drive for short-lived CLIs. Exercise every mapped feature at least once.

Hold these safeguards throughout the pass, including failed attempts:

- **Check readiness.** Run the target's doctor check before the first drive, on each fresh session when sessions are the unit, and again after a failed or surprising drive. If doctor cannot detect the problem, such as a wedged UI on a healthy process, reset to a known state or relaunch instead of hoping the next action works.
- **Repair doctor drift within scope.** If the health check fails because the verification skill is stale, correct it and retry once. Restart only what the correction invalidates. If the check still fails, report the pass blocked.
- **Preserve evidence.** After every cleanup, confirm captured evidence still exists at the named location. Do not assume cleanup left it intact.
- **Clean failed residue.** Nothing a drive started should outlive its usefulness. Clean failed-attempt processes and scratch state whether the session is stuck, exited, or shared. For a shared instance, clean the residue the drive created, not the shared instance itself. Respect the target's ownership and cleanup rules.
- **Explain unreachable features.** Use `verified-unreachable` only with the concrete prerequisite, such as auth, entitlement, OS, or external state, and the actual route attempted. If the map omits that prerequisite, correct the documentation. This is not a successful execution of the feature; report the coverage limit.
- **Re-drive corrected harnesses.** Any harness fix must be exercised live before handing it back. Rebuild or restart what that fix invalidates; source inspection or compilation alone is not the re-proof.

Perform final teardown after the last drive, including re-proofs of fixes. Nothing created for the run should outlive it except the evidence, which must survive teardown at its named location.

## 6. Triage findings

- **Documentation drift:** a wrong or missing user-facing description. Correct it within the verification directory.
- **Harness gap:** working behavior the harness cannot drive. Correct the owned harness; helpers must be executable and their invocation documented. Re-drive the corrected path.
- **Product regression:** app behavior is actually broken. Report the evidence and keep product fixes out of this pass.

If the distinction remains uncertain, report that uncertainty rather than changing documentation to match a suspected regression.

## 7. Report the outcome

Read every changed verification file before handing back. Use the agreed Git workflow; this skill does not authorize commits, branches, or PR publication.

These outcomes describe the verification-skill pass, not an assurance that the product is bug-free. Report proven product regressions explicitly even if the map and harness need no correction.

Report one outcome:

- **clean:** every feature received source and live coverage; no verification-file correction is needed.
- **changed:** verified documentation, harness, or map corrections are ready. State any product regressions or coverage limits separately.
- **blocked:** required coverage could not finish or a correction could not be proved safely. Explain exactly what blocked it; do not call partial coverage clean.

Keep concise run notes in a scratch location: features covered, attempted but unreachable routes and prerequisites, confirmed drift, product regressions, proof locations, and remaining gaps. Do not commit these notes automatically. If coverage is blocked after some corrections, report blocked and list the verified corrections already made.
