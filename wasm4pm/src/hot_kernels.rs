#![allow(dead_code)]
#![allow(non_camel_case_types)]

pub type Id = u32;
pub type Word = u64;
pub type Seed = u64;
pub type Flags = u32;
pub type Tick = u8;

pub const CHATMAN_CONSTANT_TICKS: Tick = 8;
pub const MAX_TRIPLES: usize = 8;

// ============================================================
// CORE PRIMITIVES
// ============================================================

#[repr(C)]
#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub struct Triple {
    pub s: Id,
    pub p: Id,
    pub o: Id,
}

#[repr(C)]
#[derive(Copy, Clone)]
pub struct Construct8 {
    pub len: u8,
    pub triples: [Triple; MAX_TRIPLES],
}

impl Construct8 {
    #[inline(always)]
    pub const fn empty() -> Self {
        const Z: Triple = Triple { s: 0, p: 0, o: 0 };
        Self { len: 0, triples: [Z; MAX_TRIPLES] }
    }

    #[inline(always)]
    pub fn push_unchecked(&mut self, t: Triple) {
        let i = self.len as usize;
        self.triples[i] = t;
        self.len += 1;
    }

    #[inline(always)]
    pub fn as_slice(&self) -> &[Triple] {
        &self.triples[..self.len as usize]
    }
}

#[repr(C)]
#[derive(Copy, Clone, PartialEq, Eq)]
pub struct HotState {
    pub current: Id,
    pub previous: Id,
    pub epoch: Id,
    pub flags: Flags,
}

#[repr(C)]
#[derive(Copy, Clone, PartialEq, Eq)]
pub struct HotPredicates {
    pub has_current: Id,
    pub had_previous: Id,
    pub has_epoch: Id,
    pub has_flags: Id,
    pub has_edge_lo: Id,
    pub has_edge_hi: Id,
    pub has_lawful: Id,
    pub has_receipt: Id,
}

#[repr(C)]
#[derive(Copy, Clone, PartialEq, Eq)]
pub struct HotIds {
    pub lawful_true: Id,
    pub lawful_false: Id,
}

#[repr(C)]
#[derive(Copy, Clone, PartialEq, Eq)]
pub struct TransitionRule {
    pub from: Id,
    pub to: Id,
    pub require_mask: Flags,
    pub forbid_mask: Flags,
}

#[repr(C)]
#[derive(Copy, Clone, PartialEq, Eq)]
pub struct IngressResult {
    pub lawful: u8,
    pub ticks: Tick,
    pub edge_lo: Id,
    pub edge_hi: Id,
    pub next_state: HotState,
    pub receipt_seed: Seed,
}

// ============================================================
// BIT / BOOLEAN / SELECTION KERNELS
// ============================================================

#[inline(always)]
pub const fn ask_eq_u32(a: u32, b: u32) -> u8 {
    (a == b) as u8
}

#[inline(always)]
pub const fn ask_ne_u32(a: u32, b: u32) -> u8 {
    (a != b) as u8
}

#[inline(always)]
pub const fn compare_lt_u32(a: u32, b: u32) -> u8 {
    (a < b) as u8
}

#[inline(always)]
pub const fn compare_le_u32(a: u32, b: u32) -> u8 {
    (a <= b) as u8
}

#[inline(always)]
pub const fn compare_gt_u32(a: u32, b: u32) -> u8 {
    (a > b) as u8
}

#[inline(always)]
pub const fn compare_ge_u32(a: u32, b: u32) -> u8 {
    (a >= b) as u8
}

#[inline(always)]
pub const fn validate_range_u32(x: u32, lo: u32, hi: u32) -> u8 {
    ((x >= lo) & (x <= hi)) as u8
}

#[inline(always)]
pub const fn flag_all_set(flags: Flags, mask: Flags) -> u8 {
    ((flags & mask) == mask) as u8
}

#[inline(always)]
pub const fn flag_any_set(flags: Flags, mask: Flags) -> u8 {
    ((flags & mask) != 0) as u8
}

#[inline(always)]
pub const fn flag_none_set(flags: Flags, mask: Flags) -> u8 {
    ((flags & mask) == 0) as u8
}

#[inline(always)]
pub const fn select_u32(pred: u8, yes: u32, no: u32) -> u32 {
    let m = 0u32.wrapping_sub(pred as u32);
    (yes & m) | (no & !m)
}

