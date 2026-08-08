import sqlite3, os, json, csv

DB_PATH = os.path.join(os.path.dirname(__file__), "rxcui_cache.db")
DDINTER_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "ddinter")
DDINTER_LETTERS = ["A", "B", "D", "H", "L", "P", "R", "V"]

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
            CREATE TABLE IF NOT EXISTS pubchem_cache (
                drug_name    TEXT PRIMARY KEY,
                cid          INTEGER,
                smiles       TEXT,
                cached_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS chembl_cache (
                drug_name       TEXT PRIMARY KEY,
                mechanisms_json TEXT,
                cached_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS pubchem_synonyms_cache (
                drug_name     TEXT PRIMARY KEY,
                synonyms_json TEXT,
                cached_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS ddinter_reference (
                drug_a_lower TEXT,
                drug_b_lower TEXT,
                level        TEXT
            )
        """)
        c.execute("""
            CREATE INDEX IF NOT EXISTS idx_ddinter_pair
            ON ddinter_reference (drug_a_lower, drug_b_lower)
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS history (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                drug_a           TEXT,
                drug_b           TEXT,
                standard_a       TEXT,
                standard_b       TEXT,
                cid_a            INTEGER,
                smiles_a         TEXT,
                cid_b            INTEGER,
                smiles_b         TEXT,
                verified_mech_a_json TEXT,
                verified_mech_b_json TEXT,
                verified_severity_json TEXT,
                patient_context_json TEXT,
                risk_level       TEXT,
                mechanism        TEXT,
                mechanism_type   TEXT,
                targets_json     TEXT,
                pathway          TEXT,
                clinical_effect  TEXT,
                recommendation   TEXT,
                llm_summary      TEXT,
                sources_json     TEXT,
                disclaimer       TEXT,
                provider         TEXT,
                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

def ensure_ddinter_loaded():
    """Idempotent: bulk-ingest the bundled DDInter CSVs into ddinter_reference
    on first run only. Downloaded once from DDInter's own /download/ page
    (see backend/data/ddinter/README.md for source + license) — never
    fetched live from their servers at request time."""
    with _conn() as c:
        count = c.execute("SELECT COUNT(*) AS n FROM ddinter_reference").fetchone()["n"]
        if count > 0:
            return

        rows = []
        for letter in DDINTER_LETTERS:
            path = os.path.join(DDINTER_DATA_DIR, f"{letter}.csv")
            if not os.path.exists(path):
                continue
            with open(path, newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    rows.append((
                        row["Drug_A"].strip().lower(),
                        row["Drug_B"].strip().lower(),
                        row["Level"].strip(),
                    ))

        if rows:
            c.executemany(
                "INSERT INTO ddinter_reference (drug_a_lower, drug_b_lower, level) VALUES (?,?,?)",
                rows
            )

def get_verified_severity(drug_a: str, drug_b: str) -> str | None:
    """Case-insensitive lookup, symmetric (DDInter's A/B order is arbitrary)."""
    a, b = drug_a.strip().lower(), drug_b.strip().lower()
    with _conn() as c:
        row = c.execute(
            """SELECT level FROM ddinter_reference
               WHERE (drug_a_lower=? AND drug_b_lower=?) OR (drug_a_lower=? AND drug_b_lower=?)
               LIMIT 1""",
            (a, b, b, a)
        ).fetchone()
    return row["level"] if row else None

def save_history(result, provider: str) -> int:
    """Persist a completed InteractionResult. Returns the new row id."""
    with _conn() as c:
        cur = c.execute(
            """INSERT INTO history
               (drug_a, drug_b, standard_a, standard_b, cid_a, smiles_a, cid_b, smiles_b,
                verified_mech_a_json, verified_mech_b_json, verified_severity_json,
                patient_context_json,
                risk_level, mechanism, mechanism_type, targets_json, pathway,
                clinical_effect, recommendation, llm_summary, sources_json,
                disclaimer, provider)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                result.drug_a.name, result.drug_b.name,
                result.drug_a.standard_name, result.drug_b.standard_name,
                result.drug_a.pubchem_cid, result.drug_a.smiles,
                result.drug_b.pubchem_cid, result.drug_b.smiles,
                json.dumps([m.model_dump() for m in result.drug_a.verified_mechanisms]),
                json.dumps([m.model_dump() for m in result.drug_b.verified_mechanisms]),
                json.dumps(result.verified_severity.model_dump()) if result.verified_severity else None,
                json.dumps(result.patient_context_used.model_dump()) if result.patient_context_used else None,
                result.risk_level.value, result.mechanism, result.mechanism_type.value,
                json.dumps(result.targets_involved), result.pathway,
                result.clinical_effect, result.recommendation, result.llm_summary,
                json.dumps([s.model_dump() for s in result.sources]),
                result.disclaimer, provider,
            )
        )
        return cur.lastrowid

def delete_history_items(ids: list[int]) -> int:
    """Delete the given history rows. Returns the number actually deleted."""
    if not ids:
        return 0
    placeholders = ",".join("?" * len(ids))
    with _conn() as c:
        cur = c.execute(f"DELETE FROM history WHERE id IN ({placeholders})", ids)
        return cur.rowcount

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
    r = dict(row)
    return {
        "id": r["id"],
        "drug_a": {
            "name": r["drug_a"], "rxcui": None, "standard_name": r["standard_a"],
            "pubchem_cid": r["cid_a"], "smiles": r["smiles_a"],
            "verified_mechanisms": json.loads(r["verified_mech_a_json"] or "[]"),
        },
        "drug_b": {
            "name": r["drug_b"], "rxcui": None, "standard_name": r["standard_b"],
            "pubchem_cid": r["cid_b"], "smiles": r["smiles_b"],
            "verified_mechanisms": json.loads(r["verified_mech_b_json"] or "[]"),
        },
        "verified_severity": json.loads(r["verified_severity_json"]) if r["verified_severity_json"] else None,
        "patient_context_used": json.loads(r["patient_context_json"]) if r["patient_context_json"] else None,
        "risk_level": r["risk_level"],
        "mechanism": r["mechanism"],
        "mechanism_type": r["mechanism_type"] or "unknown",
        "targets_involved": json.loads(r["targets_json"] or "[]"),
        "pathway": r["pathway"] or "",
        "clinical_effect": r["clinical_effect"],
        "recommendation": r["recommendation"],
        "llm_summary": r["llm_summary"],
        "sources": json.loads(r["sources_json"] or "[]"),
        "disclaimer": r["disclaimer"],
        "provider": r["provider"],
        "created_at": r["created_at"],
    }

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

def get_cached_structure(drug_name: str) -> dict | None:
    with _conn() as c:
        row = c.execute(
            "SELECT cid, smiles FROM pubchem_cache WHERE LOWER(drug_name)=LOWER(?)",
            (drug_name,)
        ).fetchone()
    return dict(row) if row else None

def set_cached_structure(drug_name: str, cid: int, smiles: str):
    with _conn() as c:
        c.execute(
            "INSERT OR REPLACE INTO pubchem_cache (drug_name, cid, smiles) VALUES (?,?,?)",
            (drug_name, cid, smiles)
        )

def get_cached_chembl(drug_name: str) -> list | None:
    """Returns None if never looked up, [] if looked up and confirmed empty."""
    with _conn() as c:
        row = c.execute(
            "SELECT mechanisms_json FROM chembl_cache WHERE LOWER(drug_name)=LOWER(?)",
            (drug_name,)
        ).fetchone()
    if not row:
        return None
    return json.loads(row["mechanisms_json"] or "[]")

def set_cached_chembl(drug_name: str, mechanisms: list):
    with _conn() as c:
        c.execute(
            "INSERT OR REPLACE INTO chembl_cache (drug_name, mechanisms_json) VALUES (?,?)",
            (drug_name, json.dumps(mechanisms))
        )

def get_cached_synonyms(drug_name: str) -> list | None:
    """Returns None if never looked up, [] if looked up and confirmed empty."""
    with _conn() as c:
        row = c.execute(
            "SELECT synonyms_json FROM pubchem_synonyms_cache WHERE LOWER(drug_name)=LOWER(?)",
            (drug_name,)
        ).fetchone()
    if not row:
        return None
    return json.loads(row["synonyms_json"] or "[]")

def set_cached_synonyms(drug_name: str, synonyms: list):
    with _conn() as c:
        c.execute(
            "INSERT OR REPLACE INTO pubchem_synonyms_cache (drug_name, synonyms_json) VALUES (?,?)",
            (drug_name, json.dumps(synonyms))
        )
