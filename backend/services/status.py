import asyncio
import httpx
from backend.cache import sqlite as cache

CHECK_TIMEOUT = 4.0

# One cheap, representative request per source — not a full health check,
# just "is this endpoint reachable right now." Picked to be as low-cost as
# each API allows: RxNorm/ChEMBL have dedicated lightweight status/version
# endpoints; OpenFDA and PubChem don't, so a minimal real query is used
# instead (limit=1 / a single known CID's cheapest property).
CHECKS = {
    "rxnorm": "https://rxnav.nlm.nih.gov/REST/version",
    "openfda": "https://api.fda.gov/drug/label.json?limit=1",
    "pubchem": "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/2244/property/MolecularFormula/JSON",
    "chembl": "https://www.ebi.ac.uk/chembl/api/data/status.json",
}


async def _check(client: httpx.AsyncClient, url: str) -> bool:
    try:
        resp = await client.get(url, timeout=CHECK_TIMEOUT)
        return resp.status_code < 500
    except httpx.HTTPError:
        return False


async def get_status() -> dict:
    """Live per-source status for the TopBar/Settings badges — replaces the
    previously hardcoded "OpenFDA: online" string, which stayed "online"
    even if the source (or the whole backend) were actually unreachable,
    i.e. misleading during exactly the failure a status badge exists for.

    Each check is independent and best-effort: a slow/down source shows as
    "unreachable" rather than failing the whole status call."""
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(*(_check(client, url) for url in CHECKS.values()))

    status = {name: ("online" if ok else "unreachable") for name, ok in zip(CHECKS, results)}
    status["ddinter"] = "loaded" if cache.ddinter_row_count() > 0 else "not loaded"
    status["rxnav_interaction"] = "retired"   # static fact, not a network check — see docs/api_notes.md
    return status
