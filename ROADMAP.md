# Training Camp — roadmap from setup to final squad

## Done ✅
- Separate repo with the full site: Today, Matches, Standings, Training, Selection, Squad, Activity, Settings.
- Database schema with all permission rules. Tested as real players and admins, including
  deliberate break tests and the squad-lock race test (`supabase/tests/`).
- New Supabase project created, schema loaded, site admin bootstrapped.

---

## Phase 1 — Connect and first live test (today, ~1 hour)

| # | Task | Who |
|---|---|---|
| 1.1 | Google sign-in setup (consent screen, OAuth client, Supabase provider, redirect URLs) | Admin |
| 1.2 | **Publish the Google consent screen** (OAuth consent screen → "Publish app"). In "Testing" mode only listed test users can sign in. Email and profile scopes don't need Google review. | Admin |
| 1.3 | `.env` with project URL and anon key | Admin |
| 1.4 | Start the site, sign in, create the camp, set squad size | Claude + admin |
| 1.5 | Add yourself, 1 coach and 3–4 test players (one with no email) | Admin |
| 1.6 | Walk through every screen: scored and winner-only matches, edit, dispute, resolve, void, session with drills and attendance, assessments, select, lock, publish, each privacy toggle | Claude |
| 1.7 | Second-account test: sign in as a player and confirm they see only what they should | Admin |
| 1.8 | Fix anything found and re-run the database tests | Claude |

**Done when:** every flow works on the real database, and a player account cannot see
coach notes, hidden standings or the unpublished squad.

---

## Phase 2 — Ready for real use (before day 1, ~half a day)

| # | Task | Why |
|---|---|---|
| 2.1 | ✅ First commit. Create the **GitHub repo** (public: needed for free Pages) and push | Safety and history |
| 2.2 | **Host on GitHub Pages**: deploy workflow ✅ ready. Set Pages source = GitHub Actions and add the two `VITE_` repo variables | Players need a real link |
| 2.3 | Update Supabase Site URL and redirect URLs plus Google's JavaScript origins with the live address | Otherwise sign-in fails on the live site |
| 2.3b | ✅ `privacy.html` added. In Google Branding, set homepage and privacy policy URLs, add `<owner>.github.io` to authorised domains, then **Publish app** | Google requires both URLs before leaving Testing mode |
| 2.4 | **Phone polish:** phone-width check, easy-to-tap buttons, "Add to Home screen" support | Most use is courtside on phones |
| 2.5 | **CSV export** for the admin (matches, attendance, drills, standings) | The free plan has no downloadable backups |
| 2.6 | Delete Phase 1 test data, or start a fresh camp | Clean start |
| 2.7 | **Quick guide** for players and coaches: recording, disputes, what RPE means | Smooth first day |

**Done when:** a player can open the live link on a phone, sign in, and record a match in under 30 seconds.

---

## Phase 3 — Onboarding (the day before camp)

| # | Task | Who |
|---|---|---|
| 3.1 | Add all 15–17 players and the coaches, with gender (needed for the category rules) and email where they'll sign in | Admin |
| 3.2 | Starting settings: visibility = players and coaches, "players see all results" (choose), publish squad = off | Admin |
| 3.3 | Share the link and the quick guide in the camp group | Admin |
| 3.4 | Check the roster screen: "signed in" shows for everyone expected | Admin |

---

## Phase 4 — Running the camp (weeks 1–4)

**Daily routine**
- **Start of session:** create the session, then add the focus and drills.
- **During:** attendance (Present / Late / Absent). Record each match right after the game.
- **End:** players set their RPE. Coaches settle any disputes.
- **Weekly:** coaches assess each player (technique, fitness, tactics, attitude).

**Improvements to add during the camp** (each small, tested and deployed without disruption)

| Priority | Feature | Value |
|---|---|---|
| P1 | **"Who plays next" pairing helper**: fair suggestions (least-played pairs, similar ratings, right genders) | Varied, fair random matches |
| P1 | **Player detail page**: rating history chart, matches, attendance, drills | Progress visibility |
| P2 | **Drill templates**: save routines and add them in one tap | Faster daily logging |
| P2 | **Camp head-to-head** between any two players | Helps close selection calls |
| P2 | **Weekly summary card**: most improved, attendance leaders, most matches | Motivation |
| P3 | **Offline recording queue** | Only if courtside Wi-Fi is a problem |

---

## Phase 5 — Selection (last 3–4 days)

| # | Task | Who |
|---|---|---|
| 5.1 | Every player has at least 2–3 assessments | Coaches |
| 5.2 | **Close camp** on the final day: stops new matches, so the numbers are frozen | Admin |
| 5.3 | Selection board: Selected / Standby / Not selected with private notes. Watch the M/F split. | Coaches |
| 5.4 | **Lock** the squad (needs exactly the squad size selected) | Admin |
| 5.5 | Turn on **Publish squad**. Players see selected and standby names only. | Admin |
| 5.6 | If something changes, **Unlock** with a reason (kept in the audit log) | Admin |

---

## Phase 6 — Wrap-up (after camp)

- Export everything to CSV and keep it with the team records.
- Optional per-player report: one printable page each with rating trend, record,
  attendance, drill minutes and coach summary.
- Set visibility to Coaches only, or let the free project pause on its own. For the next
  camp, create a new camp in the same site: it already supports several camps.

---

## Risks

| Risk | Mitigation |
|---|---|
| Google consent screen left in "Testing" | Publish it (1.2) |
| Free project pauses after a week idle | Daily use prevents it. If it pauses, restore it from the dashboard. |
| Wrong gender on a profile blocks a match | Edit the profile in Settings |
| Lost phone or wrong login | Change their email in Settings: the old login is unlinked, the new one claims the profile |
| Data loss | Weekly CSV export (2.5) |

## Open decisions
1. Camp start date (times Phases 2–3).
2. Squad of 10: fixed split (e.g. 5 M + 5 F, enforced at lock) or open?
3. ~~Hosting~~: decided, GitHub Pages.
4. Coaches' names and emails.