#[inline(always)]
pub const fn select_u64(pred: u8, yes: u64, no: u64) -> u64 {
    let m = 0u64.wrapping_sub(pred as u64);
    (yes & m) | (no & !m)
}

#[inline(always)]
pub const fn min_u32(a: u32, b: u32) -> u32 {
    select_u32((a < b) as u8, a, b)
}

#[inline(always)]
pub const fn max_u32(a: u32, b: u32) -> u32 {
    select_u32((a > b) as u8, a, b)
}

#[inline(always)]
pub const fn clamp_u32(x: u32, lo: u32, hi: u32) -> u32 {
    min_u32(max_u32(x, lo), hi)
}

#[inline(always)]
pub const fn abs_diff_u32(a: u32, b: u32) -> u32 {
    let lt = (a < b) as u8;
    select_u32(lt, b.wrapping_sub(a), a.wrapping_sub(b))
}

#[inline(always)]
pub const fn parity_u64(x: u64) -> u8 {
    (x.count_ones() as u8) & 1
}

#[inline(always)]
pub const fn popcount_u64(x: u64) -> u32 {
    x.count_ones()
}

#[inline(always)]
pub const fn trailing_zeros_u64(x: u64) -> u32 {
    x.trailing_zeros()
}

#[inline(always)]
pub const fn leading_zeros_u64(x: u64) -> u32 {
    x.leading_zeros()
}

// ============================================================
// PACKING / HASH / RECEIPT MIXING
// ============================================================

#[inline(always)]
pub const fn pack_u32x2(a: u32, b: u32) -> u64 {
    ((a as u64) << 32) | (b as u64)
}

#[inline(always)]
pub const fn unpack_hi_u32(x: u64) -> u32 {
    (x >> 32) as u32
}

#[inline(always)]
pub const fn unpack_lo_u32(x: u64) -> u32 {
    x as u32
}

#[inline(always)]
pub const fn pack_edge(src: Id, dst: Id) -> Seed {
    pack_u32x2(src, dst)
}

#[inline(always)]
pub const fn edge_hi(edge: Seed) -> Id {
    unpack_hi_u32(edge)
}

#[inline(always)]
pub const fn edge_lo(edge: Seed) -> Id {
    unpack_lo_u32(edge)
}

#[inline(always)]
pub const fn rotl64(x: u64, n: u32) -> u64 {
    x.rotate_left(n)
}

#[inline(always)]
pub const fn rotr64(x: u64, n: u32) -> u64 {
    x.rotate_right(n)
}

#[inline(always)]
pub const fn xorshift64(mut x: u64) -> u64 {
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    x
}

#[inline(always)]
pub const fn fmix64(mut k: u64) -> u64 {
    k ^= k >> 33;
    k = k.wrapping_mul(0xff51afd7ed558ccd);
    k ^= k >> 33;
    k = k.wrapping_mul(0xc4ceb9fe1a85ec53);
    k ^= k >> 33;
    k
}

#[inline(always)]
pub const fn receipt_seed_mix(
    prev: Seed,
    case_id: Id,
    current: Id,
    next: Id,
    epoch: Id,
    flags: Flags,
) -> Seed {
    let x =
        prev ^
        ((case_id as u64) << 1) ^
        ((current as u64) << 17) ^
        ((next as u64) << 33) ^
        ((epoch as u64) << 49) ^
        (flags as u64);

    fmix64(x)
}

#[inline(always)]
pub const fn receipt_seed_mix3(a: u64, b: u64, c: u64) -> u64 {
    fmix64(a ^ rotl64(b, 21) ^ rotr64(c, 7))
}

// ============================================================
// BITHASH KERNELS
// ============================================================

#[inline(always)]
pub const fn bithash_u64(x: u64) -> u64 {
    fmix64(x ^ 0x9e3779b97f4a7c15)
}

#[inline(always)]
pub const fn bithash_u32_pair(a: u32, b: u32) -> u64 {
    bithash_u64(pack_u32x2(a, b))
}

#[inline(always)]
pub const fn bithash_u32_triple(a: u32, b: u32, c: u32) -> u64 {
    fmix64(((a as u64) << 32) ^ (b as u64) ^ ((c as u64) << 13))
}

// ============================================================
// BITMPHF KERNELS
// Fixed O(1) query against precomputed arrays.
// ============================================================

