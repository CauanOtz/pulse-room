import { describe, expect, it } from 'vitest';
import { noiseGateThresholdDb } from '../../src/renderer/domain/conference';

describe('noiseGateThresholdDb', () => {
  it('maps the slider onto the usable range of speech thresholds', () => {
    expect(noiseGateThresholdDb(0)).toBe(-80);
    expect(noiseGateThresholdDb(60)).toBe(-50);
    expect(noiseGateThresholdDb(100)).toBe(-30);
  });

  it('keeps out-of-range values inside the usable range', () => {
    expect(noiseGateThresholdDb(-40)).toBe(-80);
    expect(noiseGateThresholdDb(400)).toBe(-30);
  });
});
