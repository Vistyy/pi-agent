# UI Prototype

A UI prototype presents several structurally different variants on one route.
The user compares the variants and selects one design or a defined combination.
For a logic or state-model question, use [LOGIC.md](LOGIC.md).

## Select the route shape

Prefer an adjustment to an existing page because it preserves real navigation, data, density, and constraints.
When no existing page can contain the proposed UI, create a new route.

### Shape A: Existing page

Render every variant on the existing route.
Select the variant with `?variant=`.
Keep existing data loading, route parameters, and authentication unchanged.
Change only the rendered UI subtree.

Use this shape for a section, card, or step that belongs in an existing page.

### Shape B: New page

Use this shape for a new top-level surface or a flow that cannot exist inside a current page.
Create a throwaway route with the project's routing convention.
Include `prototype` in its path or filename.
Use `?variant=`.

Before creating the route, verify that no existing page can contain the prototype without changing the question.
Both shapes use the same floating switcher.

## 1. State the question and variant count

Create three variants by default.
Use no more than five variants so each remains structurally distinct.
Record the question, route, and variant count with the prototype.

Example:

> Three variants of the settings page, switchable through `?variant=`, on the existing `/settings` route.

This step is complete when the question, route shape, route, and variant count are explicit.

## 2. Create distinct variants

Give every variant the same page purpose, available data, component library, and styling system.
Give every variant a distinct exported name, such as `VariantA`, `VariantB`, or `VariantC`.

Make each variant differ in layout, information hierarchy, and primary action.
Color or text changes alone do not create a separate variant.
When two variants have the same structure, redesign one with a different explicit layout constraint.

This step is complete when every variant has a distinct layout, information hierarchy, and primary action.

## 3. Connect the variants

Create one switcher on the selected route:

```tsx
// pseudo-code - adapt to the project's framework
const variant = searchParams.get('variant') ?? 'A';
return (
  <>
    {variant === 'A' && <VariantA {...data} />}
    {variant === 'B' && <VariantB {...data} />}
    {variant === 'C' && <VariantC {...data} />}
    <PrototypeSwitcher variants={['A','B','C']} current={variant} />
  </>
);
```

For Shape A, keep data loading above variant selection.
For Shape B, mount the switcher on the throwaway route under `/prototype/<name>`.

## 4. Build the floating switcher

Place one shared switcher at the bottom center of the viewport.
Give it a left arrow for the previous variant and a right arrow for the next variant.
Wrap both arrows at the ends of the variant list.
Show the current key and optional name, such as `B - Sidebar layout`.

Update the query parameter with the framework router.
Use `router.replace` for Next.js or `navigate` for React Router.
The selected variant must survive reload and remain shareable by URL.

Bind `←` and `→` to the same actions.
When focus is inside an `<input>`, `<textarea>`, or `[contenteditable]` element, ignore these keys.

Give the switcher a high-contrast surface and shadow that distinguish it from the candidate design.
Render it only outside production with `process.env.NODE_ENV !== 'production'` or the framework equivalent.
Keep the switcher in one shared component.

This step is complete when direct URL changes, clicks, and keyboard input select the correct variant.
The selected variant must survive reload.

## 5. Verify and hand off

Before handoff, use the `chrome-devtools-axi` skill to open the prototype.
Select every variant.
Check each variant for layout failures.
Check the console for prototype-breaking errors.
Fix each observed failure.

If side-by-side screenshots or annotation will help selection, use the `lavish` skill for an additional review artifact.
Keep the in-application prototype as the primary evaluation surface.

Give the user the development command when the application is not already running.
Give the user the route URL.
Give the user every `?variant=` value.

This step is complete when each variant loads, the switcher updates the URL and UI, and no prototype-breaking console error remains.

## 6. Promote the selected design

Before updating the main branch, commit the complete variant set and switcher to a throwaway branch.
Record the branch name and prototype commit with the durable answer.
Record the selected variant or combination and the reason for the selection.

- **Shape A**: Fold the selected design into the existing page.
  Remove the other variants and the switcher.
- **Shape B**: Promote the selected design to a production route.
  Remove the throwaway route and the switcher.

This step is complete when the production UI, durable answer, and pointer to the preserved prototype exist.

## Guardrails

- Make variants differ in structure, information hierarchy, and primary action.
- Share small existing UI elements when useful, but let each variant own its layout.
- Use read-only data or stub mutations while the prototype evaluates visual design.
- Before release, rewrite the selected design with production tests and error handling.
