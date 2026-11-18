#!/usr/bin/env python3
"""Monthly restore test of the studio's nightly database backup (decision #436).

A backup nobody has ever restored is a hope, not a backup. On the 1st of each
month (launchd com.musicalbasics.studio-restore-test, 04:30, an hour after the
03:30 backup) this loads the newest complete archive from
scripts/backup_studio_db.py into a throwaway Postgres in Docker and checks it:

  1. rebuilds every public table from the archive's schema.json (columns,
     types, NOT NULL), plus auth.users and auth.identities (the sign-ins);
  2. INSERTs every row from the archive into those real tables;
  3. adds the keys, unique and check constraints and foreign keys, then the
     indexes (any row that breaks one is a failure), then replays the
     functions, triggers, row-level security, policies and grants (a failure
     there is a warning: the rows are safe, but a rebuild needs a hand);
  4. counts every table, and the sign-ins, against the archive's own counts
     AND the live database, and compares each sign-in's email and password
     hash with the live one;
  5. deletes the throwaway database (always, even on failure) and emails OK or
     FAILED with a short table summary, from the same sender and to the same
     inbox as the backup's emails.

Supabase-only pieces are stood in for so the copy loads into plain Postgres:
the auth and extensions schemas, the anon/authenticated/service_role roles,
and auth.uid()/role()/jwt()/email(). Storage policies are skipped (Storage's
tables are not in the database copy; its files are mirrored separately).

The container has no network at all, a random name, its data in memory
(tmpfs, no volume left behind) and is removed in a finally. Docker is called
by absolute path (launchd's PATH lacks /usr/local/bin); if Docker Desktop is
not running it is started and quit again afterwards.

Secrets, the Management API token and mail come from backup_studio_db.py
(imported from this file's folder: install_backup_agent.sh copies both).
STUDIO_BACKUP_MAIL=off silences the email, as for the backup.

    python3 scripts/restore_test_studio_db.py                    # test the newest copy
    python3 scripts/restore_test_studio_db.py --archive FILE     # test one archive
"""
import datetime
import json
import os
import pathlib
import re
import secrets
import socket
import subprocess
import sys
import tarfile
import time
import traceback

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import backup_studio_db as b  # noqa: E402

DOCKER = next((p for p in (os.environ.get("STUDIO_RESTORE_DOCKER"), "/usr/local/bin/docker",
                           "/Applications/Docker.app/Contents/Resources/bin/docker", "/opt/homebrew/bin/docker")
               if p and os.path.exists(p)), "/usr/local/bin/docker")
# Same major version as the live database (Postgres 17 on 2026-11-18).
IMAGE = os.environ.get("STUDIO_RESTORE_IMAGE") or "postgres:17-alpine"
DB = "studio_restore"
LABEL = "musicalbasics.studio-restore-test"
STALE_HOURS = 36
SUPABASE_ROLES = ("anon", "authenticated", "service_role")
LOG = b.BACKUP_ROOT / "restore-test.log"
MEMBER_RE = re.compile(r"(public|auth)\.([A-Za-z0-9_]+)\.json")
TYPE_RE = re.compile(r"[a-z0-9 _()\[\]]+")


def tolerance(live):
    """Rows can arrive (a message) or go (a cancelled lesson) between the 03:30
    copy and the 04:30 test, so the live comparison allows a small drift."""
    return max(5, round(live * 0.02))


def ident(name):
    return '"' + name.replace('"', '""') + '"'


def lit(s):
    return "'" + str(s).replace("'", "''") + "'"


# ----------------------------------------------------------------- docker ---

def docker(*args, input=None, timeout=300, check=True):
    res = subprocess.run([DOCKER, *args], input=input, capture_output=True, text=True, timeout=timeout)
    if check and res.returncode != 0:
        raise RuntimeError(f"docker {args[0]}: {(res.stderr or res.stdout).strip()[:300]}")
    return res


def docker_ready():
    try:
        return docker("info", timeout=60, check=False).returncode == 0
    except Exception:
        return False


def start_docker():
    """True when Docker Desktop had to be started (so it is quit afterwards)."""
    if docker_ready():
        return False
    print("Docker is not running: starting Docker Desktop")
    subprocess.run(["/usr/bin/open", "-g", "-a", "Docker"], capture_output=True, timeout=60)
    for _ in range(36):
        time.sleep(5)
        if docker_ready():
            return True
    raise RuntimeError("Docker Desktop is not running and did not start within 3 minutes")


