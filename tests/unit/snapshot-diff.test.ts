import { describe, expect, it } from 'vitest';
import type { ConferenceSnapshot, Participant } from '../../src/renderer/domain/conference';
import {
  patchChangesNothing,
  reuseParticipants,
  sameParticipant,
} from '../../src/renderer/infrastructure/conference/snapshot-diff';

const person = (overrides: Partial<Participant> & Pick<Participant, 'id'>): Participant => ({
  name: overrides.id,
  initials: overrides.id.slice(0, 2).toUpperCase(),
  accent: '#E8E8E8',
  isLocal: false,
  isMuted: false,
  isSpeaking: false,
  volume: 100,
  locallyMuted: false,
  isBroadcasting: false,
  ...overrides,
});

const snapshot = (overrides: Partial<ConferenceSnapshot> = {}): ConferenceSnapshot => ({
  connectionState: 'connected',
  participants: [],
  microphoneEnabled: true,
  deafened: false,
  screenSharing: false,
  watching: [],
  ...overrides,
});

describe('sameParticipant', () => {
  it('sees through a rebuilt object that says the same thing', () => {
    expect(sameParticipant(person({ id: 'babi' }), person({ id: 'babi' }))).toBe(true);
  });

  it('notices somebody starting to talk', () => {
    expect(sameParticipant(person({ id: 'babi' }), person({ id: 'babi', isSpeaking: true }))).toBe(false);
  });

  it('notices a line getting worse', () => {
    expect(sameParticipant(person({ id: 'babi', signal: 'good' }), person({ id: 'babi', signal: 'poor' }))).toBe(
      false,
    );
  });

  it('notices a screen arriving, which is a stream of its own', () => {
    const screen = { id: 'screen' } as unknown as MediaStream;
    expect(sameParticipant(person({ id: 'babi' }), person({ id: 'babi', screenStream: screen }))).toBe(false);
  });
});

describe('reuseParticipants', () => {
  it('hands back the very same list when the call has not moved', () => {
    const previous = [person({ id: 'you', isLocal: true }), person({ id: 'babi' })];
    const next = [person({ id: 'you', isLocal: true }), person({ id: 'babi' })];

    expect(reuseParticipants(previous, next)).toBe(previous);
  });

  it('keeps the object of everybody who did not change', () => {
    const previous = [person({ id: 'you', isLocal: true }), person({ id: 'babi' })];
    const next = [person({ id: 'you', isLocal: true }), person({ id: 'babi', isSpeaking: true })];

    const merged = reuseParticipants(previous, next);

    expect(merged).not.toBe(previous);
    expect(merged[0]).toBe(previous[0]);
    expect(merged[1]).not.toBe(previous[1]);
    expect(merged[1].isSpeaking).toBe(true);
  });

  it('reports somebody arriving and somebody leaving', () => {
    const previous = [person({ id: 'you' })];
    expect(reuseParticipants(previous, [person({ id: 'you' }), person({ id: 'babi' })])).not.toBe(previous);
    expect(reuseParticipants(previous, [])).not.toBe(previous);
  });

  it('reports a reordering, because a list is drawn in order', () => {
    const previous = [person({ id: 'you' }), person({ id: 'babi' })];
    const next = [person({ id: 'babi' }), person({ id: 'you' })];

    expect(reuseParticipants(previous, next)).not.toBe(previous);
  });
});

describe('patchChangesNothing', () => {
  it('recognises a report that repeats what is already shown', () => {
    const people = [person({ id: 'babi' })];
    const current = snapshot({ participants: people, watching: ['babi'] });

    expect(patchChangesNothing(current, { participants: people })).toBe(true);
    expect(patchChangesNothing(current, { watching: ['babi'] })).toBe(true);
    expect(patchChangesNothing(current, { connectionState: 'connected' })).toBe(true);
  });

  it('lets anything genuinely new through', () => {
    const current = snapshot({ watching: ['babi'] });

    expect(patchChangesNothing(current, { connectionState: 'reconnecting' })).toBe(false);
    expect(patchChangesNothing(current, { watching: [] })).toBe(false);
    expect(patchChangesNothing(current, { watching: ['babi', 'allan'] })).toBe(false);
  });
});
