/**
 * Feature Scaling and Normalization — Iteration 20b
 *
 * Implements 4 scaling methods to prepare features for ML algorithms:
 * 1. **Standardization (Z-score)**: zero-mean, unit-variance — best for linear models
 * 2. **Min-Max Scaling**: [0,1] range — best for distance-based algorithms
 * 3. **Robust Scaling**: median/IQR-based — resistant to outliers
 * 4. **Mean Normalization**: (x - mean) / (max - min) — alternative normalization
 *
 * All methods return scaling parameters for inverse transformation.
 * No external dependencies — pure TypeScript implementation.
 */

/**
 * Result of a scaling operation: scaled data + inverse transform parameters.
 */
export interface ScaledResult {
  /** Scaled feature matrix (same shape as input) */
  scaled: number[][];
  /** Per-feature scaling parameters (for inverse transform) */
  scaleParams: ScaleParams;
}

/**
 * Parameters needed to inverse-transform scaled data back to original scale.
 * Structure varies by scaling method.
 */
export interface ScaleParams {
  /** Scaling method used: 'standardize' | 'minmax' | 'robust' | 'mean' */
  method: 'standardize' | 'minmax' | 'robust' | 'mean';

  // For standardization: means and standard deviations
  means?: number[];
  stds?: number[];

  // For min-max: minimum and maximum per feature
  mins?: number[];
  maxs?: number[];

  // For robust: medians and IQRs per feature
  medians?: number[];
  iqrs?: number[];

  // For mean: means, mins, maxs per feature
  // (means and maxs reused from above)
}

/**
 * Standardize features to zero-mean, unit-variance (Z-score normalization).
 *
 * Formula: x_scaled = (x - mean) / std
 *
 * Benefits:
 *   - Suitable for linear regression, logistic regression, SVM
 *   - Centers distribution at 0
 *   - Assumes roughly normal distribution
 *
 * Limitations:
 *   - Sensitive to outliers (mean and std are outlier-sensitive)
 *   - Unbounded range (can extend beyond [-3, 3])
 *
 * @param data - Numeric feature matrix (rows = samples, cols = features)
 * @returns Scaled data with means and stds for inverse transform
 */
export function standardizeFeatures(data: number[][]): ScaledResult {
  if (!data || data.length === 0 || data[0].length === 0) {
    return { scaled: [], scaleParams: { method: 'standardize', means: [], stds: [] } };
  }

  const numRows = data.length;
  const numCols = data[0].length;

  // Compute mean per column
  const means = new Array<number>(numCols).fill(0);
  for (let j = 0; j < numCols; j++) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < numRows; i++) {
      const val = data[i][j];
      if (Number.isFinite(val)) {
        sum += val;
        count++;
      }
    }
    means[j] = count > 0 ? sum / count : 0;
  }

  // Compute standard deviation per column
  const stds = new Array<number>(numCols).fill(0);
  for (let j = 0; j < numCols; j++) {
    let sumSq = 0;
    let count = 0;
    for (let i = 0; i < numRows; i++) {
      const val = data[i][j];
      if (Number.isFinite(val)) {
        const diff = val - means[j];
        sumSq += diff * diff;
        count++;
      }
    }
    const variance = count > 0 ? sumSq / count : 0;
    stds[j] = Math.sqrt(variance);
  }

  // Scale: (x - mean) / std, handling zero-std columns
  const scaled = data.map((row) =>
    row.map((val, j) => {
      if (!Number.isFinite(val)) return 0;
      const std = stds[j];
      if (std === 0) {
        // Constant feature: map to 0 (zero after centering)
        return 0;
      }
      return (val - means[j]) / std;
    })
  );

  return {
    scaled,
    scaleParams: { method: 'standardize', means, stds },
  };
}

