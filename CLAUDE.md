# Drug-Drug Interaction Checker

## Project Goal
Build a lightweight, LLM-powered drug-drug interaction (DDI) checker that:
- Takes 2+ drug names as input
- Resolves them to standard RxCUI IDs via RxNorm
- Queries RxNav + OpenFDA for interaction data
- Uses Claude to synthesize a plain-English risk summary
- Returns a structured risk card (severity + mechanism + recommendation + sources)

## Intended Users
Researchers, pharmacologists, and clinical informaticists — not end patients.
Always show data sources and include a disclaimer that output is informational only.

## Architecture
```
User input (drug names)
    → Backend (FastAPI)
        → RxNorm API     — name resolution to RxCUI
        → RxNav API      — structured DDI severity + description
        → OpenFDA API    — raw drug label interaction text
        → Claude API     — synthesize into structured summary
    → Frontend (Next.js)
        — drug name autocomplete
        — risk card output (severity badge + mechanism + recommendation)
        — source citations
```

## Data Sources (all free, no key required)
| API | Purpose | Base URL |
|-----|---------|----------|
| RxNorm (NLM) | Drug name → RxCUI ID | https://rxnav.nlm.nih.gov/REST/rxcui.json |
| RxNav Interaction | DDI severity + description | https://rxnav.nlm.nih.gov/REST/interaction/list.json |
| OpenFDA | Drug label interaction text | https://api.fda.gov/drug/label.json |
| Claude API | LLM synthesis | claude-sonnet-4-6 |

## Risk Scoring
- **Low** — no clinically significant interaction found
- **Moderate** — interaction exists, monitor closely, consider dose adjustment
- **High** — contraindicated or requires clinical intervention

## Folder Structure
```
ddi-checker/
├── CLAUDE.md              ← this file
├── README.md
├── .env.example
├── backend/
│   ├── main.py            ← FastAPI app entry point
│   ├── routers/
│   │   └── interaction.py ← /check and /autocomplete endpoints
│   ├── services/
│   │   ├── rxnorm.py      ← RxNorm name → RxCUI lookup
│   │   ├── rxnav.py       ← RxNav DDI query
│   │   ├── openfda.py     ← OpenFDA label text fetch
│   │   └── llm.py         ← Claude API synthesis
│   ├── models/
│   │   └── schemas.py     ← Pydantic request/response models
│   └── cache/
│       └── sqlite.py      ← SQLite cache for RxCUI lookups
├── frontend/
│   ├── pages/
│   │   └── index.tsx      ← Main page
│   ├── components/
│   │   ├── DrugInput.tsx  ← Drug name input with autocomplete
│   │   └── RiskCard.tsx   ← Interaction result display
│   └── styles/
│       └── globals.css
└── docs/
    └── api_notes.md       ← API quirks and rate limit notes
```

## Build Order (v1)
1. `backend/services/rxnorm.py` — name resolution (test first)
2. `backend/services/rxnav.py` — DDI query
3. `backend/services/openfda.py` — label text
4. `backend/services/llm.py` — Claude synthesis prompt
5. `backend/routers/interaction.py` — wire all services into endpoints
6. `backend/main.py` — FastAPI app
7. `frontend/components/DrugInput.tsx` — autocomplete input
8. `frontend/components/RiskCard.tsx` — result display
9. `frontend/pages/index.tsx` — main page

## v1 Scope (build first)
- [x] 2-drug interaction check
- [x] Drug name autocomplete via RxNorm
- [x] Risk badge + plain English explanation
- [x] Source citations shown in output
- [x] SQLite cache to avoid repeat API calls

## v2 Scope (after v1 works)
- [ ] Multi-drug panel (3+ drugs, all pairwise combinations)
- [ ] DrugBank integration for deeper mechanism data
- [ ] Adverse events overlay from OpenFDA FAERS
- [ ] Adverse events add-on (connect to your existing pipeline)

## v3 Scope (future)
- [ ] Target → Drug triage integration (connect to SNP dashboard)
- [ ] Patient-level drug list import (from EHR CSV)

## Key Decisions
- **No auth on v1** — keep it simple, add API key gating in v2
- **Cache RxCUI lookups in SQLite** — RxNorm calls are slow, cache aggressively
- **Claude model** — use claude-sonnet-4-6 for synthesis (fast + cheap)
- **Disclaimer** — always shown in UI, never omit
- **Rate limits** — RxNav: 20 req/sec, OpenFDA: 240 req/min (no key), 1000/min (with key)

## Environment Variables
```
ANTHROPIC_API_KEY=your_key_here
OPENFDA_API_KEY=optional_for_higher_rate_limits
```

## Disclaimer (always include in UI)
"This tool is for research and informational purposes only.
It does not constitute medical advice. Always consult a licensed
pharmacist or physician before making prescribing decisions."
