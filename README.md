# Drug-Drug Interaction Checker

LLM-powered DDI checker using RxNorm, RxNav, OpenFDA, and Claude.

## Quick start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Set env vars
cp .env.example .env
# edit .env and add your ANTHROPIC_API_KEY

# 3. Run backend
uvicorn backend.main:app --reload

# 4. API docs
open http://localhost:8000/docs
```

## Test it
```bash
curl -X POST http://localhost:8000/api/check \
  -H "Content-Type: application/json" \
  -d '{"drug_a": "warfarin", "drug_b": "aspirin"}'
```

## See CLAUDE.md for full project plan.
