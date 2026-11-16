# IISc Training Camp

A private, standalone website for a selection camp: record practice matches as they happen,
log daily training (drills, attendance, effort), track a camp-only rating, and pick the squad.

It is **completely separate** from the IISc Badminton Club app: its own repo, its own Supabase
project, its own logins. Nothing here reads from or writes to the club app, and camp results
never touch club Elo, rankings, profiles or the feed.

## What it does

| Area | Who | What |
|---|---|---|
| Roster | Camp admin | Creates every profile (name, gender, optional Google email) and sets roles: admin, coach or player. Any number of players. |
| Matches | Any signed-in member | Records MS/WS/MD/WD/XD results. Scores are optional; "who won" alone is enough. The recorder can edit for 24 h. A participant can dispute for 24 h. Coaches resolve or void. |
| Standings | Everyone (or own row only) | Camp-only rating: start 1200, K = 32, doubles use the pair average, disputed and void matches excluded. |
| Training | Any signed-in member | Sessions with focus and notes, drills (type, minutes, sets, reps, intensity), attendance and RPE per player. |
| Selection | Coaches and admin | One board per player: rating, win %, attendance, drill minutes, RPE, coach assessments. Decide selected, standby or not selected, then lock. |
| Squad | Players | Read-only list of the squad, shown after the admin locks and publishes it. Coach notes are never shown. |
| Settings | Camp admin | Visibility (players and coaches, or coaches only), "players see all results", "publish squad", camp-wide activity switch, per-person activity switch. |

People without an email are still full roster members: they appear in matches and the
training log, and the admin or a coach records for them. They just can't sign in.

All permissions are enforced in the database (row-level security, RPC-only match writes,
triggers). The UI only mirrors them.

## One-time setup (you)

1. **Create a new Supabase project** at <https://supabase.com/dashboard>. Do not reuse the club
   app's project.
2. **Run the schema**: open SQL Editor and run each file in `supabase/migrations/` in order
   (`0001_camp.sql`, then `0002…`, `0003…`, `0004…`). When a new migration is added later, run just
   that file, before deploying the site version that needs it.
3. **Make yourself site admin**: in SQL Editor run, using the Google email you will sign in with:
   ```sql
   select public.bootstrap_site_admin('you@gmail.com', 'Your Name');
   ```
4. **Turn on Google sign-in**:
   - Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web).
     Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Supabase → Authentication → Sign In / Providers → Google: paste the client ID and secret.
   - Supabase → Authentication → URL Configuration: set Site URL to where the site is hosted, and
     add `http://localhost:5199` to Redirect URLs for local testing.
5. **Connect the site**: copy `.env.example` to `.env` and fill in the project URL and anon key
   (Project Settings → API).
6. Run `npm install`, then `npm run dev`, and open <http://localhost:5199>. Sign in with Google,
   create the camp, then add people under Settings.

### Hosting (GitHub Pages)

The site deploys from `.github/workflows/deploy.yml` on every push to `master`. It runs the
unit tests and builds with `BASE_PATH=/<repo>/`. Deep links work because the build copies
`index.html` to `404.html`.

1. Create the GitHub repo and push. Pages needs a **public** repo on a free plan. That's safe:
   the code holds no secrets, and the database rules protect the data.
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. Repo **Settings → Secrets and variables → Actions → Variables**: add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (the anon key is public by design).
4. Re-run the workflow. The site is at `https://<owner>.github.io/<repo>/`.
5. Supabase → Authentication → URL Configuration: Site URL = the site address; add
   `https://<owner>.github.io/<repo>/**` to Redirect URLs.
6. Google Auth Platform → Clients: add `https://<owner>.github.io` to Authorised JavaScript origins.
   Branding: homepage = site address, privacy policy = site address + `privacy.html`, and add
   `<owner>.github.io` to authorised domains. Then **Audience → Publish app**.

### Phone alerts (optional)

Members can turn on **Me → App → Phone alerts**. Their phone then buzzes, even with the app
closed, when a match they played is recorded, edited, disputed or settled; when a coach posts
an announcement; and when the squad is published. The camp-wide activity switch and each
person's activity mute apply to phone alerts too. On iPhone and iPad the app must be added to
the Home Screen first (Safari → Share → Add to Home Screen), on iOS 16.4 or later.

