# Riftbound 2v2 Scoreboard

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

A bye awards the configured bye points, set on the Setup tab. It defaults to 8;
change it if your shop treats byes differently.

---

## Part 1 — one-time setup (Jake)

### 1. Deploy the signup proxy

The locator API only accepts browser requests from `localhost` and its own domain,
so a hosted page can't call it directly. The Worker in `worker/` makes that request
server-side. It proxies two read-only endpoints and nothing else.

```bash
cd worker
npx wrangler deploy
```

Copy the `https://….workers.dev` URL it prints.

### 2. Point the app at it

In `app.js`, set the constant on line 10:

```js
const PROXY = 'https://riftbound-scoreboard-proxy.you.workers.dev';
```

Leave it as `''` and everything still works — you just add players by hand
instead of importing them.

### 3. Publish

Push to GitHub, then **Settings → Pages → Deploy from branch → main / root**.
Note the published URL.

### 4. Make the shop's icon

On the shop MacBook, open the URL in Chrome, then **⋮ → Cast, save and share →
Install page as app**. That puts a real icon in the Dock which opens fullscreen
with no browser chrome. No Terminal, ever.

---

## Part 2 — running a night (the shop)

1. Open the app from the Dock.
2. **Setup** — type the event name. Paste the event ID from the locator URL
   (`…/events/`**`254672`**) and press *Import signups*.
3. **Teams** — pair players up, or press *Auto-pair remaining players*.
   *Rename* gives a team a custom name.
4. Press **Open TV Display** and drag that window to the TV, then fullscreen it.
5. **Round** — *Generate pairings*, then *Start timer*. As each match finishes,
   type both teams' game scores into the two boxes. The higher score wins, equal
   scores are a draw, and the TV updates itself.
6. *Finish round & continue* pairs the next round.
7. At the end of the night, **Setup → Finish & archive event**. That saves the
   results and downloads a backup file automatically.

The control window and the TV window stay in sync. Either can be refreshed
mid-event without losing anything.

### Legends and stats

Each player can be given a Legend on the Setup tab. It shows beside their name on
the TV, colour-coded by domain, and feeds the meta breakdown under **Stats**.

**Stats** also holds every saved event, with export to JSON (re-importable) and
CSV (opens in Excel). Browser storage can be wiped by clearing site data, so the
exports are the durable copy — the app downloads one automatically each time an
event is archived.

---

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
tools/          legend fetcher and the logic test suite
worker/         Cloudflare Worker CORS proxy for signup import
```

## Notes on the data

Signups, event details and round length come from the Riftbound locator's own
API (`api.cloudflare.riftbound.uvsgames.com/hydraproxy`), which is public and
unauthenticated. Legend data comes from [Riftcodex](https://riftcodex.com).

Scoring is owned entirely by this app. The locator runs 2v2 nights as ordinary
individual events (`is_team_event: false`), so it has no concept of team
standings to read back — which is the reason this exists.
