"""Fixture tests for falsifier clocks: mutating a source changes the countdown.

Run: python3 /opt/data/serve/test_falsifiers.py
"""
import os
import sqlite3
import sys
import tempfile
import time

sys.path.insert(0, "/opt/data/serve")
import falsifiers as F


def make_db(path, expiry):
    con = sqlite3.connect(path)
    con.execute("drop table if exists tasks")
    con.execute("drop table if exists task_comments")
    con.execute("create table tasks(id text, body text)")
    con.execute("create table task_comments(task_id text, body text)")
    con.execute("insert into tasks values(?,?)", (F.SERA_CARD, "expiry " + expiry))
    con.execute("insert into task_comments values(?,?)", (F.SERA_CARD, "kill at " + expiry))
    con.commit()
    con.close()


def test_fixture_source_mutation_changes_countdown():
    d = tempfile.mkdtemp()
    db = os.path.join(d, "board.db")
    make_db(db, "2030-01-01T00:00:00Z")
    fetch1 = lambda url: [{"body": "falsifier ends 2031-02-03"}]
    now = time.time()
    s1 = F.snapshot(db=db, fetch=fetch1, now=now)
    assert s1["falsifiers"][0]["kill_utc"] == "2030-01-01T00:00:00Z", s1
    assert s1["falsifiers"][1]["kill_utc"] == "2031-02-03T00:00:00Z", s1

    # Mutate both temp authoritative sources; the rendered countdown must move.
    make_db(db, "2029-01-01T00:00:00Z")
    fetch2 = lambda url: [{"body": "falsifier ends 2028-02-03"}]
    s2 = F.snapshot(db=db, fetch=fetch2, now=now)
    assert s2["falsifiers"][0]["kill_utc"] == "2029-01-01T00:00:00Z", s2
    assert s2["falsifiers"][1]["kill_utc"] == "2028-02-03T00:00:00Z", s2
    assert s2["falsifiers"][0]["days_left"] < s1["falsifiers"][0]["days_left"]
    assert s2["falsifiers"][1]["days_left"] < s1["falsifiers"][1]["days_left"]
    print("PASS fixture: mutated temp board + temp GitHub source changed both countdowns")


def test_unreachable_source_is_never_invented():
    d = tempfile.mkdtemp()
    db = os.path.join(d, "board.db")
    make_db(db, "2030-01-01T00:00:00Z")
    def boom(url):
        raise RuntimeError("source down")
    s = F.snapshot(db=db, fetch=boom, now=time.time())
    assert s["falsifiers"][1]["kill_utc"] is None
    assert s["falsifiers"][1]["state"] == "unreachable"
    print("PASS unreachable GitHub source renders unobserved, not an invented date")


if __name__ == "__main__":
    test_fixture_source_mutation_changes_countdown()
    test_unreachable_source_is_never_invented()
    live = F.snapshot()
    for f in live["falsifiers"]:
        print("LIVE", f["owner"], f["kill_utc"], f["days_left"], f["state"], f["source"])
    print("read_utc", live["read_utc"])
