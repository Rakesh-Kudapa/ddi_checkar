import httpx
from backend.models.schemas import DrugResolved
from backend.cache.sqlite import get_cached_rxcui, set_cached_rxcui

RXNORM_BASE = "https://rxnav.nlm.nih.gov/REST"

async def resolve(drug_name: str) -> DrugResolved:
    """Resolve a drug name to RxCUI. Checks SQLite cache first."""
    cached = get_cached_rxcui(drug_name)
    if cached:
        return DrugResolved(
            name=drug_name,
            rxcui=cached["rxcui"],
            standard_name=cached["standard_name"]
        )

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{RXNORM_BASE}/approximateTerm.json",
            params={"term": drug_name, "maxEntries": 1}
        )
        resp.raise_for_status()
        data = resp.json()

    candidates = data.get("approximateGroup", {}).get("candidate", [])
    if not candidates:
        return DrugResolved(name=drug_name, rxcui=None, standard_name=drug_name)

    rxcui         = candidates[0]["rxcui"]
    standard_name = candidates[0].get("name", drug_name)
    set_cached_rxcui(drug_name, rxcui, standard_name)

    return DrugResolved(name=drug_name, rxcui=rxcui, standard_name=standard_name)

async def autocomplete(query: str) -> list[str]:
    """Return up to 8 drug name suggestions.

    Uses approximateTerm rather than spellingsuggestions: the latter only
    corrects near-miss typos of a complete word and returns nothing for the
    partial prefixes a user types while typing (e.g. "warf" -> no match,
    "warfarn" -> "warfarin").
    """
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{RXNORM_BASE}/approximateTerm.json",
            params={"term": query, "maxEntries": 20}
        )
        resp.raise_for_status()
        data = resp.json()

    candidates = data.get("approximateGroup", {}).get("candidate", [])

    seen = set()
    suggestions = []
    for c in candidates:
        name = c.get("name")
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        suggestions.append(name)
        if len(suggestions) == 8:
            break

    return suggestions
