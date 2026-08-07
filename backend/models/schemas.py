from pydantic import BaseModel
from typing import Optional, List
from enum import Enum

class RiskLevel(str, Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    UNKNOWN = "unknown"

class DrugResolved(BaseModel):
    name: str               # original user input
    rxcui: Optional[str]    # resolved RxCUI ID
    standard_name: str      # RxNorm standard name

class InteractionSource(BaseModel):
    name: str
    url: str

class InteractionRequest(BaseModel):
    drug_a: str
    drug_b: str

class InteractionResult(BaseModel):
    drug_a: DrugResolved
    drug_b: DrugResolved
    risk_level: RiskLevel
    mechanism: str
    clinical_effect: str
    recommendation: str
    llm_summary: str
    sources: List[InteractionSource]
    disclaimer: str = (
        "This tool is for research and informational purposes only. "
        "It does not constitute medical advice. Always consult a licensed "
        "pharmacist or physician before making prescribing decisions."
    )

class AutocompleteResult(BaseModel):
    suggestions: List[str]
