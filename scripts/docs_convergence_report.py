#!/usr/bin/env python3
"""
Documentation Semantic Convergence Analysis Report

Analyzes up to 50 pictl documentation files for convergence patterns.
Generates 12 independent metrics with statistical analysis and JSON output.

Usage:
    python scripts/docs_convergence_report.py [--docs-dir /path/to/docs] [--output report.json]

Output:
    - Human-readable text report with statistical analysis
    - JSON file suitable for Prometheus/Grafana dashboard ingestion
    - Convergence trends (improving/stable/declining)
"""

import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from statistics import mean, stdev, variance
from typing import Dict, List, Tuple, Optional
import re
from collections import defaultdict

# Import metrics exporter
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))
from docs.metrics_exporter import DocumentationMetricsExporter, DocumentMetrics


class ConvergenceAnalyzer:
    """Analyzes documentation convergence across 12 metrics."""

    def __init__(self, docs_dir: Path, max_docs: int = 50):
        """
        Initialize analyzer.

        Args:
            docs_dir: Path to documentation directory
            max_docs: Maximum documents to analyze (default 50)
        """
        self.docs_dir = Path(docs_dir)
        self.max_docs = max_docs
        self.exporter = DocumentationMetricsExporter()
        self.all_metrics: Dict[str, DocumentMetrics] = {}
        self.doc_files: List[Path] = []

    def gather_documentation(self) -> int:
        """
        Gather all markdown files from docs directory.

        Returns:
            Number of documents gathered
        """
        if not self.docs_dir.exists():
            raise FileNotFoundError(f"Documentation directory not found: {self.docs_dir}")

        # Find all markdown files, excluding archives
        doc_files = []
        for md_file in self.docs_dir.rglob('*.md'):
            # Skip archived docs
            if '/archive' in str(md_file) or '/.archive' in str(md_file):
                continue
            doc_files.append(md_file)

        # Sort by modification time (newest first) and limit
        doc_files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        self.doc_files = doc_files[:self.max_docs]

        return len(self.doc_files)

    def analyze_all_documents(self) -> None:
        """Analyze all gathered documents."""
        for doc_file in self.doc_files:
            try:
                metrics = self.exporter.analyze_document(doc_file)
                self.all_metrics[str(doc_file)] = metrics
            except Exception as e:
                print(f"Warning: Failed to analyze {doc_file}: {e}", file=sys.stderr)

    def compute_completeness_trend(self) -> Dict[str, any]:
        """
        Metric 1: Average completeness trend (improving/stable/declining).

        Returns:
            Dictionary with completeness analysis
        """
        if not self.all_metrics:
            return {'trend': 'unknown', 'mean': 0, 'stdev': 0}

        # Sort by modification date
        sorted_metrics = sorted(
            self.all_metrics.values(),
            key=lambda m: m.last_modified
        )

        completeness_scores = [
            self.exporter._assess_completeness(
                self.exporter._read_content(m.path),
                m.word_count
            )
            for m in sorted_metrics
        ]

        if len(completeness_scores) < 2:
            return {
                'trend': 'stable',
                'mean': completeness_scores[0] if completeness_scores else 0,
                'stdev': 0,
                'min': completeness_scores[0] if completeness_scores else 0,
                'max': completeness_scores[0] if completeness_scores else 0,
            }

        # Detect trend by comparing first half vs second half
        mid = len(completeness_scores) // 2
        first_half_mean = mean(completeness_scores[:mid])
        second_half_mean = mean(completeness_scores[mid:])

        if second_half_mean > first_half_mean + 5:
            trend = 'improving'
        elif second_half_mean < first_half_mean - 5:
            trend = 'declining'
        else:
            trend = 'stable'

        return {
            'trend': trend,
            'mean': mean(completeness_scores),
            'stdev': stdev(completeness_scores) if len(completeness_scores) > 1 else 0,
            'min': min(completeness_scores),
            'max': max(completeness_scores),
            'variance': variance(completeness_scores) if len(completeness_scores) > 1 else 0,
        }

    def compute_clarity_consistency(self) -> Dict[str, any]:
        """
        Metric 2: Clarity score consistency (standard deviation).

        Returns:
            Clarity consistency analysis
        """
        if not self.all_metrics:
            return {'consistency': 0, 'stdev': 0}

        clarity_scores = [
            self.exporter._assess_clarity(
                self.exporter._read_content(m.path)
            )
            for m in self.all_metrics.values()
        ]

        if len(clarity_scores) < 2:
            return {
                'mean': clarity_scores[0] if clarity_scores else 0,
                'stdev': 0,
                'consistency': 100,
            }

        mean_clarity = mean(clarity_scores)
        stdev_clarity = stdev(clarity_scores)

        # Consistency: lower stdev = higher consistency
        consistency = max(0, 100 - (stdev_clarity * 2))

        return {
            'mean': mean_clarity,
            'stdev': stdev_clarity,
            'consistency': consistency,
            'min': min(clarity_scores),
            'max': max(clarity_scores),
        }

    def compute_diataxis_compliance(self) -> Dict[str, any]:
        """
        Metric 3: Diataxis compliance rate.

        Returns:
            Compliance percentage and category breakdown
        """
        if not self.all_metrics:
            return {'rate': 0, 'categories': {}}

        categories = defaultdict(int)
        compliant = 0

        for metrics in self.all_metrics.values():
            if metrics.diataxis_category:
                compliant += 1
                categories[metrics.diataxis_category] += 1
            else:
                categories['uncategorized'] += 1

        total = len(self.all_metrics)
        rate = (compliant / total * 100) if total > 0 else 0

        return {
            'rate': rate,
            'compliant_count': compliant,
            'total': total,
            'categories': dict(categories),
        }

    def compute_examples_quality(self) -> Dict[str, any]:
        """
        Metric 4: Examples quality (average relevance and count).

        Returns:
            Examples analysis
        """
        if not self.all_metrics:
            return {'avg_count': 0, 'avg_relevance': 0}

        example_counts = [m.example_count for m in self.all_metrics.values()]
        has_examples = sum(1 for m in self.all_metrics.values() if m.has_examples)

        avg_count = mean(example_counts) if example_counts else 0
        coverage = (has_examples / len(self.all_metrics) * 100) if self.all_metrics else 0

        # Relevance: estimate from code block consistency
        total_examples = sum(example_counts)
        relevance = min(100, coverage)  # Higher coverage = higher relevance

        return {
            'avg_count': avg_count,
            'total_examples': total_examples,
            'coverage_percent': coverage,
            'relevance_score': relevance,
            'min': min(example_counts) if example_counts else 0,
            'max': max(example_counts) if example_counts else 0,
        }

    def compute_recency_distribution(self) -> Dict[str, any]:
        """
        Metric 5: Recency distribution (how old are docs?).

        Returns:
            Age distribution analysis
        """
        if not self.all_metrics:
            return {}

        now = datetime.now()
        ages_days = [
            (now - m.last_modified).days
            for m in self.all_metrics.values()
        ]

        # Distribution buckets
        buckets = {
            'last_7_days': sum(1 for a in ages_days if a <= 7),
            'last_30_days': sum(1 for a in ages_days if 8 <= a <= 30),
            'last_90_days': sum(1 for a in ages_days if 31 <= a <= 90),
            'older_90_days': sum(1 for a in ages_days if a > 90),
        }

        return {
            'mean_age_days': mean(ages_days),
            'stdev_age_days': stdev(ages_days) if len(ages_days) > 1 else 0,
            'oldest_days': max(ages_days),
            'newest_days': min(ages_days),
            'distribution': buckets,
        }

    def compute_consistency_drift(self) -> Dict[str, any]:
        """
        Metric 6: Consistency drift (terminology changes over time).

        Returns:
            Terminology consistency analysis
        """
        if not self.all_metrics:
            return {'drift': 0, 'score': 0}

        # Extract all terminology
        all_terms = defaultdict(list)
        for metrics in self.all_metrics.values():
            for term in metrics.terminology_used:
                all_terms[term].append(metrics.last_modified)

        # Analyze term stability
        stable_terms = sum(1 for terms in all_terms.values() if len(set(terms)) == 1)
        total_terms = len(all_terms)

        consistency = (stable_terms / total_terms * 100) if total_terms > 0 else 0

        # Drift: measure change in term usage over time
        term_counts_early = 0
        term_counts_late = 0

        if self.all_metrics:
            sorted_by_date = sorted(
                self.all_metrics.values(),
                key=lambda m: m.last_modified
            )
            mid_idx = len(sorted_by_date) // 2

            for term in all_terms:
                early_uses = sum(
                    1 for m in sorted_by_date[:mid_idx]
                    if term in m.terminology_used
                )
                late_uses = sum(
                    1 for m in sorted_by_date[mid_idx:]
                    if term in m.terminology_used
                )
                term_counts_early += early_uses
                term_counts_late += late_uses

        drift = 0
        if term_counts_early > 0:
            drift = abs(term_counts_late - term_counts_early) / term_counts_early * 100

        return {
            'consistency_score': consistency,
            'drift_percent': min(100, drift),
            'total_unique_terms': total_terms,
            'stable_terms': stable_terms,
        }

    def compute_cross_reference_integrity(self) -> Dict[str, any]:
        """
        Metric 7: Cross-reference integrity (valid references).

        Returns:
            Reference validity analysis
        """
        if not self.all_metrics:
            return {'validity': 1.0, 'total': 0}

        total_refs = 0
        valid_refs = 0
        broken_refs = []

        for metrics in self.all_metrics.values():
            total_refs += len(metrics.cross_references)
            valid_refs += len(metrics.cross_references) - len(metrics.broken_references)
            broken_refs.extend(metrics.broken_references)

        validity = (valid_refs / total_refs) if total_refs > 0 else 1.0

        return {
            'validity_rate': validity,
            'total_references': total_refs,
            'valid_references': valid_refs,
            'broken_references': len(broken_refs),
            'broken_examples': list(set(broken_refs[:10])),  # First 10 unique
        }

    def compute_gate_pass_rate(self) -> Dict[str, any]:
        """
        Metric 8: Proof gate pass rate.

        Returns:
            Gate pass rate analysis
        """
        if not self.all_metrics:
            return {'rate': 0, 'passed': 0}

        passed = sum(1 for m in self.all_metrics.values() if m.proof_gate_passed)
        total = len(self.all_metrics)

        return {
            'rate': (passed / total) if total > 0 else 0,
            'passed': passed,
            'failed': total - passed,
            'total': total,
        }

    def compute_authority_approval_rate(self) -> Dict[str, any]:
        """
        Metric 9: Authority approval rate.

        Returns:
            Approval rate analysis
        """
        if not self.all_metrics:
            return {'rate': 0, 'approved': 0}

        approved = sum(1 for m in self.all_metrics.values() if m.authority_approved)
        total = len(self.all_metrics)

        return {
            'rate': (approved / total) if total > 0 else 0,
            'approved': approved,
            'denied': total - approved,
            'total': total,
        }

    def compute_orphan_count_trend(self) -> Dict[str, any]:
        """
        Metric 10: Orphan count trend (unreferenced documents).

        Returns:
            Orphan analysis
        """
        if not self.all_metrics:
            return {'orphan_count': 0, 'trend': 'stable'}

        # Build reference graph
        referenced = set()
        for metrics in self.all_metrics.values():
            referenced.update(metrics.cross_references)

        doc_names = {m.name for m in self.all_metrics.values()}
        orphans = doc_names - referenced

        # Trend: check if orphan count is increasing
        # (simplified: if >20% of docs are orphans, trend is 'increasing')
        orphan_percent = (len(orphans) / len(doc_names) * 100) if doc_names else 0

        if orphan_percent > 25:
            trend = 'increasing'
        elif orphan_percent < 10:
            trend = 'decreasing'
        else:
            trend = 'stable'

        return {
            'orphan_count': len(orphans),
            'orphan_percent': orphan_percent,
            'trend': trend,
            'total_docs': len(doc_names),
            'orphan_examples': list(orphans)[:10],
        }

    def compute_semantic_distance(self) -> Dict[str, any]:
        """
        Metric 11: Semantic distance (pairwise doc similarity).

        Returns:
            Semantic divergence analysis
        """
        if len(self.all_metrics) < 2:
            return {'avg_distance': 0, 'divergence_trend': 'unknown'}

        # Simplified semantic distance: measure term overlap
        metrics_list = list(self.all_metrics.values())
        distances = []

        for i, m1 in enumerate(metrics_list):
            for m2 in metrics_list[i+1:]:
                terms1 = set(m1.terminology_used)
                terms2 = set(m2.terminology_used)

                if not terms1 or not terms2:
                    distance = 1.0
                else:
                    intersection = len(terms1 & terms2)
                    union = len(terms1 | terms2)
                    similarity = intersection / union if union > 0 else 0
                    distance = 1 - similarity

                distances.append(distance)

        avg_distance = mean(distances) if distances else 0

        # Divergence trend
        if avg_distance > 0.7:
            trend = 'high_divergence'
        elif avg_distance > 0.5:
            trend = 'moderate_divergence'
        else:
            trend = 'convergent'

        return {
            'avg_distance': avg_distance,
            'divergence_trend': trend,
            'sample_count': len(distances),
            'stdev': stdev(distances) if len(distances) > 1 else 0,
        }

    def compute_update_frequency(self) -> Dict[str, any]:
        """
        Metric 12: Update frequency (docs/week).

        Returns:
            Update rate analysis
        """
        if not self.all_metrics:
            return {'rate_per_week': 0}

        # Find date range
        dates = [m.last_modified for m in self.all_metrics.values()]
        oldest = min(dates)
        newest = max(dates)

        time_span = (newest - oldest).days
        weeks = max(1, time_span / 7)  # Avoid division by zero

        docs_updated = len(self.all_metrics)
        rate_per_week = docs_updated / weeks

        return {
            'rate_per_week': rate_per_week,
            'docs_analyzed': docs_updated,
            'time_span_days': time_span,
            'oldest_doc': oldest.isoformat(),
            'newest_doc': newest.isoformat(),
        }

    def generate_report(self) -> Dict[str, any]:
        """
        Generate complete convergence report.

        Returns:
            Dictionary with all 12 metrics
        """
        return {
            'metadata': {
                'generated_at': datetime.now().isoformat(),
                'docs_analyzed': len(self.all_metrics),
                'docs_directory': str(self.docs_dir),
            },
            'metrics': {
                'completeness_trend': self.compute_completeness_trend(),
                'clarity_consistency': self.compute_clarity_consistency(),
                'diataxis_compliance': self.compute_diataxis_compliance(),
                'examples_quality': self.compute_examples_quality(),
                'recency_distribution': self.compute_recency_distribution(),
                'consistency_drift': self.compute_consistency_drift(),
                'cross_reference_integrity': self.compute_cross_reference_integrity(),
                'gate_pass_rate': self.compute_gate_pass_rate(),
                'authority_approval_rate': self.compute_authority_approval_rate(),
                'orphan_count_trend': self.compute_orphan_count_trend(),
                'semantic_distance': self.compute_semantic_distance(),
                'update_frequency': self.compute_update_frequency(),
            },
        }

    def format_text_report(self, report: Dict) -> str:
        """
        Format report as human-readable text.

        Args:
            report: Report dictionary from generate_report()

        Returns:
            Formatted text report
        """
        lines = []

        lines.append("=" * 80)
        lines.append("DOCUMENTATION SEMANTIC CONVERGENCE ANALYSIS REPORT")
        lines.append("=" * 80)
        lines.append("")

        meta = report['metadata']
        lines.append(f"Generated: {meta['generated_at']}")
        lines.append(f"Documents Analyzed: {meta['docs_analyzed']}")
        lines.append(f"Directory: {meta['docs_directory']}")
        lines.append("")

        metrics = report['metrics']

        # 1. Completeness Trend
        lines.append("1. COMPLETENESS TREND")
        lines.append("-" * 40)
        ct = metrics['completeness_trend']
        lines.append(f"  Trend: {ct.get('trend', 'unknown').upper()}")
        lines.append(f"  Mean: {ct.get('mean', 0):.1f}")
        lines.append(f"  StdDev: {ct.get('stdev', 0):.1f}")
        lines.append(f"  Range: {ct.get('min', 0):.0f} - {ct.get('max', 0):.0f}")
        lines.append("")

        # 2. Clarity Consistency
        lines.append("2. CLARITY CONSISTENCY")
        lines.append("-" * 40)
        cc = metrics['clarity_consistency']
        lines.append(f"  Mean Clarity: {cc.get('mean', 0):.1f}")
        lines.append(f"  Consistency: {cc.get('consistency', 0):.1f}%")
        lines.append(f"  StdDev: {cc.get('stdev', 0):.1f}")
        lines.append(f"  Range: {cc.get('min', 0):.0f} - {cc.get('max', 0):.0f}")
        lines.append("")

        # 3. Diataxis Compliance
        lines.append("3. DIATAXIS COMPLIANCE")
        lines.append("-" * 40)
        dc = metrics['diataxis_compliance']
        lines.append(f"  Compliance Rate: {dc.get('rate', 0):.1f}%")
        lines.append(f"  Compliant Docs: {dc.get('compliant_count', 0)}/{dc.get('total', 0)}")
        for cat, count in dc.get('categories', {}).items():
            lines.append(f"    {cat}: {count}")
        lines.append("")

        # 4. Examples Quality
        lines.append("4. EXAMPLES QUALITY")
        lines.append("-" * 40)
        eq = metrics['examples_quality']
        lines.append(f"  Average Examples/Doc: {eq.get('avg_count', 0):.1f}")
        lines.append(f"  Coverage: {eq.get('coverage_percent', 0):.1f}%")
        lines.append(f"  Relevance Score: {eq.get('relevance_score', 0):.1f}")
        lines.append(f"  Total Examples: {eq.get('total_examples', 0)}")
        lines.append("")

        # 5. Recency Distribution
        lines.append("5. RECENCY DISTRIBUTION")
        lines.append("-" * 40)
        rd = metrics['recency_distribution']
        lines.append(f"  Mean Age: {rd.get('mean_age_days', 0):.1f} days")
        lines.append(f"  Newest: {rd.get('newest_days', 0):.0f} days ago")
        lines.append(f"  Oldest: {rd.get('oldest_days', 0):.0f} days ago")
        dist = rd.get('distribution', {})
        lines.append(f"  Last 7 days: {dist.get('last_7_days', 0)}")
        lines.append(f"  Last 30 days: {dist.get('last_30_days', 0)}")
        lines.append(f"  Last 90 days: {dist.get('last_90_days', 0)}")
        lines.append(f"  Older: {dist.get('older_90_days', 0)}")
        lines.append("")

        # 6. Consistency Drift
        lines.append("6. CONSISTENCY DRIFT (Terminology)")
        lines.append("-" * 40)
        cd = metrics['consistency_drift']
        lines.append(f"  Consistency Score: {cd.get('consistency_score', 0):.1f}%")
        lines.append(f"  Drift Percent: {cd.get('drift_percent', 0):.1f}%")
        lines.append(f"  Unique Terms: {cd.get('total_unique_terms', 0)}")
        lines.append(f"  Stable Terms: {cd.get('stable_terms', 0)}")
        lines.append("")

        # 7. Cross-Reference Integrity
        lines.append("7. CROSS-REFERENCE INTEGRITY")
        lines.append("-" * 40)
        cri = metrics['cross_reference_integrity']
        lines.append(f"  Validity Rate: {cri.get('validity_rate', 0):.2%}")
        lines.append(f"  Total References: {cri.get('total_references', 0)}")
        lines.append(f"  Valid References: {cri.get('valid_references', 0)}")
        lines.append(f"  Broken References: {cri.get('broken_references', 0)}")
        if cri.get('broken_examples'):
            lines.append("  Examples of broken links:")
            for ref in cri['broken_examples'][:5]:
                lines.append(f"    - {ref}")
        lines.append("")

        # 8. Gate Pass Rate
        lines.append("8. PROOF GATE PASS RATE")
        lines.append("-" * 40)
        gpr = metrics['gate_pass_rate']
        lines.append(f"  Pass Rate: {gpr.get('rate', 0):.2%}")
        lines.append(f"  Passed: {gpr.get('passed', 0)}")
        lines.append(f"  Failed: {gpr.get('failed', 0)}")
        lines.append("")

        # 9. Authority Approval
        lines.append("9. AUTHORITY APPROVAL RATE")
        lines.append("-" * 40)
        aar = metrics['authority_approval_rate']
        lines.append(f"  Approval Rate: {aar.get('rate', 0):.2%}")
        lines.append(f"  Approved: {aar.get('approved', 0)}")
        lines.append(f"  Denied: {aar.get('denied', 0)}")
        lines.append("")

        # 10. Orphan Count
        lines.append("10. ORPHAN COUNT TREND")
        lines.append("-" * 40)
        oct = metrics['orphan_count_trend']
        lines.append(f"  Orphan Count: {oct.get('orphan_count', 0)}")
        lines.append(f"  Orphan Percent: {oct.get('orphan_percent', 0):.1f}%")
        lines.append(f"  Trend: {oct.get('trend', 'unknown').upper()}")
        if oct.get('orphan_examples'):
            lines.append("  Examples of orphaned docs:")
            for doc in oct['orphan_examples'][:5]:
                lines.append(f"    - {doc}")
        lines.append("")

        # 11. Semantic Distance
        lines.append("11. SEMANTIC DISTANCE (Divergence)")
        lines.append("-" * 40)
        sd = metrics['semantic_distance']
        lines.append(f"  Average Distance: {sd.get('avg_distance', 0):.3f}")
        lines.append(f"  Trend: {sd.get('divergence_trend', 'unknown').upper()}")
        lines.append(f"  StdDev: {sd.get('stdev', 0):.3f}")
        lines.append(f"  Sample Pairs: {sd.get('sample_count', 0)}")
        lines.append("")

        # 12. Update Frequency
        lines.append("12. UPDATE FREQUENCY")
        lines.append("-" * 40)
        uf = metrics['update_frequency']
        lines.append(f"  Rate (docs/week): {uf.get('rate_per_week', 0):.2f}")
        lines.append(f"  Docs Analyzed: {uf.get('docs_analyzed', 0)}")
        lines.append(f"  Time Span: {uf.get('time_span_days', 0)} days")
        lines.append("")

        # Summary
        lines.append("=" * 80)
        lines.append("CONVERGENCE SUMMARY")
        lines.append("=" * 80)

        # Determine overall convergence health
        health_score = self._compute_health_score(metrics)
        lines.append(f"Overall Convergence Health: {health_score:.1f}/100")
        lines.append("")

        if health_score >= 80:
            lines.append("Status: HEALTHY - Documentation is well-converged")
        elif health_score >= 60:
            lines.append("Status: ACCEPTABLE - Some improvements recommended")
        else:
            lines.append("Status: NEEDS WORK - Significant improvements needed")

        lines.append("")
        lines.append("=" * 80)

        return '\n'.join(lines)

    def _compute_health_score(self, metrics: Dict) -> float:
        """Compute overall health score from metrics."""
        scores = []

        # Completeness trend (40-100)
        ct = metrics['completeness_trend']
        completeness = ct.get('mean', 0)
        scores.append(completeness * 0.15)

        # Clarity consistency (0-100)
        cc = metrics['clarity_consistency']
        clarity = cc.get('consistency', 0)
        scores.append(clarity * 0.15)

        # Diataxis compliance
        dc = metrics['diataxis_compliance']
        scores.append(dc.get('rate', 0) * 0.15)

        # Examples coverage
        eq = metrics['examples_quality']
        scores.append(min(100, eq.get('coverage_percent', 0)) * 0.10)

        # Cross-reference validity
        cri = metrics['cross_reference_integrity']
        scores.append(cri.get('validity_rate', 0) * 100 * 0.15)

        # Gate pass rate
        gpr = metrics['gate_pass_rate']
        scores.append(gpr.get('rate', 0) * 100 * 0.15)

        # Authority approval
        aar = metrics['authority_approval_rate']
        scores.append(aar.get('rate', 0) * 100 * 0.10)

        return sum(scores)