/**
 * Scale features to [0, 1] range using min-max normalization.
 *
 * Formula: x_scaled = (x - min) / (max - min)
 *
 * Benefits:
 *   - Bounded output range [0, 1]
 *   - Preserves zero values (if 0 is in the original range)
 *   - Good for algorithms sensitive to feature magnitude (k-NN, SVM)
 *
 * Limitations:
 *   - Sensitive to outliers (one extreme value distorts the whole range)
 *   - New data outside training range may scale outside [0, 1]
 *
 * @param data - Numeric feature matrix
 * @returns Scaled data with mins and maxs for inverse transform
 */
export function minMaxScale(data: number[][]): ScaledResult {
  if (!data || data.length === 0 || data[0].length === 0) {
    return { scaled: [], scaleParams: { method: 'minmax', mins: [], maxs: [] } };
  }

  const numRows = data.length;
  const numCols = data[0].length;

  // Compute min/max per column
  const mins = new Array<number>(numCols).fill(Infinity);
  const maxs = new Array<number>(numCols).fill(-Infinity);

  for (let i = 0; i < numRows; i++) {
    for (let j = 0; j < numCols; j++) {
      const val = data[i][j];
      if (Number.isFinite(val)) {
        mins[j] = Math.min(mins[j], val);
        maxs[j] = Math.max(maxs[j], val);
      }
    }
  }

  // Scale: (x - min) / (max - min), handling constant features
  const scaled = data.map((row) =>
    row.map((val, j) => {
      if (!Number.isFinite(val)) return 0.5;
      const min = mins[j];
      const max = maxs[j];
      if (min === Infinity || max === -Infinity) {
        // No valid values in column
        return 0.5;
      }
      if (max === min) {
        // Constant feature
        return 0.5;
      }
      return (val - min) / (max - min);
    })
  );

  return {
    scaled,
    scaleParams: { method: 'minmax', mins, maxs },
  };
}

/**
 * Scale features using robust scaling (median and IQR-based).
 *
 * Formula: x_scaled = (x - median) / IQR
 * where IQR = Q3 - Q1 (interquartile range)
 *
 * Benefits:
 *   - Robust to outliers (uses median and IQR, not mean/std)
 *   - Good for data with extreme outliers
 *   - Suitable for models sensitive to outliers (linear regression)
 *
 * Limitations:
 *   - Unbounded output range (like standardization)
 *   - May not scale as tightly as min-max for clean data
 *
 * @param data - Numeric feature matrix
 * @returns Scaled data with medians and IQRs for inverse transform
 */
export function robustScale(data: number[][]): ScaledResult {
  if (!data || data.length === 0 || data[0].length === 0) {
    return { scaled: [], scaleParams: { method: 'robust', medians: [], iqrs: [] } };
  }

  const numRows = data.length;
  const numCols = data[0].length;

  const medians = new Array<number>(numCols).fill(0);
  const iqrs = new Array<number>(numCols).fill(1); // Default IQR = 1 to avoid division by zero

  // Per-column: compute median and IQR
  for (let j = 0; j < numCols; j++) {
    // Collect finite values for this column
    const col = [];
    for (let i = 0; i < numRows; i++) {
      const val = data[i][j];
      if (Number.isFinite(val)) {
        col.push(val);
      }
    }

    if (col.length === 0) {
      medians[j] = 0;
      iqrs[j] = 1;
      continue;
    }

    // Sort to compute quantiles
    col.sort((a, b) => a - b);

    // Median (50th percentile)
    const medianIdx = Math.floor(col.length / 2);
    if (col.length % 2 === 0) {
      medians[j] = (col[medianIdx - 1] + col[medianIdx]) / 2;
    } else {
      medians[j] = col[medianIdx];
    }

    // Q1 (25th percentile) and Q3 (75th percentile)
    const q1Idx = Math.floor(col.length * 0.25);
    const q3Idx = Math.floor(col.length * 0.75);
    const q1 = col[q1Idx];
    const q3 = col[q3Idx];
    const iqr = q3 - q1;

    // Avoid division by zero: if IQR is 0, use 1
    iqrs[j] = iqr > 0 ? iqr : 1;
  }

  // Scale: (x - median) / IQR
  const scaled = data.map((row) =>
    row.map((val, j) => {
      if (!Number.isFinite(val)) return 0;
      return (val - medians[j]) / iqrs[j];
    })
  );

  return {
    scaled,
    scaleParams: { method: 'robust', medians, iqrs },
  };
}

