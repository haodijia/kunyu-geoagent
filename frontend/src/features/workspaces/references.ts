/** Local mentions carry tool-readable paths; remote imagery carries its OGE image ID. */
export interface WorkspaceReference {
  readonly target: string;
  readonly name: string;
  readonly detail: string;
  readonly kind: "file" | "image" | "result";
}

export function referenceText(name: string, target: string): string {
  const label = name.replace(/[\\\[\]]/g, char => `\\${char}`).replace(/[\r\n]/g, " ");
  return `@[${label}](${target.replaceAll("(", "%28").replaceAll(")", "%29")})`;
}

// Caret handling adapted from Mu (Apache-2.0): preserve suffix text and add a space.
const MENTION_BOUNDARIES = String.raw`\s,;!?()\[\]{}，。；：、（）`;
const MENTION_PREFIX = new RegExp(`(?:^|[${MENTION_BOUNDARIES}])@([^${MENTION_BOUNDARIES}@]*)$`, "u");
const MENTION_TAIL = new RegExp(`[${MENTION_BOUNDARIES}@]`, "u");

export function mentionQuery(draft: string, caret: number) {
  const safeCaret = Math.max(0, Math.min(caret, draft.length));
  const prefix = draft.slice(0, safeCaret);
  const match = MENTION_PREFIX.exec(prefix);
  if (match === null) return null;
  const query = match[1]!;
  const tail = draft.slice(safeCaret).search(MENTION_TAIL);
  return { query, start: safeCaret - query.length - 1, end: tail === -1 ? draft.length : safeCaret + tail };
}

export function insertReference(draft: string, start: number, end: number, item: WorkspaceReference) {
  const token = referenceText(item.name, item.target);
  const separator = end === draft.length ? " " : "";
  return { value: draft.slice(0, start) + token + separator + draft.slice(end), caret: start + token.length + separator.length };
}

export function referenceParts(text: string): readonly ({ readonly text: string; readonly target?: string })[] {
  const parts: { text: string; target?: string }[] = [];
  let offset = 0;
  for (const match of text.matchAll(/@\[((?:\\.|[^\]\\\r\n])+)\]\(((?:oge-image:|\/workspace\/)[^\s)]+)\)/g)) {
    parts.push({ text: text.slice(offset, match.index) });
    parts.push({ text: `@${match[1]!.replace(/\\([\\\[\]])/g, "$1")}`, target: match[2] });
    offset = match.index + match[0].length;
  }
  parts.push({ text: text.slice(offset) });
  return parts;
}
