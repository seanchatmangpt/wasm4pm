import os
from pathlib import Path

algorithms = [
    "a_star", "aco", "alignments", "alpha_plus_plus", "batches", "bpmn_import", 
    "causal_graph", "complexity_metrics", "correlation_miner", "declare", "dfg", 
    "etconformance_precision", "generalization", "genetic_algorithm", "handover_network", 
    "heuristic_miner", "hierarchical_dfg", "hill_climbing", "ilp", "inductive_miner", 
    "log_to_trie", "ml_anomaly", "ml_classify", "ml_cluster", "ml_forecast", "ml_pca", 
    "ml_regress", "monte_carlo_simulation", "optimized_dfg", "performance_spectrum", 
    "playout", "pnml_import", "powl_to_process_tree", "process_skeleton", "pso", 
    "simd_streaming_dfg", "simulated_annealing", "smart_engine", "streaming_log", 
    "transition_system", "working_together_network", "yawl_export"
]
profiles = ["mobile", "iot", "edge", "fog", "browser"]
breeds = ["ELIZA", "MYCIN", "STRIPS", "Prolog", "CBR", "DENDRAL", "GPS", "SOAR", "Hearsay-II"]
probes = [f"P{i}" for i in range(1, 25)]
conformance_dims = ["fitness", "precision", "lifecycle", "cardinality", "receipt_coverage"]

def write_md(path, title, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        f.write(f"# {title}\n\n{content}\n")

matrix_dir = Path("docs/matrix")
for algo in algorithms:
    for profile in profiles:
        write_md(matrix_dir / f"algo_x_profile/{algo}_{profile}.md", 
                 f"{algo} under {profile} profile", 
                 f"Configuration and bounds for {algo} on {profile}.")
    for breed in breeds:
        write_md(matrix_dir / f"algo_x_breed/{algo}_{breed.lower()}.md", 
                 f"{algo} + {breed} Cognition", 
                 f"Inference trace and contract bindings for {algo} controlled by {breed}.")

for probe in probes:
    for dim in conformance_dims:
        write_md(matrix_dir / f"probe_x_conformance/{probe}_{dim}.md", 
                 f"Adversarial Probe {probe} - {dim}", 
                 f"Rejection bounds and panic conditions for {probe} testing {dim}.")

diataxis_dir = Path("docs")
for algo in algorithms:
    write_md(diataxis_dir / f"tutorials/{algo}_tutorial.md", f"Tutorial: {algo}", f"Hands-on guide to {algo}.")
    write_md(diataxis_dir / f"how-to/{algo}_guide.md", f"How-to use {algo}", f"Practical configurations for {algo}.")
    write_md(diataxis_dir / f"reference/{algo}_ref.md", f"Reference: {algo}", f"API and exit codes for {algo}.")
    write_md(diataxis_dir / f"explanation/{algo}_arch.md", f"Explanation: {algo}", f"Architectural deep-dive for {algo}.")

proofs_dir = Path("docs/proofs")
for dim in conformance_dims:
    write_md(proofs_dir / f"soundness/{dim}_typestate.md", f"Soundness Proof: {dim}", f"Typestate enforcement for {dim}.")
    write_md(proofs_dir / f"receipts/{dim}_receipt.md", f"Receipt Chain: {dim}", f"Cryptographic provenance for {dim}.")
    write_md(proofs_dir / f"adversarial/{dim}_admissibility.md", f"Adversarial Admissibility: {dim}", f"Game-theoretic bounds for {dim}.")

with open("docs/INDEX.md", "w") as idx:
    idx.write("# Combinatorial Maximalism Index\n\n")
    idx.write("## Matrix\n")
    idx.write("### Algo x Profile\n")
    for algo in algorithms:
        for profile in profiles:
            idx.write(f"- [{algo} {profile}](matrix/algo_x_profile/{algo}_{profile}.md)\n")
    idx.write("### Algo x Breed\n")
    for algo in algorithms:
        for breed in breeds:
            idx.write(f"- [{algo} {breed}](matrix/algo_x_breed/{algo}_{breed.lower()}.md)\n")
    idx.write("### Probe x Conformance\n")
    for probe in probes:
        for dim in conformance_dims:
            idx.write(f"- [{probe} {dim}](matrix/probe_x_conformance/{probe}_{dim}.md)\n")
    
    idx.write("## Diataxis\n")
    for algo in algorithms:
        idx.write(f"- [Tutorial {algo}](tutorials/{algo}_tutorial.md)\n")
        idx.write(f"- [How-to {algo}](how-to/{algo}_guide.md)\n")
        idx.write(f"- [Reference {algo}](reference/{algo}_ref.md)\n")
        idx.write(f"- [Explanation {algo}](explanation/{algo}_arch.md)\n")
        
    idx.write("## Proofs\n")
    for dim in conformance_dims:
        idx.write(f"- [Soundness {dim}](proofs/soundness/{dim}_typestate.md)\n")
        idx.write(f"- [Receipts {dim}](proofs/receipts/{dim}_receipt.md)\n")
        idx.write(f"- [Adversarial {dim}](proofs/adversarial/{dim}_admissibility.md)\n")

print("Docs and INDEX generated successfully.")
