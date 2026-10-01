# Complete checks and development verification

Use this when the follow-up request includes fixing or completing checks. Status-only scope inspects and reports; it does not dispatch workflows, retry runs, approve environments, or deploy.

## Inspect the actual run

Identify the required check, workflow, event/ref, tested revision, failing job, logs, dependencies, and any pending approval or development deployment. Inspect workflow definitions and called workflows at the relevant revision. Resolve the tested checkout, including PR merge refs, rather than assuming every run checks the PR head directly.

Use existing repo commands for local reproduction and the supported GitHub commands for runs. Examples after identifying the actual IDs and workflow:

```sh
gh-axi run view <run-id> --log-failed
gh-axi run watch <run-id>
gh-axi workflow view <workflow>
```

Classify from evidence: a code regression, changed caller/contract, stale or conflicting base, runner or service failure, flaky behavior, missing workflow invocation, deployment prerequisite, or approval wait. A failure in an untouched file does not establish stale base. Repeated failure does not prove flakiness impossible. Inspect revision relationships and logs instead of inferring cause from location alone.

If evidence supports a transient failure, one authorized rerun is a bounded check, not proof of the cause. Re-read results and diagnose a repeated failure before further retriggers. A supported existing-run rerun is `gh-axi run rerun <run-id>`; use job or failed-only options only when their scope is appropriate. Do not cancel other actors' runs or disable required checks to obtain a green result.

## Run required development workflows within scope

When the request authorizes the development workflow needed for verification, inspect its trigger, inputs, ref, actual environment, permissions, and all resulting effects before dispatch. The label "dev" alone does not prove the target or effects are safe. Confirm that the workflow cannot also publish or deploy to production, merge code, delete data, or change protections beyond the agreed scope. Preserve required human approvals and do not widen credentials or privileges to run untrusted PR code.

Use an explicit supported ref and required inputs rather than silently running the default branch:

```sh
gh-axi workflow run <workflow> --ref <ref> --field <key=value>
```

Dispatch may accept a mutable branch or tag rather than an immutable commit. Inspect the resulting run after dispatch. Resolve which revision was tested and which was deployed. Verify it corresponds to the intended current PR or integration revision. A completed dispatch command is not a completed deployment.

Verify the actual development target and affected workflow through the project's supported harness. Confirm the deployed revision and real readiness and artifacts, not only a green Actions job. If the workflow needs a new permission, an irreversible operation, a production effect, or a user approval, report the exact requirement and wait rather than treating babysitting as authorization.

## Interpret readiness and keep watching

Required checks can be green while reviews or environment approvals remain pending. `gh pr checks <pr> --required --watch` waits for checks, not every PR condition. After it returns, re-read current checks, reviews, blockers and mergeability. Identify cancelled, skipped or missing required checks according to actual repository rules, not a universal success assumption.

Report blocked human approval or unknown state. Auto-merge requested or a queue entry does not mean a PR merged, nor authorize this skill to merge it. Avoid `gh-axi stack submit`, which always applies auto-merge, and stack merge, which applies yes. Do not arm any merge as a side effect of publishing fixes or watching checks.

Keep the run IDs, tested and deployed revisions, commands, actual outcomes, and remaining approval/coverage limits in the worklog or task evidence. Reassess relevant verification when the PR base or head or deployment changes; an unchanged patch ID does not preserve runtime evidence across changed context.