#[repr(C)]
#[derive(Copy, Clone)]
pub struct bitmphf3 {
    pub seed0: u64,
    pub seed1: u64,
    pub seed2: u64,
    pub mask: u32,
}

#[inline(always)]
pub const fn bitmphf_index_u32(cfg: &bitmphf3, key: u32) -> u32 {
    let h0 = fmix64((key as u64) ^ cfg.seed0) as u32;
    let h1 = fmix64((key as u64) ^ cfg.seed1) as u32;
    let h2 = fmix64((key as u64) ^ cfg.seed2) as u32;
    (h0 ^ h1 ^ h2) & cfg.mask
}

// ============================================================
// BITXOR FILTER KERNELS
// <= 3 probes membership test
// ============================================================

#[repr(C)]
#[derive(Copy, Clone)]
pub struct bitxor3 {
    pub seed: u64,
    pub block_mask: u32,
}

#[inline(always)]
pub const fn bitxor_fingerprint32(x: u32, seed: u64) -> u32 {
    let h = fmix64((x as u64) ^ seed);
    let fp = (h as u32) ^ ((h >> 32) as u32);
    if fp == 0 { 1 } else { fp }
}

#[inline(always)]
pub const fn bitxor_idx0(cfg: &bitxor3, key: u32) -> u32 {
    (fmix64((key as u64) ^ cfg.seed) as u32) & cfg.block_mask
}

#[inline(always)]
pub const fn bitxor_idx1(cfg: &bitxor3, key: u32) -> u32 {
    (fmix64((key as u64) ^ rotl64(cfg.seed, 21)) as u32) & cfg.block_mask
}

#[inline(always)]
pub const fn bitxor_idx2(cfg: &bitxor3, key: u32) -> u32 {
    (fmix64((key as u64) ^ rotr64(cfg.seed, 11)) as u32) & cfg.block_mask
}

#[inline(always)]
pub fn bitxor_contains_u32(
    cfg: &bitxor3,
    table: &[u32],
    key: u32,
) -> u8 {
    let i0 = bitxor_idx0(cfg, key) as usize;
    let i1 = bitxor_idx1(cfg, key) as usize;
    let i2 = bitxor_idx2(cfg, key) as usize;
    let fp = bitxor_fingerprint32(key, cfg.seed);
    ((table[i0] ^ table[i1] ^ table[i2]) == fp) as u8
}

// ============================================================
// BITSET KERNELS
// word-level operations
// ============================================================

#[inline(always)]
pub const fn bitset_and(a: Word, b: Word) -> Word {
    a & b
}

#[inline(always)]
pub const fn bitset_or(a: Word, b: Word) -> Word {
    a | b
}

#[inline(always)]
pub const fn bitset_xor(a: Word, b: Word) -> Word {
    a ^ b
}

#[inline(always)]
pub const fn bitset_andnot(a: Word, b: Word) -> Word {
    a & !b
}

#[inline(always)]
pub const fn bitset_contains(mask: Word, bit_index: u32) -> u8 {
    (((mask >> bit_index) & 1) != 0) as u8
}

#[inline(always)]
pub const fn bitset_set(mask: Word, bit_index: u32) -> Word {
    mask | (1u64 << bit_index)
}

#[inline(always)]
pub const fn bitset_clear(mask: Word, bit_index: u32) -> Word {
    mask & !(1u64 << bit_index)
}

#[inline(always)]
pub const fn bitset_toggle(mask: Word, bit_index: u32) -> Word {
    mask ^ (1u64 << bit_index)
}

// ============================================================
// BITLOUDS KERNELS
// succinct trie step primitives
// ============================================================

#[inline(always)]
pub const fn rank1_u64(word: u64, pos_inclusive: u32) -> u32 {
    if pos_inclusive >= 63 {
        word.count_ones()
    } else {
        let mask = (1u64 << (pos_inclusive + 1)) - 1;
        (word & mask).count_ones()
    }
}

#[inline(always)]
pub const fn select1_u64(word: u64, nth1_zero_based: u32) -> u32 {
    let mut w = word;
    let mut i = 0u32;
    let mut n = nth1_zero_based;
    while i < 64 {
        let bit = (w & 1) as u32;
        if bit == 1 {
            if n == 0 {
                return i;
            }
            n -= 1;
        }
        w >>= 1;
        i += 1;
    }
    64
}

#[inline(always)]
pub const fn louds_first_child_index(node_rank: u32, degree_prefix_ones: u32) -> u32 {
    node_rank + degree_prefix_ones
}

