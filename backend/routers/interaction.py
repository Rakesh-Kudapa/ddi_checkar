import asyncio
import itertools
import json
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from backend.models.schemas import (
    InteractionRequest, InteractionResult, AutocompleteResult,
    MultiCheckRequest, MultiCheckResult, HistoryListResult, HistoryDetail,
    DrugInfoResult, LLMProvider, VerifiedMechanism, VerifiedSeverity, PatientContext,
    DeleteHistoryRequest, DeleteHistoryResult, DataSourceStatus,
)
from backend.services import rxnorm, rxnav, openfda, llm, rxclass, pubchem, chembl, reportgen, severity, status
from backend.cache import sqlite as cache

router = APIRouter()

MAX_MULTI_DRUGS = 12
MULTI_CHECK_CONCURRENCY = 6


def _describe(e: Exception) -> str:
    """httpx timeout/connection errors often stringify to '' — always name the type."""
    msg = str(e)
    return f"{type(e).__name__}: {msg}" if msg else type(e).__name__


async def run_check(
    drug_a_name: str, drug_b_name: str, provider: LLMProvider, api_key: str,
    patient_context: PatientContext | None = None,
) -> InteractionResult:
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
        label_a, label_a_field = await openfda.get_label_interactions(drug_a.standard_name)
        label_b, label_b_field = await openfda.get_label_interactions(drug_b.standard_name)
        struct_a  = await pubchem.get_structure(drug_a.standard_name)
        struct_b  = await pubchem.get_structure(drug_b.standard_name)
        verified_a = await chembl.get_verified_mechanisms(drug_a.standard_name)
        verified_b = await chembl.get_verified_mechanisms(drug_b.standard_name)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Data source lookup failed: {_describe(e)}")

    if struct_a:
        drug_a = drug_a.model_copy(update={
            "pubchem_cid": struct_a["cid"], "smiles": struct_a["smiles"],
            "structure_retrieved_at": struct_a.get("cached_at"),
        })
    if struct_b:
        drug_b = drug_b.model_copy(update={
            "pubchem_cid": struct_b["cid"], "smiles": struct_b["smiles"],
            "structure_retrieved_at": struct_b.get("cached_at"),
        })
    # model_copy(update=...) does NOT validate/coerce — without this, the
    # raw dicts from chembl.get_verified_mechanisms() would sit in a field
    # typed List[VerifiedMechanism], breaking anything that expects real
    # model instances (e.g. .model_dump() in save_history()).
    drug_a = drug_a.model_copy(update={"verified_mechanisms": [VerifiedMechanism(**m) for m in verified_a]})
    drug_b = drug_b.model_copy(update={"verified_mechanisms": [VerifiedMechanism(**m) for m in verified_b]})

    try:
        result = await llm.synthesize(
            drug_a=drug_a, drug_b=drug_b,
            ddi_data=ddi_data, label_a=label_a, label_b=label_b,
            label_a_field=label_a_field, label_b_field=label_b_field,
            provider=provider, api_key=api_key, patient_context=patient_context,
        )
    except llm.LLMAuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except llm.LLMRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="LLM returned non-JSON output twice in a row")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"LLM provider request failed: {_describe(e)}")

    # Independent of the LLM entirely — a real severity rating from
    # DDInter's curated dataset (ddinter_reference table), attached only
    # when a match exists. See backend/data/ddinter/README.md.
    severity_level = cache.get_verified_severity(drug_a.standard_name, drug_b.standard_name)
    if not severity_level:
        # Exact name match failed — DDInter sometimes uses a different name
        # than RxNorm's (confirmed: DDInter has "Acetylsalicylic acid" where
        # we have "Aspirin"). Try PubChem's synonym list before giving up;
        # a PubChem outage here shouldn't fail the whole check, so it's
        # caught locally rather than propagating.
        try:
            synonyms_a = await pubchem.get_synonyms(drug_a.standard_name)
            synonyms_b = await pubchem.get_synonyms(drug_b.standard_name)
        except httpx.HTTPError:
            synonyms_a, synonyms_b = [], []
        for name_a in [drug_a.standard_name] + synonyms_a:
            if severity_level:
                break
            for name_b in [drug_b.standard_name] + synonyms_b:
                severity_level = cache.get_verified_severity(name_a, name_b)
                if severity_level:
                    break
    if severity_level:
        verified_severity = VerifiedSeverity(level=severity_level)
        result = result.model_copy(update={
            "verified_severity": verified_severity,
            "severity_comparison": severity.reconcile(verified_severity, result.risk_level),
            "action_convention": severity.action_convention_for(verified_severity),
        })

    return result


