# Explanation: Concept Drift Mathematics

Concept drift in process mining refers to the phenomenon where the underlying business process changes over time (e.g., due to a new law, a seasonal shift, or a system failure). 

## The Bose Algorithm

`wasm4pm` implements the Bose concept drift detection algorithm. It works by analyzing the statistical distribution of the Directly-Follows Graph (DFG) over a sliding window.

### Mathematical Approach
1. **Windowing:** The event log stream is divided into a Reference Window ($W_ref$) and a Sliding Window ($W_slide$).
2. **Feature Extraction:** A feature vector is extracted for both windows. This is typically the matrix of directly-follows relation frequencies ($a \rightarrow b$).
3. **Statistical Testing:** A statistical test (like the Chi-Square test or J-Measure) is applied to compare the feature vectors of $W_ref$ and $W_slide$.
4. **Thresholding:** If the statistical difference exceeds a predefined significance threshold ($\alpha$), a drift point is flagged.

By analyzing the specific relations that caused the shift, we can pinpoint exactly *where* in the process the change occurred.
