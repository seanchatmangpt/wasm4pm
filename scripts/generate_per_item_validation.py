#!/usr/bin/env python3
"""Generate one source contract and focused test per admitted algorithm/breed."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALGORITHMS = "a_star aco alpha_plus_plus declare dfg genetic_algorithm heuristic_miner hill_climbing ilp inductive_miner optimized_dfg process_skeleton pso simulated_annealing hierarchical_dfg simd_streaming_dfg smart_engine streaming_log analyze_process_speedup analyze_variant_complexity batches causal_graph compute_activity_transition_matrix compute_trace_similarity_matrix correlation_miner log_to_trie performance_spectrum transition_system alignments complexity_metrics etconformance_precision generalization monte_carlo_simulation playout bpmn_import pnml_import powl_to_process_tree yawl_export ocel_dfg ocel_dfg_per_type ocel_encode ocel_oc_declare ocel_ocla ocel_petri_net compute_ewma detect_drift predict_next_activity predict_outcome predict_remaining_time automl_classify automl_forecast ml_anomaly ml_classify ml_cluster ml_forecast ml_pca ml_regress handover_network working_together_network agentic_pipeline".split()
BREEDS = "ltl_monitor allen_temporal ctl_check event_calculus situation_calculus fuzzy_logic dempster_shafer abductive_ibe bayesian_network problog markov_logic htn_planning partial_order_plan contingent_plan mdp pomdp strips gps asp abductive_lp tableaux prolog clp sat_cdcl csp_ac3 default_logic circumscription frames_inheritance description_logic belief_merging script_sam act_r soar episodic_memory ebl ilp version_space analogy_sme rl_symbolic qualitative_reason naive_physics triz morphological construction_grammar meta_reasoning autoinstinct_learning autoinstinct_neurosis autoinstinct_semantics autoinstinct_vision cbr dendral eliza hearsay mycin ocpm_route_discoverer".split()


def emit(path: str, content: str, check: bool, drift: list[str]) -> None:
    target = ROOT / path
    content = content.replace("\r\n", "\n")
    if check:
        if not target.exists() or target.read_text() != content:
            drift.append(path)
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def generate(check: bool) -> list[str]:
    if len(ALGORITHMS) != 60 or len(set(ALGORITHMS)) != 60:
        raise SystemExit("algorithm inventory must contain 60 unique ids")
    if len(BREEDS) != 55 or len(set(BREEDS)) != 55:
        raise SystemExit("breed inventory must contain 55 unique ids")
    drift: list[str] = []

    contract = """import type { AlgorithmMetadata } from '../registry.js';

export interface AlgorithmContract {
  readonly id: string;
  readonly pattern: string;
}

const FORBIDDEN_PLACEHOLDER = /(?:todo|stub|placeholder|not\\s+implemented)/i;

export function validateAlgorithmMetadata(
  contract: AlgorithmContract,
  metadata: AlgorithmMetadata | undefined,
): string[] {
  const errors: string[] = [];
  if (!metadata) return [`${contract.id}: missing from AlgorithmRegistry`];
  if (metadata.id !== contract.id) errors.push(`${contract.id}: registry identity drifted to ${metadata.id}`);
  if (!metadata.name.trim()) errors.push(`${contract.id}: empty name`);
  if (!metadata.description.trim()) errors.push(`${contract.id}: empty description`);
  if (FORBIDDEN_PLACEHOLDER.test(`${metadata.name} ${metadata.description}`)) errors.push(`${contract.id}: placeholder language present`);
  if (!Number.isFinite(metadata.speedTier) || metadata.speedTier < 0 || metadata.speedTier > 100) errors.push(`${contract.id}: speedTier outside [0, 100]`);
  if (!Number.isFinite(metadata.qualityTier) || metadata.qualityTier < 0 || metadata.qualityTier > 100) errors.push(`${contract.id}: qualityTier outside [0, 100]`);
  if (metadata.supportedProfiles.length === 0) errors.push(`${contract.id}: no execution profile`);
  if (metadata.deploymentProfiles.length === 0) errors.push(`${contract.id}: no deployment profile`);
  if (new Set(metadata.supportedProfiles).size !== metadata.supportedProfiles.length) errors.push(`${contract.id}: duplicate execution profiles`);
  if (new Set(metadata.deploymentProfiles).size !== metadata.deploymentProfiles.length) errors.push(`${contract.id}: duplicate deployment profiles`);
  const parameterNames = metadata.parameters.map((parameter) => parameter.name);
  if (new Set(parameterNames).size !== parameterNames.length) errors.push(`${contract.id}: duplicate parameters`);
  for (const parameter of metadata.parameters) {
    if (!parameter.name.trim() || !parameter.description.trim()) errors.push(`${contract.id}: malformed parameter metadata`);
    if (parameter.min !== undefined && parameter.max !== undefined && parameter.min > parameter.max) errors.push(`${contract.id}: parameter ${parameter.name} has min > max`);
    if (parameter.type === 'select' && (!parameter.options || parameter.options.length === 0)) errors.push(`${contract.id}: select parameter ${parameter.name} has no options`);
  }
  return errors;
}
"""
    emit("packages/kernel/src/algorithm-contracts/contract.ts", contract, check, drift)

    imports: list[str] = []
    for number, algorithm_id in enumerate(ALGORITHMS, 1):
        imports.append(f"import {algorithm_id} from './{algorithm_id}.js';")
        emit(
            f"packages/kernel/src/algorithm-contracts/{algorithm_id}.ts",
            "import type { AlgorithmContract } from './contract.js';\n\n"
            f"export const contract = Object.freeze({{\n  id: '{algorithm_id}',\n  pattern: 'ALGORITHM-{number:03d}',\n}}) satisfies AlgorithmContract;\n\n"
            "export default contract;\n",
            check,
            drift,
        )

    emit(
        "packages/kernel/src/algorithm-contracts/index.ts",
        "\n".join(imports)
        + "\n\nexport const algorithmContracts = Object.freeze([\n  "
        + ",\n  ".join(ALGORITHMS)
        + "\n] as const);\n\nexport type AlgorithmContractId = (typeof algorithmContracts)[number]['id'];\n",
        check,
        drift,
    )

    helper = """import { expect } from 'vitest';
