import { readFileSync } from "node:fs";
import { dirname } from "node:path";

import {
	CustomEditor,
	getMarkdownTheme,
	parseSkillBlock,
	SkillInvocationMessageComponent,
	stripFrontmatter,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";

import {
	applyInlineSlashCompletion,
	enableInlineSlashAutocomplete,
	formatSkillBlock,
	getInlineSlashPrefix,
	planInlineSkills,
	type InlineAutocompleteEditor,
	type InlineSkill,
} from "./logic.js";

const INLINE_SKILL_MESSAGE_TYPE = "inline-skill-invocation";

type EditorFactory = NonNullable<ReturnType<ExtensionContext["ui"]["getEditorComponent"]>>;
type InlineEditorFactory = EditorFactory & { __inlineSkillsBaseFactory?: EditorFactory | null };

function installInlineAutocompleteEditor(ctx: ExtensionContext): void {
	const configured = ctx.ui.getEditorComponent() as InlineEditorFactory | undefined;
	const baseFactory =
		configured && Object.prototype.hasOwnProperty.call(configured, "__inlineSkillsBaseFactory")
			? configured.__inlineSkillsBaseFactory ?? undefined
			: configured;
	const factory: InlineEditorFactory = (tui, theme, keybindings) => {
		const editor = baseFactory
			? baseFactory(tui, theme, keybindings)
			: new CustomEditor(tui, theme, keybindings);
		enableInlineSlashAutocomplete(editor as unknown as InlineAutocompleteEditor);
		return editor;
	};
	factory.__inlineSkillsBaseFactory = baseFactory ?? null;
	ctx.ui.setEditorComponent(factory);
}

function createInlineSkillProvider(current: AutocompleteProvider): AutocompleteProvider {
	return {
		triggerCharacters: current.triggerCharacters,

		async getSuggestions(lines, cursorLine, cursorCol, options) {
			const prefix = getInlineSlashPrefix(lines, cursorLine, cursorCol);
			if (prefix === undefined) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			const suggestions = await current.getSuggestions([prefix], 0, prefix.length, {
				...options,
				force: false,
			});
			if (!suggestions) {
				return null;
			}

			const skillItems = suggestions.items.filter((item) => item.value.startsWith("skill:"));
			return skillItems.length > 0 ? { items: skillItems, prefix } : null;
		},

		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			const inlinePrefix = getInlineSlashPrefix(lines, cursorLine, cursorCol);
			if (inlinePrefix === prefix && item.value.startsWith("skill:")) {
				return applyInlineSlashCompletion(lines, cursorLine, cursorCol, item.value, prefix);
			}
			return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
		},

		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
		},
	};
}

export default function inlineSkills(pi: ExtensionAPI): void {
	pi.registerMessageRenderer(INLINE_SKILL_MESSAGE_TYPE, (message, { expanded }) => {
		if (typeof message.content !== "string") {
			return undefined;
		}
		const skillBlock = parseSkillBlock(message.content);
		if (!skillBlock) {
			return undefined;
		}
		const component = new SkillInvocationMessageComponent(skillBlock, getMarkdownTheme());
		component.setExpanded(expanded);
		return component;
	});

	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.addAutocompleteProvider((current) => createInlineSkillProvider(current));
		installInlineAutocompleteEditor(ctx);
	});

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension" || !/(^|\s)\/skill:/.test(event.text)) {
			return { action: "continue" };
		}

		const commands = new Map(
			pi
				.getCommands()
				.filter((command) => command.source === "skill")
				.map((command) => [command.name.slice("skill:".length), command]),
		);
		const loaded = new Map<string, InlineSkill | null>();

		const plan = planInlineSkills(event.text, (name) => {
			if (loaded.has(name)) {
				return loaded.get(name) ?? undefined;
			}

			const command = commands.get(name);
			if (!command) {
				loaded.set(name, null);
				return undefined;
			}

			try {
				const location = command.sourceInfo.path;
				const skill = {
					name,
					location,
					baseDir: dirname(location),
					body: stripFrontmatter(readFileSync(location, "utf8")),
				};
				loaded.set(name, skill);
				return skill;
			} catch (error) {
				loaded.set(name, null);
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`inline-skills: failed to load ${name}: ${message}`, "error");
				return undefined;
			}
		});

		if (!plan) {
			return { action: "continue" };
		}

		for (const skill of plan.skills) {
			pi.sendMessage(
				{
					customType: INLINE_SKILL_MESSAGE_TYPE,
					content: formatSkillBlock(skill),
					display: true,
				},
				event.streamingBehavior
					? { deliverAs: event.streamingBehavior }
					: { triggerTurn: false },
			);
		}

		return plan.prompt === event.text
			? { action: "continue" }
			: { action: "transform", text: plan.prompt, images: event.images };
	});
}
