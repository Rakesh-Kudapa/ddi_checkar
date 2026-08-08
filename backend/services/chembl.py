import httpx
from backend.cache.sqlite import get_cached_chembl, set_cached_chembl

CHEMBL_BASE = "https://www.ebi.ac.uk/chembl/api/data"
MAX_MECHANISMS = 3

async def get_verified_mechanisms(drug_name: str) -> list[dict]:
    """Look up curated, citable mechanism-of-action data for a drug from ChEMBL.

    Returns [] (not an error) when ChEMBL has no curated mechanism entry —
    this is common and expected, not a failure. Verified empirically that
    ChEMBL's coverage is inconsistent: aspirin has a citable entry, warfarin
    does not, despite both drugs and warfarin's target (VKORC1) individually
    existing in ChEMBL. Real errors (5xx, timeout) still propagate as
    httpx.HTTPError like every other service.
    """
    cached = get_cached_chembl(drug_name)
    if cached is not None:
        return _with_retrieved_at(cached["mechanisms"], cached["cached_at"])

    async with httpx.AsyncClient(timeout=10) as client:
        search_resp = await client.get(
            f"{CHEMBL_BASE}/molecule/search", params={"q": drug_name, "format": "json"}
        )
        if search_resp.status_code == 404:
            set_cached_chembl(drug_name, [])
            return []
        search_resp.raise_for_status()
        molecules = search_resp.json().get("molecules", [])
        if not molecules:
            set_cached_chembl(drug_name, [])
            return []

        # Use the parent ID so a salt-form match (e.g. "warfarin sodium")
        # still resolves to the same entry as the base compound.
        parent_id = molecules[0]["molecule_hierarchy"]["parent_chembl_id"]

        mech_resp = await client.get(
            f"{CHEMBL_BASE}/mechanism",
            params={"molecule_chembl_id": parent_id, "format": "json"}
        )
        mech_resp.raise_for_status()
        mechanisms = mech_resp.json().get("mechanisms", [])[:MAX_MECHANISMS]

        results = []
        for m in mechanisms:
            target_name = None
            target_id = m.get("target_chembl_id")
            if target_id:
                target_resp = await client.get(
                    f"{CHEMBL_BASE}/target/{target_id}", params={"format": "json"}
                )
                if target_resp.status_code == 200:
                    target_name = target_resp.json().get("pref_name")

            references = [
                {"ref_type": ref["ref_type"], "ref_url": ref["ref_url"]}
                for ref in m.get("mechanism_refs", [])
                if ref.get("ref_url")
            ]

            results.append({
                "target": target_name or "Unknown target",
                "action_type": m.get("action_type"),
                "mechanism_of_action": m.get("mechanism_of_action") or "Not described",
                "references": references,
            })

    cached_at = set_cached_chembl(drug_name, results)
    return _with_retrieved_at(results, cached_at)


def _with_retrieved_at(mechanisms: list[dict], retrieved_at: str) -> list[dict]:
    """Stamps each mechanism dict with when its drug's ChEMBL entry was
    cached — surfaced as VerifiedMechanism.retrieved_at, CLAUDE.md "Next Up" #3.
    All mechanisms for a drug share one timestamp: chembl_cache stores one
    row (one cached_at) per drug, not per mechanism."""
    return [{**m, "retrieved_at": retrieved_at} for m in mechanisms]
