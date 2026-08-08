"""Reconciles DDInter's verified (Tier 1) severity against the AI's (Tier 2)
risk_level — see CLAUDE.md "Next Up #1". The two scales are independently
produced (DDInter is a fixed literature-curated rating; the AI's risk_level
is synthesized per-request from OpenFDA label text and any patient context)
so they can legitimately land on different tiers. This module detects that
and decides what the UI should lead with.

Stated policy (confirmed with the user 2026-08-08): when they disagree, the
result card leads with whichever is MORE severe, not whichever source is
"trusted" — this is the standard err-toward-caution convention in clinical
decision support and avoids having to declare one source authoritative over
the other. The full detail (both values, why they can differ) is always
shown underneath the headline regardless of which one leads.
"""

from backend.models.schemas import RiskLevel, VerifiedSeverity, SeverityComparison, ActionConvention

# DDInter's fixed literature-curated levels map onto the AI's four-point
# scale by clinical intent, not by any formula — Major implies the kind of
# risk that would make the AI say "high," etc.
DDINTER_TO_RISK = {
    "major": RiskLevel.HIGH,
    "moderate": RiskLevel.MODERATE,
    "minor": RiskLevel.LOW,
    "unknown": RiskLevel.UNKNOWN,
}

# Unknown ranks below every concrete level so a real rating on either side
# always outranks "no data," rather than "unknown" being treated as zero risk.
_SEVERITY_RANK = {
    RiskLevel.UNKNOWN: -1,
    RiskLevel.LOW: 0,
    RiskLevel.MODERATE: 1,
    RiskLevel.HIGH: 2,
}


def reconcile(verified: VerifiedSeverity | None, risk_level: RiskLevel) -> SeverityComparison | None:
    """Returns None when there's no verified severity to compare against —
    the existing "AI-assessed only" UI path already covers that case."""
    if verified is None:
        return None

    verified_normalized = DDINTER_TO_RISK.get(verified.level.strip().lower(), RiskLevel.UNKNOWN)

    both_known = verified_normalized != RiskLevel.UNKNOWN and risk_level != RiskLevel.UNKNOWN
    agrees = both_known and verified_normalized == risk_level

    if _SEVERITY_RANK[verified_normalized] >= _SEVERITY_RANK[risk_level]:
        display_level, display_source = verified_normalized, "verified"
    else:
        display_level, display_source = risk_level, "ai"
    if verified_normalized == risk_level:
        display_source = "both"

    if not both_known:
        explanation = (
            f"DDInter rates this pair '{verified.level}' (maps to {verified_normalized.value}); "
            f"the AI's own assessment is '{risk_level.value}'. One side is unknown, so agreement "
            "can't be determined — shown as-is rather than guessed."
        )
    elif agrees:
        explanation = (
            f"DDInter's verified severity ('{verified.level}') and the AI's assessment "
            f"('{risk_level.value}') agree."
        )
    else:
        explanation = (
            f"DDInter's verified severity ('{verified.level}', a fixed literature-curated rating) "
            f"differs from the AI's assessment ('{risk_level.value}'), which incorporates this "
            "specific pair's OpenFDA label text and any patient context supplied. The more severe "
            f"of the two ({display_level.value}) is shown as the headline risk; both values are "
            "kept visible so you can judge which applies to your case."
        )

    return SeverityComparison(
        agrees=agrees,
        verified_normalized=verified_normalized,
        ai_risk_level=risk_level,
        display_level=display_level,
        display_source=display_source,
        explanation=explanation,
    )


# CLAUDE.md "Next Up" #2: DDInter's severity is a research classification,
# not a clinical action (unlike Lexicomp's "Avoid combination"/"Monitor
# therapy" categories). This is the (a) option from that doc — a generic,
# clearly-labeled convention — chosen because the (b) option (a genuine
# per-pair management source) isn't available: DDInter's bulk download has
# no management field, and hitting their live per-pair page for it would
# re-raise the same don't-hit-their-private-endpoint concern already settled
# for severity (see docs/api_notes.md). No entry for "unknown" — deliberately
# don't guess an action for a rating that isn't itself known.
_ACTION_CONVENTION = {
    "major": ActionConvention(
        action="Avoid combination / requires clinical intervention",
        description=(
            "Major-rated pairs are typically avoided, or used only with active "
            "clinical monitoring and dose adjustment."
        ),
    ),
    "moderate": ActionConvention(
        action="Monitor therapy",
        description=(
            "Moderate-rated pairs are usually manageable with monitoring, dose "
            "spacing, or dose adjustment rather than avoidance."
        ),
    ),
    "minor": ActionConvention(
        action="Minimal clinical significance",
        description=(
            "Minor-rated pairs typically require no specific action beyond "
            "routine awareness."
        ),
    ),
}


def action_convention_for(verified: VerifiedSeverity | None) -> ActionConvention | None:
    """None when there's no verified severity, or when its level is Unknown —
    both cases mean there's nothing to convert into an action convention."""
    if verified is None:
        return None
    return _ACTION_CONVENTION.get(verified.level.strip().lower())
