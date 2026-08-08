import json
import httpx
from backend.models.schemas import (
    DrugResolved, InteractionResult, InteractionSource, LLMProvider,
    MechanismType, PatientContext, RiskLevel
)

SYSTEM_PROMPT = """You are a clinical pharmacology assistant.
Given structured drug interaction data from RxNav and FDA drug labels,
produce a clear, accurate summary for a researcher or clinician.
Be factual. Never speculate beyond the data provided.
In "recommendation", do not invent specific numeric doses, dose adjustments,
or monitoring intervals (e.g. a specific mg amount or "check INR every N days")
unless that exact figure appears in the FDA label text given to you — numeric
dosing is exactly the kind of specific, actionable claim a clinician might act
on without double-checking, and is also where an LLM is most likely to
hallucinate a plausible-sounding but unsupported number. Prefer qualitative
guidance instead (e.g. "use the lowest effective dose," "monitor more
frequently," "adjust per current prescribing information") and say
explicitly when a numeric value should be verified against current
prescribing information rather than taken from this output.
Output must be valid JSON only — no preamble, no markdown fences."""

# Model IDs per provider. Prefer a provider's "-latest" alias where one
# exists (Gemini, Grok) so a retired dated model doesn't silently 404 --
# gemini-2.5-flash itself was found dead ("no longer available to new
# users") within a day of picking it. Update here if a provider retires
# an alias too, or if Anthropic's pinned id below goes stale.
MODELS = {
    LLMProvider.ANTHROPIC: "claude-sonnet-4-6",
    LLMProvider.GEMINI: "gemini-flash-latest",
    LLMProvider.GROK: "grok-4-latest",
}


class LLMAuthError(Exception):
    """Raised when the provider rejects the supplied API key."""


class LLMRateLimitError(Exception):
    """Raised when the provider's rate/quota limit is hit (HTTP 429)."""


def _extract_error_message(resp: httpx.Response) -> str:
    """Providers (Anthropic, Gemini, xAI) all nest the useful detail under
    error.message — fall back to raw text if a response doesn't match."""
    try:
        return resp.json()["error"]["message"]
    except (ValueError, KeyError, TypeError):
        return resp.text or f"HTTP {resp.status_code}"


async def _call_anthropic(prompt: str, api_key: str) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": MODELS[LLMProvider.ANTHROPIC],
                "max_tokens": 1024,
                "system": SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
    if resp.status_code == 401:
        raise LLMAuthError("Anthropic rejected the API key")
    if resp.status_code == 429:
        raise LLMRateLimitError(_extract_error_message(resp))
    resp.raise_for_status()
    return resp.json()["content"][0]["text"]


async def _call_gemini(prompt: str, api_key: str) -> str:
    model = MODELS[LLMProvider.GEMINI]
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            params={"key": api_key},
            json={
                "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"responseMimeType": "application/json"},
            },
        )
    if resp.status_code in (400, 401, 403):
        # Gemini returns 400 (not 401/403) for a malformed/invalid key.
        if resp.status_code != 400 or "api key" in resp.text.lower():
            raise LLMAuthError("Gemini rejected the API key")
    if resp.status_code == 429:
        raise LLMRateLimitError(_extract_error_message(resp))
    resp.raise_for_status()
    return resp.json()["candidates"][0]["content"]["parts"][0]["text"]


async def _call_grok(prompt: str, api_key: str) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.x.ai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": MODELS[LLMProvider.GROK],
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "response_format": {"type": "json_object"},
            },
        )
    if resp.status_code == 401:
        raise LLMAuthError("Grok rejected the API key")
    if resp.status_code == 429:
        raise LLMRateLimitError(_extract_error_message(resp))
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


_PROVIDER_CALLERS = {
    LLMProvider.ANTHROPIC: _call_anthropic,
    LLMProvider.GEMINI: _call_gemini,
    LLMProvider.GROK: _call_grok,
}


async def _request_and_parse(provider: LLMProvider, api_key: str, prompt: str) -> dict:
    """Call the chosen provider and parse JSON. Retries once with a stricter prompt on parse failure."""
    caller = _PROVIDER_CALLERS[provider]

    raw = await caller(prompt, api_key)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        stricter_prompt = prompt + (
            "\n\nYour previous response was not valid JSON. "
            "Respond with ONLY the raw JSON object — no markdown fences, no commentary."
        )
        raw_retry = await caller(stricter_prompt, api_key)
        return json.loads(raw_retry)


def _openfda_citation_url(standard_name: str, matched_field: str | None) -> str:
    """Builds a citation URL that actually reproduces the OpenFDA match —
    using generic_name unconditionally regardless of which field actually
    matched (e.g. openfda.brand_name for a brand-entered drug like Lipitor)
    would give a link that returns nothing when clicked."""
    field = matched_field or "openfda.generic_name"
    value = standard_name if field == "openfda.generic_name" else standard_name.upper()
    return f'https://api.fda.gov/drug/label.json?search={field}:"{value}"'


