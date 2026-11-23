import { describe, expect, it } from 'vitest';
import {
  encodeMentions,
  mentionedIds,
  mentionQuery,
  readableMentions,
  splitMentions,
} from '../../src/shared/mentions';
import {
  badgesForMessage,
  defaultPreferences,
  notifiesForDirect,
  notifiesForMessage,
  readPreferences,
  type NotificationPreferences,
} from '../../src/renderer/domain/notifications';
import { suggestionsFor } from '../../src/renderer/components/mention-suggestions';
import type { CommunityMember } from '../../src/shared/community';

const ana = '11111111-1111-4111-8111-111111111111';
const leo = '22222222-2222-4222-8222-222222222222';
const people = [
  { id: ana, username: 'ana', displayName: 'Ana Clara' },
  { id: leo, username: 'leo_99', displayName: 'Leo' },
];

describe('mentions', () => {
  it('turn typed usernames of this server into tokens and leave the rest alone', () => {
    const sent = encodeMentions('@ana and @LEO_99, not @nobody or mail@ana.com', people);
    expect(sent).toBe(`<@${ana}> and <@${leo}>, not @nobody or mail@ana.com`);
    expect(mentionedIds(`${sent} <@${ana}>`)).toEqual([ana, leo]);
  });

  it('read back as names, in order', () => {
    const content = `hey <@${ana}>, look`;
    expect(splitMentions(content)).toEqual([{ text: 'hey ' }, { accountId: ana }, { text: ', look' }]);
    expect(readableMentions(content, (id) => (id === ana ? 'Ana Clara' : undefined))).toBe(
      'hey @Ana Clara, look',
    );
  });

  it('notice a mention being typed right before the caret only', () => {
    expect(mentionQuery('hi @an', 6)).toEqual({ query: 'an', start: 3 });
    expect(mentionQuery('@', 1)).toEqual({ query: '', start: 0 });
    expect(mentionQuery('mail@an', 7)).toBeUndefined();
    expect(mentionQuery('hi @ana there', 13)).toBeUndefined();
  });

  it('suggest people by the start of a name first', () => {
    const members = people.map((person) => ({ ...person, role: 'member' }) as CommunityMember);
    expect(suggestionsFor(members, 'le').map((member) => member.username)).toEqual(['leo_99']);
    expect(suggestionsFor(members, 'cla').map((member) => member.username)).toEqual(['ana']);
    expect(suggestionsFor(members, '')).toHaveLength(2);
  });
});

describe('when to notify', () => {
  const message = { serverId: 's', channelId: 'c', mentioned: false };
  const away = { focused: false };
  const set = (servers: NotificationPreferences['servers']) => ({ ...defaultPreferences, servers });

  it('names you by default, and says nothing about the rest', () => {
    expect(notifiesForMessage({ ...message, mentioned: true }, defaultPreferences, away)).toBe(true);
    expect(notifiesForMessage(message, defaultPreferences, away)).toBe(false);
  });

  it('follows the level chosen for the server', () => {
    expect(notifiesForMessage(message, set({ s: 'all' }), away)).toBe(true);
    expect(notifiesForMessage({ ...message, mentioned: true }, set({ s: 'nothing' }), away)).toBe(false);
    expect(badgesForMessage({ ...message, mentioned: true }, set({ s: 'nothing' }), away)).toBe(false);
  });

  it('stays quiet about the channel or conversation being read', () => {
    const reading = { focused: true, channelId: 'c', conversationId: 'd' };
    expect(notifiesForMessage({ ...message, mentioned: true }, defaultPreferences, reading)).toBe(false);
    expect(notifiesForDirect('d', defaultPreferences, reading)).toBe(false);
    expect(notifiesForDirect('d', defaultPreferences, away)).toBe(true);
    expect(notifiesForDirect('d', { ...defaultPreferences, directs: false }, away)).toBe(false);
  });

  it('keeps only sensible stored settings', () => {
    expect(readPreferences({ sound: false, servers: { a: 'all', b: 'loud' } })).toEqual({
      ...defaultPreferences,
      sound: false,
      servers: { a: 'all' },
    });
    expect(readPreferences('broken')).toEqual(defaultPreferences);
  });
});