How it works: database triggers from `0007_push.sql` call the `send-push` Edge Function through
`pg_net` after the write commits. The function sends the alert to each of the person's phones
and deletes phones the push service reports as gone. Nothing is sent until steps 1 to 6 are
done, and the switch stays hidden until step 7.

1. **Run the migration**: SQL Editor → run `supabase/migrations/0007_push.sql`. It turns on the
   `pg_net` and Vault extensions if they aren't on yet.
2. **Generate the keys** (no install needed; prints the values and the commands below, filled in):
   ```bash
   node scripts/generate-vapid-keys.mjs
   ```
   You get `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `PUSH_WEBHOOK_SECRET`. The public key is
   safe to publish. Keep the other two out of git and out of chats.
3. **Link the Supabase CLI** to the project (Project Settings → General → Reference ID):
   ```bash
   npx supabase login
   ```
   ```bash
   npx supabase link --project-ref <project-ref>
   ```
4. **Set the function's secrets**. `VAPID_SUBJECT` must be a `mailto:` address or an `https://`
   URL; Apple rejects anything else. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided
   to the function automatically.
   ```bash
   npx supabase secrets set VAPID_PUBLIC_KEY=<public key> VAPID_PRIVATE_KEY=<private key> PUSH_WEBHOOK_SECRET=<secret> VAPID_SUBJECT=mailto:you@example.com
   ```
5. **Deploy the function**. `--no-verify-jwt` is required: the database proves itself with the
   `x-push-secret` header, not a user login.
   ```bash
   npx supabase functions deploy send-push --no-verify-jwt
   ```
6. **Connect the database to the function** (this is the webhook). In SQL Editor, store the
   function URL and the same secret in Vault, where the triggers read them:
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-push', 'push_function_url');
   select vault.create_secret('<PUSH_WEBHOOK_SECRET>', 'push_webhook_secret');
   ```
   Don't also add Dashboard → Database → Webhooks for these tables: the triggers already make
   the call, and a dashboard webhook would send a different payload. To change a value later:
   `select vault.update_secret(id, '<new value>') from vault.secrets where name = 'push_webhook_secret';`
7. **Turn on the switch in the site**: repo **Settings → Secrets and variables → Actions →
   Variables**, add `VITE_VAPID_PUBLIC_KEY` = the public key (the deploy workflow passes it to
   the build). For local testing, put the same line in `.env`. Re-run the deploy workflow.
8. **Try it**: on a phone, open the site, go to Me and turn on Phone alerts, then allow
   notifications. From another account, record a match that person played. If no alert arrives:
   - SQL Editor: `select status_code, content::text, error_msg, created from net._http_response order by created desc limit 5;`
     A `401` means the Vault secret and `PUSH_WEBHOOK_SECRET` differ. A `500` naming missing
     secrets means step 4 is incomplete. No rows at all means nothing was queued: check that
     the person has Phone alerts on, hasn't muted activity, the camp activity switch is on, and
     both Vault secrets exist with exactly these names.
   - Dashboard → Edge Functions → send-push → Logs shows each push service's reply.

If you ever replace the VAPID keys, update both the function secrets (step 4) and
`VITE_VAPID_PUBLIC_KEY` (step 7). Phones switch to the new key the next time the app opens.
Signing out turns phone alerts off on that phone, so a shared phone doesn't keep getting the
previous person's alerts.

## Development

```bash
npm run dev      # local site
npm run check    # type-check
npm test         # unit tests (score parsing and validation)
npm run build    # type-check + production build
```

### Database tests

The SQL suite runs as the real `anon` and `authenticated` roles against a throwaway Supabase
Postgres container. It covers forged writes, edit and dispute windows, the visibility and
results-privacy toggles, activity mutes, the squad-lock contract, the rating maths, and who
gets phone alerts.

```bash
docker run -d --name camp-test-pg -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.6.1.141
bash supabase/tests/run.sh          # expects: ALL TRAINING CAMP ASSERTIONS PASSED
bash supabase/tests/concurrency.sh  # squad edit racing a lock; both orders must stay valid
```