#[inline(always)]
pub const fn louds_next_sibling_index(child_index: u32) -> u32 {
    child_index + 1
}

// ============================================================
// BITAHO KERNELS
// one transition step
// ============================================================

#[repr(C)]
#[derive(Copy, Clone, PartialEq, Eq)]
pub struct bitaho_step_result {
    pub next_state: u32,
    pub out_mask: u32,
}

#[inline(always)]
pub fn bitaho_step(
    transition_table: &[u32],
    output_table: &[u32],
    alphabet_stride: u32,
    state: u32,
    symbol: u8,
) -> bitaho_step_result {
    let idx = state as usize * alphabet_stride as usize + symbol as usize;
    let next = transition_table[idx];
    let out = output_table[next as usize];
    bitaho_step_result {
        next_state: next,
        out_mask: out,
    }
}

// ============================================================
// BITUF KERNELS
// bounded union-find
// ============================================================

#[inline(always)]
pub fn bituf_find_2(parent: &[u32], x: u32) -> u32 {
    let p0 = parent[x as usize];
    let is_root0 = (p0 == x) as u8;
    let p1 = parent[p0 as usize];
    select_u32(is_root0, x, p1)
}

#[inline(always)]
pub fn bituf_union_by_min_2(parent: &mut [u32], a: u32, b: u32) {
    let ra = bituf_find_2(parent, a);
    let rb = bituf_find_2(parent, b);
    let root = min_u32(ra, rb);
    let leaf = max_u32(ra, rb);
    parent[leaf as usize] = root;
}

// ============================================================
// BITFENWICK KERNELS
// bounded fixed-height shard operations
// ============================================================

#[inline(always)]
pub fn bitfenwick_add_8(tree: &mut [u32; 8], idx1: u32, delta: u32) {
    let mut i = idx1 as usize;
    if i == 0 { return; }
    if i <= 8 { tree[i - 1] = tree[i - 1].wrapping_add(delta); }
    i = i.wrapping_add(i & (!i).wrapping_add(1));
    if i <= 8 { tree[i - 1] = tree[i - 1].wrapping_add(delta); }
    i = i.wrapping_add(i & (!i).wrapping_add(1));
    if i <= 8 { tree[i - 1] = tree[i - 1].wrapping_add(delta); }
}

#[inline(always)]
pub fn bitfenwick_sum_8(tree: &[u32; 8], idx1: u32) -> u32 {
    let mut i = idx1 as usize;
    let mut acc = 0u32;

    if i == 0 { return 0; }

    if i <= 8 {
        acc = acc.wrapping_add(tree[i - 1]);
    }
    i = i & i.wrapping_sub(1);

    if i != 0 && i <= 8 {
        acc = acc.wrapping_add(tree[i - 1]);
    }
    i = i & i.wrapping_sub(1);

    if i != 0 && i <= 8 {
        acc = acc.wrapping_add(tree[i - 1]);
    }

    acc
}

// ============================================================
// BITRMQ KERNELS
// O(1) sparse table query
// ============================================================

#[inline(always)]
pub const fn floor_log2_u32(x: u32) -> u32 {
    31 - x.leading_zeros()
}

#[inline(always)]
pub fn bitrmq_min_u32(
    sparse: &[u32],
    levels: u32,
    n: u32,
    l: u32,
    r: u32,
) -> u32 {
    let len = r - l + 1;
    let k = floor_log2_u32(len);
    let base0 = (k * n + l) as usize;
    let base1 = (k * n + (r + 1 - (1 << k))) as usize;
    let a = sparse[base0];
    let b = sparse[base1];
    let _ = levels;
    min_u32(a, b)
}

// ============================================================
// BITGRAPH KERNELS
// fixed-hop micro-dag
// ============================================================

#[repr(C)]
#[derive(Copy, Clone, PartialEq, Eq)]
pub struct bitgraph4 {
    pub n0: u32,
    pub n1: u32,
    pub n2: u32,
    pub n3: u32,
}

#[inline(always)]
pub const fn bitgraph_hop0(g: bitgraph4) -> u32 { g.n0 }
#[inline(always)]
pub const fn bitgraph_hop1(g: bitgraph4) -> u32 { g.n1 }
#[inline(always)]
pub const fn bitgraph_hop2(g: bitgraph4) -> u32 { g.n2 }
#[inline(always)]
pub const fn bitgraph_hop3(g: bitgraph4) -> u32 { g.n3 }