/**
 * Scale features using mean normalization.
 *
 * Formula: x_scaled = (x - mean) / (max - min)
 *
 * Benefits:
 *   - Centers values around 0 with bounded magnitude
 *   - Less aggressive than min-max, more centered than standardization
 *   - Good middle-ground for algorithms sensitive to both scale and centering
 *
 * Limitations:
 *   - Still sensitive to outliers (mean and max/min are outlier-sensitive)
 *   - Range approximately [-1, 1] but depends on data distribution
 *
 * @param data - Numeric feature matrix
 * @returns Scaled data with means, mins, maxs for inverse transform
 */
export function meanNormalize(data: number[][]): ScaledResult {
  if (!data || data.length === 0 || data[0].length === 0) {
    return { scaled: [], scaleParams: { method: 'mean', means: [], mins: [], maxs: [] } };
  }

  const numRows = data.length;
  const numCols = data[0].length;

  // Compute mean, min, max per column
  const means = new Array<number>(numCols).fill(0);
  const mins = new Array<number>(numCols).fill(Infinity);
  const maxs = new Array<number>(numCols).fill(-Infinity);

  for (let i = 0; i < numRows; i++) {
    for (let j = 0; j < numCols; j++) {
      const val = data[i][j];
      if (Number.isFinite(val)) {
        means[j] += val;
        mins[j] = Math.min(mins[j], val);
        maxs[j] = Math.max(maxs[j], val);
      }
    }
  }

  // Finalize means
  for (let j = 0; j < numCols; j++) {
    let count = 0;
    let sum = 0;
    for (let i = 0; i < numRows; i++) {
      const val = data[i][j];
      if (Number.isFinite(val)) {
        sum += val;
        count++;
      }
    }
    means[j] = count > 0 ? sum / count : 0;
  }

  // Scale: (x - mean) / (max - min)
  const scaled = data.map((row) =>
    row.map((val, j) => {
      if (!Number.isFinite(val)) return 0;
      const min = mins[j];
      const max = maxs[j];
      if (min === Infinity || max === -Infinity || max === min) {
        // No valid values or constant feature
        return 0;
      }
      return (val - means[j]) / (max - min);
    })
  );

  return {
    scaled,
    scaleParams: { method: 'mean', means, mins, maxs },
  };
}

/**
 * Inverse transform scaled data back to original scale.
 *
 * @param scaledData - Scaled feature matrix from one of the scaling functions
 * @param scaleParams - Scale parameters returned from scaling function
 * @returns Original-scale feature matrix
 */
export function inverseTransform(scaledData: number[][], scaleParams: ScaleParams): number[][] {
  if (!scaledData || scaledData.length === 0 || scaledData[0].length === 0) {
    return scaledData;
  }

  const method = scaleParams.method;

  if (method === 'standardize') {
    // Inverse: x = x_scaled * std + mean
    const means = scaleParams.means ?? [];
    const stds = scaleParams.stds ?? [];
    return scaledData.map((row) =>
      row.map((val, j) => {
        const std = stds[j] ?? 1;
        const mean = means[j] ?? 0;
        return val * std + mean;
      })
    );
  }

  if (method === 'minmax') {
    // Inverse: x = x_scaled * (max - min) + min
    const mins = scaleParams.mins ?? [];
    const maxs = scaleParams.maxs ?? [];
    return scaledData.map((row) =>
      row.map((val, j) => {
        const min = mins[j] ?? 0;
        const max = maxs[j] ?? 1;
        return val * (max - min) + min;
      })
    );
  }

  if (method === 'robust') {
    // Inverse: x = x_scaled * IQR + median
    const medians = scaleParams.medians ?? [];
    const iqrs = scaleParams.iqrs ?? [];
    return scaledData.map((row) =>
      row.map((val, j) => {
        const median = medians[j] ?? 0;
        const iqr = iqrs[j] ?? 1;
        return val * iqr + median;
      })
    );
  }

  if (method === 'mean') {
    // Inverse: x = x_scaled * (max - min) + mean
    const means = scaleParams.means ?? [];
    const mins = scaleParams.mins ?? [];
    const maxs = scaleParams.maxs ?? [];
    return scaledData.map((row) =>
      row.map((val, j) => {
        const min = mins[j] ?? 0;
        const max = maxs[j] ?? 1;
        const mean = means[j] ?? 0;
        return val * (max - min) + mean;
      })
    );
  }

  // Unknown method: return as-is
  return scaledData;
}

