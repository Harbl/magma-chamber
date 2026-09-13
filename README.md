# Magma Chamber

A TV scoreboard, round timer and Swiss pairing system for Riftbound 2v2 nights.
Static page, no build step, no dependencies.

Teams are fixed pairs for the night. An odd number of teams means one whole team
takes a bye, and no team gets a second bye until every team has had one.

## Scoring

Both teams' game scores are recorded for every match. **The leaderboard ranks on
cumulative game points scored across all rounds** — so a team can rank highly on
strong scores even in a loss.

Match record (3 points for a win, 1 for a draw) is still tracked and shown, but
only breaks ties between teams level on game points. Opponent match-win % breaks
it after that.

A bye awards the configured bye points, set on the Setup tab and adjustable
mid-event. Defaults to 8.

---

## Testing on Windows

Double-click **`Magma Chamber (Windows).bat`**. It starts a local server and
opens the app. Closing the console window stops it. Node.js is the only
requirement.

To try the TV view on a second monitor, press **Open TV Display** and drag that
window across.

---

## Setting up the shop MacBook

> Handing this to the shop staff? Point them at the **public repo's README**,
> which covers Mac and Windows for someone who has never used a terminal.
> `MAC-SETUP.md` here is the Mac-only original it grew out of.

Copy this folder to the Mac and double-click **`Magma Chamber (macOS).command`**.
It starts a local server and opens the app. Keep the Terminal window open; closing
it stops the app.

Nothing else is required — no Cloudflare account, no hosting, no proxy. Serving
from `localhost` is the whole trick: the locator API allowlists that hostname, so
signup import works directly.

> It must be `http://localhost:8080`, never `http://127.0.0.1:8080`. The API
> allowlists the hostname, and the two are not interchangeable here.

On a stock Mac with nothing installed, this runs on **Perl**, which macOS ships
and which — unlike the others — is a real binary rather than a stub. The server
it uses (`tools/serve.pl`) needs only core Perl modules.

The launcher prefers Node if it happens to be installed, then falls back to Perl,
Ruby, PHP and finally Python, asking you to install Node only if it somehow finds
none of them. Python is deliberately last: `/usr/bin/python3` is a shim that pops
an Xcode install prompt when the command line tools are missing.

If macOS refuses to run it, the file lost its executable bit in transit. In
Terminal: `chmod +x "Magma Chamber (macOS).command"`. On first run, Gatekeeper may
need **right-click → Open** rather than a double-click.

### Giving it a Dock icon

`localhost` counts as a secure origin, so Chrome will install it as a real app:
open `http://localhost:8080`, then **⋮ → Cast, save and share → Install page as
app**. That gives a Dock icon opening fullscreen with no browser chrome.

The launcher still has to be running first, so the simplest habit is to keep the
`.command` on the Desktop and double-click it when opening the shop. Running it
again when it's already up just reopens the window rather than starting a second
server.

---

## Running a night

1. Open the app from the Dock and pick **2v2** on the splash. (Tick *Manual*
   first if it is an unofficial night with no locator event behind it.)
2. **Setup** — type the event name. Paste the event ID from the locator URL
   (`…/events/`**`254672`**) and press *Import signups*.
3. **Teams** — pick two players, optionally type a team name, and *Create team*.
   Leaving the name blank falls back to "Player A & Player B". *Auto-pair
   remaining players* does the rest in one press, and *Rename* fixes any of them.
4. Press **Open TV Display** and drag that window to the TV, then fullscreen it.
5. **Round** — *Generate pairings*, then *Start timer*. Each match is assigned a
   table number, counting down the standings so table 1 is the top match. As each
   match finishes, tap the winning team's name — it turns green, the loser turns
   red, and the score boxes appear. Enter both teams' game points to record it.
6. *Finish round & continue* pairs the next round.
7. At the end of the night, **Setup → Finish & archive event**. That saves the
   results and downloads a backup file automatically.

The control window and the TV window stay in sync. Either can be refreshed
mid-event without losing anything.

### What the TV shows

When a round is paired the TV leads with the **pairings and table numbers**, so
players can find their seat. After the configured number of minutes — or as soon
as every result is in — it switches itself to the leaderboard. Set that to `0` on
the Settings tab to skip the pairings view entirely.

The TV window is exactly one screen tall and never grows a scrollbar. If the list
is longer than the screen it creeps downward, holds at the bottom for a few
seconds, then snaps back to the top and repeats. Lists that already fit stay put.