def remove_leftovers():
    """Throwaway containers a crashed earlier run may have left behind."""
    ids = docker("ps", "-aq", "--filter", f"label={LABEL}", check=False).stdout.split()
    if ids:
        docker("rm", "-fv", *ids, check=False)
        print(f"removed {len(ids)} leftover restore-test container(s)")


class Throwaway:
    """An empty Postgres with no network, data in memory, removed on exit."""

    def __init__(self):
        self.name = f"studio-restore-test-{secrets.token_hex(4)}"

    def __enter__(self):
        docker("run", "-d", "--rm", "--name", self.name, "--label", f"{LABEL}=1",
               "--network", "none", "--cpus", "1", "--memory", "1g",
               "--tmpfs", "/var/lib/postgresql/data:rw,size=1g",
               "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-e", f"POSTGRES_DB={DB}", IMAGE, timeout=600)
        # The image's init runs a temporary server on the unix socket only;
        # TCP on 127.0.0.1 answers once the real one is up.
        for _ in range(90):
            if docker("exec", self.name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", DB,
                      check=False).returncode == 0:
                return self
            time.sleep(1)
        self.__exit__()  # __exit__ does not run when __enter__ raises
        raise RuntimeError("the throwaway Postgres did not start within 90 seconds")

    def __exit__(self, *exc):
        docker("rm", "-fv", self.name, check=False, timeout=120)
        left = docker("ps", "-aq", "--filter", f"name={self.name}", check=False).stdout.strip()
        print(f"throwaway database {'NOT REMOVED: ' + self.name if left else 'deleted'}")
        self.removed = not left

    def psql(self, sql, single_transaction=False):
        args = ["exec", "-i", self.name, "psql", "-U", "postgres", "-d", DB, "-X", "-q", "-At",
                "-v", "ON_ERROR_STOP=1"] + (["-1"] if single_transaction else []) + ["-f", "-"]
        res = docker(*args, input="set client_min_messages = warning;\n" + sql, timeout=900, check=False)
        if res.returncode != 0:
            err = re.sub(r"^psql:<stdin>:\d+: ", "", res.stderr.strip(), flags=re.M)
            raise RuntimeError(err[:400] or f"psql exited {res.returncode}")
        return res.stdout

    def run_each(self, kind, items):
        """Runs each (name, sql) in its own subtransaction so one failure does
        not stop the rest. Returns ["name: error", ...]."""
        if not items:
            return []
        tag = "s" + secrets.token_hex(6)
        parts = ["create table if not exists restore_meta.problems (kind text, name text, err text);",
                 f"delete from restore_meta.problems where kind = {lit(kind)};"]
        for name, sql in items:
            if tag in sql:
                raise RuntimeError("dollar-quote collision")
            parts.append(
                f"do $do_{tag}$ begin execute ${tag}${sql}${tag}$; "
                f"exception when others then insert into restore_meta.problems values "
                f"({lit(kind)}, {lit(name)}, sqlerrm); end $do_{tag}$;")
        parts.append(f"select name || ': ' || err from restore_meta.problems where kind = {lit(kind)} order by name;")
        out = self.psql("\n".join(parts))
        return [line for line in out.splitlines() if line.strip()]


# --------------------------------------------------------------- archive ---

def wait_for_running_backup():
    """If the backup is writing right now (both agents fire together when the
    Mac wakes), wait for it so the test gets tonight's copy, not a half-written one."""
    def recent(p):
        try:
            return time.time() - p.stat().st_mtime < 2 * 3600
        except OSError:
            return False

    for _ in range(60):
        busy = [p for p in b.BACKUP_ROOT.glob(".tmp-*") if recent(p)]
        if not busy:
            return
        print("a backup is running: waiting for it to finish")
        time.sleep(30)


def newest_archive():
    complete = [(when, path) for path, when, ok in b.restore_points(b.BACKUP_ROOT) if ok]
    if not complete:
        raise RuntimeError(f"no complete backup archive in {b.BACKUP_ROOT}")
    return max(complete)[1]


def read_archive(path):
    """{member basename: bytes}, read straight from the tar (nothing extracted)."""
    out = {}
    with tarfile.open(path, "r:gz") as tar:
        for m in tar.getmembers():
            if m.isfile():
                out[pathlib.PurePosixPath(m.name).name] = tar.extractfile(m).read()
    return out


