#!/usr/bin/env python3
"""Bring the studio back from a nightly copy (Lionel's #773). The steps, in
plain words, are in docs/restore-studio.md; this does the typing for them.

    python3 scripts/restore_studio_db.py list
        The copies on this Mac, newest first.
    python3 scripts/restore_studio_db.py database --to NEW_REF [--archive FILE]
        Loads the newest complete copy (or FILE) into an EMPTY Supabase project:
        tables, rows, sign-ins (with password hashes, so passwords keep
        working), keys, indexes, functions, triggers, row security, policies
        (Storage's too), grants and the realtime list. Links to stored files
        are rewritten from the old project's address to the new one.
    SUPABASE_SERVICE_KEY=... python3 scripts/restore_studio_db.py storage --to NEW_REF [--from DIR]
        Makes the Storage buckets and uploads every file from the Mac's mirror
        (~/Backups/piano-studio/storage) or from a downloaded Dropbox copy.
    python3 scripts/restore_studio_db.py check --to NEW_REF [--archive FILE]
        Counts every table and the sign-ins against the copy.

SQL goes over the Supabase Management API (HTTPS), because this network
blocks the database ports. The token is SUPABASE_PAT, else the Supabase CLI's
login in the Keychain (run `npx supabase login` once on a new Mac).

For a practice run, --docker CONTAINER (with --db-user/PGPASSWORD) loads into a
local Postgres container instead, and --new-url / --storage-url point the file
links and uploads at a local stand-in. Nothing here ever writes to the live
project: --to with the live project's ref is refused unless --same-project
is given, and even then only into a database with no tables left.
"""
import argparse
import datetime
import json
import mimetypes
import os
import pathlib
import re
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import backup_studio_db as b  # noqa: E402
import restore_test_studio_db as rt  # noqa: E402

OLD_REF = b.PROJECT_REF
OLD_ORIGIN = f"https://{OLD_REF}.supabase.co"
# Tables whose changes Supabase Realtime sends to the apps (live on 2026-11-18).
# The copy does not record this list, so it is kept here.
REALTIME_TABLES = ("classroom_annotations", "crm_students")
CHUNK_BYTES = 1_500_000  # rows per request stay well under the API's body limit
URL_RE = re.compile(r"/storage/v1/object/(?:public|sign|authenticated)/([^/?\"\\\s]+)/([^?\"\\\s]+)")


