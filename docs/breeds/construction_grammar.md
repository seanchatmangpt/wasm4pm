# Construction Grammar — Goldberg Argument-Structure Constructions

## 1. Identity
- **Breed id:** `construction_grammar` · **Module:** `src/breeds/construction_grammar.rs`
- **Historical ancestor:** Goldberg 1995, *Constructions* (University of Chicago Press)

## 2. Algorithm
Tokenize → lexicon POS-tag (no guessing; unknown word refuses) → NP/PP chunking →
longest-form-first match against the built-in inventory (ditransitive, caused-motion,
transitive, intransitive-motion, intransitive) → slot binding → meaning fusion.
Coercion: when the verb's lexical valence supplies fewer arguments than the matched
construction, the construction contributes the meaning (`cxg:coerced = true`).

## 3. Contract (input facts)
- `cxg:utterance` (≤ 32 tokens), `lex:<word>:pos` (det|adj|noun|pron|verb|prep),
  optional `lex:<word>:valence` (intransitive|transitive|ditransitive)

## 4. Output facts
`cxg:construction`, `cxg:meaning` (frame + args), `cxg:coerced`, `cxg:verb`,
`cxg:slot:{subj,obj,rec,theme,obl}`

## 5. Trace kinds / OCEL lifecycle
`tokenize`(1) → `pos-tag`(1..*) → `chunk`(1..*) → `match-construction`(1..*) →
`bind-slot`(0..*) → `fuse-meaning`(1). Model: `ocel/models/l1/construction_grammar.ocpn.json`; fitness 1.0.

## 6. Oracles
- Refusal: empty utterance/lexicon; unknown word.
- Hidden: "he sneezed the napkin off the table" → caused-motion meaning despite
  the intransitive lexicon entry for *sneeze* (meaning cannot come from the verb);
  removing the oblique chunk flips the match to transitive.
- Paper: "pat faxed bill the letter" → ditransitive, CAUSE-RECEIVE, coerced (Goldberg 1995).

## 7. Determinism & latency
Deterministic; no RNG. Median 4.88 µs.

## 8. Status
ADMITTED; full BVC ceremony complete.
