import type { Theme } from "@earendil-works/pi-coding-agent";
import type { ToolLensResult } from "./project.js";

const FOREGROUND_COLORS = [
  "accent",
  "border",
  "borderAccent",
  "borderMuted",
  "success",
  "error",
  "warning",
  "muted",
  "dim",
  "text",
  "thinkingText",
  "userMessageText",
  "customMessageText",
  "customMessageLabel",
  "toolTitle",
  "toolOutput",
  "mdHeading",
  "mdLink",
  "mdLinkUrl",
  "mdCode",
  "mdCodeBlock",
  "mdCodeBlockBorder",
  "mdQuote",
  "mdQuoteBorder",
  "mdHr",
  "mdListBullet",
  "toolDiffAdded",
  "toolDiffRemoved",
  "toolDiffContext",
  "syntaxComment",
  "syntaxKeyword",
  "syntaxFunction",
  "syntaxVariable",
  "syntaxString",
  "syntaxNumber",
  "syntaxType",
  "syntaxOperator",
  "syntaxPunctuation",
  "thinkingOff",
  "thinkingMinimal",
  "thinkingLow",
  "thinkingMedium",
  "thinkingHigh",
  "thinkingXhigh",
  "thinkingMax",
  "bashMode",
] as const satisfies readonly Parameters<Theme["fg"]>[0][];

const BACKGROUND_COLORS = [
  "selectedBg",
  "userMessageBg",
  "customMessageBg",
  "toolPendingBg",
  "toolSuccessBg",
  "toolErrorBg",
] as const satisfies readonly Parameters<Theme["bg"]>[0][];

type ForegroundColor = (typeof FOREGROUND_COLORS)[number];
type BackgroundColor = (typeof BACKGROUND_COLORS)[number];

export interface SerializedTheme {
  name?: string;
  foreground: Record<ForegroundColor, string>;
  background: Record<BackgroundColor, string>;
}

export interface ToolLensSnapshot {
  cwd: string;
  results: ToolLensResult[];
  theme: SerializedTheme;
}

export function serializeTheme(theme: Theme): SerializedTheme {
  return {
    name: theme.name,
    foreground: Object.fromEntries(FOREGROUND_COLORS.map((color) => [color, theme.getFgAnsi(color)])) as SerializedTheme["foreground"],
    background: Object.fromEntries(BACKGROUND_COLORS.map((color) => [color, theme.getBgAnsi(color)])) as SerializedTheme["background"],
  };
}

function style(open: string, close: string, text: string): string {
  return `${open}${text}${close}`;
}

export function deserializeTheme(serialized: SerializedTheme): Theme {
  const theme = {
    name: serialized.name,
    fg: (color: ForegroundColor, text: string) => style(serialized.foreground[color], "\u001b[39m", text),
    bg: (color: BackgroundColor, text: string) => style(serialized.background[color], "\u001b[49m", text),
    bold: (text: string) => style("\u001b[1m", "\u001b[22m", text),
    italic: (text: string) => style("\u001b[3m", "\u001b[23m", text),
    underline: (text: string) => style("\u001b[4m", "\u001b[24m", text),
    inverse: (text: string) => style("\u001b[7m", "\u001b[27m", text),
    strikethrough: (text: string) => style("\u001b[9m", "\u001b[29m", text),
    getFgAnsi: (color: ForegroundColor) => serialized.foreground[color],
    getBgAnsi: (color: BackgroundColor) => serialized.background[color],
    getColorMode: () => "truecolor" as const,
    getThinkingBorderColor: (level: string) => {
      const color = `thinking${level[0]?.toUpperCase() ?? ""}${level.slice(1)}` as ForegroundColor;
      return (text: string) => theme.fg(serialized.foreground[color] ? color : "thinkingOff", text);
    },
    getBashModeBorderColor: () => (text: string) => theme.fg("bashMode", text),
  };
  return theme as unknown as Theme;
}
