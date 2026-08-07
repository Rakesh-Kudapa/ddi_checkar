import asyncio
import itertools
import json
import httpx
from fastapi import APIRouter, HTTPException
from backend.models.schemas import (
    InteractionRequest, InteractionResult, AutocompleteResult,
    MultiCheckRequest, MultiCheckResult, HistoryListResult, HistoryDetail,
    DrugInfoResult, LLMProvider,
)
from backend.services import rxnorm, rxnav, openfda, llm, rxclass
from backend.cache import sqlite as cache

router = APIRouter()

MAX_MULTI_DRUGS = 6


def _describe(e: Exception) -> str:
    """httpx timeout/connection errors often stringify to '' — always name the type."""
    msg = str(e)
    return f"{type(e).__name__}: {msg}" if msg else type(e).__name__


async def run_check(drug_a_name: str, drug_b_name: str, provider: LLMProvider, api_key: str) -> InteractionResult:
    """Core resolve -> DDI data -> LLM synthesis flow, shared by /check and /check-multi.

    Every upstream call (RxNorm/RxNav/OpenFDA/LLM) is wrapped so failures
    become HTTPException rather than bubbling as a raw exception — an
    unhandled exception here would bypass CORSMiddleware (Starlette routes
    bare-Exception handling through ServerErrorMiddleware, which sits
    outside CORS), so the browser would just see "Failed to fetch" instead
    of the real error.
    """
    try:
        drug_a = await rxnorm.resolve(drug_a_name)
        drug_b = await rxnorm.resolve(drug_b_name)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"RxNorm lookup failed: {_describe(e)}")

    if not drug_a.rxcui or not drug_b.rxcui:
        raise HTTPException(status_code=404, detail=f"Could not resolve '{drug_a_name}' or '{drug_b_name}'")

    try:
        ddi_data  = await rxnav.get_interaction(drug_a.rxcui, drug_b.rxcui)
        label_a   = await openfda.get_label_interactions(drug_a.standard_name)
        label_b   = await openfda.get_label_interactions(drug_b.standard_name)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Data source lookup failed: {_describe(e)}")

    try:
        result = await llm.synthesize(
            drug_a=drug_a, drug_b=drug_b,
            ddi_data=ddi_data, label_a=label_a, label_b=label_b,
            provider=provider, api_key=api_key
        )
    except llm.LLMAuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except llm.LLMRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="LLM returned non-JSON output twice in a row")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"LLM provider request failed: {_describe(e)}")

    return result


@router.post("/check", response_model=InteractionResult)
async def check_interaction(req: InteractionRequest):
    if not req.llm_api_key.strip():
        raise HTTPException(status_code=400, detail="Missing LLM API key — add one in Settings")

    result = await run_check(req.drug_a, req.drug_b, req.llm_provider, req.llm_api_key)
    cache.save_history(result, req.llm_provider.value)
    return result


@router.post("/check-multi", response_model=MultiCheckResult)
async def check_multi(req: MultiCheckRequest):
    if not req.llm_api_key.strip():
        raise HTTPException(status_code=400, detail="Missing LLM API key — add one in Settings")

    names = [d.strip() for d in req.drugs if d.strip()]
    if len(names) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 drug names")
    if len(names) > MAX_MULTI_DRUGS:
        raise HTTPException(status_code=400, detail=f"Max {MAX_MULTI_DRUGS} drugs per panel")

    pairs = list(itertools.combinations(names, 2))
    results = await asyncio.gather(
        *(run_check(a, b, req.llm_provider, req.llm_api_key) for a, b in pairs)
    )

    for result in results:
        cache.save_history(result, req.llm_provider.value)

    return MultiCheckResult(pairs=results)


@router.get("/history", response_model=HistoryListResult)
async def get_history(limit: int = 50):
    items = cache.list_history(limit=limit)
    return HistoryListResult(items=items)


@router.get("/history/{item_id}", response_model=HistoryDetail)
async def get_history_detail(item_id: int):
    item = cache.get_history_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="History item not found")
    return HistoryDetail(**item)


@router.get("/drug-info", response_model=DrugInfoResult)
async def drug_info(name: str):
    try:
        resolved = await rxnorm.resolve(name)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"RxNorm lookup failed: {_describe(e)}")

    if not resolved.rxcui:
        raise HTTPException(status_code=404, detail=f"Could not resolve '{name}'")

    try:
        drug_classes = await rxclass.get_drug_class(resolved.rxcui)
        label_excerpt = await openfda.get_label_interactions(resolved.standard_name)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Data source lookup failed: {_describe(e)}")

    return DrugInfoResult(
        name=resolved.name,
        rxcui=resolved.rxcui,
        standard_name=resolved.standard_name,
        drug_classes=drug_classes,
        label_excerpt=label_excerpt or "No FDA label data found for this drug.",
    )


@router.get("/autocomplete", response_model=AutocompleteResult)
async def autocomplete(q: str):
    """Drug name autocomplete via RxNorm approximate-term matching."""
    if len(q) < 2:
        return AutocompleteResult(suggestions=[])
    try:
        suggestions = await rxnorm.autocomplete(q)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"RxNorm autocomplete failed: {_describe(e)}")
    return AutocompleteResult(suggestions=suggestions)
