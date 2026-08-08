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


async def get_label_interactions(drug_name: str) -> tuple[str, str | None]:
    """Fetch drug_interactions section from FDA label. Returns (text, matched_field)
    — matched_field (e.g. "openfda.generic_name") lets the caller build a citation
    URL that actually reproduces the match, instead of always assuming generic_name
    (which would be a broken/non-reproducing link for a brand-name match). Returns
    ("", None) when no label matched on any field.

    NOTE: searches by drug name (openfda.generic_name, falling back to
    openfda.substance_name), NOT rxcui. OpenFDA's openfda.rxcui field is
    populated per labeled product/package, not the ingredient-level RxCUI
    that rxnorm.resolve() returns — searching by rxcui silently matched
    nothing for common drugs (verified: rxcui 11289 "warfarin" and 1191
    "aspirin" both 0 results), so every earlier synthesis this session ran
    with empty OpenFDA data without erroring. Name-based search is what
    OpenFDA's own docs recommend for this reason.

    Also tries openfda.brand_name last — found empirically (2026-08-08) that
    entering a brand name (e.g. "Lipitor", which RxNorm resolves to itself
    rather than expanding to "atorvastatin") returned ZERO OpenFDA data via
    generic_name/substance_name even though the real label has rich
    interaction text under its brand name. Since RxNorm's standard_name is
    sometimes a brand name verbatim (not normalized to the generic
    ingredient), and users overwhelmingly search by brand name in practice,
    skipping this fallback would silently starve the LLM of label context
    for a large share of real-world queries — the same "looks fine but ran
    on nothing" failure mode as the earlier rxcui-search bug.
    """
    api_key = os.environ.get("OPENFDA_API_KEY")
    fields_to_try = [
        ("openfda.generic_name", drug_name),
        ("openfda.substance_name", drug_name.upper()),
        ("openfda.brand_name", drug_name.upper()),
    ]

    async with httpx.AsyncClient(timeout=10) as client:
        result, matched_field = None, None
        for field, value in fields_to_try:
            result = await _search(client, field, value, api_key)
            if result is not None:
                matched_field = field
                break

    if result is None:
        return "", None

    sections = result.get("drug_interactions", [])
    return " ".join(sections)[:3000], matched_field   # cap for LLM context window
