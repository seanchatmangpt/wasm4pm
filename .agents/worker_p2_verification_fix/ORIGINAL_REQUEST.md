## 2026-06-11T03:33:53Z

Please resolve the 26 failing TypeScript integration tests by performing the following actions:

1. Update packages/cognition/src/__tests__/fixtures/breed-inputs.ts:
   - In `minimalSatCdclInput`: Change the facts list to represent a simple SAT instance instead of PHP(3,2) which is UNSAT. For example:
     ```typescript
     facts: [
       { key: 'clause:0', value: '1 2' },
       { key: 'clause:1', value: '-1 2' },
     ]
     ```
   - In `minimalVersionSpaceEnjoySportInput`: Add the 4th example from the EnjoySport dataset to facts so that the S4 boundary Sunny,Warm,?,Strong,?,? is correctly reached:
     ```typescript
     { key: 'vs:example:4', value: 'Sunny,Warm,High,Strong,Cool,Change:+' }
     ```
   - In `minimalDescriptionLogicInput`: Prefixes for facts must be dl:* and goals must have a dl:subsumes goal:
     ```typescript
     export function minimalDescriptionLogicInput(): BreedInput {
       return {
         intent: 'classify',
         candidates: [
           { id: 'x', score: 0.5, eliminated: false },
         ],
         facts: [
           { key: 'dl:subclass:A', value: 'B' },
           { key: 'dl:subclass:B', value: 'C' },
         ],
         cases: [],
         rules: [],
         goals: [
           { id: 'g1', predicate: 'dl:subsumes', value: 'A:C' },
         ],
         state: [],
       };
     }
     ```
   - In `minimalAbductiveLpInput`: Prefixes for facts must be alp:abducible:* and the goal predicate must be alp:observe:
     ```typescript
     export function minimalAbductiveLpInput(): BreedInput {
       return {
         intent: 'abduce',
         candidates: [
           { id: 'c', score: 0.5, eliminated: false },
         ],
         facts: [
           { key: 'alp:abducible:a', value: 'true' },
           { key: 'alp:abducible:b', value: 'true' },
           { key: 'alp:abducible:c', value: 'true' },
           { key: 'alp:abducible:d', value: 'true' },
         ],
         cases: [],
         rules: [
           { id: 'r1', premise: ['a', 'b'], conclusion: 'g', certainty: 1.0 },
           { id: 'r2', premise: ['c'], conclusion: 'g', certainty: 1.0 },
         ],
         goals: [
           { id: 'g1', predicate: 'alp:observe', value: 'g' },
         ],
         state: [],
       };
     }
     ```
   - In `minimalAbductiveIbeInput`: Prefixes for facts must be ibe:obs:* and ibe:hyp:*:
     ```typescript
     export function minimalAbductiveIbeInput(): BreedInput {
       return {
         intent: 'coherence',
         candidates: [
           { id: 'H1', score: 0.5, eliminated: false },
           { id: 'H2', score: 0.5, eliminated: false },
         ],
         facts: [
           { key: 'ibe:obs:E1', value: 'true' },
           { key: 'ibe:obs:E2', value: 'true' },
           { key: 'ibe:hyp:H1:covers', value: 'E1,E2' },
           { key: 'ibe:hyp:H1:cost', value: '1.0' },
           { key: 'ibe:hyp:H2:covers', value: 'E1' },
           { key: 'ibe:hyp:H2:cost', value: '1.0' },
         ],
         cases: [],
         rules: [],
         goals: [],
         state: [],
       };
     }
     ```

2. Update packages/cognition/src/__tests__/cognition-breeds.integration.test.ts:
   - In `dempster_shafer` test, change the expected string pattern check from `Bel=0.310345` to `Bel=0.31034` (since the returned value has more decimal places in the new version).
   - In `description_logic` paper fixture test, assert the subsumption verdicts defined in the fixture:
     ```typescript
     describe('description_logic breed — paper fixture', () => {
       it('propagates subclass transitivity and checks consistency', async () => {
         const fixture = loadPaperFixture('description_logic');
         const result = (await fixtures.runBreed('description_logic', fixture.input)) as AnyResult;
         expect(result.status).toBe('ok');
         expect(result.output.breed).toBe('DescriptionLogic');
         for (const [key, val] of Object.entries(fixture.expected.verdicts)) {
           const fact = (result.output.facts as Array<{ key: string; value: string }>).find(f => f.key === key);
           expect(fact?.value).toBe(val);
         }
       });
     });
     ```
   - In `abductive_lp` paper fixture test, update the expectation for the explanations count fact key (`alp:explanation_count`) and look up `fixture.expected.selected` or default to `fixture.expected.explanations[0]`:
     ```typescript
     describe('abductive_lp breed — paper fixture', () => {
       it('finds minimal abductive explanation under ICs', async () => {
         const fixture = loadPaperFixture('abductive_lp');
         const result = (await fixtures.runBreed('abductive_lp', fixture.input)) as AnyResult;
         expect(result.status).toBe('ok');
         expect(result.output.breed).toBe('AbductiveLp');
         const countFact = (result.output.facts as Array<{ key: string; value: string }>).find(f => f.key === 'alp:explanation_count');
         expect(countFact?.value).toBe(fixture.expected.explanation_count);
         expect(result.output.selected).toBe(fixture.expected.selected ?? fixture.expected.explanations[0]);
       });
     });
     ```
   - In `abductive_ibe` paper fixture test, assert `fixture.expected.selected ?? fixture.expected.best`:
     ```typescript
     describe('abductive_ibe breed — paper fixture', () => {
       it('selects best explanation using coherence ECHO network', async () => {
         const fixture = loadPaperFixture('abductive_ibe');
         const result = (await fixtures.runBreed('abductive_ibe', fixture.input)) as AnyResult;
         expect(result.status).toBe('ok');
         expect(result.output.breed).toBe('AbductiveIbe');
         expect(result.output.selected).toBe(fixture.expected.selected ?? fixture.expected.best);
       });
     });
     ```

3. Verification Commands:
   - Rebuild the WASM module:
     `cd crates/wasm4pm-cognition && wasm-pack build --target nodejs --out-dir pkg -- --features wasm`
   - Rebuild the TS package:
     `cd ../.. && pnpm --filter @wasm4pm/cognition build`
   - Run Vitest tests:
     `npx vitest run --dir packages/cognition`
   - Run Rust tests to ensure nothing was broken:
     `cargo test -p wasm4pm-cognition`

4. Documentation:
   - Write your `progress.md` and `handoff.md` under `/Users/sac/wasm4pm/.agents/worker_p2_verification_fix/` to document the results.
