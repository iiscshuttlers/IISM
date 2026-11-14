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
2. **Run the schema**: open SQL Editor, paste all of `supabase/migrations/0001_camp.sql`, then Run.
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
results-privacy toggles, activity mutes, the squad-lock contract and the rating maths.

```bash
docker run -d --name camp-test-pg -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.6.1.141
bash supabase/tests/run.sh          # expects: ALL TRAINING CAMP ASSERTIONS PASSED
bash supabase/tests/concurrency.sh  # squad edit racing a lock; both orders must stay valid
```
