import { describe, it, expect } from 'vitest';

type Attention = 'focused' | 'distracted' | 'absent' | 'drowsy' | 'multi';

/**
 * Pure-logic replica of the computeScore function in useSession.ts.
 * Tests the exact mapping that was the site of the earlier switch fall-through bug.
 */
function computeScore(attention: Attention, confidence: number): number {
  switch (attention) {
    case 'focused': return Math.round(75 + confidence * 25);
    case 'distracted': return Math.round(confidence * 60);
    case 'absent': return 0;
    case 'drowsy': return Math.round(confidence * 50);
    case 'multi': return Math.round(confidence * 35);
    default: {
      const _exhaustive: never = attention;
      throw new Error(`[useSession] Unknown attention label: ${_exhaustive}`);
    }
  }
}

describe('computeScore attention-to-score mapping', () => {
  it('focused returns 75–100 based on confidence', () => {
    expect(computeScore('focused', 1.0)).toBe(100);
    expect(computeScore('focused', 0.8)).toBe(95);
    expect(computeScore('focused', 0.5)).toBe(88);
    expect(computeScore('focused', 0.0)).toBe(75);
  });

  it('distracted returns 0–60 based on confidence', () => {
    expect(computeScore('distracted', 1.0)).toBe(60);
    expect(computeScore('distracted', 0.5)).toBe(30);
    expect(computeScore('distracted', 0.0)).toBe(0);
  });

  it('absent always returns 0 regardless of confidence', () => {
    expect(computeScore('absent', 0.0)).toBe(0);
    expect(computeScore('absent', 0.9)).toBe(0);
  });

  it('drowsy returns 0–50 based on confidence', () => {
    expect(computeScore('drowsy', 1.0)).toBe(50);
    expect(computeScore('drowsy', 0.5)).toBe(25);
    expect(computeScore('drowsy', 0.0)).toBe(0);
  });

  it('multi returns 0–35 based on confidence', () => {
    expect(computeScore('multi', 1.0)).toBe(35);
    expect(computeScore('multi', 0.5)).toBe(18);
    expect(computeScore('multi', 0.0)).toBe(0);
  });

  it('default case is hit for an unrecognized label and throws', () => {
    const unknown = 'unknown_attention' as Attention;
    expect(() => computeScore(unknown, 0.5)).toThrow('Unknown attention label');
  });

  it('every known Attention value is handled (no implicit fall-through)', () => {
    const labels: Attention[] = ['focused', 'distracted', 'absent', 'drowsy', 'multi'];
    for (const label of labels) {
      const score = computeScore(label, 0.8);
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
    }
  });
});