#[inline(always)]
pub const fn bitgraph_contains4(g: bitgraph4, target: u32) -> u8 {
    (((g.n0 == target) as u8) |
     ((g.n1 == target) as u8) |
     ((g.n2 == target) as u8) |
     ((g.n3 == target) as u8)) & 1
}

// ============================================================
// BITSPATIAL KERNELS
// branch-light distance kernels
// ============================================================

#[repr(C)]
#[derive(Copy, Clone, PartialEq, Eq)]
pub struct Point2 {
    pub x: u32,
    pub y: u32,
}

#[inline(always)]
pub const fn manhattan2(a: Point2, b: Point2) -> u32 {
    abs_diff_u32(a.x, b.x) + abs_diff_u32(a.y, b.y)
}

#[inline(always)]
pub const fn dist2_sq(a: Point2, b: Point2) -> u32 {
    let dx = abs_diff_u32(a.x, b.x);
    let dy = abs_diff_u32(a.y, b.y);
    dx.wrapping_mul(dx).wrapping_add(dy.wrapping_mul(dy))
}

#[inline(always)]
pub fn nearest_of4(target: Point2, pts: [Point2; 4]) -> u32 {
    let d0 = dist2_sq(target, pts[0]);
    let d1 = dist2_sq(target, pts[1]);
    let d2 = dist2_sq(target, pts[2]);
    let d3 = dist2_sq(target, pts[3]);

    let i01 = select_u32((d0 <= d1) as u8, 0, 1);
    let d01 = min_u32(d0, d1);

    let i23 = select_u32((d2 <= d3) as u8, 2, 3);
    let d23 = min_u32(d2, d3);

    select_u32((d01 <= d23) as u8, i01, i23)
}

// ============================================================
// HOT TRANSITION / PROCESS KERNELS
// ============================================================

#[inline(always)]
pub const fn rule_match(state: HotState, next: Id, rule: TransitionRule) -> u8 {
    let from_ok = (state.current == rule.from) as u8;
    let to_ok = (next == rule.to) as u8;
    let req_ok = ((state.flags & rule.require_mask) == rule.require_mask) as u8;
    let forbid_ok = ((state.flags & rule.forbid_mask) == 0) as u8;
    from_ok & to_ok & req_ok & forbid_ok
}

#[inline(always)]
pub fn transition_lawful_4(state: HotState, next: Id, rules: &[TransitionRule; 4]) -> u8 {
    let m0 = rule_match(state, next, rules[0]);
    let m1 = rule_match(state, next, rules[1]);
    let m2 = rule_match(state, next, rules[2]);
    let m3 = rule_match(state, next, rules[3]);
    (m0 | m1 | m2 | m3) & 1
}

#[inline(always)]
pub fn transition_lawful_8(state: HotState, next: Id, rules: &[TransitionRule; 8]) -> u8 {
    let m0 = rule_match(state, next, rules[0]);
    let m1 = rule_match(state, next, rules[1]);
    let m2 = rule_match(state, next, rules[2]);
    let m3 = rule_match(state, next, rules[3]);
    let m4 = rule_match(state, next, rules[4]);
    let m5 = rule_match(state, next, rules[5]);
    let m6 = rule_match(state, next, rules[6]);
    let m7 = rule_match(state, next, rules[7]);
    (m0 | m1 | m2 | m3 | m4 | m5 | m6 | m7) & 1
}

#[inline(always)]
pub const fn apply_transition(state: HotState, next: Id) -> HotState {
    HotState {
        current: next,
        previous: state.current,
        epoch: state.epoch.wrapping_add(1),
        flags: state.flags,
    }
}

#[inline(always)]
pub fn ingress_decide_4(
    case_id: Id,
    state: HotState,
    next: Id,
    rules: &[TransitionRule; 4],
    prev_seed: Seed,
) -> IngressResult {
    let lawful = transition_lawful_4(state, next, rules);
    let edge = pack_edge(state.current, next);
    let applied = apply_transition(state, next);

    let next_state = HotState {
        current: select_u32(lawful, applied.current, state.current),
        previous: select_u32(lawful, applied.previous, state.previous),
        epoch: select_u32(lawful, applied.epoch, state.epoch),
        flags: state.flags,
    };

    let seed = receipt_seed_mix(
        prev_seed,
        case_id,
        state.current,
        next,
        next_state.epoch,
        next_state.flags,
    );

    IngressResult {
        lawful,
        ticks: CHATMAN_CONSTANT_TICKS,
        edge_lo: edge_lo(edge),
        edge_hi: edge_hi(edge),
        next_state,
        receipt_seed: seed,
    }
}

