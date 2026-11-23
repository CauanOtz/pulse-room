import { describe, expect, it } from 'vitest';
import { isNewer } from '../../src/renderer/components/update-prompt';

describe('which version is newer', () => {
  it('compares each part as a number, not as text', () => {
    expect(isNewer('0.10.0', '0.9.9')).toBe(true);
    expect(isNewer('0.20.0', '0.20.0')).toBe(false);
    expect(isNewer('0.19.1', '0.20.0')).toBe(false);
    expect(isNewer('1.0.0', '0.99.99')).toBe(true);
  });
});
