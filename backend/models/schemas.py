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
    llm_provider: LLMProvider
    llm_api_key: str

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

class MultiCheckRequest(BaseModel):
    drugs: List[str]
    llm_provider: LLMProvider
    llm_api_key: str

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

class HistoryListResult(BaseModel):
    items: List[HistorySummary]

class HistoryDetail(BaseModel):
    id: int
    drug_a: str
    drug_b: str
    standard_a: str
    standard_b: str
    risk_level: RiskLevel
    mechanism: str
    clinical_effect: str
    recommendation: str
    llm_summary: str
    sources: List[InteractionSource]
    disclaimer: str
    provider: str
    created_at: str

class DrugInfoResult(BaseModel):
    name: str
    rxcui: Optional[str]
    standard_name: str
    drug_classes: List[str]
    label_excerpt: str