#[inline(always)]
pub fn ingress_decide_8(
    case_id: Id,
    state: HotState,
    next: Id,
    rules: &[TransitionRule; 8],
    prev_seed: Seed,
) -> IngressResult {
    let lawful = transition_lawful_8(state, next, rules);
    let edge = pack_edge(state.current, next);
    let applied = apply_transition(state, next);

    let next_state = HotState {
        current: select_u32(lawful, applied.current, state.current),
        previous: select_u32(lawful, applied.previous, state.previous),
        epoch: select_u32(lawful, applied.epoch, state.epoch),
        flags: state.flags,
    };

    let seed = receipt_seed_mix(
        prev_seed,
        case_id,
        state.current,
        next,
        next_state.epoch,
        next_state.flags,
    );

    IngressResult {
        lawful,
        ticks: CHATMAN_CONSTANT_TICKS,
        edge_lo: edge_lo(edge),
        edge_hi: edge_hi(edge),
        next_state,
        receipt_seed: seed,
    }
}

#[inline(always)]
pub fn construct8_transition(
    case_id: Id,
    prev_state: HotState,
    ingress: IngressResult,
    predicates: HotPredicates,
    ids: HotIds,
) -> Construct8 {
    let mut out = Construct8::empty();

    out.push_unchecked(Triple {
        s: case_id,
        p: predicates.has_current,
        o: ingress.next_state.current,
    });

    out.push_unchecked(Triple {
        s: case_id,
        p: predicates.had_previous,
        o: prev_state.current,
    });

    out.push_unchecked(Triple {
        s: case_id,
        p: predicates.has_epoch,
        o: ingress.next_state.epoch,
    });

    out.push_unchecked(Triple {
        s: case_id,
        p: predicates.has_flags,
        o: ingress.next_state.flags,
    });

    out.push_unchecked(Triple {
        s: case_id,
        p: predicates.has_edge_lo,
        o: ingress.edge_lo,
    });

    out.push_unchecked(Triple {
        s: case_id,
        p: predicates.has_edge_hi,
        o: ingress.edge_hi,
    });

    out.push_unchecked(Triple {
        s: case_id,
        p: predicates.has_lawful,
        o: select_u32(ingress.lawful, ids.lawful_true, ids.lawful_false),
    });

    out.push_unchecked(Triple {
        s: case_id,
        p: predicates.has_receipt,
        o: ingress.receipt_seed as u32,
    });

    out
}

#[inline(always)]
pub fn hot_conformance_step_4(
    case_id: Id,
    state: HotState,
    observed_next: Id,
    rules: &[TransitionRule; 4],
    predicates: HotPredicates,
    ids: HotIds,
    prev_seed: Seed,
) -> (IngressResult, Construct8) {
    let ingress = ingress_decide_4(case_id, state, observed_next, rules, prev_seed);
    let c8 = construct8_transition(case_id, state, ingress, predicates, ids);
    (ingress, c8)
}

#[inline(always)]
pub fn hot_conformance_step_8(
    case_id: Id,
    state: HotState,
    observed_next: Id,
    rules: &[TransitionRule; 8],
    predicates: HotPredicates,
    ids: HotIds,
    prev_seed: Seed,
) -> (IngressResult, Construct8) {
    let ingress = ingress_decide_8(case_id, state, observed_next, rules, prev_seed);
    let c8 = construct8_transition(case_id, state, ingress, predicates, ids);
    (ingress, c8)
}

// ============================================================
// HOT DECLARE-LIKE TINY CONSTRAINT KERNELS
// ============================================================

#[inline(always)]
pub const fn declare_response_seen(a_seen: u8, b_seen_after: u8) -> u8 {
    ((!a_seen) | b_seen_after) & 1
}

#[inline(always)]
pub const fn declare_precedence_ok(b_seen: u8, a_seen_before: u8) -> u8 {
    ((!b_seen) | a_seen_before) & 1
}

#[inline(always)]
pub const fn declare_absence_le_1(count: u32) -> u8 {
    (count <= 1) as u8
}

