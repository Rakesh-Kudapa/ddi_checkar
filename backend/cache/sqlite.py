import sqlite3, os, json

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
        c.execute("""
            CREATE TABLE IF NOT EXISTS history (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                drug_a           TEXT,
                drug_b           TEXT,
                standard_a       TEXT,
                standard_b       TEXT,
                risk_level       TEXT,
                mechanism        TEXT,
                clinical_effect  TEXT,
                recommendation   TEXT,
                llm_summary      TEXT,
                sources_json     TEXT,
                disclaimer       TEXT,
                provider         TEXT,
                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

def save_history(result, provider: str) -> int:
    """Persist a completed InteractionResult. Returns the new row id."""
    with _conn() as c:
        cur = c.execute(
            """INSERT INTO history
               (drug_a, drug_b, standard_a, standard_b, risk_level, mechanism,
                clinical_effect, recommendation, llm_summary, sources_json,
                disclaimer, provider)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                result.drug_a.name, result.drug_b.name,
                result.drug_a.standard_name, result.drug_b.standard_name,
                result.risk_level.value, result.mechanism, result.clinical_effect,
                result.recommendation, result.llm_summary,
                json.dumps([s.model_dump() for s in result.sources]),
                result.disclaimer, provider,
            )
        )
        return cur.lastrowid

def list_history(limit: int = 50) -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            """SELECT id, drug_a, drug_b, standard_a, standard_b, risk_level,
                      provider, created_at
               FROM history ORDER BY id DESC LIMIT ?""",
            (limit,)
        ).fetchall()
    return [dict(r) for r in rows]

def get_history_item(item_id: int) -> dict | None:
    with _conn() as c:
        row = c.execute("SELECT * FROM history WHERE id=?", (item_id,)).fetchone()
    if not row:
        return None
    item = dict(row)
    item["sources"] = json.loads(item.pop("sources_json") or "[]")
    return item

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
