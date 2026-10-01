---
name: prototype
description: >-
  Use when asked to build and run disposable prototypes, or to compare runnable
  alternatives for a design, interaction, behavior, or timing decision. Create
  variants, exercise them, collect observations, and recommend a direction.
  Not for visual explanation alone, pixel-parity verification, or shipping
  production implementation. Use Lavish for rendered HTML experiments.
---

# Prototype

**You own the design decision, not the code. The prototype is a throwaway instrument. The real build follows the chosen direction through the implementation workflow.**

Favor speed over production polish. Spend effort on the decision and the smallest runnable experiment, not production architecture or test infrastructure. Still verify the behavior the prototype exists to decide. The rigor is in picking the right design cheaply. Propose variations the user didn't ask for, throw an approach away and try another.

1. Scope the decision the prototype exists to make: which layout, which interaction, which density, or for an empirical fork which behavior, timing, or approach. No decision means no prototype. Use implementation work or a visual explanation instead.
2. Gather references when the visual design space is open. Search for prior art, summarize a moodboard of themes, palettes, and layouts, let the user pick directions before building. Skip when the direction is set.
3. Build throwaway in an isolated scratch dir, separate from production source. For a visual decision, read [HTML review](#html-review) before writing the artifact, then use vanilla HTML/CSS/JS or the lightest stack that renders the idea, with the product's visual language and local assets where practical. For a behavioral or timing decision, use the smallest runnable script that exercises the question. Avoid production scaffolding unless the experiment actually requires it.
4. When comparing alternatives, make materially different candidates comparable under the same inputs and conditions. For visual variants, use one switcher (buttons or a keypress), each variant labeled. For scripts, use a common runner or named modes with labeled outputs. Sketches alone do not satisfy a request for a runnable prototype.
5. Verify on the matching surface. For a visual decision, render each variant, drive the relevant interaction through available browser controls or the application's supported harness, and capture screenshots of the relevant states. A served URL alone is not evidence that the interaction works. For a behavioral or timing decision, run the experiment and observe the thing you are deciding by logging the timing, printing the output, or watching the render. Record the command, inputs, and actual observations. If rendering or execution is blocked, report the missing evidence rather than claiming the experiment ran.
6. Present alternatives, tradeoffs, and a recommendation. The output is the decision plus the throwaway artifact, not shippable code. Carry the chosen direction and observations into the implementation or architecture work for the real build.

**Reply:** the variants explored, the evidence (screenshots for a visual decision, the observed output or timing for a behavioral one), tradeoffs, your recommendation, and the scratch path. Say plainly that the prototype is throwaway.

## HTML review

- Before writing HTML, read the installed `lavish-axi --help` and each relevant `lavish-axi playbook <id>`. Keep local assets beside the HTML and use relative paths.
- Serve the artifact with `lavish-axi <html-file> --no-open`. Use its returned URL, including the configured remote-host rewrite, rather than an agent-local localhost URL or local browser-open command. Check that it serves the actual artifact. If a reachable private link is unavailable, provide the path and report blocked browser delivery.
- Do not use `lavish-axi share`, which publishes to a third-party service, or add a server/connector just to present a self-contained HTML experiment.
- Follow Lavish's current feedback lifecycle. Keep `lavish-axi poll <html-file>` attached through the foreground or a supported completion-aware facility; do not claim monitoring without a live feedback path. Read feedback completely and resume a timed-out poll when appropriate. Do not reopen a user-ended review uninvited. End the review only when complete or requested.