import { getRegistry } from '../../registry.js';
import type { AlgorithmContract } from '../../algorithm-contracts/contract.js';
import { validateAlgorithmMetadata } from '../../algorithm-contracts/contract.js';

export function expectAlgorithmContract(contract: AlgorithmContract): void {
  const registry = getRegistry();
  const first = registry.get(contract.id);
  const second = registry.get(contract.id);
  expect(validateAlgorithmMetadata(contract, first)).toEqual([]);
  expect(first).toBe(second);
  expect(JSON.stringify(first)).toBe(JSON.stringify(second));
}
"""
    emit("packages/kernel/src/__tests__/algorithm-contracts/helper.ts", helper, check, drift)
    for algorithm_id in ALGORITHMS:
        emit(
            f"packages/kernel/src/__tests__/algorithm-contracts/{algorithm_id}.test.ts",
            "import { describe, it } from 'vitest';\n"
            f"import contract from '../../algorithm-contracts/{algorithm_id}.js';\n"
            "import { expectAlgorithmContract } from './helper.js';\n\n"
            f"describe('algorithm contract: {algorithm_id}', () => {{\n"
            "  it('resolves to complete deterministic registry metadata', () => {\n"
            "    expectAlgorithmContract(contract);\n"
            "  });\n"
            "});\n",
            check,
            drift,
        )

    closure = """import { describe, expect, it } from 'vitest';
import { algorithmContracts } from '../../algorithm-contracts/index.js';
import { getRegistry } from '../../registry.js';

describe('algorithm contract registry closure', () => {
  it('has exactly one contract for every registered algorithm', () => {
    const contractIds = algorithmContracts.map((contract) => contract.id).toSorted();
    const registryIds = getRegistry().list().map((algorithm) => algorithm.id).toSorted();
    expect(contractIds).toHaveLength(60);
    expect(new Set(contractIds).size).toBe(contractIds.length);
    expect(contractIds).toEqual(registryIds);
  });
});
"""
    emit("packages/kernel/src/__tests__/algorithm-contracts/registry-closure.test.ts", closure, check, drift)

    modules: list[str] = []
    for breed_id in BREEDS:
        modules.append(f'#[path = "breed_contracts/{breed_id}.rs"]\nmod {breed_id};')
        focused_test = f'''const SOURCE: &str = include_str!("../../src/breeds/{breed_id}.rs");
const PAPER_POINTERS: &str = include_str!("../paper_pointers_generated.rs");
const ANTICHEAT: &str = include_str!("../universal_anticheat_generated.rs");

#[test]
fn {breed_id}_has_source_runtime_contract_and_oracles() {{
    assert!(SOURCE.contains("impl CognitionBreed for "), "{breed_id}: missing CognitionBreed implementation");
    assert!(SOURCE.contains("fn id(&self) -> BreedId"), "{breed_id}: missing stable BreedId");
    assert!(SOURCE.contains("fn run(&self"), "{breed_id}: missing runtime path");
    assert!(SOURCE.contains("fn preconditions(&self"), "{breed_id}: missing admission boundary");
    assert!(SOURCE.contains("fn postconditions(&self"), "{breed_id}: missing postcondition boundary");
    assert!(!SOURCE.contains("unimplemented!"), "{breed_id}: unimplemented macro present");
    assert!(!SOURCE.contains("todo!"), "{breed_id}: todo macro present");
    assert!(PAPER_POINTERS.contains("{breed_id}"), "{breed_id}: missing generated paper-pointer oracle");
    assert!(ANTICHEAT.contains("anticheat_{breed_id}_"), "{breed_id}: missing generated anti-cheat oracle");
}}
'''
        emit(f"crates/wasm4pm-cognition/tests/breed_contracts/{breed_id}.rs", focused_test, check, drift)

    emit(
        "crates/wasm4pm-cognition/tests/breed_contracts.rs",
        "// Dedicated per-breed structural and oracle-coverage tests.\n"
        "// Runtime paper-pointer and anti-cheat behavior remains generated by ggen.\n\n"
        + "\n\n".join(modules)
        + "\n",
        check,
        drift,
    )
    emit(
        "artifacts/validation/per-item-validation.json",
        json.dumps(
            {
                "algorithm_contracts": 60,
                "algorithm_focused_tests": 60,
                "breed_source_files": 55,
                "breed_focused_tests": 55,
                "generated_registration_surfaces_modified": False,
            },
            indent=2,
        )
        + "\n",
        check,
        drift,
    )
    return drift


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    drift = generate(args.check)
    if drift:
        print("generated per-item validation drift:")
        print("\n".join(f" - {path}" for path in drift))
        return 1
    print("PER_ITEM_VALIDATION_CURRENT" if args.check else "PER_ITEM_VALIDATION_GENERATED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
