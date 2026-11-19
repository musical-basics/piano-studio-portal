# Bring the studio back from the nightly copy

**Use this when the studio's database is gone:** the Supabase project was deleted, cannot be resumed, or its tables were wiped. It goes from "the database is gone" to "families can log in again" with the copy the Mac makes every night at 3:30am. About 35 minutes, most of it clicking in Supabase and Vercel.

**Not for:** Supabase being down for everyone (check status.supabase.com and wait), or a few wrong rows (ask Claude to fix just those from the copy).

**You need:** this Mac (or any Mac with the portal's code from GitHub and Python 3), and your Supabase and Vercel logins. Type the commands in Terminal, in the portal's folder: `cd ~/Documents/"New Version"/piano-studio-prototype`

**What is lost:** anything after the copy was made (messages, logged lessons, bookings). Stripe, Zoom and Dropbox still have their side, so redo those by hand.

## Steps

**1. Pick the copy.**
```
python3 scripts/restore_studio_db.py list
```
It shows the copies on this Mac (`~/Backups/piano-studio`); the steps below use the newest complete one by themselves (never one marked PARTIAL).

No copies on the Mac? In Dropbox, folder `/Studio Backups`, download the newest `piano-studio-<date>-<time>.tar.gz` without PARTIAL, and the `storage` folder. Then add `--archive ~/Downloads/<that file>` to steps 3 and 7, and `--from ~/Downloads/storage` to step 4.

**2. Make an empty database (you).** supabase.com/dashboard, then **New project**:
- Organization: the studio's. Name: `piano-studio-2`. Database password: **Generate a password**, save it in Passwords. Region: **East US (North Virginia)**, the same as before. Plan: Free. Click **Create new project** and wait until it is ready (about 2 minutes).
- The new project's ref is the 20 letters and digits after `/project/` in the address bar. Below it is called NEW_REF.
- **Project Settings, API Keys** (the **Legacy API Keys** tab if there is one): copy the `anon` key and the `service_role` key.
- If Supabase says the free plan has no room, pause a project you do not need.
- *Same project, only the data is gone?* Skip this step and steps 5 and 6. Use the old ref as NEW_REF and add `--same-project` to steps 3 and 7 (and to step 4 only if the files are gone too).

**3. Load the database.** The first time on a Mac, run `npx supabase login` (it opens the browser). Then:
```
python3 scripts/restore_studio_db.py database --to NEW_REF
```
It ends with `OK: all 42 tables match the copy's own counts.` Sign-ins come back with their password hashes, so everyone's password still works. Links to stored files are moved to the new address. If it lists PROBLEMS, stop and send Claude the output. It only loads into an empty database, so a second try needs a fresh project.

**4. Bring back the files.**
```
SUPABASE_SERVICE_KEY='paste the service_role key' python3 scripts/restore_studio_db.py storage --to NEW_REF
```
It makes the 6 buckets (`studio_private` stays private) and uploads every file (138 files, 185 MB in Nov 2026). It ends with `OK: every file is back.` Safe to run again.

**5. Sign-in settings (you).** In the new project:
- **Authentication, URL Configuration:** Site URL `https://lessons.musicalbasics.com`. Redirect URLs: add `https://lessons.musicalbasics.com/**` and `http://localhost:3000/**`.
- **Authentication, Emails, SMTP Settings**, turn on custom SMTP: host `smtp.resend.com`, port `587`, username `resend`, password = the Resend API key (Vercel, the portal's `RESEND_API_KEY`), sender email = the studio's notifications address (the same as in Resend), sender name `Lionel Yu Piano Studio`. Save. This is what sends "reset your password" emails.

**6. Point the apps at it (you).** Vercel, project **piano-studio-portal**, Settings, Environment Variables. Edit these for Production and Preview:
- `NEXT_PUBLIC_SUPABASE_URL` = `https://NEW_REF.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon key
- `SUPABASE_SERVICE_KEY` = the service_role key

Then Deployments, the top one, the `...` menu, **Redeploy**. Do the same in the classroom app's Vercel project (music-lesson-dashboard), where the service key is called `SUPABASE_SERVICE_ROLE_KEY`, and redeploy it.

On the Mac: put the same values in `.env.local` in both folders (the portal's and `music-lesson-dashboard`), change `PROJECT_REF` in `scripts/backup_studio_db.py` to NEW_REF, and run `scripts/install_backup_agent.sh`, so the nightly copy follows the new database. If Elephant stops showing the studio's time zone, it needs the new URL and anon key too.

**7. Check it worked.**
```
python3 scripts/restore_studio_db.py check --to NEW_REF
```
It should say `OK` and `Sign-ins: 30 of 30 identical to the copy` (or however many there are). Then, in a private window, open lessons.musicalbasics.com/login and sign in as the test student "Piano Student" (or use Forgot password, which also tests step 5's email settings): the lessons show and a sheet music link opens. Sign in as yourself: the admin home loads. Nothing to tell families: their passwords work. Everyone is signed out once, so they sign in again.

## How long it takes

| Step | Who | Practice run, Nov 18 2026 | Expect for real |
|---|---|---|---|
| 1. Pick the copy | Terminal | under 1 s | 1 min (5 more from Dropbox) |
| 2. New project | you | 8 s (stand-in) | 5 min |
| 3. Database | Terminal | 5 s (66 requests) | about 1 min (66 requests at 0.2 to 0.5 s, 3.7 MB of rows) |
| 4. Files | Terminal | 4 s (185 MB, no internet) | 2 to 5 min (185 MB upload) |
| 5. Sign-in settings | you | not practised | 5 min |
| 6. Vercel and the Mac | you | not practised | 15 min (two redeploys) |
| 7. Check | Terminal, browser | 1 s | 5 min |
| **Total** | | **under 20 s of commands** | **about 35 min** |

## Appendix

**What the copy holds.** Every table and row, the sign-ins (`auth.users` and `auth.identities`, with password hashes), and the database's rules: keys, indexes, functions, triggers, row security, policies (including Storage's) and grants. The files are kept separately in `~/Backups/piano-studio/storage` and in Dropbox `/Studio Backups/storage`. Copies are kept 7 daily, 4 weekly, 12 monthly, and one a year forever.

**What it does not hold**, so the steps cover it: the Supabase sign-in settings (step 5) and API keys (step 2, new ones anyway); which tables Realtime watches (`classroom_annotations` and `crm_students`, kept in the script and switched back on by step 3). The live project has no scheduled database jobs, Edge Functions or Vault secrets to bring back.

**Safety.** The script never writes to the live project: its ref is refused unless `--same-project` is given, and even then it only loads into a database with no tables left. Nothing is emailed or texted while restoring.

**How it was tested.** On Nov 18, 2026 steps 1 to 4 and 7 were followed word for word (with the practice flags below) into a stand-in for a new project: Supabase's own database image (Postgres 17.6.1.063, the live version), its sign-in server and its Storage server, in Docker on this Mac, data only in memory, removed afterwards. Copy: `piano-studio-2026-11-18-1338` (40 tables, 7,478 rows, 30 sign-ins, 138 files). Results: all 42 counts matched; 30 of 30 sign-ins identical (email and password hash); the test student signed in through the sign-in server with a one-time link and a wrong password was refused; 200 file links moved to the new address, none left at the old one, and a restored sheet music link opened; row security let the test student see 2 of 30 profiles; the Realtime list and the 11 Storage policies were back. Files from a Dropbox-style copy: 138 of 138 back; 3 PDFs that nothing links to come back under `lesson_materials/sheet_music_/` instead of `sheet_music /`, which does not matter. Not practised: the clicks in steps 2, 5 and 6, and loading through the Management API into a real project (the same SQL; that API answered in 0.2 to 0.5 s per request when measured).

**Practise again** (about 20 s, nothing leaves the Mac): `scripts/restore_practice.sh up` starts the stand-in and prints the four commands to run (steps 3, 4 and 7 with `--docker` in place of `--to`); `scripts/restore_practice.sh down` removes it. The monthly restore test (`scripts/restore_test_studio_db.py`, on the 1st) also checks that the newest copy loads.