Players who have a Legend assigned show its **card art** beside their name rather
than the Legend's name — far easier to read across a room. Art is pulled from
Riot's CDN as a 160px crop, so it costs about 6KB per Legend instead of 1.1MB.

### Shop branding

The TV lockup is venue over "x" over app name, and the venue half is set per
install on the **Settings** tab rather than edited into the markup — several shops
run their own copy, so nothing about a specific venue is baked into the build.

Pick **Shop name** for plain text or **Logo image** to upload one. With neither
set, the shop line and the "x" both drop out and the TV just reads *Magma
Chamber*. Picking logo mode and then deleting the logo falls back to the name
rather than leaving a hole.

Uploads are normalised twice over, because a shop will hand you whatever file it
happens to have:

- **On the way in** — anything over 512px on the long edge is redrawn on a canvas
  at that size and re-encoded as PNG, so transparency survives. SVG passes
  through untouched; it has no pixel size to shrink and scales by itself.
- **On the way out** — `.dsp-logo` is a fixed box (`height` in `vh`, capped
  `max-width`) with `object-fit: contain`, so a wide banner and a square badge
  both sit correctly and neither can push the header around.

The data URL is kept in its **own localStorage key** (`magma-chamber-logo`), not
in `state`. `state` is re-serialised and broadcast on every keystroke, and pushing
a few hundred KB through that each time is pointless; the display window reads the
key directly and only needs a `{logo:true}` ping to re-render.

`shopName` and `brandMode` *are* in `state`, so they sync the usual way — but both
`finishEvent()` and *Reset everything* rebuild state from `blank()`, so they get
carried across by `venue()`. Branding belongs to the venue, not the event.

### Sizing the TV text

Layout is in `vw`/`vh` units, so it renders identically at 1080p and 4K — only
the physical screen size and how far away people sit actually matter.

Defaults suit a ~46in 1080p set read from about 10–12 feet: team names and point
totals are comfortable there, and the timer reads from roughly 45 feet.

With the display window focused, **`+`** and **`-`** resize everything except the
timer, and **`0`** resets. The setting is remembered per screen, so the TV keeps
its own size and the control laptop is unaffected. Bigger text means fewer teams
visible at once — about 5 rows at the default, 4 at 125% — but the auto-scroll
cycles the rest through.

### Legends and stats

Each player can be given a Legend on the Setup tab. It shows beside their name on
the TV, colour-coded by domain, and feeds the meta breakdown under **Stats**.

**Stats** leads with **Player records** — a lifetime row per player built from the
archive: matches, W-L-D, win rate, nights played, nights won, and every legend
they have brought, most-played first. `playerHistory()` accumulates it from the
archived standings, giving both team-mates their team's result, the same rule the
Results tab uses. Names are the only key that exists across events, so they are
matched trimmed and case-insensitively; `'?'` placeholders are skipped.

It only counts **archived** nights, so a night that was never finished contributes
nothing, and a mirrored 1v1 night contributes nothing either — UVS owns that
scoring and none of it is kept here. *Export player records (CSV)* writes the
same table.

Below that sit the legend meta breakdown and every saved event. Backups live on
**Settings**: JSON (re-importable) and CSV (opens in Excel). Browser storage can
be wiped by clearing site data, so the exports are the durable copy — the app
downloads one automatically each time an event is archived.

---

## Modes

The app opens on a **splash screen** asking 1v1 or 2v2, and nothing else is shown
until one is picked. That choice is what keeps the rest uncluttered:

| mode | tabs | pairings | scoring | reporting |
|---|---|---|---|---|
| **1v1** | Setup, Round, Stats, Settings | UVS | none — UVS's own | players, on UVS |
| **1v1 manual** | + Results, Standings | this app, Swiss | this app, game points | nowhere — it's unofficial |
| **2v2** | + Teams | this app, Swiss | this app, game points | typed in from the Results tab |

### Manual override

A **Manual** checkbox on the splash — and on Setup, to change your mind later —
says this is an unofficial night: there is no locator event to read from, so the
app runs the whole thing itself. It is what a shop uses for an ad-hoc side event.

For 2v2 it only hides the signup import, since 2v2 already pairs locally. For 1v1
it is the real switch: the mirror goes off and the app pairs, tables and scores
the night.

**Manual 1v1 reuses the team machinery with one player per team.** `syncSoloTeams()`
gives every player a team of one, named after them, just before pairing. That is
the whole implementation — pairings, tables, scoring, standings, the Results list
and archiving all work unchanged, and there is no second scoring path to keep in
step. The Teams tab stays hidden because there is nothing to build.

Flipping it mid-event clears the round, exactly like switching mode, and it asks
first if a round exists.

