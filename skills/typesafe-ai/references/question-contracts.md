# Production question contracts

A question contract records one semantic judgment together with the context it may use, the meaning of its answer, the code that consumes it, and the cases that establish useful behavior. The SDK question object is its runtime projection, not the complete contract.

## Define the contract

Record:

- the judgment and chosen primitive;
- state fields supplied to Jev and relevant fields deliberately withheld;
- what each outcome, option, level, probability, and confidence value means;
- the consuming branch, ranking, display, stored signal, or escalation path;
- the costs of false positives, false negatives, and uncertain automatic action;
- representative and boundary calibration cases.

Omit a question that has no current consumer. Keep the contract near its owning code or tests. Question IDs are code identifiers and are not sent to Jev, so the instructions must carry the complete meaning.

## Decompose deliberately

Split a proposed question when two subanswers can vary independently or require different evidence, criteria, thresholds, weights, or downstream actions. If one part is deterministic, keep it in code and ask Jev only for the semantic remainder.

Atomic means one independently answerable semantic axis, not one sentence or state field. Preserve a question when the relationship itself is the judgment, such as whether one statement contradicts another, two records identify the same entity, or evidence supports a claim. Splitting those comparisons would destroy their meaning.

Each resulting answer must be independently interpretable. Two questions justify separate existence only when a realistic input can produce different answers and that difference changes interpretation or downstream behavior; merge duplicates.

## Bound the context

Supply current evidence relevant to the judgment. Distinguish observations from prior inferences, retrieve exact facts in code, and do not include private or unrelated context as insurance against an underspecified question. Record intentionally withheld fields when their absence protects privacy or prevents irrelevant influence.

For selection questions, ensure the candidate set covers every value Jev is expected to choose. Do not encode the desired application outcome as evidence that the semantic condition is true.

## Calibrate supported behavior

Exercise the production model version with cases covering:

- clear positive and negative examples;
- boundaries between adjacent options or levels;
- missing, contradictory, and irrelevant evidence;
- every meaningful downstream branch;
- realistic cases that distinguish similar questions.

Assert the classification, selected option, score region, or downstream behavior the application needs rather than an exact probability. Test composed behavior as well as isolated answers, including that speculative answers are ignored on unused branches.

When a case fails, inspect the state boundary, question meaning, candidate coverage, answer distribution, composition policy, and expected behavior separately. Change wording or criteria only when the contract was unclear or evidence shows the revision performs better; higher confidence alone is not proof of improvement.
