# Drug-Drug Interaction Checker

## Status as of 2026-08-08

This is a **working, deployed-locally, full-stack app** — not a skeleton. Backend (FastAPI,
runs on port **8743** in local dev) and frontend (Next.js, port **4127**) are both fully built.
A user picks two (or up to 12) drugs, the app resolves them, pulls whatever real data exists
across five independent sources, and an LLM (the user's own choice of provider + key)
synthesizes a structured risk assessment. Every result distinguishes **independently
verified** data from **AI-synthesized** narrative — never blends the two. See "Verification
Tiers" below; it's the central design idea of this app and should be preserved in any
future feature.

Repo: https://github.com/Rakesh-Kudapa/ddi_checkar.git (`main` branch). Not yet deployed to
a public URL — deployment prep (Vercel + Render) is done in code, but the user hasn't
finished clicking through account setup on either platform yet (see "Deployment" below).

## Project Goal
An LLM-powered drug-drug interaction (DDI) checker that:
- Takes 2+ drug names as input (single pair, or a multi-drug panel up to 12 drugs / 66 pairs)
- Resolves them to standard RxCUI IDs via RxNorm
- Cross-references **three independent verification sources** (DDInter for severity, ChEMBL
  for mechanism, OpenFDA for label text) plus 2D molecular structure (PubChem + RDKit.js)
- Uses an LLM (Anthropic/Gemini/Grok — user's choice, user's own key) to synthesize a
  plain-English risk summary, clearly labeled as AI-synthesized
- Returns a structured risk card (severity + mechanism + recommendation + sources), with
  History/Reports persistence and PDF/Word export

## Intended Users
Researchers, pharmacologists, and clinical informaticists — not end patients.
Always show data sources and include a disclaimer that output is informational only.
(A daily-use pharmacologist reviewer rated the current build 8/10 as a "first-pass triage
tool" — see project memory for the full review. Biggest remaining ask: when verified
severity and the AI's own risk assessment disagree, the UI doesn't yet call that out
explicitly.)

## Verification Tiers (the core architectural idea — read this before adding features)

Every claim in a result is labeled by where it actually came from. Never present an
AI-generated claim with the same visual weight as an independently-sourced one.

- **Tier 1 — Verified severity**: DDInter 2.0's curated pair-level severity rating
  (Major/Moderate/Minor/Unknown), shown only when a real match exists.
- **Tier 1 — Verified mechanism**: ChEMBL's curated per-drug target + mechanism-of-action,
  with real literature (PubMed/Wikipedia) citations, shown only when ChEMBL has an entry.
- **Tier 2 — AI-synthesized**: the LLM's own risk_level, mechanism, mechanism_type,
  targets_involved, pathway, clinical_effect, recommendation — always labeled as such,
  never implied to be independently verified. Patient context (see below) enriches this
  tier without upgrading it — personalized is not the same as verified.

Coverage for Tier 1 sources is **real but inconsistent** — e.g. ChEMBL has aspirin's
mechanism but not warfarin's, even though warfarin's target (VKORC1) exists in ChEMBL
independently. An empty Tier 1 result means "this source doesn't have it," never "no
mechanism/interaction exists." This absence is always shown honestly, not hidden.

## Architecture
```
User input (drug names, optional patient context)
    → Backend (FastAPI, backend/main.py)
        → RxNorm API      — name resolution to RxCUI (backend/services/rxnorm.py)
        → RxNav API       — RETIRED by NLM, always returns empty (rxnav.py, kept for
                             graceful-degradation; do not remove without checking if
                             NLM ever relaunches it)
        → OpenFDA API     — raw drug label interaction text (openfda.py)
        → PubChem API     — 2D structure (CID/SMILES) + synonym lookup (pubchem.py)
        → ChEMBL API      — verified mechanism + citations, Tier 1 (chembl.py)
        → DDInter dataset — verified severity, Tier 1, bundled+ingested locally, not a
                             live API call (backend/data/ddinter/, cache/sqlite.py)
        → LLM API         — Anthropic/Gemini/Grok, user's own key, synthesis, Tier 2
                             (llm.py)
    → Frontend (Next.js, pages router)
        — Interaction Checker tab: Pair check / Multi-drug panel (up to 12 drugs) / History
        — Reports tab: filterable table, CSV export, checkbox multi-delete
        — Drug Info tab: single-drug lookup (class, structure, verified mechanism)
        — Settings tab: LLM provider + key (browser-only), data source status
        — Every result: tabbed card (Summary/Mechanism/Clinical/Structures/Sources/Raw),
          PDF/Word/CSV export
```

## Data Sources — real status, not aspirational
| Source | Purpose | Status |
|---|---|---|
| RxNorm (NLM) | Drug name → RxCUI | ✅ Working, no key |
| RxNav Interaction | ~~DDI severity~~ | ❌ **Permanently retired by NLM** (2024) — always 404s. See docs/api_notes.md |
| OpenFDA | Drug label interaction text | ✅ Working — must search by `generic_name`/`substance_name`, **not** `rxcui` (that field matches per-product, not per-ingredient, and silently returns nothing) |
| PubChem | CID, SMILES (2D structure), synonyms | ✅ Working, no key. Request property `SMILES`, not `CanonicalSMILES` (see docs/api_notes.md) |
| ChEMBL | Verified mechanism + citations (Tier 1) | ✅ Working, no key. Coverage inconsistent — many drugs have no entry |
| DDInter 2.0 | Verified severity (Tier 1) | ✅ Working — bundled dataset (`backend/data/ddinter/`), not a live call. CC BY-NC-SA 4.0, attribution required in UI/exports |
| RxClass | Drug classification | ✅ Working, no key — must filter out `classType: DISEASE` entries (indication/contraindication data, not classes) |
| LLM (Anthropic/Gemini/Grok) | Tier 2 synthesis | ✅ Working — **user's own key, entered in Settings, never stored server-side or in an env var** |

## Risk Scoring
- **Low** — no clinically significant interaction found
- **Moderate** — interaction exists, monitor closely, consider dose adjustment
- **High** — contraindicated or requires clinical intervention

This is the AI's (Tier 2) assessment. `verified_severity` (Tier 1, DDInter) is a *separate*
field shown alongside it — they are not merged into one number, and the UI does not yet
explain what to do if they disagree (see "Intended Users" note above — this is the leading
known UX gap).

## Folder Structure (actual, as of 2026-08-08)
```
ddi-checker/
├── CLAUDE.md
├── README.md
├── render.yaml              ← Render blueprint for backend deploy
├── requirements.txt
├── .env.example             ← OPENFDA_API_KEY only (optional) — LLM keys are never here
├── backend/
│   ├── main.py              ← FastAPI app, CORS via ALLOWED_ORIGINS env var, startup hooks
│   ├── data/ddinter/         ← bundled DDInter CSVs (A/B/D/H/L/P/R/V.csv) + README (license)
│   ├── routers/
│   │   └── interaction.py   ← /check, /check-multi, /history*, /drug-info, /export, /autocomplete
│   ├── services/
│   │   ├── rxnorm.py        ← name → RxCUI + autocomplete
│   │   ├── rxnav.py         ← retired API, always returns empty gracefully
│   │   ├── openfda.py       ← label text (search by name, not rxcui)
│   │   ├── pubchem.py       ← structure + synonyms
│   │   ├── chembl.py        ← verified mechanism (Tier 1)
│   │   ├── rxclass.py       ← drug classification
│   │   ├── llm.py           ← multi-provider synthesis (Tier 2), patient context prompt
│   │   └── reportgen.py     ← PDF (reportlab) / Word (python-docx) generation
│   ├── models/
│   │   └── schemas.py       ← all Pydantic models — check here first for the data shape
│   └── cache/
│       └── sqlite.py        ← rxcui/pubchem/chembl caches, ddinter_reference (ingested
│                               once at startup), history table, all CRUD helpers
├── frontend/
│   ├── pages/
│   │   ├── _app.tsx
│   │   └── index.tsx        ← app shell: tab/mode routing, lifts LLM settings + seeds
│   ├── components/
│   │   ├── layout/          ← TopBar, Sidebar
│   │   ├── checker/         ← DrugInput, PairChecker, MultiDrugPanel, ResultCard (the
│   │   │                       main tabbed result view), VerifiedMechanismCard,
│   │   │                       MoleculeView, PatientContextForm, HistoryList
│   │   ├── reports/         ← ReportsPanel
│   │   ├── druginfo/        ← DrugInfoPanel
│   │   └── settings/        ← SettingsPanel (LLM key + data source status)
│   ├── lib/
│   │   └── useRdkit.ts      ← lazy-loads RDKit.js from CDN (not an npm dep — see docs/api_notes.md)
│   └── styles/globals.css
└── docs/
    └── api_notes.md         ← every API quirk found this session — read before touching
                                a service file
```

## v1 Scope — done
- [x] 2-drug interaction check
- [x] Drug name autocomplete via RxNorm (with user-controllable dismiss, not auto-popping)
- [x] Risk badge + plain English explanation
- [x] Source citations shown in output
- [x] SQLite cache to avoid repeat API calls

## v2 Scope — mostly done
- [x] Multi-drug panel (up to 12 drugs, all pairwise combinations, bounded concurrency)
- [x] Independently-verified structured severity — **done via DDInter**, not DrugBank (DDInter
      turned out to be a better fit: free, no license negotiation, real citations)
- [x] Verified mechanism data — ChEMBL, with literature citations
- [x] Molecular structure visualization — PubChem + RDKit.js
- [x] History/Reports persistence + deletion (checkbox multi-select)
- [x] PDF/Word/CSV report export
- [x] Patient context (age/renal/hepatic/pregnancy/other conditions) — stays Tier 2
- [ ] Adverse events overlay from OpenFDA FAERS — not started
- [ ] Severity/AI-risk reconciliation UX (see "Risk Scoring" above) — not started, currently the top user-facing gap

## v3 Scope (future)
- [ ] Target → Drug triage integration (connect to SNP dashboard)
- [ ] Patient-level drug list import (from EHR CSV)
- [ ] Persistent (non-ephemeral) history storage for the hosted deployment

## Key Decisions
- **LLM keys are user-supplied, in-UI, per-request, never server-side** — user picks
  Anthropic/Gemini/Grok and pastes their own key in Settings; stored only in browser
  localStorage, forwarded per-request, never persisted or logged server-side.
- **Data-source keys/data stay server-side, never require the user to bring one** —
  RxNorm/RxNav/PubChem/ChEMBL need no key ever; OpenFDA's optional key and DDInter's
  bundled dataset live in server config/repo, not user input.
- **DDInter is bundled as static files, not called live** — downloaded once from their
  published `/download/` page (not their internal app API), ingested into SQLite at
  startup. Respects their infrastructure and removes a runtime dependency on their uptime.
- **Never blend Tier 1 (verified) and Tier 2 (AI) data** — this is the single most
  important invariant in this codebase. Every new data source needs to declare which tier
  it belongs to and be labeled accordingly in the UI.
- **Disclaimer** — always shown in UI, never omit, never make it a togglable setting.
- **`uvicorn --reload` is unreliable on Windows for this project** — see docs/api_notes.md
  and project memory. Restart the backend manually (kill + fresh start) after backend
  edits rather than trusting the reloader.
- **Never `pip install` into the global Python environment on this machine** — always use
  `./.venv/Scripts/python.exe -m pip install ...`. An earlier mistake here broke unrelated
  projects on the same machine.

## Local Dev Setup
- Backend: `./.venv/Scripts/python.exe -m uvicorn backend.main:app --port 8743` (no `--reload`)
- Frontend: `cd frontend && npm run dev` (runs on port 4127 per `package.json`)
- Backend `.env` (gitignored): only `OPENFDA_API_KEY=` (optional, blank is fine)
- First backend startup ingests the DDInter dataset into SQLite (~1.4s, idempotent —
  only runs if the table is empty)
- Ports 8743/4127 were chosen specifically to avoid colliding with the user's other local
  projects (port 8000 in particular is taken by an unrelated project on this machine)

## Deployment (prepared, not yet completed by the user)
- Backend → **Render** (free web service tier): `render.yaml` blueprint already in repo.
  Build: `pip install -r requirements.txt`. Start: `uvicorn backend.main:app --host 0.0.0.0
  --port $PORT`. Set `ALLOWED_ORIGINS` env var to the Vercel URL once known.
- Frontend → **Vercel** (free tier): import repo, set **Root Directory to `frontend`**
  (this is a monorepo), set `NEXT_PUBLIC_API_BASE` env var to the Render backend URL.
- Known, accepted tradeoff: Render's free tier has an **ephemeral filesystem** — the
  SQLite file (history + all caches, including the ingested DDInter table) resets on
  every redeploy. DDInter re-ingests automatically on the next startup (idempotent, fast);
  history does not persist. User explicitly chose to accept this rather than add a
  persistent DB for now.
- `backend/main.py`'s CORS is driven by `ALLOWED_ORIGINS` (comma-separated), defaulting to
  `http://localhost:4127` only — a production deploy without this set correctly will
  (correctly) reject browser requests rather than silently allow an unknown origin.

## Environment Variables
```
OPENFDA_API_KEY=          # optional, raises OpenFDA rate limit to 1000/min
ALLOWED_ORIGINS=           # comma-separated CORS origins, e.g. https://your-app.vercel.app,http://localhost:4127
```
LLM provider API keys are entered in the frontend Settings panel, never via env vars.

## Disclaimer (always include in UI)
"This tool is for research and informational purposes only.
It does not constitute medical advice. Always consult a licensed
pharmacist or physician before making prescribing decisions."