#[inline(always)]
pub const fn declare_existence_ge_1(count: u32) -> u8 {
    (count >= 1) as u8
}

#[inline(always)]
pub const fn declare_exactly_1(count: u32) -> u8 {
    (count == 1) as u8
}

// ============================================================
// HOT TEMPORAL KERNELS
// ============================================================

#[inline(always)]
pub const fn temporal_le(deadline: u32, observed: u32) -> u8 {
    (observed <= deadline) as u8
}

#[inline(always)]
pub const fn temporal_delta(start: u32, end: u32) -> u32 {
    end.wrapping_sub(start)
}

#[inline(always)]
pub const fn temporal_within(start: u32, end: u32, min_d: u32, max_d: u32) -> u8 {
    let d = temporal_delta(start, end);
    validate_range_u32(d, min_d, max_d)
}

// ============================================================
// HOT TOKEN / MARKING MICRO-KERNELS
// ============================================================

#[repr(C)]
#[derive(Copy, Clone, PartialEq, Eq)]
pub struct Marking4 {
    pub p0: u32,
    pub p1: u32,
    pub p2: u32,
    pub p3: u32,
}

#[repr(C)]
#[derive(Copy, Clone, PartialEq, Eq)]
pub struct Transition4 {
    pub in0: u32,
    pub in1: u32,
    pub in2: u32,
    pub in3: u32,
    pub out0: u32,
    pub out1: u32,
    pub out2: u32,
    pub out3: u32,
}

#[inline(always)]
pub const fn marking_enabled4(m: Marking4, t: Transition4) -> u8 {
    let e0 = (m.p0 >= t.in0) as u8;
    let e1 = (m.p1 >= t.in1) as u8;
    let e2 = (m.p2 >= t.in2) as u8;
    let e3 = (m.p3 >= t.in3) as u8;
    e0 & e1 & e2 & e3
}

#[inline(always)]
pub const fn marking_fire4(m: Marking4, t: Transition4, enabled: u8) -> Marking4 {
    let mm = 0u32.wrapping_sub(enabled as u32);
    Marking4 {
        p0: m.p0.wrapping_sub(t.in0 & mm).wrapping_add(t.out0 & mm),
        p1: m.p1.wrapping_sub(t.in1 & mm).wrapping_add(t.out1 & mm),
        p2: m.p2.wrapping_sub(t.in2 & mm).wrapping_add(t.out2 & mm),
        p3: m.p3.wrapping_sub(t.in3 & mm).wrapping_add(t.out3 & mm),
    }
}

// ============================================================
// SMALL HOT METRIC KERNELS
// ============================================================

#[inline(always)]
pub const fn counter_inc(x: u32) -> u32 {
    x.wrapping_add(1)
}

#[inline(always)]
pub const fn counter_add(x: u32, delta: u32) -> u32 {
    x.wrapping_add(delta)
}

#[inline(always)]
pub const fn saturating_counter_inc_u8(x: u8) -> u8 {
    if x == u8::MAX { u8::MAX } else { x + 1 }
}

#[inline(always)]
pub const fn rolling_max2(a: u32, b: u32) -> u32 {
    max_u32(a, b)
}

#[inline(always)]
pub const fn rolling_min2(a: u32, b: u32) -> u32 {
    min_u32(a, b)
}

