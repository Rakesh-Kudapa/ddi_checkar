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
(A daily-use pharmacologist reviewer rated the first review cycle 8/10 — see "Next Up"
below for that cycle's three gaps, now done. A second review cycle, done as a daily-use
*scientist* rather than a pharmacologist, found and fixed a further round of correctness
bugs and workflow friction — see "Second Review Cycle" below. Re-rated **8.5/10** after
those fixes — up from an interim 7/10 mid-cycle once the two silent correctness bugs were
found but not yet fixed.)

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

## Next Up — prioritized from the last user review (pick up here)

A daily-use pharmacologist reviewer evaluated the build and rated it 8/10, with three
concrete, unresolved gaps. **All three are now done** (2026-08-08) — this section is kept
as a record of what was built and why, not an open task list. Check with the user before
starting new work here; there is no known next gap from this review cycle.
(Two other items from that same review — the free-tier LLM rate limit and history
resetting on redeploy — were explicitly set aside by the user as accepted, deliberate
tradeoffs, not open work. Don't "fix" those without being asked again.)

### 1. Severity reconciliation — done (2026-08-08)
`backend/services/severity.py` normalizes DDInter's `Major/Moderate/Minor/Unknown` onto
the AI's `high/moderate/low/unknown` scale and detects agreement vs. disagreement. Result:
`InteractionResult.severity_comparison` (`SeverityComparison` in `schemas.py`) —
`agrees`, `verified_normalized`, `ai_risk_level`, `display_level`, `display_source`,
`explanation`. Populated in `run_check()` in `backend/routers/interaction.py` right after
`verified_severity` is attached; persisted in the `history` table
(`severity_comparison_json`, with a startup migration in `cache/sqlite.py` for DBs created
before this column existed).

**Stated policy (confirmed with the user): when the two disagree, the UI leads with
whichever is more severe** ("most severe wins" — the standard err-toward-caution
convention in clinical decision support), not with whichever source is "trusted." Both
values stay visible underneath with an explanation of why they can differ. Wired into:
`ResultCard.tsx`'s header badge/color and Summary tab explanation banner,
`MultiDrugPanel.tsx`'s matrix cell colors/counts (`headlineOf()`), CSV export, and both
PDF/Word exports (`reportgen.py`). `severity_comparison` is `null` — not computed — when
no verified severity exists at all; that case is unchanged from before (AI-assessed-only,
no comparison to make).

### 2. Severity → clinical action mapping — done (2026-08-08)
Went with **(a)**, the generic convention — **(b)**, a genuine per-pair management source,
stayed out of reach: DDInter's bulk CSV download has no management field, and their live
per-pair pages' "Management" field is only visible via their internal AJAX endpoint, which
this project deliberately doesn't call (see docs/api_notes.md's DDInter section; same
don't-hit-their-private-endpoint reasoning as for severity, see Key Decisions).

`backend/services/severity.py`'s `_ACTION_CONVENTION` dict maps DDInter's `Major/Moderate/
Minor` to a label + description (no entry for `Unknown` — don't guess an action for an
unknown rating). New `ActionConvention` model (`schemas.py`): `action`, `description`,
`basis` (always states it's a general convention, not per-pair verified, not AI-generated
— this is a **third, distinct category** alongside Tier 1/Tier 2, not a member of either).
`InteractionResult.action_convention` / `HistoryDetail.action_convention`, populated via
`severity.action_convention_for(verified_severity)` in `run_check()`, `null` whenever no
verified severity exists (nothing to convert). Wired into: `ResultCard.tsx`'s Clinical tab
(shown alongside, and visually distinct from, the AI's own `recommendation`), CSV export,
and both PDF/Word exports. Persisted in `history.action_convention_json` (migrated column).

### 3. Data vintage / citation dates — done (2026-08-08)
`rxcui_cache`, `pubchem_cache`, `chembl_cache`'s existing `cached_at` columns are now
written explicitly (`backend/cache/sqlite.py`'s `_now()`, called from `set_cached_rxcui`/
`set_cached_structure`/`set_cached_chembl`, each now returning the timestamp just written)
and read back out through the service layer: `rxnorm.resolve()` → `DrugResolved.resolved_at`,
`pubchem.get_structure()` → `DrugResolved.structure_retrieved_at` (`cached_at` key on the
returned dict), `chembl.get_verified_mechanisms()` → `VerifiedMechanism.retrieved_at` (via
`_with_retrieved_at()` — one timestamp per drug, since `chembl_cache` stores one row per
drug, stamped onto every mechanism in that drug's list). DDInter's dataset date is a fixed
constant (`schemas.py`'s `DDINTER_DATASET_DATE = "2026-08-08"`, matching
`backend/data/ddinter/README.md`) on `VerifiedSeverity.dataset_date` — a per-dataset fact,
not a per-request lookup, per the original plan here.

Surfaced in: `ResultCard.tsx`'s Sources tab ("Data vintage" section) and `DrugInfoPanel.tsx`
(RxCUI resolved / structure retrieved rows), both PDF/Word exports (`reportgen.py`'s
`_data_vintage_lines()`, one shared helper for both formats), and `VerifiedMechanismCard.tsx`
(a small "Retrieved from ChEMBL: ..." line per mechanism). `history` table gained
`resolved_at_a/b`, `structure_at_a/b` columns (migrated) so History detail view round-trips
these too. Pre-existing history rows and cache entries read back `null`/no vintage line for
data cached before this change — expected, not a bug (there's no retroactive timestamp to
recover).

## Second Review Cycle (2026-08-08, later session) — a "use this daily" pass, all fixed

Reviewed as a scientist who'd use this tool as their *primary* daily interaction-checking
tool, not a one-off audit. Two of the findings were silent correctness bugs — the kind
that produce a plausible-looking wrong or degraded answer with no visible sign anything's
off, which is worse than a loud failure in a tool whose whole premise is honest data
provenance. Everything below is done; treat this as a record, not open work.

**Correctness/trust bugs:**
- **Patient context silently leaked across unrelated checks.** `PairChecker.tsx`'s
  seed-driven effect (reopening a History item, a Sidebar quick-pair, a Multi-drug
  "+ Multi-drug" jump) reset drug names but never patient context — so age/renal/hepatic/
  pregnancy data entered for one check silently rode along into the next, unrelated one,
  invisibly if the context panel was collapsed. Fixed: the effect now restores
  `patient_context_used` from a loaded result, or clears to empty for a fresh quick-pair.
  Same bug existed in `MultiDrugPanel.tsx`, fixed the same way. `PatientContextForm.tsx`
  also now shows a one-line "Currently set: ..." summary even while collapsed, so a
  lingering value is never invisible again.
- **Brand-name drugs silently lost all OpenFDA label data.** Verified empirically:
  `atorvastatin` returned a full label-interaction excerpt; `Lipitor` (same drug) returned
  "No FDA label data found." Same for Tylenol vs. acetaminophen. Cause:
  `openfda.get_label_interactions()` only tried `generic_name`/`substance_name`, never
  `brand_name` — and RxNorm sometimes resolves a brand name to itself rather than
  expanding it to the generic ingredient, so this wasn't a rare edge case. Fixed by adding
  `openfda.brand_name` as a third fallback field; the function now returns
  `(text, matched_field)` so `llm.py`'s citation URL reproduces whatever field actually
  matched instead of always assuming `generic_name` (which would've been a dead link for
  a brand-name match). See docs/api_notes.md's OpenFDA section. Some brands (confirmed:
  Tylenol) genuinely have no `drug_interactions` section even under `brand_name` — that's
  a real data gap, shown honestly, not a bug.
- **LLM could state unhedged, specific numeric doses** (e.g. a real historical result said
  "use low-dose aspirin (81 mg)") with nothing in the prompt discouraging it. `llm.py`'s
  `SYSTEM_PROMPT` now explicitly forbids inventing specific doses/intervals not present in
  the FDA label text given to it, and asks for qualitative guidance plus an explicit
  "verify against current prescribing information" framing instead.
- **Duplicate/self-pair wasn't blocked anywhere.** Confirmed via direct API call:
  `POST /api/check-multi` with `["warfarin","warfarin","aspirin"]` sailed through to the
  LLM step, wasting a call on a meaningless self-interaction. `/api/check` now rejects
  `drug_a == drug_b` (case-insensitive) with 400; `/api/check-multi` case-insensitively
  dedupes the drug list before generating pairs. Frontend: `PairChecker.tsx` blocks
  same-drug submission with an inline message; `MultiDrugPanel.tsx`'s `addDrug()` dedup
  check is now case-insensitive (previously exact-match only).

**Workflow friction (all in the frontend):**
- No Enter-to-submit anywhere in Pair Checker — `PairChecker.tsx`'s search card is now a
  real `<form>`, so Enter in either drug field submits. `DrugInput.tsx` gained Up/Down
  arrow-key navigation of suggestions and Enter-to-pick-the-highlighted-one (only
  intercepting Enter when something's actually highlighted, so plain Enter still falls
  through to the form submit).
- Reopening a History item or clicking a Sidebar quick-pair used to silently overwrite
  whatever was being typed. `PairChecker.tsx`'s seed effect now confirms first if there's
  unsaved typed input that doesn't match the incoming seed.
- **Reports/History were capped at a hardcoded 200/50 with zero indication** —
  `ReportsPanel.tsx`/`HistoryList.tsx` would silently stop showing older entries. Backend's
  `list_history()` now also returns a real `total` count (`HistoryListResult.total`); both
  panels show "showing N of TOTAL" and a real "Load more" button instead of a silent
  ceiling.
- **TopBar/Settings data-source badges were hardcoded strings** ("OpenFDA: online") that
  stayed "online" during an actual outage — the opposite of useful during the one moment a
  status badge matters. New `GET /api/status` (`backend/services/status.py`) does a cheap
  live reachability check per source (RxNorm/OpenFDA/PubChem/ChEMBL/DDInter-loaded);
  `frontend/lib/useDataSourceStatus.ts` polls it every 60s. Confirmed working for real
  during this session: OpenFDA had a genuine transient outage while testing, and the badge
  correctly flipped to "unreachable" and back to "online" a minute later.
- **"Raw data" tab was nearly empty** — just an explanatory note that RxNav is dead, no
  actual data. Now shows the full `InteractionResult` as formatted, copyable JSON — real
  audit value for a researcher checking exactly what fed a result, not a dead end.
- Settings: switching LLM provider could silently discard an unsaved, un-Saved API key
  typed for the current provider — `SettingsPanel.tsx`'s `handleProviderChange` now
  confirms first if the draft key differs from what's actually saved.
- `PatientContextForm.tsx`'s age field now clamps to `[0, 120]` instead of accepting any
  number.
- Reports CSV export ignored the row-selection checkboxes and always exported the whole
  filtered list — `ReportsPanel.tsx`'s `exportCsv()` now exports the checked rows when any
  are selected, the filtered list otherwise.

**Re-rated 8.5/10 after these fixes** (up from an interim 7/10 once the two correctness
bugs were identified but not yet fixed). What still caps it below a 9/10, honestly:
verification here was API/code-level (unit calls, live curl/PowerShell checks, `tsc`,
backend import) — nothing was clicked through in an actual browser, since no browser
automation tool was available this session; a real click-through pass is still worth doing
next time someone's in the UI. Also still true and unchanged: the severity→action mapping
is a generic convention, not a genuine per-pair recommendation (see "Next Up" #2); Tier 1
coverage (ChEMBL especially) is real but inconsistent, inherent to the data source; no
FAERS adverse-event overlay yet; the 12-drug panel cap will occasionally bind for real
polypharmacy cases. None of these are silent — all are disclosed in the UI or here — which
is what separates them from the bugs this cycle fixed.

## Third Review Cycle (2026-08-09) — live-usage bug report, all fixed

The user reported two things from actually using the app: (1) drugs pre-filled in the Pair
Checker were firing an LLM call with no explicit user action, wasting tokens, and there was
no way to stop a check once started; (2) a live Gemini 503 error surfaced with the user's
own real API key exposed in plaintext in the error message shown in the browser.

**Security: the user's real Gemini API key leaked via an unhandled-error message —
rotate it if you haven't.** Root cause: `_call_gemini` in `llm.py` sent the key as a
`?key=...` URL query parameter; `httpx.HTTPStatusError`'s string form includes the full
request URL, so any unhandled non-2xx status (confirmed live via a real transient 503)
put the raw key straight into the `HTTPException` detail returned to the browser — and
from there into this exact conversation, pasted by the user while reporting the bug. The
key in question (`AQ.Ab8RN6...`) matches one already flagged as compromised in project
memory from an earlier session — this is at least the second time it's been exposed.
**Told the user to rotate it in Google AI Studio; confirm this happened before assuming
the key is safe to use.** Fixed two ways: (1) root cause — `_call_gemini` now sends the
key via the `x-goog-api-key` HEADER instead of the URL (confirmed via Google's own docs
that this is supported), so it can never appear in a URL-derived error string again; (2)
defense in depth — `interaction.py`'s new `_redact()` strips any `key=`/`api_key=`/
`token=`-shaped query param out of every error message before it reaches an
`HTTPException` detail, catching this class of bug for any other current or future call
site (e.g. OpenFDA's optional server-side `OPENFDA_API_KEY`, which was never actually
exposed but shares the same risk shape).

**Resilience: transient 5xx from an LLM provider now retries automatically.** The
reported 503 was Google's own "model overloaded, retry" signal, not a real failure —
`llm.py`'s `_call_with_retry` now retries up to twice (1s, then 3s backoff) on 502/503/504
before giving up, for both the initial request and the JSON-retry-on-parse-failure path.

**Pair Checker no longer auto-runs a check.** `PairChecker.tsx`'s seed effect (fired by a
Sidebar quick-pair or a "+ Multi-drug" jump) used to immediately call the LLM the moment
fields were pre-filled — the user never asked for that specific check, so it was pure
wasted spend if they meant to edit the drugs first. It now only populates the fields;
`runCheck` fires only from an explicit "Check" click or Enter in the form.

**Both Pair Checker and Multi-Drug Panel gained a real Stop button.** Previously there was
no way to cancel a check once started — closing the tab or waiting it out were the only
options, and the backend kept running (and spending tokens) regardless of what the browser
did. Now: the frontend `AbortController`-aborts the fetch, which disconnects the backend's
request; a new `_run_cancelable()` wrapper in `interaction.py` polls
`request.is_disconnected()` while the real work runs as a task, and calls `task.cancel()`
on disconnect — this propagates a real `asyncio.CancelledError` into whatever's currently
awaiting (RxNorm, OpenFDA, PubChem, ChEMBL, or the LLM call itself), actually stopping
in-flight work server-side rather than just abandoning it client-side. Applied to both
`/api/check` and `/api/check-multi` (the latter cancels the whole `asyncio.gather` batch —
pairs already completed before the stop did spend tokens and aren't recoverable, since the
endpoint is all-or-nothing per request; nothing not yet started or still in flight does).
Verified live: a cancelled request produces no stray `history` row and the server stays
fully responsive afterward.

## Multi-User Deployment: History Isolation (2026-08-09)

User asked, before deploying and sharing the link: would one user's LLM API key be
exposed to another user? Verified in code: **no** — keys live only in each browser's own
`localStorage` (`SettingsPanel.tsx`), are passed as a plain function argument through the
whole call chain (`run_check` → `llm.synthesize` → `_call_*`) with no server-side storage
or global/module-level state, and are never logged (`main.py`'s exception handler logs
only method+path) or echoed back in any response model. Two different browsers hitting
the same deployed backend never share a key — this was already correct by construction.

**What actually wasn't isolated: History and Reports.** There was no `user_id`/session
concept anywhere — the `history` table had no such column, `GET /api/history` returned
everything to any caller, `DELETE /api/history` could delete any row by id with no
ownership check. On a shared deployed link, every visitor would see every other visitor's
checked drug pairs **and any patient context they entered** (age, renal/hepatic function,
pregnancy status, other conditions) — a real privacy gap, not a hypothetical one.

**Fix (user's explicit choice among four options presented — see the "Ask before
clinical/privacy-framing defaults" pattern in project memory): per-browser client ID,
not full authentication.** `frontend/lib/clientId.ts`'s `getClientId()` generates a random
id (`crypto.randomUUID()`) once per browser, persists it in `localStorage`
(`ddi_client_id`), and every history-touching fetch sends it as an `X-Client-Id` header
(`clientIdHeader()`, attached in `PairChecker.tsx`, `MultiDrugPanel.tsx`,
`HistoryList.tsx`, `ReportsPanel.tsx`). Backend: `interaction.py`'s `_client_id(request)`
reads the header (falling back to a shared `""` bucket if absent, e.g. a direct API call
— keeps the API usable without the header rather than erroring); `sqlite.py`'s
`save_history`/`list_history`/`get_history_item`/`delete_history_items` all now take and
filter by `client_id`. A cross-client fetch-by-id returns 404 (not a different error),
so it doesn't leak whether another client's id exists. `history` gained a `client_id`
column (migrated; existing pre-migration rows have it `NULL`, which never matches any
real client_id in a `=?` filter, so they simply stop appearing to anyone rather than
being misattributed — the safe failure direction).

**Explicitly not real security — disclosed, not hidden.** This is trivially spoofable by
anyone calling the API directly (nothing stops sending a fabricated `X-Client-Id`), and
doesn't survive a user clearing browser data (a fresh id gets generated, orphaning their
old history the same way a pre-migration row is orphaned). It solves the actual reported
risk — casual co-users of a shared link not seeing each other's checks and patient
context by default — without the much larger lift of real accounts/login. If this app is
ever deployed somewhere an adversarial user (not just a casual co-user) could access it,
this is not sufficient and real authentication would be needed instead.

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
        → GET /api/status — live per-source reachability check (status.py), polled by
                             the frontend every 60s for the TopBar/Settings badges
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
| OpenFDA | Drug label interaction text | ✅ Working — searches `generic_name` → `substance_name` → `brand_name` in order, **not** `rxcui` (that field matches per-product, not per-ingredient) or `generic_name` alone (misses brand-name entries like "Lipitor"/"Tylenol") |
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
field shown alongside it — they are never merged into one number. When they disagree, the
UI now leads with whichever is more severe and explains why via `severity_comparison`
(see "Next Up" #1, done). Still open: translating either into a concrete clinical action
(see "Next Up" #2, current top priority).

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
│   │   ├── severity.py      ← reconciles DDInter verified_severity vs. AI risk_level
│   │   │                       ("most severe wins" policy, "Next Up" #1) + DDInter
│   │   │                       severity → generic action convention mapping ("Next Up" #2)
│   │   ├── status.py        ← live per-source reachability check, backs GET /api/status
│   │   └── reportgen.py     ← PDF (reportlab) / Word (python-docx) generation, incl.
│   │                           action convention + data vintage lines ("Next Up" #2, #3)
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
│   │   ├── useRdkit.ts      ← lazy-loads RDKit.js from CDN (not an npm dep — see docs/api_notes.md)
│   │   ├── useDataSourceStatus.ts ← polls GET /api/status every 60s for live status badges
│   │   └── clientId.ts      ← per-browser id sent as X-Client-Id for History isolation
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
- [x] Severity/AI-risk reconciliation — done (see "Next Up" #1)
- [x] Severity→action mapping — done (see "Next Up" #2)
- [x] Data vintage / citation dates — done (see "Next Up" #3)

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

## Deployment (in progress — backend build was failing, now fixed)
- Backend → **Render** (free web service tier): `render.yaml` blueprint already in repo.
  Build: `pip install -r requirements.txt`. Start: `uvicorn backend.main:app --host 0.0.0.0
  --port $PORT`. Set `ALLOWED_ORIGINS` env var to the Vercel URL once known.
- **`.python-version` pins Python to `3.12`** (found/fixed 2026-08-09) — Render's default
  Python for new services is 3.14.3, and `requirements.txt`'s `pydantic==2.7.1` (mid-2024)
  has no prebuilt `pydantic-core` wheel for that version; `pydantic-core` is Rust, so pip
  falls back to a source build that fails without a Rust toolchain in Render's standard
  Python buildpack. This caused a fast, silent "Failed deploy" on the first real attempt.
  Pinning to 3.12 (same version already verified working in local dev) is the safe fix —
  upgrading `pydantic`/`fastapi` instead would also work but needs re-verification this
  pin doesn't. If bumping the Python version here later, re-check this class of failure.
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
- History/Reports are isolated per-browser via `X-Client-Id` (see "Multi-User Deployment:
  History Isolation" above) — read that before sharing a deployed link with more than one
  person. It's good enough for casual co-users, not for an adversarial one.

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