def die(msg):
    print(f"STOPPED: {msg}", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------- targets ---

class ApiTarget:
    """A Supabase project, over the Management API."""

    def __init__(self, ref):
        self.ref = ref
        self.label = f"Supabase project {ref}"
        self.calls = 0
        self.token = None
        for get in (lambda: (os.environ.get("SUPABASE_PAT") or "").strip(), b.keychain_token):
            token = get()
            if not token:
                continue
            try:
                self._post(token, "select 1 as ok")
                self.token = token
                break
            except Exception as e:
                print(f"(a token was refused: {str(e)[:80]})")
        if not self.token:
            die("no Management API token works for this project. Run `npx supabase login` "
                "(or set SUPABASE_PAT to a token from supabase.com/dashboard/account/tokens).")

    def _post(self, token, sql):
        self.calls += 1
        res = subprocess.run(
            ["curl", "-s", "-w", "\n%{http_code}", "-X", "POST",
             f"https://api.supabase.com/v1/projects/{self.ref}/database/query",
             "-H", f"Authorization: Bearer {token}", "-H", "Content-Type: application/json",
             "--data-binary", "@-"],
            input=json.dumps({"query": sql}), capture_output=True, text=True, timeout=600)
        body, _, code = res.stdout.rpartition("\n")
        if not code.startswith("2"):
            raise RuntimeError(f"HTTP {code}: {body[:400]}")
        return json.loads(body) if body.strip() else []

    def exec(self, sql):
        self._post(self.token, sql)

    def rows(self, sql):
        return self._post(self.token, sql)


class DockerTarget:
    """A Postgres in a local container (practice runs)."""

    def __init__(self, container, user):
        self.container, self.user = container, user
        self.label = f"container {container} as {user}"
        self.calls = 0

    def _psql(self, sql):
        self.calls += 1
        env = ["-e", f"PGPASSWORD={os.environ['PGPASSWORD']}"] if os.environ.get("PGPASSWORD") else []
        res = subprocess.run(
            [rt.DOCKER, "exec", "-i", *env, self.container, "psql", "-h", "127.0.0.1", "-U", self.user,
             "-d", "postgres", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-f", "-"],
            input="set client_min_messages = warning;\n" + sql, capture_output=True, text=True, timeout=900)
        if res.returncode != 0:
            raise RuntimeError(re.sub(r"^psql:<stdin>:\d+: ", "", res.stderr.strip(), flags=re.M)[:400])
        return res.stdout

    def exec(self, sql):
        self._psql(sql)

    def rows(self, sql):
        # json_agg puts line breaks between rows; JSON strings never hold a raw one.
        return json.loads(self._psql(f"select coalesce(json_agg(q), '[]'::json) from ({sql.rstrip().rstrip(';')}) q;"))


def make_target(args):
    if args.docker:
        return DockerTarget(args.docker, args.db_user)
    if not args.to:
        die("say where to: --to NEW_PROJECT_REF (or --docker CONTAINER for a practice run)")
    if not re.fullmatch(r"[a-z0-9]{20}", args.to):
        die(f"{args.to!r} does not look like a project ref (20 letters and digits, from the project's URL)")
    if args.to == OLD_REF and not getattr(args, "same_project", False):
        die("that is the live project's ref. To restore into the same project after its data was lost, "
            "add --same-project (it still refuses if any table is left).")
    return ApiTarget(args.to)


def run_each(target, kind, items):
    """Each (name, sql) in its own subtransaction; returns ["name: error", ...]."""
    if not items:
        return []
    tag = "s" + secrets.token_hex(6)
    parts = ["create table if not exists restore_meta.problems (kind text, name text, err text);",
             f"delete from restore_meta.problems where kind = {rt.lit(kind)};"]
    for name, sql in items:
        if tag in sql:
            raise RuntimeError("dollar-quote collision")
        parts.append(
            f"do $do_{tag}$ begin execute ${tag}${sql}${tag}$; "
            f"exception when others then insert into restore_meta.problems values "
            f"({rt.lit(kind)}, {rt.lit(name)}, sqlerrm); end $do_{tag}$;")
    for i in range(0, len(parts), 200):
        target.exec("\n".join(parts[i:i + 200]))
    return [f"{r['name']}: {r['err']}" for r in target.rows(
        f"select name, err from restore_meta.problems where kind = {rt.lit(kind)} order by name")]


# ---------------------------------------------------------------- archive ---

def pick_archive(path):
    if path:
        p = pathlib.Path(path).expanduser().resolve()
        if not p.exists():
            die(f"no such file: {p}")
        if p.name.endswith("-PARTIAL.tar.gz"):
            die(f"{p.name} is a PARTIAL copy (no sign-ins or schema). Pick one without -PARTIAL.")
        return p
    return rt.newest_archive()


def load_archive(path):
    files = rt.read_archive(path)
    if "schema.json" not in files:
        die(f"{path.name} has no schema.json, so it cannot be restored. Pick another copy.")
    schema = json.loads(files["schema.json"])
    manifest = json.loads(files[b.MANIFEST]) if b.MANIFEST in files else {}
    data = {}
    for name, raw in files.items():
        m = rt.MEMBER_RE.fullmatch(name)
        if m:
            data[f"{m[1]}.{m[2]}"] = raw.decode("utf-8")
    return schema, manifest, data


def chunks(rows_json):
    """Splits a JSON array of rows into pieces of about CHUNK_BYTES."""
    rows = json.loads(rows_json)
    piece, size = [], 0
    for r in rows:
        text = json.dumps(r, ensure_ascii=False)
        if piece and size + len(text) > CHUNK_BYTES:
            yield "[" + ",".join(piece) + "]"
            piece, size = [], 0
        piece.append(text)
        size += len(text)
    if piece:
        yield "[" + ",".join(piece) + "]"


def quoted(text):
    tag = "j" + secrets.token_hex(8)
    if tag in text:
        raise RuntimeError("dollar-quote collision")
    return f"${tag}${text}${tag}$"


# ------------------------------------------------------------------- list ---

def cmd_list(args):
    points = sorted(b.restore_points(b.BACKUP_ROOT), key=lambda p: p[1], reverse=True)
    if not points:
        die(f"no copies in {b.BACKUP_ROOT}. Download the newest from Dropbox (/Studio Backups) "
            f"and pass it with --archive.")
    print(f"Copies in {b.BACKUP_ROOT} (newest first; use one without PARTIAL):")
    for path, when, complete in points:
        size = path.stat().st_size / 1e6
        print(f"  {path.name:45} {when:%a %b %d %H:%M}  {size:5.1f} MB  {'complete' if complete else 'PARTIAL'}")
    newest = next((p for p, _, ok in points if ok), None)
    if newest:
        _, manifest, _ = load_archive(newest)
        rows = manifest.get("rows", {})
        print(f"\nNewest complete: {newest.name}: {len([k for k in rows if k.startswith('public.')])} tables, "
              f"{sum(v for k, v in rows.items() if k.startswith('public.')):,} rows, "
              f"{rows.get('auth.users.json', '?')} sign-ins")


# --------------------------------------------------------------- database ---

def cmd_database(args):
    started = time.time()
    archive = pick_archive(args.archive)
    schema, manifest, data = load_archive(archive)
    target = make_target(args)
    new_origin = (args.new_url or (f"https://{args.to}.supabase.co" if args.to else "")).rstrip("/")
    print(f"Loading {archive.name} into {target.label}")

    left = target.rows("select count(*)::int as n from pg_tables where schemaname = 'public'")[0]["n"]
    if left:
        die(f"the target already has {left} table(s) in its public schema. This loads into an EMPTY "
            f"database only (a new project, or one whose data is gone).")

    cols_by_table = {}
    for c in schema["columns"]:
        if c["table_schema"] in ("public", "auth"):
            cols_by_table.setdefault(f"{c['table_schema']}.{c['table_name']}", []).append(c)
    public_tables = sorted(t for t in cols_by_table if t.startswith("public."))
    problems, warnings, timings = [], [], []

    def step(name, t0):
        timings.append((name, time.time() - t0))
        print(f"  {name}: {time.time() - t0:.0f}s")

    # 1. What a fresh Supabase project already has; created only where missing.
    t0 = time.time()
    roles = set(rt.SUPABASE_ROLES)
    for g in schema["grants"]:
        roles.add(g["grantee"])
    for p in schema["policies"]:
        roles.update(r.strip('"') for r in p["roles"].strip("{}").split(",") if r)
    roles -= {"public", "PUBLIC", "postgres"}
    setup = ["create schema if not exists restore_meta;",
             "create schema if not exists auth;", "create schema if not exists extensions;"]
    for ext in ("uuid-ossp", "pgcrypto", "moddatetime"):
        setup.append(f'create extension if not exists "{ext}" with schema extensions;')
    for r in sorted(roles):
        setup.append(f"do $r$ begin if not exists (select 1 from pg_roles where rolname = {rt.lit(r)}) "
                     f"then create role {rt.ident(r)} nologin; end if; end $r$;")
    stand_ins = {
        "uid": "uuid", "role": "text", "email": "text", "jwt": "jsonb",
    }
    for fn, ret in stand_ins.items():
        claim = {"uid": "request.jwt.claim.sub", "role": "request.jwt.claim.role",
                 "email": "request.jwt.claim.email"}.get(fn)
        body = (f"select nullif(current_setting('{claim}', true), '')::{ret}" if claim else
                "select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb")
        setup.append(f"do $f$ begin if to_regprocedure('auth.{fn}()') is null then execute "
                     f"{rt.lit(f'create function auth.{fn}() returns {ret} language sql stable as $b$ {body} $b$')}; "
                     f"end if; end $f$;")
    target.exec("\n".join(setup))
    step("prepare", t0)

    # 2. Tables. auth.users/identities exist in every Supabase project; they are
    #    only made here for a bare Postgres.
    t0 = time.time()
    creates = []
    for t in public_tables:
        cols = sorted(cols_by_table[t], key=lambda c: c.get("ordinal_position") or 0)
        body = ", ".join(f"{rt.ident(c['column_name'])} {rt.column_type(c)}"
                         + (" not null" if c["is_nullable"] == "NO" else "") for c in cols)
        creates.append((t, f"create table public.{rt.ident(t.split('.')[1])} ({body})"))
    have_auth = {r["t"] for r in target.rows(
        "select table_name as t from information_schema.tables where table_schema = 'auth' "
        "and table_name in ('users', 'identities')")}
    for t in ("auth.users", "auth.identities"):
        name = t.split(".")[1]
        if name not in have_auth and t in cols_by_table:
            cols = sorted(cols_by_table[t], key=lambda c: c.get("ordinal_position") or 0)
            body = ", ".join(f"{rt.ident(c['column_name'])} {rt.column_type(c)}" for c in cols)
            creates.append((t, f"create table auth.{rt.ident(name)} ({body})"))
    failed = run_each(target, "tables", creates)
    problems += [f"table {x}" for x in failed]
    step(f"tables ({len(creates) - len(failed)})", t0)

    # 3. Rows. File links move to the new project's address.
    t0 = time.time()
    rewritten = 0
    for t in public_tables:
        text = data.get(t)
        if text is None:
            problems.append(f"{t}: no rows file in the copy")
            continue
        if new_origin and new_origin != OLD_ORIGIN:
            rewritten += text.count(OLD_ORIGIN)
            text = text.replace(OLD_ORIGIN, new_origin)
        qt = f"public.{rt.ident(t.split('.')[1])}"
        try:
            for piece in chunks(text):
                target.exec(f"insert into {qt} select * from json_populate_recordset(null::{qt}, {quoted(piece)}::json);")
        except Exception as e:
            problems.append(f"{t}: rows not loaded: {e}")
    # Sign-ins: only the columns this project's auth tables take (Supabase
    # computes some, like confirmed_at, itself).
    for t in ("auth.users", "auth.identities"):
        if t not in data:
            problems.append(f"{t}: missing from the copy")
            continue
        name = t.split(".")[1]
        keys = sorted({k for r in json.loads(data[t]) for k in r})
        cols = [r["c"] for r in target.rows(
            f"select column_name as c from information_schema.columns where table_schema = 'auth' "
            f"and table_name = {rt.lit(name)} and is_generated = 'NEVER' "
            f"and column_name in ({', '.join(rt.lit(k) for k in keys)}) order by ordinal_position")]
        skipped = sorted(set(keys) - set(cols))
        if skipped:
            warnings.append(f"{t}: left to Supabase: {', '.join(skipped)}")
        collist = ", ".join(rt.ident(c) for c in cols)
        try:
            # An account that is still there (same-project restore) is left as it is.
            target.exec(f"insert into auth.{rt.ident(name)} ({collist}) select {collist} from "
                        f"json_populate_recordset(null::auth.{rt.ident(name)}, {quoted(data[t])}::json) "
                        f"on conflict do nothing;")
        except Exception as e:
            problems.append(f"{t}: sign-ins not loaded: {e}")
    step(f"rows ({rewritten} file links moved to {new_origin or 'the same address'})", t0)

    # 4. Keys, links and indexes (a row that breaks one is a problem).
    t0 = time.time()
    order = {"p": 0, "u": 1, "c": 2, "x": 3, "f": 4}
    cons = sorted((c for c in schema["constraints"] if c["schema"] == "public"),
                  key=lambda c: (order.get(c["type"], 5), c["table"], c["name"]))
    items = [("auth.users primary key",
              "do $k$ begin if not exists (select 1 from pg_constraint where conrelid = 'auth.users'::regclass "
              "and contype = 'p') then alter table auth.users add primary key (id); end if; end $k$"),
             ("auth.identities primary key",
              "do $k$ begin if not exists (select 1 from pg_constraint where conrelid = 'auth.identities'::regclass "
              "and contype = 'p') then alter table auth.identities add primary key (id); end if; end $k$")]
    items += [(f"{c['table']}.{c['name']}",
               f"alter table public.{rt.ident(c['table'])} add constraint {rt.ident(c['name'])} {c['def']}")
              for c in cons]
    failed = run_each(target, "constraints", items)
    problems += [f"constraint {x}" for x in failed]
    constraint_names = {c["name"] for c in schema["constraints"]}
    idx = [(i["name"], i["def"]) for i in schema["indexes"] if i["name"] not in constraint_names]
    failed_idx = run_each(target, "indexes", idx)
    problems += [f"index {x}" for x in failed_idx]
    step(f"keys ({len(items) - len(failed)}) and indexes ({len(idx) - len(failed_idx)})", t0)

    # 5. The rules: defaults, functions, triggers, row security, policies, grants, realtime.
    t0 = time.time()
    defaults, seqs = [], {}
    for t in public_tables:
        for c in cols_by_table[t]:
            d = c.get("column_default")
            if d:
                for s in re.findall(r"nextval\('([A-Za-z0-9_.\"]+)'::regclass\)", d):
                    seqs[s] = (t, c["column_name"])
                defaults.append((f"{t}.{c['column_name']}",
                                 f"alter table public.{rt.ident(t.split('.')[1])} alter column "
                                 f"{rt.ident(c['column_name'])} set default {d}"))
    has_storage = target.rows("select to_regclass('storage.objects') is not null as ok")[0]["ok"]
    has_realtime = target.rows("select exists (select 1 from pg_publication where pubname = 'supabase_realtime') as ok")[0]["ok"]
    rules = {
        "defaults": [(f"sequence {s}", f"create sequence if not exists {s}") for s in sorted(seqs)] + defaults
        + [(f"sequence {s} past the rows",
            f"select setval({rt.lit(s)}, coalesce((select max({rt.ident(col)}) "
            f"from public.{rt.ident(t.split('.')[1])}), 0) + 1, false)")
           for s, (t, col) in sorted(seqs.items())],
        "functions": [(f["name"], f["def"]) for f in schema["functions"]],
        "triggers": [(f"{t['table']}.{t['name']}", t["def"]) for t in schema["triggers"]],
        # On or off exactly as live, in case a new project switches it on by itself.
        "rls": [(r["table"], f"alter table public.{rt.ident(r['table'])} "
                 + ("enable" if r["enabled"] else "disable") + " row level security"
                 + (f"; alter table public.{rt.ident(r['table'])} force row level security" if r["forced"] else ""))
                for r in schema.get("rls", [])],
    }
    pols = []
    for p in schema["policies"]:
        if p["schema"] not in ("public", "storage") or (p["schema"] == "storage" and not has_storage):
            continue
        to = ", ".join("public" if r == "public" else rt.ident(r.strip('"')) for r in p["roles"].strip("{}").split(","))
        pols.append((f"{p['schema']}.{p['table']}.{p['name']}",
                     f"create policy {rt.ident(p['name'])} on {p['schema']}.{rt.ident(p['table'])} as {p['permissive']} "
                     f"for {p['cmd']} to {to}"
                     + (f" using ({p['qual']})" if p["qual"] else "")
                     + (f" with check ({p['with_check']})" if p["with_check"] else "")))
    if not has_storage:
        warnings.append("no Storage in this database, so Storage's policies were skipped")
    rules["policies"] = pols
    # Exactly the live grants: drop what a new project hands out by default first.
    rules["grants"] = [("reset", "revoke all on all tables in schema public from anon, authenticated, service_role")] + [
        (f"{g['table']} to {g['grantee']}",
         f"grant {g['privs'].replace(',', ', ')} on public.{rt.ident(g['table'])} to "
         + ("public" if g["grantee"].lower() == "public" else rt.ident(g["grantee"])))
        for g in schema["grants"]]
    rules["realtime"] = [(t, f"alter publication supabase_realtime add table public.{rt.ident(t)}")
                         for t in REALTIME_TABLES] if has_realtime else []
    if not has_realtime:
        warnings.append("no supabase_realtime publication here, so the realtime list was skipped")
    stats = {}
    for kind, items in rules.items():
        failed = run_each(target, kind, items)
        (problems if kind in ("functions", "triggers", "rls", "policies", "grants") else warnings).extend(
            f"{kind}: {x}" for x in failed)
        stats[kind] = len(items) - len(failed)
    step("rules (" + ", ".join(f"{v} {k}" for k, v in stats.items()) + ")", t0)

    # 6. Count what landed.
    t0 = time.time()
    counts = count_tables(target, public_tables + ["auth.users", "auth.identities"])
    expected = {k[:-len(".json")]: v for k, v in manifest.get("rows", {}).items()}
    for t, n in expected.items():
        if counts.get(t) != n:
            problems.append(f"{t}: the copy holds {n} rows, {counts.get(t, 0)} loaded")
    target.exec("drop schema if exists restore_meta cascade;")
    step("count", t0)
    print(f"  ({target.calls} requests to the database)")

    print_summary(problems, warnings, counts, expected, started)
    return 1 if problems else 0


def count_tables(target, tables):
    union = " union all ".join(
        f"select {rt.lit(t)} as t, count(*)::int as n from {rt.ident(t.split('.')[0])}.{rt.ident(t.split('.')[1])}"
        for t in tables)
    return {r["t"]: r["n"] for r in target.rows(union)}


def print_summary(problems, warnings, counts, expected, started):
    rows = sum(n for t, n in counts.items() if t.startswith("public."))
    print(f"\n{len([t for t in counts if t.startswith('public.')])} tables, {rows:,} rows, "
          f"{counts.get('auth.users', 0)} sign-ins ({counts.get('auth.identities', 0)} identities) "
          f"in {time.time() - started:.0f}s")
    for w in warnings:
        print(f"note: {w}")
    if problems:
        print(f"\n{len(problems)} PROBLEM(S):")
        for p in problems:
            print(f"  - {p}")
    else:
        matched = sum(1 for t, n in expected.items() if counts.get(t) == n)
        print(f"OK: all {matched} tables match the copy's own counts.")


# ---------------------------------------------------------------- storage ---

def storage_request(method, url, key, body=None, content_type="application/json", upsert=False):
    headers = {"Authorization": f"Bearer {key}", "apikey": key, "Content-Type": content_type}
    if upsert:
        headers["x-upsert"] = "true"
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=600) as res:
            return res.status, res.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def cmd_storage(args):
    started = time.time()
    key = (os.environ.get("SUPABASE_SERVICE_KEY") or "").strip()
    if not key:
        die("set SUPABASE_SERVICE_KEY to the NEW project's service_role key first")
    if not args.to and not args.storage_url:
        die("say where to: --to NEW_PROJECT_REF")
    if args.to == OLD_REF and not args.same_project:
        die("that is the live project's ref. Add --same-project only if its files are gone too.")
    base = (args.storage_url or f"https://{args.to}.supabase.co/storage/v1").rstrip("/")
    archive = pick_archive(args.archive)
    schema, _, data = load_archive(archive)
    src = pathlib.Path(args.source).expanduser() if args.source else b.STORAGE_ROOT
    if not src.is_dir():
        die(f"no folder {src}")

    for bk in schema.get("buckets", []):
        spec = {k: bk.get(k) for k in ("id", "name", "public", "file_size_limit", "allowed_mime_types")}
        code, body = storage_request("POST", f"{base}/bucket", key, json.dumps(spec).encode())
        if code >= 300 and b"already exists" in body.lower() or code == 409:
            code, body = storage_request("PUT", f"{base}/bucket/{urllib.parse.quote(bk['id'])}", key, json.dumps(
                {k: spec[k] for k in ("public", "file_size_limit", "allowed_mime_types")}).encode())
        if code >= 300:
            die(f"bucket {bk['id']}: HTTP {code} {body[:200]!r}")
        print(f"  bucket {bk['id']} ({'public' if bk.get('public') else 'private'}) ready")

    # Which file is which: the Mac mirror keeps real names in .manifest.json.
    # A Dropbox copy changed names ending in a space or dot ('sheet_music '
    # became 'sheet_music_'); the links in the copy's rows give the real ones.
    manifest_path = src / ".manifest.json"
    if manifest_path.exists():
        pairs = [(src / k, k) for k in sorted(json.loads(manifest_path.read_text()))]
    else:
        real = {}
        for text in data.values():
            for m in URL_RE.finditer(text):
                k = f"{urllib.parse.unquote(m[1])}/{urllib.parse.unquote(m[2])}"
                real[b.dropbox_safe(k)] = k
        pairs = [(p, real.get(str(p.relative_to(src)), str(p.relative_to(src))))
                 for p in sorted(src.rglob("*")) if p.is_file() and not p.name.startswith(".")]
    sent = nbytes = 0
    failed = []
    for path, okey in pairs:
        if not path.exists():
            failed.append(f"{okey}: not in {src}")
            continue
        bucket, _, name = okey.partition("/")
        ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
        code, body = storage_request("POST", f"{base}/object/{urllib.parse.quote(bucket)}/{urllib.parse.quote(name)}",
                                     key, path.read_bytes(), ctype, upsert=True)
        if code >= 300:
            failed.append(f"{okey}: HTTP {code} {body[:120]!r}")
            continue
        sent += 1
        nbytes += path.stat().st_size
        if sent % 25 == 0:
            print(f"  {sent} files sent ({nbytes / 1e6:.0f} MB)")
    print(f"\n{sent} files ({nbytes / 1e6:.1f} MB) uploaded in {time.time() - started:.0f}s")
    if failed:
        print(f"{len(failed)} NOT uploaded:")
        for f in failed:
            print(f"  - {f}")
        return 1
    print("OK: every file is back.")
    return 0


# ------------------------------------------------------------------ check ---

def cmd_check(args):
    started = time.time()
    archive = pick_archive(args.archive)
    schema, manifest, data = load_archive(archive)
    target = make_target(args)
    tables = sorted({k[:-len(".json")] for k in manifest.get("rows", {})})
    counts = count_tables(target, tables)
    expected = {k[:-len(".json")]: v for k, v in manifest.get("rows", {}).items()}
    problems = [f"{t}: the copy holds {n} rows, the database has {counts.get(t, 0)}"
                for t, n in expected.items() if counts.get(t) != n]
    # Each sign-in's email and password hash, compared with the copy.
    want = {u["id"]: (u.get("email") or "", u.get("encrypted_password") or "") for u in json.loads(data["auth.users"])}
    have = {r["id"]: (r["email"] or "", r["pw"] or "") for r in target.rows(
        "select id::text as id, email::text as email, encrypted_password::text as pw from auth.users")}
    same = sum(1 for i, v in want.items() if have.get(i) == v)
    if same != len(want):
        problems.append(f"sign-ins: {same} of {len(want)} have the same email and password as the copy")
    print_summary(problems, [], counts, expected, started)
    print(f"Sign-ins: {same} of {len(want)} identical to the copy (email and password hash).")
    return 1 if problems else 0


def main():
    ap = argparse.ArgumentParser(description="Bring the studio back from a nightly copy (docs/restore-studio.md).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list", help="the copies on this Mac")
    for name in ("database", "storage", "check"):
        p = sub.add_parser(name)
        p.add_argument("--to", help="the new Supabase project's ref")
        p.add_argument("--archive", help="a copy to use (default: the newest complete one)")
        p.add_argument("--docker", help="practice run: a local Postgres container instead of --to")
        p.add_argument("--db-user", default="postgres", help="practice run: database user (PGPASSWORD for its password)")
        if name in ("database", "storage", "check"):
            p.add_argument("--same-project", action="store_true",
                           help="allow the live project's ref (database: only when it has no tables left)")
        if name == "database":
            p.add_argument("--new-url", help="practice run: the address file links should point to")
        if name == "storage":
            p.add_argument("--from", dest="source", help="the storage folder (default: the Mac's mirror)")
            p.add_argument("--storage-url", help="practice run: a local Storage server")
    args = ap.parse_args()
    print(f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S} restore_studio_db {args.cmd}")
    return {"list": cmd_list, "database": cmd_database, "storage": cmd_storage, "check": cmd_check}[args.cmd](args) or 0


if __name__ == "__main__":
    sys.exit(main())
