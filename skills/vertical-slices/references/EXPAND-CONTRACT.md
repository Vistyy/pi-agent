# Expand-Contract

Use expand-contract when old and new forms must coexist while supported callers migrate.

- **Expand** adds the new form while the old form remains supported.
- **Migrate** moves bounded caller populations to the new form while the repository remains supported.
- **Contract** removes the old form after no supported caller requires it.

Apply the bounded supported result rule to every proposed stage and caller population.
Do not merge migration work merely because every stage contributes to one final target.
Do not create separate Tasks when an intermediate state is not approved and supported.

A caller-migration Task depends on expansion only when it cannot be implemented or verified before expansion is complete.
Contraction depends on every migration whose completion is necessary before removal.
Each recorded stage must have a coherent passing condition.