async def synthesize(
    drug_a: DrugResolved,
    drug_b: DrugResolved,
    ddi_data: dict,
    label_a: str,
    label_b: str,
    provider: LLMProvider,
    api_key: str,
    patient_context: PatientContext | None = None,
    label_a_field: str | None = None,
    label_b_field: str | None = None,
) -> InteractionResult:
    """Send all gathered data to the chosen LLM provider, return structured InteractionResult."""

    rxnav_note = (
        "(RxNav's interaction API has been retired by NLM and returns no data for "
        "any query — this empty list does NOT mean no interaction exists. Rely on "
        "the FDA label text below and your own pharmacology knowledge instead.)"
        if not ddi_data["interactions"] else ""
    )

    patient_block = ""
    if patient_context and any([
        patient_context.age, patient_context.renal_function, patient_context.hepatic_function,
        patient_context.pregnant is not None, patient_context.other_conditions,
    ]):
        fields = []
        if patient_context.age is not None:
            fields.append(f"Age: {patient_context.age}")
        if patient_context.renal_function:
            fields.append(f"Renal function: {patient_context.renal_function}")
        if patient_context.hepatic_function:
            fields.append(f"Hepatic function: {patient_context.hepatic_function}")
        if patient_context.pregnant is not None:
            fields.append(f"Pregnant: {'yes' if patient_context.pregnant else 'no'}")
        if patient_context.other_conditions:
            fields.append(f"Other conditions: {patient_context.other_conditions}")
        patient_block = (
            "\nPatient context (factor this into clinical_effect, recommendation, and "
            "risk_level — a patient-specific risk assessment, not a generic drug-drug "
            f"baseline):\n{chr(10).join(fields)}\n"
        )

    user_prompt = f"""
Drug A: {drug_a.standard_name} (RxCUI: {drug_a.rxcui})
Drug B: {drug_b.standard_name} (RxCUI: {drug_b.rxcui})

RxNav interaction data:
{json.dumps(ddi_data["interactions"], indent=2)}
{rxnav_note}

FDA label interactions — {drug_a.standard_name}:
{label_a or "No FDA label data found"}

FDA label interactions — {drug_b.standard_name}:
{label_b or "No FDA label data found"}
{patient_block}
Return a JSON object with exactly these fields:
{{
  "risk_level": "low" | "moderate" | "high" | "unknown",
  "mechanism": "pharmacological mechanism of the interaction, in plain prose",
  "mechanism_type": "PK" | "PD" | "both" | "unknown" (PK = pharmacokinetic, e.g. one drug changes how the other is absorbed/metabolized/cleared; PD = pharmacodynamic, e.g. additive or opposing effects at the same or related targets; "both" if both apply),
  "targets_involved": ["specific molecular targets, e.g. enzymes, receptors, transporters — e.g. VKORC1, COX-1, CYP2C9 — empty list if none are clearly identifiable from the data given"],
  "pathway": "a short cascade description of how each drug acts and where the interaction arises, e.g. 'Warfarin inhibits VKORC1 -> reduced clotting factor synthesis. Aspirin inhibits COX-1 -> reduced platelet aggregation. Combined: dual anticoagulation -> bleeding risk.'",
  "clinical_effect": "what happens to the patient",
  "recommendation": "what a clinician should do",
  "llm_summary": "2-3 sentence plain English paragraph"
}}
"""

    parsed = await _request_and_parse(provider, api_key, user_prompt)

    # Only cite a source if it actually contributed data — RxNav's interaction
    # API is currently dead (always empty) and OpenFDA sometimes has no label
    # for a given name, so citing them unconditionally would misrepresent
    # what the LLM's answer was actually grounded in.
    sources = []
    if ddi_data["interactions"]:
        sources.append(InteractionSource(
            name="RxNav (NLM)",
            url=f"https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis={drug_a.rxcui}+{drug_b.rxcui}"
        ))
    if label_a:
        sources.append(InteractionSource(
            name=f"OpenFDA label — {drug_a.standard_name}",
            url=_openfda_citation_url(drug_a.standard_name, label_a_field)
        ))
    if label_b:
        sources.append(InteractionSource(
            name=f"OpenFDA label — {drug_b.standard_name}",
            url=_openfda_citation_url(drug_b.standard_name, label_b_field)
        ))

    try:
        mechanism_type = MechanismType(parsed.get("mechanism_type", "unknown"))
    except ValueError:
        mechanism_type = MechanismType.UNKNOWN

    targets_involved = parsed.get("targets_involved", [])
    if not isinstance(targets_involved, list):
        targets_involved = []

    return InteractionResult(
        drug_a=drug_a,
        drug_b=drug_b,
        risk_level=RiskLevel(parsed["risk_level"]),
        mechanism=parsed["mechanism"],
        mechanism_type=mechanism_type,
        targets_involved=targets_involved,
        pathway=parsed.get("pathway", ""),
        clinical_effect=parsed["clinical_effect"],
        recommendation=parsed["recommendation"],
        llm_summary=parsed["llm_summary"],
        sources=sources,
        patient_context_used=patient_context if patient_block else None,
    )
