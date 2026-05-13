# Recommendation API

Matrix factorization and collaborative filtering for recommendation systems. Call `await init()` before use.

---

## Matrix Factorization

### `matrixFactorization`

```ts
function matrixFactorization(
  ratings: Float64Array,
  nUsers: number,
  nItems: number,
  nFactors: number,
  maxIter: number,
  lr: number,
  reg: number,
  seed: number
): MFResult
```

Factorizes a sparse user-item rating matrix into latent user and item factor matrices using stochastic gradient descent.

| Parameter | Type | Description |
|-----------|------|-------------|
| `ratings` | `Float64Array` | Observed ratings in triplet format: [userId, itemId, rating, userId, itemId, rating, ...]. Each triplet is three consecutive elements. |
| `nUsers` | `number` | Total number of users |
| `nItems` | `number` | Total number of items |
| `nFactors` | `number` | Dimensionality of latent factor space |
| `maxIter` | `number` | Maximum number of SGD iterations |
| `lr` | `number` | Learning rate (step size), must be > 0 |
| `reg` | `number` | L2 regularization strength, must be >= 0 |
| `seed` | `number` | PRNG seed for factor initialization |

**Returns:** `MFResult`

```ts
interface MFResult {
  userFactors: Float64Array;    // User factor matrix (nUsers x nFactors), row-major
  itemFactors: Float64Array;    // Item factor matrix (nItems x nFactors), row-major
  predictions: Float64Array;    // Predicted ratings for the input triplets (length nRatings)
}
```

**Behavior:**
- Unobserved user-item pairs are not included in the loss computation.
- Factor matrices are initialized with small random values seeded by `seed`.
- The predicted rating for user `u` and item `i` is the dot product of `userFactors[u]` and `itemFactors[i]`.

---

## User-User Collaborative Filtering

### `userUserCollaborative`

```ts
function userUserCollaborative(
  ratings: Float64Array,
  nUsers: number,
  nItems: number,
  userId: number,
  k: number
): CollaborativeResult
```

Generates item recommendations for a target user using user-user collaborative filtering with cosine similarity.

| Parameter | Type | Description |
|-----------|------|-------------|
| `ratings` | `Float64Array` | Observed ratings in triplet format: [userId, itemId, rating, ...] |
| `nUsers` | `number` | Total number of users |
| `nItems` | `number` | Total number of items |
| `userId` | `number` | Target user ID for whom to generate recommendations |
| `k` | `number` | Number of nearest neighbors to consider |

**Returns:** `CollaborativeResult`

```ts
interface CollaborativeResult {
  recommendations: Array<{
    itemId: number;    // Recommended item ID
    score: number;     // Predicted rating for this item
  }>;
}
```

**Behavior:**
- Computes cosine similarity between the target user and all other users based on co-rated items.
- Selects the top `k` most similar users as neighbors.
- Predicts ratings for items the target user has not yet rated by weighted average of neighbor ratings.
- Recommendations are sorted by predicted score in descending order.

---

## Usage Notes

- Both functions accept ratings in the same triplet format: `[userIdx, itemIdx, rating, ...]` repeated for each observed rating.
- User and item IDs in the triplet format are 0-based indices. Map your external IDs to contiguous indices before calling.
- For `matrixFactorization`, typical values: `nFactors` in [10, 100], `lr` in [0.001, 0.01], `reg` in [0.01, 0.1].
- For `userUserCollaborative`, users with fewer than 2 co-rated items with the target user are excluded from similarity computation.
- Neither function handles cold-start (new users/items with no ratings). Pre-filter or use a separate cold-start strategy.
