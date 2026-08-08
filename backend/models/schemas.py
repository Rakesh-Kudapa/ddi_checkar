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

class MechanismReference(BaseModel):
    ref_type: str
    ref_url: str

class VerifiedMechanism(BaseModel):
    target: str
    action_type: Optional[str] = None
    mechanism_of_action: str
    references: List[MechanismReference]

class VerifiedSeverity(BaseModel):
    level: str
    source: str = "DDInter"

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
    pubchem_cid: Optional[int] = None
    smiles: Optional[str] = None
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
    patient_context_used: Optional[PatientContext] = None
    disclaimer: str
    provider: str
    created_at: str

class DrugInfoResult(BaseModel):
    name: str
    rxcui: Optional[str]
    standard_name: str
    drug_classes: List[str]
    label_excerpt: str
    pubchem_cid: Optional[int] = None
    smiles: Optional[str] = None
    verified_mechanisms: List[VerifiedMechanism] = []
