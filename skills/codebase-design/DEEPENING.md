# Deepening

Use this guidance to deepen a cluster of shallow modules safely.
Use the vocabulary in [SKILL.md](SKILL.md): **module**, **interface**, **seam**, and **adapter**.

## Classify each dependency

Classify each dependency before you design the deepened module.
The dependency category determines how tests cross its seam.

### 1. In-process

An in-process dependency performs pure computation or uses in-memory state without I/O.
Merge the shallow modules and test the new interface directly.
This category does not require an adapter.

### 2. Local-substitutable

A local-substitutable dependency has a local test implementation, such as PGLite or an in-memory filesystem.
Deepen the module when the test implementation is available.
Run the test implementation in the test suite.
Keep this seam inside the deepened module.

### 3. Remote but owned

A remote but owned dependency is an internal service across a network seam.
Define a port at the seam.
Inject the transport as an adapter.
Use an HTTP, gRPC, or queue adapter in production.
Use an in-memory adapter in tests.

Use this recommendation pattern:

> Define a port at the seam.
> Use an HTTP adapter in production and an in-memory adapter in tests.
> Keep the domain behavior in one deep module.

### 4. True external

A true external dependency is a third-party system that the project does not control.
Examples include Stripe and Twilio.
Inject the external dependency through a port.
Use a mock adapter in tests.

## Keep each seam justified

- One adapter makes a seam hypothetical.
- Two adapters make a seam real.
- Introduce a port when at least two adapters are justified.
- Keep internal seams inside the implementation.
- Keep the external seam at the module's interface.
- Do not expose an internal seam through the interface only because tests use it.

## Replace shallow tests

1. Write tests through the deepened module's interface.
2. Assert observable results through that interface.
3. Delete tests that target the replaced shallow modules.
4. Record the reason for each shallow-module test that must remain.

A test should survive an internal refactor.
If an internal refactor requires a test change, the test is probably bypassing the interface.

Deepening is complete when the new tests exercise the deepened module through its interface.
Every old shallow-module test must be deleted or retained with a recorded reason.
