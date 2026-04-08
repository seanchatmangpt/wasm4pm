import { describe, it, expect } from 'vitest';
import { reduceFeaturesPCA } from '../reduction.js';

describe('reduceFeaturesPCA', () => {
  const features = [
    { case_id: 'c1', f1: 1, f2: 2, f3: 3, f4: 4 },
    { case_id: 'c2', f1: 2, f2: 4, f3: 6, f4: 8 },
    { case_id: 'c3', f1: 1.5, f2: 3, f3: 4.5, f4: 6 },
    { case_id: 'c4', f1: 3, f2: 6, f3: 9, f4: 12 },
    { case_id: 'c5', f1: 2.5, f2: 5, f3: 7.5, f4: 10 },
  ];

  it('reduces to 2 components', async () => {
    const result = await reduceFeaturesPCA(features, { nComponents: 2 });

    expect(result.nComponents).toBe(2);
    expect(result.originalFeatureCount).toBe(4);
    expect(result.transformedData).toHaveLength(5);
    for (const row of result.transformedData) {
      expect(row).toHaveLength(2);
    }
    expect(result.explainedVariance).toHaveLength(2);
    expect(result.components).toHaveLength(2);
    expect(result.featureNames).toEqual(['f1', 'f2', 'f3', 'f4']);
  });

  it('reduces to 1 component', async () => {
    const result = await reduceFeaturesPCA(features, { nComponents: 1 });
    expect(result.nComponents).toBe(1);
    expect(result.transformedData[0]).toHaveLength(1);
  });

  it('throws for insufficient data', async () => {
    await expect(
      reduceFeaturesPCA([{ case_id: 'c1', f1: 1 }]),
    ).rejects.toThrow('Need at least 2 traces and 2 features');
  });
});
