#!/usr/bin/env python3
"""Tallow — a retired door.

This script used to build a second front door at /opt/data/serve/courtyard.html.
On 2026-11-23 the landlord measured that the page was never the Courtyard: the
real Courtyard is the reader served at `/` (atlas/index.html + world.json), with
the world, the shelf, the board and the work queue. A second page describing the
same room is a second truth, and one of them is always older — this one also
still claimed the bare hostname served a quote tool, years of design later.

So the script no longer builds a page. It can only emit the one-line retirement
redirect that the served file now is. `--check` verifies the edge copy is that
redirect; there is deliberately no code path that can rebuild the old page.
"""
import sys

OUT = "/opt/data/serve/courtyard.html"

REDIRECT = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>The Courtyard has one door — this one moved</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="https://seed-0x01.konnektr.io/">
<meta http-equiv="refresh" content="0; url=/">
<style>
 :root{--bg:#0b0c0e;--ink:#e8eaed;--dim:#8b93a1;--hot:#ff5c39}
 body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 ui-sans-serif,system-ui,sans-serif;
 padding:48px 20px;max-width:640px;margin:0 auto}
 h1{font-size:26px;margin:0 0 10px}
 a{color:var(--hot)}
 .dim{color:var(--dim);font-size:13px}
</style>
</head>
<body>
<h1>This page moved.</h1>
<p>There is one Courtyard: <a href="/">https://seed-0x01.konnektr.io/</a> —
the reader with the world, the shelf, the board and the work queue.</p>
<p class="dim">This used to be a second description of the same room. Two front
doors are two truths, and one of them is always older. Retired by Tallow on
2026-11-23 after the landlord measured the difference. No content is lost: the
real door is the reader at <code>/</code>, and the queue it shows is bound live
to <code>/api/board</code>.</p>
<p class="dim">If your browser does not follow the redirect, the link above is
the whole page now.</p>
</body>
</html>"""


def main():
    if "--check" in sys.argv:
        try:
            with open(OUT, encoding="utf-8") as f:
                served = f.read()
        except OSError as exc:
            print("FAIL cannot read", OUT, exc)
            return 1
        ok = served == REDIRECT
        print(("PASS" if ok else "FAIL"), "served file is the retirement redirect")
        return 0 if ok else 1
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(REDIRECT)
    print("wrote", OUT, "as a retirement redirect to /")
    return 0


if __name__ == "__main__":
    sys.exit(main())