def column_type(c):
    dt, udt = c["data_type"], c["udt_name"]
    if dt == "ARRAY":
        base = udt[1:]
        t = f"{base}[]" if TYPE_RE.fullmatch(base) else "text[]"
    elif dt == "USER-DEFINED":
        t = "text"  # enum definitions are not in the copy; none exist on 2026-11-18
    else:
        t = dt
    if not TYPE_RE.fullmatch(t):
        raise RuntimeError(f"unexpected column type {t!r} for {c['table_name']}.{c['column_name']}")
    return t


def inferred_columns(table, rows):
    """For archives made before auth columns were snapshotted: types from the values."""
    cols = {}
    for r in rows:
        for k, v in r.items():
            if v is None:
                cols.setdefault(k, None)
                continue
            t = ("boolean" if isinstance(v, bool) else "bigint" if isinstance(v, int)
                 else "double precision" if isinstance(v, float)
                 else "jsonb" if isinstance(v, (dict, list)) else "text")
            if cols.get(k) not in (None, t):
                t = "text"
            cols[k] = t
    return [{"table_schema": "auth", "table_name": table, "column_name": k,
             "data_type": "uuid" if k in ("id", "user_id") else (t or "text"), "udt_name": "",
             "is_nullable": "YES", "column_default": None} for k, t in cols.items()]


# ---------------------------------------------------------------- the test --

