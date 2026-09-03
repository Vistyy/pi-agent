# Create-verification pilot

## Decision

Do not admit the exact P-Stack `create-verification-skill` to the portfolio from this case.
Both models produced acceptable project-local verification skills without it, while the valid treatments increased total processed tokens, cost, duration, and turns.
The treatment generated broader structure, but the controls more directly exercised an installed `by` executable and preserved sufficient evidence.
This decision could change if a maintenance case shows that the treatment's extra structure materially improves later work.

## Valid crossed comparison

| Model | Condition | Deterministic result | Fresh tokens | Total tokens | Recorded cost | Duration | Turns |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| Luna high | Control | Pass | 161,266 | 2,961,394 | $0.1108 | 563.9 s | 36 |
| Luna high | P-Stack treatment | Pass | 156,067 | 3,840,419 | $0.1290 | 668.7 s | 52 |
| Sol high | Control | Pass | 160,820 | 974,644 | $1.6140 | 406.8 s | 19 |
| Sol high | P-Stack treatment | Pass | 155,813 | 3,743,781 | $3.3644 | 716.4 s | 43 |

The Luna treatment used 3.2% fewer fresh tokens but 29.7% more total tokens, cost 16.5% more, took 18.6% longer, and used 44.4% more turns.
The Sol treatment used 3.1% fewer fresh tokens but 284.1% more total tokens, cost 108.5% more, took 76.1% longer, and used 126.3% more turns.

## Behavioral observations

All four valid outputs created one discoverable skill, included a seeded feature map, documented disposable state and cleanup, exercised the CLI end to end, preserved successful evidence, and left product code unchanged.
The Luna control invoked the installed `by` directly in a disposable repository.
The Sol control installed the Candidate package into a disposable prefix and invoked its installed `by` binary.
The treatments created larger feature hierarchies and reusable helpers.
The valid Luna treatment invoked `node dist/main.js` directly and provided weaker environment isolation and cleanup evidence than its control.
The valid Sol treatment added a tmux-based runner and extensive feature hierarchy, but this complexity did not establish behavior that the simpler control failed to establish in the pilot.

## Invalid trials and harness correction

Three early treatment trials are excluded because Pi received `/skill:create-verification-skill` as plain prompt text instead of expanding the skill.
The original runner used print mode or separated the skill command from its arguments with a newline.
Pi's command parser requires `/skill:name args` with a space, and RPC mode performs the supported expansion.
The corrected runner now preflights command registration and requires the first persisted user message to contain the exact expanded skill marker.

## Semantic judge status

The first blinded semantic judgment is not accepted as evidence.
It claimed that one candidate's mapped feature files were absent even though all five supplied feature files were present in the judge packet.
This contradiction shows that the judge output needs artifact-inventory validity checks before semantic judgments can affect admission decisions.

## Evidence locations

- Luna control: `eval/runs/but-why-create-verification-20260903T080841205Z/alder-3caa6c`
- Luna treatment: `eval/runs/but-why-create-verification-20260903T092039373Z/alder-1366f1`
- Sol control: `eval/runs/but-why-create-verification-20260903T082555059Z/birch-7fe9a4`
- Sol treatment: `eval/runs/but-why-create-verification-20260903T090516955Z/alder-4277f6`
- Rejected blinded judgment: `eval/runs/pilot-semantic-judge-20260903T093338Z`

Raw run artifacts are intentionally ignored by Git.