### How the gating works

`MODE_TABS` lists the tabs per mode (`'1v1'`, `'1v1-manual'`, `'2v2'`). Individual
controls declare their own relevance with **`data-only`** in the markup, so
`applyMode()` never has to know about each one. The value is a list of tokens and
**every one must be active**; `viewTokens()` returns three:

| token | meaning |
|---|---|
| `1v1` / `2v2` | the mode itself |
| `official` / `manual` | whether a real locator event sits behind this night |
| `mirror` / `local` | who owns the pairings |

So bye points are `data-only="local"` (2v2 *and* manual 1v1), *Refresh from UVS*
is `data-only="mirror"`, signup import is `data-only="official"`, and the timer
buttons are deliberately ungated since every kind of night needs a clock.

**The mode sets `uvsMode`** rather than leaving a second switch to keep in
agreement: only an *official* 1v1 is the UVS mirror. The old checkbox is gone.

Switching clears `state.rounds` and any mirrored rows, because a round from one
mode means something different in the other. Re-picking the same mode is not a
switch and leaves the event alone. If the open tab is hidden by the new mode it
falls back to the first tab that mode has, rather than leaving a blank panel.

`state.mode` starts `null`, so **an existing install lands on the splash once**
after updating, then remembers the choice. Archiving an event and *Reset
everything* both keep the mode — otherwise finishing a night would throw you back
to the splash.

### The Settings tab

Everything that belongs to the shop rather than to tonight lives on **Settings**:
branding, table count, how long pairings hold the TV, and the backup
export/import. It is available in every mode, and reachable from the splash
itself via *Shop settings* — that sets a transient `settingsOnly` flag, shows the
Settings tab alone with a *Back* button, and is deliberately **not** saved, since
it is a detour rather than a state to come back up in.

> The test harness registers real nodes for the `querySelectorAll` selectors it
> needs. Without that, every check on tab or setting visibility passes trivially
> against an empty list — the same trap the no-op `classList` stub created.

### Two things the Carde removal took with it

Deleting the Carde block in `35c5dc3` also deleted the handlers that happened to
sit after it — **Finish & archive, Reset everything, all three exports and the
backup import had been dead buttons ever since** — and it emptied the middle of
the team-list template, leaving a stray `</label>` where the team name should be.
Both are restored. Two tests now guard the class of mistake:

- *every button in the markup is wired up* — walks every `<button id>` in
  `index.html` and demands a matching `.onclick`/`.onchange` in `app.js`. A dead
  button looks exactly like a working one, which is why this went unnoticed.
- *the team list still prints the team name* — the template must still contain
  `esc(t.name)`.

Worth remembering when deleting a block: check what followed it, not just what
was in it.

## Carde.io was removed entirely (2026-09-13)

`carde.js`, the tab, the token auth, the reporting client and all their tests are
**deleted**, not hidden. Two things settled it:

1. **There is no publicly reachable Carde.io API for this.** Auth is Auth0 with no
   public login, and reporting requires a pairing that already exists in Carde.
2. **It isn't needed.** The shop can set the Carde event to **multiplayer
   unpaired**, which skips pairings entirely and takes a plain win/loss per
   player. Nobody has to be dropped from the event, every player's match data
   still reaches Riot, and the only cost is manual entry between rounds.

That manual entry is what the **Results tab** exists to make fast. Background on
the Carde/UVS relationship is in the `reference-cardeio-api` memory if it ever
comes back.

## The Results tab

`roundResults(n)` returns every player in a round with their own result,
**sorted alphabetically, case-insensitively** — a multiplayer-unpaired event is
entered player by player, and hunting for names in pairing order is where the
organiser's time goes.

Both team-mates inherit their team's result; a bye is a win for both. An
unreported match yields `null` and renders as *not reported* rather than silently
reading as a loss.

Rows are colour-coded so the eye can run down the list while typing into another
window. **Copy as text** puts one `Name — Result` per line on the clipboard, and
falls back to a `.txt` download when the clipboard is blocked — it needs a secure
context and permission, neither of which is guaranteed.

## UVS 1v1 mirror

For **1v1** nights — Nexus Nights, skirmishes, store events — UVS does the
pairing and the players report their own results. There is nothing for this app
to score or push, so it is purely a display and a clock. Tick **Use the UVS event
page** and leave it on *1v1 — just show it*.

Nothing is ever written back to UVS. Every request is a GET.

The locator has an undocumented but fully public TV feed keyed on the **event id
alone** — no round id, no login, no token:

