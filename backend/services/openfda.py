import os
import httpx

OPENFDA_BASE = "https://api.fda.gov/drug"

async def _search(client: httpx.AsyncClient, field: str, value: str, api_key: str | None) -> dict | None:
    params = {"search": f'{field}:"{value}"', "limit": 1}
    if api_key:
        params["api_key"] = api_key

    resp = await client.get(f"{OPENFDA_BASE}/label.json", params=params)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    results = resp.json().get("results", [])
    return results[0] if results else None


async def get_label_interactions(drug_name: str) -> str:
    """Fetch drug_interactions section from FDA label. Returns raw text.

    NOTE: searches by drug name (openfda.generic_name, falling back to
    openfda.substance_name), NOT rxcui. OpenFDA's openfda.rxcui field is
    populated per labeled product/package, not the ingredient-level RxCUI
    that rxnorm.resolve() returns — searching by rxcui silently matched
    nothing for common drugs (verified: rxcui 11289 "warfarin" and 1191
    "aspirin" both 0 results), so every earlier synthesis this session ran
    with empty OpenFDA data without erroring. Name-based search is what
    OpenFDA's own docs recommend for this reason.
    """
    api_key = os.environ.get("OPENFDA_API_KEY")

    async with httpx.AsyncClient(timeout=10) as client:
        result = await _search(client, "openfda.generic_name", drug_name, api_key)
        if result is None:
            result = await _search(client, "openfda.substance_name", drug_name.upper(), api_key)

    if result is None:
        return ""

    sections = result.get("drug_interactions", [])
    return " ".join(sections)[:3000]   # cap for LLM context window
