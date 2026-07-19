# Glossary: Building Great Skills

This glossary defines the vocabulary for [writing-great-skills](SKILL.md).
The terms describe how a skill produces **Predictability**.

The terms are grouped by four subjects:

- **Invocation**: How the agent or user reaches a skill.
- **Information Hierarchy**: Where the skill keeps each type of information.
- **Steering**: How the skill changes agent behavior.
- **Pruning**: How maintainers keep the skill relevant and compact.

A term marked _Failure mode_ identifies behavior that reduces predictability.
Bold terms in a definition are also defined in this glossary.

## Predictability

The degree to which a skill makes an agent follow the same process on each run.
Predictability applies to the process, not to identical output.
For example, a brainstorming skill can predictably produce different ideas.

Every other term in this glossary supports predictability.

_Avoid_: consistency, reliability, robustness, output-determinism.

## Invocation

Invocation defines how a skill is reached and which load the choice creates.

### Model-Invoked

A skill whose **Description** is visible to the agent.
The agent can invoke the skill when a task matches the description.
The user can also invoke it by name.
Other skills can reach it because the agent can see its description.

A model-invoked skill adds permanent **Context Load**.
Use this mode when the agent or another skill must reach the skill without user action.
A reference-only model-invoked skill can also provide one shared source for reference that multiple skills must reach.

_Avoid_: ability, tool, capability.

### User-Invoked

A skill that has `disable-model-invocation: true`.
Only the user can invoke it by name.
The skill adds no context load because its description is hidden from the agent.

A user-invoked skill adds **Cognitive Load** because the user must remember when to invoke it.
Use this mode when explicit user choice is part of the behavior.

_Avoid_: procedure, workflow, command.

### Description

The machine-readable trigger for a model-invoked skill.
The agent can see the description when `disable-model-invocation` is absent.
The agent cannot see it when `disable-model-invocation: true`.
Its wording determines when the agent invokes a model-invoked skill.

A description is the top-level **Context Pointer** and the source of a model-invoked skill's **Context Load**.

_Avoid_: frontmatter, summary.

### Context Pointer

Text that names out-of-context material and states when the agent must load it.
A skill description points from the agent context to a skill.
A Markdown link with an explicit condition can point from `SKILL.md` to disclosed reference material.

The wording determines whether the agent loads the target at the correct time.
If required material loads unreliably, make the condition more explicit.
Keep the material inline when a precise pointer remains unreliable.

_Avoid_: link, reference, import.

### Context Load

The permanent agent-context cost of a model-invoked skill.
The skill description consumes tokens and attention on every turn.

Context load limits how many model-invoked skills should exist.

_Avoid_: token cost, context bloat.

### Cognitive Load

The memory and decision cost that a user-invoked skill places on the user.
The user must remember that the skill exists and when to invoke it.

Cognitive load preserves explicit user control.
Use it where user judgment is required.
Reduce it with a **Router Skill** when the skill set becomes difficult to remember.

_Avoid_: human index, burden, overhead.

### Router Skill

A user-invoked skill that names other user-invoked skills and their invocation conditions.
It gives the user one entry point for finding several skills.

A router can recommend another user-invoked skill.
It cannot invoke that skill for the user because the target has no visible description.

_Avoid_: dispatcher, menu, registry, index, router procedure.

### Granularity

The degree to which capabilities are divided among skills.
Each split adds either context load or cognitive load.

Split by invocation when a distinct **Leading Word** must trigger a model-invoked skill independently or another skill must reach it.
Split by sequence when visible **Post-Completion Steps** cause observed **Premature Completion**.

A sequence split must create a real context boundary.
An inline skill call does not hide later steps that remain in the same context.

_Avoid_: chunking, modularity.

## Information Hierarchy

Information hierarchy ranks skill content by when the agent needs it.

### Information Hierarchy

The ordered placement of **Steps** and **Reference**:

1. In-skill **Steps**.
2. In-skill **Reference**.
3. Disclosed or external **Reference** behind a **Context Pointer**.

A skill can contain only steps, only reference, or both.
When a skill has steps, unrelated reference can hide the current action and weaken attention.
Keep immediately required content at the top of the hierarchy.

_Avoid_: structure, organization, layout.

### Steps

Ordered actions that the agent performs.
Each step ends with a **Completion Criterion**.
Steps are the primary content when a skill defines a sequence.

A skill that contains only reference does not require artificial steps.

_Avoid_: workflow, instructions, choreography.

### Reference

Definitions, rules, facts, parameters, examples, and conditional guidance that the agent consults as required.
Reference can remain in `SKILL.md`, move to a disclosed file, or live outside the skill.

Move reference only when a reliable context pointer can load it at the correct time.

_Avoid_: supporting material, docs, background.

### Disclosed Reference

Skill-specific **Reference** in a sibling file behind a **Context Pointer**.
Use disclosed reference when only some branches need the material.
The file remains part of the skill package.

_Avoid_: supporting file, appendix.

### External Reference

Reference that lives outside the skill system.
It has no description and no steps.
Any skill can point to it.

Use external reference for shared material that does not need independent invocation.
It is also the shared reference option for two user-invoked skills.

_Avoid_: doc, resource, knowledge base.

### Progressive Disclosure

The movement of reference from `SKILL.md` to a file behind a context pointer.
Progressive disclosure keeps the primary information hierarchy legible.

