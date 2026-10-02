import { zhCN } from "@/locales/zh-CN";

export const composerCommandNames = [
  "model", "effort", "stop", "map", "trace", "settings", "help",
] as const;

export type ComposerCommandName = (typeof composerCommandNames)[number];

export interface ComposerCommandDescriptor {
  readonly name: ComposerCommandName;
  readonly description: string;
  readonly unavailableReason: string | null;
}

export function parseComposerCommand(line: string) {
  const match = /^\/([a-z]+)(\s[\s\S]*)?$/.exec(line.trim());
  if (match === null) return null;
  return { name: match[1], rawInput: match[2]?.trim() ?? "" };
}

export function filterComposerCommands(
  commands: readonly ComposerCommandDescriptor[],
  draft: string,
): readonly ComposerCommandDescriptor[] | null {
  const match = /^\/([^\s/]*)$/.exec(draft.trimStart());
  if (match === null) return null;
  const query = match[1]?.toLowerCase();
  if (query === undefined) return null;
  return commands.filter((command) =>
    command.name.includes(query) || command.description.includes(query),
  );
}

export function createComposerCommandDirectory(
  modelDisabled: boolean,
  effortAvailable: boolean,
  canStop: boolean,
): readonly ComposerCommandDescriptor[] {
  const content = zhCN.conversation.commands;
  return composerCommandNames.map((name) => ({
    name,
    description: content.descriptions[name],
    unavailableReason:
      (name === "model" || name === "effort") && modelDisabled
        ? content.modelLocked
        : name === "effort" && !effortAvailable
          ? content.noEffort
          : name === "stop" && !canStop
            ? content.noActiveRun
            : null,
  }));
}