| endpoint | gives |
|---|---|
| `/api/v2/player/events/{id}/tv/` | event name, lifecycle, round list with per-round status |
| `/api/v2/player/events/{id}/tv/matches/` | current round: tables, byes, players, winners |
| `/api/v2/player/events/{id}/tv/standings/` | rank, record, match points |
| `/api/v2/player/events/{id}/tv/roster/` | check-in list |

The id is whatever was used for *Import signups*, kept in `state.eventId`, so it
is never pasted twice. CORS is the same allowlist as the rest of the API, so this
works from `localhost` with no proxy. Polls every 30s to pick up results as
players report them on their phones.

The bundle ships **Zod schemas** for every response, so field lists were read off
rather than guessed — grep `/_next/static/chunks/` for a field name and read the
surrounding `il.z.object({...})`.

### How it hangs together

The clock lives on a round object, so `applyUvs()` keeps an otherwise empty
`bareRound()` around purely to own the timer, while `state.uvsPairings` and
`state.uvsStandings` hold the mirrored rows. Refreshing the same round number
leaves the clock alone, so a poll cannot reset the TV mid-round; a new round
number starts a fresh one.

`displayMode()` and `allIn()` treat "everyone has reported" as the cue to swap to
standings, whichever source is supplying the rows.

## Overtime clock

`state.overtime` (minutes, 0 = off) on the Setup tab. `clock()` returns
`{ms, phase}` and owns the whole thing:

| phase | when |
|---|---|
| `idle` | no round |
| `paused` | clock stopped |
| `main` | normal time; `warn` under 5 min, `crit` under 1 min |
| `overtime` | past zero, counting `state.overtime` down in hard red |
| `done` | past zero with overtime off or spent |

`remainingMs()` is unchanged — it still clamps at zero and drives the
pairings/standings switch, which should not care about overtime.

## The two repositories

| | branch | contains |
|---|---|---|
| **magma-chamber-private** | `main` | everything — this README, the tests, `worker/` |
| **magma-chamber** (public) | `main` | the app only, with a plain-English README for shop staff |

`main` tracks `private/main`, so a bare `git push` updates the private repo.
The public repo is fed from a local `public` branch that sits one commit ahead of
`main`. That commit swaps in the plain-English README and drops the technical
files: `MAC-SETUP.md`, `worker/`, `tools/logic-test.js` and
`tools/fetch-legends.js`.

**The public README only exists on the `public` branch** — it started as
`MAC-SETUP.md` but has since diverged, covering Windows setup and UVS mode as
well. Edit it there and `commit --amend` onto the strip-down commit; there is no
copy on `main` to keep in sync.

To publish new work to the public repo:

```bash
git checkout public
git rebase main                    # replay the strip-down commit onto the new work
git push -f origin public:main     # force needed: the rebase rewrites that commit
git checkout main
```

The force push only ever rewrites the public mirror, never `main` and never the
private repo. If the rebase conflicts it will be in `README.md` — keep the
`public` branch's version, which is the plain-English one.

## Maintenance

Refresh the Legend list after a new set releases:

```bash
node tools/fetch-legends.js
```

Run the scoring and pairing tests:

```bash
node tools/logic-test.js
```

## Layout

```
index.html      markup for both the control panel and the TV display
app.js          state, scoring, Swiss pairings, timer, import/export
app.css         theming; display view is sized in vw/vh for TV legibility
sw.js           offline cache, so dropped wifi doesn't kill the scoreboard
data/legends.json   49 Legends with domains and card art
tools/serve.js      local static server (Node), used when Node is available
tools/serve.pl      same in core-only Perl, for a stock Mac with nothing installed
tools/          legend fetcher and the logic test suite
worker/         optional CORS proxy, only if you ever host this on the web
```

## If you ever host it instead

Running locally is the recommended setup and needs no proxy. A *hosted* copy is
different: the locator API rejects browser requests from any origin except
`localhost` and its own domain, so signup import would break.

`worker/` covers that case. Deploy it with `npx wrangler deploy`, then set
`PROXY` near the top of `app.js` to the `https://….workers.dev` URL it prints.
Leave `PROXY` empty for local use.

## Notes on the data

Signups, event details and round length come from the Riftbound locator's own
API (`api.cloudflare.riftbound.uvsgames.com/hydraproxy`), which is public and
unauthenticated. Legend data comes from [Riftcodex](https://riftcodex.com).

Scoring is owned entirely by this app. The locator runs 2v2 nights as ordinary
individual events (`is_team_event: false`), so it has no concept of team
standings to read back — which is the reason this exists.
