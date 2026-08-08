# DDInter 2.0 — bundled reference data

Source: https://ddinter.scbdd.com/ (DDInter 2.0), Xiangya Hospital / Central South University.

Downloaded 2026-08-08 from the site's own published `/download/` page (8 files split by
ATC code: A, B, D, H, L, P, R, V) — this is DDInter's intended reuse path, not a scrape of
their live application's internal endpoints.

**License: CC BY-NC-SA 4.0** (Creative Commons Attribution-NonCommercial-ShareAlike).
Per DDInter's own terms: "you may print or download content from the services for your
own personal, non-commercial, informational or scholarly use." This project is free,
non-commercial, and labeled for research/informational use only (see CLAUDE.md), which is
consistent with that license — any redistribution of this data or a derivative must retain
attribution and the same license terms.

These CSVs are ingested once at backend startup into a local SQLite reference table
(`backend/cache/sqlite.py`'s `ensure_ddinter_loaded()`) — the app never queries DDInter's
live servers at request time.

Known limitation: DDInter's bulk download gives severity level only (Major/Moderate/Minor/
Unknown), not the interaction description/management text visible on DDInter's own live
per-pair pages. Matching against RxNorm-resolved drug names is case-insensitive exact-match
only, so coverage gaps are expected — the app shows this absence honestly rather than
guessing.
