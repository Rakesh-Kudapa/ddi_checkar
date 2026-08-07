import anthropic
import json
from backend.models.schemas import (
    DrugResolved, InteractionResult, InteractionSource, RiskLevel
)

client = anthropic.Anthropic()

SYSTEM_PROMPT = """You are a clinical pharmacology assistant.
Given structured drug interaction data from RxNav and FDA drug labels,
produce a clear, accurate summary for a researcher or clinician.
Be factual. Never speculate beyond the data provided.
Output must be valid JSON only — no preamble, no markdown fences."""

async def synthesize(
    drug_a: DrugResolved,
    drug_b: DrugResolved,
    ddi_data: dict,
    label_a: str,
    label_b: str
) -> InteractionResult:
    """Send all gathered data to Claude, return structured InteractionResult."""

    user_prompt = f"""
Drug A: {drug_a.standard_name} (RxCUI: {drug_a.rxcui})
Drug B: {drug_b.standard_name} (RxCUI: {drug_b.rxcui})

RxNav interaction data:
{json.dumps(ddi_data["interactions"], indent=2)}

FDA label interactions — {drug_a.standard_name}:
{label_a or "No FDA label data found"}

FDA label interactions — {drug_b.standard_name}:
{label_b or "No FDA label data found"}

Return a JSON object with exactly these fields:
{{
  "risk_level": "low" | "moderate" | "high" | "unknown",
  "mechanism": "pharmacological mechanism of the interaction",
  "clinical_effect": "what happens to the patient",
  "recommendation": "what a clinician should do",
  "llm_summary": "2-3 sentence plain English paragraph"
}}
"""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}]
    )

    parsed = json.loads(response.content[0].text)

    return InteractionResult(
        drug_a=drug_a,
        drug_b=drug_b,
        risk_level=RiskLevel(parsed["risk_level"]),
        mechanism=parsed["mechanism"],
        clinical_effect=parsed["clinical_effect"],
        recommendation=parsed["recommendation"],
        llm_summary=parsed["llm_summary"],
        sources=[
            InteractionSource(
                name="RxNav (NLM)",
                url=f"https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis={drug_a.rxcui}+{drug_b.rxcui}"
            ),
            InteractionSource(
                name="OpenFDA",
                url=f"https://api.fda.gov/drug/label.json?search=openfda.rxcui:{drug_a.rxcui}"
            ),
        ]
    )
