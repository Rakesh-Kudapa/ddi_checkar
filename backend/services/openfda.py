import httpx

OPENFDA_BASE = "https://api.fda.gov/drug"

async def get_label_interactions(rxcui: str) -> str:
    """Fetch drug_interactions section from FDA label. Returns raw text."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{OPENFDA_BASE}/label.json",
            params={"search": f"openfda.rxcui:{rxcui}", "limit": 1}
        )
        if resp.status_code == 404:
            return ""
        resp.raise_for_status()
        data = resp.json()

    results = data.get("results", [])
    if not results:
        return ""

    sections = results[0].get("drug_interactions", [])
    return " ".join(sections)[:3000]   # cap for LLM context window
