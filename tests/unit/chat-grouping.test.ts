import { describe, expect, it } from 'vitest';
import { dayOf, startsRun } from '../../src/renderer/components/text-chat';
import type { ChatMessage } from '../../src/shared/community';

const message = (authorId: string, createdAt: string): ChatMessage => ({
  id: createdAt,
  channelId: 'general',
  authorId,
  authorName: authorId,
  content: 'hey',
  createdAt,
});

const at = (hours: number, minutes: number) => {
  const when = new Date();
  when.setHours(hours, minutes, 0, 0);
  return when.toISOString();
};

describe('dayOf', () => {
  it('says today and yesterday in words', () => {
    expect(dayOf(new Date())).toBe('Today');
    expect(dayOf(new Date(Date.now() - 24 * 60 * 60 * 1000))).toBe('Yesterday');
  });

  it('dates anything older, so a long night is not one blur', () => {
    const old = dayOf(new Date(Date.now() - 9 * 24 * 60 * 60 * 1000));
    expect(old).not.toBe('Today');
    expect(old).not.toBe('Yesterday');
    expect(old).toMatch(/\d/);
  });

  it('reads a message that arrived a moment into tomorrow as today', () => {
    expect(dayOf(new Date(Date.now() + 60_000))).toBe('Today');
  });
});

describe('startsRun', () => {
  it('heads the first message of all', () => {
    expect(startsRun(message('babi', at(22, 0)), undefined)).toBe(true);
  });

  it('joins a second message from the same person a minute later', () => {
    expect(startsRun(message('babi', at(22, 1)), message('babi', at(22, 0)))).toBe(false);
  });

  it('heads a message once somebody else has spoken', () => {
    expect(startsRun(message('merge', at(22, 1)), message('babi', at(22, 0)))).toBe(true);
  });

  it('heads a message that comes back after a long pause', () => {
    expect(startsRun(message('babi', at(22, 30)), message('babi', at(22, 0)))).toBe(true);
  });
});
