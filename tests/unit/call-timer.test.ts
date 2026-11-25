import { describe, expect, it } from 'vitest';
import { callStartedAt, formatElapsed } from '../../src/renderer/domain/roster';

describe('how long a call has been going', () => {
  it('starts when the person there longest joined', () => {
    expect(
      callStartedAt({
        roomId: 'r',
        occupants: [
          { identity: 'a', name: 'A', joinedAt: 5_000 },
          { identity: 'b', name: 'B', joinedAt: 2_000 },
          { identity: 'c', name: 'C' },
        ],
      }),
    ).toBe(2_000);
    expect(callStartedAt({ roomId: 'r', occupants: [] })).toBeUndefined();
    expect(callStartedAt(undefined)).toBeUndefined();
  });

  it('reads like a call timer', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(65_400)).toBe('1:05');
    expect(formatElapsed(3_729_000)).toBe('1:02:09');
    expect(formatElapsed(-5_000)).toBe('0:00');
  });
});
