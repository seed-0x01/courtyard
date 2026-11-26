"""Falsifier clocks: derive kill dates from authoritative sources; never type them.

Sources: the kanban DB (sera card t_2e7d5b58) and the public GitHub API
(seed-0x01/soul#5).  Every number here is derived at read time; this module
never closes or extends a kill date and never spends anything.
"""
import json
import re
import sqlite3
import time
from datetime import datetime, timezone

BOARD_DB = "/opt/data/kanban.db"
SERA_CARD = "t_2e7d5b58"
SOUL5_COMMENTS = ("https://api.github.com/repos/seed-0x01/soul/issues/5/"
                  "comments?per_page=100")
ISO = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z")
EXPIRY = re.compile(r"expiry\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)", re.I)
ENDS = re.compile(r"falsifier\s+ends?\s+(\d{4}-\d{2}-\d{2})", re.I)


def kill_from_text(text):
    m = EXPIRY.search(text or "")
    return m.group(1) if m else (ISO.search(text or "").group(0) if ISO.search(text or "") else None)


def soul5_date_from_comments(comments):
    found = None
    for c in comments or []:
        for m in ENDS.finditer(c.get("body") or ""):
            found = m.group(1)
    return found + "T00:00:00Z" if found else None


def days_left(kill_utc, now=None):
    if not kill_utc:
        return None
    try:
        k = datetime.strptime(kill_utc[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
        n = datetime.fromtimestamp(time.time() if now is None else now, tz=timezone.utc)
        return round((k - n).total_seconds() / 86400, 2)
    except ValueError:
        return None


def fetch_github_comments(url):
    req = urllib_request(url)
    return json.load(req)


def urllib_request(url):
    import urllib.request
    return urllib.request.urlopen(
        urllib.request.Request(url, headers={
            "Accept": "application/vnd.github+json", "User-Agent": "tallow"}), timeout=12)


def snapshot(db=None, fetch=None, now=None):
    now = time.time() if now is None else now
    fetch = fetch or fetch_github_comments
    clocks = []
    try:
        con = sqlite3.connect(f"file:{db or BOARD_DB}?mode=ro", uri=True, timeout=5)
        try:
            parts = []
            for (b,) in con.execute("select body from tasks where id=?", (SERA_CARD,)):
                parts.append(b or "")
            for (b,) in con.execute("select body from task_comments where task_id=?", (SERA_CARD,)):
                parts.append(b or "")
            k = kill_from_text("\n".join(parts))
        finally:
            con.close()
        clocks.append({"owner": "sera", "kill_utc": k, "days_left": days_left(k, now),
                       "source": "board:" + SERA_CARD, "source_url": "/api/board",
                       "state": "ok" if k else "unobserved"})
    except Exception as exc:
        clocks.append({"owner": "sera", "kill_utc": None, "days_left": None,
                       "source": "board:" + SERA_CARD, "state": "unreachable",
                       "detail": str(exc)[:160]})
    try:
        k = soul5_date_from_comments(fetch(SOUL5_COMMENTS))
        clocks.append({"owner": "soul#5", "kill_utc": k, "days_left": days_left(k, now),
                       "source": "github:seed-0x01/soul#5",
                       "source_url": "https://github.com/seed-0x01/soul/issues/5",
                       "state": "ok" if k else "unobserved"})
    except Exception as exc:
        clocks.append({"owner": "soul#5", "kill_utc": None, "days_left": None,
                       "source": "github:seed-0x01/soul#5", "state": "unreachable",
                       "detail": str(exc)[:160]})
    return {"schema": "falsifier-clocks/1",
            "read_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
            "note": ("Kill dates read from the sources above, never typed here. "
                     "days_left is computed from each source date at read time. "
                     "Nothing here closes or extends a kill date."),
            "falsifiers": clocks}
