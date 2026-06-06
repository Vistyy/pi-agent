# Observational Memory evals

Small eval fixtures for comparing memory strategies on quality and cost.

Run fixture metadata/context estimates:

```bash
npm run eval:fixture -- exact-detail-collision
```

Score an answer:

```bash
npm run eval:fixture -- exact-detail-collision /path/to/answer.txt
```

## Current fixture

`exact-detail-collision` tests exact-detail retention with many near-duplicate migration facts.

Good answer must include exactly:

- `2026-05-17T03:20:00Z`
- `/mnt/atlas-blue`
- `7432`

It is penalized for distractors such as `/mnt/attlas-blue`, `/mnt/atlas_blue`, `7342`, `7433`, or nearby timestamps.

## Cost fields

The runner reports rough `chars/4` token estimates:

- `transcriptTokens`: raw source cost pressure
- `questionTokens`: final ask cost
- `contextTokenEstimates.defaultOnly`: lossy Pi summary baseline prompt
- `contextTokenEstimates.additive`: Pi summary + OM patch prompt
- `contextTokenEstimates.replacement`: OM replacement summary prompt

These are not provider bills. They are comparable local estimates for cost/performance tracking.
