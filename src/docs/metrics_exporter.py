"""
Documentation Quality Metrics Exporter

Real-time Prometheus metrics for documentation quality monitoring.
Tracks 12 metrics across completeness, clarity, conformance, and authority.

Entry point: DocumentationMetricsExporter.export()
"""

import re
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, List
from collections import defaultdict

try:
    from prometheus_client import Counter, Gauge, Histogram, CollectorRegistry
except ImportError:
    # Fallback for environments without prometheus_client
    CollectorRegistry = None
    Counter = Gauge = Histogram = None


@dataclass
class DocumentMetrics:
    """Computed metrics for a single document."""
    path: Path
    name: str
    word_count: int
    line_count: int
    has_examples: bool
    example_count: int
    last_modified: datetime
    cross_references: List[str] = field(default_factory=list)
    broken_references: List[str] = field(default_factory=list)
    diataxis_category: Optional[str] = None
    proof_gate_passed: bool = True
    authority_approved: bool = True
    terminology_used: List[str] = field(default_factory=list)


class DocumentationMetricsExporter:
    """
    Thread-safe singleton exporter for documentation quality metrics.

    Emits 12 Prometheus metrics:
    - docs_total: Counter of total documents
    - docs_completeness_percent: Gauge average completeness (0-100)
    - docs_clarity_score: Gauge average clarity (0-100)
    - docs_gate_pass_rate: Gauge proof gate pass rate (0-1)
    - docs_diataxis_compliance: Gauge correct Diataxis category %
    - docs_examples_ratio: Gauge examples per 1000 words
    - docs_recency_days: Histogram days since last update
    - docs_consistency_score: Gauge terminology consistency (0-100)
    - docs_cross_reference_validity: Gauge valid reference rate (0-1)
    - docs_orphan_count: Gauge unreferenced documents
    - docs_proof_gates_failed_total: Counter gate failures
    - docs_authority_reviews_total: Counter reviews by outcome
    """

    _instance: Optional['DocumentationMetricsExporter'] = None
    _lock = threading.Lock()

    def __new__(cls):
        """Singleton pattern with thread safety."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        """Initialize metrics (only once via singleton)."""
        if self._initialized:
            return

        self._initialized = True
        self._lock = threading.Lock()
        self._document_metrics: Dict[str, DocumentMetrics] = {}
        self._authority_outcomes: Dict[str, int] = defaultdict(int)
        self._gate_failures: int = 0

        # Initialize Prometheus metrics if available
        if CollectorRegistry:
            self.registry = CollectorRegistry()

            self.docs_total = Counter(
                'docs_total',
                'Total documentation files processed',
                registry=self.registry
            )

            self.docs_completeness_percent = Gauge(
                'docs_completeness_percent',
                'Average document completeness (0-100)',
                registry=self.registry
            )

            self.docs_clarity_score = Gauge(
                'docs_clarity_score',
                'Average document clarity score (0-100)',
                registry=self.registry
            )

            self.docs_gate_pass_rate = Gauge(
                'docs_gate_pass_rate',
                'Proof gate pass rate (0-1)',
                registry=self.registry
            )

            self.docs_diataxis_compliance = Gauge(
                'docs_diataxis_compliance',
                'Percentage of documents in correct Diataxis category',
                registry=self.registry
            )

            self.docs_examples_ratio = Gauge(
                'docs_examples_ratio',
                'Examples per 1000 words',
                registry=self.registry
            )

            self.docs_recency_days = Histogram(
                'docs_recency_days',
                'Days since last document update',
                buckets=[1, 7, 14, 30, 60, 90, 180, 365],
                registry=self.registry
            )

            self.docs_consistency_score = Gauge(
                'docs_consistency_score',
                'Terminology consistency score (0-100)',
                registry=self.registry
            )

            self.docs_cross_reference_validity = Gauge(
                'docs_cross_reference_validity',
                'Cross-reference validity rate (0-1)',
                registry=self.registry
            )

            self.docs_orphan_count = Gauge(
                'docs_orphan_count',
                'Count of unreferenced documents',
                registry=self.registry
            )

            self.docs_proof_gates_failed_total = Counter(
                'docs_proof_gates_failed_total',
                'Total proof gate failures',
                registry=self.registry
            )

            self.docs_authority_reviews_total = Counter(
                'docs_authority_reviews_total',
                'Total authority reviews by outcome',
                registry=self.registry
            )
        else:
            # Fallback: no Prometheus, just track internally
            self.registry = None

    def analyze_document(self, file_path: Path) -> DocumentMetrics:
        """Analyze a single documentation file."""
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Extract metrics
        word_count = len(content.split())
        line_count = len(content.split('\n'))
        last_modified = datetime.fromtimestamp(file_path.stat().st_mtime)

        # Detect Diataxis category from path and content
        diataxis_category = self._detect_diataxis_category(file_path, content)

        # Count examples (code blocks, tables, step-by-step)
        has_examples = '```' in content or '|' in content or 'Step' in content
        example_count = len(re.findall(r'```', content)) // 2  # Pairs of backticks

        # Extract cross-references (markdown links)
        cross_references = re.findall(r'\[([^\]]+)\]\(([^)]+)\)', content)
        cross_refs_urls = [url for _, url in cross_references]

        # Find broken references (links to non-existent files)
        broken_refs = self._find_broken_references(file_path, cross_refs_urls)

        # Extract terminology
        terminology = self._extract_terminology(content)

        # Assess completeness and clarity
        completeness = self._assess_completeness(content, word_count)
        clarity = self._assess_clarity(content)

        metrics = DocumentMetrics(
            path=file_path,
            name=file_path.name,
            word_count=word_count,
            line_count=line_count,
            has_examples=has_examples,
            example_count=example_count,
            last_modified=last_modified,
            cross_references=cross_refs_urls,
            broken_references=broken_refs,
            diataxis_category=diataxis_category,
            terminology_used=terminology,
        )

        # Store and emit span
        with self._lock:
            self._document_metrics[str(file_path)] = metrics

        return metrics

    def _detect_diataxis_category(self, file_path: Path, content: str) -> Optional[str]:
        """Detect Diataxis category from path and content markers."""
        path_str = str(file_path)

        # Path-based detection
        if '/tutorial' in path_str or '/tutorials/' in path_str:
            return 'tutorial'
        if '/how-to' in path_str or '/how_to/' in path_str:
            return 'how-to'
        if '/explanation' in path_str or '/explanation/' in path_str:
            return 'explanation'
        if '/reference' in path_str or '/reference/' in path_str:
            return 'reference'

        # Content-based detection
        lower = content.lower()
        if 'tutorial' in lower and 'learn' in lower:
            return 'tutorial'
        if 'how to' in lower and 'step' in lower:
            return 'how-to'
        if 'conceptual' in lower or 'understanding' in lower:
            return 'explanation'
        if 'reference' in lower or 'api' in lower:
            return 'reference'

        return None

    def _find_broken_references(
        self, file_path: Path, cross_refs: List[str]
    ) -> List[str]:
        """Identify broken cross-references."""
        broken = []
        base_dir = file_path.parent

        for ref in cross_refs:
            # Skip external URLs
            if ref.startswith('http://') or ref.startswith('https://'):
                continue

            # Skip anchor-only references
            if ref.startswith('#'):
                continue

            # Resolve relative path
            target = base_dir / ref
            if not target.exists() and not target.with_suffix('.md').exists():
                broken.append(ref)

        return broken

    def _extract_terminology(self, content: str) -> List[str]:
        """Extract domain-specific terminology from document."""
        # Look for bold terms (potential definitions)
        bold_terms = re.findall(r'\*\*([^*]+)\*\*', content)

        # Look for code terms
        code_terms = re.findall(r'`([^`]+)`', content)

        # Combine and deduplicate
        return list(set(bold_terms[:20] + code_terms[:20]))  # Limit to 20 each

    def _assess_completeness(self, content: str, word_count: int) -> int:
        """Assess document completeness (0-100)."""
        score = 0

        # Minimum length
        if word_count >= 100:
            score += 20
        if word_count >= 500:
            score += 20
        if word_count >= 1000:
            score += 20

        # Structure quality
        heading_count = len(re.findall(r'^#+', content, re.MULTILINE))
        if heading_count >= 3:
            score += 15
        if heading_count >= 5:
            score += 5

        # Examples/code
        if '```' in content:
            score += 10

        # Cross-references
        link_count = len(re.findall(r'\[([^\]]+)\]\(', content))
        if link_count >= 3:
            score += 10
        if link_count >= 10:
            score += 5

        return min(100, score)

    def _assess_clarity(self, content: str) -> int:
        """Assess document clarity (0-100)."""
        score = 50  # Base score

        # Positive signals
        if 'Example' in content or '```' in content:
            score += 15
        if 'Step' in content or 'then' in content:
            score += 10
        if 'See also' in content or 'Related' in content:
            score += 10

        # Negative signals
        if 'TODO' in content or 'FIXME' in content:
            score -= 15
        if len(content.split('\n')) > 500:
            score -= 10

        # Table of contents
        if content.startswith('#') and '\n##' in content:
            score += 15

        return max(0, min(100, score))

    def compute_aggregate_metrics(self) -> Dict[str, float]:
        """Compute aggregate metrics across all documents."""
        if not self._document_metrics:
            return {}

        metrics = list(self._document_metrics.values())

        # Average completeness
        completeness_scores = [
            self._assess_completeness(self._read_content(m.path), m.word_count)
            for m in metrics
        ]
        avg_completeness = sum(completeness_scores) / len(completeness_scores)

        # Average clarity
        clarity_scores = [
            self._assess_clarity(self._read_content(m.path))
            for m in metrics
        ]
        avg_clarity = sum(clarity_scores) / len(clarity_scores)

        # Gate pass rate
        passed = sum(1 for m in metrics if m.proof_gate_passed)
        gate_pass_rate = passed / len(metrics) if metrics else 0

        # Diataxis compliance
        compliant = sum(1 for m in metrics if m.diataxis_category)
        diataxis_compliance = (compliant / len(metrics) * 100) if metrics else 0

        # Examples ratio
        total_words = sum(m.word_count for m in metrics)
        total_examples = sum(m.example_count for m in metrics)
        examples_ratio = (total_examples / total_words * 1000) if total_words > 0 else 0

        # Recency (days since update)
        now = datetime.now()
        recencies = [
            (now - m.last_modified).days
            for m in metrics
        ]
        avg_recency = sum(recencies) / len(recencies) if recencies else 0

        # Consistency score
        all_terms = []
        for m in metrics:
            all_terms.extend(m.terminology_used)

        term_freq = defaultdict(int)
        for term in all_terms:
            term_freq[term] += 1

        consistency = (
            len([t for f in term_freq.values() if f > 1]) / len(term_freq) * 100
            if term_freq
            else 0
        )

        # Cross-reference validity
        total_refs = sum(len(m.cross_references) for m in metrics)
        valid_refs = total_refs - sum(len(m.broken_references) for m in metrics)
        xref_validity = (valid_refs / total_refs) if total_refs > 0 else 1.0

        # Orphan count
        referenced_files = set()
        for m in metrics:
            referenced_files.update(m.cross_references)
        doc_files = {m.name for m in metrics}
        orphans = len(doc_files - referenced_files)

        return {
            'completeness_percent': avg_completeness,
            'clarity_score': avg_clarity,
            'gate_pass_rate': gate_pass_rate,
            'diataxis_compliance': diataxis_compliance,
            'examples_ratio': examples_ratio,
            'recency_days': avg_recency,
            'consistency_score': consistency,
            'cross_reference_validity': xref_validity,
            'orphan_count': float(orphans),
            'docs_total': float(len(metrics)),
        }

    def _read_content(self, file_path: Path) -> str:
        """Read file content safely."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception:
            return ""

    def export(self, registry: Optional['CollectorRegistry'] = None) -> Dict:
        """
        Export metrics in Prometheus format.

        Args:
            registry: Optional Prometheus registry. If None, uses internal registry.

        Returns:
            Dictionary of metric values.
        """
        aggregates = self.compute_aggregate_metrics()

        if self.registry and CollectorRegistry:
            # Update Prometheus metrics
            if 'docs_total' in aggregates:
                self.docs_total._value.set(aggregates['docs_total'])

            if 'completeness_percent' in aggregates:
                self.docs_completeness_percent.set(aggregates['completeness_percent'])

            if 'clarity_score' in aggregates:
                self.docs_clarity_score.set(aggregates['clarity_score'])

            if 'gate_pass_rate' in aggregates:
                self.docs_gate_pass_rate.set(aggregates['gate_pass_rate'])

            if 'diataxis_compliance' in aggregates:
                self.docs_diataxis_compliance.set(aggregates['diataxis_compliance'])

            if 'examples_ratio' in aggregates:
                self.docs_examples_ratio.set(aggregates['examples_ratio'])

            if 'recency_days' in aggregates:
                self.docs_recency_days.observe(aggregates['recency_days'])

            if 'consistency_score' in aggregates:
                self.docs_consistency_score.set(aggregates['consistency_score'])

            if 'cross_reference_validity' in aggregates:
                self.docs_cross_reference_validity.set(
                    aggregates['cross_reference_validity']
                )

            if 'orphan_count' in aggregates:
                self.docs_orphan_count.set(aggregates['orphan_count'])

        return aggregates

    def record_authority_review(
        self, doc_name: str, outcome: str
    ) -> None:
        """
        Record an authority review decision.

        Args:
            doc_name: Name of document reviewed
            outcome: One of 'approved', 'denied', 'escalated'
        """
        if outcome not in ['approved', 'denied', 'escalated']:
            raise ValueError(f"Invalid outcome: {outcome}")

        with self._lock:
            self._authority_outcomes[outcome] += 1

            if self.registry and self.docs_authority_reviews_total:
                self.docs_authority_reviews_total.inc()

    def record_gate_failure(self, doc_name: str, gate_name: str) -> None:
        """
        Record a proof gate failure.

        Args:
            doc_name: Document that failed
            gate_name: Name of failed gate
        """
        with self._lock:
            self._gate_failures += 1

            if self.registry and self.docs_proof_gates_failed_total:
                self.docs_proof_gates_failed_total.inc()

    def get_metrics_snapshot(self) -> Dict[str, any]:
        """
        Return current metrics snapshot.

        Returns:
            Dictionary with all computed metrics and counts.
        """
        with self._lock:
            aggregates = self.compute_aggregate_metrics()
            aggregates['authority_outcomes'] = dict(self._authority_outcomes)
            aggregates['gate_failures'] = self._gate_failures
            return aggregates
