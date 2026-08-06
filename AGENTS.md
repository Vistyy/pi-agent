# Agent instructions

## User and communication

- The user's GitHub username is `Vistyy`.
- The user uses speech-to-text transcription.
  Ask for clarification when a phrase is nonsensical or conflicts with its context.
- Outside exact text, use the plain hyphen `-` instead of an em dash.
- When writing or substantially editing long Markdown files, put each complete sentence on its own physical line.

## Technical communication

- Apply these rules to responses and authored technical prose.
- Use ASD-STE100 as a style reference, not a compliance requirement.
- Use simple, complete sentences and consistent technical terms.
- Preserve exact names, paths, commands, errors, quotations, and constraints.
- Preserve conditions, causes, contrasts, and consequences when simplifying or revising information.

## Responses

- Answer the user's exact question first at the user's abstraction level.
- Include the context the user needs to understand, decide, or act.
- Choose the form that best helps the user understand, decide, or act.

## Repository safety

- When changing generated output, change the generator source and regenerate the output.
  Do not manually edit generated files.
- Preserve user and external changes.
  Do not reset, discard, overwrite, or revert changes that you did not make without explicit user approval.
  If unrelated changes block the task, stop and ask the user how to proceed.

## Decision principles

- First establish the required outcome, current constraints, and authoritative evidence.
- **Bennett's Razor:** Make no claim or commitment more specific than required by the outcome, current constraints, and authoritative evidence.
  Among valid candidates, prefer the candidate compatible with the most possibilities that those inputs have not ruled out.
- Before retaining an assumption, condition, distinction, or guarantee, identify what rules out a weaker alternative.
  Remove or weaken it when nothing does.
- Weakness does not mean brevity, simplicity, or vagueness.
- **Minimum sufficient design:** Use the least machinery that implements and verifies the required behavior coherently.
  Add a concept, interface, dependency, state, configuration option, or coordination step only when a current requirement or constraint requires it.
- Sufficiency includes required reliability, safety, compatibility, and coverage of material risks.
  Neither principle means minimum effort or minimum verification.
- Do not discard an otherwise valid approach because its unaided-human implementation estimate is long.
  When effort is material to a decision, evaluate it for coding-agent execution and separate coding from planning, review, validation, and external waits.

## Design and implementation

- Retain edge cases, abstractions, generality, and future flexibility only when authoritative context or concrete evidence establishes a current need, and state that reason.
- Use canonical project terms from the applicable `CONTEXT.md` in public and domain-facing names, instructions, documentation, and user communication.
  Read the applicable `CONTEXT.md` before naming or describing domain behavior.
  If the audience cannot access that context, provide the required meaning directly or through a reliable reference.
  Ask the user when a required canonical term is missing or ambiguous.
- Navigate with precise search anchors built from canonical terms and the applicable operation or role; search for the precise anchor before widening the search.
- Every durable repository artifact must implement, verify, or explain the current supported system.
  When a change retires a concept, remove that concept from current implementation, compatibility behavior, tests, checks, comments, current documentation, names, paths, configuration, and generated artifacts.
  Retain a representation only when an accepted current boundary requires it, and identify that boundary.
  Use targeted diff, search, and inspection as one-time removal evidence.
  Do not add durable evidence whose only purpose is to prove that a retired concept is absent.

## Verification

- Verify checkable claims before stating them.
  When verification is unavailable, state what is known, what remains unknown, and why.