Use branching as the placement test:

- Keep material inline when every branch needs it.
- Disclose material when only some branches need it.
- Strengthen an unreliable pointer before moving required material back inline.

Progressive disclosure controls attention as well as token use.

_Avoid_: lazy loading, chunking.

### Co-location

The placement of a concept's definition, rules, and exceptions under one heading.
Co-location ensures that reading one part exposes the related parts.

Information hierarchy determines how far from the main skill the material lives.
Co-location determines what material stays together at that location.

_Avoid_: grouping, clustering, cohesion.

### Sprawl

_Failure mode._
A skill is too long, regardless of why the content accumulated.
Even active and unique content can create sprawl.
Sprawl reduces readability, maintainability, and available context.

Use the information hierarchy to reduce sprawl.
Disclose reference and split genuine branches or sequences.

Sprawl differs from **Sediment**, which identifies stale content, and **Duplication**, which identifies repeated meaning.

_Avoid_: bloat, length, size, verbosity.

## Steering

Steering contains the controls that make agent behavior predictable.

### Branch

A distinct invocation case that requires a different path through the skill.
A linear skill has no branches.
A skill can have several branches even when it shares some steps between them.

_Avoid_: path, case, fork.

### Leading Word

A compact concept that already has a strong meaning for the model.
The model uses this term to organize related behavior.
Examples include _lesson_, _proximal zone of development_, _fog of war_, and _tracer bullet_.

A leading word can improve execution and invocation:

- In the body, it anchors the same behavior wherever the term appears.
- In the description, it connects user language to the skill trigger.

Prefer an established term when it expresses the required behavior precisely.
A new term requires more definition because it has no pretrained meaning.
Repeat the term when repetition strengthens its intended meaning.
Repeat the term, not its complete definition.

_Avoid_: keyword, term, motif.

### Completion Criterion

The condition that tells the agent whether a unit of work is complete.
A completion criterion has two important properties.

**Clarity** makes completion checkable.
A precise criterion resists **Premature Completion**.

**Demand** determines the required **Legwork**.
An exhaustive criterion requires the agent to cover every applicable item.
Demand also applies to reference-only skills.

_Avoid_: done condition, exit condition, stopping rule.

### Legwork

The investigation and execution that the agent performs inside one step.
Legwork includes reading files, gathering evidence, and verifying the result.

A strong leading word or demanding completion criterion can increase legwork.
Premature completion can interrupt it.
A reference-only skill can also require substantial legwork through an exhaustive criterion.

_Avoid_: scope, effort, diligence, coverage.

### Post-Completion Steps

The steps that follow the current step.
Visible later steps can pull attention away from the current completion criterion.
This pull can cause premature completion when the current criterion is vague.

_Avoid_: horizon, fog of war, lookahead.

### Premature Completion

_Failure mode._
The agent ends a step before it satisfies the completion criterion because attention moves to later steps.

Premature completion requires both:

- A completion criterion that does not provide a clear stopping boundary.
- Visible post-completion steps that pull attention forward.

Make the completion criterion precise first.
If the criterion cannot become precise and the failure is observed, hide later steps behind a real context boundary.

Thin legwork can occur without premature completion.
The distinction is whether the agent ended a step early or completed a weakly demanding step.

_Avoid_: premature closure, the rush, rushing, shortcutting.

### Negation

_Failure mode._
A prohibition names the prohibited behavior and can make it more available in context.
For example, `never write verbose comments` activates the concept of verbose comments.

State the supported behavior directly, such as `write one-line comments`.
Use a prohibition only for a hard guardrail that requires explicit exclusion.
Pair the prohibition with the supported behavior.

The leading word for this failure is the _elephant_: the behavior that the prohibition makes salient.

_Avoid_: ironic rebound, don't-prompting, the pink elephant.

## Pruning

Pruning keeps each line relevant and each meaning authoritative in one place.

### Single Source of Truth

The state in which each meaning has one authoritative location.
A behavioral change requires one edit at that location.

**Duplication** violates the single source of truth.

_Avoid_: home, canonical location.

### Duplication

_Failure mode._
The same meaning has more than one authoritative location.
Duplication increases maintenance cost, token use, and unintended emphasis.

A **Leading Word** can repeat intentionally without duplicating its complete meaning.

_Avoid_: repetition, redundancy.

### Relevance

The degree to which a line bears on the skill's current task.
A line loses relevance when it does not concern the task or becomes obsolete.

Relevance differs from **No-Op**.
A relevant sentence can concern the task but still fail to change behavior from the model default.

_Avoid_: load-bearing, staleness, freshness.

### Sediment

_Failure mode._
Stale or irrelevant content that accumulates because additions are easier than removals.
Sediment is the expected result when maintainers do not review relevance.

Remove sediment when the behavior or environment changes.

_Avoid_: accretion, bloat, cruft, rot.

### No-Op

_Failure mode._
An instruction that does not change agent behavior from the default behavior.
It consumes context without improving predictability.

Apply this test to each sentence:

> Does this sentence change behavior from the default?

Delete a sentence that fails the test.
A weak leading word can also be a no-op.
Replace it with a stronger behavioral control only when the stronger control changes behavior.

No-op is a model-relative judgment.
Test disputed cases by running the skill and observing behavior.

_Avoid_: redundant instruction, restating the obvious, belaboring.
