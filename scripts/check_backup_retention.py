#!/usr/bin/env python3
"""Self-check for the studio backup's grandfather/father/son retention
(scripts/backup_studio_db.py gfs_plan): simulates two years of nightly runs,
pruning after each like the real job, and checks what survives. No network.

    python3 scripts/check_backup_retention.py
"""
import datetime
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import backup_studio_db as b  # noqa: E402

start = datetime.date(2026, 11, 18)
points = []  # (path, when, complete)
for day in range(730):
    d = start + datetime.timedelta(days=day)
    if day % 37 == 5:
        continue  # the Mac was off that night: no run
    complete = day % 53 != 7  # now and then the token was refused: a PARTIAL
    name = f"piano-studio-{d}-0330{'' if complete else '-PARTIAL'}.tar.gz"
    points.append((pathlib.Path(name), datetime.datetime.combine(d, datetime.time(3, 30)), complete))
    keep = b.gfs_plan(points, d)
    points = [p for p in points if p[0] in keep]

today = start + datetime.timedelta(days=729)
keep = b.gfs_plan(points, today)
tiers = {t: sorted(p.name for p, tier in keep.items() if tier == t) for t in ("daily", "weekly", "monthly", "yearly")}
ages = sorted((today - when.date()).days for _, when, _ in points)

assert len(points) == len(keep), "everything left on disk is a keeper"
assert 6 <= len(tiers["daily"]) <= 7, tiers["daily"]
assert 4 <= len(tiers["weekly"]) <= 5, tiers["weekly"]
assert 12 <= len(tiers["monthly"]) <= 13, tiers["monthly"]
assert 1 <= len(tiers["yearly"]) <= 2, tiers["yearly"]
assert ages[0] <= 1, "the newest copy is from today or yesterday"
assert ages[-1] >= 400, "a copy older than a year survives"
# No gap a restore would fall into: within the first 7 days every day missing
# is a night the Mac was off; within 35 days no gap over 8 days.
recent = [a for a in ages if a < 35]
assert all(b2 - a2 <= 8 for a2, b2 in zip(recent, recent[1:])), recent
# A PARTIAL is kept only when its bucket has nothing complete.
for p, tier in keep.items():
    if "PARTIAL" in p.name:
        when = next(w for q, w, _ in points if q == p)
        same_day = [q for q, w, c in points if c and w.date() == when.date()]
        assert not same_day, p

print(f"retention check passed: {len(points)} archives after two years "
      f"({', '.join(f'{len(v)} {k}' for k, v in tiers.items())}), oldest {ages[-1]} days")
