# API Notes

## RxNorm
- Base: https://rxnav.nlm.nih.gov/REST
- No key needed
- approximateTerm endpoint handles typos and brand/generic mapping
- spellingsuggestions endpoint for autocomplete

## RxNav Interaction
- Base: https://rxnav.nlm.nih.gov/REST/interaction
- No key needed
- Rate limit: 20 req/sec
- Returns severity: "N/A" | "minor" | "moderate" | "major"
- Map these to our low/moderate/high scale in llm.py

## OpenFDA
- Base: https://api.fda.gov/drug
- No key: 240 req/min
- With OPENFDA_API_KEY: 1000 req/min (free registration at open.fda.gov)
- drug_interactions field in label.json is raw text — sometimes very long, cap at 3000 chars

## Claude
- Model: claude-sonnet-4-6 (fast, cheap, accurate enough for synthesis)
- Always request JSON-only output to avoid parsing issues
- If JSON parse fails, retry once with stricter prompt before raising error
