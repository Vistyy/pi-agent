# Author a browser explanation

Read this reference when a browser artifact helps explain the subject. It extends `show-me`'s text-based and code-based representations rather than replacing them. Use Lavish for preview, revision, and feedback. Choose the explanation's form with judgment rather than from a catalog of approved formats.

## Explain the mechanism

Decide what the person should be able to explain, predict, or distinguish after using the artifact. Use that outcome to choose the depth and representation. Include the intermediate behavior needed to understand causality, timing, scale, or state. Labels and decorative movement do not replace that explanation.

Use as much detail as the subject warrants. Do not imitate a tool's simple demo when the question needs more. Do not add complexity merely to demonstrate capability.

Introduce unfamiliar ideas in a deliberate order. Use progressive disclosure when it helps. Keep related views together when comparison or shared state is what makes the mechanism understandable. Do not force a redraw sequence or a particular drawing style.

Explain a non-obvious representation choice when it helps the person interpret the result. Do not narrate routine tooling choices or print a design rationale for every visual.

## Preserve fidelity

Ground claims in the relevant code, data, or other evidence. Distinguish recorded behavior from a simulation, a simplification, or an inference. A visualization of a model does not prove that the real system behaves that way.

Keep scales, units, labels, and state transitions consistent. State a simplification near the affected explanation when it changes what the person can infer. Preserve research uncertainty rather than making the visual more certain than its source.

## Make interaction meaningful

Use controls that expose a meaningful change in the subject. Make their purpose discoverable through the explanation and the controls. When views describe one state, keep them consistent as that state changes. Let the person inspect relevant detail without losing the main relationship.

Use motion when it communicates something. Keep important states inspectable and respect reduced-motion preferences. When sound contributes to understanding, make playback an explicit user action and provide a way to stop it. Preserve a useful explanation when sound is unavailable.

## Finish the presentation

Choose typography, spacing, contrast, composition, and visual emphasis for the subject and the reader. Match an existing product's design when explaining its UI. A custom explanation does not have to look like a dashboard or a whiteboard.

Keep prose and visuals close enough to interpret together. Make the initial view communicate the central relationship. Give details enough space to remain readable instead of hiding them in tiny labels. Maintain a coherent presentation when the viewport changes.

Do not reduce the explanation's depth merely to keep the implementation short. Remove controls and ornament that do not help the person understand or inspect the subject.

## Package for Lavish

Before writing HTML, read the installed `lavish-axi --help` and each applicable `lavish-axi playbook <id>`. Use the current CLI for publication and the feedback lifecycle rather than assuming an older command contract. Follow `show-me`'s delivery instructions.

Keep authoring sources and local assets outside product source unless the user requested a repository change. Use as many source files as the explanation warrants. Package them for the review surface afterward. Keep local assets beside the published HTML and use relative paths.

If module imports fail in Lavish's sandbox, use an existing compiler to produce a compatible bundle. A verified authoring trial used esbuild's `iife` output, a classic script at the end of the body, and adjacent local assets. This is a packaging option, not a requirement to write source without modules or use a particular framework. Bundling does not resolve every browser capability or network restriction. Do not weaken the sandbox to make an artifact work.

Check portable exports for unresolved local assets. In the same trial, `defer` scripts remained external during export. Placing the classic bundle at the end of the body removed the need for `defer` and allowed it to be inlined. Inspect the current export result instead of assuming that every script can be inlined.

Reuse supported commands before adding helpers. Add a helper only when it removes repeated command composition or a demonstrated failure mode. Do not build another server merely to publish HTML. Local hosting and optional remote access stay separate from authoring.

## Inspect and revise

Open the served artifact in the browser and inspect what the person sees. Exercise the central interaction and check a concrete expected result independent of the visualization's own helper logic. Check that related views and explanations remain consistent after the change.

Inspect the initial view and important changed states. Check readability, keyboard access to controls, and a narrower viewport. Inspect errors and missing resources. Successful compilation, initial placeholder values, or a returned URL do not establish that the explanation works.

When an export is part of delivery, open the exported file and exercise it as delivered. Check for unresolved assets instead of assuming that export success implies portability.

Use browser feedback to revise the explanation. Follow the CLI's actual polling and session lifecycle. Keep claims about audible output, monitoring, and verification within what was exercised. Report a blocked capability rather than pretending the fallback is equivalent.

Return the explanation or artifact link with a concise statement of what it helps the person understand. Do not bury it under a report about the authoring process. Keep live teaching paced by the person. A standalone artifact can include inspectable detail without turning the chat into a lecture.
