/** Mu represents an explicitly selected reply excerpt as a visible blockquote. */
export interface ReplyQuote {
  readonly messageId: string;
  readonly content: string;
}

export function quotedMessage(draft: string, quote: ReplyQuote | null): string {
  return quote === null ? draft : `${quote.content.split("\n").map((line) => `> ${line}`).join("\n")}\n\n${draft}`;
}