def restore_and_check(archive):
    files = read_archive(archive)
    if "schema.json" not in files:
        raise RuntimeError(f"{archive.name} has no schema.json (a PARTIAL copy cannot be restored)")
    schema = json.loads(files["schema.json"])
    manifest = json.loads(files[b.MANIFEST]) if b.MANIFEST in files else None

    data = {}  # "public.t" / "auth.users" -> (raw json text, row count)
    for name, raw in files.items():
        m = MEMBER_RE.fullmatch(name)
        if m:
            text = raw.decode("utf-8")
            data[f"{m[1]}.{m[2]}"] = (text, len(json.loads(text)))

    problems, warnings = [], []
    if manifest:
        for fname, n in manifest.get("rows", {}).items():
            key = fname[:-len(".json")]
            if key not in data:
                problems.append(f"{key}: listed in the archive's manifest but missing from it")
            elif data[key][1] != n:
                problems.append(f"{key}: archive file holds {data[key][1]} rows, its manifest says {n}")
    else:
        warnings.append("this copy has no manifest (made before 2026-11-18), so its files are their own record")

    cols_by_table = {}
    for c in schema["columns"]:
        if c["table_schema"] in ("public", "auth"):
            cols_by_table.setdefault(f"{c['table_schema']}.{c['table_name']}", []).append(c)
    public_tables = sorted(t for t in cols_by_table if t.startswith("public."))
    for t in public_tables:
        if t not in data:
            problems.append(f"{t}: in the schema but its rows are not in the archive")
    for t in ("auth.users", "auth.identities"):
        if t not in data:
            problems.append(f"{t}: sign-in table missing from the archive")
        elif t not in cols_by_table:
            cols_by_table[t] = inferred_columns(t.split(".")[1], json.loads(data[t][0]))
            warnings.append(f"{t}: column types inferred (copy made before they were snapshotted)")
    tables = public_tables + [t for t in ("auth.users", "auth.identities") if t in cols_by_table]

    constraint_names = {c["name"] for c in schema["constraints"]}
    roles = set(SUPABASE_ROLES)
    for g in schema["grants"]:
        roles.add(g["grantee"])
    for p in schema["policies"]:
        roles.update(r.strip('"') for r in p["roles"].strip("{}").split(",") if r)
    roles -= {"public", "PUBLIC", "postgres"}

    stats = {}
    restored, fingerprints = {}, {}
    started_docker = start_docker()
    try:
        remove_leftovers()
        with Throwaway() as pg:
            # Supabase stand-ins.
            setup = [
                "create schema if not exists auth; create schema if not exists extensions;",
                "create schema if not exists restore_meta;",
                'create extension if not exists "uuid-ossp" with schema extensions;',
                "create extension if not exists pgcrypto with schema extensions;",
                "create extension if not exists moddatetime with schema extensions;",
                f"alter database {DB} set search_path = public, extensions;",
            ]
            for r in sorted(roles):
                setup.append(f"do $r$ begin create role {ident(r)} nologin; "
                             f"exception when duplicate_object then null; end $r$;")
            setup += [
                "create or replace function auth.uid() returns uuid language sql stable as "
                "$f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;",
                "create or replace function auth.role() returns text language sql stable as "
                "$f$ select nullif(current_setting('request.jwt.claim.role', true), '')::text $f$;",
                "create or replace function auth.email() returns text language sql stable as "
                "$f$ select nullif(current_setting('request.jwt.claim.email', true), '')::text $f$;",
                "create or replace function auth.jwt() returns jsonb language sql stable as "
                "$f$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;",
            ]
            pg.psql("\n".join(setup))

            # 1. tables (no defaults yet: a default naming a missing function
            #    must not stop the rows from loading)
            creates = []
            for t in tables:
                schema_name, table = t.split(".")
                cols = sorted(cols_by_table[t], key=lambda c: c.get("ordinal_position") or 0)
                body = ", ".join(f"{ident(c['column_name'])} {column_type(c)}"
                                 + (" not null" if c["is_nullable"] == "NO" else "") for c in cols)
                creates.append((t, f"create table {ident(schema_name)}.{ident(table)} ({body})"))
            failed = pg.run_each("tables", creates)
            problems += [f"table {x}" for x in failed]
            stats["tables"] = len(creates) - len(failed)

            # 2. rows, each table in one INSERT
            for t in tables:
                if t not in data or any(x.startswith(t + ":") for x in failed):
                    continue
                schema_name, table = t.split(".")
                qt = f"{ident(schema_name)}.{ident(table)}"
                tag = "j" + secrets.token_hex(8)
                if tag in data[t][0]:
                    raise RuntimeError("dollar-quote collision")
                try:
                    pg.psql(f"insert into {qt} select * from json_populate_recordset(null::{qt}, "
                            f"${tag}${data[t][0]}${tag}$::json);", single_transaction=True)
                except Exception as e:
                    problems.append(f"{t}: rows not loaded: {e}")

            # 3. keys and links (a row that breaks one is a failure), then indexes
            order = {"p": 0, "u": 1, "c": 2, "x": 3, "f": 4}
            cons = sorted((c for c in schema["constraints"] if c["schema"] == "public"),
                          key=lambda c: (order.get(c["type"], 5), c["table"], c["name"]))
            items = [(f"{c['table']}.{c['name']}",
                      f"alter table public.{ident(c['table'])} add constraint {ident(c['name'])} {c['def']}")
                     for c in cons]
            auth_cols = {t: {c["column_name"] for c in cols_by_table.get(t, [])} for t in ("auth.users", "auth.identities")}
            if "id" in auth_cols["auth.users"]:
                items.insert(0, ("auth.users.users_pkey", "alter table auth.users add primary key (id)"))
            if "id" in auth_cols["auth.identities"]:
                items.insert(1, ("auth.identities.identities_pkey", "alter table auth.identities add primary key (id)"))
                if "user_id" in auth_cols["auth.identities"]:
                    items.append(("auth.identities.identities_user_id_fkey",
                                  "alter table auth.identities add foreign key (user_id) "
                                  "references auth.users(id) on delete cascade"))
            failed = pg.run_each("constraints", items)
            problems += [f"constraint {x}" for x in failed]
            stats["constraints"] = len(items) - len(failed)

            idx = [(i["name"], i["def"]) for i in schema["indexes"] if i["name"] not in constraint_names]
            failed = pg.run_each("indexes", idx)
            problems += [f"index {x}" for x in failed]
            stats["indexes"] = len(idx) - len(failed)

            # 4. the rules: defaults, functions, triggers, RLS, policies, grants
            defaults, seqs = [], set()
            for t in tables:
                for c in cols_by_table[t]:
                    d = c.get("column_default")
                    if d:
                        seqs.update(re.findall(r"nextval\('([A-Za-z0-9_.\"]+)'::regclass\)", d))
                        s, tb = t.split(".")
                        defaults.append((f"{t}.{c['column_name']}",
                                         f"alter table {ident(s)}.{ident(tb)} alter column "
                                         f"{ident(c['column_name'])} set default {d}"))
            rules = {"defaults": [(f"sequence {s}", f"create sequence if not exists {s}") for s in sorted(seqs)] + defaults}
            rules["functions"] = [(f["name"], f["def"]) for f in schema["functions"]]
            rules["triggers"] = [(f"{t['table']}.{t['name']}", t["def"]) for t in schema["triggers"]]
            if "rls" in schema:
                rules["rls"] = [
                    (r["table"], f"alter table public.{ident(r['table'])} enable row level security"
                     + (f"; alter table public.{ident(r['table'])} force row level security" if r["forced"] else ""))
                    for r in schema["rls"] if r["enabled"]]
            else:
                warnings.append("this copy does not record which tables have row-level security on "
                                "(made before 2026-11-18)")
            pols = []
            for p in schema["policies"]:
                if p["schema"] != "public":
                    continue
                to = ", ".join("public" if r == "public" else ident(r.strip('"'))
                               for r in p["roles"].strip("{}").split(","))
                sql = (f"create policy {ident(p['name'])} on public.{ident(p['table'])} as {p['permissive']} "
                       f"for {p['cmd']} to {to}"
                       + (f" using ({p['qual']})" if p["qual"] else "")
                       + (f" with check ({p['with_check']})" if p["with_check"] else ""))
                pols.append((f"{p['table']}.{p['name']}", sql))
            rules["policies"] = pols
            rules["grants"] = [(f"{g['table']} to {g['grantee']}",
                                f"grant {g['privs'].replace(',', ', ')} on public.{ident(g['table'])} to "
                                + ("public" if g["grantee"].lower() == "public" else ident(g["grantee"])))
                               for g in schema["grants"]]
            for kind, items in rules.items():
                failed = pg.run_each(kind, items)
                warnings += [f"{kind}: {x}" for x in failed]
                stats[kind] = len(items) - len(failed)
            stats["storage policies skipped"] = sum(1 for p in schema["policies"] if p["schema"] != "public")

            # 5. what actually landed
            union = " union all ".join(
                f"select {lit(t)}, count(*) from {ident(t.split('.')[0])}.{ident(t.split('.')[1])}"
                for t in tables)
            for line in pg.psql(union + ";").splitlines():
                t, n = line.rsplit("|", 1)
                restored[t] = int(n)
            if "email" in auth_cols["auth.users"] and "encrypted_password" in auth_cols["auth.users"]:
                for line in pg.psql("select id::text, md5(coalesce(email::text, '') || '|' || "
                                    "coalesce(encrypted_password::text, '')) from auth.users;").splitlines():
                    i, f = line.split("|")
                    fingerprints[i] = f
        removed = getattr(pg, "removed", False)
    finally:
        if started_docker:
            subprocess.run(["/usr/bin/osascript", "-e", 'quit app "Docker"'], capture_output=True, timeout=60)
            print("quit Docker Desktop again (it was not running before)")

    if not removed:
        problems.append("the throwaway database container could not be removed")
    for t in tables:
        if t in data and restored.get(t) != data[t][1]:
            problems.append(f"{t}: archive holds {data[t][1]} rows, {restored.get(t, 0)} restored")
    return tables, data, restored, fingerprints, stats, problems, warnings


