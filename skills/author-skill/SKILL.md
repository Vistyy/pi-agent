---
name: author-skill
description: >-
  Use when creating a new Pi skill or substantively revising a skill's routing
  description, instructions, or bundled resources. Define its purpose and
  boundaries, write usable guidance, validate native loading, and check it on
  real tasks. Not for ordinary documentation or AGENTS.md cleanup.
---

# Author a skill

Create instructions another agent can use without this conversation. A valid Markdown file is not enough: the skill must be discoverable when needed and useful after loading.

Use this workflow for skill instructions and packaging. A project-specific verification skill also needs investigation of the actual app and a working harness.

## 1. Establish the job

Start with the request, current files, actual examples, and observed problems. Use information already available before asking questions. Ask the user about unresolved goals, preferences, or missing context, not facts you can inspect.

Identify:

- The capability the skill adds and the inputs and outputs a caller needs.
- Concrete requests it should handle, including distinct cases rather than synonyms for the same case.
- Nearby requests it should leave to another skill or the ordinary agent workflow.
- Observable success criteria, required tools, and any side effects or permission boundaries.

For an existing skill, preserve its identity and invocation policy unless changing them is part of the request. Capture its current behavior and relevant files before editing. Fix the reported problem without assuming the whole skill needs rewriting.

For a direct source port, read the source and declare the intended adaptations. Preserve material outside those adaptations. For an original synthesis, identify the guidance actually used without claiming full-source fidelity.

Finish when the job, inputs, expected outputs, supported cases, and nearby excluded requests are identified from the actual requirements.

## 2. Choose the resource and routing

Check whether an existing skill is the right home. A repeated short prompt may need a prompt template instead. New executable tools or lifecycle hooks need an integration, not instructions pretending the capability already exists.

Choose model invocation when the agent should select the skill during normal work. Choose explicit-only invocation when the user should decide when to run it. Read [Pi mechanics](references/pi-mechanics.md) when creating a skill or changing names, frontmatter, invocation policy, placement, or discovery.

Write a concise description that states the job and its distinct trigger cases. Put discovery criteria in the description, not solely in the body that is loaded afterward. Include a boundary when a plausible neighboring request would otherwise select the wrong skill. Avoid keyword lists that broaden the job beyond its intended scope.

Review the description against the concrete requests and near misses. This review checks whether the wording fits; it does not demonstrate automatic selection by a model.

Finish when the resource and name avoid existing collisions, the invocation policy is deliberate, and the description covers supported cases without claiming the near misses.

## 3. Write the instructions and resources

Choose ordered steps, consulted reference, or both. For steps, state the required action and a checkable completion condition at important boundaries. For reference, state which rules or cases apply rather than requiring every rule on every task.

- Keep instructions needed by all cases in the main file. Move case-specific details into references with explicit conditions for reading them.
- Keep a concept's definition, conditions, and exceptions together. Preserve conditions when splitting or shortening instructions.
- Give each meaning one authoritative home. Link to existing skills and structural sources rather than copying their rules, configuration, or commands.
- Prefer direct actions and positive target behavior. Keep explicit restrictions where safety or correctness requires them.
- Explain a reason when it changes a decision or prevents misuse. Omit explanations that only repeat the instruction.
- Match precision to the task: permit judgment where valid approaches vary; specify exact sequences or tested scripts where operations are fragile.
- Add examples that clarify a real ambiguity. Cover different cases without turning one example into a universal rule.
- Add scripts for repeated work or deterministic operations, references for consulted knowledge, and assets for output material. Create only resources the workflow actually needs.

For helpers, show the invocation, inputs, expected outputs, prerequisites, and cleanup responsibilities. Read unfamiliar source instructions and scripts before incorporating or running them. Keep permissions and side effects consistent with the job described to the user.

Trace each supported case through the draft. Confirm its inputs, decisions or actions, referenced resources, and expected result are specified, with no unresolved placeholders or dependence on this chat.

## 4. Validate the real package

Use the native checks in [Pi mechanics](references/pi-mechanics.md). Inspect the actual files, referenced resources, and discovery diagnostics. Verify the description advertised to the model and delivery through `/skill:<name>` separately.

Run changed helpers through their supported interfaces and inspect their real outputs and side effects. Use the repository's verification guidance and independent expected results. Test a structural contract when something actually depends on it; do not pin incidental prose just to make a test pass.

Remove unused placeholders and check that packaging does not introduce unrelated changes. For direct ports, compare the result with the source outside the declared adaptations.

Finish when native loading, resource references, and affected helpers are verified, or the blocked checks are explicitly reported. These checks establish packaging, not instruction quality or improved triggering.

## 5. Exercise and revise

Use an authorized real task representing an intended case. Start with explicit invocation to check execution; check unprompted selection separately if that outcome matters. Add a relevant boundary or failure case when it can be exercised safely. Reuse available verification tools rather than building a benchmark framework by default.

Inspect the produced artifact or resulting state, not merely the agent's summary. Review the execution record when a skipped step, unnecessary work, or routing problem needs explanation. Use observable checks for objective outputs and human review for subjective qualities.

Revise from actual failures and feedback. Fix the general cause without tailoring the skill only to the prompts used. Bundle repeated helpers when observed use justifies them. Remove redundant instructions; treat claims that a rule is a no-op as unproven unless behavior has been compared.

Single-agent execution is a useful sanity check, not an independent comparison. Report what was exercised, what was only reviewed, and what remains untested. Do not present self-review, command expansion, or a simulated model as evidence that a new skill improves model performance.

Additional model runs, independent comparisons, paid services, or external actions require the appropriate authorization. If a meaningful trial cannot run within scope, leave the quality claim open rather than fabricating evidence.

Finish with the implemented files, important design choices, verification evidence, and remaining limits. Commit or publish only through the agreed workflow.
