from fastapi import APIRouter, HTTPException
from backend.models.schemas import InteractionRequest, InteractionResult, AutocompleteResult
from backend.services import rxnorm, rxnav, openfda, llm

router = APIRouter()

@router.post("/check", response_model=InteractionResult)
async def check_interaction(req: InteractionRequest):
    """
    Main endpoint.
    Flow: resolve names -> query DDI -> fetch labels -> LLM synthesis -> return
    """
    drug_a = await rxnorm.resolve(req.drug_a)
    drug_b = await rxnorm.resolve(req.drug_b)

    if not drug_a.rxcui or not drug_b.rxcui:
        raise HTTPException(status_code=404, detail="Could not resolve one or both drug names")

    ddi_data  = await rxnav.get_interaction(drug_a.rxcui, drug_b.rxcui)
    label_a   = await openfda.get_label_interactions(drug_a.rxcui)
    label_b   = await openfda.get_label_interactions(drug_b.rxcui)

    result = await llm.synthesize(
        drug_a=drug_a, drug_b=drug_b,
        ddi_data=ddi_data, label_a=label_a, label_b=label_b
    )
    return result

@router.get("/autocomplete", response_model=AutocompleteResult)
async def autocomplete(q: str):
    """Drug name autocomplete via RxNorm spelling suggestions."""
    if len(q) < 2:
        return AutocompleteResult(suggestions=[])
    suggestions = await rxnorm.autocomplete(q)
    return AutocompleteResult(suggestions=suggestions)