def compare_live(tables, restored, fingerprints, problems, warnings):
    """Counts and sign-ins against the live database. Returns {table: live count}."""
    try:
        pat = b.management_token()
        live_tables = [r["t"] for r in b.mgmt_query(pat, """
            select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' order by 1""")]
        counts = b.live_counts(pat, [(t, "") for t in live_tables])
        live_fp = {r["id"]: r["f"] for r in b.mgmt_query(pat, """
            select id::text as id, md5(coalesce(email::text, '') || '|' ||
                   coalesce(encrypted_password::text, '')) as f from auth.users""")}
    except Exception as e:
        warnings.append(f"not compared with the live database: {e}")
        return {}
    live = {f"public.{t}": n for t, n in counts.items() if not t.startswith("auth.")}
    live.update({t: n for t, n in counts.items() if t.startswith("auth.")})
    for t in sorted(set(live) - set(tables)):
        problems.append(f"{t}: in the live database but not in the copy")
    for t in sorted(set(tables) - set(live)):
        warnings.append(f"{t}: in the copy but no longer in the live database")
    for t in tables:
        if t in live and t in restored and abs(restored[t] - live[t]) > tolerance(live[t]):
            problems.append(f"{t}: {restored[t]} rows restored, {live[t]} live")
    if fingerprints:
        same = sum(1 for i, f in fingerprints.items() if live_fp.get(i) == f)
        differ = len(fingerprints) - same
        if differ > tolerance(len(live_fp)):
            problems.append(f"sign-ins: only {same} of {len(fingerprints)} match the live email and password")
        elif differ:
            warnings.append(f"sign-ins: {differ} changed or removed since the copy (a new password or email)")
        live["sign-ins identical"] = same
    return live


