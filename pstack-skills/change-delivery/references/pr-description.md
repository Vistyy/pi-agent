# Write a PR description

Write for a reviewer who knows the project but has no conversation context. Lead with the supported effect and why the change is needed. Make the change understandable before asking the reviewer to inspect the diff.

## Use the required structure

Inspect the repository's contribution instructions, PR templates, and supplied user notes. Choose the applicable template. If that choice requires missing human context, ask rather than guessing. Preserve required sections and fill them with relevant content. Mark a section not applicable only when policy allows it. Remove optional empty sections rather than filling them with unrelated text.

Without a required template, use a compact default: **What changes**, **Verification**, and **Review notes** when there is something consequential to review. These are fallback headings, not mandatory sections. Put the same content into the matching sections of a required template.

## Answer the reviewer's questions

- **What changes, for whom, and why?** State the supported user, caller, service, or maintainer effect in one or two sentences. Name the problem or requirement it addresses. Do not substitute a file inventory or an unsupported improvement claim.
- **How does the change achieve that?** Explain the smallest change shape that makes the effect clear. Group related behavior or responsibilities. Name real symbols and paths when they help locate the relevant code. Include an excluded behavior or scope boundary only when a reviewer might otherwise assume it changed.
- **What proves it works?** Name relevant checks and actual outcomes, including the affected workflow, tested context, and remaining coverage limits. Link larger supporting artifacts. Distinguish a proposed test plan, a CI status, and observed behavior.
- **What needs scrutiny?** Name consequential choices, affected contracts, concrete risks, and rollout or rollback constraints. Include a rejected alternative only when it answers a likely review question. Do not use a risk label in place of explaining what can fail.

Put essential information first. Keep supporting detail close to the claim or in a reviewer-accessible link. A long mandatory template may still need all its sections; brevity is not permission to omit material risks or required information.

## Choose evidence for the claim

Evidence is conditional on the change, not a universal screenshot or before/after requirement. For backend work, use relevant API responses, persisted state, job or queue outcomes, integration results, or measured service behavior. For a visible UI claim, screenshots can help. Execution evidence and images prove different things; neither has a universal rank.

Use before/after when the comparison explains a meaningful change and comparable observations exist. Record relevant workload and context for measured claims. For new behavior without a useful baseline, show its expected outcome and actual verification rather than inventing a before state. Report unrun or blocked checks as such.

Use a visual only when it reduces the explanation a reviewer must reconstruct. Choose a small diff sketch, flow or interaction diagram, state transition, or responsibility tree. Keep only the boundaries needed to understand the change and place the visual beside the sentence it supports. Do not force a diagram, screenshot, or full code block into every body.

## Cut noise and check the artifact

Exclude the agent's work diary, implementation chronology, exhaustive file lists, raw logs, unrelated checks, repeated prose, and speculative claims. Retain enough context to explain unfamiliar behavior. Link durable evidence that the intended reviewer can access, not agent-local files or private session URLs. Sanitize sensitive logs, data, and images before authorized publication.

Read the body against the actual published diff and evidence. Check that the effect, scope, visual, template sections, and verification claims agree. Read it once without the conversation: can a reviewer identify what changed, why, what was verified, and what deserves attention? Remove text that does not answer those questions or satisfy a required section.