@router.post("/check", response_model=InteractionResult)
async def check_interaction(req: InteractionRequest):
    if not req.llm_api_key.strip():
        raise HTTPException(status_code=400, detail="Missing LLM API key — add one in Settings")
    if req.drug_a.strip().lower() == req.drug_b.strip().lower():
        raise HTTPException(status_code=400, detail="Drug A and Drug B must be different drugs")

    result = await run_check(
        req.drug_a, req.drug_b, req.llm_provider, req.llm_api_key,
        patient_context=req.patient_context,
    )
    cache.save_history(result, req.llm_provider.value)
    return result


@router.post("/check-multi", response_model=MultiCheckResult)
async def check_multi(req: MultiCheckRequest):
    if not req.llm_api_key.strip():
        raise HTTPException(status_code=400, detail="Missing LLM API key — add one in Settings")

    # Case-insensitive dedup (keep first occurrence) — without this, a panel
    # like ["Warfarin", "warfarin", "Aspirin"] would silently generate a
    # self-pair ("Warfarin" vs "warfarin"), wasting an LLM call on a
    # meaningless self-interaction and producing a nonsense result row.
    names, seen_lower = [], set()
    for d in req.drugs:
        d = d.strip()
        if d and d.lower() not in seen_lower:
            names.append(d)
            seen_lower.add(d.lower())
    if len(names) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 distinct drug names")
    if len(names) > MAX_MULTI_DRUGS:
        raise HTTPException(status_code=400, detail=f"Max {MAX_MULTI_DRUGS} drugs per panel")

    pairs = list(itertools.combinations(names, 2))

    # Bounded concurrency: a 12-drug panel is 66 pairs — firing all of them
    # at once via bare asyncio.gather would mean 66 simultaneous LLM calls.
    # Cap concurrent in-flight pairs regardless of panel size.
    semaphore = asyncio.Semaphore(MULTI_CHECK_CONCURRENCY)

    async def bounded_check(a: str, b: str) -> InteractionResult:
        async with semaphore:
            return await run_check(
                a, b, req.llm_provider, req.llm_api_key,
                patient_context=req.patient_context,
            )

    results = await asyncio.gather(*(bounded_check(a, b) for a, b in pairs))

    for result in results:
        cache.save_history(result, req.llm_provider.value)

    return MultiCheckResult(pairs=results)


@router.get("/history", response_model=HistoryListResult)
async def get_history(limit: int = 50):
    items, total = cache.list_history(limit=limit)
    return HistoryListResult(items=items, total=total)


@router.delete("/history", response_model=DeleteHistoryResult)
async def delete_history(req: DeleteHistoryRequest):
    if not req.ids:
        raise HTTPException(status_code=400, detail="No ids provided")
    deleted = cache.delete_history_items(req.ids)
    return DeleteHistoryResult(deleted=deleted)


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
        label_excerpt, _ = await openfda.get_label_interactions(resolved.standard_name)
        structure = await pubchem.get_structure(resolved.standard_name)
        verified = await chembl.get_verified_mechanisms(resolved.standard_name)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Data source lookup failed: {_describe(e)}")

    return DrugInfoResult(
        name=resolved.name,
        rxcui=resolved.rxcui,
        standard_name=resolved.standard_name,
        resolved_at=resolved.resolved_at,
        drug_classes=drug_classes,
        label_excerpt=label_excerpt or "No FDA label data found for this drug.",
        pubchem_cid=structure["cid"] if structure else None,
        smiles=structure["smiles"] if structure else None,
        structure_retrieved_at=structure.get("cached_at") if structure else None,
        verified_mechanisms=verified,
    )


EXPORT_CONTENT_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

@router.post("/export")
async def export_report(result: InteractionResult, format: str = "pdf"):
    """Generate a formatted report document from a result already held
    client-side (a fresh check, a loaded History item, or an expanded
    Multi-drug matrix cell) — no history-id lookup needed."""
    if format not in EXPORT_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="format must be 'pdf' or 'docx'")

    try:
        if format == "pdf":
            file_bytes = reportgen.build_pdf(result)
        else:
            file_bytes = reportgen.build_docx(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {_describe(e)}")

    filename = f"{result.drug_a.standard_name}_{result.drug_b.standard_name}.{format}".replace(" ", "_")
    return Response(
        content=file_bytes,
        media_type=EXPORT_CONTENT_TYPES[format],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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


@router.get("/status", response_model=DataSourceStatus)
async def data_source_status():
    """Live reachability of each external data source, for the TopBar/Settings
    status badges — previously those were hardcoded strings that stayed
    "online" even during a real outage. Polled periodically by the frontend,
    not on every check, to keep this cheap."""
    return DataSourceStatus(**await status.get_status())
