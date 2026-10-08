export interface ComposerCommandDescriptor {
  readonly definition_id: string;
  readonly name: string;
  readonly description: string;
  readonly when_to_use: string | null;
  readonly input_hint: string | null;
  readonly kind: "execute" | "skill" | "model";
  readonly unavailableReason: string | null;
}

export function parseComposerCommand(line: string) {
  const match = /^\/([a-z][a-z0-9_-]*)(\s[\s\S]*)?$/.exec(line.trim());
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
    command.name.includes(query) || command.description.toLowerCase().includes(query) || (command.when_to_use !== null && command.when_to_use.toLowerCase().includes(query)),
  );
}
