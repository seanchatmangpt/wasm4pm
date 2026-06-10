# RL (Symbolic Q-Learning)

## Origin
- **Paper:** "Q-learning" (1992, Machine Learning 8)
- **Authors:** Christopher J. C. H. Watkins, Peter Dayan
- **Tradition:** Temporal-difference reinforcement learning; off-policy control

## Algorithm
Tabular Q-learning over a symbolically declared MDP: `Q(s,a) ← Q(s,a) + α·(r + γ·max_a' Q(s',a') − Q(s,a))` with α = 0.5, ε-greedy exploration (ε = 0.1) drawn from the crate's single seeded RNG entry point (`support::rng::seeded_rng`, SmallRng seed 42) — runs are bit-exact deterministic. The interleaved episode loop is one multi-kind lifecycle phase; trace volume is bounded by per-episode `episode-end` summaries carrying the episode's max TD delta (per-step `q-update` events only for the first three episodes).

## Pseudocode
```
function run(input):
    model from mdp:* facts (γ ∈ [0,1), probs sum to 1, episodes ≤ 512)
    Q = BTreeMap default 0
    for ep in 0..episodes:                      # episode-start
        s = start
        while not terminal (≤64 steps):
            a = ε-greedy(Q, s) via seeded rng
            s', r = step(s, a)
            Q[s,a] += α·(r + γ·max_a' Q[s',a'] − Q[s,a])   # q-update (ep < 3)
        trace episode-end (max-delta)
    greedy policy per state (lex tie)           # extract-policy
    trace decision
```

## Input contract
- `facts`: `mdp:gamma`, `mdp:start`, `mdp:terminal:<s>`, `mdp:t:<s>:<a>` ("ns" or "ns1:p1,ns2:p2", probs sum to 1±1e-6), `mdp:r:<s>:<a>`, `rl:episodes` (1–512, default 200)
- refusals: γ ∉ [0,1); missing start/transitions; bad probabilities; episodes outside 1..=512

## Output contract
- `facts`: `policy:<s>` per non-terminal state; `q:<s>:<a>` to 6 dp
- `selected`: the policy action at the start state
- `inference_trace`: `load-mdp` → {`episode-start`,`q-update`,`episode-end`}+ → `extract-policy`+ → `decision`

## Complexity
O(episodes × steps × actions) with BTreeMap lookups; bounded by 512 × 64.

## Generalization examples
Chain/gridworld navigation, retry-policy learning, cache-eviction policy tuning over a small symbolic state space.

## Adversarial coverage
- Refusal: γ = 1.0; transition probabilities not summing to 1; >512 episodes
- Hidden oracle: 4-state chain with closed-form Q* — policy optimal at every state, max|Q − Q*| < 0.05, episode max-delta trend decreasing (early mean > late mean)
- Paper fixture: two-state task with Bellman fixed point Q*(s0,go) = 1, Q*(s0,stay) = 0.9

## See also
- `crates/wasm4pm-cognition/src/breeds/rl_symbolic.rs`; `src/breeds/support/{rng,mdp}.rs`
- OCPN: `ocel/models/l1/rl_symbolic.ocpn.json`; report: `ocel/reports/rl_symbolic.json`
