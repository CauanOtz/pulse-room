import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  askForFrameSize,
  installOpusFrameSize,
  useOpusFrameSize,
} from '../../src/renderer/infrastructure/media/opus-frame-size';

/** An answer shaped like the ones a forwarding unit actually sends. */
const answer = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0 1',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111 63 9 0 8',
  'c=IN IP4 0.0.0.0',
  'a=mid:0',
  'a=sendrecv',
  'a=rtpmap:111 opus/48000/2',
  'a=rtcp-fb:111 transport-cc',
  'a=fmtp:111 minptime=20;useinbandfec=1',
  'a=rtpmap:63 red/48000/2',
  'a=fmtp:63 111/111',
  'm=video 9 UDP/TLS/RTP/SAVPF 96',
  'c=IN IP4 0.0.0.0',
  'a=mid:1',
  'a=rtpmap:96 VP8/90000',
  '',
].join('\r\n');

const audioOf = (sdp: string) => sdp.slice(sdp.indexOf('m=audio'), sdp.indexOf('m=video'));
const videoOf = (sdp: string) => sdp.slice(sdp.indexOf('m=video'));

/** The shape a publisher connection really gets: audio, and nothing after it. */
const audioOnlyAnswer = [
  'v=0',
  'o=- 46117314 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111',
  'c=IN IP4 0.0.0.0',
  'a=mid:0',
  'a=rtpmap:111 opus/48000/2',
  'a=fmtp:111 minptime=20;useinbandfec=1',
  '',
].join('\r\n');

describe('askForFrameSize', () => {
  it('keeps the attributes above the end when audio is the last section', () => {
    const lines = askForFrameSize(audioOnlyAnswer, 10).split('\r\n');
    const blank = lines.indexOf('');

    // Everything the description says has to come before it stops saying it.
    expect(lines.indexOf('a=ptime:10')).toBeLessThan(blank);
    expect(lines.indexOf('a=maxptime:10')).toBeLessThan(blank);
    expect(lines.slice(blank).every((line) => line === '')).toBe(true);
  });

  it('asks the sender for frames of the length given', () => {
    const audio = audioOf(askForFrameSize(answer, 10));

    expect(audio).toContain('a=ptime:10');
    expect(audio).toContain('a=maxptime:10');
  });

  it('brings the floor down with the frame, so the two agree', () => {
    expect(askForFrameSize(answer, 10)).toContain('a=fmtp:111 minptime=10;useinbandfec=1');
  });

  it('leaves the video alone, which has nothing to do with it', () => {
    expect(videoOf(askForFrameSize(answer, 10))).toBe(videoOf(answer));
  });

  it('replaces a length already asked for rather than asking twice', () => {
    const once = askForFrameSize(answer, 10);
    const twice = askForFrameSize(once, 20);

    expect(twice.match(/a=ptime:/g)).toHaveLength(1);
    expect(twice).toContain('a=ptime:20');
    expect(twice).not.toContain('a=ptime:10');
  });

  it('touches nothing in a description with no Opus in it', () => {
    const videoOnly = ['v=0', 'm=video 9 UDP/TLS/RTP/SAVPF 96', 'a=rtpmap:96 VP8/90000', ''].join('\r\n');

    expect(askForFrameSize(videoOnly, 10)).toBe(videoOnly);
  });

  it('refuses a length that is not one, rather than writing nonsense', () => {
    expect(askForFrameSize(answer, 0)).toBe(answer);
    expect(askForFrameSize(answer, Number.NaN)).toBe(answer);
  });

  it('keeps the description terminated, which a parser insists on', () => {
    expect(askForFrameSize(answer, 10).endsWith('\r\n')).toBe(true);
  });

  it('keeps every line the answer arrived with', () => {
    const before = answer.split('\r\n').filter(Boolean);
    const after = askForFrameSize(answer, 10).split('\r\n').filter(Boolean);

    for (const line of before) {
      // The one line that changes is the floor, which is checked on its own.
      if (line.startsWith('a=fmtp:111')) continue;
      expect(after).toContain(line);
    }
  });
});

/**
 * The rewrite is installed on the platform itself, because there is no hook to
 * install it in. That makes what it does to a connection worth holding to.
 */
describe('installOpusFrameSize', () => {
  const applied: (RTCSessionDescriptionInit | undefined)[] = [];
  let refuseRewritten = false;

  class FakeConnection {
    async setRemoteDescription(description?: RTCSessionDescriptionInit): Promise<void> {
      applied.push(description);
      if (refuseRewritten && description?.sdp?.includes('a=ptime:')) {
        throw new Error('Failed to parse SessionDescription.');
      }
    }
  }

  const answer = (): RTCSessionDescriptionInit => ({
    type: 'answer',
    sdp: ['v=0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111', 'a=rtpmap:111 opus/48000/2', ''].join('\r\n'),
  });

  const connect = () => {
    vi.stubGlobal('RTCPeerConnection', FakeConnection);
    installOpusFrameSize();
    return new FakeConnection() as unknown as RTCPeerConnection;
  };

  afterEach(() => {
    applied.length = 0;
    refuseRewritten = false;
    useOpusFrameSize(undefined);
    vi.unstubAllGlobals();
  });

  it('asks for the shorter frame on the connection this client publishes on', async () => {
    const connection = connect();
    useOpusFrameSize(10);

    await connection.setRemoteDescription(answer());

    expect(applied).toHaveLength(1);
    expect(applied[0]?.sdp).toContain('a=ptime:10');
  });

  it('leaves an offer alone, whose packets were somebody else to decide', async () => {
    const connection = connect();
    useOpusFrameSize(10);
    const offer = { ...answer(), type: 'offer' as const };

    await connection.setRemoteDescription(offer);

    expect(applied[0]?.sdp).not.toContain('a=ptime:');
  });

  it('asks for nothing when nothing was asked of it', async () => {
    const connection = connect();

    await connection.setRemoteDescription(answer());

    expect(applied[0]?.sdp).not.toContain('a=ptime:');
  });

  it('falls back to the description the server wrote when it is refused', async () => {
    const connection = connect();
    useOpusFrameSize(10);
    refuseRewritten = true;

    // The call goes through: a room at twenty milliseconds beats no room.
    await expect(connection.setRemoteDescription(answer())).resolves.toBeUndefined();

    expect(applied).toHaveLength(2);
    expect(applied[0]?.sdp).toContain('a=ptime:10');
    expect(applied[1]?.sdp).not.toContain('a=ptime:');
  });
});
