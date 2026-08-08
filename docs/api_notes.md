# API Notes

## RxNorm
- Base: https://rxnav.nlm.nih.gov/REST
- No key needed
- approximateTerm endpoint handles typos, brand/generic mapping, AND partial-prefix autocomplete — used for both name resolution and the autocomplete dropdown
- spellingsuggestions endpoint only corrects near-miss typos of a *complete* word (e.g. "warfarn" -> "warfarin"); it returns nothing for partial prefixes like "warf", so it's the wrong choice for a live-typing autocomplete field

## RxNav Interaction — RETIRED (discovered 2026-08-07)
- Base: https://rxnav.nlm.nih.gov/REST/interaction
- NLM has retired this API entirely — both `interaction/list.json` and
  `interaction/interaction.json` return 404 for every query, not just
  specific drug pairs. This happened after NLM lost redistribution rights
  to the two databases the API was built on (DrugBank and ONCHigh).
- `backend/services/rxnav.py` treats a 404 as "no data" and returns an empty
  list rather than crashing — the rest of the pipeline no longer assumes
  this source is populated.
- `backend/services/llm.py` explicitly tells the LLM that an empty RxNav
  result means "data source unavailable," not "no interaction exists" —
  otherwise the model would wrongly read silence as a clean bill of health.
- Structured DDI severity now comes from OpenFDA label text + the LLM's own
  training knowledge only. If a replacement structured source is needed
  later (e.g. DrugBank's own API, a licensed dataset), that's a v2 item —
  see CLAUDE.md.

## OpenFDA
- Base: https://api.fda.gov/drug
- No key: 240 req/min
- With OPENFDA_API_KEY: 1000 req/min (free registration at open.fda.gov)
- drug_interactions field in label.json is raw text — sometimes very long, cap at 3000 chars
- **Brand names silently returned zero data until 2026-08-08's fix.** `get_label_interactions()`
  originally tried `openfda.generic_name` then `openfda.substance_name` only. Verified
  empirically that "Lipitor" and "Tylenol" — both totally normal things to type, and
  RxNorm sometimes resolves a brand name to itself rather than expanding it to the
  generic ingredient — returned `"No FDA label data found"` while "atorvastatin" and
  "acetaminophen" (the same real drugs) returned full label text. Fixed by adding
  `openfda.brand_name` as a third fallback field. `get_label_interactions()` now returns
  `(text, matched_field)` instead of just `text`, so the citation URL built in `llm.py`
  reproduces whichever field actually matched — a citation link that always assumed
  `generic_name` would silently return nothing when clicked for a brand-name match.
  Even with this fix, some brands still genuinely have no `drug_interactions` section in
  OpenFDA's data (confirmed for Tylenol) — that's a real data gap, not a bug, and is
  shown honestly as "No FDA label data found" same as before.

## LLM Synthesis (multi-provider)
- User picks a provider in the UI (Settings panel) and pastes their own API key — never stored server-side, only in the browser's localStorage and forwarded per-request.
- Anthropic: `claude-sonnet-4-6` via `POST https://api.anthropic.com/v1/messages`
- Gemini: `gemini-flash-latest` (alias — see below) via `POST .../v1beta/models/{model}:generateContent`, `generationConfig.responseMimeType: application/json` forces JSON
- Grok (xAI): `grok-4-latest` via OpenAI-compatible `POST https://api.x.ai/v1/chat/completions`, `response_format: {"type": "json_object"}`
- Always request JSON-only output to avoid parsing issues
- If JSON parse fails, retry once with stricter prompt before raising error
- A 401/403 from any provider surfaces as `LLMAuthError` → HTTP 401 to the frontend (bad/expired key)

### Gemini model pinning bites fast (found 2026-08-07)
- `gemini-2.5-flash` was picked as the default model, tested working via
  `GET /v1beta/models` (it's *listed*), but the actual `generateContent`
  call 404'd: `"This model models/gemini-2.5-flash is no longer available
  to new users."` — being listed by the models endpoint does not mean a
  given key/project can still call it.
- Switched the default to `gemini-flash-latest`, one of Google's alias
  model IDs (`gemini-pro-latest`, `gemini-flash-lite-latest` also exist)
  that always resolves to whatever's currently served — avoids repeating
  this failure every time Google retires a dated version. Prefer these
  aliases over a pinned `gemini-X.Y-*` id unless you need output
  reproducibility across model upgrades.
- Gemini returns HTTP 400 (not 401/403) for a malformed/invalid API key,
  with `"API key not valid"` in the body — `llm.py`'s `_call_gemini`
  checks for that substring to still classify it as `LLMAuthError`.
- All three providers (Anthropic, Gemini, xAI) nest their error detail
  under `error.message` in the response body — `_extract_error_message()`
  in `llm.py` reads that generically, with a raw-text fallback. A 429 from
  any provider surfaces as `LLMRateLimitError` → HTTP 429, carrying the
  provider's own message (e.g. Gemini's free tier: 20 requests/day/model —
  genuinely that low, not a bug in our handling).

## RxClass (drug classification)
- Base: `https://rxnav.nlm.nih.gov/REST/rxclass`, no key needed
- `class/byRxcui.json` mixes real classification with disease/indication
  data — a `classType: "DISEASE"` entry (e.g. "Pregnancy", "Atrial
  Fibrillation" for warfarin, via `rela: ci_with/may_treat/may_prevent`) is
  a contraindication/indication association, not a drug class. Showing
  these as "drug class" would be misleading.
- `backend/services/rxclass.py` whitelists `classType` in
  `{ATC1-4, EPC, MOA, PE, VA, STRUCT, PK}` — the genuine classification
  types — and drops everything else.

## PubChem (2D structure + synonyms)
- Base: `https://pubchem.ncbi.nlm.nih.gov/rest/pug`, no key needed
- **Requesting the property named `CanonicalSMILES` does NOT return a
  `CanonicalSMILES` key** — PubChem silently relabels it `ConnectivitySMILES`
  (topology only, no stereochemistry) in the response. Requesting `SMILES`
  (the modern name for the old `IsomericSMILES`) is what actually comes
  back keyed `SMILES` and includes full stereochemistry. Verified
  empirically by comparing both requests side by side, not from docs —
  this is genuinely surprising API behavior.
- `compound/name/{name}/synonyms/JSON` returns up to hundreds of alternate
  names (brand names, INN/chemical names, CAS numbers) — `pubchem.py`'s
  `get_synonyms()` caps at 15, front-loaded by PubChem's own relevance
  ordering. Used as a fallback when another name-keyed source (DDInter)
  doesn't match the primary RxNorm-resolved name.
- Both endpoints return 404 for an unmatched name — treated as "no data"
  (`None`/`[]`), not an error, matching every other service's convention.

## ChEMBL (verified mechanism, Tier 1)
- Base: `https://www.ebi.ac.uk/chembl/api/data`, no key needed
- Flow: `molecule/search?q={name}` → take the first result's
  `molecule_hierarchy.parent_chembl_id` (not `molecule_chembl_id` — a salt
  form like "warfarin sodium" has its own `molecule_chembl_id` but shares
  the base compound's `parent_chembl_id`, and only the parent tends to have
  curated mechanism data) → `mechanism?molecule_chembl_id={parent_id}` →
  for each entry, resolve `target_chembl_id` via `target/{id}` for the
  human-readable name.
- **Coverage is real but inconsistent** — aspirin has a citable entry
  (target "Cyclooxygenase", real PubMed references); warfarin has zero
  entries in the `mechanism` endpoint, despite its target VKORC1 existing
  independently in ChEMBL as `CHEMBL1930`. An empty result is expected and
  common, not a bug — never treat it as "this drug has no mechanism."
- `mechanism_refs` gives real citations (`ref_type`: PubMed/Wikipedia/etc.,
  `ref_url`) — this is what makes this source usable as a Tier 1 citation
  rather than just another API call.

## DDInter 2.0 (verified severity, Tier 1)
- Not a live API integration — see `backend/data/ddinter/README.md` for
  full provenance. Bundled as 8 static CSVs (by ATC code: A/B/D/H/L/P/R/V,
  ~222k curated drug-pair severity ratings total), downloaded once from
  DDInter's own published `/download/` page, ingested into a local SQLite
  table (`ddinter_reference`) at backend startup.
- **Deliberately not built against DDInter's internal AJAX endpoint**
  (`/ddinter/checker/`, found while investigating their site) — that's
  their private web app's backend, not a published interface. Hitting it
  per-user-request would hammer their infrastructure regardless of the
  data's license terms.
- License: **CC BY-NC-SA 4.0** — compatible with this non-commercial
  research tool, but requires attribution wherever the data is shown
  (already wired into the UI, PDF/Word exports, and CSV export).
- **DDInter's canonical drug names sometimes differ from RxNorm's** — e.g.
  DDInter uses "Acetylsalicylic acid" where RxNorm/this app resolve to
  "Aspirin". Exact-name lookup alone misses these (confirmed: warfarin +
  aspirin returned nothing on exact match, despite DDInter rating it
  "Major"). Fixed by falling back to PubChem's synonym list
  (`get_verified_severity` tried against every synonym combination,
  capped at 15×15) when the exact match fails — this is a general fix, not
  a hardcoded aspirin special-case, and should catch other brand/generic/
  INN naming mismatches too.
- Lookup is symmetric (tries both `(a,b)` and `(b,a)` orderings) since
  DDInter's CSV column order (`Drug_A`/`Drug_B`) is arbitrary, not
  semantically directional.
- Only severity level is in the bulk download — the mechanism/management
  text visible on DDInter's own live per-pair pages isn't included.

## RDKit.js (client-side molecule rendering)
- Loaded via a lazily-injected `<script src="https://unpkg.com/@rdkit/rdkit/dist/RDKit_minimal.js">`
  (`frontend/lib/useRdkit.ts`), **not** an npm dependency — avoids a
  multi-MB WASM payload in every page load and the custom webpack config
  RDKit.js's own docs say npm/bundler usage requires. Only loads when a
  user actually opens a Structures tab.
- API: `window.initRDKitModule()` → `rdkit.get_mol(smiles).get_svg(w, h)`.
  Must call `mol.delete()` after use (WASM memory isn't garbage collected
  by JS).
