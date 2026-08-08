from dotenv import load_dotenv
load_dotenv()

import logging
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from backend.routers import interaction
from backend.cache.sqlite import init_db

logger = logging.getLogger("ddi_checker")

app = FastAPI(
    title="Drug-Drug Interaction Checker",
    description="LLM-powered DDI checker using RxNorm, RxNav, OpenFDA, and Claude",
    version="0.1.0"
)

# Comma-separated list, e.g. "https://ddi-checker.vercel.app,http://localhost:4127".
# Falls back to local dev only if unset, so a production deploy without this
# set will (correctly) reject the browser's requests rather than silently
# allowing an unknown origin.
_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:4127")
ALLOWED_ORIGINS = [o.strip() for o in _allowed_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Last-resort logging for truly unexpected errors.

    NOTE: Starlette routes any handler registered for the bare `Exception`
    class through ServerErrorMiddleware, which sits *outside* CORSMiddleware
    — so this response will never carry CORS headers, and the browser will
    still report a generic "Failed to fetch" for cross-origin requests. This
    only makes the server-side log readable; it does not fix the CORS gap.
    Known failure points (RxNorm/RxNav/OpenFDA/LLM calls) are caught in
    backend/routers/interaction.py and re-raised as HTTPException instead,
    which *does* stay inside the CORS-wrapped middleware chain — that's the
    real fix. This handler is only a safety net for anything unanticipated.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

@app.on_event("startup")
def on_startup():
    init_db()

app.include_router(interaction.router, prefix="/api")

@app.get("/health")
def health():
    return {"status": "ok", "version": "0.1.0"}
