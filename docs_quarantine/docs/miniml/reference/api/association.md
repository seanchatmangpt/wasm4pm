# Association Rules API

Market basket analysis via the Apriori algorithm for frequent itemset mining and association rule generation. Call `await init()` before use.

---

## Apriori Algorithm

### `apriori`

```ts
function apriori(
  transactions: Uint32Array[],
  minSupport: number,
  minConfidence: number
): AssociationResult
```

Extracts frequent itemsets and generates association rules from transactional data using the Apriori algorithm.

| Parameter | Type | Description |
|-----------|------|-------------|
| `transactions` | `Uint32Array[]` | Array of transactions. Each transaction is an array of item indices (0-based integers). |
| `minSupport` | `number` | Minimum support threshold in [0, 1]. A rule is frequent if support >= minSupport. |
| `minConfidence` | `number` | Minimum confidence threshold in [0, 1]. A rule is generated if confidence >= minConfidence. |

**Returns:** `AssociationResult`

```ts
interface AssociationResult {
  rules: Array<{
    antecedent: number[];    // Item indices in the rule antecedent (left-hand side)
    consequent: number[];    // Item indices in the rule consequent (right-hand side)
    support: number;         // P(antecedent AND consequent) -- fraction of transactions
    confidence: number;      // P(consequent | antecedent) -- conditional probability
    lift: number;            // confidence / P(consequent) -- values > 1 indicate positive association
  }>;
}
```

**Metric definitions:**

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| **Support** | count(A AND B) / N | Fraction of transactions containing both antecedent and consequent |
| **Confidence** | count(A AND B) / count(A) | Probability of consequent given antecedent |
| **Lift** | confidence(A -> B) / support(B) | Strength of association. Lift = 1 implies independence. Lift > 1 implies positive correlation. Lift < 1 implies negative correlation. |

---

## Usage Notes

- Item indices in transactions are 0-based integers. Map your actual item identifiers to contiguous indices before calling `apriori`.
- Lower `minSupport` values increase computation time exponentially. Start with a higher value (e.g., 0.1) and decrease if needed.
- Rules are returned sorted by confidence in descending order.
- The consequent of each rule is always a single item. Multi-item consequents are decomposed into individual rules.
- Empty transactions (length 0) are ignored.
- For large datasets with many unique items, consider pre-filtering rare items before calling `apriori` to reduce computational cost.
