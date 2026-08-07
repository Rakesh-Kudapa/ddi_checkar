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
