/**
 * Mentions travel as `<@account-id>`, so a message still points at the right
 * person after they change their name, and are drawn as `@Display name`.
 * The composer lets people type the readable `@username` and turns it into
 * the token as the message is sent.
 */

const token = /<@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>/gi;

export const mentionOf = (accountId: string) => `<@${accountId}>`;

/** Everybody a message names, once each. */
export function mentionedIds(content: string): string[] {
  return [...new Set([...content.matchAll(token)].map((match) => match[1]!.toLowerCase()))];
}

export type MentionPart = { text: string } | { accountId: string };

/** The message cut into plain text and the people it names, in order. */
export function splitMentions(content: string): MentionPart[] {
  const parts: MentionPart[] = [];
  let from = 0;
  for (const match of content.matchAll(token)) {
    if (match.index > from) parts.push({ text: content.slice(from, match.index) });
    parts.push({ accountId: match[1]!.toLowerCase() });
    from = match.index + match[0].length;
  }
  if (from < content.length) parts.push({ text: content.slice(from) });
  return parts;
}

/** The message as a person reads it, for a notification or a preview. */
export function readableMentions(content: string, nameOf: (accountId: string) => string | undefined): string {
  return splitMentions(content)
    .map((part) => ('text' in part ? part.text : `@${nameOf(part.accountId) ?? 'someone'}`))
    .join('');
}

/**
 * Turns `@username` typed in the composer into tokens for the people of this
 * server. Anything that names nobody here is left as it was written.
 */
export function encodeMentions(content: string, people: readonly { id: string; username: string }[]): string {
  const byName = new Map(people.map((person) => [person.username.toLowerCase(), person.id]));
  return content.replace(/(^|[^\w<@])@([a-zA-Z0-9_]{3,32})\b/g, (whole, before: string, name: string) => {
    const id = byName.get(name.toLowerCase());
    return id ? `${before}${mentionOf(id)}` : whole;
  });
}

/**
 * The half-typed mention right before the caret, if there is one: what has
 * been typed after the `@`, and where the `@` is.
 */
export function mentionQuery(text: string, caret: number): { query: string; start: number } | undefined {
  const match = /(^|\s)@([a-zA-Z0-9_]{0,32})$/.exec(text.slice(0, caret));
  if (!match) return undefined;
  return { query: match[2]!, start: caret - match[2]!.length - 1 };
}
