---
name: jev-question-design
description: Adds project-owned design and review of Jev question contracts alongside the vendored typesafe-ai skill, including state boundaries, primitives, criteria, downstream policy, and calibration. Use whenever creating, changing, or auditing TypeSafe/Jev questions, even when typesafe-ai also applies. Skip routine SDK integration and use of already-settled questions.
---

# Design Jev question contracts

A Jev question contract defines one semantic judgment together with the state it may use, the meaning of its answer, how code consumes that answer, and the cases that establish whether it is useful. The SDK question object is only its runtime projection.

Before creating, changing, or auditing a question contract, read the vendored [TypeSafe skill](../typesafe-ai/SKILL.md) and the live TypeSafe pages it identifies for the relevant primitive. Treat those upstream sources as authoritative for current model and API behavior. This skill owns the local design and verification discipline around them.

## Justify the judgment

Keep exact rules, arithmetic, schema checks, string matching, known lookups, control flow, and side effects in code. Use Jev only when the required answer depends on semantic interpretation of natural language or application state.

Name the observable decision that will consume the answer. Do not add a question merely because its result might be interesting. If no current branch, ranking, display, escalation, or stored signal uses it, omit it.

## Define the contract before tuning wording

For each question, establish:

- **Judgment:** the single proposition or dimension being evaluated.
- **Primitive:** Noul, Choice, or Score, chosen by the answer meaning the consumer needs.
- **State boundary:** fields supplied to Jev and relevant fields deliberately withheld.
- **Answer meaning:** what each outcome, option, level, probability, and confidence value does and does not mean.
- **Consumption policy:** which code path uses the answer, including unused branches and uncertainty handling.
- **Error costs:** the consequences of false positives, false negatives, and uncertain automatic action.
- **Calibration cases:** representative and boundary inputs with expected outcomes justified by application behavior.

Keep this contract near the owning code or tests. Do not rely on a question ID to carry meaning: IDs are for code and are not sent to Jev.

## Decompose the judgment

Split a proposed question when two subanswers can vary independently or when they require different evidence, criteria, thresholds, weights, or downstream actions. If one part is deterministic and another requires semantic interpretation, keep the deterministic part in code and ask Jev only for the semantic remainder.

Atomic means one independently answerable semantic axis, not one sentence or one state field. Keep a question whole when the relationship itself is the judgment, such as whether one statement contradicts another, two records refer to the same entity, or evidence supports a claim. Splitting those comparisons would destroy the meaning being evaluated.

Each resulting question must have an independently interpretable answer. Batch decomposed questions when they share state and do not depend on one another; use a later request only for a true data or candidate dependency.

## Bound the state

Supply the current facts, source text, candidate values, relationships, and policies needed for the judgment. Prefer named JSON fields when the state has multiple parts, and reference nested values explicitly with backticked paths such as `ticket.messages[0].text`.

Include only evidence relevant to the questions in the request. Distinguish observations from prior inferences. Do not ask Jev to reconstruct current facts that code can retrieve exactly, and do not include private or unrelated context as insurance against an underspecified question.

For selection questions, ensure the candidate set covers every value the model is expected to choose. Record intentionally withheld fields when their absence protects privacy or prevents irrelevant context from influencing the judgment.

## Match the primitive to the answer

### Noul

Use a Noul for one yes-or-no proposition when the probability of yes is the useful signal. Phrase it so higher values consistently mean stronger probability that the named condition holds. Add `true` and `false` criteria when the boundary needs clarification.

Do not collapse independently variable conditions into one Noul. Replace “Is the customer angry and requesting a refund?” with separate questions about hostile tone and a refund request, then combine them in code. A value near 0.5 means yes and no have similar probability; it does not represent medium intensity.

### Choice

Use a Choice for one selection from a defined, unordered set. Describe options so their boundaries are distinguishable, including relevant inclusions and exclusions. Include `other` or `none` when the supplied set may not cover the state.

The selected option is the highest-probability candidate, not proof that the option is correct or that the set was complete. Inspect the distribution and confidence when close alternatives change behavior.

### Score

Use a Score for one ordered dimension whose levels can be described as concrete situations. Every level must stand alone because Jev evaluates its description without seeing a level number or relying on adjacent wording. Avoid labels such as “moderate” or “worse than the previous level” unless the description itself defines the situation.

Use only as many levels as can be distinguished meaningfully. Split punctuality, expertise, and communication into separate Scores rather than averaging unrelated properties inside one question. The returned score is a probability-weighted position across levels; inspect its distribution and confidence because different distributions can produce the same score.

## Write complete questions and criteria

State the full judgment in `instructions`; do not depend on the ID, caller name, or downstream code to complete it. Name the relevant state paths and define vague terms at the boundary where they matter.

Start with strings. Use structured instructions or criteria when named fields make multiple definitions, exclusions, examples, or code-supplied values easier to compare. Structure should expose meaning, not compensate for several judgments hidden in one question.

Criteria define answer boundaries. Make each Choice option or Score level independently understandable. For Noul criteria, describe both true and false when either side would otherwise remain ambiguous. Do not encode the desired application outcome as evidence that the semantic condition is true.

## Compose questions in code

Ask independent questions over the same state in one request, including useful speculative questions. State any speculative premise explicitly, and consume that answer only on the applicable branch.

Questions in one request cannot see one another's answers. Make a later request only when an earlier result is required to fetch evidence, construct new state, or determine the next candidate set. Keep weighting, suppression, dependencies, thresholds, and side effects in deterministic code.

Two questions justify separate existence only when a realistic input can produce different answers and that difference changes interpretation or downstream behavior. Merge duplicates.

## Turn uncertainty into policy

Preserve raw answers and probability distributions so policy can change without rerunning unchanged judgments. Choose thresholds from observed performance and the costs of each error, not from a universal default.

Choice and Score confidence describe concentration of their distributions, not truth, workflow correctness, or permission to act. A Noul has no separate confidence value. Route uncertain cases to an explicit fallback, review, or no-action path. For consequential automatic action, define an explicit policy justified by observed performance and error costs.

## Calibrate the supported behavior

Exercise each contract against the model version used in production with cases that cover:

- clear positive and negative examples;
- boundaries between adjacent options or levels;
- missing, contradictory, and irrelevant evidence;
- each meaningful downstream branch;
- realistic cases that distinguish similar questions.

Assert the classification, selected option, level region, or downstream behavior the application needs rather than an exact probability unless that exact value is itself contractual. Test composed application behavior as well as isolated answers, including that speculative answers are ignored on unused branches.

When a case fails, inspect the state boundary, question meaning, candidate coverage, answer distribution, composition policy, and expected behavior separately. Change wording or criteria only when the contract was unclear or evidence shows the revised question performs better. Higher confidence alone is not proof of improvement.
