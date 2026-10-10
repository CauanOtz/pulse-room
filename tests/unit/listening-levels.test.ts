import { beforeEach, describe, expect, it } from 'vitest';
import { LiveKitConferenceGateway } from '../../src/renderer/infrastructure/conference/livekit-conference-gateway';
import { accountOf, ListeningLevels } from '../../src/renderer/infrastructure/persistence/listening-levels';

beforeEach(() => localStorage.clear());

describe('the level somebody is played at', () => {
  it('belongs to their account, not to the session they joined with', () => {
    expect(accountOf('68ff08f3-c3f1-4442-9743-1364b4808516:ba7ab6e4')).toBe(
      '68ff08f3-c3f1-4442-9743-1364b4808516',
    );
    expect(accountOf('maya')).toBe('maya');
  });

  it('is still there after the app is opened again', () => {
    new ListeningLevels().set('babi', { volume: 35 });
    new ListeningLevels().set('jack', { muted: true });

    const reopened = new ListeningLevels();
    expect(reopened.get('babi')).toEqual({ volume: 35, muted: false });
    expect(reopened.get('jack')).toEqual({ volume: 100, muted: true });
    expect(reopened.get('nobody')).toEqual({ volume: 100, muted: false });
  });

  it('keeps volume and mute apart, and forgets somebody put back to normal', () => {
    const levels = new ListeningLevels();
    levels.set('babi', { volume: 150 });
    levels.set('babi', { muted: true });
    expect(levels.get('babi')).toEqual({ volume: 150, muted: true });

    levels.set('babi', { volume: 100, muted: false });
    expect(JSON.parse(localStorage.getItem('pulse-room:listening:v1')!)).toEqual({});
  });

  it('stays within what the slider allows', () => {
    const levels = new ListeningLevels();
    levels.set('loud', { volume: 999 });
    levels.set('quiet', { volume: -4 });
    expect(levels.get('loud').volume).toBe(200);
    expect(levels.get('quiet').volume).toBe(0);
  });

  it('ignores a store somebody broke, rather than failing the call', () => {
    localStorage.setItem('pulse-room:listening:v1', '{broken');
    expect(new ListeningLevels().get('babi')).toEqual({ volume: 100, muted: false });
    localStorage.setItem(
      'pulse-room:listening:v1',
      JSON.stringify({ babi: { volume: 'loud' }, jack: { volume: 20, muted: false } }),
    );
    const levels = new ListeningLevels();
    expect(levels.get('babi')).toEqual({ volume: 100, muted: false });
    expect(levels.get('jack')).toEqual({ volume: 20, muted: false });
  });

  it('is what the call sets when a slider is moved, whichever session it was', () => {
    const levels = new ListeningLevels();
    const gateway = new LiveKitConferenceGateway({ apiUrl: 'https://pulse.test', accessCode: 'x' }, levels);

    gateway.setParticipantVolume('babi-account:first-session', 40);
    gateway.setParticipantMuted('jack-account:another', true);

    expect(new ListeningLevels().get('babi-account')).toEqual({ volume: 40, muted: false });
    expect(new ListeningLevels().get('jack-account')).toEqual({ volume: 100, muted: true });
  });
});
