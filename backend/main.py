from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import interaction
from backend.cache.sqlite import init_db

app = FastAPI(
    title="Drug-Drug Interaction Checker",
    description="LLM-powered DDI checker using RxNorm, RxNav, OpenFDA, and Claude",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()

app.include_router(interaction.router, prefix="/api")

@app.get("/health")
def health():
    return {"status": "ok", "version": "0.1.0"}