def main():
    started = datetime.datetime.now()
    args = sys.argv[1:]
    if "--archive" in args:
        archive = pathlib.Path(args[args.index("--archive") + 1]).expanduser().resolve()
    else:
        wait_for_running_backup()
        archive = newest_archive()
    made = next((when for path, when, _ in b.restore_points(archive.parent) if path.name == archive.name), None)
    age_h = (started - made).total_seconds() / 3600 if made else None
    print(f"restore test of {archive.name}" + (f" ({age_h:.1f} h old)" if age_h is not None else ""))

    tables, data, restored, fingerprints, stats, problems, warnings = restore_and_check(archive)
    if age_h is not None and age_h > STALE_HOURS:
        warnings.insert(0, f"the newest copy is {age_h / 24:.1f} days old: the nightly backup has not been running")
    live = compare_live(tables, restored, fingerprints, problems, warnings)

    secs = (datetime.datetime.now() - started).total_seconds()
    public = [t for t in tables if t.startswith("public.")]
    rows = sum(restored.get(t, 0) for t in public)
    users, idents = restored.get("auth.users", 0), restored.get("auth.identities", 0)
    for line in problems:
        print(f"PROBLEM {line}")
    for line in warnings:
        print(f"warning {line}")

    width = max(len(t) for t in tables)
    table_lines = [f"{'table'.ljust(width)}   copy  restored    live"] + [
        f"{t.ljust(width)} {data.get(t, ('', 0))[1]:6} {restored.get(t, 0):9} "
        f"{str(live[t]) if t in live else '-':>7}" + ("  <-" if any(p.startswith(t + ":") for p in problems) else "")
        for t in tables]
    s = lambda k: stats.get(k, 0)  # noqa: E731
    rules = (f"{s('constraints')} keys and links, {s('indexes')} indexes, {s('defaults')} defaults, "
             f"{s('functions')} functions, {s('triggers')} triggers, row-level security on {s('rls')} tables, "
             f"{s('policies')} policies, {s('grants')} grants")
    summary = [
        f"Copy:      {archive.name}" + (f", made {age_h:.1f} hours before the test" if age_h is not None else ""),
        f"Restored:  {len(public)} tables, {rows:,} rows, {users} sign-ins ({idents} identities), "
        f"every row INSERTed into a throwaway Postgres",
        f"Rebuilt:   {rules}",
        "Live:      " + (f"every table and sign-in matches the live database"
                         f" ({live.get('sign-ins identical', 0)} of {users} sign-ins identical)"
                         if live and not problems else "compared, see below" if live else "not compared"),
        f"Cleanup:   the throwaway database was deleted",
        f"Took:      {secs:.0f}s on {socket.gethostname()}",
    ]
    body = "\n".join(
        ([f"FAILED: {len(problems)} problem(s):"] + [f"  - {p}" for p in problems] + [""] if problems else [])
        + summary
        + ([""] + ["Warnings:"] + [f"  - {w}" for w in warnings] if warnings else [])
        + ["", "Per table (rows in the copy / restored / live now):"] + table_lines
        + ["", f"Log: {LOG}",
           "Runs on the 1st of each month at 04:30 (launchd com.musicalbasics.studio-restore-test)."])
    if problems:
        subject = f"Studio restore test FAILED: {problems[0][:70]}"
    else:
        subject = (f"Studio restore test OK: {len(public)} tables, {rows:,} rows, {users} sign-ins"
                   + (f" ({len(warnings)} warning{'s' * (len(warnings) != 1)})" if warnings else ""))
    print(f"restore test {'FAILED' if problems else 'ok'}: {len(public)} tables, {rows} rows, "
          f"{users} sign-ins, {secs:.0f}s")
    print(f"--- email ---\n{subject}\n\n{body}\n---")
    b.alert(subject, body)
    return 1 if problems else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:
        traceback.print_exc()
        msg = f"{type(e).__name__}: {e}"
        b.alert(f"Studio restore test FAILED: {msg[:70]}", "\n".join([
            f"The monthly restore test could not finish: {msg}", "",
            "The throwaway database was removed (or never started). The backups themselves are untouched.",
            f"Host: {socket.gethostname()}",
            f"When: {datetime.datetime.now().isoformat(timespec='seconds')}",
            b.newest_backup_line(), "",
            f"Log: {LOG}",
        ]))
        sys.exit(1)
