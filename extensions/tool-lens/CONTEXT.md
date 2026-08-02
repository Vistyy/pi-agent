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
Its Herdr-owned session-modal popup uses 85% of the terminal width and height, with a newest-first tool list on the left and the selected result preview on the right.
The Pi extension takes a static active-branch snapshot, preserves the current theme's terminal colors, and launches a standalone event-driven terminal process through Herdr's plugin popup interface.
The popup writes complete frames with absolute row positions and small terminal margins because Pi TUI's differential screen renderer caused progressive corruption inside the Herdr popup.
Tool Lens remains available while the agent runs because Herdr composites the popup independently from Pi's transcript renderer.
The popup requires Pi to run inside Herdr 0.7.4 or newer.
Typing filters list rows by tool name and invocation text without searching result bodies.
Up and Down change the selected tool and update the preview immediately.
Shift+Up and Shift+Down scroll the preview by one line, Ctrl+U and Ctrl+D scroll it by half a page, and Home and End jump to its bounds.
For the seven built-in tools, the preview uses Pi's native expanded result renderer so Edit diffs, Bash output, syntax colors, truncation notices, and other native styling remain available.
For extension-owned tools, the preview falls back to the complete stored result because Pi does not expose their renderer definitions or persist rendered components.
The preview preserves content order, represents each stored image with its MIME type instead of rendering the image, and shows the result summary with compact input, output, and total token estimates.
Token estimates use a simple character heuristic, exclude provider-specific image token costs, and are not billing measurements.
A footer explains the available keybindings.
Escape closes the popup process and restores the underlying Pi pane.
_Avoid_: Tool output browser, Tool card, global expansion, `/outputs`
