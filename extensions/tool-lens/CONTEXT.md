# Pi Tool Lens

This context defines the operator-facing Tool Lens used by the local Pi configuration.
It separates result inspection from model-facing tool contracts and tool execution.

## Language

**Built-in tool set**:
The seven Pi tools `read`, `write`, `edit`, `bash`, `grep`, `find`, and `ls` whose persisted results Tool Lens can reconstruct with Pi's native expanded renderers.
_Avoid_: All tools, every tool

**Tool Lens**:
The operator extension opened with `/lens` that lists completed tool calls with session results from the current active session branch.
It includes built-in and extension-owned tools without changing their presentation, execution, or model-visible results.
Tool Lens opens as a centered Pi overlay that nearly fills the available terminal while leaving the underlying transcript visible around its edges.
The overlay reads the active branch and uses the current Pi theme and renderer runtime directly in the Pi process.
Its height is derived from the live terminal dimensions so Pi neither clips Tool Lens rows nor exposes underlying transcript text inside the overlay bounds.
The newest-first tool list appears on the left and the selected result preview appears on the right.
Typing filters list rows by tool name and invocation text without searching result bodies.
Up and Down change the selected tool and update the preview immediately.
Shift+Up and Shift+Down scroll the preview by one line, Ctrl+U and Ctrl+D scroll it by half a page, and Home and End jump to its bounds.
For the seven built-in tools, the preview uses Pi's native expanded rendering so Edit diffs, Bash output, syntax colors, truncation notices, and other native styling remain available.
A successful Write preview uses Pi's expanded call renderer because the written file content is stored in the call arguments and Pi's result renderer intentionally shows no content on success.
For extension-owned tools, the preview falls back to the complete stored result because Pi does not expose their renderer definitions or persist rendered components.
The preview preserves content order, represents each stored image with its MIME type instead of rendering the image, and shows the result summary with compact input, output, and total token estimates.
Token estimates use a simple character heuristic, exclude provider-specific image token costs, and are not billing measurements.
A footer explains the available keybindings.
Escape closes the overlay and restores focus to Pi's editor.
_Avoid_: Tool output browser, Tool card, global expansion, `/outputs`
