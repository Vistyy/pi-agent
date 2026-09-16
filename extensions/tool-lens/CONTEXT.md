# Pi Tool Lens

Canonical language for the operator-facing tool-result inspector in the local Pi configuration.

## Language

**Built-in tool set**:
The seven Pi tools `read`, `write`, `edit`, `bash`, `grep`, `find`, and `ls`, whose persisted results Tool Lens can reconstruct with Pi's native expanded renderers.

_Avoid_: All tools, every tool

**Tool Lens**:
The operator overlay opened with `/lens` to inspect completed tool calls from the current active session branch. It does not change tool execution or model-visible results; built-in tools use Pi's native expanded presentation, while extension tools use their complete stored results.

_Avoid_: Tool output browser, Tool card, global expansion, `/outputs`
