# Expand-Contract

**Expand-contract** is a migration sequence that keeps old and new forms available while callers migrate.
Use expand-contract only when temporary coexistence is required.

1. **Expand**: Add the new form while the old form remains supported.
   The repository must pass with both forms available.
2. **Migrate**: Move callers to the new form in passing batches.
   Keep a batch in the same task by default.
   Create a separate task only for an independently verifiable result with a distinct capability, owner, lifecycle, or blocker.
3. **Contract**: Remove the old form after all callers use the new form.
   The repository must pass with only the new form available.

When stages use separate tasks, each migration task must depend on expansion and contraction must depend on every migration.

The sequence is complete when each stage passes, all callers use the new form, and contraction removes the replaced form.
