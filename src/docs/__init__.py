"""Documentation analysis and monitoring tools."""

from .metrics_exporter import DocumentationMetricsExporter, DocumentMetrics

try:
    from .authority_enforcer import (
        AuthorityCheckResult,
        DocAuthorityEnforcer,
        DocReviewSignature,
        DocumentationReviewModule,
    )

    __all__ = [
        "AuthorityCheckResult",
        "DocAuthorityEnforcer",
        "DocReviewSignature",
        "DocumentationReviewModule",
        "DocumentationMetricsExporter",
        "DocumentMetrics",
    ]
except ImportError:
    # Fall back if DSPy or other dependencies are missing
    __all__ = [
        "DocumentationMetricsExporter",
        "DocumentMetrics",
    ]