// ============================================================
// TESTS
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_core_primitives() {
        assert_eq!(ask_eq_u32(7, 7), 1);
        assert_eq!(ask_ne_u32(7, 8), 1);
        assert_eq!(compare_le_u32(4, 9), 1);
        assert_eq!(validate_range_u32(5, 1, 9), 1);
        assert_eq!(min_u32(3, 9), 3);
        assert_eq!(max_u32(3, 9), 9);
        assert_eq!(abs_diff_u32(10, 4), 6);
    }

    #[test]
    fn test_bitxor_contains() {
        let cfg = bitxor3 { seed: 12345, block_mask: 7 };
        let key = 42u32;
        let fp = bitxor_fingerprint32(key, cfg.seed);
        let i0 = bitxor_idx0(&cfg, key) as usize;
        let i1 = bitxor_idx1(&cfg, key) as usize;
        let i2 = bitxor_idx2(&cfg, key) as usize;

        let mut table = [0u32; 8];
        table[i0] ^= fp;
        table[i1] ^= 0;
        table[i2] ^= 0;

        assert_eq!(bitxor_contains_u32(&cfg, &table, key), 1);
    }

    #[test]
    fn test_union_find() {
        let mut parent = [0u32, 1, 2, 3];
        bituf_union_by_min_2(&mut parent, 2, 3);
        let r2 = bituf_find_2(&parent, 2);
        let r3 = bituf_find_2(&parent, 3);
        assert_eq!(r2, r3);
    }

    #[test]
    fn test_fenwick() {
        let mut tree = [0u32; 8];
        bitfenwick_add_8(&mut tree, 1, 5);
        bitfenwick_add_8(&mut tree, 2, 3);
        assert_eq!(bitfenwick_sum_8(&tree, 1), 5);
        assert_eq!(bitfenwick_sum_8(&tree, 2), 8);
    }

    #[test]
    fn test_marking() {
        let m = Marking4 { p0: 1, p1: 1, p2: 0, p3: 0 };
        let t = Transition4 {
            in0: 1, in1: 1, in2: 0, in3: 0,
            out0: 0, out1: 0, out2: 1, out3: 0,
        };
        let en = marking_enabled4(m, t);
        assert_eq!(en, 1);
        let m2 = marking_fire4(m, t, en);
        assert_eq!(m2.p2, 1);
        assert_eq!(m2.p0, 0);
    }

    #[test]
    fn test_hot_transition_construct8() {
        let predicates = HotPredicates {
            has_current: 10,
            had_previous: 11,
            has_epoch: 12,
            has_flags: 13,
            has_edge_lo: 14,
            has_edge_hi: 15,
            has_lawful: 16,
            has_receipt: 17,
        };

        let ids = HotIds {
            lawful_true: 1,
            lawful_false: 0,
        };

        let rules = [
            TransitionRule { from: 100, to: 101, require_mask: 0, forbid_mask: 0 },
            TransitionRule { from: 101, to: 102, require_mask: 0, forbid_mask: 0 },
            TransitionRule { from: 102, to: 103, require_mask: 0, forbid_mask: 0 },
            TransitionRule { from: 103, to: 104, require_mask: 0, forbid_mask: 0 },
        ];

        let state = HotState {
            current: 100,
            previous: 99,
            epoch: 7,
            flags: 0,
        };

        let (ingress, c8) = hot_conformance_step_4(
            5000,
            state,
            101,
            &rules,
            predicates,
            ids,
            0x1234_5678_9abc_def0,
        );

        assert_eq!(ingress.lawful, 1);
        assert_eq!(ingress.ticks, CHATMAN_CONSTANT_TICKS);
        assert_eq!(ingress.next_state.current, 101);
        assert_eq!(ingress.next_state.previous, 100);
        assert_eq!(ingress.next_state.epoch, 8);
        assert_eq!(c8.len, 8);
        assert_eq!(c8.triples[0], Triple { s: 5000, p: 10, o: 101 });
        assert_eq!(c8.triples[1], Triple { s: 5000, p: 11, o: 100 });
        assert_eq!(c8.triples[2], Triple { s: 5000, p: 12, o: 8 });
    }

    #[test]
    fn test_hot_transition_unlawful() {
        let predicates = HotPredicates {
            has_current: 10,
            had_previous: 11,
            has_epoch: 12,
            has_flags: 13,
            has_edge_lo: 14,
            has_edge_hi: 15,
            has_lawful: 16,
            has_receipt: 17,
        };

        let ids = HotIds {
            lawful_true: 1,
            lawful_false: 0,
        };

        let rules = [
            TransitionRule { from: 100, to: 101, require_mask: 0, forbid_mask: 0 },
            TransitionRule { from: 101, to: 102, require_mask: 0, forbid_mask: 0 },
            TransitionRule { from: 102, to: 103, require_mask: 0, forbid_mask: 0 },
            TransitionRule { from: 103, to: 104, require_mask: 0, forbid_mask: 0 },
        ];

        let state = HotState {
            current: 100,
            previous: 99,
            epoch: 7,
            flags: 0,
        };

        let (ingress, c8) = hot_conformance_step_4(
            5000,
            state,
            104,
            &rules,
            predicates,
            ids,
            0,
        );

        assert_eq!(ingress.lawful, 0);
        assert_eq!(ingress.next_state.current, 100);
        assert_eq!(ingress.next_state.epoch, 7);
        assert_eq!(c8.triples[6], Triple { s: 5000, p: 16, o: 0 });
    }
}
