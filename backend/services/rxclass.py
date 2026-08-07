import httpx

RXCLASS_BASE = "https://rxnav.nlm.nih.gov/REST/rxclass"

# RxClass mixes real pharmacologic classification with indication/
# contraindication data (classType "DISEASE", e.g. "Pregnancy",
# "Atrial Fibrillation" for warfarin) and a "CHEM" type that just repeats
# the drug's own name. Whitelist the classType values that are genuinely
# classification info: therapeutic (ATC, VA), mechanism/effect (MOA, PE,
# EPC), pharmacokinetic (PK), and chemical structure (STRUCT).
CLASS_TYPES = {"ATC1-4", "EPC", "MOA", "PE", "VA", "STRUCT", "PK"}

async def get_drug_class(rxcui: str) -> list[str]:
    """Return deduped drug class names (e.g. 'Vitamin K antagonists') for an RxCUI."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{RXCLASS_BASE}/class/byRxcui.json",
            params={"rxcui": rxcui}
        )
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        data = resp.json()

    entries = data.get("rxclassDrugInfoList", {}).get("rxclassDrugInfo", [])

    seen = set()
    classes = []
    for entry in entries:
        concept = entry.get("rxclassMinConceptItem", {})
        if concept.get("classType") not in CLASS_TYPES:
            continue
        name = concept.get("className")
        if not name or name in seen:
            continue
        seen.add(name)
        classes.append(name)

    return classes
