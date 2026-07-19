# UI Prototype

A UI prototype presents several structurally different variants on one route.
The user compares the variants in the application and selects one design or a defined combination.

For a logic or state-model question, use [LOGIC.md](LOGIC.md).

## Select the route shape

Prefer an adjustment to an existing page.
An existing page exposes each variant to the application's real navigation, data, density, and constraints.
Create a new route only when no existing page can contain the proposed UI.

### Shape A: Existing page

Render every variant on the existing route.
Select the variant with a `?variant=` query parameter.
Keep existing data loading, route parameters, and authentication unchanged.
Change only the rendered UI subtree.

Use this shape for a new section, card, or step that belongs in an existing page.

### Shape B: New page

Use this shape for a new top-level surface or a flow that cannot exist inside a current page.
Create a throwaway route with the project's routing convention.
Include `prototype` in its path or filename.
Use the same `?variant=` query parameter.

Before you create the route, verify that no existing page can contain the prototype without changing the question.

Both shapes use the same floating switcher.

## Process

### 1. State the question and variant count

Create three variants by default.
Use no more than five variants so each can remain structurally distinct.

Record the question, route, and variant count with the prototype.
For example:

> Three variants of the settings page, switchable through `?variant=`, on the existing `/settings` route.

This step is complete when the question, route shape, route, and variant count are explicit.

### 2. Create distinct variants

Each variant must use:

- The same page purpose.
- The same available data.
- The project's component library and styling system.
- A distinct exported name, such as `VariantA`, `VariantB`, or `VariantC`.

Each variant must differ in layout, information hierarchy, and primary action.
Differences in color or text alone do not create a separate variant.
If two variants have the same structure, redesign one with a different explicit layout constraint.

This step is complete when every variant has a distinct layout, information hierarchy, and primary action.

### 3. Connect the variants

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

For Shape A, keep data loading above the variant selection.
For Shape B, mount the switcher on the throwaway route under `/prototype/<name>`.

### 4. Build the floating switcher

Place one shared switcher component at the bottom center of the viewport.
Include:

- A left arrow that selects the previous variant and wraps from the first variant to the last.
- A label with the current key and optional name, such as `B - Sidebar layout`.
- A right arrow that selects the next variant and wraps from the last variant to the first.

Update the query parameter with the framework router.
Use `router.replace` for Next.js or `navigate` for React Router.
The selected variant must survive reload and be shareable by URL.

Bind the `←` and `→` keys to the same actions.
Ignore these keys when focus is inside an `<input>`, `<textarea>`, or `[contenteditable]` element.

Give the switcher a high-contrast surface and shadow that distinguish it from the candidate design.
Render it only outside production, using `process.env.NODE_ENV !== 'production'` or the framework equivalent.
Keep the switcher in one shared component.

This step is complete when direct URL changes, clicks, and keyboard input select the correct variant.
The selected variant must survive reload.

### 5. Verify and hand off

Before handoff, use the `chrome-devtools-axi` skill to open the prototype.
Select every variant.
Check each variant for layout failures.
Check the console for prototype-breaking errors.
Fix each observed failure.

If side-by-side screenshots or annotation will help selection, use the `lavish` skill for an additional review artifact.
Keep the in-application prototype as the primary evaluation surface.

Give the user:

- The development command when the application is not already running.
- The route URL.
- Every `?variant=` value.

This step is complete when each variant loads, the switcher updates the URL and UI, and no prototype-breaking console error remains.

### 6. Capture the answer and preserve the prototype

Record the selected variant or combination and the reason for the selection.
Commit the complete variant set and switcher to a throwaway branch.
Record the branch name and prototype commit with the durable answer.

Then update the main branch:

- **Shape A**: Fold the selected design into the existing page. Remove the other variants and switcher.
- **Shape B**: Promote the selected design to a production route. Remove the throwaway route and switcher.

Completion requires the production UI, the durable answer, and a pointer to the preserved prototype.

## Guardrails

- Make variants differ in structure, information hierarchy, and primary action.
- Share small existing UI elements when useful, but let each variant own its layout.
- Use read-only data or stub mutations while the prototype evaluates visual design.
- Rewrite the selected design with production tests and error handling before release.