def main():
    """Entry point."""
    parser = argparse.ArgumentParser(
        description='Documentation semantic convergence analysis'
    )
    parser.add_argument(
        '--docs-dir',
        type=Path,
        default=Path(__file__).parent.parent.parent / 'pictl' / 'docs',
        help='Path to documentation directory'
    )
    parser.add_argument(
        '--output',
        type=Path,
        default=Path('/tmp/docs_convergence_report.json'),
        help='Output JSON file path'
    )
    parser.add_argument(
        '--max-docs',
        type=int,
        default=50,
        help='Maximum documents to analyze'
    )

    args = parser.parse_args()

    print(f"Analyzing documentation from: {args.docs_dir}")
    print(f"Output will be written to: {args.output}")
    print()

    try:
        analyzer = ConvergenceAnalyzer(args.docs_dir, args.max_docs)

        # Gather docs
        doc_count = analyzer.gather_documentation()
        print(f"Found {doc_count} documentation files (limited to {args.max_docs})")

        # Analyze
        analyzer.analyze_all_documents()
        print(f"Analyzed {len(analyzer.all_metrics)} documents")
        print()

        # Generate report
        report = analyzer.generate_report()

        # Output JSON
        output_file = Path(args.output)
        output_file.parent.mkdir(parents=True, exist_ok=True)

        with open(output_file, 'w') as f:
            json.dump(report, f, indent=2, default=str)

        print(f"JSON report written to: {output_file}")
        print()

        # Output text report
        text_report = analyzer.format_text_report(report)
        print(text_report)

        # Also write text report
        text_file = output_file.with_suffix('.txt')
        with open(text_file, 'w') as f:
            f.write(text_report)

        print(f"Text report written to: {text_file}")
        print()

        return 0

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
