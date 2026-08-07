import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(__file__), "rxcui_cache.db")

def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c

def init_db():
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS rxcui_cache (
                drug_name    TEXT PRIMARY KEY,
                rxcui        TEXT,
                standard_name TEXT,
                cached_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

def get_cached_rxcui(drug_name: str) -> dict | None:
    with _conn() as c:
        row = c.execute(
            "SELECT rxcui, standard_name FROM rxcui_cache WHERE LOWER(drug_name)=LOWER(?)",
            (drug_name,)
        ).fetchone()
    return dict(row) if row else None

def set_cached_rxcui(drug_name: str, rxcui: str, standard_name: str):
    with _conn() as c:
        c.execute(
            "INSERT OR REPLACE INTO rxcui_cache (drug_name, rxcui, standard_name) VALUES (?,?,?)",
            (drug_name, rxcui, standard_name)
        )
