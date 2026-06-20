# Small-cluster memory maintainer design

## Goal

Keep active reflection memory compact through small, automatic background maintenance instead of normal big-bang rewrite.

Normal path:

```text
observer -> reflector -> active reflections
                 \
                  -> background maintainer every X new reflections
```

The maintainer is local memory hygiene. It is not a global rewrite agent.

## V1 scope

Run maintenance after a simple threshold:

```text
every 10 new reflections recorded -> enqueue one maintainer run
```

The exact threshold is config, but the first policy should be count-based rather than semantic.

V1 deliberately avoids:

- tags/topics
- pure deletion
- observation input
- semantic search
- multi-cluster planning
- a separate audit summary field
- synchronous compaction work

## Maintainer responsibilities

Given a bounded cluster of active reflections, the maintainer may:

1. Merge duplicate or near-duplicate reflections.
2. Combine local stale/current pairs into one current reflection that names the relationship when needed.
3. Compress completed local implementation trail into a durable current outcome.
4. No-op when no safe improvement exists.

It must not:

- reconsider all active memory
- retire reflections outside its input cluster
- invent facts
- flatten provenance
- optimize for minimum count over correctness
- create vague meta summaries
- delete a reflection without replacement in v1

## Input

V1 input should be small and deterministic:

```text
recent active reflections window
```

Initial cluster selection can be newest-N only. Source-overlap, ancestry-aware selection, or topic routing can come later if evals show newest-N is insufficient.

Do not include observations in maintainer input by default. If exact evidence is needed later, recall traversal can recover it from parent refs.

## Tool contract

Minimal tool:

```ts
record_maintenance({
  retireReflectionIds: string[];
  reflections: Array<{
    content: string;
    sources: string[];
  }>;
})
```

No-op:

```ts
record_maintenance({ retireReflectionIds: [], reflections: [] })
```

Validation rules:

- `retireReflectionIds` must be active reflection ids from the maintainer input.
- New reflection sources must be valid ids from the maintainer input.
- Replacement reflections should cite direct parent `ref_*` ids.
- Do not copy transitive `obs_*` ancestry from parent refs into replacements.
- Every retired ref must be covered by at least one replacement in v1.
- Cap retired refs and new refs per run.
- Invalid output no-ops and retires nothing.

## Direct-parent provenance

Maintainer replacements cite immediate parents only:

```text
ref_new.sources = [ref_old_a, ref_old_b]
```

Not flattened ancestry:

```text
ref_new.sources != [ref_old_a, ref_old_b, obs_1, obs_2, obs_3]
```

This keeps source lists bounded. Recall handles depth:

```text
ref_new -> ref_old_a -> obs_1 -> source entry
```

Reflector-created new facts may still cite direct `obs_*` observations, because those observations are the direct evidence.

## Budget behavior

Soft budget:

```text
enqueue maintainer
```

Hard budget:

```text
run bounded background maintainer bursts
```

If maintainer cannot recover the budget, an automatic emergency fallback is still an open design decision. Options include:

- keep current global rewrite as rare background emergency
- temporary projection cap without retiring hidden refs
- stricter maintainer burst policy

Do not run maintenance or global rewrite synchronously inside compaction.

## Evals

Primary maintainer evals should be local:

- duplicate local merge
- stale/current local replacement
- completed-trail compression
- no-op for unrelated cluster
- direct-parent provenance
- blast-radius guard for retire ids
- repeated maintainer burst preserving anchors while reducing count/tokens

Current global rewrite evals should become emergency/stress coverage if global rewrite remains.
