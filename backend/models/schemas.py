from pydantic import BaseModel
from typing import Optional, List
from enum import Enum

class RiskLevel(str, Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    UNKNOWN = "unknown"

class LLMProvider(str, Enum):
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"
    GROK = "grok"

class MechanismType(str, Enum):
    PK = "PK"
    PD = "PD"
    BOTH = "both"
    UNKNOWN = "unknown"

# DDInter's bulk-download bundle date (backend/data/ddinter/README.md) — a
# fixed fact about the whole dataset, not something looked up per request.
# Update this if the bundled CSVs are ever re-downloaded from a newer export.
DDINTER_DATASET_DATE = "2026-08-08"

class MechanismReference(BaseModel):
    ref_type: str
    ref_url: str

class VerifiedMechanism(BaseModel):
    target: str
    action_type: Optional[str] = None
    mechanism_of_action: str
    references: List[MechanismReference]
    retrieved_at: Optional[str] = None   # when this drug's ChEMBL entry was first cached

class VerifiedSeverity(BaseModel):
    level: str
    source: str = "DDInter"
    dataset_date: str = DDINTER_DATASET_DATE

class ActionConvention(BaseModel):
    """A generic, rule-based translation of DDInter's severity category into
    a clinical-action style label (see CLAUDE.md "Next Up" #2) — deliberately
    NOT a per-pair verified recommendation (DDInter's bulk data has no
    per-pair management text) and NOT the AI's own `recommendation` (Tier 2).
    A third, distinct category: a fixed convention applied by this app's own
    rules, shown only when a verified severity exists to apply it to."""
    action: str
    description: str
    basis: str = (
        "General convention based on DDInter's severity category — not a "
        "per-pair verified recommendation and not AI-generated."
    )

class SeverityComparison(BaseModel):
    """Reconciliation between DDInter's verified severity and the AI's
    risk_level — see backend/services/severity.py. Only present when a
    verified severity exists at all; absence means there was nothing to
    compare (not that they were compared and found unrelated)."""
    agrees: bool
    verified_normalized: RiskLevel   # DDInter's level mapped onto the AI's 4-point scale
    ai_risk_level: RiskLevel         # the AI's own risk_level, repeated here for convenience
    display_level: RiskLevel         # whichever of the two is more severe — what the UI should lead with
    display_source: str              # "verified" | "ai" | "both" — which side display_level came from
    explanation: str                 # human-readable note on agreement/disagreement and why

class PatientContext(BaseModel):
    age: Optional[int] = None
    renal_function: Optional[str] = None
    hepatic_function: Optional[str] = None
    pregnant: Optional[bool] = None
    other_conditions: Optional[str] = None

class DrugResolved(BaseModel):
    name: str               # original user input
    rxcui: Optional[str]    # resolved RxCUI ID
    standard_name: str      # RxNorm standard name
    resolved_at: Optional[str] = None            # when this RxCUI lookup was first cached
    pubchem_cid: Optional[int] = None
    smiles: Optional[str] = None
    structure_retrieved_at: Optional[str] = None  # when this PubChem structure was first cached
    verified_mechanisms: List[VerifiedMechanism] = []

class InteractionSource(BaseModel):
    name: str
    url: str

class InteractionRequest(BaseModel):
    drug_a: str
    drug_b: str
    llm_provider: LLMProvider
    llm_api_key: str
    patient_context: Optional[PatientContext] = None

class InteractionResult(BaseModel):
    drug_a: DrugResolved
    drug_b: DrugResolved
    risk_level: RiskLevel
    mechanism: str
    mechanism_type: MechanismType
    targets_involved: List[str]
    pathway: str
    clinical_effect: str
    recommendation: str
    llm_summary: str
    sources: List[InteractionSource]
    verified_severity: Optional[VerifiedSeverity] = None
    severity_comparison: Optional[SeverityComparison] = None
    action_convention: Optional[ActionConvention] = None
    patient_context_used: Optional[PatientContext] = None
    disclaimer: str = (
        "This tool is for research and informational purposes only. "
        "It does not constitute medical advice. Always consult a licensed "
        "pharmacist or physician before making prescribing decisions."
    )

class AutocompleteResult(BaseModel):
    suggestions: List[str]

class MultiCheckRequest(BaseModel):
    drugs: List[str]
    llm_provider: LLMProvider
    llm_api_key: str
    patient_context: Optional[PatientContext] = None

class MultiCheckResult(BaseModel):
    pairs: List[InteractionResult]

class HistorySummary(BaseModel):
    id: int
    drug_a: str
    drug_b: str
    standard_a: str
    standard_b: str
    risk_level: RiskLevel
    provider: str
    created_at: str

class DeleteHistoryRequest(BaseModel):
    ids: List[int]

class DeleteHistoryResult(BaseModel):
    deleted: int

class HistoryListResult(BaseModel):
    items: List[HistorySummary]
    total: int

class HistoryDetail(BaseModel):
    id: int
    drug_a: DrugResolved
    drug_b: DrugResolved
    risk_level: RiskLevel
    mechanism: str
    mechanism_type: MechanismType
    targets_involved: List[str]
    pathway: str
    clinical_effect: str
    recommendation: str
    llm_summary: str
    sources: List[InteractionSource]
    verified_severity: Optional[VerifiedSeverity] = None
    severity_comparison: Optional[SeverityComparison] = None
    action_convention: Optional[ActionConvention] = None
    patient_context_used: Optional[PatientContext] = None
    disclaimer: str
    provider: str
    created_at: str

class DataSourceStatus(BaseModel):
    rxnorm: str
    openfda: str
    pubchem: str
    chembl: str
    ddinter: str
    rxnav_interaction: str

class DrugInfoResult(BaseModel):
    name: str
    rxcui: Optional[str]
    standard_name: str
    resolved_at: Optional[str] = None
    drug_classes: List[str]
    label_excerpt: str
    pubchem_cid: Optional[int] = None
    smiles: Optional[str] = None
    structure_retrieved_at: Optional[str] = None
    verified_mechanisms: List[VerifiedMechanism] = []
