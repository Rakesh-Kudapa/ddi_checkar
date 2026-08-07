import httpx

RXNAV_BASE = "https://rxnav.nlm.nih.gov/REST"

async def get_interaction(rxcui_a: str, rxcui_b: str) -> dict:
    """Query RxNav for DDI data between two RxCUI IDs.

    NOTE: NLM retired the RxNav Drug Interaction API (interaction/list.json
    and interaction/interaction.json both 404 unconditionally as of this
    writing) after losing redistribution rights to its underlying sources
    (DrugBank, ONCHigh). This call is expected to return no data — kept in
    place in case NLM relaunches the API or repoints it at a new source, and
    so the rest of the pipeline (OpenFDA label text + LLM synthesis) doesn't
    depend on it existing.
    """
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{RXNAV_BASE}/interaction/list.json",
            params={"rxcuis": f"{rxcui_a} {rxcui_b}"}
        )
        if resp.status_code == 404:
            return {"interactions": [], "raw": None}
        resp.raise_for_status()
        data = resp.json()

    interactions = []
    for group in data.get("fullInteractionTypeGroup", []):
        for itype in group.get("fullInteractionType", []):
            for pair in itype.get("interactionPair", []):
                interactions.append({
                    "severity":    pair.get("severity", "unknown"),
                    "description": pair.get("description", ""),
                    "source":      group.get("sourceName", "RxNav")
                })

    return {"interactions": interactions, "raw": data}
