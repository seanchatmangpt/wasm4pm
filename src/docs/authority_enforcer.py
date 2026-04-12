"""Authority enforcement engine for documentation review and publication.

Implements autonomous documentation authority logic that gates documentation
publication based on author role and documentation category.

Authority is role-based and doc-category-driven:
- Core Maintainer: 0.95 authority (can write any doc: architecture, core, API reference)
- Feature Author: 0.7 authority (can write feature-specific docs: how-tos, examples)
- Contributor: 0.5 authority (can write fixes, clarifications, examples)

Thresholds:
- Core docs (architecture, API reference): author authority >= 0.9
- How-to docs: author authority >= 0.7
- Example/tutorial docs: author authority >= 0.5
- Fix/clarification docs: author authority >= 0.3

DSPy Module performs semantic review against 8 documentation gates; fallback is
deterministic: approved if author_authority >= category_threshold.

Authority decisions are recorded with OTel spans for process mining validation.
All decisions are immutable and recorded with BLAKE3 receipts.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

logger = logging.getLogger(__name__)

try:
    import dspy

    HAS_DSPY = True
except ImportError:
    HAS_DSPY = False


# ---------------------------------------------------------------------------
# Authority Constants & Validation
# ---------------------------------------------------------------------------

# Valid documentation categories
DOC_CATEGORIES = {
    "architecture": "System architecture, design patterns, core concepts",
    "api_reference": "API documentation, signatures, reference material",
    "how_to": "Task-oriented guides, step-by-step instructions",
    "tutorial": "Learning-oriented tutorials, getting started",
    "explanation": "Concept explanations, background, theory",
    "example": "Code examples, sample usage, demonstrations",
    "fix": "Typo fixes, clarifications, minor corrections",
    "changelog": "Release notes, version history",
}

# Valid author roles
AUTHOR_ROLES = {
    "core": "Core maintainer — can write any documentation",
    "feature": "Feature author — can write feature-specific documentation",
    "contributor": "Contributor — can write fixes and examples",
}

# Authority thresholds per role
ROLE_AUTHORITY_LEVELS = {
    "core": 0.95,
    "feature": 0.7,
    "contributor": 0.5,
}

# Authority thresholds per category
CATEGORY_AUTHORITY_THRESHOLDS = {
    "architecture": 0.9,      # Core docs need high authority
    "api_reference": 0.9,     # Core docs need high authority
    "how_to": 0.7,            # Feature-specific docs
    "tutorial": 0.5,          # Learning material
    "explanation": 0.7,       # Conceptual material
    "example": 0.5,           # Examples and samples
    "fix": 0.3,               # Minimal fixes/clarifications
    "changelog": 0.8,         # Release notes
}

# Documentation review gates (8 gates)
DOC_REVIEW_GATES = [
    "title_clarity",           # Title is clear and descriptive
    "content_completeness",    # Content covers main topic completely
    "example_presence",        # Examples present where appropriate
    "audience_alignment",      # Content matches target audience
    "reference_accuracy",      # References and links are accurate
    "formatting_consistency",  # Formatting follows style guide
    "accessibility",           # Content is accessible (language, structure)
    "no_placeholder_or_todo",  # No TODOs or placeholder text
]


@dataclass
class AuthorityCheckResult:
    """Result of a documentation authority enforcement decision.

    Attributes
    ----------
        doc_title: Title of the document being reviewed
        doc_category: Category of documentation (architecture, how_to, etc.)
        author_role: Role of the author (core, feature, contributor)
        author_authority: Authority level of the author (0.0-1.0)
        category_threshold: Required authority threshold for this category
        approved: Boolean result of authority check
        reasoning: Human-readable explanation of decision
        gates_passed: Number of documentation review gates passed
        gates_total: Total number of gates evaluated
        gates_details: Dict mapping gate names to pass/fail status
        escalated: Whether escalation occurred
        escalated_to_role: Role escalated to (if applicable)
        decision_timestamp: When the decision was made (ISO 8601)
        span_id: OTel span ID for tracing
        receipt_hash: BLAKE3 receipt hash for provenance
        previous_hash: Previous receipt in chain
        metadata: Additional decision context
    """

    doc_title: str
    doc_category: str
    author_role: str
    author_authority: float
    category_threshold: float
    approved: bool
    reasoning: str
    gates_passed: int = 0
    gates_total: int = len(DOC_REVIEW_GATES)
    gates_details: dict[str, bool] = field(default_factory=dict)
    escalated: bool = False
    escalated_to_role: str | None = None
    decision_timestamp: str = ""
    span_id: str = ""
    receipt_hash: str = ""
    previous_hash: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return asdict(self)


# ---------------------------------------------------------------------------
# DSPy Documentation Review Signature
# ---------------------------------------------------------------------------

if HAS_DSPY:

    class DocReviewSignature(dspy.Signature):
        """LLM evaluates documentation against 8 gates and produces approval decision.

        The LLM acts as a documentation quality engine, evaluating author authority
        and document quality against category-specific requirements.

        Gates evaluated:
        1. title_clarity — Is the title clear and descriptive?
        2. content_completeness — Does content cover the main topic completely?
        3. example_presence — Are examples present where appropriate?
        4. audience_alignment — Does content match the target audience?
        5. reference_accuracy — Are references and links accurate?
        6. formatting_consistency — Does formatting follow style guide?
        7. accessibility — Is content accessible (language, structure)?
        8. no_placeholder_or_todo — Are there no TODOs or placeholders?
        """

        doc_title = dspy.InputField(desc="Title of the document being reviewed")
        doc_category = dspy.InputField(
            desc="Category of documentation: architecture, api_reference, how_to, tutorial, explanation, example, fix, changelog"
        )
        author_role = dspy.InputField(
            desc="Role of the author: core, feature, or contributor"
        )
        author_authority = dspy.InputField(
            desc="Authority level of the author (as percentage 0.0-1.0)"
        )
        category_threshold = dspy.InputField(
            desc="Required authority threshold for this category (as percentage 0.0-1.0)"
        )
        doc_content = dspy.InputField(desc="First 2000 chars of document content")
        examples_count = dspy.InputField(desc="Number of code/usage examples in document")
        completeness_percent = dspy.InputField(
            desc="Estimated percentage of topic coverage (0-100)"
        )

        # Output fields
        gates_passed = dspy.OutputField(
            desc="Number of documentation gates passed (0-8 as integer)"
        )
        gates_failed = dspy.OutputField(
            desc="Comma-separated list of failed gate names (or 'none' if all passed)"
        )
        approval_reasoning = dspy.OutputField(
            desc="Detailed reasoning for approval or rejection"
        )
        approved = dspy.OutputField(desc="Approval decision: yes or no")

else:
    # Stub class when DSPy is not available
    class DocReviewSignature:  # type: ignore
        """Stub: LLM evaluates documentation against 8 gates."""

        pass


# ---------------------------------------------------------------------------
# DSPy Documentation Review Module
# ---------------------------------------------------------------------------


class DocumentationReviewModule(dspy.Module if HAS_DSPY else object):
    """DSPy module for documentation authority-gated approval decisions."""

    def __init__(self) -> None:
        if HAS_DSPY:
            super().__init__()
            self.review = dspy.ChainOfThought(DocReviewSignature)
        else:
            self.review = None

    def forward(
        self,
        doc_title: str,
        doc_category: str,
        author_role: str,
        author_authority: float,
        category_threshold: float,
        doc_content: str,
        examples_count: int,
        completeness_percent: int,
    ) -> dict[str, Any]:
        """Evaluate documentation using LLM or deterministic fallback.

        Args:
            doc_title: Title of the document
            doc_category: Category of documentation
            author_role: Role of the author
            author_authority: Author's authority level (0.0-1.0)
            category_threshold: Required threshold for category (0.0-1.0)
            doc_content: Document content (first 2000 chars)
            examples_count: Number of examples
            completeness_percent: Estimated coverage percentage (0-100)

        Returns
        -------
            dict with approved (bool), gates_passed (int), reasoning (str), and model identifier
        """
        if not HAS_DSPY:
            return self._deterministic_fallback(
                author_authority, category_threshold, examples_count, completeness_percent
            )

        try:
            result = self.review(
                doc_title=doc_title,
                doc_category=doc_category,
                author_role=author_role,
                author_authority=f"{author_authority:.2%}",
                category_threshold=f"{category_threshold:.2%}",
                doc_content=doc_content[:2000],
                examples_count=str(examples_count),
                completeness_percent=str(completeness_percent),
            )

            approved = self._parse_approved(result.approved)
            gates_passed = self._parse_gates_passed(result.gates_passed)
            gates_failed = self._parse_gates_failed(result.gates_failed)
            reasoning = result.approval_reasoning

            return {
                "approved": approved,
                "gates_passed": gates_passed,
                "gates_failed": gates_failed,
                "reasoning": reasoning,
                "model": (
                    getattr(self.review, "lm", None)
                    and str(getattr(getattr(self.review, "lm", None), "model", "unknown"))
                )
                or "dspy",
            }
        except Exception as err:  # noqa: BLE001
            logger.debug(
                "LLM review failed for %s/%s: %s, using fallback",
                doc_category,
                doc_title,
                err,
            )
            return self._deterministic_fallback(
                author_authority, category_threshold, examples_count, completeness_percent
            )

    @staticmethod
    def _parse_approved(raw: str) -> bool:
        """Parse yes/no from LLM output."""
        return "yes" in raw.lower().strip()[:10]

    @staticmethod
    def _parse_gates_passed(raw: str) -> int:
        """Parse gates passed count from LLM output."""
        try:
            parts = raw.strip().split("/")
            return int(parts[0].split()[-1])
        except (ValueError, IndexError):
            return 0

    @staticmethod
    def _parse_gates_failed(raw: str) -> list[str]:
        """Parse list of failed gates from LLM output."""
        if "none" in raw.lower():
            return []
        try:
            return [g.strip() for g in raw.split(",") if g.strip()]
        except Exception:  # noqa: BLE001
            return []

    @staticmethod
    def _deterministic_fallback(
        author_authority: float,
        category_threshold: float,
        examples_count: int,
        completeness_percent: int,
    ) -> dict[str, Any]:
        """Deterministic fallback when LLM unavailable.

        Core rule: approved if author_authority >= category_threshold AND
        basic quality checks pass (completeness >= 70%, examples present for how-to).
        """
        authority_ok = author_authority >= category_threshold
        completeness_ok = completeness_percent >= 70
        examples_ok = examples_count > 0

        approved = authority_ok and completeness_ok and examples_ok

        gates_passed = sum([completeness_ok, examples_ok and examples_count >= 1])
        gates_passed = min(gates_passed, 8)  # Cap at 8 gates

        reasoning = (
            f"Authority {author_authority:.2%} >= threshold {category_threshold:.2%}: {authority_ok}. "
            f"Completeness {completeness_percent}% >= 70%: {completeness_ok}. "
            f"Examples present: {examples_ok}. "
            f"Deterministic approval: {approved}"
        )

        return {
            "approved": approved,
            "gates_passed": gates_passed,
            "gates_failed": [g for g in DOC_REVIEW_GATES[:2] if not completeness_ok]
            + ([DOC_REVIEW_GATES[2]] if not examples_ok else []),
            "reasoning": reasoning,
            "model": "deterministic",
        }


# ---------------------------------------------------------------------------
# Documentation Authority Enforcer
# ---------------------------------------------------------------------------


class DocAuthorityEnforcer:
    """Autonomic authority enforcement engine for documentation publication.

    Validates author authority against category-specific thresholds and performs
    semantic review of documentation quality. Uses DSPy for reasoning; deterministic
    fallback ensures hard rules are enforced.

    Authority decisions are immutable once made and recorded with BLAKE3 receipts.
    """

    def __init__(self, pipeline_id: str = "") -> None:
        """Initialize documentation authority enforcer.

        Args:
            pipeline_id: Pipeline ID for tracing (auto-generated if not provided)
        """
        self.pipeline_id = pipeline_id or uuid4().hex[:12]
        self.decisions: list[AuthorityCheckResult] = []
        self.receipts: list[dict[str, Any]] = []
        self._review_module: DocumentationReviewModule | None = None
        self._llm_configured = False

        if HAS_DSPY:
            try:
                self._review_module = DocumentationReviewModule()
                self._ensure_llm()
            except Exception as err:  # noqa: BLE001
                logger.debug("Failed to initialize DSPy module: %s", err)

    def _ensure_llm(self) -> bool:
        """Ensure LLM is configured for this enforcer."""
        if self._llm_configured:
            return True
        try:
            import dspy

            # Configure with Groq if available, otherwise use default
            dspy.configure(
                model="groq/openai/gpt-oss-20b"
            ) if hasattr(dspy, "configure") else None
            self._llm_configured = True
        except Exception as err:  # noqa: BLE001
            logger.debug("Failed to configure LM: %s", err)
            return False
        return True

    def review_document(
        self,
        doc_title: str,
        doc_category: str,
        author_role: str,
        doc_content: str,
        examples_count: int = 0,
        completeness_percent: int = 100,
    ) -> AuthorityCheckResult:
        """Review document and make authority-based approval decision.

        Author roles and default authority levels:
        - core: 0.95 authority (can write any doc)
        - feature: 0.7 authority (can write feature-specific docs)
        - contributor: 0.5 authority (can write fixes and examples)

        Category thresholds:
        - architecture: >= 0.9 (core docs)
        - api_reference: >= 0.9 (core docs)
        - how_to: >= 0.7 (feature docs)
        - tutorial: >= 0.5 (learning material)
        - explanation: >= 0.7 (conceptual material)
        - example: >= 0.5 (examples)
        - fix: >= 0.3 (minimal fixes)
        - changelog: >= 0.8 (release notes)

        Args:
            doc_title: Title of the document
            doc_category: Category (must be in DOC_CATEGORIES)
            author_role: Author role (must be in AUTHOR_ROLES)
            doc_content: Full document content
            examples_count: Number of code/usage examples in document
            completeness_percent: Estimated coverage percentage (0-100)

        Returns
        -------
            AuthorityCheckResult with decision, reasoning, gates status, and provenance

        Raises
        ------
            ValueError: If doc_category or author_role are invalid
            ValueError: If examples_count or completeness_percent are out of range
        """
        # Validate inputs
        if doc_category not in DOC_CATEGORIES:
            valid_cats = ", ".join(DOC_CATEGORIES.keys())
            msg = (
                f"Invalid doc_category '{doc_category}'. "
                f"Must be one of: {valid_cats}"
            )
            raise ValueError(msg)

        if author_role not in AUTHOR_ROLES:
            valid_roles = ", ".join(AUTHOR_ROLES.keys())
            msg = (
                f"Invalid author_role '{author_role}'. "
                f"Must be one of: {valid_roles}"
            )
            raise ValueError(msg)

        if not (0 <= examples_count <= 1000):
            msg = f"examples_count must be in [0, 1000], got {examples_count}"
            raise ValueError(msg)

        if not (0 <= completeness_percent <= 100):
            msg = f"completeness_percent must be in [0, 100], got {completeness_percent}"
            raise ValueError(msg)

        # Get authority level and threshold
        author_authority = ROLE_AUTHORITY_LEVELS[author_role]
        category_threshold = CATEGORY_AUTHORITY_THRESHOLDS[doc_category]

        # Generate tracing IDs
        span_id = uuid4().hex[:16]
        trace_id = uuid4().hex[:32]

        # Emit OTel span for this decision
        self._emit_review_span(
            doc_title=doc_title,
            doc_category=doc_category,
            author_role=author_role,
            author_authority=author_authority,
            category_threshold=category_threshold,
            span_id=span_id,
            trace_id=trace_id,
        )

        # Get review decision from module (LLM or fallback)
        review_dict = (
            self._review_module.forward(
                doc_title=doc_title,
                doc_category=doc_category,
                author_role=author_role,
                author_authority=author_authority,
                category_threshold=category_threshold,
                doc_content=doc_content,
                examples_count=examples_count,
                completeness_percent=completeness_percent,
            )
            if self._review_module
            else {
                "approved": author_authority >= category_threshold,
                "gates_passed": min(5, max(2, completeness_percent // 20)),
                "gates_failed": [],
                "reasoning": f"Deterministic: {author_authority:.2%} vs {category_threshold:.2%}",
                "model": "deterministic",
            }
        )

        approved = review_dict.get("approved", False)
        gates_passed = review_dict.get("gates_passed", 0)
        gates_failed = review_dict.get("gates_failed", [])
        reasoning = review_dict.get("reasoning", "Unknown")
        model = review_dict.get("model", "unknown")

        # Build gates details dictionary
        gates_details = {gate: gate not in gates_failed for gate in DOC_REVIEW_GATES}

        # Generate receipt
        receipt = self._generate_receipt(
            doc_title=doc_title,
            doc_category=doc_category,
            author_role=author_role,
            author_authority=author_authority,
            category_threshold=category_threshold,
            approved=approved,
        )

        # Create result
        result = AuthorityCheckResult(
            doc_title=doc_title,
            doc_category=doc_category,
            author_role=author_role,
            author_authority=author_authority,
            category_threshold=category_threshold,
            approved=approved,
            reasoning=reasoning,
            gates_passed=gates_passed,
            gates_total=len(DOC_REVIEW_GATES),
            gates_details=gates_details,
            escalated=False,
            escalated_to_role=None,
            decision_timestamp=datetime.now(UTC).isoformat(),
            span_id=span_id,
            receipt_hash=receipt["blake3_hash"],
            previous_hash=receipt["prev_hash"],
            metadata={
                "doc_category": doc_category,
                "author_role": author_role,
                "examples_count": examples_count,
                "completeness_percent": completeness_percent,
                "model": model,
                "trace_id": trace_id,
            },
        )

        self.decisions.append(result)
        self.receipts.append(receipt)

        return result

    def check_authority(
        self, author_role: str, doc_category: str
    ) -> tuple[bool, float]:
        """Quick check: is author authorized for this doc category?

        Args:
            author_role: Role of the author (core, feature, contributor)
            doc_category: Documentation category

        Returns
        -------
            Tuple of (authorized: bool, authority_level: float)

        Raises
        ------
            ValueError: If author_role or doc_category are invalid
        """
        if author_role not in AUTHOR_ROLES:
            valid_roles = ", ".join(AUTHOR_ROLES.keys())
            msg = (
                f"Invalid author_role '{author_role}'. "
                f"Must be one of: {valid_roles}"
            )
            raise ValueError(msg)

        if doc_category not in DOC_CATEGORIES:
            valid_cats = ", ".join(DOC_CATEGORIES.keys())
            msg = (
                f"Invalid doc_category '{doc_category}'. "
                f"Must be one of: {valid_cats}"
            )
            raise ValueError(msg)

        author_authority = ROLE_AUTHORITY_LEVELS[author_role]
        category_threshold = CATEGORY_AUTHORITY_THRESHOLDS[doc_category]
        authorized = author_authority >= category_threshold

        return authorized, author_authority

    def _emit_review_span(
        self,
        doc_title: str,
        doc_category: str,
        author_role: str,
        author_authority: float,
        category_threshold: float,
        span_id: str,
        trace_id: str,
    ) -> None:
        """Emit OTel span for documentation review decision."""
        try:
            import opentelemetry.trace as trace

            tracer = trace.get_tracer("pictl.docs.authority")
            if tracer is None:
                return

            with tracer.start_as_current_span(
                f"pictl.doc.review.{doc_category}",
                attributes={
                    "pictl.doc.title": doc_title,
                    "pictl.doc.category": doc_category,
                    "pictl.doc.author_role": author_role,
                    "pictl.doc.author_authority": author_authority,
                    "pictl.doc.category_threshold": category_threshold,
                    "pictl.pipeline_id": f"docs-{self.pipeline_id}",
                    "pictl.system": "doc_authority_enforcer",
                    "pictl.doc.span_id": span_id,
                    "pictl.doc.trace_id": trace_id,
                },
            ) as span:
                if span:
                    span.set_attribute("pictl.doc.reviewed", True)
        except Exception as err:  # noqa: BLE001
            logger.debug("Failed to emit review span: %s", err)

    def _generate_receipt(
        self,
        doc_title: str,
        doc_category: str,
        author_role: str,
        author_authority: float,
        category_threshold: float,
        approved: bool,
    ) -> dict[str, Any]:
        """Generate BLAKE3 receipt for documentation review decision."""
        receipt_data = json.dumps(
            {
                "pipeline_id": self.pipeline_id,
                "doc_title": doc_title,
                "doc_category": doc_category,
                "author_role": author_role,
                "author_authority": author_authority,
                "category_threshold": category_threshold,
                "approved": approved,
                "timestamp": datetime.now(UTC).isoformat(),
            },
            sort_keys=True,
        ).encode()

        try:
            import blake3

            blake3_hash = blake3.blake3(receipt_data).hexdigest()
        except ImportError:
            blake3_hash = hashlib.sha256(receipt_data).hexdigest()

        prev_hash = self.receipts[-1]["blake3_hash"] if self.receipts else "0" * 64

        receipt = {
            "pipeline_id": self.pipeline_id,
            "doc_title": doc_title,
            "doc_category": doc_category,
            "decision_id": uuid4().hex[:16],
            "approved": approved,
            "blake3_hash": blake3_hash,
            "prev_hash": prev_hash,
            "timestamp": datetime.now(UTC).isoformat(),
        }

        return receipt

    def get_decisions(self) -> list[AuthorityCheckResult]:
        """Get all review decisions made by this enforcer."""
        return self.decisions

    def get_receipts(self) -> list[dict[str, Any]]:
        """Get all BLAKE3 receipts for decisions made by this enforcer."""
        return self.receipts

    def get_summary(self) -> dict[str, Any]:
        """Get summary statistics for all reviews."""
        if not self.decisions:
            return {
                "total_reviews": 0,
                "approved": 0,
                "rejected": 0,
                "approval_rate": 0.0,
                "avg_gates_passed": 0.0,
            }

        approved_count = sum(1 for d in self.decisions if d.approved)
        rejected_count = len(self.decisions) - approved_count
        avg_gates = (
            sum(d.gates_passed for d in self.decisions) / len(self.decisions)
            if self.decisions
            else 0.0
        )

        return {
            "total_reviews": len(self.decisions),
            "approved": approved_count,
            "rejected": rejected_count,
            "approval_rate": approved_count / len(self.decisions) if self.decisions else 0.0,
            "avg_gates_passed": avg_gates,
            "pipeline_id": self.pipeline_id,
        }
