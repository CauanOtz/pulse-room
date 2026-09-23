/**
 * Asks the encoder for shorter Opus frames.
 *
 * Opus packs a fixed slice of time into each packet, and twenty milliseconds is
 * the default everywhere. Those twenty milliseconds are spent before a single
 * byte leaves, on every word, and halving them was measured on this machine as
 * seventeen milliseconds off the trip from one person's microphone to
 * another's speakers: 66.7 ms to 49.8 ms through a real peer connection.
 *
 * What it costs is packets. Twice as many of them carry the same voice, and
 * each one pays for its own headers, which is roughly sixteen kilobits a
 * second more on the wire. Against a screen share at four megabits that is
 * nothing, and on a line that is already dropping packets it is the wrong
 * trade, which is why it follows the voice delay setting rather than being a
 * decision made once here.
 *
 * There is no supported way to ask for this. A sender packetises at the rate
 * the description it was handed asks for, and LiveKit does not offer a hook
 * into that description, so the answer is rewritten on its way in. Only the
 * answer: that is the connection this client publishes on, and it is the only
 * one whose packetisation is ours to choose. The server is never told, and
 * never needs to be, because a forwarding unit passes packets along whole
 * without looking at how long each one lasts.
 */

const ptimeLine = /^a=(ptime|maxptime):.*$/;

/** Splits an SDP into its session part and one string per media section. */
function sections(sdp: string): string[] {
  const lines = sdp.split(/\r\n|\n/);
  const parts: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.startsWith('m=') && current.length) {
      parts.push(current.join('\r\n'));
      current = [];
    }
    current.push(line);
  }
  if (current.length) parts.push(current.join('\r\n'));
  return parts;
}

/**
 * Returns the description with every Opus audio section asking for frames of
 * the length given. A description that has no Opus in it comes back untouched.
 */
export function askForFrameSize(sdp: string, milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return sdp;

  let changed = false;
  const rewritten = sections(sdp).map((section) => {
    if (!section.startsWith('m=audio') || !/a=rtpmap:\d+\s+opus\//i.test(section)) return section;

    changed = true;
    // A description ends on a blank line, and when the audio section is the
    // last one that blank line belongs to this section. Appending after it
    // puts attributes below the end of the description, which is not an SDP
    // any parser will accept.
    const lines = section.split('\r\n').filter((line) => !ptimeLine.test(line));
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    // minptime is the floor the sender promises not to go under, so it has to
    // come down with the frame or the two contradict each other.
    const adjusted = lines.map((line) =>
      line.startsWith('a=fmtp:') && line.includes('minptime=')
        ? line.replace(/minptime=\d+/, `minptime=${milliseconds}`)
        : line,
    );
    adjusted.push(`a=ptime:${milliseconds}`, `a=maxptime:${milliseconds}`);
    return adjusted.join('\r\n');
  });

  if (!changed) return sdp;
  // An SDP ends on a blank line, which the split above keeps as a final empty
  // entry; joining without one would leave the last attribute unterminated.
  const result = rewritten.join('\r\n');
  return result.endsWith('\r\n') ? result : `${result}\r\n`;
}

let desired: number | undefined;
let installed = false;

/**
 * The frame length this client will ask for from now on. Undefined leaves
 * every description exactly as the server wrote it.
 */
export function useOpusFrameSize(milliseconds: number | undefined): void {
  desired = milliseconds;
}

/**
 * Puts the rewrite in the path of every answer this renderer accepts. Safe to
 * call more than once; a second call does nothing.
 */
export function installOpusFrameSize(): void {
  if (installed || typeof RTCPeerConnection === 'undefined') return;
  installed = true;

  // The standard type still carries the callback form this was replaced by,
  // and calling through it needs the shape that is actually in use.
  type Apply = (this: RTCPeerConnection, description?: RTCSessionDescriptionInit) => Promise<void>;
  const original = RTCPeerConnection.prototype.setRemoteDescription as Apply;
  RTCPeerConnection.prototype.setRemoteDescription = function patched(
    this: RTCPeerConnection,
    description?: RTCSessionDescriptionInit,
  ) {
    // Anything but an answer belongs to the connection this client receives
    // on, where how long a packet lasts was decided by whoever sent it.
    if (!desired || description?.type !== 'answer' || !description.sdp) {
      return original.call(this, description as RTCSessionDescriptionInit);
    }

    // A call that connects at twenty milliseconds beats one that does not
    // connect at ten, and this rewrite has never met the server it will be
    // used against. A description that is refused is refused before anything
    // is applied, so the original can still be handed over afterwards.
    let rewritten: RTCSessionDescriptionInit;
    try {
      rewritten = { ...description, sdp: askForFrameSize(description.sdp, desired) };
    } catch (error) {
      console.warn('The shorter Opus frame could not be written; using the default.', error);
      return original.call(this, description);
    }

    return original.call(this, rewritten).catch((error: unknown) => {
      console.warn('The shorter Opus frame was refused; using the default.', error);
      return original.call(this, description);
    });
  } as typeof RTCPeerConnection.prototype.setRemoteDescription;
}
