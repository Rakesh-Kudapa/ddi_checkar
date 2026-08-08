import httpx
from backend.cache.sqlite import (
    get_cached_structure, set_cached_structure,
    get_cached_synonyms, set_cached_synonyms,
)

PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
MAX_SYNONYMS = 15

async def get_structure(drug_name: str) -> dict | None:
    """Resolve a drug name to its PubChem CID + canonical SMILES.

    Returns None if PubChem has no compound matching this name (a common,
    expected outcome — not every RxNorm-resolved name matches a PubChem
    entry exactly) rather than raising, mirroring how rxclass/rxnav treat
    a 404 as "no data" instead of an error. Real failures (5xx, timeout)
    still propagate as httpx.HTTPError like every other service.
    """
    cached = get_cached_structure(drug_name)
    if cached:
        return cached

    async with httpx.AsyncClient(timeout=10) as client:
        # NOTE: requesting the property named "CanonicalSMILES" does NOT
        # return a "CanonicalSMILES" key in the response — PubChem silently
        # relabels it "ConnectivitySMILES" (topology only, no stereo).
        # Requesting "SMILES" (the modern name for the old "IsomericSMILES")
        # is what actually comes back keyed as "SMILES" and includes
        # stereochemistry. Verified empirically, not from docs.
        resp = await client.get(
            f"{PUBCHEM_BASE}/compound/name/{drug_name}/property/SMILES/JSON"
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        data = resp.json()

    try:
        prop = data["PropertyTable"]["Properties"][0]
        cid = prop["CID"]
        smiles = prop["SMILES"]
    except (KeyError, IndexError):
        return None

    set_cached_structure(drug_name, cid, smiles)
    return {"cid": cid, "smiles": smiles}


async def get_synonyms(drug_name: str) -> list[str]:
    """Return PubChem's known alternate names for a drug (brand names,
    chemical/INN names, etc.) — capped at MAX_SYNONYMS, which PubChem tends
    to front-load with genuinely common names before obscure CAS numbers.

    Used to bridge naming mismatches against other name-keyed sources (e.g.
    DDInter uses "Acetylsalicylic acid" where RxNorm/this app use "Aspirin"
    — confirmed by checking PubChem's own synonym list for aspirin, which
    includes "ACETYLSALICYLIC ACID" in its first few entries).
    """
    cached = get_cached_synonyms(drug_name)
    if cached is not None:
        return cached

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{PUBCHEM_BASE}/compound/name/{drug_name}/synonyms/JSON")
        if resp.status_code == 404:
            set_cached_synonyms(drug_name, [])
            return []
        resp.raise_for_status()
        data = resp.json()

    try:
        synonyms = data["InformationList"]["Information"][0]["Synonym"][:MAX_SYNONYMS]
    except (KeyError, IndexError):
        synonyms = []

    set_cached_synonyms(drug_name, synonyms)
    return synonyms