/**
 * Compare different scaling methods and return statistics.
 *
 * Useful for understanding which method best suits your data distribution.
 *
 * @param data - Numeric feature matrix
 * @returns Statistics for all 4 scaling methods
 */
export interface ScalingComparison {
  /** Per-feature mean after scaling */
  standardize_means: number[];
  /** Per-feature std after scaling */
  standardize_stds: number[];
  /** Per-feature min after scaling */
  minmax_mins: number[];
  /** Per-feature max after scaling */
  minmax_maxs: number[];
  /** Per-feature median after scaling */
  robust_medians: number[];
  /** Per-feature IQR after scaling */
  robust_iqrs: number[];
  /** Recommended method based on data characteristics */
  recommendedMethod: 'standardize' | 'minmax' | 'robust' | 'mean';
  /** Reason for recommendation */
  reason: string;
}

export function compareScalingMethods(data: number[][]): ScalingComparison {
  const standardized = standardizeFeatures(data);
  const minmaxed = minMaxScale(data);
  const robust = robustScale(data);

  // Analyze data characteristics to recommend method
  const numCols = data[0]?.length ?? 0;
  let outlierCount = 0;

  // Simple outlier detection via 3-sigma rule
  if (standardized.scaleParams.means && standardized.scaleParams.stds) {
    const means = standardized.scaleParams.means;
    const stds = standardized.scaleParams.stds;
    for (let i = 0; i < data.length; i++) {
      for (let j = 0; j < numCols; j++) {
        const val = data[i][j];
        if (Number.isFinite(val)) {
          const zscore = Math.abs((val - means[j]) / (stds[j] || 1));
          if (zscore > 3) {
            outlierCount++;
          }
        }
      }
    }
  }

  let recommendedMethod: 'standardize' | 'minmax' | 'robust' | 'mean' = 'standardize';
  let reason = 'Default for linear models';

  if (outlierCount > data.length * numCols * 0.05) {
    // >5% outliers: use robust scaling
    recommendedMethod = 'robust';
    reason = 'Data has significant outliers (>5%); robust scaling recommended';
  } else {
    // Check data range
    if (minmaxed.scaleParams.mins && minmaxed.scaleParams.maxs) {
      const ranges = minmaxed.scaleParams.maxs.map((max, j) => {
        const min = minmaxed.scaleParams.mins![j] ?? 0;
        return max - min;
      });
      const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;

      if (avgRange < 10) {
        recommendedMethod = 'minmax';
        reason = 'Data range is small; min-max scaling preserves relative magnitudes';
      }
    }
  }

  return {
    standardize_means: standardized.scaleParams.means ?? [],
    standardize_stds: standardized.scaleParams.stds ?? [],
    minmax_mins: minmaxed.scaleParams.mins ?? [],
    minmax_maxs: minmaxed.scaleParams.maxs ?? [],
    robust_medians: robust.scaleParams.medians ?? [],
    robust_iqrs: robust.scaleParams.iqrs ?? [],
    recommendedMethod,
    reason,
  };
}
