"""Chicago-style tests for :func:`wasm4pm_dspy.models.terminal_conclusions` --
pure, deterministic, no LM, no subprocess.

The exact case that motivated this function: a live Groq run this session
produced a rule graph where the goal's real intended answer
(``recommended_antibiotic=penicillin``) was consumed as a premise by a
further rule, silently demoting it from terminal to intermediate -- causing
wasm4pm's real MYCIN engine to select a different, lower-value conclusion
instead. These tests replay that exact case as a regression, plus the
Shortliffe & Buchanan 1975 textbook example the Rust engine's own unit test
(``shortliffe_1975_organism_cf_07_therapy_cf_063``) is built from.
"""

from __future__ import annotations

from wasm4pm_dspy.models import BreedInput, Rule, terminal_conclusions


def _breed_input(rules: list[Rule]) -> BreedInput:
    return BreedInput(
        intent="test", facts=[], rules=rules, cases=[], goals=[], candidates=[], state=[]
    )


def test_single_terminal_rule():
    bi = _breed_input(
        [Rule(id="r1", premise=["x=1"], conclusion="y=derived", certainty=0.9)]
    )
    assert terminal_conclusions(bi) == ["y=derived"]


def test_shortliffe_1975_therapy_is_terminal_organism_is_not():
    """RULE050: gram-positive+coccus+chains -> organism=streptococcus.
    RULE071: organism=streptococcus+no-allergy -> therapy=penicillin.
    Matches production_rules.rs's own passing unit test: therapy=penicillin
    is terminal (never consumed), organism=streptococcus is not (consumed by
    RULE071's premise)."""
    bi = _breed_input(
        [
            Rule(
                id="RULE050-class",
                premise=["gram-positive", "coccus", "chains"],
                conclusion="organism=streptococcus",
                certainty=0.7,
            ),
            Rule(
                id="RULE071-class",
                premise=["organism=streptococcus", "allergy-penicillin=no"],
                conclusion="therapy=penicillin",
                certainty=0.9,
            ),
        ]
    )
    assert terminal_conclusions(bi) == ["therapy=penicillin"]


def test_live_groq_regression_extra_rule_demotes_intended_answer():
    """Exact rule graph a real Groq run produced this session: rule3 chains
    off of both organism AND the intended therapy answer, consuming the
    latter as a premise and making 'high_sensitivity=true' the only
    terminal conclusion instead of the actually-intended
    'recommended_antibiotic=penicillin'."""
    bi = _breed_input(
        [
            Rule(
                id="rule1",
                premise=["gram_positive=true", "growth_pattern=chains"],
                conclusion="possible_organism=Streptococcus",
                certainty=0.9,
            ),
            Rule(
                id="rule2",
                premise=["possible_organism=Streptococcus"],
                conclusion="recommended_antibiotic=penicillin",
                certainty=0.95,
            ),
            Rule(
                id="rule3",
                premise=["possible_organism=Streptococcus", "recommended_antibiotic=penicillin"],
                conclusion="high_sensitivity=true",
                certainty=0.95,
            ),
        ]
    )
    # This is exactly the defect: the intended answer is NOT terminal.
    assert terminal_conclusions(bi) == ["high_sensitivity=true"]
    assert "recommended_antibiotic=penicillin" not in terminal_conclusions(bi)

    # The fix: removing rule3 restores the intended answer as terminal.
    fixed = _breed_input([r for r in bi.rules if r.id != "rule3"])
    assert terminal_conclusions(fixed) == ["recommended_antibiotic=penicillin"]


def test_no_rules_no_terminals():
    assert terminal_conclusions(_breed_input([])) == []


def test_cyclic_rules_have_no_terminal_conclusion():
    """A -> B and B -> A: every conclusion is also consumed as a premise, so
    there is no terminal conclusion at all -- this function returns an empty
    list rather than guessing, matching the honest-gap documented in its
    docstring about not simulating actual rule-firing order."""
    bi = _breed_input(
        [
            Rule(id="r1", premise=["a"], conclusion="b", certainty=0.9),
            Rule(id="r2", premise=["b"], conclusion="a", certainty=0.9),
        ]
    )
    assert terminal_conclusions(bi) == []
