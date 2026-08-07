import httpx

RXNAV_BASE = "https://rxnav.nlm.nih.gov/REST"

async def get_interaction(rxcui_a: str, rxcui_b: str) -> dict:
    """Query RxNav for DDI data between two RxCUI IDs."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{RXNAV_BASE}/interaction/list.json",
            params={"rxcuis": f"{rxcui_a} {rxcui_b}"}
        )
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
