/** The upload and picker agree on these limits; the server enforces them too. */
export const attachmentLimit = 25 * 1024 * 1024;
export const attachmentsPerMessage = 4;
export const attachmentTypes = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
  'audio/webm',
  'application/pdf',
  'text/plain',
] as const;

export const emojiGroups = [
  {
    name: 'Faces',
    items: [
      ['😀', 'grinning happy'],
      ['😃', 'smile happy'],
      ['😄', 'laugh smile'],
      ['😁', 'grin'],
      ['😆', 'laughing'],
      ['😅', 'sweat smile'],
      ['😂', 'tears joy laugh'],
      ['🤣', 'rolling laughing'],
      ['🙂', 'smile'],
      ['🙃', 'upside down'],
      ['😉', 'wink'],
      ['😊', 'blush happy'],
      ['🥰', 'love smiling hearts'],
      ['😍', 'heart eyes love'],
      ['🤩', 'star eyes'],
      ['😘', 'kiss'],
      ['😎', 'cool sunglasses'],
      ['🥹', 'holding tears'],
      ['🥲', 'smiling tear'],
      ['😭', 'crying sob'],
      ['😮', 'surprise'],
      ['😱', 'scream'],
      ['🤔', 'thinking'],
      ['🤨', 'raised eyebrow'],
      ['😐', 'neutral'],
      ['😴', 'sleep'],
      ['🤯', 'mind blown'],
      ['🥳', 'party'],
      ['🤗', 'hug'],
      ['🫡', 'salute'],
      ['😤', 'frustrated'],
      ['😡', 'angry'],
      ['🤦', 'facepalm'],
      ['🤷', 'shrug'],
      ['👀', 'eyes looking'],
      ['💀', 'skull dead'],
    ],
  },
  {
    name: 'Gestures',
    items: [
      ['👍', 'thumbs up like'],
      ['👎', 'thumbs down'],
      ['👏', 'clap applause'],
      ['🙌', 'raised hands'],
      ['🤝', 'handshake'],
      ['🙏', 'thanks prayer'],
      ['👋', 'wave hello'],
      ['✌️', 'peace'],
      ['🤞', 'fingers crossed'],
      ['👌', 'okay'],
      ['🤌', 'pinched fingers'],
      ['🤘', 'rock'],
      ['💪', 'strong muscle'],
      ['🫶', 'heart hands'],
      ['👊', 'fist bump'],
    ],
  },
  {
    name: 'Hearts & more',
    items: [
      ['❤️', 'red heart love'],
      ['🤍', 'white heart'],
      ['🖤', 'black heart'],
      ['💔', 'broken heart'],
      ['💯', 'hundred perfect'],
      ['🔥', 'fire lit'],
      ['✨', 'sparkles'],
      ['⭐', 'star'],
      ['🎉', 'party celebration'],
      ['🎊', 'confetti'],
      ['✅', 'check yes done'],
      ['❌', 'cross no'],
      ['⚡', 'lightning'],
      ['💡', 'idea light'],
      ['🎵', 'music note'],
      ['🎧', 'headphones music'],
      ['🎮', 'game controller'],
      ['🎬', 'movie film'],
      ['📷', 'camera photo'],
      ['🎤', 'microphone'],
      ['☕', 'coffee'],
      ['🍕', 'pizza'],
      ['🍿', 'popcorn'],
      ['🏆', 'trophy win'],
      ['🚀', 'rocket'],
      ['🐈', 'cat'],
      ['🐕', 'dog'],
    ],
  },
] as const;

export const reactionEmojis = new Set<string>(
  emojiGroups.flatMap((group) => group.items.map(([emoji]) => emoji)),
);

/** Text stays text. Only explicit web URLs become links; never HTML or script. */
export function messageLinks(content: string): { text: string; url: string; index: number }[] {
  const links: { text: string; url: string; index: number }[] = [];
  for (const match of content.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>\u0000-\u001f]+/gi)) {
    let text = match[0].replace(/[.,;:!?]+$/, '');
    while (text.endsWith(')') && (text.match(/\)/g)?.length ?? 0) > (text.match(/\(/g)?.length ?? 0))
      text = text.slice(0, -1);
    try {
      const url = new URL(text.toLowerCase().startsWith('www.') ? `https://${text}` : text);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
      links.push({ text, url: url.href, index: match.index! });
    } catch {
      /* A malformed address remains ordinary text. */
    }
  }
  return links;
}

export function fileSize(bytes: number): string {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
