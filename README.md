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

1. Open the app from the Dock.
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
the Setup tab to skip the pairings view entirely.

The TV window is exactly one screen tall and never grows a scrollbar. If the list
is longer than the screen it creeps downward, holds at the bottom for a few
seconds, then snaps back to the top and repeats. Lists that already fit stay put.

Players who have a Legend assigned show its **card art** beside their name rather
than the Legend's name — far easier to read across a room. Art is pulled from
Riot's CDN as a 160px crop, so it costs about 6KB per Legend instead of 1.1MB.

### Shop branding

The TV lockup is venue over "x" over app name, and the venue half is set per
install on the **Setup** tab rather than edited into the markup — several shops
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

**Stats** also holds every saved event, with export to JSON (re-importable) and
CSV (opens in Excel). Browser storage can be wiped by clearing site data, so the
exports are the durable copy — the app downloads one automatically each time an
event is archived.

---

## The ways a night can run

| mode | pairings | scoring | reporting |
|---|---|---|---|
| **local** (default) | this app, Swiss | this app, game points | nowhere |
| **UVS mirror** | UVS | none — UVS's own | players, on UVS |
| **Carde.io** | Carde.io | this app, game points | pushed to Carde.io |

Only one can own a round, and UVS mode disables *Generate pairings* and
*Finish round & continue* — buttons and handlers both.

`uvsMirroring()` is the predicate separating the two UVS modes. It gates every
display branch, so team mode falls straight through to ordinary local-round
rendering and the TV shows team names rather than captains.

## Carde.io is hidden, not deleted

The tab carries `hidden`, and `carde.js` still ships and still works. Nothing was
removed, because the evidence is strong but not conclusive:

- **Marymoor Games has no Carde.io record at all** — `/api/play/establishments/?name=`
  searches all 1331 stores and returns nothing — yet it runs locator events weekly.
  A shop can therefore run Riftbound OP with zero Carde presence.
- Zulu's has one unverified record, with no events under it.
- Riftbound is absent from the public 97-game `masterData` list.
- The locator calls `api.carde.io` **only** for `/api/core/users/` and
  `/api/core/gameUsers/` — accounts, not events.

So Carde is the shared login and store directory; the locator is the event
pipeline. Jake has corrected a premature "Riftbound isn't on Carde" call twice, so
this stays behind a `hidden` attribute rather than being ripped out, until the
shop confirms where they actually type results. Full trail in the
`reference-cardeio-api` memory.

## UVS 1v1 — mirror

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

## UVS 2v2 — matched by captain

UVS has **no 2v2 support**: 25 sampled events named "2v2" were every one
`is_team_event: false` with `maximum_number_of_players_in_match: 2`, and no match
ever held more than two players.

The shop's workaround is the one the app now builds on. **At check-in, each team
nominates a captain and the team-mate is dropped from the locator event.** UVS
then pairs captains, one per team, and the night still counts as store activity.

Pick *2v2 — match to teams by captain*. Each team gets a **captain** dropdown on
the Teams tab, defaulting to the first player. `teamByCaptain()` resolves a UVS
name against captains **only** — a team-mate's name deliberately does not match,
since they are not the one registered.

`applyUvsTeams()` then turns that into an ordinary scored round between the two
*teams*, which is why the leaderboard, table numbers, winner highlighting and
points entry all work untouched. The captain's win becomes the team's win.

Unmatched captain names are listed back in the message line. A pairing whose two
names resolve to the same team, or to nothing, is dropped rather than guessed.
Refreshing keeps points already typed, since UVS has no idea about them.

Switching between 1v1 and 2v2 clears `state.rounds` — a round pulled in one mode
means something different in the other.

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

## Carde.io reporting

The **Carde.io** tab pulls a round's pairings from the shop's Carde.io event and
reports results back, so Riot sees the store's activity without anyone
double-entering it.

Carde.io has no team concept, so results go in **per player** — which matches how
the shop reports today.

### Getting a token

Carde.io authenticates through Auth0 and has no public login for third-party
tools, so a proper "Log in with Carde.io" button isn't possible unless Carde
registers a callback for us. Until then the organiser pastes their own token:

1. Sign in at **dashboard.carde.io** in Chrome.
2. Open DevTools (**⌥⌘I**) and pick the **Network** tab.
3. Click anything in the dashboard that loads data.
4. Select any request to `api.carde.io`, open **Headers**, and find
   **`authorization: Bearer …`** under Request Headers.
5. Copy everything after `Bearer ` and paste it into the Carde.io tab.

Tokens expire, so expect to repeat this each event night. The app says
*"Token rejected — it has probably expired"* when that happens.

> Worth asking Carde.io support for proper API access. The auth layer is a single
> swappable seam, so an API key or a registered callback drops in without
> reworking anything else.

### Using it

Connect, choose the store, game and event, then **Load rounds** and
**Show pairings**. Each pairing gets buttons to report a winner, a draw, or a
double loss. Reported pairings are marked, and the list refreshes after each push.

Pair the round **in Carde.io first** — reporting needs Carde's own pairing IDs,
which only exist once Carde has paired.

### Carde.io takes over pairing

Once a token is connected **and** a round has been loaded, Carde.io owns the
event. *Generate pairings* and *Finish round & continue* are disabled on the
Round tab and an explanation replaces them, because two sets of pairings would
mean results getting reported against the wrong matches.

The handlers refuse as well, not just the buttons — a disabled button is not the
only way to reach them.

The timer, teams and stats keep working, and the TV falls back to showing
Carde.io's pairings and table numbers. Disconnecting hands pairing straight back
to the local Swiss engine.

## The two repositories

| | branch | contains |
|---|---|---|
| **magma-chamber-private** | `main` | everything — this README, the tests, `worker/`, the Carde.io notes |
| **magma-chamber** (public) | `main` | the app only, with a plain-English README for shop staff |

`main` tracks `private/main`, so a bare `git push` updates the private repo.
The public repo is fed from a local `public` branch that sits one commit ahead of
`main`. That commit swaps in the plain-English README and drops the technical
files: `MAC-SETUP.md`, `worker/`, `tools/logic-test.js` and
`tools/fetch-legends.js`.

**The public README only exists on the `public` branch** — it started as
`MAC-SETUP.md` but has since diverged, covering Windows setup and Carde.io as
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
carde.js        Carde.io API client (pull pairings, report results)
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
