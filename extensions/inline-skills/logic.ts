export function getInlineSlashPrefix(
	lines: string[],
	cursorLine: number,
	cursorCol: number,
): string | undefined {
	const beforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
	const match = beforeCursor.match(/(?:^|[ \t])(\/[^\s/]*)$/);
	if (!match || (cursorLine === 0 && match.index === 0)) {
		return undefined;
	}
	return match[1];
}

export interface InlineAutocompleteEditor {
	handleInput(data: string): void;
	getLines?(): string[];
	getCursor?(): { line: number; col: number };
	isShowingAutocomplete?(): boolean;
	tryTriggerAutocomplete?(): void;
}

const INLINE_AUTOCOMPLETE_MARKER = "__inlineSkillsAutocompleteEnabled";

export function enableInlineSlashAutocomplete(editor: InlineAutocompleteEditor): void {
	const getLines = editor.getLines?.bind(editor);
	const getCursor = editor.getCursor?.bind(editor);
	const isShowingAutocomplete = editor.isShowingAutocomplete?.bind(editor);
	const tryTriggerAutocomplete = editor.tryTriggerAutocomplete?.bind(editor);
	if (!getLines || !getCursor || !isShowingAutocomplete || !tryTriggerAutocomplete) {
		return;
	}

	const markedEditor = editor as InlineAutocompleteEditor & Record<string, unknown>;
	if (markedEditor[INLINE_AUTOCOMPLETE_MARKER]) {
		return;
	}
	markedEditor[INLINE_AUTOCOMPLETE_MARKER] = true;

	const originalHandleInput = editor.handleInput.bind(editor);
	editor.handleInput = (data: string) => {
		originalHandleInput(data);
		if (data.length !== 1 || !/[\/a-zA-Z0-9._-]/.test(data) || isShowingAutocomplete()) {
			return;
		}

		const cursor = getCursor();
		if (getInlineSlashPrefix(getLines(), cursor.line, cursor.col) !== undefined) {
			tryTriggerAutocomplete();
		}
	};
}

export interface InlineSkill {
	name: string;
	location: string;
	baseDir: string;
	body: string;
}

function formatSkillBlock(skill: InlineSkill): string {
	return `<skill name="${skill.name}" location="${skill.location}">\nReferences are relative to ${skill.baseDir}.\n\n${skill.body.trim()}\n</skill>`;
}

export function expandInlineSkills(
	text: string,
	resolveSkill: (name: string) => InlineSkill | undefined,
): string {
	const leadingMatch = text.match(/^\/skill:([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?= |$)/);
	if (leadingMatch) {
		const skill = resolveSkill(leadingMatch[1]);
		if (skill) {
			const args = text.slice(leadingMatch[0].length).trim();
			return args
				? `${formatSkillBlock(skill)}\n\n${expandInlineSkills(args, resolveSkill)}`
				: formatSkillBlock(skill);
		}
	}

	return text.replace(
		/(^|\s)\/skill:([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?=$|[\s,.;:!?()[\]{}])/g,
		(original, leading: string, name: string) => {
			const skill = resolveSkill(name);
			return skill ? `${leading}${formatSkillBlock(skill)}` : original;
		},
	);
}

export function applyInlineSlashCompletion(
	lines: string[],
	cursorLine: number,
	cursorCol: number,
	value: string,
	prefix: string,
): { lines: string[]; cursorLine: number; cursorCol: number } {
	const currentLine = lines[cursorLine] ?? "";
	const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
	const afterCursor = currentLine.slice(cursorCol);
	const startsWithWhitespace = /^\s/.test(afterCursor);
	const startsWithPunctuation = /^[,.;:!?)]/.test(afterCursor);
	const separator = startsWithWhitespace || startsWithPunctuation ? "" : " ";
	const completed = `/${value}`;
	const newLines = [...lines];
	newLines[cursorLine] = `${beforePrefix}${completed}${separator}${afterCursor}`;

	return {
		lines: newLines,
		cursorLine,
		cursorCol: beforePrefix.length + completed.length + separator.length + (startsWithWhitespace ? 1 : 0),
	};
}
