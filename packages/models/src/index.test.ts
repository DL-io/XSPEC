import { describe, expect, it } from 'vitest';
import { buildEnsemble } from './index';

describe('ensemble', () => {
  it('requires at least three successful models', () => {
    expect(buildEnsemble([{ modelId: 'a', probability: 0.5, confidenceWeight: 1, evidence: [], freshnessScore: 1 }]).recommendTrade).toBe(false);
  });
  it('downweights outliers and blocks high disagreement', () => {
    const result = buildEnsemble([
      { modelId: 'a', probability: 0.51, confidenceWeight: 1, evidence: [], freshnessScore: 1 },
      { modelId: 'b', probability: 0.52, confidenceWeight: 1, evidence: [], freshnessScore: 1 },
      { modelId: 'c', probability: 0.9, confidenceWeight: 1, evidence: [], freshnessScore: 1 }
    ]);
    expect(result.outlierModels).toContain('c');
    expect(result.recommendTrade).toBe(false);
  });

  it('skips malformed model output', () => {
    const result = buildEnsemble([{ modelId: 'bad', probability: Number.NaN, confidenceWeight: 1, evidence: [], freshnessScore: 1 }]);
    expect(result.recommendTrade).toBe(false);
    expect(result.skipReason).toContain('malformed model output');
  });
});
